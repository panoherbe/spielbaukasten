# Szenarien schreiben

Lehrende bearbeiten Szenarien im **Szenario-Editor** im Browser (`/lehrende` → Szenarien → Bearbeiten); der Weg bis
zum Kurs, mit Bildern: [Anleitung für Lehrende](ANLEITUNG-LEHRENDE.md). Diese Seite beschreibt die Datei dahinter, für
den fortgeschrittenen Weg (Datei hochladen, „JSON ansehen und bearbeiten“) und für Ihre IT.

Ein Szenario ist ein Ordner unter `inhalte/szenarien/<id>/` mit einer Datei `szenario.json` und optional Bildern
(SVG, PNG, JPG, WebP). Vorlage: [`fussgaengerbruecke/szenario.json`](../inhalte/szenarien/fussgaengerbruecke/szenario.json).
Prüfen: im Editor „Prüfen“, unter `/lehrende` → Szenarien → „Nur prüfen“ oder `node tools/pruefe.js inhalte/szenarien/<id>/szenario.json`.

## Kopf

| Feld | Pflicht | Bedeutung |
|---|---|---|
| `id` | ja | Kleinbuchstaben, Ziffern, Bindestrich; gleich dem Ordnernamen |
| `version` | ja | ganze Zahl; bei jeder inhaltlichen Änderung erhöhen (der Editor zählt selbst hoch) |
| `titel`, `kurzbeschreibung` | ja | erscheinen in der Übersicht |
| `lizenz` | ja | `CC-BY-4.0`, `CC-BY-SA-4.0` oder `CC0-1.0` |
| `urheber` | ja | Liste der Namen für die Namensnennung |
| `lernziele` | ja | `[{ "id": "LZ1", "text": "…" }]`; Aufgaben und Entscheidungen verweisen darauf |
| `fach`, `zielgruppe`, `dauer_minuten`, `schlagworte`, `sprache` | nein | für Übersicht und OER-Metadaten |
| `indikatoren` | nein | `[{ "id", "name", "start", "min", "max", "einheit", "symbol" }]`, z. B. Sicherheit, Budget; `symbol` ist eines von `sicherheit`, `budget`, `tage` |
| `titelbild` | nein | `{ "datei": "medien/titel.svg", "alt": "…" }`, Bild der Spielkarte in der Übersicht (16:9) |
| `figur` | nein | Spielfigur mit Sprechblase: `{ "name": "Bauleitung", "bild": {…}, "zufrieden": {…}, "besorgt": {…} }`; die beiden Stimmungen erscheinen bei guter und riskanter Rückmeldung |
| `kapitel` | nein | Fortschrittskarte: `[{ "titel": "Lage", "knoten": ["meldung"] }]`; jeder sichtbare Knoten gehört in ein Kapitel. Die Oberfläche sieht nur Titel und Stand, nie die Knoten |
| `parameter` | nein | Zahlen je Person: `{ "F": { "min": 30, "max": 60, "schritt": 5 } }` oder `{ "werte": [30, 45, 60] }` |
| `start` | ja | id des ersten Knotens |
| `knoten` | ja | Objekt aus id → Knoten |

## Knoten

**Für alle sichtbaren Knoten**: optional `bild` (`{ "datei", "alt" }`, am besten 2:1, z. B. 960 × 480; `"skizze": true`
für Blaupausen und Diagramme, deren Überschrift dann nicht auf dem Bild steht) und `sprechblase` (was die Figur sagt,
mit Textbausteinen).

**`szene`**: Text, optional Bild, und Optionen. Jede Option hat `id`, `text`, `ziel`, optional `effekte`
(`{ "sicherheit": 20 }`), `bedingung` (nur anzeigen, wenn wahr), `rueckmeldung`, `bewertung` (`gut`, `neutral`,
`schlecht`) und `lernziel`.

**`aufgabe`**: `mechanik`, `frage`, `weiter`, `punkte` (10), `versuche` (2), optional `hinweis` (kostet 30 % der
Punkte), `erklaerung` (Rechenweg nach dem Lösen), `lernziel`, `effekte_richtig`, `effekte_falsch`,
`rueckmeldung: { richtig, falsch }`. Je Mechanik:

| Mechanik | Felder |
|---|---|
| `zahl` | `loesung` (Formel), `einheit`, `toleranz_prozent` (1), `toleranz_absolut`, `stellen` (2), `typische_fehler: [{ formel, rueckmeldung }]` |
| `auswahl` | `optionen: [{ id, text, richtig, rueckmeldung }]`, `mehrfach` |
| `reihenfolge` | `elemente: [{ id, text }]` in der richtigen Reihenfolge; angezeigt werden sie gemischt |

**`verzweigung`**: ohne Anzeige; `regeln: [{ "wenn": "sicherheit >= 90", "ziel": "…" }]`, `sonst`.

**`ende`**: `ergebnis` (`erfolg`, `teilerfolg`, `misserfolg`), `titel`, `text`.

## Sterne und Auszeichnungen

Brauchen keine Angaben im Szenario; die Engine berechnet sie aus dem Spielverlauf (`src/engine/wertung.js`).
**Sterne** 0 bis 3: Der Ausgang zählt (Erfolg 2, Teilerfolg 1, Misserfolg 0), ab 80 % der Punkte kommt einer dazu.
**Auszeichnungen**: „Ziel erreicht“ (Erfolg), „Fehlerfrei“ (jede Aufgabe im ersten Versuch), „Ohne Hinweis“,
„Umsichtig“ (jede bewertete Entscheidung gut), „Alle Lernziele sicher“. Eine Auszeichnung, die im Szenario nicht
möglich ist (etwa „Umsichtig“ ohne bewertete Entscheidungen), entfällt.

## Bilder

SVG, PNG, JPG oder WebP im Ordner des Szenarios. SVG-Dateien dürfen `<style>` enthalten, aber kein Skript und keine
Verweise nach außen; der Server liefert sie mit einer eigenen, strengen Content-Security-Policy aus. Der
Alternativtext steht im Feld `alt`; bei den mitgelieferten Grafiken ist er derselbe wie der `<title>` der Datei.

## Formeln und Textbausteine

Formeln kennen `+ - * / ^ %`, Klammern, Vergleiche (`< <= > >= == !=`), `&&`, `||`, `!`, die Konstanten `pi` und
`e` und die Funktionen `sin cos tan` (Bogenmaß), `sind cosd tand` (Grad), `asin acos atan sqrt abs ln log10 exp min
max runde(x, n)`. Namen sind Parameter und Indikatoren. Alles andere lehnt die Prüfung ab.

In Texten: `{F}` setzt einen Wert ein, `{= F / 2 : 1}` eine gerechnete Zahl mit einer Nachkommastelle. `**fett**`
und Leerzeilen für Absätze; HTML wird nicht ausgewertet.

## Was die Prüfung meldet

Fehlende Pflichtfelder, unbekannte Ziele, Indikatoren und Parameter, unlesbare Formeln, Mechaniken ohne richtige
Antwort, nicht offene Lizenzen, Knoten ohne Weg zum Ende (Endlosschleife), kein erreichbares Ende; als Hinweis:
unerreichbare Knoten, Szenen, in denen alle Optionen Bedingungen haben, und Knoten in keinem Kapitel. Bilder ohne
`datei`, Figuren ohne Namen und unbekannte Symbole sind Fehler.

## Typische Fehler gezielt zurückmelden

Für Rechenaufgaben lohnt sich das Feld `typische_fehler`: Jede Formel beschreibt einen bekannten Irrweg; trifft die
Antwort ihn, bekommt die Person die passende Rückmeldung statt „falsch“. Vorzeichenfehler und Faktor 1000 erkennt die
Mechanik selbst. Die Auswertung für Lehrende zählt, wie oft welcher Fehler vorkam.
