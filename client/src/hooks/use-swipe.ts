import { useRef, useCallback } from 'react';

interface SwipeHandlers {
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  onSwipeUp?: () => void;
  onSwipeDown?: () => void;
  onDrag?: (offsetX: number) => void;
  onCancel?: () => void;
}

interface SwipeConfig {
  threshold?: number;
  preventScroll?: boolean;
}

// Check if the touch started inside a horizontally scrollable container
function isInsideHorizontalScroller(target: EventTarget | null): boolean {
  let el = target as HTMLElement | null;
  while (el) {
    const style = window.getComputedStyle(el);
    const overflowX = style.overflowX;
    if ((overflowX === 'auto' || overflowX === 'scroll') && el.scrollWidth > el.clientWidth) {
      return true;
    }
    if (el.dataset.swipeIgnore !== undefined) {
      return true;
    }
    el = el.parentElement;
  }
  return false;
}

export function useSwipe(handlers: SwipeHandlers, config: SwipeConfig = {}) {
  const { threshold = 50, preventScroll = false } = config;

  const touchStartX = useRef<number>(0);
  const touchStartY = useRef<number>(0);
  const touchEndX = useRef<number>(0);
  const touchEndY = useRef<number>(0);
  const ignoreSwipe = useRef<boolean>(false);
  const isHorizontal = useRef<boolean | null>(null);

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
    touchEndX.current = e.touches[0].clientX;
    touchEndY.current = e.touches[0].clientY;
    ignoreSwipe.current = isInsideHorizontalScroller(e.target);
    isHorizontal.current = null;
  }, []);

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    touchEndX.current = e.touches[0].clientX;
    touchEndY.current = e.touches[0].clientY;

    if (ignoreSwipe.current) return;

    const deltaX = touchEndX.current - touchStartX.current;
    const deltaY = touchEndY.current - touchStartY.current;
    const absX = Math.abs(deltaX);
    const absY = Math.abs(deltaY);

    // Lock direction after 10px of movement
    if (isHorizontal.current === null && (absX > 10 || absY > 10)) {
      isHorizontal.current = absX > absY;
    }

    // Report drag offset for visual feedback (capped for feel)
    if (isHorizontal.current && handlers.onDrag) {
      const capped = Math.sign(deltaX) * Math.min(Math.abs(deltaX) * 0.4, 80);
      handlers.onDrag(capped);
    }

    // Prevent vertical scroll during horizontal swipe
    if (isHorizontal.current && (preventScroll || absX > 10)) {
      e.preventDefault();
    }
  }, [preventScroll, handlers]);

  const onTouchEnd = useCallback(() => {
    if (ignoreSwipe.current) {
      ignoreSwipe.current = false;
      isHorizontal.current = null;
      handlers.onCancel?.();
      return;
    }

    const deltaX = touchEndX.current - touchStartX.current;
    const deltaY = touchEndY.current - touchStartY.current;
    const absX = Math.abs(deltaX);
    const absY = Math.abs(deltaY);

    if (absX > absY && absX > threshold) {
      if (deltaX > 0) {
        handlers.onSwipeRight?.();
      } else {
        handlers.onSwipeLeft?.();
      }
    } else if (absY > absX && absY > threshold) {
      if (deltaY > 0) {
        handlers.onSwipeDown?.();
      } else {
        handlers.onSwipeUp?.();
      }
    } else {
      // Didn't meet threshold — cancel
      handlers.onCancel?.();
    }

    touchStartX.current = 0;
    touchStartY.current = 0;
    touchEndX.current = 0;
    touchEndY.current = 0;
    isHorizontal.current = null;
  }, [handlers, threshold]);

  return {
    onTouchStart,
    onTouchMove,
    onTouchEnd,
  };
}
