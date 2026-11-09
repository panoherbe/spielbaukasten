import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { erstelleApp } from '../src/server/app.js';
import { raeumeAuf } from '../src/server/db.js';
import { neuerLoeser } from './hilfe/loeser.js';

let app, basis, verzeichnis;
const stumm = { info() {}, warn() {}, error() {} };

before(async () => {
  verzeichnis = mkdtempSync(join(tmpdir(), 'sbk-'));
  app = erstelleApp({
    datenbank: join(verzeichnis, 'test.sqlite'), inhalte: fileURLToPath(new URL('../inhalte/szenarien', import.meta.url)),
    lehrendeSchluessel: 'geheim-test', demoKurscode: 'DEMO', aufbewahrungTage: 180, minGruppe: 3,
    basisUrl: 'http://test.local', log: stumm, version: 'test',
  });
  await new Promise((ok) => app.server.listen(0, '127.0.0.1', ok));
  basis = `http://127.0.0.1:${app.server.address().port}`;
});

after(async () => {
  await app.schliesse();
  rmSync(verzeichnis, { recursive: true, force: true });
});

/** Ein Browser mit eigener Sitzung. */
function client() {
  let cookie = '';
  return async (methode, pfad, daten, kopf = {}) => {
    const r = await fetch(basis + pfad, {
      method: methode,
      headers: { ...(daten !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}), ...kopf },
      body: daten !== undefined ? JSON.stringify(daten) : undefined,
    });
    const neu = r.headers.get('set-cookie');
    if (neu) cookie = neu.split(';')[0];
    const text = await r.text();
    let json = null;
    try { json = JSON.parse(text); } catch { /* HTML */ }
    return { status: r.status, json, text, kopf: r.headers };
  };
}

async function studierende() {
  const c = client();
  const r = await c('POST', '/api/anmelden/studierende', { kurscode: 'demo' });
  assert.equal(r.status, 201);
  return { c, ...r.json };
}

async function durchspielen(c, szenario, loeser = neuerLoeser()) {
  let a = (await c('POST', '/api/versuche', { szenario })).json;
  for (let i = 0; i < 40 && !a.beendet; i++) {
    const r = await c('POST', `/api/versuche/${a.versuch}/ereignisse`, { nr: a.nr, ereignis: loeser(a) });
    assert.equal(r.status, 200, r.text);
    a = r.json;
  }
  return a;
}

test('Gesundheit, Sicherheits-Kopfzeilen und Startseite', async () => {
  const c = client();
  const g = await c('GET', '/api/gesundheit');
  assert.equal(g.json.ok, true);
  const s = await c('GET', '/');
  assert.equal(s.status, 200);
  assert.match(s.kopf.get('content-security-policy'), /script-src 'self'/);
  assert.equal(s.kopf.get('x-content-type-options'), 'nosniff');
});

test('Beitritt mit Kurscode erzeugt Pseudonym, falscher Code nicht', async () => {
  const { pseudonym, wiederkehrcode, kurs } = await studierende();
  assert.match(pseudonym, /^[A-ZÄÖÜa-zäöüß]+-[A-ZÄÖÜa-zäöüß]+-\d{2}$/);
  assert.match(wiederkehrcode, /^[A-Z2-9]{6}-[A-Z2-9]{6}$/);
  assert.equal(kurs, 'Demokurs');
  const c = client();
  assert.equal((await c('POST', '/api/anmelden/studierende', { kurscode: 'FALSCH' })).status, 404);
  const zurueck = await c('POST', '/api/anmelden/wiederkehr', { wiederkehrcode: wiederkehrcode.toLowerCase() });
  assert.equal(zurueck.json.pseudonym, pseudonym);
});

test('ein ganzes Szenario über die Schnittstelle, Punkte rechnet der Server', async () => {
  const { c } = await studierende();
  const ende = await durchspielen(c, 'fussgaengerbruecke');
  assert.equal(ende.ergebnis, 'erfolg');
  assert.equal(ende.punkte, 45);
  const liste = (await c('GET', '/api/szenarien')).json;
  const b = liste.find((s) => s.id === 'fussgaengerbruecke');
  assert.equal(b.eigene.beendet, 1);
  assert.equal(b.eigene.besteQuote, 1);
});

test('Manipulation: unmögliche Ereignisse, doppelte Schritte und fremde Versuche', async () => {
  const { c } = await studierende();
  const a = (await c('POST', '/api/versuche', { szenario: 'fussgaengerbruecke' })).json;
  const r1 = await c('POST', `/api/versuche/${a.versuch}/ereignisse`, { nr: 0, ereignis: { typ: 'wahl', knoten: 'ende_erfolg', option: 'x' } });
  assert.equal(r1.status, 422);
  const r2 = await c('POST', `/api/versuche/${a.versuch}/ereignisse`, { nr: 0, ereignis: { typ: 'wahl', knoten: 'meldung', option: 'sperren' } });
  assert.equal(r2.status, 200);
  const r3 = await c('POST', `/api/versuche/${a.versuch}/ereignisse`, { nr: 0, ereignis: { typ: 'wahl', knoten: 'meldung', option: 'sperren' } });
  assert.equal(r3.status, 409); // derselbe Schritt zweimal (z. B. Doppelklick, zweiter Tab)
  assert.equal(r3.json.stand.nr, 1);
  const { c: andere } = await studierende();
  assert.equal((await andere('GET', `/api/versuche/${a.versuch}`)).status, 404);
  // Punkte aus dem Browser gibt es nicht: unbekannte Felder werden ignoriert
  const r4 = await c('POST', `/api/versuche/${a.versuch}/ereignisse`, { nr: 1, ereignis: { typ: 'antwort', knoten: 'pruefschritte', antwort: ['unterlagen', 'sicht', 'kraft', 'nachweis', 'massnahme'], punkte: 1000 } });
  assert.equal(r4.json.punkte, 10);
});

test('Rollen: Studierende erreichen keine Lehrenden-Schnittstellen, Gäste nichts', async () => {
  const { c } = await studierende();
  for (const pfad of ['/api/lehrende/kurse', '/api/lehrende/szenarien', '/api/lehrende/auswertung?szenario=fussgaengerbruecke', '/api/lehrende/xapi?szenario=fussgaengerbruecke']) {
    assert.equal((await c('GET', pfad)).status, 403, pfad);
  }
  assert.equal((await client()('GET', '/api/szenarien')).status, 401);
  assert.equal((await client()('POST', '/api/anmelden/lehrende', { schluessel: 'falsch' })).status, 403);
});

test('Schreibende Anfragen fremder Herkunft und Pfade außerhalb werden abgewiesen', async () => {
  const c = client();
  const r = await c('POST', '/api/anmelden/studierende', { kurscode: 'DEMO' }, { Origin: 'https://boese.example' });
  assert.equal(r.status, 403);
  assert.equal((await c('GET', '/../package.json')).status, 404);
  assert.equal((await c('GET', '/%2e%2e/package.json')).status, 404);
  assert.equal((await c('GET', '/medien/fussgaengerbruecke/..%2fszenario.json')).status, 404);
  assert.equal((await c('GET', '/medien/fussgaengerbruecke/medien/meldung.svg')).status, 200);
  const ohneJson = await fetch(`${basis}/api/anmelden/studierende`, { method: 'POST', body: 'kurscode=DEMO', headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
  assert.equal(ohneJson.status, 415);
});

test('Bremse: nach 20 falschen Codes je Minute ist Schluss, richtige Codes zählen nicht', async () => {
  // eigene Instanz, damit die Sperre die anderen Tests nicht trifft
  const dir = mkdtempSync(join(tmpdir(), 'sbk-bremse-'));
  const zweite = erstelleApp({
    datenbank: join(dir, 'b.sqlite'), inhalte: fileURLToPath(new URL('../inhalte/szenarien', import.meta.url)),
    lehrendeSchluessel: 'x', demoKurscode: 'DEMO', aufbewahrungTage: 180, log: stumm, version: 'test',
  });
  await new Promise((ok) => zweite.server.listen(0, '127.0.0.1', ok));
  const url = `http://127.0.0.1:${zweite.server.address().port}`;
  const post = (pfad, daten) => fetch(url + pfad, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(daten) }).then((r) => r.status);
  try {
    for (let i = 0; i < 30; i++) assert.equal(await post('/api/anmelden/studierende', { kurscode: 'DEMO' }), 201);
    for (let i = 0; i < 20; i++) assert.equal(await post('/api/anmelden/wiederkehr', { wiederkehrcode: `FALSCH${i}` }), 404);
    assert.equal(await post('/api/anmelden/studierende', { kurscode: 'DEMO' }), 429);
  } finally {
    await zweite.schliesse();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('Lehrende: Kurs anlegen, Szenario prüfen und hochladen, Auswertung erst ab drei Personen, xAPI, OER', async () => {
  const l = client();
  assert.equal((await l('POST', '/api/anmelden/lehrende', { schluessel: 'geheim-test' })).status, 200);
  const kurs = (await l('POST', '/api/lehrende/kurse', { name: 'Technische Mechanik I', szenarien: ['spannungsteiler'] })).json;
  assert.match(kurs.code, /^[A-Z2-9]{4}-[A-Z2-9]{4}$/);

  const teilnehmende = [];
  for (let i = 0; i < 3; i++) {
    const c = client();
    assert.equal((await c('POST', '/api/anmelden/studierende', { kurscode: kurs.code })).status, 201);
    teilnehmende.push(c);
  }
  assert.equal((await teilnehmende[0]('POST', '/api/versuche', { szenario: 'fussgaengerbruecke' })).status, 404); // nicht freigegeben
  await durchspielen(teilnehmende[0], 'spannungsteiler');
  await durchspielen(teilnehmende[1], 'spannungsteiler', neuerLoeser({ fehlerquote: 1 }));
  let r = (await l('GET', `/api/lehrende/auswertung?szenario=spannungsteiler&kurs=${kurs.id}`)).json;
  assert.equal(r.zuWenig, true);
  await durchspielen(teilnehmende[2], 'spannungsteiler');
  r = (await l('GET', `/api/lehrende/auswertung?szenario=spannungsteiler&kurs=${kurs.id}`)).json;
  assert.equal(r.personen, 3);
  assert.equal(r.beendet, 3);
  const teil = r.knoten.find((k) => k.knoten === 'teilspannung');
  assert.equal(teil.versuche, 3);
  assert.equal(teil.ersterVersuchRichtig, 2);
  assert.equal(Object.values(teil.fehlerarten).reduce((a, b) => a + b, 0), 1); // der eine absichtliche Fehlversuch
  assert.ok(!JSON.stringify(r).match(/[A-ZÄÖÜ][a-zäöüß]+-[A-ZÄÖÜ][a-zäöüß]+-\d\d/), 'Auswertung enthält keine Pseudonyme');

  const xapi = (await l('GET', `/api/lehrende/xapi?szenario=spannungsteiler&kurs=${kurs.id}`)).json;
  assert.equal(xapi.filter((s) => s.verb.id.endsWith('/completed')).length, 3);
  assert.ok(xapi.every((s) => s.actor.account.homePage === 'http://test.local' && !s.actor.mbox));

  const kaputt = JSON.parse(readFileSync(new URL('../inhalte/szenarien/spannungsteiler/szenario.json', import.meta.url), 'utf8'));
  const geladen = kaputt.version;
  kaputt.version = geladen + 1;
  kaputt.knoten.last.weiter = 'nirgendwo';
  const p = await l('POST', '/api/lehrende/szenarien', kaputt);
  assert.equal(p.status, 422);
  assert.match(p.json.fehler[0].meldung, /nirgendwo/);
  kaputt.knoten.last.weiter = 'ende';
  kaputt.titel = 'Übung: Spannungsteiler (überarbeitet)';
  assert.equal((await l('POST', '/api/lehrende/szenarien', kaputt)).status, 201);
  const neu = (await teilnehmende[0]('POST', '/api/versuche', { szenario: 'spannungsteiler' })).json;
  assert.equal(neu.szenario.version, geladen + 1);
  // alte Versuche rechnen weiter mit ihrer Version
  assert.equal((await l('GET', `/api/lehrende/auswertung?szenario=spannungsteiler&kurs=${kurs.id}`)).json.beendet, 3);

  const oer = await l('GET', '/api/lehrende/oer/fussgaengerbruecke');
  assert.equal(oer.status, 200);
  assert.match(oer.kopf.get('content-disposition'), /fussgaengerbruecke-v2\.html/);
  const meta = (await l('GET', '/api/lehrende/oer/fussgaengerbruecke/metadaten')).json;
  assert.equal(meta.license.id, 'https://creativecommons.org/licenses/by/4.0/');
});

test('Auskunft und Löschung: eigene Daten herunterladen, dann alles löschen', async () => {
  const { c, pseudonym, wiederkehrcode } = await studierende();
  await durchspielen(c, 'spannungsteiler');
  const d = (await c('GET', '/api/ich/daten')).json;
  assert.equal(d.pseudonym, pseudonym);
  assert.equal(d.versuche.length, 1);
  assert.ok(d.versuche[0].ereignisse.length >= 3);
  assert.equal((await c('DELETE', '/api/ich')).status, 200);
  assert.equal((await c('GET', '/api/ich')).status, 401);
  assert.equal((await client()('POST', '/api/anmelden/wiederkehr', { wiederkehrcode })).status, 404);
  const rest = app.db.prepare('SELECT count(*) AS n FROM nutzer WHERE pseudonym = ?').get(pseudonym).n;
  assert.equal(rest, 0);
});

test('Aufbewahrungsfrist: alte Versuche und Personen werden gelöscht', async () => {
  const { c, pseudonym } = await studierende();
  await durchspielen(c, 'spannungsteiler');
  const geloescht = raeumeAuf(app.db, 180, new Date(Date.now() + 181 * 86400000));
  assert.ok(geloescht.versuche >= 1);
  assert.equal(app.db.prepare('SELECT count(*) AS n FROM nutzer WHERE pseudonym = ?').get(pseudonym).n, 0);
});

test('jede Route steht in docs/openapi.json', () => {
  const quelle = readFileSync(new URL('../src/server/app.js', import.meta.url), 'utf8');
  const doc = JSON.parse(readFileSync(new URL('../docs/openapi.json', import.meta.url), 'utf8'));
  const routen = [...quelle.matchAll(/route\('(\w+)', '([^']+)'/g)].map(([, m, p]) => [m.toLowerCase(), p.replace(/\([^)]*\)/g, '{x}')]);
  const doku = Object.entries(doc.paths).flatMap(([p, ops]) => Object.keys(ops).map((m) => [m, p.replace(/\{[^}]+\}/g, '{x}')]));
  for (const [m, p] of routen) assert.ok(doku.some(([dm, dp]) => dm === m && dp === p), `${m.toUpperCase()} ${p} fehlt in openapi.json`);
});
