import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ShieldCheck, ShieldAlert, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAdmin } from "@/lib/useAdmin";
import { DashLayout } from "@/components/DashLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/zwei-faktor")({
  head: () => ({
    meta: [
      { name: "robots", content: "noindex, nofollow" },
      { title: "Zwei-Faktor-Schutz – Fan Funnel Studio" },
      { name: "description", content: "Aktiviere 2FA für Admin- und Operator-Konten." },
    ],
  }),
  component: TwoFactorPage,
});

type Factor = { id: string; friendly_name?: string | null; status: string };

function TwoFactorPage() {
  const { role, canOperate, ready, session } = useAdmin();
  const [factors, setFactors] = useState<Factor[]>([]);
  const [enroll, setEnroll] = useState<{ id: string; qr: string; secret: string } | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  async function refresh() {
    const { data } = await supabase.auth.mfa.listFactors();
    setFactors((data?.totp ?? []) as Factor[]);
  }

  useEffect(() => {
    if (session) void refresh();
  }, [session]);

  const active = factors.filter((f) => f.status === "verified");

  async function startEnroll() {
    setBusy(true);
    try {
      const { data, error } = await supabase.auth.mfa.enroll({
        factorType: "totp",
        friendlyName: `Studio ${new Date().toLocaleDateString("de-DE")}`,
      });
      if (error) throw error;
      setEnroll({ id: data.id, qr: data.totp.qr_code, secret: data.totp.secret });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "2FA konnte nicht gestartet werden");
    } finally {
      setBusy(false);
    }
  }

  async function confirmEnroll(e: React.FormEvent) {
    e.preventDefault();
    if (!enroll) return;
    setBusy(true);
    try {
      const challenge = await supabase.auth.mfa.challenge({ factorId: enroll.id });
      if (challenge.error) throw challenge.error;
      const { error } = await supabase.auth.mfa.verify({
        factorId: enroll.id,
        challengeId: challenge.data.id,
        code: code.trim(),
      });
      if (error) throw error;
      toast.success("Zwei-Faktor-Schutz ist aktiv.");
      setEnroll(null);
      setCode("");
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Code ungültig");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    if (!confirm("2FA für dieses Konto wirklich entfernen?")) return;
    const { error } = await supabase.auth.mfa.unenroll({ factorId: id });
    if (error) toast.error(error.message);
    else {
      toast.success("2FA entfernt.");
      await refresh();
    }
  }

  return (
    <DashLayout title="Zwei-Faktor-Schutz" subtitle="Zusätzliche Absicherung für Admin- und Operator-Konten">
      {!ready ? (
        <p className="text-sm text-muted-foreground">Lade…</p>
      ) : !canOperate ? (
        <div className="panel p-6">
          <h2 className="text-lg font-semibold">Kein Zugriff</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            2FA lässt sich nur für Admin- und Operator-Konten einrichten. Deine Rolle: {role ?? "keine"}.
          </p>
        </div>
      ) : (
        <div className="grid gap-5 lg:grid-cols-2">
          <section className="panel p-6">
            <div className="flex items-center gap-3">
              <span className="grid size-10 place-items-center rounded-xl gold-surface">
                {active.length ? <ShieldCheck className="size-5" /> : <ShieldAlert className="size-5" />}
              </span>
              <div>
                <h2 className="text-lg font-semibold">
                  {active.length ? "2FA aktiv" : "2FA nicht aktiv"}
                </h2>
                <p className="text-sm text-muted-foreground">
                  {active.length
                    ? "Beim Login wird zusätzlich ein 6-stelliger Code aus deiner Authenticator-App verlangt."
                    : "Schütze deinen Zugang mit einer Authenticator-App (z. B. Google Authenticator, 1Password)."}
                </p>
              </div>
            </div>

            {active.length > 0 && (
              <ul className="mt-5 space-y-2">
                {active.map((f) => (
                  <li key={f.id} className="flex items-center justify-between rounded-lg border border-border/60 px-3 py-2">
                    <span className="text-sm">{f.friendly_name || "Authenticator"}</span>
                    <Button size="sm" variant="ghost" onClick={() => remove(f.id)}>
                      <Trash2 className="size-4" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}

            {!enroll && (
              <Button className="mt-5" onClick={startEnroll} disabled={busy}>
                {active.length ? "Weiteres Gerät hinzufügen" : "2FA jetzt aktivieren"}
              </Button>
            )}
          </section>

          {enroll && (
            <section className="panel p-6">
              <h2 className="text-lg font-semibold">Authenticator koppeln</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Scanne den QR-Code oder gib den Schlüssel manuell ein und bestätige mit dem 6-stelligen Code.
              </p>
              <img src={enroll.qr} alt="QR-Code zur 2FA-Einrichtung" className="mt-4 size-48 rounded-lg bg-white p-2" />
              <p className="mt-3 break-all font-mono text-xs text-muted-foreground">{enroll.secret}</p>
              <form onSubmit={confirmEnroll} className="mt-4 space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="code">Bestätigungscode</Label>
                  <Input
                    id="code"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    required
                  />
                </div>
                <div className="flex gap-2">
                  <Button type="submit" disabled={busy}>
                    Bestätigen
                  </Button>
                  <Button type="button" variant="outline" onClick={() => setEnroll(null)}>
                    Abbrechen
                  </Button>
                </div>
              </form>
            </section>
          )}
        </div>
      )}
    </DashLayout>
  );
}
