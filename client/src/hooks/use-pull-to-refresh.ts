import { useState, useEffect, useCallback, useRef } from 'react';
import { triggerHaptic } from './use-haptics';

interface UsePullToRefreshOptions {
  onRefresh: () => Promise<void> | void;
  threshold?: number;
  maxPull?: number;
  disabled?: boolean;
}

interface PullToRefreshState {
  isPulling: boolean;
  isRefreshing: boolean;
  pullDistance: number;
  pullProgress: number; // 0-1 value for UI feedback
}

/**
 * WHOOP-style pull-to-refresh gesture hook.
 * Uses spring physics for fluid snap-back and smooth pulling.
 *
 * CRITICAL: Touch handlers must NOT cause React state updates for simple taps.
 * On iOS WKWebView, a setState during touch → re-render → swallowed click event.
 * We only set isPullingRef = true in touchmove (after confirming >10px downward),
 * never in touchstart. This ensures taps pass through cleanly to click handlers.
 */
export function usePullToRefresh({
  onRefresh,
  threshold = 80,
  maxPull = 140,
  disabled = false,
}: UsePullToRefreshOptions) {
  const [state, setState] = useState<PullToRefreshState>({
    isPulling: false,
    isRefreshing: false,
    pullDistance: 0,
    pullProgress: 0,
  });

  const startY = useRef(0);
  const touchActive = useRef(false);       // touch is down (but NOT necessarily pulling)
  const isPullingRef = useRef(false);       // only true after confirmed downward drag >10px
  const isRefreshingRef = useRef(false);
  const hasTriggeredHaptic = useRef(false);
  const animFrameRef = useRef<number>(0);
  const pullDistanceRef = useRef(0);
  const pullProgressRef = useRef(0);
  const onRefreshRef = useRef(onRefresh);

  // Keep onRefresh ref fresh without re-registering listeners
  useEffect(() => { onRefreshRef.current = onRefresh; }, [onRefresh]);

  // Cancel any running animation
  const cancelAnim = useCallback(() => {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = 0;
    }
  }, []);

  const handleTouchStart = useCallback((e: TouchEvent) => {
    if (disabled || isRefreshingRef.current) return;

    // Only activate when at the top of the page
    const scrollTop = window.scrollY || document.documentElement.scrollTop;
    if (scrollTop > 5) return;

    startY.current = e.touches[0].clientY;
    touchActive.current = true;
    // Do NOT set isPullingRef here — wait for confirmed downward movement in touchmove.
    // Setting it here causes touchend to run snap-back logic for simple taps,
    // which triggers setState → re-render → swallowed click event on iOS.
    hasTriggeredHaptic.current = false;
  }, [disabled]);

  const handleTouchMove = useCallback((e: TouchEvent) => {
    if (!touchActive.current || disabled || isRefreshingRef.current) return;

    const diff = e.touches[0].clientY - startY.current;

    // Only track downward pulls — require 10px minimum before activating.
    // Without this threshold, even tiny finger movements during a tap
    // trigger preventDefault(), which kills the iOS click event.
    if (diff <= 10) {
      if (isPullingRef.current) {
        // Was pulling but moved back up — cancel
        isPullingRef.current = false;
        pullDistanceRef.current = 0;
        pullProgressRef.current = 0;
        setState(prev => prev.pullDistance === 0 ? prev : { ...prev, isPulling: false, pullDistance: 0, pullProgress: 0 });
      }
      return;
    }

    // Confirmed downward drag — NOW activate pulling
    isPullingRef.current = true;

    // Rubber-band resistance: feels natural, harder to pull the further you go
    const resistance = Math.max(0.3, 0.6 - (diff / 800));
    const pullDistance = Math.min(diff * resistance, maxPull);
    const pullProgress = Math.min(pullDistance / threshold, 1);

    pullDistanceRef.current = pullDistance;
    pullProgressRef.current = pullProgress;

    setState(prev => ({
      ...prev,
      isPulling: true,
      pullDistance,
      pullProgress,
    }));

    // Trigger haptic at threshold
    if (pullProgress >= 1 && !hasTriggeredHaptic.current) {
      triggerHaptic('medium');
      hasTriggeredHaptic.current = true;
    }

    // Prevent default scroll when pulling
    if (pullDistance > 0) {
      e.preventDefault();
    }
  }, [disabled, maxPull, threshold]);

  // Spring animation for snap-back
  const animateSnapBack = useCallback((from: number, to: number, duration: number, onDone?: () => void) => {
    cancelAnim();
    const startTime = performance.now();
    const animate = (now: number) => {
      const elapsed = now - startTime;
      const t = Math.min(elapsed / duration, 1);
      // Spring easing: overshoot slightly then settle
      const spring = t < 1 ? 1 - Math.pow(1 - t, 3) * Math.cos(t * Math.PI * 0.5) : 1;
      const current = from + (to - from) * spring;

      const dist = Math.max(0, current);
      pullDistanceRef.current = dist;
      pullProgressRef.current = Math.max(0, dist / threshold);

      setState(prev => ({
        ...prev,
        pullDistance: dist,
        pullProgress: Math.max(0, dist / threshold),
      }));

      if (t < 1) {
        animFrameRef.current = requestAnimationFrame(animate);
      } else {
        animFrameRef.current = 0;
        onDone?.();
      }
    };
    animFrameRef.current = requestAnimationFrame(animate);
  }, [threshold, cancelAnim]);

  const handleTouchEnd = useCallback(async () => {
    touchActive.current = false;

    // If we never confirmed a pull (isPullingRef is false), bail out completely.
    // This is the critical path for taps — no setState, no animation, no interference.
    if (!isPullingRef.current || disabled) {
      isPullingRef.current = false;
      return;
    }

    isPullingRef.current = false;

    // Read from refs — never stale
    const progress = pullProgressRef.current;
    const distance = pullDistanceRef.current;

    if (progress >= 1 && !isRefreshingRef.current) {
      // Snap to refreshing position (smaller, centered spinner)
      const refreshPosition = threshold * 0.5;

      isRefreshingRef.current = true;
      setState(prev => ({
        ...prev,
        isPulling: false,
        isRefreshing: true,
      }));

      // Spring animate to refresh position
      animateSnapBack(distance, refreshPosition, 300);

      triggerHaptic('success');

      try {
        await onRefreshRef.current();
      } finally {
        // Spring animate back to zero then clear refreshing state
        animateSnapBack(refreshPosition, 0, 400, () => {
          isRefreshingRef.current = false;
          pullDistanceRef.current = 0;
          pullProgressRef.current = 0;
          setState({
            isPulling: false,
            isRefreshing: false,
            pullDistance: 0,
            pullProgress: 0,
          });
        });
      }
    } else {
      // Cancel — spring snap back to zero
      setState(prev => ({ ...prev, isPulling: false }));
      animateSnapBack(distance, 0, 250, () => {
        pullDistanceRef.current = 0;
        pullProgressRef.current = 0;
        setState({
          isPulling: false,
          isRefreshing: false,
          pullDistance: 0,
          pullProgress: 0,
        });
      });
    }
  }, [disabled, threshold, animateSnapBack]);

  useEffect(() => {
    if (disabled) return;

    // Use passive: false for touchmove to allow preventDefault
    window.addEventListener('touchstart', handleTouchStart, { passive: true });
    window.addEventListener('touchmove', handleTouchMove, { passive: false });
    window.addEventListener('touchend', handleTouchEnd, { passive: true });

    return () => {
      window.removeEventListener('touchstart', handleTouchStart);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleTouchEnd);
      cancelAnim();
    };
  }, [handleTouchStart, handleTouchMove, handleTouchEnd, disabled, cancelAnim]);

  return state;
}
