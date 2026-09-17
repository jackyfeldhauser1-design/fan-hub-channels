import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { CheckCircle2, Circle, Loader2, KeyRound, ExternalLink, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { saveBotToken, startGuidedSetup, getSetupProgress, resetGuidedSetup } from "@/lib/setup.functions";

type LinkItem = {
  target: string;
  label: string;
  hint: string;
  suggestedName: string;
  code: string;
  link: string;
};

export function GuidedSetupWizard() {
  const saveToken = useServerFn(saveBotToken);
  const startFn = useServerFn(startGuidedSetup);
  const progressFn = useServerFn(getSetupProgress);
  const resetFn = useServerFn(resetGuidedSetup);

  const [token, setToken] = useState("");
  const [links, setLinks] = useState<LinkItem[]>([]);

  const progress = useQuery({
    queryKey: ["setupProgress"],
    queryFn: () => progressFn({ data: undefined as never }),
    refetchInterval: links.length > 0 ? 3000 : 15000,
    retry: false,
  });

  const tokenMut = useMutation({
    mutationFn: () =>
      saveToken({
        data: { token: token.trim(), baseUrl: typeof window !== "undefined" ? window.location.origin : undefined },
      }),
    onSuccess: (r: any) => {
      setToken("");
      progress.refetch();
      toast.success(`Bot @${r.username} verbunden${r.webhookUrl ? " – Webhook aktiv" : ""}`);
      if (r.webhookError) toast.message(r.webhookError);
    },
    onError: (e: any) => toast.error(e?.message ?? "Token konnte nicht gespeichert werden"),
  });

  const startMut = useMutation({
    mutationFn: () => startFn({ data: { targets: ["community", "shop", "control"] } }),
    onSuccess: (r: any) => {
      setLinks(r.targets as LinkItem[]);
      toast.success("Setup-Links erstellt – 30 Minuten gültig");
    },
    onError: (e: any) => toast.error(e?.message ?? "Setup konnte nicht gestartet werden"),
  });

  const resetMut = useMutation({
    mutationFn: () => resetFn({ data: undefined as never }),
    onSuccess: () => {
      setLinks([]);
      progress.refetch();
      toast.success("Zuordnung zurückgesetzt");
    },
    onError: (e: any) => toast.error(e?.message ?? "Zurücksetzen fehlgeschlagen"),
  });

  const p = progress.data;
  const botConnected = Boolean(p?.botUsername);

  return (
    <div className="panel space-y-6 p-6">
      <div>
        <h2 className="text-lg font-semibold">Struktur in 60 Sekunden einrichten</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Token eintragen, dann pro Ziel einmal tippen. Sobald der Bot im Chat ist, wird alles automatisch zugeordnet,
          geprüft und begrüßt.
        </p>
      </div>

      {/* Schritt 1 – Token */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <KeyRound className="size-4 text-primary" />
          <h3 className="text-sm font-semibold">Schritt 1 · Bot-Token</h3>
          {botConnected ? <span className="text-xs text-emerald-500">@{p?.botUsername} verbunden</span> : null}
        </div>
        <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
          <div className="space-y-1.5">
            <Label htmlFor="bot-token">Bestehender Bot-Token von BotFather</Label>
            <Input
              id="bot-token"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              type="password"
              autoComplete="off"
              placeholder="123456789:AA..."
            />
          </div>
          <Button disabled={!token.trim() || tokenMut.isPending} onClick={() => tokenMut.mutate()} className="gap-2">
            {tokenMut.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
            Speichern & prüfen
          </Button>
        </div>
      </section>

      {/* Schritt 2 – Ziele anlegen */}
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-sm font-semibold">Schritt 2 · Kanäle anlegen</h3>
          <Button
            variant="secondary"
            size="sm"
            disabled={!botConnected || startMut.isPending}
            onClick={() => startMut.mutate()}
          >
            {startMut.isPending ? <Loader2 className="size-4 animate-spin" /> : "Setup-Links erzeugen"}
          </Button>
        </div>

        <ul className="space-y-3">
          {(p?.items ?? []).map((item: any) => {
            const link = links.find((l) => l.target === item.target);
            return (
              <li key={item.target} className="rounded-lg border border-border p-4">
                <div className="flex items-start gap-3">
                  {item.connected ? (
                    <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-500" />
                  ) : (
                    <Circle className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{item.label}</p>
                    <p className="text-xs text-muted-foreground">{item.hint}</p>
                    {item.connected ? (
                      <p className="mt-1 break-all text-xs text-emerald-500">
                        Verbunden {item.chatTitle ? `· ${item.chatTitle}` : ""} ({item.chatId})
                      </p>
                    ) : link ? (
                      <div className="mt-2 space-y-2">
                        <p className="text-xs text-muted-foreground">
                          {item.target === "control"
                            ? "Link öffnen und im Bot auf „Start“ tippen."
                            : `Link öffnen, „Neue Gruppe“ wählen, Name z. B. „${link.suggestedName}“, bestätigen.`}
                        </p>
                        <Button asChild size="sm" className="gap-2">
                          <a href={link.link} target="_blank" rel="noreferrer">
                            <ExternalLink className="size-4" />
                            In Telegram öffnen
                          </a>
                        </Button>
                        <p className="text-xs text-muted-foreground">Warte auf Chat… (Code {link.code})</p>
                      </div>
                    ) : (
                      <p className="mt-1 text-xs text-muted-foreground">
                        {item.detail || "Noch nicht verbunden – Setup-Links erzeugen."}
                      </p>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>

        <div className="flex items-center justify-between gap-3 pt-2">
          <p className="text-sm text-muted-foreground">
            {p ? `${p.connected}/${p.total} verbunden` : "Status wird geladen…"}
          </p>
          <Button variant="ghost" size="sm" className="gap-2" disabled={resetMut.isPending} onClick={() => resetMut.mutate()}>
            <RotateCcw className="size-4" />
            Neu einrichten
          </Button>
        </div>
      </section>
    </div>
  );
}
