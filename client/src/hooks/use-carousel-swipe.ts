import { useRef, useState, useCallback } from 'react';

interface CarouselSwipeConfig {
  threshold?: number; // Min swipe distance to trigger page change
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

export function useCarouselSwipe(
  onPrev: () => void,
  onNext: () => void,
  canGoPrev: boolean,
  canGoNext: boolean,
  containerWidth: number,
  config: CarouselSwipeConfig = {}
) {
  const { threshold = 50 } = config;

  const [offset, setOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);

  const touchStartX = useRef(0);
  const touchStartY = useRef(0);
  const ignoreSwipe = useRef(false);
  const isHorizontal = useRef<boolean | null>(null);
  const isAnimatingRef = useRef(false);

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    if (isAnimatingRef.current) return;

    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
    ignoreSwipe.current = isInsideHorizontalScroller(e.target);
    isHorizontal.current = null;
    setIsDragging(true);
  }, []);

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    if (ignoreSwipe.current || isAnimatingRef.current) return;

    const currentX = e.touches[0].clientX;
    const currentY = e.touches[0].clientY;

    const deltaX = currentX - touchStartX.current;
    const deltaY = currentY - touchStartY.current;
    const absX = Math.abs(deltaX);
    const absY = Math.abs(deltaY);

    // Lock direction after 10px of movement
    if (isHorizontal.current === null && (absX > 10 || absY > 10)) {
      isHorizontal.current = absX > absY;
    }

    if (!isHorizontal.current) return;

    // Prevent vertical scroll during horizontal swipe
    e.preventDefault();

    // Calculate offset - full 1:1 movement but with rubber band at edges
    let newOffset = deltaX;

    // Apply rubber band effect at boundaries
    if (newOffset > 0 && !canGoPrev) {
      newOffset = newOffset * 0.2;
    } else if (newOffset < 0 && !canGoNext) {
      newOffset = newOffset * 0.2;
    }

    setOffset(newOffset);
  }, [canGoPrev, canGoNext]);

  const onTouchEnd = useCallback((e: React.TouchEvent) => {
    setIsDragging(false);

    if (ignoreSwipe.current) {
      ignoreSwipe.current = false;
      isHorizontal.current = null;
      setOffset(0);
      return;
    }

    const currentX = e.changedTouches[0].clientX;
    const deltaX = currentX - touchStartX.current;
    const absX = Math.abs(deltaX);

    // Determine if we should change page
    const shouldChangePage = absX > threshold && isHorizontal.current;

    if (shouldChangePage && deltaX > 0 && canGoPrev) {
      // Swipe right → go to previous day
      isAnimatingRef.current = true;
      setIsAnimating(true);
      setOffset(containerWidth);
      setTimeout(() => {
        onPrev();
        setOffset(0);
        setIsAnimating(false);
        isAnimatingRef.current = false;
      }, 200);
    } else if (shouldChangePage && deltaX < 0 && canGoNext) {
      // Swipe left → go to next day
      isAnimatingRef.current = true;
      setIsAnimating(true);
      setOffset(-containerWidth);
      setTimeout(() => {
        onNext();
        setOffset(0);
        setIsAnimating(false);
        isAnimatingRef.current = false;
      }, 200);
    } else {
      // Snap back
      isAnimatingRef.current = true;
      setIsAnimating(true);
      setOffset(0);
      setTimeout(() => {
        setIsAnimating(false);
        isAnimatingRef.current = false;
      }, 200);
    }

    touchStartX.current = 0;
    touchStartY.current = 0;
    isHorizontal.current = null;
  }, [threshold, canGoPrev, canGoNext, containerWidth, onPrev, onNext]);

  return {
    offset,
    isDragging,
    isAnimating,
    handlers: {
      onTouchStart,
      onTouchMove,
      onTouchEnd,
    },
  };
}
