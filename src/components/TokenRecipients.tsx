import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { BellRing } from "lucide-react";
import { getTokenRecipients, setTokenRecipients } from "@/lib/notifications.functions";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

/** Legt fest, wer bei Ereignissen zu genau diesem Zugang benachrichtigt wird. */
export function TokenRecipients({ tokenId, disabled }: { tokenId: string; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string[] | null>(null);
  const loadFn = useServerFn(getTokenRecipients);
  const saveFn = useServerFn(setTokenRecipients);

  const { data } = useQuery({
    queryKey: ["token-recipients", tokenId],
    queryFn: async () => {
      const res = await loadFn({ data: { tokenId } });
      setSelected(res.selected);
      return res;
    },
    enabled: open,
  });

  const current: string[] = selected ?? (data?.selected as string[] | undefined) ?? [];

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="ghost" title="Benachrichtigungs-Empfänger">
          <BellRing className="size-4" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Empfänger für diesen Zugang</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Zusätzlich zu den Standard-Empfängern werden diese Personen bei Ablauf, offener Zahlung, Sperrung oder
          Neuaktivierung dieses Zugangs benachrichtigt.
        </p>
        <div className="mt-2 divide-y divide-border/60">
          {((data?.recipients ?? []) as any[]).map((r) => (
            <label key={r.id} className="flex items-center justify-between gap-3 py-3 text-sm">
              <span>
                {r.label}
                <span className="ml-2 text-xs text-muted-foreground">
                  {r.channel}
                  {r.isDefault ? " · Standard" : ""}
                  {r.active ? "" : " · pausiert"}
                </span>
              </span>
              <Switch
                checked={current.includes(r.id)}
                disabled={disabled}
                onCheckedChange={(v) =>
                  setSelected(v ? [...current, r.id] : current.filter((id) => id !== r.id))
                }
              />
            </label>
          ))}
          {(data?.recipients ?? []).length === 0 ? (
            <p className="py-4 text-sm text-muted-foreground">
              Noch keine Empfänger angelegt – unter „Benachrichtigungen“ hinzufügen.
            </p>
          ) : null}
        </div>
        <Button
          className="mt-2"
          disabled={disabled}
          onClick={async () => {
            try {
              await saveFn({ data: { tokenId, recipientIds: current } });
              toast.success("Empfänger gespeichert");
              setOpen(false);
            } catch (e) {
              toast.error(e instanceof Error ? e.message : "Speichern fehlgeschlagen");
            }
          }}
        >
          Speichern
        </Button>
      </DialogContent>
    </Dialog>
  );
}
