// Startpunkt: liest die Einstellungen aus Umgebungsvariablen (siehe README, Abschnitt „Einstellungen“).

import { mkdirSync, readFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { erstelleApp } from './app.js';

const WURZEL = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const env = process.env;
const daten = resolve(env.SBK_DATEN ?? join(WURZEL, 'daten'));
mkdirSync(daten, { recursive: true });

let schluessel = env.SBK_LEHRENDE_SCHLUESSEL;
if (!schluessel) {
  schluessel = randomBytes(12).toString('base64url');
  console.log(`Kein SBK_LEHRENDE_SCHLUESSEL gesetzt. Schlüssel für diesen Lauf: ${schluessel}`);
}
const port = Number(env.PORT ?? 8080);

const app = erstelleApp({
  datenbank: join(daten, 'spielbaukasten.sqlite'),
  inhalte: resolve(env.SBK_INHALTE ?? join(WURZEL, 'inhalte/szenarien')),
  lehrendeSchluessel: schluessel,
  demoKurscode: env.SBK_DEMO_KURSCODE || null,
  aufbewahrungTage: Number(env.SBK_AUFBEWAHRUNG_TAGE ?? 180),
  minGruppe: Number(env.SBK_MIN_GRUPPE ?? 3),
  basisUrl: (env.SBK_BASIS_URL ?? `http://localhost:${port}`).replace(/\/$/, ''),
  sichereCookies: env.SBK_SICHERE_COOKIES === '1',
  zugriffsprotokoll: env.SBK_ZUGRIFFSPROTOKOLL === '1',
  version: JSON.parse(readFileSync(join(WURZEL, 'package.json'), 'utf8')).version,
});

const { geladen, unveraendert, abgelehnt } = app.bericht;
console.log(`Szenarien: ${geladen.length} neu, ${unveraendert.length} unverändert, ${abgelehnt.length} abgelehnt`);
app.server.listen(port, env.HOST ?? '0.0.0.0', () => {
  console.log(`Spielbaukasten läuft: http://localhost:${port}  (Lehrende: http://localhost:${port}/lehrende)`);
  if (env.SBK_DEMO_KURSCODE) console.log(`Kurscode des Demokurses: ${env.SBK_DEMO_KURSCODE}`);
});

for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => app.schliesse().then(() => process.exit(0)));
