# Nächste Ausbaustufe: Zwei neue Channels + Rundum-Verbesserung

## Ziel
Der Funnel bekommt zwei zusätzliche Telegram-Ziele (öffentlicher Ankündigungs-Channel und Trailer-/Preview-Channel) und wird gleichzeitig in allen drei Richtungen verbessert: mehr Umsatz, einfachere Bedienung, stabilerer Betrieb.

## 1. Zwei neue Channels

### Ankündigungs-Channel (öffentlich)
- Neues Ziel „Ankündigungen“ in den Bot-Einstellungen, gleichwertig zu Gratis/VIP/Admin.
- Wird vom Ein-Klick-Assistenten automatisch erkannt, geprüft (Mitgliedschaft + Senderecht) und mit Testpost bestätigt.
- Jeder neue Drop bzw. jedes aktivierte Produkt kann mit einem Klick als Ankündigung gepostet werden – inklusive Button „Jetzt sichern“, der direkt in den Bot führt.

### Trailer-/Preview-Channel
- Zweites neues Ziel „Vorschau“.
- Medienordner erhalten eine optionale Vorschau-Datei; ein Klick postet Teaser + Preis + Kauf-Button in den Trailer-Channel.
- Klicks aus Trailer-Posts werden getrackt und in der Attribution als Quelle geführt.

### Routing-Übersicht
```text
Ankündigung ─┐
Trailer ─────┴──► Bot-Start ──► Gratis-Gruppe ──► Kauf ──► VIP / Ordner-Zugang
```

## 2. Umsatz
- Rabatt-/Aktionspreise pro Produkt und Ordner mit Laufzeit (z. B. 48-Stunden-Drop).
- Limited Drops: begrenzte Stückzahl, Restanzeige im Ankündigungs-Post.
- Automatischer Upsell-Post nach Kauf in den Ankündigungs-Channel-Templates.
- Kampagnen-Segment „hat Trailer geklickt, aber nicht gekauft“.

## 3. Einfachere Bedienung
- Startseite als Cockpit: heutige Umsätze, offene Aufgaben, Warnungen, ein Klick zu jedem Setup-Schritt.
- „Verbinden“-Assistent um die zwei neuen Channels erweitern, Fortschritt zeigt 5 Ziele.
- Ein Button „Drop veröffentlichen“, der Produkt, Trailer-Post und Ankündigung in einem Schritt erledigt.

## 4. Stabilität & Betrieb
- Cron-Überwachung: Warnung im Dashboard, wenn Retry- oder Kampagnen-Job länger als erwartet nicht gelaufen ist.
- Automatischer Health-Check aller fünf Chats täglich, Ergebnis im Audit-Log.
- Fehlerübersicht: letzte fehlgeschlagene Zustellungen mit Ursache und Direkt-Retry.

## Technische Details
- Migration: `bot_settings` erhält `announce_chat_id`, `preview_chat_id`; `products`/`media_folders` erhalten `sale_price_stars`, `sale_until`, `stock_limit`, `stock_sold`, `preview_file_id`.
- `connect.server.ts` und `ops.functions.ts` (`autoConnectTelegram`, `verifyConfiguredChats`) auf fünf Ziele erweitern, inklusive Heuristik für Channel-Typ `channel`.
- Neue Server-Funktionen für „Drop veröffentlichen“ (Ankündigung + Trailer) mit Rate-Limit und Audit-Eintrag.
- Trailer-Klicks über die bestehende `/api/public/n.$id`-Trackinglogik, neuer Touch-Typ in `purchase_attributions`.
- Cron-Health liest `job_runs`; keine neuen externen Dienste nötig.
