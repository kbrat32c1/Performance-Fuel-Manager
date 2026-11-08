import { useCallback, useRef } from "react";

/** Far enough, or fast enough, to count as a dismiss. */
export function shouldDismissSwipe(dragPx: number, elapsedMs: number): boolean {
  if (dragPx >= 90) return true;
  return dragPx >= 30 && elapsedMs > 0 && dragPx / elapsedMs >= 0.6;
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

  return { onTouchStart, onTouchMove, onTouchEnd, onTouchCancel: onTouchEnd, style: { touchAction: "none" as const } };
}
