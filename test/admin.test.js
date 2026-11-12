// Administration: dritte Rolle neben Studierenden und Lehrenden. Zugänge sperren und entsperren, Aufbewahrungsfrist,
// Einstellungen der Instanz, Protokoll; strikte Trennung der Rollen; Übernahme einer Datenbank von Version 0.1.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { starteApp, client, studierende, lehrende } from './hilfe/app.js';
import { oeffne, SCHEMA, SCHEMA_VERSION } from '../src/server/db.js';

let t;
before(async () => { t = await starteApp(); });
after(async () => { await t.stop(); });

async function admin() {
  const c = client(t.basis);
  const r = await c('POST', '/api/anmelden/admin', { schluessel: 'admin-test' });
  assert.equal(r.status, 200, r.text);
  assert.equal(r.json.rolle, 'admin');
  return c;
}

test('Rollen: Studierende erreichen weder Lehrenden- noch Administrations-Schnittstellen; jede Rolle bleibt in ihrem Bereich', async () => {
  const s = await studierende(t.basis);
  const l = await lehrende(t.basis);
  const a = await admin();
  const adminPfade = [['GET', '/api/admin/zugaenge'], ['POST', '/api/admin/zugaenge', { bezeichnung: 'x' }], ['PUT', '/api/admin/zugaenge/1', { gesperrt: true }],
    ['GET', '/api/admin/einstellungen'], ['PUT', '/api/admin/einstellungen', { aufbewahrungTage: 30 }], ['GET', '/api/admin/protokoll']];
  const lehrPfade = [['GET', '/api/lehrende/kurse'], ['GET', '/api/lehrende/szenarien/fussgaengerbruecke'], ['POST', '/api/lehrende/vorschau', { szenario: {} }],
    ['GET', '/api/lehrende/runden'], ['POST', '/api/lehrende/runden', { kurs: 1, szenario: 'fussgaengerbruecke' }], ['GET', '/api/lehrende/auswertung?szenario=fussgaengerbruecke']];
  for (const [m, p, d] of adminPfade) {
    assert.equal((await s(m, p, d)).status, 403, `Studierende: ${m} ${p}`);
    assert.equal((await l(m, p, d)).status, 403, `Lehrende: ${m} ${p}`);
    assert.equal((await client(t.basis)(m, p, d)).status, 401, `Gast: ${m} ${p}`);
  }
  for (const [m, p, d] of lehrPfade) {
    assert.equal((await s(m, p, d)).status, 403, `Studierende: ${m} ${p}`);
    assert.equal((await a(m, p, d)).status, 403, `Administration: ${m} ${p}`);
  }
  assert.equal((await a('POST', '/api/teams', { szenario: 'fussgaengerbruecke' })).status, 403, 'Administration spielt nicht mit');
  assert.equal((await client(t.basis)('POST', '/api/anmelden/admin', { schluessel: 'geheim-test' })).status, 403, 'Schlüssel der Lehrenden öffnet die Administration nicht');
});

test('Zugänge: anlegen, mit eigenem Schlüssel anmelden, sperren (sofort abgemeldet), entsperren', async () => {
  const a = await admin();
  const z = await a('POST', '/api/admin/zugaenge', { bezeichnung: 'Lehrstuhl Statik' });
  assert.equal(z.status, 201);
  assert.match(z.json.schluessel, /^[A-Z2-9-]{19}$/);
  const liste = (await a('GET', '/api/admin/zugaenge')).json;
  assert.deepEqual(liste.map((x) => [x.art, x.gesperrt]), [['instanz', false], ['persoenlich', false]]);
  assert.ok(!JSON.stringify(liste).includes(z.json.schluessel), 'der Schlüssel steht nur in der Antwort beim Anlegen');

  const l = client(t.basis);
  const an = await l('POST', '/api/anmelden/lehrende', { schluessel: z.json.schluessel });
  assert.equal(an.status, 200);
  assert.equal(an.json.zugang, 'Lehrstuhl Statik');
  assert.equal((await l('GET', '/api/lehrende/kurse')).status, 200);

  assert.equal((await a('PUT', `/api/admin/zugaenge/${z.json.id}`, { gesperrt: true })).status, 200);
  assert.equal((await l('GET', '/api/lehrende/kurse')).status, 401, 'gesperrt: sofort abgemeldet');
  const wieder = await client(t.basis)('POST', '/api/anmelden/lehrende', { schluessel: z.json.schluessel });
  assert.equal(wieder.status, 403);
  assert.match(wieder.json.fehler, /gesperrt/);

  assert.equal((await a('PUT', `/api/admin/zugaenge/${z.json.id}`, { gesperrt: false })).status, 200);
  assert.equal((await client(t.basis)('POST', '/api/anmelden/lehrende', { schluessel: z.json.schluessel })).status, 200);

  // Auch der gemeinsame Schlüssel der Instanz lässt sich sperren
  const instanz = liste.find((x) => x.art === 'instanz');
  await a('PUT', `/api/admin/zugaenge/${instanz.id}`, { gesperrt: true });
  assert.equal((await client(t.basis)('POST', '/api/anmelden/lehrende', { schluessel: 'geheim-test' })).status, 403);
  await a('PUT', `/api/admin/zugaenge/${instanz.id}`, { gesperrt: false });
  assert.equal((await client(t.basis)('POST', '/api/anmelden/lehrende', { schluessel: 'geheim-test' })).status, 200);
  assert.equal((await a('POST', '/api/admin/zugaenge', { bezeichnung: '' })).status, 400);
  assert.equal((await a('PUT', '/api/admin/zugaenge/999', { gesperrt: true })).status, 404);
});

test('Aufbewahrungsfrist: in der Oberfläche setzen, gilt sofort; Einstellungen der Instanz nur lesen', async () => {
  const a = await admin();
  let e = (await a('GET', '/api/admin/einstellungen')).json;
  assert.equal(e.aufbewahrungTage, 180);
  assert.match(e.aufbewahrungQuelle, /Voreinstellung/);
  assert.ok(e.instanz.some((x) => x.name === 'Version' && x.wert === 'test'));
  assert.ok(e.instanz.some((x) => x.name === 'Datenbank-Schema' && x.wert === `Version ${SCHEMA_VERSION}`));
  assert.ok(!JSON.stringify(e).includes('geheim-test') && !JSON.stringify(e).includes('admin-test'), 'keine Schlüssel in den Einstellungen');

  const s = await studierende(t.basis);
  t.app.db.prepare('UPDATE nutzer SET zuletzt = ? WHERE pseudonym = ?').run(new Date(Date.now() - 40 * 86400000).toISOString(), s.pseudonym);
  assert.equal((await a('PUT', '/api/admin/einstellungen', { aufbewahrungTage: 5 })).status, 400);
  const r = await a('PUT', '/api/admin/einstellungen', { aufbewahrungTage: 30 });
  assert.equal(r.status, 200);
  assert.ok(r.json.geloescht.nutzer >= 1, 'wer 40 Tage nicht aktiv war, ist bei 30 Tagen Frist gelöscht');
  assert.equal(t.app.db.prepare('SELECT count(*) AS n FROM nutzer WHERE pseudonym = ?').get(s.pseudonym).n, 0);
  e = (await a('GET', '/api/admin/einstellungen')).json;
  assert.equal(e.aufbewahrungTage, 30);
  assert.equal(e.aufbewahrungQuelle, 'Oberfläche');
  await a('PUT', '/api/admin/einstellungen', { aufbewahrungTage: 180 });
});

test('Protokoll: Verwaltung wird festgehalten, ohne Studierende und ohne Schlüssel', async () => {
  const a = await admin();
  await client(t.basis)('POST', '/api/anmelden/lehrende', { schluessel: 'falsch' });
  const l = await lehrende(t.basis);
  await l('POST', '/api/lehrende/kurse', { name: 'Protokollkurs', szenarien: [] });
  const p = (await a('GET', '/api/admin/protokoll')).json;
  const aktionen = new Set(p.map((x) => x.aktion));
  for (const erwartet of ['Anmeldung', 'Anmeldung fehlgeschlagen', 'Zugang angelegt', 'Zugang gesperrt', 'Zugang entsperrt', 'Anmeldung abgewiesen: Zugang gesperrt', 'Aufbewahrungsfrist geändert', 'Kurs angelegt']) {
    assert.ok(aktionen.has(erwartet), `fehlt im Protokoll: ${erwartet}`);
  }
  assert.ok(p.find((x) => x.aktion === 'Kurs angelegt').akteur === 'Gemeinsamer Schlüssel der Instanz');
  assert.ok(p.every((x) => x.rolle !== 'studierende'));
  const text = JSON.stringify(p);
  assert.ok(!text.includes('geheim-test') && !text.includes('admin-test') && !/[A-ZÄÖÜ][a-zäöüß]+-[A-ZÄÖÜ][a-zäöüß]+-\d\d/.test(text));
});

test('Ton: Einstellung je Person, aus, bis man sie einschaltet', async () => {
  const s = await studierende(t.basis);
  assert.equal((await s('GET', '/api/ich')).json.ton, false);
  assert.equal((await s('PUT', '/api/ich/einstellungen', { ton: true })).status, 200);
  assert.equal((await s('GET', '/api/ich')).json.ton, true);
  assert.equal((await s('PUT', '/api/ich/einstellungen', { ton: 'laut' })).status, 400);
  assert.equal((await client(t.basis)('PUT', '/api/ich/einstellungen', { ton: true })).status, 401);
});

test('Datenbank aus Version 0.1 wird übernommen: Daten bleiben, Fremdschlüssel gelten, bisheriger Lehrenden-Zugang bleibt', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'sbk-alt-'));
  const pfad = join(dir, 'alt.sqlite');
  try {
    const alt = new DatabaseSync(pfad);
    alt.exec('PRAGMA foreign_keys = ON');
    alt.exec(SCHEMA[0]);
    alt.exec('CREATE TABLE schema_version (version INTEGER NOT NULL); INSERT INTO schema_version VALUES (1)');
    const jetzt = new Date().toISOString();
    alt.prepare("INSERT INTO kurs (id, name, code, erstellt) VALUES (1, 'Alt', 'ALTKURS1', ?)").run(jetzt);
    alt.prepare("INSERT INTO nutzer (id, rolle, pseudonym, kurs_id, erstellt, zuletzt) VALUES (1, 'lehrende', 'Kluge-Eule-11', NULL, ?, ?), (2, 'studierende', 'Flinke-Otter-22', 1, ?, ?)").run(jetzt, jetzt, jetzt, jetzt);
    alt.prepare("INSERT INTO sitzung (token_hash, nutzer_id, ablauf) VALUES ('x', 2, ?)").run(jetzt);
    alt.close();

    const db = oeffne(pfad);
    assert.equal(db.prepare('SELECT max(version) AS v FROM schema_version').get().v, SCHEMA_VERSION);
    assert.equal(db.prepare('SELECT count(*) AS n FROM nutzer').get().n, 2);
    assert.equal(db.prepare('SELECT ton FROM nutzer WHERE id = 2').get().ton, 0);
    db.prepare("INSERT INTO nutzer (rolle, pseudonym, erstellt, zuletzt) VALUES ('admin', 'Weise-Igel-33', ?, ?)").run(jetzt, jetzt);
    assert.throws(() => db.prepare("INSERT INTO sitzung (token_hash, nutzer_id, ablauf) VALUES ('y', 999, ?)").run(jetzt), /FOREIGN KEY/);
    db.prepare('DELETE FROM nutzer WHERE id = 2').run();
    assert.equal(db.prepare('SELECT count(*) AS n FROM sitzung').get().n, 0, 'Löschen greift weiter auf Sitzungen durch');
    db.close();

    const neu = await starteApp({ datenbank: pfad });
    const an = await client(neu.basis)('POST', '/api/anmelden/lehrende', { schluessel: 'geheim-test' });
    assert.equal(an.json.pseudonym, 'Kluge-Eule-11', 'der bisherige Lehrenden-Zugang bleibt derselbe');
    await neu.stop();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
