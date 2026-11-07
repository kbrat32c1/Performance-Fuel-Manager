import { useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import { getWhoopStatus, syncWhoop, whoopSyncDue } from '@/lib/whoop';
import { WHOOP_CHANGED_EVENT } from '@/components/dashboard/whoop-card';

/**
 * On the dashboard: sync WHOOP when it's due (every few hours), handle the return from
 * WHOOP's approval page (?whoop=connected on the web, com.sparnutrition.app://whoop in the
 * app), then reload health data.
 */
export function useWhoopAutoSync(userId: string | null, refreshHealth: () => Promise<void> | void, notify: (title: string, description?: string) => void) {
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;

    const params = new URLSearchParams(window.location.search);
    const returned = params.get('whoop');
    if (returned) {
      params.delete('whoop');
      const q = params.toString();
      window.history.replaceState(null, '', `${window.location.pathname}${q ? `?${q}` : ''}${window.location.hash}`);
      if (returned === 'connected') notify('WHOOP connected', 'Your recovery, sleep and strain will sync each day.');
      else notify("WHOOP didn't connect", 'Try again from Settings → Health.');
      window.dispatchEvent(new Event(WHOOP_CHANGED_EVENT));
      void refreshHealth();
    }

    (async () => {
      const status = await getWhoopStatus();
      if (cancelled || status === 'unavailable' || !whoopSyncDue(status)) return;
      if (!(await syncWhoop()) && !cancelled) {
        window.dispatchEvent(new Event(WHOOP_CHANGED_EVENT));
        await refreshHealth();
      }
    })();

    let remove: (() => void) | undefined;
    if (Capacitor.isNativePlatform()) {
      import('@capacitor/app').then(({ App }) => {
        const handle = App.addListener('appUrlOpen', async ({ url }) => {
          if (!url.startsWith('com.sparnutrition.app://whoop')) return;
          const { Browser } = await import('@capacitor/browser');
          await Browser.close().catch(() => {});
          const ok = new URL(url.replace('com.sparnutrition.app://', 'https://app/')).searchParams.get('status') === 'connected';
          notify(ok ? 'WHOOP connected' : "WHOOP didn't connect", ok ? 'Your recovery, sleep and strain will sync each day.' : 'Try again from Settings → Health.');
          window.dispatchEvent(new Event(WHOOP_CHANGED_EVENT));
          await refreshHealth();
        });
        remove = () => { void handle.then(h => h.remove()); };
      });
    }
    return () => { cancelled = true; remove?.(); };
  }, [userId]);
}
