# Telegram-Struktur einsatzbereit machen

Ziel: Die drei Chats (Community / Free, Shop / Paid VIP, Kontrollraum) laufen produktiv, der Bot leitet Fans automatisch weiter, VIP kostet 450 Stars, und das Admin-Board ist mit Medien-Upload und Stars-Einstellungen fertig.

## 1. Weiterleitung Free-Gruppe

- Bot-Start zeigt einen Button "Gratis beitreten", der einen frischen, einmalig nutzbaren Einladungslink für die Community erzeugt (24 h gültig, 1 Beitritt).
- Fällt die Link-Erzeugung aus (Bot kein Admin), greift die hinterlegte feste Gruppen-URL als Notfall.
- Beitritt wird pro Fan protokolliert, damit die Startseite echte Zahlen zeigt.

## 2. Bezahlter VIP-Channel für 450 Stars

- Neues festes Angebot "VIP-Zugang" mit 450 Stars, im Bot direkt kaufbar.
- Nach erfolgreicher Zahlung: automatische Erstellung eines persönlichen Einmal-Einladungslinks zum Shop-Channel, Zustellung im Chat, Eintrag in Bestellungen und Auslieferungsprotokoll.
- Preis, Titel und Text sind im Admin-Board änderbar (nicht fest im Code).
- Wiederholter Kauf wird erkannt: bestehender VIP bekommt seinen Zugang erneut statt einer zweiten Zahlung.

## 3. Digitaler Shop (Beiträge mit Sternen freikaufen)

- Bot-Menü "Shop" listet aktive Produkte und Medienordner mit Preis, Aktionspreis und Restmenge.
- Kauf per Stars löst wie bisher die geschützte Auslieferung aus (Einmal-Link, Ablauf, Download-Schutz).
- Gesperrte Beiträge im Shop-Channel bekommen einen "Freikaufen"-Button, der direkt in den Bot mit dem passenden Produkt führt.

## 4. Community-Werbung

- Werbeposts bekommen eine Wiederholung: Intervall in Stunden plus Laufzeit, Ziel Community und/oder Shop.
- Der bestehende geplante Job veröffentlicht fällige Posts automatisch und schreibt Erfolg/Fehler ins Protokoll.
- Im Admin-Board: Liste geplanter Werbeposts mit nächstem Sendezeitpunkt, Pausieren und Sofort-Post.

## 5. Admin-Board fertigstellen

- **Startseite als Cockpit:** Setup-Fortschritt der drei Chats, heutige Verkäufe/Stars, offene Fehler, Direktlinks.
- **Medien:** Upload per Drag & Drop mit Fortschrittsanzeige, Mehrfachauswahl, Sortierung, Vorschaubild und Ordner-Preis in Stars an einer Stelle.
- **Stars-Einstellungen:** eigene Seite mit VIP-Preis (450), Early-Access-Preis, Sponsor-Preis, Trinkgeld-Stufen, Affiliate-Prozent, Link-Laufzeit und Aufruf-Limit.
- **Produkte:** Schnellaktionen für aktiv/inaktiv, Aktionspreis und "Im Shop posten".

## 6. Livegang-Prüfung

- Ein Knopf "Alles prüfen": Token, Webhook, drei Chats, Senderechte, Einladungsrechte, Zahlungsfähigkeit (Stars-Testrechnung an den Kontrollraum) – mit klarer Fehlerliste.

## Technische Details

- Migration: `bot_settings` erhält `vip_price_stars`, `vip_product_title`, `vip_invite_ttl_hours`; `sponsored_posts` erhält `repeat_hours`, `repeat_until`, `next_run_at`, `paused`. Grants + RLS wie bestehend (admin-only über `public.is_admin()`).
- Neue Serverlogik in `src/lib/vip.server.ts`: `createChatInviteLink` (member_limit 1, expire_date) für Community und Shop, Fallback auf `free_group_url`/`vip_group_url`.
- Webhook (`src/routes/api/public/telegram/webhook.ts`): Menüpunkte "Gratis beitreten" und "VIP 450 ⭐", `sendInvoice` mit `currency: "XTR"`, Auswertung in `successful_payment` → Invite-Link + `purchases`-Eintrag + `order_events`.
- Werbepost-Wiederholung über den bestehenden Kampagnen-Cron-Endpunkt unter `src/routes/api/public/notifications/campaigns.ts` (zusätzlicher Durchlauf für fällige `sponsored_posts`).
- Medien-Upload nutzt weiterhin `createMediaUploadUrl` (signierter Direkt-Upload), nur die Oberfläche in `src/routes/medien.tsx` wird erweitert.
- Neue Route `src/routes/stars.tsx` plus Serverfunktionen in `src/lib/admin.functions.ts` für die Preis-Einstellungen; Rate-Limits und Audit-Einträge wie bei bestehenden Admin-Aktionen.
