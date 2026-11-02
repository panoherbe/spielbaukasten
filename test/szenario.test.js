import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { pruefeSzenario } from '../src/engine/szenario.js';

const lade = (id) => JSON.parse(readFileSync(new URL(`../inhalte/szenarien/${id}/szenario.json`, import.meta.url), 'utf8'));
const ids = readdirSync(new URL('../inhalte/szenarien/', import.meta.url));

test('alle mitgelieferten Szenarien sind fehler- und hinweisfrei', () => {
  assert.ok(ids.length >= 2);
  for (const id of ids) assert.deepEqual(pruefeSzenario(lade(id)), { fehler: [], warnungen: [] }, id);
});

test('typische Fehler beim Schreiben eines Szenarios werden mit Fundstelle gemeldet', () => {
  const s = lade('fussgaengerbruecke');
  s.knoten.meldung.optionen[0].ziel = 'gibtsnicht';
  s.knoten.meldung.optionen[1].effekte = { laune: 5 };
  s.knoten.diagonale.loesung = 'F / (2 * sind(alpha))';
  s.knoten.zugband.loesung = 'F / (2 * tand(theta)';
  s.knoten.spannung.mechanik = 'puzzle';
  s.lizenz = 'alle Rechte vorbehalten';
  const { fehler } = pruefeSzenario(s);
  const text = fehler.map((f) => `${f.pfad}: ${f.meldung}`).join('\n');
  assert.match(text, /knoten\.meldung: Ziel „gibtsnicht“ gibt es nicht/);
  assert.match(text, /optionen\[1\]\.effekte\.laune: Indikator „laune“ gibt es nicht/);
  assert.match(text, /diagonale\.loesung: „alpha“ ist kein Parameter/);
  assert.match(text, /zugband\.loesung: Formel nicht lesbar/);
  assert.match(text, /spannung\.mechanik: Mechanik „puzzle“ gibt es nicht/);
  assert.match(text, /lizenz: lizenz muss eine offene Lizenz sein/);
});

test('Sackgassen und Endlosschleifen werden erkannt', () => {
  const s = lade('spannungsteiler');
  s.knoten.last.weiter = 'aufbau'; // Kreis ohne Ausgang
  s.knoten.verwaist = { typ: 'ende', ergebnis: 'erfolg', titel: 'x', text: 'x' };
  const { fehler, warnungen } = pruefeSzenario(s);
  assert.ok(fehler.some((f) => /Endlosschleife/.test(f.meldung)));
  assert.ok(warnungen.some((w) => w.pfad === 'knoten.ende' || w.pfad === 'knoten.verwaist'));
});
