# Eine neue Mechanik ergänzen

Beispiel: eine Mechanik `zuordnung` (Begriffe Kategorien zuordnen). Es sind drei Schritte, ein vierter für den
Editor; Engine und Server bleiben unverändert.

1. **Bewertung** in `src/engine/mechaniken/zuordnung.js`:

   ```js
   export const zuordnung = {
     typ: 'zuordnung',
     pruefe(def, pfad, { bekannteNamen }) { return []; },  // Fehler im Szenario: [{ pfad, meldung }]
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

4. **Editor (optional):** in `src/web/editor.js` die Mechanik in die Liste `MECHANIKEN` eintragen, in
   `mechanikWechsel` ihre Vorgabefelder setzen und in `formAufgabe` ihre Felder als Formular ergänzen (Bausteine
   `feld()` und `liste()`, jedes Feld mit `pfad`, damit „Zur Stelle“ die Meldungen der Prüfung findet). Ohne diesen
   Schritt lässt sich die Mechanik über „JSON ansehen und bearbeiten“ oder per Datei verwenden.

Dazu ein Test in `test/` und ein Absatz in `docs/INHALTE.md`. Die Offline-Fassung (OER-Export) und die Vorschau im
Editor übernehmen die neue Mechanik automatisch, weil sie dieselben Module bündeln. Im **Teamspiel** und in der
**Live-Runde** funktioniert sie ohne weitere Arbeit: Stimmen werden nach der Bewertung der Engine gruppiert (`richtig`
oder Fehlerart `typ`); wer im Team die Antworten der anderen lesbar sehen soll, ergänzt eine Zeile in
`gemeinsam()` in `src/server/gruppen.js` (heute für Rechenaufgaben).

## Regeln

- Bewertung nur in der Engine, nie in der Darstellung: Die Darstellung kennt keine Lösung.
- Rückmeldungen auf Deutsch, konkret, ohne Schuldzuweisung; `typ` setzen, wenn eine Fehlerart ausgewertet werden soll.
- Bedienbar mit Tastatur und Touch, ohne Ziehen und Ablegen als einzigen Weg; Beschriftungen für Bildschirmleser.
- Töne nur über `spieleTon()` aus `src/web/ton.js`, und nie als einziges Signal: Jede Rückmeldung steht auch als Text
  und Zeichen da.

## Weitere Erweiterungen

- **Neuer Ton:** in `src/web/ton.js` einen Eintrag in `KLAENGE` (Frequenzen, Beginn, Dauer); erzeugt wird er mit der
  Web Audio API, Dateien braucht es nicht.
- **Neue Aktion im Protokoll der Verwaltung:** in der Route `protokolliere(nutzer, 'Aktion', 'woran')` aufrufen; nie
  Daten von Studierenden.
- **Neue Route:** in `src/server/app.js` mit `route(methode, muster, rolle, fn)` und in `docs/openapi.json`
  beschreiben; ein Test prüft, dass jede Route beschrieben ist.
