import { useEffect, useRef } from 'react';
import {
  getNotificationPrefs,
  getPermissionState,
  fireNotification,
  wasFiredToday,
  markFired,
} from '@/lib/notifications';

interface LogsForToday {
  morning: boolean;
  prePractice: boolean;
  beforeBed: boolean;
}

/**
 * Checks every 60s if a weigh-in reminder should fire.
 * Only fires if: enabled, permission granted, not fired today for that slot,
 * and the corresponding log type hasn't been logged yet.
 */
export function useNotificationScheduler(todayLogs: LogsForToday) {
  const logsRef = useRef(todayLogs);
  logsRef.current = todayLogs;

  useEffect(() => {
    const check = () => {
      const prefs = getNotificationPrefs();
      if (!prefs.enabled) return;
      if (getPermissionState() !== 'granted') return;

      const now = new Date();
      const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
      const logs = logsRef.current;

      // Check each reminder slot
      if (prefs.morningReminder && !logs.morning && !wasFiredToday('morning')) {
        if (isTimeToFire(currentTime, prefs.morningTime)) {
          fireNotification('Morning Weigh-in', 'Time to log your morning weight');
          markFired('morning');
        }
      }

      if (prefs.prePracticeReminder && !logs.prePractice && !wasFiredToday('pre-practice')) {
        if (isTimeToFire(currentTime, prefs.prePracticeTime)) {
          fireNotification('Pre-Practice Weigh-in', 'Log your weight before practice');
          markFired('pre-practice');
        }
      }

      if (prefs.beforeBedReminder && !logs.beforeBed && !wasFiredToday('before-bed')) {
        if (isTimeToFire(currentTime, prefs.beforeBedTime)) {
          fireNotification('Before Bed Weigh-in', 'Log your weight before going to sleep');
          markFired('before-bed');
        }
      }
    };

    // Check immediately, then every 60s
    check();
    const interval = setInterval(check, 60_000);
    return () => clearInterval(interval);
  }, []);
}

/**
 * Returns true if current time is within 5 minutes after the target time.
 * This gives a 5-minute window so the 60s interval doesn't miss the exact minute.
 */
function isTimeToFire(current: string, target: string): boolean {
  const [cH, cM] = current.split(':').map(Number);
  const [tH, tM] = target.split(':').map(Number);
  const currentMinutes = cH * 60 + cM;
  const targetMinutes = tH * 60 + tM;
  const diff = currentMinutes - targetMinutes;
  return diff >= 0 && diff < 5;
}
