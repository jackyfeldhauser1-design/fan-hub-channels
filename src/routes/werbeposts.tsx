import { createFileRoute } from "@tanstack/react-router";
import { useAuth } from "@/lib/useAuth";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Megaphone } from "lucide-react";
import { DashLayout } from "@/components/DashLayout";
import { listSponsoredPosts, updateSponsoredPost, publishSponsoredPost } from "@/lib/admin.functions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/werbeposts")({
  head: () => ({
    meta: [
      { title: "Werbepartner & Sponsored Posts – Telegram Fan Funnel Studio" },
      {
        name: "description",
        content: "Bezahlte Werbeposts von Partnern prüfen, freigeben und automatisch in der Fan- oder VIP-Gruppe veröffentlichen.",
      },
      { property: "og:title", content: "Werbepartner & Sponsored Posts – Telegram Fan Funnel Studio" },
      { property: "og:description", content: "Zusätzlicher Umsatz durch bezahlte Posts in deinen Telegram-Gruppen." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: SponsorPage,
});

const target: Record<string, string> = { free: "Fan-Gruppe", vip: "VIP-Gruppe", both: "Beide Gruppen" };

function SponsorPage() {
  const qc = useQueryClient();
  const listFn = useServerFn(listSponsoredPosts);
  const updateFn = useServerFn(updateSponsoredPost);
  const publishFn = useServerFn(publishSponsoredPost);
  const { session } = useAuth();
  const { data } = useQuery({ queryKey: ["sponsors"], queryFn: () => listFn({ data: undefined as never }) enabled: Boolean(session) });

  const refresh = () => qc.invalidateQueries({ queryKey: ["sponsors"] });

  return (
    <DashLayout
      title="Werbepartner"
      subtitle="Partner buchen über das öffentliche Formular, zahlen in Stars und du veröffentlichst mit einem Klick."
    >
      <div className="panel mb-4 flex flex-wrap items-center gap-3 p-5 text-sm text-muted-foreground">
        <Megaphone className="size-5 text-primary" />
        Buchungsformular für Partner: <code className="text-foreground">/werbepartner</code>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {(data ?? []).map((p: any) => (
          <div key={p.id} className="panel space-y-3 p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-semibold">{p.advertiser}</p>
                <p className="text-xs text-muted-foreground">
                  {target[p.target]} · ⭐ {p.price_stars} · {new Date(p.created_at).toLocaleDateString("de-DE")}
                </p>
              </div>
              <Badge variant={p.status === "published" ? "default" : "secondary"}>{p.status}</Badge>
            </div>
            <p className="whitespace-pre-wrap text-sm text-muted-foreground">{p.content}</p>
            {p.link_url ? <p className="break-all text-xs text-primary">{p.link_url}</p> : null}
            <p className="text-xs text-muted-foreground">Kontakt: {p.contact}</p>
            <div className="flex flex-wrap gap-2">
              {p.status === "requested" ? (
                <>
                  <Button
                    size="sm"
                    onClick={async () => {
                      await updateFn({ data: { id: p.id, status: "approved" } });
                      toast.success("Freigegeben – Partner kann jetzt zahlen");
                      refresh();
                    }}
                  >
                    Freigeben
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={async () => {
                      await updateFn({ data: { id: p.id, status: "rejected" } });
                      refresh();
                    }}
                  >
                    Ablehnen
                  </Button>
                </>
              ) : null}
              {p.status === "paid" || p.status === "approved" ? (
                <Button
                  size="sm"
                  onClick={async () => {
                    try {
                      const res = await publishFn({ data: { id: p.id } });
                      toast.success(`In ${res.count} Gruppe(n) veröffentlicht`);
                      refresh();
                    } catch (e) {
                      toast.error(e instanceof Error ? e.message : "Fehlgeschlagen");
                    }
                  }}
                >
                  Jetzt veröffentlichen
                </Button>
              ) : null}
            </div>
          </div>
        ))}
        {data?.length === 0 ? (
          <p className="panel p-6 text-sm text-muted-foreground">Noch keine Buchungen.</p>
        ) : null}
      </div>
    </DashLayout>
  );
}
