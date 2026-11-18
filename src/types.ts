export type RiskLevel = 'bajo' | 'medio' | 'critico';
export type TicketStatus = 'nuevo' | 'en_curso' | 'resuelto';
export type SenderRole = 'student' | 'counselor';
export type MoodType = 'tranquilo' | 'preocupado' | 'triste' | 'excluido' | 'en_alerta';

export type SpaceTag = string;

export type CounselorRole = 'director' | 'coordinator_toe' | 'psychologist' | 'tutor' | 'admin';
export type ShiftType = 'manana' | 'tarde' | 'completo';
export type CounselorAvailability = 'available' | 'busy' | 'off_duty';
export type SlaStatus = 'ok' | 'warning' | 'breached';
export type AiSensitivity = 'conservador' | 'estandar' | 'alta';
export type TicketOutcome =
  | 'acompanamiento_exitoso'
  | 'resuelto_tutoria'
  | 'derivacion_externa'
  | 'falsa_alerta'
  | 'otro';

export type CategoryIconKey = 'users' | 'alert' | 'eye' | 'heart' | 'shield' | 'message';
export type CategoryTone = 'sky' | 'amber' | 'emerald' | 'teal' | 'rose';
export type EducationLevel = 'Primaria' | 'Secundaria' | 'Primaria y Secundaria' | 'Otro';

export type InspiraTopic = 'autoestima' | 'ciberacoso' | 'limites' | 'calma' | 'pedir_ayuda';
export type InspiraFormat = 'capsula' | 'video' | 'ejercicio';

export interface InspiraResource {
  id: string;
  title: string;
  summary: string;
  body: string;
  topic: InspiraTopic;
  format: InspiraFormat;
  duration_label: string;
  youtube_id?: string;
  affirmation?: string;
  scope?: 'global' | 'school';
  active: boolean;
}

export interface InspiraTopicStat {
  topic: InspiraTopic;
  count: number;
}

export interface CategoryConfig {
  id: string;
  title: string;
  description: string;
  icon: CategoryIconKey;
  tone: CategoryTone;
  default_risk: RiskLevel;
  allowed_roles: CounselorRole[];
  active: boolean;
}

export interface EmergencyLineConfig {
  id: string;
  name: string;
  subtitle: string;
  contact_value: string;
  type: 'tel' | 'url';
  highlight: 'rose' | 'teal' | 'neutral';
  active: boolean;
}

export interface SlaConfig {
  critical_response_minutes: number;
  medium_response_minutes: number;
  escalation_contact_name: string;
  escalation_contact_email: string;
  escalation_webhook_url: string;
  on_call_counselor_id: string;
  on_call_label: string;
}

export interface AiCalibrationConfig {
  sensitivity: AiSensitivity;
  critical_keywords: string[];
  empathy_assistant_enabled: boolean;
  custom_guidance_tone: string;
}

export interface RetentionConfig {
  retention_days_resolved: number;
  auto_purge_enabled: boolean;
  require_closure_outcome: boolean;
}

export interface School {
  id: string;
  name: string;
  short_name: string;
  access_code: string;
  active: boolean;
  region: string;
  country_preset: string;
  education_level: EducationLevel;
  modular_code: string;
  accent_color: string;
  welcome_message: string;
  support_hours: string;
  after_hours_notice: string;
  internal_help_phone: string;
  spaces: string[];
  categories: CategoryConfig[];
  emergency_lines: EmergencyLineConfig[];
  sla_config: SlaConfig;
  ai_config: AiCalibrationConfig;
  retention_config: RetentionConfig;
  inspira_enabled?: boolean;
  inspira_custom_resources?: InspiraResource[];
  inspira_disabled_ids?: string[];
  created_at: string;
}

export interface PublicStaffMember {
  id: string;
  full_name: string;
  role: CounselorRole;
  shift?: ShiftType;
  grade?: string;
  section?: string;
  responsabilidad_label?: string;
}

export interface PublicSchoolConfig {
  id: string;
  name: string;
  short_name: string;
  access_code: string;
  region: string;
  education_level: EducationLevel;
  accent_color: string;
  welcome_message: string;
  support_hours: string;
  after_hours_notice: string;
  internal_help_phone: string;
  spaces: string[];
  categories: CategoryConfig[];
  emergency_lines: EmergencyLineConfig[];
  empathy_assistant_enabled?: boolean;
  require_closure_outcome?: boolean;
  inspira_enabled?: boolean;
  inspira_resources?: InspiraResource[];
  staff_directory?: PublicStaffMember[];
}

export type DemoPolicy = 'timed' | 'off';

export interface PlatformCatalog {
  default_categories: CategoryConfig[];
  default_spaces: string[];
  default_ai_config: AiCalibrationConfig;
  regional_emergency_presets: Record<string, EmergencyLineConfig[]>;
  default_inspira_resources?: InspiraResource[];
  demo_policy?: DemoPolicy;
  demo_duration_minutes?: number;
  demo_max_uses?: number;
}

export type StudentPaceMode = 'discreet_help' | 'listen_only';
export type StudentIntent = 'for_me' | 'for_other' | 'unsure';
export type EmpathyTone =
  | 'contencion_inicial'
  | 'validacion_ciberacoso'
  | 'riesgo_inmediato'
  | 'mensaje_puente';

export interface ChatMessage {
  id: string;
  ticket_id: string;
  sender_role: SenderRole;
  content: string;
  created_at: string;
}

export interface TicketSummary {
  id: string;
  school_id: string;
  ticket_code: string;
  category_id?: string | null;
  category: string;
  space_tag: SpaceTag;
  grade_band?: string | null;
  time_slot?: string | null;
  pace_mode?: StudentPaceMode;
  risk_level: RiskLevel;
  ai_suggestion: string | null;
  ai_rationale?: string | null;
  status: TicketStatus;
  is_sandbox?: boolean;
  push_enabled?: boolean;
  has_break_glass?: boolean;
  break_glass_unlocked_at?: string | null;
  break_glass_unlocked_by?: string | null;
  break_glass_reason?: string | null;
  first_counselor_reply_at?: string | null;
  last_counselor_reply_at?: string | null;
  last_student_reply_at?: string | null;
  escalated_at?: string | null;
  escalation_reason?: string | null;
  assigned_counselor_id?: string | null;
  assigned_counselor_name?: string | null;
  resolution_outcome?: TicketOutcome | null;
  resolution_note?: string | null;
  sla_status?: SlaStatus;
  sla_elapsed_minutes?: number;
  sla_target_minutes?: number | null;
  custody_claimed_at?: string | null;
  custody_claimed_role?: CounselorRole | null;
  reopened_by_student_at?: string | null;
  reopen_count?: number;
  user_intent?: StudentIntent | null;
  is_shared_device?: boolean;
  target_counselor_id?: string | null;
  target_counselor_name?: string | null;
  target_counselor_role_label?: string | null;
  whatsapp_notified_at?: string | null;
  whatsapp_notified_to?: string | null;
  whatsapp_escalated_at?: string | null;
  created_at: string;
  updated_at: string;
  last_message_preview?: string;
}

export interface TicketInternalNote {
  id: string;
  ticket_id: string;
  author_id: string;
  author_name: string;
  author_role: CounselorRole;
  content: string;
  created_at: string;
}

export interface AuditLogEntry {
  id: string;
  school_id: string | null;
  school_name: string;
  actor_type: 'platform_admin' | 'counselor' | 'system';
  actor_name: string;
  action: string;
  target: string;
  detail: string;
  created_at: string;
}

export interface CounselorProfile {
  id: string;
  school_id: string;
  email: string;
  full_name: string;
  role: CounselorRole;
  active: boolean;
  availability: CounselorAvailability;
  school_name: string;
  school_access_code: string;
  phone_whatsapp?: string;
  shift?: ShiftType;
  grade?: string;
  section?: string;
  responsabilidad_label?: string;
}

export type StaffAlertThreshold = 'criticos_y_sla' | 'criticos_y_medios' | 'todos';

export interface StaffPushHealth {
  total_devices: number;
  my_devices: number;
  on_call_devices: number;
  admin_devices: number;
  psychologist_devices: number;
  tutor_devices: number;
  current_device_threshold: StaffAlertThreshold | null;
}

export interface PlatformAdminProfile {
  id: string;
  email: string;
  full_name: string;
  role: 'platform_admin';
}

export interface AdminSchoolSummary {
  school: School;
  stats: {
    counselors_count: number;
    active_counselors_count: number;
    total_cases: number;
    active_cases: number;
    critical_cases: number;
    sla_breached_cases: number;
    resolved_cases: number;
    sandbox_cases: number;
    mood_checkins: number;
    avg_first_response_minutes: number | null;
    sla_compliance_rate: number;
    wellbeing_positive_rate: number | null;
    last_activity_at: string | null;
  };
}

export interface AdminOverviewData {
  kpis: {
    total_schools: number;
    active_schools: number;
    total_counselors: number;
    active_counselors: number;
    total_real_cases: number;
    open_real_cases: number;
    open_critical_cases: number;
    sla_breached_cases: number;
    total_mood_checkins: number;
    network_avg_response_minutes: number | null;
    network_sla_compliance_rate: number;
  };
  schools: AdminSchoolSummary[];
  catalog: PlatformCatalog;
}

export interface CategoryStat {
  category: string;
  count: number;
}

export interface RiskStat {
  risk_level: RiskLevel;
  count: number;
}

export interface SpaceStat {
  space_tag: string;
  count: number;
}

export interface DayStat {
  day_num: number;
  count: number;
}

export interface MoodStat {
  mood: MoodType;
  count: number;
}

export interface OutcomeStat {
  outcome: TicketOutcome;
  count: number;
}

export interface SpaceTimeStat {
  space_tag: string;
  time_slot: string;
  count: number;
  critical_count?: number;
}

export interface GradeBandStat {
  grade_band: string;
  count: number;
}

export interface SchoolAnalyticsData {
  total_cases: number;
  resolved_cases: number;
  critical_cases: number;
  active_cases: number;
  escalated_cases: number;
  avg_first_response_minutes: number | null;
  sla_compliance_rate: number;
  by_category: CategoryStat[];
  by_risk: RiskStat[];
  by_space: SpaceStat[];
  by_day_of_week: DayStat[];
  by_outcome: OutcomeStat[];
  by_space_time?: SpaceTimeStat[];
  by_grade_band?: GradeBandStat[];
  mood_summary: MoodStat[];
  total_mood_checkins: number;
  inspira_views_total?: number;
  by_inspira_topic?: InspiraTopicStat[];
}
