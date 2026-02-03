/**
 * Haptic feedback hook for mobile devices.
 * Uses the Vibration API when available.
 */

type HapticType = 'light' | 'medium' | 'heavy' | 'success' | 'warning' | 'error';

const HAPTIC_PATTERNS: Record<HapticType, number | number[]> = {
  light: 10,
  medium: 25,
  heavy: 50,
  success: [10, 50, 10],
  warning: [25, 50, 25],
  error: [50, 100, 50, 100, 50],
};

export function useHaptics() {
  const isSupported = typeof navigator !== 'undefined' && 'vibrate' in navigator;

  const trigger = (type: HapticType = 'light') => {
    if (!isSupported) return;

    try {
      navigator.vibrate(HAPTIC_PATTERNS[type]);
    } catch {
      // Vibration may fail on some devices, ignore
    }
  };

  return {
    trigger,
    isSupported,
    // Convenience methods
    light: () => trigger('light'),
    medium: () => trigger('medium'),
    heavy: () => trigger('heavy'),
    success: () => trigger('success'),
    warning: () => trigger('warning'),
    error: () => trigger('error'),
  };
}

/**
 * Simple trigger function for one-off haptic feedback.
 * Useful in onClick handlers without needing the hook.
 */
export function triggerHaptic(type: HapticType = 'light') {
  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
    try {
      navigator.vibrate(HAPTIC_PATTERNS[type]);
    } catch {
      // Ignore failures
    }
  }
}
