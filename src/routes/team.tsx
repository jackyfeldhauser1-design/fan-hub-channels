import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { UserCog } from "lucide-react";
import { DashLayout } from "@/components/DashLayout";
import { useAdmin } from "@/lib/useAdmin";
import { listTeam, setTeamRole, removeTeamRole } from "@/lib/admin.functions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/team")({
  head: () => ({
    meta: [
      { name: "robots", content: "noindex, nofollow" },
      { title: "Team & Rollen – Telegram Fan Funnel Studio" },
      {
        name: "description",
        content: "Admin-, Operator- und Viewer-Rechte separat vergeben und jederzeit entziehen.",
      },
      { property: "og:title", content: "Team & Rollen – Telegram Fan Funnel Studio" },
      { property: "og:description", content: "Rollenbasierte Zugriffssteuerung für dein Dashboard." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: TeamPage,
});

const roleInfo: Record<string, { label: string; desc: string; tone: string }> = {
  admin: { label: "Admin", desc: "Voller Zugriff inkl. Einstellungen, Produkte und Rollen", tone: "bg-primary/15 text-primary" },
  operator: { label: "Operator", desc: "Bestellungen, Auslieferung und Zugänge steuern", tone: "bg-accent/20 text-foreground" },
  viewer: { label: "Viewer", desc: "Nur Lesezugriff auf Zahlen, Logs und Reports", tone: "bg-muted text-muted-foreground" },
};

function TeamPage() {
  const qc = useQueryClient();
  const listFn = useServerFn(listTeam);
  const setFn = useServerFn(setTeamRole);
  const removeFn = useServerFn(removeTeamRole);
  const { isAdmin } = useAdmin();
  const { data } = useQuery({
    queryKey: ["team"],
    queryFn: () => listFn({ data: undefined as never }),
    enabled: isAdmin,
  });
  const [account, setAccount] = useState("");
  const [role, setRole] = useState<"admin" | "operator" | "viewer">("viewer");

  async function assign(userId: string, next: "admin" | "operator" | "viewer") {
    try {
      await setFn({ data: { userId, role: next } });
      toast.success("Rolle gespeichert");
      qc.invalidateQueries({ queryKey: ["team"] });
      qc.invalidateQueries({ queryKey: ["access"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Fehlgeschlagen");
    }
  }

  async function remove(userId: string) {
    try {
      await removeFn({ data: { userId } });
      toast.success("Zugriff entzogen");
      qc.invalidateQueries({ queryKey: ["team"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Fehlgeschlagen");
    }
  }

  return (
    <DashLayout title="Team & Rollen" subtitle="Vergib Admin-, Operator- und Viewer-Rechte getrennt voneinander.">
      <div className="grid gap-4 lg:grid-cols-3">
        {Object.entries(roleInfo).map(([key, info]) => (
          <div key={key} className="panel p-5">
            <Badge className={info.tone}>{info.label}</Badge>
            <p className="mt-2 text-sm text-muted-foreground">{info.desc}</p>
          </div>
        ))}
      </div>

      <div className="panel mt-4 space-y-3 p-5">
        <div className="flex items-center gap-2">
          <UserCog className="size-5 text-primary" />
          <h2 className="text-lg font-semibold">Rolle zuweisen</h2>
        </div>
        <div className="grid gap-3 sm:grid-cols-[2fr_1fr_auto]">
          <div className="space-y-1.5">
            <Label>Konto</Label>
            <Select value={account} onValueChange={setAccount}>
              <SelectTrigger>
                <SelectValue placeholder="Konto wählen" />
              </SelectTrigger>
              <SelectContent>
                {(data?.accounts ?? []).map((a: any) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.email}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Rolle</Label>
            <Select value={role} onValueChange={(v) => setRole(v as typeof role)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="admin">Admin</SelectItem>
                <SelectItem value="operator">Operator</SelectItem>
                <SelectItem value="viewer">Viewer</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end">
            <Button className="w-full" disabled={!account} onClick={() => assign(account, role)}>
              Speichern
            </Button>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Das Konto muss sich vorher einmal im Dashboard registriert haben.
        </p>
      </div>

      <h2 className="mt-8 text-lg font-semibold">Aktuelle Mitglieder</h2>
      <div className="panel mt-3 divide-y divide-border/60">
        {(data?.members ?? []).map((m: any) => (
          <div key={m.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm">
            <div>
              <p className="font-medium">
                {m.email} {m.isSelf ? <span className="text-xs text-muted-foreground">(du)</span> : null}
              </p>
              <p className="text-xs text-muted-foreground">seit {new Date(m.createdAt).toLocaleDateString("de-DE")}</p>
            </div>
            <div className="flex items-center gap-2">
              <Select value={m.role} onValueChange={(v) => assign(m.userId, v as any)}>
                <SelectTrigger className="w-36">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="operator">Operator</SelectItem>
                  <SelectItem value="viewer">Viewer</SelectItem>
                </SelectContent>
              </Select>
              <Button size="sm" variant="outline" disabled={m.isSelf} onClick={() => remove(m.userId)}>
                Entfernen
              </Button>
            </div>
          </div>
        ))}
        {(data?.members ?? []).length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">Noch keine Mitglieder.</p>
        ) : null}
      </div>
    </DashLayout>
  );
}
