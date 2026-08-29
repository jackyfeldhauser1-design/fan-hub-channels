import { createFileRoute } from "@tanstack/react-router";
import { useAdmin } from "@/lib/useAdmin";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { DashLayout } from "@/components/DashLayout";
import { listLeads, deleteLead } from "@/lib/admin.functions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/leads")({
  head: () => ({
    meta: [
      { name: "robots", content: "noindex, nofollow" },
      { title: "Warteliste & Leads – Telegram Fan Funnel Studio" },
      {
        name: "description",
        content: "Wartelisten-Anmeldungen für kommende Drops inklusive bezahlter Early-Access-Slots verwalten.",
      },
      { property: "og:title", content: "Warteliste & Leads – Telegram Fan Funnel Studio" },
      { property: "og:description", content: "Leads sammeln und Early-Access-Slots in Telegram Stars verkaufen." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: LeadsPage,
});

function LeadsPage() {
  const qc = useQueryClient();
  const listFn = useServerFn(listLeads);
  const delFn = useServerFn(deleteLead);
  const { isAdmin } = useAdmin();
  const { data } = useQuery({ queryKey: ["leads"], queryFn: () => listFn({ data: undefined as never }), enabled: isAdmin });

  const paid = (data ?? []).filter((l: any) => l.early_access_status === "paid");

  return (
    <DashLayout title="Warteliste & Leads" subtitle="Formular für Fans: /warteliste – mit optionalem bezahltem Early Access.">
      <div className="mb-4 grid gap-4 sm:grid-cols-3">
        <div className="panel p-5">
          <p className="text-sm text-muted-foreground">Leads gesamt</p>
          <p className="mt-1 text-3xl font-bold">{data?.length ?? 0}</p>
        </div>
        <div className="panel p-5">
          <p className="text-sm text-muted-foreground">Bezahlte Early-Access-Slots</p>
          <p className="mt-1 text-3xl font-bold">{paid.length}</p>
        </div>
        <div className="panel p-5">
          <p className="text-sm text-muted-foreground">Umsatz Early Access</p>
          <p className="mt-1 text-3xl font-bold text-primary">
            ⭐ {paid.reduce((s: number, l: any) => s + l.amount_stars, 0)}
          </p>
        </div>
      </div>

      <div className="panel hidden overflow-x-auto md:block">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr className="border-b border-border">
              <th className="px-4 py-3">Datum</th>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">E-Mail</th>
              <th className="px-4 py-3">Telegram</th>
              <th className="px-4 py-3">Interesse</th>
              <th className="px-4 py-3">Early Access</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {(data ?? []).map((l: any) => (
              <tr key={l.id} className="border-b border-border/60">
                <td className="px-4 py-3 text-muted-foreground">{new Date(l.created_at).toLocaleDateString("de-DE")}</td>
                <td className="px-4 py-3">{l.name}</td>
                <td className="px-4 py-3 text-muted-foreground">{l.email}</td>
                <td className="px-4 py-3 text-muted-foreground">{l.telegram_handle || "—"}</td>
                <td className="px-4 py-3 text-muted-foreground">{l.interest || "—"}</td>
                <td className="px-4 py-3">
                  {l.early_access ? (
                    <Badge variant={l.early_access_status === "paid" ? "default" : "secondary"}>
                      {l.early_access_status === "paid" ? `bezahlt ⭐ ${l.amount_stars}` : "offen"}
                    </Badge>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </td>
                <td className="px-4 py-3 text-right">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={async () => {
                      await delFn({ data: { id: l.id } });
                      toast.success("Lead gelöscht");
                      qc.invalidateQueries({ queryKey: ["leads"] });
                    }}
                  >
                    Löschen
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {data?.length === 0 ? <p className="p-6 text-sm text-muted-foreground">Noch keine Anmeldungen.</p> : null}
      </div>
    </DashLayout>
  );
}
