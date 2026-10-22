import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/datenschutz")({
  head: () => ({
    meta: [
      { title: "Datenschutzhinweise | ItsFelize" },
      {
        name: "description",
        content: "Informationen zur Verarbeitung personenbezogener Daten im ItsFelize-Telegram-Angebot.",
      },
      { name: "robots", content: "index, follow" },
    ],
  }),
  component: PrivacyPage,
});

function PrivacyPage() {
  return (
    <main className="min-h-screen px-4 py-10 sm:px-6">
      <article className="panel mx-auto max-w-3xl space-y-7 p-6 sm:p-9">
        <Link to="/" className="text-sm text-primary hover:underline">
          ← Zurück
        </Link>
        <header>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">
            ItsFelize · Datenschutz
          </p>
          <h1 className="mt-3 text-3xl font-bold sm:text-4xl">Datenschutzhinweise</h1>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            Diese Hinweise erklären, welche Daten im Rahmen des Telegram-Bots und des
            dazugehörigen Kauf- und Inhaltsangebots verarbeitet werden können.
          </p>
        </header>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold">Kontakt</h2>
          <p className="text-sm leading-6 text-muted-foreground">
            Datenschutzanfragen:{" "}
            <a className="underline underline-offset-4" href="mailto:stewardsfelize@gmail.com">
              stewardsfelize@gmail.com
            </a>
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold">Verarbeitete Daten und Zwecke</h2>
          <p className="text-sm leading-6 text-muted-foreground">
            Je nach Nutzung werden Telegram-Nutzer- und Chat-IDs, Benutzername und Anzeigename,
            Nachrichten und Bot-Interaktionen, Altersbestätigung und Einwilligungsstatus,
            Bestellungen, Zahlungsstatus, Kaufhistorie, Inhaltszugriffe sowie technische
            Sicherheits- und Fehlerprotokolle verarbeitet. Diese Daten dienen dem Betrieb des
            Bots, der Bereitstellung gekaufter Inhalte, dem Support, der Betrugsprävention und
            – soweit erlaubt und eingewilligt – Informationen zu Angeboten. Du kannst dich über
            die im Bot angegebene Abmeldefunktion von Werbe- bzw. automatisierten Nachrichten
            abmelden.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold">Rechtsgrundlagen</h2>
          <p className="text-sm leading-6 text-muted-foreground">
            Je nach Vorgang erfolgt die Verarbeitung zur Durchführung angeforderter Leistungen
            und Käufe, aufgrund deiner Einwilligung oder aufgrund berechtigter Interessen an
            Sicherheit, Missbrauchsvermeidung und zuverlässigem Betrieb.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold">Drittanbieter und Zahlungen</h2>
          <p className="text-sm leading-6 text-muted-foreground">
            Telegram verarbeitet Daten, wenn du Telegram nutzt. Hosting, Datenbank und technische
            Funktionen werden unter anderem über Vercel und Supabase bereitgestellt. Telegram
            Stars werden durch Telegram abgewickelt. Bei Zahlungen über TON oder TRX können
            Transaktionsdaten auf der jeweiligen Blockchain öffentlich sichtbar sein. Je nach
            Anbieter können Daten auch außerhalb des Europäischen Wirtschaftsraums verarbeitet
            werden.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold">Speicherung und deine Rechte</h2>
          <p className="text-sm leading-6 text-muted-foreground">
            Daten werden nur so lange gespeichert, wie sie für den jeweiligen Zweck benötigt
            werden oder gesetzliche Aufbewahrungspflichten bestehen. Im gesetzlichen Rahmen kannst
            du Auskunft, Berichtigung, Löschung, Einschränkung der Verarbeitung und
            Datenübertragbarkeit verlangen, widersprechen oder eine Einwilligung für die Zukunft
            widerrufen. Du kannst dich außerdem bei einer Datenschutzaufsichtsbehörde beschweren.
            Wende dich dazu an die oben genannte Kontaktadresse.
          </p>
        </section>

        <section className="rounded-xl border border-border bg-background/40 p-4">
          <h2 className="font-semibold">Noch zu vervollständigen</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Vor einer abschließenden rechtlichen Freigabe müssen die vollständige Identität und
            postalische Anschrift der verantwortlichen Stelle ergänzt und die Angaben zu allen
            tatsächlich aktivierten Diensten geprüft werden.
          </p>
          <p className="mt-3 text-xs text-muted-foreground">Zuletzt aktualisiert: 22. Oktober 2026</p>
        </section>
      </article>
    </main>
  );
}
