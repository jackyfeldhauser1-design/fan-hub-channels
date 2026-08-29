# SEO-Ausbau: robots.txt, Structured Data, Meta & Canonicals

## Ausgangslage (geprüft)
- `public/robots.txt` existiert bereits (Googlebot, Bingbot, Twitterbot, facebookexternalhit, `*` – jeweils `Allow: /`), ohne Ausschlüsse und ohne Sitemap-Hinweis.
- `src/routes/sitemap[.]xml.ts` liefert `/`, `/warteliste`, `/werbepartner`; live erreichbar und bei Google eingereicht.
- Öffentliche Routen (`/`, `/warteliste`, `/werbepartner`) haben bereits Title/Description/OG, aber **kein** `canonical`.
- Dashboard-Routen (`/produkte`, `/bestellungen`, `/fans`, `/leads`, `/sicherheit`, `/status`, `/verkaeufe`, `/werbeposts`, `/einstellungen`, `/auth`) sind nicht ausgeschlossen und tragen kein `noindex`.
- `/inhalt/$token` hat bereits `noindex, nofollow`.
- Es gibt bisher **keine** JSON-LD-Daten.

## Was gemacht wird

### 1. robots.txt ergänzen (nicht ersetzen)
Bestehende User-agent-Blöcke bleiben. Im `*`-Block zusätzlich `Disallow:` für die nicht-öffentlichen Bereiche (Dashboard, Auth, Einmal-Link-Auslieferung `/inhalt/`) sowie eine `Sitemap:`-Zeile auf `https://fan-hub-channels.lovable.app/sitemap.xml`. Öffentliche Seiten bleiben ausdrücklich erlaubt.

### 2. Nicht-öffentliche Routen sauber ausschließen
`robots: noindex, nofollow` als Meta-Tag in den Dashboard-/Auth-Routen ergänzen, damit über Links erreichte Seiten nicht indexiert werden (robots.txt allein verhindert keine Indexierung).

### 3. JSON-LD strukturierte Daten
- `__root.tsx`: `Organization` (Name, URL, Logo/Favicon, Beschreibung) als sitewide Basis.
- `/` (Startseite): `WebSite` inkl. `url` und `name`.
- `/werbepartner` und `/warteliste`: jeweils `BreadcrumbList` mit Startseite + aktueller Seite.

### 4. Meta-Titel, Descriptions und Canonicals
- Für `/`, `/warteliste`, `/werbepartner`: `canonical` (nur auf Leaf-Routen) und `og:url` mit selbstreferenzierender absoluter URL auf `https://fan-hub-channels.lovable.app/...`.
- Titles/Descriptions werden geprüft und, wo nötig, auf < 60 bzw. < 160 Zeichen und eindeutige Formulierung angepasst.
- Nicht-öffentliche Routen bekommen ebenfalls eigene, eindeutige Titel, aber **kein** Canonical (sie sind noindex).

### 5. Scan & Verifikation
- Typecheck, `/sitemap.xml` und `/robots.txt` lokal prüfen, gerenderte Head-Tags der drei öffentlichen Seiten im Browser gegenchecken.
- Danach neuen SEO-Scan starten; Ergebnisse erscheinen im SEO-Tab.

## Technische Details
- Head-Tags ausschließlich über die `head()`-Option von `createFileRoute`; Titel als `meta`-Eintrag, Canonical über `links`, JSON-LD über `scripts` mit `type: "application/ld+json"`.
- Canonical ausschließlich auf Leaf-Routen, niemals in `__root.tsx` (sonst doppelte Tags).
- Basis-URL überall `https://fan-hub-channels.lovable.app`.
- Keine Änderung an Sitemap-Mechanik, Routing, Business-Logik oder sichtbarem Seiteninhalt.
