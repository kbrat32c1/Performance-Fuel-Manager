import { useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowRight, Loader2, Mail, Lock, Eye, EyeOff } from "lucide-react";
import { useStore } from "@/lib/store";
import { useAuth } from "@/lib/auth";

type AuthMode = 'landing' | 'login' | 'signup' | 'forgot';

export default function Landing() {
  const [, setLocation] = useLocation();
  const { updateProfile, hasLocalStorageData, migrateLocalStorageToSupabase, isLoading: storeLoading } = useStore();
  const { user, loading: authLoading, signIn, signUp, resetPassword } = useAuth();

  const [authMode, setAuthMode] = useState<AuthMode>('landing');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [showMigration, setShowMigration] = useState(false);

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
          alert('Check your email to confirm your account!');
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

  const { profile } = useStore();

  // Show loading while checking auth
  if (authLoading || storeLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  // If logged in and completed onboarding, go straight to dashboard
  if (user && profile.hasCompletedOnboarding) {
    setLocation('/dashboard');
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  // If logged in but hasn't completed onboarding
  if (user) {
    if (showMigration) {
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
                onClick={handleMigrate}
                disabled={isSubmitting}
                className="w-full h-12 bg-primary text-black font-bold"
              >
                {isSubmitting ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Yes, Import My Data'}
              </Button>
              <Button
                onClick={handleSkipMigration}
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

    // Check for localStorage data to migrate
    if (hasLocalStorageData()) {
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
                onClick={handleMigrate}
                disabled={isSubmitting}
                className="w-full h-12 bg-primary text-black font-bold"
              >
                {isSubmitting ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Yes, Import My Data'}
              </Button>
              <Button
                onClick={handleSkipMigration}
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

    // New user, needs onboarding
    setLocation('/onboarding');
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
      {/* Background Texture */}
      <div
        className="absolute inset-0 z-0 opacity-20 pointer-events-none"
        style={{
          backgroundImage: `url(/src/assets/bg-texture.png)`,
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
            onClick={() => setAuthMode('signup')}
            className="w-full h-14 text-lg font-bold uppercase tracking-wider bg-primary text-black hover:bg-primary/90 hover:scale-105 transition-transform"
          >
            Get Started <ArrowRight className="ml-2 w-5 h-5" />
          </Button>
          <Button
            onClick={() => setAuthMode('login')}
            variant="outline"
            className="w-full h-12 font-medium"
          >
            Sign In
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
