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
    // Initial sync
    const darkNow = applyTheme(themeMode);
    setIsDark(darkNow);

    // Listen to system dark mode changes
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
        className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-medium transition-all ${
          isDark
            ? 'bg-slate-800/90 text-teal-300 hover:bg-slate-700/90 border border-slate-700/80'
            : 'bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-200'
        } ${className}`}
        title={isDark ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro premium'}
        aria-label={isDark ? 'Activar modo claro' : 'Activar modo oscuro'}
      >
        {isDark ? (
          <>
            <Moon className="w-3.5 h-3.5 text-teal-400" />
            <span>Modo Noche</span>
          </>
        ) : (
          <>
            <Sun className="w-3.5 h-3.5 text-amber-500" />
            <span>Modo Día</span>
          </>
        )}
      </button>
    );
  }

  // Floating variant: subtle, modern, non-obtrusive
  return (
    <div
      className={`fixed bottom-5 right-5 sm:bottom-6 sm:right-6 z-40 print:hidden ${className}`}
    >
      <button
        type="button"
        onClick={handleToggle}
        className="group relative flex items-center gap-2 px-3.5 py-2.5 rounded-full shadow-lg transition-all duration-300 active:scale-95 bg-white/90 dark:bg-slate-900/95 backdrop-blur-md border border-slate-200/90 dark:border-slate-800 text-slate-700 dark:text-slate-200 hover:border-teal-500/50 dark:hover:border-teal-400/50 hover:shadow-teal-500/10 dark:hover:shadow-teal-500/20"
        title={isDark ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro premium'}
        aria-label={isDark ? 'Activar modo claro' : 'Activar modo oscuro'}
      >
        <div className="relative w-4 h-4 flex items-center justify-center">
          {isDark ? (
            <Moon className="w-4 h-4 text-teal-400 transition-transform duration-300 group-hover:rotate-12" />
          ) : (
            <Sun className="w-4 h-4 text-amber-500 transition-transform duration-300 group-hover:rotate-45" />
          )}
        </div>
        <span className="text-xs font-semibold select-none hidden xs:inline tracking-tight text-slate-600 dark:text-slate-300">
          {isDark ? 'Noche' : 'Día'}
        </span>
      </button>
    </div>
  );
}
