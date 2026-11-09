# Architektur

## Grundidee

Ein Lernspiel ist hier **ein Szenario aus Daten** (JSON): Knoten vom Typ Szene, Aufgabe, Verzweigung und Ende,
dazu Parameter, Indikatoren und Lernziele. Eine **Engine** spielt jedes Szenario nach denselben Regeln. Neue
Lernspiele brauchen daher keinen neuen Code, nur eine neue Datei; neue Spielmechaniken sind kleine Module, die sich
in ein Verzeichnis eintragen.

```
            ┌───────────────────────────── Browser ─────────────────────────────┐
            │  app.js / lehrende.js   Spieler (spieler.js)   Mechanik-Darstellung │
            └──────────────┬────────────────────────▲───────────────────────────┘
                 Ereignis (Wahl, Antwort, Hinweis)  │ Ansicht (nur aktueller Knoten)
            ┌──────────────▼────────────────────────┴───────────────────────────┐
            │  Server (app.js)  Anmeldung · Kurse · Szenario-Verwaltung · API    │
            │        │                                                           │
            │  Engine: ablauf.js ─ mechaniken/ ─ ausdruck.js ─ zufall.js         │
            │          szenario.js (Prüfung)  ansicht.js  xapi.js  oer.js        │
            │        │                                                           │
            │  SQLite: kurs · nutzer (Pseudonym) · sitzung · szenario (Versionen)│
            │          versuch · ereignis                                        │
            └────────────────────────────────────────────────────────────────────┘
```

## Komponenten

| Modul | Aufgabe | austauschbar durch |
|---|---|---|
| `engine/ausdruck.js` | Formeln, Bedingungen und Textbausteine sicher auswerten (eigener Parser, kein `eval`) | — |
| `engine/zufall.js` | Parameter je Versuch aus einem Startwert, reproduzierbar | — |
| `engine/mechaniken/*` | Bewertung je Mechanik (`zahl`, `auswahl`, `reihenfolge`) | neue Module, siehe ERWEITERN.md |
| `engine/szenario.js` | Szenario prüfen: Pflichtfelder, Verweise, Formeln, Erreichbarkeit, Endlosschleifen | — |
| `engine/ablauf.js` | Zustand aus Startwert + Ereignissen berechnen (`starte`, `wende`, `spiele`) | — |
| `engine/ansicht.js` | was die Oberfläche sieht: aktueller Knoten, Texte mit Zahlen, Kapitel mit Stand, keine Lösungen | — |
| `engine/wertung.js` | Sterne und Auszeichnungen aus dem Spielverlauf, gleich für Server und Offline-Fassung | weitere Regeln |
| `engine/xapi.js` | Ereignisse als xAPI-Statements | weitere Formate (z. B. cmi5) |
| `engine/oer.js`, `oer-export.js` | AMB-Metadaten, Offline-Fassung als eine HTML-Datei | — |
| `server/db.js` | Schema mit Versionsnummer, Transaktionen, Aufbewahrungsfrist | PostgreSQL (nur diese Datei) |
| `server/inhalte.js` | Szenarien aus Dateien und Uploads, unveränderliche Versionen | z. B. Git-Repository als Quelle |
| `server/sicherheit.js` | Pseudonyme, Codes, Sitzungen, Bremse, Sicherheits-Kopfzeilen | SSO der Hochschule (SAML/OIDC) |
| `server/app.js` | HTTP-Schnittstelle (docs/openapi.json) und Auslieferung | — |
| `web/spieler.js` | zeigt eine Ansicht als Spielbühne (Spielanzeige, Kapitelkarte, Szenenbild, Figur, Rückmeldung, Ergebnis) und meldet Ereignisse an ein Backend (Server oder lokale Engine) | — |
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

## Erweiterungspunkte für spätere Integrationen

| Punkt | Stand im Prototyp | nächster Schritt |
|---|---|---|
| Schnittstelle | REST/JSON, beschrieben in `docs/openapi.json`, Test prüft Vollständigkeit | — |
| Lernstand an Lernplattform / LRS | xAPI-Statements je Versuch (`/api/lehrende/xapi`) | Statements direkt an einen LRS senden |
| Moodle | — (nicht Teil dieses Prototyps) | LTI 1.3 Launch + Assignment and Grade Services |
| Anmeldung | Kurscode/Pseudonym, Schlüssel für Lehrende | SAML/OIDC der Hochschule in `sicherheit.js` |
| Inhalte | JSON-Dateien und Upload | grafischer Editor, der dieselbe Datei schreibt |
| OER | HTML-Datei + AMB-Metadaten | Veröffentlichung in einem OER-Repositorium |
| Mechaniken | drei | z. B. Zuordnung, Lückentext, Diagramm ablesen, Simulation mit Schiebereglern |

## Qualität

- 42 automatische Tests (`node --test`): Formelrechner, Prüfung von Szenarien, Ablauf über hunderte Startwerte,
  Schnittstelle mit Rollen, Manipulationsversuchen, Datenschutzfunktionen, OER-Export, Sterne und Auszeichnungen,
  Kapitelkarte, Bilder mit Alternativtext, Kopfzeilen und Kompression der Auslieferung.
- Lasttest und Browsertest mit Chrome über das DevTools-Protokoll, Barrierefreiheitsprüfung mit axe-core
  (`compose.nachweis.yaml`, Ergebnisse in `nachweis/`).
- Keine Laufzeitabhängigkeiten: nichts zu aktualisieren außer Node.js selbst.
