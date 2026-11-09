# Spielbaukasten

**Lernspiele für die Ingenieurlehre: Studierende spielen im Browser, Lehrende sehen, wo die Gruppe hängt, und neue
Spiele entstehen als Datei statt als Programm. Das läuft heute – ansehen, selbst ausprobieren, nachprüfen.**

![Rundgang durch den Spielbaukasten: eine Entscheidung an der Fußgängerbrücke mit sichtbaren Folgen, Beitritt mit Kurscode, Prüfschritte ordnen, Rechenaufgabe mit erkanntem typischem Fehler, Ergebnis mit Sternen und Auszeichnungen, Telefon, Diagramme für Lehrende, Prüfung einer Spieldatei, Offline-Datei](medien/rundgang.gif)

<sub>Rundgang, 89 Sekunden, ohne Ton, mit Untertiteln; aufgenommen am 09.11.2026 an einer laufenden Installation.
[Video herunterladen (MP4, 2,6 MB)](https://github.com/panoherbe/spielbaukasten/raw/main/medien/rundgang.mp4) · Text des Rundgangs weiter unten.</sub>

## Was Sie brauchen → läuft hier schon

| Was Sie brauchen | läuft hier schon |
|---|---|
| Lernspiele im Browser, auf dem Telefon wie am Rechner | zwei Beispielspiele (Technische Mechanik, Elektrotechnik) mit Szenenbildern, Spielfigur mit Sprechblase, Spielanzeige, Kapitelkarte, Sternen und Auszeichnungen; das Brückenspiel in Chromium auf Rechner- und Telefonbreite und im dunklen Schema durchgespielt (09.11.2026) |
| Entscheidungen mit Folgen | jede Entscheidung verändert sichtbar Sicherheit, Budget und Tage bis zum Fest; eine fachliche Bewertung und die Spielfigur erklären, warum |
| Rückmeldung, die beim Lernen hilft | typische Fehler werden erkannt und erklärt; zweiter Versuch, Hinweis, Lösung mit Rechenweg |
| Lernfortschritt und Auswertung für Lehrende | Stand je Lernziel; Diagramme: Ausgang der Versuche, je Aufgabe der Anteil „im ersten Versuch richtig“, die häufigsten Fehler, die Verteilung der Entscheidungen |
| Datenschutz | keine Namen, keine E-Mail-Adressen, zufällige Pseudonyme; Auswertung in der Oberfläche nur als Summen ab 3 Personen; Löschen auf Knopfdruck |
| Neue Inhalte ohne Programmierung | Lernspiele sind Dateien; die Prüfung meldet Fehler auf Deutsch mit Fundstelle; jede Version bleibt erhalten |
| Offene Lernressourcen (OER) | Export als eine einzige HTML-Datei (322 KB mit allen Bildern), läuft ohne Server und ohne Internet: 0 Netzanfragen (09.11.2026); Metadaten nach dem Profil AMB |
| Viele Studierende | Lasttest mit 300 simulierten Studierenden, mit Denkzeit: 0 Fehler, 95 % der Antworten unter 0,16 s; 200 simulierte im selben Augenblick: 0 Fehler (09.11.2026) |
| Barrierefreiheit | automatische Prüfung mit axe-core (WCAG 2.0/2.1 A und AA, WCAG 2.2 AA): 0 Verstöße in 22 Zuständen, auch auf dem Telefon und im dunklen Schema (09.11.2026); Farbe trägt nie allein Bedeutung; Bewegung lässt sich abschalten |
| Schlank und sicher | erste Seite 16 Dateien, 37 KB übertragen, keine Dateien von fremden Servern (09.11.2026); Lösungen und Formeln verlassen den Server nicht |
| Geprüfte Qualität | 42 von 42 automatischen Tests bestanden (09.11.2026) |
| Anschluss an Lernplattformen | xAPI-Ausgabe und eine dokumentierte Schnittstelle (OpenAPI) |
| Offen und übergabefähig | Quellcode unter AGPL-3.0, keine Fremdbibliotheken zur Laufzeit, Dokumentation auf Deutsch |

Jede Zahl steht mit Messweg im [Messprotokoll vom 09.11.2026](nachweis/PROTOKOLL.md) (Version 0.1.0; Rohdaten
`nachweis/messwerte.json`).

## In zwei Minuten selbst prüfen

1. **Ohne Installation spielen:** die [Offline-Fassung](demo/fussgaengerbruecke-v2.html) öffnen, rechts über dem
   Quelltext auf „Download raw file“ (Pfeil nach unten) klicken, die Datei (322 KB) per Doppelklick im Browser öffnen.
   Das Brückenspiel läuft vollständig, ohne Server und ohne Internet; der Fortschritt bleibt auf Ihrem Gerät.
   (Gemessen in Chrome.)
2. **Die ganze Anwendung starten** – mit [Docker Desktop](https://www.docker.com/products/docker-desktop/), drei
   Befehle:
   ```bash
   git clone https://github.com/panoherbe/spielbaukasten.git
   cd spielbaukasten
   docker compose up -d
   ```
   Dann http://localhost:8080 öffnen, Kurscode **DEMO**. Bereich für Lehrende: http://localhost:8080/lehrende,
   Schlüssel **demo-lehrende**.
3. **Nachlesen, was gemessen wurde:** [Messprotokoll](nachweis/PROTOKOLL.md) mit 34 Bildschirmfotos.

## Was Sie heute schon prüfen können

- Oberfläche, Spielablauf, Auswertung und Export lassen sich heute ausprobieren.
- Last (im Lasttest mit simulierten Studierenden), Barrierefreiheit (automatisch geprüft), Datenschutz und
  Offline-Export sind gebaut und gemessen.
- Die Projektzeit geht in Ihre Anforderungen, Ihre Inhalte und Tests mit Studierenden und Lehrenden; ein erster
  testbarer Stand steht früh.
- Offener Quellcode (AGPL-3.0), keine Fremdbibliotheken zur Laufzeit, Dokumentation auf Deutsch: Das Framework lässt
  sich ohne mich betreiben und weiterentwickeln.

## So sieht es aus

<table>
<tr>
<td width="50%" valign="top"><img src="medien/bild-start.png" alt="Startseite: großes Bild einer Fachwerkbrücke über einem Bach mit den Spielfiguren Laborleitung und Bauleitung, Überschrift „Entscheiden. Rechnen. Folgen sehen.“ und das Feld für den Kurscode"><br><sub>Start: Beitritt mit Kurscode, ohne Konto und ohne Namen.</sub></td>
<td width="50%" valign="top"><img src="medien/bild-szene.png" alt="Szene „Eine Meldung am Montagmorgen“: oben die Spielanzeige mit Sicherheit, Budget, Tagen bis zum Fest und der Kapitelkarte, links das Szenenbild der Brücke und die Bauleitung mit Sprechblase, rechts der Text und zwei Entscheidungen A und B"><br><sub>Eine Szene: Spielanzeige, Kapitelkarte, Szenenbild, Bauleitung mit Sprechblase, Entscheidungen als Karten.</sub></td>
</tr>
<tr>
<td valign="top"><img src="medien/bild-rechenaufgabe.png" alt="Rechenaufgabe „Kraft in der Diagonale“ mit Blaupause des Knotens nach einer falschen Antwort: „Noch nicht richtig. Es gibt zwei Diagonalen; jede trägt die Hälfte der Last.“"><br><sub>Rechenaufgabe mit eigenen Zahlen: Ein typischer Fehler wird erkannt und erklärt.</sub></td>
<td valign="top"><img src="medien/bild-ergebnis.png" alt="Ergebnis „Sicher zum Fest“: Feuerwerk über der Brücke, drei von drei Sternen, 40 von 45 Punkten, drei von fünf Auszeichnungen und der Stand je Lernziel"><br><sub>Ergebnis: Sterne, Punkte, Auszeichnungen und der Stand je Lernziel.</sub></td>
</tr>
<tr>
<td valign="top" align="center"><img src="medien/bild-telefon.png" width="300" alt="Das Brückenspiel auf einem Telefon: Spielanzeige, Kapitelkarte, Szenenbild und Bauleitung mit Sprechblase"><br><sub>Auf dem Telefon: dasselbe Spiel im Browser, ohne App.</sub></td>
<td valign="top"><img src="medien/bild-auswertung.png" alt="Auswertung für Lehrende: Kennzahlen mit Symbolen, Ausgang der Versuche als gestapelter Balken und Ring, je Aufgabe der Anteil im ersten Versuch richtig, häufigste Fehler"><br><sub>Auswertung für Lehrende mit Diagrammen; nur Summen, erst ab drei Personen. Zahlen aus einem Lasttest mit 200 simulierten Studierenden, dazu drei Testdurchläufe.</sub><br><br><img src="medien/bild-szenario-pruefen.png" alt="Bereich für Lehrende: Szenario-Datei prüfen, Fehlermeldung mit Fundstelle: knoten.diagonale.loesung „teta“ ist kein Parameter des Szenarios"><br><sub>Neue Spiele sind Dateien: Die Prüfung meldet einen Tippfehler in einer Formel auf Deutsch, mit Fundstelle.</sub></td>
</tr>
</table>

<details>
<summary><b>Text des Rundgangs</b> (die Untertitel des Videos)</summary>

| ab | Untertitel |
|---|---|
| 0:00 | Ein Riss an der Fußgängerbrücke, in fünf Tagen ist Campusfest. **Was tun Sie zuerst?** |
| 0:03 | Jede Entscheidung hat Folgen: **Sicherheit +20 %**, die Bauleitung ist zufrieden. |
| 0:08 | **Titel:** Spielbaukasten – Lernspiele für die Ingenieurlehre. Studierende entscheiden, rechnen und sehen die Folgen. Lehrende sehen, wo die Gruppe hängt. Neue Spiele entstehen als Datei. |
| 0:11 | Studierende treten mit dem Kurscode bei: ohne Konto, ohne Namen. |
| 0:14 | Jede Person spielt unter einem zufälligen Pseudonym. |
| 0:17 | Zwei Lernspiele zum Ausprobieren: Technische Mechanik und Elektrotechnik. |
| 0:19 | Prüfschritte ordnen: Karten nach oben oder unten schieben. |
| 0:26 | Unterlagen, Befund, Rechnung, Nachweis, Maßnahme. |
| 0:29 | Das Fachwerk als Modell. Jede Person bekommt eigene Zahlen. |
| 0:32 | Rechnen mit eigenen Zahlen. Wir tippen absichtlich einen typischen Fehler … |
| 0:35 | … das System erkennt ihn und erklärt: Die Last teilt sich auf zwei Diagonalen. |
| 0:39 | Zweiter Versuch. |
| 0:40 | Richtig, mit Rechenweg zum Nachlesen. Punkte und Kapitelkarte laufen mit. |
| 0:43 | Die Aufgaben bauen aufeinander auf: Kraft im Zugband, dann die Spannung am Riss. |
| 0:46 | Die Rechnung ist fertig. Wie entscheiden Sie: freigeben oder reparieren? |
| 0:51 | Am Ende: Sterne, Punkte und das Fest kann kommen. |
| 0:54 | Auszeichnungen und der Stand je Lernziel: sicher, mit Hilfe oder noch offen. |
| 0:58 | **Sensor-Übung: Auch auf dem Telefon.** Im Browser, ohne App und ohne Installation. Mit Laborleitung statt Bauleitung. Rechnen mit eigenen Zahlen, auch auf dem kleinen Bildschirm. Keine Dateien von fremden Servern. |
| 1:03 | Lehrende sehen, wo die Gruppe hängt. Nur Summen, erst ab drei Personen. |
| 1:06 | Entscheidungen mit Bewertung. Zahlen: 200 simulierte Studierende. |
| 1:10 | Neue Spiele sind Dateien. Hier eine mit einem Tippfehler in einer Formel … |
| 1:12 | … die Prüfung findet ihn und nennt die Stelle, auf Deutsch. |
| 1:15 | Jedes Spiel auch als offene Lernressource: eine HTML-Datei, ohne Server und ohne Internet. |
| 1:19 | **Gemessen am 09.11.2026:** 42 von 42 automatischen Tests bestanden · Lasttest mit 300 simulierten Studierenden: 0 Fehler, 95 % der Antworten unter 0,16 s · Barrierefreiheit automatisch geprüft (axe-core, WCAG 2.2 AA): 0 Verstöße in 22 Zuständen · erste Seite 37 KB, keine Dateien von fremden Servern · Offline-Fassung als eine Datei: 0 Netzanfragen. |
| 1:25 | **Selbst prüfen:** github.com/panoherbe/spielbaukasten – Offline-Fassung herunterladen und im Browser öffnen, oder die ganze Anwendung mit drei Befehlen starten. Quellcode offen, AGPL-3.0. |

</details>

## Eigenes Lernspiel in vier Schritten

1. **Vorlage kopieren:** eine der mitgelieferten Dateien `szenario.json` herunterladen, Titel und Texte im
   Texteditor ändern, die Versionsnummer erhöhen.
2. **Prüfen und hochladen:** unter `/lehrende` → Szenarien die Datei auswählen, „Nur prüfen“, dann „Hochladen“.
3. **Freigeben:** unter Kurse einen Kurs anlegen, das Spiel freigeben, den Kurscode an die Studierenden geben.
4. **Ausprobieren und auswerten:** mit dem Kurscode selbst spielen; die Auswertung zeigt Zahlen ab drei Personen.

Mit Bildern Schritt für Schritt: [Anleitung für Lehrende](docs/ANLEITUNG-LEHRENDE.md).

## Was der Prototyp noch nicht ist

Ein Prototyp, in wenigen Tagen gebaut, um zu zeigen, dass die Architektur trägt. Kein fertiges Produkt.

| Heute noch nicht enthalten | Was ein Auftrag ergänzen würde |
|---|---|
| Anmeldung über das Single Sign-on einer Hochschule (Shibboleth/SAML, OpenID Connect); heute ein gemeinsamer Schlüssel je Installation | Anbindung an Ihr Anmeldesystem |
| Anbindung an Moodle; vorbereitet sind die xAPI-Ausgabe und die dokumentierte Schnittstelle | Anbindung an Ihre Lernplattform, etwa über LTI 1.3 |
| Grafischer Editor; Spiele werden als Datei geschrieben | Werkzeuge für Autorinnen und Autoren nach Ihren Anforderungen |
| Fachlich geprüfte Inhalte; die Beispiele sind vereinfachte Lehrmodelle, nicht von Fachlehrenden geprüft | Ihre Inhalte und Lernziele, mit Ihren Lehrenden |
| Ihr Erscheinungsbild; Grafiken, Figuren und Farben sind die Beispiele dieses Prototyps | Gestaltung nach Ihren Vorgaben, über die Design-Tokens und eigene Grafiken |
| Nicht gemessen: echte Geräte, Safari und Firefox, Bildschirmleser, Nutzung durch Studierende, Dauerbetrieb hinter HTTPS | Usability-Tests mit Studierenden und Lehrenden, Erprobung im Semester, Abnahmetest |

## Lizenz

Code: ab 04.11.2026 AGPL-3.0; frühere Stände bis Commit [`414f6d6`](https://github.com/panoherbe/spielbaukasten/tree/414f6d6) bleiben unter Apache-2.0. Die beiden Beispielszenarien und die Grafiken: CC BY 4.0 (Panagiotis Herbe). Auftraggeber erhalten im Auftrag die vertraglich vereinbarte Lizenz.

## Kontakt

Panagiotis Herbe · [panoherbe.com](https://panoherbe.com)

---

## Für Ihre IT: Technik im Detail

### Starten

Voraussetzung: [Docker Desktop](https://www.docker.com/products/docker-desktop/) (Windows, macOS) oder Docker unter
Linux.

```bash
git clone https://github.com/panoherbe/spielbaukasten.git
cd spielbaukasten
docker compose up -d
```

| | Adresse | Zugang |
|---|---|---|
| Studierende | http://localhost:8080 | Kurscode **DEMO** |
| Lehrende | http://localhost:8080/lehrende | Schlüssel **demo-lehrende** |

Beenden: `docker compose down` (die Daten bleiben im Volume `daten`; `docker compose down -v` löscht sie).

Ohne Docker, mit [Node.js 24](https://nodejs.org/) oder neuer: `npm start` (es gibt keine Abhängigkeiten zu
installieren). Den Schlüssel für Lehrende zeigt dann die Konsole; den Demokurs gibt es mit
`SBK_DEMO_KURSCODE=DEMO npm start`.

**Was Sie sehen sollten:** Mit dem Kurscode DEMO zwei Lernspiele. „Riss an der Fußgängerbrücke“ (ca. 20 Minuten)
ist ein Entscheidungsspiel zur Technischen Mechanik: sperren oder nicht, Prüfschritte ordnen, Stabkräfte und Spannung
am Riss rechnen (jede Person bekommt eigene Zahlen), dann über die Freigabe entscheiden. „Spannungsteiler am
Sensor“ (ca. 8 Minuten) ist eine kurze Übung. Unter `/lehrende` erscheinen Auswertungen ab drei Personen.

### Funktionen

**Für Studierende**
- Beitritt mit Kurscode, ohne Konto, ohne Namen: Jede Person bekommt ein zufälliges Pseudonym und einen
  persönlichen Code, um auf einem anderen Gerät weiterzumachen.
- Spielbühne: großes Szenenbild, Spielfigur mit Sprechblase (Bauleitung, Laborleitung), Spielanzeige mit Symbolen
  und animierten Änderungen, Kapitelkarte. Helles und dunkles Schema; mit „Bewegung reduzieren“ stehen alle
  Animationen still.
- Szenen mit Entscheidungen, die Indikatoren verändern (im Beispiel Sicherheit, Budget, Tage); Verzweigungen nach
  Ergebnis.
- Aufgaben in drei Mechaniken: **Rechenaufgabe** mit Einheit und Toleranz (Komma oder Punkt), **Auswahl** (eine oder
  mehrere), **Reihenfolge**. Zahlen je Person verschieden, aus einem Startwert reproduzierbar.
- Rückmeldung zu **typischen Fehlern** (Vorzeichen, Faktor 1000, vom Szenario genannte Fehlerformeln wie „Sinus und
  Kosinus vertauscht“), zweiter Versuch, Hinweis gegen Punktabzug, danach Lösung mit Rechenweg.
- Rückmeldung als großes Zeichen (Haken mit Funken, Waage, Ausrufezeichen), immer mit Text; die Figur freut sich
  oder sorgt sich.
- Ende mit Ergebnis, 0 bis 3 Sternen, Punkten, fünf Auszeichnungen und dem Stand je Lernziel (sicher, mit Hilfe,
  noch offen).
- Fortsetzen nach Unterbrechung, auch in einem anderen Tab; eigene Daten herunterladen oder sofort löschen.

**Für Lehrende**
- Kurse anlegen (Kurscode), Szenarien je Kurs freigeben.
- Szenario-Dateien prüfen und hochladen: Fehler kommen als deutsche Meldung mit Fundstelle
  (`knoten.diagonale.loesung „alpha“ ist kein Parameter des Szenarios`). Jede Version bleibt erhalten; laufende
  Versuche bleiben bei ihrer Version.
- Auswertung je Szenario und Kurs, als Diagramme und als Tabelle: Versuche, Ausgang, je Aufgabe Anteil „im ersten
  Versuch richtig“ und die häufigsten Fehlerarten, je Entscheidung die Verteilung mit fachlicher Bewertung. Nur
  Summen, und erst ab drei Personen.
- Export als **xAPI-Statements** (für Learning Record Stores) und als **OER-Paket** (eigenständige HTML-Datei plus
  Metadaten nach dem Allgemeinen Metadatenprofil für Bildungsressourcen, AMB). Beispiel: [`demo/`](demo/).

**Technik**
- Node.js 24, **keine Fremdbibliotheken** zur Laufzeit; SQLite aus Node.js (`node:sqlite`). Oberfläche ohne Framework
  und ohne Build-Schritt; alle Grafiken als SVG-Dateien im Repository. Text und SVG gehen mit gzip hinaus.
- Dieselbe Spiel-Engine im Browser (Offline-Fassung) und auf dem Server. Online bewertet nur der Server: Er bekommt
  Entscheidungen und Antworten, rechnet den Zustand aus allen Schritten neu aus und schickt nur die aktuelle Ansicht
  zurück. Lösungen und Formeln verlassen den Server nicht.
- Szenarien sind Daten, kein Code: Formeln werden von einem eigenen, abgeschlossenen Rechner ausgewertet, Texte nie als
  HTML eingefügt.
- Schnittstelle beschrieben in [`docs/openapi.json`](docs/openapi.json).

### Aufbau

```
src/engine/      Spiel-Engine: Formeln, Zufall, Mechaniken, Prüfung, Ablauf, Ansicht, xAPI, OER-Metadaten
src/server/      HTTP-Server, Datenbank, Anmeldung, Szenario-Verwaltung
src/web/         Oberfläche für Studierende und Lehrende, Spieler, Darstellung der Mechaniken
src/oer-export.js  Offline-Fassung als eine HTML-Datei
inhalte/szenarien/ die Beispielszenarien (JSON + Bilder)
tools/           pruefe.js (Szenario prüfen), oer-export.js (Export auf der Kommandozeile)
test/            Unit- und Schnittstellentests, Lasttest, Browsertest (CDP)
docs/            Anleitung für Lehrende, Architektur, Inhaltsformat, Erweitern, Datenschutz, Lerndesign, Schnittstelle
nachweis/        Messprotokoll mit Bildschirmfotos
demo/            Offline-Fassung des Brückenspiels mit AMB-Metadaten (erzeugt mit tools/oer-export.js)
medien/          Rundgang (Video, GIF, Poster), Bilder für diese Seite, Grafiken als Quelle (kunst/)
```

Mehr: [Architektur](docs/ARCHITEKTUR.md) · [Anleitung für Lehrende](docs/ANLEITUNG-LEHRENDE.md) ·
[Szenarien schreiben](docs/INHALTE.md) ·
[Neue Mechanik ergänzen](docs/ERWEITERN.md) · [Datenschutz](docs/DATENSCHUTZ.md) · [Lerndesign und Evaluation des
Beispielszenarios](docs/LERNDESIGN.md)

### Tests

```bash
docker compose run --rm test                          # 42 Unit- und Schnittstellentests, unter 1 s
node tools/pruefe.js inhalte/szenarien/*/szenario.json  # Szenarien prüfen
```

Die Nachweis-Messung (Lasttest mit 50 und 200 simulierten Personen im selben Augenblick und 300 simulierten mit
Denkzeit, Durchspielen in echtem Chrome auf Desktop- und Telefonbreite und im dunklen Schema, Barrierefreiheit mit
axe-core, Offline-Fassung) startet mit Docker so; ohne Docker siehe [Messprotokoll](nachweis/PROTOKOLL.md):

```bash
docker compose -p spielbaukasten-nachweis -f compose.nachweis.yaml up --build --abort-on-container-exit --exit-code-from messung
docker compose -p spielbaukasten-nachweis -f compose.nachweis.yaml down -v
```

### Einstellungen

| Variable | Bedeutung | Vorgabe |
|---|---|---|
| `SBK_LEHRENDE_SCHLUESSEL` | Schlüssel für die Anmeldung als Lehrende | zufällig je Start (Konsole); im Compose `demo-lehrende` |
| `SBK_DEMO_KURSCODE` | legt beim Start einen Demokurs mit allen Szenarien an | keiner; im Compose `DEMO` |
| `SBK_AUFBEWAHRUNG_TAGE` | danach werden Versuche und Pseudonyme ohne Nutzung gelöscht | 180 |
| `SBK_MIN_GRUPPE` | Auswertungen erst ab so vielen Personen | 3 |
| `SBK_BASIS_URL` | öffentliche Adresse (für xAPI und OER-Metadaten) | `http://localhost:8080` |
| `SBK_SICHERE_COOKIES` | `1` hinter HTTPS | aus |
| `SBK_ZUGRIFFSPROTOKOLL` | `1` schreibt Methode, Pfad, Status, Dauer (keine IP-Adressen) | aus |
| `SBK_DATEN`, `SBK_INHALTE`, `PORT` | Datenverzeichnis, Szenario-Verzeichnis, Port | `./daten`, `./inhalte/szenarien`, 8080 |

### Technische Grenzen

- SQLite genügt für die Last, die gemessen ist: im Lasttest mit simulierten Studierenden 300 mit Denkzeit und 200 im
  selben Augenblick ohne Fehler (siehe Protokoll). Für mehr wäre PostgreSQL vorgesehen (Datenzugriff in
  `src/server/db.js` gekapselt).
- Gestaltung über Design-Tokens in `src/web/styles.css` anpassbar (helles und dunkles Schema).
- Die Fachinhalte der Beispielszenarien sind Lehrbeispiele (vereinfachtes Lehrmodell, kein vollständiger Nachweis
  nach Eurocode 3).

### Rundgang und Bilder

Aufgenommen am 09.11.2026 mit Playwright (Chromium) an einer laufenden Installation dieses Repositorys (Node.js 24,
ohne Docker). 200 simulierte Studierende aus dem Lasttest (`test/last.js`, ein Teil der Entscheidungen zufällig
gestreut) füllen die Auswertung. Untertitel und Mauszeiger sind in die Seite gezeichnet; dafür ist im Aufnahmebrowser
die Content-Security-Policy abgeschaltet, die Anwendung selbst ist unverändert. Das Video hat keinen Ton. Die
Messwerte der Schlusskarte stammen aus dem Protokoll vom 09.11.2026, nicht aus der Aufnahme. Zwei Stellen sind
nachträglich ersetzt (09.11.2026): Bei 1:10 zeigte der Aufnahmebrowser den Dateiknopf englisch („Choose File“); das Feld
ist durch dieselbe Ansicht in einem deutschen Chromium ersetzt („Datei auswählen“). Die Karte bei 0:58 hieß „Dasselbe
Spiel auf dem Telefon“, zeigt aber die Sensor-Übung; sie heißt jetzt „Auch auf dem Telefon“. Die Bilder auf dieser
Seite sind am selben Tag mit Playwright entstanden.

Lizenz: AGPL-3.0 für den Code (bis Commit `414f6d6` Apache-2.0), CC BY 4.0 für die beiden Beispielszenarien und
die Grafiken (Panagiotis Herbe).
