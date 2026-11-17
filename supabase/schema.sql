-- Te Escucho — Esquema Relacional PostgreSQL / Supabase (Zero-PII + Break-Glass + Radar Preventivo)
-- Ejecutar en Supabase SQL Editor antes de conectar SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY.

create extension if not exists pgcrypto;

create table if not exists public.platform_catalog (
  id smallint primary key default 1 check (id = 1),
  data jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.platform_admins (
  id text primary key,
  email text not null unique,
  full_name text not null,
  role text not null default 'platform_admin',
  password_hash text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.schools (
  id text primary key,
  name text not null,
  short_name text not null,
  access_code text not null unique,
  active boolean not null default true,
  region text not null default '',
  country_preset text not null default 'Perú',
  education_level text not null default 'Secundaria',
  modular_code text not null default '',
  accent_color text not null default '#0F766E',
  welcome_message text not null,
  support_hours text not null,
  after_hours_notice text not null,
  internal_help_phone text not null default '',
  spaces jsonb not null default '[]'::jsonb,
  categories jsonb not null default '[]'::jsonb,
  emergency_lines jsonb not null default '[]'::jsonb,
  sla_config jsonb not null,
  ai_config jsonb not null,
  retention_config jsonb not null,
  inspira_enabled boolean not null default true,
  inspira_custom_resources jsonb not null default '[]'::jsonb,
  inspira_disabled_ids jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.counselors (
  id text primary key,
  school_id text not null references public.schools(id) on delete cascade,
  email text not null unique,
  full_name text not null,
  role text not null check (role in ('psychologist', 'tutor', 'admin')),
  active boolean not null default true,
  availability text not null default 'available' check (availability in ('available', 'busy', 'off_duty')),
  password_hash text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_counselors_school on public.counselors(school_id, active);

create table if not exists public.tickets (
  id text primary key,
  school_id text not null references public.schools(id) on delete cascade,
  ticket_code text not null unique,
  pin_hash text not null,
  category_id text,
  category text not null,
  space_tag text not null,
  grade_band text,
  time_slot text,
  pace_mode text not null default 'discreet_help' check (pace_mode in ('discreet_help', 'listen_only')),
  risk_level text not null check (risk_level in ('bajo', 'medio', 'critico')),
  ai_suggestion text,
  ai_rationale text,
  status text not null check (status in ('nuevo', 'en_curso', 'resuelto')),
  is_sandbox boolean not null default false,
  first_counselor_reply_at timestamptz,
  last_counselor_reply_at timestamptz,
  last_student_reply_at timestamptz,
  escalated_at timestamptz,
  escalation_reason text,
  assigned_counselor_id text references public.counselors(id) on delete set null,
  assigned_counselor_name text,
  resolution_outcome text,
  resolution_note text,
  custody_claimed_at timestamptz,
  custody_claimed_role text,
  reopened_by_student_at timestamptz,
  reopen_count integer not null default 0,
  user_intent text,
  is_shared_device boolean not null default false,
  break_glass_ciphertext text,
  break_glass_unlocked_at timestamptz,
  break_glass_unlocked_by text,
  break_glass_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_tickets_school_updated on public.tickets(school_id, updated_at desc);
create index if not exists idx_tickets_status_risk on public.tickets(school_id, status, risk_level);

create table if not exists public.messages (
  id text primary key,
  ticket_id text not null references public.tickets(id) on delete cascade,
  sender_role text not null check (sender_role in ('student', 'counselor')),
  content text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_messages_ticket_created on public.messages(ticket_id, created_at asc);

create table if not exists public.internal_notes (
  id text primary key,
  ticket_id text not null references public.tickets(id) on delete cascade,
  author_id text not null,
  author_name text not null,
  author_role text not null,
  content text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_internal_notes_ticket on public.internal_notes(ticket_id, created_at asc);

create table if not exists public.push_subscriptions (
  id text primary key,
  ticket_id text not null unique references public.tickets(id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.staff_push_subscriptions (
  id text primary key,
  counselor_id text not null references public.counselors(id) on delete cascade,
  school_id text not null references public.schools(id) on delete cascade,
  role text not null check (role in ('psychologist', 'tutor', 'admin')),
  threshold text not null default 'criticos_y_sla' check (threshold in ('criticos_y_sla', 'criticos_y_medios', 'todos')),
  device_label text not null default 'Dispositivo',
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now(),
  last_notified_at timestamptz
);

create index if not exists idx_staff_push_school on public.staff_push_subscriptions(school_id, role);

create table if not exists public.mood_checkins (
  id text primary key,
  school_id text not null references public.schools(id) on delete cascade,
  mood text not null check (mood in ('tranquilo', 'preocupado', 'triste', 'excluido', 'en_alerta')),
  created_at timestamptz not null default now()
);

create index if not exists idx_mood_school_created on public.mood_checkins(school_id, created_at desc);

create table if not exists public.inspira_views (
  id text primary key,
  school_id text references public.schools(id) on delete cascade,
  topic text not null,
  format text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.audit_logs (
  id text primary key,
  school_id text references public.schools(id) on delete set null,
  school_name text not null,
  actor_type text not null check (actor_type in ('platform_admin', 'counselor', 'system')),
  actor_name text not null,
  action text not null,
  target text not null,
  detail text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_audit_school_created on public.audit_logs(school_id, created_at desc);

-- Endurecimiento Zero-PII: deshabilitar acceso público vía PostgREST anon key (solo el backend Express con SERVICE_ROLE_KEY accede).
alter table public.platform_catalog enable row level security;
alter table public.platform_admins enable row level security;
alter table public.schools enable row level security;
alter table public.counselors enable row level security;
alter table public.tickets enable row level security;
alter table public.messages enable row level security;
alter table public.internal_notes enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.staff_push_subscriptions enable row level security;
alter table public.mood_checkins enable row level security;
alter table public.inspira_views enable row level security;
alter table public.audit_logs enable row level security;

-- Semilla idempotente de colegios base para integridad referencial inmediata
insert into public.schools (
  id, name, short_name, access_code, active, region, country_preset,
  education_level, modular_code, accent_color, welcome_message,
  support_hours, after_hours_notice, internal_help_phone,
  sla_config, ai_config, retention_config
) values
(
  'school-san-jose-2026',
  'Colegio San José',
  'San José',
  'SANJOSE2026',
  true,
  'Lima, Perú',
  'Perú',
  'Primaria y Secundaria',
  '0491820',
  '#0F766E',
  'Nuestro equipo de Psicología y Tutoría te escucha con total confidencialidad. No estás solo.',
  'Lunes a Viernes · 07:00 – 19:00',
  'Si escribes fuera del horario escolar, tu mensaje quedará protegido y lo revisaremos a primera hora.',
  '',
  '{"critical_response_minutes":15,"medium_response_minutes":120,"escalation_contact_name":"Coordinación de Convivencia Escolar","escalation_contact_email":"convivencia@colegio.edu.pe","escalation_webhook_url":"","on_call_counselor_id":"counselor-maria-1","on_call_label":"Guardia Psicología · Lic. María Fernández"}'::jsonb,
  '{"sensitivity":"estandar","critical_keywords":["autolesion","suicidio","cuchillo","arma","amenaza","extorsion"],"empathy_assistant_enabled":true,"custom_guidance_tone":""}'::jsonb,
  '{"retention_days_resolved":180,"auto_purge_enabled":false,"require_closure_outcome":true}'::jsonb
),
(
  'school-santa-rosa-2026',
  'Colegio Santa Rosa',
  'Santa Rosa',
  'SANTAROSA2026',
  true,
  'Arequipa, Perú',
  'Perú',
  'Secundaria',
  '0612450',
  '#0369A1',
  'Departamento de Convivencia Escolar Santa Rosa. Cuéntanos con confianza lo que ocurre.',
  'Lunes a Viernes · 07:00 – 19:00',
  'Fuera de horario escolar respondemos al iniciar la jornada. En caso de peligro inmediato usa las líneas 24/7.',
  '',
  '{"critical_response_minutes":15,"medium_response_minutes":120,"escalation_contact_name":"Coordinación de Convivencia Escolar","escalation_contact_email":"convivencia@santarosa.edu.pe","escalation_webhook_url":"","on_call_counselor_id":"counselor-carlos-2","on_call_label":"Guardia Psicología · Lic. Carlos Mendoza"}'::jsonb,
  '{"sensitivity":"estandar","critical_keywords":["autolesion","suicidio","cuchillo","arma","amenaza","extorsion"],"empathy_assistant_enabled":true,"custom_guidance_tone":""}'::jsonb,
  '{"retention_days_resolved":180,"auto_purge_enabled":false,"require_closure_outcome":true}'::jsonb
)
on conflict (id) do nothing;

-- -------------------------------------------------------------------------------------------------
-- Actualización para bases de datos existentes (Alguien se hace cargo + Intención + Celular prestado)
-- -------------------------------------------------------------------------------------------------
alter table public.tickets add column if not exists custody_claimed_at timestamptz;
alter table public.tickets add column if not exists custody_claimed_role text;
alter table public.tickets add column if not exists reopened_by_student_at timestamptz;
alter table public.tickets add column if not exists reopen_count integer default 0;
alter table public.tickets add column if not exists user_intent text;
alter table public.tickets add column if not exists is_shared_device boolean default false;


