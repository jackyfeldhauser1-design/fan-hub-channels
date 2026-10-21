# Fan Funnel: Verkaufs- und Promo-Playbook

Dieses Playbook verbindet die kostenlose Telegram-Community, den Bot-Shop, geschützte Sets, Wiederkäufe und Empfehlungen zu einem messbaren Kreislauf. Es ist ein Arbeitsplan, keine Umsatzgarantie.

## 1. Der Verkaufszirkel

1. **Aufmerksamkeit:** kurze, plattformgerechte Posts und Profil-/Story-Teaser führen zur kostenlosen Community.
2. **Vertrauen:** regelmäßig Mehrwert, klare Regeln und ein konsistenter Stil; keine irreführenden Versprechen.
3. **Neugier:** pro Set genau ein verpixelter/unscharfer Teaser im Free-Bereich. Das Original bleibt geschützt und wird erst nach bestätigter Zahlung ausgeliefert.
4. **Kauf:** ein klarer CTA öffnet den Bot mit dem passenden Set. Vor dem Bezahlen sind Inhaltstyp, Preis, Zahlungsweg und Lieferweise verständlich.
5. **Lieferung:** Zugang erst nach verifizierter Zahlung; Kauf und Lieferung müssen idempotent sein, damit Wiederholungen keine Doppelzustellung erzeugen.
6. **Wiederkauf:** nach einem Kauf nur passende, freigegebene Empfehlungen; Bundles erst nach klarer Preisersparnis zeigen.
7. **Empfehlung:** freiwilliger Referral-Link; Bonus und Bedingungen transparent anzeigen.
8. **Messung:** Quelle, Teaser-Variante, Klick, Checkout, bestätigter Kauf und Zustellung messen. Gewinner nur anhand echter Daten auswählen.

## 2. Produktleiter

- **Free:** Community, Begrüßung, Vorschau und ein klarer Einstieg in den Bot.
- **Einstiegsset 1:** Zielwert ungefähr 5 € Gegenwert; die tatsächlich angezeigte Stars-/TON-Preisgestaltung ist maßgeblich.
- **Einstiegsset 2:** Zielwert ungefähr 10 € Gegenwert; klar als größeres/andersartiges Set positionieren, nicht bloß als künstliche Verknappung.
- **Bundle:** mehrere passende Sets mit nachvollziehbarem Preisvorteil.
- **VIP/Paid:** wiederkehrender Zugang nur dann prominent bewerben, wenn Umfang, Preis und Verlängerung verständlich sind.
- **PPV:** einzelne Premium-Inhalte als optionale Ergänzung, nicht als Voraussetzung für bereits gekaufte Inhalte.

Vor dem Start prüfen: jedes aktive Produkt hat Titel, Beschreibung, Preis, Lieferinhalt, Teaser, Bot-Deep-Link und erfolgreich getestete Auslieferung.

## 3. Sieben-Tage-Promo-Rhythmus

- **Montag – Vorschau:** verpixelter Teaser und eine kurze Umfrage/Frage; CTA zur Free-Community.
- **Dienstag – Produktstory:** ein Set erklären, ohne das geschützte Original zu zeigen; CTA direkt auf das passende Bot-Produkt.
- **Mittwoch – Community:** Umfrage oder Wunschthema; Antworten auswerten, keine privaten Nutzerdaten veröffentlichen.
- **Donnerstag – Bundle:** zwei bis drei zusammengehörige Produkte und den realen Bundle-Vorteil zeigen.
- **Freitag – Drop:** neues Set mit Teaser, Preis und direktem Bot-Link; nur echte Neuheiten als „neu“ bezeichnen.
- **Samstag – Social Proof:** nur echte, anonymisierte Rückmeldungen oder echte Verkaufszahlen mit Einwilligung; keine erfundenen Bewertungen.
- **Sonntag – Rückblick:** Gewinner-Teaser/Umfrage nennen, kommende Inhalte anteasern und den Bot-Einstieg wiederholen.

Jeden Tag höchstens ein bis zwei relevante Community-Promo-Posts als Startpunkt. Frequenz an Engagement und Abmeldungen anpassen. Externe Plattformen erhalten jeweils eigene Kurztexte und Tracking-Links; Regeln und Werberichtlinien der jeweiligen Plattform beachten.

## 4. Messwerte und Entscheidungen

Wöchentlich im Dashboard prüfen:

- **Besucher → Bot-Start:** Welche Quelle bringt echte Bot-Starts?
- **Teaser-Klickrate:** Klicks geteilt durch Teaser-Aufrufe, sofern Aufrufe zuverlässig messbar sind.
- **Checkout-Rate:** begonnene Checkouts geteilt durch Produktklicks.
- **Kaufquote:** bestätigte Käufe geteilt durch Checkouts.
- **Lieferquote:** erfolgreich zugestellte Käufe geteilt durch bestätigte Käufe.
- **Wiederkaufquote:** Käufer mit erneutem Kauf geteilt durch Käufer im betrachteten Zeitraum.
- **Abmeldungen/Spam-Signale:** bei Anstieg Frequenz und Relevanz reduzieren.

A/B-Tests jeweils nur für eine Variable durchführen (z. B. Teaser A/B oder CTA A/B). Nicht nach wenigen Klicks einen Gewinner ausrufen; kleine Stichproben sind nur Richtungsindikatoren.

## 5. Automatisierung ohne Spam

- Cart-Recovery nur für echte, unbezahlte Checkouts; vor jeder Erinnerung erneut prüfen, ob inzwischen bezahlt wurde.
- Maximal zwei Erinnerungen mit Abstand; keine Nachricht nach Opt-out, fehlender Einwilligung oder außerhalb des konfigurierten Zeitfensters.
- Proaktive Angebote nur an bestätigte 18+-Nutzer mit dokumentierter Einwilligung und ohne Opt-out.
- Referral-Boni nur einmal pro qualifizierter Empfehlung vergeben und Missbrauch verhindern.
- Zahlungsstatus ausschließlich serverseitig verifizieren; niemals aufgrund eines Screenshots oder einer Rückkehr-URL freischalten.
- Fehler bei Webhook, Zahlung oder Lieferung müssen sichtbar alarmiert und sicher wiederholbar sein.

## 6. Veröffentlichungs-Checkliste

- [ ] Bot /start, Altersabfrage und Einwilligung im echten Telegram-Client getestet.
- [ ] Free-Gruppe, Shop und Kontrollraum sind erreichbar; Bot-Rechte geprüft.
- [ ] Teaser ist verpixelt; Originaldatei liegt im privaten Storage.
- [ ] Stars-Testkauf in kleinem Testprodukt durchgeführt; Zahlung, Datenbankeintrag und Lieferung bestätigt.
- [ ] TON/TRX nur als bezahlt markieren, wenn die serverseitige Chain-Verifikation erfolgreich ist.
- [ ] Doppelte Telegram-Updates erzeugen weder Doppelkäufe noch Doppelzustellungen.
- [ ] Opt-out /stopp funktioniert; /loeschen ist geprüft.
- [ ] Kampagnenquelle bis zum bestätigten Kauf nachvollziehbar.
- [ ] Produktions-Healthcheck und Cron-Jobs sind erfolgreich; Fehler werden kontrolliert.

## 7. Prioritäten

1. Zuerst Webhook-, Zahlungs- und Lieferfluss nachweislich testen.
2. Dann korrekte Projekt-/Deployment-Konfiguration und Secrets sicherstellen.
3. Anschließend regelmäßig Teaser und CTAs veröffentlichen.
4. Erst nach messbaren Daten Preise, Frequenz und Creatives optimieren.
