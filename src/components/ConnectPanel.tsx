import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { CheckCircle2, XCircle, Plug, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { autoConnectTelegram, resetChatStructure } from "@/lib/ops.functions";

type Step = { key: string; label: string; ok: boolean; detail: string };
type Result = {
  steps: Step[];
  bot: { username: string; link: string } | null;
  chats: { chatId: string; title: string; type: string }[];
  assigned: { community: string; shop: string; control: string } | null;
};

export function ConnectPanel({
  defaultBaseUrl,
  disabled,
  onConnected,
}: {
  defaultBaseUrl: string;
  disabled?: boolean;
  onConnected?: (v: { community: string; shop: string; control: string }) => void;
}) {
  const connectFn = useServerFn(autoConnectTelegram);
  const resetFn = useServerFn(resetChatStructure);
  const [res, setRes] = useState<Result | null>(null);

  const connect = useMutation({
    mutationFn: () => connectFn({ data: { baseUrl: defaultBaseUrl, sendTest: false } }),
    onSuccess: (r: any) => {
      setRes(r as Result);
      if (r.assigned) onConnected?.(r.assigned);
      const failed = (r.steps as Step[]).filter((s) => !s.ok);
      if (failed.length === 0) toast.success("Telegram ist verbunden");
      else toast.message(failed[0]!.detail || "Verbindung teilweise eingerichtet");
    },
    onError: (e: any) => toast.error(e?.message ?? "Verbindung fehlgeschlagen"),
  });

  const reset = useMutation({
    mutationFn: () => resetFn({ data: undefined as never }),
    onSuccess: () => {
      setRes(null);
      onConnected?.({ community: "", shop: "", control: "" });
      toast.success("Kanal-Zuordnung zurückgesetzt");
    },
    onError: (e: any) => toast.error(e?.message ?? "Zurücksetzen fehlgeschlagen"),
  });

  useEffect(() => {
    connect.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fullyConnected = Boolean(res?.assigned?.community && res?.assigned?.shop && res?.assigned?.control && res?.steps.every((s) => s.ok));

  return (
    <div className="panel space-y-4 p-6">
      <div className="flex items-center gap-2">
        <Plug className="size-4 text-primary" />
        <h2 className="text-lg font-semibold">Telegram-Verbindung</h2>
      </div>
      <p className="text-sm text-muted-foreground">
        Live-Status von Bot, Webhook und Community/Shop/Kontrollraum. Die Prüfung läuft direkt über die aktuelle Vercel-Serverlogik.
      </p>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className={fullyConnected ? "text-sm font-medium text-emerald-500" : "text-sm text-muted-foreground"}>
          {connect.isPending ? "Status wird geprüft…" : fullyConnected ? "Telegram vollständig verbunden · 3/3 Ziele bereit" : "Verbindung noch nicht vollständig"}
        </p>
        <Button disabled={disabled || connect.isPending} onClick={() => connect.mutate()} className="gap-2" variant="secondary">
          {connect.isPending ? <Loader2 className="size-4 animate-spin" /> : <Plug className="size-4" />}
          Neu prüfen
        </Button>
      </div>

      <div>
        <Button variant="ghost" size="sm" disabled={disabled || reset.isPending} onClick={() => reset.mutate()}>
          {reset.isPending ? "Setze zurück…" : "Zuordnung zurücksetzen"}
        </Button>
      </div>

      {res ? (
        <ul className="divide-y divide-border">
          {res.steps.map((s) => (
            <li key={s.key} className="flex items-start gap-2 py-2">
              {s.ok ? (
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-500" />
              ) : (
                <XCircle className="mt-0.5 size-4 shrink-0 text-destructive" />
              )}
              <div className="min-w-0">
                <p className="text-sm font-medium">{s.label}</p>
                <p className="break-words text-xs text-muted-foreground">{s.detail}</p>
              </div>
            </li>
          ))}
        </ul>
      ) : null}

      {res?.bot?.username ? (
        <a className="text-xs underline" href={res.bot.link} target="_blank" rel="noreferrer">
          Bot öffnen: @{res.bot.username}
        </a>
      ) : null}
    </div>
  );
}
