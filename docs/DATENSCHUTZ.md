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

**Nicht** gespeichert: Namen, E-Mail-Adressen, IP-Adressen, Geräte- oder Browserdaten. Das optionale
Zugriffsprotokoll enthält Methode, Pfad, Status und Dauer, keine Adressen. Die Seite lädt nichts von Dritten (keine
Webschriften, keine Analyse, kein CDN); einziges Cookie ist das der Anmeldung.

## Voreinstellungen (Privacy by Default)

- Aufbewahrungsfrist 180 Tage ohne Nutzung, dann automatisch gelöscht (`SBK_AUFBEWAHRUNG_TAGE`).
- Auswertungen für Lehrende nur als Summen und erst ab drei Personen (`SBK_MIN_GRUPPE`); keine Ranglisten.
- Studierende können ihre Daten jederzeit als JSON herunterladen (Art. 15, 20) und sofort vollständig löschen
  (Art. 17), ohne Rückfrage bei Lehrenden.
- xAPI-Export nur mit Pseudonym als Konto dieser Instanz.

## Informationssicherheit

- Sitzungstoken mit 256 Bit Zufall, im Cookie `HttpOnly`, `SameSite=Strict`, hinter HTTPS `Secure`; gespeichert nur
  als SHA-256.
- Schreibende Anfragen nur als `application/json` und von derselben Herkunft (Schutz gegen CSRF).
- Content-Security-Policy ohne `unsafe-inline` für alle Seiten und Skripte, `nosniff`, `frame-ancestors 'none'`,
  `no-referrer`. Nur SVG-Grafiken dürfen eigene Stilangaben enthalten (`style-src 'unsafe-inline'`); für sie gilt eine
  eigene Richtlinie mit `sandbox`: keine Skripte, kein Nachladen.
- Inhalte aus Szenarien werden nie als HTML eingefügt; Formeln wertet ein eigener Rechner ohne Zugriff auf
  JavaScript aus.
- Bremse gegen das Durchprobieren von Kurs- und persönlichen Codes (20 Fehlversuche je Minute und Absender; richtige
  Codes zählen nicht, damit ein Hörsaal hinter einer gemeinsamen Adresse gleichzeitig beitreten kann).
- Pfade für Dateien und Bilder sind auf ihre Verzeichnisse begrenzt (getestet).
- Keine Laufzeitabhängigkeiten außer Node.js; die Angriffsfläche durch Fremdpakete entfällt.

## Was für einen echten Betrieb noch fehlt

Betrieb hinter HTTPS (Reverse Proxy der Hochschule), Anbindung an das Single Sign-on für Lehrende, Datensicherung der
SQLite-Datei, Verzeichnis der Verarbeitungstätigkeiten und Datenschutzhinweis der Hochschule. Eine Prüfung durch die
Datenschutzbeauftragten der Hochschule hat nicht stattgefunden.
