// Szenario-Editor: öffnen, prüfen, als neue Version speichern (alte bleibt), Konflikte, neues Szenario, Vorschau.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { starteApp, studierende, lehrende } from './hilfe/app.js';
import { szenario as ladeSzenario } from '../src/server/inhalte.js';
import { pruefeSzenario } from '../src/engine/szenario.js';
import { ausVorlage } from '../src/web/vorlagen.js';

let t;
before(async () => { t = await starteApp(); });
after(async () => { await t.stop(); });

test('Editor: öffnen, Titel ändern, als neue Version speichern; die alte Version bleibt, neue Versuche nehmen die neue', async () => {
  const l = await lehrende(t.basis);
  const offen = (await l('GET', '/api/lehrende/szenarien/spannungsteiler')).json;
  assert.equal(offen.szenario.version, 2);
  assert.deepEqual(offen.versionen.map((v) => [v.version, v.quelle]), [[2, 'datei']]);
  assert.ok(offen.medien.includes('medien/aufbau.svg'), 'Bilder des Ordners für die Bildauswahl');

  const entwurf = structuredClone(offen.szenario);
  entwurf.titel = 'Übung: Spannungsteiler im Praktikum';
  entwurf.knoten.aufbau.optionen[0].text = 'Messung vorbereiten';
  const r = await l('POST', '/api/lehrende/szenarien/spannungsteiler/versionen', { szenario: entwurf, basis: 2 });
  assert.equal(r.status, 201, r.text);
  assert.equal(r.json.version, 3);

  const danach = (await l('GET', '/api/lehrende/szenarien/spannungsteiler')).json;
  assert.equal(danach.szenario.titel, 'Übung: Spannungsteiler im Praktikum');
  assert.deepEqual(danach.versionen.map((v) => [v.version, v.quelle]), [[3, 'editor'], [2, 'datei']]);
  assert.equal(ladeSzenario(t.app.db, 'spannungsteiler', 2).titel, 'Übung: Spannungsteiler am Sensor', 'Version 2 unverändert');

  const s = await studierende(t.basis);
  const v = (await s('POST', '/api/versuche', { szenario: 'spannungsteiler' })).json;
  assert.equal(v.szenario.version, 3);
  assert.equal(v.knoten.optionen[0].text, 'Messung vorbereiten');
});

test('Editor: Fehler mit Fundstelle, nichts gespeichert; veraltete Grundlage ergibt einen Konflikt', async () => {
  const l = await lehrende(t.basis);
  const offen = (await l('GET', '/api/lehrende/szenarien/fussgaengerbruecke')).json;
  const entwurf = structuredClone(offen.szenario);
  entwurf.knoten.diagonale.loesung = 'F / (2 * sind(teta))';
  entwurf.knoten.meldung.optionen[1].ziel = 'gibtsnicht';
  const pruef = (await l('POST', '/api/lehrende/szenarien/pruefen', entwurf)).json;
  assert.ok(pruef.fehler.some((f) => f.pfad === 'knoten.diagonale.loesung' && /„teta“/.test(f.meldung)));
  const r = await l('POST', '/api/lehrende/szenarien/fussgaengerbruecke/versionen', { szenario: entwurf, basis: offen.szenario.version });
  assert.equal(r.status, 422);
  assert.ok(r.json.fehler.some((f) => f.pfad === 'knoten.meldung' && /gibtsnicht/.test(f.meldung)));
  assert.equal((await l('GET', '/api/lehrende/szenarien/fussgaengerbruecke')).json.versionen.length, 1, 'nichts gespeichert');

  // Zwei Lehrende öffnen dieselbe Version; die zweite Speicherung darf die erste nicht überschreiben
  const gut = structuredClone(offen.szenario);
  gut.kurzbeschreibung += ' (überarbeitet)';
  assert.equal((await l('POST', '/api/lehrende/szenarien/fussgaengerbruecke/versionen', { szenario: gut, basis: offen.szenario.version })).status, 201);
  const spaet = await l('POST', '/api/lehrende/szenarien/fussgaengerbruecke/versionen', { szenario: gut, basis: offen.szenario.version });
  assert.equal(spaet.status, 409);
  assert.match(spaet.json.fehler[0].meldung, /Inzwischen gibt es Version 3/);
});

test('Editor: neues Szenario aus einer Vorlage; dieselbe Kennung lässt sich nicht doppelt vergeben', async () => {
  const l = await lehrende(t.basis);
  const vorhanden = (await l('GET', '/api/lehrende/szenarien')).json.map((x) => x.id);
  const neu = ausVorlage('quiz', { titel: 'Quiz: Knotenpunktverfahren', urheber: 'Lehrstuhl Statik', vorhanden });
  assert.equal(neu.id, 'quiz-knotenpunktverfahren', 'Kennung aus dem Titel');
  assert.deepEqual(pruefeSzenario(neu), { fehler: [], warnungen: [] }, 'Vorlage ist sofort fehlerfrei');
  const r = await l('POST', `/api/lehrende/szenarien/${neu.id}/versionen`, { szenario: neu, basis: 0 });
  assert.equal(r.status, 201, r.text);
  assert.equal(r.json.version, 1);
  const doppelt = await l('POST', `/api/lehrende/szenarien/${neu.id}/versionen`, { szenario: neu, basis: 0 });
  assert.equal(doppelt.status, 409);
  assert.match(doppelt.json.fehler[0].meldung, /schon vergeben/);
  const liste = (await l('GET', '/api/lehrende/szenarien')).json;
  assert.equal(liste.find((x) => x.id === neu.id).quelle, 'editor');
  // Ein zweites Szenario mit demselben Titel bekommt eine eigene Kennung
  const zweites = ausVorlage('quiz', { titel: 'Quiz: Knotenpunktverfahren', urheber: 'Lehrstuhl Statik', vorhanden: liste.map((x) => x.id) });
  assert.equal(zweites.id, 'quiz-knotenpunktverfahren-2');
});

test('Vorschau: Entwurf als Offline-Fassung im neuen Tab, ohne Speichern, mit Content-Security-Policy über Prüfsummen', async () => {
  const l = await lehrende(t.basis);
  const entwurf = (await l('GET', '/api/lehrende/szenarien/fussgaengerbruecke')).json.szenario;
  const vorher = (await l('GET', '/api/lehrende/szenarien/fussgaengerbruecke')).json.versionen.length;
  entwurf.titel = 'Entwurf: Riss an der Brücke';
  const r = await l('POST', '/api/lehrende/vorschau', { szenario: entwurf });
  assert.equal(r.status, 201, r.text);
  const seite = await l('GET', r.json.adresse);
  assert.equal(seite.status, 200);
  assert.match(seite.kopf.get('content-type'), /text\/html/);
  assert.match(seite.text, /<title>Vorschau: Entwurf: Riss an der Brücke<\/title>/);
  assert.match(seite.text, /data:image\/svg\+xml;base64,/, 'Bilder eingebettet');
  const csp = seite.kopf.get('content-security-policy');
  assert.doesNotMatch(csp, /unsafe-inline/);
  const skript = /<script>([\s\S]*?)<\/script>\n<\/body>/.exec(seite.text)[1];
  assert.ok(csp.includes(`'sha256-${createHash('sha256').update(skript).digest('base64')}'`), 'Prüfsumme des Skripts steht in der Richtlinie');
  assert.equal((await l('GET', '/api/lehrende/szenarien/fussgaengerbruecke')).json.versionen.length, vorher, 'Vorschau speichert nichts');
  entwurf.start = 'gibtsnicht';
  assert.equal((await l('POST', '/api/lehrende/vorschau', { szenario: entwurf })).status, 422);
  assert.equal((await l('GET', '/api/lehrende/vorschau/00000000-0000-0000-0000-000000000000')).status, 404);
});

test('Studierende erreichen weder Editor noch Vorschau', async () => {
  const s = await studierende(t.basis);
  assert.equal((await s('GET', '/api/lehrende/szenarien/spannungsteiler')).status, 403);
  assert.equal((await s('POST', '/api/lehrende/szenarien/spannungsteiler/versionen', { szenario: {}, basis: 0 })).status, 403);
  assert.equal((await s('POST', '/api/lehrende/vorschau', { szenario: {} })).status, 403);
});
