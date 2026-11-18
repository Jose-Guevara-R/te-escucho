import crypto from 'node:crypto';
import dns from 'node:dns/promises';
import net from 'node:net';
import type { NextFunction, Request, Response } from 'express';
import type {
  CounselorAvailability,
  CounselorRole,
  EmpathyTone,
  InspiraFormat,
  InspiraResource,
  InspiraTopic,
  RiskLevel,
  StudentPaceMode,
  TicketOutcome,
  TicketStatus,
} from '../src/types.ts';

export const MAX_MESSAGE_LENGTH = 4000;
export const MAX_NOTE_LENGTH = 2000;
export const MAX_TEXT_FIELD_LENGTH = 500;
export const MAX_BREAK_GLASS_LENGTH = 300;

const VALID_TICKET_STATUSES = new Set<TicketStatus>(['nuevo', 'en_curso', 'resuelto']);
const VALID_RISK_LEVELS = new Set<RiskLevel>(['bajo', 'medio', 'critico']);
const VALID_TICKET_OUTCOMES = new Set<TicketOutcome>([
  'acompanamiento_exitoso',
  'resuelto_tutoria',
  'derivacion_externa',
  'falsa_alerta',
  'otro',
]);
const VALID_COUNSELOR_ROLES = new Set<CounselorRole>([
  'director',
  'coordinator_toe',
  'psychologist',
  'tutor',
  'admin',
]);
const VALID_AVAILABILITIES = new Set<CounselorAvailability>(['available', 'busy', 'off_duty']);
const VALID_PACE_MODES = new Set<StudentPaceMode>(['discreet_help', 'listen_only']);
const VALID_EMPATHY_TONES = new Set<EmpathyTone>([
  'contencion_inicial',
  'validacion_ciberacoso',
  'riesgo_inmediato',
  'mensaje_puente',
]);
const VALID_INSPIRA_TOPICS = new Set<InspiraTopic>([
  'autoestima',
  'ciberacoso',
  'limites',
  'calma',
  'pedir_ayuda',
]);
const VALID_INSPIRA_FORMATS = new Set<InspiraFormat>(['capsula', 'video', 'ejercicio']);
const ALLOWED_YOUTUBE_HOSTS = new Set([
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'youtube-nocookie.com',
  'www.youtube-nocookie.com',
  'youtu.be',
]);

export function isValidTicketStatus(value: unknown): value is TicketStatus {
  return typeof value === 'string' && VALID_TICKET_STATUSES.has(value as TicketStatus);
}

export function isValidRiskLevel(value: unknown): value is RiskLevel {
  return typeof value === 'string' && VALID_RISK_LEVELS.has(value as RiskLevel);
}

export function isValidTicketOutcome(value: unknown): value is TicketOutcome {
  return typeof value === 'string' && VALID_TICKET_OUTCOMES.has(value as TicketOutcome);
}

export function isValidCounselorRole(value: unknown): value is CounselorRole {
  return typeof value === 'string' && VALID_COUNSELOR_ROLES.has(value as CounselorRole);
}

export function isValidAvailability(value: unknown): value is CounselorAvailability {
  return typeof value === 'string' && VALID_AVAILABILITIES.has(value as CounselorAvailability);
}

export function isValidPaceMode(value: unknown): value is StudentPaceMode {
  return typeof value === 'string' && VALID_PACE_MODES.has(value as StudentPaceMode);
}

export function isValidEmpathyTone(value: unknown): value is EmpathyTone {
  return typeof value === 'string' && VALID_EMPATHY_TONES.has(value as EmpathyTone);
}

export function isValidInspiraTopic(value: unknown): value is InspiraTopic {
  return typeof value === 'string' && VALID_INSPIRA_TOPICS.has(value as InspiraTopic);
}

export function isValidInspiraFormat(value: unknown): value is InspiraFormat {
  return typeof value === 'string' && VALID_INSPIRA_FORMATS.has(value as InspiraFormat);
}

// ---- Non-blocking Async Scrypt Hashing ----

function scryptAsync(secret: string, salt: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    crypto.scrypt(secret, salt, 32, (err, derivedKey) => {
      if (err) reject(err);
      else resolve(derivedKey);
    });
  });
}

export async function hashSecretAsync(secret: string): Promise<string> {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = await scryptAsync(secret, salt);
  return `${salt}:${derived.toString('hex')}`;
}

export async function verifySecretAsync(secret: string, storedHash: string): Promise<boolean> {
  const [salt, keyHex] = storedHash.split(':');
  if (!salt || !keyHex) return false;
  const derived = await scryptAsync(secret, salt);
  const keyBuf = Buffer.from(keyHex, 'hex');
  if (derived.length !== keyBuf.length) return false;
  return crypto.timingSafeEqual(derived, keyBuf);
}

// ---- Break-Glass Emergency Vault (AES-256-GCM) ----

const EPHEMERAL_VAULT_FALLBACK = crypto.randomBytes(32);

function getBreakGlassKey(): Buffer {
  const raw = process.env.BREAK_GLASS_SECRET || process.env.SESSION_SECRET;
  if (raw && raw.trim().length >= 8) {
    return crypto.createHash('sha256').update(`te-escucho-bg:${raw.trim()}`).digest();
  }
  return EPHEMERAL_VAULT_FALLBACK;
}

export function encryptBreakGlass(plaintext: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', getBreakGlassKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('base64url')}.${tag.toString('base64url')}.${encrypted.toString('base64url')}`;
}

export function decryptBreakGlass(ciphertext: string): string | null {
  try {
    const parts = ciphertext.split('.');
    if (parts.length !== 3) return null;
    const [ivB64, tagB64, dataB64] = parts;
    const decipher = crypto.createDecipheriv(
      'aes-256-gcm',
      getBreakGlassKey(),
      Buffer.from(ivB64, 'base64url')
    );
    decipher.setAuthTag(Buffer.from(tagB64, 'base64url'));
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(dataB64, 'base64url')),
      decipher.final(),
    ]);
    return decrypted.toString('utf8');
  } catch {
    return null;
  }
}

/**
 * Extracts a strict 11-character YouTube video ID from a URL or ID string.
 * Only youtube.com / youtu.be / youtube-nocookie.com are permitted to prevent XSS/untrusted embeds.
 */
export function extractSafeYoutubeId(rawInput: unknown): string | null {
  if (typeof rawInput !== 'string') return null;
  const trimmed = rawInput.trim();
  if (!trimmed) return null;

  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) {
    return trimmed;
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return null;
  }

  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    return null;
  }

  const host = parsed.hostname.toLowerCase();
  if (!ALLOWED_YOUTUBE_HOSTS.has(host)) {
    return null;
  }

  let candidate = '';
  if (host === 'youtu.be') {
    candidate = parsed.pathname.split('/').filter(Boolean)[0] || '';
  } else if (parsed.pathname === '/watch') {
    candidate = parsed.searchParams.get('v') || '';
  } else {
    const parts = parsed.pathname.split('/').filter(Boolean);
    if (parts[0] === 'embed' || parts[0] === 'shorts' || parts[0] === 'live') {
      candidate = parts[1] || '';
    }
  }

  return /^[a-zA-Z0-9_-]{11}$/.test(candidate) ? candidate : null;
}

export function sanitizeInspiraResources(
  rawList: unknown,
  scope: 'global' | 'school'
): { resources: InspiraResource[] } | { error: string } {
  if (!Array.isArray(rawList)) {
    return { error: 'La lista de recursos de Espacio Inspira no tiene un formato válido.' };
  }
  if (rawList.length > 60) {
    return { error: 'Se excedió el límite máximo de 60 recursos por catálogo.' };
  }

  const normalized: InspiraResource[] = [];
  for (const item of rawList) {
    if (!item || typeof item !== 'object') {
      return { error: 'Recurso inválido en Espacio Inspira.' };
    }
    const r = item as Partial<InspiraResource> & { youtube_url?: string };
    const title = String(r.title || '').trim().slice(0, 120);
    const summary = String(r.summary || '').trim().slice(0, 260);
    const body = String(r.body || '').trim().slice(0, 2800);
    const topic = isValidInspiraTopic(r.topic) ? r.topic : 'autoestima';
    const format = isValidInspiraFormat(r.format) ? r.format : 'capsula';
    const duration_label = String(r.duration_label || '2 min').trim().slice(0, 40) || '2 min';
    const affirmation = r.affirmation ? String(r.affirmation).trim().slice(0, 200) : undefined;

    if (!title || !summary) {
      return { error: 'Cada recurso de Espacio Inspira requiere título y resumen.' };
    }

    let youtube_id: string | undefined;
    if (format === 'video') {
      const candidate = extractSafeYoutubeId(r.youtube_id || r.youtube_url || '');
      if (!candidate) {
        return {
          error: `El video "${title}" debe incluir un enlace o ID válido de YouTube (11 caracteres).`,
        };
      }
      youtube_id = candidate;
    }

    normalized.push({
      id:
        typeof r.id === 'string' && r.id.trim()
          ? r.id.trim().slice(0, 64)
          : `insp-${crypto.randomUUID().slice(0, 8)}`,
      title,
      summary,
      body: body || summary,
      topic,
      format,
      duration_label,
      ...(youtube_id ? { youtube_id } : {}),
      ...(affirmation ? { affirmation } : {}),
      scope,
      active: r.active !== false,
    });
  }

  return { resources: normalized };
}

/**
 * Neutralizes spreadsheet formula injection (=, +, -, @, tab, CR) before quoting CSV cells.
 */
export function escapeCsvCell(value: unknown): string {
  let str = String(value ?? '');
  if (/^[=+\-@\t\r]/.test(str)) {
    str = `'${str}`;
  }
  return `"${str.replace(/"/g, '""')}"`;
}

/**
 * Validates emergency contact entries to prevent XSS (e.g., javascript: URLs) and malformed tel links.
 */
export function isSafeEmergencyContact(type: 'tel' | 'url', value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 300) return false;
  if (type === 'tel') {
    return /^[0-9+*#()\s-]{2,24}$/.test(trimmed);
  }
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

function isPrivateOrReservedIpv4(ip: string): boolean {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n) || n < 0 || n > 255)) {
    return true;
  }
  const [a, b] = parts;
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 169 && b === 254) return true; // Cloud metadata / link-local
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  if (a >= 224) return true; // Multicast / reserved
  return false;
}

function isPrivateOrReservedIpv6(ip: string): boolean {
  const normalized = ip.toLowerCase();
  if (normalized === '::1' || normalized === '::') return true;
  if (normalized.startsWith('fe80:') || normalized.startsWith('fc') || normalized.startsWith('fd')) {
    return true;
  }
  if (normalized.startsWith('::ffff:')) {
    const mapped = normalized.slice(7);
    if (net.isIPv4(mapped)) return isPrivateOrReservedIpv4(mapped);
  }
  return false;
}

/**
 * Synchronous syntactic SSRF check for webhook URL validation on save.
 */
export function validateWebhookUrl(rawUrl: string): { valid: boolean; reason?: string } {
  const trimmed = rawUrl.trim();
  if (!trimmed) return { valid: true };
  if (trimmed.length > 500) {
    return { valid: false, reason: 'La URL del webhook excede el límite permitido.' };
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { valid: false, reason: 'La URL del webhook no tiene un formato válido.' };
  }

  if (parsed.protocol !== 'https:') {
    return {
      valid: false,
      reason: 'El webhook de escalamiento debe usar protocolo HTTPS seguro.',
    };
  }

  if (parsed.username || parsed.password) {
    return {
      valid: false,
      reason: 'El webhook no puede incluir credenciales incrustadas en la URL.',
    };
  }

  const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    host.endsWith('.internal') ||
    host === 'metadata.google.internal'
  ) {
    return {
      valid: false,
      reason: 'No se permiten direcciones internas o locales para el webhook.',
    };
  }

  if (net.isIPv4(host) && isPrivateOrReservedIpv4(host)) {
    return {
      valid: false,
      reason: 'No se permiten direcciones IP privadas o reservadas para el webhook.',
    };
  }

  if (net.isIPv6(host) && isPrivateOrReservedIpv6(host)) {
    return {
      valid: false,
      reason: 'No se permiten direcciones IPv6 privadas o loopback para el webhook.',
    };
  }

  return { valid: true };
}

/**
 * Runtime DNS-resolving SSRF protection before dispatching outbound webhooks.
 */
export async function validateWebhookUrlWithDns(
  rawUrl: string
): Promise<{ valid: boolean; reason?: string }> {
  const baseCheck = validateWebhookUrl(rawUrl);
  if (!baseCheck.valid) return baseCheck;
  const trimmed = rawUrl.trim();
  if (!trimmed) return { valid: true };

  const parsed = new URL(trimmed);
  const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (net.isIP(host)) return baseCheck;

  try {
    const records = await dns.lookup(host, { all: true });
    if (records.length === 0) {
      return { valid: false, reason: 'No se pudo resolver el dominio del webhook.' };
    }
    for (const rec of records) {
      if (rec.family === 4 && isPrivateOrReservedIpv4(rec.address)) {
        return { valid: false, reason: 'El webhook resuelve a una IP interna bloqueada.' };
      }
      if (rec.family === 6 && isPrivateOrReservedIpv6(rec.address)) {
        return { valid: false, reason: 'El webhook resuelve a una IPv6 interna bloqueada.' };
      }
    }
    return { valid: true };
  } catch {
    return { valid: false, reason: 'Fallo al verificar la resolución DNS del webhook.' };
  }
}

export function signWebhookPayload(bodyJson: string, schoolId: string): string {
  const key = process.env.SESSION_SECRET || schoolId;
  return crypto.createHmac('sha256', key).update(bodyJson).digest('hex');
}

/**
 * Zero-PII HTTP security headers: prevents referrer leakage on quick-exit and restricts framing/MIME sniffing.
 */
export function applySecurityHeaders(_req: Request, res: Response, next: NextFunction) {
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Permissions-Policy', 'geolocation=(), camera=(), microphone=()');
  res.setHeader(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com data:",
      "img-src 'self' data: blob: https://i.ytimg.com",
      "frame-src 'self' https://www.youtube-nocookie.com https://youtube-nocookie.com",
      "connect-src 'self'",
      "object-src 'none'",
      "base-uri 'self'",
    ].join('; ')
  );
  next();
}

/**
 * Zero-PII ephemeral rate limiter: hashes source keys with a boot-only random salt
 * so raw IPs are never stored in files or exposed in logs.
 */
const EPHEMERAL_LIMITER_SALT = crypto.randomBytes(16).toString('hex');

interface RateBucket {
  count: number;
  resetAt: number;
}

export function createZeroPiiRateLimiter(options: {
  windowMs: number;
  maxAttempts: number;
  scope: string;
  extraKey?: (req: Request) => string;
  message?: string;
}) {
  const buckets = new Map<string, RateBucket>();

  // Periodic cleanup of expired buckets to keep memory bounded
  const cleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const [k, v] of buckets.entries()) {
      if (v.resetAt <= now) {
        buckets.delete(k);
      }
    }
  }, Math.max(options.windowMs, 60_000));
  cleanupTimer.unref?.();

  return (req: Request, res: Response, next: NextFunction) => {
    const rawIp = req.ip || req.socket.remoteAddress || 'unknown';
    const extra = options.extraKey ? options.extraKey(req) : '';
    const key = crypto
      .createHmac('sha256', EPHEMERAL_LIMITER_SALT)
      .update(`${options.scope}:${rawIp}:${extra}`)
      .digest('hex');

    const now = Date.now();
    const current = buckets.get(key);
    if (!current || current.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + options.windowMs });
      next();
      return;
    }

    if (current.count >= options.maxAttempts) {
      const retrySeconds = Math.max(1, Math.ceil((current.resetAt - now) / 1000));
      res.setHeader('Retry-After', String(retrySeconds));
      res.status(429).json({
        error:
          options.message ||
          `Demasiados intentos en poco tiempo. Por seguridad, espera ${retrySeconds} segundos.`,
      });
      return;
    }

    current.count += 1;
    next();
  };
}

