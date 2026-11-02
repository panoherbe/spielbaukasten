# Szenarien schreiben

Ein Szenario ist ein Ordner unter `inhalte/szenarien/<id>/` mit einer Datei `szenario.json` und optional Bildern
(SVG, PNG, JPG, WebP). Vorlage: [`fussgaengerbruecke/szenario.json`](../inhalte/szenarien/fussgaengerbruecke/szenario.json).
Prüfen: `node tools/pruefe.js inhalte/szenarien/<id>/szenario.json` oder unter `/lehrende` → Szenarien → „Nur prüfen“.

## Kopf

| Feld | Pflicht | Bedeutung |
|---|---|---|
| `id` | ja | Kleinbuchstaben, Ziffern, Bindestrich; gleich dem Ordnernamen |
| `version` | ja | ganze Zahl; bei jeder inhaltlichen Änderung erhöhen |
| `titel`, `kurzbeschreibung` | ja | erscheinen in der Übersicht |
| `lizenz` | ja | `CC-BY-4.0`, `CC-BY-SA-4.0` oder `CC0-1.0` |
| `urheber` | ja | Liste der Namen für die Namensnennung |
| `lernziele` | ja | `[{ "id": "LZ1", "text": "…" }]`; Aufgaben und Entscheidungen verweisen darauf |
| `fach`, `zielgruppe`, `dauer_minuten`, `schlagworte`, `sprache` | nein | für Übersicht und OER-Metadaten |
| `indikatoren` | nein | `[{ "id", "name", "start", "min", "max", "einheit" }]`, z. B. Sicherheit, Budget |
| `parameter` | nein | Zahlen je Person: `{ "F": { "min": 30, "max": 60, "schritt": 5 } }` oder `{ "werte": [30, 45, 60] }` |
| `start` | ja | id des ersten Knotens |
| `knoten` | ja | Objekt aus id → Knoten |

## Knoten

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

## Formeln und Textbausteine

Formeln kennen `+ - * / ^ %`, Klammern, Vergleiche (`< <= > >= == !=`), `&&`, `||`, `!`, die Konstanten `pi` und
`e` und die Funktionen `sin cos tan` (Bogenmaß), `sind cosd tand` (Grad), `asin acos atan sqrt abs ln log10 exp min
max runde(x, n)`. Namen sind Parameter und Indikatoren. Alles andere lehnt die Prüfung ab.

In Texten: `{F}` setzt einen Wert ein, `{= F / 2 : 1}` eine gerechnete Zahl mit einer Nachkommastelle. `**fett**`
und Leerzeilen für Absätze; HTML wird nicht ausgewertet.

## Was die Prüfung meldet

Fehlende Pflichtfelder, unbekannte Ziele, Indikatoren und Parameter, unlesbare Formeln, Mechaniken ohne richtige
Antwort, nicht offene Lizenzen, Knoten ohne Weg zum Ende (Endlosschleife), kein erreichbares Ende; als Hinweis:
unerreichbare Knoten und Szenen, in denen alle Optionen Bedingungen haben.

## Typische Fehler gezielt zurückmelden

Für Rechenaufgaben lohnt sich das Feld `typische_fehler`: Jede Formel beschreibt einen bekannten Irrweg; trifft die
Antwort ihn, bekommt die Person die passende Rückmeldung statt „falsch“. Vorzeichenfehler und Faktor 1000 erkennt die
Mechanik selbst. Die Auswertung für Lehrende zählt, wie oft welcher Fehler vorkam.
