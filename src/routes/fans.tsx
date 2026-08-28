import { createFileRoute } from "@tanstack/react-router";
import { useAuth } from "@/lib/useAuth";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { DashLayout } from "@/components/DashLayout";
import { listFans } from "@/lib/admin.functions";

export const Route = createFileRoute("/fans")({
  head: () => ({
    meta: [
      { title: "Fans & Affiliates – Telegram Fan Funnel Studio" },
      {
        name: "description",
        content: "Sieh, welche Fans kaufen, wer neue Mitglieder wirbt und wie viele Stars an Provisionen verdient wurden.",
      },
      { property: "og:title", content: "Fans & Affiliates – Telegram Fan Funnel Studio" },
      { property: "og:description", content: "Fan-Liste mit Umsatz, Empfehlungen und Provisionen." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: FansPage,
});

function FansPage() {
  const fn = useServerFn(listFans);
  const { session } = useAuth();
  const { data } = useQuery({ queryKey: ["fans"], queryFn: () => fn({ data: undefined as never }), enabled: Boolean(session) });

  return (
    <DashLayout title="Fans & Affiliates" subtitle="Wer kauft, wer wirbt und wer verdient mit.">
      <div className="panel overflow-x-auto">
        <table className="w-full min-w-[680px] text-sm">
          <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr className="border-b border-border">
              <th className="px-4 py-3">Fan</th>
              <th className="px-4 py-3">Code</th>
              <th className="px-4 py-3">Geworben</th>
              <th className="px-4 py-3">Ausgegeben</th>
              <th className="px-4 py-3">Verdient</th>
              <th className="px-4 py-3">Dabei seit</th>
            </tr>
          </thead>
          <tbody>
            {(data ?? []).map((u: any) => (
              <tr key={u.id} className="border-b border-border/60">
                <td className="px-4 py-3">{u.username ? `@${u.username}` : (u.first_name ?? u.telegram_id)}</td>
                <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{u.referral_code}</td>
                <td className="px-4 py-3">{u.invited}</td>
                <td className="px-4 py-3 text-primary">⭐ {u.spent}</td>
                <td className="px-4 py-3">⭐ {u.earned}</td>
                <td className="px-4 py-3 text-muted-foreground">{new Date(u.created_at).toLocaleDateString("de-DE")}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {data?.length === 0 ? <p className="p-6 text-sm text-muted-foreground">Noch keine Fans im Bot.</p> : null}
      </div>
    </DashLayout>
  );
}
