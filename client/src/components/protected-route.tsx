import { ReactNode, useEffect } from 'react';
import { useLocation } from 'wouter';
import { useAuth } from '@/lib/auth';
import { useStore } from '@/lib/store';
import { Loader2 } from 'lucide-react';

interface ProtectedRouteProps {
  children: ReactNode;
  requireOnboarding?: boolean;
}

export function ProtectedRoute({ children, requireOnboarding = true }: ProtectedRouteProps) {
  const { user, loading: authLoading } = useAuth();
  const { profile, isLoading: storeLoading } = useStore();
  const [location, setLocation] = useLocation();

  const isLoading = authLoading || storeLoading;

  useEffect(() => {
    if (isLoading) return;

    // If not logged in, redirect to landing page
    if (!user) {
      setLocation('/');
      return;
    }

    // Check onboarding status for routes that require it
    if (requireOnboarding && !profile.hasCompletedOnboarding && location !== '/onboarding') {
      setLocation('/onboarding');
      return;
    }

    // If on onboarding page but already completed, redirect to dashboard
    if (location === '/onboarding' && profile.hasCompletedOnboarding) {
      setLocation('/dashboard');
      return;
    }
  }, [isLoading, user, profile.hasCompletedOnboarding, location, setLocation, requireOnboarding]);

  // Show loading while checking auth or store
  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  // If not logged in, show loading while redirecting
  if (!user) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  // User is authenticated, render children
  return <>{children}</>;
}
