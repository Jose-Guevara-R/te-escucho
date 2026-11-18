import React, { useState } from 'react';
import { ArrowLeft, Loader2, Lock, ShieldCheck } from 'lucide-react';
import type { CounselorProfile } from '../types';
import { TeEscuchoLogo } from './TeEscuchoLogo';

interface CounselorLoginProps {
  onBack: () => void;
  onSuccess: (token: string, counselor: CounselorProfile) => void;
  onOpenAdmin?: () => void;
}

export const CounselorLogin: React.FC<CounselorLoginProps> = ({
  onBack,
  onSuccess,
  onOpenAdmin,
}) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const performLogin = async (loginEmail: string, loginPassword: string) => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await fetch('/api/counselor/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: loginEmail, password: loginPassword }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Credenciales institucionales incorrectas.');
      }
      onSuccess(data.token, data.counselor);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'No se pudo iniciar sesión.');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void performLogin(email, password);
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-sky-50/70 via-slate-50 to-emerald-50/40 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-3xl border border-slate-200 p-6 sm:p-8 shadow-sm">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-900 mb-5 min-h-[44px]"
        >
          <ArrowLeft className="w-4 h-4" />
          Volver al portal estudiante
        </button>

        <div className="flex items-center gap-3 mb-2">
          <TeEscuchoLogo size={42} animated={false} className="shrink-0" />
          <div>
            <h1 className="text-xl font-bold text-slate-900">Acceso Institucional</h1>
            <p className="text-xs text-slate-500">Oficina de Tutoría (TOE) y Convivencia Escolar</p>
          </div>
        </div>

        {errorMsg && (
          <div className="mt-4 p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800">
            {errorMsg}
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div>
            <label
              htmlFor="counselor-email"
              className="block text-xs font-semibold text-slate-700 mb-1.5"
            >
              Correo institucional
            </label>
            <input
              id="counselor-email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="correo@colegio.edu"
              className="w-full min-h-[46px] bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-600 focus:bg-white"
            />
          </div>

          <div>
            <label
              htmlFor="counselor-password"
              className="block text-xs font-semibold text-slate-700 mb-1.5"
            >
              Contraseña
            </label>
            <input
              id="counselor-password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full min-h-[46px] bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-600 focus:bg-white"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full min-h-[48px] bg-teal-700 hover:bg-teal-800 disabled:opacity-60 text-white font-semibold py-3 rounded-xl text-sm transition flex items-center justify-center gap-2"
          >
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <>
                <Lock className="w-4 h-4" />
                <span>Ingresar al Panel</span>
              </>
            )}
          </button>
        </form>

        <div className="mt-5 pt-5 border-t border-slate-100 space-y-3">
          <p className="text-[11px] text-slate-400 flex items-center justify-center gap-1.5 text-center">
            <ShieldCheck className="w-3.5 h-3.5 text-teal-700 shrink-0" />
            Cada orientador(a) accede únicamente a los casos de su institución y turno escolar.
          </p>
          {onOpenAdmin && (
            <div className="pt-2 text-center">
              <button
                type="button"
                onClick={onOpenAdmin}
                className="text-xs font-medium text-slate-500 hover:text-slate-900 underline underline-offset-4"
              >
                ¿Eres el Encargado de la App? Consola de Plataforma
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
