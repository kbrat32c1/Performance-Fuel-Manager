import { useState, useEffect } from 'react';

/**
 * Hook to track online/offline status with debounce to avoid flicker.
 */
export function useOnlineStatus() {
  const [isOnline, setIsOnline] = useState(() =>
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );

  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout>;

    const handleOnline = () => {
      // Immediate when coming back online
      setIsOnline(true);
    };

    const handleOffline = () => {
      // Small delay before showing offline to avoid brief flickers
      timeout = setTimeout(() => setIsOnline(false), 300);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      clearTimeout(timeout);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return isOnline;
}
