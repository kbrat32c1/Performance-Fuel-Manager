/**
 * Keyboard shortcuts help modal.
 * Shows available keyboard shortcuts for desktop users.
 */

import { useState, useEffect } from 'react';
import { X, Keyboard } from 'lucide-react';
import { cn } from '@/lib/utils';
import { KEYBOARD_SHORTCUTS } from '@/hooks/use-keyboard-shortcuts';

export function KeyboardShortcutsHelp() {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    const handleShow = () => setIsOpen(true);
    window.addEventListener('show-keyboard-help', handleShow);
    return () => window.removeEventListener('show-keyboard-help', handleShow);
  }, []);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setIsOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" role="dialog" aria-modal="true" aria-labelledby="keyboard-help-title">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 animate-in fade-in duration-200"
        onClick={() => setIsOpen(false)}
        aria-hidden="true"
      />

      {/* Modal */}
      <div className="relative bg-card border border-border rounded-xl shadow-xl max-w-sm w-full mx-4 animate-in zoom-in-95 duration-200" role="document">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div className="flex items-center gap-2">
            <Keyboard className="w-5 h-5 text-primary" aria-hidden="true" />
            <h2 id="keyboard-help-title" className="text-lg font-bold">Keyboard Shortcuts</h2>
          </div>
          <button
            onClick={() => setIsOpen(false)}
            className="p-2 min-w-[44px] min-h-[44px] rounded-lg hover:bg-muted text-muted-foreground active:scale-95 transition-transform flex items-center justify-center"
            aria-label="Close help"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-2">
          {KEYBOARD_SHORTCUTS.map(({ key, action }) => (
            <div key={key} className="flex items-center justify-between py-2">
              <span className="text-sm text-muted-foreground">{action}</span>
              <kbd className="px-2 py-1 bg-muted rounded text-xs font-mono font-bold text-foreground">
                {key}
              </kbd>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-border">
          <p className="text-xs text-muted-foreground text-center">
            Press <kbd className="px-1.5 py-0.5 bg-muted rounded text-[10px] font-mono">?</kbd> anytime to show this help
          </p>
        </div>
      </div>
    </div>
  );
}
