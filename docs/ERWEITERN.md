# Eine neue Mechanik ergänzen

Beispiel: eine Mechanik `zuordnung` (Begriffe Kategorien zuordnen). Es sind drei Schritte; Engine und Server
bleiben unverändert.

1. **Bewertung** in `src/engine/mechaniken/zuordnung.js`:

   ```js
   export const zuordnung = {
     typ: 'zuordnung',
     pruefe(def, pfad) { return []; },               // Fehler im Szenario: [{ pfad, meldung }]
     loesung(def, werte) { return '…'; },            // Text, der nach dem letzten Fehlversuch erscheint
     bewerte(def, antwort, werte) {                  // { gueltig, richtig, rueckmeldung, typ? }
       return { gueltig: true, richtig: false, rueckmeldung: '…' };
     },
     ansicht(def, t, z) {                            // was die Oberfläche braucht, ohne Lösung; t() setzt Zahlen ein
       return { begriffe: def.begriffe.map(t), kategorien: def.kategorien.map(t) };
     },
   };
   ```

2. **Eintragen** in `src/engine/mechaniken/index.js` (eine Import-Zeile, ein Eintrag in `MECHANIKEN`).

3. **Darstellung** in `src/web/mechaniken/zuordnung.js` mit `zeige(knoten, sende)`, die ein Formular liefert und beim
   Absenden `sende(antwort)` aufruft; eintragen in `src/web/mechaniken/index.js`.

Dazu ein Test in `test/` und ein Absatz in `docs/INHALTE.md`. Die Offline-Fassung (OER-Export) übernimmt die neue
Mechanik automatisch, weil sie dieselben Module bündelt.

## Regeln

- Bewertung nur in der Engine, nie in der Darstellung: Die Darstellung kennt keine Lösung.
- Rückmeldungen auf Deutsch, konkret, ohne Schuldzuweisung; `typ` setzen, wenn eine Fehlerart ausgewertet werden soll.
- Bedienbar mit Tastatur und Touch, ohne Ziehen und Ablegen als einzigen Weg; Beschriftungen für Bildschirmleser.
