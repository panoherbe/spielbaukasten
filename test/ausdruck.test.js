import { test } from 'node:test';
import assert from 'node:assert/strict';
import { berechne, parse, namen, fuelleText, AusdruckFehler } from '../src/engine/ausdruck.js';

test('Grundrechenarten, Vorrang und Klammern', () => {
  assert.equal(berechne('1 + 2 * 3'), 7);
  assert.equal(berechne('(1 + 2) * 3'), 9);
  assert.equal(berechne('2 ^ 3 ^ 2'), 512); // rechtsassoziativ
  assert.equal(berechne('-2 ^ 2'), -4);
  assert.equal(berechne('10 / 4'), 2.5);
  assert.equal(berechne('1.5e3'), 1500);
});

test('Winkelfunktionen in Grad und Bogenmaß', () => {
  assert.ok(Math.abs(berechne('sind(30)') - 0.5) < 1e-12);
  assert.ok(Math.abs(berechne('tand(45)') - 1) < 1e-12);
  assert.ok(Math.abs(berechne('sin(pi / 2)') - 1) < 1e-12);
  assert.equal(berechne('runde(2.345, 2)'), 2.35);
});

test('Vergleiche und Logik liefern 1 oder 0', () => {
  assert.equal(berechne('sicherheit >= 70 && budget > 0', { sicherheit: 75, budget: 1 }), 1);
  assert.equal(berechne('sicherheit >= 70 && budget > 0', { sicherheit: 75, budget: 0 }), 0);
  assert.equal(berechne('!(a == 2) || a < 1', { a: 2 }), 0);
});

test('Ingenieurformel des Brückenszenarios', () => {
  const D = berechne('F / (2 * sind(theta))', { F: 40, theta: 30 });
  assert.ok(Math.abs(D - 40) < 1e-9);
});

test('kein Zugriff auf JavaScript: unbekannte Namen und Zeichen werden abgelehnt', () => {
  assert.throws(() => berechne('constructor'), AusdruckFehler);
  assert.throws(() => berechne('a.b'), AusdruckFehler);
  assert.throws(() => berechne('process'), AusdruckFehler);
  assert.throws(() => berechne('alert(1)'), /Unbekannte Funktion/);
  assert.throws(() => berechne('x = 1'), AusdruckFehler);
  assert.throws(() => berechne('"text"'), AusdruckFehler);
  assert.throws(() => berechne('(1 + 2'), /„\)“ erwartet/);
  assert.throws(() => berechne('1 / 0'), /keine endliche Zahl/);
});

test('verwendete Namen werden gefunden', () => {
  assert.deepEqual([...namen(parse('F / (2 * sind(theta)) + pi'))].sort(), ['F', 'theta']);
});

test('Text mit Platzhaltern', () => {
  assert.equal(fuelleText('F = {F} kN, D = {= F / 2 : 1} kN', { F: 45 }), 'F = 45 kN, D = 22,5 kN');
  assert.equal(fuelleText('Noch {tage : 0} Tage', { tage: 3 }), 'Noch 3 Tage');
  assert.equal(fuelleText('{unbekannt} bleibt', {}), '{unbekannt} bleibt');
});
