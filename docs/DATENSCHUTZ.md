# Datenschutz und Informationssicherheit

Grundsatz: **so wenig wie möglich, so kurz wie möglich, nur so viel wie die Lehre braucht** (Art. 5, 25 DSGVO).

## Was gespeichert wird

| Daten | Zweck | Personenbezug |
|---|---|---|
| Pseudonym (z. B. „Kluge-Eule-42“), Kurs | Fortschritt zuordnen | pseudonym; keine Namen, keine E-Mail |
| Hash des persönlichen Codes | Weitermachen auf anderem Gerät | pseudonym |
| Sitzung (Hash des Tokens, Ablauf) | angemeldet bleiben | pseudonym |
| Versuche: Szenario, Version, Startwert, Zeitpunkte, Punkte | Fortschritt, Auswertung | pseudonym |
| Ereignisse: Entscheidung oder Antwort mit Zeitpunkt | Bewertung, Nachrechnen, Auswertung | pseudonym |
| Ton an oder aus | Einstellung der Person | pseudonym |
| Teams und Kursrunden: Szenario, Startwert, gemeinsame Ereignisse | gemeinsamer Spielstand | kein Personenbezug (gehört der Gruppe) |
| Mitgliedschaft in Team oder Kursrunde, mit Zeitpunkt | Zugang zum gemeinsamen Stand | pseudonym |
| Stimmen: Entscheidung oder Antwort je Schritt, mit Zeitpunkt | Abstimmung, Live-Verteilung (nur Summen) | pseudonym |
| Zugänge für Lehrende: Bezeichnung (eine Stelle oder Rolle), Hash des Schlüssels, gesperrt ja/nein | Anmeldung der Lehrenden | so viel, wie die Bezeichnung verrät; kein Name nötig |
| Protokoll der Verwaltung: Zeit, Rolle, Zugang, Aktion, Gegenstand | Nachvollziehbarkeit (wer hat was freigegeben, gespeichert, gesperrt) | Lehrende und Administration; nie Studierende, keine IP-Adressen |
| Einstellung „Aufbewahrungsfrist“ | Betrieb | keiner |

**Nicht** gespeichert: Namen, E-Mail-Adressen, IP-Adressen, Geräte- oder Browserdaten. Das optionale
Zugriffsprotokoll enthält Methode, Pfad, Status und Dauer, keine Adressen. Die Seite lädt nichts von Dritten (keine
Webschriften, keine Analyse, kein CDN); einziges Cookie ist das der Anmeldung.

## Voreinstellungen (Privacy by Default)

- Aufbewahrungsfrist 180 Tage ohne Nutzung, dann automatisch gelöscht (`SBK_AUFBEWAHRUNG_TAGE`): Versuche, Teams,
  Kursrunden, Pseudonyme und Einträge im Protokoll. Die Administration kann die Frist in der Oberfläche ändern
  (7 bis 3650 Tage); sie gilt sofort, aufgeräumt wird beim Speichern und alle sechs Stunden.
- Auswertungen für Lehrende nur als Summen und erst ab drei Personen (`SBK_MIN_GRUPPE`); keine Ranglisten.
- Kursrunde: Lehrende sehen je Schritt nur Summen und erst ab drei Stimmen; darunter auch nicht, wie entschieden
  wurde. Studierende sehen in der Kursrunde nur, wie viele schon abgestimmt haben.
- Team: Mitglieder sehen, wie viele abgestimmt haben, die Stimmen je Möglichkeit und bei Rechenaufgaben die
  eingegebenen Zahlen, aber nicht, wer wie gestimmt hat. Wer im Team ist, zeigt nur die Zahl der Mitglieder.
- Ton ist aus, bis die Person ihn einschaltet.
- Studierende können ihre Daten jederzeit als JSON herunterladen (Art. 15, 20), samt Teams, Kursrunden und eigenen
  Stimmen, und sofort vollständig löschen (Art. 17), ohne Rückfrage bei Lehrenden. Beim Löschen verschwinden auch
  Mitgliedschaften und Stimmen; der gemeinsame Spielstand eines Teams bleibt für die anderen erhalten, er enthält
  keine Angaben zur Person.
- Die Administration sieht keine Spielstände, keine Pseudonyme und keine Auswertungen, nur Zugänge, Einstellungen und
  das Protokoll der Verwaltung.
- xAPI-Export nur mit Pseudonym als Konto dieser Instanz. Er enthält, anders als die Auswertung, Einzelereignisse je
  Pseudonym (für einen Learning Record Store) und ist nur Lehrenden zugänglich.

## Informationssicherheit

- Sitzungstoken mit 256 Bit Zufall, im Cookie `HttpOnly`, `SameSite=Strict`, hinter HTTPS `Secure`; gespeichert nur
  als SHA-256. Schlüssel persönlicher Zugänge erscheinen nur einmal beim Anlegen und werden nur als SHA-256
  gespeichert. Wird ein Zugang gesperrt, werden seine Sitzungen sofort gelöscht.
- Drei Rollen mit getrennten Schnittstellen: Studierende erreichen weder Lehrenden- noch Administrationsfunktionen,
  Lehrende nicht die der Administration und umgekehrt (getestet).
- Live-Stände (Server-Sent Events) gehen nur an Mitglieder der Gruppe beziehungsweise an angemeldete Lehrende; sie
  enthalten dasselbe wie die normale Ansicht, keine Lösungen.
- Die Vorschau aus dem Editor liegt nur im Speicher des Servers (zwei Stunden) und ist nur für Lehrende abrufbar; ihre
  Content-Security-Policy erlaubt genau das eigene Skript und den eigenen Stil (Prüfsummen), nichts von außen.
- Schreibende Anfragen nur als `application/json` und von derselben Herkunft (Schutz gegen CSRF).
- Content-Security-Policy ohne `unsafe-inline` für alle Seiten und Skripte, `nosniff`, `frame-ancestors 'none'`,
  `no-referrer`. Nur SVG-Grafiken dürfen eigene Stilangaben enthalten (`style-src 'unsafe-inline'`); für sie gilt eine
  eigene Richtlinie mit `sandbox`: keine Skripte, kein Nachladen.
- Inhalte aus Szenarien werden nie als HTML eingefügt; Formeln wertet ein eigener Rechner ohne Zugriff auf
  JavaScript aus.
- Bremse gegen das Durchprobieren von Kurs-, Team- und persönlichen Codes und von Schlüsseln (20 Fehlversuche je
  Minute und Absender; richtige Codes zählen nicht, damit ein Hörsaal hinter einer gemeinsamen Adresse gleichzeitig
  beitreten kann). Team-Codes gelten nur innerhalb des eigenen Kurses.
- Pfade für Dateien und Bilder sind auf ihre Verzeichnisse begrenzt (getestet).
- Keine Laufzeitabhängigkeiten außer Node.js; die Angriffsfläche durch Fremdpakete entfällt.

## Was für einen echten Betrieb noch fehlt

Betrieb hinter HTTPS (Reverse Proxy der Hochschule; für die Live-Stände ohne Pufferung von `text/event-stream`),
Anbindung an das Single Sign-on für Lehrende und Administration, Datensicherung der SQLite-Datei, Verzeichnis der Verarbeitungstätigkeiten und Datenschutzhinweis der Hochschule. Eine Prüfung durch die
Datenschutzbeauftragten der Hochschule hat nicht stattgefunden.
