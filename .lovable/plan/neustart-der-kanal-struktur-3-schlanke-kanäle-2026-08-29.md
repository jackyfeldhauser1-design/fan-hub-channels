# Neustart der Kanal-Struktur: 3 schlanke Kanäle

## Ziel
Alle bisherigen Kanal-Zuordnungen (Gratis, VIP, Admin, Ankündigungen, Trailer) werden verworfen. Es gibt künftig genau drei klar benannte Ziele, die der Bot automatisch erkennt und zuordnet.

## Neue Struktur

| Ziel | Zweck | Typ |
| --- | --- | --- |
| Community | Kostenlose Fan-Gruppe, Einstieg aus dem Bot | Gruppe |
| Shop | VIP-/Kaufbereich, Drops und Verkaufsposts | Gruppe oder Channel |
| Kontrollraum | Admin-Log: Alarme, Testposts, Fehler, Zustellungen | privater Chat/Channel |

```text
Bot-Start ──► Community ──► Kauf ──► Shop
                    └────── Meldungen ──► Kontrollraum
```

## 1. Komplettes Zurücksetzen
- Alle fünf bisherigen Chat-Felder werden geleert; der alte Zustand wird vorher als Eintrag im Admin-Audit gesichert, damit nichts unbemerkt verschwindet.
- Die Struktur startet leer: kein Ziel gilt als verbunden, bis die Erkennung gelaufen ist.

## 2. Automatische Erkennung und Zuordnung
- Ein Klick auf „Kanäle erkennen“ liest die dem Bot bekannten Chats (webhook-sicher aus gespeicherten Updates).
- Zuordnungsheuristik nach Namensmuster und Typ:
  - Namen mit „free/gratis/community/fan“ → Community
  - Namen mit „vip/shop/premium/drop“ → Shop
  - privater Chat mit dem Inhaber oder Namen mit „admin/log/control“ → Kontrollraum
- Wo die Heuristik unsicher ist, bleibt das Ziel leer und wird als „bitte zuordnen“ markiert; ein Klick pro Vorschlag genügt zur Korrektur.
- Nach der Zuordnung: Mitgliedschafts- und Senderechte-Prüfung plus Testpost je Ziel, Ergebnis sichtbar und im Audit protokolliert.

## 3. Oberfläche
- `/verbinden` und `/einstellungen` zeigen nur noch die drei Ziele; Fortschritt „x/3 verbunden“.
- Health-Panel, Status-Seite und Übersicht werden auf drei Ziele reduziert.
- Drops posten künftig in den Shop; Systemmeldungen gehen in den Kontrollraum.

## Technische Details
- Migration: `bot_settings` erhält `community_chat_id`, `shop_chat_id`, `control_chat_id`; die alten Felder `free_chat_id`, `vip_chat_id`, `admin_chat_id`, `announce_chat_id`, `preview_chat_id` werden geleert und nach Umstellung entfernt.
- `src/lib/ops.functions.ts`: `chatInput`, `chatTargets`, `validateChatIdsInput`, `saveChatIdsWithTest`, `discoverTelegramChats`, `verifyConfiguredChats`, `autoConnectTelegram` auf die drei neuen Schlüssel umstellen inkl. neuer Namensheuristik.
- `src/lib/connect.server.ts`: Auswahl und Telegram-Statusberechnung auf drei Ziele (`connected` = Bot + Webhook + 3/3).
- `src/lib/drops.server.ts` / `drops.functions.ts`: Ankündigungs- und Trailer-Posts gehen gebündelt in den Shop-Kanal; Trailer-Attribution bleibt erhalten.
- `src/lib/health.server.ts` und `src/lib/notify.server.ts`: Systemmeldungen auf `control_chat_id` umhängen.
- UI-Anpassungen in `ConnectPanel.tsx`, `ChatSetupWizard.tsx`, `ChatHealthPanel.tsx`, `routes/verbinden.tsx`, `routes/einstellungen.tsx`, `routes/status.tsx`, `routes/index.tsx`, `routes/drops.tsx`.
- Reset-Serverfunktion `resetChatStructure` (Admin-Rolle, Rate-Limit, Audit-Eintrag mit den alten Werten).
