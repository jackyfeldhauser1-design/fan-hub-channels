import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Lock, ShieldCheck } from "lucide-react";
import { openSecureContent } from "@/lib/public.functions";

export const Route = createFileRoute("/inhalt/$token")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Geschützter Inhalt" },
      { name: "description", content: "Persönlicher Einmal-Zugang zu deinem gekauften Inhalt." },
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:title", content: "Geschützter Inhalt" },
      { property: "og:description", content: "Persönlicher Einmal-Zugang zu deinem gekauften Inhalt." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ContentPage,
});

const messages: Record<string, string> = {
  invalid: "Dieser Zugang ist ungültig.",
  expired: "Dieser Zugang ist abgelaufen. Melde dich im Bot für einen neuen Link.",
  used_up: "Die maximale Anzahl an Aufrufen ist erreicht.",
  revoked: "Dieser Zugang wurde gesperrt (z. B. wegen Weitergabe).",
};

function ContentPage() {
  const { token } = Route.useParams();
  const openFn = useServerFn(openSecureContent);
  const { data, isPending } = useQuery({
    queryKey: ["secure", token],
    queryFn: () => openFn({ data: { token } }),
    staleTime: Infinity,
    retry: false,
    refetchOnWindowFocus: false,
  });

  if (isPending) return <main className="grid min-h-screen place-items-center text-muted-foreground">Prüfe Zugang…</main>;

  if (!data || data.status !== "ok") {
    return (
      <main className="grid min-h-screen place-items-center px-4">
        <div className="panel max-w-md p-8 text-center">
          <Lock className="mx-auto size-8 text-muted-foreground" />
          <h1 className="mt-4 text-xl font-semibold">Kein Zugriff</h1>
          <p className="mt-2 text-sm text-muted-foreground">{messages[data?.status ?? "invalid"]}</p>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto min-h-screen w-full max-w-2xl px-4 py-12">
      <div className="panel p-8">
        <p className="flex items-center gap-2 text-xs text-primary">
          <ShieldCheck className="size-4" /> Persönlicher Zugang · noch {data.viewsLeft} Aufruf(e) · gültig bis{" "}
          {new Date(data.expiresAt).toLocaleString("de-DE")}
        </p>
        <h1 className="mt-4 text-3xl font-bold">{data.title}</h1>
        {data.description ? <p className="mt-2 text-sm text-muted-foreground">{data.description}</p> : null}

        <div className="mt-6 rounded-xl border border-border p-5">
          {data.deliveryType === "link" && data.payload ? (
            <a className="break-all font-medium text-primary underline" href={data.payload}>
              {data.payload}
            </a>
          ) : (
            <p className="whitespace-pre-wrap text-sm">{data.payload}</p>
          )}
        </div>

        <p className="mt-6 text-xs text-muted-foreground">
          Bitte nicht weitergeben – der Link ist mit deinem Telegram-Konto verknüpft und wird bei Weitergabe automatisch
          gesperrt.
        </p>
      </div>
    </main>
  );
}
