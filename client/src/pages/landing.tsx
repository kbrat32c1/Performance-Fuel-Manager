import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowRight, Loader2, Mail, Lock, Eye, EyeOff, CheckCircle } from "lucide-react";
import { useStore } from "@/lib/store";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";

type AuthMode = 'landing' | 'login' | 'signup' | 'forgot';

// Reusable migration dialog component
function MigrationDialog({
  onMigrate,
  onSkip,
  isSubmitting,
  error
}: {
  onMigrate: () => void;
  onSkip: () => void;
  isSubmitting: boolean;
  error: string | null;
}) {
  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col items-center justify-center p-6">
      <div className="max-w-sm w-full space-y-6 text-center">
        <h2 className="text-2xl font-bold">Existing Data Found</h2>
        <p className="text-muted-foreground">
          We found weight logs saved on this device. Would you like to import them to your account?
        </p>
        {error && (
          <p className="text-sm text-destructive text-center">{error}</p>
        )}
        <div className="space-y-3">
          <Button
            onClick={onMigrate}
            disabled={isSubmitting}
            className="w-full h-12 bg-primary text-black font-bold"
          >
            {isSubmitting ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Yes, Import My Data'}
          </Button>
          <Button
            onClick={onSkip}
            variant="outline"
            className="w-full h-12"
          >
            Start Fresh
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function Landing() {
  const [, setLocation] = useLocation();
  const { hasLocalStorageData, migrateLocalStorageToSupabase, isLoading: storeLoading, profile } = useStore();
  const { user, loading: authLoading, signIn, signUp, signInWithGoogle, resetPassword } = useAuth();
  const { toast } = useToast();

  const [authMode, setAuthMode] = useState<AuthMode>('landing');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [showMigration, setShowMigration] = useState(false);

  // Handle redirects in useEffect to avoid render-time side effects
  useEffect(() => {
    if (!authLoading && !storeLoading && user) {
      if (profile.hasCompletedOnboarding) {
        setLocation('/dashboard');
      } else if (hasLocalStorageData() && !showMigration) {
        // Auto-show migration dialog if localStorage data exists
        setShowMigration(true);
      } else if (!hasLocalStorageData() && !showMigration) {
        setLocation('/onboarding');
      }
    }
  }, [user, authLoading, storeLoading, profile.hasCompletedOnboarding, showMigration]);

  // If logged in and has completed onboarding, go to dashboard
  // If logged in but not onboarded, go to onboarding
  const handleContinue = () => {
    if (hasLocalStorageData()) {
      setShowMigration(true);
    } else {
      setLocation('/onboarding');
    }
  };

  const handleMigrate = async () => {
    setIsSubmitting(true);
    setError(null);
    try {
      await migrateLocalStorageToSupabase();
      setLocation('/dashboard');
    } catch (err) {
      setError('Failed to import data. Please try again or start fresh.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSkipMigration = () => {
    // Clear localStorage and start fresh
    localStorage.clear();
    setLocation('/onboarding');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      if (authMode === 'login') {
        const { error } = await signIn(email, password);
        if (error) {
          setError(error.message);
        } else {
          // Check if they have localStorage data to migrate
          if (hasLocalStorageData()) {
            setShowMigration(true);
          }
          // Auth state change will trigger redirect
        }
      } else if (authMode === 'signup') {
        const { error } = await signUp(email, password);
        if (error) {
          setError(error.message);
        } else {
          setError(null);
          // Show success message - they need to verify email
          setAuthMode('landing');
          toast({
            title: "Check your email",
            description: "We've sent you a confirmation link to verify your account.",
            duration: 5000,
          });
        }
      } else if (authMode === 'forgot') {
        const { error } = await resetPassword(email);
        if (error) {
          setError(error.message);
        } else {
          setResetSent(true);
        }
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // Show loading while checking auth or during redirect
  if (authLoading || storeLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  // Show loading during redirect (user is logged in and onboarded)
  if (user && profile.hasCompletedOnboarding) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  // If logged in but hasn't completed onboarding - show migration dialog if needed
  if (user) {
    if (showMigration) {
      return (
        <MigrationDialog
          onMigrate={handleMigrate}
          onSkip={handleSkipMigration}
          isSubmitting={isSubmitting}
          error={error}
        />
      );
    }

    // Redirecting to onboarding (handled by useEffect)
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  // Auth form (login/signup/forgot)
  if (authMode !== 'landing') {
    return (
      <div className="min-h-screen bg-background text-foreground flex flex-col relative overflow-hidden">
        <div className="relative z-10 flex-1 flex flex-col items-center justify-center p-6">
          <div className="w-full max-w-sm space-y-6">
            <div className="text-center space-y-2">
              <h1 className="text-4xl font-heading font-black italic">PWM</h1>
              <h2 className="text-xl font-bold">
                {authMode === 'login' && 'Welcome Back'}
                {authMode === 'signup' && 'Create Account'}
                {authMode === 'forgot' && 'Reset Password'}
              </h2>
            </div>

            {resetSent ? (
              <div className="text-center space-y-4">
                <p className="text-muted-foreground">
                  Check your email for a password reset link.
                </p>
                <Button
                  onClick={() => { setAuthMode('login'); setResetSent(false); }}
                  variant="outline"
                  className="w-full"
                >
                  Back to Login
                </Button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-3">
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                    <Input
                      type="email"
                      placeholder="Email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="pl-10 h-12 bg-card border-border"
                      required
                    />
                  </div>

                  {authMode !== 'forgot' && (
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                      <Input
                        type={showPassword ? 'text' : 'password'}
                        placeholder="Password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="pl-10 pr-10 h-12 bg-card border-border"
                        required
                        minLength={6}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                      >
                        {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                      </button>
                    </div>
                  )}
                </div>

                {error && (
                  <p className="text-sm text-destructive text-center">{error}</p>
                )}

                <Button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full h-12 bg-primary text-black font-bold"
                >
                  {isSubmitting ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <>
                      {authMode === 'login' && 'Sign In'}
                      {authMode === 'signup' && 'Create Account'}
                      {authMode === 'forgot' && 'Send Reset Link'}
                    </>
                  )}
                </Button>

                <div className="text-center space-y-2">
                  {authMode === 'login' && (
                    <>
                      <button
                        type="button"
                        onClick={() => setAuthMode('forgot')}
                        className="text-sm text-muted-foreground hover:text-foreground"
                      >
                        Forgot password?
                      </button>
                      <p className="text-sm text-muted-foreground">
                        Don't have an account?{' '}
                        <button
                          type="button"
                          onClick={() => setAuthMode('signup')}
                          className="text-primary font-medium"
                        >
                          Sign up
                        </button>
                      </p>
                    </>
                  )}
                  {authMode === 'signup' && (
                    <p className="text-sm text-muted-foreground">
                      Already have an account?{' '}
                      <button
                        type="button"
                        onClick={() => setAuthMode('login')}
                        className="text-primary font-medium"
                      >
                        Sign in
                      </button>
                    </p>
                  )}
                  {authMode === 'forgot' && (
                    <button
                      type="button"
                      onClick={() => setAuthMode('login')}
                      className="text-sm text-muted-foreground hover:text-foreground"
                    >
                      Back to login
                    </button>
                  )}
                </div>
              </form>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Landing page (not logged in)
  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col relative overflow-hidden">
      {/* Background Texture - using CSS gradient as fallback since texture may not exist */}
      <div
        className="absolute inset-0 z-0 opacity-10 pointer-events-none"
        style={{
          backgroundImage: `radial-gradient(circle at 25% 25%, hsl(84 100% 50% / 0.1) 0%, transparent 50%),
                           radial-gradient(circle at 75% 75%, hsl(190 90% 50% / 0.1) 0%, transparent 50%)`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }}
      />

      {/* Content */}
      <div className="relative z-10 flex-1 flex flex-col items-center justify-center p-6 text-center space-y-8 animate-in fade-in duration-1000">
        <div className="space-y-2">
          <div className="inline-block px-3 py-1 rounded-full border border-primary/30 bg-primary/10 text-primary text-xs font-bold tracking-widest uppercase mb-4">
            Performance Weight Management
          </div>
          <h1 className="text-7xl font-heading font-black italic tracking-tighter leading-none">
            PWM
          </h1>
          <p className="text-xl text-muted-foreground font-medium max-w-xs mx-auto">
            Weight is an entry requirement. <br />
            <span className="text-foreground">Performance is the goal.</span>
          </p>
        </div>

        <div className="space-y-3 w-full max-w-xs">
          <Button
            onClick={() => signInWithGoogle()}
            className="w-full h-14 text-lg font-bold bg-white text-gray-800 hover:bg-gray-100 hover:scale-105 transition-transform border border-gray-300"
          >
            <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            Continue with Google
          </Button>
          <div className="flex items-center gap-3">
            <div className="flex-1 h-px bg-muted" />
            <span className="text-xs text-muted-foreground">or</span>
            <div className="flex-1 h-px bg-muted" />
          </div>
          <Button
            onClick={() => setAuthMode('signup')}
            className="w-full h-12 font-bold uppercase tracking-wider bg-primary text-black hover:bg-primary/90"
          >
            Sign Up with Email
          </Button>
          <Button
            onClick={() => setAuthMode('login')}
            variant="ghost"
            className="w-full h-10 text-sm text-muted-foreground"
          >
            Already have an account? Sign In
          </Button>
        </div>
      </div>

      <div className="relative z-10 p-6 text-center">
        <p className="text-[10px] text-muted-foreground/50 uppercase tracking-widest">
          Version 1.0.0 • Prototype
        </p>
      </div>
    </div>
  );
}
