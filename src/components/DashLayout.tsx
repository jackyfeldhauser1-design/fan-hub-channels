import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { LayoutDashboard, Package, Receipt, Users, Settings2, LogOut, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/useAuth";
import { getAccess, claimAdmin } from "@/lib/admin.functions";
import { Button } from "@/components/ui/button";

const nav = [
  { to: "/", label: "Übersicht", icon: LayoutDashboard },
  { to: "/produkte", label: "Inhalte & Preise", icon: Package },
  { to: "/verkaeufe", label: "Verkäufe", icon: Receipt },
  { to: "/fans", label: "Fans & Affiliates", icon: Users },
  { to: "/einstellungen", label: "Bot-Setup", icon: Settings2 },
];

export function DashLayout({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  const { session, loading } = useAuth();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const accessFn = useServerFn(getAccess);
  const claimFn = useServerFn(claimAdmin);

  useEffect(() => {
    if (!loading && !session) navigate({ to: "/auth" });
  }, [loading, session, navigate]);

  const access = useQuery({
    queryKey: ["access", session?.user.id],
    queryFn: () => accessFn({ data: undefined as never }),
    enabled: Boolean(session),
  });

  if (loading || !session) {
    return <div className="grid min-h-screen place-items-center text-muted-foreground">Lädt…</div>;
  }

  return (
    <div className="min-h-screen lg:flex">
      <aside className="border-b border-sidebar-border bg-sidebar lg:sticky lg:top-0 lg:h-screen lg:w-64 lg:shrink-0 lg:border-r lg:border-b-0">
        <div className="flex items-center gap-2 px-5 py-5">
          <span className="grid size-9 place-items-center rounded-xl gold-surface">
            <Sparkles className="size-5" />
          </span>
          <div>
            <p className="font-display text-sm font-bold leading-tight">Fan Funnel</p>
            <p className="text-xs text-muted-foreground">Telegram Studio</p>
          </div>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-3 pb-3 lg:flex-col lg:overflow-visible">
          {nav.map((item) => {
            const active = pathname === item.to;
            return (
              <Link
                key={item.to}
                to={item.to}
                className={`flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors ${
                  active
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
                }`}
              >
                <item.icon className="size-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="hidden px-3 pb-5 lg:block">
          <Button
            variant="ghost"
            className="w-full justify-start gap-2 text-muted-foreground"
            onClick={async () => {
              await supabase.auth.signOut();
              navigate({ to: "/auth" });
            }}
          >
            <LogOut className="size-4" /> Abmelden
          </Button>
        </div>
      </aside>

      <main className="flex-1 px-4 py-6 sm:px-8">
        <header className="mb-6">
          <h1 className="text-2xl font-bold sm:text-3xl">{title}</h1>
          {subtitle ? <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p> : null}
        </header>

        {access.data && !access.data.isAdmin ? (
          <div className="panel p-6">
            <h2 className="text-lg font-semibold">Adminzugang</h2>
            {access.data.adminExists ? (
              <p className="mt-2 text-sm text-muted-foreground">
                Dieses Konto hat keine Adminrechte. Bitte melde dich mit dem Adminkonto an.
              </p>
            ) : (
              <>
                <p className="mt-2 text-sm text-muted-foreground">
                  Noch kein Admin vorhanden. Übernimm jetzt die Verwaltung mit diesem Konto.
                </p>
                <Button
                  className="mt-4"
                  onClick={async () => {
                    await claimFn({ data: undefined as never });
                    access.refetch();
                  }}
                >
                  Adminrechte übernehmen
                </Button>
              </>
            )}
          </div>
        ) : (
          children
        )}
      </main>
    </div>
  );
}
