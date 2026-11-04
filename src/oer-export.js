// OER-Export: ein Szenario als eine einzige HTML-Datei, die ohne Server und ohne Internet läuft (Doppelklick
// genügt), mit Lizenzhinweis und AMB-Metadaten. Die Module werden ohne Build-Werkzeug zusammengefügt: jedes Modul
// wird in eine Funktion verpackt, Importe werden zu Zugriffen auf die exportierten Namen.

import { readFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve, relative, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ambMetadaten, lizenzhinweis, lizenzUrl } from './engine/oer.js';
import { MEDIENTYPEN } from './server/inhalte.js';

const SRC = dirname(fileURLToPath(import.meta.url));
const IMPORT = /^import\s*\{([^}]*)\}\s*from\s*'([^']+)';[ \t]*$/gm;
const EXPORT = /^export\s+(?:async\s+)?(?:function|const|let|class)\s+([A-Za-z_$][\w$]*)/gm;

/** Fügt ein ES-Modul und alle seine Abhängigkeiten zu einem Skript zusammen. */
export function buendle(einstieg) {
  const reihenfolge = [];
  const besucht = new Set();
  const besuche = (datei) => {
    if (besucht.has(datei)) return;
    besucht.add(datei);
    const code = readFileSync(datei, 'utf8');
    for (const m of code.matchAll(IMPORT)) besuche(resolve(dirname(datei), m[2]));
    reihenfolge.push(datei);
  };
  besuche(resolve(einstieg));
  const teile = reihenfolge.map((datei) => {
    const schluessel = relative(SRC, datei);
    let code = readFileSync(datei, 'utf8');
    if (/^export\s+(default|\*|\{)/m.test(code)) throw new Error(`${schluessel}: nur benannte Exporte werden unterstützt`);
    const namen = [...code.matchAll(EXPORT)].map((m) => m[1]);
    code = code.replace(IMPORT, (_, liste, pfad) => {
      const ziel = relative(SRC, resolve(dirname(datei), pfad));
      return `const {${liste.replace(/\s+as\s+/g, ': ')}} = __module[${JSON.stringify(ziel)}];`;
    }).replace(/^export\s+/gm, '');
    return `__module[${JSON.stringify(schluessel)}] = (() => {\n${code}\nreturn { ${namen.join(', ')} };\n})();`;
  });
  return `(() => {\n'use strict';\nconst __module = {};\n${teile.join('\n')}\n})();`;
}

function medienAlsDaten(szenario, verzeichnis) {
  const out = {};
  for (const k of Object.values(szenario.knoten)) {
    const datei = k.bild?.datei;
    if (!datei || out[datei]) continue;
    const pfad = resolve(verzeichnis, datei);
    const typ = MEDIENTYPEN[extname(pfad).toLowerCase()];
    if (!typ || !pfad.startsWith(resolve(verzeichnis)) || !existsSync(pfad)) continue;
    out[datei] = `data:${typ};base64,${readFileSync(pfad).toString('base64')}`;
  }
  return out;
}

const json = (x) => JSON.stringify(x).replace(/</g, '\\u003c');
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/**
 * @param {object} szenario
 * @param {object} o  { medienVerzeichnis, basisUrl, url (Veröffentlichungsadresse, optional), datum }
 * @returns {{ html: string, metadaten: object }}
 */
export function oerPaket(szenario, { medienVerzeichnis, basisUrl = 'http://localhost:8080', url, datum = new Date().toISOString().slice(0, 10) }) {
  const id = url ?? `${basisUrl}/oer/${szenario.id}-v${szenario.version}.html`;
  const metadaten = ambMetadaten(szenario, { id, datum });
  const css = readFileSync(join(SRC, 'web/styles.css'), 'utf8');
  const skript = buendle(join(SRC, 'web/offline.js'));
  const html = `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(szenario.titel)}</title>
<meta name="description" content="${esc(szenario.kurzbeschreibung)}">
<meta name="license" content="${esc(lizenzUrl(szenario.lizenz))}">
<script type="application/ld+json">${json(metadaten)}</script>
<style>${css}</style>
</head>
<body>
<header class="leiste"><span class="marke"><span class="marke-zeichen" aria-hidden="true">◆</span> ${esc(szenario.titel)}</span></header>
<main id="inhalt" class="inhalt"><noscript><p class="karte">Dieses Lernspiel braucht JavaScript.</p></noscript></main>
<footer class="fuss">${esc(lizenzhinweis(szenario))}. Offline-Fassung, Fortschritt bleibt auf diesem Gerät. Erstellt mit dem Spielbaukasten (AGPL-3.0).</footer>
<script type="application/json" id="szenario-daten">${json(szenario)}</script>
<script type="application/json" id="medien-daten">${json(medienAlsDaten(szenario, medienVerzeichnis))}</script>
<script>${skript}</script>
</body>
</html>
`;
  return { html, metadaten };
}
