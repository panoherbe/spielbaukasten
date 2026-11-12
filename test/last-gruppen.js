// Lasttest für Teamspiel und Kursrunde: simulierte Studierende spielen das Brückenszenario gemeinsam über die echte
// Schnittstelle, jede Person mit eigener Live-Verbindung (Server-Sent Events).
//   node test/last-gruppen.js http://localhost:8080 DEMO <Schlüssel Lehrende> teams 50 3
//   node test/last-gruppen.js http://localhost:8080 DEMO <Schlüssel Lehrende> runde 200
// Gemessen werden jede Anfrage (Beitritt, Stimme …) und die Zeit vom letzten nötigen Klick einer Abstimmung, bis der
// neue Stand über die Live-Verbindung bei allen Mitgliedern (in der Runde auch bei der Lehrperson) angekommen ist.

import { neuerLoeser } from './hilfe/loeser.js';

const r1 = (x) => (x === null || x === undefined ? null : Math.round(x * 10) / 10);
function perzentile(werte) {
  const s = [...werte].sort((a, b) => a - b);
  const p = (q) => (s.length ? s[Math.min(s.length - 1, Math.floor((q / 100) * s.length))] : null);
  return { anzahl: s.length, p50: r1(p(50)), p95: r1(p(95)), p99: r1(p(99)), max: r1(s.at(-1)) };
}
const pause = ([a, b]) => new Promise((ok) => setTimeout(ok, a + Math.random() * (b - a)));

function messung(basis) {
  const zeiten = [];
  const zaehler = { fehler: 0, veraltet: 0 };
  async function anfrage(cookie, methode, pfad, daten, { erlaubt = [] } = {}) {
    const t0 = performance.now();
    const r = await fetch(basis + pfad, {
      method: methode,
      headers: { ...(daten ? { 'Content-Type': 'application/json' } : {}), ...(cookie.wert ? { Cookie: cookie.wert } : {}) },
      body: daten ? JSON.stringify(daten) : undefined,
    });
    const text = await r.text();
    zeiten.push(performance.now() - t0);
    const c = r.headers.get('set-cookie');
    if (c) cookie.wert = c.split(';')[0];
    if (erlaubt.includes(r.status)) { zaehler.veraltet++; return { status: r.status, json: JSON.parse(text) }; }
    if (!r.ok) { zaehler.fehler++; throw new Error(`${methode} ${pfad}: ${r.status} ${text}`); }
    return { status: r.status, json: JSON.parse(text) };
  }
  /** Live-Verbindung: ruft `auf(stand, zeitpunkt)` für jeden Stand auf. */
  async function live(cookie, pfad, auf) {
    const ab = new AbortController();
    const r = await fetch(basis + pfad, { headers: { Cookie: cookie.wert }, signal: ab.signal });
    if (r.status !== 200) { zaehler.fehler++; throw new Error(`Live ${pfad}: ${r.status}`); }
    const leser = r.body.getReader();
    const dec = new TextDecoder();
    let puffer = '';
    (async () => {
      try {
        for (;;) {
          const { value, done } = await leser.read();
          if (done) break;
          puffer += dec.decode(value, { stream: true });
          let i;
          while ((i = puffer.indexOf('\n\n')) >= 0) {
            const block = puffer.slice(0, i);
            puffer = puffer.slice(i + 2);
            const d = block.split('\n').filter((z) => z.startsWith('data: ')).map((z) => z.slice(6)).join('\n');
            if (/^event: stand$/m.test(block) && d) auf(JSON.parse(d), performance.now());
          }
        }
      } catch { /* geschlossen */ }
    })();
    return () => ab.abort();
  }
  return { zeiten, zaehler, anfrage, live };
}

/** Wartet, bis `pruefe()` wahr ist; geweckt wird bei jedem neuen Stand über die Live-Verbindung (`p.weck`). */
function bis(p, pruefe, ms = 30000) {
  if (pruefe()) return Promise.resolve();
  return new Promise((ok, fehler) => {
    const t = setTimeout(() => { p.weck = null; fehler(new Error('Kein neuer Stand über die Live-Verbindung')); }, ms);
    p.weck = () => { if (pruefe()) { clearTimeout(t); p.weck = null; ok(); } };
  });
}

/** Teams zu je `groesse` simulierten Personen spielen das Szenario bis zum Ende. */
export async function lasttestTeams({ basis, kurscode, teams = 50, groesse = 3, szenario = 'fussgaengerbruecke', denkzeitMs = [1000, 3000] }) {
  const m = messung(basis);
  const entscheidung = new Map(); // "gruppe/nr" → Zeitpunkt des letzten nötigen Klicks
  const ankunft = new Map(); // "gruppe/nr" → Zeitpunkte, zu denen Mitglieder den Stand nach dieser Entscheidung bekamen
  const ergebnisse = {};
  const t0 = performance.now();

  async function einTeam() {
    const leute = Array.from({ length: groesse }, () => ({ cookie: {}, stand: null, loeser: neuerLoeser({ fehlerquote: 0.3 }) }));
    for (const p of leute) await m.anfrage(p.cookie, 'POST', '/api/anmelden/studierende', { kurscode });
    const neu = (await m.anfrage(leute[0].cookie, 'POST', '/api/teams', { szenario })).json;
    for (const p of leute.slice(1)) await m.anfrage(p.cookie, 'POST', '/api/teams/beitreten', { code: neu.code });
    const gid = neu.id;
    const zu = [];
    for (const p of leute) {
      zu.push(await m.live(p.cookie, `/api/gruppen/${gid}/live`, (s, t) => {
        if (p.stand && s.nr > p.stand.nr) { const k = `${gid}/${s.nr - 1}`; (ankunft.get(k) ?? ankunft.set(k, []).get(k)).push(t); }
        if (!p.stand || s.nr >= p.stand.nr) p.stand = s;
        p.loeser.lies(s);
        p.weck?.();
      }));
    }
    for (const p of leute) await bis(p, () => p.stand);
    async function spielen(p) {
      while (!p.stand.beendet) {
        const nr = p.stand.nr;
        await pause(denkzeitMs);
        if (p.stand.nr !== nr || p.stand.beendet) continue; // inzwischen entschieden
        const e = p.loeser(p.stand);
        const t = performance.now();
        const r = await m.anfrage(p.cookie, 'POST', `/api/gruppen/${gid}/stimmen`, { nr, ereignis: e }, { erlaubt: [409] });
        if (r.json.rueckmeldung?.art === 'ungueltig' && r.json.nr === nr) { m.zaehler.fehler++; throw new Error(`ungültige Stimme: ${JSON.stringify(e)}`); }
        if (r.status === 200 && r.json.nr > nr) entscheidung.set(`${gid}/${nr}`, t);
        await bis(p, () => p.stand.nr > nr || p.stand.beendet, 60000);
      }
    }
    await Promise.all(leute.map(spielen));
    ergebnisse[leute[0].stand.ergebnis] = (ergebnisse[leute[0].stand.ergebnis] ?? 0) + 1;
    for (const z of zu) z();
  }

  const laeufe = await Promise.allSettled(Array.from({ length: teams }, einTeam));
  const dauer = (performance.now() - t0) / 1000;
  const zustellung = [...entscheidung].filter(([k]) => ankunft.get(k)?.length === groesse).map(([k, t]) => Math.max(...ankunft.get(k)) - t);
  return {
    art: 'teams', teams, groesse, personen: teams * groesse, denkzeitMs, anfragen: m.zeiten.length, fehler: m.zaehler.fehler, schonEntschieden409: m.zaehler.veraltet,
    abgebrochen: laeufe.filter((l) => l.status === 'rejected').length, ersterFehler: laeufe.find((l) => l.status === 'rejected')?.reason?.message ?? null,
    dauerSekunden: r1(dauer), anfragenJeSekunde: r1(m.zeiten.length / dauer), latenzMs: perzentile(m.zeiten),
    entscheidungen: entscheidung.size, zustellungAnAlleMs: perzentile(zustellung), ergebnisse,
  };
}

/** Eine Kursrunde: eine Lehrperson und `personen` simulierte Studierende; entschieden wird, wenn alle abgestimmt haben. */
export async function lasttestRunde({ basis, kurscode, schluessel, personen = 200, szenario = 'fussgaengerbruecke', denkzeitMs = [1000, 4000] }) {
  const m = messung(basis);
  const lehr = { cookie: {}, stand: null, staende: 0 };
  await m.anfrage(lehr.cookie, 'POST', '/api/anmelden/lehrende', { schluessel });
  const kurs = (await m.anfrage(lehr.cookie, 'GET', '/api/lehrende/kurse')).json.find((k) => k.code === kurscode.replace(/[^A-Z0-9]/gi, '').toUpperCase());
  const gid = (await m.anfrage(lehr.cookie, 'POST', '/api/lehrende/runden', { kurs: kurs.id, szenario })).json.id;
  const ankunftLehr = new Map();
  const zuLehr = await m.live(lehr.cookie, `/api/lehrende/runden/${gid}/live`, (s, t) => {
    lehr.staende++;
    if (lehr.stand && s.nr > lehr.stand.nr) ankunftLehr.set(s.nr - 1, t);
    if (!lehr.stand || s.nr >= lehr.stand.nr) lehr.stand = s;
    lehr.weck?.();
  });
  const leute = Array.from({ length: personen }, () => ({ cookie: {}, stand: null, loeser: neuerLoeser({ fehlerquote: 0.3, wahlStreuung: 0.2 }) }));
  const ankunft = new Map();
  const entscheidung = new Map();
  const zu = [];
  const t0 = performance.now();
  await Promise.all(leute.map(async (p) => {
    await m.anfrage(p.cookie, 'POST', '/api/anmelden/studierende', { kurscode });
    await m.anfrage(p.cookie, 'GET', '/api/gruppen');
    await m.anfrage(p.cookie, 'POST', `/api/runden/${gid}/beitreten`, {});
    zu.push(await m.live(p.cookie, `/api/gruppen/${gid}/live`, (s, t) => {
      if (p.stand && s.nr > p.stand.nr) { const k = s.nr - 1; (ankunft.get(k) ?? ankunft.set(k, []).get(k)).push(t); }
      if (!p.stand || s.nr >= p.stand.nr) p.stand = s;
      p.loeser.lies(s);
      p.weck?.();
    }));
  }));
  for (const p of leute) await bis(p, () => p.stand?.gruppe.mitglieder === personen);
  const beigetreten = (performance.now() - t0) / 1000;
  await Promise.all(leute.map(async (p) => {
    while (!p.stand.beendet) {
      const nr = p.stand.nr;
      await pause(denkzeitMs);
      const t = performance.now();
      const r = await m.anfrage(p.cookie, 'POST', `/api/gruppen/${gid}/stimmen`, { nr, ereignis: p.loeser(p.stand) }, { erlaubt: [409] });
      if (r.status === 200 && r.json.nr > nr) entscheidung.set(nr, t);
      await bis(p, () => p.stand.nr > nr || p.stand.beendet, 120000);
    }
  }));
  const dauer = (performance.now() - t0) / 1000;
  await bis(lehr, () => lehr.stand.beendet, 10000);
  for (const z of [...zu, zuLehr]) z();
  const zustellung = [...entscheidung].filter(([nr]) => ankunft.get(nr)?.length === personen).map(([nr, t]) => Math.max(...ankunft.get(nr)) - t);
  const zustellungLehr = [...entscheidung].filter(([nr]) => ankunftLehr.has(nr)).map(([nr, t]) => ankunftLehr.get(nr) - t);
  return {
    art: 'runde', personen, denkzeitMs, anfragen: m.zeiten.length, fehler: m.zaehler.fehler, schonEntschieden409: m.zaehler.veraltet,
    dauerSekunden: r1(dauer), beitrittAllerSekunden: r1(beigetreten), anfragenJeSekunde: r1(m.zeiten.length / dauer), latenzMs: perzentile(m.zeiten),
    entscheidungen: entscheidung.size, zustellungAnAlleMs: perzentile(zustellung), zustellungAnLehrendeMs: perzentile(zustellungLehr),
    liveStaendeLehrende: lehr.staende, ergebnis: lehr.stand.ergebnis, schritteSichtbar: lehr.stand.schritte.length,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [basis = 'http://localhost:8080', kurscode = 'DEMO', schluessel = 'demo-lehrende', art = 'teams', n = '50', groesse = '3'] = process.argv.slice(2);
  const r = art === 'runde' ? await lasttestRunde({ basis, kurscode, schluessel, personen: Number(n) }) : await lasttestTeams({ basis, kurscode, teams: Number(n), groesse: Number(groesse) });
  console.log(JSON.stringify(r, null, 2));
  process.exit(0);
}
