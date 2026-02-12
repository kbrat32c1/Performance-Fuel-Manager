/**
 * Keyboard shortcuts hook for desktop navigation.
 * Provides keyboard navigation between pages and quick actions.
 */

import { useEffect, useCallback } from 'react';
import { useLocation } from 'wouter';

interface KeyboardShortcutsOptions {
  /** Whether shortcuts are enabled (disable during input focus) */
  enabled?: boolean;
}

/**
 * Keyboard shortcuts for desktop navigation:
 * - 1/D: Dashboard (Today)
 * - 2/W: Weekly view
 * - 3/H: Reports
 * - 4/R: Recovery
 * - L: Open quick log (weight)
 * - ?: Show help
 */
export function useKeyboardShortcuts(options: KeyboardShortcutsOptions = {}) {
  const { enabled = true } = options;
  const [, setLocation] = useLocation();

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    // Ignore if disabled or if focus is on input/textarea
    if (!enabled) return;
    const target = e.target as HTMLElement;
    if (
      target.tagName === 'INPUT' ||
      target.tagName === 'TEXTAREA' ||
      target.isContentEditable
    ) {
      return;
    }

    // Ignore if modifier keys are pressed (except for ?)
    if (e.ctrlKey || e.metaKey || e.altKey) return;

    const key = e.key.toLowerCase();

    switch (key) {
      case '1':
      case 'd':
        e.preventDefault();
        setLocation('/dashboard');
        break;
      case '2':
      case 'w':
        e.preventDefault();
        setLocation('/weekly');
        break;
      case '3':
      case 'h':
        e.preventDefault();
        setLocation('/reports');
        break;
      case '4':
      case 'r':
        e.preventDefault();
        setLocation('/recovery');
        break;
      case 'l':
        e.preventDefault();
        // Dispatch custom event to open quick log
        window.dispatchEvent(new CustomEvent('open-quick-log'));
        break;
      case '?':
        e.preventDefault();
        // Show keyboard shortcuts help
        window.dispatchEvent(new CustomEvent('show-keyboard-help'));
        break;
      case 'escape':
        // Close any open modals/dialogs (handled by individual components)
        break;
    }
  }, [enabled, setLocation]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);
}

/**
 * List of available keyboard shortcuts for help display.
 */
export const KEYBOARD_SHORTCUTS = [
  { key: '1 or D', action: 'Go to Today (Dashboard)' },
  { key: '2 or W', action: 'Go to Weekly view' },
  { key: '3 or H', action: 'Go to Reports' },
  { key: '4 or R', action: 'Go to Recovery' },
  { key: 'L', action: 'Open quick weight log' },
  { key: '?', action: 'Show keyboard shortcuts' },
  { key: 'Esc', action: 'Close dialogs' },
] as const;
