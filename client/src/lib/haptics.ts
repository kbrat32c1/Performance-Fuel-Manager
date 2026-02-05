/**
 * Haptic feedback utilities for mobile devices.
 * Uses the Vibration API when available.
 */

// Check if vibration is supported
const supportsVibration = typeof navigator !== 'undefined' && 'vibrate' in navigator;

// Haptic feedback patterns (duration in ms)
const HAPTIC_PATTERNS = {
  // Light tap - for button presses, selections
  light: [10],
  // Medium tap - for successful actions
  medium: [20],
  // Heavy tap - for important confirmations
  heavy: [30],
  // Success - double tap pattern
  success: [15, 50, 15],
  // Warning - triple light tap
  warning: [10, 30, 10, 30, 10],
  // Error - long vibration
  error: [50],
  // Selection change
  selection: [5],
} as const;

type HapticType = keyof typeof HAPTIC_PATTERNS;

// User preference for haptics (stored in localStorage)
const HAPTICS_PREF_KEY = 'pwm-haptics-enabled';

/**
 * Check if haptic feedback is enabled by the user.
 */
export function isHapticsEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  const stored = localStorage.getItem(HAPTICS_PREF_KEY);
  // Default to enabled if not set
  return stored !== 'false';
}

/**
 * Enable or disable haptic feedback.
 */
export function setHapticsEnabled(enabled: boolean): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(HAPTICS_PREF_KEY, String(enabled));
}

/**
 * Trigger haptic feedback.
 * @param type - The type of haptic feedback to trigger
 */
export function haptic(type: HapticType = 'light'): void {
  if (!supportsVibration || !isHapticsEnabled()) return;

  try {
    navigator.vibrate(HAPTIC_PATTERNS[type]);
  } catch {
    // Silently fail if vibration fails (e.g., in some browsers)
  }
}

/**
 * Haptic feedback for button press.
 */
export function hapticTap(): void {
  haptic('light');
}

/**
 * Haptic feedback for successful action completion.
 */
export function hapticSuccess(): void {
  haptic('success');
}

/**
 * Haptic feedback for warnings.
 */
export function hapticWarning(): void {
  haptic('warning');
}

/**
 * Haptic feedback for errors.
 */
export function hapticError(): void {
  haptic('error');
}

/**
 * Haptic feedback for selection changes (toggles, radios, etc).
 */
export function hapticSelection(): void {
  haptic('selection');
}
