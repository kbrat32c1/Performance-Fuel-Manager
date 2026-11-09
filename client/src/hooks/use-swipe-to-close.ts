import { useCallback, useRef } from "react";

/** Far enough, or fast enough, to count as a dismiss. */
export function shouldDismissSwipe(dragPx: number, elapsedMs: number): boolean {
  if (dragPx >= 90) return true;
  return dragPx >= 30 && elapsedMs > 0 && dragPx / elapsedMs >= 0.6;
}

/** Whether a finger's movement so far is a pull-down, something else, or too small to tell. */
export function swipeIntent(dx: number, dy: number): 'wait' | 'drag' | 'cancel' {
  if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return 'wait';
  return dy > 0 && dy > Math.abs(dx) ? 'drag' : 'cancel';
}

const NO_SHEET_SWIPE = 'input, select, textarea, [role="slider"], [data-no-swipe], [data-swipe-handle]';

/**
 * A drag can only move the sheet if the content under the finger is scrolled to the top.
 * Touches still bubble through React from overlays portaled to the body, so check the real DOM.
 */
export function canStartSheetSwipe(target: HTMLElement, sheet: HTMLElement): boolean {
  if (!sheet.contains(target) || target.closest(NO_SHEET_SWIPE)) return false;
  for (let el: HTMLElement | null = target; el; el = el.parentElement) {
    if (el.scrollTop > 0) return false;
    if (el === sheet) break;
  }
  return true;
}

/**
 * Swipe down anywhere on a bottom sheet to close it, once its content is scrolled to the top.
 * Spread on the sheet itself. Scrolling, sideways drags, and form fields are left alone.
 */
export function useSwipeSheetToClose(onClose: () => void) {
  const drag = useRef<{ startX: number; startY: number; startT: number; sheet: HTMLElement; dy: number; active: boolean } | null>(null);

  const onTouchStart = useCallback((e: React.TouchEvent<HTMLElement>) => {
    const sheet = e.currentTarget;
    // A second finger cancels a pull already under way; put the sheet back first.
    if (drag.current?.active) {
      drag.current.sheet.style.transition = "transform 0.2s ease-out";
      drag.current.sheet.style.transform = "";
    }
    drag.current = e.touches.length === 1 && canStartSheetSwipe(e.target as HTMLElement, sheet)
      ? { startX: e.touches[0].clientX, startY: e.touches[0].clientY, startT: Date.now(), sheet, dy: 0, active: false }
      : null;
  }, []);

  const onTouchMove = useCallback((e: React.TouchEvent<HTMLElement>) => {
    const d = drag.current;
    if (!d) return;
    const dy = e.touches[0].clientY - d.startY;
    if (!d.active) {
      const intent = swipeIntent(e.touches[0].clientX - d.startX, dy);
      if (intent === 'wait') return;
      if (intent === 'cancel') { drag.current = null; return; }
      d.active = true;
      d.sheet.style.transition = "none";
    }
    d.dy = Math.max(0, dy);
    d.sheet.style.transform = `translateY(${d.dy}px)`;
  }, []);

  const onTouchEnd = useCallback(() => {
    const d = drag.current;
    drag.current = null;
    if (!d?.active) return;
    if (shouldDismissSwipe(d.dy, Date.now() - d.startT)) {
      onClose();
      return;
    }
    d.sheet.style.transition = "transform 0.2s ease-out";
    d.sheet.style.transform = "";
  }, [onClose]);

  return { onTouchStart, onTouchMove, onTouchEnd, onTouchCancel: onTouchEnd };
}

/**
 * Swipe down on a bottom sheet's handle to close it. Spread the returned props on the handle
 * only, so scrolling the sheet's content still scrolls. The sheet follows the finger.
 */
export function useSwipeToClose(onClose: () => void) {
  const drag = useRef<{ startY: number; startT: number; sheet: HTMLElement | null; dy: number } | null>(null);

  const onTouchStart = useCallback((e: React.TouchEvent<HTMLElement>) => {
    const sheet = e.currentTarget.closest<HTMLElement>('[role="dialog"], [data-swipe-sheet]');
    drag.current = { startY: e.touches[0].clientY, startT: Date.now(), sheet, dy: 0 };
    if (sheet) sheet.style.transition = "none";
  }, []);

  const onTouchMove = useCallback((e: React.TouchEvent<HTMLElement>) => {
    const d = drag.current;
    if (!d) return;
    d.dy = Math.max(0, e.touches[0].clientY - d.startY);
    if (d.sheet) d.sheet.style.transform = `translateY(${d.dy}px)`;
  }, []);

  const onTouchEnd = useCallback(() => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    if (shouldDismissSwipe(d.dy, Date.now() - d.startT)) {
      onClose();
      return;
    }
    if (d.sheet) {
      d.sheet.style.transition = "transform 0.2s ease-out";
      d.sheet.style.transform = "";
    }
  }, [onClose]);

  return { onTouchStart, onTouchMove, onTouchEnd, onTouchCancel: onTouchEnd, style: { touchAction: "none" as const }, "data-swipe-handle": true };
}
