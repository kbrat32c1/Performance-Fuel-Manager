import { useRef, useCallback } from 'react';

interface SwipeHandlers {
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  onSwipeUp?: () => void;
  onSwipeDown?: () => void;
}

interface SwipeConfig {
  threshold?: number; // Minimum distance for a swipe (default: 50px)
  preventScroll?: boolean; // Prevent vertical scroll during horizontal swipe
}

export function useSwipe(handlers: SwipeHandlers, config: SwipeConfig = {}) {
  const { threshold = 50, preventScroll = false } = config;

  const touchStartX = useRef<number>(0);
  const touchStartY = useRef<number>(0);
  const touchEndX = useRef<number>(0);
  const touchEndY = useRef<number>(0);

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
  }, []);

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    touchEndX.current = e.touches[0].clientX;
    touchEndY.current = e.touches[0].clientY;

    // Prevent vertical scroll during horizontal swipe if configured
    if (preventScroll) {
      const deltaX = Math.abs(touchEndX.current - touchStartX.current);
      const deltaY = Math.abs(touchEndY.current - touchStartY.current);
      if (deltaX > deltaY && deltaX > 10) {
        e.preventDefault();
      }
    }
  }, [preventScroll]);

  const onTouchEnd = useCallback(() => {
    const deltaX = touchEndX.current - touchStartX.current;
    const deltaY = touchEndY.current - touchStartY.current;
    const absX = Math.abs(deltaX);
    const absY = Math.abs(deltaY);

    // Only trigger if horizontal movement is greater than vertical
    // and exceeds threshold
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
    }

    // Reset
    touchStartX.current = 0;
    touchStartY.current = 0;
    touchEndX.current = 0;
    touchEndY.current = 0;
  }, [handlers, threshold]);

  return {
    onTouchStart,
    onTouchMove,
    onTouchEnd,
  };
}
