import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  Clock,
  Database,
  Download,
  FlaskConical,
  Globe2,
  History,
  Layers,
  Loader2,
  LogOut,
  MapPin,
  PauseCircle,
  Phone,
  PhoneCall,
  PlayCircle,
  Plus,
  QrCode,
  RefreshCw,
  Save,
  Search,
  ShieldCheck,
  Sparkles,
  Trash2,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import { ThemeToggle } from './ThemeToggle';
import type {
  AdminOverviewData,
  AdminSchoolSummary,
  AiSensitivity,
  AuditLogEntry,
  CategoryConfig,
  CategoryIconKey,
  CategoryTone,
  CounselorProfile,
  CounselorRole,
  EducationLevel,
  EmergencyLineConfig,
  InspiraFormat,
  InspiraResource,
  InspiraTopic,
  PlatformAdminProfile,
  PlatformCatalog,
  RiskLevel,
  School,
  ShiftType,
  TicketSummary,
} from '../types';
import { resetDemoQuotaUses } from './DemoTourBar';
import { QrPosterGenerator } from './QrPosterGenerator';

interface AdminConsoleProps {
  token: string;
  admin: PlatformAdminProfile;
  onLogout: () => void;
  onSwitchToStudent: () => void;
  onResetLocalDemoPasses?: () => void;
  onCatalogUpdated?: (catalog: PlatformCatalog) => void;
}

type AdminSection = 'overview' | 'schools' | 'catalog' | 'audit';
type SchoolEditorTab =
  | 'general'
  | 'team'
  | 'categories_spaces'
  | 'emergency'
  | 'sla'
  | 'ai'
  | 'retention'
  | 'sandbox'
  | 'qr';
type SchoolFilter = 'all' | 'active' | 'paused';

const ROLE_LABELS: Array<{ id: CounselorRole; label: string }> = [
  { id: 'director', label: 'Director / Directora' },
  { id: 'coordinator_toe', label: 'Coordinador/a de Tutoría (TOE)' },
  { id: 'psychologist', label: 'Psicólogo/a Escolar' },
  { id: 'tutor', label: 'Docente Tutor/a de Aula' },
  { id: 'admin', label: 'Administrador/a de Colegio' },
];

const ACCENT_PALETTE = [
  { hex: '#0F766E', label: 'Esmeralda' },
  { hex: '#0369A1', label: 'Azul Océano' },
  { hex: '#1D4ED8', label: 'Azul Real' },
  { hex: '#047857', label: 'Verde Bosque' },
  { hex: '#B45309', label: 'Ámbar Institucional' },
  { hex: '#BE123C', label: 'Carmesí' },
];

const EDUCATION_LEVELS: EducationLevel[] = [
  'Primaria y Secundaria',
  'Secundaria',
  'Primaria',
  'Otro',
];

function formatShortDate(iso: string | null): string {
  if (!iso) return 'Sin actividad';
  return new Date(iso).toLocaleDateString('es-PE', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export const AdminConsole: React.FC<AdminConsoleProps> = ({
  token,
  admin,
  onLogout,
  onSwitchToStudent,
  onResetLocalDemoPasses,
  onCatalogUpdated,
}) => {
  const [section, setSection] = useState<AdminSection>('overview');
  const [overview, setOverview] = useState<AdminOverviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [bannerError, setBannerError] = useState<string | null>(null);
  const [bannerSuccess, setBannerSuccess] = useState<string | null>(null);

  // School directory filtering
  const [schoolSearch, setSchoolSearch] = useState('');
  const [schoolFilter, setSchoolFilter] = useState<SchoolFilter>('all');

  // Selected school editor state
  const [selectedSchoolId, setSelectedSchoolId] = useState<string | null>(null);
  const [editorTab, setEditorTab] = useState<SchoolEditorTab>('general');
  const [draftSchool, setDraftSchool] = useState<School | null>(null);
  const [savingSchool, setSavingSchool] = useState(false);

  // School team management
  const [team, setTeam] = useState<CounselorProfile[]>([]);
  const [loadingTeam, setLoadingTeam] = useState(false);
  const [newMemberName, setNewMemberName] = useState('');
  const [newMemberEmail, setNewMemberEmail] = useState('');
  const [newMemberEmailAuto, setNewMemberEmailAuto] = useState(true); // tracks if email is auto-generated
  const [newMemberPassword, setNewMemberPassword] = useState('');
  const [newMemberRole, setNewMemberRole] = useState<CounselorRole>('coordinator_toe');
  const [newMemberShift, setNewMemberShift] = useState<ShiftType>('manana');
  const [newMemberGrade, setNewMemberGrade] = useState('');
  const [newMemberSection, setNewMemberSection] = useState('');
  const [newMemberPhone, setNewMemberPhone] = useState('');
  const [newMemberRespLabel, setNewMemberRespLabel] = useState('');
  const [addingMember, setAddingMember] = useState(false);
  // Stores plain credentials of members created in this session for download
  const [sessionCredentials, setSessionCredentials] = useState<Array<{
    name: string; email: string; role: CounselorRole; password: string; shift: string; grade?: string; section?: string;
  }>>([]);
  const [resetPasswordTarget, setResetPasswordTarget] = useState<string | null>(null);
  const [resetPasswordValue, setResetPasswordValue] = useState('');

  // Categories & Spaces inline inputs
  const [newSpaceInput, setNewSpaceInput] = useState('');
  const [newCatTitle, setNewCatTitle] = useState('');
  const [newCatDesc, setNewCatDesc] = useState('');
  const [newCatRisk, setNewCatRisk] = useState<RiskLevel>('medio');
  const [newCatIcon, setNewCatIcon] = useState<CategoryIconKey>('alert');
  const [newCatTone, setNewCatTone] = useState<CategoryTone>('amber');
  const [newCatRoles, setNewCatRoles] = useState<CounselorRole[]>([
    'psychologist',
    'tutor',
    'admin',
  ]);
  const [newKeywordInput, setNewKeywordInput] = useState('');
  const [catalogKeywordInput, setCatalogKeywordInput] = useState('');

  // Emergency lines inline inputs
  const [newLineName, setNewLineName] = useState('');
  const [newLineSubtitle, setNewLineSubtitle] = useState('');
  const [newLineValue, setNewLineValue] = useState('');
  const [newLineType, setNewLineType] = useState<'tel' | 'url'>('tel');

  // Sandbox test state
  const [sandboxCategory, setSandboxCategory] = useState('');
  const [sandboxSpace, setSandboxSpace] = useState('');
  const [sandboxMessage, setSandboxMessage] = useState(
    'Hoy en el recreo vi que un grupo apartó y amenazó a un compañero cerca de las gradas.'
  );
  const [runningSandbox, setRunningSandbox] = useState(false);
  const [sandboxResult, setSandboxResult] = useState<{
    ticket: TicketSummary;
    testPin: string;
    triage: { risk_level: RiskLevel; ai_suggestion: string };
  } | null>(null);

  // Global Catalog draft
  const [draftCatalog, setDraftCatalog] = useState<PlatformCatalog | null>(null);
  const [catalogSpaceInput, setCatalogSpaceInput] = useState('');
  const [savingCatalog, setSavingCatalog] = useState(false);
  const [catInspTitle, setCatInspTitle] = useState('');
  const [catInspSummary, setCatInspSummary] = useState('');
  const [catInspBody, setCatInspBody] = useState('');
  const [catInspTopic, setCatInspTopic] = useState<InspiraTopic>('autoestima');
  const [catInspFormat, setCatInspFormat] = useState<InspiraFormat>('capsula');
  const [catInspDuration, setCatInspDuration] = useState('2 min');
  const [catInspYoutube, setCatInspYoutube] = useState('');

  // Fase 3: Exports, Retention Purge & Global Audit Log
  const [exportingNetwork, setExportingNetwork] = useState(false);
  const [purgingRetention, setPurgingRetention] = useState(false);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [loadingAudit, setLoadingAudit] = useState(false);
  const [auditSchoolFilter, setAuditSchoolFilter] = useState('');

  // New School Onboarding Wizard Modal
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardStep, setWizardStep] = useState<1 | 2 | 3>(1);
  const [wizName, setWizName] = useState('');
  const [wizShortName, setWizShortName] = useState('');
  const [wizCode, setWizCode] = useState('');
  const [wizRegion, setWizRegion] = useState('Lima, Perú');
  const [wizCountry, setWizCountry] = useState('Perú');
  const [wizLevel, setWizLevel] = useState<EducationLevel>('Primaria y Secundaria');
  const [wizModular, setWizModular] = useState('');
  const [wizAccent, setWizAccent] = useState('#0F766E');
  const [wizWelcome, setWizWelcome] = useState('');
  const [wizHours, setWizHours] = useState('Lunes a Viernes · 07:00 – 19:00');
  const [wizAfterHours, setWizAfterHours] = useState(
    'Si escribes fuera del horario escolar, tu mensaje quedará protegido y lo revisaremos a primera hora.'
  );
  const [wizInternalPhone, setWizInternalPhone] = useState('');
  const [wizAdminName, setWizAdminName] = useState('');
  const [wizAdminEmail, setWizAdminEmail] = useState('');
  const [wizAdminPass, setWizAdminPass] = useState('');
  const [wizAdminRole, setWizAdminRole] = useState<CounselorRole>('director');
  const [creatingSchool, setCreatingSchool] = useState(false);

  const showSuccess = (msg: string) => {
    setBannerError(null);
    setBannerSuccess(msg);
    setTimeout(() => {
      setBannerSuccess((prev) => (prev === msg ? null : prev));
    }, 4500);
  };

  const fetchOverview = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/overview', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('No se pudo cargar la consola global.');
      const data = (await res.json()) as AdminOverviewData;
      setOverview(data);
      setDraftCatalog(data.catalog);
      if (data.schools.length > 0) {
        setSelectedSchoolId((prev) => prev || data.schools[0].school.id);
      }
    } catch (err) {
      setBannerError(err instanceof Error ? err.message : 'Error de red.');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void fetchOverview();
  }, [fetchOverview]);

  const selectedSummary: AdminSchoolSummary | null = useMemo(() => {
    if (!overview || !selectedSchoolId) return null;
    return overview.schools.find((s) => s.school.id === selectedSchoolId) || null;
  }, [overview, selectedSchoolId]);

  useEffect(() => {
    if (!selectedSummary) {
      setDraftSchool(null);
      return;
    }
    const clone = JSON.parse(JSON.stringify(selectedSummary.school)) as School;
    setDraftSchool(clone);
    setSandboxCategory(clone.categories.find((c) => c.active)?.title || '');
    setSandboxSpace(clone.spaces[0] || '');
    setSandboxResult(null);
  }, [selectedSummary]);

  const loadSchoolTeam = useCallback(
    async (schoolId: string) => {
      setLoadingTeam(true);
      try {
        const res = await fetch(`/api/admin/schools/${schoolId}/team`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error('No se pudo cargar el equipo del colegio.');
        const data = (await res.json()) as { team: CounselorProfile[] };
        setTeam(data.team);
      } catch (err) {
        setBannerError(err instanceof Error ? err.message : 'Error cargando equipo.');
      } finally {
        setLoadingTeam(false);
      }
    },
    [token]
  );

  useEffect(() => {
    if (
      section === 'schools' &&
      selectedSchoolId &&
      (editorTab === 'team' || editorTab === 'sla')
    ) {
      void loadSchoolTeam(selectedSchoolId);
    }
  }, [section, selectedSchoolId, editorTab, loadSchoolTeam]);

  const fetchAuditLogs = useCallback(async () => {
    setLoadingAudit(true);
    try {
      const qs = auditSchoolFilter ? `?schoolId=${encodeURIComponent(auditSchoolFilter)}` : '';
      const res = await fetch(`/api/admin/audit-logs${qs}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('No se pudo cargar la bitácora de auditoría.');
      const data = (await res.json()) as { logs: AuditLogEntry[] };
      setAuditLogs(data.logs || []);
    } catch (err) {
      setBannerError(err instanceof Error ? err.message : 'Error cargando auditoría.');
    } finally {
      setLoadingAudit(false);
    }
  }, [token, auditSchoolFilter]);

  useEffect(() => {
    if (section === 'audit') {
      void fetchAuditLogs();
    }
  }, [section, fetchAuditLogs]);

  const filteredSchools = useMemo(() => {
    if (!overview) return [];
    const q = schoolSearch.trim().toLowerCase();
    return overview.schools.filter(({ school }) => {
      if (schoolFilter === 'active' && !school.active) return false;
      if (schoolFilter === 'paused' && school.active) return false;
      if (!q) return true;
      return (
        school.name.toLowerCase().includes(q) ||
        school.access_code.toLowerCase().includes(q) ||
        school.region.toLowerCase().includes(q)
      );
    });
  }, [overview, schoolSearch, schoolFilter]);

  const openSchoolEditor = (schoolId: string, tab: SchoolEditorTab = 'general') => {
    setSelectedSchoolId(schoolId);
    setEditorTab(tab);
    setSection('schools');
  };

  const handleToggleSchoolActive = async (school: School) => {
    setBannerError(null);
    try {
      const res = await fetch(`/api/admin/schools/${school.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ active: !school.active }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo actualizar el estado.');
      await fetchOverview();
      showSuccess(
        !school.active
          ? `${school.name} activado correctamente.`
          : `${school.name} pausado temporalmente.`
      );
    } catch (err) {
      setBannerError(err instanceof Error ? err.message : 'Error al actualizar colegio.');
    }
  };

  const handleSaveSchool = async () => {
    if (!draftSchool) return;
    setSavingSchool(true);
    setBannerError(null);
    try {
      const res = await fetch(`/api/admin/schools/${draftSchool.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: draftSchool.name,
          short_name: draftSchool.short_name,
          access_code: draftSchool.access_code,
          active: draftSchool.active,
          region: draftSchool.region,
          country_preset: draftSchool.country_preset,
          education_level: draftSchool.education_level,
          modular_code: draftSchool.modular_code,
          accent_color: draftSchool.accent_color,
          welcome_message: draftSchool.welcome_message,
          support_hours: draftSchool.support_hours,
          after_hours_notice: draftSchool.after_hours_notice,
          internal_help_phone: draftSchool.internal_help_phone,
          spaces: draftSchool.spaces,
          categories: draftSchool.categories,
          emergency_lines: draftSchool.emergency_lines,
          sla_config: draftSchool.sla_config,
          ai_config: draftSchool.ai_config,
          retention_config: draftSchool.retention_config,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error guardando configuración.');
      await fetchOverview();
      showSuccess(`Configuración de ${draftSchool.name} guardada.`);
    } catch (err) {
      setBannerError(err instanceof Error ? err.message : 'No se pudo guardar.');
    } finally {
      setSavingSchool(false);
    }
  };

  const handleExportNetworkCsv = async () => {
    setExportingNetwork(true);
    setBannerError(null);
    try {
      const res = await fetch('/api/admin/export/overview.csv', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('No se pudo exportar el comparativo CSV.');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'te-escucho-red-global.csv';
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      showSuccess('Reporte comparativo Zero-PII descargado correctamente.');
    } catch (err) {
      setBannerError(err instanceof Error ? err.message : 'Error exportando CSV.');
    } finally {
      setExportingNetwork(false);
    }
  };

  const handlePurgeRetention = async () => {
    if (!draftSchool) return;
    setPurgingRetention(true);
    setBannerError(null);
    try {
      const res = await fetch(`/api/admin/schools/${draftSchool.id}/retention-purge`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo ejecutar la depuración.');
      await fetchOverview();
      showSuccess(
        `Depuración completada: ${data.purged_tickets} caso(s), ${data.purged_messages} mensaje(s) y ${data.purged_notes} nota(s) vencidas eliminadas.`
      );
    } catch (err) {
      setBannerError(err instanceof Error ? err.message : 'Error ejecutando retención.');
    } finally {
      setPurgingRetention(false);
    }
  };

  const handleRotateCode = async () => {
    if (!draftSchool) return;
    setSavingSchool(true);
    setBannerError(null);
    try {
      const res = await fetch(`/api/admin/schools/${draftSchool.id}/rotate-code`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo rotar el código.');
      await fetchOverview();
      showSuccess(`Nuevo código de acceso asignado: ${data.school.access_code}`);
    } catch (err) {
      setBannerError(err instanceof Error ? err.message : 'Error rotando código.');
    } finally {
      setSavingSchool(false);
    }
  };

  // ─── Email auto-generation helpers ───────────────────────────────────────
  const ROLE_EMAIL_SUFFIX: Record<CounselorRole, string> = {
    director: 'director',
    coordinator_toe: 'toe',
    psychologist: 'psico',
    tutor: 'tutor',
    admin: 'admin',
  };

  const generateEmailFromName = (fullName: string, role: CounselorRole): string => {
    const normalized = fullName
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // remove accents
      .replace(/[^a-z\s]/g, '');      // keep only letters and spaces
    const parts = normalized.split(/\s+/).filter(Boolean);
    // Use first apellido (second word); fallback to first word
    const apellido = parts.length >= 2 ? parts[1] : parts[0] || 'usuario';
    const suffix = ROLE_EMAIL_SUFFIX[role] || 'staff';
    return `${apellido}.${suffix}@teescucho.edu`;
  };

  // Auto-update email when name or role changes (only if still auto-managed)
  React.useEffect(() => {
    if (newMemberEmailAuto && newMemberName.trim().length >= 3) {
      setNewMemberEmail(generateEmailFromName(newMemberName, newMemberRole));
    }
  }, [newMemberName, newMemberRole, newMemberEmailAuto]);

  // ─── Credential sheet download ────────────────────────────────────────────
  const handleDownloadCredentials = () => {
    if (!draftSchool) return;
    const roleLabel: Record<string, string> = {
      director: 'Director / Directora',
      coordinator_toe: 'Coordinador/a de Tutoría (TOE)',
      psychologist: 'Psicólogo/a Escolar',
      tutor: 'Docente Tutor/a de Aula',
      admin: 'Administrador/a de Colegio',
    };
    const shiftLabel: Record<string, string> = {
      manana: 'Turno Mañana', tarde: 'Turno Tarde', completo: 'Jornada Completa',
    };
    const allMembers = team.filter((m) => m.active);
    const rows = allMembers.map((m) => {
      const sessionEntry = sessionCredentials.find((s) => s.email === m.email);
      const pwd = sessionEntry ? sessionEntry.password : '(contraseña establecida al crear)';
      const gradeSec = m.grade ? `${m.grade}${m.section ? ' "' + m.section + '"' : ''}` : '—';
      return `
        <tr>
          <td>${m.full_name}</td>
          <td>${roleLabel[m.role] || m.role}</td>
          <td>${shiftLabel[m.shift || 'manana'] || m.shift || '—'}</td>
          <td>${gradeSec}</td>
          <td style="font-family:monospace;font-size:12px">${m.email}</td>
          <td style="font-family:monospace;font-size:12px">${pwd}</td>
          <td>${m.phone_whatsapp || '—'}</td>
        </tr>`;
    }).join('');

    const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8"/>
<title>Credenciales – ${draftSchool.name}</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:'Segoe UI',sans-serif;padding:32px;color:#1e293b;background:#fff}
  .header{display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:28px;border-bottom:3px solid #0d9488;padding-bottom:16px}
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
  @media print{body{padding:16px}.warning{display:none}}
</style>
</head>
<body>
<div class="header">
  <div>
    <div class="logo">Te <span>Escucho</span></div>
    <div style="font-size:11px;color:#64748b;margin-top:4px">Plataforma de Bienestar Escolar</div>
  </div>
  <div class="meta">
    <strong>${draftSchool.name}</strong><br/>
    Código estudiantil: <strong>${draftSchool.access_code}</strong><br/>
    Generado: ${new Date().toLocaleDateString('es-PE', { day:'2-digit', month:'long', year:'numeric' })}
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
      <th>Contraseña</th>
      <th>WhatsApp Alertas</th>
    </tr>
  </thead>
  <tbody>
    ${rows || '<tr><td colspan="7" style="text-align:center;color:#94a3b8">Sin miembros activos registrados</td></tr>'}
  </tbody>
</table>

<div class="warning">
  ⚠️ <strong>Documento confidencial.</strong> No compartir por correo ni redes sociales. Entregar personalmente a cada responsable. Cambiar la contraseña inicial en el primer ingreso.
</div>

<div class="footer">
  Generado automáticamente por la Consola de Plataforma Te Escucho &nbsp;·&nbsp; ${draftSchool.name} &nbsp;·&nbsp; ${new Date().toISOString().slice(0,10)}
</div>

<script>window.onload=()=>{window.print()}</script>
</body>
</html>`;

    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const win = window.open(url, '_blank');
    if (!win) {
      // Fallback: download file directly
      const a = document.createElement('a');
      a.href = url;
      a.download = `credenciales-${draftSchool.name.toLowerCase().replace(/\s+/g, '-')}.html`;
      a.click();
    }
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  };

  const handleCreateTeamMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!draftSchool) return;
    setAddingMember(true);
    setBannerError(null);
    try {
      const res = await fetch(`/api/admin/schools/${draftSchool.id}/team`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          full_name: newMemberName,
          email: newMemberEmail,
          password: newMemberPassword,
          role: newMemberRole,
          shift: newMemberShift,
          grade: newMemberRole === 'tutor' ? newMemberGrade || undefined : undefined,
          section: newMemberRole === 'tutor' ? newMemberSection || undefined : undefined,
          phone_whatsapp: newMemberPhone || undefined,
          responsabilidad_label: newMemberRespLabel || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo crear la cuenta.');
      // Save plain credentials for download (session-only, not persisted)
      setSessionCredentials((prev) => [
        ...prev,
        {
          name: newMemberName,
          email: newMemberEmail,
          role: newMemberRole,
          password: newMemberPassword,
          shift: newMemberShift,
          grade: newMemberGrade || undefined,
          section: newMemberSection || undefined,
        },
      ]);
      setNewMemberName('');
      setNewMemberEmail('');
      setNewMemberEmailAuto(true);
      setNewMemberPassword('');
      setNewMemberRole('coordinator_toe');
      setNewMemberShift('manana');
      setNewMemberGrade('');
      setNewMemberSection('');
      setNewMemberPhone('');
      setNewMemberRespLabel('');
      await loadSchoolTeam(draftSchool.id);
      await fetchOverview();
      showSuccess(`Cuenta creada para ${data.counselor.full_name}.`);
    } catch (err) {
      setBannerError(err instanceof Error ? err.message : 'Error creando orientador.');
    } finally {
      setAddingMember(false);
    }
  };

  const handleToggleMemberActive = async (member: CounselorProfile) => {
    if (!draftSchool) return;
    try {
      const res = await fetch(`/api/admin/team/${member.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ active: !member.active }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo actualizar estado.');
      await loadSchoolTeam(draftSchool.id);
      await fetchOverview();
    } catch (err) {
      setBannerError(err instanceof Error ? err.message : 'Error actualizando cuenta.');
    }
  };

  const handleResetMemberPassword = async (memberId: string) => {
    if (!draftSchool || resetPasswordValue.trim().length < 6) {
      setBannerError('La nueva contraseña debe tener al menos 6 caracteres.');
      return;
    }
    try {
      const res = await fetch(`/api/admin/team/${memberId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ new_password: resetPasswordValue.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error cambiando contraseña.');
      setResetPasswordTarget(null);
      setResetPasswordValue('');
      showSuccess('Contraseña restablecida correctamente.');
    } catch (err) {
      setBannerError(err instanceof Error ? err.message : 'Error restableciendo clave.');
    }
  };

  const handleDeleteMember = async (member: CounselorProfile) => {
    if (!draftSchool) return;
    try {
      const res = await fetch(`/api/admin/team/${member.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('No se pudo eliminar la cuenta.');
      await loadSchoolTeam(draftSchool.id);
      await fetchOverview();
      showSuccess(`Cuenta de ${member.full_name} eliminada.`);
    } catch (err) {
      setBannerError(err instanceof Error ? err.message : 'Error eliminando cuenta.');
    }
  };

  const handleRunSandboxTest = async () => {
    if (!draftSchool) return;
    setRunningSandbox(true);
    setBannerError(null);
    try {
      const res = await fetch(`/api/admin/schools/${draftSchool.id}/sandbox-test`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          category: sandboxCategory,
          spaceTag: sandboxSpace,
          message: sandboxMessage,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo ejecutar la prueba.');
      setSandboxResult({
        ticket: data.ticket,
        testPin: data.testPin,
        triage: data.triage,
      });
      await fetchOverview();
      showSuccess(`Prueba ${data.ticket.ticket_code} enviada a la bandeja del colegio.`);
    } catch (err) {
      setBannerError(err instanceof Error ? err.message : 'Error en prueba sandbox.');
    } finally {
      setRunningSandbox(false);
    }
  };

  const handleClearSandbox = async () => {
    if (!draftSchool) return;
    try {
      const res = await fetch(`/api/admin/schools/${draftSchool.id}/sandbox`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error('No se pudieron limpiar las pruebas.');
      setSandboxResult(null);
      await fetchOverview();
      showSuccess(`Se eliminaron ${data.deleted} ticket(s) de prueba.`);
    } catch (err) {
      setBannerError(err instanceof Error ? err.message : 'Error limpiando pruebas.');
    }
  };

  const handleApplyRegionalPreset = (countryKey: string) => {
    if (!draftSchool || !overview) return;
    const preset = overview.catalog.regional_emergency_presets[countryKey];
    if (!preset) return;
    setDraftSchool({
      ...draftSchool,
      country_preset: countryKey,
      emergency_lines: JSON.parse(JSON.stringify(preset)) as EmergencyLineConfig[],
    });
  };

  const handleCreateWizardSchool = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!wizName.trim()) {
      setBannerError('Ingresa el nombre del colegio.');
      return;
    }
    setCreatingSchool(true);
    setBannerError(null);
    try {
      const res = await fetch('/api/admin/schools', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: wizName,
          short_name: wizShortName,
          access_code: wizCode,
          region: wizRegion,
          country_preset: wizCountry,
          education_level: wizLevel,
          modular_code: wizModular,
          accent_color: wizAccent,
          welcome_message: wizWelcome,
          support_hours: wizHours,
          after_hours_notice: wizAfterHours,
          internal_help_phone: wizInternalPhone,
          initial_counselor:
            wizAdminName.trim() && wizAdminEmail.trim() && wizAdminPass.trim()
              ? {
                  full_name: wizAdminName,
                  email: wizAdminEmail,
                  password: wizAdminPass,
                  role: wizAdminRole,
                }
              : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo crear el colegio.');

      setWizardOpen(false);
      setWizardStep(1);
      setWizName('');
      setWizShortName('');
      setWizCode('');
      setWizModular('');
      setWizWelcome('');
      setWizInternalPhone('');
      setWizAdminName('');
      setWizAdminEmail('');
      setWizAdminPass('');

      await fetchOverview();
      setSelectedSchoolId(data.school.id);
      setEditorTab('qr');
      setSection('schools');
      showSuccess(
        `Colegio ${data.school.name} creado con código ${data.school.access_code}. Kit QR listo.`
      );
    } catch (err) {
      setBannerError(err instanceof Error ? err.message : 'Error creando colegio.');
    } finally {
      setCreatingSchool(false);
    }
  };

  const handleSaveCatalog = async () => {
    if (!draftCatalog) return;
    setSavingCatalog(true);
    setBannerError(null);
    try {
      const res = await fetch('/api/admin/catalog', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(draftCatalog),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo guardar el catálogo.');
      if (data.catalog) {
        onCatalogUpdated?.(data.catalog as PlatformCatalog);
      }
      await fetchOverview();
      showSuccess('Plantillas globales y política de demostración guardadas.');
    } catch (err) {
      setBannerError(err instanceof Error ? err.message : 'Error guardando catálogos.');
    } finally {
      setSavingCatalog(false);
    }
  };

  const currentBreadcrumb =
    section === 'overview'
      ? 'Plataforma / Resumen Global'
      : section === 'schools'
        ? `Plataforma / Colegios${draftSchool ? ` / ${draftSchool.name}` : ''}`
        : section === 'audit'
          ? 'Plataforma / Auditoría Global'
          : 'Plataforma / Catálogos Globales';

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col lg:flex-row">
      {/* Sidebar Navigation (256px) */}
      <aside className="print:hidden w-full lg:w-64 bg-white border-b lg:border-b-0 lg:border-r border-slate-200 flex flex-col shrink-0">
        <div className="h-16 px-5 border-b border-slate-100 flex items-center justify-between gap-3">
          <span className="text-base font-extrabold tracking-tight text-slate-900 whitespace-nowrap">
            Te Escucho
          </span>
          <span className="text-[11px] font-semibold text-slate-500">Plataforma</span>
        </div>

        <nav className="p-3 flex lg:flex-col gap-1 overflow-x-auto">
          <button
            type="button"
            onClick={() => setSection('overview')}
            className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium transition whitespace-nowrap ${
              section === 'overview'
                ? 'bg-slate-900 text-white'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
            }`}
          >
            <ShieldCheck className="w-4 h-4 shrink-0" />
            <span>Resumen Global</span>
          </button>

          <button
            type="button"
            onClick={() => setSection('schools')}
            className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium transition whitespace-nowrap ${
              section === 'schools'
                ? 'bg-slate-900 text-white'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
            }`}
          >
            <Building2 className="w-4 h-4 shrink-0" />
            <span>Colegios y Config</span>
          </button>

          <button
            type="button"
            onClick={() => setSection('catalog')}
            className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium transition whitespace-nowrap ${
              section === 'catalog'
                ? 'bg-slate-900 text-white'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
            }`}
          >
            <Layers className="w-4 h-4 shrink-0" />
            <span>Catálogos Base</span>
          </button>

          <button
            type="button"
            onClick={() => setSection('audit')}
            className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium transition whitespace-nowrap ${
              section === 'audit'
                ? 'bg-slate-900 text-white'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
            }`}
          >
            <History className="w-4 h-4 shrink-0" />
            <span>Auditoría Global</span>
          </button>
        </nav>

        <div className="mt-auto hidden lg:block p-4 border-t border-slate-100 space-y-3">
          <div className="text-xs">
            <p className="font-semibold text-slate-900 truncate">{admin.full_name}</p>
            <p className="text-slate-500 truncate font-mono text-[11px]">{admin.email}</p>
          </div>
          <div className="flex flex-col gap-1.5">
            <button
              type="button"
              onClick={onSwitchToStudent}
              className="w-full text-left px-3 py-2 rounded-lg text-xs font-medium text-slate-600 hover:bg-slate-100 transition"
            >
              Ir al portal estudiante
            </button>
            <button
              type="button"
              onClick={onLogout}
              className="w-full inline-flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold text-rose-700 hover:bg-rose-50 transition"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Cerrar sesión</span>
            </button>
          </div>
        </div>
      </aside>

      {/* Main Workspace */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Bar Contract */}
        <header className="print:hidden h-16 bg-white border-b border-slate-200 px-4 sm:px-6 flex items-center justify-between gap-4 sticky top-0 z-20">
          <p className="text-xs sm:text-sm font-medium text-slate-500 truncate">
            {currentBreadcrumb}
          </p>
          <div className="flex items-center gap-2.5 shrink-0">
            <ThemeToggle variant="icon" />
            <button
              type="button"
              onClick={() => {
                setWizardStep(1);
                setWizardOpen(true);
              }}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-teal-700 hover:bg-teal-800 text-white text-xs font-semibold transition whitespace-nowrap shrink-0"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Nuevo colegio</span>
            </button>
            <button
              type="button"
              onClick={onLogout}
              className="lg:hidden inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-700"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Salir</span>
            </button>
          </div>
        </header>

        <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-6 space-y-6">
          {bannerError && (
            <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800 flex items-center justify-between gap-3">
              <span>{bannerError}</span>
              <button
                type="button"
                onClick={() => setBannerError(null)}
                className="font-semibold underline shrink-0"
              >
                Cerrar
              </button>
            </div>
          )}

          {bannerSuccess && (
            <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-900 flex items-center justify-between gap-3">
              <span>{bannerSuccess}</span>
              <button
                type="button"
                onClick={() => setBannerSuccess(null)}
                className="font-semibold underline shrink-0"
              >
                Aceptar
              </button>
            </div>
          )}

          {loading && !overview ? (
            <div className="bg-white rounded-2xl border border-slate-200 p-12 flex items-center justify-center gap-2 text-sm text-slate-500">
              <Loader2 className="w-4 h-4 animate-spin text-teal-700" />
              <span>Cargando consola de plataforma...</span>
            </div>
          ) : null}

          {/* VIEW 1: OVERVIEW */}
          {overview && section === 'overview' && (
            <div className="space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h1 className="text-xl font-bold text-slate-900">Salud General de la Plataforma</h1>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Métricas agregadas anónimas · Los casos marcados como prueba Sandbox se excluyen automáticamente.
                  </p>
                </div>

                <button
                  type="button"
                  disabled={exportingNetwork}
                  onClick={() => void handleExportNetworkCsv()}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-60 text-xs font-semibold text-slate-800 whitespace-nowrap"
                >
                  <Download className="w-3.5 h-3.5 text-teal-700" />
                  <span>{exportingNetwork ? 'Exportando...' : 'Exportar Red CSV (Zero-PII)'}</span>
                </button>
              </div>

              {/* 4 KPI Strip */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-white rounded-xl border border-slate-200 p-4">
                  <p className="text-xs text-slate-500">Colegios y equipo activo</p>
                  <p className="text-2xl font-bold text-slate-900 font-mono tabular-nums mt-1">
                    {overview.kpis.active_schools}/{overview.kpis.total_schools}
                  </p>
                  <p className="text-[11px] text-slate-500 mt-1 tabular-nums">
                    {overview.kpis.active_counselors}/{overview.kpis.total_counselors} orientadores activos
                  </p>
                </div>

                <div className="bg-white rounded-xl border border-slate-200 p-4">
                  <p className="text-xs text-slate-500">Casos reales abiertos</p>
                  <p className="text-2xl font-bold text-slate-900 font-mono tabular-nums mt-1">
                    {overview.kpis.open_real_cases}
                    <span className="text-sm font-normal text-slate-400">
                      {' '}
                      · {overview.kpis.total_real_cases} totales
                    </span>
                  </p>
                  <p className="text-[11px] text-slate-500 mt-1 tabular-nums">
                    {overview.kpis.total_mood_checkins} check-ins emocionales
                  </p>
                </div>

                <div className="bg-white rounded-xl border border-slate-200 p-4">
                  <p className="text-xs text-slate-500">Cumplimiento SLA de Red</p>
                  <p className="text-2xl font-bold text-teal-800 font-mono tabular-nums mt-1">
                    {overview.kpis.network_sla_compliance_rate}%
                  </p>
                  <p className="text-[11px] text-slate-500 mt-1 tabular-nums">
                    1.ª resp. prom.:{' '}
                    {overview.kpis.network_avg_response_minutes !== null
                      ? `${overview.kpis.network_avg_response_minutes} min`
                      : 'Sin datos'}
                  </p>
                </div>

                <div className="bg-white rounded-xl border border-slate-200 p-4">
                  <p className="text-xs text-slate-500">Críticos por atender</p>
                  <p
                    className={`text-2xl font-bold font-mono tabular-nums mt-1 ${
                      overview.kpis.open_critical_cases > 0 ? 'text-rose-700' : 'text-emerald-700'
                    }`}
                  >
                    {overview.kpis.open_critical_cases}
                  </p>
                  <p className="text-[11px] text-slate-500 mt-1 tabular-nums">
                    {overview.kpis.sla_breached_cases} caso(s) con SLA vencido
                  </p>
                </div>
              </div>

              {/* Schools Summary Table */}
              <section className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between gap-4">
                  <div>
                    <h2 className="text-sm font-bold text-slate-900">
                      Comparativo Multi-Sede de Colegios
                    </h2>
                    <p className="text-xs text-slate-500">
                      Carga operativa, cumplimiento SLA y termómetro de bienestar agregado por institución
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSection('schools')}
                    className="text-xs font-semibold text-teal-700 hover:underline whitespace-nowrap"
                  >
                    Administrar todos
                  </button>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-slate-100 text-slate-500 font-semibold">
                        <th className="py-3 px-5">Institución</th>
                        <th className="py-3 px-4">Estado</th>
                        <th className="py-3 px-4 text-right">Activos</th>
                        <th className="py-3 px-4 text-right">Críticos</th>
                        <th className="py-3 px-4 text-right">SLA %</th>
                        <th className="py-3 px-4 text-right">Resp. Prom.</th>
                        <th className="py-3 px-4 text-right">Bienestar</th>
                        <th className="py-3 px-4">Última actividad</th>
                        <th className="py-3 px-5 text-right">Acciones</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {overview.schools.map(({ school, stats }) => (
                        <tr key={school.id} className="hover:bg-slate-50/70 transition">
                          <td className="py-3 px-5">
                            <p className="font-semibold text-slate-900">{school.name}</p>
                            <p className="text-[11px] text-slate-500">
                              <span className="font-mono font-semibold text-teal-800">
                                {school.access_code}
                              </span>{' '}
                              · {school.region}
                            </p>
                          </td>
                          <td className="py-3 px-4">
                            {school.active ? (
                              <span className="inline-flex items-center gap-1 font-medium text-emerald-700">
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                Activo
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 font-medium text-amber-700">
                                <PauseCircle className="w-3.5 h-3.5" />
                                Pausado
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-700">
                            {stats.active_cases}
                          </td>
                          <td
                            className={`py-3 px-4 text-right font-mono tabular-nums font-semibold ${
                              stats.critical_cases > 0 ? 'text-rose-700' : 'text-slate-500'
                            }`}
                          >
                            {stats.critical_cases}
                          </td>
                          <td
                            className={`py-3 px-4 text-right font-mono tabular-nums font-semibold ${
                              stats.sla_compliance_rate >= 85
                                ? 'text-emerald-700'
                                : 'text-amber-700'
                            }`}
                          >
                            {stats.sla_compliance_rate}%
                          </td>
                          <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-700">
                            {stats.avg_first_response_minutes !== null
                              ? `${stats.avg_first_response_minutes}m`
                              : '—'}
                          </td>
                          <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-700">
                            {stats.wellbeing_positive_rate !== null
                              ? `${stats.wellbeing_positive_rate}%`
                              : '—'}
                          </td>
                          <td className="py-3 px-4 text-slate-500 tabular-nums">
                            {formatShortDate(stats.last_activity_at)}
                          </td>
                          <td className="py-3 px-5 text-right">
                            <div className="inline-flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => openSchoolEditor(school.id, 'general')}
                                className="px-2.5 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-100 text-xs font-medium text-slate-700 whitespace-nowrap"
                              >
                                Configurar
                              </button>
                              <button
                                type="button"
                                onClick={() => openSchoolEditor(school.id, 'sandbox')}
                                className="px-2.5 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-100 text-xs font-medium text-slate-700 whitespace-nowrap"
                              >
                                Probar
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            </div>
          )}

          {/* VIEW 2: SCHOOLS DIRECTORY & DETAIL EDITOR */}
          {overview && section === 'schools' && (
            <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
              {/* Left Selector List */}
              <aside className="print:hidden xl:col-span-4 bg-white rounded-xl border border-slate-200 overflow-hidden">
                <div className="p-4 border-b border-slate-100 space-y-3">
                  <div className="relative">
                    <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={schoolSearch}
                      onChange={(e) => setSchoolSearch(e.target.value)}
                      placeholder="Buscar colegio, código o ciudad..."
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-9 pr-3 py-2 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-900"
                    />
                  </div>

                  <div className="grid grid-cols-3 gap-1 p-1 bg-slate-100 rounded-lg">
                    {(
                      [
                        { id: 'all', label: 'Todos' },
                        { id: 'active', label: 'Activos' },
                        { id: 'paused', label: 'Pausados' },
                      ] as const
                    ).map((f) => (
                      <button
                        key={f.id}
                        type="button"
                        onClick={() => setSchoolFilter(f.id)}
                        className={`py-1.5 px-2 text-xs font-medium rounded-md transition whitespace-nowrap ${
                          schoolFilter === f.id
                            ? 'bg-white text-slate-900 shadow-sm'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        {f.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="divide-y divide-slate-100 max-h-[640px] overflow-y-auto">
                  {filteredSchools.length === 0 ? (
                    <div className="p-6 text-center text-xs text-slate-500">
                      No hay colegios que coincidan con el filtro.
                    </div>
                  ) : (
                    filteredSchools.map(({ school, stats }) => {
                      const isSel = selectedSchoolId === school.id;
                      return (
                        <button
                          key={school.id}
                          type="button"
                          onClick={() => setSelectedSchoolId(school.id)}
                          className={`w-full text-left p-4 transition ${
                            isSel ? 'bg-slate-100/90' : 'bg-white hover:bg-slate-50'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-sm font-bold text-slate-900 truncate">
                              {school.name}
                            </span>
                            <span className="font-mono text-xs font-semibold text-teal-800 shrink-0">
                              {school.access_code}
                            </span>
                          </div>
                          <div className="mt-1 flex items-center gap-2 text-xs text-slate-500">
                            <span>{school.region}</span>
                            <span aria-hidden="true">·</span>
                            <span className={school.active ? 'text-emerald-700' : 'text-amber-700'}>
                              {school.active ? 'Activo' : 'Pausado'}
                            </span>
                            <span aria-hidden="true">·</span>
                            <span className="tabular-nums">{stats.active_counselors_count} esp.</span>
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>
              </aside>

              {/* Right Detail Configuration Workspace */}
              <section className="xl:col-span-8 bg-white rounded-xl border border-slate-200 overflow-hidden">
                {!draftSchool ? (
                  <div className="p-12 text-center space-y-3">
                    <p className="text-sm font-semibold text-slate-800">
                      Selecciona un colegio o crea uno nuevo
                    </p>
                    <button
                      type="button"
                      onClick={() => setWizardOpen(true)}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-teal-700 text-white text-xs font-semibold"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Crear primer colegio
                    </button>
                  </div>
                ) : (
                  <div>
                    {/* School Header */}
                    <div className="print:hidden px-6 py-5 border-b border-slate-100 flex flex-wrap items-center justify-between gap-4">
                      <div>
                        <div className="flex items-center gap-2.5">
                          <h1 className="text-lg font-bold text-slate-900">{draftSchool.name}</h1>
                          <span className="font-mono text-xs font-semibold text-teal-800">
                            {draftSchool.access_code}
                          </span>
                        </div>
                        <p className="text-xs text-slate-500 mt-0.5">
                          {draftSchool.region} · {draftSchool.education_level}
                          {draftSchool.modular_code ? ` · Cód. Modular ${draftSchool.modular_code}` : ''}
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={() => void handleToggleSchoolActive(draftSchool)}
                        className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border text-xs font-semibold transition whitespace-nowrap ${
                          draftSchool.active
                            ? 'border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100'
                            : 'border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
                        }`}
                      >
                        {draftSchool.active ? (
                          <>
                            <PauseCircle className="w-3.5 h-3.5" />
                            <span>Pausar colegio</span>
                          </>
                        ) : (
                          <>
                            <PlayCircle className="w-3.5 h-3.5" />
                            <span>Reactivar colegio</span>
                          </>
                        )}
                      </button>
                    </div>

                    {/* Sub-tabs */}
                    <div className="print:hidden px-6 border-b border-slate-200 flex items-center gap-5 overflow-x-auto text-xs font-medium">
                      {(
                        [
                          { id: 'general', label: 'Identidad y Horarios' },
                          { id: 'team', label: 'Equipo Orientador' },
                          { id: 'categories_spaces', label: 'Categorías y Roles' },
                          { id: 'sla', label: 'SLA y Guardia' },
                          { id: 'ai', label: 'IA y Sensibilidad' },
                          { id: 'emergency', label: 'Líneas de Ayuda' },
                          { id: 'retention', label: 'Retención y Datos' },
                          { id: 'sandbox', label: 'Prueba Sandbox' },
                          { id: 'qr', label: 'Kit QR' },
                        ] as const
                      ).map((t) => (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => setEditorTab(t.id)}
                          className={`py-3.5 border-b-2 transition whitespace-nowrap shrink-0 ${
                            editorTab === t.id
                              ? 'border-slate-900 text-slate-900 font-semibold'
                              : 'border-transparent text-slate-500 hover:text-slate-900'
                          }`}
                        >
                          {t.label}
                        </button>
                      ))}
                    </div>

                    {/* Sub-tab Content */}
                    <div className="p-6">
                      {/* 1. GENERAL & BRANDING */}
                      {editorTab === 'general' && (
                        <div className="space-y-6">
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                                Nombre oficial del colegio
                              </label>
                              <input
                                type="text"
                                value={draftSchool.name}
                                onChange={(e) =>
                                  setDraftSchool({ ...draftSchool, name: e.target.value })
                                }
                                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3.5 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:bg-white"
                              />
                            </div>

                            <div>
                              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                                Nombre corto (visible en chat)
                              </label>
                              <input
                                type="text"
                                value={draftSchool.short_name}
                                onChange={(e) =>
                                  setDraftSchool({ ...draftSchool, short_name: e.target.value })
                                }
                                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3.5 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:bg-white"
                              />
                            </div>

                            <div>
                              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                                Código de acceso estudiantil
                              </label>
                              <div className="flex items-center gap-2">
                                <input
                                  type="text"
                                  value={draftSchool.access_code}
                                  onChange={(e) =>
                                    setDraftSchool({
                                      ...draftSchool,
                                      access_code: e.target.value.toUpperCase(),
                                    })
                                  }
                                  className="flex-1 bg-slate-50 border border-slate-200 rounded-lg px-3.5 py-2.5 text-sm font-mono uppercase text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900"
                                />
                                <button
                                  type="button"
                                  onClick={() => void handleRotateCode()}
                                  disabled={savingSchool}
                                  className="px-3 py-2.5 rounded-lg border border-slate-200 hover:bg-slate-100 text-xs font-semibold text-slate-700 inline-flex items-center gap-1.5 whitespace-nowrap"
                                >
                                  <RefreshCw className="w-3.5 h-3.5" />
                                  Rotar
                                </button>
                              </div>
                            </div>

                            <div>
                              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                                Región / Ciudad
                              </label>
                              <input
                                type="text"
                                value={draftSchool.region}
                                onChange={(e) =>
                                  setDraftSchool({ ...draftSchool, region: e.target.value })
                                }
                                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3.5 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:bg-white"
                              />
                            </div>

                            <div>
                              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                                Nivel educativo
                              </label>
                              <select
                                value={draftSchool.education_level}
                                onChange={(e) =>
                                  setDraftSchool({
                                    ...draftSchool,
                                    education_level: e.target.value as EducationLevel,
                                  })
                                }
                                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3.5 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900"
                              >
                                {EDUCATION_LEVELS.map((lvl) => (
                                  <option key={lvl} value={lvl}>
                                    {lvl}
                                  </option>
                                ))}
                              </select>
                            </div>

                            <div>
                              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                                Código Modular / Identificador oficial
                              </label>
                              <input
                                type="text"
                                value={draftSchool.modular_code}
                                onChange={(e) =>
                                  setDraftSchool({ ...draftSchool, modular_code: e.target.value })
                                }
                                placeholder="Opcional"
                                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3.5 py-2.5 text-sm font-mono text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:bg-white"
                              />
                            </div>
                          </div>

                          <div className="pt-4 border-t border-slate-100 space-y-4">
                            <div>
                              <span className="block text-xs font-semibold text-slate-700 mb-2">
                                Color institucional en portal estudiantil
                              </span>
                              <div className="flex flex-wrap gap-2">
                                {ACCENT_PALETTE.map((c) => (
                                  <button
                                    key={c.hex}
                                    type="button"
                                    onClick={() =>
                                      setDraftSchool({ ...draftSchool, accent_color: c.hex })
                                    }
                                    className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-medium transition ${
                                      draftSchool.accent_color === c.hex
                                        ? 'border-slate-900 bg-slate-900 text-white'
                                        : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                                    }`}
                                  >
                                    <span
                                      className="w-3 h-3 rounded-full border border-white/40"
                                      style={{ backgroundColor: c.hex }}
                                    />
                                    <span>{c.label}</span>
                                  </button>
                                ))}
                              </div>
                            </div>

                            <div>
                              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                                Mensaje de bienvenida al estudiante
                              </label>
                              <textarea
                                rows={2}
                                value={draftSchool.welcome_message}
                                onChange={(e) =>
                                  setDraftSchool({
                                    ...draftSchool,
                                    welcome_message: e.target.value,
                                  })
                                }
                                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3.5 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:bg-white"
                              />
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                              <div>
                                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                                  Horario de atención escolar
                                </label>
                                <input
                                  type="text"
                                  value={draftSchool.support_hours}
                                  onChange={(e) =>
                                    setDraftSchool({
                                      ...draftSchool,
                                      support_hours: e.target.value,
                                    })
                                  }
                                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3.5 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:bg-white"
                                />
                              </div>

                              <div>
                                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                                  Teléfono interno psicopedagogía (opcional)
                                </label>
                                <input
                                  type="text"
                                  value={draftSchool.internal_help_phone}
                                  onChange={(e) =>
                                    setDraftSchool({
                                      ...draftSchool,
                                      internal_help_phone: e.target.value,
                                    })
                                  }
                                  placeholder="Ej: 01 445 8890"
                                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3.5 py-2.5 text-sm font-mono text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:bg-white"
                                />
                              </div>
                            </div>

                            <div>
                              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                                Aviso automático fuera de horario escolar
                              </label>
                              <input
                                type="text"
                                value={draftSchool.after_hours_notice}
                                onChange={(e) =>
                                  setDraftSchool({
                                    ...draftSchool,
                                    after_hours_notice: e.target.value,
                                  })
                                }
                                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3.5 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:bg-white"
                              />
                            </div>
                          </div>

                          <div className="pt-4 border-t border-slate-100 flex justify-end">
                            <button
                              type="button"
                              disabled={savingSchool}
                              onClick={() => void handleSaveSchool()}
                              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-slate-900 hover:bg-slate-800 disabled:opacity-60 text-white text-xs font-semibold transition"
                            >
                              {savingSchool ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                <Save className="w-4 h-4" />
                              )}
                              <span>Guardar configuración</span>
                            </button>
                          </div>
                        </div>
                      )}

                      {/* 2. TEAM CRUD */}
                      {editorTab === 'team' && (
                        <div className="space-y-6">
                          <div>
                            <h2 className="text-sm font-bold text-slate-900">
                              Equipo autorizado del colegio
                            </h2>
                            <p className="text-xs text-slate-500 mt-0.5">
                              Cada cuenta solo puede visualizar y responder los casos de{' '}
                              {draftSchool.name}.
                            </p>
                          </div>

                          {loadingTeam ? (
                            <div className="py-8 text-center text-xs text-slate-400 flex items-center justify-center gap-2">
                              <Loader2 className="w-4 h-4 animate-spin" />
                              Cargando orientadores...
                            </div>
                          ) : team.length === 0 ? (
                            <div className="p-6 rounded-xl bg-slate-50 border border-slate-200 text-center text-xs text-slate-600">
                              Este colegio aún no tiene cuentas activas. Crea la primera debajo.
                            </div>
                          ) : (
                            <div className="border border-slate-200 rounded-xl divide-y divide-slate-100">
                              {team.map((member) => (
                                <div
                                  key={member.id}
                                  className="p-4 flex flex-wrap items-center justify-between gap-4"
                                >
                                  <div className="min-w-0">
                                    <p className="text-sm font-semibold text-slate-900">
                                      {member.full_name}
                                    </p>
                                    <p className="text-xs text-slate-500">
                                      <span className="font-mono">{member.email}</span>
                                      <span aria-hidden="true"> · </span>
                                      <span className="font-medium text-slate-800">
                                        {ROLE_LABELS.find((r) => r.id === member.role)?.label ||
                                          (member.role === 'director'
                                            ? 'Director/a'
                                            : member.role === 'coordinator_toe'
                                              ? 'Coord. TOE'
                                              : member.role === 'admin'
                                                ? 'Admin Colegio'
                                                : member.role === 'psychologist'
                                                  ? 'Psicólogo'
                                                  : 'Tutor')}
                                      </span>
                                      <span aria-hidden="true"> · </span>
                                      <span
                                        className={
                                          member.active ? 'text-emerald-700' : 'text-rose-700'
                                        }
                                      >
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
                                    {member.phone_whatsapp && (
                                      <p className="text-[11px] text-slate-400 mt-0.5 flex items-center gap-1">
                                        <Phone className="w-3 h-3 text-emerald-600 shrink-0" />
                                        <span className="font-mono">{member.phone_whatsapp.replace(/(\d{2})(\d+)(\d{3})/, '$1 *** $3')}</span>
                                        <span className="text-emerald-700 font-medium">WhatsApp ✓</span>
                                      </p>
                                    )}
                                    {resetPasswordTarget === member.id && (
                                      <div className="mt-2.5 flex items-center gap-2">
                                        <input
                                          type="password"
                                          value={resetPasswordValue}
                                          onChange={(e) => setResetPasswordValue(e.target.value)}
                                          placeholder="Nueva contraseña (mín. 6)"
                                          className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-xs"
                                        />
                                        <button
                                          type="button"
                                          onClick={() => void handleResetMemberPassword(member.id)}
                                          className="px-3 py-1.5 rounded-lg bg-slate-900 text-white text-xs font-semibold"
                                        >
                                          Aplicar
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => {
                                            setResetPasswordTarget(null);
                                            setResetPasswordValue('');
                                          }}
                                          className="text-xs text-slate-500 underline"
                                        >
                                          Cancelar
                                        </button>
                                      </div>
                                    )}
                                  </div>

                                  <div className="flex items-center gap-2 shrink-0">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setResetPasswordTarget(member.id);
                                        setResetPasswordValue('');
                                      }}
                                      className="px-2.5 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-xs font-medium text-slate-700"
                                    >
                                      Cambiar clave
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => void handleToggleMemberActive(member)}
                                      className="px-2.5 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-xs font-medium text-slate-700"
                                    >
                                      {member.active ? 'Desactivar' : 'Activar'}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => void handleDeleteMember(member)}
                                      className="p-1.5 rounded-lg text-slate-400 hover:text-rose-700 hover:bg-rose-50 transition"
                                      aria-label={`Eliminar cuenta de ${member.full_name}`}
                                    >
                                      <Trash2 className="w-4 h-4" />
                                    </button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}

                          {/* Add New Team Member */}
                          <form
                            onSubmit={handleCreateTeamMember}
                            className="pt-5 border-t border-slate-100 space-y-4"
                          >
                            <div className="flex items-center justify-between">
                              <h3 className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                                <UserPlus className="w-4 h-4 text-teal-700" />
                                Agregar nuevo miembro al colegio
                              </h3>
                              {/* Download credentials button */}
                              {team.filter((m) => m.active).length > 0 && (
                                <button
                                  type="button"
                                  onClick={handleDownloadCredentials}
                                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-teal-200 bg-teal-50 hover:bg-teal-100 text-teal-700 text-xs font-semibold transition"
                                  title="Genera una hoja imprimible con todas las credenciales del equipo"
                                >
                                  <Download className="w-3.5 h-3.5" />
                                  Descargar credenciales
                                </button>
                              )}
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                              <input
                                type="text"
                                required
                                value={newMemberName}
                                onChange={(e) => setNewMemberName(e.target.value)}
                                placeholder="Nombre completo (ej. Julio Pérez Saldaña)"
                                className="bg-slate-50 border border-slate-200 rounded-lg px-3.5 py-2.5 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:bg-white"
                              />
                              {/* Email field — auto-generated from name + role */}
                              <div className="relative">
                                <input
                                  type="email"
                                  required
                                  value={newMemberEmail}
                                  onChange={(e) => {
                                    setNewMemberEmailAuto(false);
                                    setNewMemberEmail(e.target.value);
                                  }}
                                  placeholder="Correo (se genera automáticamente)"
                                  className={`w-full rounded-lg px-3.5 py-2.5 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900 border ${
                                    newMemberEmailAuto && newMemberEmail
                                      ? 'bg-teal-50 border-teal-300 focus:bg-white'
                                      : 'bg-slate-50 border-slate-200 focus:bg-white'
                                  }`}
                                />
                                {newMemberEmailAuto && newMemberEmail && (
                                  <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-teal-600 text-[9px] font-semibold bg-teal-100 rounded px-1.5 py-0.5 pointer-events-none">
                                    AUTO
                                  </span>
                                )}
                                {!newMemberEmailAuto && newMemberName.trim().length >= 3 && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setNewMemberEmailAuto(true);
                                      setNewMemberEmail(generateEmailFromName(newMemberName, newMemberRole));
                                    }}
                                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-teal-700 text-[9px] underline"
                                  >
                                    Regenerar
                                  </button>
                                )}
                              </div>
                              <input
                                type="password"
                                required
                                minLength={6}
                                value={newMemberPassword}
                                onChange={(e) => setNewMemberPassword(e.target.value)}
                                placeholder="Contraseña inicial (mín. 6 caracteres)"
                                className="bg-slate-50 border border-slate-200 rounded-lg px-3.5 py-2.5 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:bg-white"
                              />
                              <select
                                value={newMemberRole}
                                onChange={(e) =>
                                  setNewMemberRole(e.target.value as CounselorRole)
                                }
                                className="bg-slate-50 border border-slate-200 rounded-lg px-3.5 py-2.5 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900"
                              >
                                <option value="director">Director / Directora</option>
                                <option value="coordinator_toe">Coordinador/a de Tutoría (TOE)</option>
                                <option value="psychologist">Psicólogo/a Escolar</option>
                                <option value="tutor">Docente Tutor/a de Aula</option>
                                <option value="admin">Administrador/a de Colegio</option>
                              </select>
                              {/* Turno */}
                              <select
                                value={newMemberShift}
                                onChange={(e) => setNewMemberShift(e.target.value as ShiftType)}
                                className="bg-slate-50 border border-slate-200 rounded-lg px-3.5 py-2.5 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900"
                              >
                                <option value="manana">Turno Mañana</option>
                                <option value="tarde">Turno Tarde</option>
                                <option value="completo">Jornada Completa</option>
                              </select>
                              {/* WhatsApp */}
                              <input
                                type="tel"
                                value={newMemberPhone}
                                onChange={(e) => setNewMemberPhone(e.target.value)}
                                placeholder="WhatsApp (ej. 51987654321)"
                                className="bg-slate-50 border border-slate-200 rounded-lg px-3.5 py-2.5 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900"
                              />
                              {newMemberRole === 'tutor' && (
                                <>
                                  <input
                                    type="text"
                                    value={newMemberGrade}
                                    onChange={(e) => setNewMemberGrade(e.target.value)}
                                    placeholder="Grado (ej. 3ro)"
                                    className="bg-slate-50 border border-slate-200 rounded-lg px-3.5 py-2.5 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900"
                                  />
                                  <input
                                    type="text"
                                    value={newMemberSection}
                                    onChange={(e) => setNewMemberSection(e.target.value)}
                                    placeholder='Sección (ej. "A")'
                                    className="bg-slate-50 border border-slate-200 rounded-lg px-3.5 py-2.5 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900"
                                  />
                                </>
                              )}
                            </div>

                            {/* Preview of auto-generated email */}
                            {newMemberEmailAuto && newMemberEmail && (
                              <p className="text-[10px] text-teal-700 bg-teal-50 border border-teal-200 rounded-lg px-3 py-1.5">
                                📧 Correo generado automáticamente: <strong>{newMemberEmail}</strong>
                                &nbsp;—&nbsp;
                                <button type="button" onClick={() => setNewMemberEmailAuto(false)} className="underline hover:no-underline">
                                  Editar manualmente
                                </button>
                              </p>
                            )}

                            <button
                              type="submit"
                              disabled={addingMember}
                              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-teal-700 hover:bg-teal-800 disabled:opacity-60 text-white text-xs font-semibold transition"
                            >
                              {addingMember ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <Plus className="w-3.5 h-3.5" />
                              )}
                              <span>Crear cuenta institucional</span>
                            </button>
                          </form>
                        </div>
                      )}

                      {/* 3. CATEGORIES & SPACES */}
                      {editorTab === 'categories_spaces' && (
                        <div className="space-y-8">
                          {/* Spaces ("Hotspots") */}
                          <div className="space-y-3">
                            <div>
                              <h2 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                                <MapPin className="w-4 h-4 text-teal-700" />
                                Espacios del plantel (Mapa de calor preventivo)
                              </h2>
                              <p className="text-xs text-slate-500 mt-0.5">
                                Lugares que el estudiante puede elegir al enviar su reporte.
                              </p>
                            </div>

                            <div className="flex flex-wrap gap-2">
                              {draftSchool.spaces.map((sp, idx) => (
                                <div
                                  key={`${sp}-${idx}`}
                                  className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-slate-200 bg-slate-50 text-xs font-medium text-slate-800"
                                >
                                  <span>{sp}</span>
                                  {draftSchool.spaces.length > 1 && (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setDraftSchool({
                                          ...draftSchool,
                                          spaces: draftSchool.spaces.filter((_, i) => i !== idx),
                                        })
                                      }
                                      className="text-slate-400 hover:text-rose-700"
                                      aria-label={`Quitar ${sp}`}
                                    >
                                      <X className="w-3.5 h-3.5" />
                                    </button>
                                  )}
                                </div>
                              ))}
                            </div>

                            <div className="flex items-center gap-2 max-w-md">
                              <input
                                type="text"
                                value={newSpaceInput}
                                onChange={(e) => setNewSpaceInput(e.target.value)}
                                placeholder="Nuevo espacio (ej. Movilidad escolar, Baños 2° piso)"
                                className="flex-1 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900"
                              />
                              <button
                                type="button"
                                onClick={() => {
                                  const clean = newSpaceInput.trim();
                                  if (!clean || draftSchool.spaces.includes(clean)) return;
                                  setDraftSchool({
                                    ...draftSchool,
                                    spaces: [...draftSchool.spaces, clean],
                                  });
                                  setNewSpaceInput('');
                                }}
                                className="px-3.5 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-800 whitespace-nowrap"
                              >
                                Agregar espacio
                              </button>
                            </div>
                          </div>

                          {/* Categories */}
                          <div className="pt-6 border-t border-slate-100 space-y-4">
                            <div>
                              <h2 className="text-sm font-bold text-slate-900">
                                Categorías de triaje visibles para el estudiante
                              </h2>
                              <p className="text-xs text-slate-500 mt-0.5">
                                Configura los motivos, prioridad inicial y estado activo de cada tarjeta.
                              </p>
                            </div>

                            <div className="border border-slate-200 rounded-xl divide-y divide-slate-100">
                              {draftSchool.categories.map((cat, idx) => (
                                <div key={cat.id} className="p-4 space-y-2.5">
                                  <div className="flex flex-wrap items-center justify-between gap-2">
                                    <div className="flex items-center gap-2 flex-1 min-w-[200px]">
                                      <input
                                        type="text"
                                        value={cat.title}
                                        onChange={(e) => {
                                          const next = [...draftSchool.categories];
                                          next[idx] = { ...cat, title: e.target.value };
                                          setDraftSchool({ ...draftSchool, categories: next });
                                        }}
                                        className="font-semibold text-sm text-slate-900 bg-transparent border-b border-transparent focus:border-slate-300 focus:outline-none w-full"
                                      />
                                    </div>
                                    <div className="flex items-center gap-2 shrink-0">
                                      <select
                                        value={cat.default_risk}
                                        onChange={(e) => {
                                          const next = [...draftSchool.categories];
                                          next[idx] = {
                                            ...cat,
                                            default_risk: e.target.value as RiskLevel,
                                          };
                                          setDraftSchool({ ...draftSchool, categories: next });
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
                                          const next = [...draftSchool.categories];
                                          next[idx] = { ...cat, active: !cat.active };
                                          setDraftSchool({ ...draftSchool, categories: next });
                                        }}
                                        className={`px-2.5 py-1 rounded-md border text-xs font-medium ${
                                          cat.active
                                            ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                                            : 'border-slate-200 bg-slate-50 text-slate-500'
                                        }`}
                                      >
                                        {cat.active ? 'Visible' : 'Oculta'}
                                      </button>

                                      {draftSchool.categories.length > 1 && (
                                        <button
                                          type="button"
                                          onClick={() =>
                                            setDraftSchool({
                                              ...draftSchool,
                                              categories: draftSchool.categories.filter(
                                                (_, i) => i !== idx
                                              ),
                                            })
                                          }
                                          className="p-1 text-slate-400 hover:text-rose-700"
                                          aria-label={`Eliminar ${cat.title}`}
                                        >
                                          <Trash2 className="w-4 h-4" />
                                        </button>
                                      )}
                                    </div>
                                  </div>

                                  <input
                                    type="text"
                                    value={cat.description}
                                    onChange={(e) => {
                                      const next = [...draftSchool.categories];
                                      next[idx] = { ...cat, description: e.target.value };
                                      setDraftSchool({ ...draftSchool, categories: next });
                                    }}
                                    className="w-full text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5"
                                  />

                                  <div className="flex flex-wrap items-center gap-3 pt-1 text-xs">
                                    <span className="text-slate-500 font-medium">
                                      Acceso clínico (Sandboxing):
                                    </span>
                                    {ROLE_LABELS.map((r) => {
                                      const currentRoles = cat.allowed_roles || [
                                        'psychologist',
                                        'tutor',
                                        'admin',
                                      ];
                                      const checked = currentRoles.includes(r.id);
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
                                                ? currentRoles.filter((x) => x !== r.id)
                                                : [...currentRoles, r.id];
                                              if (nextRoles.length === 0) return;
                                              const next = [...draftSchool.categories];
                                              next[idx] = { ...cat, allowed_roles: nextRoles };
                                              setDraftSchool({ ...draftSchool, categories: next });
                                            }}
                                            className="rounded border-slate-300 text-teal-700 focus:ring-teal-600"
                                          />
                                          <span>{r.label}</span>
                                        </label>
                                      );
                                    })}
                                  </div>
                                </div>
                              ))}
                            </div>

                            {/* Add Category */}
                            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
                              <p className="text-xs font-bold text-slate-800">
                                Añadir nueva categoría personalizada
                              </p>
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                                <input
                                  type="text"
                                  value={newCatTitle}
                                  onChange={(e) => setNewCatTitle(e.target.value)}
                                  placeholder="Título (ej. Ciberacoso en WhatsApp)"
                                  className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs"
                                />
                                <input
                                  type="text"
                                  value={newCatDesc}
                                  onChange={(e) => setNewCatDesc(e.target.value)}
                                  placeholder="Descripción empática breve"
                                  className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs"
                                />
                              </div>
                              <div className="flex flex-wrap items-center gap-2">
                                <select
                                  value={newCatRisk}
                                  onChange={(e) => setNewCatRisk(e.target.value as RiskLevel)}
                                  className="bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs"
                                >
                                  <option value="bajo">Prioridad base: Bajo</option>
                                  <option value="medio">Prioridad base: Medio</option>
                                  <option value="critico">Prioridad base: Crítico</option>
                                </select>
                                <select
                                  value={newCatIcon}
                                  onChange={(e) =>
                                    setNewCatIcon(e.target.value as CategoryIconKey)
                                  }
                                  className="bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs"
                                >
                                  <option value="alert">Ícono: Alerta</option>
                                  <option value="users">Ícono: Grupo</option>
                                  <option value="eye">Ícono: Testigo</option>
                                  <option value="heart">Ícono: Apoyo</option>
                                  <option value="shield">Ícono: Escudo</option>
                                  <option value="message">Ícono: Mensaje</option>
                                </select>
                                <select
                                  value={newCatTone}
                                  onChange={(e) => setNewCatTone(e.target.value as CategoryTone)}
                                  className="bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs"
                                >
                                  <option value="sky">Color: Azul cielo</option>
                                  <option value="amber">Color: Ámbar</option>
                                  <option value="emerald">Color: Verde</option>
                                  <option value="teal">Color: Teal</option>
                                  <option value="rose">Color: Alerta</option>
                                </select>
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (!newCatTitle.trim()) return;
                                    const newCat: CategoryConfig = {
                                      id: `cat-${Date.now()}`,
                                      title: newCatTitle.trim(),
                                      description:
                                        newCatDesc.trim() ||
                                        'Cuéntanos qué sucede para acompañarte.',
                                      icon: newCatIcon,
                                      tone: newCatTone,
                                      default_risk: newCatRisk,
                                      allowed_roles:
                                        newCatRoles.length > 0
                                          ? newCatRoles
                                          : ['psychologist', 'admin'],
                                      active: true,
                                    };
                                    setDraftSchool({
                                      ...draftSchool,
                                      categories: [...draftSchool.categories, newCat],
                                    });
                                    setNewCatTitle('');
                                    setNewCatDesc('');
                                  }}
                                  className="px-3.5 py-1.5 rounded-lg bg-slate-900 text-white text-xs font-semibold"
                                >
                                  Añadir categoría
                                </button>
                              </div>
                              <div className="flex flex-wrap items-center gap-3 text-xs pt-1">
                                <span className="text-slate-500 font-medium">Roles autorizados:</span>
                                {ROLE_LABELS.map((r) => {
                                  const checked = newCatRoles.includes(r.id);
                                  return (
                                    <label
                                      key={r.id}
                                      className="inline-flex items-center gap-1.5 cursor-pointer text-slate-700"
                                    >
                                      <input
                                        type="checkbox"
                                        checked={checked}
                                        onChange={() => {
                                          const next = checked
                                            ? newCatRoles.filter((x) => x !== r.id)
                                            : [...newCatRoles, r.id];
                                          if (next.length > 0) setNewCatRoles(next);
                                        }}
                                        className="rounded border-slate-300 text-teal-700 focus:ring-teal-600"
                                      />
                                      <span>{r.label}</span>
                                    </label>
                                  );
                                })}
                              </div>
                            </div>

                            <div className="pt-2 flex justify-end">
                              <button
                                type="button"
                                disabled={savingSchool}
                                onClick={() => void handleSaveSchool()}
                                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-slate-900 hover:bg-slate-800 disabled:opacity-60 text-white text-xs font-semibold"
                              >
                                <Save className="w-4 h-4" />
                                <span>Guardar categorías y espacios</span>
                              </button>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* 4. SLA & ON-CALL ESCALATION */}
                      {editorTab === 'sla' && (
                        <div className="space-y-6">
                          <div>
                            <h2 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                              <Clock className="w-4 h-4 text-teal-700" />
                              Acuerdos de Tiempo de Respuesta (SLA) y Escalamiento
                            </h2>
                            <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
                              Si un caso crítico o medio supera estos minutos sin primera respuesta del equipo, el sistema marca el SLA vencido, escala el caso al administrador del colegio y dispara el webhook de alerta si está configurado.
                            </p>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                                Límite respuesta Riesgo Crítico (minutos)
                              </label>
                              <input
                                type="number"
                                min={1}
                                max={1440}
                                value={draftSchool.sla_config.critical_response_minutes}
                                onChange={(e) =>
                                  setDraftSchool({
                                    ...draftSchool,
                                    sla_config: {
                                      ...draftSchool.sla_config,
                                      critical_response_minutes: Math.max(
                                        1,
                                        Number(e.target.value) || 15
                                      ),
                                    },
                                  })
                                }
                                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3.5 py-2.5 text-sm font-mono text-slate-900"
                              />
                            </div>

                            <div>
                              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                                Límite respuesta Riesgo Medio (minutos)
                              </label>
                              <input
                                type="number"
                                min={5}
                                max={2880}
                                value={draftSchool.sla_config.medium_response_minutes}
                                onChange={(e) =>
                                  setDraftSchool({
                                    ...draftSchool,
                                    sla_config: {
                                      ...draftSchool.sla_config,
                                      medium_response_minutes: Math.max(
                                        5,
                                        Number(e.target.value) || 120
                                      ),
                                    },
                                  })
                                }
                                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3.5 py-2.5 text-sm font-mono text-slate-900"
                              />
                            </div>

                            <div>
                              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                                Orientador de guardia principal (On-Call)
                              </label>
                              <select
                                value={draftSchool.sla_config.on_call_counselor_id}
                                onChange={(e) => {
                                  const member = team.find((m) => m.id === e.target.value);
                                  setDraftSchool({
                                    ...draftSchool,
                                    sla_config: {
                                      ...draftSchool.sla_config,
                                      on_call_counselor_id: e.target.value,
                                      on_call_label: member
                                        ? `Guardia · ${member.full_name}`
                                        : draftSchool.sla_config.on_call_label,
                                    },
                                  });
                                }}
                                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3.5 py-2.5 text-xs text-slate-900"
                              >
                                <option value="">Sin asignación fija</option>
                                {team.map((m) => (
                                  <option key={m.id} value={m.id}>
                                    {m.full_name} ({m.role})
                                  </option>
                                ))}
                              </select>
                            </div>

                            <div>
                              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                                Etiqueta de guardia visible
                              </label>
                              <input
                                type="text"
                                value={draftSchool.sla_config.on_call_label}
                                onChange={(e) =>
                                  setDraftSchool({
                                    ...draftSchool,
                                    sla_config: {
                                      ...draftSchool.sla_config,
                                      on_call_label: e.target.value,
                                    },
                                  })
                                }
                                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3.5 py-2.5 text-xs text-slate-900"
                              />
                            </div>

                            <div>
                              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                                Responsable de escalamiento (Dirección / Coordinación)
                              </label>
                              <input
                                type="text"
                                value={draftSchool.sla_config.escalation_contact_name}
                                onChange={(e) =>
                                  setDraftSchool({
                                    ...draftSchool,
                                    sla_config: {
                                      ...draftSchool.sla_config,
                                      escalation_contact_name: e.target.value,
                                    },
                                  })
                                }
                                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3.5 py-2.5 text-xs text-slate-900"
                              />
                            </div>

                            <div>
                              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                                Correo de escalamiento (referencia)
                              </label>
                              <input
                                type="email"
                                value={draftSchool.sla_config.escalation_contact_email}
                                onChange={(e) =>
                                  setDraftSchool({
                                    ...draftSchool,
                                    sla_config: {
                                      ...draftSchool.sla_config,
                                      escalation_contact_email: e.target.value,
                                    },
                                  })
                                }
                                placeholder="convivencia@colegio.edu.pe"
                                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3.5 py-2.5 text-xs text-slate-900"
                              />
                            </div>
                          </div>

                          <div>
                            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                              Webhook de alerta externa (Slack / Teams / Endpoint HTTPS opcional)
                            </label>
                            <input
                              type="url"
                              value={draftSchool.sla_config.escalation_webhook_url}
                              onChange={(e) =>
                                setDraftSchool({
                                  ...draftSchool,
                                  sla_config: {
                                    ...draftSchool.sla_config,
                                    escalation_webhook_url: e.target.value,
                                  },
                                })
                              }
                              placeholder="https://hooks.slack.com/services/..."
                              className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3.5 py-2.5 text-xs font-mono text-slate-900"
                            />
                          </div>

                          <div className="pt-2 flex justify-end">
                            <button
                              type="button"
                              disabled={savingSchool}
                              onClick={() => void handleSaveSchool()}
                              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-slate-900 hover:bg-slate-800 disabled:opacity-60 text-white text-xs font-semibold"
                            >
                              <Save className="w-4 h-4" />
                              <span>Guardar SLA y Guardia</span>
                            </button>
                          </div>
                        </div>
                      )}

                      {/* 5. AI CALIBRATION */}
                      {editorTab === 'ai' && (
                        <div className="space-y-6">
                          <div>
                            <h2 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                              <Sparkles className="w-4 h-4 text-teal-700" />
                              Calibración de Inteligencia Artificial y Triaje
                            </h2>
                            <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
                              Ajusta qué tan sensible es la clasificación de riesgo para {draftSchool.name} y qué palabras clave fuerzan una alerta crítica inmediata.
                            </p>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                            {(
                              [
                                {
                                  id: 'conservador',
                                  title: 'Conservador',
                                  desc: 'Marca crítico solo ante peligro físico directo o autolesión explícita.',
                                },
                                {
                                  id: 'estandar',
                                  title: 'Estándar (Recomendado)',
                                  desc: 'Balance equilibrado entre amenazas reales y malestar escolar habitual.',
                                },
                                {
                                  id: 'alta',
                                  title: 'Sensibilidad Alta',
                                  desc: 'Eleva preventivamente casos ambiguos de angustia intensa o ciberacoso.',
                                },
                              ] as const
                            ).map((mode) => (
                              <button
                                key={mode.id}
                                type="button"
                                onClick={() =>
                                  setDraftSchool({
                                    ...draftSchool,
                                    ai_config: {
                                      ...draftSchool.ai_config,
                                      sensitivity: mode.id as AiSensitivity,
                                    },
                                  })
                                }
                                className={`text-left p-4 rounded-xl border transition ${
                                  draftSchool.ai_config.sensitivity === mode.id
                                    ? 'border-slate-900 bg-slate-900 text-white'
                                    : 'border-slate-200 bg-slate-50 text-slate-800 hover:bg-white'
                                }`}
                              >
                                <p className="text-xs font-bold">{mode.title}</p>
                                <p
                                  className={`text-[11px] mt-1 leading-relaxed ${
                                    draftSchool.ai_config.sensitivity === mode.id
                                      ? 'text-slate-200'
                                      : 'text-slate-500'
                                  }`}
                                >
                                  {mode.desc}
                                </p>
                              </button>
                            ))}
                          </div>

                          <label className="flex items-center justify-between gap-4 p-4 rounded-xl border border-slate-200 bg-slate-50 cursor-pointer">
                            <div>
                              <p className="text-xs font-bold text-slate-900">
                                Asistente de Redacción Empática para Orientadores
                              </p>
                              <p className="text-[11px] text-slate-500 mt-0.5">
                                Permite al psicólogo generar borradores empáticos con Gemini dentro del chat.
                              </p>
                            </div>
                            <input
                              type="checkbox"
                              checked={draftSchool.ai_config.empathy_assistant_enabled}
                              onChange={(e) =>
                                setDraftSchool({
                                  ...draftSchool,
                                  ai_config: {
                                    ...draftSchool.ai_config,
                                    empathy_assistant_enabled: e.target.checked,
                                  },
                                })
                              }
                              className="w-4 h-4 rounded border-slate-300 text-teal-700"
                            />
                          </label>

                          <label className="flex items-center justify-between gap-4 p-4 rounded-xl border border-slate-200 bg-slate-50 cursor-pointer">
                            <div>
                              <p className="text-xs font-bold text-slate-900">
                                Módulo Espacio Inspira habilitado para estudiantes
                              </p>
                              <p className="text-[11px] text-slate-500 mt-0.5">
                                Muestra cápsulas de autoestima, respiración 4-4-6 y videos sin rastreo en el portal estudiantil.
                              </p>
                            </div>
                            <input
                              type="checkbox"
                              checked={draftSchool.inspira_enabled !== false}
                              onChange={(e) =>
                                setDraftSchool({
                                  ...draftSchool,
                                  inspira_enabled: e.target.checked,
                                })
                              }
                              className="w-4 h-4 rounded border-slate-300 text-teal-700"
                            />
                          </label>

                          <div className="space-y-2.5">
                            <p className="text-xs font-bold text-slate-800">
                              Palabras clave de escalamiento crítico inmediato (regla determinista)
                            </p>
                            <div className="flex flex-wrap gap-2">
                              {draftSchool.ai_config.critical_keywords.map((kw, idx) => (
                                <span
                                  key={`${kw}-${idx}`}
                                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-rose-200 bg-rose-50 text-xs font-mono text-rose-900"
                                >
                                  <span>{kw}</span>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setDraftSchool({
                                        ...draftSchool,
                                        ai_config: {
                                          ...draftSchool.ai_config,
                                          critical_keywords:
                                            draftSchool.ai_config.critical_keywords.filter(
                                              (_, i) => i !== idx
                                            ),
                                        },
                                      })
                                    }
                                    className="text-rose-500 hover:text-rose-800"
                                    aria-label={`Quitar ${kw}`}
                                  >
                                    <X className="w-3 h-3" />
                                  </button>
                                </span>
                              ))}
                            </div>

                            <div className="flex items-center gap-2 max-w-md">
                              <input
                                type="text"
                                value={newKeywordInput}
                                onChange={(e) => setNewKeywordInput(e.target.value)}
                                placeholder="Agregar palabra o frase crítica (ej. arma, pastillas)"
                                className="flex-1 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-900"
                              />
                              <button
                                type="button"
                                onClick={() => {
                                  const clean = newKeywordInput.trim().toLowerCase();
                                  if (
                                    !clean ||
                                    draftSchool.ai_config.critical_keywords.includes(clean)
                                  )
                                    return;
                                  setDraftSchool({
                                    ...draftSchool,
                                    ai_config: {
                                      ...draftSchool.ai_config,
                                      critical_keywords: [
                                        ...draftSchool.ai_config.critical_keywords,
                                        clean,
                                      ],
                                    },
                                  });
                                  setNewKeywordInput('');
                                }}
                                className="px-3.5 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold"
                              >
                                Añadir
                              </button>
                            </div>
                          </div>

                          <div>
                            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                              Criterio institucional y protocolo pedagógico para la IA
                            </label>
                            <textarea
                              rows={3}
                              value={draftSchool.ai_config.custom_guidance_tone}
                              onChange={(e) =>
                                setDraftSchool({
                                  ...draftSchool,
                                  ai_config: {
                                    ...draftSchool.ai_config,
                                    custom_guidance_tone: e.target.value,
                                  },
                                })
                              }
                              className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3.5 py-2.5 text-xs text-slate-900"
                            />
                          </div>

                          <div className="pt-2 flex justify-end">
                            <button
                              type="button"
                              disabled={savingSchool}
                              onClick={() => void handleSaveSchool()}
                              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-slate-900 hover:bg-slate-800 disabled:opacity-60 text-white text-xs font-semibold"
                            >
                              <Save className="w-4 h-4" />
                              <span>Guardar calibración IA</span>
                            </button>
                          </div>
                        </div>
                      )}

                      {/* 6. EMERGENCY LINES */}
                      {editorTab === 'emergency' && (
                        <div className="space-y-6">
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <div>
                              <h2 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                                <PhoneCall className="w-4 h-4 text-rose-700" />
                                Líneas de Ayuda Inmediata del Colegio
                              </h2>
                              <p className="text-xs text-slate-500 mt-0.5">
                                Se muestran al alumno al pulsar "Ayuda inmediata" o "SOS".
                              </p>
                            </div>

                            <div className="flex items-center gap-2">
                              <Globe2 className="w-3.5 h-3.5 text-slate-400" />
                              <span className="text-xs text-slate-500">Aplicar paquete:</span>
                              <select
                                value={draftSchool.country_preset}
                                onChange={(e) => handleApplyRegionalPreset(e.target.value)}
                                className="bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-medium"
                              >
                                {Object.keys(overview.catalog.regional_emergency_presets).map(
                                  (country) => (
                                    <option key={country} value={country}>
                                      {country}
                                    </option>
                                  )
                                )}
                              </select>
                            </div>
                          </div>

                          <div className="border border-slate-200 rounded-xl divide-y divide-slate-100">
                            {draftSchool.emergency_lines.map((line, idx) => (
                              <div
                                key={line.id}
                                className="p-4 flex flex-wrap items-center justify-between gap-3"
                              >
                                <div className="min-w-0">
                                  <p className="text-sm font-bold text-slate-900">{line.name}</p>
                                  <p className="text-xs text-slate-500">
                                    {line.subtitle} ·{' '}
                                    <span className="font-mono text-slate-700">
                                      {line.contact_value}
                                    </span>
                                  </p>
                                </div>

                                <div className="flex items-center gap-2">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const next = [...draftSchool.emergency_lines];
                                      next[idx] = { ...line, active: !line.active };
                                      setDraftSchool({ ...draftSchool, emergency_lines: next });
                                    }}
                                    className={`px-2.5 py-1 rounded-md border text-xs font-medium ${
                                      line.active
                                        ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                                        : 'border-slate-200 bg-slate-50 text-slate-500'
                                    }`}
                                  >
                                    {line.active ? 'Activa' : 'Oculta'}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setDraftSchool({
                                        ...draftSchool,
                                        emergency_lines: draftSchool.emergency_lines.filter(
                                          (_, i) => i !== idx
                                        ),
                                      })
                                    }
                                    className="p-1 text-slate-400 hover:text-rose-700"
                                    aria-label={`Eliminar ${line.name}`}
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>

                          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
                            <p className="text-xs font-bold text-slate-800">
                              Agregar línea local o portal regional
                            </p>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                              <input
                                type="text"
                                value={newLineName}
                                onChange={(e) => setNewLineName(e.target.value)}
                                placeholder="Nombre (ej. DEMUNA Distrito)"
                                className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs"
                              />
                              <input
                                type="text"
                                value={newLineSubtitle}
                                onChange={(e) => setNewLineSubtitle(e.target.value)}
                                placeholder="Subtítulo (ej. Protección infantil local)"
                                className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs"
                              />
                              <input
                                type="text"
                                value={newLineValue}
                                onChange={(e) => setNewLineValue(e.target.value)}
                                placeholder={
                                  newLineType === 'tel' ? 'Número (ej. 100)' : 'URL https://...'
                                }
                                className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs font-mono"
                              />
                              <div className="flex items-center gap-2">
                                <select
                                  value={newLineType}
                                  onChange={(e) =>
                                    setNewLineType(e.target.value as 'tel' | 'url')
                                  }
                                  className="bg-white border border-slate-200 rounded-lg px-2.5 py-2 text-xs"
                                >
                                  <option value="tel">Llamada telefónica</option>
                                  <option value="url">Enlace web</option>
                                </select>
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (!newLineName.trim() || !newLineValue.trim()) return;
                                    setDraftSchool({
                                      ...draftSchool,
                                      emergency_lines: [
                                        ...draftSchool.emergency_lines,
                                        {
                                          id: `line-${Date.now()}`,
                                          name: newLineName.trim(),
                                          subtitle: newLineSubtitle.trim() || 'Línea de apoyo',
                                          contact_value: newLineValue.trim(),
                                          type: newLineType,
                                          highlight: 'neutral',
                                          active: true,
                                        },
                                      ],
                                    });
                                    setNewLineName('');
                                    setNewLineSubtitle('');
                                    setNewLineValue('');
                                  }}
                                  className="px-3.5 py-2 rounded-lg bg-slate-900 text-white text-xs font-semibold whitespace-nowrap"
                                >
                                  Añadir canal
                                </button>
                              </div>
                            </div>
                          </div>

                          <div className="flex justify-end">
                            <button
                              type="button"
                              disabled={savingSchool}
                              onClick={() => void handleSaveSchool()}
                              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-slate-900 hover:bg-slate-800 disabled:opacity-60 text-white text-xs font-semibold"
                            >
                              <Save className="w-4 h-4" />
                              <span>Guardar líneas de ayuda</span>
                            </button>
                          </div>
                        </div>
                      )}

                      {/* 6B. RETENTION & DATA COMPLIANCE */}
                      {editorTab === 'retention' && (
                        <div className="space-y-6">
                          <div>
                            <h2 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                              <Database className="w-4 h-4 text-teal-700" />
                              Política de Retención Automática y Cumplimiento
                            </h2>
                            <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
                              Define durante cuántos días se conservan los chats cerrados antes de su depuración definitiva (minimización de datos y cumplimiento de privacidad escolar).
                            </p>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                                Ventana de retención para casos resueltos
                              </label>
                              <select
                                value={draftSchool.retention_config?.retention_days_resolved ?? 180}
                                onChange={(e) =>
                                  setDraftSchool({
                                    ...draftSchool,
                                    retention_config: {
                                      retention_days_resolved: Number(e.target.value),
                                      auto_purge_enabled:
                                        draftSchool.retention_config?.auto_purge_enabled ?? true,
                                      require_closure_outcome:
                                        draftSchool.retention_config?.require_closure_outcome ?? true,
                                    },
                                  })
                                }
                                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3.5 py-2.5 text-xs text-slate-900"
                              >
                                <option value={90}>90 días (Trimestral)</option>
                                <option value={180}>180 días (Semestral)</option>
                                <option value={365}>365 días (Año escolar)</option>
                                <option value={0}>Conservar indefinidamente</option>
                              </select>
                            </div>
                          </div>

                          <div className="space-y-3">
                            <label className="flex items-center justify-between gap-4 p-4 rounded-xl border border-slate-200 bg-slate-50 cursor-pointer">
                              <div>
                                <p className="text-xs font-bold text-slate-900">
                                  Depuración automática programada
                                </p>
                                <p className="text-[11px] text-slate-500 mt-0.5">
                                  Elimina conversaciones y notas internas de casos resueltos cuya antigüedad supere el límite elegido.
                                </p>
                              </div>
                              <input
                                type="checkbox"
                                checked={draftSchool.retention_config?.auto_purge_enabled ?? true}
                                onChange={(e) =>
                                  setDraftSchool({
                                    ...draftSchool,
                                    retention_config: {
                                      retention_days_resolved:
                                        draftSchool.retention_config?.retention_days_resolved ??
                                        180,
                                      auto_purge_enabled: e.target.checked,
                                      require_closure_outcome:
                                        draftSchool.retention_config?.require_closure_outcome ?? true,
                                    },
                                  })
                                }
                                className="w-4 h-4 rounded border-slate-300 text-teal-700"
                              />
                            </label>

                            <label className="flex items-center justify-between gap-4 p-4 rounded-xl border border-slate-200 bg-slate-50 cursor-pointer">
                              <div>
                                <p className="text-xs font-bold text-slate-900">
                                  Exigir resultado de cierre tipificado
                                </p>
                                <p className="text-[11px] text-slate-500 mt-0.5">
                                  Al resolver un caso, registra el desenlace estadístico para los reportes comparativos del plantel.
                                </p>
                              </div>
                              <input
                                type="checkbox"
                                checked={draftSchool.retention_config?.require_closure_outcome ?? true}
                                onChange={(e) =>
                                  setDraftSchool({
                                    ...draftSchool,
                                    retention_config: {
                                      retention_days_resolved:
                                        draftSchool.retention_config?.retention_days_resolved ??
                                        180,
                                      auto_purge_enabled:
                                        draftSchool.retention_config?.auto_purge_enabled ?? true,
                                      require_closure_outcome: e.target.checked,
                                    },
                                  })
                                }
                                className="w-4 h-4 rounded border-slate-300 text-teal-700"
                              />
                            </label>
                          </div>

                          <div className="pt-2 flex flex-wrap items-center justify-between gap-3">
                            <button
                              type="button"
                              disabled={purgingRetention}
                              onClick={() => void handlePurgeRetention()}
                              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-800 text-xs font-semibold disabled:opacity-60"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              <span>
                                {purgingRetention
                                  ? 'Ejecutando...'
                                  : 'Ejecutar depuración de vencidos'}
                              </span>
                            </button>

                            <button
                              type="button"
                              disabled={savingSchool}
                              onClick={() => void handleSaveSchool()}
                              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-slate-900 hover:bg-slate-800 disabled:opacity-60 text-white text-xs font-semibold"
                            >
                              <Save className="w-4 h-4" />
                              <span>Guardar política de retención</span>
                            </button>
                          </div>
                        </div>
                      )}

                      {/* 5. SANDBOX PRE-LAUNCH TEST */}
                      {editorTab === 'sandbox' && (
                        <div className="space-y-6">
                          <div>
                            <h2 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                              <FlaskConical className="w-4 h-4 text-teal-700" />
                              Modo Sandbox — Prueba Guiada Pre-Lanzamiento
                            </h2>
                            <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
                              Envía un reporte simulado para comprobar que la bandeja en tiempo real y el triaje con IA del colegio funcionan bien antes de imprimir los códigos QR. Los casos de prueba nunca alteran las estadísticas reales.
                            </p>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                                Categoría a simular
                              </label>
                              <select
                                value={sandboxCategory}
                                onChange={(e) => setSandboxCategory(e.target.value)}
                                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs"
                              >
                                {draftSchool.categories.map((c) => (
                                  <option key={c.id} value={c.title}>
                                    {c.title}
                                  </option>
                                ))}
                              </select>
                            </div>

                            <div>
                              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                                Espacio simulado
                              </label>
                              <select
                                value={sandboxSpace}
                                onChange={(e) => setSandboxSpace(e.target.value)}
                                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs"
                              >
                                {draftSchool.spaces.map((s) => (
                                  <option key={s} value={s}>
                                    {s}
                                  </option>
                                ))}
                              </select>
                            </div>
                          </div>

                          <div>
                            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                              Mensaje de estudiante simulado
                            </label>
                            <textarea
                              rows={3}
                              value={sandboxMessage}
                              onChange={(e) => setSandboxMessage(e.target.value)}
                              className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3.5 py-2.5 text-xs text-slate-900"
                            />
                          </div>

                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <button
                              type="button"
                              disabled={runningSandbox}
                              onClick={() => void handleRunSandboxTest()}
                              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-teal-700 hover:bg-teal-800 disabled:opacity-60 text-white text-xs font-semibold transition"
                            >
                              {runningSandbox ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                <FlaskConical className="w-4 h-4" />
                              )}
                              <span>Ejecutar prueba integral</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => void handleClearSandbox()}
                              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-200 hover:bg-slate-50 text-xs font-medium text-slate-700"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              <span>
                                Limpiar pruebas (
                                {selectedSummary?.stats.sandbox_cases ?? 0})
                              </span>
                            </button>
                          </div>

                          {sandboxResult && (
                            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2.5 text-xs">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <span className="font-bold text-slate-900">
                                  Prueba creada: <span className="font-mono">{sandboxResult.ticket.ticket_code}</span> · PIN{' '}
                                  <span className="font-mono">{sandboxResult.testPin}</span>
                                </span>
                                <span className="inline-flex items-center gap-1 font-semibold text-amber-800">
                                  <AlertTriangle className="w-3.5 h-3.5" />
                                  Riesgo detectado: {sandboxResult.triage.risk_level}
                                </span>
                              </div>
                              <p className="text-slate-600 leading-relaxed">
                                <strong>Sugerencia generada para orientación:</strong>{' '}
                                {sandboxResult.triage.ai_suggestion}
                              </p>
                            </div>
                          )}
                        </div>
                      )}

                      {/* 6. QR POSTER KIT */}
                      {editorTab === 'qr' && (
                        <div className="space-y-4">
                          <div className="print:hidden flex items-center gap-2 text-xs text-slate-500">
                            <QrCode className="w-4 h-4 text-teal-700" />
                            <span>
                              Afiche y enlace directo listo para entregar al colegio (detecta
                              automáticamente <span className="font-mono">?school={draftSchool.access_code}</span> y zona si la eliges).
                            </span>
                          </div>
                          <QrPosterGenerator
                            schoolName={draftSchool.name}
                            accessCode={draftSchool.access_code}
                            spaces={draftSchool.spaces}
                          />
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </section>
            </div>
          )}

          {/* VIEW 3: GLOBAL CATALOGS */}
          {overview && section === 'catalog' && draftCatalog && (
            <div className="max-w-4xl space-y-6">
              <div>
                <h1 className="text-xl font-bold text-slate-900">
                  Catálogos Base de Plataforma
                </h1>
                <p className="text-xs text-slate-500 mt-0.5">
                  Las categorías y espacios definidos aquí se copian automáticamente como punto de partida al crear un colegio nuevo.
                </p>
              </div>

              <section className="bg-white rounded-xl border border-slate-200 p-6 space-y-4">
                <h2 className="text-sm font-bold text-slate-900">Espacios predeterminados</h2>
                <div className="flex flex-wrap gap-2">
                  {draftCatalog.default_spaces.map((sp, idx) => (
                    <span
                      key={`${sp}-${idx}`}
                      className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-slate-200 bg-slate-50 text-xs font-medium text-slate-800"
                    >
                      <span>{sp}</span>
                      {draftCatalog.default_spaces.length > 1 && (
                        <button
                          type="button"
                          onClick={() =>
                            setDraftCatalog({
                              ...draftCatalog,
                              default_spaces: draftCatalog.default_spaces.filter(
                                (_, i) => i !== idx
                              ),
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
                    value={catalogSpaceInput}
                    onChange={(e) => setCatalogSpaceInput(e.target.value)}
                    placeholder="Agregar espacio base..."
                    className="flex-1 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const clean = catalogSpaceInput.trim();
                      if (!clean || draftCatalog.default_spaces.includes(clean)) return;
                      setDraftCatalog({
                        ...draftCatalog,
                        default_spaces: [...draftCatalog.default_spaces, clean],
                      });
                      setCatalogSpaceInput('');
                    }}
                    className="px-3.5 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold"
                  >
                    Añadir
                  </button>
                </div>
              </section>

              <section className="bg-white rounded-xl border border-slate-200 p-6 space-y-4">
                <h2 className="text-sm font-bold text-slate-900">Categorías predeterminadas</h2>
                <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl">
                  {draftCatalog.default_categories.map((cat, idx) => (
                    <div key={cat.id} className="p-4 space-y-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <input
                          type="text"
                          value={cat.title}
                          onChange={(e) => {
                            const next = [...draftCatalog.default_categories];
                            next[idx] = { ...cat, title: e.target.value };
                            setDraftCatalog({ ...draftCatalog, default_categories: next });
                          }}
                          className="font-semibold text-sm text-slate-900 bg-transparent border-b border-transparent focus:border-slate-300 focus:outline-none flex-1"
                        />
                        <select
                          value={cat.default_risk}
                          onChange={(e) => {
                            const next = [...draftCatalog.default_categories];
                            next[idx] = {
                              ...cat,
                              default_risk: e.target.value as RiskLevel,
                            };
                            setDraftCatalog({ ...draftCatalog, default_categories: next });
                          }}
                          className="bg-slate-50 border border-slate-200 rounded-md px-2 py-1 text-xs"
                        >
                          <option value="bajo">Base: Bajo</option>
                          <option value="medio">Base: Medio</option>
                          <option value="critico">Base: Crítico</option>
                        </select>
                      </div>
                      <input
                        type="text"
                        value={cat.description}
                        onChange={(e) => {
                          const next = [...draftCatalog.default_categories];
                          next[idx] = { ...cat, description: e.target.value };
                          setDraftCatalog({ ...draftCatalog, default_categories: next });
                        }}
                        className="w-full text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5"
                      />
                      <div className="flex flex-wrap items-center gap-3 pt-1 text-xs">
                        <span className="text-slate-500 font-medium">Roles permitidos base:</span>
                        {ROLE_LABELS.map((r) => {
                          const currentRoles = cat.allowed_roles || ['psychologist', 'tutor', 'admin'];
                          const checked = currentRoles.includes(r.id);
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
                                    ? currentRoles.filter((x) => x !== r.id)
                                    : [...currentRoles, r.id];
                                  if (nextRoles.length === 0) return;
                                  const next = [...draftCatalog.default_categories];
                                  next[idx] = { ...cat, allowed_roles: nextRoles };
                                  setDraftCatalog({ ...draftCatalog, default_categories: next });
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
              </section>

              <section className="bg-white rounded-xl border border-slate-200 p-6 space-y-4">
                <h2 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-teal-700" />
                  Calibración base de IA (para nuevos colegios)
                </h2>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {(['conservador', 'estandar', 'alta'] as const).map((sens) => (
                    <button
                      key={sens}
                      type="button"
                      onClick={() =>
                        setDraftCatalog({
                          ...draftCatalog,
                          default_ai_config: {
                            ...draftCatalog.default_ai_config,
                            sensitivity: sens,
                          },
                        })
                      }
                      className={`px-3.5 py-2.5 rounded-lg border text-xs font-semibold capitalize transition ${
                        draftCatalog.default_ai_config.sensitivity === sens
                          ? 'border-slate-900 bg-slate-900 text-white'
                          : 'border-slate-200 bg-slate-50 text-slate-700'
                      }`}
                    >
                      Sensibilidad: {sens}
                    </button>
                  ))}
                </div>

                <div className="flex flex-wrap gap-2">
                  {draftCatalog.default_ai_config.critical_keywords.map((kw, idx) => (
                    <span
                      key={`${kw}-${idx}`}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-rose-200 bg-rose-50 text-xs font-mono text-rose-900"
                    >
                      <span>{kw}</span>
                      <button
                        type="button"
                        onClick={() =>
                          setDraftCatalog({
                            ...draftCatalog,
                            default_ai_config: {
                              ...draftCatalog.default_ai_config,
                              critical_keywords:
                                draftCatalog.default_ai_config.critical_keywords.filter(
                                  (_, i) => i !== idx
                                ),
                            },
                          })
                        }
                        className="text-rose-500 hover:text-rose-800"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                </div>

                <div className="flex items-center gap-2 max-w-md">
                  <input
                    type="text"
                    value={catalogKeywordInput}
                    onChange={(e) => setCatalogKeywordInput(e.target.value)}
                    placeholder="Agregar palabra clave global..."
                    className="flex-1 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const clean = catalogKeywordInput.trim().toLowerCase();
                      if (
                        !clean ||
                        draftCatalog.default_ai_config.critical_keywords.includes(clean)
                      )
                        return;
                      setDraftCatalog({
                        ...draftCatalog,
                        default_ai_config: {
                          ...draftCatalog.default_ai_config,
                          critical_keywords: [
                            ...draftCatalog.default_ai_config.critical_keywords,
                            clean,
                          ],
                        },
                      });
                      setCatalogKeywordInput('');
                    }}
                    className="px-3.5 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold"
                  >
                    Añadir
                  </button>
                </div>

                <textarea
                  rows={2}
                  value={draftCatalog.default_ai_config.custom_guidance_tone}
                  onChange={(e) =>
                    setDraftCatalog({
                      ...draftCatalog,
                      default_ai_config: {
                        ...draftCatalog.default_ai_config,
                        custom_guidance_tone: e.target.value,
                      },
                    })
                  }
                  className="w-full text-xs text-slate-700 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2"
                />
              </section>

              <section className="bg-white rounded-xl border border-slate-200 p-6 space-y-4">
                <div>
                  <h2 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                    <Sparkles className="w-4 h-4 text-teal-700" />
                    Catálogo Global de Espacio Inspira (Bienestar y Autoestima)
                  </h2>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Cápsulas, ejercicios y videos educativos (youtube-nocookie.com) visibles en toda la red educativa.
                  </p>
                </div>

                <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl">
                  {(draftCatalog.default_inspira_resources || []).map((resItem, idx) => (
                    <div
                      key={resItem.id}
                      className="p-3.5 flex items-center justify-between gap-3 text-xs"
                    >
                      <div className="min-w-0">
                        <p className="font-semibold text-slate-900 truncate">{resItem.title}</p>
                        <p className="text-[11px] text-slate-500">
                          {resItem.format} · {resItem.topic} · {resItem.duration_label}
                          {resItem.youtube_id ? ` · YT:${resItem.youtube_id}` : ''}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <label className="inline-flex items-center gap-1.5 cursor-pointer text-[11px] text-slate-600">
                          <input
                            type="checkbox"
                            checked={resItem.active !== false}
                            onChange={(e) => {
                              const next = [...(draftCatalog.default_inspira_resources || [])];
                              next[idx] = { ...resItem, active: e.target.checked };
                              setDraftCatalog({ ...draftCatalog, default_inspira_resources: next });
                            }}
                            className="rounded border-slate-300 text-teal-700"
                          />
                          <span>Activo</span>
                        </label>
                        <button
                          type="button"
                          onClick={() =>
                            setDraftCatalog({
                              ...draftCatalog,
                              default_inspira_resources: (
                                draftCatalog.default_inspira_resources || []
                              ).filter((_, i) => i !== idx),
                            })
                          }
                          className="p-1.5 rounded-lg text-slate-400 hover:text-rose-700 hover:bg-rose-50"
                          title="Eliminar recurso global"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2.5">
                  <p className="text-xs font-semibold text-slate-800">
                    Añadir recurso global al catálogo Inspira
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <input
                      type="text"
                      value={catInspTitle}
                      onChange={(e) => setCatInspTitle(e.target.value)}
                      placeholder="Título..."
                      className="sm:col-span-2 bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs"
                    />
                    <select
                      value={catInspTopic}
                      onChange={(e) => setCatInspTopic(e.target.value as InspiraTopic)}
                      className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs"
                    >
                      <option value="autoestima">Autoestima</option>
                      <option value="limites">Límites sanos</option>
                      <option value="ciberacoso">Ciberacoso</option>
                      <option value="calma">Calma</option>
                      <option value="pedir_ayuda">Pedir ayuda</option>
                    </select>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <select
                      value={catInspFormat}
                      onChange={(e) => setCatInspFormat(e.target.value as InspiraFormat)}
                      className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs"
                    >
                      <option value="capsula">Cápsula</option>
                      <option value="video">Video YouTube seguro</option>
                      <option value="ejercicio">Ejercicio práctico</option>
                    </select>
                    <input
                      type="text"
                      value={catInspDuration}
                      onChange={(e) => setCatInspDuration(e.target.value)}
                      placeholder="Ej: 3 min"
                      className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs"
                    />
                    {catInspFormat === 'video' ? (
                      <input
                        type="text"
                        value={catInspYoutube}
                        onChange={(e) => setCatInspYoutube(e.target.value)}
                        placeholder="URL o ID YouTube (11 chars)"
                        className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs font-mono"
                      />
                    ) : (
                      <div className="hidden sm:block" />
                    )}
                  </div>
                  <input
                    type="text"
                    value={catInspSummary}
                    onChange={(e) => setCatInspSummary(e.target.value)}
                    placeholder="Resumen breve..."
                    className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs"
                  />
                  <textarea
                    rows={2}
                    value={catInspBody}
                    onChange={(e) => setCatInspBody(e.target.value)}
                    placeholder="Contenido completo..."
                    className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (!catInspTitle.trim() || !catInspSummary.trim()) return;
                      if (catInspFormat === 'video' && !catInspYoutube.trim()) return;
                      const created: InspiraResource = {
                        id: `insp-glob-${Date.now().toString(36)}`,
                        title: catInspTitle.trim(),
                        summary: catInspSummary.trim(),
                        body: catInspBody.trim() || catInspSummary.trim(),
                        topic: catInspTopic,
                        format: catInspFormat,
                        duration_label: catInspDuration.trim() || '2 min',
                        ...(catInspFormat === 'video'
                          ? { youtube_id: catInspYoutube.trim() }
                          : {}),
                        scope: 'global',
                        active: true,
                      };
                      setDraftCatalog({
                        ...draftCatalog,
                        default_inspira_resources: [
                          created,
                          ...(draftCatalog.default_inspira_resources || []),
                        ],
                      });
                      setCatInspTitle('');
                      setCatInspSummary('');
                      setCatInspBody('');
                      setCatInspYoutube('');
                    }}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 text-xs font-semibold text-slate-800"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Agregar al catálogo global</span>
                  </button>
                </div>

              </section>

              <section className="bg-white rounded-xl border border-slate-200 p-6 space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                      <Clock className="w-4 h-4 text-teal-700" />
                      Política de Demostración Pública
                    </h2>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Controla el acceso temporal de evaluación (pase guiado en entorno Sandbox, sin contaminar métricas reales).
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      resetDemoQuotaUses();
                      onResetLocalDemoPasses?.();
                      showSuccess('Contador de pases demo reiniciado en este navegador.');
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-xs font-semibold text-slate-700"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>Reiniciar pases de este navegador</span>
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() =>
                      setDraftCatalog({
                        ...draftCatalog,
                        demo_policy: 'timed',
                      })
                    }
                    className={`p-3.5 rounded-xl border text-left transition ${
                      (draftCatalog.demo_policy || 'timed') === 'timed'
                        ? 'border-slate-900 bg-slate-900 text-white'
                        : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    <p className="text-xs font-bold">Pase guiado temporal</p>
                    <p
                      className={`text-[11px] mt-0.5 ${
                        (draftCatalog.demo_policy || 'timed') === 'timed'
                          ? 'text-slate-300'
                          : 'text-slate-500'
                      }`}
                    >
                      UI limpia en producción con botón discreto para evaluar con límite de tiempo y usos.
                    </p>
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setDraftCatalog({
                        ...draftCatalog,
                        demo_policy: 'off',
                      })
                    }
                    className={`p-3.5 rounded-xl border text-left transition ${
                      draftCatalog.demo_policy === 'off'
                        ? 'border-slate-900 bg-slate-900 text-white'
                        : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    <p className="text-xs font-bold">Desactivado (Solo producción)</p>
                    <p
                      className={`text-[11px] mt-0.5 ${
                        draftCatalog.demo_policy === 'off' ? 'text-slate-300' : 'text-slate-500'
                      }`}
                    >
                      Oculta cualquier opción demo en el portal y bloquea los endpoints de demostración.
                    </p>
                  </button>
                </div>

                {(draftCatalog.demo_policy || 'timed') === 'timed' && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Duración por pase (minutos · 5 a 60)
                      </label>
                      <input
                        type="number"
                        min={5}
                        max={60}
                        value={draftCatalog.demo_duration_minutes ?? 15}
                        onChange={(e) =>
                          setDraftCatalog({
                            ...draftCatalog,
                            demo_duration_minutes: Math.min(
                              60,
                              Math.max(5, Number(e.target.value) || 15)
                            ),
                          })
                        }
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs font-mono tabular-nums"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Límite de pases por navegador (1 a 10)
                      </label>
                      <input
                        type="number"
                        min={1}
                        max={10}
                        value={draftCatalog.demo_max_uses ?? 3}
                        onChange={(e) =>
                          setDraftCatalog({
                            ...draftCatalog,
                            demo_max_uses: Math.min(10, Math.max(1, Number(e.target.value) || 3)),
                          })
                        }
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs font-mono tabular-nums"
                      />
                    </div>
                  </div>
                )}

                <div className="flex justify-end pt-2">
                  <button
                    type="button"
                    disabled={savingCatalog}
                    onClick={() => void handleSaveCatalog()}
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-slate-900 hover:bg-slate-800 disabled:opacity-60 text-white text-xs font-semibold"
                  >
                    {savingCatalog ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Save className="w-4 h-4" />
                    )}
                    <span>Guardar catálogos globales</span>
                  </button>
                </div>
              </section>
            </div>
          )}

          {/* VIEW 4: GLOBAL IMMUTABLE AUDIT LOG */}
          {overview && section === 'audit' && (
            <div className="space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                    <History className="w-5 h-5 text-teal-700" />
                    <span>Registro de Auditoría Inmutable (Audit Log)</span>
                  </h1>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Bitácora cronológica de cambios de configuración, rotaciones de código, exportaciones CSV, escalamientos SLA y cierres de casos.
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <select
                    value={auditSchoolFilter}
                    onChange={(e) => setAuditSchoolFilter(e.target.value)}
                    className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-800"
                  >
                    <option value="">Todos los colegios</option>
                    {overview.schools.map(({ school }) => (
                      <option key={school.id} value={school.id}>
                        {school.name} ({school.access_code})
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => void fetchAuditLogs()}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${loadingAudit ? 'animate-spin' : ''}`} />
                    <span>Actualizar</span>
                  </button>
                </div>
              </div>

              <section className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                {loadingAudit && auditLogs.length === 0 ? (
                  <div className="p-10 text-center text-xs text-slate-500 flex items-center justify-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin text-teal-700" />
                    <span>Cargando bitácora de auditoría...</span>
                  </div>
                ) : auditLogs.length === 0 ? (
                  <div className="p-10 text-center text-xs text-slate-400">
                    No hay eventos registrados bajo el filtro seleccionado.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="border-b border-slate-100 text-slate-500 font-semibold bg-slate-50">
                          <th className="py-3 px-4">Fecha y Hora</th>
                          <th className="py-3 px-4">Colegio</th>
                          <th className="py-3 px-4">Actor</th>
                          <th className="py-3 px-4">Acción</th>
                          <th className="py-3 px-4">Objetivo</th>
                          <th className="py-3 px-4">Detalle</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {auditLogs.map((log) => (
                          <tr key={log.id} className="hover:bg-slate-50/70">
                            <td className="py-3 px-4 font-mono text-[11px] text-slate-500 whitespace-nowrap tabular-nums">
                              {new Date(log.created_at).toLocaleString('es-PE', {
                                day: '2-digit',
                                month: 'short',
                                year: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </td>
                            <td className="py-3 px-4 font-medium text-slate-800 whitespace-nowrap">
                              {log.school_name}
                            </td>
                            <td className="py-3 px-4 text-slate-700 whitespace-nowrap">
                              {log.actor_name}
                            </td>
                            <td className="py-3 px-4 font-mono text-[11px] text-teal-800 whitespace-nowrap">
                              {log.action}
                            </td>
                            <td className="py-3 px-4 font-mono text-slate-700 whitespace-nowrap">
                              {log.target}
                            </td>
                            <td className="py-3 px-4 text-slate-600">{log.detail}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            </div>
          )}
        </main>
      </div>

      {/* NEW SCHOOL 3-STEP ONBOARDING WIZARD MODAL */}
      {wizardOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-xl bg-white rounded-2xl border border-slate-200 shadow-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-bold text-slate-900">
                  Alta Rápida de Colegio · Paso {wizardStep} de 3
                </h2>
                <p className="text-xs text-slate-500">
                  {wizardStep === 1
                    ? 'Datos institucionales y paquete regional de ayuda'
                    : wizardStep === 2
                      ? 'Identidad visual, bienvenida y horario escolar'
                      : 'Primer responsable de psicología o administración'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setWizardOpen(false)}
                className="p-2 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateWizardSchool} className="p-6 space-y-4">
              {wizardStep === 1 && (
                <div className="space-y-3.5">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Nombre oficial del colegio *
                    </label>
                    <input
                      type="text"
                      required
                      value={wizName}
                      onChange={(e) => setWizName(e.target.value)}
                      placeholder="Ej. I.E. Nuestra Señora de Guadalupe"
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3.5 py-2.5 text-sm"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Nombre corto
                      </label>
                      <input
                        type="text"
                        value={wizShortName}
                        onChange={(e) => setWizShortName(e.target.value)}
                        placeholder="Ej. Guadalupe"
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3.5 py-2.5 text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Código de acceso (opcional)
                      </label>
                      <input
                        type="text"
                        value={wizCode}
                        onChange={(e) => setWizCode(e.target.value.toUpperCase())}
                        placeholder="Se autogenera si está vacío"
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3.5 py-2.5 text-sm font-mono uppercase"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Ciudad / Región
                      </label>
                      <input
                        type="text"
                        value={wizRegion}
                        onChange={(e) => setWizRegion(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Líneas por país
                      </label>
                      <select
                        value={wizCountry}
                        onChange={(e) => setWizCountry(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs"
                      >
                        {overview &&
                          Object.keys(overview.catalog.regional_emergency_presets).map((c) => (
                            <option key={c} value={c}>
                              {c}
                            </option>
                          ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Nivel
                      </label>
                      <select
                        value={wizLevel}
                        onChange={(e) => setWizLevel(e.target.value as EducationLevel)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs"
                      >
                        {EDUCATION_LEVELS.map((l) => (
                          <option key={l} value={l}>
                            {l}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Código modular / ID (opcional)
                    </label>
                    <input
                      type="text"
                      value={wizModular}
                      onChange={(e) => setWizModular(e.target.value)}
                      placeholder="Ej. 0491820"
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3.5 py-2 text-xs font-mono"
                    />
                  </div>
                </div>
              )}

              {wizardStep === 2 && (
                <div className="space-y-3.5">
                  <div>
                    <span className="block text-xs font-semibold text-slate-700 mb-1.5">
                      Color institucional
                    </span>
                    <div className="flex flex-wrap gap-2">
                      {ACCENT_PALETTE.map((c) => (
                        <button
                          key={c.hex}
                          type="button"
                          onClick={() => setWizAccent(c.hex)}
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs ${
                            wizAccent === c.hex
                              ? 'border-slate-900 bg-slate-900 text-white'
                              : 'border-slate-200 text-slate-700'
                          }`}
                        >
                          <span
                            className="w-2.5 h-2.5 rounded-full"
                            style={{ backgroundColor: c.hex }}
                          />
                          {c.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Mensaje de bienvenida
                    </label>
                    <textarea
                      rows={2}
                      value={wizWelcome}
                      onChange={(e) => setWizWelcome(e.target.value)}
                      placeholder="Se completará automáticamente si lo dejas vacío."
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3.5 py-2 text-xs"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Horario escolar
                      </label>
                      <input
                        type="text"
                        value={wizHours}
                        onChange={(e) => setWizHours(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Teléfono interno psicopedagogía (opcional)
                      </label>
                      <input
                        type="text"
                        value={wizInternalPhone}
                        onChange={(e) => setWizInternalPhone(e.target.value)}
                        placeholder="Opcional"
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs font-mono"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Aviso fuera de horario
                    </label>
                    <input
                      type="text"
                      value={wizAfterHours}
                      onChange={(e) => setWizAfterHours(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs"
                    />
                  </div>
                </div>
              )}

              {wizardStep === 3 && (
                <div className="space-y-3.5">
                  <div className="p-3 rounded-xl bg-sky-50 border border-sky-200 text-xs text-slate-700">
                    <Users className="w-4 h-4 text-teal-700 inline mr-1.5" />
                    Crea la cuenta inicial del responsable TOE del colegio: Director/a, Coordinador/a TOE, Psicólogo/a o Tutor/a. Puedes añadir más cuentas después.
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Nombre completo
                      </label>
                      <input
                        type="text"
                        value={wizAdminName}
                        onChange={(e) => setWizAdminName(e.target.value)}
                        placeholder="Ej. Lic. Jorge Quispe"
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3.5 py-2 text-xs"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Rol inicial
                      </label>
                      <select
                        value={wizAdminRole}
                        onChange={(e) =>
                          setWizAdminRole(e.target.value as CounselorRole)
                        }
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3.5 py-2 text-xs"
                      >
                        <option value="director">Director / Directora</option>
                        <option value="coordinator_toe">Coordinador/a TOE</option>
                        <option value="psychologist">Psicólogo/a Escolar</option>
                        <option value="tutor">Docente Tutor/a</option>
                        <option value="admin">Administrador/a de Colegio</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Correo institucional
                      </label>
                      <input
                        type="email"
                        value={wizAdminEmail}
                        onChange={(e) => setWizAdminEmail(e.target.value)}
                        placeholder="convivencia@colegio.edu.pe"
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3.5 py-2 text-xs"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Contraseña inicial
                      </label>
                      <input
                        type="password"
                        value={wizAdminPass}
                        onChange={(e) => setWizAdminPass(e.target.value)}
                        placeholder="Mínimo 6 caracteres"
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3.5 py-2 text-xs"
                      />
                    </div>
                  </div>
                </div>
              )}

              <div className="pt-4 border-t border-slate-100 flex items-center justify-between gap-3">
                <div>
                  {wizardStep > 1 && (
                    <button
                      type="button"
                      onClick={() => setWizardStep((s) => (s === 3 ? 2 : 1))}
                      className="px-4 py-2 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      Anterior
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  {wizardStep < 3 ? (
                    <button
                      type="button"
                      onClick={() => {
                        if (wizardStep === 1 && !wizName.trim()) {
                          setBannerError('Ingresa el nombre oficial del colegio para continuar.');
                          return;
                        }
                        setWizardStep((s) => (s === 1 ? 2 : 3));
                      }}
                      className="px-5 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold"
                    >
                      Siguiente
                    </button>
                  ) : (
                    <button
                      type="submit"
                      disabled={creatingSchool}
                      className="inline-flex items-center gap-2 px-5 py-2 rounded-lg bg-teal-700 hover:bg-teal-800 disabled:opacity-60 text-white text-xs font-semibold"
                    >
                      {creatingSchool ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <CheckCircle2 className="w-4 h-4" />
                      )}
                      <span>Crear colegio y generar QR</span>
                    </button>
                  )}
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
