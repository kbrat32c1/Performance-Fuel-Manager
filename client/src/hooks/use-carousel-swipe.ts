import { useRef, useState, useCallback } from 'react';

interface CarouselSwipeConfig {
  threshold?: number; // Min swipe distance to trigger page change
  velocityThreshold?: number; // Min velocity to trigger page change (px/ms)
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
  const { threshold = 40, velocityThreshold = 0.3 } = config;

  const [offset, setOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);

  const touchStartX = useRef(0);
  const touchStartY = useRef(0);
  const touchStartTime = useRef(0);
  const currentOffset = useRef(0);
  const ignoreSwipe = useRef(false);
  const isHorizontal = useRef<boolean | null>(null);
  const isAnimatingRef = useRef(false);

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    if (isAnimatingRef.current) return;

    const touch = e.touches[0];
    touchStartX.current = touch.clientX;
    touchStartY.current = touch.clientY;
    touchStartTime.current = Date.now();
    currentOffset.current = 0;

    ignoreSwipe.current = isInsideHorizontalScroller(e.target);
    isHorizontal.current = null;
    // Don't set isDragging here — wait for actual movement in onTouchMove.
    // Setting state on touchStart causes a React re-render that can swallow
    // the subsequent click event, making buttons require a double-tap.
  }, []);

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    if (ignoreSwipe.current || isAnimatingRef.current) return;

    const touch = e.touches[0];
    const deltaX = touch.clientX - touchStartX.current;
    const deltaY = touch.clientY - touchStartY.current;
    const absX = Math.abs(deltaX);
    const absY = Math.abs(deltaY);

    // Lock direction after some movement
    if (isHorizontal.current === null && (absX > 8 || absY > 8)) {
      isHorizontal.current = absX > absY;
      if (!isHorizontal.current) {
        ignoreSwipe.current = true;
        setIsDragging(false);
        setOffset(0);
        return;
      }
      // Only set isDragging once we confirm horizontal movement
      setIsDragging(true);
    }

    if (!isHorizontal.current) return;

    // Calculate offset with Apple-style rubber band at edges
    let newOffset = deltaX;

    // Rubber band effect when can't go that direction
    const applyRubberBand = (offset: number): number => {
      const maxStretch = containerWidth * 0.15;
      const resistance = 0.4; // Lower = more resistance
      return maxStretch * Math.tanh(offset * resistance / maxStretch);
    };

    if (newOffset > 0 && !canGoPrev) {
      newOffset = applyRubberBand(newOffset);
    } else if (newOffset < 0 && !canGoNext) {
      newOffset = -applyRubberBand(-newOffset);
    }

    currentOffset.current = newOffset;
    setOffset(newOffset);
  }, [canGoPrev, canGoNext, containerWidth]);

  const onTouchEnd = useCallback(() => {
    if (ignoreSwipe.current) {
      ignoreSwipe.current = false;
      isHorizontal.current = null;
      return;
    }

    // If no horizontal movement was ever detected (i.e. a simple tap),
    // bail out immediately — no animation, no state changes, no blocking.
    // This lets the click event fire normally without interference.
    if (isHorizontal.current === null) {
      touchStartX.current = 0;
      touchStartY.current = 0;
      currentOffset.current = 0;
      return;
    }

    setIsDragging(false);

    const deltaX = currentOffset.current;
    const absX = Math.abs(deltaX);
    const elapsed = Date.now() - touchStartTime.current;
    const velocity = absX / Math.max(elapsed, 1);

    // Should we change page?
    const hasEnoughDistance = absX > threshold;
    const hasEnoughVelocity = velocity > velocityThreshold;
    const shouldChangePage = (hasEnoughDistance || hasEnoughVelocity) && isHorizontal.current;

    if (shouldChangePage && deltaX > 0 && canGoPrev) {
      // Swipe right → previous
      isAnimatingRef.current = true;
      setIsAnimating(true);
      setOffset(containerWidth);

      setTimeout(() => {
        onPrev();
        setOffset(0);
        setIsAnimating(false);
        isAnimatingRef.current = false;
      }, 250);
    } else if (shouldChangePage && deltaX < 0 && canGoNext) {
      // Swipe left → next
      isAnimatingRef.current = true;
      setIsAnimating(true);
      setOffset(-containerWidth);

      setTimeout(() => {
        onNext();
        setOffset(0);
        setIsAnimating(false);
        isAnimatingRef.current = false;
      }, 250);
    } else {
      // Snap back from a drag that didn't meet threshold
      isAnimatingRef.current = true;
      setIsAnimating(true);
      setOffset(0);

      setTimeout(() => {
        setIsAnimating(false);
        isAnimatingRef.current = false;
      }, 300);
    }

    touchStartX.current = 0;
    touchStartY.current = 0;
    currentOffset.current = 0;
    isHorizontal.current = null;
  }, [threshold, velocityThreshold, canGoPrev, canGoNext, containerWidth, onPrev, onNext]);

  // Apple-style spring transition
  const getTransition = useCallback(() => {
    if (isDragging) return 'none';
    // iOS-like spring: quick out, slight overshoot
    return 'transform 300ms cubic-bezier(0.25, 0.1, 0.25, 1.05)';
  }, [isDragging]);

  return {
    offset,
    isDragging,
    isAnimating,
    transition: getTransition(),
    handlers: {
      onTouchStart,
      onTouchMove,
      onTouchEnd,
    },
  };
}
