import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  Bell,
  BellRing,
  Check,
  Clock,
  Copy,
  Download,
  Eye,
  HeartHandshake,
  HelpCircle,
  Info,
  Loader2,
  Lock,
  LogOut,
  MapPin,
  MessageCircle,
  MessageCircleHeart,
  PhoneCall,
  Send,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
  Smile,
  Sparkles,
  Users,
  X,
} from 'lucide-react';
import type {
  CategoryConfig,
  CategoryIconKey,
  CategoryTone,
  ChatMessage,
  InspiraTopic,
  MoodType,
  PublicSchoolConfig,
  SpaceTag,
  StudentIntent,
  StudentPaceMode,
  TicketSummary,
} from '../types';
import type { DemoCapabilities } from './DemoTourBar';
import { EmergencyHelpModal } from './EmergencyHelpModal';
import { EspacioInspira } from './EspacioInspira';
import { PWAInstallButton } from './PWAInstallButton';
import { TeEscuchoLogo } from './TeEscuchoLogo';
import { ThemeToggle } from './ThemeToggle';
import { getSchoolOperatingStatus } from '../utils/schoolHours';

export type StudentScreen =
  | 'welcome'
  | 'login_existing'
  | 'category'
  | 'ticket'
  | 'chat'
  | 'inspira';

interface StudentPortalProps {
  onOpenCounselorLogin: () => void;
  demoCapabilities?: DemoCapabilities;
  demoActive?: boolean;
  demoToken?: string | null;
  demoUsesUsed?: number;
  startingDemo?: boolean;
  demoNotice?: string | null;
  onDismissDemoNotice?: () => void;
  onStartDemo?: () => void;
}

interface SilentVaultRecord {
  ticketId: string;
  ticketCode: string;
  token: string;
  schoolCode?: string;
  lastSeenCounselorCount: number;
}

const SILENT_VAULT_KEY = 'te_escucho_silent_vault_v1';

function readSilentVault(): SilentVaultRecord | null {
  try {
    const raw = window.sessionStorage.getItem(SILENT_VAULT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SilentVaultRecord;
    if (!parsed?.ticketId || !parsed?.token || !parsed?.ticketCode) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeSilentVault(record: SilentVaultRecord | null) {
  try {
    if (!record) {
      window.sessionStorage.removeItem(SILENT_VAULT_KEY);
      return;
    }
    window.sessionStorage.setItem(SILENT_VAULT_KEY, JSON.stringify(record));
  } catch {
    // Ignore storage restriction in private windows
  }
}

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const buffer = new ArrayBuffer(rawData.length);
  const outputArray = new Uint8Array(buffer);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

const DEFAULT_SPACE_OPTIONS: SpaceTag[] = [
  'Patio / Recreo',
  'Aula de clases',
  'Redes sociales',
  'Salida del colegio',
  'Otro espacio',
];

const GRADE_BAND_OPTIONS = ['Primaria', '1°–2° Sec.', '3°–5° Sec.'];
const TIME_SLOT_OPTIONS = ['Ingreso', 'Recreo', 'Clases', 'Salida', 'Redes / Tarde'];

const MOOD_OPTIONS: { id: MoodType; label: string; tone: string }[] = [
  { id: 'tranquilo', label: 'Tranquilo', tone: 'hover:border-emerald-300 hover:bg-emerald-50/70' },
  { id: 'preocupado', label: 'Preocupado', tone: 'hover:border-sky-300 hover:bg-sky-50/70' },
  { id: 'triste', label: 'Triste', tone: 'hover:border-amber-300 hover:bg-amber-50/70' },
  { id: 'excluido', label: 'Excluido', tone: 'hover:border-amber-300 hover:bg-amber-50/70' },
  { id: 'en_alerta', label: 'Con miedo', tone: 'hover:border-rose-300 hover:bg-rose-50/70' },
];

function renderCategoryIcon(icon: CategoryIconKey) {
  switch (icon) {
    case 'users':
      return <Users className="w-5 h-5" />;
    case 'alert':
      return <AlertTriangle className="w-5 h-5" />;
    case 'eye':
      return <Eye className="w-5 h-5" />;
    case 'shield':
      return <ShieldAlert className="w-5 h-5" />;
    case 'message':
      return <MessageCircle className="w-5 h-5" />;
    case 'heart':
    default:
      return <MessageCircleHeart className="w-5 h-5" />;
  }
}

const TONE_CLASSES: Record<CategoryTone, { card: string; iconBox: string }> = {
  sky: {
    card: 'hover:bg-sky-50/70 hover:border-sky-300',
    iconBox: 'bg-sky-100 text-sky-700',
  },
  amber: {
    card: 'hover:bg-amber-50/70 hover:border-amber-300',
    iconBox: 'bg-amber-100 text-amber-700',
  },
  emerald: {
    card: 'hover:bg-emerald-50/70 hover:border-emerald-300',
    iconBox: 'bg-emerald-100 text-emerald-700',
  },
  teal: {
    card: 'hover:bg-teal-50/70 hover:border-teal-300',
    iconBox: 'bg-teal-100 text-teal-700',
  },
  rose: {
    card: 'hover:bg-rose-50/70 hover:border-rose-300',
    iconBox: 'bg-rose-100 text-rose-700',
  },
};

export const StudentPortal: React.FC<StudentPortalProps> = ({
  onOpenCounselorLogin,
  demoCapabilities,
  demoActive = false,
  demoToken = null,
  demoUsesUsed = 0,
  startingDemo = false,
  demoNotice = null,
  onDismissDemoNotice,
  onStartDemo,
}) => {
  const [screen, setScreen] = useState<StudentScreen>('welcome');
  const [inspiraTopic, setInspiraTopic] = useState<InspiraTopic | 'todos'>('todos');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [sosOpen, setSosOpen] = useState(false);

  // School & Triage State
  const [schoolCode, setSchoolCode] = useState('');
  const [verifiedSchool, setVerifiedSchool] = useState<PublicSchoolConfig | null>(null);
  const [selectedCategory, setSelectedCategory] = useState('');
  const [selectedSpace, setSelectedSpace] = useState<SpaceTag>('Patio / Recreo');
  const [selectedGradeBand, setSelectedGradeBand] = useState<string>('');
  const [selectedTimeSlot, setSelectedTimeSlot] = useState<string>('');
  const schoolCodeInputRef = useRef<HTMLInputElement | null>(null);

  // Mood thermometer state
  const [moodSent, setMoodSent] = useState<MoodType | null>(null);
  const [sendingMood, setSendingMood] = useState(false);

  // Ticket + PIN + Silent Protection creation state
  const [pin, setPin] = useState(['', '', '', '']);
  const [paceMode, setPaceMode] = useState<StudentPaceMode>('discreet_help');
  const [showBreakGlassOption, setShowBreakGlassOption] = useState(false);
  const [emergencyContact, setEmergencyContact] = useState('');
  const [createdTicket, setCreatedTicket] = useState<TicketSummary | null>(null);
  const [ticketToken, setTicketToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Web Push camouflaged opt-in state
  const [pushStatus, setPushStatus] = useState<'idle' | 'subscribing' | 'enabled' | 'unavailable'>('idle');
  const [pushNotice, setPushNotice] = useState<string | null>(null);

  // Existing ticket recovery state
  const [existingTicketCode, setExistingTicketCode] = useState('');
  const [existingPin, setExistingPin] = useState('');

  // Silent Vault Banner State
  const [vaultBanner, setVaultBanner] = useState<{
    ticketId: string;
    ticketCode: string;
    token: string;
    hasUnreadReply: boolean;
  } | null>(null);
  const [resumingVault, setResumingVault] = useState(false);

  // Intention-First Triage state
  const [selectedIntent, setSelectedIntent] = useState<StudentIntent | null>(null);

  // Modo "Este celular no es mío" (Shared device / Childline guidelines)
  const [isSharedDevice, setIsSharedDevice] = useState<boolean>(false);
  const [privacyNoticeOpen, setPrivacyNoticeOpen] = useState<boolean>(false);
  const [pendingStudentText, setPendingStudentText] = useState<string | null>(null);

  const handleToggleSharedDevice = () => {
    setIsSharedDevice((prev) => {
      const next = !prev;
      if (next) {
        writeSilentVault(null);
        setVaultBanner(null);
      }
      return next;
    });
  };

  // Chat state
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [sendingMsg, setSendingMsg] = useState(false);
  const [updatingPace, setUpdatingPace] = useState(false);
  const [requestingHelp, setRequestingHelp] = useState(false);
  const [sseState, setSseState] = useState<'live' | 'reconnecting'>('live');
  const chatEndRef = useRef<HTMLDivElement | null>(null);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);

  const activeAccent = verifiedSchool?.accent_color || '#0F766E';

  const handleQuickExit = () => {
    writeSilentVault(null);
    setVaultBanner(null);
    setCreatedTicket(null);
    setTicketToken(null);
    setMessages([]);
    setNewMessage('');
    setPendingStudentText(null);
    setExistingPin('');
    setEmergencyContact('');
    setPin(['', '', '', '']);
    setVerifiedSchool(null);
    window.location.replace('https://google.com');
  };

  // Sync Silent Session Vault whenever an active ticket is opened or messages arrive
  useEffect(() => {
    if (isSharedDevice) {
      writeSilentVault(null);
      setVaultBanner(null);
      return;
    }
    if (!createdTicket || !ticketToken) return;
    const counselorCount = messages.filter((m) => m.sender_role === 'counselor').length;
    writeSilentVault({
      ticketId: createdTicket.id,
      ticketCode: createdTicket.ticket_code,
      token: ticketToken,
      schoolCode: verifiedSchool?.access_code,
      lastSeenCounselorCount: counselorCount,
    });
    setVaultBanner({
      ticketId: createdTicket.id,
      ticketCode: createdTicket.ticket_code,
      token: ticketToken,
      hasUnreadReply: false,
    });
  }, [createdTicket, ticketToken, messages, verifiedSchool?.access_code, isSharedDevice]);

  // Passive unread check from Silent Vault when on Welcome or Inspira
  useEffect(() => {
    if (isSharedDevice || (screen !== 'welcome' && screen !== 'inspira')) return;
    const vault = readSilentVault();
    if (!vault) {
      setVaultBanner(null);
      return;
    }
    let active = true;
    fetch(`/api/tickets/${vault.ticketId}/status-check`, {
      headers: { 'x-ticket-token': vault.token },
    })
      .then(async (res) => (res.ok ? res.json() : null))
      .then(
        (
          data: {
            counselorMessagesCount?: number;
          } | null
        ) => {
          if (!active) return;
          if (!data) {
            writeSilentVault(null);
            setVaultBanner(null);
            return;
          }
          const unread =
            typeof data.counselorMessagesCount === 'number' &&
            data.counselorMessagesCount > vault.lastSeenCounselorCount;
          setVaultBanner({
            ticketId: vault.ticketId,
            ticketCode: vault.ticketCode,
            token: vault.token,
            hasUnreadReply: unread,
          });
        }
      )
      .catch(() => {
        if (active) {
          setVaultBanner({
            ticketId: vault.ticketId,
            ticketCode: vault.ticketCode,
            token: vault.token,
            hasUnreadReply: false,
          });
        }
      });
    return () => {
      active = false;
    };
  }, [screen]);

  const handleResumeVaultChat = useCallback(async () => {
    const target = vaultBanner || readSilentVault();
    if (!target) return;
    setResumingVault(true);
    setErrorMsg(null);
    try {
      const res = await fetch(`/api/tickets/${target.ticketId}/messages`, {
        headers: { 'x-ticket-token': target.token },
      });
      if (!res.ok) {
        writeSilentVault(null);
        setVaultBanner(null);
        setScreen('login_existing');
        return;
      }
      const data = (await res.json()) as { ticket: TicketSummary; messages: ChatMessage[] };
      setCreatedTicket(data.ticket);
      setMessages(data.messages);
      setTicketToken(target.token);
      setScreen('chat');
    } catch {
      setErrorMsg('No se pudo retomar la conversación. Intenta ingresar con tu código y PIN.');
    } finally {
      setResumingVault(false);
    }
  }, [vaultBanner]);

  // Real-time SSE listener for student chat (stable dependency on ID, catch-up on reconnect)
  const activeTicketId = createdTicket?.id ?? null;
  useEffect(() => {
    if (screen !== 'chat' || !activeTicketId || !ticketToken) return;

    const url = `/api/stream/ticket/${activeTicketId}?token=${encodeURIComponent(ticketToken)}`;
    const es = new EventSource(url);

    es.onopen = () => {
      setSseState('live');
    };

    es.addEventListener('message_created', (event) => {
      try {
        const msg = JSON.parse((event as MessageEvent).data) as ChatMessage;
        setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]));
      } catch {
        // Ignore malformed SSE payload
      }
    });

    es.addEventListener('ticket_updated', (event) => {
      try {
        const updated = JSON.parse((event as MessageEvent).data) as TicketSummary;
        setCreatedTicket(updated);
      } catch {
        // Ignore malformed SSE payload
      }
    });

    es.onerror = () => {
      setSseState('reconnecting');
      void fetch(`/api/tickets/${activeTicketId}/messages`, {
        headers: { 'x-ticket-token': ticketToken },
      })
        .then((r) => (r.ok ? r.json() : null))
        .then((data: { ticket?: TicketSummary; messages?: ChatMessage[] } | null) => {
          if (data?.ticket) setCreatedTicket(data.ticket);
          if (Array.isArray(data?.messages)) setMessages(data.messages);
        })
        .catch(() => undefined);
    };

    return () => {
      es.close();
    };
  }, [screen, activeTicketId, ticketToken]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Auto-load school if accessed via QR link (?school=CODE&space=...)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const qrCode = params.get('school');
    const qrSpace = params.get('space')?.trim();
    if (!qrCode || !qrCode.trim()) return;
    const normalized = qrCode.trim().toUpperCase();
    setSchoolCode(normalized);
    setLoading(true);
    fetch('/api/schools/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: normalized }),
    })
      .then(async (res) => {
        if (!res.ok) return null;
        return (await res.json()) as PublicSchoolConfig;
      })
      .then((data) => {
        if (data) {
          setVerifiedSchool(data);
          if (qrSpace && data.spaces.includes(qrSpace)) {
            setSelectedSpace(qrSpace);
          } else if (data.spaces.length > 0) {
            setSelectedSpace(data.spaces[0]);
          }
          setScreen('category');
        }
      })
      .catch(() => {
        // Ignore auto-verify errors on offline start
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  const handleVerifySchool = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!schoolCode.trim()) {
      setErrorMsg('Ingresa el código de tu colegio (ejemplo: SANJOSE2026).');
      return;
    }
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await fetch('/api/schools/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: schoolCode.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Código de colegio no válido.');
      }
      const config = data as PublicSchoolConfig;
      setVerifiedSchool(config);
      if (config.spaces && config.spaces.length > 0) {
        setSelectedSpace(config.spaces[0]);
      }
      setScreen('category');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'No se pudo verificar el código.');
    } finally {
      setLoading(false);
    }
  };

  const handleMoodCheckin = async (mood: MoodType) => {
    setErrorMsg(null);
    let targetSchoolId = verifiedSchool?.id;
    if (!targetSchoolId) {
      const codeToUse = schoolCode.trim();
      if (!codeToUse) {
        setErrorMsg(
          'Ingresa primero el código de tu colegio a la derecha para registrar tu estado de forma anónima.'
        );
        schoolCodeInputRef.current?.focus();
        return;
      }
    }

    setSendingMood(true);
    try {
      if (!targetSchoolId) {
        const verifyRes = await fetch('/api/schools/verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code: schoolCode.trim() }),
        });
        if (!verifyRes.ok) {
          throw new Error('Ingresa un código de colegio válido para registrar tu ánimo.');
        }
        const school = (await verifyRes.json()) as PublicSchoolConfig;
        setVerifiedSchool(school);
        targetSchoolId = school.id;
      }
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (demoActive && demoToken) headers['x-demo-pass'] = demoToken;
      const res = await fetch('/api/mood', {
        method: 'POST',
        headers,
        body: JSON.stringify({ schoolId: targetSchoolId, mood }),
      });
      if (!res.ok) throw new Error('No se pudo guardar tu estado.');
      setMoodSent(mood);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Error al registrar.');
    } finally {
      setSendingMood(false);
    }
  };

  const handleSelectCategory = (categoryName: string) => {
    setSelectedCategory(categoryName);
    setCreatedTicket(null);
    setPin(['', '', '', '']);
    setEmergencyContact('');
    setShowBreakGlassOption(false);
    setPushStatus('idle');
    setPushNotice(null);
    setErrorMsg(null);
    setScreen('ticket');
  };

  const handleSelectIntent = (intent: StudentIntent) => {
    setSelectedIntent(intent);
    if (intent === 'unsure') {
      const fallbackTitle =
        verifiedSchool?.categories.find(
          (c) =>
            c.active &&
            (c.id === 'general' ||
              c.title.toLowerCase().includes('otro') ||
              c.title.toLowerCase().includes('apoyo'))
        )?.title ||
        verifiedSchool?.categories[0]?.title ||
        'Necesito hablar (Sin clasificar)';
      setSelectedCategory(fallbackTitle);
      setCreatedTicket(null);
      setPin(['', '', '', '']);
      setEmergencyContact('');
      setShowBreakGlassOption(false);
      setPushStatus('idle');
      setPushNotice(null);
      setErrorMsg(null);
      setScreen('ticket');
    }
  };

  const handlePinChange = (index: number, value: string) => {
    if (!/^\d*$/.test(value)) return;
    const updated = [...pin];
    updated[index] = value.slice(-1);
    setPin(updated);
    if (value && index < 3) {
      document.getElementById(`pin-${index + 1}`)?.focus();
    }
  };

  const handlePinKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !pin[index] && index > 0) {
      document.getElementById(`pin-${index - 1}`)?.focus();
    }
  };

  const handleCreateTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    const fullPin = pin.join('');
    if (fullPin.length < 4 || !verifiedSchool) {
      setErrorMsg('Por favor crea un PIN de 4 números para proteger tu conversación.');
      return;
    }
    setLoading(true);
    setErrorMsg(null);
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (demoActive && demoToken) {
        headers['x-demo-pass'] = demoToken;
      }
      const res = await fetch('/api/tickets', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          schoolId: verifiedSchool.id,
          category: selectedCategory,
          spaceTag: selectedSpace,
          gradeBand: selectedGradeBand || null,
          timeSlot: selectedTimeSlot || null,
          paceMode,
          emergencyContact: emergencyContact.trim() || null,
          pin: fullPin,
          userIntent: selectedIntent,
          isSharedDevice,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'No se pudo crear tu espacio seguro.');
      }
      setCreatedTicket(data.ticket);
      setMessages(data.messages);
      setTicketToken(data.token);
      setEmergencyContact('');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Error al crear el ticket.');
    } finally {
      setLoading(false);
    }
  };

  const handleCopyCode = () => {
    if (!createdTicket) return;
    void navigator.clipboard.writeText(createdTicket.ticket_code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadNeutralCard = () => {
    if (!createdTicket) return;
    const canvas = document.createElement('canvas');
    canvas.width = 760;
    canvas.height = 420;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.fillStyle = '#F8FAFC';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = '#0F766E';
    ctx.fillRect(0, 0, canvas.width, 84);

    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 26px system-ui, -apple-system, sans-serif';
    ctx.fillText('Espacio Inspira · Recordatorio Personal', 36, 52);

    ctx.fillStyle = '#0F172A';
    ctx.font = '600 18px system-ui, -apple-system, sans-serif';
    ctx.fillText('Tu clave privada de lectura y bienestar:', 36, 146);

    ctx.fillStyle = '#F1F5F9';
    ctx.fillRect(36, 174, 688, 118);
    ctx.strokeStyle = '#CBD5E1';
    ctx.lineWidth = 2;
    ctx.strokeRect(36, 174, 688, 118);

    ctx.fillStyle = '#0F172A';
    ctx.font = 'bold 46px monospace';
    ctx.fillText(createdTicket.ticket_code, 64, 248);

    ctx.fillStyle = '#475569';
    ctx.font = '16px system-ui, -apple-system, sans-serif';
    ctx.fillText('Usa esta clave con tu PIN personal de 4 dígitos.', 36, 342);
    ctx.fillStyle = '#64748B';
    ctx.font = '14px system-ui, -apple-system, sans-serif';
    ctx.fillText('Nota personal · Sin nombres ni referencias externas.', 36, 376);

    const url = canvas.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = url;
    a.download = `recordatorio-lectura-${createdTicket.ticket_code.replace('#', '')}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const handleEnableCamouflagedPush = async () => {
    if (!createdTicket || !ticketToken) return;
    if (
      !('serviceWorker' in navigator) ||
      !('PushManager' in window) ||
      typeof Notification === 'undefined'
    ) {
      setPushStatus('unavailable');
      setPushNotice('Este navegador no admite alertas silenciosas web.');
      return;
    }
    setPushStatus('subscribing');
    setPushNotice(null);
    try {
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') {
        setPushStatus('idle');
        setPushNotice('No se otorgó permiso de notificación. Puedes volver con tu código cuando desees.');
        return;
      }
      const keyRes = await fetch('/api/push/vapid-public-key');
      if (!keyRes.ok) throw new Error('No se pudo obtener la llave de notificación.');
      const { publicKey } = (await keyRes.json()) as { publicKey: string };
      const reg = await navigator.serviceWorker.ready;
      let subscription = await reg.pushManager.getSubscription();
      if (!subscription) {
        subscription = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey),
        });
      }
      const saveRes = await fetch(`/api/tickets/${createdTicket.id}/push-subscribe`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-ticket-token': ticketToken,
        },
        body: JSON.stringify({ subscription: subscription.toJSON() }),
      });
      if (!saveRes.ok) throw new Error('No se pudo activar la alerta discreta.');
      setPushStatus('enabled');
      setPushNotice('Alerta camuflada activa: llegará con el título neutro "Espacio Inspira".');
    } catch {
      setPushStatus('idle');
      setPushNotice('No se pudieron activar las notificaciones en este dispositivo ahora mismo.');
    }
  };

  const handleUpdatePaceMode = async (nextPace: StudentPaceMode) => {
    if (!createdTicket || !ticketToken || createdTicket.pace_mode === nextPace) return;
    setUpdatingPace(true);
    try {
      const res = await fetch(`/api/tickets/${createdTicket.id}/pace`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'x-ticket-token': ticketToken,
        },
        body: JSON.stringify({ paceMode: nextPace }),
      });
      if (res.ok) {
        const data = (await res.json()) as { ticket: TicketSummary };
        setCreatedTicket(data.ticket);
      }
    } finally {
      setUpdatingPace(false);
    }
  };

  const handleRecoverTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!existingTicketCode.trim() || existingPin.trim().length !== 4) {
      setErrorMsg('Ingresa tu código de caso (ej. #ESC-4920) y tu PIN de 4 dígitos.');
      return;
    }
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await fetch('/api/tickets/access', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ticketCode: existingTicketCode.trim(),
          pin: existingPin.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Código o PIN incorrecto.');
      }
      setCreatedTicket(data.ticket);
      setMessages(data.messages);
      if (data.school) {
        setVerifiedSchool(data.school as PublicSchoolConfig);
      }
      setTicketToken(data.token);
      setScreen('chat');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Error al abrir el caso.');
    } finally {
      setLoading(false);
    }
  };

  const submitMessageText = async () => {
    if (!newMessage.trim() || !createdTicket || !ticketToken || sendingMsg) return;
    const text = newMessage.trim();
    setNewMessage('');
    setPendingStudentText(text);
    if (composerRef.current) {
      composerRef.current.style.height = 'auto';
    }
    setSendingMsg(true);
    setErrorMsg(null);
    try {
      const res = await fetch(`/api/tickets/${createdTicket.id}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-ticket-token': ticketToken,
        },
        body: JSON.stringify({ content: text }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'No se pudo enviar tu mensaje.');
      }
      setMessages((prev) =>
        prev.some((m) => m.id === data.message.id) ? prev : [...prev, data.message]
      );
    } catch (err) {
      setNewMessage(text);
      setErrorMsg(err instanceof Error ? err.message : 'Error de conexión.');
    } finally {
      setSendingMsg(false);
      setPendingStudentText(null);
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    await submitMessageText();
  };

  const handleRequestFurtherHelp = async () => {
    if (!createdTicket || !ticketToken || requestingHelp) return;
    setRequestingHelp(true);
    setErrorMsg(null);
    try {
      const res = await fetch(`/api/tickets/${createdTicket.id}/request-further-help`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-ticket-token': ticketToken,
        },
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'No se pudo reactivar el acompañamiento.');
      }
      setCreatedTicket(data.ticket);
      if (data.message) {
        setMessages((prev) =>
          prev.some((m) => m.id === data.message.id) ? prev : [...prev, data.message]
        );
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Error al solicitar nueva ayuda.');
    } finally {
      setRequestingHelp(false);
    }
  };

  // SCREEN 4: Listening Room Chat (Full-height focused viewport)
  if (screen === 'chat' && createdTicket) {
    const operatingStatus = getSchoolOperatingStatus(verifiedSchool?.support_hours);

    return (
      <div className="min-h-screen bg-gradient-to-b from-sky-50 via-slate-50 to-emerald-50/40 flex flex-col">
        {/* Compact Sticky Top App Bar (<= 15% mobile viewport height) */}
        <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-slate-200">
          <div className="max-w-3xl mx-auto px-4 h-14 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <button
                type="button"
                onClick={() => {
                  setScreen('welcome');
                  setErrorMsg(null);
                }}
                className="min-h-[44px] min-w-[44px] -ml-2 flex items-center justify-center rounded-xl text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition"
                aria-label="Salir al inicio"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm font-bold text-slate-900 truncate tabular-nums">
                    Caso {createdTicket.ticket_code}
                  </span>
                  <span
                    className={`w-2 h-2 rounded-full shrink-0 ${
                      sseState === 'live' ? 'bg-emerald-500' : 'bg-amber-500 animate-pulse'
                    }`}
                    title={sseState === 'live' ? 'Conectado en tiempo real' : 'Reconectando...'}
                  />
                </div>
                <p className="text-[11px] font-medium truncate">
                  {createdTicket.status === 'resuelto' ? (
                    <span className="text-slate-600">Acompañamiento concluido · Opción de reabrir</span>
                  ) : createdTicket.custody_claimed_at ? (
                    <span className="text-emerald-700 font-semibold">
                      Una orientadora se ha hecho cargo
                    </span>
                  ) : !operatingStatus.isOpen ? (
                    <span className="text-amber-700">
                      Guardado · Equipo vuelve {operatingStatus.nextOpenDayLabel}
                    </span>
                  ) : sseState === 'reconnecting' ? (
                    <span className="text-amber-700">Reconectando canal seguro...</span>
                  ) : (
                    <span className="text-teal-700 font-medium">Mensaje guardado · En espera de asignación</span>
                  )}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setSosOpen(true)}
                className="min-h-[40px] px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 transition whitespace-nowrap"
              >
                SOS
              </button>
              <ThemeToggle variant="icon" />
              <button
                type="button"
                onClick={() => setPrivacyNoticeOpen(true)}
                className="min-h-[40px] w-9 flex items-center justify-center rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-500 hover:text-slate-800 transition"
                title="Límites de privacidad y salida rápida"
                aria-label="Límites de privacidad"
              >
                <HelpCircle className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={handleQuickExit}
                className="min-h-[40px] inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold transition whitespace-nowrap"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Salida rápida</span>
              </button>
            </div>
          </div>
          {isSharedDevice && (
            <div className="bg-amber-500 text-slate-950 text-xs px-4 py-1.5 flex items-center justify-between gap-3 font-medium">
              <div className="flex items-center gap-2">
                <Smartphone className="w-4 h-4 shrink-0 text-slate-950" />
                <span>Modo Celular Prestado: La sesión se borrará al salir.</span>
              </div>
              <button
                type="button"
                onClick={() => setPrivacyNoticeOpen(true)}
                className="underline text-[11px] font-bold shrink-0 hover:text-black"
              >
                Límites (Childline)
              </button>
            </div>
          )}
        </header>

        {/* Thread Area */}
        <main className="flex-1 max-w-3xl w-full mx-auto px-4 py-5 pb-[max(2rem,calc(env(safe-area-inset-bottom,0px)+1.5rem))] flex flex-col safe-area-bottom">
          <div className="mb-3 pb-3 border-b border-slate-200/80 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
            <span>
              Motivo: <strong className="text-slate-700">{createdTicket.category}</strong> ·{' '}
              {createdTicket.space_tag}
              {createdTicket.time_slot ? ` · ${createdTicket.time_slot}` : ''}
            </span>
            <span className="tabular-nums">
              Código {createdTicket.ticket_code}
            </span>
          </div>

          {/* Estado «Alguien se hace cargo»: Cobertura humana real y verificable */}
          {!operatingStatus.isOpen ? (
            <div className="mb-3 p-3.5 rounded-2xl bg-amber-50/90 border border-amber-200 text-xs text-amber-900 space-y-1">
              <div className="flex items-center gap-2 font-semibold">
                <Clock className="w-4 h-4 text-amber-700 shrink-0" />
                <span>Horario de orientación cerrado · Mensaje protegido</span>
              </div>
              <p className="text-[12px] leading-relaxed text-amber-800">
                Tu mensaje está guardado. El equipo de orientación retoma la atención{' '}
                <strong>{operatingStatus.nextOpenDayLabel}</strong> a las{' '}
                <strong>{operatingStatus.nextOpenTimeLabel}</strong>. Puedes regresar en cualquier momento
                con tu código y PIN. Si estás en una situación de peligro inmediato ahora mismo, pulsa el
                botón SOS arriba.
              </p>
            </div>
          ) : createdTicket.custody_claimed_at ? (
            <div className="mb-3 px-3.5 py-2.5 rounded-2xl bg-emerald-50 border border-emerald-200 flex items-center justify-between gap-2 text-xs text-emerald-900">
              <span className="flex items-center gap-2 font-semibold">
                <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>
                  {createdTicket.custody_claimed_role === 'tutor'
                    ? 'Una orientadora de Tutoría se ha hecho cargo de tu caso'
                    : 'Una especialista de Psicología se ha hecho cargo de tu caso'}
                </span>
              </span>
              <span className="text-[11px] text-emerald-700 font-mono tabular-nums font-medium">
                Atención activa
              </span>
            </div>
          ) : (
            <div className="mb-3 px-3.5 py-2 rounded-xl bg-sky-50/80 border border-sky-200 text-xs text-sky-900 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-sky-500 animate-pulse shrink-0" />
              <span>
                Mensaje recibido en el colegio. En espera de que una orientadora tome tu caso.
              </span>
            </div>
          )}

          {Boolean(createdTicket.reopened_by_student_at) && createdTicket.status !== 'resuelto' && (
            <div className="mb-3 px-3.5 py-2 rounded-xl bg-teal-50 border border-teal-200 text-xs text-teal-900 flex items-center gap-2 font-medium">
              <HeartHandshake className="w-4 h-4 text-teal-700 shrink-0" />
              <span>
                Has solicitado continuar con el acompañamiento. El caso se ha reactivado con prioridad.
              </span>
            </div>
          )}

          {/* Interactive Emotional Pace Toggle */}
          <div className="mb-3 p-3 rounded-2xl bg-white border border-slate-200 flex flex-wrap items-center justify-between gap-2.5">
            <span className="text-xs font-medium text-slate-700 flex items-center gap-1.5">
              <HeartHandshake className="w-4 h-4 text-teal-700 shrink-0" />
              <span>¿Cómo prefieres que te acompañemos hoy?</span>
            </span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                disabled={updatingPace}
                onClick={() => void handleUpdatePaceMode('listen_only')}
                className={`min-h-[36px] px-3 py-1.5 rounded-xl text-xs font-semibold border transition ${
                  createdTicket.pace_mode === 'listen_only'
                    ? 'bg-slate-900 text-white border-slate-900'
                    : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                }`}
              >
                Solo quiero desahogarme
              </button>
              <button
                type="button"
                disabled={updatingPace}
                onClick={() => void handleUpdatePaceMode('discreet_help')}
                className={`min-h-[36px] px-3 py-1.5 rounded-xl text-xs font-semibold border transition ${
                  createdTicket.pace_mode !== 'listen_only'
                    ? 'bg-teal-700 text-white border-teal-700'
                    : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                }`}
              >
                Acepto apoyo discreto
              </button>
            </div>
          </div>

          {verifiedSchool && (
            <div className="mb-4 px-3.5 py-2.5 rounded-xl bg-white border border-slate-200 text-xs text-slate-600 flex flex-wrap items-center justify-between gap-2">
              <span className="flex items-center gap-1.5 font-medium text-slate-700">
                <Clock className="w-3.5 h-3.5 text-teal-700 shrink-0" />
                {verifiedSchool.support_hours}
              </span>
              <span className="text-[11px] text-slate-500">
                {verifiedSchool.after_hours_notice}
              </span>
            </div>
          )}

          {errorMsg && (
            <div className="mb-3 p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800">
              {errorMsg}
            </div>
          )}

          <div className="flex-1 space-y-3 pb-4">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex ${
                  msg.sender_role === 'student' ? 'justify-end' : 'justify-start'
                }`}
              >
                <div
                  className={`max-w-[85%] sm:max-w-[75%] px-4 py-3 rounded-2xl text-sm leading-relaxed ${
                    msg.sender_role === 'student'
                      ? 'text-white rounded-br-sm'
                      : 'bg-white text-slate-800 border border-slate-200 rounded-bl-sm'
                  }`}
                  style={msg.sender_role === 'student' ? { backgroundColor: activeAccent } : undefined}
                >
                  <p className="whitespace-pre-wrap">{msg.content}</p>
                  {msg.sender_role === 'student' && (
                    <div className="flex items-center justify-end gap-1 mt-1 text-[10px] text-teal-100">
                      <Check className="w-3 h-3" />
                      <span>✓ Guardado en el colegio</span>
                      <span>·</span>
                      <span>
                        {new Date(msg.created_at).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            ))}

            {pendingStudentText && (
              <div className="flex justify-end">
                <div
                  className="max-w-[85%] sm:max-w-[75%] px-4 py-3 rounded-2xl text-sm leading-relaxed text-white rounded-br-sm opacity-80"
                  style={{ backgroundColor: activeAccent }}
                >
                  <p className="whitespace-pre-wrap">{pendingStudentText}</p>
                  <div className="flex items-center justify-end gap-1 mt-1 text-[10px] text-teal-100">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    <span>Enviando... (Aún no guardado en el colegio)</span>
                  </div>
                </div>
              </div>
            )}

            {/* Módulo «Sigo necesitando ayuda»: Si el caso fue cerrado, ofrece reapertura inmediata */}
            {createdTicket.status === 'resuelto' && (
              <div className="my-4 p-4 rounded-2xl bg-white border-2 border-teal-200 text-center space-y-3 shadow-sm">
                <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-teal-50 text-teal-700 mx-auto">
                  <HeartHandshake className="w-5 h-5" />
                </div>
                <div className="space-y-1">
                  <h4 className="text-sm font-bold text-slate-800">
                    Este acompañamiento fue marcado como concluido
                  </h4>
                  <p className="text-xs text-slate-600 max-w-md mx-auto leading-relaxed">
                    Si la situación continúa, no te sientes mejor o requieres que una orientadora
                    vuelva a contactarse contigo, puedes solicitar un nuevo seguimiento inmediato.
                  </p>
                </div>
                <button
                  type="button"
                  disabled={requestingHelp}
                  onClick={() => void handleRequestFurtherHelp()}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-teal-700 hover:bg-teal-800 disabled:opacity-50 text-white font-semibold text-xs transition shadow-sm"
                >
                  {requestingHelp ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <HeartHandshake className="w-4 h-4" />
                  )}
                  <span>Sigo necesitando ayuda</span>
                </button>
              </div>
            )}

            <div ref={chatEndRef} />
          </div>
        </main>

        {/* Expandable Multi-line Bottom Composer */}
        <footer className="sticky bottom-0 bg-white/95 backdrop-blur-md border-t border-slate-200">
          <form
            onSubmit={handleSendMessage}
            className="max-w-3xl mx-auto px-4 py-3 space-y-1.5"
          >
            <div className="flex items-end gap-2.5">
              <textarea
                ref={composerRef}
                rows={1}
                value={newMessage}
                onChange={(e) => {
                  setNewMessage(e.target.value);
                  e.target.style.height = 'auto';
                  e.target.style.height = `${Math.min(e.target.scrollHeight, 140)}px`;
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    void submitMessageText();
                  }
                }}
                maxLength={4000}
                placeholder="Escribe con calma lo que quieras contar... (Enter para enviar)"
                className="flex-1 min-h-[44px] max-h-[140px] bg-slate-100 border border-slate-200 rounded-2xl px-4 py-2.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-600 focus:bg-white transition resize-none leading-relaxed"
              />
              <button
                type="submit"
                disabled={sendingMsg || !newMessage.trim()}
                style={{ backgroundColor: activeAccent }}
                className="min-h-[44px] min-w-[44px] px-4 rounded-2xl hover:opacity-95 disabled:opacity-50 text-white font-semibold text-sm flex items-center justify-center gap-1.5 transition shrink-0"
                aria-label="Enviar mensaje"
              >
                {sendingMsg ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
                <span className="hidden sm:inline">Enviar</span>
              </button>
            </div>
            {newMessage.length > 0 && (
              <div className="flex justify-between items-center px-1 text-[11px] text-slate-400">
                <span>Shift+Enter para salto de línea</span>
                <span className="font-mono tabular-nums">{newMessage.length}/4000</span>
              </div>
            )}
          </form>
        </footer>

        <EmergencyHelpModal
          open={sosOpen}
          onClose={() => setSosOpen(false)}
          lines={verifiedSchool?.emergency_lines}
          internalPhone={verifiedSchool?.internal_help_phone}
          schoolName={verifiedSchool?.short_name}
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-sky-50/80 via-slate-50 to-emerald-50/50 flex flex-col">
      {/* Clean Minimal Student Header */}
      <header className="sticky top-0 z-40 w-full border-b border-slate-200/80 dark:border-slate-800/80 bg-white/90 dark:bg-[#090E1A]/95 backdrop-blur-md shadow-xs transition-shadow duration-200">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-16 sm:h-20 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => {
              setScreen('welcome');
              setErrorMsg(null);
            }}
            className="flex items-center gap-2.5 sm:gap-3 text-left shrink-0 group focus:outline-none"
            title="Ir al inicio de Te Escucho"
          >
            <div className="relative shrink-0 flex items-center justify-center">
              <TeEscuchoLogo size={44} animated={false} className="shrink-0 drop-shadow-sm transition-transform duration-200 group-hover:scale-105" />
            </div>
            <div className="flex flex-col min-w-0 justify-center">
              <span className="text-xl sm:text-2xl font-black tracking-tight text-slate-900 dark:text-white leading-none whitespace-nowrap">
                Te Escucho
              </span>
              <span className="text-[10px] sm:text-xs font-bold text-teal-700 dark:text-teal-400 tracking-wider uppercase mt-1 whitespace-nowrap">
                Apoyo Escolar
              </span>
            </div>
          </button>

          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            {verifiedSchool?.inspira_enabled !== false && (
              <div
                className="hidden sm:inline-flex items-center p-1 rounded-xl bg-slate-100 dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700/80"
                role="tablist"
                aria-label="Secciones estudiantiles"
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={screen !== 'inspira'}
                  onClick={() => {
                    setErrorMsg(null);
                    setScreen(verifiedSchool ? 'category' : 'welcome');
                  }}
                  className={`min-h-[36px] inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition whitespace-nowrap ${
                    screen !== 'inspira'
                      ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  <ShieldCheck className="w-3.5 h-3.5 text-teal-700 dark:text-teal-400" />
                  <span>Buzón seguro</span>
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={screen === 'inspira'}
                  onClick={() => {
                    setErrorMsg(null);
                    setInspiraTopic('todos');
                    setScreen('inspira');
                  }}
                  style={
                    screen === 'inspira' ? { backgroundColor: activeAccent } : undefined
                  }
                  className={`min-h-[36px] inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition whitespace-nowrap ${
                    screen === 'inspira'
                      ? 'text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Espacio Inspira</span>
                </button>
              </div>
            )}
            <PWAInstallButton variant="light" />
            <button
              type="button"
              onClick={() => setSosOpen(true)}
              className="min-h-[38px] sm:min-h-[40px] inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-xl border border-rose-200 dark:border-rose-900/60 bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 dark:hover:bg-rose-900/60 text-xs font-bold text-rose-800 dark:text-rose-300 transition whitespace-nowrap"
            >
              <PhoneCall className="w-3.5 h-3.5 shrink-0" />
              <span className="hidden sm:inline">Ayuda inmediata</span>
              <span className="sm:hidden font-extrabold">SOS</span>
            </button>
            <ThemeToggle variant="icon" />
            <button
              type="button"
              onClick={() => setPrivacyNoticeOpen(true)}
              className="min-h-[38px] sm:min-h-[40px] w-8 sm:w-9 flex items-center justify-center rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 transition"
              title="Límites de privacidad y salida rápida"
              aria-label="Límites de privacidad"
            >
              <HelpCircle className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={handleQuickExit}
              className="min-h-[38px] sm:min-h-[40px] px-2.5 sm:px-3 py-1.5 sm:py-2 flex items-center justify-center rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold transition whitespace-nowrap"
              title="Salir rápido de esta página"
              aria-label="Salida rápida"
            >
              <LogOut className="w-3.5 h-3.5 shrink-0" />
              <span className="hidden sm:inline">Salida rápida</span>
            </button>
          </div>
        </div>

        {isSharedDevice && (
          <div className="bg-amber-500 text-slate-950 text-xs px-4 sm:px-6 py-1.5 flex items-center justify-between gap-3 font-medium">
            <div className="flex items-center gap-2">
              <Smartphone className="w-4 h-4 shrink-0 text-slate-950" />
              <span>
                <strong>Modo Celular Prestado activo:</strong> No se guardará nada en este teléfono al salir.
              </span>
            </div>
            <button
              type="button"
              onClick={() => setPrivacyNoticeOpen(true)}
              className="underline text-[11px] font-bold shrink-0 hover:text-black"
            >
              Límites (Childline)
            </button>
          </div>
        )}

        {/* Mobile Segmented Switcher (prevents top-row brand clipping and maximizes reachability) */}
        {verifiedSchool?.inspira_enabled !== false && (
          <div className="sm:hidden px-3 sm:px-4 pb-2.5 pt-0.5">
            <div
              className="grid grid-cols-2 gap-1.5 p-1 rounded-2xl bg-slate-100/90 dark:bg-slate-900/90 border border-slate-200/80 dark:border-slate-800"
              role="tablist"
              aria-label="Navegación principal móvil"
            >
              <button
                type="button"
                role="tab"
                aria-selected={screen !== 'inspira'}
                onClick={() => {
                  setErrorMsg(null);
                  setScreen(verifiedSchool ? 'category' : 'welcome');
                }}
                className={`min-h-[42px] inline-flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-xs font-bold transition ${
                  screen !== 'inspira'
                    ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs border border-slate-200/60 dark:border-slate-700/60'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <ShieldCheck className="w-4 h-4 text-teal-700 dark:text-teal-400 shrink-0" />
                <span className="tracking-tight">Buzón seguro</span>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={screen === 'inspira'}
                onClick={() => {
                  setErrorMsg(null);
                  setInspiraTopic('todos');
                  setScreen('inspira');
                }}
                style={screen === 'inspira' ? { backgroundColor: activeAccent } : undefined}
                className={`min-h-[42px] inline-flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-xs font-bold transition ${
                  screen === 'inspira'
                    ? 'text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <Sparkles className="w-4 h-4 shrink-0" />
                <span className="tracking-tight">Espacio Inspira</span>
              </button>
            </div>
          </div>
        )}
      </header>

      {/* Main Responsive Canvas */}
      <main className="flex-1 max-w-5xl w-full mx-auto px-4 sm:px-6 py-8 sm:py-12 pb-[max(3rem,calc(env(safe-area-inset-bottom,0px)+2rem))] flex items-center safe-area-bottom">
        {screen === 'welcome' && (
          <div className="w-full grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-start">
            {/* Left Column: Empathetic Context + Daily Emotional Thermometer */}
            <div className="lg:col-span-7 space-y-7">
              <div className="space-y-3">
                {demoNotice && (
                  <div className="p-3 rounded-xl bg-slate-100 border border-slate-200 text-xs text-slate-700 flex items-center justify-between gap-3">
                    <span>{demoNotice}</span>
                    {onDismissDemoNotice && (
                      <button
                        type="button"
                        onClick={onDismissDemoNotice}
                        className="font-semibold text-slate-900 underline shrink-0"
                      >
                        Entendido
                      </button>
                    )}
                  </div>
                )}
                <p className="inline-flex items-center gap-2 text-xs font-semibold text-teal-800">
                  <ShieldCheck className="w-4 h-4 text-teal-700" />
                  100% Anónimo · Sin registro · Sin rastreo de IP
                </p>
                <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight text-balance leading-tight">
                  Tu espacio seguro para hablar sin miedo y recibir apoyo real.
                </h1>
                <p className="text-base text-slate-600 leading-relaxed max-w-xl">
                  Si sientes que te excluyen, te molestan en el colegio o en redes, viste que tratan mal a un compañero o solo necesitas desahogarte, aquí te escuchamos sin juzgarte.
                </p>
              </div>

              {/* Termómetro Emocional Diario */}
              <section className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 space-y-4">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Smile className="w-4 h-4 text-teal-700" />
                    <h2 className="text-sm font-bold text-slate-900">
                      Termómetro emocional diario
                    </h2>
                  </div>
                  <span className="text-xs text-slate-400">Anónimo · 1 toque</span>
                </div>
                <p className="text-xs text-slate-600 leading-relaxed">
                  ¿Cómo te sientes hoy en tu colegio? Tu pulso ayuda a tutores y psicólogos a cuidar el ambiente del salón antes de que ocurra un problema mayor.
                </p>

                {moodSent ? (
                  <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-950 space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <span>
                        Gracias por compartir cómo te sientes hoy. Si quieres conversar, abre un chat seguro cuando lo desees.
                      </span>
                      <button
                        type="button"
                        onClick={() => setMoodSent(null)}
                        className="font-semibold underline shrink-0 min-h-[36px]"
                      >
                        Cambiar
                      </button>
                    </div>
                    {verifiedSchool?.inspira_enabled !== false && (
                      <div className="pt-2.5 border-t border-emerald-200/80 flex flex-wrap items-center justify-between gap-2">
                        <span className="text-emerald-900 font-medium">
                          {moodSent === 'en_alerta' || moodSent === 'preocupado'
                            ? '¿Quieres hacer una pausa de calma 4-4-6 de 2 minutos?'
                            : moodSent === 'triste' || moodSent === 'excluido'
                              ? 'Preparamos guías de autoestima y límites sanos para acompañarte hoy.'
                              : 'Explora herramientas de calma y convivencia en Espacio Inspira.'}
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            setInspiraTopic(
                              moodSent === 'en_alerta' || moodSent === 'preocupado'
                                ? 'calma'
                                : moodSent === 'triste' || moodSent === 'excluido'
                                  ? 'autoestima'
                                  : 'todos'
                            );
                            setScreen('inspira');
                          }}
                          className="min-h-[38px] inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-white border border-emerald-300 hover:bg-emerald-100/60 text-xs font-bold text-teal-800 transition"
                        >
                          <Sparkles className="w-3.5 h-3.5" />
                          <span>Abrir Espacio Inspira</span>
                        </button>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                    {MOOD_OPTIONS.map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        disabled={sendingMood}
                        onClick={() => handleMoodCheckin(m.id)}
                        className={`min-h-[44px] px-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50/70 text-xs font-semibold text-slate-700 transition ${m.tone} disabled:opacity-60`}
                      >
                        {m.label}
                      </button>
                    ))}
                  </div>
                )}
              </section>

              <div className="pt-1 space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-4 text-xs text-slate-500">
                  <span>¿Eres psicólogo o tutor escolar?</span>
                  <button
                    type="button"
                    onClick={onOpenCounselorLogin}
                    className="inline-flex items-center gap-1.5 font-semibold text-teal-800 hover:text-teal-900 underline underline-offset-4 min-h-[44px]"
                  >
                    <Lock className="w-3.5 h-3.5" />
                    Acceso Tutores / Psicología
                  </button>
                </div>

                {!demoActive && demoCapabilities?.demoPolicy === 'timed' && (
                  <div className="pt-2.5 border-t border-slate-200/80 flex flex-wrap items-center justify-between gap-3 text-xs">
                    {demoUsesUsed < demoCapabilities.demoMaxUses ? (
                      <>
                        <span className="text-slate-500 tabular-nums">
                          ¿Evalúas para tu colegio?{' '}
                          <span className="text-slate-700 font-medium">
                            {demoCapabilities.demoMaxUses - demoUsesUsed} de{' '}
                            {demoCapabilities.demoMaxUses} pases disponibles
                          </span>
                        </span>
                        <button
                          type="button"
                          disabled={startingDemo}
                          onClick={onStartDemo}
                          className="min-h-[38px] inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-60 text-xs font-semibold text-slate-800 transition whitespace-nowrap"
                        >
                          {startingDemo ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Clock className="w-3.5 h-3.5 text-teal-700" />
                          )}
                          <span>
                            Probar Demo Guiada · {demoCapabilities.demoDurationMinutes} min
                          </span>
                        </button>
                      </>
                    ) : (
                      <p className="text-slate-500 tabular-nums">
                        Evaluación guiada completada ({demoCapabilities.demoMaxUses}/
                        {demoCapabilities.demoMaxUses} pases utilizados en este navegador). Ingresa
                        con el código oficial de tu colegio.
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Right Column: School Access Card */}
            <div className="lg:col-span-5 space-y-4">
              {vaultBanner && (
                <div className="rounded-2xl border border-teal-200 bg-teal-50/90 p-4 flex flex-col gap-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-0.5">
                      <p className="text-xs font-bold text-teal-900 flex items-center gap-1.5">
                        <BellRing className="w-3.5 h-3.5 text-teal-700" />
                        <span>
                          {vaultBanner.hasUnreadReply
                            ? 'Tienes una nueva respuesta de acompañamiento'
                            : 'Conversación activa en esta pestaña'}
                        </span>
                      </p>
                      <p className="text-[11px] text-teal-800 font-mono tabular-nums">
                        Clave {vaultBanner.ticketCode} · Guardada temporalmente hasta que salgas
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        writeSilentVault(null);
                        setVaultBanner(null);
                      }}
                      className="text-[11px] font-medium text-teal-700 hover:underline shrink-0"
                    >
                      Ocultar
                    </button>
                  </div>
                  <button
                    type="button"
                    disabled={resumingVault}
                    onClick={() => void handleResumeVaultChat()}
                    className="min-h-[42px] w-full rounded-xl bg-teal-700 hover:bg-teal-800 text-white text-xs font-semibold transition flex items-center justify-center gap-2"
                  >
                    {resumingVault ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <span>Volver al chat ahora</span>
                    )}
                  </button>
                </div>
              )}

              <div className="bg-white rounded-3xl border border-slate-200 p-6 sm:p-8 shadow-sm space-y-4">
                <div>
                  <h2 className="text-lg font-bold text-slate-900">Entrar al buzón seguro</h2>
                  <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                    No pedimos tu nombre, correo ni número telefónico.
                  </p>
                </div>

                {/* Modo "Este celular no es mío" Toggle */}
                <div
                  className={`p-3 rounded-2xl border transition ${
                    isSharedDevice
                      ? 'bg-amber-50/90 border-amber-300 ring-1 ring-amber-300'
                      : 'bg-slate-50/80 border-slate-200'
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      <div
                        className={`p-2 rounded-xl shrink-0 ${
                          isSharedDevice
                            ? 'bg-amber-200 text-amber-900'
                            : 'bg-white text-slate-600 border border-slate-200'
                        }`}
                      >
                        <Smartphone className="w-4 h-4" />
                      </div>
                      <div>
                        <p className="text-xs font-bold text-slate-800">
                          {isSharedDevice ? 'Modo Celular Prestado: ACTIVO' : '¿Este celular no es tuyo?'}
                        </p>
                        <p className="text-[11px] text-slate-500 leading-tight mt-0.5">
                          {isSharedDevice
                            ? 'No se guardará sesión ni notificaciones al salir.'
                            : 'Actívalo si es de un amigo, familiar o compartido.'}
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={handleToggleSharedDevice}
                      className={`min-h-[36px] px-3 py-1 rounded-xl text-xs font-bold transition whitespace-nowrap shrink-0 ${
                        isSharedDevice
                          ? 'bg-amber-600 hover:bg-amber-700 text-white'
                          : 'bg-white hover:bg-slate-100 text-slate-700 border border-slate-300'
                      }`}
                    >
                      {isSharedDevice ? 'Activado ✓' : 'Activar modo'}
                    </button>
                  </div>
                </div>

                {errorMsg && (
                  <div className="mt-4 p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800">
                    {errorMsg}
                  </div>
                )}

                <form onSubmit={handleVerifySchool} className="mt-5 space-y-4">
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label
                        htmlFor="school-code-input"
                        className="text-xs font-semibold text-slate-700"
                      >
                        Código de tu colegio
                      </label>
                      {demoActive && (
                        <button
                          type="button"
                          onClick={() => setSchoolCode('SANJOSE2026')}
                          className="text-[11px] font-medium text-teal-700 hover:underline"
                        >
                          Usar demo: SANJOSE2026
                        </button>
                      )}
                    </div>
                    <input
                      ref={schoolCodeInputRef}
                      id="school-code-input"
                      type="text"
                      value={schoolCode}
                      onChange={(e) => setSchoolCode(e.target.value)}
                      placeholder="Ej: CODIGO2026"
                      className="w-full min-h-[48px] bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-sm font-mono uppercase tracking-wider text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-600 focus:bg-white transition"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    style={{ backgroundColor: activeAccent }}
                    className="w-full min-h-[48px] hover:opacity-95 disabled:opacity-60 text-white font-semibold py-3.5 px-5 rounded-2xl text-sm transition flex items-center justify-center gap-2"
                  >
                    {loading ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <span>Necesito hablar / Reportar</span>
                    )}
                  </button>
                </form>

                <div className="mt-3">
                  <button
                    type="button"
                    onClick={() => {
                      setErrorMsg(null);
                      setScreen('login_existing');
                    }}
                    className="w-full min-h-[48px] bg-white hover:bg-slate-50 text-teal-800 border border-teal-200 font-semibold py-3 px-5 rounded-2xl text-sm transition"
                  >
                    Ya tengo un código de caso
                  </button>
                </div>

                {verifiedSchool?.inspira_enabled !== false && (
                  <div className="mt-4 pt-4 border-t border-slate-100 flex items-center justify-between gap-3">
                    <div className="text-left">
                      <p className="text-xs font-bold text-slate-900">¿Necesitas videos de apoyo o calma?</p>
                      <p className="text-[11px] text-slate-500">
                        Videos motivadores, respiración 4-4-6 y guías de autoestima.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setInspiraTopic('todos');
                        setScreen('inspira');
                      }}
                      className="min-h-[40px] inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-teal-50 hover:bg-teal-100 border border-teal-200 text-xs font-semibold text-teal-800 transition shrink-0"
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>Espacio Inspira</span>
                    </button>
                  </div>
                )}

                <div className="mt-4 pt-4 border-t border-slate-100 text-center">
                  <button
                    type="button"
                    onClick={() => setSosOpen(true)}
                    className="inline-flex items-center justify-center gap-1.5 text-xs font-semibold text-rose-700 hover:text-rose-800 min-h-[44px]"
                  >
                    <PhoneCall className="w-3.5 h-3.5" />
                    <span>Líneas de ayuda inmediata (Línea 100 / Emergencias)</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* SCREEN INSPIRA: Curated Wellness, Self-Esteem & 4-4-6 Offline Calm Space */}
        {screen === 'inspira' && (
          <EspacioInspira
            schoolId={verifiedSchool?.id}
            schoolName={verifiedSchool?.short_name}
            schoolAccent={activeAccent}
            schoolResources={verifiedSchool?.inspira_resources}
            initialTopic={inspiraTopic}
            activeVault={vaultBanner}
            onResumeVault={() => void handleResumeVaultChat()}
            onOpenSupport={() => {
              setErrorMsg(null);
              setScreen(verifiedSchool ? 'category' : 'welcome');
            }}
          />
        )}

        {/* SCREEN EXTRA: Recover Existing Case */}
        {screen === 'login_existing' && (
          <div className="max-w-md w-full mx-auto bg-white rounded-3xl border border-slate-200 p-6 sm:p-8 shadow-sm">
            <button
              type="button"
              onClick={() => {
                setScreen('welcome');
                setErrorMsg(null);
              }}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-900 mb-5 min-h-[44px]"
            >
              <ArrowLeft className="w-4 h-4" />
              Volver
            </button>

            <h1 className="text-2xl font-bold text-slate-900">Retomar conversación</h1>
            <p className="text-sm text-slate-600 mt-1.5 leading-relaxed">
              Ingresa tu código único y el PIN de 4 números que creaste para leer las respuestas de psicología.
            </p>

            {errorMsg && (
              <div className="mt-4 p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800">
                {errorMsg}
              </div>
            )}

            <form onSubmit={handleRecoverTicket} className="mt-5 space-y-4">
              <div>
                <label
                  htmlFor="recover-code"
                  className="block text-xs font-semibold text-slate-700 mb-1.5"
                >
                  Código de caso
                </label>
                <input
                  id="recover-code"
                  type="text"
                  required
                  value={existingTicketCode}
                  onChange={(e) => setExistingTicketCode(e.target.value)}
                  placeholder="#ESC-4920"
                  className="w-full min-h-[48px] bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-sm font-mono uppercase text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-600"
                />
              </div>

              <div>
                <label
                  htmlFor="recover-pin"
                  className="block text-xs font-semibold text-slate-700 mb-1.5"
                >
                  Tu PIN de 4 dígitos
                </label>
                <input
                  id="recover-pin"
                  type="password"
                  inputMode="numeric"
                  required
                  maxLength={4}
                  value={existingPin}
                  onChange={(e) => setExistingPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                  placeholder="••••"
                  className="w-full min-h-[48px] bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-base font-mono tracking-[0.5em] text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-600"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full min-h-[48px] bg-teal-700 hover:bg-teal-800 disabled:opacity-60 text-white font-semibold py-3.5 rounded-2xl text-sm transition flex items-center justify-center gap-2"
              >
                {loading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <span>Abrir mi chat seguro</span>
                )}
              </button>

              {demoActive && (
                <p className="text-[11px] text-slate-400 text-center pt-1">
                  Ejemplo de prueba disponible: <span className="font-mono">#ESC-4920</span> · PIN{' '}
                  <span className="font-mono">4920</span>
                </p>
              )}
            </form>
          </div>
        )}

        {/* SCREEN 2: Emotional Triage Category Selection */}
        {screen === 'category' && verifiedSchool && (
          <div className="max-w-2xl w-full mx-auto space-y-6">
            <div className="flex items-center justify-between gap-4">
              <button
                type="button"
                onClick={() => {
                  setScreen('welcome');
                  setErrorMsg(null);
                }}
                className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-900 min-h-[44px]"
              >
                <ArrowLeft className="w-4 h-4" />
                Volver
              </button>
              <div className="text-right">
                <span
                  className="inline-flex items-center gap-1.5 text-xs font-bold"
                  style={{ color: verifiedSchool.accent_color || '#0F766E' }}
                >
                  <span
                    className="w-2 h-2 rounded-full"
                    style={{ backgroundColor: verifiedSchool.accent_color || '#0F766E' }}
                  />
                  {verifiedSchool.name}
                </span>
                <p className="text-[11px] text-slate-500">{verifiedSchool.region}</p>
              </div>
            </div>

            {/* Paso 1: Entrada por intención (Say Something / Sin encasillar) */}
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
                  ¿Cómo te gustaría empezar?
                </h1>
                <button
                  type="button"
                  onClick={() => setSosOpen(true)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-50 text-rose-700 border border-rose-200 text-xs font-semibold hover:bg-rose-100 transition shrink-0"
                >
                  <PhoneCall className="w-3.5 h-3.5" />
                  <span>Necesito ayuda ahora (SOS)</span>
                </button>
              </div>
              <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
                No tienes que decidir si lo que vives “cuenta como acoso” o tiene un nombre difícil. Elige cómo te sientes más cómodo para hablar:
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                {/* 1. Me está pasando a mí */}
                <button
                  type="button"
                  onClick={() => setSelectedIntent('for_me')}
                  className={`p-4 rounded-2xl border text-left transition flex flex-col justify-between gap-3 min-h-[110px] ${
                    selectedIntent === 'for_me'
                      ? 'bg-teal-50 border-teal-600 ring-2 ring-teal-600/30'
                      : 'bg-white border-slate-200 hover:border-teal-300 hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="p-2 rounded-xl bg-teal-100 text-teal-800">
                      <Smile className="w-5 h-5" />
                    </span>
                    {selectedIntent === 'for_me' && (
                      <span className="text-[11px] font-bold text-teal-700 bg-teal-100 px-2 py-0.5 rounded-full">
                        Elegido
                      </span>
                    )}
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">Me está pasando a mí</h3>
                    <p className="text-xs text-slate-500 mt-0.5 leading-snug">
                      Siento que me molestan, me excluyen o necesito apoyo.
                    </p>
                  </div>
                </button>

                {/* 2. Me preocupa alguien */}
                <button
                  type="button"
                  onClick={() => setSelectedIntent('for_other')}
                  className={`p-4 rounded-2xl border text-left transition flex flex-col justify-between gap-3 min-h-[110px] ${
                    selectedIntent === 'for_other'
                      ? 'bg-teal-50 border-teal-600 ring-2 ring-teal-600/30'
                      : 'bg-white border-slate-200 hover:border-teal-300 hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="p-2 rounded-xl bg-sky-100 text-sky-800">
                      <Users className="w-5 h-5" />
                    </span>
                    {selectedIntent === 'for_other' && (
                      <span className="text-[11px] font-bold text-teal-700 bg-teal-100 px-2 py-0.5 rounded-full">
                        Elegido
                      </span>
                    )}
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">Me preocupa alguien</h3>
                    <p className="text-xs text-slate-500 mt-0.5 leading-snug">
                      Vi una situación injusta o un compañero que necesita ayuda.
                    </p>
                  </div>
                </button>

                {/* 3. No sé cómo empezar (Paso directo) */}
                <button
                  type="button"
                  onClick={() => handleSelectIntent('unsure')}
                  className="p-4 rounded-2xl border text-left transition flex flex-col justify-between gap-3 min-h-[110px] bg-gradient-to-br from-amber-50 to-white border-amber-200 hover:border-amber-400 hover:shadow-xs group"
                >
                  <div className="flex items-center justify-between">
                    <span className="p-2 rounded-xl bg-amber-100 text-amber-800">
                      <MessageCircleHeart className="w-5 h-5" />
                    </span>
                    <span className="text-[10px] font-bold text-amber-800 bg-amber-100 px-2 py-0.5 rounded-full">
                      Paso directo
                    </span>
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-900 group-hover:text-amber-900 transition">
                      No sé cómo empezar
                    </h3>
                    <p className="text-xs text-slate-600 mt-0.5 leading-snug">
                      Solo quiero hablar con alguien sin encasillar lo que siento.
                    </p>
                  </div>
                </button>
              </div>
            </div>

            <div className="pt-2 space-y-2">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-bold text-slate-700">
                  {selectedIntent === 'for_other'
                    ? '¿Sobre qué tema es la situación de tu compañero?'
                    : '¿Quieres elegir un tema o prefieres escribir directamente?'}
                </h2>
                <p className="text-xs text-slate-500 flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <span>Horario: {verifiedSchool.support_hours}</span>
                </p>
              </div>
            </div>

            {/* Dynamic Space + Optional Non-Identifying Context for Preventive Radar */}
            <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-4">
              <div>
                <label className="text-xs font-semibold text-slate-700 flex items-center gap-1.5 mb-2.5">
                  <MapPin className="w-3.5 h-3.5 text-teal-700" />
                  ¿Dónde ocurrió principalmente? (ayuda a cuidar ese espacio)
                </label>
                <div className="flex flex-wrap gap-2">
                  {(verifiedSchool.spaces.length > 0
                    ? verifiedSchool.spaces
                    : DEFAULT_SPACE_OPTIONS
                  ).map((space) => (
                    <button
                      key={space}
                      type="button"
                      onClick={() => setSelectedSpace(space)}
                      style={
                        selectedSpace === space
                          ? { backgroundColor: activeAccent, borderColor: activeAccent }
                          : undefined
                      }
                      className={`min-h-[38px] px-3 py-1.5 rounded-xl text-xs font-medium border transition ${
                        selectedSpace === space
                          ? 'text-white'
                          : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      {space}
                    </button>
                  ))}
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <span className="block text-[11px] font-semibold text-slate-500 mb-1.5">
                    Momento aproximado (opcional · Zero-PII)
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {TIME_SLOT_OPTIONS.map((slot) => (
                      <button
                        key={slot}
                        type="button"
                        onClick={() =>
                          setSelectedTimeSlot((prev) => (prev === slot ? '' : slot))
                        }
                        className={`min-h-[34px] px-2.5 py-1 rounded-lg text-[11px] font-medium border transition ${
                          selectedTimeSlot === slot
                            ? 'bg-slate-900 text-white border-slate-900'
                            : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        {slot}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <span className="block text-[11px] font-semibold text-slate-500 mb-1.5">
                    Ciclo / Nivel (opcional · sin sección)
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {GRADE_BAND_OPTIONS.map((band) => (
                      <button
                        key={band}
                        type="button"
                        onClick={() =>
                          setSelectedGradeBand((prev) => (prev === band ? '' : band))
                        }
                        className={`min-h-[34px] px-2.5 py-1 rounded-lg text-[11px] font-medium border transition ${
                          selectedGradeBand === band
                            ? 'bg-slate-900 text-white border-slate-900'
                            : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        {band}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Dynamic Empathetic Triage Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              {verifiedSchool.categories.map((cat: CategoryConfig) => {
                const tone = TONE_CLASSES[cat.tone] || TONE_CLASSES.teal;
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => handleSelectCategory(cat.title)}
                    className={`text-left bg-white border border-slate-200 p-5 rounded-2xl transition flex items-start gap-4 min-h-[104px] ${tone.card}`}
                  >
                    <div
                      className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${tone.iconBox}`}
                    >
                      {renderCategoryIcon(cat.icon)}
                    </div>
                    <div>
                      <h2 className="text-base font-bold text-slate-900">{cat.title}</h2>
                      <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                        {cat.description}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Atajo: Escribir directamente sin encasillar en ninguna categoría */}
            <div className="pt-2 text-center">
              <button
                type="button"
                onClick={() => {
                  const fallbackTitle =
                    verifiedSchool.categories.find(
                      (c) =>
                        c.active &&
                        (c.id === 'general' ||
                          c.title.toLowerCase().includes('otro') ||
                          c.title.toLowerCase().includes('apoyo'))
                    )?.title ||
                    verifiedSchool.categories[0]?.title ||
                    'Necesito hablar (Sin clasificar)';
                  setSelectedCategory(fallbackTitle);
                  setSelectedIntent(selectedIntent || 'for_me');
                  setCreatedTicket(null);
                  setPin(['', '', '', '']);
                  setEmergencyContact('');
                  setShowBreakGlassOption(false);
                  setPushStatus('idle');
                  setPushNotice(null);
                  setErrorMsg(null);
                  setScreen('ticket');
                }}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-800 underline underline-offset-4 min-h-[38px]"
              >
                <span>Prefiero empezar a escribir directamente sin elegir una categoría específica</span>
              </button>
            </div>
          </div>
        )}

        {/* SCREEN 3: Anonymous Key Creation (PIN -> Unique Ticket Code) */}
        {screen === 'ticket' && (
          <div className="max-w-md w-full mx-auto bg-white rounded-3xl border border-slate-200 p-6 sm:p-8 shadow-sm">
            {!createdTicket ? (
              <>
                <button
                  type="button"
                  onClick={() => {
                    setScreen('category');
                    setErrorMsg(null);
                  }}
                  className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-900 mb-4 min-h-[44px]"
                >
                  <ArrowLeft className="w-4 h-4" />
                  Cambiar motivo
                </button>

                <h1 className="text-2xl font-bold text-slate-900">
                  Protege tu espacio privado
                </h1>
                <p className="text-sm text-slate-600 mt-1.5 leading-relaxed">
                  Crea un PIN secreto de 4 números. Con este PIN y el código único que te daremos podrás volver a leer las respuestas sin usar correo.
                </p>

                {selectedIntent === 'unsure' && (
                  <div className="mt-3 p-3.5 rounded-2xl bg-amber-50 border border-amber-200 text-xs text-amber-950 flex items-start gap-2.5">
                    <MessageCircleHeart className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                    <div className="space-y-0.5">
                      <p className="font-bold text-amber-900">No te preocupes por clasificar tu situación</p>
                      <p className="text-amber-800 leading-relaxed">
                        El equipo de orientación leerá lo que tú decidas contar en el chat con tus propias palabras, sin etiquetas.
                      </p>
                    </div>
                  </div>
                )}

                {errorMsg && (
                  <div className="mt-4 p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800">
                    {errorMsg}
                  </div>
                )}

                <form onSubmit={handleCreateTicket} className="mt-5 space-y-5">
                  <div>
                    <p className="text-xs font-semibold text-slate-700 text-center mb-3">
                      Elige 4 números fáciles de recordar para ti
                    </p>
                    <div className="flex items-center justify-center gap-3">
                      {pin.map((digit, index) => (
                        <input
                          key={index}
                          id={`pin-${index}`}
                          type="password"
                          inputMode="numeric"
                          maxLength={1}
                          value={digit}
                          onChange={(e) => handlePinChange(index, e.target.value)}
                          onKeyDown={(e) => handlePinKeyDown(index, e)}
                          aria-label={`Dígito ${index + 1} del PIN`}
                          className="w-13 h-14 text-center text-xl font-mono font-bold bg-slate-50 border-2 border-slate-200 rounded-xl focus:border-teal-700 focus:bg-white focus:outline-none transition"
                        />
                      ))}
                    </div>
                  </div>

                  {/* Pace Selection */}
                  <div className="space-y-2">
                    <span className="block text-xs font-semibold text-slate-700">
                      ¿Cómo te sentirías más cómodo ahora?
                    </span>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setPaceMode('listen_only')}
                        className={`min-h-[44px] p-2.5 rounded-xl border text-left text-xs transition ${
                          paceMode === 'listen_only'
                            ? 'bg-slate-900 text-white border-slate-900'
                            : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        <strong className="block">Solo quiero ser escuchado</strong>
                        <span className="text-[11px] opacity-80">
                          Sin intervenciones aún
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setPaceMode('discreet_help')}
                        className={`min-h-[44px] p-2.5 rounded-xl border text-left text-xs transition ${
                          paceMode === 'discreet_help'
                            ? 'bg-teal-700 text-white border-teal-700'
                            : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        <strong className="block">Acepto apoyo discreto</strong>
                        <span className="text-[11px] opacity-80">
                          Cuidar el espacio sin exponerme
                        </span>
                      </button>
                    </div>
                  </div>

                  {/* Optional Encrypted Break-Glass Vault */}
                  <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 space-y-2">
                    <button
                      type="button"
                      onClick={() => setShowBreakGlassOption((v) => !v)}
                      className="w-full flex items-center justify-between gap-2 text-left text-xs font-semibold text-slate-700"
                    >
                      <span className="flex items-center gap-1.5">
                        <Lock className="w-3.5 h-3.5 text-teal-700 shrink-0" />
                        <span>Resguardo de emergencia (100% opcional)</span>
                      </span>
                      <span className="text-teal-700 underline text-[11px]">
                        {showBreakGlassOption ? 'Ocultar' : 'Agregar'}
                      </span>
                    </button>
                    {showBreakGlassOption && (
                      <div className="space-y-1.5 pt-1">
                        <p className="text-[11px] text-slate-500 leading-relaxed">
                          Se cifra con AES-256. Psicología <strong>jamás podrá verlo</strong> salvo que detecte riesgo físico crítico y necesite ubicarte de urgencia.
                        </p>
                        <input
                          type="text"
                          maxLength={140}
                          value={emergencyContact}
                          onChange={(e) => setEmergencyContact(e.target.value)}
                          placeholder="Opcional: ej. Iniciales o teléfono de familiar de confianza"
                          className="w-full min-h-[42px] bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-600"
                        />
                      </div>
                    )}
                  </div>

                  <div className="p-3.5 rounded-xl bg-sky-50/70 border border-sky-200 text-xs text-slate-700 leading-relaxed">
                    <strong>Privacidad real:</strong> tu PIN se encripta de inmediato. Nadie del colegio sabrá tu nombre ni tu dispositivo.
                  </div>

                  <button
                    type="submit"
                    disabled={loading || pin.join('').length < 4}
                    style={{ backgroundColor: activeAccent }}
                    className="w-full min-h-[48px] hover:opacity-95 disabled:opacity-50 text-white font-semibold py-3.5 rounded-2xl text-sm transition flex items-center justify-center gap-2"
                  >
                    {loading ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <span>Generar mi código único</span>
                    )}
                  </button>
                </form>
              </>
            ) : (
              <div className="text-center space-y-5">
                <div>
                  <h1 className="text-2xl font-bold text-slate-900">
                    Tu espacio privado está listo
                  </h1>
                  <p className="text-sm text-slate-600 mt-1.5">
                    Guarda este código para volver a entrar y leer las respuestas de tu tutor o psicólogo:
                  </p>
                </div>

                <div className="p-6 rounded-2xl bg-sky-50 border border-sky-200 space-y-3">
                  <span className="text-xs font-semibold text-teal-800 block">
                    Tu código único de seguimiento
                  </span>
                  <div className="font-mono text-3xl font-extrabold tracking-widest text-slate-900 tabular-nums">
                    {createdTicket.ticket_code}
                  </div>
                  <div className="flex flex-wrap items-center justify-center gap-2">
                    <button
                      type="button"
                      onClick={handleCopyCode}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 text-xs font-semibold text-slate-700 transition min-h-[40px]"
                    >
                      {copied ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-700" />
                          <span>¡Copiado!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          <span>Copiar código</span>
                        </>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={handleDownloadNeutralCard}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 text-xs font-semibold text-slate-700 transition min-h-[40px]"
                    >
                      <Download className="w-3.5 h-3.5 text-teal-700" />
                      <span>Guardar tarjeta neutra</span>
                    </button>
                  </div>
                </div>

                {/* Optional Camouflaged Web Push Alert vs Modo Celular Prestado */}
                {isSharedDevice ? (
                  <div className="p-3.5 rounded-xl bg-slate-100 border border-slate-200 text-left space-y-1 text-xs text-slate-700">
                    <div className="flex items-center gap-1.5 font-bold text-slate-900">
                      <Smartphone className="w-4 h-4 text-slate-700" />
                      <span>Modo Celular Prestado activo</span>
                    </div>
                    <p className="text-[11px] text-slate-600 leading-relaxed">
                      Las notificaciones en este teléfono y la sesión guardada están <strong>desactivadas</strong> para tu seguridad.
                      Para volver a leer la respuesta, anota tu código <strong>{createdTicket.ticket_code}</strong> y tu PIN.
                    </p>
                  </div>
                ) : (
                  <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-left space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-slate-800 flex items-center gap-1.5">
                        <Bell className="w-3.5 h-3.5 text-teal-700 shrink-0" />
                        <span>¿Quieres un aviso silencioso cuando te respondan?</span>
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500 leading-relaxed">
                      Si alguien ve tu pantalla, la notificación solo dirá <strong>“Espacio Inspira · Nueva lectura disponible”</strong>.
                    </p>
                    <button
                      type="button"
                      disabled={pushStatus === 'subscribing' || pushStatus === 'enabled'}
                      onClick={() => void handleEnableCamouflagedPush()}
                      className={`min-h-[38px] w-full rounded-xl border px-3 py-1.5 text-xs font-semibold transition ${
                        pushStatus === 'enabled'
                          ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                          : 'bg-white border-slate-200 hover:bg-slate-100 text-slate-800'
                      }`}
                    >
                      {pushStatus === 'subscribing'
                        ? 'Activando...'
                        : pushStatus === 'enabled'
                          ? 'Aviso camuflado activado'
                          : 'Activar aviso camuflado (opcional)'}
                    </button>
                    {pushNotice && (
                      <p className="text-[11px] text-teal-800 leading-relaxed">{pushNotice}</p>
                    )}
                  </div>
                )}

                <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900 text-left leading-relaxed">
                  <strong>Importante:</strong> Anota tu código junto a tu PIN. La tarjeta descargable oculta cualquier referencia escolar para tu seguridad.
                </div>

                <button
                  type="button"
                  onClick={() => setScreen('chat')}
                  style={{ backgroundColor: activeAccent }}
                  className="w-full min-h-[48px] hover:opacity-95 text-white font-semibold py-3.5 rounded-2xl text-sm transition"
                >
                  Entrar a mi chat seguro
                </button>
              </div>
            )}
          </div>
        )}
      </main>

      {/* Modal Informativo de Privacidad y Salida Rápida (Guía Childline) */}
      {privacyNoticeOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <ShieldAlert className="w-5 h-5 text-teal-700" />
                <h3 className="text-base font-bold text-slate-900">
                  Privacidad y Salida Rápida
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setPrivacyNoticeOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
                aria-label="Cerrar modal"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs text-slate-600 leading-relaxed">
              <p className="font-semibold text-slate-800">
                En Te Escucho cuidamos tu seguridad. Te explicamos con total claridad cómo funciona la protección:
              </p>
              <div className="p-3 bg-teal-50 rounded-xl border border-teal-100 space-y-1">
                <p className="font-bold text-teal-900">1. Lo que sí hace la Salida Rápida:</p>
                <p className="text-teal-800">
                  Cierra de inmediato tu conversación, limpia la memoria de la pantalla y te redirige a Google para que nadie a tu lado vea lo que escribías.
                </p>
              </div>
              <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 space-y-1">
                <p className="font-bold text-amber-900">2. Lo que no puede borrar técnicamente (Guía Childline):</p>
                <p className="text-amber-800">
                  Por diseño de los sistemas Android e iOS, ningún sitio web puede borrar el historial del navegador de tu teléfono.
                </p>
              </div>
              <div className="p-3 bg-slate-100 rounded-xl space-y-1">
                <p className="font-bold text-slate-800">💡 Si este celular no te pertenece:</p>
                <ul className="list-disc list-inside space-y-0.5 text-slate-600">
                  <li>Activa el <strong>«Modo Celular Prestado»</strong> (no guarda sesión).</li>
                  <li>Usa una <strong>Pestaña de Incógnito</strong> para no dejar rastro en el historial.</li>
                  <li>O borra el historial de este navegador al terminar.</li>
                </ul>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setPrivacyNoticeOpen(false)}
              className="w-full min-h-[44px] rounded-xl bg-teal-700 hover:bg-teal-800 text-white font-semibold text-xs transition"
            >
              Entendido, cuidar mi privacidad
            </button>
          </div>
        </div>
      )}

      <EmergencyHelpModal
        open={sosOpen}
        onClose={() => setSosOpen(false)}
        lines={verifiedSchool?.emergency_lines}
        internalPhone={verifiedSchool?.internal_help_phone}
        schoolName={verifiedSchool?.short_name}
      />
    </div>
  );
};
