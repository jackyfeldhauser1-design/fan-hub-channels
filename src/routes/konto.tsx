import { createFileRoute } from "@tanstack/react-router";
import { Bot, Lock } from "lucide-react";

export const Route = createFileRoute("/konto")({
  head: () => ({
    meta: [
      { name: "robots", content: "noindex, nofollow" },
      { title: "Kundenbereich deaktiviert" },
    ],
  }),
  component: TelegramOnlyNotice,
});

function TelegramOnlyNotice() {
  return (
    <main className="grid min-h-screen place-items-center px-4">
      <div className="panel max-w-md p-8 text-center">
        <Lock className="mx-auto size-8 text-muted-foreground" />
        <h1 className="mt-4 text-xl font-semibold">Kundenbereich nur über Telegram</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Dieses Web-Kundenkonto ist deaktiviert. Käufe, Freischaltungen und „Meine Inhalte“ werden ausschließlich über den Telegram-Bot und die verbundenen Gruppen gesteuert.
        </p>
        <div className="mt-5 inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm">
          <Bot className="size-4" /> Öffne deinen Fan-Bot in Telegram.
        </div>
      </div>
    </main>
  );
}
