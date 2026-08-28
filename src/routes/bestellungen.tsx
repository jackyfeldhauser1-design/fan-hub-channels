import { createFileRoute } from "@tanstack/react-router";
import { useAuth } from "@/lib/useAuth";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { DashLayout } from "@/components/DashLayout";
import { listOrders, resendDelivery, revokeAccessToken } from "@/lib/admin.functions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/bestellungen")({
  head: () => ({
    meta: [
      { title: "Bestellungen & Lieferung – Telegram Fan Funnel Studio" },
      {
        name: "description",
        content: "Automatisches Bestell- und Liefer-Tracking: Zahlung, Status, Einmal-Links und Zustellung pro Fan.",
      },
      { property: "og:title", content: "Bestellungen & Lieferung – Telegram Fan Funnel Studio" },
      { property: "og:description", content: "Jede Stars- und TON-Zahlung mit Lieferstatus und Zugriffsprotokoll." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: OrdersPage,
});

const statusLabel: Record<string, string> = {
  pending: "offen",
  delivered: "geliefert",
  failed: "fehlgeschlagen",
  revoked: "widerrufen",
};

function OrdersPage() {
  const qc = useQueryClient();
  const listFn = useServerFn(listOrders);
  const resendFn = useServerFn(resendDelivery);
  const revokeFn = useServerFn(revokeAccessToken);
  const [open, setOpen] = useState<string | null>(null);
  const { session } = useAuth();
  const { data } = useQuery({ queryKey: ["orders"], queryFn: () => listFn({ data: undefined as never }), enabled: Boolean(session) });

  return (
    <DashLayout
      title="Bestellungen & Lieferung"
      subtitle="Jede Zahlung mit Bestellstatus, Zustellung und Zugriffsprotokoll pro Fan."
    >
      <div className="panel divide-y divide-border/60">
        {(data ?? []).map((o: any) => (
          <div key={o.id} className="p-4">
            <button
              className="flex w-full flex-wrap items-center gap-3 text-left"
              onClick={() => setOpen(open === o.id ? null : o.id)}
            >
              <span className="text-xs text-muted-foreground">
                {new Date(o.created_at).toLocaleString("de-DE")}
              </span>
              <span className="font-medium">{o.title_snapshot}</span>
              <span className="text-sm text-muted-foreground">
                {o.tg_users?.username ? `@${o.tg_users.username}` : (o.tg_users?.first_name ?? "—")}
              </span>
              <span className="font-medium text-primary">
                {o.currency === "ton" ? `${o.amount_ton} TON` : `⭐ ${o.amount_stars}`}
              </span>
              <Badge variant={o.status === "paid" ? "default" : "secondary"}>Zahlung: {o.status}</Badge>
              <Badge variant={o.delivery_status === "delivered" ? "default" : "outline"}>
                Lieferung: {statusLabel[o.delivery_status] ?? o.delivery_status}
              </Badge>
              {o.tg_users?.blocked ? <Badge variant="destructive">Fan gesperrt</Badge> : null}
            </button>

            {open === o.id ? (
              <div className="mt-4 grid gap-4 lg:grid-cols-2">
                <div className="rounded-lg border border-border p-4 text-sm">
                  <p className="mb-2 font-medium">Verlauf</p>
                  {o.events.length ? (
                    <ul className="space-y-1 text-xs text-muted-foreground">
                      {o.events.map((e: any) => (
                        <li key={e.id}>
                          {new Date(e.created_at).toLocaleString("de-DE")} · {e.kind} {e.detail}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-xs text-muted-foreground">Noch keine Ereignisse.</p>
                  )}
                  {o.delivery_note ? (
                    <p className="mt-3 text-xs text-muted-foreground">Zustellung: {o.delivery_note}</p>
                  ) : null}
                </div>
                <div className="rounded-lg border border-border p-4 text-sm">
                  <p className="mb-2 font-medium">Zugangslinks</p>
                  {o.tokens.length ? (
                    <ul className="space-y-2 text-xs">
                      {o.tokens.map((t: any) => (
                        <li key={t.id} className="flex items-center justify-between gap-2">
                          <span className="text-muted-foreground">
                            {t.views}/{t.max_views} Aufrufe · gültig bis{" "}
                            {new Date(t.expires_at).toLocaleString("de-DE")}
                            {t.revoked ? " · gesperrt" : ""}
                          </span>
                          {!t.revoked ? (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={async () => {
                                await revokeFn({ data: { id: t.id } });
                                toast.success("Zugang gesperrt");
                                qc.invalidateQueries({ queryKey: ["orders"] });
                              }}
                            >
                              Sperren
                            </Button>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-xs text-muted-foreground">Kein Einmal-Link erzeugt.</p>
                  )}
                  {o.product_id ? (
                    <Button
                      size="sm"
                      variant="secondary"
                      className="mt-3"
                      onClick={async () => {
                        try {
                          await resendFn({ data: { id: o.id } });
                          toast.success("Erneut ausgeliefert");
                          qc.invalidateQueries({ queryKey: ["orders"] });
                        } catch (e) {
                          toast.error(e instanceof Error ? e.message : "Fehlgeschlagen");
                        }
                      }}
                    >
                      Erneut ausliefern
                    </Button>
                  ) : null}
                </div>
              </div>
            ) : null}
          </div>
        ))}
        {data?.length === 0 ? <p className="p-6 text-sm text-muted-foreground">Noch keine Bestellungen.</p> : null}
      </div>
    </DashLayout>
  );
}
