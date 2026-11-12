// Nachweis-Messung: Lasttest (allein, im Team, in der Live-Runde), dann Ende-zu-Ende im echten Browser (Chrome headless
// über CDP), auf Desktop- und Telefonbreite, mit Barrierefreiheitsprüfung (axe-core) und Bildschirmfotos: Spiel,
// Editor, neues Szenario aus Vorlage, Teamspiel, Live-Runde, Administration, Ton; zuletzt die Offline-Fassung (OER).
// Schreibt nachweis/messwerte.json, nachweis/bilder/*.png und vier Bilder für die README (medien/). Aufruf über
// compose.nachweis.yaml. Jede Person im Browser wird von diesem Skript gesteuert, ist also simuliert.

import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { Cdp } from './cdp.js';
import { lasttest } from '../last.js';
import { lasttestTeams, lasttestRunde } from '../last-gruppen.js';
import { neuerLoeser } from '../hilfe/loeser.js';

const APP = process.env.APP_URL ?? 'http://spielbaukasten:8080';
const AUSGABE = process.env.AUSGABE ?? 'nachweis';
const MEDIEN = process.env.MEDIEN ?? 'medien';
const EXPORT = process.env.EXPORT_DIR ?? '/export';
const AXE_URL = 'https://cdn.jsdelivr.net/npm/axe-core@4.10.2/axe.min.js';
const messwerte = { zeitpunkt: new Date().toISOString(), app: APP, umgebung: {}, tests: null, last: [], browser: {}, barrierefreiheit: {}, offline: {}, editor: {}, vorlage: {}, team: {}, kursrunde: {}, admin: {}, ton: {} };
// Ergebnis der automatischen Tests aus demselben Lauf (TESTS_DATEI: Ausgabe von `node --test --test-reporter=tap`)
if (process.env.TESTS_DATEI) {
  try {
    const tap = readFileSync(process.env.TESTS_DATEI, 'utf8');
    const zahl = (n) => Number(new RegExp(`^# ${n} (\\d+)`, 'm').exec(tap)?.[1] ?? NaN);
    messwerte.tests = { bestanden: zahl('pass'), gesamt: zahl('tests'), fehlgeschlagen: zahl('fail'), dauerMs: Math.round(zahl('duration_ms')) };
  } catch (e) { messwerte.tests = { fehler: e.message }; }
}
mkdirSync(`${AUSGABE}/bilder`, { recursive: true });
mkdirSync(MEDIEN, { recursive: true });

let axeQuelle = null;
try {
  // AXE_DATEI: axe-core aus einer lokalen Datei (z. B. node_modules/axe-core/axe.min.js), sonst aus dem Netz
  axeQuelle = process.env.AXE_DATEI ? readFileSync(process.env.AXE_DATEI, 'utf8') : await (await fetch(AXE_URL)).text();
  messwerte.umgebung.axe = process.env.AXE_DATEI ? `axe-core ${/axe v([\d.]+)/.exec(axeQuelle)?.[1] ?? '?'} (lokale Datei)` : AXE_URL;
} catch (e) {
  messwerte.umgebung.axe = `nicht geladen: ${e.message}`;
}

/** Wartet, bis alle Ein- und Überblendungen zu Ende sind (endlose wie das Pulsieren nicht). */
async function ruhe(seite) {
  await seite.werte(`Promise.all(document.getAnimations().filter((a) => a.effect?.getComputedTiming().iterations !== Infinity).map((a) => a.finished.catch(() => null))).then(() => true)`);
}

async function pruefeBarrierefreiheit(seite, name) {
  if (!axeQuelle) return;
  // Gemessen wird der fertige Zustand
  await ruhe(seite);
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

async function geraet(seite, art, schema = 'hell') {
  await seite.sende('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: schema === 'dunkel' ? 'dark' : 'light' }] });
  if (art === 'telefon') {
    await seite.sende('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
    await seite.sende('Emulation.setTouchEmulationEnabled', { enabled: true });
  } else {
    await seite.sende('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
  }
}

/** Bild für die README: 1280 px breit, doppelte Pixeldichte, sichtbarer Ausschnitt, nach allen Einblendungen. */
async function scharf(seite, datei, hoehe = 900) {
  await seite.sende('Emulation.setDeviceMetricsOverride', { width: 1280, height: hoehe, deviceScaleFactor: 2, mobile: false });
  await seite.werte(`document.documentElement.style.scrollbarWidth = 'none'; document.getElementById('meldung')?.classList.remove('sichtbar'); true`);
  await new Promise((r) => setTimeout(r, 900));
  await ruhe(seite);
  writeFileSync(`${MEDIEN}/${datei}`, await seite.bild({ ganz: false }));
  await seite.werte(`document.documentElement.style.scrollbarWidth = ''; true`);
  await seite.sende('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
}

/** Simulierte Person ohne Browser, über die Schnittstelle (für Kursrunde und Administration). */
function apiSitzung() {
  let cookie = '';
  return async (methode, pfad, daten) => {
    const r = await fetch(APP + pfad, { method: methode, headers: { ...(daten ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}) }, body: daten ? JSON.stringify(daten) : undefined });
    const c = r.headers.get('set-cookie');
    if (c) cookie = c.split(';')[0];
    const text = await r.text();
    if (!r.ok) throw new Error(`${methode} ${pfad}: ${r.status} ${text}`);
    return text ? JSON.parse(text) : null;
  };
}

/** Eine Taste wie auf der Tastatur (Eingabe-, Leer-, Pfeiltaste) an das Element mit dem Fokus. */
async function taste(seite, name) {
  const t = { Enter: { key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, text: '\r' }, Leer: { key: ' ', code: 'Space', windowsVirtualKeyCode: 32, text: ' ' },
    Rechts: { key: 'ArrowRight', code: 'ArrowRight', windowsVirtualKeyCode: 39 }, Tab: { key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 } }[name];
  await seite.sende('Input.dispatchKeyEvent', { type: 'keyDown', ...t });
  await seite.sende('Input.dispatchKeyEvent', { type: 'keyUp', ...t, text: undefined });
  await new Promise((r) => setTimeout(r, 150));
}

/** Felder im Editor setzen wie beim Tippen (input und change). */
const setzeFeld = (seite, pfad, wert) => seite.werte(`(() => { const f = document.querySelector('[data-pfad="${pfad}"]'); f.value = ${JSON.stringify(wert)}; f.dispatchEvent(new Event('input', { bubbles: true })); f.dispatchEvent(new Event('change', { bubbles: true })); return true; })()`);
const werkzeug = (seite, text) => seite.werte(`[...document.querySelectorAll('.editor-werkzeuge button')].find((b) => b.textContent.includes(${JSON.stringify(text)})).click(); true`);
const statusText = (seite) => seite.werte(`document.querySelector('.editor-status').textContent`);

const knopfMitText = (text) => `[...document.querySelectorAll('main button')].find((b) => b.textContent.includes(${JSON.stringify(text)}))`;

async function beitreten(seite) {
  await seite.gehe(`${APP}/`);
  await seite.warte(`document.querySelector('#kurscode')`);
  await seite.werte(`document.querySelector('#kurscode').value = 'DEMO'; document.querySelector('#kurscode').form.requestSubmit(); true`);
  await seite.warte(`document.querySelector('.code-gross')`);
  await seite.werte(`document.querySelector('main .knopf-haupt').click(); true`);
  await seite.warte(`document.querySelector('.kacheln')`);
}

async function alsLehrende(seite, ziel) {
  await seite.gehe(`${APP}/lehrende${ziel}`);
  await seite.warte(`document.querySelector('#schluessel')`);
  await seite.werte(`document.querySelector('#schluessel').value = 'nachweis'; document.querySelector('#schluessel').form.requestSubmit(); true`);
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
    if (axe && (axe === true ? ['szene-meldung', 'aufgabe-pruefschritte', 'aufgabe-diagonale', 'rueckmeldung', 'ende'] : axe).includes(name) && !messwerte.barrierefreiheit[`${praefix}-${name}`]) await pruefeBarrierefreiheit(seite, `${praefix}-${name}`);
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
    } else if (z.mechanik === 'auswahl') {
      const ids = Array.isArray(e.antwort) ? e.antwort : [e.antwort];
      await klickeUndWarte(seite, `(() => { const f = document.querySelector('fieldset.auswahl input').form; for (const i of f.querySelectorAll('input')) i.checked = ${JSON.stringify(ids)}.includes(i.value); f.requestSubmit(); })()`);
    } else {
      throw new Error(`Unbekannte Mechanik ${z.mechanik}`);
    }
  }
  throw new Error('Szenario endet nicht');
}

async function studierendeSitzung(art, schema = 'hell') {
  const kontext = await Cdp.neuerKontext();
  const seite = await Cdp.neueSeite(undefined, kontext);
  await geraet(seite, art, schema);
  const praefix = schema === 'dunkel' ? `${art}-dunkel` : art;
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
  messwerte.browser[`erstesLaden-${praefix}`] = { ...laden, wandzeitMs: Date.now() - t0 };
  // axe: auf dem Desktop jeder Zustand, im dunklen Schema und auf dem Telefon die wichtigsten
  const axe = praefix === 'desktop' ? true : ['szene-meldung', 'rueckmeldung', 'ende'];
  await foto(seite, `${praefix}-00-anmeldung`);
  await pruefeBarrierefreiheit(seite, praefix === 'desktop' ? 'anmeldung' : `${praefix}-anmeldung`);
  await seite.werte(`document.querySelector('#kurscode').value = 'DEMO'; document.querySelector('#kurscode').form.requestSubmit(); true`);
  await seite.warte(`document.querySelector('.code-gross')`);
  await seite.werte(`document.querySelector('.code-gross').textContent = 'XXXXXX-XXXXXX'; true`); // Code nicht im Bild
  await foto(seite, `${praefix}-00-beitritt`);
  await seite.werte(`document.querySelector('main .knopf-haupt').click(); true`);
  await seite.warte(`document.querySelector('.kacheln')`);
  await foto(seite, `${praefix}-00-uebersicht`);
  if (praefix === 'desktop') await pruefeBarrierefreiheit(seite, 'uebersicht');
  await seite.werte(`document.querySelector('a[href="#/spiel/fussgaengerbruecke"]').click(); true`);
  await seite.warte(`document.querySelector('main article[data-knoten]')`);
  const t1 = Date.now();
  const ende = await spieleImBrowser(seite, praefix, { axe, fotos: schema === 'hell' });
  messwerte.browser[`durchgespielt-${praefix}`] = { ergebnis: ende.ergebnis, sekunden: (Date.now() - t1) / 1000 };
  // Übersicht danach zeigt den Fortschritt
  await seite.werte(`[...document.querySelectorAll('main button')].find((b) => b.textContent === 'Zur Übersicht').click(); true`);
  await seite.warte(`document.querySelector('.stand')`);
  messwerte.browser[`fortschritt-${praefix}`] = await seite.werte(`document.querySelector('.stand').textContent`);
  seite.schliesse();
  seite.browser.schliesse();
}

/** Eine riskante Entscheidung: Rückmeldung „Riskant“ mit besorgter Figur, auf dem Desktop. */
async function riskanteEntscheidung() {
  const seite = await Cdp.neueSeite(undefined, await Cdp.neuerKontext());
  await geraet(seite, 'desktop');
  await seite.gehe(`${APP}/`);
  await seite.warte(`document.querySelector('#kurscode')`);
  await seite.werte(`document.querySelector('#kurscode').value = 'DEMO'; document.querySelector('#kurscode').form.requestSubmit(); true`);
  await seite.warte(`document.querySelector('.code-gross')`);
  await seite.werte(`document.querySelector('main .knopf-haupt').click(); true`);
  await seite.warte(`document.querySelector('.kacheln')`);
  await seite.werte(`document.querySelector('a[href="#/spiel/fussgaengerbruecke"]').click(); true`);
  await seite.warte(`document.querySelector('main article[data-knoten="meldung"]')`);
  await klickeUndWarte(seite, `document.querySelector('[data-option="offen_lassen"]').click()`);
  await seite.warte(`document.querySelector('.rueckmeldung.schlecht')`);
  await foto(seite, 'desktop-riskant');
  await pruefeBarrierefreiheit(seite, 'desktop-rueckmeldung-riskant');
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
  await new Promise((r) => setTimeout(r, 1200));
  await foto(seite, 'lehrende-01-auswertung');
  await pruefeBarrierefreiheit(seite, 'lehrende-auswertung');
  await geraet(seite, 'desktop', 'dunkel');
  await pruefeBarrierefreiheit(seite, 'lehrende-auswertung-dunkel');
  await geraet(seite, 'telefon');
  await pruefeBarrierefreiheit(seite, 'lehrende-auswertung-telefon');
  await geraet(seite, 'desktop');
  messwerte.browser.auswertungKennzahlen = await seite.werte(`[...document.querySelectorAll('.kennzahl')].map((k) => k.innerText.replace('\\n', ' '))`);
  await seite.werte(`location.hash = '#szenarien'; true`);
  await seite.warte(`document.querySelector('table a[href^="#editor/"]')`);
  await foto(seite, 'lehrende-02-szenarien');
  await seite.werte(`location.hash = '#kurse'; true`);
  await seite.warte(`document.querySelector('.kachel .code')`);
  await foto(seite, 'lehrende-03-kurse');
  seite.schliesse();
  seite.browser.schliesse();
}

/** Editor: öffnen, Aufgabe wählen, Tippfehler prüfen lassen, „Zur Stelle“, speichern, Vorschau durchspielen. */
async function editorSitzung() {
  const kontext = await Cdp.neuerKontext();
  const seite = await Cdp.neueSeite(undefined, kontext);
  await geraet(seite, 'desktop');
  await alsLehrende(seite, '#szenarien');
  await seite.warte(`document.querySelector('a[href="#editor/spannungsteiler"]')`);
  await seite.werte(`document.querySelector('a[href="#editor/spannungsteiler"]').click(); true`);
  await seite.warte(`document.querySelector('.editor-ablauf [data-wahl="teilspannung"]') && document.querySelector('[data-pfad="titel"]')`);
  messwerte.editor.statusBeimOeffnen = await statusText(seite);
  await pruefeBarrierefreiheit(seite, 'editor-allgemein');
  await seite.werte(`document.querySelector('[data-wahl="teilspannung"]').click(); true`);
  await seite.warte(`document.querySelector('[data-pfad="knoten.teilspannung.loesung"]')`);
  await seite.werte(`window.scrollTo(0, 0); document.activeElement?.blur(); true`);
  await foto(seite, 'lehrende-04-editor');
  await pruefeBarrierefreiheit(seite, 'editor-aufgabe');
  // Interne Kennungen sind verborgen: im sichtbaren Text des Editors (Ablauf, Formular, Auswahllisten) steht keine
  messwerte.editor.interneKennungenSichtbar = await seite.werte(`(() => {
    // ohne die Bildauswahl: Dort stehen Dateinamen von Bildern, keine Kennungen von Schritten
    const bilder = [...document.querySelectorAll('.editor .feldgruppe.bild')];
    bilder.forEach((b) => { b.style.display = 'none'; });
    const text = document.querySelector('.editor').innerText + ' ' + [...document.querySelectorAll('.editor select option')].filter((o) => !o.closest('.feldgruppe.bild')).map((o) => o.textContent).join(' ');
    bilder.forEach((b) => { b.style.display = ''; });
    return ['aufbau', 'teilspannung', 'last', 'ende'].map((id) => [id, new RegExp('(^|[^\\\\wäöüß-])' + id + '($|[^\\\\wäöüß-])').exec(text)]).filter(([, m]) => m)
      .map(([id, m]) => id + ' in „' + text.slice(Math.max(0, m.index - 30), m.index + 30).replace(/\\s+/g, ' ') + '“');
  })()`);
  messwerte.editor.formelHilfe = await seite.werte(`document.getElementById(document.querySelector('[data-pfad="knoten.teilspannung.loesung"]').getAttribute('aria-describedby').split(' ')[0]).textContent`);
  // „Für Fortgeschrittene“: geschlossen; mit der Tastatur öffnen (Eingabetaste) und schließen (Leertaste)
  messwerte.editor.fortgeschrittenBeimOeffnen = await seite.werte(`document.querySelector('.fortgeschritten.schritt').open ? 'offen' : 'geschlossen'`);
  await seite.werte(`document.querySelector('.fortgeschritten.schritt summary').focus(); true`);
  await taste(seite, 'Enter');
  const offen = await seite.werte(`document.querySelector('.fortgeschritten.schritt').open`);
  await pruefeBarrierefreiheit(seite, 'editor-fortgeschritten');
  messwerte.editor.fortgeschrittenInhalt = await seite.werte(`document.querySelector('.fortgeschritten.schritt .fortgeschritten-inhalt').innerText.replace(/\\s+/g, ' ').trim()`);
  await taste(seite, 'Leer');
  const zu = await seite.werte(`!document.querySelector('.fortgeschritten.schritt').open`);
  messwerte.editor.fortgeschrittenTastatur = `Eingabetaste: ${offen ? 'geöffnet' : 'nicht geöffnet'}; Leertaste: ${zu ? 'geschlossen' : 'nicht geschlossen'}`;
  const setze = (pfad, wert) => setzeFeld(seite, pfad, wert);
  const werkzeug1 = (text) => werkzeug(seite, text);
  // Tippfehler in der Formel: „Prüfen“ meldet ihn mit Fundstelle, „Zur Stelle“ führt zum Feld
  await setze('knoten.teilspannung.loesung', 'U * R2 / (R1 + R3)');
  await werkzeug1('Prüfen');
  await seite.warte(`document.querySelector('.pruefergebnis.mit-fehlern')`);
  messwerte.editor.fehlermeldung = await seite.werte(`document.querySelector('.pruefergebnis li').innerText.replace(/\\s*Zur Stelle.*$/s, '')`);
  messwerte.editor.fehlerAmFeld = await seite.werte(`document.querySelector('[data-pfad="knoten.teilspannung.loesung"]').getAttribute('aria-invalid')`);
  await foto(seite, 'lehrende-05-editor-fehler');
  await pruefeBarrierefreiheit(seite, 'editor-fehler');
  await seite.werte(`document.querySelector('.pruefergebnis li button').click(); true`);
  messwerte.editor.zurStelleFokus = await seite.werte(`document.activeElement?.dataset.pfad ?? null`);
  // Korrigieren, Titel ändern, als neue Version speichern
  await setze('knoten.teilspannung.loesung', 'U * R2 / (R1 + R2)');
  await seite.werte(`document.querySelector('[data-wahl="allgemein"]').click(); true`);
  await seite.warte(`document.querySelector('[data-pfad="titel"]')`);
  await setze('titel', 'Übung: Spannungsteiler im Praktikum');
  await werkzeug1('speichern');
  await seite.warte(`document.querySelector('.pruefergebnis.ohne-fehler h2')?.textContent.includes('gespeichert')`);
  messwerte.editor.statusNachSpeichern = await statusText(seite);
  messwerte.editor.gespeichert = await seite.werte(`document.querySelector('.pruefergebnis h2').textContent`);
  messwerte.editor.versionen = await seite.werte(`fetch('/api/lehrende/szenarien/spannungsteiler').then((r) => r.json()).then((j) => j.versionen.map((v) => v.version + ' ' + v.quelle))`);
  await geraet(seite, 'desktop', 'dunkel');
  await pruefeBarrierefreiheit(seite, 'editor-dunkel');
  await geraet(seite, 'telefon');
  await pruefeBarrierefreiheit(seite, 'editor-telefon');
  await foto(seite, 'telefon-10-editor');
  await geraet(seite, 'desktop');
  // Vorschau: das neue Fenster abfangen und die Adresse in einem Tab desselben Browserkontexts öffnen
  await seite.werte(`window.open = () => ({ location: { set href(u) { window.__vorschau = u; } }, close() {} }); true`);
  await werkzeug1('Vorschau');
  await seite.warte(`window.__vorschau`);
  const vorschau = await Cdp.neueSeite(undefined, kontext);
  await geraet(vorschau, 'desktop');
  await vorschau.gehe(APP + await seite.werte(`window.__vorschau`));
  await vorschau.warte(`document.querySelector('main article[data-knoten]')`);
  messwerte.editor.vorschauTitel = await vorschau.werte('document.title');
  messwerte.editor.vorschauErgebnis = (await spieleImBrowser(vorschau, 'vorschau', { fotos: false })).ergebnis;
  await pruefeBarrierefreiheit(vorschau, 'editor-vorschau-ende');
  vorschau.schliesse();
  seite.schliesse();
  seite.browser.schliesse();
}

/** Ein neues Szenario aus Vorlage öffnen (Seite mit drei Vorlagen); liefert die Seite im Editor. */
async function ausVorlageOeffnen(seite, art, { titel = null, urheber = 'Lehrstuhl Baustatik', mitTastatur = false } = {}) {
  await seite.werte(`window.confirm = () => true; location.hash = '#vorlage'; true`); // ein ungespeicherter Entwurf darf verworfen werden
  await seite.warte(`document.querySelector('#vorlage-urheber') && document.querySelector('#vorlage-entscheidung')`);
  if (mitTastatur) {
    // wie mit der Tastatur: erste Vorlage fokussieren, Pfeiltaste nach rechts wählt die nächste
    await seite.werte(`document.querySelector('#vorlage-entscheidung').focus(); true`);
    await taste(seite, 'Rechts');
    messwerte.vorlage.pfeiltasteWaehlt = await seite.werte(`document.querySelector('input[name="vorlage"]:checked').value`);
  } else {
    await seite.werte(`(() => { const r = document.querySelector('#vorlage-${art}'); r.checked = true; r.dispatchEvent(new Event('change', { bubbles: true })); return true; })()`);
  }
  if (titel) await seite.werte(`(() => { const f = document.querySelector('#vorlage-titel'); f.value = ${JSON.stringify(titel)}; f.dispatchEvent(new Event('input')); return true; })()`);
  const gewaehlterTitel = await seite.werte(`document.querySelector('#vorlage-titel').value`);
  await seite.werte(`(() => { const f = document.querySelector('#vorlage-urheber'); f.value = ${JSON.stringify(urheber)}; f.form.requestSubmit(); return true; })()`);
  await seite.warte(`location.hash === '#editor/neu' && document.querySelector('.editor-ablauf .ablauf-eintrag[aria-current="true"]') && document.querySelector('.editor-karte h2')`);
  return gewaehlterTitel;
}

/** Neues Szenario aus Vorlage: Seite mit drei Vorlagen, jede sofort fehlerfrei, die Rechenübung ändern, Vorschau, speichern. */
async function vorlageSitzung() {
  const kontext = await Cdp.neuerKontext();
  const seite = await Cdp.neueSeite(undefined, kontext);
  await geraet(seite, 'desktop');
  await alsLehrende(seite, '#szenarien');
  await seite.warte(`document.querySelector('a[href="#vorlage"]')`);
  messwerte.vorlage.knopf = await seite.werte(`document.querySelector('a[href="#vorlage"]').textContent`);
  await seite.werte(`document.querySelector('a[href="#vorlage"]').click(); true`);
  await seite.warte(`document.querySelector('#vorlage-titel') && document.querySelectorAll('.vorlage-karte').length`);
  messwerte.vorlage.vorlagen = await seite.werte(`[...document.querySelectorAll('.vorlage-karte')].map((k) => k.querySelector('.vorlage-name').textContent + ': ' + k.querySelector('.vorlage-ablauf').innerText.replace(/\\s+/g, ' ').replace('Ablauf: ', ''))`);
  await pruefeBarrierefreiheit(seite, 'vorlage');
  await seite.werte(`window.scrollTo(0, 0); document.activeElement?.blur(); true`);
  await foto(seite, 'lehrende-07-vorlage');
  const hoehe = await seite.werte(`Math.ceil(document.querySelector('.vorlage-form').getBoundingClientRect().bottom + window.scrollY + 32)`);
  await scharf(seite, 'vorlage.png', Math.min(1300, Math.max(760, hoehe)));
  await geraet(seite, 'desktop', 'dunkel');
  await pruefeBarrierefreiheit(seite, 'vorlage-dunkel');
  await geraet(seite, 'telefon');
  await pruefeBarrierefreiheit(seite, 'vorlage-telefon');
  await foto(seite, 'telefon-13-vorlage');
  await geraet(seite, 'desktop');

  // Jede Vorlage besteht „Prüfen“ sofort (im Browser, ohne Änderung)
  messwerte.vorlage.pruefenSofort = {};
  for (const art of ['entscheidung', 'quiz', 'rechnen']) {
    const titel = await ausVorlageOeffnen(seite, art, { mitTastatur: art === 'rechnen' });
    if (art === 'rechnen') {
      messwerte.vorlage.titelVorgeschlagen = titel;
      messwerte.vorlage.statusNeu = await statusText(seite);
      messwerte.vorlage.geoeffneterSchritt = await seite.werte(`document.querySelector('.editor-karte h2').innerText.replace(/\\s+/g, ' ').trim()`);
      messwerte.vorlage.formelHilfe = await seite.werte(`(() => { const f = document.querySelector('[data-pfad$=".loesung"]'); return document.getElementById(f.getAttribute('aria-describedby').split(' ')[0]).textContent; })()`);
      await pruefeBarrierefreiheit(seite, 'vorlage-editor');
    }
    await werkzeug(seite, 'Prüfen');
    await seite.warte(`document.querySelector('.pruefergebnis')`);
    messwerte.vorlage.pruefenSofort[art] = await seite.werte(`document.querySelector('.pruefergebnis').innerText.replace(/\\s+/g, ' ').replace('Ergebnis der Prüfung ', '').trim()`);
  }
  // Rechenübung: einen Text ändern (die Frage), Vorschau durchspielen, speichern
  const frage = await seite.werte(`document.querySelector('[data-pfad$=".frage"]').value`);
  await setzeFeld(seite, (await seite.werte(`document.querySelector('[data-pfad$=".frage"]').dataset.pfad`)), frage.replace('Ein Zugstab aus Stahl', 'Ein Zugstab aus Baustahl S235'));
  messwerte.vorlage.statusNachAenderung = await statusText(seite);
  await seite.werte(`window.open = () => ({ location: { set href(u) { window.__vorschau = u; } }, close() {} }); true`);
  await werkzeug(seite, 'Vorschau');
  await seite.warte(`window.__vorschau`);
  const vorschau = await Cdp.neueSeite(undefined, kontext);
  await geraet(vorschau, 'desktop');
  await vorschau.gehe(APP + await seite.werte(`window.__vorschau`));
  await vorschau.warte(`document.querySelector('main article[data-knoten]')`);
  messwerte.vorlage.vorschauTitel = await vorschau.werte('document.title');
  messwerte.vorlage.vorschauFrage = await vorschau.werte(`document.querySelector('main article .frage').innerText.slice(0, 60)`);
  await pruefeBarrierefreiheit(vorschau, 'vorlage-vorschau-aufgabe');
  messwerte.vorlage.vorschauErgebnis = (await spieleImBrowser(vorschau, 'vorlage-vorschau', { fotos: false })).ergebnis;
  vorschau.schliesse();
  await werkzeug(seite, 'speichern');
  await seite.warte(`document.querySelector('.pruefergebnis.ohne-fehler h2')?.textContent.includes('gespeichert')`);
  messwerte.vorlage.gespeichert = await seite.werte(`document.querySelector('.pruefergebnis h2').textContent`);
  messwerte.vorlage.adresse = await seite.werte(`location.hash`);
  const id = decodeURIComponent(messwerte.vorlage.adresse.split('/')[1]);
  messwerte.vorlage.interneKennung = id;
  messwerte.vorlage.schritte = await seite.werte(`fetch('/api/lehrende/szenarien/${id}').then((r) => r.json()).then((j) => Object.keys(j.szenario.knoten))`);

  // Wieder öffnen, die Aufgabe wählen: neutraler Status, „Für Fortgeschrittene“ geschlossen (Bild für die README)
  await seite.werte(`location.hash = '#szenarien'; true`);
  await seite.warte(`document.querySelector('a[href="#editor/${id}"]')`);
  await seite.werte(`document.querySelector('a[href="#editor/${id}"]').click(); true`);
  await seite.warte(`document.querySelector('.editor-ablauf [data-wahl]:not([data-wahl="allgemein"]):not([data-wahl="kapitel"])') && document.querySelector('[data-pfad="titel"]')`);
  messwerte.vorlage.statusWiederGeoeffnet = await statusText(seite);
  await seite.werte(`document.querySelector('.editor-ablauf [data-wahl]:not([data-wahl="allgemein"]):not([data-wahl="kapitel"])').click(); true`);
  await seite.warte(`document.querySelector('[data-pfad$=".loesung"]')`);
  await seite.werte(`window.scrollTo(0, 0); document.activeElement?.blur(); true`);
  await foto(seite, 'lehrende-08-editor-rechenuebung');
  await scharf(seite, 'editor.png', 1000);
  await pruefeBarrierefreiheit(seite, 'editor-rechenuebung');
  await geraet(seite, 'desktop', 'dunkel');
  await pruefeBarrierefreiheit(seite, 'editor-rechenuebung-dunkel');
  await geraet(seite, 'desktop');
  seite.schliesse();
  seite.browser.schliesse();
}

/** Teamspiel: drei Personen in drei Browsern; Abstimmung, Entscheidung, alle an derselben Stelle. */
async function teamSitzung() {
  const seiten = [];
  for (let i = 0; i < 3; i++) {
    const s = await Cdp.neueSeite(undefined, await Cdp.neuerKontext());
    await geraet(s, 'desktop');
    await beitreten(s);
    seiten.push(s);
  }
  const [a, b, c] = seiten;
  await a.werte(`document.querySelector('a[href="#/team/fussgaengerbruecke"]').click(); true`);
  await a.warte(knopfMitText('Neues Team gründen'));
  await pruefeBarrierefreiheit(a, 'team-start');
  await a.werte(`${knopfMitText('Neues Team gründen')}.click(); true`);
  await a.warte(`document.querySelector('.gruppe-band .code') && document.querySelector('main article[data-knoten]')`);
  const code = await a.werte(`document.querySelector('.gruppe-band .code').textContent`);
  for (const s of [b, c]) {
    await s.werte(`location.hash = '#/team/fussgaengerbruecke'; true`);
    await s.warte(`document.querySelector('#teamcode')`);
    await s.werte(`document.querySelector('#teamcode').value = ${JSON.stringify(code.toLowerCase())}; document.querySelector('#teamcode').form.requestSubmit(); true`);
    await s.warte(`document.querySelector('main article[data-knoten]') && document.querySelector('.abstimmung')`);
  }
  await a.warte(`document.querySelector('.gruppe-band')?.innerText.includes('3 Personen')`);
  await a.werte(`document.querySelector('[data-option="sperren"]').click(); true`);
  await b.werte(`document.querySelector('[data-option="offen_lassen"]').click(); true`);
  for (const s of seiten) await s.warte(`document.querySelector('.abstimmung-kopf')?.innerText.includes('2 von 3')`);
  messwerte.team.abstimmungBeiC = await c.werte(`document.querySelector('.abstimmung').innerText.split('\\n').slice(0, 4).join(' | ')`);
  await a.werte(`document.querySelector('.abstimmung-regel').open = true; window.scrollTo(0, 0); document.activeElement?.blur(); true`);
  await foto(a, 'desktop-10-team-abstimmung');
  const hoehe = await a.werte(`Math.min(1300, Math.ceil(document.querySelector('.abstimmung').getBoundingClientRect().bottom + window.scrollY + 28))`);
  await scharf(a, 'teamspiel.png', Math.max(900, hoehe));
  await pruefeBarrierefreiheit(a, 'team-abstimmung');
  await geraet(b, 'telefon');
  await pruefeBarrierefreiheit(b, 'team-abstimmung-telefon');
  await foto(b, 'telefon-11-team-abstimmung');
  await geraet(c, 'desktop', 'dunkel');
  await pruefeBarrierefreiheit(c, 'team-abstimmung-dunkel');
  // Die dritte Stimme entscheidet (2 : 1); gemessen wird, bis alle drei Browser die Rückmeldung zeigen (Abfrage alle 50 ms)
  const t0 = Date.now();
  await c.werte(`document.querySelector('[data-option="sperren"]').click(); true`);
  await Promise.all(seiten.map((s) => s.warte(`document.querySelector('main article[data-typ="rueckmeldung"]')`)));
  messwerte.team.dritteStimmeBisAlleDreiMs = Date.now() - t0;
  messwerte.team.rueckmeldung = await Promise.all(seiten.map((s) => s.werte(`document.querySelector('.rueckmeldung-titel').innerText`)));
  await pruefeBarrierefreiheit(a, 'team-rueckmeldung');
  for (const s of seiten) await klickeUndWarte(s, `document.querySelector('main article .knopf-haupt').click()`);
  messwerte.team.knotenDanach = await Promise.all(seiten.map((s) => s.werte(`document.querySelector('main article').dataset.knoten`)));
  for (const s of seiten) { s.schliesse(); s.browser.schliesse(); }
}

/** Kursrunde: eine Lehrperson im Browser, 24 simulierte Studierende über die Schnittstelle, eine Person im Telefon-Browser. */
async function kursrundeSitzung() {
  const lehr = await Cdp.neueSeite(undefined, await Cdp.neuerKontext());
  await geraet(lehr, 'desktop');
  await alsLehrende(lehr, '#runde');
  await lehr.warte(`document.querySelector('#runde-kurs') && document.querySelector('#runde-szenario option')`);
  await pruefeBarrierefreiheit(lehr, 'kursrunde-start');
  await lehr.werte(`(() => { const k = document.querySelector('#runde-kurs'); k.value = [...k.options].find((o) => o.textContent.startsWith('Demokurs')).value; k.dispatchEvent(new Event('change')); const s = document.querySelector('#runde-szenario'); s.value = 'fussgaengerbruecke'; s.form.requestSubmit(); return true; })()`);
  await lehr.warte(`location.hash.split('/')[1]?.length === 36 && document.querySelector('.kennzahlen')`);
  const rid = await lehr.werte(`location.hash.split('/')[1]`);
  const sim = [];
  for (let i = 0; i < 24; i++) {
    const c = apiSitzung();
    await c('POST', '/api/anmelden/studierende', { kurscode: 'DEMO' });
    await c('POST', `/api/runden/${rid}/beitreten`, {});
    sim.push(c);
  }
  const st = await Cdp.neueSeite(undefined, await Cdp.neuerKontext());
  await geraet(st, 'telefon');
  await beitreten(st);
  await st.warte(`document.querySelector('.gemeinsam-zeile.live button')`);
  await pruefeBarrierefreiheit(st, 'uebersicht-live-runde-telefon');
  await st.werte(`document.querySelector('.gemeinsam-zeile.live button').click(); true`);
  await st.warte(`document.querySelector('main article[data-knoten="meldung"]') && document.querySelector('.abstimmung')`);
  const stand = () => sim[0]('GET', `/api/gruppen/${rid}`);
  const alle = async (fn) => { const a = await stand(); await Promise.all(sim.map((c, i) => c('POST', `/api/gruppen/${rid}/stimmen`, { nr: a.nr, ereignis: fn(a, i) }))); return a; };
  const schliessen = `[...document.querySelectorAll('main button')].find((b) => b.textContent.includes('Abstimmung schließen')).click()`;
  // 1. Meldung: 20 sperren, 4 offen lassen; die Person im Browser stimmt als 25. und entscheidet damit
  await alle((_, i) => ({ typ: 'wahl', knoten: 'meldung', option: i < 20 ? 'sperren' : 'offen_lassen' }));
  await klickeUndWarte(st, `document.querySelector('[data-option="sperren"]').click()`);
  await st.warte(`document.querySelector('main article[data-typ="rueckmeldung"]')`);
  await klickeUndWarte(st, `document.querySelector('main article .knopf-haupt').click()`);
  // 2. Prüfschritte: 21 richtig, 3 falsch; die Lehrperson schließt in der Oberfläche
  const richtig = ['unterlagen', 'sicht', 'kraft', 'nachweis', 'massnahme'];
  await alle((_, i) => ({ typ: 'antwort', knoten: 'pruefschritte', antwort: i < 21 ? richtig : ['sicht', 'unterlagen', 'kraft', 'nachweis', 'massnahme'] }));
  await lehr.warte(`document.querySelector('.kennzahlen')?.innerText.includes('24 von 25')`);
  await lehr.werte(`${schliessen}; true`);
  await st.warte(`document.querySelector('main article[data-typ="rueckmeldung"]')`);
  await klickeUndWarte(st, `document.querySelector('main article .knopf-haupt').click()`);
  // 3. Modell
  await alle(() => ({ typ: 'wahl', knoten: 'modell', option: 'rechnen' }));
  await klickeUndWarte(st, `document.querySelector('[data-option="rechnen"]').click()`);
  await st.warte(`document.querySelector('main article[data-knoten="diagonale"]')`);
  // 4. Diagonale: aus den angezeigten Zahlen gerechnet; 15 richtig, 6 „zwei Diagonalen“ übersehen, 3 „F / 2“
  const a = await stand();
  const F = Number(/F = ([\d.,]+) kN/.exec(a.knoten.frage)[1].replace(/\./g, '').replace(',', '.'));
  const sin = Math.sin((Number(/θ = ([\d.,]+)°/.exec(a.knoten.frage)[1].replace(',', '.')) * Math.PI) / 180);
  const zahlText = (x) => String(Math.round(x * 100) / 100).replace('.', ',');
  await alle((_, i) => ({ typ: 'antwort', knoten: 'diagonale', antwort: zahlText(i < 15 ? F / (2 * sin) : i < 21 ? F / sin : F / 2) }));
  await lehr.warte(`document.querySelector('.kennzahlen')?.innerText.includes('24 von 25') && document.querySelectorAll('.runde-schritt.aktuell .balkenzeile').length === 3`);
  await st.warte(`document.querySelector('.abstimmung-kopf')?.innerText.includes('24 von 25')`);
  await lehr.werte(`window.scrollTo(0, 0); document.activeElement?.blur(); true`);
  await new Promise((r) => setTimeout(r, 1200));
  await foto(lehr, 'lehrende-06-kursrunde');
  await scharf(lehr, 'kursrunde-lehrende.png');
  await pruefeBarrierefreiheit(lehr, 'kursrunde-lehrende');
  messwerte.kursrunde.verteilungJetzt = await lehr.werte(`[...document.querySelectorAll('.runde-schritt.aktuell .balkenzeile')].map((z) => z.innerText.replace(/\\s+/g, ' ').trim())`);
  messwerte.kursrunde.schritte = await lehr.werte(`[...document.querySelectorAll('.runde-schritt')].map((z) => z.querySelector('h2, h3').textContent + ': ' + (z.querySelector('.runde-entscheidung')?.innerText.replace(/\\s+/g, ' ').trim() ?? 'offen'))`);
  await geraet(lehr, 'desktop', 'dunkel');
  await pruefeBarrierefreiheit(lehr, 'kursrunde-lehrende-dunkel');
  await geraet(lehr, 'telefon');
  await pruefeBarrierefreiheit(lehr, 'kursrunde-lehrende-telefon');
  await geraet(lehr, 'desktop');
  await foto(st, 'telefon-12-kursrunde');
  await pruefeBarrierefreiheit(st, 'kursrunde-studierende-telefon');
  messwerte.kursrunde.anzeigeTelefon = await st.werte(`document.querySelector('.abstimmung-kopf').innerText`);
  const t0 = Date.now();
  await lehr.werte(`${schliessen}; true`);
  await st.warte(`document.querySelector('main article[data-typ="rueckmeldung"]')`);
  messwerte.kursrunde.schliessenBisTelefonMs = Date.now() - t0;
  messwerte.kursrunde.rueckmeldungTelefon = await st.werte(`document.querySelector('.rueckmeldung-titel').innerText`);
  await lehr.werte(`window.confirm = () => true; [...document.querySelectorAll('main button')].find((b) => b.textContent.includes('Runde beenden')).click(); true`);
  await lehr.warte(`document.querySelector('main')?.innerText.includes('Die Runde ist beendet')`);
  messwerte.kursrunde.teilnehmende = '24 simuliert über die Schnittstelle, 1 im Browser auf Telefonbreite';
  for (const s of [lehr, st]) { s.schliesse(); s.browser.schliesse(); }
}

/** Administration: Zugang anlegen, damit anmelden, sperren (abgemeldet, abgewiesen), entsperren; Einstellungen, Protokoll. */
async function adminSitzung() {
  const seite = await Cdp.neueSeite(undefined, await Cdp.neuerKontext());
  await geraet(seite, 'desktop');
  await seite.gehe(`${APP}/admin`);
  await seite.warte(`document.querySelector('#schluessel')`);
  await pruefeBarrierefreiheit(seite, 'admin-anmeldung');
  await seite.werte(`document.querySelector('#schluessel').value = 'nachweis-admin'; document.querySelector('#schluessel').form.requestSubmit(); true`);
  await seite.warte(`document.querySelector('table caption')`);
  await pruefeBarrierefreiheit(seite, 'admin-zugaenge');
  await seite.werte(`document.querySelector('#zugang-name').value = 'Lehrstuhl Baustatik'; document.querySelector('#zugang-name').form.requestSubmit(); true`);
  await seite.warte(`document.querySelector('.schluessel-neu .code-gross')`);
  const schluessel = await seite.werte(`document.querySelector('.schluessel-neu .code-gross').textContent`);
  await seite.werte(`document.querySelector('.schluessel-neu .code-gross').textContent = 'XXXX-XXXX-XXXX-XXXX'; true`); // Schlüssel nicht im Bild
  await foto(seite, 'admin-01-zugaenge');
  await pruefeBarrierefreiheit(seite, 'admin-zugang-neu');
  const lehr = apiSitzung();
  messwerte.admin.anmeldungMitNeuemZugang = await lehr('POST', '/api/anmelden/lehrende', { schluessel }).then((r) => `200, Zugang „${r.zugang}“`, (e) => e.message.slice(0, 60));
  const zeile = `[...document.querySelectorAll('tbody tr')].find((tr) => tr.innerText.includes('Lehrstuhl Baustatik'))`;
  await seite.werte(`${zeile}.querySelector('button').click(); true`);
  await seite.warte(`${zeile}?.innerText.includes('gesperrt')`);
  messwerte.admin.nachSperrenSitzung = await lehr('GET', '/api/lehrende/kurse').then(() => 'noch angemeldet', (e) => (/: 401 /.test(e.message) ? '401: abgemeldet' : e.message.slice(0, 60)));
  messwerte.admin.nachSperrenAnmeldung = await apiSitzung()('POST', '/api/anmelden/lehrende', { schluessel }).then(() => 'angemeldet', (e) => (/: 403 /.test(e.message) ? '403: abgewiesen, Zugang gesperrt' : e.message.slice(0, 60)));
  await seite.werte(`${zeile}.querySelector('button').click(); true`);
  await seite.warte(`${zeile}?.innerText.includes('aktiv')`);
  messwerte.admin.nachEntsperren = await apiSitzung()('POST', '/api/anmelden/lehrende', { schluessel }).then(() => '200: angemeldet', (e) => e.message.slice(0, 60));
  await seite.werte(`location.hash = '#einstellungen'; true`);
  await seite.warte(`document.querySelector('#aufbewahrung')`);
  await foto(seite, 'admin-02-einstellungen');
  await pruefeBarrierefreiheit(seite, 'admin-einstellungen');
  messwerte.admin.einstellungenZeilen = await seite.werte(`document.querySelectorAll('tbody tr').length`);
  await seite.werte(`location.hash = '#protokoll'; true`);
  await seite.warte(`document.querySelector('table caption')?.textContent.includes('Einträge')`);
  await foto(seite, 'admin-03-protokoll');
  await pruefeBarrierefreiheit(seite, 'admin-protokoll');
  messwerte.admin.protokollAktionen = await seite.werte(`[...new Set([...document.querySelectorAll('tbody tr')].map((tr) => tr.children[3].textContent))]`);
  await geraet(seite, 'desktop', 'dunkel');
  await pruefeBarrierefreiheit(seite, 'admin-protokoll-dunkel');
  await geraet(seite, 'telefon');
  await pruefeBarrierefreiheit(seite, 'admin-protokoll-telefon');
  seite.schliesse();
  seite.browser.schliesse();
}

/** Ton: aus als Voreinstellung, Schalter, bleibt nach Neuladen an, Rückmeldung löst den passenden Ton aus. */
async function tonSitzung() {
  const seite = await Cdp.neueSeite(undefined, await Cdp.neuerKontext());
  await geraet(seite, 'desktop');
  await beitreten(seite);
  messwerte.ton.voreinstellung = await seite.werte(`document.querySelector('.ton-schalter').getAttribute('aria-pressed')`);
  await seite.werte(`document.querySelector('.ton-schalter').click(); true`);
  await seite.warte(`document.querySelector('.ton-schalter').getAttribute('aria-pressed') === 'true'`);
  await seite.warte(`fetch('/api/ich').then((r) => r.json()).then((j) => j.ton)`);
  await seite.gehe(`${APP}/`);
  await seite.warte(`document.querySelector('.ton-schalter') && document.querySelector('.kacheln')`);
  messwerte.ton.nachNeuladen = await seite.werte(`document.querySelector('.ton-schalter').getAttribute('aria-pressed')`);
  await pruefeBarrierefreiheit(seite, 'uebersicht-ton-an');
  await seite.werte(`document.querySelector('a[href="#/spiel/fussgaengerbruecke"]').click(); true`);
  await seite.warte(`document.querySelector('main article[data-knoten="meldung"]')`);
  await klickeUndWarte(seite, `document.querySelector('[data-option="sperren"]').click()`);
  messwerte.ton.gespieltNachGuterEntscheidung = await seite.werte(`import('/ton.js').then((m) => [...m.tonProtokoll])`);
  messwerte.ton.textGleichzeitig = await seite.werte(`document.querySelector('.rueckmeldung-titel').innerText`);
  messwerte.ton.webAudio = await seite.werte(`typeof AudioContext === 'function' ? 'AudioContext vorhanden' : 'fehlt'`);
  seite.schliesse();
  seite.browser.schliesse();
}

async function offline() {
  // OER-Export wie eine Lehrperson ihn herunterlädt, dann als Datei im Browser öffnen (file://, ohne Server)
  const anmeldung = await fetch(`${APP}/api/anmelden/lehrende`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ schluessel: 'nachweis' }) });
  const cookie = anmeldung.headers.get('set-cookie').split(';')[0];
  const html = await (await fetch(`${APP}/api/lehrende/oer/fussgaengerbruecke`, { headers: { Cookie: cookie } })).text();
  mkdirSync(EXPORT, { recursive: true });
  writeFileSync(`${EXPORT}/fussgaengerbruecke-v2.html`, html);
  messwerte.offline.groesseKB = Math.round(Buffer.byteLength(html) / 1024);
  const seite = await Cdp.neueSeite(undefined, await Cdp.neuerKontext());
  await geraet(seite, 'telefon');
  const anfragen = [];
  await seite.sende('Network.enable');
  seite.auf('Network.requestWillBeSent', (p) => anfragen.push(p.request.url.slice(0, 60)));
  await seite.gehe(`file://${EXPORT}/fussgaengerbruecke-v2.html`);
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
// Gemeinsam spielen: 50 Teams zu je drei simulierten Personen, dann eine Kursrunde mit 200 simulierten Personen
if (process.env.LAST !== '0') {
  for (const f of [() => lasttestTeams({ basis: APP, kurscode: 'DEMO', teams: 50, groesse: 3 }), () => lasttestRunde({ basis: APP, kurscode: 'DEMO', schluessel: 'nachweis', personen: 200 })]) {
    const r = await f();
    console.log(`Last ${r.art}: ${JSON.stringify(r)}`);
    messwerte.last.push(r);
  }
}
const probe = await Cdp.neueSeite();
messwerte.umgebung.browser = probe.version.Browser;
probe.schliesse();
probe.browser.schliesse();
await studierendeSitzung('desktop');
await studierendeSitzung('telefon');
await studierendeSitzung('desktop', 'dunkel');
await riskanteEntscheidung();
await lehrendeSitzung();
await editorSitzung();
await vorlageSitzung();
await teamSitzung();
await kursrundeSitzung();
await adminSitzung();
await tonSitzung();
await offline();
writeFileSync(`${AUSGABE}/messwerte.json`, JSON.stringify(messwerte, null, 2) + '\n');
console.log(JSON.stringify(messwerte.browser, null, 2));
console.log('Barrierefreiheit:', Object.entries(messwerte.barrierefreiheit).map(([k, v]) => `${k}: ${v.verstoesse.length} Verstöße`).join('; '));
console.log('Offline:', JSON.stringify(messwerte.offline));
console.log('Editor, Vorlage, Team, Live-Runde, Administration, Ton:', JSON.stringify({ editor: messwerte.editor, vorlage: messwerte.vorlage, team: messwerte.team, kursrunde: messwerte.kursrunde, admin: messwerte.admin, ton: messwerte.ton }));
process.exit(0);
