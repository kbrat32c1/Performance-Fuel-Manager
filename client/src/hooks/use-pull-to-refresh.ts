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
 * Pull-to-refresh gesture hook for mobile PWAs.
 * Returns state and handlers to attach to a scrollable container.
 */
export function usePullToRefresh({
  onRefresh,
  threshold = 80,
  maxPull = 120,
  disabled = false,
}: UsePullToRefreshOptions) {
  const [state, setState] = useState<PullToRefreshState>({
    isPulling: false,
    isRefreshing: false,
    pullDistance: 0,
    pullProgress: 0,
  });

  const startY = useRef(0);
  const currentY = useRef(0);
  const isPullingRef = useRef(false);
  const hasTriggeredHaptic = useRef(false);

  const handleTouchStart = useCallback((e: TouchEvent) => {
    if (disabled || state.isRefreshing) return;

    // Only activate when at the top of the page
    const scrollTop = window.scrollY || document.documentElement.scrollTop;
    if (scrollTop > 5) return;

    startY.current = e.touches[0].clientY;
    isPullingRef.current = true;
    hasTriggeredHaptic.current = false;
  }, [disabled, state.isRefreshing]);

  const handleTouchMove = useCallback((e: TouchEvent) => {
    if (!isPullingRef.current || disabled || state.isRefreshing) return;

    currentY.current = e.touches[0].clientY;
    const diff = currentY.current - startY.current;

    // Only track downward pulls
    if (diff <= 0) {
      setState(prev => ({ ...prev, isPulling: false, pullDistance: 0, pullProgress: 0 }));
      return;
    }

    // Apply resistance (diminishing returns as you pull further)
    const resistance = 0.5;
    const pullDistance = Math.min(diff * resistance, maxPull);
    const pullProgress = Math.min(pullDistance / threshold, 1);

    setState(prev => ({
      ...prev,
      isPulling: true,
      pullDistance,
      pullProgress,
    }));

    // Trigger haptic when threshold is reached
    if (pullProgress >= 1 && !hasTriggeredHaptic.current) {
      triggerHaptic('medium');
      hasTriggeredHaptic.current = true;
    }

    // Prevent default scroll when pulling
    if (pullDistance > 0) {
      e.preventDefault();
    }
  }, [disabled, maxPull, threshold, state.isRefreshing]);

  const handleTouchEnd = useCallback(async () => {
    if (!isPullingRef.current || disabled) return;

    isPullingRef.current = false;
    const { pullProgress } = state;

    if (pullProgress >= 1 && !state.isRefreshing) {
      // Trigger refresh
      setState(prev => ({
        ...prev,
        isRefreshing: true,
        pullDistance: threshold * 0.6, // Keep some visual indicator
        pullProgress: 0.6,
      }));

      triggerHaptic('success');

      try {
        await onRefresh();
      } finally {
        setState({
          isPulling: false,
          isRefreshing: false,
          pullDistance: 0,
          pullProgress: 0,
        });
      }
    } else {
      // Cancel pull
      setState({
        isPulling: false,
        isRefreshing: false,
        pullDistance: 0,
        pullProgress: 0,
      });
    }
  }, [disabled, onRefresh, state, threshold]);

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
    };
  }, [handleTouchStart, handleTouchMove, handleTouchEnd, disabled]);

  return state;
}
