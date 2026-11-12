# Messprotokoll

Gemessen am **12.11.2026, 16:07–16:10 Uhr (MEZ)**, Version 0.2.1: mit vereinfachtem Editor (neues Szenario aus
Vorlage, Meldungen im Klartext, „Für Fortgeschrittene“), Teamspiel, Live-Runde, Administration und Ton. Alle Zahlen
stammen aus diesem Lauf (Rohdaten: [`messwerte.json`](messwerte.json)); nichts ist geschätzt. **Alle Personen sind
simuliert:** im Lasttest, im Teamspiel (drei automatisch gesteuerte Browser) und in der Live-Runde (24 über die
Schnittstelle, eine über einen automatisch gesteuerten Browser); auch die Lehrperson im Browser steuert ein Skript.
Was nicht gemessen wurde, steht am Ende. Die Protokolle vom 12.11.2026, 14:04 Uhr (Version 0.2.0) und vom 09.11.2026
(Version 0.1.0, andere Maschine) stehen in der Git-Geschichte.

**Umgebung:** Mini-PC mit Intel Core i7-11700B (8 Kerne, 16 Threads), 62 GB RAM, Ubuntu 24.04. Anwendung, Browser und
Messung liefen je in einem Docker-Container in einem eigenen Netz ohne veröffentlichte Ports: Anwendung mit
Node.js v24.22.3 (Abbild `node:24`), ein Prozess, leere Datenbank; Chromium 158.0.8127.18 headless
(`chromedp/headless-shell`), gesteuert über das DevTools-Protokoll mit dem eigenen Client aus `test/e2e/cdp.js`;
axe-core 4.10.2 aus einer lokalen Datei. Lastgenerator, Browser und Anwendung teilen sich die Maschine. Die Ladezeiten
gelten für ein lokales Netz.

```bash
node --test --test-reporter=tap test/*.test.js > export/tests.tap
SBK_LEHRENDE_SCHLUESSEL=nachweis SBK_ADMIN_SCHLUESSEL=nachweis-admin SBK_DEMO_KURSCODE=DEMO npm start   # leeres Datenverzeichnis
chromium --headless=new --remote-debugging-port=9222 about:blank
APP_URL=http://127.0.0.1:8080 AXE_DATEI=node_modules/axe-core/axe.min.js EXPORT_DIR=/tmp/export TESTS_DATEI=export/tests.tap node test/e2e/nachweis.js
```

Ähnlich geht es mit Docker über `compose.nachweis.yaml` (siehe README); dort lädt die Messung axe-core vom CDN, und die
Anwendung heißt im Netz anders. Dieser Lauf nutzte eigene Container (Abbild `node:24` für Tests und Anwendung) und
axe-core aus einer lokalen Datei. Das Ergebnis der Tests steht mit in `messwerte.json` (`tests`).

## 1. Automatische Tests

**67 von 67 bestanden** in 0,54 s (`node --test`, im Container `node:24`, unmittelbar vor der Messung).

| Bereich | Tests | was geprüft wird |
|---|---|---|
| Formelrechner | 7 | Rechenregeln, Grad/Bogenmaß, Logik, Ablehnung von allem, was kein Ausdruck ist |
| Szenario-Prüfung | 3 | beide Beispielszenarien fehler- und hinweisfrei; typische Autorenfehler mit Fundstelle; Endlosschleifen, unerreichbare Knoten |
| Spielablauf | 8 | Parameter reproduzierbar; 300 Startwerte richtig durchgespielt; Verzweigung gegen eine unabhängige Rechnung; Punktregeln; Fehlerdiagnose; unmögliche Ereignisse; die Ansicht enthält keine Lösung |
| Schnittstelle | 11 | Beitritt, Durchspielen, Manipulation, Rollen, fremde Herkunft, Pfade außerhalb, Bremse, Lehrenden-Funktionen mit Mindestgruppe, Versionen, xAPI, OER, Auskunft und Löschung, Aufbewahrungsfrist, **jede Route in der OpenAPI-Beschreibung** |
| Spielgestaltung | 10 | Sterne, Auszeichnungen, Kapitelkarte, neue Felder, Bilder mit Alternativtext, SVG mit eigener Richtlinie, Übersicht, Auswertung, gzip |
| OER-Export | 3 | eine Datei ohne Nachladen; gültiges Skript; Metadaten nach AMB |
| Editor | 5 | öffnen, ändern, als neue Version speichern (alte bleibt, neue Versuche nehmen die neue); Fehler mit Fundstelle, nichts gespeichert; veraltete Grundlage ergibt 409 statt Überschreiben; neues Szenario aus einer Vorlage, Kennung aus dem Titel, nicht doppelt; Vorschau ohne Speichern mit Content-Security-Policy über Prüfsummen; Studierende erreichen weder Editor noch Vorschau |
| **Vorlagen und Klartext** (neu) | 5 | die drei Vorlagen (Entscheidungsspiel, Rechenübung, Quiz) bestehen die Prüfung ohne Fehler und ohne Hinweise; jeder Weg führt bis zu einem Ende, über 40 Startwerte, auch mit falscher erster Antwort; der typische Fehler der Rechenübung wird erkannt; über die Schnittstelle gespeichert, als Vorschau geöffnet, freigegeben und von einer simulierten Person bis „Erfolg“ gespielt; interne Kennung aus dem Titel (Umlaute, Länge, eindeutig); Prüfmeldungen nennen den Schritt beim Titel und das Feld wie im Editor, ohne Begriffe der Datei |
| Teamspiel und Live-Runde | 9 | gemeinsamer Stand und Mehrheit (1 : 1 offen, 2 : 1 entschieden), Gleichstand (erste Stimme gilt), vorzeitiges Schließen nur durch wer gegründet hat, Antworten nach Bewertung gruppiert, Hinweis sofort für alle, Fremde und andere Kurse ausgeschlossen, Live-Stände über Server-Sent Events, **Live-Runde: Verteilung erst ab drei Stimmen, ohne Pseudonyme, darunter auch die Entscheidung verborgen**, Meine Daten und Löschen mit Teams |
| Administration und Ton | 6 | Rollen: Studierende erreichen weder Lehrenden- noch Administrationsrouten, Lehrende und Administration nicht die der anderen; Zugang anlegen, sperren (sofort abgemeldet, Anmeldung abgewiesen), entsperren, auch der gemeinsame Schlüssel; Aufbewahrungsfrist in der Oberfläche, wirkt sofort; Protokoll ohne Studierende und ohne Schlüssel; Ton je Person, aus als Voreinstellung; Übernahme einer Datenbank von Version 0.1 |

## 2. Last (simulierte Studierende)

Simulierte Studierende treten mit Kurscode bei und spielen das Brückenszenario über die echte Schnittstelle zu Ende;
30 % der Rechenaufgaben beantworten sie zuerst falsch. Gemessen ist jede einzelne Anfrage.

**Allein:**

| Profil | simulierte Personen | Anfragen | Fehler | Dauer | Anfragen/s | Median | 95 % | 99 % | Maximum |
|---|---|---|---|---|---|---|---|---|---|
| Stoß: alle im selben Augenblick, ohne Pause | 50 | 539 | 0 | 0,3 s | 1.624 | 25,2 ms | 44,2 ms | 65,1 ms | 108,7 ms |
| Stoß: alle im selben Augenblick, ohne Pause | 200 | 2.176 | 0 | 1,0 s | 2.085 | 50,1 ms | 104,1 ms | 879,3 ms | 966,2 ms |
| Hörsaal: 1–5 s Denkzeit je Schritt | 300 | 3.293 | 0 | 37,8 s | 87 | 1,5 ms | 90,9 ms | 181,1 ms | 188,7 ms |

**Gemeinsam:** Jede simulierte Person hat eine eigene Live-Verbindung (Server-Sent Events) und stimmt nach einer
Denkzeit ab; sie liest die Zahlen aus dem angezeigten Stand. Gemessen sind jede Anfrage und die **Zustellung**: die
Zeit vom Absenden der letzten nötigen Stimme bis der neue Stand über die Live-Verbindung bei allen Mitgliedern
angekommen ist (Lastgenerator und Anwendung auf derselben Uhr).

| Profil | simulierte Personen | Anfragen | Fehler | Dauer | Median | 95 % | 99 % | Maximum | Entscheidungen | Zustellung an alle: Median / 95 % / Maximum |
|---|---|---|---|---|---|---|---|---|---|---|
| 50 Teams zu je 3, 1–3 s Denkzeit | 150 | 1.138 | 0 | 23,5 s | 1,9 ms | 29,4 ms | 80,2 ms | 92,3 ms | 386 | 2,2 / 2,7 / 17,8 ms |
| eine Live-Runde, 1–4 s Denkzeit, entschieden, wenn alle abgestimmt haben | 200 + 1 Lehrperson | 2.003 | 0 | 28,3 s | 2,1 ms | 144,6 ms | 233,7 ms | 256,1 ms | 7 | 9,9 / 12,4 / 12,4 ms an alle 200; 5,3 / 7,4 / 7,4 ms an die Lehrperson |

Alle 50 Teams und die Live-Runde haben das Szenario mit Erfolg beendet. In der Live-Runde traten alle 200 in 0,3 s
bei; die Lehrperson bekam 182 Live-Stände.

Zusammen haben in diesem Lauf 900 simulierte Personen gespielt, ohne einen Fehler. Der Stoß mit 200 Personen in
derselben Millisekunde ist der ungünstigste Fall: 95 % der Anfragen unter 0,11 s, die langsamsten 1 % bis 0,97 s.

## 3. Im Browser

**Alleinspiel**, dreimal durchgespielt (Desktop hell, Telefon, Desktop dunkel): Zahlen aus dem Text lesen, rechnen,
eintippen, Schritte umsortieren, einmal absichtlich falsch antworten.

| | Desktop 1280 × 900 | Telefon 390 × 844 (Touch) | Desktop, dunkles Schema |
|---|---|---|---|
| erste Seite bis bedienbar: Dateien / übertragen (gzip) | 16 / 42 KB | 13 / 34 KB | 16 / 42 KB |
| Dateien von anderen Servern | keine | keine | keine |
| bedienbar nach (lokales Netz) | 43 ms | 44 ms | 51 ms |
| durchgespielt | Erfolg, 3 Sterne | dasselbe | dasselbe |
| Übersicht danach | „3 von 3 Sternen, 1× abgeschlossen, bestes Ergebnis 89 %“ | dasselbe | dasselbe |

Gezählt werden die Dateien, die bis zum Zeitpunkt „bedienbar“ geladen waren. Auf dem Telefon waren es diesmal 13 (in
der Messung von 14:04 Uhr 16); welche drei erst danach kamen, ist nicht gemessen. Die erste Seite auf dem Desktop ist
0,5 KB schwerer als um 14:04 Uhr (Stil der Seite „Neues Szenario aus Vorlage“ und der Bereiche „Für Fortgeschrittene“).
Die Auswertung für Lehrende zeigte danach 554 Personen, 553 abgeschlossene Versuche, 88 % mittlere Punktquote.

**Szenario-Editor** (Lehrende, Desktop): „Übung: Spannungsteiler am Sensor“ geöffnet; der Stand oben rechts lautet
„Keine Änderungen“. Aufgabe „Teilspannung“ gewählt. Im sichtbaren Text des Editors (Ablauf, Formular, Auswahllisten)
steht keine interne Kennung der Schritte (geprüft: `aufbau`, `teilspannung`, `last`, `ende`; ausgenommen ist die
Bildauswahl, dort stehen Dateinamen). Die Hilfe am Feld „Lösung (Formel)“ lautet: „Wie auf dem Papier, mit den Namen
aus „Zahlen je Person“ (U, R1, R2): z. B. U * R2 / (R1 + R2)“. „Für Fortgeschrittene“ ist geschlossen; mit der
Tastatur fokussiert, öffnet die Eingabetaste den Bereich (Inhalt: Interne Kennung mit „Umbenennen“, „Als Start
festlegen“), die Leertaste schließt ihn. In der Lösung absichtlich `R3` statt `R2` getippt, „Prüfen“: Meldung
„Aufgabe „Teilspannung“, Lösung (Formel): „R3“ kennt das Spiel nicht. Erlaubt sind: U, R1, R2.“, das Feld ist als
ungültig markiert (`aria-invalid`), „Zur Stelle“ setzt den Fokus in genau dieses Feld. Korrigiert, Titel in „Übung:
Spannungsteiler im Praktikum“ geändert, gespeichert: „Version 3 gespeichert“ (auch oben rechts); vorhanden sind
danach Version 3 (Editor) und Version 2 (Datei). „Vorschau im neuen Tab“: Titel „Vorschau: Übung: Spannungsteiler im
Praktikum“, im Browser durchgespielt bis „Erfolg“.

**Neues Szenario aus Vorlage** (Lehrende, Desktop): Unter „Szenarien“ steht oben der Knopf „Neues Szenario aus
Vorlage“. Die Seite zeigt drei Vorlagen mit ihrem Ablauf: „Entscheidungsspiel: Szene → 2 Möglichkeiten → 2 Enden“,
„Rechenübung: Rechenaufgabe → Ende“, „Quiz: Frage 1 → Frage 2 → Ende“. Mit der Tastatur: erste Vorlage fokussiert,
Pfeiltaste nach rechts wählt die Rechenübung, der Titel wechselt zu „Übung: Spannung im Zugstab“. Name eingetragen,
„Im Editor öffnen“: Der Editor öffnet bei der Aufgabe „Spannung im Zugstab“, Stand „Noch nicht gespeichert“; die
Formelhilfe lautet „Wie auf dem Papier, mit den Namen aus „Zahlen je Person“ (F, A): z. B. F * 1000 / A“. **„Prüfen“
ohne jede Änderung, für alle drei Vorlagen:** „Keine Fehler. Das Szenario lässt sich spielen.“ Dann in der
Rechenübung die Frage geändert (Stand: „Ungespeicherte Änderungen“), „Vorschau im neuen Tab“: Titel „Vorschau: Übung:
Spannung im Zugstab“, die geänderte Frage steht da, im Browser durchgespielt bis „Erfolg“. Gespeichert: „Version 1
gespeichert“; die interne Kennung entstand aus dem Titel (`uebung-spannung-im-zugstab`), die Schritte heißen intern
`spannung-im-zugstab` und `geschafft`. Wieder geöffnet: Stand „Keine Änderungen“.

**Teamspiel** (drei simulierte Personen in drei automatisch gesteuerten Browsern, Desktop): Team gegründet, zwei
treten mit dem Team-Code bei. Zwei stimmen verschieden ab: Alle drei sehen „2 von 3 haben abgestimmt“ und je eine
Stimme für A und B. Die dritte Stimme entscheidet 2 : 1; **56 ms** nach ihrem Klick zeigten alle drei Browser die
Rückmeldung „Gute Entscheidung“ (geprüft alle 50 ms), nach „Weiter“ standen alle drei bei derselben Aufgabe.

**Live-Runde** (Lehrperson im Browser, Desktop; 24 simulierte Studierende über die Schnittstelle; eine simulierte
Person in einem automatisch gesteuerten Browser auf Telefonbreite, beigetreten über „Mitmachen“ auf der Übersicht):
vier Schritte, darunter einer, den die Lehrperson mit „Abstimmung schließen“ entschied. Bei der Rechenaufgabe zeigte
die Live-Ansicht nach 24 von 25 Stimmen „richtig 15 (63 %)“, „falsch: Es gibt zwei Diagonalen; jede trägt die … 6
(25 %)“, „falsch: Die Hälfte der Last stimmt, aber die … 3 (13 %)“; die Person auf dem Telefon sah nur „24 von 25
haben abgestimmt“. Nach „Abstimmung schließen“ zeigte das Telefon **52 ms** später „Richtig“. Danach „Runde beenden“.

**Administration** (Desktop): Zugang „Lehrstuhl Baustatik“ angelegt; mit seinem Schlüssel angemeldet (200).
Gesperrt: Die laufende Sitzung bekam 401, eine neue Anmeldung 403 („Zugang gesperrt“). Entsperrt: Anmeldung wieder
200. Einstellungen mit 15 Angaben zur Instanz; das Protokoll enthielt Anmeldung, Zugang angelegt, gesperrt,
entsperrt, „Anmeldung abgewiesen: Zugang gesperrt“, Live-Runde gestartet und beendet, „Szenario im Editor
gespeichert“.

**Ton:** Voreinstellung aus (`aria-pressed="false"`); eingeschaltet und Seite neu geladen: weiter an (die Einstellung
liegt beim Pseudonym). Nach einer guten Entscheidung wurde der Ton „richtig“ ausgelöst, gleichzeitig stand „Gute
Entscheidung“ als Text da. Web Audio war vorhanden. Ob der Ton hörbar ist, misst ein Browser ohne Lautsprecher nicht.

## 4. Barrierefreiheit (automatisch)

axe-core 4.10.2, Regeln WCAG 2.0/2.1 A und AA sowie WCAG 2.2 AA, gemessen nach dem Ende der Einblendungen, auf
**55 Zuständen**:

- Alleinspiel (22 Zustände): Desktop hell, Telefon, Desktop dunkel, riskante Entscheidung, Auswertung für Lehrende
  hell, dunkel, Telefon
- Editor: Allgemein, Aufgabe, **„Für Fortgeschrittene“ geöffnet**, mit Fehlermeldung, dunkel, Telefon, Ende der
  Vorschau
- **Neues Szenario aus Vorlage:** Seite mit den drei Vorlagen (hell, dunkel, Telefon), Editor mit der neuen
  Rechenübung, Aufgabe in der Vorschau, die gespeicherte Rechenübung im Editor (hell, dunkel)
- Teamspiel: Team gründen, Abstimmung (Desktop, Telefon, dunkel), Rückmeldung nach der Entscheidung
- Live-Runde: Runde starten, Übersicht mit Live-Runde (Telefon), Live-Ansicht der Lehrenden (hell, dunkel, Telefon),
  Abstimmung der Studierenden (Telefon)
- Administration: Anmeldung, Zugänge, neuer Zugang mit Schlüssel, Einstellungen, Protokoll (hell, dunkel, Telefon)
- Übersicht mit eingeschaltetem Ton

**0 Verstöße in allen 55 Zuständen** (je Zustand 20–31 bestandene Regeln). Dazu mit der Tastatur geprüft (Tasten über
das DevTools-Protokoll, nicht von Hand): „Für Fortgeschrittene“ öffnet mit der Eingabetaste und schließt mit der
Leertaste; auf der Seite der Vorlagen wählt die Pfeiltaste die nächste Vorlage.

Vor diesem Lauf, am selben Nachmittag: Ein Probelauf ohne Last (15:57 Uhr) meldete im sichtbaren Text des Editors die
Wörter `aufbau`, `teilspannung`, `last` und `ende`. Es waren Dateinamen in der Bildauswahl (`medien/teilspannung.svg`),
keine Kennungen von Schritten; die Bildauswahl zeigt die Dateien seitdem ohne Ordner, die Prüfung lässt sie aus. Ein
erster voller Lauf (16:00 Uhr) lief noch mit der Versionsnummer 0.2.0 und ist deshalb nicht dieses Protokoll; er ergab
ebenfalls 67 von 67 Tests, 0 Fehler unter Last und 0 Verstöße. Vor der Messung von 14:04 Uhr fand ein Lauf einen
Verstoß, der damals behoben wurde (seitlich scrollende Tabelle des Protokolls auf dem Telefon nicht mit der Tastatur
erreichbar).

Automatische Prüfungen finden nur einen Teil der Hürden. Nicht geprüft: Bedienung mit Bildschirmlesern (NVDA,
VoiceOver), reine Tastaturbedienung durch Menschen, Verständlichkeit.

## 5. Offline-Fassung (OER-Export)

Das Brückenszenario als OER-Export vom Server heruntergeladen (eine HTML-Datei, **342 KB** mit allen Bildern; um 14:04
Uhr 339 KB: Die Datei enthält die ganze Gestaltung, also auch den neuen Stil für Lehrende) und als Datei (`file://`,
ohne Server) im Browser auf Telefonbreite durchgespielt: **Erfolg**, **0 Netzanfragen** nach dem Öffnen. Fußzeile:
„‚Riss an der Fußgängerbrücke‘ von Panagiotis Herbe, Lizenz CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/).
Offline-Fassung, Fortschritt bleibt auf diesem Gerät. Erstellt mit dem Spielbaukasten (AGPL-3.0).“

Die Datei im Repository, [`demo/fussgaengerbruecke-v2.html`](../demo/fussgaengerbruecke-v2.html), ist mit
`tools/oer-export.js` neu erzeugt (342 KB; sie unterscheidet sich nur in der eingetragenen Adresse).

## 6. Bildschirmfotos

`bilder/`: 13 Zustände des Alleinspiels auf Desktop (`desktop-0*`), 13 auf Telefonbreite (`telefon-0*`), 3 im dunklen
Schema, die riskante Entscheidung, die Lehrenden-Oberfläche (`lehrende-01` bis `-03`), der Editor (`lehrende-04`,
mit Fehlermeldung `lehrende-05`, Telefon `telefon-10`), **die Seite „Neues Szenario aus Vorlage“ (`lehrende-07`,
Telefon `telefon-13`) und die Rechenübung aus der Vorlage im Editor (`lehrende-08`)**, das Teamspiel (`desktop-10`,
Telefon `telefon-11`), die Live-Runde (Lehrende `lehrende-06`, Telefon `telefon-12`), die Administration (`admin-01`
bis `-03`), das Ende der Offline-Fassung; zusammen 47. Welche Szene nach der Rechnung kommt, hängt von den Zahlen der
Person ab (`…-08-szene-entscheidung_reserve` oder `…_ueberlastet`). Der persönliche Code und der Schlüssel des neuen
Zugangs sind in den Fotos ersetzt. Uhrzeiten in den Fotos der Administration stehen in der Zeitzone des Browsers im
Container (UTC, also eine Stunde vor MEZ). Nach der Messung geändert: ein Wort im Hinweistext über dem Protokoll der
Administration („Kursrunden“ heißt dort jetzt wie überall „Live-Runden“); das Foto `admin-03-protokoll` zeigt noch das
alte Wort.

Die Bilder `medien/editor.png` (Rechenübung aus der Vorlage, Aufgabe gewählt, „Für Fortgeschrittene“ geschlossen,
Stand „Keine Änderungen“), `medien/vorlage.png`, `medien/teamspiel.png` und `medien/kursrunde-lehrende.png` (1280 px
breit, doppelte Pixeldichte) stammen aus demselben Lauf; das Bild der Live-Runde ist Byte für Byte gleich dem von 14:04
Uhr.

## 7. Nicht gemessen

- Echte Geräte, Safari und Firefox, langsame Mobilfunknetze.
- Nutzung durch Studierende und Lehrende: kein Usability-Test des Editors und der Vorlagen; ob Lehrende ohne
  Programmierkenntnisse ohne Hilfe zurechtkommen, ist nicht gemessen. Keine echten Teams oder Live-Runden (alle
  Personen in diesem Lauf sind simuliert), keine Lernwirksamkeit.
- Ob die Töne hörbar und angenehm sind; gemessen ist nur, dass der passende Ton ausgelöst wird.
- Live-Verbindungen hinter HTTPS und einem Reverse Proxy, über Stunden, mehr als 200 Personen in einer Live-Runde,
  mehrere Live-Runden gleichzeitig.
- Betrieb hinter HTTPS, Dauerbetrieb über Tage, Datensicherung.
- Die Fachinhalte (Beispielszenarien und Vorlagen) sind nicht von Fachlehrenden geprüft.
