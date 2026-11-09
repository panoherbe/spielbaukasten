import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { oerPaket, buendle } from '../src/oer-export.js';

const verzeichnis = fileURLToPath(new URL('../inhalte/szenarien/fussgaengerbruecke/', import.meta.url));
const s = JSON.parse(readFileSync(verzeichnis + 'szenario.json', 'utf8'));

test('OER-Export ist eine einzige Datei ohne Nachladen von außen', () => {
  const { html } = oerPaket(s, { medienVerzeichnis: verzeichnis, url: 'https://beispiel.example/fussgaengerbruecke-v2.html', datum: '2026-11-03' });
  assert.ok(!/<(script|link|img)[^>]+(src|href)="(https?:)?\/\//.test(html), 'keine externen Skripte, Stile oder Bilder');
  assert.ok(!/\bimport\s*\{/.test(html), 'keine ES-Module-Importe übrig');
  assert.match(html, /data:image\/svg\+xml;base64,/);
  assert.match(html, /CC BY 4\.0/);
  assert.ok(html.length < 1024 * 1024, `Größe ${html.length}`); // mit allen Szenenbildern, Figur und Auszeichnungen
});

test('das gebündelte Skript ist gültiges JavaScript', () => {
  const code = buendle(fileURLToPath(new URL('../src/web/offline.js', import.meta.url)));
  assert.doesNotThrow(() => new Function(code));
});

test('Metadaten nach AMB mit offener Lizenz und Lernzielen', () => {
  const { metadaten } = oerPaket(s, { medienVerzeichnis: verzeichnis, url: 'https://beispiel.example/x.html', datum: '2026-11-03' });
  assert.equal(metadaten['@context'][0], 'https://w3id.org/kim/amb/context.jsonld');
  for (const feld of ['id', 'type', 'name', 'description', 'creator', 'license', 'inLanguage', 'learningResourceType']) assert.ok(metadaten[feld], feld);
  assert.deepEqual(metadaten.type, ['LearningResource']);
  assert.match(metadaten.description, /Knotengleichgewicht/);
});
