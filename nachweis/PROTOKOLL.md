# Messprotokoll

Gemessen am **02.11.2026, 22:58–23:00 Uhr (MEZ)**, Version 0.1.0. Alle Zahlen stammen aus diesem Lauf
(Rohdaten: [`messwerte.json`](messwerte.json)); nichts ist geschätzt. Was nicht gemessen wurde, steht am Ende.

**Umgebung:** Intel Core i7-11700B (8 Kerne, 16 Threads), 62 GB RAM, Ubuntu 24.04, Docker 29.1.3; Anwendung im
Container `node:24-alpine` (Node.js v24.22.2), ein Prozess; Browser Chrome 157.0.8103.27 headless
(`chromedp/headless-shell`), im selben Docker-Netz. Die Ladezeiten gelten daher für ein schnelles lokales Netz.

```bash
docker compose run --rm test
docker compose -p spielbaukasten-nachweis -f compose.nachweis.yaml up --build --abort-on-container-exit --exit-code-from messung
```

## 1. Automatische Tests

**32 von 32 bestanden** in 0,48 s (`node --test`).

| Bereich | Tests | was geprüft wird |
|---|---|---|
| Formelrechner | 7 | Rechenregeln, Grad/Bogenmaß, Logik, Ablehnung von allem, was kein Ausdruck ist (`constructor`, `process`, `alert(1)`, Zuweisung) |
| Szenario-Prüfung | 3 | beide Beispielszenarien fehlerfrei; sechs typische Autorenfehler mit Fundstelle; Endlosschleifen, unerreichbare Knoten |
| Spielablauf | 8 | Parameter reproduzierbar und vollständig; 300 Startwerte richtig durchgespielt = Erfolg mit 45/45 Punkten; Verzweigung nach dem Nachweis für 400 Startwerte gegen eine unabhängige Rechnung; Punktregeln (2. Versuch, Hinweis); Fehlerdiagnose; unmögliche Ereignisse; **die Ansicht enthält in keinem Schritt Lösung, Formel oder Folgeknoten** |
| Schnittstelle | 11 | Beitritt, Durchspielen, Manipulation (unmögliche Ereignisse, Doppelklick, fremde Versuche, eingeschleuste Punkte), Rollen, fremde Herkunft, Pfade außerhalb, Bremse gegen Durchprobieren, Lehrenden-Funktionen mit Mindestgruppe, Versionen, xAPI, OER, Auskunft und Löschung, Aufbewahrungsfrist, Vollständigkeit der OpenAPI-Beschreibung |
| OER-Export | 3 | eine Datei ohne Nachladen von außen; gebündeltes Skript gültig; Metadaten nach AMB |

## 2. Last

Virtuelle Studierende treten mit Kurscode bei, laden die Übersicht und spielen das Brückenszenario über die echte
Schnittstelle zu Ende; 30 % der Rechenaufgaben beantworten sie zuerst falsch. Gemessen ist jede einzelne Anfrage
(Beitritt, Übersicht, Start, jeder Spielschritt).

| Profil | Personen | Anfragen | Fehler | Dauer | Anfragen/s | Median | 95 % | 99 % | Maximum |
|---|---|---|---|---|---|---|---|---|---|
| Stoß: alle im selben Augenblick, ohne Pause | 50 | 550 | 0 | 0,4 s | 1.535 | 23,9 ms | 47,4 ms | 205,3 ms | 269,3 ms |
| Stoß: alle im selben Augenblick, ohne Pause | 200 | 2.173 | 0 | 1,0 s | 2.178 | 46,8 ms | 90,8 ms | 785,7 ms | 875,5 ms |
| Hörsaal: 1–5 s Denkzeit je Schritt | 300 | 3.275 | 0 | 39,1 s | 84 | 1,3 ms | 68,6 ms | 159,1 ms | 166,9 ms |

Alle 550 Personen haben das Szenario abgeschlossen. Der Stoß mit 200 Personen ist der ungünstigste Fall (200
Beitritte in derselben Millisekunde); auch dort blieben 95 % der Anfragen unter 0,1 s. Ein Hörsaal mit 300 Personen,
die zwischen den Schritten lesen und rechnen, ist für einen einzelnen Prozess unkritisch.

## 3. Im Browser

Das Brückenszenario wurde im echten Chrome über die Oberfläche durchgespielt, wie eine Person es tut: Zahlen aus dem
angezeigten Text lesen, rechnen, eintippen, Schritte mit „nach oben“ umsortieren, einmal absichtlich falsch antworten.

| | Desktop 1280 × 900 | Telefon 390 × 844 (Touch) |
|---|---|---|
| erstes Laden: Dateien / Größe | 11 / 41 KB | 11 / 41 KB |
| Dateien von anderen Servern | keine | keine |
| bedienbar nach (lokales Netz) | 44 ms | 44 ms |
| durchgespielt | Erfolg, 40/45 Punkte (ein Fehlversuch) | Erfolg, 40/45 Punkte |
| Übersicht danach | „1× abgeschlossen, bestes Ergebnis 89 %“ | dasselbe |

Die Auswertung für Lehrende zeigte danach 552 Personen (550 aus dem Lasttest, 2 aus dem Browsertest), je Aufgabe den
Anteil „im ersten Versuch richtig“ (70–71 %, passend zu den 30 % absichtlichen Fehlern) und die erkannten Fehlerarten
(Bild `lehrende-01-auswertung.png`).

## 4. Barrierefreiheit (automatisch)

axe-core 4.10.2, Regeln WCAG 2.0/2.1 A und AA sowie WCAG 2.2 AA, auf neun Zuständen: Anmeldung, Übersicht, Szene,
Rückmeldung, Reihenfolge-Aufgabe, Rechenaufgabe, Rechenaufgabe nach Fehlversuch, Ende, Auswertung für Lehrende.

**0 Verstöße in allen neun Zuständen** (je Zustand 20–29 bestandene Regeln).

Automatische Prüfungen finden nur einen Teil der Hürden. Nicht geprüft: Bedienung mit Bildschirmlesern (NVDA,
VoiceOver), reine Tastaturbedienung durch Menschen, Verständlichkeit.

## 5. Offline-Fassung (OER-Export)

Das Brückenszenario als OER-Export heruntergeladen (eine HTML-Datei, **76 KB** mit eingebetteten Bildern) und als
Datei (`file://`, ohne Server) im Browser auf Telefonbreite durchgespielt: **Erfolg**, **0 Netzanfragen** nach dem
Öffnen. Fußzeile: „„Riss an der Fußgängerbrücke“ von Panagiotis Herbe, Lizenz CC BY 4.0
(https://creativecommons.org/licenses/by/4.0/). Offline-Fassung, Fortschritt bleibt auf diesem Gerät.“

## 6. Bildschirmfotos

`bilder/`: 13 Zustände auf Desktop (`desktop-*`), 13 auf Telefonbreite (`telefon-*`), 3 der Lehrenden-Oberfläche
(`lehrende-*`), das Ende der Offline-Fassung (`offline-ende.png`). Der persönliche Code ist im Foto der Beitrittsseite
ersetzt. Die Bildschirmfotos stammen vom 02.11.2026; ihre Fußzeile nennt die damalige Lizenz Apache 2.0 (seit
04.11.2026 AGPL-3.0).

## 7. Nicht gemessen

- Echte Geräte, Safari und Firefox, langsame Mobilfunknetze.
- Nutzung durch Studierende und Lehrende: kein Usability-Test, keine Lernwirksamkeit (geplant: `docs/LERNDESIGN.md`).
- Betrieb hinter HTTPS und einem Reverse Proxy, Dauerbetrieb über Tage, Datensicherung.
- Die Fachinhalte sind nicht von Fachlehrenden geprüft.
