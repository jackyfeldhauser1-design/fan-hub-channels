import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Activity,
  BellRing,
  LayoutDashboard,
  Package,
  FolderLock,
  Receipt,
  Users,
  Settings2,
  LogOut,
  Sparkles,
  Truck,
  ShieldAlert,
  ShieldCheck,
  KeyRound,
  UserCog,
  Megaphone,
  Rocket,
  MoreHorizontal,
  Plug,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/useAuth";
import { getAccess, claimAdmin } from "@/lib/admin.functions";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

const nav = [
  { to: "/", label: "Übersicht", icon: LayoutDashboard },
  { to: "/status", label: "Status", icon: Activity },
  { to: "/verbinden", label: "Verbinden", icon: Plug },
  { to: "/produkte", label: "Inhalte & Preise", icon: Package },
  { to: "/medien", label: "Medien-Ordner", icon: FolderLock },
  { to: "/verkaeufe", label: "Verkäufe", icon: Receipt },
  { to: "/bestellungen", label: "Bestellungen", icon: Truck },
  { to: "/fans", label: "Fans & Affiliates", icon: Users },
  { to: "/zugriffe", label: "Zugriffe", icon: KeyRound },
  { to: "/benachrichtigungen", label: "Benachrichtigungen", icon: BellRing },
  { to: "/kampagnen", label: "Kampagnen", icon: Megaphone },
  { to: "/sicherheit", label: "Sicherheit", icon: ShieldAlert },
  { to: "/werbeposts", label: "Werbepartner", icon: Megaphone },
  { to: "/leads", label: "Warteliste", icon: Rocket },
  { to: "/team", label: "Team & Rollen", icon: UserCog },
  { to: "/zwei-faktor", label: "Zwei-Faktor", icon: ShieldCheck },
  { to: "/einstellungen", label: "Bot-Setup", icon: Settings2 },
] as const;

const primaryPaths = ["/", "/bestellungen", "/produkte", "/fans", "/einstellungen"] as const;
const primaryNav = primaryPaths.map((p) => nav.find((n) => n.to === p)!);
const secondaryNav = nav.filter((n) => !primaryPaths.includes(n.to as (typeof primaryPaths)[number]));

export function DashLayout({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  const { session, loading } = useAuth();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const accessFn = useServerFn(getAccess);
  const claimFn = useServerFn(claimAdmin);
  const [moreOpen, setMoreOpen] = useState(false);

  useEffect(() => {
    if (!loading && !session) navigate({ to: "/auth" });
  }, [loading, session, navigate]);

  const access = useQuery({
    queryKey: ["access", session?.user.id],
    queryFn: () => accessFn({ data: undefined as never }),
    enabled: Boolean(session),
  });

  const signOut = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/auth" });
  };

  if (loading || !session) {
    return <div className="grid min-h-screen place-items-center text-muted-foreground">Lädt…</div>;
  }

  return (
    <div className="min-h-screen lg:flex">
      {/* Desktop-Sidebar */}
      <aside className="hidden bg-sidebar lg:sticky lg:top-0 lg:flex lg:h-screen lg:w-64 lg:shrink-0 lg:flex-col lg:border-r lg:border-sidebar-border">
        <div className="flex items-center gap-2 px-5 py-5">
          <span className="grid size-9 place-items-center rounded-xl gold-surface">
            <Sparkles className="size-5" />
          </span>
          <div>
            <p className="font-display text-sm font-bold leading-tight">Fan Funnel</p>
            <p className="text-xs text-muted-foreground">Telegram Studio</p>
          </div>
        </div>
        <nav className="flex flex-col gap-1 px-3 pb-3">
          {nav.map((item) => {
            const active = pathname === item.to;
            return (
              <Link
                key={item.to}
                to={item.to}
                className={`flex min-h-11 shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors ${
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
        <div className="mt-auto px-3 pb-5">
          <Button variant="ghost" className="w-full justify-start gap-2 text-muted-foreground" onClick={signOut}>
            <LogOut className="size-4" /> Abmelden
          </Button>
        </div>
      </aside>

      {/* Mobile-Kopfzeile */}
      <header
        className="sticky top-0 z-30 flex items-center gap-2 border-b border-sidebar-border bg-sidebar/95 px-4 py-3 backdrop-blur lg:hidden"
        style={{ paddingTop: "calc(env(safe-area-inset-top) + 0.75rem)" }}
      >
        <span className="grid size-8 place-items-center rounded-lg gold-surface">
          <Sparkles className="size-4" />
        </span>
        <p className="font-display text-sm font-bold">Fan Funnel</p>
        <Button variant="ghost" size="icon" className="ml-auto size-11" onClick={signOut} aria-label="Abmelden">
          <LogOut className="size-5" />
        </Button>
      </header>

      <main className="flex-1 px-4 py-6 pb-28 sm:px-8 lg:pb-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold sm:text-3xl">{title}</h1>
          {subtitle ? <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p> : null}
        </div>

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

      {/* Mobile Bottom-Navigation */}
      <nav
        className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-6 gap-1 border-t border-sidebar-border bg-sidebar/95 px-2 pt-2 backdrop-blur lg:hidden"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 0.5rem)" }}
      >
        {primaryNav.map((item) => {
          const active = pathname === item.to;
          return (
            <Link
              key={item.to}
              to={item.to}
              className={`flex min-h-11 flex-col items-center justify-center gap-1 rounded-lg px-1 py-1.5 text-[10px] leading-tight ${
                active ? "bg-sidebar-accent text-sidebar-accent-foreground" : "text-muted-foreground"
              }`}
            >
              <item.icon className="size-5" />
              <span className="truncate">{item.label.split(" ")[0]}</span>
            </Link>
          );
        })}
        <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
          <SheetTrigger asChild>
            <button
              type="button"
              className="flex min-h-11 flex-col items-center justify-center gap-1 rounded-lg px-1 py-1.5 text-[10px] leading-tight text-muted-foreground"
            >
              <MoreHorizontal className="size-5" />
              <span>Mehr</span>
            </button>
          </SheetTrigger>
          <SheetContent side="bottom" className="rounded-t-2xl">
            <SheetHeader>
              <SheetTitle>Weitere Bereiche</SheetTitle>
            </SheetHeader>
            <div className="mt-4 grid gap-1 pb-6">
              {secondaryNav.map((item) => (
                <Link
                  key={item.to}
                  to={item.to}
                  onClick={() => setMoreOpen(false)}
                  className="flex min-h-11 items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-sidebar-accent/60"
                >
                  <item.icon className="size-4" />
                  {item.label}
                </Link>
              ))}
              <button
                type="button"
                onClick={signOut}
                className="flex min-h-11 items-center gap-3 rounded-lg px-3 py-2 text-left text-sm text-muted-foreground hover:bg-sidebar-accent/60"
              >
                <LogOut className="size-4" /> Abmelden
              </button>
            </div>
          </SheetContent>
        </Sheet>
      </nav>
    </div>
  );
}
