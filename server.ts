import crypto from 'node:crypto';
import http from 'node:http';
import path from 'node:path';
import dotenv from 'dotenv';
import express, { type NextFunction, type Request, type Response } from 'express';
import { createServer as createViteServer } from 'vite';
import * as webpush from 'web-push';
import { analyzeStudentMessage, generateEmpathyDraft } from './server/ai.ts';
import { db } from './server/db.ts';
import {
  applySecurityHeaders,
  createZeroPiiRateLimiter,
  isValidAvailability,
  isValidEmpathyTone,
  isValidInspiraFormat,
  isValidInspiraTopic,
  isValidPaceMode,
  MAX_BREAK_GLASS_LENGTH,
  MAX_MESSAGE_LENGTH,
  MAX_NOTE_LENGTH,
  signWebhookPayload,
  validateWebhookUrlWithDns,
} from './server/security.ts';
import type {
  CounselorAvailability,
  CounselorProfile,
  CounselorRole,
  EmpathyTone,
  InspiraFormat,
  InspiraTopic,
  MoodType,
  PlatformAdminProfile,
  RiskLevel,
  School,
  SpaceTag,
  StaffAlertThreshold,
  StudentPaceMode,
  TicketOutcome,
  TicketStatus,
  TicketSummary,
} from './src/types.ts';

dotenv.config();

const PORT = Number(process.env.PORT) || 3000;
const TOKEN_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');

const DEFAULT_VAPID_SUBJECT = 'mailto:sisplan.ai01@gmail.com';

function resolveVapidSubject(rawSubject?: string): string {
  const candidate = (rawSubject || '').trim();
  if (!candidate) return DEFAULT_VAPID_SUBJECT;
  const normalized = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(candidate)
    ? `mailto:${candidate}`
    : candidate;
  try {
    const parsed = new URL(normalized);
    if (
      parsed.protocol === 'mailto:' ||
      parsed.protocol === 'https:' ||
      parsed.protocol === 'http:'
    ) {
      return parsed.toString();
    }
  } catch {
    // Fall back when VAPID_SUBJECT is not a valid mailto/http(s) URL
  }
  return DEFAULT_VAPID_SUBJECT;
}

const vapidKeys =
  process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY
    ? {
        publicKey: process.env.VAPID_PUBLIC_KEY.trim(),
        privateKey: process.env.VAPID_PRIVATE_KEY.trim(),
      }
    : webpush.generateVAPIDKeys();

try {
  webpush.setVapidDetails(
    resolveVapidSubject(process.env.VAPID_SUBJECT),
    vapidKeys.publicKey,
    vapidKeys.privateKey
  );
} catch {
  const fallbackKeys = webpush.generateVAPIDKeys();
  vapidKeys.publicKey = fallbackKeys.publicKey;
  vapidKeys.privateKey = fallbackKeys.privateKey;
  webpush.setVapidDetails(DEFAULT_VAPID_SUBJECT, vapidKeys.publicKey, vapidKeys.privateKey);
}

function getEffectiveDemoConfig() {
  const settings = db.getDemoSettings();
  if (process.env.ENABLE_DEMO_ACCESS === 'false') {
    return {
      demoPolicy: 'off' as const,
      demoDurationMinutes: settings.demoDurationMinutes,
      demoMaxUses: settings.demoMaxUses,
    };
  }
  return settings;
}

interface TokenPayload {
  sub: string;
  role: 'student' | 'counselor' | 'platform_admin' | 'demo_pass';
  schoolId?: string;
  isDemo?: boolean;
  exp: number;
}

function signToken(
  payload: Omit<TokenPayload, 'exp'>,
  ttlMs = 1000 * 60 * 60 * 24 * 7
): string {
  const full: TokenPayload = {
    ...payload,
    exp: Date.now() + ttlMs,
  };
  const encoded = Buffer.from(JSON.stringify(full)).toString('base64url');
  const sig = crypto.createHmac('sha256', TOKEN_SECRET).update(encoded).digest('base64url');
  return `${encoded}.${sig}`;
}

function verifyToken(token: string | undefined): TokenPayload | null {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [encoded, sig] = parts;
  const expectedSig = crypto
    .createHmac('sha256', TOKEN_SECRET)
    .update(encoded)
    .digest('base64url');
  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return null;
  }
  try {
    const parsed = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as TokenPayload;
    if (parsed.exp < Date.now()) return null;
    return parsed;
  } catch {
    return null;
  }
}

const asyncHandler =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<void> | void) =>
  (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };

// SSE Client Registries
interface SchoolStreamClient {
  res: Response;
  role: CounselorRole;
  counselorId: string;
  isDemo?: boolean;
}

const ticketStreams = new Map<string, Set<Response>>();
const schoolStreams = new Map<string, Set<SchoolStreamClient>>();

function broadcastTicketEvent(ticketId: string, event: string, data: unknown) {
  const clients = ticketStreams.get(ticketId);
  if (!clients) return;
  // Asegurar que si se envía un ticket al estudiante, se proyecte sin campos clínicos internos (Fix A04)
  const safeData =
    event === 'ticket_updated' && data && typeof data === 'object' && 'ticket_code' in data
      ? db.toStudentTicket(data as any)
      : data;
  const payload = `event: ${event}\ndata: ${JSON.stringify(safeData)}\n\n`;
  for (const res of Array.from(clients)) {
    try {
      res.write(payload);
    } catch {
      clients.delete(res);
    }
  }
  if (clients.size === 0) {
    ticketStreams.delete(ticketId);
  }
}

function broadcastSchoolEvent(
  schoolId: string,
  event: string,
  data: unknown,
  options?: {
    category?: string;
    categoryId?: string | null;
    escalated?: boolean;
    assignedCounselorId?: string | null;
    isSandbox?: boolean;
  }
) {
  const clients = schoolStreams.get(schoolId);
  if (!clients) return;
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const client of Array.from(clients)) {
    // Aislamiento Demo (Fix C02): clientes demo NUNCA reciben eventos de casos reales
    if (client.isDemo && !options?.isSandbox) {
      continue;
    }
    if (options?.category) {
      const isAssigned =
        Boolean(options.assignedCounselorId) && options.assignedCounselorId === client.counselorId;
      const isEscalatedAdmin = Boolean(options.escalated) && client.role === 'admin';
      if (
        !isAssigned &&
        !isEscalatedAdmin &&
        !db.canRoleAccessCategory(schoolId, client.role, options.category, options.categoryId)
      ) {
        continue;
      }
    }
    try {
      client.res.write(payload);
    } catch {
      clients.delete(client);
    }
  }
  if (clients.size === 0) {
    schoolStreams.delete(schoolId);
  }
}

function disconnectCounselorStreams(counselorId: string) {
  for (const [schoolId, clients] of schoolStreams.entries()) {
    for (const client of Array.from(clients)) {
      if (client.counselorId === counselorId) {
        try {
          client.res.end();
        } catch {
          // Ignore closed socket
        }
        clients.delete(client);
      }
    }
    if (clients.size === 0) schoolStreams.delete(schoolId);
  }
}

function disconnectSchoolStreams(schoolId: string) {
  const clients = schoolStreams.get(schoolId);
  if (!clients) return;
  for (const client of Array.from(clients)) {
    try {
      client.res.end();
    } catch {
      // Ignore closed socket
    }
  }
  schoolStreams.delete(schoolId);
}

async function sendCamouflagedPush(ticketId: string) {
  const sub = db.getPushSubscription(ticketId);
  if (!sub) return;
  try {
    await webpush.sendNotification(
      {
        endpoint: sub.endpoint,
        keys: { p256dh: sub.p256dh, auth: sub.auth },
      },
      JSON.stringify({
        title: 'Espacio Inspira',
        body: 'Tienes una nueva lectura de bienestar disponible.',
        tag: 'inspira-wellness',
        url: '/?inspira=1',
      }),
      { TTL: 86400 }
    );
  } catch (err: unknown) {
    const statusCode = (err as { statusCode?: number })?.statusCode;
    if (statusCode === 404 || statusCode === 410) {
      db.removePushSubscription(ticketId);
    }
  }
}

type StaffPushTrigger =
  | 'new_ticket'
  | 'student_message'
  | 'cascade_backup'
  | 'sla_escalation'
  | 'manual_escalation';

async function sendStaffWebPush(
  endpoint: string,
  keys: { p256dh: string; auth: string },
  payload: {
    title: string;
    body: string;
    url: string;
    tag: string;
    requireInteraction?: boolean;
    renotify?: boolean;
    urgent?: boolean;
  }
): Promise<'sent' | 'expired' | 'failed'> {
  try {
    await webpush.sendNotification(
      { endpoint, keys },
      JSON.stringify(payload),
      {
        TTL: 86400,
        urgency: payload.urgent ? 'high' : 'normal',
      }
    );
    db.markStaffPushNotified(endpoint);
    return 'sent';
  } catch (err: unknown) {
    const statusCode = (err as { statusCode?: number })?.statusCode;
    if (statusCode === 404 || statusCode === 410) {
      db.removeStaffPushByEndpoint(endpoint);
      return 'expired';
    }
    return 'failed';
  }
}

async function notifyStaffForTicket(
  school: School,
  ticket: TicketSummary,
  trigger: StaffPushTrigger
) {
  if (ticket.is_sandbox) return;
  const subs = db.listStaffPushTargetsForSchool(school.id);
  if (subs.length === 0) return;

  const counselors = db.listSchoolCounselors(school.id);
  const counselorMap = new Map(counselors.map((c) => [c.id, c]));
  const onCallId = school.sla_config?.on_call_counselor_id || '';

  const eligibleSubs = subs.filter((sub) => {
    const c = counselorMap.get(sub.counselor_id);
    if (!c || !c.active) return false;
    const isAdminEscalated =
      (trigger === 'sla_escalation' || trigger === 'manual_escalation') &&
      sub.role === 'admin';
    if (!isAdminEscalated && !db.canRoleAccessCategory(school.id, sub.role, ticket.category, ticket.category_id)) {
      return false;
    }

    if (trigger === 'sla_escalation' || trigger === 'manual_escalation') {
      // Tier 3: Director/Admin + Guardia + Asignado siempre reciben escalamiento
      return sub.role === 'admin' || sub.counselor_id === onCallId || sub.counselor_id === ticket.assigned_counselor_id;
    }

    if (trigger === 'cascade_backup') {
      // Tier 2 (T+5m sin respuesta en caso crítico): todo el equipo elegible autorizado
      return true;
    }

    // Tier 1 (T+0) y mensajes nuevos del estudiante
    if (ticket.risk_level === 'critico') {
      const hasOnlineStaff = subs.some((other) => {
        const oc = counselorMap.get(other.counselor_id);
        return oc && oc.active && oc.availability !== 'off_duty';
      });
      if (hasOnlineStaff && c.availability === 'off_duty' && sub.counselor_id !== onCallId) {
        return false;
      }
      return true;
    }

    if (c.availability === 'off_duty') return false;
    if (ticket.risk_level === 'medio') {
      return sub.threshold === 'criticos_y_medios' || sub.threshold === 'todos';
    }
    return sub.threshold === 'todos';
  });

  if (eligibleSubs.length === 0) return;

  const urgent =
    ticket.risk_level === 'critico' ||
    trigger === 'sla_escalation' ||
    trigger === 'manual_escalation' ||
    trigger === 'cascade_backup';

  const titlePrefix =
    trigger === 'sla_escalation'
      ? 'URGENTE · SLA Vencido'
      : trigger === 'manual_escalation'
        ? 'Escalamiento a Dirección'
        : trigger === 'cascade_backup'
          ? 'Respaldo 5m · Caso Crítico sin respuesta'
          : ticket.risk_level === 'critico'
            ? 'Alerta Crítica'
            : ticket.risk_level === 'medio'
              ? 'Nuevo reporte prioritario'
              : 'Nuevo ingreso en buzón';

  const contextTag = [ticket.category, ticket.space_tag, ticket.time_slot]
    .filter(Boolean)
    .join(' · ');

  // Strict Zero-PII lock-screen payload: never includes student chat text
  const payload = {
    title: `${titlePrefix} · ${school.short_name}`,
    body: `${ticket.ticket_code} — ${contextTag}. Toca para atender de forma confidencial.`,
    url: `/?staffCase=${encodeURIComponent(ticket.id)}&openStaff=1&skipSplash=1`,
    tag: `te-escucho-staff-${ticket.id}`,
    requireInteraction: urgent,
    renotify: urgent,
    urgent,
  };

  await Promise.allSettled(
    eligibleSubs.map((sub) =>
      sendStaffWebPush(sub.endpoint, { p256dh: sub.p256dh, auth: sub.auth }, payload)
    )
  );
}

async function fireEscalationWebhook(school: School, ticket: TicketSummary) {
  const url = school.sla_config?.escalation_webhook_url?.trim();
  if (!url) return;
  const check = await validateWebhookUrlWithDns(url);
  if (!check.valid) {
    console.warn('Blocked unsafe escalation webhook URL for school:', school.id, check.reason);
    return;
  }
  const bodyString = JSON.stringify({
    event: 'sla_escalation',
    school_id: school.id,
    school_name: school.name,
    ticket_code: ticket.ticket_code,
    category: ticket.category,
    risk_level: ticket.risk_level,
    sla_status: ticket.sla_status,
    sla_elapsed_minutes: ticket.sla_elapsed_minutes,
    escalation_reason: ticket.escalation_reason,
    escalation_contact_name: school.sla_config.escalation_contact_name,
    escalation_contact_email: school.sla_config.escalation_contact_email,
    timestamp: new Date().toISOString(),
  });
  const signature = signWebhookPayload(bodyString, school.id);
  try {
    await fetch(url, {
      method: 'POST',
      redirect: 'manual',
      headers: {
        'Content-Type': 'application/json',
        'X-TeEscucho-Signature': signature,
      },
      signal: AbortSignal.timeout(5000),
      body: bodyString,
    });
  } catch (err) {
    console.error('Escalation webhook error:', err);
  }
}

async function startServer() {
  const app = express();
  app.set('trust proxy', 1);
  app.disable('x-powered-by');
  app.use(applySecurityHeaders);
  app.use(express.json({ limit: '256kb' }));

  const verifyLimiter = createZeroPiiRateLimiter({
    windowMs: 60_000,
    maxAttempts: 30,
    scope: 'school_verify',
  });
  const ticketCreateLimiter = createZeroPiiRateLimiter({
    windowMs: 5 * 60_000,
    maxAttempts: 12,
    scope: 'ticket_create',
  });
  const pinAccessLimiter = createZeroPiiRateLimiter({
    windowMs: 60_000,
    maxAttempts: 6,
    scope: 'pin_access',
    extraKey: (req) =>
      typeof req.body?.ticketCode === 'string' ? req.body.ticketCode.trim().toUpperCase() : '',
    message: 'Demasiados intentos con el PIN. Espera un minuto antes de volver a intentar.',
  });
  const staffLoginLimiter = createZeroPiiRateLimiter({
    windowMs: 60_000,
    maxAttempts: 8,
    scope: 'staff_login',
    extraKey: (req) =>
      typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '',
    message: 'Demasiados intentos de acceso. Espera un minuto para continuar.',
  });

  const inspiraViewLimiter = createZeroPiiRateLimiter({
    windowMs: 60_000,
    maxAttempts: 60,
    scope: 'inspira_view',
  });

  const demoStartLimiter = createZeroPiiRateLimiter({
    windowMs: 60_000,
    maxAttempts: 20,
    scope: 'demo_start',
  });

  const moodLimiter = createZeroPiiRateLimiter({
    windowMs: 60_000,
    maxAttempts: 20,
    scope: 'mood_checkin',
  });

  const messageLimiter = createZeroPiiRateLimiter({
    windowMs: 60_000,
    maxAttempts: 30,
    scope: 'chat_messages',
  });

  const aiDraftLimiter = createZeroPiiRateLimiter({
    windowMs: 60_000,
    maxAttempts: 20,
    scope: 'empathy_draft',
  });

  function verifyDemoPassFromRequest(req: Request): TokenPayload | null {
    const bodyToken = typeof req.body?.demoToken === 'string' ? req.body.demoToken.trim() : undefined;
    const headerToken = req.header('x-demo-pass')?.trim();
    const auth = verifyToken(bodyToken || headerToken);
    if (!auth || auth.role !== 'demo_pass') return null;
    return auth;
  }

  function rejectIfDemo(actor: { isDemo?: boolean }, res: Response, customMsg?: string): boolean {
    if (!actor.isDemo) return false;
    res.status(403).json({
      error:
        customMsg ||
        'Modo Demo de evaluación (solo lectura): los cambios administrativos permanentes están deshabilitados.',
    });
    return true;
  }

  // 0. Public Platform Capabilities & Web Push VAPID Key
  app.get('/api/platform/capabilities', (_req: Request, res: Response) => {
    res.json(getEffectiveDemoConfig());
  });

  app.get('/api/push/vapid-public-key', (_req: Request, res: Response) => {
    res.json({ publicKey: vapidKeys.publicKey });
  });

  // 0a. Start Timed Guided Demo Pass (server-enforced expiration)
  app.post('/api/demo/start', demoStartLimiter, (_req: Request, res: Response) => {
    const config = getEffectiveDemoConfig();
    if (config.demoPolicy !== 'timed') {
      res.status(403).json({
        error: 'El acceso de demostración pública está desactivado en este entorno.',
      });
      return;
    }
    const ttlMs = config.demoDurationMinutes * 60_000;
    const expiresAt = Date.now() + ttlMs;
    const demoToken = signToken(
      {
        sub: 'demo-evaluator',
        role: 'demo_pass',
        isDemo: true,
      },
      ttlMs
    );
    res.status(201).json({
      demoToken,
      expiresAt,
      durationMinutes: config.demoDurationMinutes,
      maxUses: config.demoMaxUses,
    });
  });

  // 0b. Public Curated Espacio Inspira Resources (before school verification)
  app.get('/api/platform/inspira', (_req: Request, res: Response) => {
    res.json({ resources: db.getPublicInspiraResources() });
  });

  // 0c. Zero-PII Aggregated Topic Analytics for Espacio Inspira (never stores individual IDs/cookies)
  app.post('/api/inspira/view', inspiraViewLimiter, (req: Request, res: Response) => {
    const schoolId = typeof req.body?.schoolId === 'string' && req.body.schoolId.trim()
      ? req.body.schoolId.trim()
      : null;
    const topic = req.body?.topic;
    const format = req.body?.format || 'capsula';

    if (!isValidInspiraTopic(topic) || !isValidInspiraFormat(format)) {
      res.status(400).json({ error: 'Tema o formato de recurso inválido.' });
      return;
    }

    if (verifyDemoPassFromRequest(req)) {
      res.json({ ok: true, demoSkipped: true });
      return;
    }

    const ok = db.recordInspiraView(schoolId, topic as InspiraTopic, format as InspiraFormat);
    if (!ok) {
      res.status(404).json({ error: 'Colegio no encontrado.' });
      return;
    }

    if (schoolId) {
      broadcastSchoolEvent(schoolId, 'analytics_updated', { inspiraTopic: topic });
    }
    res.json({ ok: true });
  });

  // 1. Validate School Access Code (Student Entry)
  app.post('/api/schools/verify', verifyLimiter, (req: Request, res: Response) => {
    const code = typeof req.body?.code === 'string' ? req.body.code : '';
    const school = db.verifySchoolCode(code);
    if (!school) {
      res.status(404).json({ error: 'Código de colegio no válido o inactivo.' });
      return;
    }
    res.json(db.toPublicSchoolConfig(school));
  });

  // 1b. Public Fallback Emergency Lines (before school verification)
  app.get('/api/platform/emergency-defaults', (_req: Request, res: Response) => {
    res.json({ lines: db.getDefaultEmergencyLines('Perú') });
  });

  // 2. Daily Emotional Thermometer Check-in (100% Anonymous)
  app.post('/api/mood', moodLimiter, (req: Request, res: Response) => {
    const schoolId = typeof req.body?.schoolId === 'string' ? req.body.schoolId : '';
    const mood = req.body?.mood as MoodType;
    const allowed: MoodType[] = ['tranquilo', 'preocupado', 'triste', 'excluido', 'en_alerta'];
    if (!schoolId || !allowed.includes(mood)) {
      res.status(400).json({ error: 'Datos de estado emocional inválidos.' });
      return;
    }
    if (verifyDemoPassFromRequest(req)) {
      res.json({ ok: true, demoSkipped: true });
      return;
    }
    const ok = db.recordMood(schoolId, mood);
    if (!ok) {
      res.status(404).json({ error: 'Colegio no encontrado.' });
      return;
    }
    broadcastSchoolEvent(schoolId, 'analytics_updated', { mood });
    res.json({ ok: true });
  });

  // 3. Create Anonymous Ticket + 4-Digit PIN
  app.post(
    '/api/tickets',
    ticketCreateLimiter,
    asyncHandler(async (req: Request, res: Response) => {
      const schoolId = typeof req.body?.schoolId === 'string' ? req.body.schoolId : '';
      const category = typeof req.body?.category === 'string' ? req.body.category.trim().slice(0, 120) : '';
      const pin = typeof req.body?.pin === 'string' ? req.body.pin.trim() : '';
      const spaceTag = (
        typeof req.body?.spaceTag === 'string' ? req.body.spaceTag.trim().slice(0, 80) : 'Otro espacio'
      ) as SpaceTag;
      const gradeBand =
        typeof req.body?.gradeBand === 'string' ? req.body.gradeBand.trim().slice(0, 40) : null;
      const timeSlot =
        typeof req.body?.timeSlot === 'string' ? req.body.timeSlot.trim().slice(0, 40) : null;
      const paceMode: StudentPaceMode = isValidPaceMode(req.body?.paceMode)
        ? req.body.paceMode
        : 'discreet_help';
      const emergencyContact =
        typeof req.body?.emergencyContact === 'string'
          ? req.body.emergencyContact.trim().slice(0, MAX_BREAK_GLASS_LENGTH)
          : null;

      const userIntent =
        typeof req.body?.userIntent === 'string' ? req.body.userIntent.trim().slice(0, 30) : null;
      const isSharedDevice = Boolean(req.body?.isSharedDevice);

      if (!schoolId || !category || !/^\d{4}$/.test(pin)) {
        res.status(400).json({ error: 'Ingresa una categoría válida y un PIN de 4 números.' });
        return;
      }

      const demoAuth = verifyDemoPassFromRequest(req);
      const created = await db.createAnonymousTicketAsync({
        schoolId,
        category,
        pin,
        spaceTag,
        gradeBand,
        timeSlot,
        paceMode,
        emergencyContact,
        isSandbox: Boolean(demoAuth),
        userIntent,
        isSharedDevice,
      });
      if (!created) {
        res.status(404).json({ error: 'Colegio no válido o inactivo.' });
        return;
      }
      if ('error' in created) {
        res.status(400).json({ error: created.error });
        return;
      }

      const token = signToken({
        sub: created.ticket.id,
        role: 'student',
        schoolId: created.ticket.school_id,
      });

      broadcastSchoolEvent(created.ticket.school_id, 'ticket_created', created.ticket, {
        category: created.ticket.category,
        categoryId: created.ticket.category_id,
        escalated: Boolean(created.ticket.escalated_at),
        assignedCounselorId: created.ticket.assigned_counselor_id,
      });

      const schoolForPush = db.getSchoolById(created.ticket.school_id);
      if (schoolForPush) {
        void notifyStaffForTicket(schoolForPush, created.ticket, 'new_ticket');
      }

      res.status(201).json({
        ticket: created.ticket,
        messages: created.messages,
        token,
      });
    })
  );

  // 4. Recover Existing Anonymous Ticket with Ticket Code + PIN
  app.post(
    '/api/tickets/access',
    pinAccessLimiter,
    asyncHandler(async (req: Request, res: Response) => {
      const ticketCode = typeof req.body?.ticketCode === 'string' ? req.body.ticketCode : '';
      const pin = typeof req.body?.pin === 'string' ? req.body.pin : '';

      if (!ticketCode.trim() || !/^\d{4}$/.test(pin.trim())) {
        res.status(400).json({ error: 'Ingresa tu código de caso y tu PIN de 4 números.' });
        return;
      }

      const accessed = await db.accessTicketWithPinAsync(ticketCode, pin.trim());
      if (!accessed) {
        res.status(401).json({ error: 'Código de caso o PIN incorrecto.' });
        return;
      }
      if ('paused' in accessed) {
        res.status(403).json({
          error: 'El acceso de este colegio se encuentra pausado temporalmente.',
        });
        return;
      }

      const token = signToken({
        sub: accessed.ticket.id,
        role: 'student',
        schoolId: accessed.ticket.school_id,
      });

      res.json({
        ticket: accessed.ticket,
        messages: accessed.messages,
        school: accessed.school,
        token,
      });
    })
  );

  // 5. Get Messages for Active Student Ticket
  app.get('/api/tickets/:id/messages', (req: Request, res: Response) => {
    const ticketId = req.params.id;
    const token = req.header('x-ticket-token');
    const auth = verifyToken(token);
    if (!auth || auth.role !== 'student' || auth.sub !== ticketId) {
      res.status(401).json({ error: 'Sesión anónima no autorizada.' });
      return;
    }
    const ticket = db.getStudentTicketById(ticketId);
    if (!ticket) {
      res.status(404).json({ error: 'Caso no encontrado.' });
      return;
    }
    res.json({
      ticket,
      messages: db.getMessagesForTicket(ticketId),
    });
  });

  // 5a. Student Silent Session Vault Status Check (passive unread reply alert)
  app.get('/api/tickets/:id/status-check', (req: Request, res: Response) => {
    const ticketId = req.params.id;
    const token = req.header('x-ticket-token');
    const auth = verifyToken(token);
    if (!auth || auth.role !== 'student' || auth.sub !== ticketId) {
      res.status(401).json({ error: 'Sesión anónima no autorizada.' });
      return;
    }
    const ticket = db.getStudentTicketById(ticketId);
    if (!ticket) {
      res.status(404).json({ error: 'Caso no encontrado.' });
      return;
    }
    const msgs = db.getMessagesForTicket(ticketId);
    const counselorMessagesCount = msgs.filter((m) => m.sender_role === 'counselor').length;
    res.json({
      ticket,
      counselorMessagesCount,
      lastCounselorReplyAt: ticket.last_counselor_reply_at ?? null,
      hasNewCounselorReply: counselorMessagesCount > 1,
    });
  });

  // 5b. Student Updates Emotional Pace Preference (Solo desahogo vs Apoyo discreto)
  app.patch('/api/tickets/:id/pace', messageLimiter, (req: Request, res: Response) => {
    const ticketId = req.params.id;
    const token = req.header('x-ticket-token');
    const auth = verifyToken(token);
    if (!auth || auth.role !== 'student' || auth.sub !== ticketId) {
      res.status(401).json({ error: 'Sesión anónima no autorizada.' });
      return;
    }
    const paceMode = req.body?.paceMode;
    if (!isValidPaceMode(paceMode)) {
      res.status(400).json({ error: 'Preferencia de acompañamiento inválida.' });
      return;
    }
    const updated = db.updateTicketPace(ticketId, paceMode);
    if (!updated) {
      res.status(404).json({ error: 'Caso no encontrado.' });
      return;
    }
    broadcastTicketEvent(ticketId, 'ticket_updated', updated);
    broadcastSchoolEvent(updated.school_id, 'ticket_updated', updated, {
      category: updated.category,
      categoryId: updated.category_id,
      escalated: Boolean(updated.escalated_at),
      assignedCounselorId: updated.assigned_counselor_id,
    });
    res.json({ ticket: updated });
  });

  // 5b2. Student Requests Further Help on Resolved Case («Alguien se hace cargo»)
  app.post('/api/tickets/:id/request-further-help', messageLimiter, (req: Request, res: Response) => {
    const ticketId = req.params.id;
    const token = req.header('x-ticket-token');
    const auth = verifyToken(token);
    if (!auth || auth.role !== 'student' || auth.sub !== ticketId) {
      res.status(401).json({ error: 'Sesión anónima no autorizada.' });
      return;
    }
    const result = db.requestFurtherHelpByStudent(ticketId);
    if (!result) {
      res.status(404).json({ error: 'Caso no encontrado.' });
      return;
    }

    const studentTicket = db.toStudentTicket(result.ticket);
    broadcastTicketEvent(ticketId, 'message_created', result.message);
    broadcastTicketEvent(ticketId, 'ticket_updated', studentTicket);
    broadcastSchoolEvent(result.ticket.school_id, 'ticket_reopened', result.ticket, {
      category: result.ticket.category,
      categoryId: result.ticket.category_id,
      escalated: Boolean(result.ticket.escalated_at),
      assignedCounselorId: result.ticket.assigned_counselor_id,
      isSandbox: result.ticket.is_sandbox,
    });
    broadcastSchoolEvent(
      result.ticket.school_id,
      'message_created',
      {
        ticketId,
        message: result.message,
        ticket: result.ticket,
        wasReopened: true,
      },
      {
        category: result.ticket.category,
        categoryId: result.ticket.category_id,
        escalated: Boolean(result.ticket.escalated_at),
        assignedCounselorId: result.ticket.assigned_counselor_id,
        isSandbox: result.ticket.is_sandbox,
      }
    );

    const schoolForPush = db.getSchoolById(result.ticket.school_id);
    if (schoolForPush) {
      void notifyStaffForTicket(schoolForPush, result.ticket, 'student_message');
    }

    res.json({ ticket: studentTicket, message: result.message });
  });

  // 5c. Student Optional Camouflaged Web Push Subscription
  app.post('/api/tickets/:id/push-subscribe', messageLimiter, (req: Request, res: Response) => {
    const ticketId = req.params.id;
    const token = req.header('x-ticket-token');
    const auth = verifyToken(token);
    if (!auth || auth.role !== 'student' || auth.sub !== ticketId) {
      res.status(401).json({ error: 'Sesión anónima no autorizada.' });
      return;
    }
    const sub = req.body?.subscription;
    if (
      !sub ||
      typeof sub.endpoint !== 'string' ||
      !sub.endpoint.startsWith('https://') ||
      typeof sub.keys?.p256dh !== 'string' ||
      typeof sub.keys?.auth !== 'string'
    ) {
      res.status(400).json({ error: 'Suscripción de notificación inválida.' });
      return;
    }
    const ok = db.savePushSubscription(ticketId, sub);
    if (!ok) {
      res.status(404).json({ error: 'Caso no encontrado.' });
      return;
    }
    const updated = db.getTicketById(ticketId);
    if (updated) {
      broadcastSchoolEvent(updated.school_id, 'ticket_updated', updated, {
        category: updated.category,
        categoryId: updated.category_id,
        escalated: Boolean(updated.escalated_at),
        assignedCounselorId: updated.assigned_counselor_id,
      });
    }
    res.status(201).json({ ok: true });
  });

  // 6. Send Student Message + Real-Time Gemini Risk Triage
  app.post(
    '/api/tickets/:id/messages',
    messageLimiter,
    asyncHandler(async (req: Request, res: Response) => {
      const ticketId = req.params.id;
      const token = req.header('x-ticket-token');
      const auth = verifyToken(token);
      if (!auth || auth.role !== 'student' || auth.sub !== ticketId) {
        res.status(401).json({ error: 'Sesión anónima no autorizada.' });
        return;
      }

      const content = typeof req.body?.content === 'string' ? req.body.content.trim() : '';
      if (!content) {
        res.status(400).json({ error: 'El mensaje no puede estar vacío.' });
        return;
      }
      if (content.length > MAX_MESSAGE_LENGTH) {
        res.status(400).json({
          error: `El mensaje supera el máximo de ${MAX_MESSAGE_LENGTH} caracteres.`,
        });
        return;
      }

      const existingMessages = db.getMessagesForTicket(ticketId);
      const added = db.addMessage(ticketId, 'student', content);
      if (!added) {
        res.status(404).json({ error: 'Caso no encontrado.' });
        return;
      }

      broadcastTicketEvent(ticketId, 'message_created', added.message);
      if (added.wasReopened) {
        broadcastTicketEvent(ticketId, 'ticket_updated', db.toStudentTicket(added.ticket));
        broadcastSchoolEvent(added.ticket.school_id, 'ticket_reopened', added.ticket, {
          category: added.ticket.category,
          categoryId: added.ticket.category_id,
          escalated: Boolean(added.ticket.escalated_at),
          assignedCounselorId: added.ticket.assigned_counselor_id,
          isSandbox: added.ticket.is_sandbox,
        });
      }
      broadcastSchoolEvent(
        added.ticket.school_id,
        'message_created',
        {
          ticketId,
          message: added.message,
          ticket: added.ticket,
          wasReopened: added.wasReopened,
        },
        {
          category: added.ticket.category,
          categoryId: added.ticket.category_id,
          escalated: Boolean(added.ticket.escalated_at),
          assignedCounselorId: added.ticket.assigned_counselor_id,
          isSandbox: added.ticket.is_sandbox,
        }
      );

      // Run Gemini AI risk triage in background without blocking the student's chat send
      void (async () => {
        try {
          const school = db.getSchoolById(added.ticket.school_id);
          const triage = await analyzeStudentMessage(
            content,
            added.ticket.category,
            existingMessages,
            school?.ai_config
          );
          const updatedTicket = db.updateTicketTriage(
            ticketId,
            triage.risk_level,
            triage.ai_suggestion,
            triage.ai_rationale
          );
          if (updatedTicket) {
            broadcastSchoolEvent(updatedTicket.school_id, 'ticket_updated', updatedTicket, {
              category: updatedTicket.category,
              categoryId: updatedTicket.category_id,
              escalated: Boolean(updatedTicket.escalated_at),
              assignedCounselorId: updatedTicket.assigned_counselor_id,
            });
            broadcastTicketEvent(ticketId, 'ticket_updated', updatedTicket);
            if (school && updatedTicket.risk_level === 'critico') {
              void notifyStaffForTicket(school, updatedTicket, 'student_message');
            }
          }
        } catch (err) {
          console.error('Background triage error:', err);
        }
      })();

      res.status(201).json({ message: added.message });
    })
  );

  // 7. Student SSE Stream
  app.get('/api/stream/ticket/:id', (req: Request, res: Response) => {
    const ticketId = req.params.id;
    const token = typeof req.query.token === 'string' ? req.query.token : undefined;
    const auth = verifyToken(token);
    if (!auth || auth.role !== 'student' || auth.sub !== ticketId) {
      res.status(401).end();
      return;
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    let set = ticketStreams.get(ticketId);
    if (!set) {
      set = new Set();
      ticketStreams.set(ticketId, set);
    }
    set.add(res);

    const heartbeat = setInterval(() => {
      try {
        res.write(': ping\n\n');
      } catch {
        clearInterval(heartbeat);
        set?.delete(res);
      }
    }, 25_000);

    req.on('close', () => {
      clearInterval(heartbeat);
      set?.delete(res);
      if (set && set.size === 0) {
        ticketStreams.delete(ticketId);
      }
    });
  });

  // 8. Counselor / Psychologist Login
  app.post(
    '/api/counselor/login',
    staffLoginLimiter,
    asyncHandler(async (req: Request, res: Response) => {
      const email = typeof req.body?.email === 'string' ? req.body.email : '';
      const password = typeof req.body?.password === 'string' ? req.body.password : '';
      const result = await db.authenticateCounselorAsync(email, password);
      if (!result.counselor) {
        res
          .status(401)
          .json({ error: result.reason || 'Correo institucional o contraseña incorrectos.' });
        return;
      }
      const token = signToken({
        sub: result.counselor.id,
        role: 'counselor',
        schoolId: result.counselor.school_id,
      });
      res.json({ token, counselor: result.counselor });
    })
  );

  app.post('/api/counselor/demo-login', staffLoginLimiter, (req: Request, res: Response) => {
    const config = getEffectiveDemoConfig();
    if (config.demoPolicy !== 'timed') {
      res.status(403).json({ error: 'El acceso demo está deshabilitado en este entorno.' });
      return;
    }
    const demoAuth = verifyDemoPassFromRequest(req);
    if (!demoAuth) {
      res.status(401).json({
        error: 'Activa o renueva un pase de demostración vigente para explorar este rol.',
      });
      return;
    }
    const demoAccountId = req.body?.demoRole === 'admin' ? 'counselor-admin-sj' : 'counselor-maria-1';
    const demoAccount = db.getCounselorById(demoAccountId);
    if (!demoAccount || !db.isSchoolActive(demoAccount.school_id)) {
      res.status(404).json({ error: 'Cuenta demo no disponible.' });
      return;
    }
    const remainingMs = Math.max(1000, demoAuth.exp - Date.now());
    const token = signToken(
      {
        sub: demoAccount.id,
        role: 'counselor',
        schoolId: demoAccount.school_id,
        isDemo: true,
      },
      remainingMs
    );
    res.json({ token, counselor: demoAccount, expiresAt: demoAuth.exp });
  });

  type AuthedCounselor = CounselorProfile & { isDemo?: boolean };

  function requireCounselor(req: Request, res: Response, allowQueryToken = false): AuthedCounselor | null {
    const rawAuth = req.header('authorization') || '';
    const bearer = rawAuth.startsWith('Bearer ') ? rawAuth.slice(7) : undefined;
    const queryToken =
      allowQueryToken && typeof req.query.token === 'string' ? req.query.token : undefined;
    const auth = verifyToken(bearer || queryToken);
    if (!auth || auth.role !== 'counselor') {
      res.status(401).json({ error: 'Acceso institucional requerido.' });
      return null;
    }
    const counselor = db.getCounselorById(auth.sub);
    if (!counselor) {
      res.status(401).json({ error: 'Cuenta de especialista no encontrada.' });
      return null;
    }
    if (!db.isSchoolActive(counselor.school_id)) {
      res.status(403).json({
        error: 'El acceso de tu colegio se encuentra pausado temporalmente.',
      });
      return null;
    }
    return { ...counselor, isDemo: Boolean(auth.isDemo) };
  }

  // 9. List Tickets Scoped to Counselor's School & Role Sandboxing
  app.get('/api/counselor/tickets', (req: Request, res: Response) => {
    const counselor = requireCounselor(req, res);
    if (!counselor) return;
    res.json({
      tickets: db.listSchoolTickets(
        counselor.school_id,
        counselor.role,
        counselor.id,
        counselor.isDemo
      ),
    });
  });

  // 10. Get Ticket Messages for Counselor
  app.get('/api/counselor/tickets/:id/messages', (req: Request, res: Response) => {
    const counselor = requireCounselor(req, res);
    if (!counselor) return;
    const ticket = db.getTicketById(req.params.id);
    if (!ticket || ticket.school_id !== counselor.school_id) {
      res.status(404).json({ error: 'Caso no encontrado en tu institución.' });
      return;
    }
    if (!db.canCounselorAccessTicket(counselor, ticket)) {
      res.status(403).json({
        error: 'Acceso clínico restringido para esta categoría según tu rol.',
      });
      return;
    }
    res.json({ messages: db.getMessagesForTicket(ticket.id) });
  });

  // 11. Counselor Sends Reply
  app.post('/api/counselor/tickets/:id/messages', messageLimiter, (req: Request, res: Response) => {
    const counselor = requireCounselor(req, res);
    if (!counselor) return;
    const ticket = db.getTicketById(req.params.id);
    if (!ticket || ticket.school_id !== counselor.school_id) {
      res.status(404).json({ error: 'Caso no encontrado en tu institución.' });
      return;
    }
    if (!db.canCounselorAccessTicket(counselor, ticket)) {
      res.status(403).json({
        error: 'No tienes permiso para responder casos de esta categoría.',
      });
      return;
    }
    if (
      counselor.isDemo &&
      !ticket.is_sandbox &&
      rejectIfDemo(
        counselor,
        res,
        'En Modo Demo solo puedes enviar respuestas en casos Sandbox de prueba.'
      )
    ) {
      return;
    }
    const content = typeof req.body?.content === 'string' ? req.body.content.trim() : '';
    if (!content) {
      res.status(400).json({ error: 'Escribe una respuesta antes de enviar.' });
      return;
    }
    if (content.length > MAX_MESSAGE_LENGTH) {
      res.status(400).json({
        error: `La respuesta supera el máximo de ${MAX_MESSAGE_LENGTH} caracteres.`,
      });
      return;
    }

    const added = db.addMessage(ticket.id, 'counselor', content, counselor);
    if (!added) {
      res.status(404).json({ error: 'No se pudo enviar el mensaje.' });
      return;
    }

    broadcastTicketEvent(ticket.id, 'message_created', added.message);
    broadcastTicketEvent(ticket.id, 'ticket_updated', added.ticket);
    broadcastSchoolEvent(
      counselor.school_id,
      'message_created',
      {
        ticketId: ticket.id,
        message: added.message,
        ticket: added.ticket,
      },
      {
        category: added.ticket.category,
        categoryId: added.ticket.category_id,
        escalated: Boolean(added.ticket.escalated_at),
        assignedCounselorId: added.ticket.assigned_counselor_id,
      }
    );
    broadcastSchoolEvent(counselor.school_id, 'ticket_updated', added.ticket, {
      category: added.ticket.category,
      categoryId: added.ticket.category_id,
      escalated: Boolean(added.ticket.escalated_at),
      assignedCounselorId: added.ticket.assigned_counselor_id,
    });

    if (!added.ticket.is_sandbox) {
      void sendCamouflagedPush(ticket.id);
    }

    res.status(201).json({ message: added.message, ticket: added.ticket });
  });

  // 12. Update Ticket Status or Risk Level
  app.patch('/api/counselor/tickets/:id', (req: Request, res: Response) => {
    const counselor = requireCounselor(req, res);
    if (!counselor) return;
    const existing = db.getTicketById(req.params.id);
    if (!existing || existing.school_id !== counselor.school_id) {
      res.status(404).json({ error: 'Caso no encontrado.' });
      return;
    }
    if (!db.canCounselorAccessTicket(counselor, existing)) {
      res.status(403).json({ error: 'Acceso clínico restringido para esta categoría.' });
      return;
    }
    if (
      counselor.isDemo &&
      !existing.is_sandbox &&
      rejectIfDemo(
        counselor,
        res,
        'En Modo Demo solo puedes cambiar el estado de casos Sandbox.'
      )
    ) {
      return;
    }

    const status = req.body?.status as TicketStatus | undefined;
    const risk_level = req.body?.risk_level as RiskLevel | undefined;
    const resolution_outcome = req.body?.resolution_outcome as TicketOutcome | null | undefined;
    const resolution_note = req.body?.resolution_note as string | null | undefined;

    const result = db.updateTicketStatus(
      req.params.id,
      counselor.school_id,
      {
        status,
        risk_level,
        resolution_outcome,
        resolution_note,
      },
      counselor
    );
    if (!result) {
      res.status(404).json({ error: 'Caso no encontrado.' });
      return;
    }
    if ('error' in result) {
      res.status(400).json({ error: result.error });
      return;
    }
    const updated = result.ticket;

    broadcastTicketEvent(updated.id, 'ticket_updated', updated);
    broadcastSchoolEvent(counselor.school_id, 'ticket_updated', updated, {
      category: updated.category,
      categoryId: updated.category_id,
      escalated: Boolean(updated.escalated_at),
      assignedCounselorId: updated.assigned_counselor_id,
    });
    res.json({ ticket: updated });
  });

  // 12a. Staff-Only Internal Clinical Notes (Zero exposure to student)
  app.get('/api/counselor/tickets/:id/notes', (req: Request, res: Response) => {
    const counselor = requireCounselor(req, res);
    if (!counselor) return;
    const ticket = db.getTicketById(req.params.id);
    if (!ticket || ticket.school_id !== counselor.school_id) {
      res.status(404).json({ error: 'Caso no encontrado.' });
      return;
    }
    if (!db.canCounselorAccessTicket(counselor, ticket)) {
      res.status(403).json({ error: 'Acceso clínico restringido para esta categoría.' });
      return;
    }
    res.json({ notes: db.getInternalNotes(ticket.id) });
  });

  app.post('/api/counselor/tickets/:id/notes', (req: Request, res: Response) => {
    const counselor = requireCounselor(req, res);
    if (!counselor) return;
    const ticket = db.getTicketById(req.params.id);
    if (!ticket || ticket.school_id !== counselor.school_id) {
      res.status(404).json({ error: 'Caso no encontrado.' });
      return;
    }
    if (!db.canCounselorAccessTicket(counselor, ticket)) {
      res.status(403).json({ error: 'Acceso clínico restringido para esta categoría.' });
      return;
    }
    if (
      counselor.isDemo &&
      !ticket.is_sandbox &&
      rejectIfDemo(counselor, res, 'En Modo Demo no se pueden agregar notas a casos reales.')
    ) {
      return;
    }
    const content = typeof req.body?.content === 'string' ? req.body.content.trim() : '';
    if (!content) {
      res.status(400).json({ error: 'La nota interna no puede estar vacía.' });
      return;
    }
    if (content.length > MAX_NOTE_LENGTH) {
      res.status(400).json({
        error: `La nota supera el máximo de ${MAX_NOTE_LENGTH} caracteres.`,
      });
      return;
    }
    const note = db.addInternalNote(ticket.id, counselor, content);
    if (!note) {
      res.status(400).json({ error: 'No se pudo guardar la nota interna.' });
      return;
    }
    res.status(201).json({ note });
  });

  // 12b. Claim / Assign Ticket to Counselor
  app.post('/api/counselor/tickets/:id/assign', (req: Request, res: Response) => {
    const counselor = requireCounselor(req, res);
    if (!counselor) return;
    const existing = db.getTicketById(req.params.id);
    if (!existing || existing.school_id !== counselor.school_id) {
      res.status(404).json({ error: 'Caso no encontrado.' });
      return;
    }
    if (!db.canCounselorAccessTicket(counselor, existing)) {
      res.status(403).json({ error: 'Acceso clínico restringido para esta categoría.' });
      return;
    }
    if (
      counselor.isDemo &&
      !existing.is_sandbox &&
      rejectIfDemo(counselor, res, 'En Modo Demo no se pueden reasignar casos reales.')
    ) {
      return;
    }
    const updated = db.assignTicket(existing.id, counselor.school_id, counselor);
    if (!updated) {
      res.status(404).json({ error: 'No se pudo asignar el caso.' });
      return;
    }
    broadcastTicketEvent(updated.id, 'ticket_updated', updated);
    broadcastSchoolEvent(counselor.school_id, 'ticket_updated', updated, {
      category: updated.category,
      categoryId: updated.category_id,
      escalated: Boolean(updated.escalated_at),
      assignedCounselorId: updated.assigned_counselor_id,
    });
    res.json({ ticket: updated });
  });

  // 12c. Manual Escalation to School Coordination & Webhook
  app.post('/api/counselor/tickets/:id/escalate', (req: Request, res: Response) => {
    const counselor = requireCounselor(req, res);
    if (!counselor) return;
    const existing = db.getTicketById(req.params.id);
    if (!existing || existing.school_id !== counselor.school_id) {
      res.status(404).json({ error: 'Caso no encontrado.' });
      return;
    }
    if (!db.canCounselorAccessTicket(counselor, existing)) {
      res.status(403).json({ error: 'Acceso clínico restringido para esta categoría.' });
      return;
    }
    if (
      counselor.isDemo &&
      !existing.is_sandbox &&
      rejectIfDemo(counselor, res, 'En Modo Demo no se pueden escalar casos reales.')
    ) {
      return;
    }
    const reason = typeof req.body?.reason === 'string' ? req.body.reason : undefined;
    const escalated = db.manualEscalateTicket(existing.id, counselor.school_id, counselor, reason);
    if (!escalated) {
      res.status(404).json({ error: 'No se pudo escalar el caso.' });
      return;
    }
    broadcastTicketEvent(escalated.ticket.id, 'ticket_updated', escalated.ticket);
    broadcastSchoolEvent(counselor.school_id, 'ticket_updated', escalated.ticket, {
      category: escalated.ticket.category,
      categoryId: escalated.ticket.category_id,
      escalated: true,
      assignedCounselorId: escalated.ticket.assigned_counselor_id,
    });
    void fireEscalationWebhook(escalated.school, escalated.ticket);
    void notifyStaffForTicket(escalated.school, escalated.ticket, 'manual_escalation');
    res.json({ ticket: escalated.ticket });
  });

  // 12c2. Audited Break-Glass Emergency Contact Unlock (critico only)
  app.post('/api/counselor/tickets/:id/unlock-break-glass', (req: Request, res: Response) => {
    const counselor = requireCounselor(req, res);
    if (!counselor) return;
    const existing = db.getTicketById(req.params.id);
    if (!existing || existing.school_id !== counselor.school_id) {
      res.status(404).json({ error: 'Caso no encontrado.' });
      return;
    }
    if (!db.canCounselorAccessTicket(counselor, existing)) {
      res.status(403).json({ error: 'Acceso clínico restringido para esta categoría.' });
      return;
    }
    if (
      counselor.isDemo &&
      !existing.is_sandbox &&
      rejectIfDemo(counselor, res, 'En Modo Demo no se puede desencriptar información de casos reales.')
    ) {
      return;
    }
    const reason = typeof req.body?.reason === 'string' ? req.body.reason : '';
    const result = db.unlockBreakGlass(existing.id, counselor, reason);
    if (!result) {
      res.status(404).json({ error: 'Caso no encontrado.' });
      return;
    }
    if ('error' in result) {
      res.status(400).json({ error: result.error });
      return;
    }
    broadcastSchoolEvent(counselor.school_id, 'ticket_updated', result.ticket, {
      category: result.ticket.category,
      categoryId: result.ticket.category_id,
      escalated: Boolean(result.ticket.escalated_at),
      assignedCounselorId: result.ticket.assigned_counselor_id,
    });
    res.json({ contact: result.contact, ticket: result.ticket });
  });

  // 12d. Update Counselor Availability Status
  app.patch('/api/counselor/availability', (req: Request, res: Response) => {
    const counselor = requireCounselor(req, res);
    if (!counselor) return;
    if (rejectIfDemo(counselor, res)) return;
    const availability = req.body?.availability;
    if (!isValidAvailability(availability)) {
      res.status(400).json({ error: 'Estado de disponibilidad inválido.' });
      return;
    }
    const updated = db.updateCounselorAvailability(counselor.id, availability as CounselorAvailability);
    if (!updated) {
      res.status(404).json({ error: 'Cuenta no encontrada.' });
      return;
    }
    res.json({ counselor: updated });
  });

  // 12e. Staff Push Health & Subscription Management (Propuestas A + E)
  app.get('/api/counselor/push-status', (req: Request, res: Response) => {
    const counselor = requireCounselor(req, res);
    if (!counselor) return;
    const currentEndpoint =
      typeof req.query.endpoint === 'string' ? req.query.endpoint : undefined;
    const health = db.getSchoolPushHealth(
      counselor.school_id,
      counselor.id,
      currentEndpoint
    );
    res.json({ health });
  });

  app.post('/api/counselor/push-subscribe', messageLimiter, (req: Request, res: Response) => {
    const counselor = requireCounselor(req, res);
    if (!counselor) return;
    if (rejectIfDemo(counselor, res)) return;
    const sub = req.body?.subscription as
      | { endpoint?: string; keys?: { p256dh?: string; auth?: string } }
      | undefined;
    const thresholdRaw = req.body?.threshold;
    const threshold: StaffAlertThreshold =
      thresholdRaw === 'todos' || thresholdRaw === 'criticos_y_medios'
        ? thresholdRaw
        : 'criticos_y_sla';
    const deviceLabel =
      typeof req.body?.deviceLabel === 'string' ? req.body.deviceLabel : 'Dispositivo';

    const saved = db.upsertStaffPushSubscription(counselor, sub || {}, threshold, deviceLabel);
    if (!saved) {
      res.status(400).json({ error: 'Suscripción Push inválida para este dispositivo.' });
      return;
    }
    const health = db.getSchoolPushHealth(counselor.school_id, counselor.id, saved.endpoint);
    res.status(201).json({ subscriptionId: saved.id, threshold: saved.threshold, health });
  });

  app.delete('/api/counselor/push-subscribe', (req: Request, res: Response) => {
    const counselor = requireCounselor(req, res);
    if (!counselor) return;
    if (rejectIfDemo(counselor, res)) return;
    const endpoint = typeof req.body?.endpoint === 'string' ? req.body.endpoint : undefined;
    const removed = db.removeStaffPushSubscription(counselor.id, endpoint);
    const health = db.getSchoolPushHealth(counselor.school_id, counselor.id);
    res.json({ removed, health });
  });

  app.post(
    '/api/counselor/push-test',
    aiDraftLimiter,
    asyncHandler(async (req: Request, res: Response) => {
      const counselor = requireCounselor(req, res);
      if (!counselor) return;
      if (rejectIfDemo(counselor, res)) return;

      const school = db.getSchoolById(counselor.school_id);
      if (!school) {
        res.status(404).json({ error: 'Colegio no encontrado.' });
        return;
      }

      const targets = db.listStaffPushTargetsForSchool(school.id);
      if (targets.length === 0) {
        const health = db.getSchoolPushHealth(school.id, counselor.id);
        res.json({
          sent: 0,
          failed: 0,
          expired: 0,
          health,
          message:
            'No hay dispositivos del equipo suscritos aún. Activa las alertas en tu móvil o navegador desde el panel.',
        });
        return;
      }

      const results = await Promise.all(
        targets.map((sub) =>
          sendStaffWebPush(
            sub.endpoint,
            { p256dh: sub.p256dh, auth: sub.auth },
            {
              title: `Alerta de prueba · ${school.short_name}`,
              body: `Simulación verificada por ${counselor.full_name}. Tu canal Push móvil/escritorio está operativo.`,
              url: '/?openStaff=1&skipSplash=1',
              tag: `te-escucho-push-test-${school.id}`,
              requireInteraction: false,
              renotify: true,
              urgent: true,
            }
          )
        )
      );

      const sent = results.filter((r) => r === 'sent').length;
      const expired = results.filter((r) => r === 'expired').length;
      const failed = results.filter((r) => r === 'failed').length;

      db.recordAuditLog({
        school_id: school.id,
        school_name: school.name,
        actor_type: 'counselor',
        actor_name: counselor.full_name,
        action: 'staff_push_test',
        target: `${sent}/${targets.length} dispositivos`,
        detail: `Prueba de canal Push ejecutada (enviados: ${sent}, expirados: ${expired}, fallidos: ${failed}).`,
      });

      const health = db.getSchoolPushHealth(school.id, counselor.id);
      res.json({ sent, failed, expired, health });
    })
  );

  // 13. Gemini Empathy Assistant for Counselors / Teachers
  app.post(
    '/api/counselor/empathy-draft',
    aiDraftLimiter,
    asyncHandler(async (req: Request, res: Response) => {
      const counselor = requireCounselor(req, res);
      if (!counselor) return;
      const ticketId = typeof req.body?.ticketId === 'string' ? req.body.ticketId : '';
      const tone: EmpathyTone = isValidEmpathyTone(req.body?.tone)
        ? req.body.tone
        : 'contencion_inicial';
      const ticket = db.getTicketById(ticketId);
      if (!ticket || ticket.school_id !== counselor.school_id) {
        res.status(404).json({ error: 'Caso no encontrado.' });
        return;
      }
      if (!db.canCounselorAccessTicket(counselor, ticket)) {
        res.status(403).json({ error: 'Acceso clínico restringido para esta categoría.' });
        return;
      }
      const school = db.getSchoolById(counselor.school_id);
      if (school && !school.ai_config.empathy_assistant_enabled) {
        res.status(403).json({
          error: 'El asistente de redacción empática está desactivado en la configuración del colegio.',
        });
        return;
      }
      const messages = db.getMessagesForTicket(ticket.id);
      const draft = await generateEmpathyDraft(ticket, messages, school?.ai_config, tone);
      res.json({ draft });
    })
  );

  // 14. Anonymous School Analytics & Heatmap
  app.get('/api/counselor/analytics', (req: Request, res: Response) => {
    const counselor = requireCounselor(req, res);
    if (!counselor) return;
    res.json({ analytics: db.getSchoolAnalytics(counselor.school_id) });
  });

  // 14b. Zero-PII CSV Export for School Analytics
  app.get('/api/counselor/export.csv', (req: Request, res: Response) => {
    const counselor = requireCounselor(req, res);
    if (!counselor) return;
    const csv = db.generateSchoolCsv(counselor.school_id);
    if (!counselor.isDemo) {
      db.recordAuditLog({
        school_id: counselor.school_id,
        school_name: counselor.school_name,
        actor_type: 'counselor',
        actor_name: counselor.full_name,
        action: 'export_csv_generated',
        target: counselor.school_access_code,
        detail: 'Exportación estadística CSV anonimizada (Zero-PII).',
      });
    }
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="te-escucho-${counselor.school_access_code.toLowerCase()}-reporte.csv"`
    );
    res.send(csv);
  });

  // 15. Counselor School-wide Real-Time SSE Stream
  app.get('/api/stream/school/:schoolId', (req: Request, res: Response) => {
    const counselor = requireCounselor(req, res, true);
    if (!counselor || counselor.school_id !== req.params.schoolId) {
      if (!res.headersSent) res.status(401).end();
      return;
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    let set = schoolStreams.get(counselor.school_id);
    if (!set) {
      set = new Set();
      schoolStreams.set(counselor.school_id, set);
    }
    const client: SchoolStreamClient = {
      res,
      role: counselor.role,
      counselorId: counselor.id,
      isDemo: Boolean(counselor.isDemo),
    };
    set.add(client);

    const heartbeat = setInterval(() => {
      try {
        res.write(': ping\n\n');
      } catch {
        clearInterval(heartbeat);
        set?.delete(client);
      }
    }, 25_000);

    req.on('close', () => {
      clearInterval(heartbeat);
      set?.delete(client);
      if (set && set.size === 0) {
        schoolStreams.delete(counselor.school_id);
      }
    });
  });

  // 16. Counselor School Public Config Readout
  app.get('/api/counselor/school-config', (req: Request, res: Response) => {
    const counselor = requireCounselor(req, res);
    if (!counselor) return;
    const school = db.getSchoolById(counselor.school_id);
    if (!school) {
      res.status(404).json({ error: 'Institución no encontrada.' });
      return;
    }
    res.json({ school: db.toPublicSchoolConfig(school) });
  });

  // ---- School Admin ("Mi Colegio" for counselor.role === 'admin') ----

  function requireSchoolAdmin(req: Request, res: Response) {
    const counselor = requireCounselor(req, res);
    if (!counselor) return null;
    if (counselor.role !== 'admin') {
      res.status(403).json({
        error: 'Solo los administradores del colegio pueden gestionar la configuración del plantel.',
      });
      return null;
    }
    return counselor;
  }

  app.get('/api/school-admin/config', (req: Request, res: Response) => {
    const adminUser = requireSchoolAdmin(req, res);
    if (!adminUser) return;
    const school = db.getSchoolById(adminUser.school_id);
    if (!school) {
      res.status(404).json({ error: 'Colegio no encontrado.' });
      return;
    }
    res.json({
      school,
      team: db.listSchoolCounselors(school.id),
      global_inspira_resources: db.getPublicInspiraResources(),
    });
  });

  app.patch('/api/school-admin/config', (req: Request, res: Response) => {
    const adminUser = requireSchoolAdmin(req, res);
    if (!adminUser) return;
    if (rejectIfDemo(adminUser, res)) return;
    const body = req.body || {};
    const safeUpdates: Record<string, unknown> = {};
    const allowedKeys = [
      'accent_color',
      'welcome_message',
      'support_hours',
      'after_hours_notice',
      'internal_help_phone',
      'spaces',
      'categories',
      'emergency_lines',
      'sla_config',
      'retention_config',
      'inspira_enabled',
      'inspira_custom_resources',
      'inspira_disabled_ids',
    ];
    for (const key of allowedKeys) {
      if (body[key] !== undefined) {
        safeUpdates[key] = body[key];
      }
    }
    const result = db.updateSchool(adminUser.school_id, safeUpdates, {
      type: 'counselor',
      name: adminUser.full_name,
    });
    if ('error' in result) {
      res.status(400).json({ error: result.error });
      return;
    }
    res.json({ school: result.school });
  });

  app.post(
    '/api/school-admin/team',
    asyncHandler(async (req: Request, res: Response) => {
      const adminUser = requireSchoolAdmin(req, res);
      if (!adminUser) return;
      if (rejectIfDemo(adminUser, res)) return;
      const result = await db.createCounselorAsync(adminUser.school_id, req.body || {});
      if ('error' in result) {
        res.status(400).json({ error: result.error });
        return;
      }
      res.status(201).json(result);
    })
  );

  app.patch(
    '/api/school-admin/team/:memberId',
    asyncHandler(async (req: Request, res: Response) => {
      const adminUser = requireSchoolAdmin(req, res);
      if (!adminUser) return;
      if (rejectIfDemo(adminUser, res)) return;
      const schoolTeam = db.listSchoolCounselors(adminUser.school_id);
      if (!schoolTeam.some((m) => m.id === req.params.memberId)) {
        res.status(404).json({ error: 'Miembro no encontrado en tu colegio.' });
        return;
      }
      const result = await db.updateCounselorAsync(req.params.memberId, req.body || {});
      if ('error' in result) {
        res.status(400).json({ error: result.error });
        return;
      }
      if (!result.counselor.active) {
        disconnectCounselorStreams(result.counselor.id);
      }
      res.json(result);
    })
  );

  app.delete('/api/school-admin/team/:memberId', (req: Request, res: Response) => {
    const adminUser = requireSchoolAdmin(req, res);
    if (!adminUser) return;
    if (rejectIfDemo(adminUser, res)) return;
    if (req.params.memberId === adminUser.id) {
      res.status(400).json({ error: 'No puedes eliminar tu propia cuenta activa.' });
      return;
    }
    const schoolTeam = db.listSchoolCounselors(adminUser.school_id);
    if (!schoolTeam.some((m) => m.id === req.params.memberId)) {
      res.status(404).json({ error: 'Miembro no encontrado en tu colegio.' });
      return;
    }
    const delResult = db.deleteCounselor(req.params.memberId);
    if ('error' in delResult) {
      res.status(400).json({ error: delResult.error });
      return;
    }
    disconnectCounselorStreams(req.params.memberId);
    res.json({ ok: true });
  });

  app.get('/api/school-admin/audit-logs', (req: Request, res: Response) => {
    const adminUser = requireSchoolAdmin(req, res);
    if (!adminUser) return;
    res.json({ logs: db.listAuditLogs(adminUser.school_id, 100) });
  });

  // ---- Platform Super Admin (Encargado de la App) ----

  app.post(
    '/api/admin/login',
    staffLoginLimiter,
    asyncHandler(async (req: Request, res: Response) => {
      const email = typeof req.body?.email === 'string' ? req.body.email : '';
      const password = typeof req.body?.password === 'string' ? req.body.password : '';
      const admin = await db.authenticatePlatformAdminAsync(email, password);
      if (!admin) {
        res.status(401).json({ error: 'Credenciales de encargado inválidas.' });
        return;
      }
      const token = signToken({
        sub: admin.id,
        role: 'platform_admin',
      });
      res.json({ token, admin });
    })
  );

  app.post('/api/admin/demo-login', staffLoginLimiter, (req: Request, res: Response) => {
    const config = getEffectiveDemoConfig();
    if (config.demoPolicy !== 'timed') {
      res.status(403).json({ error: 'El acceso demo está deshabilitado en este entorno.' });
      return;
    }
    const demoAuth = verifyDemoPassFromRequest(req);
    if (!demoAuth) {
      res.status(401).json({
        error: 'Activa o renueva un pase de demostración vigente para explorar la consola.',
      });
      return;
    }
    const demoAdmin = db.getPlatformAdminById('platform-admin-1');
    if (!demoAdmin) {
      res.status(404).json({ error: 'Cuenta demo de plataforma no disponible.' });
      return;
    }
    const remainingMs = Math.max(1000, demoAuth.exp - Date.now());
    const token = signToken(
      {
        sub: demoAdmin.id,
        role: 'platform_admin',
        isDemo: true,
      },
      remainingMs
    );
    res.json({ token, admin: demoAdmin, expiresAt: demoAuth.exp });
  });

  type AuthedPlatformAdmin = PlatformAdminProfile & { isDemo?: boolean };

  function requirePlatformAdmin(req: Request, res: Response): AuthedPlatformAdmin | null {
    const rawAuth = req.header('authorization') || '';
    const bearer = rawAuth.startsWith('Bearer ') ? rawAuth.slice(7) : undefined;
    const auth = verifyToken(bearer);
    if (!auth || auth.role !== 'platform_admin') {
      res.status(401).json({ error: 'Acceso de Encargado de Plataforma requerido.' });
      return null;
    }
    const admin = db.getPlatformAdminById(auth.sub);
    if (!admin) {
      res.status(401).json({ error: 'Cuenta administrativa no encontrada.' });
      return null;
    }
    return { ...admin, isDemo: Boolean(auth.isDemo) };
  }

  app.get('/api/admin/overview', (req: Request, res: Response) => {
    const admin = requirePlatformAdmin(req, res);
    if (!admin) return;
    res.json(db.getAdminOverview());
  });

  app.post('/api/admin/schools', (req: Request, res: Response) => {
    const admin = requirePlatformAdmin(req, res);
    if (!admin) return;
    if (rejectIfDemo(admin, res)) return;
    const result = db.createSchool(req.body || {});
    if ('error' in result) {
      res.status(400).json({ error: result.error });
      return;
    }
    res.status(201).json(result);
  });

  app.patch('/api/admin/schools/:id', (req: Request, res: Response) => {
    const admin = requirePlatformAdmin(req, res);
    if (!admin) return;
    if (rejectIfDemo(admin, res)) return;
    const body = req.body || {};
    const safeUpdates: Record<string, unknown> = {};
    const allowedSchoolKeys = [
      'name',
      'short_name',
      'access_code',
      'active',
      'region',
      'country_preset',
      'education_level',
      'modular_code',
      'accent_color',
      'welcome_message',
      'support_hours',
      'after_hours_notice',
      'internal_help_phone',
      'spaces',
      'categories',
      'emergency_lines',
      'sla_config',
      'ai_config',
      'retention_config',
      'inspira_enabled',
      'inspira_custom_resources',
      'inspira_disabled_ids',
    ];
    for (const key of allowedSchoolKeys) {
      if (body[key] !== undefined) {
        safeUpdates[key] = body[key];
      }
    }
    const result = db.updateSchool(req.params.id, safeUpdates, {
      type: 'platform_admin',
      name: admin.full_name,
    });
    if ('error' in result) {
      res.status(400).json({ error: result.error });
      return;
    }
    if (!result.school.active) {
      disconnectSchoolStreams(result.school.id);
    }
    res.json(result);
  });

  app.post('/api/admin/schools/:id/rotate-code', (req: Request, res: Response) => {
    const admin = requirePlatformAdmin(req, res);
    if (!admin) return;
    if (rejectIfDemo(admin, res)) return;
    const result = db.rotateSchoolCode(req.params.id);
    if ('error' in result) {
      res.status(400).json({ error: result.error });
      return;
    }
    res.json(result);
  });

  app.get('/api/admin/schools/:id/team', (req: Request, res: Response) => {
    const admin = requirePlatformAdmin(req, res);
    if (!admin) return;
    const school = db.getSchoolById(req.params.id);
    if (!school) {
      res.status(404).json({ error: 'Colegio no encontrado.' });
      return;
    }
    res.json({ team: db.listSchoolCounselors(school.id) });
  });

  app.post(
    '/api/admin/schools/:id/team',
    asyncHandler(async (req: Request, res: Response) => {
      const admin = requirePlatformAdmin(req, res);
      if (!admin) return;
      if (rejectIfDemo(admin, res)) return;
      const result = await db.createCounselorAsync(req.params.id, req.body || {});
      if ('error' in result) {
        res.status(400).json({ error: result.error });
        return;
      }
      res.status(201).json(result);
    })
  );

  app.patch(
    '/api/admin/team/:counselorId',
    asyncHandler(async (req: Request, res: Response) => {
      const admin = requirePlatformAdmin(req, res);
      if (!admin) return;
      if (rejectIfDemo(admin, res)) return;
      const result = await db.updateCounselorAsync(req.params.counselorId, req.body || {});
      if ('error' in result) {
        res.status(400).json({ error: result.error });
        return;
      }
      if (!result.counselor.active) {
        disconnectCounselorStreams(result.counselor.id);
      }
      res.json(result);
    })
  );

  app.delete('/api/admin/team/:counselorId', (req: Request, res: Response) => {
    const admin = requirePlatformAdmin(req, res);
    if (!admin) return;
    if (rejectIfDemo(admin, res)) return;
    const delResult = db.deleteCounselor(req.params.counselorId);
    if ('error' in delResult) {
      res.status(400).json({ error: delResult.error });
      return;
    }
    disconnectCounselorStreams(req.params.counselorId);
    res.json({ ok: true });
  });

  app.post(
    '/api/admin/schools/:id/sandbox-test',
    asyncHandler(async (req: Request, res: Response) => {
      const admin = requirePlatformAdmin(req, res);
      if (!admin) return;
      const school = db.getSchoolById(req.params.id);
      if (!school) {
        res.status(404).json({ error: 'Colegio no encontrado.' });
        return;
      }
      const category =
        typeof req.body?.category === 'string' && req.body.category.trim()
          ? req.body.category.trim()
          : school.categories.find((c) => c.active)?.title || 'Sufro acoso o burlas';
      const spaceTag =
        typeof req.body?.spaceTag === 'string' && req.body.spaceTag.trim()
          ? req.body.spaceTag.trim()
          : school.spaces[0] || 'Patio / Recreo';
      const testMessage =
        typeof req.body?.message === 'string' && req.body.message.trim()
          ? req.body.message.trim()
          : '[PRUEBA SANDBOX] Simulación de reporte preventivo en horario de recreo para validar recepción y triaje.';

      const created = await db.createAnonymousTicketAsync({
        schoolId: school.id,
        category,
        spaceTag,
        pin: '0000',
        isSandbox: true,
      });
      if (!created || 'error' in created) {
        res.status(400).json({ error: 'No se pudo generar la prueba.' });
        return;
      }

      const added = db.addMessage(created.ticket.id, 'student', testMessage);
      const triage = await analyzeStudentMessage(
        testMessage,
        category,
        created.messages,
        school.ai_config
      );
      const triagedTicket =
        db.updateTicketTriage(
          created.ticket.id,
          triage.risk_level,
          triage.ai_suggestion,
          triage.ai_rationale
        ) ||
        added?.ticket ||
        created.ticket;

      broadcastSchoolEvent(school.id, 'ticket_created', triagedTicket, {
        category: triagedTicket.category,
        categoryId: triagedTicket.category_id,
        escalated: false,
        assignedCounselorId: triagedTicket.assigned_counselor_id,
      });

      res.status(201).json({
        ticket: triagedTicket,
        messages: db.getMessagesForTicket(triagedTicket.id),
        testPin: '0000',
        triage,
      });
    })
  );

  app.delete('/api/admin/schools/:id/sandbox', (req: Request, res: Response) => {
    const admin = requirePlatformAdmin(req, res);
    if (!admin) return;
    const deleted = db.clearSandboxTickets(req.params.id);
    res.json({ deleted });
  });

  app.patch('/api/admin/catalog', (req: Request, res: Response) => {
    const admin = requirePlatformAdmin(req, res);
    if (!admin) return;
    if (rejectIfDemo(admin, res)) return;
    const result = db.updatePlatformCatalog(req.body || {});
    if ('error' in result) {
      res.status(400).json({ error: result.error });
      return;
    }
    res.json(result);
  });

  app.get('/api/admin/audit-logs', (req: Request, res: Response) => {
    const admin = requirePlatformAdmin(req, res);
    if (!admin) return;
    const schoolId = typeof req.query.schoolId === 'string' && req.query.schoolId ? req.query.schoolId : undefined;
    res.json({ logs: db.listAuditLogs(schoolId, 150) });
  });

  app.post('/api/admin/schools/:id/retention-purge', (req: Request, res: Response) => {
    const admin = requirePlatformAdmin(req, res);
    if (!admin) return;
    if (rejectIfDemo(admin, res)) return;
    const result = db.purgeExpiredResolvedTickets(req.params.id, admin.full_name);
    res.json(result);
  });

  app.get('/api/admin/export/overview.csv', (req: Request, res: Response) => {
    const admin = requirePlatformAdmin(req, res);
    if (!admin) return;
    const csv = db.generateNetworkOverviewCsv();
    if (!admin.isDemo) {
      db.recordAuditLog({
        school_id: null,
        school_name: 'Red Global',
        actor_type: 'platform_admin',
        actor_name: admin.full_name,
        action: 'export_network_csv',
        target: 'overview.csv',
        detail: 'Exportación comparativa multi-sede anonimizada.',
      });
    }
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="te-escucho-red-global.csv"');
    res.send(csv);
  });

  // Global Express Error Handler
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    console.error('Unhandled API error:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Ocurrió un error interno inesperado. Intenta nuevamente.' });
    }
  });

  const httpServer = http.createServer(app);

  // Frontend Hosting (Vite dev middleware vs production dist/)
  if (process.env.NODE_ENV !== 'production') {
    const hmrDisabled = process.env.DISABLE_HMR === 'true';
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        allowedHosts: true,
        hmr: hmrDisabled ? false : true,
        ws: { server: httpServer },
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  // Background SLA auto-escalation, T+5m cascade backup & retention monitor (runs every 60s)
  setInterval(() => {
    const cascadeDue = db.evaluateCascadeBackupAlerts();
    for (const item of cascadeDue) {
      void notifyStaffForTicket(item.school, item.ticket, 'cascade_backup');
    }

    const escalated = db.evaluateSlaEscalations();
    for (const item of escalated) {
      broadcastSchoolEvent(item.school.id, 'ticket_updated', item.ticket, {
        category: item.ticket.category,
        categoryId: item.ticket.category_id,
        escalated: true,
        assignedCounselorId: item.ticket.assigned_counselor_id,
      });
      broadcastTicketEvent(item.ticket.id, 'ticket_updated', item.ticket);
      void fireEscalationWebhook(item.school, item.ticket);
      void notifyStaffForTicket(item.school, item.ticket, 'sla_escalation');
    }
    db.purgeExpiredResolvedTickets(undefined, 'Motor de Retención Automática');
  }, 60_000);

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`Te Escucho server listening on http://localhost:${PORT}`);
  });
}

startServer();
