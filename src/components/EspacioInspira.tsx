import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  BookOpen,
  ExternalLink,
  Heart,
  Loader2,
  MessageCircleHeart,
  Pause,
  Play,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Video,
  Wind,
  X,
} from 'lucide-react';
import type { InspiraFormat, InspiraResource, InspiraTopic } from '../types';

interface EspacioInspiraProps {
  schoolId?: string;
  schoolName?: string;
  schoolAccent?: string;
  schoolResources?: InspiraResource[];
  initialTopic?: InspiraTopic | 'todos';
  activeVault?: {
    ticketId: string;
    ticketCode: string;
    hasUnreadReply: boolean;
  } | null;
  onResumeVault?: () => void;
  onOpenSupport: () => void;
}

const TOPIC_OPTIONS: { id: InspiraTopic | 'todos'; label: string }[] = [
  { id: 'todos', label: 'Todos los temas' },
  { id: 'autoestima', label: 'Autoestima' },
  { id: 'limites', label: 'Límites sanos' },
  { id: 'ciberacoso', label: 'Ciberacoso' },
  { id: 'calma', label: 'Calma y respiración' },
  { id: 'pedir_ayuda', label: 'Pedir ayuda' },
];

const TOPIC_LABELS: Record<InspiraTopic, string> = {
  autoestima: 'Autoestima',
  limites: 'Límites sanos',
  ciberacoso: 'Ciberacoso',
  calma: 'Calma y respiración',
  pedir_ayuda: 'Pedir ayuda',
};

const FORMAT_LABELS: Record<InspiraFormat, string> = {
  capsula: 'Cápsula',
  video: 'Video seguro',
  ejercicio: 'Ejercicio práctico',
};

const DAILY_AFFIRMATIONS: string[] = [
  'Lo que dicen de ti cuando intentan herirte no define quién eres ni lo que vales.',
  'Pedir ayuda a tiempo no te hace débil: protege tu paz y corta el silencio.',
  'Mereces ir al colegio sin miedo en el estómago y rodearte de respeto real.',
  'Decir "no me gusta esa broma" es un derecho, no una exageración.',
  'Aunque hoy se sienta pesado, no tienes por qué cargar esto en soledad.',
  'Tu historia importa y siempre existe un adulto dispuesto a escucharte sin juzgarte.',
];

type BreathPhase = 'idle' | 'inhale' | 'hold' | 'exhale';

const PHASE_DURATION: Record<Exclude<BreathPhase, 'idle'>, number> = {
  inhale: 4,
  hold: 4,
  exhale: 6,
};

const PHASE_COPY: Record<BreathPhase, { title: string; subtitle: string }> = {
  idle: {
    title: 'Pausa de Calma 4-4-6',
    subtitle: 'Inhala 4s · Sostén 4s · Exhala despacio 6s. Funciona 100% sin conexión.',
  },
  inhale: {
    title: 'Inhala suave por la nariz',
    subtitle: 'Llena tus pulmones sin apuro mientras cuentas hasta cuatro.',
  },
  hold: {
    title: 'Sostén con calma',
    subtitle: 'Suelta los hombros y mantén el aire con tranquilidad.',
  },
  exhale: {
    title: 'Exhala largo y despacio',
    subtitle: 'Deja salir la tensión poco a poco por la boca durante seis segundos.',
  },
};

export const EspacioInspira: React.FC<EspacioInspiraProps> = ({
  schoolId,
  schoolName,
  schoolAccent = '#0F766E',
  schoolResources,
  initialTopic = 'todos',
  activeVault,
  onResumeVault,
  onOpenSupport,
}) => {
  const [selectedTopic, setSelectedTopic] = useState<InspiraTopic | 'todos'>(initialTopic);
  const [selectedFormat, setSelectedFormat] = useState<InspiraFormat | 'todos'>('todos');
  const [fallbackResources, setFallbackResources] = useState<InspiraResource[]>([]);
  const [loadingResources, setLoadingResources] = useState(false);
  const [activeResource, setActiveResource] = useState<InspiraResource | null>(null);
  const [brokenThumbs, setBrokenThumbs] = useState<Record<string, boolean>>({});
  const [affirmationIndex, setAffirmationIndex] = useState(() =>
    Math.floor(Math.random() * DAILY_AFFIRMATIONS.length)
  );

  // Offline 4-4-6 Breathing State
  const [breathRunning, setBreathRunning] = useState(false);
  const [breathPhase, setBreathPhase] = useState<BreathPhase>('idle');
  const [secondsLeft, setSecondsLeft] = useState(4);
  const [completedCycles, setCompletedCycles] = useState(0);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  useEffect(() => {
    setSelectedTopic(initialTopic);
  }, [initialTopic]);

  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (!mq) return;
    setPrefersReducedMotion(mq.matches);
    const handler = (e: MediaQueryListEvent) => setPrefersReducedMotion(e.matches);
    mq.addEventListener?.('change', handler);
    return () => mq.removeEventListener?.('change', handler);
  }, []);

  // Load curated public catalog if student hasn't entered a school code yet
  useEffect(() => {
    if (schoolResources) return;
    setLoadingResources(true);
    fetch('/api/platform/inspira')
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { resources?: InspiraResource[] } | null) => {
        if (data?.resources) {
          setFallbackResources(data.resources);
        }
      })
      .catch(() => undefined)
      .finally(() => setLoadingResources(false));
  }, [schoolResources]);

  // Breathing state machine
  useEffect(() => {
    if (!breathRunning) return;
    if (breathPhase === 'idle') {
      setBreathPhase('inhale');
      setSecondsLeft(PHASE_DURATION.inhale);
      return;
    }

    const timer = window.setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev > 1) return prev - 1;
        setBreathPhase((curr) => {
          if (curr === 'inhale') {
            setSecondsLeft(PHASE_DURATION.hold);
            return 'hold';
          }
          if (curr === 'hold') {
            setSecondsLeft(PHASE_DURATION.exhale);
            return 'exhale';
          }
          setCompletedCycles((c) => c + 1);
          setSecondsLeft(PHASE_DURATION.inhale);
          return 'inhale';
        });
        return prev;
      });
    }, 1000);

    return () => window.clearInterval(timer);
  }, [breathRunning, breathPhase]);

  const resources = schoolResources ?? fallbackResources;

  const filteredResources = useMemo(() => {
    return resources.filter((r) => {
      const topicOk = selectedTopic === 'todos' || r.topic === selectedTopic;
      const formatOk = selectedFormat === 'todos' || r.format === selectedFormat;
      return topicOk && formatOk;
    });
  }, [resources, selectedTopic, selectedFormat]);

  const videoCount = useMemo(
    () => resources.filter((r) => r.format === 'video').length,
    [resources]
  );

  const handleOpenResource = (res: InspiraResource) => {
    setActiveResource(res);
    // Zero-PII aggregated topic view counter (no user ID, no item history persisted locally)
    void fetch('/api/inspira/view', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        schoolId: schoolId || null,
        topic: res.topic,
        format: res.format,
      }),
    }).catch(() => undefined);
  };

  const handleToggleBreathing = () => {
    if (breathRunning) {
      setBreathRunning(false);
    } else {
      if (breathPhase === 'idle') {
        setBreathPhase('inhale');
        setSecondsLeft(PHASE_DURATION.inhale);
      }
      setBreathRunning(true);
    }
  };

  const handleResetBreathing = () => {
    setBreathRunning(false);
    setBreathPhase('idle');
    setSecondsLeft(4);
    setCompletedCycles(0);
  };

  const phaseTotal = breathPhase === 'idle' ? 4 : PHASE_DURATION[breathPhase];
  const phaseProgressPct = Math.round(((phaseTotal - secondsLeft + 1) / phaseTotal) * 100);

  return (
    <div className="w-full space-y-8">
      {/* Silent Vault Resume Banner */}
      {activeVault && onResumeVault && (
        <div
          className={`rounded-2xl border p-4 sm:px-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
            activeVault.hasUnreadReply
              ? 'bg-teal-50 border-teal-200 text-teal-950'
              : 'bg-white border-slate-200 text-slate-800'
          }`}
        >
          <div className="flex items-start sm:items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-teal-700 text-white flex items-center justify-center shrink-0">
              <MessageCircleHeart className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-bold text-slate-900">
                {activeVault.hasUnreadReply
                  ? `Tienes una respuesta en tu buzón ${activeVault.ticketCode}`
                  : `Tu buzón privado ${activeVault.ticketCode} sigue abierto en esta sesión`}
              </p>
              <p className="text-[11px] text-slate-600 mt-0.5">
                {activeVault.hasUnreadReply
                  ? 'El equipo de apoyo dejó un mensaje para ti. Puedes abrirlo cuando te sientas listo.'
                  : 'Tu conversación se conserva de forma segura hasta que salgas o uses el botón rojo.'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onResumeVault}
            className="min-h-[44px] px-4 py-2 rounded-xl bg-teal-700 hover:bg-teal-800 text-white text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition shrink-0"
          >
            <span>Volver al chat</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Intro Header */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div className="space-y-2 max-w-2xl">
          <p className="inline-flex items-center gap-2 text-xs font-semibold text-teal-800">
            <ShieldCheck className="w-4 h-4 text-teal-700" />
            <span>
              Espacio Inspira{schoolName ? ` · ${schoolName}` : ''} · Lectura y calma sin rastreo
            </span>
          </p>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight leading-tight">
            Un respiro para cuidar tu mente, tu autoestima y tus límites.
          </h1>
          <p className="text-sm text-slate-600 leading-relaxed">
            No guardamos qué cápsulas lees ni qué videos miras. Tómate unos minutos a tu ritmo o pasa directo a conversar con un especialista si lo necesitas.
          </p>
        </div>

        <button
          type="button"
          onClick={onOpenSupport}
          style={{ backgroundColor: schoolAccent }}
          className="min-h-[46px] inline-flex items-center justify-center gap-2 px-5 py-3 rounded-2xl text-white text-sm font-semibold hover:opacity-95 transition shrink-0"
        >
          <MessageCircleHeart className="w-4 h-4" />
          <span>Hablar en el buzón seguro</span>
        </button>
      </div>

      {/* Top Interactive Duo: Offline 4-4-6 Breathing + Affirmation */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        {/* Breathing Pause 4-4-6 */}
        <section className="lg:col-span-7 bg-white rounded-3xl border border-slate-200 p-6 sm:p-7 flex flex-col sm:flex-row items-center gap-6">
          <div className="relative flex items-center justify-center w-36 h-36 shrink-0">
            {!prefersReducedMotion && (
              <div
                aria-hidden="true"
                className="absolute inset-0 rounded-full transition-transform duration-1000 ease-in-out opacity-20"
                style={{
                  backgroundColor: schoolAccent,
                  transform:
                    breathPhase === 'inhale'
                      ? 'scale(1)'
                      : breathPhase === 'hold'
                        ? 'scale(1)'
                        : 'scale(0.72)',
                }}
              />
            )}
            <div
              className="relative w-28 h-28 rounded-full border-2 flex flex-col items-center justify-center bg-slate-50 transition-colors"
              style={{ borderColor: schoolAccent }}
            >
              <span className="text-3xl font-extrabold text-slate-900 tabular-nums leading-none">
                {breathRunning || breathPhase !== 'idle' ? `${secondsLeft}s` : '4·4·6'}
              </span>
              <span className="text-[11px] font-semibold text-slate-500 mt-1">
                {breathPhase === 'idle'
                  ? 'Listo'
                  : breathPhase === 'inhale'
                    ? 'Inhala'
                    : breathPhase === 'hold'
                      ? 'Sostén'
                      : 'Exhala'}
              </span>
            </div>
          </div>

          <div className="flex-1 space-y-3 text-center sm:text-left w-full">
            <div className="flex flex-wrap items-center justify-center sm:justify-between gap-2">
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-teal-800">
                <Wind className="w-4 h-4 text-teal-700" />
                <span>Pausa de Calma 4-4-6</span>
              </span>
              <span className="text-xs font-mono text-slate-500 tabular-nums">
                Ciclos completados: {completedCycles}
              </span>
            </div>

            <div>
              <h2 className="text-lg font-bold text-slate-900">{PHASE_COPY[breathPhase].title}</h2>
              <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                {PHASE_COPY[breathPhase].subtitle}
              </p>
            </div>

            {/* Accessible calm progress bar (essential especially under prefers-reduced-motion) */}
            <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: breathPhase === 'idle' ? '0%' : `${Math.min(100, phaseProgressPct)}%`,
                  backgroundColor: schoolAccent,
                }}
              />
            </div>

            <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2.5 pt-1">
              <button
                type="button"
                onClick={handleToggleBreathing}
                style={{ backgroundColor: schoolAccent }}
                className="min-h-[44px] inline-flex items-center gap-2 px-4 py-2 rounded-xl text-white text-xs font-semibold hover:opacity-95 transition"
              >
                {breathRunning ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                <span>
                  {breathRunning
                    ? 'Pausar ejercicio'
                    : breathPhase === 'idle'
                      ? 'Empezar a respirar'
                      : 'Continuar'}
                </span>
              </button>

              {(breathRunning || breathPhase !== 'idle' || completedCycles > 0) && (
                <button
                  type="button"
                  onClick={handleResetBreathing}
                  className="min-h-[44px] inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 transition"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Reiniciar</span>
                </button>
              )}
            </div>
          </div>
        </section>

        {/* Daily Self-Esteem Affirmation */}
        <section className="lg:col-span-5 bg-gradient-to-br from-teal-900 to-slate-900 text-white rounded-3xl p-6 sm:p-7 flex flex-col justify-between gap-5">
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2 text-xs text-teal-200 font-semibold">
              <span className="inline-flex items-center gap-1.5">
                <Sparkles className="w-4 h-4" />
                <span>Recordatorio para ti hoy</span>
              </span>
              <span className="font-mono text-[11px] text-teal-300 tabular-nums">
                {affirmationIndex + 1}/{DAILY_AFFIRMATIONS.length}
              </span>
            </div>
            <blockquote className="text-lg sm:text-xl font-bold leading-snug text-white">
              “{DAILY_AFFIRMATIONS[affirmationIndex]}”
            </blockquote>
          </div>

          <div className="flex items-center justify-between gap-3 pt-2 border-t border-white/10">
            <button
              type="button"
              onClick={() =>
                setAffirmationIndex((prev) => (prev + 1) % DAILY_AFFIRMATIONS.length)
              }
              className="min-h-[44px] inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-semibold text-white transition"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Otro recordatorio</span>
            </button>
            <span className="text-[11px] text-teal-200/80">Sin historial guardado</span>
          </div>
        </section>
      </div>

      {/* Curated Content Library */}
      <section className="space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-slate-900">
              Videos de apoyo, autoestima y guías prácticas
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Filtra por formato o tema. Los videos usan reproducción privada sin cookies (youtube-nocookie.com).
            </p>
          </div>

          {/* Interactive Format Filter Tabs */}
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filtrar por formato">
            {(
              [
                { id: 'todos', label: `Todos (${resources.length})` },
                { id: 'video', label: `Videos (${videoCount})` },
                { id: 'capsula', label: 'Guías' },
                { id: 'ejercicio', label: 'Ejercicios' },
              ] as const
            ).map((fmt) => {
              const active = selectedFormat === fmt.id;
              return (
                <button
                  key={fmt.id}
                  type="button"
                  onClick={() => setSelectedFormat(fmt.id)}
                  className={`min-h-[40px] px-3.5 py-1.5 rounded-xl text-xs font-semibold border transition ${
                    active
                      ? 'bg-slate-900 border-slate-900 text-white'
                      : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  {fmt.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Interactive Topic Filter Tabs */}
        <div className="flex flex-wrap gap-2" role="tablist" aria-label="Filtrar por tema">
          {TOPIC_OPTIONS.map((t) => {
            const active = selectedTopic === t.id;
            return (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setSelectedTopic(t.id)}
                style={
                  active
                    ? { backgroundColor: schoolAccent, borderColor: schoolAccent }
                    : undefined
                }
                className={`min-h-[44px] px-4 py-2 rounded-xl text-xs font-semibold border transition ${
                  active
                    ? 'text-white'
                    : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                }`}
              >
                {t.label}
              </button>
            );
          })}
        </div>

        {loadingResources && resources.length === 0 ? (
          <div className="flex items-center justify-center py-12 text-xs text-slate-500">
            <Loader2 className="w-4 h-4 animate-spin mr-2 text-teal-700" />
            Cargando cápsulas y videos de apoyo...
          </div>
        ) : filteredResources.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center text-sm text-slate-500">
            No hay recursos activos con ese filtro todavía.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredResources.map((item) => {
              const Icon =
                item.format === 'video'
                  ? Video
                  : item.format === 'ejercicio'
                    ? Wind
                    : BookOpen;
              return (
                <article
                  key={item.id}
                  className="bg-white rounded-2xl border border-slate-200 overflow-hidden flex flex-col justify-between hover:border-slate-300 transition"
                >
                  <div>
                    {item.format === 'video' && item.youtube_id && (
                      <button
                        type="button"
                        onClick={() => handleOpenResource(item)}
                        className="group relative block w-full aspect-video bg-slate-900 overflow-hidden text-left"
                        aria-label={`Reproducir video: ${item.title}`}
                      >
                        {!brokenThumbs[item.id] ? (
                          <img
                            src={`https://i.ytimg.com/vi/${encodeURIComponent(item.youtube_id)}/hqdefault.jpg`}
                            alt={item.title}
                            loading="lazy"
                            referrerPolicy="no-referrer"
                            onError={() =>
                              setBrokenThumbs((prev) => ({ ...prev, [item.id]: true }))
                            }
                            className="w-full h-full object-cover opacity-90 group-hover:scale-[1.02] transition-transform duration-300"
                          />
                        ) : (
                          <div className="w-full h-full flex flex-col items-center justify-center gap-2 bg-slate-800 text-slate-300 px-4 text-center">
                            <Video className="w-7 h-7 text-teal-400" />
                            <span className="text-[11px] font-medium text-slate-200">
                              Video disponible al conectar
                            </span>
                          </div>
                        )}
                        <div className="absolute inset-0 bg-slate-950/30 group-hover:bg-slate-950/20 flex items-center justify-center transition">
                          <span className="w-12 h-12 rounded-full bg-white/95 text-slate-900 flex items-center justify-center shadow-sm">
                            <Play className="w-5 h-5 ml-0.5 fill-current" />
                          </span>
                        </div>
                      </button>
                    )}

                    <div className="p-5 space-y-3">
                      {/* Clean unboxed metadata row separated by · (Zero-Pill Discipline) */}
                      <div className="flex items-center justify-between gap-2 text-[11px] font-semibold text-slate-500">
                        <span className="inline-flex items-center gap-1.5 text-teal-800">
                          <Icon className="w-3.5 h-3.5 shrink-0" />
                          <span>
                            {FORMAT_LABELS[item.format]} · {TOPIC_LABELS[item.topic]}
                          </span>
                        </span>
                        <span className="text-slate-400 font-normal shrink-0">
                          {item.duration_label}
                        </span>
                      </div>

                      <h3 className="text-base font-bold text-slate-900 leading-snug">
                        {item.title}
                      </h3>

                      <p className="text-xs text-slate-600 leading-relaxed">{item.summary}</p>
                    </div>
                  </div>

                  <div className="px-5 pb-5">
                    <button
                      type="button"
                      onClick={() => handleOpenResource(item)}
                      className="min-h-[44px] w-full inline-flex items-center justify-between px-4 py-2.5 rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-200 text-xs font-semibold text-slate-800 transition"
                    >
                      <span>
                        {item.format === 'video' ? 'Ver video seguro' : 'Leer guía completa'}
                      </span>
                      <ArrowRight className="w-3.5 h-3.5 text-slate-500" />
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {/* Bottom Bridge to Safe Anonymous Support */}
      <section className="bg-sky-50/80 border border-sky-200 rounded-2xl p-5 sm:p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-white border border-sky-200 text-teal-700 flex items-center justify-center shrink-0">
            <Heart className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900">
              ¿Necesitas que alguien de tu colegio te escuche hoy?
            </h3>
            <p className="text-xs text-slate-600 mt-0.5 leading-relaxed">
              Puedes abrir un buzón anónimo con PIN de 4 números en menos de un minuto. Nadie sabrá tu nombre.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onOpenSupport}
          className="min-h-[44px] px-4 py-2.5 rounded-xl bg-white hover:bg-slate-50 border border-slate-200 text-xs font-bold text-teal-800 transition shrink-0"
        >
          Abrir buzón anónimo
        </button>
      </section>

      {/* Resource Reader & Zero-Tracking Video Modal */}
      {activeResource && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto"
          role="dialog"
          aria-modal="true"
          aria-labelledby="inspira-modal-title"
        >
          <div className="bg-white rounded-3xl border border-slate-200 max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[11px] font-semibold text-teal-800">
                  {FORMAT_LABELS[activeResource.format]} · {TOPIC_LABELS[activeResource.topic]} ·{' '}
                  {activeResource.duration_label}
                </p>
                <h2
                  id="inspira-modal-title"
                  className="text-base sm:text-lg font-bold text-slate-900 truncate mt-0.5"
                >
                  {activeResource.title}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setActiveResource(null)}
                className="min-h-[44px] min-w-[44px] rounded-xl text-slate-500 hover:text-slate-900 hover:bg-slate-100 flex items-center justify-center transition shrink-0"
                aria-label="Cerrar recurso"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-5">
              {activeResource.format === 'video' && activeResource.youtube_id && (
                <div className="space-y-2">
                  <div className="aspect-video w-full rounded-2xl overflow-hidden bg-slate-950 border border-slate-200">
                    <iframe
                      title={activeResource.title}
                      src={`https://www.youtube-nocookie.com/embed/${encodeURIComponent(
                        activeResource.youtube_id
                      )}?rel=0&modestbranding=1&iv_load_policy=3`}
                      className="w-full h-full border-0"
                      allow="accelerometer; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                      referrerPolicy="strict-origin-when-cross-origin"
                    />
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500">
                    <span className="flex items-center gap-1.5">
                      <ShieldCheck className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
                      <span>
                        Reproductor privado sin cookies de rastreo (youtube-nocookie.com).
                      </span>
                    </span>
                    <a
                      href={`https://www.youtube.com/watch?v=${encodeURIComponent(
                        activeResource.youtube_id
                      )}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 font-semibold text-teal-800 hover:underline"
                    >
                      <span>Abrir enlace directo</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                </div>
              )}

              <div className="space-y-3 text-sm text-slate-700 leading-relaxed whitespace-pre-line">
                {activeResource.body}
              </div>

              {activeResource.affirmation && (
                <div className="p-4 rounded-2xl bg-teal-50/70 border border-teal-200 text-xs text-teal-950 font-medium leading-relaxed">
                  <strong>Idea clave para recordar:</strong> {activeResource.affirmation}
                </div>
              )}
            </div>

            <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex flex-wrap items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => setActiveResource(null)}
                className="min-h-[44px] px-4 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-100 text-xs font-semibold text-slate-700 transition"
              >
                Seguir explorando
              </button>
              <button
                type="button"
                onClick={() => {
                  setActiveResource(null);
                  onOpenSupport();
                }}
                style={{ backgroundColor: schoolAccent }}
                className="min-h-[44px] inline-flex items-center gap-2 px-5 py-2 rounded-xl text-white text-xs font-semibold hover:opacity-95 transition"
              >
                <MessageCircleHeart className="w-4 h-4" />
                <span>Quiero hablar con alguien ahora</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
