// Teamspiel und Kursrunde: gemeinsamer Ereignisstrom, Abstimmungsregel, Live-Stände über Server-Sent Events und die
// Mindestgruppe in der Live-Ansicht der Lehrenden.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { starteApp, studierende, lehrende } from './hilfe/app.js';
import { neuerLoeser } from './hilfe/loeser.js';

let t;
before(async () => { t = await starteApp(); });
after(async () => { await t.stop(); });

async function team(n, szenario = 'fussgaengerbruecke') {
  const mitglieder = [];
  for (let i = 0; i < n; i++) mitglieder.push(await studierende(t.basis));
  const neu = await mitglieder[0]('POST', '/api/teams', { szenario });
  assert.equal(neu.status, 201, neu.text);
  for (const m of mitglieder.slice(1)) {
    const r = await m('POST', '/api/teams/beitreten', { code: neu.json.code.toLowerCase() });
    assert.equal(r.status, 200, r.text);
    assert.equal(r.json.gruppe, neu.json.id);
  }
  return { id: neu.json.id, code: neu.json.code, m: mitglieder };
}

const stimme = (c, id, nr, ereignis) => c('POST', `/api/gruppen/${id}/stimmen`, { nr, ereignis });
const wahl = (option) => ({ typ: 'wahl', knoten: 'meldung', option });

test('Team: alle sehen denselben Stand; die Mehrheit entscheidet, und alle sind danach an derselben Stelle', async () => {
  const { id, m } = await team(3);
  const stand = await Promise.all(m.map((c) => c('GET', `/api/gruppen/${id}`).then((r) => r.json)));
  assert.deepEqual(stand.map((s) => [s.nr, s.knoten.id, s.gruppe.mitglieder]), [[0, 'meldung', 3], [0, 'meldung', 3], [0, 'meldung', 3]]);
  assert.deepEqual(stand.map((s) => s.gruppe.sprecher), [true, false, false], 'wer gegründet hat, spricht für das Team');

  let r = await stimme(m[0], id, 0, wahl('sperren'));
  assert.equal(r.json.nr, 0);
  assert.deepEqual(r.json.abstimmung.eigene, { typ: 'wahl', option: 'sperren' });
  r = await stimme(m[1], id, 0, wahl('offen_lassen'));
  assert.equal(r.json.nr, 0, '1 : 1 ist bei drei Mitgliedern noch keine Mehrheit');
  assert.deepEqual(r.json.abstimmung.optionen, { sperren: 1, offen_lassen: 1 });
  r = await stimme(m[2], id, 0, wahl('sperren'));
  assert.equal(r.json.nr, 1, '2 von 3: entschieden');
  assert.equal(r.json.knoten.id, 'pruefschritte');
  assert.equal(r.json.rueckmeldung.art, 'gut');
  assert.deepEqual(r.json.letzteAbstimmung, { stimmen: 3, von: 3, fuer: 2 });

  const bei2 = (await m[1]('GET', `/api/gruppen/${id}`)).json;
  assert.equal(bei2.nr, 1);
  assert.equal(bei2.knoten.id, 'pruefschritte');
  assert.equal(bei2.indikatoren.find((i) => i.id === 'sicherheit').wert, 70);
  const spaet = await stimme(m[1], id, 0, wahl('offen_lassen'));
  assert.equal(spaet.status, 409);
  assert.equal(spaet.json.stand.nr, 1);
  // Ein gemeinsamer Ereignisstrom, keine Einzelversuche
  assert.equal(t.app.db.prepare('SELECT count(*) AS n FROM gruppe_ereignis WHERE gruppe_id = ?').get(id).n, 1);
  assert.equal(t.app.db.prepare('SELECT count(*) AS n FROM versuch').get().n, 0);
});

test('Team: bei Gleichstand gilt die Möglichkeit, für die zuerst gestimmt wurde', async () => {
  const { id, m } = await team(2);
  await stimme(m[1], id, 0, wahl('offen_lassen'));
  const r = await stimme(m[0], id, 0, wahl('sperren'));
  assert.equal(r.json.nr, 1);
  assert.equal(r.json.rueckmeldung.art, 'schlecht', 'offen lassen kam zuerst');
  assert.equal(r.json.indikatoren.find((i) => i.id === 'sicherheit').wert, 35);
});

test('Team: nur wer gegründet hat, schließt die Abstimmung vorzeitig; ohne Stimme geht es nicht', async () => {
  const { id, m } = await team(3);
  assert.equal((await m[0]('POST', `/api/gruppen/${id}/schliessen`, { nr: 0 })).status, 409);
  await stimme(m[1], id, 0, wahl('sperren'));
  assert.equal((await m[1]('POST', `/api/gruppen/${id}/schliessen`, { nr: 0 })).status, 403);
  const r = await m[0]('POST', `/api/gruppen/${id}/schliessen`, { nr: 0 });
  assert.equal(r.status, 200);
  assert.equal(r.json.knoten.id, 'pruefschritte');
});

test('Team: Antworten zählen als gleich, wenn die Engine sie gleich bewertet; der Hinweis gilt sofort für alle', async () => {
  const { id, m } = await team(3);
  const loeser = neuerLoeser();
  let a = (await m[0]('GET', `/api/gruppen/${id}`)).json;
  while (a.knoten.id !== 'diagonale') {
    const e = loeser(a);
    for (const c of m) { const r = await stimme(c, id, a.nr, e); if (r.json.nr > a.nr) { a = r.json; break; } }
  }
  const richtig = loeser(a).antwort;
  const h = await stimme(m[1], id, a.nr, { typ: 'hinweis', knoten: 'diagonale' });
  assert.equal(h.json.nr, a.nr + 1);
  assert.ok(h.json.knoten.hinweis, 'Hinweis für alle sichtbar');
  a = h.json;
  await stimme(m[0], id, a.nr, { typ: 'antwort', knoten: 'diagonale', antwort: String(Number(richtig.replace(',', '.')) * 2).replace('.', ',') });
  const ungueltig = await stimme(m[1], id, a.nr, { typ: 'antwort', knoten: 'diagonale', antwort: 'zwanzig' });
  assert.equal(ungueltig.json.rueckmeldung.art, 'ungueltig', 'keine Zahl: keine Stimme');
  let r = await stimme(m[1], id, a.nr, { typ: 'antwort', knoten: 'diagonale', antwort: richtig });
  assert.equal(r.json.nr, a.nr);
  assert.equal(r.json.abstimmung.antworten.length, 2);
  r = await stimme(m[2], id, a.nr, { typ: 'antwort', knoten: 'diagonale', antwort: (Number(richtig.replace(',', '.')) * 1.002).toFixed(4) });
  assert.equal(r.json.nr, a.nr + 1, 'zwei richtige Antworten (verschieden geschrieben) sind die Mehrheit');
  assert.equal(r.json.rueckmeldung.art, 'richtig');
  assert.equal(r.json.punkte, 10 + 10 * 0.7, 'Hinweis kostet die Gruppe 30 % dieser Aufgabe');
});

test('Team: Fremde sehen nichts, und Team-Codes gelten nur im eigenen Kurs', async () => {
  const { id, code } = await team(1);
  const fremd = await studierende(t.basis);
  assert.equal((await fremd('GET', `/api/gruppen/${id}`)).status, 404);
  assert.equal((await stimme(fremd, id, 0, wahl('sperren'))).status, 404);
  assert.equal((await fremd('GET', `/api/gruppen/${id}/live`)).status, 404);
  const l = await lehrende(t.basis);
  const kurs = (await l('POST', '/api/lehrende/kurse', { name: 'Anderer Kurs', szenarien: ['fussgaengerbruecke'] })).json;
  const anders = await studierende(t.basis, kurs.code);
  assert.equal((await anders('POST', '/api/teams/beitreten', { code })).status, 404);
});

test('Live: Server-Sent Events bringen jede Stimme und jede Entscheidung zu allen im Team', async () => {
  const { id, m } = await team(3);
  const live = await m[0].live(`/api/gruppen/${id}/live`);
  assert.equal(live.status, 200);
  assert.match(live.typ, /text\/event-stream/);
  assert.equal((await live.naechstes()).abstimmung.stimmen, 0);
  await stimme(m[1], id, 0, wahl('sperren'));
  const s1 = await live.bis((s) => s.abstimmung.stimmen === 1);
  assert.equal(s1.abstimmung.eigene, null, 'die Stimme der anderen ist nicht die eigene');
  await stimme(m[2], id, 0, wahl('sperren'));
  const s2 = await live.bis((s) => s.nr === 1);
  assert.equal(s2.knoten.id, 'pruefschritte');
  assert.equal(s2.rueckmeldung.art, 'gut', 'nach einer Entscheidung kommt die Rückmeldung mit');
  live.schliesse();
});

test('Kursrunde: Lehrende sehen Summen erst ab drei Stimmen, ohne Pseudonyme; sie schließen die Abstimmung', async () => {
  const l = await lehrende(t.basis);
  const demo = (await l('GET', '/api/lehrende/kurse')).json.find((k) => k.code === 'DEMO');
  const start = await l('POST', '/api/lehrende/runden', { kurs: demo.id, szenario: 'fussgaengerbruecke' });
  assert.equal(start.status, 201, start.text);
  const id = start.json.id;
  const lehrLive = await l.live(`/api/lehrende/runden/${id}/live`);
  assert.equal(lehrLive.status, 200);
  await lehrLive.naechstes();

  const s = [];
  for (let i = 0; i < 4; i++) {
    const c = await studierende(t.basis);
    assert.ok((await c('GET', '/api/gruppen')).json.runden.some((r) => r.id === id), 'Runde steht in der Übersicht');
    assert.equal((await c('POST', `/api/runden/${id}/beitreten`, {})).status, 200);
    s.push(c);
  }
  await stimme(s[0], id, 0, wahl('sperren'));
  const zwei = await stimme(s[1], id, 0, wahl('offen_lassen'));
  assert.equal(zwei.json.abstimmung.optionen, undefined, 'in der Kursrunde sehen Studierende keine Verteilung');
  let r = (await l('GET', `/api/lehrende/runden/${id}`)).json;
  assert.equal(r.teilnehmende, 4);
  assert.equal(r.schritte[0].stimmen, 2);
  assert.equal(r.schritte[0].zuWenig, true);
  assert.equal(r.schritte[0].verteilung, null);

  const drei = await stimme(s[2], id, 0, wahl('sperren'));
  assert.equal(drei.json.nr, 0, 'in der Kursrunde entscheidet keine vorzeitige Mehrheit');
  const live = await lehrLive.bis((x) => x.abgestimmt === 3);
  assert.deepEqual(live.schritte[0].verteilung.map((v) => [v.bewertung, v.n]), [['gut', 2], ['schlecht', 1]]);
  assert.ok(!/[A-ZÄÖÜ][a-zäöüß]+-[A-ZÄÖÜ][a-zäöüß]+-\d\d/.test(JSON.stringify(live)), 'keine Pseudonyme in der Live-Ansicht');

  assert.equal((await s[0]('POST', `/api/gruppen/${id}/schliessen`, { nr: 0 })).status, 403, 'Studierende schließen keine Kursrunde');
  r = (await l('POST', `/api/lehrende/runden/${id}/schliessen`, { nr: 0 })).json;
  assert.equal(r.nr, 1);
  assert.equal(r.schritte[1].entschieden.fuer, 2);
  assert.match(r.schritte[1].entschieden.text, /sperren/);
  assert.equal((await s[3]('GET', `/api/gruppen/${id}`)).json.knoten.id, 'pruefschritte', 'auch wer nicht abgestimmt hat, ist weiter');

  // Mit weniger als drei Stimmen bleibt auch die Entscheidung verborgen
  const loeser = neuerLoeser();
  const a = (await s[0]('GET', `/api/gruppen/${id}`)).json;
  await stimme(s[0], id, 1, loeser(a));
  r = (await l('POST', `/api/lehrende/runden/${id}/schliessen`, { nr: 1 })).json;
  assert.equal(r.schritte[1].entschieden, null);
  assert.equal(r.schritte[1].zuWenig, true);

  assert.equal((await s[0]('GET', `/api/lehrende/runden/${id}`)).status, 403);
  assert.equal((await l('POST', `/api/lehrende/runden/${id}/beenden`, {})).json.runde.status, 'beendet');
  assert.equal((await stimme(s[1], id, 2, { typ: 'wahl', knoten: 'modell', option: 'rechnen' })).status, 409);
  assert.ok(!(await s[1]('GET', '/api/gruppen')).json.runden.some((x) => x.id === id), 'beendete Runde verschwindet aus der Übersicht');
  lehrLive.schliesse();
});

test('Kursrunde: nur für den eigenen Kurs und nur mit freigegebenem Szenario', async () => {
  const l = await lehrende(t.basis);
  const kurs = (await l('POST', '/api/lehrende/kurse', { name: 'Nur Sensor', szenarien: ['spannungsteiler'] })).json;
  assert.equal((await l('POST', '/api/lehrende/runden', { kurs: kurs.id, szenario: 'fussgaengerbruecke' })).status, 400);
  const id = (await l('POST', '/api/lehrende/runden', { kurs: kurs.id, szenario: 'spannungsteiler' })).json.id;
  const demo = await studierende(t.basis);
  assert.equal((await demo('POST', `/api/runden/${id}/beitreten`, {})).status, 404);
  assert.equal((await demo('GET', `/api/gruppen/${id}`)).status, 404);
});

test('Meine Daten enthalten Teams und eigene Stimmen; Löschen entfernt die Stimmen, der Teamstand bleibt', async () => {
  const { id, m } = await team(2);
  await stimme(m[0], id, 0, wahl('sperren'));
  const d = (await m[0]('GET', '/api/ich/daten')).json;
  assert.equal(d.gruppen.length, 1);
  assert.equal(d.gruppen[0].stimmen[0].daten.option, 'sperren');
  assert.equal((await m[0]('DELETE', '/api/ich')).status, 200);
  assert.equal(t.app.db.prepare('SELECT count(*) AS n FROM stimme WHERE gruppe_id = ?').get(id).n, 0);
  assert.equal((await m[1]('GET', `/api/gruppen/${id}`)).json.gruppe.mitglieder, 1);
});
