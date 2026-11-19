import React, { useCallback, useEffect, useState } from 'react';
import {
  BellRing,
  Building2,
  Clock,
  Database,
  Download,
  History,
  Key,
  Loader2,
  MapPin,
  Phone,
  Plus,
  Save,
  ShieldCheck,
  Sparkles,
  Trash2,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import { TeEscuchoLogo } from './TeEscuchoLogo';
import type {
  AuditLogEntry,
  CounselorProfile,
  CounselorRole,
  InspiraFormat,
  InspiraResource,
  InspiraTopic,
  RiskLevel,
  School,
  StaffPushHealth,
} from '../types';

interface SchoolSettingsPanelProps {
  token: string;
  currentCounselorId: string;
}

const ROLE_OPTIONS: Array<{ id: CounselorRole; label: string }> = [
  { id: 'psychologist', label: 'Coordinador/a de TOE' },
  { id: 'tutor', label: 'Docente Tutor/a de Aula' },
  { id: 'admin', label: 'Dirección / Administración' },
];

export const SchoolSettingsPanel: React.FC<SchoolSettingsPanelProps> = ({
  token,
  currentCounselorId,
}) => {
  const [school, setSchool] = useState<School | null>(null);
  const [team, setTeam] = useState<CounselorProfile[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const [newSpace, setNewSpace] = useState('');
  const [memberName, setMemberName] = useState('');
  const [memberEmail, setMemberEmail] = useState('');
  const [memberPass, setMemberPass] = useState('');
  const [memberRole, setMemberRole] = useState<CounselorRole>('psychologist');
  const [memberPhone, setMemberPhone] = useState('');
  const [memberShift, setMemberShift] = useState<'manana' | 'tarde' | 'completo'>('manana');
  const [memberGrade, setMemberGrade] = useState('');
  const [memberSection, setMemberSection] = useState('');
  const [memberRespLabel, setMemberRespLabel] = useState('');
  const [addingMember, setAddingMember] = useState(false);

  // Espacio Inspira school curation
  const [globalInspira, setGlobalInspira] = useState<InspiraResource[]>([]);
  const [inspTitle, setInspTitle] = useState('');
  const [inspSummary, setInspSummary] = useState('');
  const [inspBody, setInspBody] = useState('');
  const [inspTopic, setInspTopic] = useState<InspiraTopic>('autoestima');
  const [inspFormat, setInspFormat] = useState<InspiraFormat>('capsula');
  const [inspYoutubeInput, setInspYoutubeInput] = useState('');
  const [inspDuration, setInspDuration] = useState('2 min');

  // Propuesta E: Salud de Canales de Alerta y Prueba
  const [pushHealth, setPushHealth] = useState<StaffPushHealth | null>(null);
  const [testingPush, setTestingPush] = useState(false);
  const [pushTestNotice, setPushTestNotice] = useState<string | null>(null);

  const loadConfig = useCallback(async () => {
    setLoading(true);
    try {
      const [configRes, logsRes, pushRes] = await Promise.all([
        fetch('/api/school-admin/config', {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch('/api/school-admin/audit-logs', {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch('/api/counselor/push-status', {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);
      const data = await configRes.json();
      if (!configRes.ok) throw new Error(data.error || 'No se pudo cargar la configuración.');
      setSchool(data.school as School);
      setTeam(data.team as CounselorProfile[]);
      if (Array.isArray(data.global_inspira_resources)) {
        setGlobalInspira(data.global_inspira_resources as InspiraResource[]);
      }
      if (logsRes.ok) {
        const logsData = (await logsRes.json()) as { logs: AuditLogEntry[] };
        setAuditLogs(logsData.logs || []);
      }
      if (pushRes.ok) {
        const pushData = (await pushRes.json()) as { health?: StaffPushHealth };
        if (pushData.health) setPushHealth(pushData.health);
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Error de red.');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void loadConfig();
  }, [loadConfig]);

  const showSuccess = (msg: string) => {
    setErrorMsg(null);
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg((prev) => (prev === msg ? null : prev)), 4000);
  };

  const handleSaveSchool = async () => {
    if (!school) return;
    setSaving(true);
    setErrorMsg(null);
    try {
      const res = await fetch('/api/school-admin/config', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          welcome_message: school.welcome_message,
          support_hours: school.support_hours,
          after_hours_notice: school.after_hours_notice,
          internal_help_phone: school.internal_help_phone,
          spaces: school.spaces,
          categories: school.categories,
          sla_config: school.sla_config,
          retention_config: school.retention_config,
          inspira_enabled: school.inspira_enabled !== false,
          inspira_custom_resources: school.inspira_custom_resources || [],
          inspira_disabled_ids: school.inspira_disabled_ids || [],
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo guardar.');
      setSchool(data.school as School);
      await loadConfig();
      showSuccess('Configuración de tu colegio guardada correctamente.');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Error guardando cambios.');
    } finally {
      setSaving(false);
    }
  };

  const handleTestPushBell = async () => {
    setTestingPush(true);
    setPushTestNotice(null);
    setErrorMsg(null);
    try {
      const res = await fetch('/api/counselor/push-test', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo probar el canal Push.');
      if (data.health) setPushHealth(data.health as StaffPushHealth);
      if (data.message) {
        setPushTestNotice(data.message as string);
      } else {
        setPushTestNotice(
          `Alerta de prueba enviada a ${data.sent ?? 0} dispositivo(s) conectado(s) del colegio${
            data.expired ? ` (${data.expired} expirado(s) depurados)` : ''
          }.`
        );
      }
      await loadConfig();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Error probando canal de alertas.');
    } finally {
      setTestingPush(false);
    }
  };

  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddingMember(true);
    setErrorMsg(null);
    try {
      const res = await fetch('/api/school-admin/team', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          full_name: memberName,
          email: memberEmail,
          password: memberPass,
          role: memberRole,
          phone_whatsapp: memberPhone || undefined,
          shift: memberShift,
          grade: memberGrade || undefined,
          section: memberSection || undefined,
          responsabilidad_label: memberRespLabel || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo crear la cuenta.');
      setMemberName('');
      setMemberEmail('');
      setMemberPass('');
      setMemberPhone('');
      setMemberShift('manana');
      setMemberGrade('');
      setMemberSection('');
      setMemberRespLabel('');
      await loadConfig();
      showSuccess(`Cuenta creada para ${data.counselor.full_name}.`);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Error agregando miembro.');
    } finally {
      setAddingMember(false);
    }
  };

  const handleToggleMember = async (member: CounselorProfile) => {
    try {
      const res = await fetch(`/api/school-admin/team/${member.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ active: !member.active }),
      });
      if (!res.ok) throw new Error('No se pudo actualizar la cuenta.');
      await loadConfig();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Error actualizando miembro.');
    }
  };

  const handleDeleteMember = async (member: CounselorProfile) => {
    try {
      const res = await fetch(`/api/school-admin/team/${member.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo eliminar.');
      await loadConfig();
      showSuccess(`Se eliminó la cuenta de ${member.full_name}.`);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Error eliminando miembro.');
    }
  };

  const handleDownloadCredentials = () => {
    if (!school) return;
    const roleLabel: Record<string, string> = {
      director: 'Director / Directora',
      coordinator_toe: 'Coordinador/a de Tutoría (TOE)',
      psychologist: 'Psicólogo/a Escolar',
      tutor: 'Docente Tutor/a de Aula',
      admin: 'Administrador/a de Colegio',
    };
    const shiftLabel: Record<string, string> = {
      manana: 'Turno Mañana',
      tarde: 'Turno Tarde',
      completo: 'Jornada Completa',
    };
    const defaultSchoolPass = school.id === 'school-san-jose-2026' ? 'SanJose2026!' : 'SantaRosa2026!';
    const allMembers = team.filter((m) => m.active);
    const rows = allMembers
      .map((m) => {
        const gradeSec = m.grade ? `${m.grade}${m.section ? ' "' + m.section + '"' : ''}` : '—';
        const pwd = m.initial_password || defaultSchoolPass;
        return `
        <tr>
          <td><strong>${m.full_name}</strong></td>
          <td>${roleLabel[m.role] || m.role}</td>
          <td>${shiftLabel[m.shift || 'manana'] || m.shift || '—'}</td>
          <td>${gradeSec}</td>
          <td style="font-family:monospace;font-size:12px">${m.email}</td>
          <td style="font-family:monospace;font-size:13px;font-weight:700;color:#0f766e;background:#f0fdfa">${pwd}</td>
          <td>${m.phone_whatsapp || '—'}</td>
        </tr>`;
      })
      .join('');

    const peruDateFull = new Intl.DateTimeFormat('es-PE', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
      timeZone: 'America/Lima',
    }).format(new Date());

    const peruDateShort = new Intl.DateTimeFormat('es-PE', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      timeZone: 'America/Lima',
    }).format(new Date());

    const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8"/>
<title>Credenciales – ${school.name}</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:'Segoe UI',sans-serif;padding:32px;color:#1e293b;background:#fff}
  .actions-bar{display:flex;align-items:center;justify-content:space-between;background:#f0fdfa;border:1px solid #99f6e4;padding:12px 18px;border-radius:10px;margin-bottom:20px}
  .btn-print{background:#0d9488;color:#fff;border:none;padding:10px 18px;border-radius:8px;font-weight:700;font-size:12px;cursor:pointer;display:inline-flex;align-items:center;gap:6px}
  .btn-print:hover{background:#0f766e}
  .header{display:flex;align-items:center;justify-content:space-between;margin-bottom:24px;border-bottom:3px solid #0d9488;padding-bottom:16px}
  .logo-box{display:flex;align-items:center;gap:12px}
  .logo{font-size:22px;font-weight:800;color:#0d9488;letter-spacing:-0.5px}
  .logo span{color:#1e293b}
  .meta{font-size:11px;color:#64748b;text-align:right;line-height:1.6}
  h1{font-size:16px;font-weight:700;color:#1e293b;margin-bottom:4px}
  .badge{display:inline-block;background:#f0fdf4;border:1px solid #bbf7d0;color:#15803d;font-size:10px;font-weight:600;padding:2px 8px;border-radius:99px;margin-bottom:16px}
  table{width:100%;border-collapse:collapse;font-size:12px;margin-bottom:24px}
  th{background:#f8fafc;border:1px solid #e2e8f0;padding:8px 10px;text-align:left;font-size:11px;color:#475569;font-weight:600;text-transform:uppercase;letter-spacing:.5px}
  td{border:1px solid #e2e8f0;padding:8px 10px;vertical-align:top}
  tr:nth-child(even) td{background:#f8fafc}
  .url-box{background:#f1f5f9;border:1px solid #cbd5e1;border-radius:6px;padding:10px 14px;font-size:11px;color:#475569;margin-bottom:20px}
  .url-box strong{color:#0d9488}
  .warning{background:#fff7ed;border:1px solid #fed7aa;border-radius:6px;padding:10px 14px;font-size:11px;color:#9a3412;margin-top:12px}
  .footer{margin-top:24px;font-size:10px;color:#94a3b8;border-top:1px solid #e2e8f0;padding-top:12px}
  @media print{.actions-bar{display:none}body{padding:16px}.warning{display:none}}
</style>
</head>
<body>
<div class="actions-bar">
  <div style="font-size:12px;color:#0f766e">
    <strong>💡 Para guardar en PDF:</strong> Pulsa el botón verde y en la ventana de impresión elige <strong>"Guardar como PDF"</strong> en la opción <em>Destino</em>.
  </div>
  <button class="btn-print" onclick="window.print()">
    🖨️ Imprimir / Guardar en PDF
  </button>
</div>

<div class="header">
  <div class="logo-box">
    <svg width="44" height="44" viewBox="0 0 512 512" fill="none" style="vertical-align:middle">
      <rect width="512" height="512" rx="116" fill="#0F766E"/>
      <path d="M256 66L416 125V242C416 341 349 421 256 458C163 421 96 341 96 242V125L256 66Z" fill="#14B8A6" stroke="#5EEAD4" stroke-opacity="0.7" stroke-width="8" stroke-linejoin="round"/>
      <path d="M174 226C174 179 211 144 258 144C305 144 340 179 340 223C340 262 317 284 300 302C289 314 284 325 282 335C280 348 269 357 256 357C243 357 234 348 231 336" stroke="#E0F2FE" stroke-width="18" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M207 230C207 201 230 179 258 179C286 179 306 200 306 226C306 247 293 260 282 271" stroke="#A7F3D0" stroke-width="14" stroke-linecap="round"/>
      <path d="M254 288C254 288 224 267 224 246C224 235 232 227 242 227C248 227 252 230 254 234C256 230 260 227 266 227C276 227 284 235 284 246C284 267 254 288 254 288Z" fill="#FDE68A"/>
    </svg>
    <div>
      <div class="logo">Te <span>Escucho</span></div>
      <div style="font-size:11px;color:#64748b;margin-top:2px">Plataforma de Bienestar Escolar · MINEDU</div>
    </div>
  </div>
  <div class="meta">
    <strong>${school.name}</strong><br/>
    Código estudiantil: <strong>${school.access_code}</strong><br/>
    Generado: ${peruDateFull}
  </div>
</div>

<h1>Directorio de Credenciales — Equipo Orientador</h1>
<span class="badge">Uso Interno Exclusivo · Confidencial</span>

<div class="url-box">
  <strong>URL de acceso institucional:</strong>
  https://te-escucho-2rl4.onrender.com/?openStaff=1
</div>

<table>
  <thead>
    <tr>
      <th>Responsable</th>
      <th>Cargo</th>
      <th>Turno</th>
      <th>Grado / Sección</th>
      <th>Correo de Acceso</th>
      <th>Contraseña Oficial</th>
      <th>WhatsApp Alertas</th>
    </tr>
  </thead>
  <tbody>
    ${rows || '<tr><td colspan="7" style="text-align:center;color:#94a3b8">Sin miembros activos registrados</td></tr>'}
  </tbody>
</table>

<div class="warning">
  ⚠️ <strong>Documento confidencial.</strong> No compartir por correo ni redes sociales. Entregar personalmente a cada responsable.
</div>

<div class="footer">
  Generado automáticamente por la Plataforma Te Escucho &nbsp;·&nbsp; ${school.name} &nbsp;·&nbsp; Fecha local (Perú): ${peruDateShort}
</div>
<script>window.onload=()=>{window.print()}</script>
</body>
</html>`;

    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const win = window.open(url, '_blank');
    if (!win) {
      const a = document.createElement('a');
      a.href = url;
      a.download = `credenciales-${school.name.toLowerCase().replace(/\s+/g, '-')}.html`;
      a.click();
    }
  };

  if (loading || !school) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 p-12 flex items-center justify-center gap-2 text-xs text-slate-500">
        <Loader2 className="w-4 h-4 animate-spin text-teal-700" />
        <span>Cargando gestión institucional...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-lg font-bold text-slate-900 flex items-center gap-2.5">
            <TeEscuchoLogo size={32} animated={false} className="shrink-0" />
            <span>Mi Colegio — {school.name}</span>
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Administración delegada del plantel · Código estudiantil{' '}
            <span className="font-mono font-semibold text-teal-800">{school.access_code}</span>
          </p>
        </div>

        <button
          type="button"
          disabled={saving}
          onClick={() => void handleSaveSchool()}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-teal-700 hover:bg-teal-800 disabled:opacity-60 text-white text-xs font-semibold transition whitespace-nowrap"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          <span>Guardar cambios de mi colegio</span>
        </button>
      </div>

      {errorMsg && (
        <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800">
          {errorMsg}
        </div>
      )}

      {successMsg && (
        <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-900">
          {successMsg}
        </div>
      )}

      {/* 1. Bienvenida y Horarios */}
      <section className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 space-y-4">
        <h2 className="text-sm font-bold text-slate-900">Identidad de atención al estudiante</h2>

        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1.5">
            Mensaje de bienvenida en portal estudiantil
          </label>
          <textarea
            rows={2}
            value={school.welcome_message}
            onChange={(e) => setSchool({ ...school, welcome_message: e.target.value })}
            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm text-slate-900"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Horario de atención escolar
            </label>
            <input
              type="text"
              value={school.support_hours}
              onChange={(e) => setSchool({ ...school, support_hours: e.target.value })}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm text-slate-900"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Teléfono interno psicopedagogía (opcional)
            </label>
            <input
              type="text"
              value={school.internal_help_phone}
              onChange={(e) => setSchool({ ...school, internal_help_phone: e.target.value })}
              placeholder="Ej: 01 445 8890"
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm font-mono text-slate-900"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1.5">
            Aviso fuera de horario escolar
          </label>
          <input
            type="text"
            value={school.after_hours_notice}
            onChange={(e) => setSchool({ ...school, after_hours_notice: e.target.value })}
            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm text-slate-900"
          />
        </div>
      </section>

      {/* 2. SLA y Guardia */}
      <section className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 space-y-4">
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4 text-teal-700" />
          <h2 className="text-sm font-bold text-slate-900">SLA y Turno de Guardia</h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Meta respuesta Crítico (min)
            </label>
            <input
              type="number"
              min={1}
              max={1440}
              value={school.sla_config.critical_response_minutes}
              onChange={(e) =>
                setSchool({
                  ...school,
                  sla_config: {
                    ...school.sla_config,
                    critical_response_minutes: Math.max(1, Number(e.target.value) || 15),
                  },
                })
              }
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 text-sm font-mono"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Meta respuesta Medio (min)
            </label>
            <input
              type="number"
              min={5}
              max={2880}
              value={school.sla_config.medium_response_minutes}
              onChange={(e) =>
                setSchool({
                  ...school,
                  sla_config: {
                    ...school.sla_config,
                    medium_response_minutes: Math.max(5, Number(e.target.value) || 120),
                  },
                })
              }
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 text-sm font-mono"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Especialista de guardia
            </label>
            <select
              value={school.sla_config.on_call_counselor_id}
              onChange={(e) => {
                const found = team.find((t) => t.id === e.target.value);
                setSchool({
                  ...school,
                  sla_config: {
                    ...school.sla_config,
                    on_call_counselor_id: e.target.value,
                    on_call_label: found
                      ? `Guardia · ${found.full_name}`
                      : school.sla_config.on_call_label,
                  },
                });
              }}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 text-xs"
            >
              <option value="">Sin asignación fija</option>
              {team.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.full_name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Propuesta E: Salud de Canales de Alerta y Prueba en Vivo */}
        <div className="pt-4 border-t border-slate-100 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1">
            <p className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
              <BellRing className="w-3.5 h-3.5 text-teal-700" />
              <span>Salud de alertas Push móviles y de escritorio</span>
            </p>
            <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-600 tabular-nums">
              <span>
                Dispositivos activos: <strong className="text-slate-900">{pushHealth?.total_devices ?? 0}</strong>
              </span>
              <span aria-hidden="true">·</span>
              <span>
                Guardia actual: <strong className="text-slate-900">{pushHealth?.on_call_devices ?? 0}</strong>
              </span>
              <span aria-hidden="true">·</span>
              <span>
                Dirección/Admin: <strong className="text-slate-900">{pushHealth?.admin_devices ?? 0}</strong>
              </span>
            </div>
            {pushTestNotice && (
              <p className="text-xs text-teal-800 font-medium pt-1">{pushTestNotice}</p>
            )}
          </div>

          <button
            type="button"
            disabled={testingPush}
            onClick={() => void handleTestPushBell()}
            className="min-h-[44px] inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl border border-teal-200 bg-teal-50 hover:bg-teal-100 disabled:opacity-60 text-teal-900 text-xs font-semibold transition shrink-0"
          >
            {testingPush ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <BellRing className="w-3.5 h-3.5" />
            )}
            <span>Enviar alerta de prueba a guardia</span>
          </button>
        </div>
      </section>

      {/* 3. Espacios y Categorías con Sandboxing */}
      <section className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 space-y-5">
        <div className="space-y-3">
          <h2 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
            <MapPin className="w-4 h-4 text-teal-700" />
            <span>Espacios del plantel</span>
          </h2>
          <div className="flex flex-wrap gap-2">
            {school.spaces.map((sp, idx) => (
              <span
                key={`${sp}-${idx}`}
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-slate-200 bg-slate-50 text-xs font-medium text-slate-800"
              >
                <span>{sp}</span>
                {school.spaces.length > 1 && (
                  <button
                    type="button"
                    onClick={() =>
                      setSchool({
                        ...school,
                        spaces: school.spaces.filter((_, i) => i !== idx),
                      })
                    }
                    className="text-slate-400 hover:text-rose-700"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </span>
            ))}
          </div>
          <div className="flex items-center gap-2 max-w-md">
            <input
              type="text"
              value={newSpace}
              onChange={(e) => setNewSpace(e.target.value)}
              placeholder="Nuevo espacio (ej. Comedor escolar)"
              className="flex-1 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs"
            />
            <button
              type="button"
              onClick={() => {
                const clean = newSpace.trim();
                if (!clean || school.spaces.includes(clean)) return;
                setSchool({ ...school, spaces: [...school.spaces, clean] });
                setNewSpace('');
              }}
              className="px-3.5 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold"
            >
              Agregar
            </button>
          </div>
        </div>

        <div className="pt-4 border-t border-slate-100 space-y-3">
          <h3 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-teal-700" />
            <span>Categorías y acceso clínico por rol (Need-to-Know)</span>
          </h3>
          <div className="border border-slate-200 rounded-xl divide-y divide-slate-100">
            {school.categories.map((cat, idx) => (
              <div key={cat.id} className="p-4 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-slate-900">{cat.title}</span>
                  <div className="flex items-center gap-2">
                    <select
                      value={cat.default_risk}
                      onChange={(e) => {
                        const next = [...school.categories];
                        next[idx] = { ...cat, default_risk: e.target.value as RiskLevel };
                        setSchool({ ...school, categories: next });
                      }}
                      className="bg-slate-50 border border-slate-200 rounded-md px-2 py-1 text-xs"
                    >
                      <option value="bajo">Base: Bajo</option>
                      <option value="medio">Base: Medio</option>
                      <option value="critico">Base: Crítico</option>
                    </select>
                    <button
                      type="button"
                      onClick={() => {
                        const next = [...school.categories];
                        next[idx] = { ...cat, active: !cat.active };
                        setSchool({ ...school, categories: next });
                      }}
                      className={`px-2.5 py-1 rounded-md border text-xs font-medium ${
                        cat.active
                          ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                          : 'border-slate-200 bg-slate-50 text-slate-500'
                      }`}
                    >
                      {cat.active ? 'Visible' : 'Oculta'}
                    </button>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-3 text-xs">
                  <span className="text-slate-500">Acceso permitido:</span>
                  {ROLE_OPTIONS.map((r) => {
                    const roles = cat.allowed_roles || ['psychologist', 'tutor', 'admin'];
                    const checked = roles.includes(r.id);
                    return (
                      <label
                        key={r.id}
                        className="inline-flex items-center gap-1.5 cursor-pointer text-slate-700"
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => {
                            const nextRoles = checked
                              ? roles.filter((x) => x !== r.id)
                              : [...roles, r.id];
                            if (nextRoles.length === 0) return;
                            const next = [...school.categories];
                            next[idx] = { ...cat, allowed_roles: nextRoles };
                            setSchool({ ...school, categories: next });
                          }}
                          className="rounded border-slate-300 text-teal-700"
                        />
                        <span>{r.label}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 4. Equipo del Colegio */}
      <section className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold text-slate-900">Equipo orientador de {school.short_name}</h2>
            <p className="text-xs text-slate-500 mt-0.5">Gestión de autoridades, coordinadores TOE, psicólogos y tutores</p>
          </div>
          {team.length > 0 && (
            <button
              type="button"
              onClick={handleDownloadCredentials}
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-teal-700 hover:bg-teal-800 text-white text-xs font-semibold shadow-sm transition cursor-pointer"
              title="Descargar o imprimir la lista oficial de credenciales y representantes del colegio en PDF"
            >
              <Download className="w-4 h-4" />
              <span>Descargar lista de credenciales (PDF)</span>
            </button>
          )}
        </div>

        <div className="border border-slate-200 rounded-xl divide-y divide-slate-100">
          {team.map((member) => (
            <div key={member.id} className="p-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-slate-900">
                  {member.full_name}
                  {member.id === currentCounselorId ? ' (Tú)' : ''}
                </p>
                <p className="text-xs text-slate-500">
                  <span className="font-mono">{member.email}</span> ·{' '}
                  <span className="font-medium text-slate-800">
                    {member.role === 'director'
                      ? 'Director/a General'
                      : member.role === 'coordinator_toe'
                        ? 'Coordinador/a TOE'
                        : member.role === 'psychologist'
                          ? 'Psicólogo/a Escolar'
                          : member.role === 'tutor'
                            ? 'Docente Tutor/a'
                            : 'Administrador/a'}
                  </span> ·{' '}
                  <span className={member.active ? 'text-emerald-700' : 'text-rose-700'}>
                    {member.active ? 'Activo' : 'Desactivado'}
                  </span>
                </p>
                {(member.responsabilidad_label || member.shift || member.grade) && (
                  <p className="text-[11px] text-teal-700 font-medium mt-0.5 flex items-center gap-1.5">
                    <Users className="w-3 h-3 shrink-0" />
                    <span>{member.responsabilidad_label || ''}</span>
                    <span>{member.shift === 'manana' ? '· Turno Mañana' : member.shift === 'tarde' ? '· Turno Tarde' : member.shift === 'completo' ? '· Ambos Turnos' : ''}</span>
                    {member.grade && <span>· {member.grade}{member.section ? member.section : ''}</span>}
                  </p>
                )}
                <p className="text-[11px] text-slate-600 mt-1 flex items-center gap-1.5 font-mono bg-slate-100/90 px-2 py-0.5 rounded w-fit border border-slate-200">
                  <Key className="w-3 h-3 text-teal-700 shrink-0" />
                  <span className="text-slate-500 font-sans text-[10px]">Clave oficial:</span>
                  <span className="font-bold text-teal-800">
                    {member.initial_password || (school.id === 'school-san-jose-2026' ? 'SanJose2026!' : 'SantaRosa2026!')}
                  </span>
                </p>
                {member.phone_whatsapp && (
                  <p className="text-[11px] text-slate-500 mt-0.5 flex items-center gap-1">
                    <Phone className="w-3 h-3 text-emerald-600 shrink-0" />
                    <span className="font-mono">{member.phone_whatsapp.replace(/(\d{2})(\d+)(\d{3})/, '$1 *** $3')}</span>
                    <span className="text-emerald-700 font-medium">WhatsApp ✓</span>
                  </p>
                )}
              </div>

              {member.id !== currentCounselorId && (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void handleToggleMember(member)}
                    className="px-2.5 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-xs font-medium text-slate-700"
                  >
                    {member.active ? 'Desactivar' : 'Activar'}
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleDeleteMember(member)}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-rose-700 hover:bg-rose-50"
                    aria-label={`Eliminar ${member.full_name}`}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>

        <form onSubmit={handleAddMember} className="pt-4 border-t border-slate-100 space-y-3">
          <p className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
            <UserPlus className="w-4 h-4 text-teal-700" />
            Agregar miembro del equipo TOE / Tutoría a tu plantel
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input
              type="text"
              required
              value={memberName}
              onChange={(e) => setMemberName(e.target.value)}
              placeholder="Nombre completo"
              className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs"
            />
            <input
              type="email"
              required
              value={memberEmail}
              onChange={(e) => setMemberEmail(e.target.value)}
              placeholder="Correo institucional"
              className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs"
            />
            <input
              type="password"
              required
              minLength={6}
              value={memberPass}
              onChange={(e) => setMemberPass(e.target.value)}
              placeholder="Contraseña inicial (mín. 6)"
              className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs"
            />
            <select
              value={memberRole}
              onChange={(e) => setMemberRole(e.target.value as CounselorRole)}
              className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs"
            >
              <option value="director">Director / Directora</option>
              <option value="coordinator_toe">Coordinador/a de Tutoría (TOE)</option>
              <option value="psychologist">Psicólogo/a Escolar</option>
              <option value="tutor">Docente Tutor/a de Aula</option>
              <option value="admin">Administrador/a de Colegio</option>
            </select>
            <select
              value={memberShift}
              onChange={(e) => setMemberShift(e.target.value as 'manana' | 'tarde' | 'completo')}
              className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs"
            >
              <option value="manana">Turno Mañana</option>
              <option value="tarde">Turno Tarde</option>
              <option value="completo">Completo / Ambos Turnos</option>
            </select>
            <input
              type="text"
              value={memberPhone}
              onChange={(e) => setMemberPhone(e.target.value)}
              placeholder="WhatsApp: +51 9XX XXX XXX (opcional)"
              className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs font-mono"
            />
            <input
              type="text"
              value={memberGrade}
              onChange={(e) => setMemberGrade(e.target.value)}
              placeholder="Grado (ej: 3°) — tutores"
              className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs"
            />
            <input
              type="text"
              value={memberSection}
              onChange={(e) => setMemberSection(e.target.value)}
              placeholder="Sección (ej: A, B) — tutores"
              className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs"
            />
            <input
              type="text"
              value={memberRespLabel}
              onChange={(e) => setMemberRespLabel(e.target.value)}
              placeholder="Etiqueta institucional (opcional, ej: Coordinadora TOE Turno Mañana)"
              className="sm:col-span-2 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs"
            />
          </div>
          <button
            type="submit"
            disabled={addingMember}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold"
          >
            {addingMember ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Plus className="w-3.5 h-3.5" />
            )}
            <span>Agregar al equipo</span>
          </button>
        </form>
      </section>

      {/* 5. Retención y Privacidad */}
      <section className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 space-y-4">
        <div className="flex items-center gap-2">
          <Database className="w-4 h-4 text-teal-700" />
          <h2 className="text-sm font-bold text-slate-900">Política de Privacidad y Retención</h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-center">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Retención de chats resueltos
            </label>
            <select
              value={school.retention_config?.retention_days_resolved ?? 180}
              onChange={(e) =>
                setSchool({
                  ...school,
                  retention_config: {
                    retention_days_resolved: Number(e.target.value),
                    auto_purge_enabled: school.retention_config?.auto_purge_enabled ?? true,
                    require_closure_outcome:
                      school.retention_config?.require_closure_outcome ?? true,
                  },
                })
              }
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 text-xs text-slate-900"
            >
              <option value={90}>90 días (Trimestral)</option>
              <option value={180}>180 días (Semestral)</option>
              <option value={365}>365 días (Año escolar)</option>
              <option value={0}>Conservar sin depuración</option>
            </select>
          </div>

          <label className="flex items-center gap-2.5 p-3 rounded-xl border border-slate-200 bg-slate-50 cursor-pointer text-xs">
            <input
              type="checkbox"
              checked={school.retention_config?.auto_purge_enabled ?? true}
              onChange={(e) =>
                setSchool({
                  ...school,
                  retention_config: {
                    retention_days_resolved:
                      school.retention_config?.retention_days_resolved ?? 180,
                    auto_purge_enabled: e.target.checked,
                    require_closure_outcome:
                      school.retention_config?.require_closure_outcome ?? true,
                  },
                })
              }
              className="w-4 h-4 rounded border-slate-300 text-teal-700"
            />
            <span className="font-medium text-slate-800">Depuración automática de vencidos</span>
          </label>

          <label className="flex items-center gap-2.5 p-3 rounded-xl border border-slate-200 bg-slate-50 cursor-pointer text-xs">
            <input
              type="checkbox"
              checked={school.retention_config?.require_closure_outcome ?? true}
              onChange={(e) =>
                setSchool({
                  ...school,
                  retention_config: {
                    retention_days_resolved:
                      school.retention_config?.retention_days_resolved ?? 180,
                    auto_purge_enabled: school.retention_config?.auto_purge_enabled ?? true,
                    require_closure_outcome: e.target.checked,
                  },
                })
              }
              className="w-4 h-4 rounded border-slate-300 text-teal-700"
            />
            <span className="font-medium text-slate-800">Exigir cierre tipificado</span>
          </label>
        </div>
      </section>

      {/* 5b. Espacio Inspira y Curación del Plantel */}
      <section className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-teal-700" />
            <div>
              <h2 className="text-sm font-bold text-slate-900">
                Espacio Inspira (Bienestar y Autoestima)
              </h2>
              <p className="text-[11px] text-slate-500">
                Activa o adapta cápsulas, mensajes del colegio y videos educativos (youtube-nocookie.com).
              </p>
            </div>
          </div>

          <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-800 cursor-pointer">
            <input
              type="checkbox"
              checked={school.inspira_enabled !== false}
              onChange={(e) =>
                setSchool({
                  ...school,
                  inspira_enabled: e.target.checked,
                })
              }
              className="w-4 h-4 rounded border-slate-300 text-teal-700"
            />
            <span>Habilitar para estudiantes</span>
          </label>
        </div>

        {/* Custom School Resources */}
        <div className="space-y-3">
          <h3 className="text-xs font-bold text-slate-800">
            Recursos propios del colegio ({(school.inspira_custom_resources || []).length})
          </h3>
          {(school.inspira_custom_resources || []).length > 0 && (
            <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl">
              {(school.inspira_custom_resources || []).map((item) => (
                <div
                  key={item.id}
                  className="p-3.5 flex items-center justify-between gap-3 text-xs"
                >
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-900 truncate">{item.title}</p>
                    <p className="text-[11px] text-slate-500">
                      {item.format} · {item.topic} · {item.duration_label}
                      {item.youtube_id ? ` · YT:${item.youtube_id}` : ''}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      setSchool({
                        ...school,
                        inspira_custom_resources: (school.inspira_custom_resources || []).filter(
                          (r) => r.id !== item.id
                        ),
                      })
                    }
                    className="p-1.5 rounded-lg text-slate-400 hover:text-rose-700 hover:bg-rose-50"
                    title="Eliminar recurso propio"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Add new custom resource */}
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
            <p className="text-xs font-semibold text-slate-800">
              Añadir cápsula o video para tu colegio (luego pulsa Guardar cambios arriba)
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <input
                type="text"
                value={inspTitle}
                onChange={(e) => setInspTitle(e.target.value)}
                placeholder="Título motivador..."
                className="sm:col-span-2 bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs"
              />
              <select
                value={inspTopic}
                onChange={(e) => setInspTopic(e.target.value as InspiraTopic)}
                className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs"
              >
                <option value="autoestima">Tema: Autoestima</option>
                <option value="limites">Tema: Límites sanos</option>
                <option value="ciberacoso">Tema: Ciberacoso</option>
                <option value="calma">Tema: Calma</option>
                <option value="pedir_ayuda">Tema: Pedir ayuda</option>
              </select>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <select
                value={inspFormat}
                onChange={(e) => setInspFormat(e.target.value as InspiraFormat)}
                className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs"
              >
                <option value="capsula">Formato: Cápsula de lectura</option>
                <option value="video">Formato: Video YouTube seguro</option>
                <option value="ejercicio">Formato: Ejercicio guiado</option>
              </select>
              <input
                type="text"
                value={inspDuration}
                onChange={(e) => setInspDuration(e.target.value)}
                placeholder="Ej: 3 min video"
                className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs"
              />
              {inspFormat === 'video' ? (
                <input
                  type="text"
                  value={inspYoutubeInput}
                  onChange={(e) => setInspYoutubeInput(e.target.value)}
                  placeholder="Link de YouTube o ID (11 chars)"
                  className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs font-mono"
                />
              ) : (
                <div className="hidden sm:block" />
              )}
            </div>
            <input
              type="text"
              value={inspSummary}
              onChange={(e) => setInspSummary(e.target.value)}
              placeholder="Resumen corto para la tarjeta..."
              className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs"
            />
            <textarea
              rows={2}
              value={inspBody}
              onChange={(e) => setInspBody(e.target.value)}
              placeholder="Contenido completo o descripción de apoyo..."
              className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs"
            />
            <button
              type="button"
              onClick={() => {
                if (!inspTitle.trim() || !inspSummary.trim()) {
                  setErrorMsg('Completa título y resumen del recurso antes de añadirlo.');
                  return;
                }
                if (inspFormat === 'video' && !inspYoutubeInput.trim()) {
                  setErrorMsg('Ingresa un enlace o ID de YouTube válido para recursos de video.');
                  return;
                }
                const newItem: InspiraResource = {
                  id: `insp-sch-${Date.now().toString(36)}`,
                  title: inspTitle.trim(),
                  summary: inspSummary.trim(),
                  body: inspBody.trim() || inspSummary.trim(),
                  topic: inspTopic,
                  format: inspFormat,
                  duration_label: inspDuration.trim() || '2 min',
                  ...(inspFormat === 'video' ? { youtube_id: inspYoutubeInput.trim() } : {}),
                  scope: 'school',
                  active: true,
                };
                setSchool({
                  ...school,
                  inspira_custom_resources: [newItem, ...(school.inspira_custom_resources || [])],
                });
                setInspTitle('');
                setInspSummary('');
                setInspBody('');
                setInspYoutubeInput('');
                setErrorMsg(null);
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Agregar a la lista</span>
            </button>
          </div>
        </div>

        {/* Toggle global catalog visibility per school */}
        {globalInspira.length > 0 && (
          <div className="space-y-2 pt-2 border-t border-slate-100">
            <h3 className="text-xs font-bold text-slate-800">
              Cápsulas globales curadas visibles en tu plantel
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {globalInspira.map((g) => {
                const disabledSet = new Set(school.inspira_disabled_ids || []);
                const enabledForSchool = !disabledSet.has(g.id);
                return (
                  <label
                    key={g.id}
                    className="flex items-center justify-between gap-3 p-3 rounded-xl border border-slate-200 bg-slate-50/70 cursor-pointer text-xs"
                  >
                    <div className="min-w-0">
                      <p className="font-medium text-slate-800 truncate">{g.title}</p>
                      <p className="text-[11px] text-slate-500">{g.topic}</p>
                    </div>
                    <input
                      type="checkbox"
                      checked={enabledForSchool}
                      onChange={(e) => {
                        const next = new Set(school.inspira_disabled_ids || []);
                        if (e.target.checked) next.delete(g.id);
                        else next.add(g.id);
                        setSchool({ ...school, inspira_disabled_ids: Array.from(next) });
                      }}
                      className="w-4 h-4 rounded border-slate-300 text-teal-700 shrink-0"
                    />
                  </label>
                );
              })}
            </div>
          </div>
        )}
      </section>

      {/* 6. Registro de Auditoría */}
      <section className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <History className="w-4 h-4 text-teal-700" />
            <h2 className="text-sm font-bold text-slate-900">
              Registro de Auditoría Institucional
            </h2>
          </div>
          <span className="text-[11px] text-slate-500">Solo lectura · Trazabilidad de acceso</span>
        </div>

        {auditLogs.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-400">
            No hay eventos registrados aún para este plantel.
          </div>
        ) : (
          <div className="overflow-x-auto max-h-80">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-100 text-slate-500 font-semibold bg-slate-50">
                  <th className="py-2.5 px-4">Fecha</th>
                  <th className="py-2.5 px-4">Responsable</th>
                  <th className="py-2.5 px-4">Acción</th>
                  <th className="py-2.5 px-4">Objetivo</th>
                  <th className="py-2.5 px-4">Detalle</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {auditLogs.slice(0, 40).map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50/60">
                    <td className="py-2.5 px-4 font-mono text-[11px] text-slate-500 whitespace-nowrap tabular-nums">
                      {new Date(log.created_at).toLocaleString('es-PE', {
                        day: '2-digit',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </td>
                    <td className="py-2.5 px-4 font-medium text-slate-800 whitespace-nowrap">
                      {log.actor_name}
                    </td>
                    <td className="py-2.5 px-4 font-mono text-[11px] text-teal-800 whitespace-nowrap">
                      {log.action}
                    </td>
                    <td className="py-2.5 px-4 font-mono text-slate-700 whitespace-nowrap">
                      {log.target}
                    </td>
                    <td className="py-2.5 px-4 text-slate-600">{log.detail}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
};
