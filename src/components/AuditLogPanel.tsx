import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ShieldCheck, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { listAdminAudit } from "@/lib/ops.functions";

const LABEL: Record<string, string> = {
  chat_verify: "Prüfung",
  chat_test_post: "Testpost",
  chat_membership: "Statusänderung",
  bulk_test_send: "Bulk-Test",
  campaign_run: "Kampagne",
};

export function AuditLogPanel({ enabled = true }: { enabled?: boolean }) {
  const [chatId, setChatId] = useState("");
  const fn = useServerFn(listAdminAudit);

  const q = useQuery({
    queryKey: ["admin-audit", chatId],
    queryFn: () => fn({ data: { chatId, action: "", limit: 100 } }),
    enabled,
    refetchOnWindowFocus: false,
  });

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldCheck className="h-4 w-4" /> Admin-Audit-Log
          </CardTitle>
          <CardDescription>Prüfungen, Testposts und Mitgliedschaftsänderungen je Chat.</CardDescription>
        </div>
        <Button variant="outline" size="sm" onClick={() => q.refetch()} disabled={q.isFetching}>
          <RefreshCw className={`h-4 w-4 ${q.isFetching ? "animate-spin" : ""}`} />
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        <Input
          value={chatId}
          onChange={(e) => setChatId(e.target.value)}
          placeholder="Nach Chat-ID filtern (optional)"
          className="max-w-xs"
        />
        {q.data?.entries.length ? (
          <ul className="divide-y rounded-md border">
            {q.data.entries.map((e) => (
              <li key={e.id} className="flex flex-wrap items-center gap-2 p-3 text-sm">
                <Badge variant={e.status === "ok" ? "secondary" : "destructive"}>
                  {LABEL[e.action] ?? e.action}
                </Badge>
                <span className="font-medium">{e.target}</span>
                {e.chatId ? <span className="text-muted-foreground">{e.chatId}</span> : null}
                <span className="text-muted-foreground">{e.detail}</span>
                <span className="ml-auto text-xs text-muted-foreground">
                  {new Date(e.at).toLocaleString("de-DE")} · {e.actor}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">
            {q.isLoading ? "Wird geladen…" : "Noch keine Einträge."}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
