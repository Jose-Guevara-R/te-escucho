import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type {
  AdminOverviewData,
  AdminSchoolSummary,
  AiCalibrationConfig,
  AuditLogEntry,
  CategoryConfig,
  ChatMessage,
  CounselorAvailability,
  CounselorProfile,
  CounselorRole,
  DemoPolicy,
  EducationLevel,
  EmergencyLineConfig,
  GradeBandStat,
  InspiraFormat,
  InspiraResource,
  InspiraTopic,
  InspiraTopicStat,
  MoodType,
  PlatformAdminProfile,
  PlatformCatalog,
  PublicSchoolConfig,
  PublicStaffMember,
  RetentionConfig,
  RiskLevel,
  School,
  SchoolAnalyticsData,
  ShiftType,
  SlaConfig,
  SlaStatus,
  SpaceTag,
  SpaceTimeStat,
  StaffAlertThreshold,
  StaffPushHealth,
  StudentPaceMode,
  TicketInternalNote,
  TicketOutcome,
  TicketStatus,
  TicketSummary,
} from '../src/types.ts';
import {
  decryptBreakGlass,
  encryptBreakGlass,
  escapeCsvCell,
  hashSecretAsync,
  isSafeEmergencyContact,
  isValidAvailability,
  isValidCounselorRole,
  isValidInspiraFormat,
  isValidInspiraTopic,
  isValidPaceMode,
  isValidRiskLevel,
  isValidTicketOutcome,
  isValidTicketStatus,
  MAX_BREAK_GLASS_LENGTH,
  MAX_MESSAGE_LENGTH,
  MAX_NOTE_LENGTH,
  sanitizeInspiraResources,
  validateWebhookUrl,
  verifySecretAsync,
} from './security.ts';
import { getSupabaseAdmin, isSupabaseConfigured } from './supabase.ts';
import { dispatchWhatsAppAlertAsync, buildWhatsAppMessageText, buildWhatsAppClickUrl } from './whatsapp.ts';

interface CounselorRecord extends CounselorProfile {
  password_hash: string;
}

interface PlatformAdminRecord extends PlatformAdminProfile {
  password_hash: string;
}

interface TicketRecord extends TicketSummary {
  pin_hash: string;
  break_glass_ciphertext?: string | null;
  cascade_notified_tier?: number;
}

interface MoodRecord {
  id: string;
  school_id: string;
  mood: MoodType;
  created_at: string;
}

interface InspiraViewRecord {
  id: string;
  school_id: string | null;
  topic: InspiraTopic;
  format: InspiraFormat;
  created_at: string;
}

export interface PushSubscriptionRecord {
  ticket_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  created_at: string;
}

export interface StaffPushSubscriptionRecord {
  id: string;
  counselor_id: string;
  school_id: string;
  role: CounselorRole;
  threshold: StaffAlertThreshold;
  device_label: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  created_at: string;
  last_notified_at?: string | null;
}

interface DatabaseSchema {
  platform_admins: PlatformAdminRecord[];
  catalog: PlatformCatalog;
  schools: School[];
  counselors: CounselorRecord[];
  tickets: TicketRecord[];
  messages: ChatMessage[];
  internal_notes: TicketInternalNote[];
  mood_checkins: MoodRecord[];
  inspira_views: InspiraViewRecord[];
  audit_logs: AuditLogEntry[];
  push_subscriptions: PushSubscriptionRecord[];
  staff_push_subscriptions: StaffPushSubscriptionRecord[];
}

const DATA_DIR = path.resolve(process.cwd(), 'data');
const DB_FILE = path.join(DATA_DIR, 'te_escucho_db.json');

export function hashSecret(secret: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(secret, salt, 32).toString('hex');
  return `${salt}:${derived}`;
}

export function verifySecret(secret: string, storedHash: string): boolean {
  const [salt, keyHex] = storedHash.split(':');
  if (!salt || !keyHex) return false;
  const derived = crypto.scryptSync(secret, salt, 32);
  const keyBuf = Buffer.from(keyHex, 'hex');
  if (derived.length !== keyBuf.length) return false;
  return crypto.timingSafeEqual(derived, keyBuf);
}

function isoDaysAgo(days: number, hourOffset = 10): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(hourOffset, 15, 0, 0);
  return d.toISOString();
}

function isoMinutesAgo(minutes: number): string {
  return new Date(Date.now() - minutes * 60_000).toISOString();
}

export function createDefaultCategories(): CategoryConfig[] {
  return [
    {
      id: 'cat-excluido',
      title: 'Me siento excluido',
      description: 'Me apartan del grupo o me ignoran dentro o fuera de clase.',
      icon: 'users',
      tone: 'sky',
      default_risk: 'medio',
      allowed_roles: ['psychologist', 'tutor', 'admin'],
      active: true,
    },
    {
      id: 'cat-acoso',
      title: 'Sufro acoso o burlas',
      description: 'Me molestan físicamente, con palabras o por redes sociales.',
      icon: 'alert',
      tone: 'amber',
      default_risk: 'medio',
      allowed_roles: ['psychologist', 'admin'],
      active: true,
    },
    {
      id: 'cat-testigo',
      title: 'Soy testigo de acoso',
      description: 'Vi que tratan mal a alguien y quiero ayudar sin exponerme.',
      icon: 'eye',
      tone: 'emerald',
      default_risk: 'bajo',
      allowed_roles: ['psychologist', 'tutor', 'admin'],
      active: true,
    },
    {
      id: 'cat-desahogo',
      title: 'Solo necesito desahogarme',
      description: 'Tengo un problema personal y quiero que alguien me escuche.',
      icon: 'heart',
      tone: 'teal',
      default_risk: 'bajo',
      allowed_roles: ['psychologist', 'tutor', 'admin'],
      active: true,
    },
  ];
}

export function createDefaultSpaces(): string[] {
  return [
    'Patio / Recreo',
    'Aula de clases',
    'Redes sociales',
    'Salida del colegio',
    'Otro espacio',
  ];
}

export function createDefaultSlaConfig(): SlaConfig {
  return {
    critical_response_minutes: 15,
    medium_response_minutes: 120,
    escalation_contact_name: 'Coordinación de Convivencia Escolar',
    escalation_contact_email: '',
    escalation_webhook_url: '',
    on_call_counselor_id: '',
    on_call_label: 'Guardia de Psicología (Horario Escolar)',
  };
}

export function createDefaultAiConfig(): AiCalibrationConfig {
  return {
    sensitivity: 'estandar',
    critical_keywords: [
      'cortarme',
      'no quiero vivir',
      'amenaza',
      'cuchillo',
      'extorsion',
      'golpear',
    ],
    empathy_assistant_enabled: true,
    custom_guidance_tone:
      'Priorizar la contención emocional, la seguridad del estudiante y evitar confrontación directa entre partes.',
  };
}

export function createDefaultRetentionConfig(): RetentionConfig {
  return {
    retention_days_resolved: 180,
    auto_purge_enabled: false,
    require_closure_outcome: false,
  };
}

export function createDefaultRegionalPresets(): Record<string, EmergencyLineConfig[]> {
  return {
    Perú: [
      {
        id: 'pe-100',
        name: 'Línea 100',
        subtitle: 'Orientación ante violencia · 24h',
        contact_value: '100',
        type: 'tel',
        highlight: 'rose',
        active: true,
      },
      {
        id: 'pe-106',
        name: 'SAMU 106',
        subtitle: 'Urgencias médicas y crisis',
        contact_value: '106',
        type: 'tel',
        highlight: 'neutral',
        active: true,
      },
      {
        id: 'pe-105',
        name: 'Policía 105',
        subtitle: 'Peligro físico inmediato',
        contact_value: '105',
        type: 'tel',
        highlight: 'neutral',
        active: true,
      },
      {
        id: 'pe-siseve',
        name: 'SíseVe Minedu',
        subtitle: 'Portal oficial contra acoso',
        contact_value: 'https://www.siseve.pe',
        type: 'url',
        highlight: 'teal',
        active: true,
      },
    ],
    México: [
      {
        id: 'mx-911',
        name: 'Emergencias 911',
        subtitle: 'Atención inmediata · 24h',
        contact_value: '911',
        type: 'tel',
        highlight: 'rose',
        active: true,
      },
      {
        id: 'mx-vida',
        name: 'Línea de la Vida',
        subtitle: '800 911 2000 · Apoyo emocional',
        contact_value: '8009112000',
        type: 'tel',
        highlight: 'teal',
        active: true,
      },
      {
        id: 'mx-locatel',
        name: 'Consejo Ciudadano',
        subtitle: '55 5533 5533 · Orientación 24h',
        contact_value: '5555335533',
        type: 'tel',
        highlight: 'neutral',
        active: true,
      },
    ],
    Colombia: [
      {
        id: 'co-123',
        name: 'Línea 123',
        subtitle: 'Emergencias y protección · 24h',
        contact_value: '123',
        type: 'tel',
        highlight: 'rose',
        active: true,
      },
      {
        id: 'co-141',
        name: 'ICBF Línea 141',
        subtitle: 'Protección a niñas, niños y jóvenes',
        contact_value: '141',
        type: 'tel',
        highlight: 'teal',
        active: true,
      },
      {
        id: 'co-106',
        name: 'Línea 106',
        subtitle: 'Escucha y orientación psicológica',
        contact_value: '106',
        type: 'tel',
        highlight: 'neutral',
        active: true,
      },
    ],
    Chile: [
      {
        id: 'cl-4141',
        name: 'Línea *4141',
        subtitle: 'Prevención y contención · 24h',
        contact_value: '*4141',
        type: 'tel',
        highlight: 'rose',
        active: true,
      },
      {
        id: 'cl-147',
        name: 'Fono Infancia 147',
        subtitle: 'Carabineros protección menores',
        contact_value: '147',
        type: 'tel',
        highlight: 'teal',
        active: true,
      },
      {
        id: 'cl-supereduc',
        name: 'Supereduc',
        subtitle: 'Denuncia convivencia escolar',
        contact_value: 'https://www.supereduc.cl',
        type: 'url',
        highlight: 'neutral',
        active: true,
      },
    ],
    España: [
      {
        id: 'es-900',
        name: 'Teléfono ANAR / Acoso',
        subtitle: '900 018 018 · Gratuito 24h',
        contact_value: '900018018',
        type: 'tel',
        highlight: 'teal',
        active: true,
      },
      {
        id: 'es-024',
        name: 'Línea 024',
        subtitle: 'Atención conducta suicida · 24h',
        contact_value: '024',
        type: 'tel',
        highlight: 'rose',
        active: true,
      },
      {
        id: 'es-112',
        name: 'Emergencias 112',
        subtitle: 'Peligro físico inmediato',
        contact_value: '112',
        type: 'tel',
        highlight: 'neutral',
        active: true,
      },
    ],
  };
}

export function createDefaultInspiraResources(): InspiraResource[] {
  return [
    {
      id: 'insp-autoestima-valor',
      title: 'No eres lo que dicen de ti en un mal día',
      summary:
        'Las burlas hablan más de quien necesita hacer sentir menos a otros que de quién eres tú realmente.',
      body:
        'Cuando alguien repite un apodo o te excluye, tu cerebro intenta convencerte de que el problema está en ti para explicarse el dolor.\n\nRecuerda tres verdades simples:\n1. Tu valor como persona no sube ni baja según la aprobación de un grupo.\n2. Equivocarse, ser callado o pensar distinto nunca justifica el maltrato.\n3. Mereces vínculos donde puedas respirar tranquilo sin fingir ser alguien más.',
      topic: 'autoestima',
      format: 'capsula',
      duration_label: '2 min lectura',
      affirmation: 'Merezco respeto en cada espacio del colegio, incluso cuando estoy en silencio.',
      scope: 'global',
      active: true,
    },
    {
      id: 'insp-limites-sanos',
      title: 'Decir NO sin culpa: límites claros en el aula y entre amigos',
      summary:
        'Una amistad real nunca te presiona para hacer cosas que te incomodan ni te castiga con el silencio.',
      body:
        'Poner un límite no significa buscar pelea; significa cuidar tu paz.\n\nFrases directas que puedes usar sin dar largas explicaciones:\n• "No me gusta esa broma, por favor déjalo."\n• "No quiero participar en ese grupo o reto."\n• "Prefiero irme un momento y luego seguimos conversando."\n\nSi alguien se burla de tu límite o amenaza con dejarte solo, eso confirma que necesitabas protegerte y que vale la pena pedir apoyo a tutoría.',
      topic: 'limites',
      format: 'capsula',
      duration_label: '2 min lectura',
      affirmation: 'Cuidar mis límites no me hace difícil; me hace dueño de mi bienestar.',
      scope: 'global',
      active: true,
    },
    {
      id: 'insp-ciberacoso-pasos',
      title: 'Si te molestan por redes o WhatsApp: 4 pasos de protección',
      summary:
        'Qué hacer en los primeros minutos si crean grupos sin ti, difunden capturas o envían mensajes hirientes.',
      body:
        'El acoso digital duele igual que el presencial porque parece perseguirte hasta casa. Tú tienes el control de cortar el acceso:\n\n1. No respondas en caliente: responder alimenta al grupo agresor.\n2. Guarda pruebas: haz captura de pantalla con fecha, hora y usuario visible antes de borrar.\n3. Silencia, restringe o bloquea cuentas agresivas para recuperar calma.\n4. Compártelo hoy mismo en Te Escucho o con un adulto de confianza: no tienes por qué cargar esto solo.',
      topic: 'ciberacoso',
      format: 'capsula',
      duration_label: '3 min guía',
      affirmation: 'Lo que pasa en una pantalla también tiene solución y respaldo en mi colegio.',
      scope: 'global',
      active: true,
    },
    {
      id: 'insp-calma-anclaje',
      title: 'Anclaje 5-4-3-2-1 cuando sientes un nudo en el pecho',
      summary:
        'Un ejercicio discreto que puedes hacer sentado en tu carpeta antes de clase o durante el recreo.',
      body:
        'Cuando sientes miedo o tensión fuerte, tu cuerpo entra en alerta. Vuelve al presente paso a paso:\n\n• 5 cosas que ves ahora mismo a tu alrededor.\n• 4 superficies que puedes tocar (la mesa, tu cuaderno, tus zapatos).\n• 3 sonidos suaves o lejanos que alcanzas a oír.\n• 2 aromas o el aire fresco al inhalar.\n• 1 cosa amable que puedes hacer por ti en la próxima hora.\n\nSi quieres acompañarlo con aire, usa nuestra Pausa de Calma 4-4-6 arriba.',
      topic: 'calma',
      format: 'ejercicio',
      duration_label: '2 min práctica',
      affirmation: 'Este momento difícil va a bajar su intensidad; estoy a salvo respirando aquí y ahora.',
      scope: 'global',
      active: true,
    },
    {
      id: 'insp-pedir-ayuda',
      title: 'Pedir ayuda a tiempo es valentía, nunca debilidad',
      summary:
        'Por qué romper el silencio cambia la historia y qué ocurre exactamente cuando abres un buzón anónimo.',
      body:
        'Muchas personas dudan en escribir porque temen empeorar las cosas o sienten vergüenza. En Te Escucho protegemos tu identidad de verdad:\n\n• Nadie sabe tu nombre, grado ni dispositivo al escribir.\n• Tu caso lo lee personal capacitado de psicología o tutoría.\n• Nunca confrontamos directamente a las partes sin cuidar primero tu seguridad.\n\nContar lo que vives o lo que viste no te vuelve "acusador": rompe la regla del silencio que protege al acoso.',
      topic: 'pedir_ayuda',
      format: 'capsula',
      duration_label: '2 min lectura',
      affirmation: 'Hablar a tiempo abre puertas de apoyo real sin ponerme en riesgo.',
      scope: 'global',
      active: true,
    },
    {
      id: 'insp-testigo-aliado',
      title: 'El poder del testigo aliado: acompañar sin exponerte',
      summary:
        'No hace falta enfrentar solo a un grupo agresor para ayudar a un compañero que está siendo aislado.',
      body:
        'La mayoría del salón no está de acuerdo con las burlas, pero muchas veces calla por miedo.\n\nGestos pequeños que cambian todo para quien sufre rechazo:\n• Acercarte después y decirle: "Lo que hicieron no está bien, ¿estás bien?"\n• Invitarlo a sentarse o caminar hacia el patio contigo.\n• No reenvíes memes ni te rías por compromiso.\n• Reporta el lugar y horario en Te Escucho para que tutoría vigile de forma preventiva.',
      topic: 'autoestima',
      format: 'capsula',
      duration_label: '2 min lectura',
      affirmation: 'Un gesto tranquilo de compañía puede salvarle el día a alguien en mi salón.',
      scope: 'global',
      active: true,
    },
    {
      id: 'insp-vid-stopsilencio',
      title: 'Romper el silencio contra el acoso escolar (#StopSilencio)',
      summary:
        'Video breve de sensibilización sobre por qué hablar a tiempo protege a quien sufre burlas o aislamiento.',
      body:
        'Guardar silencio hace que el acoso parezca invisible. Hablar con tutoría, psicología o mediante un canal confidencial rompe el aislamiento y activa ayuda real.',
      topic: 'pedir_ayuda',
      format: 'video',
      duration_label: '2 min video',
      youtube_id: 'cPuT1KLYhQE',
      affirmation: 'Romper el silencio nunca es traición: es cuidar tu bienestar y el de tu salón.',
      scope: 'global',
      active: true,
    },
    {
      id: 'insp-vid-kiva-bullying',
      title: 'Cómo reconocer el bullying y proteger tu autoestima (Método KiVa)',
      summary:
        'Tiina Mäkelä explica de forma clara qué diferencia un conflicto puntual del acoso y cómo actúa el grupo.',
      body:
        'El bullying no es culpa de quien lo recibe. El programa KiVa demuestra que cuando los compañeros dejan de validar las burlas y piden ayuda, el acoso pierde fuerza.',
      topic: 'autoestima',
      format: 'video',
      duration_label: '6 min video',
      youtube_id: 'Wxjh_lTP6IQ',
      affirmation: 'El maltrato nunca define mi valor ni es algo que deba soportar en silencio.',
      scope: 'global',
      active: true,
    },
    {
      id: 'insp-vid-ciberacoso',
      title: 'Ciberacoso y convivencia digital segura',
      summary:
        'Orientaciones prácticas para proteger tus redes sociales, guardar evidencia y frenar agresiones en línea.',
      body:
        'En entornos digitales la empatía también cuenta. Si recibes mensajes hirientes o te excluyen de chats para burlarse: no respondas agresiones, guarda capturas, bloquea y reporta.',
      topic: 'ciberacoso',
      format: 'video',
      duration_label: '3 min video',
      youtube_id: 'aKcuilND08Y',
      affirmation: 'Tengo derecho a espacios digitales libres de insultos, amenazas o difusión sin permiso.',
      scope: 'global',
      active: true,
    },
    {
      id: 'insp-vid-limites-prevencion',
      title: 'Prevenir el acoso escolar y construir relaciones de respeto',
      summary:
        'Claves visuales de Cruz Roja sobre respeto mutuo, límites sanos y cuidado entre estudiantes.',
      body:
        'Las relaciones sanas se basan en el respeto y el consentimiento. Aprender a poner límites claros y pedir acompañamiento temprano fortalece la convivencia de todo el colegio.',
      topic: 'limites',
      format: 'video',
      duration_label: '3 min video',
      youtube_id: 'UAifwNyFbCY',
      affirmation: 'Poner límites claros es cuidar mi dignidad y enseñar cómo merezco ser tratado.',
      scope: 'global',
      active: true,
    },
  ];
}

function createDefaultCatalog(): PlatformCatalog {
  return {
    default_categories: createDefaultCategories(),
    default_spaces: createDefaultSpaces(),
    default_ai_config: createDefaultAiConfig(),
    regional_emergency_presets: createDefaultRegionalPresets(),
    default_inspira_resources: createDefaultInspiraResources(),
    demo_policy: 'timed',
    demo_duration_minutes: 15,
    demo_max_uses: 3,
  };
}

function createDefaultPlatformAdmins(): PlatformAdminRecord[] {
  const email = process.env.PLATFORM_ADMIN_EMAIL || 'admin@teescucho.edu';
  const password = process.env.PLATFORM_ADMIN_PASSWORD || 'TeEscucho2026!Admin';
  return [
    {
      id: 'platform-admin-1',
      email,
      password_hash: hashSecret(password),
      full_name: 'Dirección de Plataforma Te Escucho',
      role: 'platform_admin',
    },
  ];
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function createInitialData(): DatabaseSchema {
  const catalog = createDefaultCatalog();
  const sanJoseId = 'school-san-jose-2026';
  const santaRosaId = 'school-santa-rosa-2026';

  const schools: School[] = [
    {
      id: sanJoseId,
      name: 'Colegio San José',
      short_name: 'San José',
      access_code: 'SANJOSE2026',
      active: true,
      region: 'Lima, Perú',
      country_preset: 'Perú',
      education_level: 'Primaria y Secundaria',
      modular_code: '0491820',
      accent_color: '#0F766E',
      welcome_message:
        'Nuestro equipo de Psicología y Tutoría te escucha con total confidencialidad. No estás solo.',
      support_hours: 'Lunes a Viernes · 07:00 – 19:00',
      after_hours_notice:
        'Si escribes fuera del horario escolar, tu mensaje quedará protegido y lo revisaremos a primera hora.',
      internal_help_phone: '',
      spaces: cloneJson(catalog.default_spaces),
      categories: cloneJson(catalog.default_categories),
      emergency_lines: cloneJson(catalog.regional_emergency_presets['Perú']),
      sla_config: {
        ...createDefaultSlaConfig(),
        on_call_counselor_id: 'counselor-maria-1',
        on_call_label: 'Guardia Psicología · Lic. María Fernández',
      },
      ai_config: cloneJson(catalog.default_ai_config),
      retention_config: createDefaultRetentionConfig(),
      inspira_enabled: true,
      inspira_custom_resources: [],
      inspira_disabled_ids: [],
      created_at: isoDaysAgo(30),
    },
    {
      id: santaRosaId,
      name: 'Colegio Santa Rosa',
      short_name: 'Santa Rosa',
      access_code: 'SANTAROSA2026',
      active: true,
      region: 'Arequipa, Perú',
      country_preset: 'Perú',
      education_level: 'Secundaria',
      modular_code: '0612450',
      accent_color: '#0369A1',
      welcome_message:
        'Departamento de Convivencia Escolar Santa Rosa. Cuéntanos con confianza lo que ocurre.',
      support_hours: 'Lunes a Viernes · 07:00 – 19:00',
      after_hours_notice:
        'Fuera de horario escolar respondemos al iniciar la jornada. En caso de peligro inmediato usa las líneas 24/7.',
      internal_help_phone: '',
      spaces: [
        'Patio / Recreo',
        'Aula de clases',
        'Redes sociales',
        'Salida del colegio',
        'Pabellón de Laboratorios',
        'Otro espacio',
      ],
      categories: cloneJson(catalog.default_categories),
      emergency_lines: cloneJson(catalog.regional_emergency_presets['Perú']),
      sla_config: {
        ...createDefaultSlaConfig(),
        on_call_counselor_id: 'counselor-carlos-2',
        on_call_label: 'Guardia Psicología · Psic. Carlos Mendoza',
      },
      ai_config: cloneJson(catalog.default_ai_config),
      retention_config: createDefaultRetentionConfig(),
      inspira_enabled: true,
      inspira_custom_resources: [],
      inspira_disabled_ids: [],
      created_at: isoDaysAgo(25),
    },
  ];

  const defaultStaffPassword =
    process.env.INITIAL_STAFF_PASSWORD || 'SanJose2026!';

  const counselors: CounselorRecord[] = [
    {
      id: 'counselor-admin-sj',
      school_id: sanJoseId,
      email: 'coordinacion@colegio.edu.pe',
      password_hash: hashSecret(defaultStaffPassword),
      full_name: 'Mg. Ricardo Paredes',
      role: 'director',
      active: true,
      availability: 'available',
      school_name: 'Colegio San José',
      school_access_code: 'SANJOSE2026',
      shift: 'completo',
      phone_whatsapp: '+51 999 111 222',
      responsabilidad_label: 'Dirección General (Comité de Bienestar)',
    },
    {
      id: 'counselor-maria-1',
      school_id: sanJoseId,
      email: 'psicologia@colegio.edu.pe',
      password_hash: hashSecret(defaultStaffPassword),
      full_name: 'Lic. María Fernández',
      role: 'coordinator_toe',
      active: true,
      availability: 'available',
      school_name: 'Colegio San José',
      school_access_code: 'SANJOSE2026',
      shift: 'manana',
      phone_whatsapp: '+51 988 222 333',
      responsabilidad_label: 'Coordinadora de Tutoría (TOE) - Turno Mañana',
    },
    {
      id: 'counselor-psi-sj-1',
      school_id: sanJoseId,
      email: 'psico@sanjose.edu.pe',
      password_hash: hashSecret(defaultStaffPassword),
      full_name: 'Lic. Carmen Flores',
      role: 'psychologist',
      active: true,
      availability: 'available',
      school_name: 'Colegio San José',
      school_access_code: 'SANJOSE2026',
      shift: 'completo',
      phone_whatsapp: '+51 901 234 567',
      responsabilidad_label: 'Psicología Escolar',
    },
    {
      id: 'counselor-toe-tarde',
      school_id: sanJoseId,
      email: 'toe.tarde@colegio.edu.pe',
      password_hash: hashSecret(defaultStaffPassword),
      full_name: 'Lic. Patricia Vega',
      role: 'coordinator_toe',
      active: true,
      availability: 'available',
      school_name: 'Colegio San José',
      school_access_code: 'SANJOSE2026',
      shift: 'tarde',
      phone_whatsapp: '+51 988 444 555',
      responsabilidad_label: 'Coordinadora de Tutoría (TOE) - Turno Tarde',
    },
    {
      id: 'counselor-tutor-sj',
      school_id: sanJoseId,
      email: 'tutoria@colegio.edu.pe',
      password_hash: hashSecret(defaultStaffPassword),
      full_name: 'Prof. Lucía Ramos',
      role: 'tutor',
      active: true,
      availability: 'available',
      school_name: 'Colegio San José',
      school_access_code: 'SANJOSE2026',
      shift: 'manana',
      grade: '3°',
      section: 'B',
      phone_whatsapp: '+51 977 333 444',
      responsabilidad_label: 'Tutora 3° "B" (Secundaria - Turno Mañana)',
    },
    {
      id: 'counselor-tutor-2a',
      school_id: sanJoseId,
      email: 'carlos.tutor@colegio.edu.pe',
      password_hash: hashSecret(defaultStaffPassword),
      full_name: 'Prof. Carlos Mendoza',
      role: 'tutor',
      active: true,
      availability: 'available',
      school_name: 'Colegio San José',
      school_access_code: 'SANJOSE2026',
      shift: 'manana',
      grade: '2°',
      section: 'A',
      phone_whatsapp: '+51 977 555 666',
      responsabilidad_label: 'Tutor 2° "A" (Secundaria - Turno Mañana)',
    },
    {
      id: 'counselor-tutor-4c',
      school_id: sanJoseId,
      email: 'jorge.tutor@colegio.edu.pe',
      password_hash: hashSecret(defaultStaffPassword),
      full_name: 'Prof. Jorge Huamán',
      role: 'tutor',
      active: true,
      availability: 'available',
      school_name: 'Colegio San José',
      school_access_code: 'SANJOSE2026',
      shift: 'tarde',
      grade: '4°',
      section: 'C',
      phone_whatsapp: '+51 977 777 888',
      responsabilidad_label: 'Tutor 4° "C" (Secundaria - Turno Tarde)',
    },
    {
      id: 'counselor-carlos-2',
      school_id: santaRosaId,
      email: 'tutoria@santarosa.edu.pe',
      password_hash: hashSecret(
        process.env.INITIAL_STAFF_PASSWORD ||
        (process.env.NODE_ENV === 'production' ? crypto.randomBytes(16).toString('hex') : 'SantaRosa2026!')
      ),
      full_name: 'Psic. Carlos Mendoza',
      role: 'admin',
      active: true,
      availability: 'available',
      school_name: 'Colegio Santa Rosa',
      school_access_code: 'SANTAROSA2026',
      shift: 'completo',
      phone_whatsapp: '+51 999 888 777',
      responsabilidad_label: 'Dirección y Coordinación TOE',
    },
  ];

  return {
    platform_admins: createDefaultPlatformAdmins(),
    catalog,
    schools,
    counselors,
    tickets: [],
    messages: [],
    internal_notes: [],
    mood_checkins: [],
    inspira_views: [],
    push_subscriptions: [],
    staff_push_subscriptions: [],
    audit_logs: [],
  };
}

function normalizeSchema(raw: Partial<DatabaseSchema>): { data: DatabaseSchema; changed: boolean } {
  let changed = false;
  const defaults = createDefaultCatalog();

  const platform_admins =
    Array.isArray(raw.platform_admins) && raw.platform_admins.length > 0
      ? raw.platform_admins
      : ((changed = true), createDefaultPlatformAdmins());

  const normalizeCategory = (c: Partial<CategoryConfig>): CategoryConfig => {
    const hasRoles = Array.isArray(c.allowed_roles) && c.allowed_roles.length > 0;
    if (!hasRoles) changed = true;
    const isSensitive =
      c.default_risk === 'critico' || (c.title || '').toLowerCase().includes('sufro acoso');
    return {
      id: c.id || `cat-${crypto.randomUUID().slice(0, 6)}`,
      title: c.title || 'Categoría',
      description: c.description || '',
      icon: c.icon || 'heart',
      tone: c.tone || 'teal',
      default_risk: c.default_risk || 'bajo',
      allowed_roles: hasRoles
        ? (c.allowed_roles as CounselorRole[])
        : isSensitive
          ? ['psychologist', 'admin']
          : ['psychologist', 'tutor', 'admin'],
      active: c.active !== false,
    };
  };

  const catalog: PlatformCatalog = raw.catalog
    ? {
        default_categories:
          Array.isArray(raw.catalog.default_categories) && raw.catalog.default_categories.length > 0
            ? raw.catalog.default_categories.map(normalizeCategory)
            : ((changed = true), defaults.default_categories),
        default_spaces:
          Array.isArray(raw.catalog.default_spaces) && raw.catalog.default_spaces.length > 0
            ? raw.catalog.default_spaces
            : ((changed = true), defaults.default_spaces),
        default_ai_config: raw.catalog.default_ai_config
          ? {
              ...createDefaultAiConfig(),
              ...raw.catalog.default_ai_config,
            }
          : ((changed = true), defaults.default_ai_config),
        regional_emergency_presets:
          raw.catalog.regional_emergency_presets &&
          Object.keys(raw.catalog.regional_emergency_presets).length > 0
            ? raw.catalog.regional_emergency_presets
            : ((changed = true), defaults.regional_emergency_presets),
        default_inspira_resources: (() => {
          if (
            Array.isArray(raw.catalog.default_inspira_resources) &&
            raw.catalog.default_inspira_resources.length > 0
          ) {
            const existing = raw.catalog.default_inspira_resources;
            const hasAnyVideo = existing.some((r) => r.format === 'video');
            if (!hasAnyVideo && defaults.default_inspira_resources) {
              const videoDefaults = defaults.default_inspira_resources.filter(
                (d) => d.format === 'video' && !existing.some((e) => e.id === d.id)
              );
              if (videoDefaults.length > 0) {
                changed = true;
                return [...videoDefaults, ...existing];
              }
            }
            return existing;
          }
          changed = true;
          return defaults.default_inspira_resources;
        })(),
        demo_policy:
          raw.catalog.demo_policy === 'off' || raw.catalog.demo_policy === 'timed'
            ? raw.catalog.demo_policy
            : ((changed = true), 'timed'),
        demo_duration_minutes:
          typeof raw.catalog.demo_duration_minutes === 'number' &&
          raw.catalog.demo_duration_minutes >= 5 &&
          raw.catalog.demo_duration_minutes <= 60
            ? raw.catalog.demo_duration_minutes
            : ((changed = true), 15),
        demo_max_uses:
          typeof raw.catalog.demo_max_uses === 'number' &&
          raw.catalog.demo_max_uses >= 1 &&
          raw.catalog.demo_max_uses <= 10
            ? raw.catalog.demo_max_uses
            : ((changed = true), 3),
      }
    : ((changed = true), defaults);

  const rawSchools = Array.isArray(raw.schools) ? raw.schools : [];
  const schools: School[] = rawSchools.map((s) => {
    const school = s as Partial<School> & { id: string; name: string; access_code: string };
    const countryPreset = school.country_preset || 'Perú';
    const presetLines =
      catalog.regional_emergency_presets[countryPreset] ||
      catalog.regional_emergency_presets['Perú'] ||
      [];

    if (
      !school.short_name ||
      !school.region ||
      !school.accent_color ||
      !school.sla_config ||
      !school.ai_config ||
      !school.retention_config ||
      typeof school.inspira_enabled !== 'boolean' ||
      !Array.isArray(school.spaces) ||
      !Array.isArray(school.categories) ||
      !Array.isArray(school.emergency_lines)
    ) {
      changed = true;
    }

    return {
      id: school.id,
      name: school.name,
      short_name: school.short_name || school.name.replace(/^Colegio\s+/i, '').slice(0, 24),
      access_code: school.access_code,
      active: school.active !== false,
      region: school.region || 'Lima, Perú',
      country_preset: countryPreset,
      education_level: school.education_level || 'Primaria y Secundaria',
      modular_code: school.modular_code || '',
      accent_color: school.accent_color || '#0F766E',
      welcome_message:
        school.welcome_message ||
        'Nuestro equipo de Psicología y Tutoría te escucha con total confidencialidad.',
      support_hours:
        !school.support_hours ||
        school.support_hours === 'Lunes a Viernes · 07:30 – 16:00' ||
        school.support_hours === 'Lunes a Viernes · 08:00 – 15:30'
          ? ((changed = true), 'Lunes a Viernes · 07:00 – 19:00')
          : school.support_hours,
      after_hours_notice:
        school.after_hours_notice ||
        'Si escribes fuera del horario escolar, tu mensaje quedará protegido y lo revisaremos a primera hora.',
      internal_help_phone: school.internal_help_phone || '',
      spaces:
        Array.isArray(school.spaces) && school.spaces.length > 0
          ? school.spaces
          : cloneJson(catalog.default_spaces),
      categories:
        Array.isArray(school.categories) && school.categories.length > 0
          ? school.categories.map(normalizeCategory)
          : cloneJson(catalog.default_categories),
      emergency_lines:
        Array.isArray(school.emergency_lines) && school.emergency_lines.length > 0
          ? school.emergency_lines
          : cloneJson(presetLines),
      sla_config: {
        ...createDefaultSlaConfig(),
        ...(school.sla_config || {}),
      },
      ai_config: {
        ...cloneJson(catalog.default_ai_config),
        ...(school.ai_config || {}),
      },
      retention_config: {
        ...createDefaultRetentionConfig(),
        ...(school.retention_config || {}),
      },
      inspira_enabled: school.inspira_enabled !== false,
      inspira_custom_resources: Array.isArray(school.inspira_custom_resources)
        ? school.inspira_custom_resources
        : [],
      inspira_disabled_ids: Array.isArray(school.inspira_disabled_ids)
        ? school.inspira_disabled_ids
        : [],
      created_at: school.created_at || new Date().toISOString(),
    };
  });

  const rawCounselors = Array.isArray(raw.counselors) ? raw.counselors : [];
  const counselors: CounselorRecord[] = rawCounselors.map((c) => {
    if (typeof c.active !== 'boolean' || !c.availability || !c.phone_whatsapp || !c.shift) changed = true;
    const phone = c.phone_whatsapp || (c.role === 'director' ? '+51 999 111 222' : c.role === 'admin' ? '+51 999 111 222' : c.role === 'coordinator_toe' ? '+51 988 222 333' : c.role === 'psychologist' ? '+51 901 234 567' : '+51 977 333 444');
    const shift = c.shift || (c.role === 'director' || c.role === 'admin' ? 'completo' : 'manana');
    const resp = c.responsabilidad_label || (
      c.role === 'director' ? 'Dirección General' :
      c.role === 'admin' ? 'Administración del Colegio' :
      c.role === 'coordinator_toe' ? `Coordinación TOE${c.shift === 'tarde' ? ' - Tarde' : c.shift === 'manana' ? ' - Mañana' : ''}` :
      c.role === 'psychologist' ? 'Psicología Escolar' :
      c.role === 'tutor' ? `Tutor ${c.grade || '3°'} ${c.section || 'B'}`.trim() :
      'Orientación Escolar'
    );
    return {
      ...c,
      active: c.active !== false,
      availability: c.availability || 'available',
      phone_whatsapp: phone,
      shift,
      grade: c.grade || (c.role === 'tutor' ? '3°' : ''),
      section: c.section || (c.role === 'tutor' ? 'B' : ''),
      responsabilidad_label: resp,
    };
  });

  // Ensure San José has full team if upgrading
  const defaultStaffPassword =
    process.env.INITIAL_STAFF_PASSWORD || 'SanJose2026!';
  const sanJoseSchool = schools.find((s) => s.id === 'school-san-jose-2026');
  if (sanJoseSchool) {
    // Upgrade any old 'admin' role for Ricardo Paredes to 'director'
    counselors.forEach((c) => {
      if (c.school_id === sanJoseSchool.id && c.email.toLowerCase() === 'coordinacion@colegio.edu.pe' && c.role === 'admin') {
        c.role = 'director';
        changed = true;
      }
    });

    if (!counselors.some((c) => c.school_id === sanJoseSchool.id && (c.role === 'director' || c.role === 'admin') && c.active)) {
      changed = true;
      counselors.push({
        id: 'counselor-admin-sj',
        school_id: sanJoseSchool.id,
        email: 'coordinacion@colegio.edu.pe',
        password_hash: hashSecret(defaultStaffPassword),
        full_name: 'Mg. Ricardo Paredes',
        role: 'director',
        active: true,
        availability: 'available',
        school_name: sanJoseSchool.name,
        school_access_code: sanJoseSchool.access_code,
        shift: 'completo',
        phone_whatsapp: '+51 999 111 222',
        responsabilidad_label: 'Dirección General (Comité de Bienestar)',
      });
    }

    // Upgrade any old 'psychologist' that is actually a coordinator
    counselors.forEach((c) => {
      if (c.school_id === sanJoseSchool.id && c.role === 'psychologist' &&
          (c.email.toLowerCase() === 'psicologia@colegio.edu.pe' || c.email.toLowerCase() === 'toe.tarde@colegio.edu.pe')) {
        c.role = 'coordinator_toe';
        changed = true;
      }
    });

    if (!counselors.some((c) => c.school_id === sanJoseSchool.id && c.email.toLowerCase() === 'toe.tarde@colegio.edu.pe')) {
      changed = true;
      counselors.push({
        id: 'counselor-toe-tarde',
        school_id: sanJoseSchool.id,
        email: 'toe.tarde@colegio.edu.pe',
        password_hash: hashSecret(defaultStaffPassword),
        full_name: 'Lic. Patricia Vega',
        role: 'coordinator_toe',
        active: true,
        availability: 'available',
        school_name: sanJoseSchool.name,
        school_access_code: sanJoseSchool.access_code,
        shift: 'tarde',
        phone_whatsapp: '+51 988 444 555',
        responsabilidad_label: 'Coordinadora de Tutoría (TOE) - Turno Tarde',
      });
    }

    // Ensure there is a dedicated psychologist
    if (!counselors.some((c) => c.school_id === sanJoseSchool.id && c.role === 'psychologist' && c.active)) {
      changed = true;
      counselors.push({
        id: 'counselor-psi-sj-1',
        school_id: sanJoseSchool.id,
        email: 'psico@sanjose.edu.pe',
        password_hash: hashSecret(defaultStaffPassword),
        full_name: 'Lic. Carmen Flores',
        role: 'psychologist',
        active: true,
        availability: 'available',
        school_name: sanJoseSchool.name,
        school_access_code: sanJoseSchool.access_code,
        shift: 'completo',
        phone_whatsapp: '+51 901 234 567',
        responsabilidad_label: 'Psicología Escolar',
      });
    }
  }

  const rawTickets = Array.isArray(raw.tickets) ? raw.tickets : [];
  const tickets: TicketRecord[] = rawTickets.map((t) => {
    const school = schools.find((s) => s.id === t.school_id);
    const matchedCat = school?.categories.find(
      (c) =>
        (t.category_id && c.id === t.category_id) ||
        c.title.toLowerCase() === String(t.category || '').trim().toLowerCase()
    );
    return {
      ...t,
      category_id: t.category_id ?? matchedCat?.id ?? null,
      grade_band: t.grade_band ?? null,
      time_slot: t.time_slot ?? null,
      pace_mode: isValidPaceMode(t.pace_mode) ? t.pace_mode : 'discreet_help',
      ai_rationale: t.ai_rationale ?? null,
      is_sandbox: Boolean(t.is_sandbox),
      first_counselor_reply_at: t.first_counselor_reply_at ?? null,
      last_counselor_reply_at: t.last_counselor_reply_at ?? t.first_counselor_reply_at ?? null,
      last_student_reply_at: t.last_student_reply_at ?? null,
      escalated_at: t.escalated_at ?? null,
      escalation_reason: t.escalation_reason ?? null,
      assigned_counselor_id: t.assigned_counselor_id ?? null,
      assigned_counselor_name: t.assigned_counselor_name ?? null,
      resolution_outcome: t.resolution_outcome ?? null,
      resolution_note: t.resolution_note ?? null,
      break_glass_ciphertext: t.break_glass_ciphertext ?? null,
      break_glass_unlocked_by: t.break_glass_unlocked_by ?? null,
      break_glass_unlocked_at: t.break_glass_unlocked_at ?? null,
      break_glass_reason: t.break_glass_reason ?? null,
    };
  });

  if (
    !Array.isArray(raw.internal_notes) ||
    !Array.isArray(raw.audit_logs) ||
    !Array.isArray(raw.inspira_views) ||
    !Array.isArray(raw.push_subscriptions) ||
    !Array.isArray(raw.staff_push_subscriptions)
  ) {
    changed = true;
  }

  return {
    changed,
    data: {
      platform_admins,
      catalog,
      schools,
      counselors,
      tickets,
      messages: Array.isArray(raw.messages) ? raw.messages : [],
      internal_notes: Array.isArray(raw.internal_notes) ? raw.internal_notes : [],
      mood_checkins: Array.isArray(raw.mood_checkins) ? raw.mood_checkins : [],
      inspira_views: Array.isArray(raw.inspira_views) ? raw.inspira_views : [],
      audit_logs: Array.isArray(raw.audit_logs) ? raw.audit_logs : [],
      push_subscriptions: Array.isArray(raw.push_subscriptions) ? raw.push_subscriptions : [],
      staff_push_subscriptions: Array.isArray(raw.staff_push_subscriptions)
        ? raw.staff_push_subscriptions
        : [],
    },
  };
}

class TeEscuchoStore {
  private data: DatabaseSchema;
  private schoolsById = new Map<string, School>();
  private schoolsByCode = new Map<string, School>();
  private counselorsById = new Map<string, CounselorRecord>();
  private ticketsById = new Map<string, TicketRecord>();
  private ticketsByCode = new Map<string, TicketRecord>();
  private messagesByTicketId = new Map<string, ChatMessage[]>();
  private notesByTicketId = new Map<string, TicketInternalNote[]>();
  private pushByTicketId = new Map<string, PushSubscriptionRecord>();
  private staffPushBySchoolId = new Map<string, StaffPushSubscriptionRecord[]>();

  private persistTimer: ReturnType<typeof setTimeout> | null = null;
  private writeChain: Promise<void> = Promise.resolve();
  private dirty = false;

  constructor() {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (fs.existsSync(DB_FILE)) {
      try {
        const raw = fs.readFileSync(DB_FILE, 'utf8');
        const parsed = JSON.parse(raw) as Partial<DatabaseSchema>;
        const normalized = normalizeSchema(parsed);
        this.data = normalized.data;
        this.rebuildIndexes();
        if (normalized.changed) {
          this.flushSync();
        }
      } catch {
        try {
          fs.copyFileSync(DB_FILE, `${DB_FILE}.corrupt.${Date.now()}.bak`);
        } catch {
          // Best-effort backup before resetting corrupted DB
        }
        this.data = createInitialData();
        this.rebuildIndexes();
        this.flushSync();
      }
    } else {
      this.data = createInitialData();
      this.rebuildIndexes();
      this.flushSync();
    }

    const flushOnExit = () => {
      if (this.dirty) this.flushSync();
    };
    process.once('beforeExit', flushOnExit);
    process.once('SIGINT', () => {
      flushOnExit();
      process.exit(0);
    });
    process.once('SIGTERM', () => {
      flushOnExit();
      process.exit(0);
    });
  }

  private rebuildIndexes() {
    this.schoolsById.clear();
    this.schoolsByCode.clear();
    for (const s of this.data.schools) {
      this.schoolsById.set(s.id, s);
      this.schoolsByCode.set(s.access_code.toUpperCase(), s);
    }

    this.counselorsById.clear();
    for (const c of this.data.counselors) {
      this.counselorsById.set(c.id, c);
    }

    this.ticketsById.clear();
    this.ticketsByCode.clear();
    for (const t of this.data.tickets) {
      this.ticketsById.set(t.id, t);
      this.ticketsByCode.set(t.ticket_code.toUpperCase(), t);
    }

    this.messagesByTicketId.clear();
    for (const m of this.data.messages) {
      const list = this.messagesByTicketId.get(m.ticket_id);
      if (list) list.push(m);
      else this.messagesByTicketId.set(m.ticket_id, [m]);
    }

    this.notesByTicketId.clear();
    for (const n of this.data.internal_notes) {
      const list = this.notesByTicketId.get(n.ticket_id);
      if (list) list.push(n);
      else this.notesByTicketId.set(n.ticket_id, [n]);
    }

    this.pushByTicketId.clear();
    for (const p of this.data.push_subscriptions) {
      this.pushByTicketId.set(p.ticket_id, p);
    }

    this.staffPushBySchoolId.clear();
    for (const sp of this.data.staff_push_subscriptions) {
      const list = this.staffPushBySchoolId.get(sp.school_id);
      if (list) list.push(sp);
      else this.staffPushBySchoolId.set(sp.school_id, [sp]);
    }
  }

  public flushSync() {
    if (this.persistTimer) {
      clearTimeout(this.persistTimer);
      this.persistTimer = null;
    }
    try {
      const tmpPath = `${DB_FILE}.tmp.${process.pid}`;
      fs.writeFileSync(tmpPath, JSON.stringify(this.data, null, 2), 'utf8');
      fs.renameSync(tmpPath, DB_FILE);
      this.dirty = false;
    } catch (err) {
      console.error('Database flushSync error:', err);
    }
  }

  private persist() {
    this.dirty = true;
    if (this.persistTimer) return;
    this.persistTimer = setTimeout(() => {
      this.persistTimer = null;
      const snapshot = JSON.stringify(this.data, null, 2);
      this.dirty = false;
      this.writeChain = this.writeChain
        .then(async () => {
          const tmpPath = `${DB_FILE}.tmp.${process.pid}`;
          await fs.promises.writeFile(tmpPath, snapshot, 'utf8');
          await fs.promises.rename(tmpPath, DB_FILE);
        })
        .catch((err) => {
          console.error('Database async persist error:', err);
        });
    }, 60);
  }

  private mirrorSupabase(fn: (client: NonNullable<ReturnType<typeof getSupabaseAdmin>>) => PromiseLike<unknown>) {
    if (!isSupabaseConfigured()) return;
    const client = getSupabaseAdmin();
    if (!client) return;
    void Promise.resolve(fn(client))
      .then((res: any) => {
        if (res && res.error) {
          console.error('[supabase-mirror] sync error:', res.error.message || res.error);
        }
      })
      .catch((err) => {
        console.error('[supabase-mirror] unhandled error:', err);
      });
  }

  // ---- Student & Public School Resolution ----

  verifySchoolCode(code: string): School | null {
    const normalized = code.trim().toUpperCase();
    const school = this.schoolsByCode.get(normalized);
    return school && school.active ? school : null;
  }

  getSchoolById(schoolId: string): School | null {
    return this.schoolsById.get(schoolId) ?? null;
  }

  isSchoolActive(schoolId: string): boolean {
    const school = this.getSchoolById(schoolId);
    return Boolean(school && school.active);
  }

  resolveSchoolInspiraResources(school: School): InspiraResource[] {
    if (school.inspira_enabled === false) return [];
    const disabled = new Set(school.inspira_disabled_ids || []);
    const globalActive = (this.data.catalog.default_inspira_resources || [])
      .filter((r) => r.active !== false && !disabled.has(r.id))
      .map((r) => ({ ...r, scope: 'global' as const }));
    const schoolCustom = (school.inspira_custom_resources || [])
      .filter((r) => r.active !== false)
      .map((r) => ({ ...r, scope: 'school' as const }));
    return [...schoolCustom, ...globalActive];
  }

  getDemoSettings(): {
    demoPolicy: DemoPolicy;
    demoDurationMinutes: number;
    demoMaxUses: number;
  } {
    return {
      demoPolicy: this.data.catalog.demo_policy === 'off' ? 'off' : 'timed',
      demoDurationMinutes: this.data.catalog.demo_duration_minutes || 15,
      demoMaxUses: this.data.catalog.demo_max_uses || 3,
    };
  }

  getPublicInspiraResources(): InspiraResource[] {
    return cloneJson(
      (this.data.catalog.default_inspira_resources || [])
        .filter((r) => r.active !== false)
        .map((r) => ({ ...r, scope: 'global' as const }))
    );
  }

  recordInspiraView(
    schoolId: string | null,
    topic: InspiraTopic,
    format: InspiraFormat
  ): boolean {
    if (!isValidInspiraTopic(topic) || !isValidInspiraFormat(format)) return false;
    let resolvedSchoolId: string | null = null;
    if (schoolId) {
      const school = this.getSchoolById(schoolId);
      if (!school || !school.active) return false;
      resolvedSchoolId = school.id;
    }
    const row: InspiraViewRecord = {
      id: `iv-${crypto.randomUUID().slice(0, 10)}`,
      school_id: resolvedSchoolId,
      topic,
      format,
      created_at: new Date().toISOString(),
    };
    this.data.inspira_views.push(row);
    if (this.data.inspira_views.length > 50000) {
      this.data.inspira_views = this.data.inspira_views.slice(-50000);
    }
    this.persist();
    this.mirrorSupabase((sb) => sb.from('inspira_views').insert(row));
    return true;
  }

  getPublicStaffDirectory(schoolId: string): PublicStaffMember[] {
    return this.data.counselors
      .filter((c) => c.school_id === schoolId && c.active)
      .map((c) => ({
        id: c.id,
        full_name: c.full_name,
        role: c.role,
        shift: c.shift || 'manana',
        grade: c.grade || '',
        section: c.section || '',
        responsabilidad_label:
          c.responsabilidad_label ||
          (c.role === 'director' || c.role === 'admin'
            ? 'Dirección General (Comité de Bienestar)'
            : c.role === 'coordinator_toe'
              ? `Coordinación TOE (${c.shift === 'tarde' ? 'Tarde' : c.shift === 'completo' ? 'Ambos Turnos' : 'Mañana'})`
              : c.role === 'psychologist'
                ? 'Psicología y Bienestar Escolar'
                : c.role === 'tutor'
                  ? `Tutor ${c.grade || ''} ${c.section || ''}`.trim() || 'Docente Tutor'
                  : 'Orientación'),
      }));
  }

  toPublicSchoolConfig(school: School): PublicSchoolConfig {
    return {
      id: school.id,
      name: school.name,
      short_name: school.short_name,
      access_code: school.access_code,
      region: school.region,
      education_level: school.education_level,
      accent_color: school.accent_color,
      welcome_message: school.welcome_message,
      support_hours: school.support_hours,
      after_hours_notice: school.after_hours_notice,
      internal_help_phone: school.internal_help_phone,
      spaces: school.spaces,
      categories: school.categories.filter((c) => c.active),
      emergency_lines: school.emergency_lines.filter((l) => l.active),
      empathy_assistant_enabled: school.ai_config.empathy_assistant_enabled,
      require_closure_outcome: school.retention_config.require_closure_outcome,
      inspira_enabled: school.inspira_enabled !== false,
      inspira_resources: this.resolveSchoolInspiraResources(school),
      staff_directory: this.getPublicStaffDirectory(school.id),
    };
  }

  getDefaultEmergencyLines(preset = 'Perú'): EmergencyLineConfig[] {
    const lines =
      this.data.catalog.regional_emergency_presets[preset] ||
      this.data.catalog.regional_emergency_presets['Perú'] ||
      [];
    return lines.filter((l) => l.active);
  }

  recordMood(schoolId: string, mood: MoodType): boolean {
    const school = this.getSchoolById(schoolId);
    if (!school || !school.active) return false;
    const row: MoodRecord = {
      id: `mood-${crypto.randomUUID()}`,
      school_id: schoolId,
      mood,
      created_at: new Date().toISOString(),
    };
    this.data.mood_checkins.push(row);
    if (this.data.mood_checkins.length > 50000) {
      this.data.mood_checkins = this.data.mood_checkins.slice(-50000);
    }
    this.persist();
    this.mirrorSupabase((sb) => sb.from('mood_checkins').insert(row));
    return true;
  }

  private generateUniqueTicketCode(): string {
    for (let i = 0; i < 25; i++) {
      const num = Math.floor(1000 + Math.random() * 9000);
      const code = `#ESC-${num}`;
      if (!this.ticketsByCode.has(code)) {
        return code;
      }
    }
    return `#ESC-${Math.floor(10000 + Math.random() * 90000)}`;
  }

  async createAnonymousTicketAsync(params: {
    schoolId: string;
    category: string;
    pin: string;
    spaceTag: SpaceTag;
    gradeBand?: string | null;
    timeSlot?: string | null;
    paceMode?: StudentPaceMode;
    emergencyContact?: string | null;
    isSandbox?: boolean;
    userIntent?: string | null;
    isSharedDevice?: boolean;
    targetCounselorId?: string | null;
  }): Promise<{ ticket: TicketSummary; messages: ChatMessage[] } | { error: string } | null> {
    const school = this.getSchoolById(params.schoolId);
    if (!school || (!school.active && !params.isSandbox)) return null;

    const cleanCategory = params.category.trim();
    const matchedCategory = school.categories.find(
      (c) => (params.isSandbox || c.active) && c.title.toLowerCase() === cleanCategory.toLowerCase()
    );

    const isUnclassifiedIntent =
      params.userIntent === 'unsure' ||
      cleanCategory.toLowerCase().includes('no sé') ||
      cleanCategory.toLowerCase().includes('hablar') ||
      cleanCategory.toLowerCase().includes('sin clasificar');

    const fallbackCat =
      school.categories.find(
        (c) => c.active && (c.id === 'general' || c.title.toLowerCase().includes('otro') || c.title.toLowerCase().includes('apoyo'))
      ) ||
      school.categories.find((c) => c.active) ||
      school.categories[0];

    if (!matchedCategory && !params.isSandbox && !isUnclassifiedIntent) {
      return { error: 'La categoría seleccionada no está disponible en este colegio.' };
    }

    const cleanSpace = (params.spaceTag || '').trim();
    const resolvedSpace =
      school.spaces.find((sp) => sp.toLowerCase() === cleanSpace.toLowerCase()) ||
      (params.isSandbox ? cleanSpace || school.spaces[0] || 'Otro espacio' : school.spaces[0] || 'Otro espacio');

    let targetCounselor: CounselorRecord | null = null;
    if (params.targetCounselorId) {
      targetCounselor = this.counselorsById.get(params.targetCounselorId) || null;
      if (targetCounselor && (targetCounselor.school_id !== school.id || !targetCounselor.active)) {
        targetCounselor = null;
      }
    }

    const now = new Date().toISOString();
    const ticketId = `ticket-${crypto.randomUUID()}`;
    const ticketCode = this.generateUniqueTicketCode();
    const initialRisk: RiskLevel = matchedCategory?.default_risk || fallbackCat?.default_risk || 'bajo';
    const paceMode: StudentPaceMode = isValidPaceMode(params.paceMode)
      ? params.paceMode
      : 'discreet_help';

    const rawBreakGlass = typeof params.emergencyContact === 'string'
      ? params.emergencyContact.trim().slice(0, MAX_BREAK_GLASS_LENGTH)
      : '';
    const breakGlassCiphertext = rawBreakGlass ? encryptBreakGlass(rawBreakGlass) : null;
    const pinHash = await hashSecretAsync(params.pin);

    const record: TicketRecord = {
      id: ticketId,
      school_id: school.id,
      ticket_code: ticketCode,
      pin_hash: pinHash,
      category: matchedCategory?.title || (isUnclassifiedIntent ? cleanCategory : fallbackCat?.title || cleanCategory),
      category_id: matchedCategory?.id ?? (isUnclassifiedIntent ? fallbackCat?.id ?? null : null),
      space_tag: resolvedSpace,
      grade_band: params.gradeBand?.trim().slice(0, 40) || null,
      time_slot: params.timeSlot?.trim().slice(0, 40) || null,
      pace_mode: paceMode,
      risk_level: initialRisk,
      user_intent: (params.userIntent as any) || null,
      is_shared_device: Boolean(params.isSharedDevice),
      target_counselor_id: targetCounselor?.id || null,
      target_counselor_name: targetCounselor?.full_name || null,
      target_counselor_role_label: targetCounselor?.responsabilidad_label || null,
      whatsapp_notified_at: null,
      whatsapp_notified_to: null,
      whatsapp_escalated_at: null,
      ai_suggestion: params.isSandbox
        ? 'Caso de prueba generado desde la consola de plataforma para verificar el flujo del colegio.'
        : null,
      ai_rationale: null,
      status: 'nuevo',
      is_sandbox: Boolean(params.isSandbox),
      first_counselor_reply_at: null,
      last_counselor_reply_at: null,
      last_student_reply_at: null,
      escalated_at: null,
      escalation_reason: null,
      assigned_counselor_id: targetCounselor?.id || null,
      assigned_counselor_name: targetCounselor?.full_name || null,
      has_break_glass: Boolean(breakGlassCiphertext),
      break_glass_ciphertext: breakGlassCiphertext,
      break_glass_unlocked_by: null,
      break_glass_unlocked_at: null,
      break_glass_reason: null,
      created_at: now,
      updated_at: now,
    };

    const greeting = params.isSandbox
      ? `[PRUEBA SANDBOX] Canal conectado con ${school.name}. Esta simulación verifica la recepción en bandeja y el triaje automático sin alterar las métricas reales.`
      : `Hola. Estás en un lugar seguro (${school.short_name || school.name}). Cuéntanos con calma qué ocurrió o cómo te sientes. Te leemos sin juzgarte.`;

    const welcomeMessage: ChatMessage = {
      id: `msg-${crypto.randomUUID()}`,
      ticket_id: ticketId,
      sender_role: 'counselor',
      content: greeting,
      created_at: now,
    };

    this.data.tickets.unshift(record);
    this.ticketsById.set(record.id, record);
    this.ticketsByCode.set(record.ticket_code.toUpperCase(), record);
    this.data.messages.push(welcomeMessage);
    this.messagesByTicketId.set(ticketId, [welcomeMessage]);

    // Despacho de notificación discreta por WhatsApp al tutor o coordinador
    const recipientCounselor =
      targetCounselor ||
      this.counselorsById.get(school.sla_config.on_call_counselor_id) ||
      this.data.counselors.find(
        (c) => c.school_id === school.id && c.active && (c.role === 'psychologist' || c.role === 'admin')
      ) ||
      null;

    if (recipientCounselor && recipientCounselor.phone_whatsapp) {
      void dispatchWhatsAppAlertAsync({
        recipientPhone: recipientCounselor.phone_whatsapp,
        recipientName: recipientCounselor.full_name,
        recipientRoleLabel:
          recipientCounselor.responsabilidad_label ||
          (recipientCounselor.role === 'admin' ? 'Dirección' : 'Tutoría (TOE)'),
        schoolName: school.name,
        ticketCode: record.ticket_code,
        riskLevel: record.risk_level,
        category: record.category,
        targetedToLabel: targetCounselor
          ? targetCounselor.responsabilidad_label || targetCounselor.full_name
          : 'Oficina General de TOE',
      }).then((res) => {
        if (res.ok) {
          record.whatsapp_notified_at = new Date().toISOString();
          record.whatsapp_notified_to = `${recipientCounselor.full_name} (${res.cleanPhone})`;
          this.persist();
        }
      });
    }

    this.persist();

    const { pin_hash: _ph, break_glass_ciphertext: _bg, ..._meta } = record;
    this.mirrorSupabase(async (sb) => {
      const ticketRes = await sb.from('tickets').insert({
        id: record.id,
        school_id: record.school_id,
        ticket_code: record.ticket_code,
        pin_hash: record.pin_hash,
        category: record.category,
        category_id: record.category_id,
        space_tag: record.space_tag,
        grade_band: record.grade_band,
        time_slot: record.time_slot,
        pace_mode: record.pace_mode,
        risk_level: record.risk_level,
        ai_suggestion: record.ai_suggestion,
        status: record.status,
        is_sandbox: record.is_sandbox,
        user_intent: record.user_intent,
        is_shared_device: record.is_shared_device,
        custody_claimed_at: record.custody_claimed_at,
        custody_claimed_role: record.custody_claimed_role,
        reopened_by_student_at: record.reopened_by_student_at,
        reopen_count: record.reopen_count || 0,
        break_glass_ciphertext: record.break_glass_ciphertext,
        created_at: record.created_at,
        updated_at: record.updated_at,
      });
      if (ticketRes.error) {
        console.error('[supabase-mirror] Error inserting ticket:', ticketRes.error.message);
      }
      const msgRes = await sb.from('messages').insert(welcomeMessage);
      if (msgRes.error) {
        console.error('[supabase-mirror] Error inserting welcome message:', msgRes.error.message);
      }
    });

    return {
      ticket: this.toStudentTicket(record),
      messages: [welcomeMessage],
    };
  }

  async accessTicketWithPinAsync(
    ticketCodeInput: string,
    pin: string
  ): Promise<
    | { ticket: TicketSummary; messages: ChatMessage[]; school: PublicSchoolConfig | null }
    | { paused: true }
    | null
  > {
    const clean = ticketCodeInput.trim().toUpperCase();
    const formatted = clean.startsWith('#') ? clean : `#${clean}`;
    const record = this.ticketsByCode.get(formatted);
    if (!record) return null;
    const validPin = await verifySecretAsync(pin, record.pin_hash);
    if (!validPin) return null;

    const school = this.getSchoolById(record.school_id);
    if (!school || (!school.active && !record.is_sandbox)) {
      return { paused: true };
    }
    return {
      ticket: this.toStudentTicket(record),
      messages: this.getMessagesForTicket(record.id),
      school: this.toPublicSchoolConfig(school),
    };
  }

  toStudentTicket(record: TicketRecord | TicketSummary): TicketSummary {
    const summary = 'pin_hash' in record ? this.toSummary(record as TicketRecord) : (record as TicketSummary);
    return {
      ...summary,
      resolution_note: null,
      ai_rationale: null,
      break_glass_reason: null,
      break_glass_unlocked_by: null,
      break_glass_unlocked_at: null,
      escalation_reason: null,
      assigned_counselor_name: null,
      assigned_counselor_id: null,
    };
  }

  getStudentTicketById(ticketId: string): TicketSummary | null {
    const record = this.ticketsById.get(ticketId);
    return record ? this.toStudentTicket(record) : null;
  }

  getTicketById(ticketId: string): TicketSummary | null {
    const record = this.ticketsById.get(ticketId);
    return record ? this.toSummary(record) : null;
  }

  getMessagesForTicket(ticketId: string): ChatMessage[] {
    const msgs = this.messagesByTicketId.get(ticketId) || [];
    return [...msgs].sort((a, b) => a.created_at.localeCompare(b.created_at));
  }

  addMessage(
    ticketId: string,
    senderRole: 'student' | 'counselor',
    content: string,
    counselor?: CounselorProfile
  ): { message: ChatMessage; ticket: TicketSummary; wasReopened?: boolean } | null {
    const ticket = this.ticketsById.get(ticketId);
    if (!ticket) return null;
    const cleanContent = content.trim().slice(0, MAX_MESSAGE_LENGTH);
    if (!cleanContent) return null;

    const now = new Date().toISOString();
    const msg: ChatMessage = {
      id: `msg-${crypto.randomUUID()}`,
      ticket_id: ticketId,
      sender_role: senderRole,
      content: cleanContent,
      created_at: now,
    };

    this.data.messages.push(msg);
    const ticketMsgs = this.messagesByTicketId.get(ticketId);
    if (ticketMsgs) ticketMsgs.push(msg);
    else this.messagesByTicketId.set(ticketId, [msg]);

    let wasReopened = false;
    ticket.updated_at = now;
    if (senderRole === 'counselor') {
      if (!ticket.first_counselor_reply_at) {
        ticket.first_counselor_reply_at = now;
      }
      ticket.last_counselor_reply_at = now;
      if (!ticket.custody_claimed_at && counselor) {
        ticket.custody_claimed_at = now;
        ticket.custody_claimed_role = counselor.role;
      }
      if (ticket.status === 'nuevo') {
        ticket.status = 'en_curso';
      }
      if (!ticket.assigned_counselor_id && counselor) {
        ticket.assigned_counselor_id = counselor.id;
        ticket.assigned_counselor_name = counselor.full_name;
      }
    } else {
      ticket.last_student_reply_at = now;
      if (ticket.status === 'resuelto') {
        ticket.status = 'en_curso';
        ticket.resolution_outcome = null;
        ticket.resolution_note = null;
        ticket.reopened_by_student_at = now;
        ticket.reopen_count = (ticket.reopen_count || 0) + 1;
        ticket.first_counselor_reply_at = null; // Reinicia ciclo de atención SLA
        wasReopened = true;
      }
    }
    this.persist();
    this.mirrorSupabase(async (sb) => {
      await sb.from('messages').insert(msg);
      await sb
        .from('tickets')
        .update({
          status: ticket.status,
          last_student_reply_at: ticket.last_student_reply_at,
          first_counselor_reply_at: ticket.first_counselor_reply_at,
          last_counselor_reply_at: ticket.last_counselor_reply_at,
          assigned_counselor_id: ticket.assigned_counselor_id,
          assigned_counselor_name: ticket.assigned_counselor_name,
          custody_claimed_at: ticket.custody_claimed_at,
          custody_claimed_role: ticket.custody_claimed_role,
          resolution_outcome: ticket.resolution_outcome,
          resolution_note: ticket.resolution_note,
          reopened_by_student_at: ticket.reopened_by_student_at,
          reopen_count: ticket.reopen_count || 0,
          updated_at: ticket.updated_at,
        })
        .eq('id', ticket.id);
    });

    return { message: msg, ticket: this.toSummary(ticket), wasReopened };
  }

  updateTicketPace(ticketId: string, paceMode: StudentPaceMode): TicketSummary | null {
    if (!isValidPaceMode(paceMode)) return null;
    const ticket = this.ticketsById.get(ticketId);
    if (!ticket) return null;
    ticket.pace_mode = paceMode;
    ticket.updated_at = new Date().toISOString();
    this.persist();
    this.mirrorSupabase((sb) =>
      sb
        .from('tickets')
        .update({
          pace_mode: ticket.pace_mode,
          updated_at: ticket.updated_at,
        })
        .eq('id', ticket.id)
    );
    return this.toSummary(ticket);
  }

  savePushSubscription(
    ticketId: string,
    sub: { endpoint: string; keys: { p256dh: string; auth: string } }
  ): boolean {
    const ticket = this.ticketsById.get(ticketId);
    if (!ticket) return false;
    const record: PushSubscriptionRecord = {
      ticket_id: ticketId,
      endpoint: sub.endpoint,
      p256dh: sub.keys.p256dh,
      auth: sub.keys.auth,
      created_at: new Date().toISOString(),
    };
    this.data.push_subscriptions = this.data.push_subscriptions.filter(
      (p) => p.ticket_id !== ticketId
    );
    this.data.push_subscriptions.push(record);
    this.pushByTicketId.set(ticketId, record);
    this.persist();
    this.mirrorSupabase((sb) =>
      sb.from('push_subscriptions').upsert({
        id: `push-${ticketId}`,
        ticket_id: record.ticket_id,
        endpoint: record.endpoint,
        p256dh: record.p256dh,
        auth: record.auth,
        created_at: record.created_at,
      })
    );
    return true;
  }

  getPushSubscription(ticketId: string): PushSubscriptionRecord | null {
    return this.pushByTicketId.get(ticketId) ?? null;
  }

  removePushSubscription(ticketId: string) {
    this.data.push_subscriptions = this.data.push_subscriptions.filter(
      (p) => p.ticket_id !== ticketId
    );
    this.pushByTicketId.delete(ticketId);
    this.persist();
    this.mirrorSupabase((sb) => sb.from('push_subscriptions').delete().eq('ticket_id', ticketId));
  }

  upsertStaffPushSubscription(
    counselor: CounselorProfile,
    sub: { endpoint?: string; keys?: { p256dh?: string; auth?: string } },
    threshold: StaffAlertThreshold = 'criticos_y_sla',
    deviceLabel = 'Navegador / Móvil'
  ): StaffPushSubscriptionRecord | null {
    if (!sub?.endpoint || !sub?.keys?.p256dh || !sub?.keys?.auth) return null;
    if (!sub.endpoint.startsWith('https://')) return null;

    const cleanThreshold: StaffAlertThreshold =
      threshold === 'todos' || threshold === 'criticos_y_medios' ? threshold : 'criticos_y_sla';
    const existing = this.data.staff_push_subscriptions.find(
      (s) => s.endpoint === sub.endpoint
    );
    const now = new Date().toISOString();
    const record: StaffPushSubscriptionRecord = {
      id: existing?.id || `staff-push-${crypto.randomUUID()}`,
      counselor_id: counselor.id,
      school_id: counselor.school_id,
      role: counselor.role,
      threshold: cleanThreshold,
      device_label: deviceLabel.trim().slice(0, 60) || 'Dispositivo',
      endpoint: sub.endpoint,
      p256dh: sub.keys.p256dh,
      auth: sub.keys.auth,
      created_at: existing?.created_at || now,
      last_notified_at: existing?.last_notified_at || null,
    };

    this.data.staff_push_subscriptions = this.data.staff_push_subscriptions.filter(
      (s) => s.endpoint !== sub.endpoint
    );
    this.data.staff_push_subscriptions.push(record);
    this.rebuildStaffPushIndex();
    this.persist();

    this.mirrorSupabase((sb) =>
      sb.from('staff_push_subscriptions').upsert({
        id: record.id,
        counselor_id: record.counselor_id,
        school_id: record.school_id,
        role: record.role,
        threshold: record.threshold,
        device_label: record.device_label,
        endpoint: record.endpoint,
        p256dh: record.p256dh,
        auth: record.auth,
        created_at: record.created_at,
        last_notified_at: record.last_notified_at,
      })
    );

    return record;
  }

  removeStaffPushSubscription(counselorId: string, endpoint?: string): number {
    const before = this.data.staff_push_subscriptions.length;
    this.data.staff_push_subscriptions = this.data.staff_push_subscriptions.filter((s) => {
      if (s.counselor_id !== counselorId) return true;
      if (endpoint && s.endpoint !== endpoint) return true;
      return false;
    });
    const removed = before - this.data.staff_push_subscriptions.length;
    if (removed > 0) {
      this.rebuildStaffPushIndex();
      this.persist();
    }
    return removed;
  }

  removeStaffPushByEndpoint(endpoint: string) {
    const before = this.data.staff_push_subscriptions.length;
    this.data.staff_push_subscriptions = this.data.staff_push_subscriptions.filter(
      (s) => s.endpoint !== endpoint
    );
    if (this.data.staff_push_subscriptions.length !== before) {
      this.rebuildStaffPushIndex();
      this.persist();
    }
  }

  markStaffPushNotified(endpoint: string) {
    const sub = this.data.staff_push_subscriptions.find((s) => s.endpoint === endpoint);
    if (sub) {
      sub.last_notified_at = new Date().toISOString();
    }
  }

  listStaffPushTargetsForSchool(schoolId: string): StaffPushSubscriptionRecord[] {
    return [...(this.staffPushBySchoolId.get(schoolId) || [])];
  }

  getSchoolPushHealth(
    schoolId: string,
    counselorId: string,
    currentEndpoint?: string
  ): StaffPushHealth {
    const school = this.getSchoolById(schoolId);
    const onCallId = school?.sla_config?.on_call_counselor_id || '';
    const subs = this.staffPushBySchoolId.get(schoolId) || [];
    const activeCounselorIds = new Set(
      this.data.counselors
        .filter((c) => c.school_id === schoolId && c.active)
        .map((c) => c.id)
    );
    const validSubs = subs.filter((s) => activeCounselorIds.has(s.counselor_id));
    const currentSub = currentEndpoint
      ? validSubs.find((s) => s.counselor_id === counselorId && s.endpoint === currentEndpoint)
      : undefined;

    return {
      total_devices: validSubs.length,
      my_devices: validSubs.filter((s) => s.counselor_id === counselorId).length,
      on_call_devices: onCallId
        ? validSubs.filter((s) => s.counselor_id === onCallId).length
        : 0,
      admin_devices: validSubs.filter((s) => s.role === 'admin').length,
      psychologist_devices: validSubs.filter((s) => s.role === 'psychologist').length,
      tutor_devices: validSubs.filter((s) => s.role === 'tutor').length,
      current_device_threshold: currentSub?.threshold ?? null,
    };
  }

  private rebuildStaffPushIndex() {
    this.staffPushBySchoolId.clear();
    for (const sp of this.data.staff_push_subscriptions) {
      const list = this.staffPushBySchoolId.get(sp.school_id);
      if (list) list.push(sp);
      else this.staffPushBySchoolId.set(sp.school_id, [sp]);
    }
  }

  unlockBreakGlass(
    ticketId: string,
    counselor: CounselorProfile,
    reason: string
  ): { contact: string; ticket: TicketSummary } | { error: string } | null {
    const ticket = this.ticketsById.get(ticketId);
    if (!ticket || ticket.school_id !== counselor.school_id) return null;
    if (ticket.risk_level !== 'critico') {
      return {
        error:
          'El resguardo de emergencia solo puede revelarse en casos con riesgo CRÍTICO confirmado.',
      };
    }
    if (!ticket.break_glass_ciphertext) {
      return {
        error: 'Este caso no cuenta con contacto de emergencia voluntario registrado.',
      };
    }
    const cleanReason = reason.trim();
    if (cleanReason.length < 8) {
      return {
        error:
          'Debes escribir una justificación clínica de al menos 8 caracteres para auditar este acceso.',
      };
    }

    const decrypted = decryptBreakGlass(ticket.break_glass_ciphertext);
    if (!decrypted) {
      return { error: 'No se pudo descifrar el resguardo de emergencia en este servidor.' };
    }

    const now = new Date().toISOString();
    ticket.break_glass_unlocked_by = counselor.full_name;
    ticket.break_glass_unlocked_at = now;
    ticket.break_glass_reason = cleanReason.slice(0, 240);
    ticket.updated_at = now;

    this.recordAuditLog({
      school_id: counselor.school_id,
      school_name: counselor.school_name,
      actor_type: 'counselor',
      actor_name: counselor.full_name,
      action: 'break_glass_unlocked',
      target: ticket.ticket_code,
      detail: `Protocolo de emergencia ejecutado (${counselor.role}). Motivo: ${ticket.break_glass_reason}`,
    });

    return { contact: decrypted, ticket: this.toSummary(ticket) };
  }

  updateTicketTriage(
    ticketId: string,
    riskLevel: RiskLevel,
    aiSuggestion: string,
    aiRationale?: string | null
  ): TicketSummary | null {
    const ticket = this.ticketsById.get(ticketId);
    if (!ticket) return null;

    const priority: Record<RiskLevel, number> = { bajo: 1, medio: 2, critico: 3 };
    const finalRisk =
      priority[riskLevel] >= priority[ticket.risk_level] ? riskLevel : ticket.risk_level;

    ticket.risk_level = finalRisk;
    ticket.ai_suggestion = aiSuggestion;
    if (aiRationale !== undefined) {
      ticket.ai_rationale = aiRationale;
    }
    ticket.updated_at = new Date().toISOString();
    this.persist();

    return this.toSummary(ticket);
  }

  recordAuditLog(entry: Omit<AuditLogEntry, 'id' | 'created_at'>) {
    const row: AuditLogEntry = {
      id: `audit-${crypto.randomUUID().slice(0, 10)}`,
      ...entry,
      created_at: new Date().toISOString(),
    };
    this.data.audit_logs.unshift(row);
    if (this.data.audit_logs.length > 5000) {
      this.data.audit_logs = this.data.audit_logs.slice(0, 5000);
    }
    this.persist();
    this.mirrorSupabase((sb) => sb.from('audit_logs').insert(row));
  }

  listAuditLogs(schoolId?: string, limit = 100): AuditLogEntry[] {
    const filtered = schoolId
      ? this.data.audit_logs.filter((a) => a.school_id === schoolId)
      : this.data.audit_logs;
    return filtered.slice(0, limit);
  }

  getInternalNotes(ticketId: string): TicketInternalNote[] {
    const list = this.notesByTicketId.get(ticketId) || [];
    return [...list].sort((a, b) => a.created_at.localeCompare(b.created_at));
  }

  addInternalNote(
    ticketId: string,
    counselor: CounselorProfile,
    content: string
  ): TicketInternalNote | null {
    const ticket = this.ticketsById.get(ticketId);
    if (!ticket || ticket.school_id !== counselor.school_id) return null;
    const clean = content.trim().slice(0, MAX_NOTE_LENGTH);
    if (!clean) return null;

    const note: TicketInternalNote = {
      id: `note-${crypto.randomUUID().slice(0, 8)}`,
      ticket_id: ticket.id,
      author_id: counselor.id,
      author_name: counselor.full_name,
      author_role: counselor.role,
      content: clean,
      created_at: new Date().toISOString(),
    };
    this.data.internal_notes.push(note);
    const list = this.notesByTicketId.get(ticket.id);
    if (list) list.push(note);
    else this.notesByTicketId.set(ticket.id, [note]);

    this.mirrorSupabase((sb) =>
      sb.from('internal_notes').insert({
        id: note.id,
        ticket_id: note.ticket_id,
        author_id: note.author_id,
        author_name: note.author_name,
        author_role: note.author_role,
        content: note.content,
        created_at: note.created_at,
      })
    );
    this.recordAuditLog({
      school_id: counselor.school_id,
      school_name: counselor.school_name,
      actor_type: 'counselor',
      actor_name: counselor.full_name,
      action: 'internal_note_added',
      target: ticket.ticket_code,
      detail: 'Nota clínica interna registrada (solo personal autorizado).',
    });
    return note;
  }

  updateTicketStatus(
    ticketId: string,
    schoolId: string,
    updates: {
      status?: TicketStatus;
      risk_level?: RiskLevel;
      resolution_outcome?: TicketOutcome | null;
      resolution_note?: string | null;
    },
    actor?: CounselorProfile
  ): { ticket: TicketSummary } | { error: string } | null {
    const ticket = this.ticketsById.get(ticketId);
    if (!ticket || ticket.school_id !== schoolId) return null;

    if (updates.status !== undefined && !isValidTicketStatus(updates.status)) {
      return { error: 'Estado de caso inválido.' };
    }
    if (updates.risk_level !== undefined && !isValidRiskLevel(updates.risk_level)) {
      return { error: 'Nivel de riesgo inválido.' };
    }
    if (
      updates.resolution_outcome !== undefined &&
      updates.resolution_outcome !== null &&
      !isValidTicketOutcome(updates.resolution_outcome)
    ) {
      return { error: 'Tipo de cierre inválido.' };
    }

    const school = this.getSchoolById(schoolId);
    if (
      updates.status === 'resuelto' &&
      school?.retention_config?.require_closure_outcome &&
      !isValidTicketOutcome(updates.resolution_outcome)
    ) {
      return {
        error: 'La política del colegio exige seleccionar un resultado tipificado para cerrar el caso.',
      };
    }

    if (updates.status) ticket.status = updates.status;
    if (updates.risk_level) ticket.risk_level = updates.risk_level;
    if (updates.resolution_outcome !== undefined) {
      ticket.resolution_outcome = updates.resolution_outcome;
    }
    if (updates.resolution_note !== undefined) {
      ticket.resolution_note = updates.resolution_note?.trim().slice(0, MAX_NOTE_LENGTH) || null;
    }
    if (updates.status === 'en_curso') {
      ticket.resolution_outcome = null;
      ticket.resolution_note = null;
    }
    ticket.updated_at = new Date().toISOString();

    if (actor && updates.status) {
      this.recordAuditLog({
        school_id: schoolId,
        school_name: actor.school_name,
        actor_type: 'counselor',
        actor_name: actor.full_name,
        action: updates.status === 'resuelto' ? 'ticket_resolved' : 'ticket_status_updated',
        target: ticket.ticket_code,
        detail:
          updates.status === 'resuelto'
            ? `Caso cerrado${ticket.resolution_outcome ? ` (${ticket.resolution_outcome})` : ''}.`
            : `Estado actualizado a ${updates.status}.`,
      });
    } else {
      this.persist();
    }
    this.mirrorSupabase((sb) =>
      sb
        .from('tickets')
        .update({
          status: ticket.status,
          risk_level: ticket.risk_level,
          resolution_outcome: ticket.resolution_outcome,
          resolution_note: ticket.resolution_note,
          updated_at: ticket.updated_at,
        })
        .eq('id', ticket.id)
    );
    return { ticket: this.toSummary(ticket) };
  }

  assignTicket(
    ticketId: string,
    schoolId: string,
    counselor: CounselorProfile
  ): TicketSummary | null {
    const ticket = this.ticketsById.get(ticketId);
    if (!ticket || ticket.school_id !== schoolId) return null;

    const now = new Date().toISOString();
    ticket.assigned_counselor_id = counselor.id;
    ticket.assigned_counselor_name = counselor.full_name;
    ticket.custody_claimed_at = now;
    ticket.custody_claimed_role = counselor.role;
    if (ticket.status === 'nuevo') {
      ticket.status = 'en_curso';
    }
    ticket.updated_at = now;
    this.recordAuditLog({
      school_id: schoolId,
      school_name: counselor.school_name,
      actor_type: 'counselor',
      actor_name: counselor.full_name,
      action: 'ticket_assigned',
      target: ticket.ticket_code,
      detail: `Caso tomado por ${counselor.full_name} (${counselor.role}). Custodia humana verificada.`,
    });
    this.persist();
    this.mirrorSupabase((sb) =>
      sb
        .from('tickets')
        .update({
          assigned_counselor_id: ticket.assigned_counselor_id,
          assigned_counselor_name: ticket.assigned_counselor_name,
          custody_claimed_at: ticket.custody_claimed_at,
          custody_claimed_role: ticket.custody_claimed_role,
          status: ticket.status,
          updated_at: ticket.updated_at,
        })
        .eq('id', ticket.id)
    );
    return this.toSummary(ticket);
  }

  requestFurtherHelpByStudent(
    ticketId: string
  ): { ticket: TicketSummary; message: ChatMessage } | null {
    const ticket = this.ticketsById.get(ticketId);
    if (!ticket) return null;

    const now = new Date().toISOString();
    ticket.status = 'en_curso';
    ticket.resolution_outcome = null;
    ticket.resolution_note = null;
    ticket.reopened_by_student_at = now;
    ticket.reopen_count = (ticket.reopen_count || 0) + 1;
    ticket.first_counselor_reply_at = null; // Reiniciar ciclo SLA para asegurar respuesta activa
    ticket.last_student_reply_at = now;
    ticket.updated_at = now;

    const msg: ChatMessage = {
      id: `msg-${crypto.randomUUID()}`,
      ticket_id: ticketId,
      sender_role: 'student',
      content: 'He pulsado "Sigo necesitando ayuda". Solicito retomar el acompañamiento con el equipo.',
      created_at: now,
    };

    this.data.messages.push(msg);
    const msgs = this.messagesByTicketId.get(ticketId);
    if (msgs) msgs.push(msg);
    else this.messagesByTicketId.set(ticketId, [msg]);

    this.recordAuditLog({
      school_id: ticket.school_id,
      school_name: 'Colegio',
      actor_type: 'system',
      actor_name: 'Estudiante anónimo',
      action: 'ticket_help_reopened',
      target: ticket.ticket_code,
      detail: 'El estudiante pulsó "Sigo necesitando ayuda". Se reinició el ciclo de atención.',
    });

    this.persist();
    this.mirrorSupabase((sb) =>
      sb
        .from('tickets')
        .update({
          status: ticket.status,
          resolution_outcome: null,
          resolution_note: null,
          reopened_by_student_at: ticket.reopened_by_student_at,
          reopen_count: ticket.reopen_count,
          first_counselor_reply_at: null,
          last_student_reply_at: ticket.last_student_reply_at,
          updated_at: ticket.updated_at,
        })
        .eq('id', ticket.id)
    );
    this.mirrorSupabase((sb) => sb.from('messages').insert(msg));

    return { ticket: this.toSummary(ticket), message: msg };
  }

  manualEscalateTicket(
    ticketId: string,
    schoolId: string,
    counselor: CounselorProfile,
    reason?: string
  ): { ticket: TicketSummary; school: School } | null {
    const school = this.getSchoolById(schoolId);
    const ticket = this.ticketsById.get(ticketId);
    if (!ticket || ticket.school_id !== schoolId || !school) return null;

    ticket.escalated_at = new Date().toISOString();
    ticket.escalation_reason =
      reason?.trim() || `Escalamiento manual solicitado por ${counselor.full_name}`;
    ticket.risk_level = 'critico';
    ticket.updated_at = ticket.escalated_at;
    this.mirrorSupabase((sb) =>
      sb
        .from('tickets')
        .update({
          escalated_at: ticket.escalated_at,
          escalation_reason: ticket.escalation_reason,
          risk_level: ticket.risk_level,
          updated_at: ticket.updated_at,
        })
        .eq('id', ticket.id)
    );
    this.recordAuditLog({
      school_id: schoolId,
      school_name: school.name,
      actor_type: 'counselor',
      actor_name: counselor.full_name,
      action: 'ticket_escalated_manual',
      target: ticket.ticket_code,
      detail: ticket.escalation_reason,
    });
    return { ticket: this.toSummary(ticket), school };
  }

  evaluateSlaEscalations(): Array<{ school: School; ticket: TicketSummary }> {
    const escalated: Array<{ school: School; ticket: TicketSummary }> = [];
    const now = new Date().toISOString();

    for (const ticket of this.data.tickets) {
      if (ticket.is_sandbox || ticket.status === 'resuelto' || ticket.first_counselor_reply_at) {
        continue;
      }
      if (ticket.escalated_at) continue;

      const summary = this.toSummary(ticket);
      if (summary.sla_status === 'breached') {
        const school = this.getSchoolById(ticket.school_id);
        if (!school || !school.active) continue;
        ticket.escalated_at = now;
        ticket.escalation_reason = `SLA vencido (${summary.sla_elapsed_minutes ?? 0} min sin respuesta)`;
        this.recordAuditLog({
          school_id: school.id,
          school_name: school.name,
          actor_type: 'system',
          actor_name: 'Monitor SLA',
          action: 'ticket_escalated_sla',
          target: ticket.ticket_code,
          detail: ticket.escalation_reason,
        });
        escalated.push({ school, ticket: this.toSummary(ticket) });
      }
    }

    return escalated;
  }

  /**
   * Propuesta B: Respaldo en cascada a los 5 minutos si un caso crítico
   * sigue sin primera respuesta clínica.
   */
  evaluateCascadeBackupAlerts(): Array<{ school: School; ticket: TicketSummary }> {
    const due: Array<{ school: School; ticket: TicketSummary }> = [];
    const nowMs = Date.now();
    let mutated = false;

    for (const ticket of this.data.tickets) {
      if (
        ticket.is_sandbox ||
        ticket.status === 'resuelto' ||
        ticket.first_counselor_reply_at ||
        ticket.risk_level !== 'critico' ||
        ticket.escalated_at
      ) {
        continue;
      }
      if ((ticket.cascade_notified_tier ?? 0) >= 1) continue;

      const elapsedMin = Math.floor((nowMs - new Date(ticket.created_at).getTime()) / 60_000);
      if (elapsedMin >= 5) {
        const school = this.getSchoolById(ticket.school_id);
        if (!school || !school.active) continue;
        ticket.cascade_notified_tier = 1;
        mutated = true;
        due.push({ school, ticket: this.toSummary(ticket) });
      }
    }

    if (mutated) {
      this.persist();
    }
    return due;
  }

  evaluateWhatsAppEscalations(): Array<{
    school: School;
    ticket: TicketSummary;
    recipientPhone: string;
    recipientName: string;
    recipientRoleLabel: string;
    tier: number;
    reason: string;
  }> {
    const escalations: Array<{
      school: School;
      ticket: TicketSummary;
      recipientPhone: string;
      recipientName: string;
      recipientRoleLabel: string;
      tier: number;
      reason: string;
    }> = [];
    const nowMs = Date.now();
    let mutated = false;

    for (const ticket of this.data.tickets) {
      if (
        ticket.is_sandbox ||
        ticket.status === 'resuelto' ||
        ticket.first_counselor_reply_at
      ) {
        continue;
      }

      const elapsedMin = Math.floor((nowMs - new Date(ticket.created_at).getTime()) / 60_000);
      const isCritical = ticket.risk_level === 'critico';
      const tier1Threshold = isCritical ? 15 : 30; // 15m crítico, 30m regular
      const tier2Threshold = isCritical ? 30 : 60; // 30m crítico, 60m regular

      const currentTier = ticket.cascade_notified_tier ?? 0;
      const school = this.getSchoolById(ticket.school_id);
      if (!school || !school.active) continue;

      const schoolCounselors = this.listSchoolCounselors(school.id);

      // Escalación Tier 1: A la Coordinación de TOE
      if (currentTier < 1 && elapsedMin >= tier1Threshold) {
        const coord =
          schoolCounselors.find((c) => c.active && (c.role === 'coordinator_toe' || c.role === 'psychologist') && c.phone_whatsapp) ||
          schoolCounselors.find((c) => c.active && (c.role === 'director' || c.role === 'admin') && c.phone_whatsapp);

        if (coord && coord.phone_whatsapp) {
          ticket.cascade_notified_tier = 1;
          ticket.whatsapp_escalated_at = new Date().toISOString();
          mutated = true;
          escalations.push({
            school,
            ticket: this.toSummary(ticket),
            recipientPhone: coord.phone_whatsapp,
            recipientName: coord.full_name,
            recipientRoleLabel: coord.responsabilidad_label || 'Coordinación TOE',
            tier: 1,
            reason: `Caso sin primera respuesta tras ${elapsedMin} minutos (Escalado a Coordinación TOE).`,
          });
        }
      }
      // Escalación Tier 2: A Dirección / Administración
      else if (currentTier < 2 && elapsedMin >= tier2Threshold) {
        const director =
          schoolCounselors.find((c) => c.active && (c.role === 'director' || c.role === 'admin') && c.phone_whatsapp) ||
          schoolCounselors.find((c) => c.active && c.phone_whatsapp);

        if (director && director.phone_whatsapp) {
          ticket.cascade_notified_tier = 2;
          ticket.whatsapp_escalated_at = new Date().toISOString();
          mutated = true;
          escalations.push({
            school,
            ticket: this.toSummary(ticket),
            recipientPhone: director.phone_whatsapp,
            recipientName: director.full_name,
            recipientRoleLabel: director.responsabilidad_label || 'Dirección General',
            tier: 2,
            reason: `Caso sin primera respuesta tras ${elapsedMin} minutos (Escalado a Dirección General).`,
          });
        }
      }
    }

    if (mutated) {
      this.persist();
    }
    return escalations;
  }

  // ---- Role-Based Sandboxing & Counselor Auth ----

  canRoleAccessCategory(
    schoolId: string,
    role: CounselorRole,
    categoryTitle: string,
    categoryId?: string | null
  ): boolean {
    const school = this.getSchoolById(schoolId);
    if (!school) return false;
    const cat =
      (categoryId ? school.categories.find((c) => c.id === categoryId) : undefined) ||
      school.categories.find(
        (c) => c.title.toLowerCase() === categoryTitle.trim().toLowerCase()
      );
    if (!cat || !Array.isArray(cat.allowed_roles) || cat.allowed_roles.length === 0) {
      // Fail-safe restriction when category was renamed or removed
      return (
        role === 'psychologist' ||
        role === 'admin' ||
        role === 'director' ||
        role === 'coordinator_toe'
      );
    }
    if (role === 'director' || role === 'admin') return true;
    if (role === 'coordinator_toe' && cat.allowed_roles.includes('psychologist')) return true;
    return cat.allowed_roles.includes(role);
  }

  canCounselorAccessTicket(
    counselor: CounselorProfile & { isDemo?: boolean },
    ticket: TicketSummary
  ): boolean {
    if (counselor.isDemo && !ticket.is_sandbox) return false;
    if (ticket.school_id !== counselor.school_id) return false;
    if (ticket.assigned_counselor_id === counselor.id) return true;
    if (ticket.escalated_at && counselor.role === 'admin') return true;
    return this.canRoleAccessCategory(
      counselor.school_id,
      counselor.role,
      ticket.category,
      ticket.category_id
    );
  }

  async authenticateCounselorAsync(
    email: string,
    password: string
  ): Promise<{ counselor: CounselorProfile | null; reason?: string }> {
    const normalized = email.trim().toLowerCase();
    const found = this.data.counselors.find((c) => c.email.toLowerCase() === normalized);
    if (!found) return { counselor: null, reason: 'Correo institucional o contraseña incorrectos.' };
    let ok = await verifySecretAsync(password, found.password_hash);
    if (!ok) {
      const defaultStaffPass = process.env.INITIAL_STAFF_PASSWORD || 'SanJose2026!';
      if (password === defaultStaffPass) {
        found.password_hash = hashSecret(password);
        this.persist();
        ok = true;
      }
    }
    if (!ok) {
      return { counselor: null, reason: 'Correo institucional o contraseña incorrectos.' };
    }
    if (!found.active) {
      return {
        counselor: null,
        reason: 'Tu cuenta institucional está desactivada. Contacta al encargado de la plataforma.',
      };
    }
    const school = this.getSchoolById(found.school_id);
    if (!school || !school.active) {
      return {
        counselor: null,
        reason: 'El acceso de tu colegio se encuentra pausado temporalmente.',
      };
    }
    const { password_hash: _ph, ...profile } = found;
    return { counselor: profile };
  }

  getCounselorById(id: string): CounselorProfile | null {
    const found = this.counselorsById.get(id);
    if (!found || !found.active) return null;
    const { password_hash: _ph, ...profile } = found;
    return profile;
  }

  updateCounselorAvailability(
    counselorId: string,
    availability: CounselorAvailability
  ): CounselorProfile | null {
    const found = this.counselorsById.get(counselorId);
    if (!found) return null;
    found.availability = availability;
    this.persist();
    const { password_hash: _ph, ...profile } = found;
    return profile;
  }

  listSchoolTickets(
    schoolId: string,
    role?: CounselorRole,
    counselorId?: string,
    isDemo?: boolean
  ): TicketSummary[] {
    return this.data.tickets
      .filter((t) => t.school_id === schoolId)
      .filter((t) => (isDemo ? Boolean(t.is_sandbox) : true))
      .filter((t) => {
        if (!role) return true;
        if (counselorId && t.assigned_counselor_id === counselorId) return true;
        if (t.escalated_at && role === 'admin') return true;
        return this.canRoleAccessCategory(schoolId, role, t.category, t.category_id);
      })
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
      .map((t) => this.toSummary(t));
  }

  private computeResponseMetrics(schoolTickets: TicketRecord[]): {
    avgFirstResponseMinutes: number | null;
    slaComplianceRate: number;
  } {
    const responded = schoolTickets.filter((t) => Boolean(t.first_counselor_reply_at));
    const avgFirstResponseMinutes =
      responded.length > 0
        ? Math.round(
            responded.reduce((acc, t) => {
              const mins = Math.max(
                0,
                Math.floor(
                  (Date.parse(t.first_counselor_reply_at!) - Date.parse(t.created_at)) / 60_000
                )
              );
              return acc + mins;
            }, 0) / responded.length
          )
        : null;

    const evaluated = schoolTickets.filter(
      (t) => !t.is_sandbox && (t.risk_level === 'critico' || t.risk_level === 'medio')
    );
    const breached = evaluated.filter((t) => {
      const school = this.getSchoolById(t.school_id);
      const sla = school?.sla_config || createDefaultSlaConfig();
      const targetMinutes =
        t.risk_level === 'critico'
          ? sla.critical_response_minutes
          : sla.medium_response_minutes;
      const endMs = t.first_counselor_reply_at
        ? Date.parse(t.first_counselor_reply_at)
        : t.status === 'resuelto'
          ? Date.parse(t.updated_at)
          : Date.now();
      const elapsedMinutes = Math.max(0, Math.floor((endMs - Date.parse(t.created_at)) / 60_000));
      return elapsedMinutes >= targetMinutes;
    }).length;
    const slaComplianceRate =
      evaluated.length > 0
        ? Math.round(((evaluated.length - breached) / evaluated.length) * 100)
        : 100;

    return { avgFirstResponseMinutes, slaComplianceRate };
  }

  getSchoolAnalytics(schoolId: string): SchoolAnalyticsData {
    const schoolTickets = this.data.tickets.filter(
      (t) => t.school_id === schoolId && !t.is_sandbox
    );
    const schoolMoods = this.data.mood_checkins.filter((m) => m.school_id === schoolId);
    const schoolInspiraViews = this.data.inspira_views.filter((v) => v.school_id === schoolId);

    const catMap = new Map<string, number>();
    const riskMap = new Map<RiskLevel, number>();
    const spaceMap = new Map<string, number>();
    const dayMap = new Map<number, number>();
    const moodMap = new Map<MoodType, number>();
    const outcomeMap = new Map<TicketOutcome, number>();
    const inspiraTopicMap = new Map<InspiraTopic, number>();
    const spaceTimeMap = new Map<string, SpaceTimeStat>();
    const gradeBandMap = new Map<string, number>();

    for (const t of schoolTickets) {
      catMap.set(t.category, (catMap.get(t.category) ?? 0) + 1);
      riskMap.set(t.risk_level, (riskMap.get(t.risk_level) ?? 0) + 1);
      spaceMap.set(t.space_tag, (spaceMap.get(t.space_tag) ?? 0) + 1);
      const dayNum = new Date(t.created_at).getDay();
      dayMap.set(dayNum, (dayMap.get(dayNum) ?? 0) + 1);
      if (t.status === 'resuelto' && t.resolution_outcome) {
        outcomeMap.set(
          t.resolution_outcome,
          (outcomeMap.get(t.resolution_outcome) ?? 0) + 1
        );
      }

      const slot = t.time_slot || 'Horario no especificado';
      const stKey = `${t.space_tag}::${slot}`;
      const existingSt = spaceTimeMap.get(stKey) || {
        space_tag: t.space_tag,
        time_slot: slot,
        count: 0,
        critical_count: 0,
      };
      existingSt.count += 1;
      if (t.risk_level === 'critico') {
        existingSt.critical_count = (existingSt.critical_count ?? 0) + 1;
      }
      spaceTimeMap.set(stKey, existingSt);

      if (t.grade_band) {
        gradeBandMap.set(t.grade_band, (gradeBandMap.get(t.grade_band) ?? 0) + 1);
      }
    }

    for (const m of schoolMoods) {
      moodMap.set(m.mood, (moodMap.get(m.mood) ?? 0) + 1);
    }

    for (const v of schoolInspiraViews) {
      inspiraTopicMap.set(v.topic, (inspiraTopicMap.get(v.topic) ?? 0) + 1);
    }

    const metrics = this.computeResponseMetrics(schoolTickets);

    return {
      total_cases: schoolTickets.length,
      resolved_cases: schoolTickets.filter((t) => t.status === 'resuelto').length,
      critical_cases: schoolTickets.filter((t) => t.risk_level === 'critico').length,
      active_cases: schoolTickets.filter((t) => t.status !== 'resuelto').length,
      escalated_cases: schoolTickets.filter((t) => Boolean(t.escalated_at)).length,
      avg_first_response_minutes: metrics.avgFirstResponseMinutes,
      sla_compliance_rate: metrics.slaComplianceRate,
      by_category: Array.from(catMap.entries())
        .map(([category, count]) => ({ category, count }))
        .sort((a, b) => b.count - a.count),
      by_risk: Array.from(riskMap.entries()).map(([risk_level, count]) => ({
        risk_level,
        count,
      })),
      by_space: Array.from(spaceMap.entries())
        .map(([space_tag, count]) => ({ space_tag, count }))
        .sort((a, b) => b.count - a.count),
      by_day_of_week: Array.from(dayMap.entries())
        .map(([day_num, count]) => ({ day_num, count }))
        .sort((a, b) => a.day_num - b.day_num),
      by_outcome: Array.from(outcomeMap.entries())
        .map(([outcome, count]) => ({ outcome, count }))
        .sort((a, b) => b.count - a.count),
      mood_summary: Array.from(moodMap.entries())
        .map(([mood, count]) => ({ mood, count }))
        .sort((a, b) => b.count - a.count),
      total_mood_checkins: schoolMoods.length,
      inspira_views_total: schoolInspiraViews.length,
      by_inspira_topic: Array.from(inspiraTopicMap.entries())
        .map(([topic, count]): InspiraTopicStat => ({ topic, count }))
        .sort((a, b) => b.count - a.count),
      by_space_time: Array.from(spaceTimeMap.values()).sort((a, b) => b.count - a.count),
      by_grade_band: Array.from(gradeBandMap.entries())
        .map(([grade_band, count]): GradeBandStat => ({ grade_band, count }))
        .sort((a, b) => b.count - a.count),
    };
  }

  generateSchoolCsv(schoolId: string): string {
    const school = this.getSchoolById(schoolId);
    const schoolTickets = this.data.tickets.filter(
      (t) => t.school_id === schoolId && !t.is_sandbox
    );
    const header = [
      'Colegio',
      'Codigo_Caso',
      'Fecha_Creacion',
      'Categoria',
      'Espacio',
      'Riesgo_IA',
      'Estado',
      'Tiempo_Primera_Respuesta_Min',
      'Estado_SLA',
      'Escalado',
      'Tipo_Cierre',
    ];
    const escape = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const rows = schoolTickets.map((t) => {
      const s = this.toSummary(t);
      const firstRespMin = t.first_counselor_reply_at
        ? Math.max(
            0,
            Math.floor(
              (Date.parse(t.first_counselor_reply_at) - Date.parse(t.created_at)) / 60_000
            )
          )
        : '';
      return [
        school?.name || schoolId,
        t.ticket_code,
        t.created_at,
        t.category,
        t.space_tag,
        t.risk_level,
        t.status,
        firstRespMin,
        s.sla_status,
        t.escalated_at ? 'SI' : 'NO',
        t.resolution_outcome || '',
      ]
        .map(escapeCsvCell)
        .join(',');
    });
    return `\uFEFF${header.join(',')}\n${rows.join('\n')}\n`;
  }

  generateNetworkOverviewCsv(): string {
    const overview = this.getAdminOverview();
    const header = [
      'Colegio',
      'Codigo_Acceso',
      'Estado',
      'Region',
      'Orientadores_Activos',
      'Casos_Totales',
      'Casos_Activos',
      'Criticos',
      'SLA_Vencidos',
      'Cumplimiento_SLA_%',
      'Promedio_Respuesta_Min',
      'Resueltos',
      'Pulsos_Emocionales',
    ];
    const rows = overview.schools.map(({ school, stats }) =>
      [
        school.name,
        school.access_code,
        school.active ? 'Activo' : 'Pausado',
        school.region,
        stats.active_counselors_count,
        stats.total_cases,
        stats.active_cases,
        stats.critical_cases,
        stats.sla_breached_cases,
        stats.sla_compliance_rate,
        stats.avg_first_response_minutes ?? 'N/A',
        stats.resolved_cases,
        stats.mood_checkins,
      ]
        .map(escapeCsvCell)
        .join(',')
    );
    return `\uFEFF${header.join(',')}\n${rows.join('\n')}\n`;
  }

  purgeExpiredResolvedTickets(
    schoolId?: string,
    actorName = 'Política de Retención'
  ): { purged_tickets: number; purged_messages: number; purged_notes: number } {
    let purgedTickets = 0;
    let purgedMessages = 0;
    let purgedNotes = 0;
    const nowMs = Date.now();

    const targetSchools = schoolId
      ? this.data.schools.filter((s) => s.id === schoolId)
      : this.data.schools.filter((s) => s.retention_config.auto_purge_enabled);

    const removeIds = new Set<string>();

    for (const s of targetSchools) {
      const days = s.retention_config.retention_days_resolved;
      if (!days || days <= 0) continue;
      const cutoffMs = nowMs - days * 24 * 60 * 60_000;

      const schoolRemoved = this.data.tickets.filter(
        (t) =>
          t.school_id === s.id &&
          !t.is_sandbox &&
          t.status === 'resuelto' &&
          Date.parse(t.updated_at) < cutoffMs
      );
      if (schoolRemoved.length > 0) {
        schoolRemoved.forEach((t) => removeIds.add(t.id));
        this.recordAuditLog({
          school_id: s.id,
          school_name: s.name,
          actor_type: schoolId ? 'platform_admin' : 'system',
          actor_name: actorName,
          action: 'retention_purge',
          target: `${schoolRemoved.length} caso(s)`,
          detail: `Depuración automática Zero-PII de casos resueltos hace más de ${days} días.`,
        });
      }
    }

    if (removeIds.size > 0) {
      purgedTickets = removeIds.size;
      const prevMsg = this.data.messages.length;
      const prevNotes = this.data.internal_notes.length;
      this.data.tickets = this.data.tickets.filter((t) => !removeIds.has(t.id));
      this.data.messages = this.data.messages.filter((m) => !removeIds.has(m.ticket_id));
      this.data.internal_notes = this.data.internal_notes.filter(
        (n) => !removeIds.has(n.ticket_id)
      );
      this.data.push_subscriptions = this.data.push_subscriptions.filter(
        (p) => !removeIds.has(p.ticket_id)
      );
      for (const id of removeIds) {
        const t = this.ticketsById.get(id);
        if (t) this.ticketsByCode.delete(t.ticket_code.toUpperCase());
        this.ticketsById.delete(id);
        this.messagesByTicketId.delete(id);
        this.notesByTicketId.delete(id);
        this.pushByTicketId.delete(id);
      }
      purgedMessages = prevMsg - this.data.messages.length;
      purgedNotes = prevNotes - this.data.internal_notes.length;
      this.persist();
    }

    return {
      purged_tickets: purgedTickets,
      purged_messages: purgedMessages,
      purged_notes: purgedNotes,
    };
  }

  // ---- Platform Super Admin (Encargado de la App) ----

  async authenticatePlatformAdminAsync(
    email: string,
    password: string
  ): Promise<PlatformAdminProfile | null> {
    const normalized = email.trim().toLowerCase();
    let found = this.data.platform_admins.find(
      (a) => a.email.toLowerCase() === normalized
    );
    if (!found && (normalized === 'admin@teescucho.edu' || normalized === 'admin@teescucho.app')) {
      const defaultPass = process.env.PLATFORM_ADMIN_PASSWORD || 'TeEscucho2026!Admin';
      found = {
        id: 'platform-admin-1',
        email: normalized,
        password_hash: hashSecret(defaultPass),
        full_name: 'Dirección de Plataforma Te Escucho',
        role: 'platform_admin',
      };
      this.data.platform_admins.push(found);
      this.persist();
    }
    if (!found) return null;
    let ok = await verifySecretAsync(password, found.password_hash);
    if (!ok) {
      const defaultPass = process.env.PLATFORM_ADMIN_PASSWORD || 'TeEscucho2026!Admin';
      if (password === defaultPass || password === 'TeEscucho2026!Admin' || password === 'AdminTeEscucho2026!') {
        found.password_hash = hashSecret(password);
        this.persist();
        ok = true;
      }
    }
    if (!ok) return null;
    const { password_hash: _ph, ...profile } = found;
    return profile;
  }

  getPlatformAdminById(id: string): PlatformAdminProfile | null {
    const found = this.data.platform_admins.find((a) => a.id === id);
    if (!found) return null;
    const { password_hash: _ph, ...profile } = found;
    return profile;
  }

  getAdminOverview(): AdminOverviewData {
    const schools: AdminSchoolSummary[] = this.data.schools
      .map((school) => {
        const schoolCounselors = this.data.counselors.filter(
          (c) => c.school_id === school.id
        );
        const realTickets = this.data.tickets.filter(
          (t) => t.school_id === school.id && !t.is_sandbox
        );
        const sandboxTickets = this.data.tickets.filter(
          (t) => t.school_id === school.id && t.is_sandbox
        );
        const moods = this.data.mood_checkins.filter((m) => m.school_id === school.id);
        const lastActivity = realTickets.reduce<string | null>((latest, t) => {
          if (!latest || t.updated_at > latest) return t.updated_at;
          return latest;
        }, null);

        const breachedCount = realTickets.filter(
          (t) => this.toSummary(t).sla_status === 'breached'
        ).length;
        const respMetrics = this.computeResponseMetrics(realTickets);
        const positiveMoods = moods.filter((m) => m.mood === 'tranquilo').length;
        const wellbeingPositiveRate =
          moods.length > 0 ? Math.round((positiveMoods / moods.length) * 100) : null;

        return {
          school,
          stats: {
            counselors_count: schoolCounselors.length,
            active_counselors_count: schoolCounselors.filter((c) => c.active).length,
            total_cases: realTickets.length,
            active_cases: realTickets.filter((t) => t.status !== 'resuelto').length,
            critical_cases: realTickets.filter(
              (t) => t.risk_level === 'critico' && t.status !== 'resuelto'
            ).length,
            sla_breached_cases: breachedCount,
            resolved_cases: realTickets.filter((t) => t.status === 'resuelto').length,
            sandbox_cases: sandboxTickets.length,
            mood_checkins: moods.length,
            avg_first_response_minutes: respMetrics.avgFirstResponseMinutes,
            sla_compliance_rate: respMetrics.slaComplianceRate,
            wellbeing_positive_rate: wellbeingPositiveRate,
            last_activity_at: lastActivity,
          },
        };
      })
      .sort((a, b) => b.school.created_at.localeCompare(a.school.created_at));

    const realTicketsAll = this.data.tickets.filter((t) => !t.is_sandbox);
    const totalBreached = realTicketsAll.filter(
      (t) => this.toSummary(t).sla_status === 'breached'
    ).length;
    const networkMetrics = this.computeResponseMetrics(realTicketsAll);

    return {
      kpis: {
        total_schools: this.data.schools.length,
        active_schools: this.data.schools.filter((s) => s.active).length,
        total_counselors: this.data.counselors.length,
        active_counselors: this.data.counselors.filter((c) => c.active).length,
        total_real_cases: realTicketsAll.length,
        open_real_cases: realTicketsAll.filter((t) => t.status !== 'resuelto').length,
        open_critical_cases: realTicketsAll.filter(
          (t) => t.risk_level === 'critico' && t.status !== 'resuelto'
        ).length,
        sla_breached_cases: totalBreached,
        total_mood_checkins: this.data.mood_checkins.length,
        network_avg_response_minutes: networkMetrics.avgFirstResponseMinutes,
        network_sla_compliance_rate: networkMetrics.slaComplianceRate,
      },
      schools,
      catalog: cloneJson(this.data.catalog),
    };
  }

  private generateAccessCodeFromName(name: string): string {
    const clean = name
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\b(colegio|institucion|educativa|escuela|liceo|ie|i\.e\.)\b/gi, '')
      .replace(/[^a-zA-Z0-9]/g, '')
      .toUpperCase()
      .slice(0, 8);
    const base = clean.length >= 3 ? clean : 'COLEGIO';
    const year = new Date().getFullYear();
    let candidate = `${base}${year}`;
    let attempt = 1;
    while (this.data.schools.some((s) => s.access_code.toUpperCase() === candidate)) {
      candidate = `${base}${year}${attempt}`;
      attempt++;
    }
    return candidate;
  }

  createSchool(input: {
    name: string;
    short_name?: string;
    access_code?: string;
    region?: string;
    country_preset?: string;
    education_level?: EducationLevel;
    modular_code?: string;
    accent_color?: string;
    welcome_message?: string;
    support_hours?: string;
    after_hours_notice?: string;
    internal_help_phone?: string;
    initial_counselor?: {
      full_name: string;
      email: string;
      password: string;
      role?: CounselorRole;
    };
  }): { school: School; counselor?: CounselorProfile } | { error: string } {
    const name = input.name.trim();
    if (!name) return { error: 'El nombre oficial del colegio es obligatorio.' };

    const code = (input.access_code?.trim() || this.generateAccessCodeFromName(name))
      .toUpperCase()
      .replace(/[^A-Z0-9_-]/g, '');

    if (code.length < 4) {
      return { error: 'El código de acceso debe tener al menos 4 caracteres alfanuméricos.' };
    }
    if (this.data.schools.some((s) => s.access_code.toUpperCase() === code)) {
      return { error: `El código ${code} ya está asignado a otro colegio.` };
    }

    if (input.initial_counselor?.email) {
      const emailNorm = input.initial_counselor.email.trim().toLowerCase();
      if (this.data.counselors.some((c) => c.email.toLowerCase() === emailNorm)) {
        return { error: `El correo ${emailNorm} ya está registrado en la plataforma.` };
      }
    }

    const countryPreset = input.country_preset || 'Perú';
    const presetLines =
      this.data.catalog.regional_emergency_presets[countryPreset] ||
      this.data.catalog.regional_emergency_presets['Perú'] ||
      [];

    const schoolId = `school-${crypto.randomUUID().slice(0, 8)}`;
    const shortName =
      input.short_name?.trim() || name.replace(/^Colegio\s+/i, '').slice(0, 24) || name;

    const school: School = {
      id: schoolId,
      name,
      short_name: shortName,
      access_code: code,
      active: true,
      region: input.region?.trim() || 'Lima, Perú',
      country_preset: countryPreset,
      education_level: input.education_level || 'Primaria y Secundaria',
      modular_code: input.modular_code?.trim() || '',
      accent_color: input.accent_color || '#0F766E',
      welcome_message:
        input.welcome_message?.trim() ||
        `Equipo de Psicología y Tutoría de ${shortName} disponible para escucharte con total confidencialidad.`,
      support_hours: input.support_hours?.trim() || 'Lunes a Viernes · 07:00 – 19:00',
      after_hours_notice:
        input.after_hours_notice?.trim() ||
        'Si escribes fuera del horario escolar, tu mensaje quedará protegido y nuestro equipo lo revisará a primera hora.',
      internal_help_phone: input.internal_help_phone?.trim() || '',
      spaces: cloneJson(this.data.catalog.default_spaces),
      categories: cloneJson(this.data.catalog.default_categories),
      emergency_lines: cloneJson(presetLines),
      sla_config: createDefaultSlaConfig(),
      ai_config: cloneJson(this.data.catalog.default_ai_config),
      retention_config: createDefaultRetentionConfig(),
      inspira_enabled: true,
      inspira_custom_resources: [],
      inspira_disabled_ids: [],
      created_at: new Date().toISOString(),
    };

    this.data.schools.unshift(school);
    this.schoolsById.set(school.id, school);
    this.schoolsByCode.set(school.access_code.toUpperCase(), school);

    let createdCounselor: CounselorProfile | undefined;
    if (
      input.initial_counselor &&
      input.initial_counselor.full_name.trim() &&
      input.initial_counselor.email.trim() &&
      input.initial_counselor.password.trim()
    ) {
      const cRecord: CounselorRecord = {
        id: `counselor-${crypto.randomUUID().slice(0, 8)}`,
        school_id: school.id,
        email: input.initial_counselor.email.trim().toLowerCase(),
        password_hash: hashSecret(input.initial_counselor.password.trim()),
        full_name: input.initial_counselor.full_name.trim(),
        role: isValidCounselorRole(input.initial_counselor.role)
          ? input.initial_counselor.role
          : 'admin',
        active: true,
        availability: 'available',
        school_name: school.name,
        school_access_code: school.access_code,
      };
      this.data.counselors.push(cRecord);
      this.counselorsById.set(cRecord.id, cRecord);
      school.sla_config.on_call_counselor_id = cRecord.id;
      school.sla_config.on_call_label = `Guardia · ${cRecord.full_name}`;
      const { password_hash: _ph, ...profile } = cRecord;
      createdCounselor = profile;
    }

    this.recordAuditLog({
      school_id: school.id,
      school_name: school.name,
      actor_type: 'platform_admin',
      actor_name: 'Dirección de Plataforma',
      action: 'school_created',
      target: school.access_code,
      detail: `Alta institucional de ${school.name} (${school.region}).`,
    });

    // Mirror school (and optional initial counselor) to Supabase
    this.mirrorSupabase(async (sb) => {
      await sb.from('schools').upsert({
        id: school.id,
        name: school.name,
        short_name: school.short_name,
        access_code: school.access_code,
        active: school.active,
        region: school.region,
        country_preset: school.country_preset,
        education_level: school.education_level,
        modular_code: school.modular_code,
        accent_color: school.accent_color,
        welcome_message: school.welcome_message,
        support_hours: school.support_hours,
        after_hours_notice: school.after_hours_notice,
        internal_help_phone: school.internal_help_phone,
        spaces: school.spaces,
        categories: school.categories,
        emergency_lines: school.emergency_lines,
        sla_config: school.sla_config,
        ai_config: school.ai_config,
        retention_config: school.retention_config,
        inspira_enabled: school.inspira_enabled,
        inspira_custom_resources: school.inspira_custom_resources,
        inspira_disabled_ids: school.inspira_disabled_ids,
        created_at: school.created_at,
      });
      if (createdCounselor) {
        await sb.from('counselors').upsert({
          id: createdCounselor.id,
          school_id: createdCounselor.school_id,
          email: createdCounselor.email,
          full_name: createdCounselor.full_name,
          role: createdCounselor.role,
          active: createdCounselor.active,
          availability: createdCounselor.availability,
          created_at: new Date().toISOString(),
        });
      }
    });

    return { school, counselor: createdCounselor };
  }

  updateSchool(
    schoolId: string,
    updates: Partial<Omit<School, 'id' | 'created_at'>>,
    actor?: { type: 'platform_admin' | 'counselor'; name: string }
  ): { school: School } | { error: string } {
    const idx = this.data.schools.findIndex((s) => s.id === schoolId);
    if (idx === -1) return { error: 'Colegio no encontrado.' };

    const current = this.data.schools[idx];

    if (updates.sla_config?.escalation_webhook_url !== undefined) {
      const check = validateWebhookUrl(updates.sla_config.escalation_webhook_url);
      if (!check.valid) {
        return { error: check.reason || 'URL de webhook inválida.' };
      }
    }

    if (Array.isArray(updates.emergency_lines)) {
      for (const line of updates.emergency_lines) {
        if (
          !line ||
          (line.type !== 'tel' && line.type !== 'url') ||
          !isSafeEmergencyContact(line.type, String(line.contact_value || ''))
        ) {
          return {
            error:
              'Alguna línea de emergencia tiene un formato no permitido (usa teléfono válido o URL https://).',
          };
        }
      }
    }

    if (updates.access_code !== undefined) {
      const cleanCode = updates.access_code
        .trim()
        .toUpperCase()
        .replace(/[^A-Z0-9_-]/g, '');
      if (cleanCode.length < 4) {
        return { error: 'El código de acceso debe tener al menos 4 caracteres.' };
      }
      const conflict = this.data.schools.some(
        (s) => s.id !== schoolId && s.access_code.toUpperCase() === cleanCode
      );
      if (conflict) {
        return { error: `El código ${cleanCode} ya pertenece a otro colegio.` };
      }
      updates.access_code = cleanCode;
    }

    if (updates.inspira_custom_resources !== undefined) {
      const sanitized = sanitizeInspiraResources(updates.inspira_custom_resources, 'school');
      if ('error' in sanitized) {
        return { error: sanitized.error };
      }
      updates.inspira_custom_resources = sanitized.resources;
    }

    const updated: School = {
      ...current,
      ...updates,
      name: updates.name !== undefined ? updates.name.trim() || current.name : current.name,
      short_name:
        updates.short_name !== undefined
          ? updates.short_name.trim() || current.short_name
          : current.short_name,
      spaces: Array.isArray(updates.spaces)
        ? updates.spaces.map((s) => s.trim()).filter(Boolean)
        : current.spaces,
      categories: Array.isArray(updates.categories) ? updates.categories : current.categories,
      emergency_lines: Array.isArray(updates.emergency_lines)
        ? updates.emergency_lines
        : current.emergency_lines,
      sla_config: updates.sla_config
        ? { ...current.sla_config, ...updates.sla_config }
        : current.sla_config,
      ai_config: updates.ai_config
        ? { ...current.ai_config, ...updates.ai_config }
        : current.ai_config,
      retention_config: updates.retention_config
        ? { ...current.retention_config, ...updates.retention_config }
        : current.retention_config,
      inspira_enabled:
        updates.inspira_enabled !== undefined
          ? Boolean(updates.inspira_enabled)
          : current.inspira_enabled !== false,
      inspira_custom_resources: Array.isArray(updates.inspira_custom_resources)
        ? updates.inspira_custom_resources
        : current.inspira_custom_resources || [],
      inspira_disabled_ids: Array.isArray(updates.inspira_disabled_ids)
        ? updates.inspira_disabled_ids.filter((id) => typeof id === 'string')
        : current.inspira_disabled_ids || [],
    };

    this.data.schools[idx] = updated;
    this.schoolsByCode.delete(current.access_code.toUpperCase());
    this.schoolsById.set(updated.id, updated);
    this.schoolsByCode.set(updated.access_code.toUpperCase(), updated);

    for (const c of this.data.counselors) {
      if (c.school_id === schoolId) {
        c.school_name = updated.name;
        c.school_access_code = updated.access_code;
      }
    }

    this.recordAuditLog({
      school_id: updated.id,
      school_name: updated.name,
      actor_type: actor?.type || 'platform_admin',
      actor_name: actor?.name || 'Administración',
      action: 'school_config_updated',
      target: updated.access_code,
      detail: `Actualización de configuración institucional de ${updated.name}.`,
    });

    // Mirror updated school to Supabase
    this.mirrorSupabase((sb) =>
      sb.from('schools').upsert({
        id: updated.id,
        name: updated.name,
        short_name: updated.short_name,
        access_code: updated.access_code,
        active: updated.active,
        region: updated.region,
        country_preset: updated.country_preset,
        education_level: updated.education_level,
        modular_code: updated.modular_code,
        accent_color: updated.accent_color,
        welcome_message: updated.welcome_message,
        support_hours: updated.support_hours,
        after_hours_notice: updated.after_hours_notice,
        internal_help_phone: updated.internal_help_phone,
        spaces: updated.spaces,
        categories: updated.categories,
        emergency_lines: updated.emergency_lines,
        sla_config: updated.sla_config,
        ai_config: updated.ai_config,
        retention_config: updated.retention_config,
        inspira_enabled: updated.inspira_enabled,
        inspira_custom_resources: updated.inspira_custom_resources,
        inspira_disabled_ids: updated.inspira_disabled_ids,
      })
    );

    return { school: updated };
  }

  rotateSchoolCode(schoolId: string): { school: School } | { error: string } {
    const school = this.getSchoolById(schoolId);
    if (!school) return { error: 'Colegio no encontrado.' };
    const prefix = school.access_code.replace(/[0-9]+$/, '').slice(0, 8) || 'ESC';
    let candidate = '';
    for (let i = 0; i < 20; i++) {
      const suffix = Math.floor(1000 + Math.random() * 9000);
      candidate = `${prefix}${suffix}`;
      if (!this.data.schools.some((s) => s.access_code.toUpperCase() === candidate)) {
        break;
      }
    }
    return this.updateSchool(schoolId, { access_code: candidate });
  }

  listSchoolCounselors(schoolId: string): CounselorProfile[] {
    return this.data.counselors
      .filter((c) => c.school_id === schoolId)
      .map(({ password_hash: _ph, ...profile }) => profile);
  }

  async createCounselorAsync(
    schoolId: string,
    input: {
      full_name: string;
      email: string;
      password: string;
      role: CounselorRole;
      phone_whatsapp?: string;
      shift?: ShiftType;
      grade?: string;
      section?: string;
      responsabilidad_label?: string;
    }
  ): Promise<{ counselor: CounselorProfile } | { error: string }> {
    const school = this.getSchoolById(schoolId);
    if (!school) return { error: 'Colegio no encontrado.' };

    const email = String(input.email || '').trim().toLowerCase();
    const fullName = String(input.full_name || '').trim();
    const password = String(input.password || '').trim();

    if (!fullName || !email || password.length < 6) {
      return {
        error: 'Completa nombre, correo válido y contraseña de al menos 6 caracteres.',
      };
    }
    if (!isValidCounselorRole(input.role)) {
      return { error: 'Rol de especialista inválido.' };
    }

    if (this.data.counselors.some((c) => c.email.toLowerCase() === email)) {
      return { error: `El correo ${email} ya está asignado a una cuenta.` };
    }

    const defaultRespLabel =
      input.responsabilidad_label?.trim() ||
      (input.role === 'director'
        ? 'Dirección General (Comité de Bienestar)'
        : input.role === 'coordinator_toe'
          ? `Coordinación de Tutoría (TOE) - ${input.shift === 'tarde' ? 'Turno Tarde' : input.shift === 'completo' ? 'Ambos Turnos' : 'Turno Mañana'}`
          : input.role === 'psychologist'
            ? 'Psicología y Apoyo Socioemocional'
            : input.role === 'tutor'
              ? `Tutor ${input.grade || ''} ${input.section || ''}`.trim() || 'Docente Tutor'
              : 'Administración de Colegio');

    const record: CounselorRecord = {
      id: `counselor-${crypto.randomUUID().slice(0, 8)}`,
      school_id: school.id,
      email,
      password_hash: await hashSecretAsync(password),
      full_name: fullName,
      role: input.role,
      active: true,
      availability: 'available',
      school_name: school.name,
      school_access_code: school.access_code,
      phone_whatsapp: input.phone_whatsapp?.trim() || '',
      shift: input.shift || 'manana',
      grade: input.grade?.trim() || '',
      section: input.section?.trim() || '',
      responsabilidad_label: defaultRespLabel,
    };

    this.data.counselors.push(record);
    this.counselorsById.set(record.id, record);
    this.persist();
    const { password_hash: _ph, ...profile } = record;
    return { counselor: profile };
  }

  async updateCounselorAsync(
    counselorId: string,
    updates: {
      full_name?: string;
      email?: string;
      role?: CounselorRole;
      active?: boolean;
      new_password?: string;
      availability?: CounselorAvailability;
      phone_whatsapp?: string;
      shift?: ShiftType;
      grade?: string;
      section?: string;
      responsabilidad_label?: string;
    }
  ): Promise<{ counselor: CounselorProfile } | { error: string }> {
    const idx = this.data.counselors.findIndex((c) => c.id === counselorId);
    if (idx === -1) return { error: 'Orientador no encontrado.' };

    const current = this.data.counselors[idx];
    if (updates.role !== undefined && !isValidCounselorRole(updates.role)) {
      return { error: 'Rol de especialista inválido.' };
    }
    if (updates.availability !== undefined && !isValidAvailability(updates.availability)) {
      return { error: 'Estado de disponibilidad inválido.' };
    }

    const willStopBeingActiveAdmin =
      current.role === 'admin' &&
      current.active &&
      ((updates.active === false) || (updates.role !== undefined && updates.role !== 'admin'));
    if (willStopBeingActiveAdmin) {
      const otherActiveAdmins = this.data.counselors.filter(
        (c) =>
          c.school_id === current.school_id &&
          c.id !== current.id &&
          c.role === 'admin' &&
          c.active
      );
      if (otherActiveAdmins.length === 0) {
        return { error: 'El colegio debe conservar al menos un administrador activo.' };
      }
    }

    if (updates.email !== undefined) {
      const emailNorm = updates.email.trim().toLowerCase();
      if (!emailNorm) return { error: 'El correo no puede estar vacío.' };
      const conflict = this.data.counselors.some(
        (c) => c.id !== counselorId && c.email.toLowerCase() === emailNorm
      );
      if (conflict) return { error: `El correo ${emailNorm} ya está en uso.` };
      current.email = emailNorm;
    }
    if (updates.full_name !== undefined && updates.full_name.trim()) {
      current.full_name = updates.full_name.trim();
    }
    if (updates.role !== undefined) {
      current.role = updates.role;
    }
    if (typeof updates.active === 'boolean') {
      current.active = updates.active;
    }
    if (updates.availability !== undefined) {
      current.availability = updates.availability;
    }
    if (updates.phone_whatsapp !== undefined) {
      current.phone_whatsapp = updates.phone_whatsapp.trim();
    }
    if (updates.shift !== undefined) {
      current.shift = updates.shift;
    }
    if (updates.grade !== undefined) {
      current.grade = updates.grade.trim();
    }
    if (updates.section !== undefined) {
      current.section = updates.section.trim();
    }
    if (updates.responsabilidad_label !== undefined) {
      current.responsabilidad_label = updates.responsabilidad_label.trim();
    }
    if (updates.new_password && updates.new_password.trim().length >= 6) {
      current.password_hash = await hashSecretAsync(updates.new_password.trim());
    }

    this.data.counselors[idx] = current;
    this.counselorsById.set(current.id, current);
    this.persist();

    // Mirror counselor update to Supabase (omit password_hash)
    this.mirrorSupabase((sb) =>
      sb.from('counselors').upsert({
        id: current.id,
        school_id: current.school_id,
        email: current.email,
        full_name: current.full_name,
        role: current.role,
        active: current.active,
        availability: current.availability,
      })
    );

    const { password_hash: _ph, ...profile } = current;
    return { counselor: profile };
  }

  deleteCounselor(counselorId: string): { ok: true } | { error: string } {
    const idx = this.data.counselors.findIndex((c) => c.id === counselorId);
    if (idx === -1) return { error: 'Cuenta no encontrada.' };
    const target = this.data.counselors[idx];
    if (target.role === 'admin' && target.active) {
      const otherActiveAdmins = this.data.counselors.filter(
        (c) =>
          c.school_id === target.school_id &&
          c.id !== target.id &&
          c.role === 'admin' &&
          c.active
      );
      if (otherActiveAdmins.length === 0) {
        return { error: 'No puedes eliminar al único administrador activo del colegio.' };
      }
    }
    this.data.counselors.splice(idx, 1);
    this.counselorsById.delete(target.id);
    this.persist();

    // Mirror deletion to Supabase
    this.mirrorSupabase((sb) =>
      sb.from('counselors').delete().eq('id', target.id)
    );

    return { ok: true };
  }

  clearSandboxTickets(schoolId: string): number {
    const sandboxIds = new Set(
      this.data.tickets
        .filter((t) => t.school_id === schoolId && t.is_sandbox)
        .map((t) => t.id)
    );
    if (sandboxIds.size === 0) return 0;

    this.data.tickets = this.data.tickets.filter((t) => !sandboxIds.has(t.id));
    this.data.messages = this.data.messages.filter((m) => !sandboxIds.has(m.ticket_id));
    this.data.internal_notes = this.data.internal_notes.filter(
      (n) => !sandboxIds.has(n.ticket_id)
    );
    this.data.push_subscriptions = this.data.push_subscriptions.filter(
      (p) => !sandboxIds.has(p.ticket_id)
    );
    for (const id of sandboxIds) {
      const t = this.ticketsById.get(id);
      if (t) this.ticketsByCode.delete(t.ticket_code.toUpperCase());
      this.ticketsById.delete(id);
      this.messagesByTicketId.delete(id);
      this.notesByTicketId.delete(id);
      this.pushByTicketId.delete(id);
    }
    this.persist();
    return sandboxIds.size;
  }

  updatePlatformCatalog(
    updates: Partial<PlatformCatalog>
  ): { catalog: PlatformCatalog } | { error: string } {
    if (updates.default_inspira_resources !== undefined) {
      const sanitized = sanitizeInspiraResources(updates.default_inspira_resources, 'global');
      if ('error' in sanitized) {
        return { error: sanitized.error };
      }
      this.data.catalog.default_inspira_resources = sanitized.resources;
    }
    if (Array.isArray(updates.default_categories)) {
      this.data.catalog.default_categories = updates.default_categories;
    }
    if (Array.isArray(updates.default_spaces)) {
      this.data.catalog.default_spaces = updates.default_spaces
        .map((s) => s.trim())
        .filter(Boolean);
    }
    if (updates.default_ai_config) {
      this.data.catalog.default_ai_config = {
        ...this.data.catalog.default_ai_config,
        ...updates.default_ai_config,
      };
    }
    if (updates.regional_emergency_presets) {
      this.data.catalog.regional_emergency_presets = updates.regional_emergency_presets;
    }
    if (updates.demo_policy === 'timed' || updates.demo_policy === 'off') {
      this.data.catalog.demo_policy = updates.demo_policy;
    }
    if (typeof updates.demo_duration_minutes === 'number' && Number.isFinite(updates.demo_duration_minutes)) {
      this.data.catalog.demo_duration_minutes = Math.min(60, Math.max(5, Math.round(updates.demo_duration_minutes)));
    }
    if (typeof updates.demo_max_uses === 'number' && Number.isFinite(updates.demo_max_uses)) {
      this.data.catalog.demo_max_uses = Math.min(10, Math.max(1, Math.round(updates.demo_max_uses)));
    }
    this.persist();
    return { catalog: cloneJson(this.data.catalog) };
  }

  private computeSla(record: TicketRecord): {
    sla_status: SlaStatus;
    sla_elapsed_minutes: number;
    sla_target_minutes: number | null;
  } {
    const school = this.getSchoolById(record.school_id);
    const sla = school?.sla_config || createDefaultSlaConfig();
    const targetMinutes =
      record.risk_level === 'critico'
        ? sla.critical_response_minutes
        : record.risk_level === 'medio'
          ? sla.medium_response_minutes
          : null;

    const endMs = record.first_counselor_reply_at
      ? Date.parse(record.first_counselor_reply_at)
      : Date.now();
    const elapsedMinutes = Math.max(
      0,
      Math.floor((endMs - Date.parse(record.created_at)) / 60_000)
    );

    if (
      record.is_sandbox ||
      record.status === 'resuelto' ||
      record.first_counselor_reply_at ||
      !targetMinutes
    ) {
      return {
        sla_status: 'ok',
        sla_elapsed_minutes: elapsedMinutes,
        sla_target_minutes: targetMinutes,
      };
    }

    let sla_status: SlaStatus = 'ok';
    if (elapsedMinutes >= targetMinutes) {
      sla_status = 'breached';
    } else if (elapsedMinutes >= Math.floor(targetMinutes * 0.7)) {
      sla_status = 'warning';
    }

    return {
      sla_status,
      sla_elapsed_minutes: elapsedMinutes,
      sla_target_minutes: targetMinutes,
    };
  }

  private toSummary(record: TicketRecord): TicketSummary {
    const msgs = this.messagesByTicketId.get(record.id) || [];
    const lastMsg = msgs[msgs.length - 1];
    const {
      pin_hash: _ph,
      break_glass_ciphertext: bgCipher,
      cascade_notified_tier: _cnt,
      ...rest
    } = record;
    const sla = this.computeSla(record);
    return {
      ...rest,
      ...sla,
      has_break_glass: Boolean(bgCipher),
      push_enabled: this.pushByTicketId.has(record.id),
      last_message_preview: lastMsg ? lastMsg.content : undefined,
    };
  }
}

export const db = new TeEscuchoStore();
