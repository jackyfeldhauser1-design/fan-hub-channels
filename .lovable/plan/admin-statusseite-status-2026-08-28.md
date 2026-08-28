# Admin-Statusseite („Status“)

## Ziel
Eine neue Dashboard-Seite **/status** zeigt den aktuellen Admin-Status (Konto, Admin-Rolle, Bot-Verbindung) und eine personalisierte „Nächste Schritte“-Checkliste, die aus dem echten Zustand der Datenbank und des Telegram-Bots berechnet wird.

## Bestätigter Ist-Zustand
- Ein Konto vorhanden (`stewardsfelize@gmail.com`), ist bereits Admin (1 Zeile in `user_roles`).
- `bot_settings` existiert mit Defaults: `free_group_url`, `vip_group_url`, `free_chat_id`, `vip_chat_id`, `ton_wallet`, `app_base_url` sind **leer**; Preise (Early Access 250 ⭐, Sponsor 1500 ⭐) gesetzt.
- 0 Produkte, 0 Käufe, 0 Fans, 0 Leads → die Checkliste wird entsprechend „Bot verbinden“, „Gruppen eintragen“, „Produkt anlegen“ vorschlagen.
- Vorhandene Bausteine: `getAccess`/`claimAdmin` (Admin-Gate), `getBotStatus` (getMe + WebhookInfo), `DashLayout` mit Nav-Array.

## Umsetzung

### 1. Serverfunktion `getAdminStatus` (src/lib/admin.functions.ts)
Admin-geschützt (über `requireAdmin`), liefert in einem Aufruf:
- **Konto**: E-Mail und User-ID des eingeloggten Admins (über `supabaseAdmin` aus `auth.users`).
- **Admin-Status**: `isAdmin`, `adminExists`, Rollenzeile (Rolle „admin“, vergeben am).
- **Bot-Verbindung**: Bot-Username, Webhook-URL, ausstehende Updates (erneute Nutzung der `tg()`-Hilfsfunktion wie in `getBotStatus`; Fehler von Telegram werden als „nicht verbunden“ abgefangen, statt die Seite crashen zu lassen).
- **Einrichtungszustand**: freie/VIP-Gruppen-URL + Chat-IDs, `app_base_url`, TON-Wallet, Willkommensnachricht, Preise, Anzahl Produkte/Käufe/Fans/Leads.

### 2. Neue Route src/routes/status.tsx
- `createFileRoute("/status")` mit eigener `head()`-Metadaten (Titel/Beschreibung/og:*).
- Lädt über `useAdmin()`-Gate + `useQuery` (Muster wie `index.tsx`).
- Darstellung:
  - **Status-Karten**: Admin (aktiv/inaktiv mit E-Mail), Bot (verbunden @username / Webhook aktiv), Funnel-Gruppen (konfiguriert/fehlt).
  - **Checkliste „Nächste Schritte“**: dynamisch generierte Aufgaben mit Häkchen (erledigt) bzw. direktem Link zur passenden Seite:
    - Bot verbinden/Webhook aufsetzen → `/einstellungen` (Button „Webhook einrichten“)
    - Gratis- und VIP-Gruppe/Channel eintragen → `/einstellungen`
    - TON-Wallet hinterlegen → `/einstellungen`
    - Ersten digitalen Inhalt anlegen → `/produkte`
    - Willkommensnachricht anpassen → `/einstellungen`
    - Funnel-Test (erster Kauf) → Hinweis auf `/bestellungen`
  - Fehlt die Admin-Rolle, zeigt die Seite den bestehenden Adminzugang-Flow (Übernehmen-Button aus `claimAdmin`).

### 3. Navigation (src/components/DashLayout.tsx)
- Neuer Nav-Eintrag „Status“ (Icon `Activity`) direkt nach „Übersicht“.

## Verifikation
- `bunx tsgo --noEmit` fehlerfrei.
- Lokaler Browser-Check: `/status` antwortet 200 und zeigt Admin-Status + Checkliste mit den tatsächlichen Werten (Gruppen leer → Aufgaben offen).
