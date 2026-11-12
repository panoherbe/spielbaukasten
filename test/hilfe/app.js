// Für die Schnittstellentests: eine eigene Instanz mit leerer Datenbank und ein „Browser“ mit eigener Sitzung.

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { erstelleApp } from '../../src/server/app.js';

const stumm = { info() {}, warn() {}, error() {} };

export async function starteApp(extra = {}) {
  const verzeichnis = mkdtempSync(join(tmpdir(), 'sbk-'));
  const app = erstelleApp({
    datenbank: join(verzeichnis, 'test.sqlite'), inhalte: fileURLToPath(new URL('../../inhalte/szenarien', import.meta.url)),
    lehrendeSchluessel: 'geheim-test', adminSchluessel: 'admin-test', demoKurscode: 'DEMO', aufbewahrungTage: 180, minGruppe: 3,
    basisUrl: 'http://test.local', log: stumm, version: 'test', ...extra,
  });
  await new Promise((ok) => app.server.listen(0, '127.0.0.1', ok));
  const basis = `http://127.0.0.1:${app.server.address().port}`;
  return {
    app, basis,
    client: () => client(basis),
    stop: async () => { await app.schliesse(); rmSync(verzeichnis, { recursive: true, force: true }); },
  };
}

export function client(basis) {
  let cookie = '';
  const c = async (methode, pfad, daten, kopf = {}) => {
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
  /** Server-Sent Events lesen: liefert { naechstes(), schliesse() }; naechstes() wartet auf das nächste „stand“. */
  c.live = async (pfad) => {
    const ab = new AbortController();
    const r = await fetch(basis + pfad, { headers: { Cookie: cookie }, signal: ab.signal });
    if (r.status !== 200) { const t = await r.text(); return { status: r.status, text: t }; }
    const leser = r.body.getReader();
    const dec = new TextDecoder();
    let puffer = '';
    const warteschlange = [];
    const wartende = [];
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
            const daten = block.split('\n').filter((z) => z.startsWith('data: ')).map((z) => z.slice(6)).join('\n');
            if (/^event: stand$/m.test(block) && daten) {
              const stand = JSON.parse(daten);
              if (wartende.length) wartende.shift()(stand); else warteschlange.push(stand);
            }
          }
        }
      } catch { /* abgebrochen */ }
    })();
    return {
      status: 200, typ: r.headers.get('content-type'),
      naechstes: (ms = 3000) => (warteschlange.length ? Promise.resolve(warteschlange.shift()) : new Promise((ok, f) => {
        const t = setTimeout(() => f(new Error('Kein Live-Stand angekommen')), ms);
        wartende.push((s) => { clearTimeout(t); ok(s); });
      })),
      /** Wartet auf einen Stand, für den `bedingung` wahr ist (ältere werden übersprungen). */
      async bis(bedingung, ms = 3000) { for (;;) { const s = await this.naechstes(ms); if (bedingung(s)) return s; } },
      schliesse: () => ab.abort(),
    };
  };
  return c;
}

export async function studierende(basis, kurscode = 'DEMO') {
  const c = client(basis);
  const r = await c('POST', '/api/anmelden/studierende', { kurscode });
  if (r.status !== 201) throw new Error(`Beitritt: ${r.status} ${r.text}`);
  return Object.assign(c, { pseudonym: r.json.pseudonym });
}

export async function lehrende(basis, schluessel = 'geheim-test') {
  const c = client(basis);
  const r = await c('POST', '/api/anmelden/lehrende', { schluessel });
  if (r.status !== 200) throw new Error(`Anmeldung Lehrende: ${r.status} ${r.text}`);
  return c;
}
