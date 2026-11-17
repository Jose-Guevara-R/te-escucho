import React, { useEffect, useState } from 'react';
import { PhoneCall, ShieldAlert, Heart, Wind, X, ExternalLink, Building2 } from 'lucide-react';
import type { EmergencyLineConfig } from '../types';

interface EmergencyHelpModalProps {
  open: boolean;
  onClose: () => void;
  lines?: EmergencyLineConfig[];
  internalPhone?: string;
  schoolName?: string;
}

const DEFAULT_LINES: EmergencyLineConfig[] = [
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
];

export const EmergencyHelpModal: React.FC<EmergencyHelpModalProps> = ({
  open,
  onClose,
  lines,
  internalPhone,
  schoolName,
}) => {
  const [breathingActive, setBreathingActive] = useState(false);
  const [phaseIndex, setPhaseIndex] = useState(0);
  const [fallbackLines, setFallbackLines] = useState<EmergencyLineConfig[]>(DEFAULT_LINES);

  const phases = [
    { label: 'Inhala despacio por la nariz', seconds: 4 },
    { label: 'Sostén el aire suavemente', seconds: 4 },
    { label: 'Exhala lento por la boca', seconds: 4 },
  ];

  useEffect(() => {
    if (lines && lines.length > 0) return;
    let active = true;
    fetch('/api/platform/emergency-defaults')
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { lines?: EmergencyLineConfig[] } | null) => {
        if (active && data?.lines && data.lines.length > 0) {
          setFallbackLines(data.lines);
        }
      })
      .catch(() => {
        // Keep bundled defaults offline
      });
    return () => {
      active = false;
    };
  }, [lines]);

  useEffect(() => {
    if (!breathingActive || !open) return;
    const interval = setInterval(() => {
      setPhaseIndex((prev) => (prev + 1) % phases.length);
    }, 4000);
    return () => clearInterval(interval);
  }, [breathingActive, open, phases.length]);

  if (!open) return null;

  const displayedLines = (lines && lines.length > 0 ? lines : fallbackLines).filter((l) => l.active);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/50 backdrop-blur-sm p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="sos-title"
    >
      <div className="w-full sm:max-w-lg max-h-[90vh] overflow-y-auto rounded-t-3xl sm:rounded-2xl bg-white border border-slate-200 shadow-2xl p-6 text-slate-800">
        <div className="flex items-start justify-between gap-4 pb-4 border-b border-slate-100">
          <div>
            <p className="text-xs font-semibold text-rose-700 flex items-center gap-1.5">
              <PhoneCall className="w-3.5 h-3.5" />
              Apoyo y Líneas de Emergencia
            </p>
            <h2 id="sos-title" className="text-xl font-bold text-slate-900 mt-1">
              No estás solo. Aquí tienes ayuda inmediata.
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition"
            aria-label="Cerrar ayuda inmediata"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {internalPhone && internalPhone.trim() !== '' && (
          <div className="mt-4">
            <a
              href={`tel:${internalPhone.replace(/\s+/g, '')}`}
              className="flex items-center justify-between p-3.5 rounded-xl border border-teal-200 bg-teal-50/70 hover:bg-teal-50 transition min-h-[56px]"
            >
              <div className="min-w-0">
                <p className="text-sm font-bold text-teal-950 flex items-center gap-1.5 truncate">
                  <Building2 className="w-4 h-4 text-teal-700 shrink-0" />
                  <span>Psicopedagogía {schoolName ? `· ${schoolName}` : 'del colegio'}</span>
                </p>
                <p className="text-xs text-teal-800 font-mono tabular-nums mt-0.5">
                  Teléfono directo: {internalPhone}
                </p>
              </div>
              <PhoneCall className="w-4 h-4 text-teal-700 shrink-0" />
            </a>
          </div>
        )}

        {/* Líneas de emergencia */}
        <div className="mt-5 space-y-2.5">
          <h3 className="text-xs font-semibold text-slate-500">Canales oficiales gratuitos</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {displayedLines.map((line) => {
              const styleClass =
                line.highlight === 'rose'
                  ? 'border-rose-200 bg-rose-50/70 hover:bg-rose-50 text-rose-900'
                  : line.highlight === 'teal'
                    ? 'border-teal-200 bg-teal-50/60 hover:bg-teal-50 text-teal-900'
                    : 'border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-900';

              const subtitleClass =
                line.highlight === 'rose'
                  ? 'text-rose-700'
                  : line.highlight === 'teal'
                    ? 'text-teal-700'
                    : 'text-slate-600';

              const cleanValue = line.contact_value.trim();
              const safeUrl =
                line.type === 'url' &&
                (/^https?:\/\//i.test(cleanValue) ? cleanValue : null);
              const safeTel =
                line.type === 'tel'
                  ? `tel:${cleanValue.replace(/[^0-9+*#()-]/g, '')}`
                  : null;
              const href = line.type === 'url' ? safeUrl || '#' : safeTel || '#';
              const isSafeLink = Boolean(line.type === 'url' ? safeUrl : safeTel && cleanValue);

              if (!isSafeLink) return null;

              return (
                <a
                  key={line.id}
                  href={href}
                  target={line.type === 'url' ? '_blank' : undefined}
                  rel={line.type === 'url' ? 'noopener noreferrer' : undefined}
                  className={`flex items-center justify-between p-3.5 rounded-xl border transition min-h-[56px] ${styleClass}`}
                >
                  <div className="min-w-0 pr-2">
                    <p className="text-sm font-bold truncate">{line.name}</p>
                    <p className={`text-xs truncate ${subtitleClass}`}>{line.subtitle}</p>
                  </div>
                  {line.type === 'url' ? (
                    <ExternalLink className={`w-4 h-4 shrink-0 ${subtitleClass}`} />
                  ) : (
                    <PhoneCall className={`w-4 h-4 shrink-0 ${subtitleClass}`} />
                  )}
                </a>
              );
            })}
          </div>
        </div>

        {/* Primeros auxilios emocionales */}
        <div className="mt-6 p-4 rounded-2xl bg-sky-50/70 border border-sky-200">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Wind className="w-4 h-4 text-sky-700 shrink-0" />
              <h3 className="text-sm font-bold text-slate-900">Primeros auxilios emocionales</h3>
            </div>
            <button
              type="button"
              onClick={() => {
                setPhaseIndex(0);
                setBreathingActive((prev) => !prev);
              }}
              className="px-3 py-1.5 rounded-lg bg-white border border-sky-200 text-xs font-semibold text-sky-800 hover:bg-sky-100 transition whitespace-nowrap"
            >
              {breathingActive ? 'Detener guía' : 'Respirar 4-4-4'}
            </button>
          </div>
          {breathingActive ? (
            <div className="mt-3 p-3 rounded-xl bg-white border border-sky-100 text-center">
              <p className="text-sm font-bold text-teal-800">{phases[phaseIndex].label}</p>
              <p className="text-xs text-slate-500 mt-1 tabular-nums">
                Ritmo calmado de {phases[phaseIndex].seconds} segundos
              </p>
            </div>
          ) : (
            <p className="mt-2 text-xs text-slate-600 leading-relaxed">
              Si sientes el corazón acelerado o mucho miedo: aléjate a un lugar con adultos de confianza, toma 3 respiraciones lentas y recuerda que lo que pasa no es tu culpa.
            </p>
          )}
        </div>

        {/* Guía rápida ante ciberacoso */}
        <div className="mt-5">
          <h3 className="text-xs font-semibold text-slate-500 flex items-center gap-1.5 mb-2.5">
            <ShieldAlert className="w-3.5 h-3.5 text-amber-600" />
            Qué hacer si sufres ciberacoso
          </h3>
          <ul className="space-y-2 text-xs text-slate-700 leading-relaxed">
            <li className="flex items-start gap-2">
              <span className="font-mono font-bold text-teal-700">01.</span>
              <span><strong>No respondas</strong> ni entres en discusiones con quien te ataca; buscan provocar una reacción.</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="font-mono font-bold text-teal-700">02.</span>
              <span><strong>Guarda capturas de pantalla</strong> de mensajes, audios o perfiles antes de bloquear.</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="font-mono font-bold text-teal-700">03.</span>
              <span><strong>Bloquea y silencia</strong> la cuenta agresora y cuéntanoslo aquí de forma anónima para ayudarte.</span>
            </li>
          </ul>
        </div>

        <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between gap-3">
          <span className="text-xs text-slate-500 flex items-center gap-1.5">
            <Heart className="w-3.5 h-3.5 text-teal-700" />
            Tu bienestar importa
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold transition"
          >
            Volver al portal
          </button>
        </div>
      </div>
    </div>
  );
};
