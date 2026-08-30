# Ausbau: Umsatz steigern, erweitern, stabilisieren

Der Funnel (Bot-Start, VIP 450 Stars, Shop-Käufe, Referrals, geschützte Downloads, Kampagnen) steht. Jetzt drei Blöcke: mehr Umsatz pro Fan, mehr Automatik, weniger Störungen.

## 1. Umsatzsteigernde Features

**Abo statt Einmalkauf (VIP-Monatszugang)**
Stars-Abos mit Laufzeit (30 Tage), automatische Ablauf-Erinnerung 3 Tage vorher per Bot mit Verlängerungs-Knopf, Auto-Entzug des VIP-Zugangs bei Ablauf. Wiederkehrender Umsatz statt Einmalzahlung.

**Bundles & Rabatt-Codes**
Mehrere Ordner/Produkte als Paket zu einem Preis. Aktionscodes mit Prozent- oder Stars-Rabatt, Ablaufdatum und Nutzungslimit — direkt im Bot einlösbar (`/code SOMMER`).

**Upsell & Warenkorb-Rettung**
Nach jedem Kauf ein passendes Zusatzangebot im Bot ("Fans, die das kauften …"). Wer eine Rechnung öffnet aber nicht zahlt, bekommt nach 30 Minuten automatisch eine Erinnerung mit einmaligem Rabatt.

**Trinkgeld & freie Beträge**
`/tip` mit Stufen (50/100/500 Stars) plus Freibetrag, inkl. öffentlicher Danke-Post im Community-Chat (optional).

**Zeitlich limitierte Drops mit Countdown**
Preis-Stufen (Frühbucher → Normalpreis), Restplatz-Anzeige, automatischer Ankündigungs-Post und Countdown-Erinnerung.

**Referral-Boost**
Staffel-Provision (z. B. 10 % → 15 % ab 5 Vermittlungen), Bestenliste im Community-Chat, Bonus-Stars-Gutschrift statt nur Zähler.

## 2. Automatisierung & Bindung

- **Willkommens-Sequenz**: 3 automatische Bot-Nachrichten (Tag 0/1/3) für neue Fans mit Angebot am Ende.
- **Reaktivierung**: Fans ohne Kauf seit 14/30 Tagen erhalten automatisch ein Angebot.
- **Werbe-Scheduler-Ausbau**: Zeitfenster, maximale Posts pro Tag, Rotation der Motive.
- **Bot-Menü**: feste Befehlsliste (`setMyCommands`) + Inline-Buttons statt Textbefehle.

## 3. Stabilisierung

- **Zahlungs-Idempotenz härten**: jede `successful_payment` genau einmal verarbeiten (eindeutiger Schlüssel auf `telegram_payment_charge_id`), auch bei Telegram-Wiederholungen.
- **Fehlerresistenz Bot**: Retry mit Backoff bei Telegram-5xx/429 (`retry_after` beachten), Fehler ins Zustellprotokoll statt stiller Abbruch.
- **Basis-Adresse automatisch**: Webhook-URL folgt der veröffentlichten Domain, Warnung im Status, wenn Webhook auf eine Vorschau-Adresse zeigt (Ursache des 302-Fehlers).
- **Livegang-Check erweitern**: Prüfpunkte für Abo-Job, Zahlungs-Idempotenz, Bot-Menü, Rabattcodes.
- **Umsatz-Report**: Tages-/Wochenumsatz nach Quelle (VIP, Shop, Trinkgeld, Referral) mit CSV-Export.

## Technische Umsetzung (Kurzfassung)

- Neue Tabellen: `subscriptions`, `discount_codes`, `code_redemptions`, `bundles`/`bundle_items`, `cart_reminders`, `bot_sequences`; alle mit RLS (Admin über `is_admin()`, Service-Role für Jobs) und GRANTs.
- Eindeutiger Index auf die Telegram-Zahlungs-ID in `purchases` für Idempotenz.
- Bot-Logik in `src/routes/api/public/telegram/webhook.ts` + neue Helfer in `src/lib/`(`billing.server.ts`, `sequences.server.ts`); Telegram-Aufrufe zentral über `telegram.server.ts` mit Retry.
- Zeitgesteuertes über bestehende Cron-Route (Abo-Ablauf, Sequenzen, Reaktivierung, Warenkorb-Rettung), Ausführung in `job_runs` protokolliert.
- Neue Admin-Seiten `/abos`, `/rabatte`, `/bundles`; Umsatz-Report auf `/verkaeufe`.

## Reihenfolge

1. Stabilisierung (Idempotenz, Retry, Webhook-Adresse) — schützt bestehenden Umsatz
2. Abos + Ablauf-Automatik
3. Rabattcodes & Bundles
4. Upsell, Warenkorb-Rettung, Trinkgeld
5. Sequenzen, Referral-Boost, Umsatz-Report

Sag, ob ich alles der Reihe nach baue oder mit einem bestimmten Block starte.
