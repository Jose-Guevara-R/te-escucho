import { useCallback, useEffect, useState } from 'react';
import { AnimatePresence } from 'motion/react';
import { Capacitor } from '@capacitor/core';
import { StatusBar, Style } from '@capacitor/status-bar';
import { AdminConsole } from './components/AdminConsole';
import { AdminLogin } from './components/AdminLogin';
import { CounselorLogin } from './components/CounselorLogin';
import { CounselorPanel } from './components/CounselorPanel';
import {
  clearActiveDemoPass,
  DemoTourBar,
  getDemoQuotaState,
  saveDemoQuotaUse,
  type DemoCapabilities,
  type DemoRoleTarget,
} from './components/DemoTourBar';
import { OfflineIndicator } from './components/OfflineIndicator';
import { SplashIntro } from './components/SplashIntro';
import { StudentPortal } from './components/StudentPortal';
import { ThemeToggle } from './components/ThemeToggle';
import type { CounselorProfile, PlatformAdminProfile } from './types';

type AppMode =
  | 'student'
  | 'counselor_login'
  | 'counselor_panel'
  | 'admin_login'
  | 'admin_console';

const DEFAULT_DEMO_CAPABILITIES: DemoCapabilities = {
  demoPolicy: 'timed',
  demoDurationMinutes: 15,
  demoMaxUses: 3,
};

function getInitialMode(): AppMode {
  if (typeof window !== 'undefined') {
    if (window.location.pathname.startsWith('/admin')) {
      return 'admin_login';
    }
    const params = new URLSearchParams(window.location.search);
    if (params.get('openStaff') === '1' || params.get('staffCase')) {
      return 'counselor_login';
    }
  }
  return 'student';
}

function getInitialStaffCaseId(): string | null {
  if (typeof window === 'undefined') return null;
  const params = new URLSearchParams(window.location.search);
  return params.get('staffCase') || null;
}

function shouldShowInitialSplash(): boolean {
  if (typeof window === 'undefined') return true;
  const params = new URLSearchParams(window.location.search);
  return params.get('skipSplash') !== '1';
}

export default function App() {
  const [showSplash, setShowSplash] = useState<boolean>(shouldShowInitialSplash);
  const [mode, setMode] = useState<AppMode>(getInitialMode);
  const [pendingStaffCaseId, setPendingStaffCaseId] = useState<string | null>(
    getInitialStaffCaseId
  );
  const [counselorToken, setCounselorToken] = useState<string | null>(null);
  const [counselorProfile, setCounselorProfile] = useState<CounselorProfile | null>(null);
  const [isDemoCounselor, setIsDemoCounselor] = useState(false);
  const [counselorInitialTab, setCounselorInitialTab] = useState<'chats' | 'school_settings'>('chats');
  const [adminToken, setAdminToken] = useState<string | null>(null);
  const [adminProfile, setAdminProfile] = useState<PlatformAdminProfile | null>(null);
  const [isDemoAdmin, setIsDemoAdmin] = useState(false);

  // Guided Timed Demo Pass state
  const [demoCapabilities, setDemoCapabilities] = useState<DemoCapabilities>(DEFAULT_DEMO_CAPABILITIES);
  const [demoUsesUsed, setDemoUsesUsed] = useState<number>(() => getDemoQuotaState().uses);
  const [demoPass, setDemoPass] = useState<{ token: string; expiresAt: number } | null>(() => {
    const q = getDemoQuotaState();
    return q.activeToken && q.expiresAt && q.expiresAt > Date.now()
      ? { token: q.activeToken, expiresAt: q.expiresAt }
      : null;
  });
  const [startingDemo, setStartingDemo] = useState(false);
  const [switchingRole, setSwitchingRole] = useState<DemoRoleTarget | null>(null);
  const [demoNotice, setDemoNotice] = useState<string | null>(null);

  const handleSplashComplete = useCallback(() => {
    setShowSplash(false);
  }, []);

  const navigateStudent = useCallback(() => {
    if (typeof window !== 'undefined' && window.location.pathname.startsWith('/admin')) {
      window.history.replaceState({}, '', '/');
    }
    setMode('student');
  }, []);

  useEffect(() => {
    if (Capacitor.isNativePlatform()) {
      StatusBar.setOverlaysWebView({ overlay: false }).catch(() => {});
      StatusBar.setBackgroundColor({ color: '#090E1A' }).catch(() => {});
      StatusBar.setStyle({ style: Style.Dark }).catch(() => {});
    }
  }, []);

  useEffect(() => {
    fetch('/api/platform/capabilities')
      .then((res) => (res.ok ? res.json() : null))
      .then((data: DemoCapabilities | null) => {
        if (!data) return;
        const normalized: DemoCapabilities = {
          demoPolicy: data.demoPolicy === 'off' ? 'off' : 'timed',
          demoDurationMinutes:
            typeof data.demoDurationMinutes === 'number' ? data.demoDurationMinutes : 15,
          demoMaxUses: typeof data.demoMaxUses === 'number' ? data.demoMaxUses : 3,
        };
        setDemoCapabilities(normalized);
        if (normalized.demoPolicy === 'off') {
          clearActiveDemoPass();
          setDemoPass(null);
        }
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
    const onSwMessage = (event: MessageEvent) => {
      const data = event.data as { type?: string; url?: string } | undefined;
      if (!data || data.type !== 'TE_ESCUCHO_OPEN_CASE' || typeof data.url !== 'string') return;
      try {
        const parsed = new URL(data.url, window.location.origin);
        const caseId = parsed.searchParams.get('staffCase');
        if (caseId) {
          setPendingStaffCaseId(caseId);
        }
        if (parsed.searchParams.get('openStaff') === '1' || caseId) {
          setCounselorInitialTab('chats');
          setMode(counselorToken && counselorProfile ? 'counselor_panel' : 'counselor_login');
        }
      } catch {
        // Ignore malformed URL
      }
    };
    navigator.serviceWorker.addEventListener('message', onSwMessage);
    return () => navigator.serviceWorker.removeEventListener('message', onSwMessage);
  }, [counselorToken, counselorProfile]);

  const clearDemoSessions = useCallback(
    (expiredNotice?: string) => {
      clearActiveDemoPass();
      setDemoPass(null);
      setSwitchingRole(null);
      if (isDemoCounselor) {
        setCounselorToken(null);
        setCounselorProfile(null);
        setIsDemoCounselor(false);
      }
      if (isDemoAdmin) {
        setAdminToken(null);
        setAdminProfile(null);
        setIsDemoAdmin(false);
      }
      if (expiredNotice) {
        setDemoNotice(expiredNotice);
      }
      navigateStudent();
    },
    [isDemoCounselor, isDemoAdmin, navigateStudent]
  );

  const handleEndDemo = useCallback(() => {
    clearDemoSessions('Finalizaste tu pase de evaluación guiada.');
  }, [clearDemoSessions]);

  const handleExpireDemo = useCallback(() => {
    clearDemoSessions(
      'Tu pase de demostración guiada ha finalizado. Inicia otro pase disponible o ingresa con el código de tu colegio.'
    );
  }, [clearDemoSessions]);

  const handleStartDemo = async () => {
    if (demoCapabilities.demoPolicy !== 'timed') return;
    if (demoUsesUsed >= demoCapabilities.demoMaxUses) {
      setDemoNotice(
        `Ya utilizaste los ${demoCapabilities.demoMaxUses} pases de demostración disponibles en este navegador.`
      );
      return;
    }
    setStartingDemo(true);
    setDemoNotice(null);
    try {
      const res = await fetch('/api/demo/start', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'No se pudo iniciar la demostración.');
      }
      const nextQuota = saveDemoQuotaUse(data.demoToken, data.expiresAt);
      setDemoUsesUsed(nextQuota.uses);
      setDemoPass({ token: data.demoToken, expiresAt: data.expiresAt });
      navigateStudent();
    } catch (err) {
      setDemoNotice(err instanceof Error ? err.message : 'No se pudo iniciar la demostración.');
    } finally {
      setStartingDemo(false);
    }
  };

  const handleSwitchDemoRole = async (target: DemoRoleTarget) => {
    if (!demoPass) return;
    if (target === 'student') {
      navigateStudent();
      return;
    }
    setSwitchingRole(target);
    try {
      if (target === 'counselor_psy' || target === 'counselor_admin') {
        const res = await fetch('/api/counselor/demo-login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            demoToken: demoPass.token,
            demoRole: target === 'counselor_admin' ? 'admin' : 'psychologist',
          }),
        });
        if (res.status === 401 || res.status === 403) {
          handleExpireDemo();
          return;
        }
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'No se pudo cambiar de rol.');
        setCounselorToken(data.token);
        setCounselorProfile(data.counselor);
        setIsDemoCounselor(true);
        setCounselorInitialTab(target === 'counselor_admin' ? 'school_settings' : 'chats');
        setMode('counselor_panel');
      } else if (target === 'platform_admin') {
        const res = await fetch('/api/admin/demo-login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ demoToken: demoPass.token }),
        });
        if (res.status === 401 || res.status === 403) {
          handleExpireDemo();
          return;
        }
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'No se pudo abrir la consola.');
        setAdminToken(data.token);
        setAdminProfile(data.admin);
        setIsDemoAdmin(true);
        setMode('admin_console');
      }
    } catch (err) {
      setDemoNotice(err instanceof Error ? err.message : 'No se pudo cambiar de vista demo.');
    } finally {
      setSwitchingRole(null);
    }
  };

  const activeDemoRole: DemoRoleTarget =
    mode === 'admin_console'
      ? 'platform_admin'
      : mode === 'counselor_panel' && counselorProfile?.role === 'admin'
        ? 'counselor_admin'
        : mode === 'counselor_panel'
          ? 'counselor_psy'
          : 'student';

  const demoActive = Boolean(demoPass && demoCapabilities.demoPolicy === 'timed');

  return (
    <>
      <AnimatePresence>
        {showSplash && <SplashIntro key="te-escucho-splash" onComplete={handleSplashComplete} />}
      </AnimatePresence>

      {demoActive && demoPass && (
        <DemoTourBar
          usesUsed={demoUsesUsed}
          maxUses={demoCapabilities.demoMaxUses}
          expiresAt={demoPass.expiresAt}
          activeRole={activeDemoRole}
          switchingRole={switchingRole}
          onSwitchRole={(role) => void handleSwitchDemoRole(role)}
          onEndDemo={handleEndDemo}
          onExpireDemo={handleExpireDemo}
        />
      )}

      {mode === 'student' && (
        <StudentPortal
          onOpenCounselorLogin={() => {
            if (counselorToken && counselorProfile) {
              setMode('counselor_panel');
            } else {
              setMode('counselor_login');
            }
          }}
          demoCapabilities={demoCapabilities}
          demoActive={demoActive}
          demoToken={demoPass?.token || null}
          demoUsesUsed={demoUsesUsed}
          startingDemo={startingDemo}
          demoNotice={demoNotice}
          onDismissDemoNotice={() => setDemoNotice(null)}
          onStartDemo={() => void handleStartDemo()}
        />
      )}

      {mode === 'counselor_login' && (
        <CounselorLogin
          onBack={navigateStudent}
          onSuccess={(token, profile) => {
            setCounselorToken(token);
            setCounselorProfile(profile);
            setIsDemoCounselor(false);
            setCounselorInitialTab('chats');
            setMode('counselor_panel');
          }}
          onOpenAdmin={() => {
            if (adminToken && adminProfile) {
              setMode('admin_console');
            } else {
              setMode('admin_login');
            }
          }}
        />
      )}

      {mode === 'counselor_panel' && counselorToken && counselorProfile && (
        <CounselorPanel
          token={counselorToken}
          counselor={counselorProfile}
          initialTab={counselorInitialTab}
          initialTicketId={pendingStaffCaseId}
          onConsumedInitialTicketId={() => setPendingStaffCaseId(null)}
          onSwitchToStudent={navigateStudent}
          onLogout={() => {
            setCounselorToken(null);
            setCounselorProfile(null);
            setIsDemoCounselor(false);
            navigateStudent();
          }}
        />
      )}

      {mode === 'admin_login' && (
        <AdminLogin
          onBack={navigateStudent}
          onSuccess={(token, profile) => {
            setAdminToken(token);
            setAdminProfile(profile);
            setIsDemoAdmin(false);
            setMode('admin_console');
          }}
        />
      )}

      {mode === 'admin_console' && adminToken && adminProfile && (
        <AdminConsole
          token={adminToken}
          admin={adminProfile}
          onSwitchToStudent={navigateStudent}
          onResetLocalDemoPasses={() => {
            setDemoUsesUsed(0);
            setDemoPass(null);
          }}
          onCatalogUpdated={(catalog) => {
            const nextPolicy = catalog.demo_policy === 'off' ? 'off' : 'timed';
            setDemoCapabilities({
              demoPolicy: nextPolicy,
              demoDurationMinutes: catalog.demo_duration_minutes || 15,
              demoMaxUses: catalog.demo_max_uses || 3,
            });
            if (nextPolicy === 'off') {
              clearActiveDemoPass();
              setDemoPass(null);
            }
          }}
          onLogout={() => {
            setAdminToken(null);
            setAdminProfile(null);
            setIsDemoAdmin(false);
            navigateStudent();
          }}
        />
      )}

      <OfflineIndicator />
    </>
  );
}

