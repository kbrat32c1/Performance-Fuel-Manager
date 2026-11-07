import { useState } from "react";
import { useLocation } from "wouter";
import { Eye, EyeOff, Loader2, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { PASSWORD_RULES_TEXT, validatePassword } from "@/lib/password";

/**
 * Where the password-reset email lands. Supabase signs the person in from the
 * link (detectSessionInUrl), so this page only has to set the new password.
 */
export default function ResetPassword() {
  const { session, loading } = useAuth();
  const [, navigate] = useLocation();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const problem = validatePassword(password) ?? (password !== confirm ? "The two passwords don't match." : null);
    if (problem) { setError(problem); return; }
    setSaving(true);
    setError(null);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setSaving(false);
    if (updateError) { setError(updateError.message || "Couldn't save the new password. Try again."); return; }
    setDone(true);
  };

  return (
    <main className="min-h-screen bg-background flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="bg-white rounded-xl p-1.5 w-14 h-14">
            <img src="/spar-logo.png" alt="SPAR Life" className="w-full h-full object-contain" />
          </div>
          <h1 className="font-heading text-2xl font-bold uppercase italic">Set a new password</h1>
        </div>

        {loading ? (
          <div className="flex justify-center" role="status" aria-label="Checking your reset link">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" aria-hidden="true" />
          </div>
        ) : done ? (
          <div className="space-y-4 text-center">
            <p className="text-muted-foreground">Your password is changed. You're signed in.</p>
            <Button className="w-full h-12 font-bold" onClick={() => navigate("/dashboard")}>Go to SPAR</Button>
          </div>
        ) : !session ? (
          <div className="space-y-4 text-center">
            <p className="text-muted-foreground">
              This reset link has expired or was already used. Ask for a new one from the sign-in screen.
            </p>
            <Button variant="outline" className="w-full h-12" onClick={() => navigate("/")}>Back to sign in</Button>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4" noValidate>
            <div className="space-y-1.5">
              <label htmlFor="new-password" className="block text-sm font-medium">New password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" aria-hidden="true" />
                <Input
                  id="new-password"
                  type={show ? "text" : "password"}
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pl-10 pr-12 h-12 bg-card border-border"
                  aria-describedby={["new-password-rules", error ? "reset-error" : ""].filter(Boolean).join(" ")}
                  aria-invalid={error ? true : undefined}
                  required
                  minLength={12}
                />
                <button
                  type="button"
                  onClick={() => setShow(!show)}
                  aria-label={show ? "Hide password" : "Show password"}
                  aria-pressed={show}
                  className="absolute right-1 top-1/2 -translate-y-1/2 flex h-11 w-11 items-center justify-center rounded-md text-muted-foreground hover:text-foreground"
                >
                  {show ? <EyeOff className="w-5 h-5" aria-hidden="true" /> : <Eye className="w-5 h-5" aria-hidden="true" />}
                </button>
              </div>
              <p id="new-password-rules" className="text-xs text-muted-foreground">{PASSWORD_RULES_TEXT}</p>
            </div>
            <div className="space-y-1.5">
              <label htmlFor="confirm-password" className="block text-sm font-medium">Type it again</label>
              <Input
                id="confirm-password"
                type={show ? "text" : "password"}
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                className="h-12 bg-card border-border"
                aria-invalid={error ? true : undefined}
                required
              />
            </div>
            {error && <p id="reset-error" role="alert" className="text-sm text-destructive">{error}</p>}
            <Button type="submit" disabled={saving} className="w-full h-12 font-bold">
              {saving ? "Saving…" : "Save new password"}
            </Button>
          </form>
        )}
      </div>
    </main>
  );
}
