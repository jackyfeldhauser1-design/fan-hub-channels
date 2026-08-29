import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { CheckCircle2, XCircle, Wand2, Send, ArrowRight, Radar } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { validateChatIdsInput, saveChatIdsWithTest, discoverTelegramChats } from "@/lib/ops.functions";

type Check = { key: string; label: string; chatId: string; ok: boolean; title: string; type: string; canPost: boolean; error: string };
type Found = {
  bot: { username: string; name: string; link: string } | null;
  error: string;
  updatesNote: string;
  chats: { chatId: string; title: string; type: string }[];
  current: { community: string; shop: string; control: string };
};
type Post = { key: string; label: string; chatId: string; title: string; ok: boolean; error: string };

const FIELDS = [
  { key: "community", label: "Chat-ID Community", short: "Community", placeholder: "-100…" },
  { key: "shop", label: "Chat-ID Shop", short: "Shop", placeholder: "-100…" },
  { key: "control", label: "Chat-ID Kontrollraum", short: "Kontrolle", placeholder: "z. B. deine Telegram-ID" },
] as const;

function Row({ label, ok, detail }: { label: string; ok: boolean; detail: string }) {
  return (
    <li className="flex items-start gap-2 py-2">
      {ok ? (
        <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-500" />
      ) : (
        <XCircle className="mt-0.5 size-4 shrink-0 text-destructive" />
      )}
      <div className="min-w-0">
        <p className="text-sm font-medium">{label}</p>
        <p className="break-words text-xs text-muted-foreground">{detail}</p>
      </div>
    </li>
  );
}

export function ChatSetupWizard({
  initial,
  disabled,
  onSaved,
}: {
  initial: { community: string; shop: string; control: string };
  disabled?: boolean;
  onSaved?: (v: { community: string; shop: string; control: string }) => void;
}) {
  const validateFn = useServerFn(validateChatIdsInput);
  const saveFn = useServerFn(saveChatIdsWithTest);

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [ids, setIds] = useState(initial);
  const [message, setMessage] = useState("");
  const [checks, setChecks] = useState<Check[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [found, setFound] = useState<Found | null>(null);

  const discoverFn = useServerFn(discoverTelegramChats);
  const discover = useMutation({
    mutationFn: () => discoverFn({ data: undefined as never }),
    onSuccess: (res: any) => {
      setFound(res as Found);
      if (res.chats?.length) toast.success(`${res.chats.length} Chat(s) erkannt`);
      else toast.message(res.error || res.updatesNote || "Keine Chats gefunden");
    },
    onError: (e: any) => toast.error(e?.message ?? "Erkennung fehlgeschlagen"),
  });

  const validate = useMutation({
    mutationFn: () => validateFn({ data: ids }),
    onSuccess: (res: any) => {
      setChecks(res.results.filter((r: Check) => r.chatId.trim()));
      setStep(2);
      if (!res.allOk) toast.error("Mindestens eine Chat-ID ist nicht erreichbar");
      else toast.success("Alle eingetragenen Chats erreichbar");
    },
    onError: (e: any) => toast.error(e?.message ?? "Prüfung fehlgeschlagen"),
  });

  const saveAndTest = useMutation({
    mutationFn: () => saveFn({ data: { ...ids, message } }),
    onSuccess: (res: any) => {
      setPosts(res.posts);
      setStep(3);
      const failed = res.posts.filter((p: Post) => !p.ok).length;
      if (failed) toast.error(`${failed} Testpost(s) fehlgeschlagen`);
      else toast.success("Gespeichert und Testposts gesendet");
      onSaved?.(ids);
    },
    onError: (e: any) => toast.error(e?.message ?? "Speichern fehlgeschlagen"),
  });

  const allOk = checks.length > 0 && checks.every((c) => c.ok);

  return (
    <div className="panel space-y-4 p-6">
      <div className="flex items-center gap-2">
        <Wand2 className="size-4 text-primary" />
        <h2 className="text-lg font-semibold">Gruppen-Assistent</h2>
        <span className="ml-auto text-xs text-muted-foreground">Schritt {step} von 3</span>
      </div>
      <p className="text-sm text-muted-foreground">
        Chat-IDs eintragen, gegen Telegram prüfen und direkt nach dem Speichern einen Testpost in jede Gruppe senden.
      </p>

      {step === 1 ? (
        <div className="space-y-4">
          <div className="rounded-lg border border-border bg-muted/40 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="secondary" size="sm" disabled={disabled || discover.isPending} onClick={() => discover.mutate()} className="gap-2">
                <Radar className="size-4" />
                {discover.isPending ? "Suche…" : "Telegram-Infos automatisch erkennen"}
              </Button>
              {found?.bot?.username ? (
                <a className="text-xs underline" href={found.bot.link} target="_blank" rel="noreferrer">
                  Bot: @{found.bot.username}
                </a>
              ) : null}
            </div>
            {found?.chats?.length ? (
              <ul className="mt-3 space-y-2">
                {found.chats.map((c: Found["chats"][number]) => (
                  <li key={c.chatId} className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="min-w-0 flex-1 truncate">
                      {c.title || "ohne Titel"} <span className="text-xs text-muted-foreground">({c.type} · {c.chatId})</span>
                    </span>
                    {FIELDS.map((f) => (
                      <Button
                        key={f.key}
                        size="sm"
                        variant="outline"
                        onClick={() => setIds({ ...ids, [f.key]: c.chatId })}
                      >
                        → {f.short}
                      </Button>
                    ))}
                  </li>
                ))}
              </ul>
            ) : null}
            <p className="mt-2 text-xs text-muted-foreground">
              {found?.error || found?.updatesNote ||
                "Bot in die Gruppe/Kanal aufnehmen (als Admin), dort eine Nachricht senden und hier erkennen lassen – die Chat-ID wird automatisch eingesetzt."}
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            {FIELDS.map((f) => (
              <div key={f.key} className="space-y-1.5">
                <Label>{f.label}</Label>
                <Input
                  value={(ids as any)[f.key]}
                  onChange={(e) => setIds({ ...ids, [f.key]: e.target.value })}
                  placeholder={f.placeholder}
                  inputMode="text"
                  autoCapitalize="none"
                  autoCorrect="off"
                />
              </div>
            ))}
          </div>

          <div className="space-y-1.5">
            <Label>Text des Testposts (optional)</Label>
            <Textarea
              rows={2}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="✅ Testpost aus dem Bot-Setup…"
            />
          </div>
          <Button disabled={disabled || validate.isPending} onClick={() => validate.mutate()} className="gap-2">
            {validate.isPending ? "Prüfe…" : "Chat-IDs prüfen"} <ArrowRight className="size-4" />
          </Button>
        </div>
      ) : null}

      {step === 2 ? (
        <div className="space-y-4">
          <ul className="divide-y divide-border">
            {checks.map((c) => (
              <Row
                key={c.key}
                label={`${c.label} · ${c.chatId}`}
                ok={c.ok && c.canPost}
                detail={c.ok ? `${c.title || "ohne Titel"} (${c.type})${c.error ? ` · ${c.error}` : " · Bot darf posten"}` : c.error}
              />
            ))}
          </ul>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => setStep(1)}>
              Zurück
            </Button>
            <Button disabled={!allOk || saveAndTest.isPending} onClick={() => saveAndTest.mutate()} className="gap-2">
              <Send className="size-4" />
              {saveAndTest.isPending ? "Sende…" : "Speichern & Testpost senden"}
            </Button>
          </div>
          {!allOk ? (
            <p className="text-xs text-muted-foreground">
              Füge den Bot als Administrator zur Gruppe hinzu und prüfe erneut. Für den Kontrollraum musst du dem Bot einmal
              /start geschrieben haben.
            </p>
          ) : null}
        </div>
      ) : null}

      {step === 3 ? (
        <div className="space-y-4">
          <ul className="divide-y divide-border">
            {posts.map((p) => (
              <Row
                key={p.key}
                label={`${p.label} · ${p.title || p.chatId}`}
                ok={p.ok}
                detail={p.ok ? "Testpost zugestellt und im Zustellprotokoll erfasst" : p.error}
              />
            ))}
          </ul>
          <Button variant="secondary" onClick={() => setStep(1)}>
            Erneut ausführen
          </Button>
        </div>
      ) : null}
    </div>
  );
}
