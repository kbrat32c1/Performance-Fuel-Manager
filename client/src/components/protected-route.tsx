import { ReactNode, useEffect, useRef } from 'react';
import { useLocation } from 'wouter';
import { useAuth } from '@/lib/auth';
import { useStore } from '@/lib/store';

// Augment window for splash control
declare global {
  interface Window {
    __splashReady?: () => void;
    __dismissSplash?: () => void;
  }
}

interface ProtectedRouteProps {
  children: ReactNode;
  requireOnboarding?: boolean;
}

export function ProtectedRoute({ children, requireOnboarding = true }: ProtectedRouteProps) {
  const { user, loading: authLoading } = useAuth();
  const { profile, logs, isLoading: storeLoading } = useStore();
  const [location, setLocation] = useLocation();
  const splashDismissed = useRef(false);

  const isLoading = authLoading || storeLoading;

  // Treat onboarding as complete if user has real data (name + weight class + logs)
  const hasRealData = !!(profile.name && profile.name !== 'Athlete' && profile.targetWeightClass && logs.length > 0);
  const effectivelyOnboarded = profile.hasCompletedOnboarding || hasRealData;

  // Helper: dismiss splash once (respects minimum display time)
  const dismissSplash = () => {
    if (splashDismissed.current) return;
    splashDismissed.current = true;
    window.__splashReady?.();
  };

  useEffect(() => {
    if (isLoading) return;

    if (!user) {
      dismissSplash();
      setLocation('/');
      return;
    }

    const isRerunWizard = typeof window !== 'undefined' && sessionStorage.getItem('rerunWizard') === 'true';
    if (requireOnboarding && !effectivelyOnboarded) {
      if (location !== '/onboarding') {
        setLocation('/onboarding');
      }
    } else if (location === '/onboarding' && effectivelyOnboarded && !isRerunWizard) {
      setLocation('/dashboard');
    }
  }, [isLoading, user, effectivelyOnboarded, location, setLocation, requireOnboarding]);

  // Dismiss splash when content is ready to show
  useEffect(() => {
    if (!isLoading && user) {
      dismissSplash();
    }
  }, [isLoading, user]);

  // While loading, render background-only — the HTML splash covers the screen
  if (isLoading || !user) {
    return <div className="min-h-screen bg-background" />;
  }

  return <>{children}</>;
}
