# Ablauf-Alarme an mehrere Telegram-Empfänger

Heute geht jede Ablauf-/Sperr-Meldung nur an eine einzige Admin-Chat-ID (aus dem Bot-Setup) plus optional an den Fan. Künftig kannst du pro Zugang zusätzliche Empfänger hinterlegen – z. B. dein Support-Konto oder eine Team-Gruppe – und zusätzlich eine globale Support-Liste als Fallback pflegen.

## Was du bekommst

- **Globale Support-Empfänger** im Bot-Setup: eine Liste von Telegram-Chat-IDs, die bei Ablauf-, Sperr- und Zahlungs-Alarmen immer mitbenachrichtigt wird.
- **Empfänger pro Zugang**: In „Zugriffe“ kannst du je Zugangslink zusätzliche Chat-IDs hinterlegen. Sind welche gesetzt, gelten sie zusätzlich zur globalen Liste; ist nichts gesetzt, greift nur die globale Liste.
- **Fan-Benachrichtigung** bleibt wie bisher optional und unverändert.
- **Keine Doppel-Nachrichten**: Admin-Chat, Support-Liste und Ticket-Empfänger werden vor dem Versand entdoppelt.
- **Nachvollziehbarkeit**: Jeder Alarmversand wird als Ereignis im Lieferprotokoll festgehalten (Art, Anzahl Empfänger, Erfolg/Fehler).

## Umsetzung (technisch)

1. **Migration**
   - `bot_settings.support_chat_ids text[] not null default '{}'`
   - `access_tokens.notify_chat_ids text[] not null default '{}'`
   - Keine neuen Tabellen, bestehende Admin-RLS gilt weiter.
2. **`src/lib/notify.server.ts`**
   - `notifyAccessIssue` ermittelt die Empfängerliste: `admin_chat_id` + `support_chat_ids` + `token.notify_chat_ids` (neuer optionaler Parameter `tokenId`), dedupliziert und validiert (nur numerische IDs / `@name`).
   - Versand sequenziell mit `Promise.allSettled`, Fehler werden geschluckt (Zugriffsfluss darf nie blockieren), Ergebnis wird als `order_events`-Eintrag `notify_sent` mit Detail geloggt.
3. **`src/lib/public.functions.ts` / `src/lib/admin.functions.ts`**
   - Bestehende Aufrufe (`expired`, `unpaid`, `blocked`, `reactivated`) übergeben zusätzlich die Token-ID.
   - Settings-Schema in `admin.functions.ts` um `support_chat_ids` erweitern; `listAccessLog` liefert `notifyChatIds` pro Token; neue Server-Funktion `setTokenNotifyRecipients` (Admin/Operator) zum Speichern.
4. **UI**
   - `src/routes/einstellungen.tsx`: Textfeld (komma-/zeilengetrennt) für globale Support-Chat-IDs, inkl. Hinweistext.
   - `src/routes/zugriffe.tsx`: pro Zugang ein kleiner Dialog „Empfänger“ zum Pflegen der zusätzlichen Chat-IDs (Desktop-Tabelle und Mobile-Karte), Anzeige der aktuellen Anzahl.
5. **Prüfung**: `bunx tsgo --noEmit`, lokale HTTP-Checks für `/einstellungen` und `/zugriffe`.
