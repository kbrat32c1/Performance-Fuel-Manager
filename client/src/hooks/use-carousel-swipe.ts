import { useRef, useState, useCallback, useEffect } from 'react';

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

// Trigger haptic feedback if available
function triggerHaptic(style: 'light' | 'medium' | 'heavy' = 'light') {
  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
    const duration = style === 'light' ? 10 : style === 'medium' ? 20 : 30;
    navigator.vibrate(duration);
  }
}

export function useCarouselSwipe(
  onPrev: () => void,
  onNext: () => void,
  canGoPrev: boolean,
  canGoNext: boolean,
  containerWidth: number,
  config: CarouselSwipeConfig = {}
) {
  const { threshold = 50, velocityThreshold = 0.3 } = config;

  const [offset, setOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);
  const [springConfig, setSpringConfig] = useState<'snap' | 'bounce' | 'settle'>('settle');

  const touchStartX = useRef(0);
  const touchStartY = useRef(0);
  const touchStartTime = useRef(0);
  const lastTouchX = useRef(0);
  const lastTouchTime = useRef(0);
  const velocity = useRef(0);
  const ignoreSwipe = useRef(false);
  const isHorizontal = useRef<boolean | null>(null);
  const isAnimatingRef = useRef(false);
  const hasTriggeredEdgeHaptic = useRef(false);

  // Calculate velocity from recent touch movements
  const updateVelocity = useCallback((currentX: number, currentTime: number) => {
    const timeDelta = currentTime - lastTouchTime.current;
    if (timeDelta > 0) {
      const positionDelta = currentX - lastTouchX.current;
      // Weighted average with previous velocity for smoothing
      velocity.current = velocity.current * 0.3 + (positionDelta / timeDelta) * 0.7;
    }
    lastTouchX.current = currentX;
    lastTouchTime.current = currentTime;
  }, []);

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    if (isAnimatingRef.current) return;

    const now = Date.now();
    const startX = e.touches[0].clientX;

    touchStartX.current = startX;
    touchStartY.current = e.touches[0].clientY;
    touchStartTime.current = now;
    lastTouchX.current = startX;
    lastTouchTime.current = now;
    velocity.current = 0;

    ignoreSwipe.current = isInsideHorizontalScroller(e.target);
    isHorizontal.current = null;
    hasTriggeredEdgeHaptic.current = false;
    setIsDragging(true);
    setSpringConfig('settle');
  }, []);

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    if (ignoreSwipe.current || isAnimatingRef.current) return;

    const currentX = e.touches[0].clientX;
    const currentY = e.touches[0].clientY;
    const currentTime = Date.now();

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

    // Update velocity tracking
    updateVelocity(currentX, currentTime);

    // Calculate offset with Apple-style rubber band effect
    let newOffset = deltaX;

    // Rubber band at edges - exponential decay for more natural feel
    if (newOffset > 0 && !canGoPrev) {
      // Rubber band effect: offset = maxStretch * (1 - e^(-x/maxStretch))
      const maxStretch = containerWidth * 0.15;
      newOffset = maxStretch * (1 - Math.exp(-newOffset / (maxStretch * 2)));

      // Haptic feedback when hitting edge
      if (!hasTriggeredEdgeHaptic.current && deltaX > 20) {
        triggerHaptic('light');
        hasTriggeredEdgeHaptic.current = true;
      }
    } else if (newOffset < 0 && !canGoNext) {
      const maxStretch = containerWidth * 0.15;
      newOffset = -maxStretch * (1 - Math.exp(newOffset / (maxStretch * 2)));

      // Haptic feedback when hitting edge
      if (!hasTriggeredEdgeHaptic.current && deltaX < -20) {
        triggerHaptic('light');
        hasTriggeredEdgeHaptic.current = true;
      }
    }

    setOffset(newOffset);
  }, [canGoPrev, canGoNext, containerWidth, updateVelocity]);

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
    const currentVelocity = velocity.current;

    // Determine if we should change page based on either distance OR velocity
    const hasEnoughDistance = absX > threshold;
    const hasEnoughVelocity = Math.abs(currentVelocity) > velocityThreshold;
    const shouldChangePage = (hasEnoughDistance || hasEnoughVelocity) && isHorizontal.current;

    if (shouldChangePage && deltaX > 0 && canGoPrev) {
      // Swipe right → go to previous day
      triggerHaptic('medium');
      isAnimatingRef.current = true;
      setIsAnimating(true);
      setSpringConfig('snap');
      setOffset(containerWidth);

      // Use spring timing based on velocity
      const springDuration = Math.max(150, Math.min(300, 250 - Math.abs(currentVelocity) * 100));

      setTimeout(() => {
        onPrev();
        setOffset(0);
        setIsAnimating(false);
        isAnimatingRef.current = false;
      }, springDuration);
    } else if (shouldChangePage && deltaX < 0 && canGoNext) {
      // Swipe left → go to next day
      triggerHaptic('medium');
      isAnimatingRef.current = true;
      setIsAnimating(true);
      setSpringConfig('snap');
      setOffset(-containerWidth);

      const springDuration = Math.max(150, Math.min(300, 250 - Math.abs(currentVelocity) * 100));

      setTimeout(() => {
        onNext();
        setOffset(0);
        setIsAnimating(false);
        isAnimatingRef.current = false;
      }, springDuration);
    } else {
      // Snap back with bounce effect
      isAnimatingRef.current = true;
      setIsAnimating(true);
      setSpringConfig('bounce');
      setOffset(0);

      setTimeout(() => {
        setIsAnimating(false);
        isAnimatingRef.current = false;
      }, 350);
    }

    touchStartX.current = 0;
    touchStartY.current = 0;
    velocity.current = 0;
    isHorizontal.current = null;
  }, [threshold, velocityThreshold, canGoPrev, canGoNext, containerWidth, onPrev, onNext]);

  // Get CSS transition based on spring config
  const getTransition = useCallback(() => {
    if (isDragging) return 'none';

    switch (springConfig) {
      case 'snap':
        // Fast snap with slight overshoot feel
        return 'transform 200ms cubic-bezier(0.25, 0.46, 0.45, 0.94)';
      case 'bounce':
        // Bouncy return with overshoot
        return 'transform 350ms cubic-bezier(0.175, 0.885, 0.32, 1.275)';
      case 'settle':
      default:
        return 'transform 250ms ease-out';
    }
  }, [isDragging, springConfig]);

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
