# Messprotokoll

Gemessen am **09.11.2026, 16:35–16:37 Uhr (MEZ)**, Version 0.1.0 mit der neuen Gestaltung (Szenarien in Version 2).
Alle Zahlen stammen aus diesem Lauf (Rohdaten: [`messwerte.json`](messwerte.json)); nichts ist geschätzt. Was nicht
gemessen wurde, steht am Ende. Das vorige Protokoll vom 02.11.2026 (alte Gestaltung, andere Maschine) steht in der
Git-Geschichte.

**Umgebung:** virtuelle Maschine mit 4 Kernen (Intel Xeon, 2,1 GHz), 15 GB RAM, Ubuntu 24.04; Anwendung direkt mit
Node.js v24.22.1, ein Prozess, ohne Docker; Browser Chromium 153.0.8010.12 headless auf derselben Maschine, gesteuert
über das DevTools-Protokoll mit dem eigenen Client aus `test/e2e/cdp.js`; axe-core 4.10.2 aus einer lokalen Datei.
Lasttest, Browser und Anwendung teilen sich die vier Kerne. Die Ladezeiten gelten für ein lokales Netz.

```bash
npm test
SBK_LEHRENDE_SCHLUESSEL=nachweis SBK_DEMO_KURSCODE=DEMO npm start          # leeres Datenverzeichnis
chromium --headless=new --remote-debugging-port=9222 about:blank
APP_URL=http://127.0.0.1:8080 AXE_DATEI=node_modules/axe-core/axe.min.js EXPORT_DIR=/tmp/export node test/e2e/nachweis.js
```

Mit Docker geht dasselbe weiterhin über `compose.nachweis.yaml` (siehe README).

## 1. Automatische Tests

**42 von 42 bestanden** in 0,66 s (`node --test`).

| Bereich | Tests | was geprüft wird |
|---|---|---|
| Formelrechner | 7 | Rechenregeln, Grad/Bogenmaß, Logik, Ablehnung von allem, was kein Ausdruck ist (`constructor`, `process`, `alert(1)`, Zuweisung) |
| Szenario-Prüfung | 3 | beide Beispielszenarien fehler- und hinweisfrei; sechs typische Autorenfehler mit Fundstelle; Endlosschleifen, unerreichbare Knoten |
| Spielablauf | 8 | Parameter reproduzierbar und vollständig; 300 Startwerte richtig durchgespielt = Erfolg mit 45/45 Punkten; Verzweigung nach dem Nachweis für 400 Startwerte gegen eine unabhängige Rechnung; Punktregeln (2. Versuch, Hinweis); Fehlerdiagnose; unmögliche Ereignisse; **die Ansicht enthält in keinem Schritt Lösung, Formel oder Folgeknoten** |
| Schnittstelle | 11 | Beitritt, Durchspielen, Manipulation (unmögliche Ereignisse, Doppelklick, fremde Versuche, eingeschleuste Punkte), Rollen, fremde Herkunft, Pfade außerhalb, Bremse gegen Durchprobieren, Lehrenden-Funktionen mit Mindestgruppe, Versionen, xAPI, OER, Auskunft und Löschung, Aufbewahrungsfrist, Vollständigkeit der OpenAPI-Beschreibung |
| Spielgestaltung | 10 | Sterne; Auszeichnungen fehlerfrei, mit Fehlern, mit Hinweis, nach riskanter Entscheidung; Kapitelkarte (genau ein aktuelles Kapitel, keine Knoten-IDs); Prüfung von Titelbild, Figur, Kapitel und Symbol; jedes Bild vorhanden, mit Alternativtext, ohne Skript; SVG mit eigener Content-Security-Policy; Übersicht mit Titelbild und besten Sternen; Auswertung mit beschrifteten Entscheidungen; gzip-Auslieferung |
| OER-Export | 3 | eine Datei ohne Nachladen von außen; gebündeltes Skript gültig; Metadaten nach AMB |

## 2. Last

Simulierte Studierende treten mit Kurscode bei, laden die Übersicht und spielen das Brückenszenario über die echte
Schnittstelle zu Ende; 30 % der Rechenaufgaben beantworten sie zuerst falsch. Gemessen ist jede einzelne Anfrage
(Beitritt, Übersicht, Start, jeder Spielschritt).

| Profil | simulierte Personen | Anfragen | Fehler | Dauer | Anfragen/s | Median | 95 % | 99 % | Maximum |
|---|---|---|---|---|---|---|---|---|---|
| Stoß: alle im selben Augenblick, ohne Pause | 50 | 549 | 0 | 0,6 s | 851 | 53,1 ms | 92,1 ms | 104,3 ms | 117,0 ms |
| Stoß: alle im selben Augenblick, ohne Pause | 200 | 2.183 | 0 | 1,9 s | 1.140 | 104,1 ms | 223,4 ms | 1.581,5 ms | 1.641,9 ms |
| Hörsaal: 1–5 s Denkzeit je Schritt | 300 | 3.279 | 0 | 39,0 s | 84 | 2,1 ms | 153,7 ms | 274,8 ms | 287,6 ms |

Alle 550 simulierten Personen haben das Szenario abgeschlossen, ohne einen Fehler. Der Stoß mit 200 Personen ist der
ungünstigste Fall (200 Beitritte in derselben Millisekunde): 95 % der Anfragen blieben unter 0,23 s, die langsamsten
1 % brauchten bis 1,6 s. Im Hörsaal-Profil mit 300 simulierten Personen, die zwischen den Schritten Denkzeit haben:
95 % unter 0,16 s. Die Zeiten sind länger als am 02.11.2026 (damals 8 Kerne, Browser nicht auf derselben Maschine
beschäftigt); hier liefen Lastgenerator und Anwendung auf denselben vier Kernen.

## 3. Im Browser

Das Brückenszenario wurde im Chromium über die Oberfläche durchgespielt, wie eine Person es tut: Zahlen aus dem
angezeigten Text lesen, rechnen, eintippen, Schritte mit „nach oben“ umsortieren, einmal absichtlich falsch antworten.
Dreimal: Desktop hell, Telefon, Desktop im dunklen Schema.

| | Desktop 1280 × 900 | Telefon 390 × 844 (Touch) | Desktop, dunkles Schema |
|---|---|---|---|
| erste Seite bis bedienbar: Dateien / übertragen (gzip) | 16 / 37 KB | 12 / 28 KB | 16 / 37 KB |
| Dateien von anderen Servern | keine | keine | keine |
| bedienbar nach (lokales Netz) | 135 ms | 114 ms | 160 ms |
| durchgespielt | Erfolg, 40/45 Punkte (ein Fehlversuch), 3 Sterne | dasselbe | dasselbe |
| Übersicht danach | „3 von 3 Sternen, 1× abgeschlossen, bestes Ergebnis 89 %“ | dasselbe | dasselbe |

Gezählt ist, was bis zum Erscheinen des Beitrittsfelds geladen war. Die erste Seite trägt jetzt das große Startbild
und beide Spielfiguren als SVG und ist trotzdem leichter als am 02.11.2026 (11 Dateien, 41 KB ohne Kompression): Der
Server liefert Text und SVG seit dieser Version mit gzip aus.

Die Auswertung für Lehrende zeigte danach 554 Personen (550 aus dem Lasttest, 4 aus den Browserdurchläufen), 553
abgeschlossene Versuche und 88 % mittlere Punktquote (Bild `lehrende-01-auswertung.png`).

## 4. Barrierefreiheit (automatisch)

axe-core 4.10.2, Regeln WCAG 2.0/2.1 A und AA sowie WCAG 2.2 AA, gemessen nach dem Ende der Einblendungen, auf
**22 Zuständen**:

- Desktop, hell: Anmeldung, Übersicht, Szene, Rückmeldung, Reihenfolge-Aufgabe, Rechenaufgabe, Rechenaufgabe nach
  Fehlversuch, Ergebnis, Rückmeldung nach einer riskanten Entscheidung
- Telefon: Anmeldung, Szene, Rückmeldung, Rechenaufgabe nach Fehlversuch, Ergebnis
- Desktop, dunkles Schema: Anmeldung, Szene, Rückmeldung, Rechenaufgabe nach Fehlversuch, Ergebnis
- Auswertung für Lehrende mit Diagrammen: hell, dunkel, Telefon

**0 Verstöße in allen 22 Zuständen** (je Zustand 21–30 bestandene Regeln).

Ein erster Lauf am selben Tag fand zwei Dinge, die vor dieser Messung behoben wurden: Auf dem Telefon hatte das Logo
oben links keinen lesbaren Namen mehr, und axe hatte Kontraste mitten in einer Einblendung gemessen (seitdem wartet
die Messung, bis Einblendungen fertig sind).

Automatische Prüfungen finden nur einen Teil der Hürden. Nicht geprüft: Bedienung mit Bildschirmlesern (NVDA,
VoiceOver), reine Tastaturbedienung durch Menschen, Verständlichkeit.

## 5. Offline-Fassung (OER-Export)

Das Brückenszenario als OER-Export vom Server heruntergeladen (eine HTML-Datei, **322 KB** mit allen eingebetteten
Szenenbildern, Figur und Auszeichnungen; am 02.11.2026 waren es 76 KB mit zwei Bildern) und als Datei (`file://`,
ohne Server) im Browser auf Telefonbreite durchgespielt: **Erfolg**, **0 Netzanfragen** nach dem Öffnen. Fußzeile:
„‚Riss an der Fußgängerbrücke‘ von Panagiotis Herbe, Lizenz CC BY 4.0
(https://creativecommons.org/licenses/by/4.0/). Offline-Fassung, Fortschritt bleibt auf diesem Gerät. Erstellt mit
dem Spielbaukasten (AGPL-3.0).“

Die Datei im Repository, [`demo/fussgaengerbruecke-v2.html`](../demo/fussgaengerbruecke-v2.html), ist mit
`tools/oer-export.js` erzeugt (322 KB; sie unterscheidet sich nur in der eingetragenen Adresse).

## 6. Bildschirmfotos

`bilder/`: 13 Zustände auf Desktop (`desktop-*`), 13 auf Telefonbreite (`telefon-*`), 3 im dunklen Schema
(`desktop-dunkel-*`), die Rückmeldung nach einer riskanten Entscheidung (`desktop-riskant.png`), 3 der
Lehrenden-Oberfläche (`lehrende-*`), das Ende der Offline-Fassung (`offline-ende.png`). Der persönliche Code ist im
Foto der Beitrittsseite ersetzt. Einige Fotos sind während einer Einblendung entstanden und zeigen dann eine halb
eingeblendete Zahl.

## 7. Nicht gemessen

- Echte Geräte, Safari und Firefox, langsame Mobilfunknetze.
- Nutzung durch Studierende und Lehrende: kein Usability-Test, keine Lernwirksamkeit (geplant: `docs/LERNDESIGN.md`).
- Betrieb hinter HTTPS und einem Reverse Proxy, Dauerbetrieb über Tage, Datensicherung.
- Die Sensor-Übung wurde in diesem Lauf nicht im Browser durchgespielt (sie läuft in den automatischen Tests).
- Die Fachinhalte sind nicht von Fachlehrenden geprüft.
