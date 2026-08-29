# Benachrichtigungs-Zentrale: Empfänger, Einstellungen, Zustellprotokoll

Aufbauend auf den bereits freigegebenen Mehrfach-Empfängern für Ablauf-Alarme kommt jetzt eine vollständige Benachrichtigungs-Verwaltung: pro Empfänger einstellbar, welche Alarme ankommen, mit Vorschau vor dem Versand, Zustellstatus, automatischer Wiederholung bei Fehlern und einem Ersatzkanal.

Hinweis zu E-Mail: Für dieses Projekt ist noch keine Absender-Domain eingerichtet, E-Mail-Versand ist damit aktuell nicht möglich. Der Plan baut Telegram als Hauptkanal aus und legt die Empfänger-/Vorlagenstruktur kanalunabhängig an, sodass E-Mail später nur noch als zweiter Kanal angeschlossen werden muss.

<presentation-actions>
<presentation-open-email-setup>E-Mail-Domain einrichten</presentation-open-email-setup>
</presentation-actions>

## Was du bekommst

- **Empfängerliste**: Ein neuer Bereich „Benachrichtigungen“ mit allen Empfängern (Name, Kanal, Telegram-Chat-ID oder E-Mail-Adresse, aktiv/inaktiv).
- **Opt-in/Opt-out pro Empfänger und Alarmtyp**: abgelaufen, bald ablaufend, Zahlung offen, Konto gesperrt, Zugang neu aktiviert – jeweils einzeln an-/abschaltbar. Ein globaler Schalter „Alle Benachrichtigungen pausieren“ pro Empfänger.
- **Zuordnung pro Zugang**: Wie im freigegebenen Plan lassen sich je Zugangslink zusätzliche Empfänger auswählen; ohne Auswahl greifen die globalen Support-Empfänger.
- **Vorschau je Empfänger**: Vor dem Speichern siehst du die fertige Nachricht mit echten Werten (Fan, Inhalt, Ticket-ID, Ablaufdatum) und eine Variablenübersicht, welcher Platzhalter woraus befüllt wird. Inklusive „Testnachricht senden“.
- **Zustellprotokoll**: Jede Benachrichtigung mit Empfänger, Kanal, Alarmtyp, Status (gesendet, fehlgeschlagen, wiederholt, übersprungen wegen Opt-out), Fehlertext und Zeitstempel – filterbar und als CSV exportierbar.
- **Automatische Wiederholung**: Fehlgeschlagene Sendungen werden bis zu 3× mit wachsendem Abstand erneut versucht; danach Status „endgültig fehlgeschlagen“ und Hinweis im Dashboard.
- **Ersatzkanal**: Schlägt der bevorzugte Kanal eines Empfängers fehl, geht die Nachricht automatisch über den hinterlegten Ersatzkanal raus (heute: zweite Telegram-Chat-ID bzw. später E-Mail); der Fallback wird im Protokoll gekennzeichnet.

## Umsetzung (technisch)

1. **Migration**
   - `notification_recipients` (label, channel enum `telegram|email`, chat_id, email, fallback_channel, fallback_target, active, created_at/updated_at + `set_updated_at`-Trigger)
   - `notification_prefs` (recipient_id, kind enum `expiring|expired|unpaid|blocked|reactivated`, enabled) mit Unique (recipient_id, kind)
   - `notification_deliveries` (recipient_id, kind, channel, token_id, status enum `queued|sent|failed|retrying|skipped_optout|dead`, attempt, error, next_retry_at, created_at/updated_at)
   - `access_token_recipients` (token_id, recipient_id) als Zuordnung pro Zugang (ersetzt das Array-Feld aus dem Vorgängerplan)
   - `bot_settings`: `support_recipient_ids uuid[]` bzw. Default-Zuordnung über `notification_recipients.is_default`
   - GRANTs für `authenticated`/`service_role`, RLS mit `is_admin()` wie bei den übrigen Admin-Tabellen.
2. **`src/lib/notify.server.ts`**
   - Empfängerauflösung: Admin-Chat + Default-Empfänger + Zuordnung zum Token, dedupliziert.
   - Filter über `notification_prefs`; Opt-out erzeugt `skipped_optout`-Eintrag statt Versand.
   - Rendering über eine neue Vorlagenfunktion mit Platzhaltern (`{fan}`, `{inhalt}`, `{ticket}`, `{ablauf}`, `{grund}`) – dieselbe Funktion speist Vorschau und Versand.
   - Versand pro Empfänger, Ergebnis in `notification_deliveries`; bei Fehler `status=retrying`, `next_retry_at = now() + 1/5/15 min`, danach `dead`; bei erschöpftem Primärkanal Fallback-Versuch.
3. **Retry-Job**
   - Öffentliche Route `src/routes/api/public/notifications/retry.ts` mit `authenticateCronRequest`, verarbeitet fällige `next_retry_at`-Zeilen; `pg_cron`-Eintrag alle 5 Minuten.
4. **Server-Funktionen (`src/lib/notifications.functions.ts`)**
   - `listRecipients`, `saveRecipient`, `deleteRecipient` (Admin), `setRecipientPrefs`, `setTokenRecipients` (Admin/Operator)
   - `previewNotification({ recipientId, kind, tokenId? })` → gerenderter Text + Variablenzuordnung
   - `sendTestNotification` (Admin), `listDeliveries` mit Filtern, `exportDeliveriesCsv`
5. **UI**
   - Neue Route `src/routes/benachrichtigungen.tsx` (noindex, DashLayout, eigener `head()`): Empfängertabelle, Prefs-Matrix (Empfänger × Alarmtyp), Vorschaupanel mit Variablentabelle und Testversand, Zustellprotokoll mit Filtern und CSV-Export. Mobile Kartenansicht analog zu `/zugriffe`.
   - Navigationseintrag in `src/components/DashLayout.tsx` (sekundäre Navigation).
   - `src/routes/zugriffe.tsx`: Dialog „Empfänger“ pro Zugang zum Auswählen der Empfänger.
   - `src/routes/einstellungen.tsx`: Verweis auf den neuen Bereich statt einzelner Notify-Schalter (bestehende Schalter bleiben als globaler Master erhalten).
6. **Prüfung**: `bunx tsgo --noEmit`, lokale HTTP-Checks für `/benachrichtigungen`, `/zugriffe`, `/einstellungen`, plus simulierter Fehlversand zum Prüfen von Retry und Fallback.
