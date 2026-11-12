# Verkaufs- und Kundenbindungsautomatik

Die laufende Produktion verwendet zwei getrennte Jobs:

- `cart-recovery`: alle fünf Minuten; erinnert an offene Stars-/TON-Käufe innerhalb von 48 Stunden. Standard: nach 30 Minuten und nochmals nach sechs Stunden, höchstens zwei Erinnerungen. `cart_recovery_minutes=0` oder `cart_recovery_max_reminders=0` schaltet Erinnerungen ab.
- `growth-automation`: stündlich; Rückgewinnung nach 14/30/60 Tagen, neue Drops, passende Zusatzangebote, VIP-Verlängerung, bestehende Treue- und Empfehlungsboni sowie Tages-/Wochenberichte. Die Rückgewinnung läuft ausschließlich hier, um parallele Werbestrecken zu vermeiden. `sequence_enabled=false` deaktiviert die Rückgewinnung.

Warenkorb-Erinnerungen und Werbeangebote beachten 08:00–22:00 Uhr in Europe/Berlin (einschließlich Sommerzeit), die aktuelle Alters-/Einwilligungsentscheidung und Abmeldungen beziehungsweise blockierte Nutzer. Rückgewinnung, VIP-Angebote, neue Drops und Zusatzangebote teilen sich die vorhandene Grenze von drei Werbenachrichten in sieben Tagen und mindestens zwölf Stunden Abstand. Warenkorb-Erinnerungen behalten ihre eigene Grenze von zwei Nachrichten pro offenem Kauf.

Zusatzangebote warten standardmäßig 24 Stunden nach der jüngsten Inhaltsöffnung und bleiben anschließend sieben Tage relevant. Ein neuerer Aufruf startet die Wartezeit erneut. Empfohlen werden nur noch nicht freigeschaltete Inhalte aus dem aktiven Katalog. Bei neuen Drops wird das neueste noch nicht freigeschaltete Set innerhalb der letzten 36 Stunden gewählt.

Automatisierte Tests prüfen Ruhezeiten im Winter und Sommer, aktuelle Einwilligungen, Widerruf, blockierte Nutzer, Fehler bei Datenbankabfragen und die zeitliche Grenze der Zusatzangebote. Echte Testnachrichten an Kunden sind dafür nicht erforderlich.

Die technische Zahlungsprüfung läuft getrennt alle fünf Minuten. Der private TON-Test bleibt bis zu einem nachweisbaren Zahlungseingang offen; Stars-Kauf und Bildzustellung wurden real geprüft. TRX bleibt zurückgestellt. Diese Änderungen enthalten keine Preisänderungen oder zusätzlichen Rabatte. Eine Umsatzsteigerung muss anhand echter Käufe beurteilt werden.
