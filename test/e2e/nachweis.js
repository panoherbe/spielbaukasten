// Nachweis-Messung: Lasttest, dann Ende-zu-Ende im echten Browser (Chrome headless über CDP), auf Desktop- und
// Telefonbreite, mit Barrierefreiheitsprüfung (axe-core) und Bildschirmfotos; zuletzt die Offline-Fassung (OER).
// Schreibt nachweis/messwerte.json und nachweis/bilder/*.png. Aufruf über compose.nachweis.yaml.

import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { Cdp } from './cdp.js';
import { lasttest } from '../last.js';
import { neuerLoeser } from '../hilfe/loeser.js';

const APP = process.env.APP_URL ?? 'http://spielbaukasten:8080';
const AUSGABE = process.env.AUSGABE ?? 'nachweis';
const EXPORT = process.env.EXPORT_DIR ?? '/export';
const AXE_URL = 'https://cdn.jsdelivr.net/npm/axe-core@4.10.2/axe.min.js';
const messwerte = { zeitpunkt: new Date().toISOString(), app: APP, umgebung: {}, last: [], browser: {}, barrierefreiheit: {}, offline: {} };
mkdirSync(`${AUSGABE}/bilder`, { recursive: true });

let axeQuelle = null;
try {
  axeQuelle = await (await fetch(AXE_URL)).text();
  messwerte.umgebung.axe = AXE_URL;
} catch (e) {
  messwerte.umgebung.axe = `nicht geladen: ${e.message}`;
}

async function pruefeBarrierefreiheit(seite, name) {
  if (!axeQuelle) return;
  if (!(await seite.werte('typeof axe !== "undefined"'))) await seite.werte(axeQuelle + ';true');
  const r = await seite.werte(`axe.run(document, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] })
    .then((r) => ({ verstoesse: r.violations.map((v) => ({ id: v.id, auswirkung: v.impact, stellen: v.nodes.length, beispiel: v.nodes[0]?.target?.join(' ') })), bestanden: r.passes.length }))`);
  messwerte.barrierefreiheit[name] = r;
}

async function foto(seite, name) {
  await seite.werte(`document.getElementById('meldung')?.classList.remove('sichtbar'); true`);
  await new Promise((r) => setTimeout(r, 300));
  writeFileSync(`${AUSGABE}/bilder/${name}.png`, await seite.bild());
}

async function geraet(seite, art) {
  if (art === 'telefon') {
    await seite.sende('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
    await seite.sende('Emulation.setTouchEmulationEnabled', { enabled: true });
  } else {
    await seite.sende('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
  }
}

const ZUSTAND = `(() => {
  const a = document.querySelector('main article');
  if (!a) return null;
  return { typ: a.dataset.typ, knoten: a.dataset.knoten, mechanik: a.dataset.mechanik, ergebnis: a.dataset.ergebnis, text: a.innerText,
    optionen: [...a.querySelectorAll('[data-option]')].map((b) => ({ id: b.dataset.option })),
    elemente: [...a.querySelectorAll('[data-id]')].map((l) => l.dataset.id),
    inline: a.querySelector('.rueckmeldung-inline')?.innerText ?? '' };
})()`;

async function klickeUndWarte(seite, js) {
  await seite.werte(`window.__alt = document.querySelector('main article'); ${js}; true`);
  await seite.warte(`document.querySelector('main article') && document.querySelector('main article') !== window.__alt`);
}

/** Spielt das Szenario über die Oberfläche: liest, was angezeigt wird, und klickt wie eine Person. */
async function spieleImBrowser(seite, praefix, { fotos = true, falschBei = 'diagonale', axe = false } = {}) {
  const loeser = neuerLoeser();
  const gesehen = new Set();
  let falschGezeigt = false;
  for (let schritt = 0; schritt < 60; schritt++) {
    const z = await seite.werte(ZUSTAND);
    const name = z.typ === 'rueckmeldung' ? 'rueckmeldung' : z.typ === 'ende' ? 'ende' : `${z.typ}-${z.knoten}`;
    if (fotos && !gesehen.has(name)) { gesehen.add(name); await foto(seite, `${praefix}-${String(gesehen.size).padStart(2, '0')}-${name}`); }
    if (axe && ['szene-meldung', 'aufgabe-pruefschritte', 'aufgabe-diagonale', 'rueckmeldung', 'ende'].includes(name)) await pruefeBarrierefreiheit(seite, `${praefix}-${name}`);
    if (z.typ === 'ende') return z;
    if (z.typ === 'rueckmeldung') { await klickeUndWarte(seite, `document.querySelector('main article .knopf-haupt').click()`); continue; }
    const e = loeser({ knoten: { id: z.knoten, typ: z.typ, text: z.text, frage: '', optionen: z.optionen, mechanik: z.mechanik } });
    if (e.typ === 'wahl') {
      await klickeUndWarte(seite, `document.querySelector('[data-option="${e.option}"]').click()`);
    } else if (z.mechanik === 'zahl') {
      if (z.knoten === falschBei && !falschGezeigt) {
        falschGezeigt = true;
        await klickeUndWarte(seite, `(() => { const f = document.querySelector('.zahlfeld'); f.value = '1'; f.form.requestSubmit(); })()`);
        await seite.warte(`document.querySelector('.rueckmeldung-inline')?.innerText.length > 0`);
        if (fotos) await foto(seite, `${praefix}-${String(gesehen.size + 1).padStart(2, '0')}-aufgabe-falsch`);
        if (axe) await pruefeBarrierefreiheit(seite, `${praefix}-aufgabe-falsch`);
      }
      await klickeUndWarte(seite, `(() => { const f = document.querySelector('.zahlfeld'); f.value = ${JSON.stringify(e.antwort)}; f.form.requestSubmit(); })()`);
    } else if (z.mechanik === 'reihenfolge') {
      // wie mit der Hand: jedes Element mit „nach oben“ an seinen Platz bringen
      for (let i = 0; i < e.antwort.length; i++) {
        for (;;) {
          const reihe = await seite.werte(`[...document.querySelectorAll('.reihe [data-id]')].map((l) => l.dataset.id)`);
          const j = reihe.indexOf(e.antwort[i]);
          if (j <= i) break;
          await seite.werte(`document.querySelectorAll('.reihe [data-id]')[${j}].querySelector('.hoch').click(); true`);
        }
      }
      await klickeUndWarte(seite, `document.querySelector('.reihe').closest('form').requestSubmit()`);
    } else {
      throw new Error(`Unbekannte Mechanik ${z.mechanik}`);
    }
  }
  throw new Error('Szenario endet nicht');
}

async function studierendeSitzung(art) {
  const kontext = await Cdp.neuerKontext();
  const seite = await Cdp.neueSeite(undefined, kontext);
  await geraet(seite, art);
  const t0 = Date.now();
  await seite.gehe(`${APP}/`);
  await seite.warte(`document.querySelector('#kurscode')`);
  const laden = await seite.werte(`(() => {
    const n = performance.getEntriesByType('navigation')[0];
    const r = performance.getEntriesByType('resource');
    return { domFertigMs: Math.round(n.domContentLoadedEventEnd), geladenMs: Math.round(n.loadEventEnd), bisBedienbarMs: Math.round(performance.now()),
      dateien: r.length + 1, bytes: n.transferSize + r.reduce((s, x) => s + x.transferSize, 0),
      fremdeHosts: [...new Set(r.map((x) => new URL(x.name).host).filter((h) => h !== location.host))] };
  })()`);
  messwerte.browser[`erstesLaden-${art}`] = { ...laden, wandzeitMs: Date.now() - t0 };
  const axe = art === 'desktop';
  await foto(seite, `${art}-00-anmeldung`);
  if (axe) await pruefeBarrierefreiheit(seite, 'anmeldung');
  await seite.werte(`document.querySelector('#kurscode').value = 'DEMO'; document.querySelector('#kurscode').form.requestSubmit(); true`);
  await seite.warte(`document.querySelector('.code-gross')`);
  await seite.werte(`document.querySelector('.code-gross').textContent = 'XXXXXX-XXXXXX'; true`); // Code nicht im Bild
  await foto(seite, `${art}-00-beitritt`);
  await seite.werte(`document.querySelector('main .knopf-haupt').click(); true`);
  await seite.warte(`document.querySelector('.kacheln')`);
  await foto(seite, `${art}-00-uebersicht`);
  if (axe) await pruefeBarrierefreiheit(seite, 'uebersicht');
  await seite.werte(`document.querySelector('a[href="#/spiel/fussgaengerbruecke"]').click(); true`);
  await seite.warte(`document.querySelector('main article[data-knoten]')`);
  const t1 = Date.now();
  const ende = await spieleImBrowser(seite, art, { axe });
  messwerte.browser[`durchgespielt-${art}`] = { ergebnis: ende.ergebnis, sekunden: (Date.now() - t1) / 1000 };
  // Übersicht danach zeigt den Fortschritt
  await seite.werte(`[...document.querySelectorAll('main button')].find((b) => b.textContent === 'Zur Übersicht').click(); true`);
  await seite.warte(`document.querySelector('.stand')`);
  messwerte.browser[`fortschritt-${art}`] = await seite.werte(`document.querySelector('.stand').textContent`);
  seite.schliesse();
  seite.browser.schliesse();
}

async function lehrendeSitzung() {
  const kontext = await Cdp.neuerKontext();
  const seite = await Cdp.neueSeite(undefined, kontext);
  await geraet(seite, 'desktop');
  await seite.gehe(`${APP}/lehrende#auswertung`);
  await seite.warte(`document.querySelector('#schluessel')`);
  await seite.werte(`document.querySelector('#schluessel').value = 'nachweis'; document.querySelector('#schluessel').form.requestSubmit(); true`);
  await seite.warte(`document.querySelector('.kennzahlen')`);
  await foto(seite, 'lehrende-01-auswertung');
  await pruefeBarrierefreiheit(seite, 'lehrende-auswertung');
  messwerte.browser.auswertungKennzahlen = await seite.werte(`[...document.querySelectorAll('.kennzahl')].map((k) => k.innerText.replace('\\n', ' '))`);
  await seite.werte(`location.hash = '#szenarien'; true`);
  await seite.warte(`document.querySelector('table code')`);
  await foto(seite, 'lehrende-02-szenarien');
  await seite.werte(`location.hash = '#kurse'; true`);
  await seite.warte(`document.querySelector('.kachel .code')`);
  await foto(seite, 'lehrende-03-kurse');
  seite.schliesse();
  seite.browser.schliesse();
}

async function offline() {
  // OER-Export wie eine Lehrperson ihn herunterlädt, dann als Datei im Browser öffnen (file://, ohne Server)
  const anmeldung = await fetch(`${APP}/api/anmelden/lehrende`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ schluessel: 'nachweis' }) });
  const cookie = anmeldung.headers.get('set-cookie').split(';')[0];
  const html = await (await fetch(`${APP}/api/lehrende/oer/fussgaengerbruecke`, { headers: { Cookie: cookie } })).text();
  mkdirSync(EXPORT, { recursive: true });
  writeFileSync(`${EXPORT}/fussgaengerbruecke-v1.html`, html);
  messwerte.offline.groesseKB = Math.round(Buffer.byteLength(html) / 1024);
  const seite = await Cdp.neueSeite(undefined, await Cdp.neuerKontext());
  await geraet(seite, 'telefon');
  const anfragen = [];
  await seite.sende('Network.enable');
  seite.auf('Network.requestWillBeSent', (p) => anfragen.push(p.request.url.slice(0, 60)));
  await seite.gehe(`file://${EXPORT}/fussgaengerbruecke-v1.html`);
  await seite.warte(`document.querySelector('main article[data-knoten]')`);
  const ende = await spieleImBrowser(seite, 'offline', { fotos: false });
  await foto(seite, 'offline-ende');
  messwerte.offline.ergebnis = ende.ergebnis;
  messwerte.offline.netzanfragenNachDemLaden = anfragen.filter((u) => !u.startsWith('file://') && !u.startsWith('data:')).length;
  messwerte.offline.lizenzhinweis = await seite.werte(`document.querySelector('footer').innerText`);
  seite.schliesse();
  seite.browser.schliesse();
}

// --- Ablauf -------------------------------------------------------------------------------------------------------
const gesund = await (await fetch(`${APP}/api/gesundheit`)).json();
messwerte.umgebung.app = gesund;
messwerte.umgebung.node = process.version;
// Zwei Stöße (alle Personen im selben Augenblick, ohne Pause) und ein Hörsaal mit Denkzeit zwischen den Schritten
const PROFILE = process.env.LAST === '0' ? [] : [
  { personen: 50 }, { personen: 200 }, { personen: 300, denkzeitMs: [1000, 5000] },
];
for (const p of PROFILE) {
  const r = await lasttest({ basis: APP, kurscode: 'DEMO', ...p });
  console.log(`Last ${JSON.stringify(p)}: ${JSON.stringify(r)}`);
  messwerte.last.push(r);
}
const probe = await Cdp.neueSeite();
messwerte.umgebung.browser = probe.version.Browser;
probe.schliesse();
probe.browser.schliesse();
await studierendeSitzung('desktop');
await studierendeSitzung('telefon');
await lehrendeSitzung();
await offline();
writeFileSync(`${AUSGABE}/messwerte.json`, JSON.stringify(messwerte, null, 2) + '\n');
console.log(JSON.stringify(messwerte.browser, null, 2));
console.log('Barrierefreiheit:', Object.entries(messwerte.barrierefreiheit).map(([k, v]) => `${k}: ${v.verstoesse.length} Verstöße`).join('; '));
console.log('Offline:', JSON.stringify(messwerte.offline));
process.exit(0);
