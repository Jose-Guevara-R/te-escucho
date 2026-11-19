import React, { useEffect } from 'react';
import { ArrowRight, ShieldCheck } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import { TeEscuchoLogo } from './TeEscuchoLogo';

interface SplashIntroProps {
  onComplete: () => void;
  durationMs?: number;
}

export const SplashIntro: React.FC<SplashIntroProps> = ({
  onComplete,
  durationMs = 4800,
}) => {
  const prefersReducedMotion = useReducedMotion();
  const effectiveDuration = prefersReducedMotion ? 1600 : durationMs;

  useEffect(() => {
    const timer = window.setTimeout(() => {
      onComplete();
    }, effectiveDuration);

    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') {
        onComplete();
      }
    };
    window.addEventListener('keydown', handleKey);

    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('keydown', handleKey);
    };
  }, [effectiveDuration, onComplete]);

  return (
    <motion.div
      role="dialog"
      aria-modal="true"
      aria-label="Bienvenida a Te Escucho"
      initial={{ opacity: 1 }}
      exit={{ opacity: 0, scale: prefersReducedMotion ? 1 : 1.02 }}
      transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
      className="fixed inset-0 z-50 bg-[#051B1E] text-white flex flex-col justify-between overflow-y-auto overflow-x-hidden select-none"
    >
      {/* Harmonized App-Aligned Ambient Gradient Pools (Teal Sanctuary, Sky Trust, Emerald Care) */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
        <div
          className="absolute -top-32 left-1/2 -translate-x-1/2 w-[680px] h-[440px] rounded-full opacity-35 blur-3xl"
          style={{
            background:
              'radial-gradient(circle, rgba(13,148,136,0.55) 0%, rgba(2,132,199,0.22) 52%, rgba(5,27,30,0) 78%)',
          }}
        />
        <div
          className="absolute -bottom-40 left-1/2 -translate-x-1/2 w-[620px] h-[380px] rounded-full opacity-30 blur-3xl"
          style={{
            background:
              'radial-gradient(circle, rgba(16,185,129,0.42) 0%, rgba(15,118,110,0.2) 55%, rgba(5,27,30,0) 80%)',
          }}
        />
      </div>

      {/* Top Row: Quiet Trust Marker & Immediate Skip Action */}
      <header className="relative z-10 max-w-5xl w-full mx-auto px-6 pt-4 sm:pt-6 flex items-center justify-between gap-4 shrink-0">
        <div className="inline-flex items-center gap-2 text-xs font-medium text-teal-200/90">
          <ShieldCheck className="w-4 h-4 text-emerald-300 shrink-0" />
          <span className="whitespace-nowrap">Entorno Escolar Protegido</span>
        </div>

        <button
          type="button"
          onClick={onComplete}
          className="text-xs font-medium text-slate-300 hover:text-white underline underline-offset-4 transition whitespace-nowrap shrink-0 min-h-[40px] px-2"
        >
          Saltar intro
        </button>
      </header>

      {/* Center Stage: Custom Logo + Brand Identity + Primary Action */}
      <main className="relative z-10 max-w-3xl w-full mx-auto px-6 py-4 flex-1 flex flex-col items-center justify-center text-center">
        {/* Animated Concentric Listening Aura around Logo */}
        <div className="relative flex items-center justify-center mb-4 sm:mb-5">
          {!prefersReducedMotion && (
            <>
              <motion.div
                aria-hidden="true"
                initial={{ opacity: 0, scale: 0.72 }}
                animate={{ opacity: [0.15, 0.4, 0.15], scale: [0.92, 1.14, 0.92] }}
                transition={{ duration: 3.4, repeat: Infinity, ease: 'easeInOut' }}
                className="absolute w-36 h-36 sm:w-40 sm:h-40 rounded-full border border-sky-400/25"
              />
              <motion.div
                aria-hidden="true"
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: [0.22, 0.08, 0.22], scale: [1.02, 1.26, 1.02] }}
                transition={{ duration: 3.4, repeat: Infinity, ease: 'easeInOut', delay: 0.4 }}
                className="absolute w-44 h-44 sm:w-48 sm:h-48 rounded-full border border-emerald-400/15"
              />
            </>
          )}

          <motion.div
            initial={prefersReducedMotion ? false : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
            className="relative drop-shadow-[0_18px_36px_rgba(13,148,136,0.35)]"
          >
            <TeEscuchoLogo size={112} animated />
          </motion.div>
        </div>

        {/* Display Brand Wordmark */}
        <motion.h1
          initial={prefersReducedMotion ? false : { opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
          className="text-4xl sm:text-6xl font-extrabold tracking-tight text-white text-balance"
        >
          Te Escucho
        </motion.h1>

        {/* Functional Value Proposition */}
        <motion.p
          initial={prefersReducedMotion ? false : { opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, delay: 0.35, ease: [0.16, 1, 0.3, 1] }}
          className="mt-3 text-base sm:text-lg text-slate-200 max-w-xl leading-relaxed text-balance"
        >
          Prevención del acoso escolar y acompañamiento emocional confidencial, sin exponer jamás tu identidad.
        </motion.p>

        {/* Clean Unboxed Functional Pillars */}
        <motion.div
          initial={prefersReducedMotion ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.5 }}
          className="mt-3.5 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-xs sm:text-sm text-sky-200/90 font-medium"
        >
          <span>Anonimato Zero-PII</span>
          <span aria-hidden="true" className="text-teal-500">
            ·
          </span>
          <span>Chat Seguro en Tiempo Real</span>
          <span aria-hidden="true" className="text-teal-500">
            ·
          </span>
          <span>Triaje Preventivo IA</span>
        </motion.div>

        {/* Single Primary Action */}
        <motion.div
          initial={prefersReducedMotion ? false : { opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.65, ease: [0.16, 1, 0.3, 1] }}
          className="mt-6"
        >
          <button
            type="button"
            onClick={onComplete}
            className="inline-flex items-center gap-2.5 px-6 py-3 rounded-xl bg-teal-400 hover:bg-teal-300 text-slate-950 font-bold text-sm transition whitespace-nowrap shrink-0 min-h-[44px] shadow-lg shadow-teal-950/40"
          >
            <span>Ingresar a Te Escucho</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </motion.div>
      </main>

      {/* Bottom Zone: Progress Bar followed by Signature Creator Attribution */}
      <footer className="relative z-10 max-w-md w-full mx-auto px-5 pb-5 sm:pb-6 space-y-3 text-center shrink-0">
        <style dangerouslySetInnerHTML={{ __html: `
          @keyframes teProgressAnim {
            0% { width: 0%; opacity: 0.7; }
            10% { opacity: 1; }
            100% { width: 100%; opacity: 1; }
          }
        ` }} />
        <div className="space-y-1">
          <div className="h-2 w-full bg-slate-900/90 rounded-full overflow-hidden p-[1px] border border-teal-500/40 shadow-inner">
            <div
              className="h-full rounded-full bg-gradient-to-r from-sky-400 via-teal-400 to-emerald-400 shadow-[0_0_12px_rgba(20,184,166,0.9)]"
              style={{
                animation: `teProgressAnim ${effectiveDuration}ms linear forwards`,
              }}
            />
          </div>
          <div className="flex items-center justify-between text-[10px] text-teal-300/80 font-medium px-1">
            <span>Cargando plataforma segura</span>
            <span>MINEDU / D.S. 018-2026</span>
          </div>
        </div>

        {/* Signature Creator Attribution Plaque with Orbiting Light Beam */}
        <motion.div
          initial={prefersReducedMotion ? false : { opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, delay: 0.55, ease: [0.16, 1, 0.3, 1] }}
          className="relative max-w-full rounded-2xl p-[1.5px] bg-teal-400/20 overflow-hidden shadow-[0_12px_40px_rgba(13,148,136,0.2)]"
        >
          {/* Animated Orbiting Perimeter Light Beam */}
          {!prefersReducedMotion && (
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 flex items-center justify-center"
            >
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 4.5, repeat: Infinity, ease: 'linear' }}
                className="w-[620px] h-[620px] shrink-0"
                style={{
                  background:
                    'conic-gradient(from 0deg, transparent 0deg 255deg, rgba(94,234,212,0.25) 285deg, rgba(56,189,248,0.95) 318deg, rgba(253,230,138,1) 340deg, rgba(94,234,212,0.85) 354deg, transparent 360deg)',
                }}
              />
            </div>
          )}

          {/* Inner Plaque Surface */}
          <div className="relative rounded-[14.5px] bg-[#062023]/95 backdrop-blur-md px-4 sm:px-7 py-3">
            <p className="text-[11px] font-medium text-teal-200/85 tracking-wide">
              Autoría e Innovación Educativa
            </p>
            <p className="mt-1 text-[14px] sm:text-base font-bold tracking-tight text-white whitespace-nowrap">
              Creador: Prof. José R. Guevara Ramos.
            </p>
            <p className="mt-0.5 text-xs font-medium text-amber-300/95 tracking-tight">
              Educ.AI <span aria-hidden="true" className="text-teal-400 mx-0.5">-</span> Transformando la educación con la IA.
            </p>
          </div>
        </motion.div>

        <p className="text-[11px] text-slate-400">
          Bienestar y Convivencia Escolar · Educ.AI
        </p>
      </footer>
    </motion.div>
  );
};
