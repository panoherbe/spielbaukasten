// Tests für die Spielgestaltung: Sterne und Auszeichnungen, Kapitelkarte, neue Felder im Szenario-Format,
// Auslieferung der Grafiken und die beschrifteten Zahlen für Übersicht und Auswertung.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { starte, wende } from '../src/engine/ablauf.js';
import { ansicht } from '../src/engine/ansicht.js';
import { sterne, auszeichnungen, AUSZEICHNUNGEN } from '../src/engine/wertung.js';
import { pruefeSzenario } from '../src/engine/szenario.js';
import { erstelleApp } from '../src/server/app.js';
import { neuerLoeser } from './hilfe/loeser.js';

const lade = (id) => JSON.parse(readFileSync(new URL(`../inhalte/szenarien/${id}/szenario.json`, import.meta.url), 'utf8'));
const brücke = lade('fussgaengerbruecke');
const teiler = lade('spannungsteiler');

/** Spielt ein Szenario in der Engine und liefert jede Ansicht unterwegs. */
function spiele(s, seed, loeser = neuerLoeser()) {
  let z = starte(s, seed);
  const ansichten = [ansicht(s, z)];
  for (let i = 0; i < 40 && !z.beendet; i++) {
    z = wende(s, z, loeser(ansichten.at(-1)));
    ansichten.push(ansicht(s, z));
  }
  return { z, ansichten };
}

const stand = (a, id) => Object.fromEntries(a.auszeichnungen.map((x) => [x.id, x.erreicht]))[id];

test('Sterne: Ausgang zählt zwei, einer, keiner; ab 80 % der Punkte einer mehr', () => {
  assert.equal(sterne('erfolg', 1), 3);
  assert.equal(sterne('erfolg', 0.79), 2);
  assert.equal(sterne('teilerfolg', 0.8), 2);
  assert.equal(sterne('teilerfolg', 0.5), 1);
  assert.equal(sterne('misserfolg', 1), 1);
  assert.equal(sterne('misserfolg', 0), 0);
  assert.equal(sterne('unbekannt', 0.2), 0);
});

test('Auszeichnungen: fehlerfrei gespielt sind alle fünf erreicht, mit Fehlern und Hinweis nicht', () => {
  const gut = spiele(brücke, 7).ansichten.at(-1);
  assert.equal(gut.beendet, true);
  assert.deepEqual(gut.auszeichnungen.map((x) => x.id), AUSZEICHNUNGEN.map((x) => x.id));
  assert.ok(gut.auszeichnungen.every((x) => x.erreicht), JSON.stringify(gut.auszeichnungen));
  assert.equal(gut.sterne, 3);

  // Erste Antwort auf jede Rechenaufgabe falsch: nicht fehlerfrei, Lernziele nicht „sicher“
  const falsch = spiele(brücke, 7, neuerLoeser({ fehlerquote: 1 })).ansichten.at(-1);
  assert.equal(stand(falsch, 'fehlerfrei'), false);
  assert.equal(stand(falsch, 'lernziele'), false);
  assert.equal(stand(falsch, 'geschafft'), true);

  // Ein Hinweis kostet die Auszeichnung „Ohne Hinweis“
  const loeser = neuerLoeser();
  let z = starte(brücke, 7);
  let hinweis = false;
  for (let i = 0; i < 40 && !z.beendet; i++) {
    const a = ansicht(brücke, z);
    if (!hinweis && a.knoten.typ === 'aufgabe' && a.knoten.hinweisVerfuegbar) { hinweis = true; z = wende(brücke, z, { typ: 'hinweis', knoten: a.knoten.id }); continue; }
    z = wende(brücke, z, loeser(a));
  }
  assert.ok(hinweis);
  assert.equal(stand(ansicht(brücke, z), 'ohne-hinweis'), false);
});

test('Auszeichnungen: riskante Entscheidung kostet „Umsichtig“ und einen Stern; nicht mögliche entfallen', () => {
  // „offen lassen“ am Anfang ist riskant
  const loeser = neuerLoeser();
  let z = starte(brücke, 3);
  z = wende(brücke, z, { typ: 'wahl', knoten: 'meldung', option: 'offen_lassen' });
  for (let i = 0; i < 40 && !z.beendet; i++) z = wende(brücke, z, loeser(ansicht(brücke, z)));
  const a = ansicht(brücke, z);
  assert.equal(stand(a, 'umsichtig'), false);
  assert.ok(a.sterne <= 2);

  // Die Sensor-Übung hat keine bewerteten Entscheidungen: „Umsichtig“ gibt es dort nicht
  const t = spiele(teiler, 5).ansichten.at(-1);
  assert.ok(!t.auszeichnungen.some((x) => x.id === 'umsichtig'));
  assert.deepEqual(auszeichnungen(teiler, { ...t, statistik: { aufgaben: 0, ersterVersuch: 0, mitHinweis: 0, hinweise: 0, entscheidungen: 0, gut: 0 }, lernziele: {} })
    .map((x) => x.id), ['geschafft', 'lernziele']);
});

test('Kapitelkarte: genau ein aktuelles Kapitel, erledigte davor, am Ende alle erledigt; ohne Knoten-IDs', () => {
  for (const s of [brücke, teiler]) {
    const { ansichten } = spiele(s, 11);
    for (const a of ansichten.slice(0, -1)) {
      const st = a.kapitel.map((k) => k.stand);
      assert.equal(st.filter((x) => x === 'aktuell').length, 1, `${s.id} ${a.knoten.id}`);
      const i = st.indexOf('aktuell');
      assert.ok(st.slice(0, i).every((x) => x === 'erledigt') && st.slice(i + 1).every((x) => x === 'offen'));
      assert.deepEqual(Object.keys(a.kapitel[0]).sort(), ['stand', 'titel']);
    }
    assert.ok(ansichten.at(-1).kapitel.every((k) => k.stand === 'erledigt'));
  }
});

test('Prüfung der neuen Felder: Titelbild, Figur, Kapitel und Symbol mit Fundstelle', () => {
  const s = lade('fussgaengerbruecke');
  s.titelbild = { alt: 'ohne Datei' };
  s.figur = { bild: { datei: 'medien/bauleitung.svg', alt: 'x' }, zufrieden: { alt: 'x' } };
  s.kapitel = [{ titel: 'Lage', knoten: ['meldung', 'gibtsnicht'] }, { knoten: [] }];
  s.indikatoren[0].symbol = 'einhorn';
  const { fehler, warnungen } = pruefeSzenario(s);
  const text = fehler.map((f) => `${f.pfad}: ${f.meldung}`).join('\n');
  assert.match(text, /titelbild: Bild braucht „datei“/);
  assert.match(text, /figur\.name: Figur braucht einen Namen/);
  assert.match(text, /figur\.zufrieden: Bild braucht „datei“/);
  assert.match(text, /kapitel\[0\]\.knoten: Knoten „gibtsnicht“ gibt es nicht/);
  assert.match(text, /kapitel\[1\]\.titel: Kapitel braucht einen Titel/);
  assert.match(text, /indikatoren\[0\]\.symbol: symbol muss einer von/);
  assert.ok(warnungen.some((w) => /in keinem Kapitel/.test(w.meldung)));
});

test('jedes Bild in den Szenarien gibt es als Datei, und jedes SVG hat einen Alternativtext im <title>', () => {
  for (const s of [brücke, teiler]) {
    const bilder = [s.titelbild, s.figur?.bild, s.figur?.zufrieden, s.figur?.besorgt, ...Object.values(s.knoten).map((k) => k.bild)].filter(Boolean);
    assert.ok(bilder.length >= 5, s.id);
    for (const b of bilder) {
      const svg = readFileSync(new URL(`../inhalte/szenarien/${s.id}/${b.datei}`, import.meta.url), 'utf8');
      assert.match(svg, /<title[^>]*>[^<]{20,}<\/title>/, b.datei);
      assert.ok(b.alt?.length >= 20, `${s.id}: ${b.datei} ohne alt`);
      assert.doesNotMatch(svg, /<script|on\w+=|href="http/i, b.datei);
    }
  }
  const auszeichnungsBilder = readdirSync(new URL('../src/web/bilder/', import.meta.url)).filter((d) => d.startsWith('auszeichnung-'));
  assert.deepEqual(auszeichnungsBilder.sort(), AUSZEICHNUNGEN.map((a) => `auszeichnung-${a.id}.svg`).sort());
});

// --- Server ---------------------------------------------------------------------------------------------------------
let app, basis, verzeichnis;

before(async () => {
  verzeichnis = mkdtempSync(join(tmpdir(), 'sbk-gestaltung-'));
  app = erstelleApp({
    datenbank: join(verzeichnis, 'test.sqlite'), inhalte: fileURLToPath(new URL('../inhalte/szenarien', import.meta.url)),
    lehrendeSchluessel: 'geheim-test', demoKurscode: 'DEMO', aufbewahrungTage: 180, minGruppe: 3,
    basisUrl: 'http://test.local', log: { info() {}, warn() {}, error() {} }, version: 'test',
  });
  await new Promise((ok) => app.server.listen(0, '127.0.0.1', ok));
  basis = `http://127.0.0.1:${app.server.address().port}`;
});

after(async () => {
  await app.schliesse();
  rmSync(verzeichnis, { recursive: true, force: true });
});

function client() {
  let cookie = '';
  return async (methode, pfad, daten) => {
    const r = await fetch(basis + pfad, {
      method: methode,
      headers: { ...(daten !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}) },
      body: daten !== undefined ? JSON.stringify(daten) : undefined,
    });
    const neu = r.headers.get('set-cookie');
    if (neu) cookie = neu.split(';')[0];
    const text = await r.text();
    let json = null;
    try { json = JSON.parse(text); } catch { /* kein JSON */ }
    return { status: r.status, json, text, kopf: r.headers };
  };
}

async function durchspielen(c, szenario, loeser = neuerLoeser()) {
  let a = (await c('POST', '/api/versuche', { szenario })).json;
  for (let i = 0; i < 40 && !a.beendet; i++) a = (await c('POST', `/api/versuche/${a.versuch}/ereignisse`, { nr: a.nr, ereignis: loeser(a) })).json;
  return a;
}

test('SVG-Grafiken kommen mit eigener, strenger Content-Security-Policy; Pfade außerhalb gibt es nicht', async () => {
  const c = client();
  for (const pfad of ['/bilder/start.svg', '/bilder/auszeichnung-geschafft.svg', '/medien/fussgaengerbruecke/medien/meldung.svg']) {
    const r = await c('GET', pfad);
    assert.equal(r.status, 200, pfad);
    assert.equal(r.kopf.get('content-type'), 'image/svg+xml', pfad);
    const csp = r.kopf.get('content-security-policy');
    assert.match(csp, /default-src 'none'/, pfad);
    assert.match(csp, /sandbox/, pfad);
    assert.doesNotMatch(csp, /script-src/, pfad);
    assert.equal(r.kopf.get('x-content-type-options'), 'nosniff');
  }
  assert.equal((await c('GET', '/medien/fussgaengerbruecke/..%2F..%2Fpackage.json')).status, 404);
});

test('Übersicht liefert Titelbild und beste Sterne; das Ende liefert Sterne und Auszeichnungen', async () => {
  const c = client();
  assert.equal((await c('POST', '/api/anmelden/studierende', { kurscode: 'DEMO' })).status, 201);
  let liste = (await c('GET', '/api/szenarien')).json;
  const vorher = liste.find((s) => s.id === 'spannungsteiler');
  assert.equal(vorher.titelbild.datei, 'medien/titel-spannungsteiler.svg');
  assert.ok(!vorher.eigene.besteSterne);
  const ende = await durchspielen(c, 'spannungsteiler');
  assert.equal(ende.sterne, 3);
  assert.ok(ende.auszeichnungen.every((x) => x.erreicht && x.titel && x.text));
  assert.ok(ende.kapitel.every((k) => k.stand === 'erledigt'));
  liste = (await c('GET', '/api/szenarien')).json;
  assert.equal(liste.find((s) => s.id === 'spannungsteiler').eigene.besteSterne, 3);
});

test('Auswertung beschriftet Entscheidungen mit Text und Bewertung, in der Reihenfolge des Szenarios', async () => {
  for (let i = 0; i < 3; i++) {
    const c = client();
    await c('POST', '/api/anmelden/studierende', { kurscode: 'DEMO' });
    await durchspielen(c, 'fussgaengerbruecke');
  }
  const l = client();
  assert.equal((await l('POST', '/api/anmelden/lehrende', { schluessel: 'geheim-test' })).status, 200);
  const r = (await l('GET', '/api/lehrende/auswertung?szenario=fussgaengerbruecke')).json;
  assert.equal(r.personen, 3);
  const meldung = r.knoten.find((k) => k.knoten === 'meldung');
  assert.equal(meldung.optionen.sperren, 3);
  assert.match(meldung.optionenText.sperren, /sperren/i);
  assert.equal(meldung.optionenBewertung.sperren, 'gut');
  assert.equal(meldung.optionenBewertung.offen_lassen, 'schlecht');
  const reihenfolge = Object.keys(brücke.knoten);
  const ids = r.knoten.map((k) => k.knoten);
  assert.deepEqual(ids, [...ids].sort((a, b) => reihenfolge.indexOf(a) - reihenfolge.indexOf(b)));
});

test('Oberfläche und Grafiken gehen komprimiert hinaus, wenn der Browser gzip annimmt', async () => {
  const { gunzipSync } = await import('node:zlib');
  for (const pfad of ['/styles.css', '/spieler.js', '/bilder/start.svg']) {
    const roh = await fetch(basis + pfad, { headers: { 'Accept-Encoding': 'identity' } });
    const klar = Buffer.from(await roh.arrayBuffer());
    assert.equal(roh.headers.get('content-encoding'), null, pfad);
    // fetch entpackt selbst; deshalb die Antwort über node:http lesen
    const { request } = await import('node:http');
    const gepackt = await new Promise((ok, fehler) => request(basis + pfad, { headers: { 'Accept-Encoding': 'gzip' } }, (r) => {
      const teile = []; r.on('data', (d) => teile.push(d)); r.on('end', () => ok({ kopf: r.headers, daten: Buffer.concat(teile) }));
    }).on('error', fehler).end());
    assert.equal(gepackt.kopf['content-encoding'], 'gzip', pfad);
    assert.match(gepackt.kopf.vary, /Accept-Encoding/);
    assert.ok(gepackt.daten.length < klar.length / 2, `${pfad}: ${gepackt.daten.length} von ${klar.length}`);
    assert.deepEqual(gunzipSync(gepackt.daten), klar);
  }
});
