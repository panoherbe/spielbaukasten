// Lasttest: viele Studierende spielen gleichzeitig das Brückenszenario über die echte Schnittstelle.
//   node test/last.js http://localhost:8080 DEMO 200 [Streuung]
// Jede virtuelle Person tritt bei, lädt die Übersicht, startet einen Versuch und spielt ihn zu Ende (30 % der
// Rechenaufgaben zuerst falsch). Gemessen wird jede einzelne Anfrage. Mit Streuung (0…1) wählt dieser Anteil der
// Entscheidungen eine zufällige Option, damit eine Demo-Auswertung verschiedene Wege zeigt.

import { neuerLoeser } from './hilfe/loeser.js';

function perzentil(sortiert, p) {
  if (!sortiert.length) return null;
  return sortiert[Math.min(sortiert.length - 1, Math.floor((p / 100) * sortiert.length))];
}

export async function lasttest({ basis, kurscode, personen, szenario = 'fussgaengerbruecke', denkzeitMs = null, wahlStreuung = 0 }) {
  const pause = () => (denkzeitMs ? new Promise((r) => setTimeout(r, denkzeitMs[0] + Math.random() * (denkzeitMs[1] - denkzeitMs[0]))) : null);
  const zeiten = [];
  let fehler = 0;
  const ergebnisse = {};
  async function anfrage(cookie, methode, pfad, daten) {
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
    if (!r.ok) { fehler++; throw new Error(`${methode} ${pfad}: ${r.status} ${text}`); }
    return JSON.parse(text);
  }
  async function person() {
    const cookie = {};
    const loeser = neuerLoeser({ fehlerquote: 0.3, wahlStreuung });
    await anfrage(cookie, 'POST', '/api/anmelden/studierende', { kurscode });
    await anfrage(cookie, 'GET', '/api/szenarien');
    await pause();
    let a = await anfrage(cookie, 'POST', '/api/versuche', { szenario });
    while (!a.beendet) {
      await pause();
      a = await anfrage(cookie, 'POST', `/api/versuche/${a.versuch}/ereignisse`, { nr: a.nr, ereignis: loeser(a) });
    }
    ergebnisse[a.ergebnis] = (ergebnisse[a.ergebnis] ?? 0) + 1;
  }
  const t0 = performance.now();
  const laeufe = await Promise.allSettled(Array.from({ length: personen }, person));
  const dauer = (performance.now() - t0) / 1000;
  const s = [...zeiten].sort((a, b) => a - b);
  const r1 = (x) => (x === null ? null : Math.round(x * 10) / 10);
  return {
    personen, denkzeitMs, anfragen: zeiten.length, fehler,
    abgebrochen: laeufe.filter((l) => l.status === 'rejected').length,
    ersterFehler: laeufe.find((l) => l.status === 'rejected')?.reason?.message ?? null,
    dauerSekunden: r1(dauer), anfragenJeSekunde: r1(zeiten.length / dauer),
    latenzMs: { p50: r1(perzentil(s, 50)), p95: r1(perzentil(s, 95)), p99: r1(perzentil(s, 99)), max: r1(s[s.length - 1]) },
    ergebnisse,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [basis = 'http://localhost:8080', kurscode = 'DEMO', personen = '100', streuung = '0'] = process.argv.slice(2);
  console.log(JSON.stringify(await lasttest({ basis, kurscode, personen: Number(personen), wahlStreuung: Number(streuung) }), null, 2));
}
