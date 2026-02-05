// Notification preferences and permission helpers for daily weigh-in reminders

export interface NotificationPreferences {
  enabled: boolean;
  morningReminder: boolean;
  morningTime: string; // "HH:MM" format
  prePracticeReminder: boolean;
  prePracticeTime: string;
  beforeBedReminder: boolean;
  beforeBedTime: string;
}

export const DEFAULT_PREFS: NotificationPreferences = {
  enabled: false,
  morningReminder: true,
  morningTime: "07:00",
  prePracticeReminder: true,
  prePracticeTime: "14:30",
  beforeBedReminder: true,
  beforeBedTime: "21:00",
};

const STORAGE_KEY = 'pwm-notification-prefs';

export function getNotificationPrefs(): NotificationPreferences {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...DEFAULT_PREFS, ...JSON.parse(raw) };
  } catch (e) {
    console.warn('Failed to parse notification preferences:', e);
  }
  return { ...DEFAULT_PREFS };
}

export function saveNotificationPrefs(prefs: NotificationPreferences): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
}

export function getPermissionState(): NotificationPermission | 'unsupported' {
  if (typeof Notification === 'undefined') return 'unsupported';
  return Notification.permission;
}

export async function requestPermission(): Promise<NotificationPermission | 'unsupported'> {
  if (typeof Notification === 'undefined') return 'unsupported';
  const result = await Notification.requestPermission();
  return result;
}

export function fireNotification(title: string, body: string): void {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
  try {
    new Notification(title, {
      body,
      icon: '/icon-192.png',
      tag: `pwm-reminder-${Date.now()}`,
      requireInteraction: false,
    });
  } catch {
    // Notification constructor may fail in some contexts
  }
}

// Check if a notification was already fired for a given slot today
export function wasFiredToday(slot: string): boolean {
  const key = `pwm-notif-fired-${slot}-${new Date().toISOString().slice(0, 10)}`;
  return localStorage.getItem(key) === 'true';
}

export function markFired(slot: string): void {
  const key = `pwm-notif-fired-${slot}-${new Date().toISOString().slice(0, 10)}`;
  localStorage.setItem(key, 'true');
}

// Generate 30-minute interval time options for picker
export function getTimeOptions(): { value: string; label: string }[] {
  const options: { value: string; label: string }[] = [];
  for (let h = 5; h <= 23; h++) {
    for (const m of [0, 30]) {
      const value = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
      const hour12 = h > 12 ? h - 12 : h === 0 ? 12 : h;
      const ampm = h >= 12 ? 'PM' : 'AM';
      const label = `${hour12}:${String(m).padStart(2, '0')} ${ampm}`;
      options.push({ value, label });
    }
  }
  return options;
}
