// Vorlagen für neue Szenarien, interne Kennungen aus Titeln und Prüfmeldungen im Klartext (Editor für Lehrende).

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { starteApp, studierende, lehrende } from './hilfe/app.js';
import { pruefeSzenario } from '../src/engine/szenario.js';
import { starte, wende } from '../src/engine/ablauf.js';
import { berechne } from '../src/engine/ausdruck.js';
import { VORLAGEN, ausVorlage } from '../src/web/vorlagen.js';
import { kennung, klartext } from '../src/web/klartext.js';

const lade = (id) => JSON.parse(readFileSync(new URL(`../inhalte/szenarien/${id}/szenario.json`, import.meta.url), 'utf8'));
const ANGABEN = { titel: '', urheber: 'Lehrstuhl Test' };

let t;
before(async () => { t = await starteApp(); });
after(async () => { await t.stop(); });

/** Richtige Antwort aus dem Szenario selbst (die Engine kennt die Lösung, die Ansicht nicht). */
function richtig(s, z) {
  const k = s.knoten[z.knoten];
  if (k.mechanik === 'zahl') return String(berechne(k.loesung, { ...z.parameter, ...z.indikatoren }));
  if (k.mechanik === 'auswahl') return k.optionen.filter((o) => o.richtig).map((o) => o.id);
  return k.elemente.map((x) => x.id);
}

test('Vorlagen: drei zur Wahl, jede besteht „Prüfen“ sofort, ohne Fehler und ohne Hinweise', () => {
  assert.deepEqual(VORLAGEN.map((v) => v.name), ['Entscheidungsspiel', 'Rechenübung', 'Quiz']);
  for (const v of VORLAGEN) {
    const s = ausVorlage(v.art, ANGABEN);
    assert.equal(s.titel, v.titel, 'ohne eigenen Titel gilt der Beispieltitel');
    assert.deepEqual(s.urheber, ['Lehrstuhl Test']);
    assert.deepEqual(pruefeSzenario(s), { fehler: [], warnungen: [] }, v.name);
  }
  const e = ausVorlage('entscheidung', ANGABEN);
  const szene = e.knoten[e.start];
  assert.equal(szene.typ, 'szene');
  assert.equal(szene.optionen.length, 2, 'Entscheidungsspiel: zwei Möglichkeiten');
  assert.ok(szene.optionen.every((o) => o.rueckmeldung && o.bewertung && o.effekte), 'jede mit Rückmeldung, Bewertung und Wirkung');
  const r = ausVorlage('rechnen', ANGABEN).knoten['spannung-im-zugstab'];
  assert.equal(r.mechanik, 'zahl');
  assert.equal(r.einheit, 'N/mm²');
  assert.equal(r.toleranz_prozent, 1);
  assert.equal(r.typische_fehler.length, 1);
  const q = Object.values(ausVorlage('quiz', ANGABEN).knoten).filter((k) => k.typ === 'aufgabe');
  assert.ok(q.length >= 1 && q.every((k) => k.mechanik === 'auswahl' && k.optionen.every((o) => o.rueckmeldung)), 'Quiz: Auswahl mit Rückmeldung je Antwort');
  assert.throws(() => ausVorlage('gibtsnicht', ANGABEN), /gibt es nicht/);
});

test('Vorlagen: jeder Weg führt zu einem Ende, auch mit falschen ersten Antworten und typischem Fehler', () => {
  for (const v of VORLAGEN) {
    const s = ausVorlage(v.art, ANGABEN);
    for (let seed = 1; seed <= 40; seed++) {
      // alle Wege durch die Szenen (Tiefensuche), Aufgaben einmal falsch, dann richtig
      const offen = [starte(s, seed)];
      let enden = 0;
      while (offen.length) {
        let z = offen.pop();
        for (let schritt = 0; !z.beendet && schritt < 20; schritt++) {
          const k = s.knoten[z.knoten];
          if (k.typ === 'szene') {
            for (const o of k.optionen.slice(1)) offen.push(wende(s, z, { typ: 'wahl', knoten: z.knoten, option: o.id }));
            z = wende(s, z, { typ: 'wahl', knoten: z.knoten, option: k.optionen[0].id });
          } else {
            const falsch = k.mechanik === 'zahl' ? '0,001' : k.mechanik === 'auswahl' ? k.optionen.find((o) => !o.richtig).id : [...k.elemente.map((x) => x.id)].reverse();
            z = wende(s, z, { typ: 'antwort', knoten: z.knoten, antwort: falsch });
            assert.equal(z.rueckmeldung.art, 'falsch', `${v.name}: zweiter Versuch`);
            z = wende(s, z, { typ: 'antwort', knoten: z.knoten, antwort: richtig(s, z) });
            assert.equal(z.rueckmeldung.art, 'richtig', `${v.name}: ${k.titel}`);
          }
        }
        assert.ok(z.beendet, `${v.name}: Ende erreicht`);
        enden++;
      }
      assert.equal(enden, v.art === 'entscheidung' ? 2 : 1);
    }
  }
  // Rechenübung: Der typische Fehler (Kraft nicht in N umgerechnet) wird erkannt und erklärt
  const s = ausVorlage('rechnen', ANGABEN);
  const z = starte(s, 7);
  const f = wende(s, z, { typ: 'antwort', knoten: z.knoten, antwort: String(z.parameter.F / z.parameter.A).replace('.', ',') });
  assert.equal(f.rueckmeldung.typ, 'typisch-1');
  assert.match(f.rueckmeldung.text, /1 kN = 1000 N/);
  // Entscheidungsspiel: die Folgen sind sichtbar (Sicherheit, Bewertung, unterschiedliches Ende)
  const e = ausVorlage('entscheidung', ANGABEN);
  const a = starte(e, 1);
  const gut = wende(e, a, { typ: 'wahl', knoten: a.knoten, option: 'a' });
  const schlecht = wende(e, a, { typ: 'wahl', knoten: a.knoten, option: 'b' });
  assert.deepEqual([gut.indikatoren.sicherheit, gut.rueckmeldung.art, gut.ergebnis], [90, 'gut', 'erfolg']);
  assert.deepEqual([schlecht.indikatoren.sicherheit, schlecht.rueckmeldung.art, schlecht.ergebnis], [10, 'schlecht', 'misserfolg']);
});

test('Vorlagen über die Schnittstelle: speichern, Vorschau, freigeben, von Studierenden bis zum Ende gespielt', async () => {
  const l = await lehrende(t.basis);
  const kurs = (await l('GET', '/api/lehrende/kurse')).json.find((k) => k.name === 'Demokurs');
  const ids = [];
  for (const v of VORLAGEN) {
    const vorhanden = (await l('GET', '/api/lehrende/szenarien')).json.map((x) => x.id);
    const s = ausVorlage(v.art, { titel: `${v.titel} (Test)`, urheber: 'Lehrstuhl Test', vorhanden });
    assert.equal((await l('POST', '/api/lehrende/szenarien/pruefen', s)).json.fehler.length, 0);
    const vorschau = await l('POST', '/api/lehrende/vorschau', { szenario: s });
    assert.equal(vorschau.status, 201, vorschau.text);
    assert.equal((await l('GET', vorschau.json.adresse)).status, 200);
    const r = await l('POST', `/api/lehrende/szenarien/${s.id}/versionen`, { szenario: s, basis: 0 });
    assert.equal(r.status, 201, r.text);
    ids.push([s.id, s]);
  }
  assert.equal((await l('PUT', `/api/lehrende/kurse/${kurs.id}/szenarien`, { szenarien: [...kurs.szenarien, ...ids.map(([id]) => id)] })).status, 200);
  const st = await studierende(t.basis);
  for (const [id, s] of ids) {
    let a = (await st('POST', '/api/versuche', { szenario: id })).json;
    for (let n = 0; !a.beendet && n < 10; n++) {
      const k = a.knoten;
      let ereignis;
      if (k.typ === 'szene') ereignis = { typ: 'wahl', knoten: k.id, option: k.optionen[0].id };
      else if (k.mechanik === 'auswahl') ereignis = { typ: 'antwort', knoten: k.id, antwort: s.knoten[k.id].optionen.filter((o) => o.richtig).map((o) => o.id) };
      else {
        // Zahlen aus dem angezeigten Text, wie eine Person sie liest
        const zahl = (re) => Number(re.exec(k.frage)[1].replace(',', '.'));
        ereignis = { typ: 'antwort', knoten: k.id, antwort: String((zahl(/F = ([\d,]+) kN/) * 1000) / zahl(/A = ([\d,]+) mm²/)).replace('.', ',') };
      }
      const r = await st('POST', `/api/versuche/${a.versuch}/ereignisse`, { nr: a.nr, ereignis });
      assert.equal(r.status, 200, r.text);
      a = r.json;
    }
    assert.equal(a.beendet, true, id);
    assert.equal(a.ergebnis, 'erfolg', id);
  }
});

test('Interne Kennung: entsteht aus dem Titel, nur a–z, 0–9 und Bindestrich, eindeutig', () => {
  assert.equal(kennung('Übung: Spannung im Zugstab'), 'uebung-spannung-im-zugstab');
  assert.equal(kennung('Größe & Maß – Teil 2'), 'groesse-mass-teil-2');
  assert.equal(kennung('Crème brûlée'), 'creme-brulee');
  assert.equal(kennung('Frage 1', ['frage-1']), 'frage-1-2');
  assert.equal(kennung('Frage 1', ['frage-1', 'frage-1-2']), 'frage-1-3');
  assert.equal(kennung('!?', [], 'aufgabe'), 'aufgabe');
  assert.equal(kennung('', ['schritt']), 'schritt-2');
  const lang = kennung('Ein sehr langer Titel für eine Aufgabe, die eigentlich kürzer heißen sollte');
  assert.ok(lang.length <= 40 && !lang.endsWith('-'), lang);
  // In den Vorlagen heißt jeder Schritt intern wie sein Titel; die Kennung des Szenarios passt zur Prüfung
  for (const v of VORLAGEN) {
    const s = ausVorlage(v.art, { ...ANGABEN, titel: 'Mein Spiel: Übung 1', vorhanden: ['mein-spiel-uebung-1'] });
    assert.equal(s.id, 'mein-spiel-uebung-1-2');
    assert.match(s.id, /^[a-z0-9][a-z0-9-]{1,60}$/);
    for (const [id, k] of Object.entries(s.knoten)) assert.equal(id, kennung(k.titel), `${v.name}: ${k.titel}`);
  }
});

test('Prüfmeldungen im Klartext: Schritt beim Titel, Feld wie im Editor, keine internen Pfade', () => {
  // Tippfehler in der Formel (wie im Messprotokoll)
  const st = lade('spannungsteiler');
  st.knoten.teilspannung.loesung = 'U * R2 / (R1 + R3)';
  const [f] = pruefeSzenario(st).fehler;
  assert.equal(f.pfad, 'knoten.teilspannung.loesung');
  const k = klartext(st, f);
  assert.equal(k.voll, 'Aufgabe „Teilspannung“, Lösung (Formel): „R3“ kennt das Spiel nicht. Erlaubt sind: U, R1, R2.');
  assert.equal(k.pfad, 'knoten.teilspannung.loesung', '„Zur Stelle“ führt ins Feld');

  // Ein Weg ins Leere: „Zur Stelle“ führt genauer als die Prüfung zum Feld „Führt zu“ der Möglichkeit
  const br = lade('fussgaengerbruecke');
  br.knoten.meldung.optionen[1].ziel = 'gibtsnicht';
  const weg = klartext(br, pruefeSzenario(br).fehler.find((x) => x.pfad === 'knoten.meldung'));
  assert.equal(weg.pfad, 'knoten.meldung.optionen[1].ziel');
  assert.equal(weg.voll, 'Szene „Eine Meldung am Montagmorgen“, Möglichkeit B, Führt zu: Zeigt auf einen Schritt, den es nicht mehr gibt. Bitte einen Schritt wählen.');

  // Viele Fehler auf einmal: Jede Meldung ist ohne Fachbegriffe der Datei lesbar
  const kaputt = ausVorlage('quiz', ANGABEN);
  kaputt.urheber = [];
  kaputt.lernziele.push({ id: 'LZ2', text: '' });
  const [f1, f2] = Object.keys(kaputt.knoten);
  kaputt.knoten[f1].optionen.forEach((o) => { delete o.richtig; });
  kaputt.knoten[f1].optionen[1].text = '';
  kaputt.knoten[f2].frage = '';
  kaputt.knoten[f2].weiter = 'weg';
  kaputt.knoten.extra = { typ: 'szene', titel: 'Vergessen', text: '', optionen: [{ id: 'o1', text: 'Weiter', ziel: f1 }] };
  const { fehler, warnungen } = pruefeSzenario(kaputt);
  const alle = [...fehler, ...warnungen].map((x) => klartext(kaputt, x));
  assert.ok(alle.length >= 7, `${alle.length} Meldungen`);
  for (const m of alle) {
    assert.doesNotMatch(m.voll, /knoten|Knoten|Parameter|Indikator|\bid\b|optionen|mechanik|urheber|lernziele|Option\b/, m.voll);
    assert.ok(m.ort && m.text, m.voll);
  }
  const texte = alle.map((m) => m.voll);
  assert.ok(texte.includes('Allgemein, Urheberinnen und Urheber: Bitte mindestens einen Namen eintragen (für die Lizenzangabe).'), texte.join('\n'));
  assert.ok(texte.includes('Aufgabe „Frage 1“, Antworten: Keine Antwort ist als richtig angekreuzt.'), texte.join('\n'));
  assert.ok(texte.includes('Aufgabe „Frage 1“, Antwort B, Text: Der Text fehlt.'), texte.join('\n'));
  assert.ok(texte.includes('Aufgabe „Frage 2“, Frage: Die Frage fehlt.'), texte.join('\n'));
  assert.ok(texte.includes('Szene „Vergessen“: Kein Weg führt hierher. Verbinden Sie den Schritt über „Führt zu“ oder „Weiter zu“ eines anderen Schritts.'), texte.join('\n'));
  assert.ok(texte.includes('Allgemein, Lernziel 2: Der Text fehlt.'), texte.join('\n'));
});
