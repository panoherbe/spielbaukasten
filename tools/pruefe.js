// Kommandozeile: Szenario-Dateien prüfen, bevor sie in den Kurs gehen.
//   node tools/pruefe.js inhalte/szenarien/*/szenario.json

import { readFileSync } from 'node:fs';
import { pruefeSzenario } from '../src/engine/szenario.js';

let fehlerGesamt = 0;
for (const datei of process.argv.slice(2)) {
  let s;
  try { s = JSON.parse(readFileSync(datei, 'utf8')); } catch (e) { console.log(`✗ ${datei}: ${e.message}`); fehlerGesamt++; continue; }
  const { fehler, warnungen } = pruefeSzenario(s);
  fehlerGesamt += fehler.length;
  console.log(`${fehler.length ? '✗' : '✓'} ${datei}: ${fehler.length} Fehler, ${warnungen.length} Hinweise`);
  for (const f of fehler) console.log(`   Fehler   ${f.pfad}: ${f.meldung}`);
  for (const w of warnungen) console.log(`   Hinweis  ${w.pfad}: ${w.meldung}`);
}
process.exit(fehlerGesamt ? 1 : 0);
