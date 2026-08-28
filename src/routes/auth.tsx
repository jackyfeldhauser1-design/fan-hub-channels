import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { useAuth } from "@/lib/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
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
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && session) navigate({ to: "/" });
  }, [loading, session, navigate]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "login") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        navigate({ to: "/" });
      } else {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: window.location.origin },
        });
        if (error) throw error;
        toast.success("Konto erstellt. Du kannst dich jetzt anmelden.");
        setMode("login");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Anmeldung fehlgeschlagen");
    } finally {
      setBusy(false);
    }
  }

  async function google() {
    const result = await lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin });
    if (result.error) {
      toast.error("Google-Anmeldung fehlgeschlagen");
      return;
    }
    if (result.redirected) return;
    navigate({ to: "/" });
  }

  return (
    <div className="grid min-h-screen place-items-center px-4 py-12">
      <div className="panel w-full max-w-md p-8">
        <span className="grid size-11 place-items-center rounded-xl gold-surface">
          <Sparkles className="size-5" />
        </span>
        <h1 className="mt-5 text-2xl font-bold">Fan Funnel Studio</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Verwalte deine Telegram-Kette: Gratis-Gruppe, VIP-Zugang, Stars & TON.
        </p>

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
            {mode === "login" ? "Anmelden" : "Konto erstellen"}
          </Button>
        </form>

        <Button variant="outline" className="mt-3 w-full" onClick={google}>
          Mit Google fortfahren
        </Button>

        <button
          className="mt-5 w-full text-center text-sm text-muted-foreground underline-offset-4 hover:underline"
          onClick={() => setMode(mode === "login" ? "signup" : "login")}
        >
          {mode === "login" ? "Noch kein Konto? Jetzt registrieren" : "Schon registriert? Anmelden"}
        </button>
      </div>
    </div>
  );
}
