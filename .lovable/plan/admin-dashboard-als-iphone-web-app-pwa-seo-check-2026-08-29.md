# Admin-Dashboard als iPhone-Web-App (PWA) + SEO-Check

## Ziel
Das Admin-Dashboard (aktuell unter `/` mit den Unterseiten Status, Inhalte, Verkäufe, Bestellungen, Fans, Sicherheit, Werbepartner, Warteliste, Bot-Setup) soll sich auf dem iPhone zum Home-Bildschirm hinzufügen lassen und sich dort wie eine native App anfühlen. Zusätzlich wird geprüft, dass alle öffentlichen Seiten eigene Titel, Beschreibungen und Canonical-Tags haben.

## 1. Installierbar auf dem iPhone
- `public/manifest.webmanifest` anlegen: Name „Fan Funnel Studio“, Kurzname „Funnel“, `display: standalone`, Startpunkt `/`, Theme- und Hintergrundfarbe aus dem bestehenden Design (Gold/Dunkel).
- App-Icons generieren (192, 512, plus Apple-Touch-Icon 180) und in `public/` ablegen.
- Im Root-Layout ergänzen: Manifest-Link, `apple-mobile-web-app-capable`, `apple-mobile-web-app-status-bar-style`, `apple-touch-icon`, `theme-color` und ein Viewport mit `viewport-fit=cover` (für randlose Darstellung auf dem iPhone).
- Hinweis: Der bestehende `robots.txt`- und Noindex-Schutz der Dashboard-Seiten bleibt unverändert; die App wird nicht indexiert.

## 2. Mobile Bedienung verbessern
- Untere Tab-Leiste auf dem iPhone statt der horizontal scrollenden Navigationsliste: die 5 wichtigsten Bereiche (Übersicht, Bestellungen, Inhalte, Fans, Bot-Setup) als feste Bottom-Bar, restliche Punkte über ein „Mehr“-Menü.
- Safe-Area-Abstände (Notch/Home-Indicator) berücksichtigen, damit nichts abgeschnitten wird.
- Größere Touch-Ziele (mind. 44px), Abmelden-Button auch mobil erreichbar.
- Tabellenlastige Seiten (Verkäufe, Bestellungen, Fans, Leads) auf dem Handy als Karten-Liste statt breiter Tabelle darstellen, damit nichts horizontal wegläuft.
- Formulare (Bot-Setup, Produkte) einspaltig mit passenden Eingabetypen (numerisch, URL), damit iOS die richtige Tastatur zeigt.

## 3. Offline-/Startverhalten
- Leichter Service Worker, der nur die App-Hülle und statische Assets cached und bei fehlender Verbindung eine freundliche Offline-Meldung zeigt. Daten werden weiterhin immer live geladen (keine veralteten Umsätze).

## 4. SEO: Öffentliche Seiten prüfen
Die öffentlichen Routen `/`, `/warteliste` und `/werbepartner` besitzen bereits eigene Titel, Beschreibungen, og-Tags und selbstreferenzierende Canonical-Links. Diese werden gegengeprüft und bei Lücken ergänzt; private Dashboard-Seiten behalten `noindex, nofollow` und bekommen bewusst keine Canonicals.

## Technische Details
- Manifest + Icons in `public/`, Head-Tags in `src/routes/__root.tsx`.
- Navigation in `src/components/DashLayout.tsx` umbauen (Desktop-Sidebar bleibt, mobil Bottom-Nav + „Mehr“-Sheet).
- Responsive Listenansichten je Route über bestehende Tailwind-Breakpoints, keine Änderung an Datenlogik oder Serverfunktionen.
- Service Worker als statische Datei in `public/` mit Registrierung nach dem Hydrieren.

## Prüfung
Typecheck, lokale Prüfung der Startseite und Dashboard-Seiten in iPhone-Viewport-Größe (Screenshots), Manifest- und Head-Tags im gerenderten HTML kontrollieren.
