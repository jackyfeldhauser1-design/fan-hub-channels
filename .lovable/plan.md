# Start-Setup: Struktur in 60 Sekunden auf Telegram bringen

## Wichtig vorab (technische Realität)
Ein Telegram-**Bot** darf keine Gruppen oder Kanäle anlegen — das erlaubt die Bot-API nicht. Das Anlegen muss einmalig von deinem Telegram-Konto ausgehen. Alles danach (Erkennen, Zuordnen, Rechte prüfen, Testpost, Begrüßungstexte, Pin) läuft automatisch.

## Ergebnis
Du gibst deinen bestehenden Bot-Token ein und tippst dreimal auf einen Button. Die App macht den Rest.

```text
Token eingeben ──► Bot geprüft + Webhook gesetzt
        │
        ├─ "Community erstellen"  ──► Telegram öffnet ──► Bot rein ──► auto erkannt & eingerichtet
        ├─ "Shop erstellen"       ──► Telegram öffnet ──► Bot rein ──► auto erkannt & eingerichtet
        └─ "Kontrollraum"         ──► Bot im Privatchat starten ──► auto erkannt
                                                    ▼
                                        3/3 verbunden · Testposts gesendet
```

## Ablauf im Detail

### Schritt 1 – Token
- Eingabefeld für deinen bestehenden Bot-Token; wird sicher als Secret gespeichert (nie im Code, nie im Browser sichtbar).
- Sofortprüfung: Bot-Name, Bot-Link, Webhook wird automatisch auf die aktuelle App-Adresse gesetzt.

### Schritt 2 – Die drei Ziele anlegen
Pro Ziel eine Karte mit einem Button, der Telegram direkt öffnet:
- **Community** (Gratis-Gruppe) und **Shop** (VIP-/Verkaufsgruppe): Button öffnet Telegram mit dem vorbereiteten Bot-Einladungslink, du wählst „Neue Gruppe“, benennst sie mit dem vorgeschlagenen Namen und bestätigst.
- **Kontrollraum**: Button öffnet den Bot-Privatchat mit `/start kontrollraum`.
- Jede Karte zeigt die kurze Klick-Anleitung und einen Fortschrittspunkt („warte auf Gruppe…“ → „verbunden“).

### Schritt 3 – Automatik danach
Sobald der Bot in einem Chat landet, erkennt die App das über den Webhook und richtet ohne weiteres Zutun ein:
- Zuordnung zu Community / Shop / Kontrollraum (per Setup-Code aus dem Einladungslink, sonst per Namensmuster).
- Prüfung: Bot ist Mitglied, darf posten, ist bei Bedarf Admin — bei fehlenden Rechten ein klarer Hinweis mit Fix-Anleitung.
- Willkommens-/Regelpost je Kanal, angepinnt; Testpost in den Kontrollraum.
- Speicherung in den Bot-Einstellungen und Eintrag ins Admin-Audit.
- Live-Anzeige „x/3 verbunden“, Auto-Aktualisierung ohne Neuladen.

### Schritt 4 – Absicherung
- Setup-Codes laufen nach 30 Minuten ab und gelten einmalig.
- Nur Administratoren dürfen das Setup starten; Rate-Limit gegen Missbrauch.
- Button „Neu einrichten“ setzt die Zuordnung zurück (Verlauf bleibt im Audit erhalten).

## Technische Details
- Neues Secret `TELEGRAM_BOT_TOKEN` (via `set_secret` aus dem Eingabefeld). Neuer Helper `tgApi()` in `src/lib/telegram.server.ts`: nutzt `api.telegram.org/bot<token>` wenn gesetzt, sonst weiterhin das bestehende Gateway; `tgCall` in `ops.functions.ts`, `connect.server.ts`, `drops.server.ts`, `notify.server.ts` darauf umstellen.
- Migration: Tabelle `chat_setup_codes` (code, target, expires_at, used_at, created_by) mit GRANTs, RLS (nur Admin lesen, Service-Role schreiben).
- Einladungslinks: `https://t.me/<bot>?startgroup=<code>` für Community/Shop, `https://t.me/<bot>?start=<code>` für den Kontrollraum.
- Webhook `src/routes/api/public/telegram/webhook.ts`: `my_chat_member` und `/start`-Payload auswerten, Code auflösen, Ziel in `bot_settings` schreiben, Rechte prüfen, Willkommenspost + Pin, Audit-Eintrag.
- Server-Funktionen in `src/lib/ops.functions.ts`: `saveBotToken`, `startGuidedSetup` (Codes + Links erzeugen), `getSetupProgress` (Polling alle 3 s).
- UI: neuer `GuidedSetupWizard.tsx`, eingebunden in `src/routes/verbinden.tsx` als Schritt 1; `ConnectPanel` bleibt als manueller Fallback.
