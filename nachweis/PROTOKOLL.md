# Messprotokoll

Gemessen am **12.11.2026, 14:04–14:07 Uhr (MEZ)**, Version 0.2.0: mit Szenario-Editor, Teamspiel, Kursrunde,
Administration und Ton. Alle Zahlen stammen aus diesem Lauf (Rohdaten: [`messwerte.json`](messwerte.json)); nichts ist
geschätzt. Alle Personen im Lasttest und die 24 Stimmen in der Kursrunde im Browser sind **simuliert**. Was nicht
gemessen wurde, steht am Ende. Das vorige Protokoll vom 09.11.2026 (Version 0.1.0, andere Maschine) steht in der
Git-Geschichte.

**Umgebung:** Mini-PC mit Intel Core i7-11700B (8 Kerne, 16 Threads), 62 GB RAM, Ubuntu 24.04. Anwendung, Browser und
Messung liefen je in einem Docker-Container in einem eigenen Netz ohne veröffentlichte Ports: Anwendung mit
Node.js v24.22.3 (Abbild `node:24`), ein Prozess, leere Datenbank; Chromium 158.0.8127.18 headless
(`chromedp/headless-shell`), gesteuert über das DevTools-Protokoll mit dem eigenen Client aus `test/e2e/cdp.js`;
axe-core 4.10.2 aus einer lokalen Datei. Lastgenerator, Browser und Anwendung teilen sich die Maschine. Die Ladezeiten
gelten für ein lokales Netz.

```bash
npm test
SBK_LEHRENDE_SCHLUESSEL=nachweis SBK_ADMIN_SCHLUESSEL=nachweis-admin SBK_DEMO_KURSCODE=DEMO npm start   # leeres Datenverzeichnis
chromium --headless=new --remote-debugging-port=9222 about:blank
APP_URL=http://127.0.0.1:8080 AXE_DATEI=node_modules/axe-core/axe.min.js EXPORT_DIR=/tmp/export node test/e2e/nachweis.js
```

Mit Docker geht dasselbe über `compose.nachweis.yaml` (siehe README).

## 1. Automatische Tests

**62 von 62 bestanden** in 0,52 s (`node --test`, im Container `node:24`).

| Bereich | Tests | was geprüft wird |
|---|---|---|
| Formelrechner | 7 | Rechenregeln, Grad/Bogenmaß, Logik, Ablehnung von allem, was kein Ausdruck ist |
| Szenario-Prüfung | 3 | beide Beispielszenarien fehler- und hinweisfrei; typische Autorenfehler mit Fundstelle; Endlosschleifen, unerreichbare Knoten |
| Spielablauf | 8 | Parameter reproduzierbar; 300 Startwerte richtig durchgespielt; Verzweigung gegen eine unabhängige Rechnung; Punktregeln; Fehlerdiagnose; unmögliche Ereignisse; die Ansicht enthält keine Lösung |
| Schnittstelle | 11 | Beitritt, Durchspielen, Manipulation, Rollen, fremde Herkunft, Pfade außerhalb, Bremse, Lehrenden-Funktionen mit Mindestgruppe, Versionen, xAPI, OER, Auskunft und Löschung, Aufbewahrungsfrist, **jede Route in der OpenAPI-Beschreibung** (jetzt über alle Server-Dateien) |
| Spielgestaltung | 10 | Sterne, Auszeichnungen, Kapitelkarte, neue Felder, Bilder mit Alternativtext, SVG mit eigener Richtlinie, Übersicht, Auswertung, gzip |
| OER-Export | 3 | eine Datei ohne Nachladen; gültiges Skript; Metadaten nach AMB |
| **Editor** | 5 | öffnen, ändern, als neue Version speichern (alte bleibt, neue Versuche nehmen die neue); Fehler mit Fundstelle, nichts gespeichert; veraltete Grundlage ergibt 409 statt Überschreiben; neues Szenario aus der Vorlage, Kennung nicht doppelt; Vorschau ohne Speichern mit Content-Security-Policy über Prüfsummen; Studierende erreichen weder Editor noch Vorschau |
| **Teamspiel und Kursrunde** | 9 | gemeinsamer Stand und Mehrheit (1 : 1 offen, 2 : 1 entschieden), Gleichstand (erste Stimme gilt), vorzeitiges Schließen nur durch wer gegründet hat, Antworten nach Bewertung gruppiert, Hinweis sofort für alle, Fremde und andere Kurse ausgeschlossen, Live-Stände über Server-Sent Events, **Kursrunde: Verteilung erst ab drei Stimmen, ohne Pseudonyme, darunter auch die Entscheidung verborgen**, Meine Daten und Löschen mit Teams |
| **Administration und Ton** | 6 | Rollen: Studierende erreichen weder Lehrenden- noch Administrationsrouten, Lehrende und Administration nicht die der anderen; Zugang anlegen, sperren (sofort abgemeldet, Anmeldung abgewiesen), entsperren, auch der gemeinsame Schlüssel; Aufbewahrungsfrist in der Oberfläche, wirkt sofort; Protokoll ohne Studierende und ohne Schlüssel; Ton je Person, aus als Voreinstellung; Übernahme einer Datenbank von Version 0.1 |

## 2. Last (simulierte Studierende)

Simulierte Studierende treten mit Kurscode bei und spielen das Brückenszenario über die echte Schnittstelle zu Ende;
30 % der Rechenaufgaben beantworten sie zuerst falsch. Gemessen ist jede einzelne Anfrage.

**Allein** (wie am 09.11.2026):

| Profil | simulierte Personen | Anfragen | Fehler | Dauer | Anfragen/s | Median | 95 % | 99 % | Maximum |
|---|---|---|---|---|---|---|---|---|---|
| Stoß: alle im selben Augenblick, ohne Pause | 50 | 544 | 0 | 0,3 s | 1.645 | 20,3 ms | 40,6 ms | 226,0 ms | 259,4 ms |
| Stoß: alle im selben Augenblick, ohne Pause | 200 | 2.178 | 0 | 1,0 s | 2.105 | 64,5 ms | 87,1 ms | 869,6 ms | 938,0 ms |
| Hörsaal: 1–5 s Denkzeit je Schritt | 300 | 3.259 | 0 | 40,1 s | 81 | 1,5 ms | 97,6 ms | 187,6 ms | 194,6 ms |

**Gemeinsam:** Jede simulierte Person hat eine eigene Live-Verbindung (Server-Sent Events) und stimmt nach einer
Denkzeit ab; sie liest die Zahlen aus dem angezeigten Stand. Gemessen sind jede Anfrage und die **Zustellung**: die
Zeit vom Absenden der letzten nötigen Stimme bis der neue Stand über die Live-Verbindung bei allen Mitgliedern
angekommen ist (Lastgenerator und Anwendung auf derselben Uhr).

| Profil | simulierte Personen | Anfragen | Fehler | Dauer | Median | 95 % | 99 % | Maximum | Entscheidungen | Zustellung an alle: Median / 95 % / Maximum |
|---|---|---|---|---|---|---|---|---|---|---|
| 50 Teams zu je 3, 1–3 s Denkzeit | 150 | 1.136 | 0 | 22,4 s | 2,0 ms | 24,6 ms | 76,3 ms | 91,7 ms | 383 | 2,2 / 2,9 / 19,3 ms |
| eine Kursrunde, 1–4 s Denkzeit, entschieden, wenn alle abgestimmt haben | 200 + 1 Lehrperson | 2.003 | 0 | 28,3 s | 2,1 ms | 130,7 ms | 227,7 ms | 241,5 ms | 7 | 9,5 / 17,7 / 17,7 ms an alle 200; 5,2 / 12,8 / 12,8 ms an die Lehrperson |

Alle 50 Teams und die Kursrunde haben das Szenario mit Erfolg beendet. Im Teamprofil kam eine Stimme an, nachdem ihr
Team schon entschieden hatte (Antwort 409, „Inzwischen wurde schon entschieden“, so vorgesehen; nicht als Fehler
gezählt). In der Kursrunde traten alle 200 in 0,3 s bei; die Lehrperson bekam 187 Live-Stände.

Zusammen mit den Alleinspielenden haben in diesem Lauf 900 simulierte Personen gespielt, ohne einen Fehler. Der
Stoß mit 200 Personen in derselben Millisekunde ist der ungünstigste Fall: 95 % der Anfragen unter 0,09 s, die
langsamsten 1 % bis 0,94 s.

## 3. Im Browser

**Alleinspiel**, wie am 09.11.2026 dreimal durchgespielt (Desktop hell, Telefon, Desktop dunkel): Zahlen aus dem Text
lesen, rechnen, eintippen, Schritte umsortieren, einmal absichtlich falsch antworten.

| | Desktop 1280 × 900 | Telefon 390 × 844 (Touch) | Desktop, dunkles Schema |
|---|---|---|---|
| erste Seite bis bedienbar: Dateien / übertragen (gzip) | 16 / 42 KB | 16 / 42 KB | 16 / 42 KB |
| Dateien von anderen Servern | keine | keine | keine |
| bedienbar nach (lokales Netz) | 44 ms | 58 ms | 60 ms |
| durchgespielt | Erfolg, 3 Sterne | dasselbe | dasselbe |
| Übersicht danach | „3 von 3 Sternen, 1× abgeschlossen, bestes Ergebnis 89 %“ | dasselbe | dasselbe |

Die erste Seite ist 5 KB schwerer als am 09.11.2026 (37 KB): Schalter „Ton“ und Kursrunden auf der Übersicht. Das
Modul für das Teamspiel lädt erst, wenn es gebraucht wird. Die Auswertung für Lehrende zeigte danach 554 Personen,
553 abgeschlossene Versuche, 89 % mittlere Punktquote.

**Szenario-Editor** (Lehrende, Desktop): „Übung: Spannungsteiler am Sensor“ geöffnet, Aufgabe „Teilspannung“ gewählt,
in der Lösung absichtlich `R3` statt `R2` getippt, „Prüfen“: Meldung „knoten.teilspannung.loesung „R3“ ist kein
Parameter des Szenarios“, das Feld ist als ungültig markiert (`aria-invalid`), „Zur Stelle“ setzt den Fokus in genau
dieses Feld. Korrigiert, Titel in „Übung: Spannungsteiler im Praktikum“ geändert, gespeichert: „Version 3
gespeichert“; vorhanden sind danach Version 3 (Editor) und Version 2 (Datei). „Vorschau im neuen Tab“: Titel
„Vorschau: Übung: Spannungsteiler im Praktikum“, im Browser durchgespielt bis „Erfolg“.

**Teamspiel** (drei Browser, Desktop): Team gegründet, zwei treten mit dem Team-Code bei. Zwei stimmen verschieden
ab: Alle drei sehen „2 von 3 haben abgestimmt“ und je eine Stimme für A und B. Die dritte Stimme entscheidet 2 : 1;
**57 ms** nach ihrem Klick zeigten alle drei Browser die Rückmeldung „Gute Entscheidung“ (geprüft alle 50 ms), nach
„Weiter“ standen alle drei bei derselben Aufgabe.

**Kursrunde** (Lehrperson im Browser, Desktop; 24 simulierte Studierende über die Schnittstelle; eine Person im Browser
auf Telefonbreite, beigetreten über „Mitmachen“ auf der Übersicht): vier Schritte, darunter einer, den die Lehrperson
mit „Abstimmung schließen“ entschied. Bei der Rechenaufgabe zeigte die Live-Ansicht nach 24 von 25 Stimmen
„richtig 15 (63 %)“, „falsch: Es gibt zwei Diagonalen; jede trägt die … 6 (25 %)“, „falsch: Die Hälfte der Last
stimmt, aber die … 3 (13 %)“; die Person auf dem Telefon sah nur „24 von 25 haben abgestimmt“. Nach „Abstimmung
schließen“ zeigte das Telefon **54 ms** später „Richtig“. Danach „Runde beenden“.

**Administration** (Desktop): Zugang „Lehrstuhl Baustatik“ angelegt; mit seinem Schlüssel angemeldet (200).
Gesperrt: Die laufende Sitzung bekam 401, eine neue Anmeldung 403 („Zugang gesperrt“). Entsperrt: Anmeldung wieder
200. Einstellungen mit 15 Angaben zur Instanz; das Protokoll enthielt Anmeldung, Zugang angelegt, gesperrt,
entsperrt, „Anmeldung abgewiesen: Zugang gesperrt“, Kursrunde gestartet und beendet, „Szenario im Editor
gespeichert“.

**Ton:** Voreinstellung aus (`aria-pressed="false"`); eingeschaltet und Seite neu geladen: weiter an (die Einstellung
liegt beim Pseudonym). Nach einer guten Entscheidung wurde der Ton „richtig“ ausgelöst, gleichzeitig stand „Gute
Entscheidung“ als Text da. Web Audio war vorhanden. Ob der Ton hörbar ist, misst ein Browser ohne Lautsprecher nicht.

## 4. Barrierefreiheit (automatisch)

axe-core 4.10.2, Regeln WCAG 2.0/2.1 A und AA sowie WCAG 2.2 AA, gemessen nach dem Ende der Einblendungen, auf
**47 Zuständen**:

- Alleinspiel wie am 09.11.2026 (22 Zustände): Desktop hell, Telefon, Desktop dunkel, riskante Entscheidung,
  Auswertung für Lehrende hell, dunkel, Telefon
- Editor: Allgemein, Aufgabe, mit Fehlermeldung, dunkel, Telefon, Ende der Vorschau
- Teamspiel: Team gründen, Abstimmung (Desktop, Telefon, dunkel), Rückmeldung nach der Entscheidung
- Kursrunde: Runde starten, Übersicht mit Live-Runde (Telefon), Live-Ansicht der Lehrenden (hell, dunkel, Telefon),
  Abstimmung der Studierenden (Telefon)
- Administration: Anmeldung, Zugänge, neuer Zugang mit Schlüssel, Einstellungen, Protokoll (hell, dunkel, Telefon)
- Übersicht mit eingeschaltetem Ton

**0 Verstöße in allen 47 Zuständen** (je Zustand 20–31 bestandene Regeln).

Ein Lauf am selben Tag fand einen Verstoß, der vor dieser Messung behoben wurde: Auf dem Telefon ließ sich die seitlich
scrollende Tabelle des Protokolls nicht mit der Tastatur erreichen (`scrollable-region-focusable`). Im selben Lauf
blieben 13 von 50 simulierten Teams stehen: Simulierte Personen, die eine Szene nicht selbst entschieden hatten,
hatten deren Zahlen nicht gelesen und schickten keine gültige Antwort. Das lag am Lastgenerator, nicht an der
Anwendung; er liest seitdem jeden angezeigten Stand mit.

Automatische Prüfungen finden nur einen Teil der Hürden. Nicht geprüft: Bedienung mit Bildschirmlesern (NVDA,
VoiceOver), reine Tastaturbedienung durch Menschen, Verständlichkeit.

## 5. Offline-Fassung (OER-Export)

Das Brückenszenario als OER-Export vom Server heruntergeladen (eine HTML-Datei, **339 KB** mit allen Bildern; am
09.11.2026 waren es 322 KB, dazu kamen Schalter und Töne) und als Datei (`file://`, ohne Server) im Browser auf
Telefonbreite durchgespielt: **Erfolg**, **0 Netzanfragen** nach dem Öffnen. Fußzeile: „‚Riss an der
Fußgängerbrücke‘ von Panagiotis Herbe, Lizenz CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/).
Offline-Fassung, Fortschritt bleibt auf diesem Gerät. Erstellt mit dem Spielbaukasten (AGPL-3.0).“

Die Datei im Repository, [`demo/fussgaengerbruecke-v2.html`](../demo/fussgaengerbruecke-v2.html), ist mit
`tools/oer-export.js` neu erzeugt (339 KB; sie unterscheidet sich nur in der eingetragenen Adresse).

## 6. Bildschirmfotos

`bilder/`: 13 Zustände des Alleinspiels auf Desktop (`desktop-0*`), 13 auf Telefonbreite (`telefon-0*`), 3 im dunklen
Schema, die riskante Entscheidung, die Lehrenden-Oberfläche (`lehrende-01` bis `-03`), der Editor (`lehrende-04`,
mit Fehlermeldung `lehrende-05`, Telefon `telefon-10`), das Teamspiel (`desktop-10`, Telefon `telefon-11`), die
Kursrunde (Lehrende `lehrende-06`, Telefon `telefon-12`), die Administration (`admin-01` bis `-03`), das Ende der
Offline-Fassung; zusammen 44. Der persönliche Code und der Schlüssel des neuen Zugangs sind in den Fotos ersetzt.
Uhrzeiten in den Fotos der Administration stehen in der Zeitzone des Browsers im Container (UTC, also eine Stunde
vor MEZ).
Die drei Bilder `medien/editor.png`, `medien/teamspiel.png` und `medien/kursrunde-lehrende.png` (1280 px breit,
doppelte Pixeldichte) stammen aus demselben Lauf.

## 7. Nicht gemessen

- Echte Geräte, Safari und Firefox, langsame Mobilfunknetze.
- Nutzung durch Studierende und Lehrende: kein Usability-Test des Editors, keine echten Teams oder Kursrunden (alle
  Stimmen im Lasttest und 24 der 25 in der Kursrunde im Browser sind simuliert), keine Lernwirksamkeit.
- Ob die Töne hörbar und angenehm sind; gemessen ist nur, dass der passende Ton ausgelöst wird.
- Live-Verbindungen hinter HTTPS und einem Reverse Proxy, über Stunden, mehr als 200 Personen in einer Kursrunde,
  mehrere Kursrunden gleichzeitig.
- Betrieb hinter HTTPS, Dauerbetrieb über Tage, Datensicherung.
- Die Fachinhalte sind nicht von Fachlehrenden geprüft.
