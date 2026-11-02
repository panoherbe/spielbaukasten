// Kommandozeile: OER-Export eines Szenarios aus inhalte/szenarien/.
//   node tools/oer-export.js fussgaengerbruecke [--ziel export] [--url https://…/fussgaengerbruecke-v1.html]

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { oerPaket } from '../src/oer-export.js';
import { pruefeSzenario } from '../src/engine/szenario.js';

const { values, positionals } = parseArgs({ allowPositionals: true, options: { ziel: { type: 'string', default: 'export' }, url: { type: 'string' }, inhalte: { type: 'string', default: 'inhalte/szenarien' } } });
if (positionals.length !== 1) { console.error('Aufruf: node tools/oer-export.js <szenario-id> [--ziel export] [--url …]'); process.exit(2); }
const verzeichnis = resolve(values.inhalte, positionals[0]);
const s = JSON.parse(readFileSync(join(verzeichnis, 'szenario.json'), 'utf8'));
const { fehler } = pruefeSzenario(s);
if (fehler.length) { for (const f of fehler) console.error(`${f.pfad}: ${f.meldung}`); process.exit(1); }
const { html, metadaten } = oerPaket(s, { medienVerzeichnis: verzeichnis, url: values.url });
mkdirSync(values.ziel, { recursive: true });
const name = `${s.id}-v${s.version}`;
writeFileSync(join(values.ziel, `${name}.html`), html);
writeFileSync(join(values.ziel, `${name}.metadaten.json`), JSON.stringify(metadaten, null, 2) + '\n');
console.log(`${join(values.ziel, name)}.html (${Math.round(html.length / 1024)} KB) und .metadaten.json geschrieben`);
