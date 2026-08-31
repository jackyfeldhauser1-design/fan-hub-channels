# Livegang abschließen: Zahlung, Basis-Adresse, Kundenkonto, Tagesprüfung

## Aktueller Stand (geprüft)

- Bot-Zugangsdaten sind hinterlegt (1 Eintrag), Community-, Shop- und Kontrollraum-Chat-IDs sind gesetzt.
- Basis-Adresse zeigt noch auf die Vorschau-Adresse `project--…-dev.lovable.app`, nicht auf `fan-hub-channels.lovable.app`.
- Es gibt **0 aktive Produkte**, **0 Medienordner**, **0 Mediendateien** und **0 bezahlte Käufe**.
- Geplante Jobs laufen bereits für Wiederholungen (5 Min.), Kampagnen (15 Min.) und Lebenszyklus (stündlich). Ein täglicher Livegang-Prüfjob fehlt.

## Was gebaut wird

### 1. Basis-Adresse umstellen
- Basis-Adresse in den Bot-Einstellungen auf `https://fan-hub-channels.lovable.app` setzen.
- Webhook auf `https://fan-hub-channels.lovable.app/api/public/telegram/webhook` neu registrieren und verifizieren.
- Danach `/status` und die Livegang-Prüfung erneut ausführen und das Ergebnis berichten.

### 2. Startpaket für Katalog und Medien
- Ein Einrichtungs-Assistent auf `/status` legt auf Knopfdruck ein Startsortiment an: VIP-Zugang (450 Sterne), einen digitalen Einzelinhalt und einen Trinkgeld-Eintrag, dazu einen leeren Medienordner mit Verknüpfung zum Inhalt.
- Alle Werte bleiben danach im Adminbereich frei änderbar; der Medien-Upload nutzt die bestehende Upload-Oberfläche.

### 3. Echte Sterne-Zahlung durchgängig verdrahten
- Kaufabschluss im Bot-Webhook erweitert um: Eintrag im Admin-Protokoll (Käufer, Betrag, Produkt, Zahlungs-ID), Meldung in den Kontrollraum, Freischaltung im Shop-Kanal (Einladungslink bzw. Zugriffs-Ticket) und Bestätigung an den Käufer.
- Doppelte Zahlungen bleiben durch die vorhandene Zahlungs-ID-Prüfung ausgeschlossen.
- Ein Testmodus erlaubt einen echten 1-Stern-Kauf, um die Kette vor dem Livegang nachzuweisen.

### 4. Kundenkonto mit Historie
- Neue Fan-Seite `/konto`, erreichbar über einen persönlichen Bot-Link (Anmeldung über Telegram-Kennung, kein zusätzliches Passwort).
- Inhalte: gekaufte Medienordner mit aktiven Zugängen und Ablaufdatum, Bestell- und Zahlungsverlauf inklusive ausgegebener Sterne, laufendes VIP-Abo mit Verlängerungsdatum, Downloadereignisse.
- Aktionen für Fans: abgelaufenen Zugang erneut anfordern, neuen Download-Link erzeugen, Abo-Status einsehen.
- Zugriff ist streng auf die eigene Kennung begrenzt; alle Abrufe laufen über geprüfte Serverfunktionen und werden protokolliert.

### 5. Täglicher Livegang-Prüfjob
- Neuer Endpunkt für einen täglichen Lauf, der Bot-Erreichbarkeit, Webhook-Adresse, alle drei Chats (Mitgliedschaft und Senderecht), aktive Produkte, Medienbestand und die letzten Zustellfehler prüft.
- Ergebnis wird als Lauf protokolliert; bei Fehlern geht eine Meldung in den Kontrollraum.
- Zeitplan: täglich morgens, zusätzlich weiterhin manuell über „Alles prüfen" auslösbar.

## Technische Details

- Basis-Adresse: `bot_settings.app_base_url`, danach `setWebhook` über den Connector-Gateway.
- Startsortiment über Migration bzw. Adminaktion in `products` und `media_folders`.
- Zahlungsabschluss in `src/routes/api/public/telegram/webhook.ts` plus `src/lib/billing.server.ts`; neue Einträge in `admin_audit` und `notification_deliveries`.
- Kundenkonto: neue Route `src/routes/konto.tsx` mit signiertem Kurzzeit-Token aus dem Bot-Deep-Link; Datenzugriff über neue Serverfunktionen in `src/lib/account.functions.ts` mit Kennungsprüfung, keine direkten Datenbankabfragen aus dem Browser.
- Prüfjob: `src/routes/api/public/jobs/golive.ts` wiederverwendet `runGoLiveCheck`-Logik aus `src/lib/setup.server.ts`, Ergebnis in `job_runs`, Zeitplan über pg_cron mit dem vorhandenen Bearer-Schutz.
- Keine neuen Tabellen nötig außer optionalen Feldern für den Kontozugang.
