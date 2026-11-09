import { useEffect, useRef } from 'react';
import { Capacitor } from '@capacitor/core';
import { format } from 'date-fns';
import { completeWhoop, getWhoopStatus, hasRecoveryForDate, syncWhoop, whoopSyncDue } from '@/lib/whoop';
import { WHOOP_CHANGED_EVENT, WHOOP_DATA_CHANGED_EVENT } from '@/components/dashboard/whoop-card';

/**
 * On the dashboard:
 * - finish a WHOOP connection when the athlete returns from WHOOP's page (?whoop=finish&n=… on the
 *   web, com.sparnutrition.app://whoop?status=finish&n=… in the app) by claiming it for this account;
 * - sync when due (every few hours, or every few minutes while today's recovery is missing), also
 *   when the app or tab comes back into view;
 * - reload health data after any WHOOP change, including Sync now / Disconnect in Settings.
 */
export function useWhoopAutoSync(userId: string | null, refreshHealth: () => Promise<void> | void, notify: (title: string, description?: string) => void) {
  const refreshRef = useRef(refreshHealth);
  refreshRef.current = refreshHealth;
  const notifyRef = useRef(notify);
  notifyRef.current = notify;

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    let checking = false;

    const changed = async () => {
      window.dispatchEvent(new Event(WHOOP_CHANGED_EVENT));
      await refreshRef.current();
    };

    const finish = async (status: string | null, nonce: string | null) => {
      if (status === 'finish' && nonce) {
        const err = await completeWhoop(nonce);
        if (cancelled) return;
        notifyRef.current(err ? "WHOOP didn't connect" : 'WHOOP connected', err ?? 'Your recovery, sleep and strain will sync each day.');
      } else {
        notifyRef.current("WHOOP didn't connect", 'Try again from Settings → Health.');
      }
      await changed();
    };

    const checkDue = async () => {
      if (checking || cancelled) return;
      checking = true;
      try {
        const status = await getWhoopStatus();
        if (cancelled || status === 'unavailable' || status === 'error') return;
        if (!whoopSyncDue(status)) {
          // Only worth asking once the short wait has passed.
          if (!whoopSyncDue(status, Date.now(), true)) return;
          if (await hasRecoveryForDate(userId, format(new Date(), 'yyyy-MM-dd')) || cancelled) return;
        }
        if (!(await syncWhoop()) && !cancelled) await changed();
      } finally {
        checking = false;
      }
    };

    // Returning from WHOOP on the web
    const params = new URLSearchParams(window.location.search);
    const returned = params.get('whoop');
    const nonce = params.get('n');
    if (returned) {
      params.delete('whoop');
      params.delete('n');
      const q = params.toString();
      window.history.replaceState(null, '', `${window.location.pathname}${q ? `?${q}` : ''}${window.location.hash}`);
      void finish(returned, nonce);
    } else {
      void checkDue();
    }

    const onVisible = () => { if (document.visibilityState === 'visible') void checkDue(); };
    const onDataChanged = () => { void refreshRef.current(); };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener(WHOOP_DATA_CHANGED_EVENT, onDataChanged);

    const removers: Array<() => void> = [];
    if (Capacitor.isNativePlatform()) {
      import('@capacitor/app').then(({ App }) => {
        if (cancelled) return;
        const urlHandle = App.addListener('appUrlOpen', async ({ url }) => {
          if (!url.startsWith('com.sparnutrition.app://whoop')) return;
          const { Browser } = await import('@capacitor/browser');
          await Browser.close().catch(() => {});
          const q = new URL(url.replace('com.sparnutrition.app://', 'https://app/')).searchParams;
          await finish(q.get('status'), q.get('n'));
        });
        const resumeHandle = App.addListener('resume', () => { void checkDue(); });
        removers.push(() => { void urlHandle.then(h => h.remove()); }, () => { void resumeHandle.then(h => h.remove()); });
      });
    }

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener(WHOOP_DATA_CHANGED_EVENT, onDataChanged);
      removers.forEach(r => r());
    };
  }, [userId]);
}
