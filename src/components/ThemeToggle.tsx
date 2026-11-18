import React, { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';
import { applyTheme, getStoredTheme, getSystemTheme, setStoredTheme, type ThemeMode } from '../utils/theme';

interface ThemeToggleProps {
  variant?: 'floating' | 'inline';
  className?: string;
}

export function ThemeToggle({ variant = 'floating', className = '' }: ThemeToggleProps) {
  const [themeMode, setThemeMode] = useState<ThemeMode>(getStoredTheme);
  const [isDark, setIsDark] = useState<boolean>(() => {
    const current = getStoredTheme();
    return current === 'dark' || (current === 'system' && getSystemTheme() === 'dark');
  });

  useEffect(() => {
    const darkNow = applyTheme(themeMode);
    setIsDark(darkNow);

    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const handleSystemChange = () => {
      const stored = getStoredTheme();
      if (stored === 'system') {
        const d = applyTheme('system');
        setIsDark(d);
      }
    };
    media.addEventListener('change', handleSystemChange);
    return () => media.removeEventListener('change', handleSystemChange);
  }, [themeMode]);

  const handleToggle = () => {
    const nextMode: ThemeMode = isDark ? 'light' : 'dark';
    setStoredTheme(nextMode);
    setThemeMode(nextMode);
    setIsDark(!isDark);
  };

  if (variant === 'inline') {
    return (
      <button
        type="button"
        onClick={handleToggle}
        className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
          isDark
            ? 'bg-slate-800 text-teal-300 hover:bg-slate-700 border border-slate-700'
            : 'bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-200'
        } ${className}`}
        title={isDark ? 'Cambiar a modo día' : 'Cambiar a modo noche'}
        aria-label={isDark ? 'Activar modo día' : 'Activar modo noche'}
      >
        {isDark ? (
          <>
            <Sun className="w-3.5 h-3.5 text-amber-400" />
            <span>Modo Día</span>
          </>
        ) : (
          <>
            <Moon className="w-3.5 h-3.5 text-teal-600" />
            <span>Modo Noche</span>
          </>
        )}
      </button>
    );
  }

  return (
    <div className={`fixed bottom-5 right-5 sm:bottom-6 sm:right-6 z-40 print:hidden ${className}`}>
      <button
        type="button"
        onClick={handleToggle}
        className="group flex items-center gap-2.5 px-4 py-2.5 rounded-full shadow-2xl transition-all duration-300 active:scale-95 bg-white/95 dark:bg-[#0f172a]/95 backdrop-blur-md border border-slate-200 dark:border-slate-700/80 text-slate-700 dark:text-slate-100 hover:border-teal-500/50 dark:hover:border-teal-400/50"
        title={isDark ? 'Cambiar a modo día' : 'Cambiar a modo noche'}
        aria-label={isDark ? 'Activar modo día' : 'Activar modo noche'}
      >
        <div className="relative w-4 h-4 flex items-center justify-center">
          {isDark ? (
            <Sun className="w-4 h-4 text-amber-400 transition-transform duration-300 group-hover:rotate-90" />
          ) : (
            <Moon className="w-4 h-4 text-teal-600 transition-transform duration-300 group-hover:-rotate-12" />
          )}
        </div>
        <span className="text-xs font-semibold tracking-tight text-slate-700 dark:text-slate-200">
          {isDark ? 'Modo Día' : 'Modo Noche'}
        </span>
      </button>
    </div>
  );
}
