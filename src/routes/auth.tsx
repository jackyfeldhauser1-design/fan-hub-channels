import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import { useAuth } from "@/lib/useAuth";
import { logLoginAttempt } from "@/lib/auth-log.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { name: "robots", content: "noindex, nofollow" },
      { title: "Login – Telegram Fan Funnel Studio" },
      { name: "description", content: "Melde dich an, um deinen Telegram-Verkaufsfunnel, Inhalte und Affiliate-Provisionen zu verwalten." },
      { property: "og:title", content: "Login – Telegram Fan Funnel Studio" },
      { property: "og:description", content: "Zugang zum Verwaltungsbereich deines Telegram-Bots." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const { session, loading } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [mfa, setMfa] = useState<{ factorId: string } | null>(null);
  const [otp, setOtp] = useState("");
  const logAttempt = useServerFn(logLoginAttempt);

  function log(success: boolean, method: "password" | "google" | "2fa", reason = "") {
    void logAttempt({ data: { email, success, method, reason } }).catch(() => {});
  }

  useEffect(() => {
    if (!loading && session && !mfa) navigate({ to: "/" });
  }, [loading, session, mfa, navigate]);

  /** Nach dem Passwort-Login prüfen, ob noch ein 2FA-Code nötig ist. */
  async function continueAfterSignIn(method: "password" | "google") {
    const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (aal && aal.nextLevel === "aal2" && aal.nextLevel !== aal.currentLevel) {
      const { data: factors } = await supabase.auth.mfa.listFactors();
      const factor = (factors?.totp ?? []).find((f) => f.status === "verified");
      if (factor) {
        setMfa({ factorId: factor.id });
        return;
      }
    }
    log(true, method);
    navigate({ to: "/" });
  }

  async function submitOtp(e: React.FormEvent) {
    e.preventDefault();
    if (!mfa) return;
    setBusy(true);
    try {
      const challenge = await supabase.auth.mfa.challenge({ factorId: mfa.factorId });
      if (challenge.error) throw challenge.error;
      const { error } = await supabase.auth.mfa.verify({
        factorId: mfa.factorId,
        challengeId: challenge.data.id,
        code: otp.trim(),
      });
      if (error) throw error;
      log(true, "2fa");
      setMfa(null);
      navigate({ to: "/" });
    } catch (err) {
      log(false, "2fa", err instanceof Error ? err.message : "2FA fehlgeschlagen");
      toast.error(err instanceof Error ? err.message : "Code ungültig");
    } finally {
      setBusy(false);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        log(false, "password", error.message);
        throw error;
      }
      await continueAfterSignIn("password");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Anmeldung fehlgeschlagen");
    } finally {
      setBusy(false);
    }
  }


  return (
    <div className="grid min-h-screen place-items-center px-4 py-12">
      <div className="panel w-full max-w-md p-8">
        <span className="grid size-11 place-items-center rounded-xl gold-surface">
          <Sparkles className="size-5" />
        </span>
        <h1 className="mt-5 text-2xl font-bold">Fan Funnel Studio</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Interner Teamzugang. Kunden werden ausschließlich über Telegram-Bots, Gruppen und Channels gesteuert.
        </p>

        {mfa ? (
          <form onSubmit={submitOtp} className="mt-6 space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="otp">Zwei-Faktor-Code</Label>
              <Input
                id="otp"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                required
                value={otp}
                onChange={(e) => setOtp(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">6-stelliger Code aus deiner Authenticator-App.</p>
            </div>
            <Button type="submit" className="w-full" disabled={busy}>
              Bestätigen
            </Button>
          </form>
        ) : (
          <>
            <form onSubmit={submit} className="mt-6 space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="email">E-Mail</Label>
                <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="password">Passwort</Label>
                <Input
                  id="password"
                  type="password"
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
              <Button type="submit" className="w-full" disabled={busy}>
                Anmelden
              </Button>
            </form>
          </>
        )}

      </div>
    </div>
  );
}
