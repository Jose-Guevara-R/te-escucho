import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowUpRight,
  BellOff,
  BellRing,
  CheckCircle2,
  Clock,
  Compass,
  FileText,
  HeartHandshake,
  KeyRound,
  Loader2,
  Lock,
  LogOut,
  MapPin,
  MessageSquareHeart,
  Search,
  Send,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  UserCheck,
  Volume2,
  VolumeX,
  Wand2,
} from 'lucide-react';
import type {
  ChatMessage,
  CounselorAvailability,
  CounselorProfile,
  EmpathyTone,
  PublicSchoolConfig,
  SlaStatus,
  StaffAlertThreshold,
  StaffPushHealth,
  TicketInternalNote,
  TicketOutcome,
  TicketStatus,
  TicketSummary,
} from '../types';
import { PWAInstallButton } from './PWAInstallButton';
import { QrPosterGenerator } from './QrPosterGenerator';
import { SchoolAnalytics } from './SchoolAnalytics';
import { SchoolSettingsPanel } from './SchoolSettingsPanel';
import { TeEscuchoLogo } from './TeEscuchoLogo';
import { ThemeToggle } from './ThemeToggle';

interface CounselorPanelProps {
  token: string;
  counselor: CounselorProfile;
  initialTab?: CounselorTab;
  initialTicketId?: string | null;
  onConsumedInitialTicketId?: () => void;
  onLogout: () => void;
  onSwitchToStudent: () => void;
}

type CounselorTab = 'chats' | 'analytics' | 'qr' | 'school_settings';
type FilterMode = 'all' | 'critico' | 'en_curso' | 'resuelto';

const OUTCOME_LABELS: Record<TicketOutcome, string> = {
  acompanamiento_exitoso: 'Acompañamiento exitoso',
  resuelto_tutoria: 'Resuelto con tutoría / mediación',
  derivacion_externa: 'Derivación a red externa',
  falsa_alerta: 'Falsa alerta / Prueba',
  otro: 'Otro cierre documentado',
};

const EMPATHY_TONE_OPTIONS: { id: EmpathyTone; label: string }[] = [
  { id: 'contencion_inicial', label: 'Contención inicial' },
  { id: 'validacion_ciberacoso', label: 'Validar ciberacoso' },
  { id: 'riesgo_inmediato', label: 'Riesgo inmediato' },
  { id: 'mensaje_puente', label: 'Mensaje puente' },
];

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

function getDeviceLabel(): string {
  if (typeof navigator === 'undefined') return 'Dispositivo';
  const ua = navigator.userAgent;
  const os = /Android/i.test(ua)
    ? 'Android'
    : /iPhone|iPad|iPod/i.test(ua)
      ? 'iOS'
      : /Windows/i.test(ua)
        ? 'Windows'
        : /Mac OS X/i.test(ua)
          ? 'macOS'
          : 'Linux';
  const browser = /Edg/i.test(ua)
    ? 'Edge'
    : /Chrome|CriOS/i.test(ua)
      ? 'Chrome'
      : /Firefox/i.test(ua)
        ? 'Firefox'
        : /Safari/i.test(ua)
          ? 'Safari'
          : 'Web';
  return `${os} · ${browser}`;
}

function playClinicalChime(): void {
  if (typeof window === 'undefined') return;
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const now = ctx.currentTime;

    const playTone = (freq: number, startOffset: number, duration: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + startOffset);
      gain.gain.setValueAtTime(0.001, now + startOffset);
      gain.gain.exponentialRampToValueAtTime(0.11, now + startOffset + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + startOffset + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + startOffset);
      osc.stop(now + startOffset + duration + 0.02);
    };

    playTone(587.33, 0, 0.24);
    playTone(783.99, 0.14, 0.34);

    window.setTimeout(() => {
      void ctx.close().catch(() => undefined);
    }, 900);
  } catch {
    // Browser autoplay guard before first user gesture; safe no-op
  }
}

function formatRelativeTime(isoDate: string): string {
  const diffMs = Date.now() - new Date(isoDate).getTime();
  const mins = Math.max(0, Math.floor(diffMs / 60_000));
  if (mins < 1) return 'Ahora';
  if (mins < 60) return `Hace ${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `Hace ${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days === 1) return 'Ayer';
  return `Hace ${days}d`;
}

function computeLiveSla(
  ticket: TicketSummary,
  nowMs: number
): { status: SlaStatus; elapsed: number; target: number | null; ratio: number } {
  const target = ticket.sla_target_minutes ?? null;
  if (ticket.status === 'resuelto' || ticket.first_counselor_reply_at || !target || target <= 0) {
    return {
      status: ticket.sla_status || 'ok',
      elapsed: ticket.sla_elapsed_minutes ?? 0,
      target,
      ratio: 0,
    };
  }
  const createdMs = new Date(ticket.created_at).getTime();
  const computedElapsed = Number.isFinite(createdMs)
    ? Math.max(ticket.sla_elapsed_minutes ?? 0, Math.floor((nowMs - createdMs) / 60_000))
    : ticket.sla_elapsed_minutes ?? 0;

  const ratio = Math.min(1, Math.max(0, computedElapsed / target));
  const status: SlaStatus =
    computedElapsed >= target ? 'breached' : ratio >= 0.7 ? 'warning' : 'ok';

  return { status, elapsed: computedElapsed, target, ratio };
}

const SlaCountdownRing: React.FC<{
  status: SlaStatus;
  elapsed: number;
  target: number | null;
  ratio: number;
}> = ({ status, elapsed, target, ratio }) => {
  if (!target || target <= 0) return null;
  const radius = 10;
  const circumference = 2 * Math.PI * radius;
  const remainingFraction = Math.max(0, 1 - ratio);
  const strokeDashoffset = circumference * (1 - remainingFraction);
  const strokeColor =
    status === 'breached' ? '#be123c' : status === 'warning' ? '#d97706' : '#0f766e';
  const remainingMinutes = Math.max(0, target - elapsed);

  return (
    <div
      className="inline-flex items-center gap-1.5 text-[11px] font-semibold tabular-nums"
      title={`SLA: ${elapsed} min transcurridos de ${target} min`}
    >
      <svg className="w-6 h-6 -rotate-90 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
        <circle
          cx="12"
          cy="12"
          r={radius}
          fill="none"
          stroke="#e2e8f0"
          strokeWidth="2.5"
        />
        <circle
          cx="12"
          cy="12"
          r={radius}
          fill="none"
          stroke={strokeColor}
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
        />
      </svg>
      <span
        className={
          status === 'breached'
            ? 'text-rose-700'
            : status === 'warning'
              ? 'text-amber-700'
              : 'text-teal-800'
        }
      >
        {status === 'breached' ? `+${elapsed - target}m` : `${remainingMinutes}m`}
      </span>
    </div>
  );
};

export const CounselorPanel: React.FC<CounselorPanelProps> = ({
  token,
  counselor,
  initialTab = 'chats',
  initialTicketId = null,
  onConsumedInitialTicketId,
  onLogout,
  onSwitchToStudent,
}) => {
  const [activeTab, setActiveTab] = useState<CounselorTab>(initialTab);

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab, counselor.id]);

  const [tickets, setTickets] = useState<TicketSummary[]>([]);
  const [loadingTickets, setLoadingTickets] = useState(true);
  const [activeTicketId, setActiveTicketId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  // Borradores aislados por ID de caso para prevenir contaminación cruzada (Fix A10)
  const [draftsByTicket, setDraftsByTicket] = useState<Record<string, string>>({});
  const replyText = activeTicketId ? draftsByTicket[activeTicketId] || '' : '';
  const setReplyText = (text: string) => {
    if (!activeTicketId) return;
    setDraftsByTicket((prev) => ({ ...prev, [activeTicketId]: text }));
  };
  const [sending, setSending] = useState(false);
  const [draftingEmpathy, setDraftingEmpathy] = useState(false);
  const [selectedTone, setSelectedTone] = useState<EmpathyTone>('contencion_inicial');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [filterMode, setFilterMode] = useState<FilterMode>('all');
  const [analyticsVersion, setAnalyticsVersion] = useState(0);
  const [availability, setAvailability] = useState<CounselorAvailability>(
    counselor.availability || 'available'
  );
  const [schoolConfig, setSchoolConfig] = useState<PublicSchoolConfig | null>(null);
  const empathyEnabled = schoolConfig?.empathy_assistant_enabled ?? true;
  const [assigning, setAssigning] = useState(false);
  const [escalating, setEscalating] = useState(false);
  const [actionNotice, setActionNotice] = useState<string | null>(null);

  // Propuestas A + C: Multi-device Staff Web Push, Tab Title Alerts & Offline Chime
  const [soundEnabled, setSoundEnabled] = useState<boolean>(() => {
    try {
      return window.localStorage.getItem('te_escucho_staff_sound') !== 'false';
    } catch {
      return true;
    }
  });
  const [unreadCriticalAlerts, setUnreadCriticalAlerts] = useState(0);
  const [pushSupported] = useState<boolean>(
    () =>
      typeof window !== 'undefined' &&
      'serviceWorker' in navigator &&
      'PushManager' in window &&
      'Notification' in window
  );
  const [pushSubscribed, setPushSubscribed] = useState(false);
  const [pushThreshold, setPushThreshold] = useState<StaffAlertThreshold>('criticos_y_sla');
  const [pushBusy, setPushBusy] = useState(false);
  const [pushNotice, setPushNotice] = useState<string | null>(null);
  const [pushHealth, setPushHealth] = useState<StaffPushHealth | null>(null);

  // Live SSE & SLA clock
  const [sseState, setSseState] = useState<'live' | 'reconnecting'>('reconnecting');
  const [nowMs, setNowMs] = useState(() => Date.now());

  // Staff-only internal clinical notes
  const [internalNotes, setInternalNotes] = useState<TicketInternalNote[]>([]);
  const [loadingNotes, setLoadingNotes] = useState(false);
  const [noteInput, setNoteInput] = useState('');
  const [savingNote, setSavingNote] = useState(false);

  // Break-Glass Emergency Vault state (kept strictly in component memory)
  const [breakGlassReason, setBreakGlassReason] = useState('');
  const [unlockingBreakGlass, setUnlockingBreakGlass] = useState(false);
  const [breakGlassContacts, setBreakGlassContacts] = useState<Record<string, string>>({});

  // Typed closure state
  const [showCloseBar, setShowCloseBar] = useState(false);
  const [closeOutcome, setCloseOutcome] = useState<TicketOutcome>('acompanamiento_exitoso');
  const [closeNote, setCloseNote] = useState('');
  const [closingCase, setClosingCase] = useState(false);

  const chatEndRef = useRef<HTMLDivElement | null>(null);
  const activeTicketIdRef = useRef<string | null>(activeTicketId);
  const soundEnabledRef = useRef<boolean>(soundEnabled);
  const pushSubscribedRef = useRef<boolean>(pushSubscribed);
  const pushEndpointRef = useRef<string | null>(null);
  const ticketsByIdRef = useRef<Map<string, TicketSummary>>(new Map());

  useEffect(() => {
    activeTicketIdRef.current = activeTicketId;
  }, [activeTicketId]);

  useEffect(() => {
    soundEnabledRef.current = soundEnabled;
  }, [soundEnabled]);

  useEffect(() => {
    pushSubscribedRef.current = pushSubscribed;
  }, [pushSubscribed]);

  useEffect(() => {
    const map = new Map<string, TicketSummary>();
    for (const t of tickets) {
      map.set(t.id, t);
    }
    ticketsByIdRef.current = map;
  }, [tickets]);

  // Consume deep-link case ID when arriving from a Web Push or Android shortcut
  useEffect(() => {
    if (!initialTicketId || tickets.length === 0) return;
    if (tickets.some((t) => t.id === initialTicketId)) {
      setActiveTicketId(initialTicketId);
      setActiveTab('chats');
      onConsumedInitialTicketId?.();
    }
  }, [initialTicketId, tickets, onConsumedInitialTicketId]);

  // Background browser tab awareness + visibility reset (Propuesta C)
  useEffect(() => {
    const defaultTitle = 'Te Escucho — Espacio Escolar Seguro y Anónimo';
    if (unreadCriticalAlerts > 0) {
      document.title = `(${unreadCriticalAlerts} CRÍTICO) Te Escucho`;
    } else {
      document.title = defaultTitle;
    }
    return () => {
      document.title = defaultTitle;
    };
  }, [unreadCriticalAlerts]);

  useEffect(() => {
    const clearUnread = () => {
      if (!document.hidden) {
        setUnreadCriticalAlerts(0);
      }
    };
    document.addEventListener('visibilitychange', clearUnread);
    window.addEventListener('focus', clearUnread);
    return () => {
      document.removeEventListener('visibilitychange', clearUnread);
      window.removeEventListener('focus', clearUnread);
    };
  }, []);

  // Sync current device Push subscription & school alert health (Propuestas A + E)
  useEffect(() => {
    let mounted = true;
    const syncPushStatus = async () => {
      let endpoint: string | null = null;
      if (pushSupported) {
        try {
          const reg = await navigator.serviceWorker.getRegistration();
          const existingSub = await reg?.pushManager?.getSubscription();
          if (existingSub) {
            endpoint = existingSub.endpoint;
            pushEndpointRef.current = endpoint;
            if (mounted) setPushSubscribed(true);
          }
        } catch {
          // Ignore SW readiness race
        }
      }
      try {
        const query = endpoint ? `?endpoint=${encodeURIComponent(endpoint)}` : '';
        const res = await fetch(`/api/counselor/push-status${query}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return;
        const data = (await res.json()) as { health?: StaffPushHealth };
        if (mounted && data.health) {
          setPushHealth(data.health);
          if (data.health.current_device_threshold) {
            setPushThreshold(data.health.current_device_threshold);
          }
        }
      } catch {
        // Non-blocking status sync
      }
    };
    void syncPushStatus();
    return () => {
      mounted = false;
    };
  }, [token, pushSupported]);

  const activeTicket = useMemo(
    () => tickets.find((t) => t.id === activeTicketId) || null,
    [tickets, activeTicketId]
  );

  // 60s SLA live tick
  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  const fetchTicketsCatchUp = useCallback(async () => {
    try {
      const res = await fetch('/api/counselor/tickets', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      const data = (await res.json()) as { tickets: TicketSummary[] };
      setTickets(data.tickets);
      const currentId = activeTicketIdRef.current;
      if (currentId) {
        const msgRes = await fetch(`/api/counselor/tickets/${currentId}/messages`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (msgRes.ok) {
          const msgData = (await msgRes.json()) as { messages: ChatMessage[] };
          setMessages(msgData.messages);
        }
      }
    } catch {
      // Transient catch-up error silently ignored; next reconnect retries
    }
  }, [token]);

  // Initial load of tickets & school config
  useEffect(() => {
    let mounted = true;
    const loadTickets = async () => {
      setLoadingTickets(true);
      try {
        const res = await fetch('/api/counselor/tickets', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error('No se pudo cargar la bandeja de casos.');
        const data = (await res.json()) as { tickets: TicketSummary[] };
        if (!mounted) return;
        setTickets(data.tickets);
        if (data.tickets.length > 0 && !activeTicketIdRef.current) {
          const preferred =
            initialTicketId && data.tickets.some((t) => t.id === initialTicketId)
              ? initialTicketId
              : data.tickets[0].id;
          setActiveTicketId(preferred);
        }
      } catch (err) {
        if (mounted) {
          setErrorMsg(err instanceof Error ? err.message : 'Error de red.');
        }
      } finally {
        if (mounted) setLoadingTickets(false);
      }
    };
    void loadTickets();

    fetch('/api/counselor/school-config', {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { school?: PublicSchoolConfig } | null) => {
        if (mounted && data?.school) {
          setSchoolConfig(data.school);
        }
      })
      .catch(() => undefined);

    return () => {
      mounted = false;
    };
  }, [token, initialTicketId]);

  // Load messages and staff-only internal notes whenever activeTicketId changes
  useEffect(() => {
    setShowCloseBar(false);
    setCloseNote('');
    setNoteInput('');
    setBreakGlassReason('');
    if (!activeTicketId) {
      setMessages([]);
      setInternalNotes([]);
      return;
    }
    let mounted = true;
    const loadCaseData = async () => {
      setLoadingMessages(true);
      setLoadingNotes(true);
      try {
        const [msgsRes, notesRes] = await Promise.all([
          fetch(`/api/counselor/tickets/${activeTicketId}/messages`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
          fetch(`/api/counselor/tickets/${activeTicketId}/notes`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
        ]);
        if (!msgsRes.ok) throw new Error('No se pudieron cargar los mensajes.');
        const msgsData = (await msgsRes.json()) as { messages: ChatMessage[] };
        const notesData = notesRes.ok
          ? ((await notesRes.json()) as { notes: TicketInternalNote[] })
          : { notes: [] };
        if (mounted) {
          setMessages(msgsData.messages);
          setInternalNotes(notesData.notes || []);
        }
      } catch (err) {
        if (mounted) {
          setErrorMsg(err instanceof Error ? err.message : 'Error al cargar chat.');
        }
      } finally {
        if (mounted) {
          setLoadingMessages(false);
          setLoadingNotes(false);
        }
      }
    };
    void loadCaseData();
    return () => {
      mounted = false;
    };
  }, [activeTicketId, token]);

  const triggerAttentionAlert = useCallback((ticket: TicketSummary, label: string) => {
    if (soundEnabledRef.current) {
      playClinicalChime();
    }
    if (typeof document !== 'undefined' && document.hidden) {
      setUnreadCriticalAlerts((prev) => prev + 1);
      if (
        'Notification' in window &&
        Notification.permission === 'granted' &&
        !pushSubscribedRef.current
      ) {
        try {
          const notif = new Notification(`Te Escucho · ${ticket.ticket_code}`, {
            body: `${label} · ${ticket.category} · ${ticket.space_tag}`,
            icon: '/pwa-192.png',
            tag: `staff-local-${ticket.id}`,
          });
          notif.onclick = () => {
            window.focus();
            setActiveTicketId(ticket.id);
            setActiveTab('chats');
            notif.close();
          };
        } catch {
          // Local Notification fallback unavailable inside strict webviews
        }
      }
    }
  }, []);

  // Resilient real-time SSE subscription for school-wide inbox & active thread
  useEffect(() => {
    const url = `/api/stream/school/${counselor.school_id}?token=${encodeURIComponent(token)}`;
    const es = new EventSource(url);
    let hasConnectedOnce = false;

    es.onopen = () => {
      setSseState('live');
      if (hasConnectedOnce) {
        void fetchTicketsCatchUp();
      }
      hasConnectedOnce = true;
    };

    es.onerror = () => {
      setSseState('reconnecting');
    };

    es.addEventListener('stream_revoked', () => {
      es.close();
      setSseState('reconnecting');
    });

    es.addEventListener('ticket_created', (event) => {
      try {
        const created = JSON.parse((event as MessageEvent).data) as TicketSummary;
        let isNew = false;
        setTickets((prev) => {
          if (prev.some((t) => t.id === created.id)) return prev;
          isNew = true;
          return [created, ...prev];
        });
        setAnalyticsVersion((v) => v + 1);
        if (isNew) {
          if (created.risk_level === 'critico') {
            triggerAttentionAlert(created, 'ALERTA CRÍTICA');
          } else if (created.risk_level === 'medio' && soundEnabledRef.current) {
            playClinicalChime();
          }
        }
      } catch {
        // Ignore malformed SSE payload
      }
    });

    es.addEventListener('ticket_updated', (event) => {
      try {
        const updated = JSON.parse((event as MessageEvent).data) as TicketSummary;
        const previous = ticketsByIdRef.current.get(updated.id);
        setTickets((prev) =>
          prev
            .map((t) => (t.id === updated.id ? updated : t))
            .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
        );
        setAnalyticsVersion((v) => v + 1);
        const becameCritical =
          updated.risk_level === 'critico' && previous?.risk_level !== 'critico';
        const becameEscalated =
          Boolean(updated.escalated_at) && !previous?.escalated_at;
        if (becameCritical || becameEscalated) {
          triggerAttentionAlert(
            updated,
            becameEscalated ? 'Caso escalado a Coordinación' : 'Riesgo elevado a CRÍTICO'
          );
        }
      } catch {
        // Ignore malformed SSE payload
      }
    });

    es.addEventListener('message_created', (event) => {
      try {
        const payload = JSON.parse((event as MessageEvent).data) as {
          ticketId: string;
          message: ChatMessage;
          ticket: TicketSummary;
        };
        setTickets((prev) =>
          prev
            .map((t) => (t.id === payload.ticket.id ? payload.ticket : t))
            .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
        );
        if (activeTicketIdRef.current === payload.ticketId) {
          setMessages((prev) => {
            if (prev.some((m) => m.id === payload.message.id)) return prev;
            return [...prev, payload.message];
          });
        }
        if (
          payload.message.sender_role === 'student' &&
          (payload.ticket.risk_level === 'critico' || Boolean(payload.ticket.escalated_at))
        ) {
          triggerAttentionAlert(payload.ticket, 'Respuesta de estudiante en caso prioritario');
        }
      } catch {
        // Ignore malformed SSE payload
      }
    });

    es.addEventListener('analytics_updated', () => {
      setAnalyticsVersion((v) => v + 1);
    });

    return () => {
      es.close();
    };
  }, [counselor.school_id, token, fetchTicketsCatchUp, triggerAttentionAlert]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSendReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!replyText.trim() || !activeTicket) return;
    setSending(true);
    setErrorMsg(null);
    try {
      const res = await fetch(`/api/counselor/tickets/${activeTicket.id}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ content: replyText.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo enviar la respuesta.');
      if (activeTicket) {
        setDraftsByTicket((prev) => {
          const next = { ...prev };
          delete next[activeTicket.id];
          return next;
        });
      }
      setMessages((prev) =>
        prev.some((m) => m.id === data.message.id) ? prev : [...prev, data.message]
      );
      setTickets((prev) => prev.map((t) => (t.id === data.ticket.id ? data.ticket : t)));
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Error al enviar.');
    } finally {
      setSending(false);
    }
  };

  const handleUpdateStatus = async (
    status: TicketStatus,
    outcomePayload?: { outcome: TicketOutcome; note: string }
  ) => {
    if (!activeTicket) return;
    setErrorMsg(null);
    setClosingCase(true);
    try {
      const bodyPayload: Record<string, unknown> = { status };
      if (status === 'resuelto' && outcomePayload) {
        bodyPayload.resolution_outcome = outcomePayload.outcome;
        bodyPayload.resolution_note = outcomePayload.note.trim() || null;
      }
      const res = await fetch(`/api/counselor/tickets/${activeTicket.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(bodyPayload),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'No se pudo actualizar el estado del caso.');
      }
      setTickets((prev) => prev.map((t) => (t.id === data.ticket.id ? data.ticket : t)));
      setAnalyticsVersion((v) => v + 1);
      setShowCloseBar(false);
      setCloseNote('');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Error al actualizar estado.');
    } finally {
      setClosingCase(false);
    }
  };

  const handleAddInternalNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeTicket || !noteInput.trim()) return;
    setSavingNote(true);
    setErrorMsg(null);
    try {
      const res = await fetch(`/api/counselor/tickets/${activeTicket.id}/notes`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ content: noteInput.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo guardar la nota interna.');
      setInternalNotes((prev) => [...prev, data.note as TicketInternalNote]);
      setNoteInput('');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Error guardando nota interna.');
    } finally {
      setSavingNote(false);
    }
  };

  const handleGenerateEmpathyDraft = async (toneOverride?: EmpathyTone) => {
    if (!activeTicket) return;
    const targetTicketId = activeTicket.id;
    const toneToUse = toneOverride ?? selectedTone;
    setSelectedTone(toneToUse);
    setDraftingEmpathy(true);
    setErrorMsg(null);
    try {
      const res = await fetch('/api/counselor/empathy-draft', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ ticketId: targetTicketId, tone: toneToUse }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo generar la sugerencia empática.');
      // Aislar la sugerencia al caso exacto para el que fue solicitada (Fix A10)
      if (typeof data.draft === 'string') {
        setDraftsByTicket((prev) => ({ ...prev, [targetTicketId]: data.draft }));
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Error con el asistente.');
    } finally {
      setDraftingEmpathy(false);
    }
  };

  const handleAssignTicket = async () => {
    if (!activeTicket) return;
    setAssigning(true);
    setErrorMsg(null);
    try {
      const res = await fetch(`/api/counselor/tickets/${activeTicket.id}/assign`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo asignar el caso.');
      setTickets((prev) => prev.map((t) => (t.id === data.ticket.id ? data.ticket : t)));
      setActionNotice(`Caso ${activeTicket.ticket_code} asignado a ${counselor.full_name}.`);
      setTimeout(() => setActionNotice(null), 3500);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Error asignando caso.');
    } finally {
      setAssigning(false);
    }
  };

  const handleEscalateTicket = async () => {
    if (!activeTicket) return;
    setEscalating(true);
    setErrorMsg(null);
    try {
      const res = await fetch(`/api/counselor/tickets/${activeTicket.id}/escalate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          reason: `Derivado a Coordinación de Convivencia por ${counselor.full_name}`,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo escalar el caso.');
      setTickets((prev) => prev.map((t) => (t.id === data.ticket.id ? data.ticket : t)));
      setActionNotice(
        `Caso ${activeTicket.ticket_code} escalado a Coordinación Escolar y registrado como prioritario.`
      );
      setTimeout(() => setActionNotice(null), 4500);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Error escalando caso.');
    } finally {
      setEscalating(false);
    }
  };

  const handleUnlockBreakGlass = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeTicket || breakGlassReason.trim().length < 8) return;
    setUnlockingBreakGlass(true);
    setErrorMsg(null);
    try {
      const res = await fetch(`/api/counselor/tickets/${activeTicket.id}/unlock-break-glass`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ reason: breakGlassReason.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'No se pudo desencriptar el contacto de emergencia.');
      }
      setBreakGlassContacts((prev) => ({
        ...prev,
        [activeTicket.id]: data.contact as string,
      }));
      if (data.ticket) {
        setTickets((prev) =>
          prev.map((t) => (t.id === data.ticket.id ? (data.ticket as TicketSummary) : t))
        );
      }
      setBreakGlassReason('');
      setActionNotice(
        `Contacto Break-Glass desbloqueado para ${activeTicket.ticket_code} con registro de auditoría.`
      );
      setTimeout(() => setActionNotice(null), 5000);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Error desbloqueando contacto.');
    } finally {
      setUnlockingBreakGlass(false);
    }
  };

  const handleAvailabilityChange = async (next: CounselorAvailability) => {
    setAvailability(next);
    try {
      const res = await fetch('/api/counselor/availability', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ availability: next }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo actualizar tu disponibilidad.');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Error actualizando disponibilidad.');
    }
  };

  const handleToggleSound = () => {
    const next = !soundEnabled;
    setSoundEnabled(next);
    try {
      window.localStorage.setItem('te_escucho_staff_sound', next ? 'true' : 'false');
    } catch {
      // Ignore storage failures
    }
    if (next) {
      playClinicalChime();
    }
  };

  const handleEnableOrUpdateStaffPush = async (nextThreshold: StaffAlertThreshold) => {
    if (!pushSupported) {
      setPushNotice('Este navegador no soporta alertas Push en segundo plano.');
      return;
    }
    setPushBusy(true);
    setPushNotice(null);
    setErrorMsg(null);
    try {
      if (Notification.permission === 'denied') {
        throw new Error(
          'Las notificaciones están bloqueadas en este navegador. Habilítalas en Ajustes del sitio para recibir alertas.'
        );
      }
      if (Notification.permission === 'default') {
        const perm = await Notification.requestPermission();
        if (perm !== 'granted') {
          setPushNotice('Permiso de notificaciones no concedido en este dispositivo.');
          return;
        }
      }

      const keyRes = await fetch('/api/push/vapid-public-key');
      if (!keyRes.ok) {
        throw new Error('No se pudo obtener la clave pública VAPID del servidor.');
      }
      const { publicKey } = (await keyRes.json()) as { publicKey: string };

      const reg = await navigator.serviceWorker.ready;
      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey),
        });
      }

      const res = await fetch('/api/counselor/push-subscribe', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          subscription: sub.toJSON(),
          threshold: nextThreshold,
          deviceLabel: getDeviceLabel(),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'No se pudieron activar las alertas en este dispositivo.');
      }
      pushEndpointRef.current = sub.endpoint;
      setPushSubscribed(true);
      setPushThreshold(nextThreshold);
      if (data.health) {
        setPushHealth(data.health as StaffPushHealth);
      }
      setPushNotice(`Alertas activadas en ${getDeviceLabel()} (sin texto del chat en pantalla bloqueada).`);
      window.setTimeout(() => setPushNotice(null), 5000);
    } catch (err) {
      setPushNotice(err instanceof Error ? err.message : 'Error activando alertas móviles.');
    } finally {
      setPushBusy(false);
    }
  };

  const handleDisableStaffPush = async () => {
    setPushBusy(true);
    setPushNotice(null);
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager?.getSubscription();
      const endpoint = sub?.endpoint || pushEndpointRef.current || undefined;
      if (sub) {
        await sub.unsubscribe().catch(() => undefined);
      }
      const res = await fetch('/api/counselor/push-subscribe', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ endpoint }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'No se pudo desactivar la suscripción Push.');
      }
      pushEndpointRef.current = null;
      setPushSubscribed(false);
      if (data.health) {
        setPushHealth(data.health as StaffPushHealth);
      }
      setPushNotice('Alertas Push desactivadas en este dispositivo.');
      window.setTimeout(() => setPushNotice(null), 4000);
    } catch (err) {
      setPushNotice(err instanceof Error ? err.message : 'Error desactivando alertas.');
    } finally {
      setPushBusy(false);
    }
  };

  const filteredTickets = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return tickets
      .filter((t) => {
        if (filterMode === 'critico') {
          return t.risk_level === 'critico' && t.status !== 'resuelto';
        }
        if (filterMode === 'en_curso') {
          return t.status !== 'resuelto';
        }
        if (filterMode === 'resuelto') {
          return t.status === 'resuelto';
        }
        return true;
      })
      .filter((t) => {
        if (!q) return true;
        return (
          t.ticket_code.toLowerCase().includes(q) ||
          t.category.toLowerCase().includes(q) ||
          t.space_tag.toLowerCase().includes(q) ||
          (t.grade_band || '').toLowerCase().includes(q)
        );
      });
  }, [tickets, filterMode, searchQuery]);

  const criticalCount = tickets.filter(
    (t) => t.risk_level === 'critico' && t.status !== 'resuelto'
  ).length;
  const activeCount = tickets.filter((t) => t.status !== 'resuelto').length;

  const activeSla = activeTicket ? computeLiveSla(activeTicket, nowMs) : null;
  const unlockedContact = activeTicket ? breakGlassContacts[activeTicket.id] : undefined;

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col text-slate-800">
      {/* 3-Zone Top Bar Contract */}
      <header className="print:hidden bg-white/90 dark:bg-slate-900/90 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 sticky top-0 z-30 shadow-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-8">
          <div className="flex items-center gap-2.5 shrink-0">
            <TeEscuchoLogo size={38} animated={false} className="shrink-0 drop-shadow-sm" />
            <div className="flex flex-col">
              <span className="text-lg font-black tracking-tight text-teal-950 dark:text-teal-200 leading-none whitespace-nowrap">
                Te Escucho
              </span>
              <span className="text-[10px] font-bold text-teal-700 dark:text-teal-400 tracking-wider uppercase mt-0.5">
                Panel de Tutoría (TOE) y Convivencia
              </span>
            </div>
          </div>

          <nav className="flex items-center gap-6 overflow-x-auto text-sm font-medium">
            <button
              type="button"
              onClick={() => setActiveTab('chats')}
              className={`py-1 border-b-2 transition whitespace-nowrap shrink-0 ${
                activeTab === 'chats'
                  ? 'border-teal-700 text-teal-900 font-semibold'
                  : 'border-transparent text-slate-500 hover:text-slate-900'
              }`}
            >
              Bandeja de casos
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('analytics')}
              className={`py-1 border-b-2 transition whitespace-nowrap shrink-0 ${
                activeTab === 'analytics'
                  ? 'border-teal-700 text-teal-900 font-semibold'
                  : 'border-transparent text-slate-500 hover:text-slate-900'
              }`}
            >
              Estadísticas
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('qr')}
              className={`py-1 border-b-2 transition whitespace-nowrap shrink-0 ${
                activeTab === 'qr'
                  ? 'border-teal-700 text-teal-900 font-semibold'
                  : 'border-transparent text-slate-500 hover:text-slate-900'
              }`}
            >
              Afiches QR
            </button>
            {counselor.role === 'admin' && (
              <button
                type="button"
                onClick={() => setActiveTab('school_settings')}
                className={`py-1 border-b-2 transition whitespace-nowrap shrink-0 ${
                  activeTab === 'school_settings'
                    ? 'border-teal-700 text-teal-900 font-semibold'
                    : 'border-transparent text-slate-500 hover:text-slate-900'
                }`}
              >
                Mi Colegio
              </button>
            )}
            <button
              type="button"
              onClick={onSwitchToStudent}
              className="py-1 border-b-2 border-transparent text-slate-500 hover:text-slate-900 transition whitespace-nowrap shrink-0"
            >
              Vista estudiante
            </button>
          </nav>

          <div className="flex items-center gap-2.5 shrink-0">
            <ThemeToggle variant="icon" />
            <button
              type="button"
              onClick={onLogout}
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold transition whitespace-nowrap shrink-0"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Cerrar sesión</span>
            </button>
          </div>
        </div>
      </header>

      {/* Workspace Subheader */}
      <div className="print:hidden bg-white border-b border-slate-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-slate-800">{counselor.school_name}</span>
            <span aria-hidden="true">·</span>
            <span>{counselor.full_name}</span>
            <span aria-hidden="true">·</span>
            <span>
              {counselor.role === 'admin'
                ? 'Coordinador(a) Convivencia'
                : counselor.role === 'psychologist'
                  ? 'Psicología / Apoyo'
                  : 'Coordinador(a) TOE / Tutor'}
            </span>
            <span aria-hidden="true">·</span>
            <span className="font-mono text-teal-800">
              Código escolar: {counselor.school_access_code}
            </span>
          </div>

          <div className="flex items-center gap-2.5 flex-wrap">
            <div className="inline-flex items-center gap-1.5 text-slate-600">
              <span
                className={`w-2 h-2 rounded-full ${
                  sseState === 'live' ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'
                }`}
                aria-hidden="true"
              />
              <span>{sseState === 'live' ? 'En vivo' : 'Reconectando...'}</span>
            </div>

            <label className="inline-flex items-center gap-1.5 text-slate-600">
              <span className="hidden sm:inline">Estado:</span>
              <select
                value={availability}
                onChange={(e) =>
                  void handleAvailabilityChange(e.target.value as CounselorAvailability)
                }
                aria-label="Mi disponibilidad de turno"
                className="bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-800 min-h-[40px]"
              >
                <option value="available">Disponible</option>
                <option value="busy">En sesión</option>
                <option value="off_duty">Fuera de turno</option>
              </select>
            </label>

            <button
              type="button"
              onClick={handleToggleSound}
              title={
                soundEnabled
                  ? 'Silenciar tono clínico en alertas'
                  : 'Activar tono clínico en alertas'
              }
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition min-h-[40px] ${
                soundEnabled
                  ? 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                  : 'bg-amber-50 border-amber-200 text-amber-800 hover:bg-amber-100'
              }`}
            >
              {soundEnabled ? (
                <Volume2 className="w-3.5 h-3.5 text-teal-700 shrink-0" />
              ) : (
                <VolumeX className="w-3.5 h-3.5 text-amber-700 shrink-0" />
              )}
              <span className="hidden md:inline">{soundEnabled ? 'Sonido' : 'Silencio'}</span>
            </button>

            {pushSupported && (
              <div className="inline-flex items-center gap-1.5">
                <button
                  type="button"
                  disabled={pushBusy}
                  onClick={() =>
                    pushSubscribed
                      ? void handleDisableStaffPush()
                      : void handleEnableOrUpdateStaffPush(pushThreshold)
                  }
                  title={
                    pushSubscribed
                      ? `Alertas activas en este dispositivo (${pushHealth?.total_devices ?? 1} en equipo). Clic para desactivar.`
                      : 'Activar notificaciones Push en este móvil o PC (Zero-PII en pantalla bloqueada)'
                  }
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition min-h-[40px] disabled:opacity-60 ${
                    pushSubscribed
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-800 hover:bg-emerald-100'
                      : 'bg-teal-700 border-teal-700 text-white hover:bg-teal-800'
                  }`}
                >
                  {pushBusy ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                  ) : pushSubscribed ? (
                    <BellRing className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
                  ) : (
                    <BellOff className="w-3.5 h-3.5 shrink-0" />
                  )}
                  <span>{pushSubscribed ? 'Alertas activas' : 'Activar alertas'}</span>
                </button>

                {pushSubscribed && (
                  <select
                    value={pushThreshold}
                    disabled={pushBusy}
                    onChange={(e) =>
                      void handleEnableOrUpdateStaffPush(e.target.value as StaffAlertThreshold)
                    }
                    aria-label="Umbral de alertas Push para este dispositivo"
                    className="bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 text-xs font-medium text-slate-700 min-h-[40px]"
                  >
                    <option value="criticos_y_sla">Críticos y SLA</option>
                    <option value="criticos_y_medios">Críticos y medios</option>
                    <option value="todos">Todos los casos</option>
                  </select>
                )}
              </div>
            )}

            <PWAInstallButton variant="light" />

            <div className="hidden xl:flex items-center gap-1.5 text-slate-500 pl-1">
              <ShieldCheck className="w-3.5 h-3.5 text-teal-700" />
              <span>Zero-PII</span>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-6">
        {errorMsg && (
          <div className="mb-4 p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800 flex items-center justify-between gap-3">
            <span>{errorMsg}</span>
            <button
              type="button"
              onClick={() => setErrorMsg(null)}
              className="font-semibold underline"
            >
              Ocultar
            </button>
          </div>
        )}

        {actionNotice && (
          <div className="mb-4 p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-900">
            {actionNotice}
          </div>
        )}

        {pushNotice && (
          <div className="mb-4 p-3.5 rounded-xl bg-teal-50 border border-teal-200 text-xs text-teal-900 flex items-center justify-between gap-3">
            <span>{pushNotice}</span>
            <button
              type="button"
              onClick={() => setPushNotice(null)}
              className="font-semibold underline shrink-0"
            >
              Cerrar
            </button>
          </div>
        )}

        {activeTab === 'analytics' && (
          <SchoolAnalytics token={token} refreshTrigger={analyticsVersion} />
        )}

        {activeTab === 'qr' && (
          <QrPosterGenerator
            schoolName={counselor.school_name}
            accessCode={counselor.school_access_code}
            spaces={schoolConfig?.spaces}
          />
        )}

        {activeTab === 'school_settings' && counselor.role === 'admin' && (
          <SchoolSettingsPanel token={token} currentCounselorId={counselor.id} />
        )}

        {activeTab === 'chats' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch min-h-[660px]">
            {/* Left Pane (3 cols): Case Inbox */}
            <aside className="lg:col-span-3 bg-white rounded-2xl border border-slate-200 flex flex-col overflow-hidden">
              <div className="p-3.5 border-b border-slate-100 space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <h1 className="text-sm font-bold text-slate-900">Bandeja de triaje</h1>
                  <span className="text-[11px] text-slate-500 tabular-nums">
                    {activeCount} act. · {criticalCount} crít.
                  </span>
                </div>

                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Buscar #ESC, motivo, lugar..."
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-8 pr-3 py-2 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-600"
                  />
                </div>

                <div className="grid grid-cols-4 gap-1 p-1 bg-slate-100 rounded-xl">
                  {(
                    [
                      { id: 'all', label: 'Todos' },
                      { id: 'critico', label: 'Crít.' },
                      { id: 'en_curso', label: 'Act.' },
                      { id: 'resuelto', label: 'Fin.' },
                    ] as const
                  ).map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setFilterMode(tab.id)}
                      className={`py-1.5 px-1.5 text-[11px] font-medium rounded-lg transition whitespace-nowrap ${
                        filterMode === tab.id
                          ? 'bg-white text-slate-900 shadow-sm'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex-1 overflow-y-auto divide-y divide-slate-100 max-h-[600px]">
                {loadingTickets ? (
                  <div className="p-8 text-center text-xs text-slate-400 flex items-center justify-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin text-teal-700" />
                    Cargando casos...
                  </div>
                ) : filteredTickets.length === 0 ? (
                  <div className="p-8 text-center text-xs text-slate-400">
                    No hay casos en esta vista.
                  </div>
                ) : (
                  filteredTickets.map((t) => {
                    const isSelected = activeTicket?.id === t.id;
                    const isCritical = t.risk_level === 'critico' && t.status !== 'resuelto';
                    const liveSla = computeLiveSla(t, nowMs);
                    return (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => setActiveTicketId(t.id)}
                        className={`w-full text-left p-3.5 transition ${
                          isSelected
                            ? 'bg-teal-50/80'
                            : isCritical
                              ? 'bg-rose-50/40 hover:bg-rose-50/70'
                              : 'bg-white hover:bg-slate-50'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-mono text-xs font-bold text-slate-900 flex items-center gap-1.5">
                            <span>{t.ticket_code}</span>
                            {t.has_break_glass && (
                              <KeyRound
                                className="w-3 h-3 text-amber-600"
                                aria-label="Tiene contacto Break-Glass encriptado"
                              />
                            )}
                          </span>
                          <div className="flex items-center gap-2">
                            {t.status !== 'resuelto' && !t.first_counselor_reply_at && (
                              <SlaCountdownRing
                                status={liveSla.status}
                                elapsed={liveSla.elapsed}
                                target={liveSla.target}
                                ratio={liveSla.ratio}
                              />
                            )}
                            <span className="text-[11px] text-slate-400 tabular-nums">
                              {formatRelativeTime(t.updated_at)}
                            </span>
                          </div>
                        </div>

                        <div className="mt-1 flex items-center gap-1.5 text-[11px] flex-wrap">
                          {t.status === 'resuelto' ? (
                            <span className="font-semibold text-emerald-700">Resuelto</span>
                          ) : t.risk_level === 'critico' ? (
                            <span className="font-semibold text-rose-700 inline-flex items-center gap-1">
                              <AlertTriangle className="w-3 h-3" />
                              Crítico
                            </span>
                          ) : t.risk_level === 'medio' ? (
                            <span className="font-semibold text-amber-700">Medio</span>
                          ) : (
                            <span className="font-medium text-teal-700">Bajo</span>
                          )}
                          <span aria-hidden="true" className="text-slate-300">
                            ·
                          </span>
                          <span className="text-slate-600 truncate">{t.category}</span>
                        </div>

                        {t.pace_mode === 'listen_only' && (
                          <p className="mt-1 text-[10px] font-semibold text-indigo-700">
                            Ritmo: Solo desahogo sin presión
                          </p>
                        )}

                        {t.target_counselor_name && (
                          <div className="mt-1 flex items-center gap-1.5 flex-wrap">
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-teal-50 border border-teal-200 text-[10px] font-semibold text-teal-800">
                              👤 {t.target_counselor_name}
                            </span>
                            {t.whatsapp_notified_at && (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-[9px] font-medium text-emerald-800">
                                📱 WhatsApp
                              </span>
                            )}
                          </div>
                        )}

                        {Boolean(t.reopened_by_student_at) && t.status !== 'resuelto' && (
                          <div className="mt-1">
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-md bg-teal-100 text-teal-800 border border-teal-200">
                              <HeartHandshake className="w-3 h-3" />
                              Sigue necesitando ayuda
                            </span>
                          </div>
                        )}

                        {!t.assigned_counselor_id && t.status !== 'resuelto' && (
                          <p className="mt-0.5 text-[10px] font-medium text-amber-700">
                            Sin orientador a cargo
                          </p>
                        )}

                        {t.last_message_preview && (
                          <p className="mt-1 text-xs text-slate-500 line-clamp-2 leading-relaxed">
                            {t.last_message_preview}
                          </p>
                        )}
                      </button>
                    );
                  })
                )}
              </div>
            </aside>

            {/* Center Pane (6 cols): Active Thread + AI Triage + 4-Tone Empathy Copilot */}
            <section className="lg:col-span-6 bg-white rounded-2xl border border-slate-200 flex flex-col overflow-hidden">
              {activeTicket ? (
                <>
                  {/* Case Header */}
                  <div className="p-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <h2 className="font-mono text-base font-bold text-slate-900">
                          Caso {activeTicket.ticket_code}
                        </h2>
                        <span aria-hidden="true" className="text-slate-300">
                          ·
                        </span>
                        <span
                          className={`inline-flex items-center gap-1 text-xs font-semibold ${
                            activeTicket.risk_level === 'critico'
                              ? 'text-rose-700'
                              : activeTicket.risk_level === 'medio'
                                ? 'text-amber-700'
                                : 'text-emerald-700'
                          }`}
                        >
                          {activeTicket.risk_level === 'critico' && (
                            <AlertTriangle className="w-3.5 h-3.5" />
                          )}
                          Riesgo:{' '}
                          {activeTicket.risk_level === 'critico'
                            ? 'Crítico'
                            : activeTicket.risk_level === 'medio'
                              ? 'Medio-Alto'
                              : 'Bajo'}
                        </span>

                        {activeSla &&
                          activeTicket.status !== 'resuelto' &&
                          !activeTicket.first_counselor_reply_at &&
                          activeSla.target && (
                            <>
                              <span aria-hidden="true" className="text-slate-300">
                                ·
                              </span>
                              <SlaCountdownRing
                                status={activeSla.status}
                                elapsed={activeSla.elapsed}
                                target={activeSla.target}
                                ratio={activeSla.ratio}
                              />
                            </>
                          )}
                      </div>

                      <div className="mt-1 flex items-center gap-2 text-xs text-slate-500 flex-wrap">
                        <span>{activeTicket.category}</span>
                        <span aria-hidden="true">·</span>
                        <span className="inline-flex items-center gap-1">
                          <MapPin className="w-3 h-3" />
                          {activeTicket.space_tag}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span>
                          {activeTicket.status === 'nuevo'
                            ? 'Nuevo'
                            : activeTicket.status === 'en_curso'
                              ? 'En atención'
                              : 'Resuelto'}
                        </span>
                        {activeTicket.assigned_counselor_name ? (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="text-slate-700 font-medium">
                              A cargo: {activeTicket.assigned_counselor_name}{' '}
                              {activeTicket.assigned_counselor_id === counselor.id ? '(Tú)' : ''}
                            </span>
                          </>
                        ) : (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="text-amber-700 font-semibold">
                              Sin orientador a cargo
                            </span>
                          </>
                        )}
                        {activeTicket.target_counselor_name && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="text-teal-800 font-semibold bg-teal-50 px-2 py-0.5 rounded border border-teal-200">
                              Dirigido a: {activeTicket.target_counselor_name}
                              {activeTicket.target_counselor_role_label ? ` (${activeTicket.target_counselor_role_label})` : ''}
                            </span>
                          </>
                        )}
                        {Boolean(activeTicket.reopened_by_student_at) &&
                          activeTicket.status !== 'resuelto' && (
                            <span className="inline-flex items-center gap-1 font-bold text-teal-800 bg-teal-100 px-2 py-0.5 rounded-md">
                              <HeartHandshake className="w-3 h-3" />
                              El estudiante indicó que sigue necesitando ayuda
                            </span>
                          )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 flex-wrap">
                      {activeTicket.status !== 'resuelto' &&
                        activeTicket.assigned_counselor_id !== counselor.id && (
                          <button
                            type="button"
                            disabled={assigning}
                            onClick={() => void handleAssignTicket()}
                            className={`min-h-[38px] inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition whitespace-nowrap shadow-sm ${
                              !activeTicket.assigned_counselor_id
                                ? 'bg-teal-700 hover:bg-teal-800 text-white'
                                : 'border border-slate-200 bg-white hover:bg-slate-50 text-slate-800'
                            }`}
                          >
                            <UserCheck className="w-3.5 h-3.5" />
                            <span>Hacerme cargo</span>
                          </button>
                        )}

                      {activeTicket.status !== 'resuelto' && !activeTicket.escalated_at && (
                        <button
                          type="button"
                          disabled={escalating}
                          onClick={() => void handleEscalateTicket()}
                          className="min-h-[38px] inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-800 text-xs font-semibold transition whitespace-nowrap"
                        >
                          <ArrowUpRight className="w-3.5 h-3.5" />
                          <span>Escalar</span>
                        </button>
                      )}

                      {activeTicket.status !== 'resuelto' ? (
                        <button
                          type="button"
                          onClick={() => setShowCloseBar((v) => !v)}
                          className="min-h-[38px] inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-xs font-semibold transition whitespace-nowrap"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Cerrar</span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => void handleUpdateStatus('en_curso')}
                          className="min-h-[38px] inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-semibold transition whitespace-nowrap"
                        >
                          Reabrir
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Typed Closure Bar */}
                  {showCloseBar && activeTicket.status !== 'resuelto' && (
                    <div className="px-4 py-3.5 bg-emerald-50/70 border-b border-emerald-200 flex flex-wrap items-end gap-3">
                      <div className="min-w-[180px] flex-1">
                        <label className="block text-[11px] font-semibold text-emerald-950 mb-1">
                          Resultado del acompañamiento
                        </label>
                        <select
                          value={closeOutcome}
                          onChange={(e) => setCloseOutcome(e.target.value as TicketOutcome)}
                          className="w-full bg-white border border-emerald-200 rounded-lg px-2.5 py-2 text-xs text-slate-800"
                        >
                          {(Object.keys(OUTCOME_LABELS) as TicketOutcome[]).map((key) => (
                            <option key={key} value={key}>
                              {OUTCOME_LABELS[key]}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="min-w-[180px] flex-1">
                        <label className="block text-[11px] font-semibold text-emerald-950 mb-1">
                          Observación interna (opcional)
                        </label>
                        <input
                          type="text"
                          value={closeNote}
                          onChange={(e) => setCloseNote(e.target.value)}
                          placeholder="Seguimiento con tutoría..."
                          className="w-full bg-white border border-emerald-200 rounded-lg px-2.5 py-2 text-xs text-slate-800"
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          disabled={closingCase}
                          onClick={() =>
                            void handleUpdateStatus('resuelto', {
                              outcome: closeOutcome,
                              note: closeNote,
                            })
                          }
                          className="px-3 py-2 rounded-lg bg-emerald-700 hover:bg-emerald-800 disabled:opacity-60 text-white text-xs font-semibold whitespace-nowrap"
                        >
                          {closingCase ? 'Cerrando...' : 'Confirmar'}
                        </button>
                        <button
                          type="button"
                          onClick={() => setShowCloseBar(false)}
                          className="px-2.5 py-2 rounded-lg border border-slate-200 bg-white text-xs font-medium text-slate-600"
                        >
                          Cancelar
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Messages Thread */}
                  <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-3.5 bg-slate-50/50 max-h-[380px]">
                    {loadingMessages ? (
                      <div className="py-12 text-center text-xs text-slate-400 flex items-center justify-center gap-2">
                        <Loader2 className="w-4 h-4 animate-spin text-teal-700" />
                        Cargando conversación...
                      </div>
                    ) : (
                      messages.map((m) => (
                        <div
                          key={m.id}
                          className={`flex ${
                            m.sender_role === 'counselor' ? 'justify-end' : 'justify-start'
                          }`}
                        >
                          <div
                            className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                              m.sender_role === 'counselor'
                                ? 'bg-teal-800 text-white rounded-br-sm'
                                : 'bg-white border border-slate-200 text-slate-800 rounded-bl-sm'
                            }`}
                          >
                            <div
                              className={`text-[11px] font-semibold mb-1 ${
                                m.sender_role === 'counselor'
                                  ? 'text-teal-100'
                                  : 'text-slate-500'
                              }`}
                            >
                              {m.sender_role === 'counselor'
                                ? 'Orientador(a) TOE / Tutoría'
                                : 'Estudiante Anónimo'}
                            </div>
                            <p className="whitespace-pre-wrap">{m.content}</p>
                          </div>
                        </div>
                      ))
                    )}
                    <div ref={chatEndRef} />
                  </div>

                  {/* AI Clinical Guidance + Triage Rationale */}
                  {(activeTicket.ai_suggestion || activeTicket.ai_rationale) && (
                    <div className="px-4 py-3 bg-sky-50/70 border-t border-sky-100 space-y-1">
                      {activeTicket.ai_suggestion && (
                        <div className="flex items-start gap-2">
                          <Sparkles className="w-4 h-4 text-teal-700 shrink-0 mt-0.5" />
                          <p className="text-xs text-slate-700 leading-relaxed">
                            <strong className="text-slate-900">Orientación IA:</strong>{' '}
                            {activeTicket.ai_suggestion}
                          </p>
                        </div>
                      )}
                      {activeTicket.ai_rationale && (
                        <p className="text-[11px] text-slate-600 pl-6 leading-relaxed">
                          <strong className="text-slate-800">Criterio de triaje:</strong>{' '}
                          {activeTicket.ai_rationale}
                        </p>
                      )}
                    </div>
                  )}

                  {/* Counselor Composer + 4-Tone Empathy Copilot */}
                  <form
                    onSubmit={handleSendReply}
                    className="p-4 border-t border-slate-200 bg-white space-y-2.5"
                  >
                    {activeTicket.pace_mode === 'listen_only' && (
                      <div className="px-3 py-2 rounded-xl bg-indigo-50 border border-indigo-200 text-[11px] text-indigo-900">
                        El estudiante eligió <strong>“Solo desahogo”</strong>: valida sus emociones sin pedirle reuniones ni datos. Si dejó de responder, prueba el tono <strong>Mensaje puente</strong>.
                      </div>
                    )}

                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      {empathyEnabled ? (
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-teal-800 mr-1">
                            <Wand2 className="w-3.5 h-3.5" />
                            Copiloto:
                          </span>
                          {EMPATHY_TONE_OPTIONS.map((opt) => (
                            <button
                              key={opt.id}
                              type="button"
                              disabled={draftingEmpathy}
                              onClick={() => void handleGenerateEmpathyDraft(opt.id)}
                              className={`px-2.5 py-1 rounded-lg border text-[11px] font-semibold transition disabled:opacity-50 ${
                                selectedTone === opt.id
                                  ? 'border-teal-600 bg-teal-50 text-teal-900'
                                  : 'border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700'
                              }`}
                            >
                              {draftingEmpathy && selectedTone === opt.id ? 'Generando...' : opt.label}
                            </button>
                          ))}
                        </div>
                      ) : (
                        <span className="text-[11px] text-slate-400">
                          Asistente de redacción desactivado por el colegio
                        </span>
                      )}
                      <span className="text-[11px] font-mono text-slate-400 tabular-nums">
                        {replyText.length}/4000
                      </span>
                    </div>

                    <div className="flex items-end gap-2">
                      <textarea
                        rows={2}
                        maxLength={4000}
                        value={replyText}
                        onChange={(e) => setReplyText(e.target.value)}
                        placeholder="Escribe una respuesta empática, cálida y sin juicios..."
                        className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-600 resize-none"
                      />
                      <button
                        type="submit"
                        disabled={sending || !replyText.trim()}
                        className="inline-flex items-center gap-1.5 bg-teal-700 hover:bg-teal-800 disabled:opacity-50 text-white font-semibold px-4 py-3 rounded-xl text-sm transition whitespace-nowrap shrink-0 min-h-[44px]"
                      >
                        {sending ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Send className="w-4 h-4" />
                        )}
                        <span>Enviar</span>
                      </button>
                    </div>
                  </form>
                </>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center p-12 text-center text-slate-400">
                  <MessageSquareHeart className="w-10 h-10 text-slate-300 mb-3" />
                  <p className="text-sm font-medium text-slate-600">
                    Selecciona un caso de la bandeja para leer y responder.
                  </p>
                </div>
              )}
            </section>

            {/* Right Pane (3 cols): Contextual Clinical Rail */}
            <aside className="lg:col-span-3 flex flex-col gap-4">
              {activeTicket ? (
                <>
                  {/* 1. Environmental Context Card (Zero-PII) */}
                  <section className="bg-white rounded-2xl border border-slate-200 p-4 space-y-2.5">
                    <h3 className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                      <Compass className="w-3.5 h-3.5 text-teal-700" />
                      Contexto preventivo (Zero-PII)
                    </h3>
                    <dl className="grid grid-cols-2 gap-2 text-[11px]">
                      <div className="p-2 rounded-lg bg-slate-50 border border-slate-100">
                        <dt className="text-slate-400">Espacio</dt>
                        <dd className="font-semibold text-slate-800 truncate">
                          {activeTicket.space_tag}
                        </dd>
                      </div>
                      <div className="p-2 rounded-lg bg-slate-50 border border-slate-100">
                        <dt className="text-slate-400">Horario</dt>
                        <dd className="font-semibold text-slate-800 truncate">
                          {activeTicket.time_slot || 'No indicado'}
                        </dd>
                      </div>
                      <div className="p-2 rounded-lg bg-slate-50 border border-slate-100">
                        <dt className="text-slate-400">Ciclo</dt>
                        <dd className="font-semibold text-slate-800 truncate">
                          {activeTicket.grade_band || 'No indicado'}
                        </dd>
                      </div>
                      <div className="p-2 rounded-lg bg-slate-50 border border-slate-100">
                        <dt className="text-slate-400">Ritmo</dt>
                        <dd className="font-semibold text-slate-800 truncate">
                          {activeTicket.pace_mode === 'listen_only'
                            ? 'Solo desahogo'
                            : 'Apoyo discreto'}
                        </dd>
                      </div>
                    </dl>
                  </section>

                  {/* 2. Break-Glass Emergency Vault (strictly guarded) */}
                  {activeTicket.has_break_glass && (
                    <section className="bg-white rounded-2xl border border-amber-200 p-4 space-y-3">
                      <div className="flex items-center justify-between gap-2">
                        <h3 className="text-xs font-bold text-amber-950 flex items-center gap-1.5">
                          <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0" />
                          Bóveda Break-Glass
                        </h3>
                        <span className="text-[10px] font-mono font-semibold text-amber-700">
                          AES-256
                        </span>
                      </div>

                      {activeTicket.risk_level !== 'critico' ? (
                        <p className="text-[11px] text-slate-600 leading-relaxed">
                          El estudiante dejó un contacto de respaldo voluntario. Permanece sellado y solo puede desbloquearse con auditoría si el riesgo escala a{' '}
                          <strong>Crítico</strong>.
                        </p>
                      ) : unlockedContact ? (
                        <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 space-y-1.5">
                          <p className="text-[11px] font-semibold text-amber-900">
                            Contacto autorizado desbloqueado:
                          </p>
                          <p className="text-xs font-mono font-bold text-slate-900 break-words">
                            {unlockedContact}
                          </p>
                          {activeTicket.break_glass_unlocked_by && (
                            <p className="text-[10px] text-amber-800 leading-relaxed">
                              Auditado: {activeTicket.break_glass_unlocked_by}
                              {activeTicket.break_glass_reason
                                ? ` · "${activeTicket.break_glass_reason}"`
                                : ''}
                            </p>
                          )}
                        </div>
                      ) : (
                        <form onSubmit={handleUnlockBreakGlass} className="space-y-2.5">
                          <p className="text-[11px] text-slate-600 leading-relaxed">
                            Caso en riesgo <strong>crítico</strong>. Desencriptar el contacto de respaldo queda registrado de forma permanente en auditoría.
                          </p>
                          {activeTicket.break_glass_unlocked_at && (
                            <p className="text-[10px] text-amber-800 bg-amber-50 p-2 rounded-lg border border-amber-200">
                              Desbloqueo previo: {activeTicket.break_glass_unlocked_by} (
                              {formatRelativeTime(activeTicket.break_glass_unlocked_at)}).
                            </p>
                          )}
                          <input
                            type="text"
                            required
                            minLength={8}
                            value={breakGlassReason}
                            onChange={(e) => setBreakGlassReason(e.target.value)}
                            placeholder="Motivo clínico obligatorio (mín. 8 car.)"
                            className="w-full bg-slate-50 border border-amber-200 rounded-lg px-2.5 py-2 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500"
                          />
                          <button
                            type="submit"
                            disabled={
                              unlockingBreakGlass || breakGlassReason.trim().length < 8
                            }
                            className="w-full min-h-[40px] px-3 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white text-xs font-semibold transition flex items-center justify-center gap-1.5"
                          >
                            {unlockingBreakGlass ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <KeyRound className="w-3.5 h-3.5" />
                            )}
                            <span>Desbloquear con auditoría</span>
                          </button>
                        </form>
                      )}
                    </section>
                  )}

                  {/* 3. Always-Accessible Staff-Only Internal Notes */}
                  <section className="flex-1 bg-slate-900 text-slate-100 rounded-2xl border border-slate-800 p-4 flex flex-col justify-between gap-3">
                    <div className="space-y-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <h3 className="text-xs font-bold text-white flex items-center gap-1.5">
                          <Lock className="w-3.5 h-3.5 text-teal-400" />
                          Notas internas ({internalNotes.length})
                        </h3>
                        <span className="text-[10px] text-slate-400">Solo equipo</span>
                      </div>

                      {loadingNotes ? (
                        <p className="text-xs text-slate-400">Cargando notas...</p>
                      ) : internalNotes.length === 0 ? (
                        <p className="text-xs text-slate-400 leading-relaxed">
                          Bitácora privada del equipo. El estudiante nunca puede ver estas notas.
                        </p>
                      ) : (
                        <div className="max-h-64 overflow-y-auto space-y-2 pr-1">
                          {internalNotes.map((n) => (
                            <div
                              key={n.id}
                              className="p-2.5 rounded-xl bg-slate-800/80 border border-slate-700 text-xs space-y-1"
                            >
                              <div className="flex items-center justify-between gap-2 text-[10px] text-slate-400">
                                <span className="font-semibold text-slate-200 truncate">
                                  {n.author_name}
                                </span>
                                <span className="tabular-nums shrink-0">
                                  {formatRelativeTime(n.created_at)}
                                </span>
                              </div>
                              <p className="text-slate-100 whitespace-pre-wrap leading-relaxed">
                                {n.content}
                              </p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <form onSubmit={handleAddInternalNote} className="space-y-2 pt-2 border-t border-slate-800">
                      <textarea
                        rows={2}
                        value={noteInput}
                        onChange={(e) => setNoteInput(e.target.value)}
                        placeholder="Registrar seguimiento interno, derivación o acuerdos..."
                        className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-teal-500 resize-none"
                      />
                      <button
                        type="submit"
                        disabled={savingNote || !noteInput.trim()}
                        className="w-full min-h-[40px] px-3 py-2 rounded-xl bg-teal-600 hover:bg-teal-500 disabled:opacity-50 text-white text-xs font-semibold flex items-center justify-center gap-1.5"
                      >
                        <FileText className="w-3.5 h-3.5" />
                        <span>{savingNote ? 'Guardando...' : 'Guardar nota interna'}</span>
                      </button>
                    </form>
                  </section>
                </>
              ) : (
                <section className="bg-white rounded-2xl border border-slate-200 p-6 text-center text-xs text-slate-400">
                  El contexto clínico, la bóveda de seguridad y las notas aparecerán al seleccionar un caso.
                </section>
              )}
            </aside>
          </div>
        )}
      </main>
    </div>
  );
};
