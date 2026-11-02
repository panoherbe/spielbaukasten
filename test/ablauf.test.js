import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { starte, wende, spiele, SpielFehler } from '../src/engine/ablauf.js';
import { ansicht } from '../src/engine/ansicht.js';
import { ziehe } from '../src/engine/zufall.js';
import { neuerLoeser } from './hilfe/loeser.js';

const brücke = JSON.parse(readFileSync(new URL('../inhalte/szenarien/fussgaengerbruecke/szenario.json', import.meta.url), 'utf8'));
const teiler = JSON.parse(readFileSync(new URL('../inhalte/szenarien/spannungsteiler/szenario.json', import.meta.url), 'utf8'));

function durchspielen(s, seed, loeser = neuerLoeser()) {
  let z = starte(s, seed);
  const ereignisse = [];
  for (let i = 0; i < 40 && !z.beendet; i++) {
    const e = loeser(ansicht(s, z));
    ereignisse.push(e);
    z = wende(s, z, e);
  }
  return { z, ereignisse };
}

test('Parameter sind je Startwert reproduzierbar und decken den Wertebereich ab', () => {
  assert.deepEqual(ziehe(brücke.parameter, 42), ziehe(brücke.parameter, 42));
  const F = new Set();
  const theta = new Set();
  for (let seed = 1; seed <= 2000; seed++) { const p = ziehe(brücke.parameter, seed); F.add(p.F); theta.add(p.theta); }
  assert.deepEqual([...F].sort((a, b) => a - b), [30, 35, 40, 45, 50, 55, 60]);
  assert.deepEqual([...theta].sort((a, b) => a - b), [30, 45, 60]);
});

test('richtig gespielt endet die Brücke mit Erfolg und voller Punktzahl, über viele Startwerte', () => {
  const zweige = new Set();
  for (let seed = 1; seed <= 300; seed++) {
    const { z } = durchspielen(brücke, seed);
    assert.equal(z.ergebnis, 'erfolg', `seed ${seed}`);
    assert.equal(z.punkte, z.maxPunkte);
    assert.equal(z.maxPunkte, 45);
    assert.deepEqual(z.lernziele, { LZ1: 'sicher', LZ2: 'sicher', LZ3: 'sicher' });
    zweige.add(spiele(brücke, seed, []).parameter.theta === 30 ? 'ueberlastet' : 'pruefen');
  }
  assert.equal(zweige.size, 2);
});

test('die Verzweigung nach dem Nachweis stimmt für jede Parameterkombination mit einer unabhängigen Rechnung überein', () => {
  for (let seed = 1; seed <= 400; seed++) {
    const { ereignisse } = durchspielen(brücke, seed);
    const p = spiele(brücke, seed, []).parameter;
    const sigma = 1.5 * (p.F / (2 * Math.tan((p.theta * Math.PI) / 180))) * 1000 / 160;
    const entscheidung = ereignisse.find((e) => e.knoten.startsWith('entscheidung_')).knoten;
    assert.equal(entscheidung, sigma <= 235 ? 'entscheidung_reserve' : 'entscheidung_ueberlastet', `F=${p.F} θ=${p.theta} σ=${sigma}`);
  }
});

test('zweiter Versuch gibt halbe Punkte, Hinweis kostet 30 %, ungültige Eingabe zählt nicht', () => {
  let z = spiele(brücke, 7, [
    { typ: 'wahl', knoten: 'meldung', option: 'sperren' },
    { typ: 'antwort', knoten: 'pruefschritte', antwort: ['unterlagen', 'sicht', 'kraft', 'nachweis', 'massnahme'] },
    { typ: 'wahl', knoten: 'modell', option: 'rechnen' },
  ]);
  const { F, theta } = z.parameter;
  const D = F / (2 * Math.sin((theta * Math.PI) / 180));
  z = wende(brücke, z, { typ: 'antwort', knoten: 'diagonale', antwort: 'viel' });
  assert.equal(z.rueckmeldung.art, 'ungueltig');
  assert.equal(z.versuche, 0);
  z = wende(brücke, z, { typ: 'hinweis', knoten: 'diagonale' });
  z = wende(brücke, z, { typ: 'antwort', knoten: 'diagonale', antwort: String(D * 3) });
  assert.equal(z.rueckmeldung.art, 'falsch');
  assert.equal(z.rueckmeldung.nochVersuche, 1);
  const vorher = z.punkte;
  z = wende(brücke, z, { typ: 'antwort', knoten: 'diagonale', antwort: D.toFixed(2).replace('.', ',') });
  assert.equal(z.rueckmeldung.art, 'richtig');
  assert.equal(z.punkte - vorher, 3.5); // 10 × 0,5 × 0,7
  assert.equal(z.lernziele.LZ1, 'mit_hilfe');
});

test('nach dem letzten Fehlversuch wird die Lösung gezeigt und es geht weiter', () => {
  let z = spiele(teiler, 3, [{ typ: 'wahl', knoten: 'aufbau', option: 'los' }]);
  z = wende(teiler, z, { typ: 'antwort', knoten: 'teilspannung', antwort: '999' });
  z = wende(teiler, z, { typ: 'antwort', knoten: 'teilspannung', antwort: '998' });
  assert.equal(z.rueckmeldung.art, 'aufgeloest');
  assert.match(z.rueckmeldung.loesung, /V$/);
  assert.equal(z.knoten, 'last');
  assert.equal(z.lernziele.LZ1, 'offen');
});

test('typische Fehler bekommen gezielte Rückmeldung', () => {
  let z = spiele(brücke, 11, [
    { typ: 'wahl', knoten: 'meldung', option: 'sperren' },
    { typ: 'antwort', knoten: 'pruefschritte', antwort: ['unterlagen', 'sicht', 'kraft', 'nachweis', 'massnahme'] },
    { typ: 'wahl', knoten: 'modell', option: 'rechnen' },
  ]);
  const { F, theta } = z.parameter;
  const D = F / (2 * Math.sin((theta * Math.PI) / 180));
  const zMinus = wende(brücke, z, { typ: 'antwort', knoten: 'diagonale', antwort: String(-D) });
  assert.match(zMinus.rueckmeldung.text, /Vorzeichen/);
  const zKilo = wende(brücke, z, { typ: 'antwort', knoten: 'diagonale', antwort: String(D * 1000) });
  assert.match(zKilo.rueckmeldung.text, /Größenordnung/);
  const zSinus = wende(brücke, z, { typ: 'antwort', knoten: 'diagonale', antwort: String(F / Math.sin((theta * Math.PI) / 180)) });
  assert.match(zSinus.rueckmeldung.text, /zwei Diagonalen/);
});

test('Ereignisse, die im Zustand nicht möglich sind, werden abgelehnt', () => {
  const z = starte(brücke, 1);
  assert.throws(() => wende(brücke, z, { typ: 'wahl', knoten: 'meldung', option: 'gibtsnicht' }), SpielFehler);
  assert.throws(() => wende(brücke, z, { typ: 'antwort', knoten: 'meldung', antwort: 1 }), SpielFehler);
  assert.throws(() => wende(brücke, z, { typ: 'wahl', knoten: 'ende_erfolg', option: 'x' }), SpielFehler);
  assert.throws(() => wende(brücke, z, { typ: 'hinweis', knoten: 'meldung' }), SpielFehler);
});

test('die Ansicht verrät keine Lösung', () => {
  for (let seed = 1; seed <= 50; seed++) {
    let z = starte(brücke, seed);
    const loeser = neuerLoeser({ fehlerquote: 0.5, zufall: () => (seed % 3) / 3 });
    while (!z.beendet) {
      const a = ansicht(brücke, z);
      const knoten = JSON.stringify(a.knoten);
      for (const verboten of ['loesung', 'typische_fehler', '"richtig"', 'regeln', 'erklaerung', '"ziel"', 'effekte']) {
        assert.ok(!knoten.includes(verboten), `${verboten} in Ansicht von ${z.knoten}`);
      }
      const alles = JSON.stringify(a);
      for (const formel of ['sind(', 'tand(', '1.5 *', '{=']) assert.ok(!alles.includes(formel), `${formel} in Ansicht von ${z.knoten}`);
      z = wende(brücke, z, loeser(a));
    }
  }
});
