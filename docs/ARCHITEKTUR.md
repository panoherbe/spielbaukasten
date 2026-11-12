# Architektur

## Grundidee

Ein Lernspiel ist hier **ein Szenario aus Daten** (JSON): Knoten vom Typ Szene, Aufgabe, Verzweigung und Ende,
dazu Parameter, Indikatoren und Lernziele. Eine **Engine** spielt jedes Szenario nach denselben Regeln. Neue
Lernspiele brauchen daher keinen neuen Code, nur eine neue Datei; neue Spielmechaniken sind kleine Module, die sich
in ein Verzeichnis eintragen.

```
   ┌──────────────────────────────────── Browser ─────────────────────────────────────┐
   │  Studierende: app.js · spieler.js · gruppe.js (Team, Live-Runde) · ton.js           │
   │  Lehrende: lehrende.js · editor.js · kursrunde.js     Administration: admin.js     │
   └───────────┬──────────────────────────────▲───────────────────────▲───────────────┘
   Ereignis oder Stimme (Wahl, Antwort, Hinweis) │ Ansicht (aktueller Knoten) │ Live-Stand (Server-Sent Events)
   ┌───────────▼──────────────────────────────┴───────────────────────┴───────────────┐
   │  Server (app.js)  drei Rollen · Kurse · Szenario-Verwaltung und Editor · API       │
   │                   gruppen.js: gemeinsamer Ereignisstrom, Abstimmung, Live-Verteilung│
   │        │                                                                           │
   │  Engine: ablauf.js ─ mechaniken/ ─ ausdruck.js ─ zufall.js                         │
   │          szenario.js (Prüfung)  ansicht.js  xapi.js  oer.js                        │
   │        │                                                                           │
   │  SQLite: kurs · nutzer (Pseudonym, Rolle) · sitzung · szenario (Versionen)          │
   │          versuch · ereignis · gruppe · gruppe_mitglied · gruppe_ereignis · stimme   │
   │          zugang · einstellung · protokoll                                          │
   └────────────────────────────────────────────────────────────────────────────────────┘
```

## Komponenten

| Modul | Aufgabe | austauschbar durch |
|---|---|---|
| `engine/ausdruck.js` | Formeln, Bedingungen und Textbausteine sicher auswerten (eigener Parser, kein `eval`) | — |
| `engine/zufall.js` | Parameter je Versuch aus einem Startwert, reproduzierbar | — |
| `engine/mechaniken/*` | Bewertung und Ansicht je Mechanik (`zahl`, `auswahl`, `reihenfolge`) | neue Module, siehe ERWEITERN.md |
| `engine/szenario.js` | Szenario prüfen: Pflichtfelder, Verweise, Formeln, Erreichbarkeit, Endlosschleifen | — |
| `engine/ablauf.js` | Zustand aus Startwert + Ereignissen berechnen (`starte`, `wende`, `spiele`) | — |
| `engine/ansicht.js` | was die Oberfläche sieht: aktueller Knoten, Texte mit Zahlen, Kapitel mit Stand, keine Lösungen | — |
| `engine/wertung.js` | Sterne und Auszeichnungen aus dem Spielverlauf, gleich für Server und Offline-Fassung | weitere Regeln |
| `engine/xapi.js` | Ereignisse als xAPI-Statements | weitere Formate (z. B. cmi5) |
| `engine/oer.js`, `oer-export.js` | AMB-Metadaten, Offline-Fassung als eine HTML-Datei | — |
| `server/db.js` | Schema mit Versionsnummer und Übernahme älterer Datenbanken, Transaktionen, Aufbewahrungsfrist | PostgreSQL (nur diese Datei) |
| `server/inhalte.js` | Szenarien aus Dateien, Uploads und dem Editor, unveränderliche Versionen, Bilder je Szenario | z. B. Git-Repository als Quelle |
| `server/sicherheit.js` | Pseudonyme, Codes, Sitzungen, Bremse, Sicherheits-Kopfzeilen | SSO der Hochschule (SAML/OIDC) |
| `server/gruppen.js` | Teamspiel und Live-Runde: gemeinsamer Ereignisstrom je Gruppe, Abstimmung, Live-Stände (Server-Sent Events), Live-Ansicht mit Mindestgruppe | z. B. WebSockets, wenn Rückkanal nötig |
| `server/app.js` | HTTP-Schnittstelle (docs/openapi.json), Rollen, Zugänge, Protokoll, Vorschau, Auslieferung | — |
| `web/spieler.js` | zeigt eine Ansicht als Spielbühne (Spielanzeige, Kapitelkarte, Szenenbild, Figur, Rückmeldung, Ergebnis) und meldet Ereignisse an ein Backend (Server, Gruppe oder lokale Engine) | — |
| `web/editor.js` | Szenario-Editor: Ablauf und Formulare, Prüfung mit „Zur Stelle“, Vorschau, Speichern als neue Version | — |
| `web/gruppe.js`, `web/kursrunde.js` | Teamspiel und Live-Runde für Studierende; Live-Runde für Lehrende | — |
| `web/admin.js` | Administration: Zugänge, Aufbewahrungsfrist, Einstellungen, Protokoll | — |
| `web/ton.js` | kurze Töne mit der Web Audio API, Schalter in der Kopfzeile | — |
| `web/styles.css` | Gestaltung über Design-Tokens, helles und dunkles Schema, „Bewegung reduzieren“ | eigenes Erscheinungsbild über die Tokens |
| `web/mechaniken/*` | Darstellung je Mechanik | neue Module |

## Warum Ereignisse statt gespeichertem Zustand

Gespeichert werden nur Startwert und Ereignisse eines Versuchs; der Zustand wird bei Bedarf neu berechnet. Das hat
drei Folgen, die für den Einsatz in der Lehre zählen:

1. **Punkte sind nicht manipulierbar.** Der Browser schickt nur „Option X gewählt“ oder „Antwort 28,3“; was daraus
   folgt, rechnet der Server.
2. **Auswertungen lassen sich nachträglich ändern.** Eine neue Frage an die Daten („Wie viele haben zuerst den Sinus
   mit dem Kosinus verwechselt?“) beantwortet ein Nachrechnen der gespeicherten Ereignisse; xAPI-Statements entstehen
   genauso.
3. **Szenarien sind versioniert.** Jeder Versuch verweist auf die Version, mit der er begann; eine überarbeitete
   Datei bekommt eine neue Versionsnummer und ändert keinen laufenden Versuch.

## Gemeinsam spielen: ein Ereignisstrom je Gruppe

Ein **Team** (Studierende eines Kurses mit einem Team-Code) und eine **Live-Runde** (von Lehrenden gestartet, für einen
ganzen Kurs) sind beide eine *Gruppe*: ein Startwert, eine Szenario-Version und ein gemeinsamer Ereignisstrom
(`gruppe_ereignis`). Der Zustand entsteht wie beim Einzelspiel durch Nachrechnen mit derselben Engine; alle Mitglieder
sehen dieselbe Szene mit denselben Zahlen. Was eine Person tut, ist zunächst eine **Stimme** (`stimme`, je Person und
Schritt eine, änderbar). Ist die Abstimmung entschieden, wird die Stimme der Mehrheit als nächstes Ereignis angehängt;
Punkte und Rückmeldung gelten für die ganze Gruppe.

**Abstimmen im Team** (eine Regel, auch in der Oberfläche unter „So wird entschieden“):

1. Die Mehrheit der abgegebenen Stimmen entscheidet.
2. Bei Gleichstand gilt die Möglichkeit, für die zuerst gestimmt wurde.
3. Wann entschieden ist: im **Team**, sobald alle abgestimmt haben oder eine Möglichkeit mehr als die Hälfte der
   Stimmen des Teams hat; wer das Team gegründet hat, kann die Abstimmung vorher schließen (etwa wenn jemand fehlt).
   In der **Live-Runde** schließen die Lehrenden; vorher ist nur entschieden, wenn alle abgestimmt haben.
4. Antworten auf Aufgaben zählen als gleich, wenn die Engine sie gleich bewertet: „28,3“ und „28.28“ sind beide
   richtig, also eine Möglichkeit; falsche Antworten werden nach erkannter Fehlerart zusammengefasst.
5. Den Hinweis zu einer Aufgabe kann jede Person sofort abrufen; er gilt für alle und kostet die Gruppe Punkte.

Grenze dieser Regel: Fehlt die Person, die das Team gegründet hat, und steht es unentschieden, wartet das Team, bis
alle abgestimmt haben. Wer zu spät abstimmt, bekommt den neuen Stand und die Meldung „Inzwischen wurde schon
entschieden“.

**Live:** Jede Stimme und jede Entscheidung geht als neuer Stand über Server-Sent Events (`text/event-stream`, im
Browser `EventSource`, keine Bibliothek) an alle Mitglieder und, in der Live-Runde, an die Lehrenden. Stimmen, die
innerhalb von 100 ms eingehen, gehen als ein Stand hinaus; eine Entscheidung sofort. Bricht die Verbindung ab,
verbindet der Browser sich nach 3 s neu und bekommt den aktuellen Stand.

**Was wer sieht:** Teammitglieder sehen, wie viele abgestimmt haben, die Verteilung je Möglichkeit und bei
Rechenaufgaben die eingegebenen Zahlen, ohne Namen. In der Live-Runde sehen Studierende nur, wie viele abgestimmt
haben; Lehrende sehen die Verteilung je Schritt erst ab der Mindestgruppe (drei Stimmen), darunter auch die
Entscheidung nicht.

Das Einzelspiel ist davon unberührt: eigene Tabellen, eigene Schnittstellen, dieselbe Engine.

## Rollen

| Rolle | Anmeldung | darf |
|---|---|---|
| Studierende | Kurscode, zufälliges Pseudonym | spielen (allein, im Team, in der Live-Runde), eigene Daten herunterladen und löschen |
| Lehrende | Schlüssel eines Zugangs (gemeinsamer Schlüssel der Instanz oder persönlicher Zugang) | Kurse, Szenarien, Editor, Live-Runde, Auswertung, Exporte |
| Administration | eigener Schlüssel (`SBK_ADMIN_SCHLUESSEL`) | Zugänge anlegen, sperren, entsperren; Aufbewahrungsfrist; Einstellungen ansehen; Protokoll lesen |

Jede Schnittstelle gehört genau einer Rolle (oder allen Angemeldeten); die Administration sieht keine Spielstände und
erreicht die Schnittstellen der Lehrenden nicht, Lehrende nicht die der Administration (getestet). Ein gesperrter
Zugang ist sofort abgemeldet. Das **Protokoll** hält fest, wer in der Verwaltung was getan hat (Anmeldungen, Zugänge,
Kurse, Freigaben, gespeicherte Szenarien, Live-Runden, Exporte), nie Spielschritte von Studierenden.

## Editor und Vorschau

Der Editor bearbeitet dasselbe JSON, das auch als Datei hochgeladen werden kann, und speichert es über
`POST /api/lehrende/szenarien/{id}/versionen` als nächste Version; die Prüfung ist dieselbe wie beim Hochladen. Der
Editor schickt mit, welche Version er geöffnet hatte: Hat inzwischen jemand anderes gespeichert, wird nichts
überschrieben (409). Die **Vorschau** ist die Offline-Fassung des OER-Exports, erzeugt aus dem Entwurf und nur im
Speicher (zwei Stunden). Sie hat Stil und Skript in der Seite; die Content-Security-Policy erlaubt genau diese beiden
über ihre SHA-256-Prüfsummen, nicht `unsafe-inline`.

## Erweiterungspunkte für spätere Integrationen

| Punkt | Stand im Prototyp | nächster Schritt |
|---|---|---|
| Schnittstelle | REST/JSON, beschrieben in `docs/openapi.json`, Test prüft Vollständigkeit | — |
| Lernstand an Lernplattform / LRS | xAPI-Statements je Versuch (`/api/lehrende/xapi`) | Statements direkt an einen LRS senden |
| Moodle | — (nicht Teil dieses Prototyps) | LTI 1.3 Launch + Assignment and Grade Services |
| Anmeldung | Kurscode/Pseudonym, Schlüssel für Lehrende | SAML/OIDC der Hochschule in `sicherheit.js` |
| Inhalte | Szenario-Editor im Browser, JSON-Dateien und Upload | Bilder im Editor hochladen (mit Lizenzangabe), mehrere Personen gleichzeitig an einem Szenario |
| Gemeinsam spielen | Teamspiel und Live-Runde mit Server-Sent Events | Rollen im Team (z. B. Statik, Kosten), Chat oder Videokonferenz einbinden |
| Rollen | Studierende, Lehrende (Zugänge), Administration | Kurse je Zugang, Rechte je Kurs, Anmeldung über SSO |
| OER | HTML-Datei + AMB-Metadaten | Veröffentlichung in einem OER-Repositorium |
| Mechaniken | drei | z. B. Zuordnung, Lückentext, Diagramm ablesen, Simulation mit Schiebereglern |

## Qualität

- 62 automatische Tests (`node --test`): Formelrechner, Prüfung von Szenarien, Ablauf über hunderte Startwerte,
  Schnittstelle mit drei Rollen, Manipulationsversuchen, Datenschutzfunktionen, OER-Export, Sterne und
  Auszeichnungen, Kapitelkarte, Bilder mit Alternativtext, Kopfzeilen und Kompression der Auslieferung; Editor
  (Speichern als neue Version, Konflikt, Vorschau), Teamspiel (Mehrheit, Gleichstand, Schließen, Live-Stände),
  Live-Runde (Summen erst ab drei Stimmen), Administration (Sperren, Aufbewahrungsfrist, Protokoll), Übernahme einer
  Datenbank von Version 0.1.
- Lasttest (allein, 50 Teams, Live-Runde mit 200 simulierten Studierenden) und Browsertest mit Chrome über das
  DevTools-Protokoll, Barrierefreiheitsprüfung mit axe-core (`compose.nachweis.yaml`, Ergebnisse in `nachweis/`).
- Keine Laufzeitabhängigkeiten: nichts zu aktualisieren außer Node.js selbst.
