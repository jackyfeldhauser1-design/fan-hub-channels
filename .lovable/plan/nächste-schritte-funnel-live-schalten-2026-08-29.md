# Nächste Schritte: Funnel live schalten

## Ziel
Das bisher gebaute System (Bot, Zahlungen, Benachrichtigungs-Zentrale, Kampagnen) ist implementiert, aber noch nicht vollständig in Betrieb. Diese Schritte bringen alles produktiv ans Laufen.

## Schritte

### 1. Cron-Zeitpläne einrichten
- Geplanten Job für `/api/public/notifications/retry` (z. B. alle 5 Minuten) anlegen, damit fehlgeschlagene Benachrichtigungen automatisch erneut versucht werden.
- Geplanten Job für `/api/public/notifications/campaigns` (z. B. alle 15 Minuten) anlegen, damit zeitgesteuerte Kampagnen ausgeführt werden.
- Beide Endpunkte sind bereits durch `authenticateCronRequest` abgesichert.

### 2. Telegram-Webhook produktiv verbinden
- Bot-Webhook auf die veröffentlichte App-Adresse setzen (Statusseite `/status`, Schaltfläche „Webhook einrichten").
- Prüfen, dass Free-/VIP-Chat-IDs und Gruppenlinks in den Bot-Einstellungen stimmen.

### 3. Veröffentlichen
- App veröffentlichen, damit Webhooks und Cron-Endpunkte von außen erreichbar sind und der Bot live reagiert.

### 4. End-to-End-Test des Funnels
- Testlauf: Bot-Start → Gratis-Gruppe → Testkauf → Auslieferung → Einträge in Bestellungen, Zugriffe und Benachrichtigungs-Protokoll prüfen.
- Testbenachrichtigung aus der Benachrichtigungs-Zentrale senden und Zustellstatus kontrollieren.

## Technische Details
- Keine Schemaänderungen nötig; Datenbank und Code sind bereits vorhanden.
- Cron-Jobs werden über die Lovable-Cron-Verwaltung (pg_cron) registriert und rufen die bestehenden Bearer-gesicherten Endpunkte auf.
- Veröffentlichung erfolgt über den Publish-Dialog (erfordert deine Bestätigung).
