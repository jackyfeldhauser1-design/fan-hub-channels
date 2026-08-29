import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, XCircle, AlertTriangle, Send, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { verifyConfiguredChats } from "@/lib/ops.functions";

type Row = {
  key: string;
  label: string;
  chatId: string;
  configured: boolean;
  reachable: boolean;
  canPost: boolean;
  title: string;
  type: string;
  error: string;
  testSent: boolean | null;
  testError: string;
};

export function ChatHealthPanel({ enabled = true }: { enabled?: boolean }) {
  const verifyFn = useServerFn(verifyConfiguredChats);

  const q = useQuery({
    queryKey: ["chat-health"],
    queryFn: () => verifyFn({ data: { sendTest: false, message: "" } }),
    enabled,
    refetchOnWindowFocus: false,
  });

  const test = useMutation({
    mutationFn: () => verifyFn({ data: { sendTest: true, message: "" } }),
    onSuccess: (res) => {
      const ok = res.results.filter((r: Row) => r.testSent === true).length;
      toast.success(`Testpost gesendet: ${ok} von ${res.results.filter((r: Row) => r.configured).length} Chats`);
      q.refetch();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rows = ((test.data?.results ?? q.data?.results ?? []) as Row[]);

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div>
          <CardTitle className="text-base">Chat-Verbindungsstatus</CardTitle>
          <CardDescription>
            Automatische Prüfung, ob der Bot in Community, Shop und Kontrollraum Mitglied ist und posten darf.
          </CardDescription>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => q.refetch()} disabled={q.isFetching}>
            <RefreshCw className={`mr-2 h-4 w-4 ${q.isFetching ? "animate-spin" : ""}`} />
            Prüfen
          </Button>
          <Button size="sm" onClick={() => test.mutate()} disabled={test.isPending}>
            <Send className="mr-2 h-4 w-4" />
            {test.isPending ? "Sende…" : "Testpost"}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {q.isLoading && <p className="text-sm text-muted-foreground">Prüfe Chats…</p>}
        {rows.map((r) => {
          const state = !r.configured ? "missing" : r.reachable && r.canPost ? "ok" : "fail";
          return (
            <div key={r.key} className="rounded-lg border p-3">
              <div className="flex flex-wrap items-center gap-2">
                {state === "ok" ? (
                  <CheckCircle2 className="h-4 w-4 text-primary" />
                ) : state === "missing" ? (
                  <AlertTriangle className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <XCircle className="h-4 w-4 text-destructive" />
                )}
                <span className="font-medium">{r.label}</span>
                {r.title && <span className="text-sm text-muted-foreground">{r.title}</span>}
                {r.chatId && <Badge variant="secondary">{r.chatId}</Badge>}
                {r.type && <Badge variant="outline">{r.type}</Badge>}
                {r.testSent === true && <Badge>Testpost ok</Badge>}
                {r.testSent === false && <Badge variant="destructive">Testpost fehlgeschlagen</Badge>}
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                {state === "missing"
                  ? "Noch keine Chat-ID hinterlegt."
                  : state === "ok"
                    ? "Bot ist Mitglied und kann Nachrichten senden."
                    : r.error || "Bot kann hier nicht posten."}
                {r.testError ? ` – ${r.testError}` : ""}
              </p>
            </div>
          );
        })}
        {!q.isLoading && rows.length === 0 && (
          <p className="text-sm text-muted-foreground">Keine Chats konfiguriert.</p>
        )}
      </CardContent>
    </Card>
  );
}
