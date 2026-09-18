# Fan Hub Channels

Eigenständiger Telegram-Fan-Funnel für digitale Inhalte, VIP-Zugänge und Zahlungen.

## Architektur

- **Source of truth:** GitHub
- **Datenbank/Auth/Storage:** Supabase
- **Hosting:** unabhängig von Lovable, vorbereitet für Netlify bzw. jeden Node-kompatiblen Hoster
- **Kundenfluss:** vollständig über Telegram
- **Zahlungen:** Telegram Stars, TON und TRX
- **Admin:** internes Web-Dashboard

## Lokale Entwicklung

Voraussetzungen: Bun oder Node.js.

```sh
git clone https://github.com/jackyfeldhauser1-design/fan-hub-channels.git
cd fan-hub-channels
bun install
bun run dev
```

## Produktion

```sh
bun run typecheck
bun run test
bun run build
bun run preflight
bun run start
```

Benötigte Umgebungsvariablen stehen in `.env.example`. Server-Secrets niemals committen.

## Healthcheck

`GET /api/health` prüft Datenbank- und Telegram-Konfiguration, ohne Geheimnisse auszugeben.
