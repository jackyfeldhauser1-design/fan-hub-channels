import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { KeyRound } from "lucide-react";
import { DashLayout } from "@/components/DashLayout";
import { useAdmin } from "@/lib/useAdmin";
import { listAccessLog, revokeAccessToken } from "@/lib/admin.functions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/zugriffe")({
  head: () => ({
    meta: [
      { name: "robots", content: "noindex, nofollow" },
      { title: "Zugriffe & Auslieferung – Telegram Fan Funnel Studio" },
      {
        name: "description",
        content: "Protokoll aller Einmal-Zugänge: wer welchen bezahlten Inhalt wann geöffnet hat und welche Zugriffe blockiert wurden.",
      },
      { property: "og:title", content: "Zugriffe & Auslieferung – Telegram Fan Funnel Studio" },
      { property: "og:description", content: "Zugriffsschutz und Lieferprotokoll für bezahlte Inhalte." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AccessPage,
});

const stateTone: Record<string, string> = {
  aktiv: "bg-primary/15 text-primary",
  gesperrt: "bg-destructive/15 text-destructive",
  unbezahlt: "bg-destructive/15 text-destructive",
  abgelaufen: "bg-muted text-muted-foreground",
  aufgebraucht: "bg-muted text-muted-foreground",
};

function AccessPage() {
  const qc = useQueryClient();
  const listFn = useServerFn(listAccessLog);
  const revokeFn = useServerFn(revokeAccessToken);
  const { isAdmin } = useAdmin();
  const { data } = useQuery({
    queryKey: ["access-log"],
    queryFn: () => listFn({ data: undefined as never }),
    enabled: isAdmin,
  });

  async function revoke(id: string) {
    await revokeFn({ data: { id } });
    toast.success("Zugang gesperrt");
    qc.invalidateQueries({ queryKey: ["access-log"] });
  }

  const tokens = data?.tokens ?? [];
  const events = data?.events ?? [];

  return (
    <DashLayout
      title="Zugriffe & Auslieferung"
      subtitle="Nur bezahlte Bestellungen erhalten Zugang – hier siehst du jeden Aufruf und jede Blockade."
    >
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "Aktive Zugänge", value: data?.stats.active ?? 0 },
          { label: "Gesperrte Zugänge", value: data?.stats.revoked ?? 0 },
          { label: "Öffnungen", value: data?.stats.opens ?? 0 },
          { label: "Blockierte Versuche", value: data?.stats.denied ?? 0 },
        ].map((s) => (
          <div key={s.label} className="panel p-5">
            <p className="text-sm text-muted-foreground">{s.label}</p>
            <p className="mt-1 text-3xl font-bold">{s.value}</p>
          </div>
        ))}
      </div>

      <div className="panel mt-4 flex items-center gap-3 p-5 text-sm text-muted-foreground">
        <KeyRound className="size-5 shrink-0 text-primary" />
        Zugriff wird nur gewährt, wenn die Zahlung bestätigt ist, das Fan-Konto nicht gesperrt ist, der Link noch gültig
        ist und das Aufruf-Limit nicht erreicht wurde. Ein Gerätewechsel sperrt den Link automatisch.
      </div>

      <h2 className="mt-8 text-lg font-semibold">Ausgegebene Zugänge</h2>
      <div className="panel mt-3 hidden overflow-x-auto md:block">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr className="border-b border-border">
              <th className="px-4 py-3">Inhalt</th>
              <th className="px-4 py-3">Fan</th>
              <th className="px-4 py-3">Zahlung</th>
              <th className="px-4 py-3">Aufrufe</th>
              <th className="px-4 py-3">Gültig bis</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {tokens.map((t) => (
              <tr key={t.id} className="border-b border-border/60">
                <td className="px-4 py-3 font-medium">{t.product}</td>
                <td className="px-4 py-3">{t.fan}</td>
                <td className="px-4 py-3">{t.paid ? t.amount : "offen"}</td>
                <td className="px-4 py-3">
                  {t.views}/{t.maxViews}
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {new Date(t.expiresAt).toLocaleString("de-DE")}
                </td>
                <td className="px-4 py-3">
                  <Badge className={stateTone[t.state] ?? "bg-muted text-muted-foreground"}>{t.state}</Badge>
                </td>
                <td className="px-4 py-3 text-right">
                  {t.state === "aktiv" ? (
                    <Button size="sm" variant="outline" onClick={() => revoke(t.id)}>
                      Sperren
                    </Button>
                  ) : null}
                </td>
              </tr>
            ))}
            {tokens.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                  Noch keine Zugänge ausgegeben.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <div className="mt-3 grid gap-3 md:hidden">
        {tokens.map((t) => (
          <div key={t.id} className="panel p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-medium">{t.product}</p>
                <p className="text-xs text-muted-foreground">{t.fan}</p>
              </div>
              <Badge className={stateTone[t.state] ?? "bg-muted text-muted-foreground"}>{t.state}</Badge>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              {t.views}/{t.maxViews} Aufrufe · {t.paid ? t.amount : "Zahlung offen"} · bis{" "}
              {new Date(t.expiresAt).toLocaleString("de-DE")}
            </p>
            {t.state === "aktiv" ? (
              <Button size="sm" variant="outline" className="mt-3 w-full" onClick={() => revoke(t.id)}>
                Zugang sperren
              </Button>
            ) : null}
          </div>
        ))}
        {tokens.length === 0 ? (
          <p className="panel p-6 text-center text-sm text-muted-foreground">Noch keine Zugänge ausgegeben.</p>
        ) : null}
      </div>

      <h2 className="mt-8 text-lg font-semibold">Lieferprotokoll</h2>
      <div className="panel mt-3 divide-y divide-border/60">
        {events.map((e) => (
          <div key={e.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
            <span className="font-medium">
              {e.kind === "delivered"
                ? "Ausgeliefert"
                : e.kind === "access_opened"
                  ? "Inhalt geöffnet"
                  : e.kind === "access_denied"
                    ? "Zugriff verweigert"
                    : "Zugang gesperrt"}
            </span>
            <span className="text-muted-foreground">{e.fan}</span>
            <span className="text-muted-foreground">{e.detail}</span>
            <span className="text-xs text-muted-foreground">{new Date(e.createdAt).toLocaleString("de-DE")}</span>
          </div>
        ))}
        {events.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">Noch keine Ereignisse.</p>
        ) : null}
      </div>
    </DashLayout>
  );
}
