import React, { useEffect, useState } from 'react';
import {
  BarChart3,
  ShieldAlert,
  CheckCircle2,
  Clock,
  Download,
  MessageSquareHeart,
  Calendar,
  Lightbulb,
  Loader2,
  MapPin,
  Printer,
  Smile,
  Sparkles,
  RefreshCw,
  Compass,
  Users,
} from 'lucide-react';
import type { InspiraTopic, MoodType, SchoolAnalyticsData, TicketOutcome } from '../types';

const INSPIRA_TOPIC_LABELS: Record<InspiraTopic, string> = {
  autoestima: 'Autoestima y valía personal',
  limites: 'Límites sanos',
  ciberacoso: 'Prevención de ciberacoso',
  calma: 'Calma y respiración 4-4-6',
  pedir_ayuda: 'Cómo pedir ayuda',
};

const DAYS_LABELS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

const OUTCOME_LABELS: Record<TicketOutcome, string> = {
  acompanamiento_exitoso: 'Acompañamiento psicológico exitoso',
  resuelto_tutoria: 'Resuelto con tutoría de aula',
  derivacion_externa: 'Derivación externa especializada',
  falsa_alerta: 'Falsa alerta / caso duplicado',
  otro: 'Otro cierre institucional',
};

const MOOD_LABELS: Record<MoodType, string> = {
  tranquilo: 'Tranquilo / bien',
  preocupado: 'Preocupado',
  triste: 'Triste o solo',
  excluido: 'Excluido del grupo',
  en_alerta: 'Con miedo / alerta',
};

interface SchoolAnalyticsProps {
  token: string;
  refreshTrigger?: number;
}

export const SchoolAnalytics: React.FC<SchoolAnalyticsProps> = ({
  token,
  refreshTrigger = 0,
}) => {
  const [stats, setStats] = useState<SchoolAnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadAnalytics = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/counselor/analytics', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        throw new Error('No se pudieron cargar las estadísticas.');
      }
      const data = (await res.json()) as { analytics: SchoolAnalyticsData };
      setStats(data.analytics);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error de conexión.');
    } finally {
      setLoading(false);
    }
  };

  const handleExportCsv = async () => {
    setExporting(true);
    try {
      const res = await fetch('/api/counselor/export.csv', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('No se pudo exportar el reporte CSV.');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'te-escucho-estadisticas-zero-pii.csv';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al exportar CSV.');
    } finally {
      setExporting(false);
    }
  };

  useEffect(() => {
    void loadAnalytics();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, refreshTrigger]);

  if (loading && !stats) {
    return (
      <div className="flex items-center justify-center p-16 text-slate-500 text-sm">
        <Loader2 className="w-5 h-5 animate-spin mr-2.5 text-teal-700" />
        Calculando indicadores preventivos...
      </div>
    );
  }

  if (error && !stats) {
    return (
      <div className="p-8 text-center">
        <p className="text-sm text-rose-700 mb-3">{error}</p>
        <button
          type="button"
          onClick={loadAnalytics}
          className="px-4 py-2 rounded-lg bg-teal-700 text-white text-xs font-semibold hover:bg-teal-800 transition"
        >
          Reintentar
        </button>
      </div>
    );
  }

  if (!stats) return null;

  const total = stats.total_cases || 0;
  const resolutionRate = total > 0 ? Math.round((stats.resolved_cases / total) * 100) : 0;

  const schoolDays = [1, 2, 3, 4, 5].map((dayNum) => {
    const found = stats.by_day_of_week.find((d) => d.day_num === dayNum);
    return {
      label: DAYS_LABELS[dayNum],
      count: found ? found.count : 0,
    };
  });
  const maxDayCount = Math.max(...schoolDays.map((d) => d.count), 1);

  const topCategory = (stats.by_category[0]?.category || '').toLowerCase();
  const topSpace = stats.by_space[0]?.space_tag || '';

  const getPreventiveTip = () => {
    if (topCategory.includes('excluido')) {
      return `Se observa alta incidencia de exclusión grupal${topSpace ? ` (principalmente en ${topSpace})` : ''}. Se recomienda realizar dinámicas de integración en tutoría y reforzar la cultura de inclusión KiVa con los testigos.`;
    }
    if (topCategory.includes('acoso')) {
      return `Predominan reportes de acoso o burlas${topSpace ? ` en ${topSpace}` : ''}. Refuerza las campañas de ciberconvivencia, evita la mediación directa víctima-agresor y activa acompañamiento individual.`;
    }
    if (topCategory.includes('testigo')) {
      return 'Los estudiantes están usando el canal como testigos activos. Reconoce en asamblea la valentía de no guardar silencio para seguir frenando el acoso.';
    }
    return 'Mantén visibles los afiches QR de Te Escucho en aulas, biblioteca y servicios higiénicos para sostener la prevención temprana.';
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900">
            Estadísticas Anónimas y Mapa de Calor Preventivo
          </h2>
          <p className="text-sm text-slate-500 mt-0.5">
            Datos agregados sin exponer conversaciones privadas ni identidad de estudiantes.
          </p>
        </div>
        <div className="print:hidden flex items-center gap-2 flex-wrap">
          <button
            type="button"
            disabled={exporting}
            onClick={() => void handleExportCsv()}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-medium text-slate-700 transition whitespace-nowrap"
          >
            <Download className="w-3.5 h-3.5" />
            <span>{exporting ? 'Exportando...' : 'Exportar CSV (Zero-PII)'}</span>
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-medium text-slate-700 transition whitespace-nowrap"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Imprimir informe</span>
          </button>
          <button
            type="button"
            onClick={loadAnalytics}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-medium text-slate-700 transition whitespace-nowrap"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Actualizar</span>
          </button>
        </div>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-teal-50 border border-teal-100 text-teal-700 flex items-center justify-center shrink-0">
            <MessageSquareHeart className="w-5 h-5" />
          </div>
          <div>
            <span className="text-xs font-medium text-slate-500">Total de escuchas</span>
            <p className="text-2xl font-bold text-slate-900 tabular-nums mt-0.5">{total}</p>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
            <CheckCircle2 className="w-5 h-5" />
          </div>
          <div>
            <span className="text-xs font-medium text-slate-500">Tasa resolución</span>
            <p className="text-2xl font-bold text-slate-900 tabular-nums mt-0.5">
              {resolutionRate}%
            </p>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-sky-50 border border-sky-100 text-sky-700 flex items-center justify-center shrink-0">
            <Clock className="w-5 h-5" />
          </div>
          <div>
            <span className="text-xs font-medium text-slate-500">Cumplimiento SLA</span>
            <p className="text-2xl font-bold text-slate-900 tabular-nums mt-0.5">
              {stats.sla_compliance_rate}%
              <span className="block text-[11px] font-normal text-slate-500">
                {stats.avg_first_response_minutes !== null
                  ? `Prom. ${stats.avg_first_response_minutes} min`
                  : 'Sin respuestas aún'}
              </span>
            </p>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-rose-50 border border-rose-100 text-rose-700 flex items-center justify-center shrink-0">
            <ShieldAlert className="w-5 h-5" />
          </div>
          <div>
            <span className="text-xs font-medium text-slate-500">Alertas críticas</span>
            <p className="text-2xl font-bold text-slate-900 tabular-nums mt-0.5">
              {stats.critical_cases}
              <span className="block text-[11px] font-normal text-slate-500">
                {stats.escalated_cases} escalado(s)
              </span>
            </p>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-sky-50 border border-sky-100 text-sky-700 flex items-center justify-center shrink-0">
            <Smile className="w-5 h-5" />
          </div>
          <div>
            <span className="text-xs font-medium text-slate-500">Pulsos ánimo</span>
            <p className="text-2xl font-bold text-slate-900 tabular-nums mt-0.5">
              {stats.total_mood_checkins}
            </p>
          </div>
        </div>
      </div>

      {/* Distribution Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Por problemática */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200">
          <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2 mb-5">
            <BarChart3 className="w-4 h-4 text-teal-700" />
            Problemáticas detectadas
          </h3>
          {stats.by_category.length > 0 ? (
            <div className="space-y-4">
              {stats.by_category.map((item) => {
                const percent = total > 0 ? Math.round((item.count / total) * 100) : 0;
                return (
                  <div key={item.category}>
                    <div className="flex justify-between text-xs font-medium text-slate-700 mb-1.5">
                      <span>{item.category}</span>
                      <span className="font-mono tabular-nums text-slate-900">
                        {item.count} · {percent}%
                      </span>
                    </div>
                    <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-teal-700 rounded-full transition-all duration-500"
                        style={{ width: `${percent}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-xs text-slate-400">Aún no hay casos registrados.</p>
          )}
        </div>

        {/* Mapa de calor semanal */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 flex flex-col justify-between">
          <div>
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2 mb-5">
              <Calendar className="w-4 h-4 text-teal-700" />
              Mapa de calor semanal (Lunes a Viernes)
            </h3>
            <div className="grid grid-cols-5 gap-2.5">
              {schoolDays.map((day) => {
                const intensity = day.count / maxDayCount;
                const bgClass =
                  day.count === 0
                    ? 'bg-slate-100 text-slate-500 border-slate-200'
                    : intensity > 0.7
                      ? 'bg-teal-800 text-white border-teal-900'
                      : intensity > 0.35
                        ? 'bg-teal-200 text-teal-950 border-teal-300'
                        : 'bg-teal-50 text-teal-900 border-teal-200';
                return (
                  <div
                    key={day.label}
                    className={`rounded-xl border p-3.5 text-center transition ${bgClass}`}
                  >
                    <span className="block text-xs font-semibold">{day.label}</span>
                    <span className="block text-xl font-bold tabular-nums mt-1.5">
                      {day.count}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="mt-6 pt-4 border-t border-slate-100 flex items-start gap-2.5">
            <Lightbulb className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <p className="text-xs text-slate-700 leading-relaxed">
              <strong className="text-slate-900">Acción recomendada:</strong>{' '}
              {getPreventiveTip()}
            </p>
          </div>
        </div>

        {/* Espacios donde ocurren conflictos */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200">
          <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2 mb-5">
            <MapPin className="w-4 h-4 text-teal-700" />
            Espacios con mayor incidencia
          </h3>
          {stats.by_space.length > 0 ? (
            <div className="space-y-3">
              {stats.by_space.map((item) => {
                const percent = total > 0 ? Math.round((item.count / total) * 100) : 0;
                return (
                  <div
                    key={item.space_tag}
                    className="flex items-center justify-between py-2 border-b border-slate-100 last:border-b-0 text-xs"
                  >
                    <span className="font-medium text-slate-700">{item.space_tag}</span>
                    <span className="font-mono tabular-nums text-slate-600">
                      {item.count} reportes · {percent}%
                    </span>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-xs text-slate-400">Sin datos de espacios todavía.</p>
          )}
        </div>

        {/* Termómetro emocional diario */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200">
          <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2 mb-5">
            <Smile className="w-4 h-4 text-teal-700" />
            Termómetro emocional del colegio
          </h3>
          {stats.mood_summary.length > 0 ? (
            <div className="space-y-3">
              {stats.mood_summary.map((item) => {
                const pct =
                  stats.total_mood_checkins > 0
                    ? Math.round((item.count / stats.total_mood_checkins) * 100)
                    : 0;
                return (
                  <div key={item.mood}>
                    <div className="flex justify-between text-xs text-slate-700 mb-1">
                      <span className="font-medium">{MOOD_LABELS[item.mood]}</span>
                      <span className="font-mono tabular-nums text-slate-600">
                        {item.count} · {pct}%
                      </span>
                    </div>
                    <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${
                          item.mood === 'en_alerta'
                            ? 'bg-rose-600'
                            : item.mood === 'excluido' || item.mood === 'triste'
                              ? 'bg-amber-500'
                              : item.mood === 'preocupado'
                                ? 'bg-sky-500'
                                : 'bg-emerald-600'
                        }`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-xs text-slate-400">
              Aún no hay registros en el termómetro emocional.
            </p>
          )}
        </div>

        {/* Interés preventivo en Espacio Inspira (Zero-PII por tema) */}
        <div className="lg:col-span-2 bg-white p-6 rounded-2xl border border-slate-200">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-teal-700" />
              Interés preventivo en Espacio Inspira (Zero-PII)
            </h3>
            <span className="text-xs font-mono text-slate-500 tabular-nums">
              {stats.inspira_views_total ?? 0} consultas agregadas por tema
            </span>
          </div>

          {stats.by_inspira_topic && stats.by_inspira_topic.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {stats.by_inspira_topic.map((item) => {
                const totalViews = stats.inspira_views_total || 1;
                const pct = Math.round((item.count / totalViews) * 100);
                return (
                  <div key={item.topic} className="p-3.5 rounded-xl bg-slate-50 border border-slate-200">
                    <div className="flex justify-between text-xs text-slate-700 mb-1.5">
                      <span className="font-semibold">
                        {INSPIRA_TOPIC_LABELS[item.topic] || item.topic}
                      </span>
                      <span className="font-mono tabular-nums text-slate-900">
                        {item.count} · {pct}%
                      </span>
                    </div>
                    <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-teal-700 rounded-full transition-all duration-500"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-xs text-slate-400">
              Aún no se registran lecturas en Espacio Inspira para este colegio.
            </p>
          )}
          <p className="text-[11px] text-slate-500 mt-4">
            Analítica ética agregada: solo mide qué temáticas preventivas buscan los estudiantes para orientar talleres de tutoría, sin registrar identidad ni historial individual.
          </p>
        </div>

        {/* Radar Preventivo Ambiental (Espacio × Horario) */}
        <div className="lg:col-span-2 bg-white p-6 rounded-2xl border border-slate-200">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Compass className="w-4 h-4 text-teal-700" />
              Radar Preventivo Ambiental (Espacio × Horario)
            </h3>
            <span className="text-[11px] text-slate-500">
              Para reforzar cuidado y presencia adulta preventiva sin exponer identidades
            </span>
          </div>

          {stats.by_space_time && stats.by_space_time.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {stats.by_space_time.map((cell) => {
                const hasCritical = (cell.critical_count ?? 0) > 0;
                return (
                  <div
                    key={`${cell.space_tag}-${cell.time_slot}`}
                    className={`p-3.5 rounded-xl border flex items-center justify-between gap-3 ${
                      hasCritical
                        ? 'bg-rose-50/70 border-rose-200'
                        : 'bg-slate-50 border-slate-200'
                    }`}
                  >
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-slate-900 truncate">
                        {cell.space_tag}
                      </p>
                      <p className="text-[11px] text-slate-600 truncate mt-0.5">
                        {cell.time_slot}
                      </p>
                    </div>
                    <div className="text-right shrink-0 tabular-nums">
                      <span className="block text-sm font-extrabold text-slate-900">
                        {cell.count}
                      </span>
                      {hasCritical && (
                        <span className="block text-[10px] font-bold text-rose-700">
                          {cell.critical_count} crítico(s)
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-xs text-slate-400">
              Aún no hay suficientes combinaciones de espacio y horario registradas.
            </p>
          )}
        </div>

        {/* Distribución por Ciclo / Nivel (Zero-PII) */}
        <div className="lg:col-span-2 bg-white p-6 rounded-2xl border border-slate-200">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Users className="w-4 h-4 text-teal-700" />
              Distribución por Ciclo / Nivel (Zero-PII)
            </h3>
            <span className="text-[11px] text-slate-500">
              Orientación para talleres preventivos por etapa escolar
            </span>
          </div>

          {stats.by_grade_band && stats.by_grade_band.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {stats.by_grade_band.map((item) => {
                const pct = total > 0 ? Math.round((item.count / total) * 100) : 0;
                return (
                  <div
                    key={item.grade_band}
                    className="p-3.5 rounded-xl bg-slate-50 border border-slate-200"
                  >
                    <div className="flex justify-between text-xs text-slate-700 mb-1.5">
                      <span className="font-semibold">{item.grade_band}</span>
                      <span className="font-mono tabular-nums text-slate-900">
                        {item.count} · {pct}%
                      </span>
                    </div>
                    <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-teal-700 rounded-full transition-all duration-500"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-xs text-slate-400">
              Los estudiantes aún no han seleccionado su ciclo aproximado en nuevos reportes.
            </p>
          )}
        </div>

        {/* Tipificación de cierres */}
        {stats.by_outcome && stats.by_outcome.length > 0 && (
          <div className="lg:col-span-2 bg-white p-6 rounded-2xl border border-slate-200">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2 mb-4">
              <CheckCircle2 className="w-4 h-4 text-emerald-700" />
              Resultados de cierre registrados
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {stats.by_outcome.map((item) => (
                <div
                  key={item.outcome}
                  className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between gap-2 text-xs"
                >
                  <span className="font-medium text-slate-700">
                    {OUTCOME_LABELS[item.outcome] || item.outcome}
                  </span>
                  <span className="font-mono font-bold text-slate-900 tabular-nums">
                    {item.count}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
