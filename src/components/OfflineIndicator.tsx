import React, { useEffect, useState } from 'react';
import { RefreshCw, WifiOff } from 'lucide-react';

export function useOnlineStatus() {
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return isOnline;
}

export const OfflineIndicator: React.FC = () => {
  const isOnline = useOnlineStatus();
  const [updateHandler, setUpdateHandler] = useState<(() => Promise<void>) | null>(null);

  useEffect(() => {
    const onUpdate = (ev: Event) => {
      const custom = ev as CustomEvent<(() => Promise<void>) | undefined>;
      if (typeof custom.detail === 'function') {
        setUpdateHandler(() => custom.detail!);
      }
    };
    window.addEventListener('pwa-update-available', onUpdate);
    return () => window.removeEventListener('pwa-update-available', onUpdate);
  }, []);

  if (isOnline && !updateHandler) return null;

  return (
    <div className="fixed bottom-4 left-4 z-50 flex flex-col gap-2 print:hidden">
      {updateHandler && (
        <button
          type="button"
          onClick={() => void updateHandler()}
          className="min-h-[44px] flex items-center gap-2 rounded-xl bg-teal-800 hover:bg-teal-900 px-3.5 py-2 text-xs font-semibold text-white shadow-lg transition"
        >
          <RefreshCw className="w-3.5 h-3.5 shrink-0" />
          <span>Nueva versión disponible · Actualizar</span>
        </button>
      )}
      {!isOnline && (
        <div
          role="status"
          className="flex items-center gap-2 rounded-xl bg-amber-600 px-3.5 py-2 text-xs font-medium text-white shadow-lg"
        >
          <WifiOff className="w-3.5 h-3.5 shrink-0" />
          <span>Sin conexión — Mostrando contenido guardado</span>
        </div>
      )}
    </div>
  );
};
