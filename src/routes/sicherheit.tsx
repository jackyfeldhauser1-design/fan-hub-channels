import { createFileRoute } from "@tanstack/react-router";
import { useAdmin } from "@/lib/useAdmin";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ShieldAlert } from "lucide-react";
import { DashLayout } from "@/components/DashLayout";
import { getRiskCenter, setUserBlocked } from "@/lib/admin.functions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/sicherheit")({
  head: () => ({
    meta: [
      { title: "Sicherheit & Anti-Fraud – Telegram Fan Funnel Studio" },
      {
        name: "description",
        content: "Risikobewertung, Rate-Limits und Sperren für verdächtige Wiederholungs-Zahlungen und Empfehlungs-Missbrauch.",
      },
      { property: "og:title", content: "Sicherheit & Anti-Fraud – Telegram Fan Funnel Studio" },
      { property: "og:description", content: "Verdächtige Fans erkennen, sperren und Limits überwachen." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: SecurityPage,
});

function SecurityPage() {
  const qc = useQueryClient();
  const listFn = useServerFn(getRiskCenter);
  const blockFn = useServerFn(setUserBlocked);
  const { isAdmin } = useAdmin();
  const { data } = useQuery({ queryKey: ["risk"], queryFn: () => listFn({ data: undefined as never }), enabled: isAdmin });

  return (
    <DashLayout
      title="Sicherheit & Anti-Fraud"
      subtitle="Automatische Limits, Risikowerte und Sperren schützen Umsatz und Inhalte."
    >
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="panel p-5">
          <p className="text-sm text-muted-foreground">Gesperrte Fans</p>
          <p className="mt-1 text-3xl font-bold">{data?.blocked ?? 0}</p>
        </div>
        <div className="panel p-5">
          <p className="text-sm text-muted-foreground">Auffälligkeiten (7 Tage)</p>
          <p className="mt-1 text-3xl font-bold">{data?.flags.length ?? 0}</p>
        </div>
        <div className="panel flex items-center gap-3 p-5 text-sm text-muted-foreground">
          <ShieldAlert className="size-5 text-primary" />
          Aktive Regeln: Kauf-Limit pro Stunde, Empfehlungs-Limit, Zugriffs-Limit, Sperre bei Wiederholungs-Zahlungen und
          Einmal-Links mit Geräteschutz.
        </div>
      </div>

      <div className="panel mt-4 overflow-x-auto">
        <table className="w-full min-w-[680px] text-sm">
          <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr className="border-b border-border">
              <th className="px-4 py-3">Fan</th>
              <th className="px-4 py-3">Risiko</th>
              <th className="px-4 py-3">Grund</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {(data?.users ?? []).map((u: any) => (
              <tr key={u.id} className="border-b border-border/60">
                <td className="px-4 py-3">{u.username ? `@${u.username}` : (u.first_name ?? u.telegram_id)}</td>
                <td className="px-4 py-3 font-medium">{u.risk_score}</td>
                <td className="px-4 py-3 text-muted-foreground">{u.block_reason || "—"}</td>
                <td className="px-4 py-3">
                  <Badge variant={u.blocked ? "destructive" : "secondary"}>{u.blocked ? "gesperrt" : "aktiv"}</Badge>
                </td>
                <td className="px-4 py-3 text-right">
                  <Button
                    size="sm"
                    variant={u.blocked ? "secondary" : "outline"}
                    onClick={async () => {
                      await blockFn({ data: { id: u.id, blocked: !u.blocked, reason: "Manuell geprüft" } });
                      toast.success(u.blocked ? "Fan entsperrt" : "Fan gesperrt");
                      qc.invalidateQueries({ queryKey: ["risk"] });
                    }}
                  >
                    {u.blocked ? "Entsperren" : "Sperren"}
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="panel mt-4 p-5">
        <h2 className="mb-3 text-lg font-semibold">Letzte Auffälligkeiten</h2>
        <ul className="space-y-1 text-xs text-muted-foreground">
          {(data?.flags ?? []).map((f: any) => (
            <li key={f.id}>
              {new Date(f.created_at).toLocaleString("de-DE")} · {f.action} · {f.meta}
            </li>
          ))}
          {data?.flags.length === 0 ? <li>Keine Auffälligkeiten.</li> : null}
        </ul>
      </div>
    </DashLayout>
  );
}
