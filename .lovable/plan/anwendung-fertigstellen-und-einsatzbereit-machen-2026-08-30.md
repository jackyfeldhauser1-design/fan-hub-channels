# Anwendung fertigstellen und einsatzbereit machen

Ziel: Die offenen Lücken schließen, damit du danach nur noch deine echten Daten (Bot-Token, Chats, Inhalte, Preise) einträgst und wir gemeinsam den Livegang prüfen.

## 1. Livegang-Prüfung fertigstellen

- Die neue Backend-Prüfung "Alles prüfen" ist bereits angelegt: Sie prüft Bot, Webhook, Signatur, alle drei Chats, geplante Jobs, Zustellfehler, aktive Produkte, Medienordner, VIP-Preis, Willkommensnachricht und ob ein bezahlter Testkauf existiert.
- Das dazugehörige Panel auf der Statusseite muss noch korrekt eingebunden werden (aktuell fehlt der Import, dadurch bricht der Build). Das wird als Erstes behoben.
- Ergebnis: Ein Knopf auf `/status` zeigt eine klare Fehlerliste mit konkreten nächsten Schritten.

## 2. Startseite als echtes Cockpit

- Kacheln: heutige Verkäufe und Stars, Umsatz gesamt, Fans, Provisionen.
- Setup-Fortschritt: Bot verbunden, 3 von 3 Chats gesetzt, aktive Produkte, Medienordner und Dateien, VIP-Preis, offene Zustellfehler.
- Direktlinks zu den jeweils fehlenden Bereichen (Verbinden, Stars & Preise, Produkte, Medien, Status).
- Die Daten dafür liefert die bereits erweiterte Übersichts-Funktion.

## 3. Medien-Upload komfortabel machen

- Mehrfachauswahl und Drag-and-drop pro Ordner.
- Fortschrittsanzeige je Datei mit Erfolg/Fehler-Status statt nur einer Sperre.
- Sortierung der Dateien und Auswahl eines Vorschaubilds direkt in der Ordnerkarte.
- Download-Schutz bleibt unverändert (privater Speicher, kurzlebige Links, Protokoll).

## 4. Dateneingabe durch dich

Danach trägst du ein:
- Bot-Token unter "Verbinden"
- Community-, Shop- und Kontrollraum-Chat per Setup-Code zuordnen
- Preise unter "Stars & Preise" (VIP 450)
- erste Produkte und Medienordner samt Dateien

## 5. Review, Fixes und Erweiterung

- Kompletter Durchlauf der Livegang-Prüfung, Fehlerliste abarbeiten.
- End-to-End-Test: Bot-Start, Gratis-Beitritt, VIP-Kauf, Shop-Freikauf, geschützter Download, Eintrag in Bestellungen und Protokollen.
- Anschließend Vorschläge für Erweiterungen (z. B. Rabattaktionen, Bundles, wiederkehrende Werbung, Reports) und Umsetzung nach deiner Auswahl.

## Technische Details

- `src/routes/status.tsx`: fehlenden Import für `GoLivePanel` ergänzen (behebt den aktuellen Build-Fehler).
- `src/lib/setup.functions.ts`: `runGoLiveCheck` ist ergänzt (Rate-Limit, Audit-Eintrag, Gruppen aus `verifySetup`, `readHealth`, Katalogprüfungen).
- `src/lib/admin.functions.ts`: `getOverview` liefert zusätzlich Tageswerte und einen `setup`-Block (Bot, Chats, Produkte, Ordner, Dateien, VIP-Preis, Zustellfehler).
- `src/routes/index.tsx`: Cockpit-Ansicht auf Basis dieser Felder, ohne neue Serveraufrufe.
- `src/routes/medien.tsx`: Upload-Queue im Client mit Statusliste; nutzt weiterhin `createMediaUploadUrl` und `registerMediaFile`, plus vorhandene Speicherfunktionen für Sortierung und Vorschaubild.
- Keine Datenbankänderungen nötig.
