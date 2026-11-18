export type ThemeMode = 'light' | 'dark' | 'system';

export function getSystemTheme(): 'light' | 'dark' {
  if (typeof window === 'undefined') return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function getStoredTheme(): ThemeMode {
  if (typeof window === 'undefined') return 'system';
  try {
    const stored = window.localStorage.getItem('te_escucho_theme');
    if (stored === 'light' || stored === 'dark' || stored === 'system') {
      return stored;
    }
  } catch {
    // ignore
  }
  return 'system';
}

export function applyTheme(mode: ThemeMode): boolean {
  if (typeof document === 'undefined') return false;
  const isDark = mode === 'dark' || (mode === 'system' && getSystemTheme() === 'dark');
  const root = document.documentElement;
  if (isDark) {
    root.classList.add('dark');
  } else {
    root.classList.remove('dark');
  }
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) {
    meta.setAttribute('content', isDark ? '#0B0F17' : '#0F766E');
  }
  return isDark;
}

export function setStoredTheme(mode: ThemeMode): boolean {
  if (typeof window === 'undefined') return false;
  try {
    window.localStorage.setItem('te_escucho_theme', mode);
  } catch {
    // ignore
  }
  return applyTheme(mode);
}

export function toggleTheme(): ThemeMode {
  const current = getStoredTheme();
  const isCurrentlyDark =
    current === 'dark' || (current === 'system' && getSystemTheme() === 'dark');
  const next: ThemeMode = isCurrentlyDark ? 'light' : 'dark';
  setStoredTheme(next);
  return next;
}

