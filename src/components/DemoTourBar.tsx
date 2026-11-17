import React, { useEffect, useRef, useState } from 'react';
import { Clock, LogOut } from 'lucide-react';
import type { DemoPolicy } from '../types';

export interface DemoCapabilities {
  demoPolicy: DemoPolicy;
  demoDurationMinutes: number;
  demoMaxUses: number;
}

export interface DemoQuotaState {
  uses: number;
  activeToken?: string;
  expiresAt?: number;
}

export type DemoRoleTarget =
  | 'student'
  | 'counselor_psy'
  | 'counselor_admin'
  | 'platform_admin';

export const DEMO_STORAGE_KEY = 'te_escucho_demo_quota_v1';

export function getDemoQuotaState(): DemoQuotaState {
  if (typeof window === 'undefined') return { uses: 0 };
  try {
    const raw = window.localStorage.getItem(DEMO_STORAGE_KEY);
    if (!raw) return { uses: 0 };
    const parsed = JSON.parse(raw) as Partial<DemoQuotaState>;
    const uses = typeof parsed.uses === 'number' && parsed.uses >= 0 ? Math.floor(parsed.uses) : 0;
    const activeToken =
      typeof parsed.activeToken === 'string' && parsed.activeToken ? parsed.activeToken : undefined;
    const expiresAt = typeof parsed.expiresAt === 'number' ? parsed.expiresAt : undefined;
    if (activeToken && expiresAt && expiresAt > Date.now()) {
      return { uses, activeToken, expiresAt };
    }
    if (activeToken || expiresAt) {
      const cleaned: DemoQuotaState = { uses };
      window.localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(cleaned));
      return cleaned;
    }
    return { uses };
  } catch {
    return { uses: 0 };
  }
}

export function saveDemoQuotaUse(token: string, expiresAt: number): DemoQuotaState {
  const prev = getDemoQuotaState();
  const next: DemoQuotaState = {
    uses: prev.uses + 1,
    activeToken: token,
    expiresAt,
  };
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(next));
  }
  return next;
}

export function clearActiveDemoPass(): DemoQuotaState {
  const prev = getDemoQuotaState();
  const next: DemoQuotaState = { uses: prev.uses };
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(next));
  }
  return next;
}

export function resetDemoQuotaUses(): void {
  if (typeof window !== 'undefined') {
    window.localStorage.removeItem(DEMO_STORAGE_KEY);
  }
}

interface DemoTourBarProps {
  usesUsed: number;
  maxUses: number;
  expiresAt: number;
  activeRole: DemoRoleTarget;
  switchingRole: DemoRoleTarget | null;
  onSwitchRole: (role: DemoRoleTarget) => void;
  onEndDemo: () => void;
  onExpireDemo: () => void;
}

const ROLE_SWITCHES: Array<{ id: DemoRoleTarget; label: string }> = [
  { id: 'student', label: 'Estudiante' },
  { id: 'counselor_psy', label: 'Psicología' },
  { id: 'counselor_admin', label: 'Mi Colegio' },
  { id: 'platform_admin', label: 'Super Admin' },
];

function formatCountdown(msRemaining: number): string {
  const totalSeconds = Math.max(0, Math.floor(msRemaining / 1000));
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export const DemoTourBar: React.FC<DemoTourBarProps> = ({
  usesUsed,
  maxUses,
  expiresAt,
  activeRole,
  switchingRole,
  onSwitchRole,
  onEndDemo,
  onExpireDemo,
}) => {
  const [msLeft, setMsLeft] = useState<number>(() => Math.max(0, expiresAt - Date.now()));
  const expiredTriggeredRef = useRef(false);

  useEffect(() => {
    expiredTriggeredRef.current = false;
    const sync = () => {
      const next = Math.max(0, expiresAt - Date.now());
      setMsLeft(next);
      if (next <= 0 && !expiredTriggeredRef.current) {
        expiredTriggeredRef.current = true;
        onExpireDemo();
      }
    };
    sync();
    const timer = window.setInterval(sync, 1000);
    return () => window.clearInterval(timer);
  }, [expiresAt, onExpireDemo]);

  const urgent = msLeft > 0 && msLeft < 120_000;

  return (
    <div
      className="print:hidden w-full bg-slate-900 text-slate-100 border-b border-slate-800"
      role="region"
      aria-label="Barra de evaluación guiada"
    >
      <div className="max-w-7xl mx-auto px-3 sm:px-6 py-2 flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex items-center gap-3 text-xs shrink-0">
          <span className="font-semibold text-white whitespace-nowrap">
            Demo guiada <span className="text-slate-400 font-normal">· Pase {usesUsed} de {maxUses}</span>
          </span>
          <span className="text-slate-600" aria-hidden="true">
            |
          </span>
          <span
            className={`inline-flex items-center gap-1.5 font-mono tabular-nums font-semibold whitespace-nowrap ${
              urgent ? 'text-amber-300' : 'text-teal-300'
            }`}
          >
            <Clock className="w-3.5 h-3.5 shrink-0" />
            <span>{formatCountdown(msLeft)}</span>
          </span>
        </div>

        <div className="flex items-center gap-1 overflow-x-auto max-w-full">
          {ROLE_SWITCHES.map((item) => {
            const isActive = activeRole === item.id;
            const isLoading = switchingRole === item.id;
            return (
              <button
                key={item.id}
                type="button"
                disabled={switchingRole !== null}
                onClick={() => onSwitchRole(item.id)}
                className={`min-h-[34px] px-2.5 py-1 rounded-lg text-xs font-medium transition whitespace-nowrap shrink-0 ${
                  isActive
                    ? 'bg-teal-600 text-white'
                    : 'text-slate-300 hover:text-white hover:bg-slate-800 disabled:opacity-60'
                }`}
              >
                {isLoading ? 'Abriendo...' : item.label}
              </button>
            );
          })}

          <button
            type="button"
            onClick={onEndDemo}
            className="ml-1 min-h-[34px] inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold text-rose-300 hover:text-white hover:bg-rose-600/25 transition whitespace-nowrap shrink-0"
          >
            <LogOut className="w-3.5 h-3.5 shrink-0" />
            <span>Finalizar</span>
          </button>
        </div>
      </div>
    </div>
  );
};
