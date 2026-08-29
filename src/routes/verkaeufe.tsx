import { createFileRoute } from "@tanstack/react-router";
import { useAdmin } from "@/lib/useAdmin";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { DashLayout } from "@/components/DashLayout";
import { listPurchases, confirmTonPurchase } from "@/lib/admin.functions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/verkaeufe")({
  head: () => ({
    meta: [
      { name: "robots", content: "noindex, nofollow" },
      { title: "Verkäufe – Telegram Fan Funnel Studio" },
      {
        name: "description",
        content: "Alle Käufe in Telegram Stars und TON, offene Krypto-Zahlungen bestätigen und Provisionen nachvollziehen.",
      },
      { property: "og:title", content: "Verkäufe – Telegram Fan Funnel Studio" },
      { property: "og:description", content: "Zahlungen, Status und Affiliate-Provisionen deines Telegram-Bots." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: SalesPage,
});

function SalesPage() {
  const qc = useQueryClient();
  const listFn = useServerFn(listPurchases);
  const confirmFn = useServerFn(confirmTonPurchase);
  const { isAdmin } = useAdmin();
  const { data } = useQuery({ queryKey: ["purchases"], queryFn: () => listFn({ data: undefined as never }), enabled: isAdmin });

  return (
    <DashLayout title="Verkäufe" subtitle="Stars werden automatisch verbucht, TON-Zahlungen bestätigst du hier.">
      <div className="panel hidden overflow-x-auto md:block">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr className="border-b border-border">
              <th className="px-4 py-3">Datum</th>
              <th className="px-4 py-3">Fan</th>
              <th className="px-4 py-3">Inhalt</th>
              <th className="px-4 py-3">Betrag</th>
              <th className="px-4 py-3">Provision</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {(data ?? []).map((p: any) => (
              <tr key={p.id} className="border-b border-border/60">
                <td className="px-4 py-3 text-muted-foreground">
                  {new Date(p.created_at).toLocaleDateString("de-DE")}
                </td>
                <td className="px-4 py-3">
                  {p.tg_users?.username ? `@${p.tg_users.username}` : (p.tg_users?.first_name ?? "—")}
                </td>
                <td className="px-4 py-3">{p.title_snapshot}</td>
                <td className="px-4 py-3 font-medium text-primary">
                  {p.currency === "ton" ? `${p.amount_ton} TON` : `⭐ ${p.amount_stars}`}
                </td>
                <td className="px-4 py-3 text-muted-foreground">⭐ {p.commission_stars}</td>
                <td className="px-4 py-3">
                  <Badge variant={p.status === "paid" ? "default" : "secondary"}>{p.status}</Badge>
                  {p.ton_memo ? <span className="ml-2 text-xs text-muted-foreground">{p.ton_memo}</span> : null}
                </td>
                <td className="px-4 py-3 text-right">
                  {p.status === "pending" && p.currency === "ton" ? (
                    <Button
                      size="sm"
                      onClick={async () => {
                        try {
                          await confirmFn({ data: { id: p.id } });
                          toast.success("Zahlung bestätigt & Inhalt ausgeliefert");
                          qc.invalidateQueries({ queryKey: ["purchases"] });
                        } catch (e) {
                          toast.error(e instanceof Error ? e.message : "Fehlgeschlagen");
                        }
                      }}
                    >
                      Bestätigen
                    </Button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {data?.length === 0 ? <p className="p-6 text-sm text-muted-foreground">Noch keine Verkäufe.</p> : null}
      </div>
    </DashLayout>
  );
}
