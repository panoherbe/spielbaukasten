// Oberfläche für Lehrende: Kurse und Freigaben, Szenarien prüfen und hochladen, Auswertung, Exporte (xAPI, OER).

import { api, ApiFehler } from './api.js';
import { h, leere, fokus, melde, zahl } from './ui.js';

const inhalt = document.getElementById('inhalt');
const navigation = document.getElementById('navigation');
const BEREICHE = [['kurse', 'Kurse'], ['szenarien', 'Szenarien'], ['auswertung', 'Auswertung']];

function nav(aktiv) {
  leere(navigation, BEREICHE.map(([id, name]) => h('a', { href: `#${id}`, class: 'nav-link', 'aria-current': id === aktiv ? 'page' : null }, name)),
    h('a', { href: '/', class: 'nav-link' }, 'Vorschau'),
    h('button', { class: 'knopf-text', type: 'button', onclick: async () => { await api('POST', '/api/abmelden', {}); anmeldung(); } }, 'Abmelden'));
}

function anmeldung() {
  leere(navigation);
  const feld = h('input', { id: 'schluessel', type: 'password', autocomplete: 'current-password', required: true });
  const titel = h('h1', {}, 'Anmeldung für Lehrende');
  leere(inhalt, h('section', { class: 'karte schmal' }, titel,
    h('form', { class: 'stapel', onsubmit: async (e) => {
      e.preventDefault();
      try { await api('POST', '/api/anmelden/lehrende', { schluessel: feld.value }); zeige(); } catch (err) { melde(err.message, 'fehler'); }
    } }, h('label', { for: 'schluessel', class: 'beschriftung' }, 'Schlüssel dieser Instanz'), feld,
    h('button', { class: 'knopf knopf-haupt', type: 'submit' }, 'Anmelden'))));
  fokus(titel);
}

function herunterladen(name, inhaltText, typ = 'application/json') {
  const a = h('a', { href: URL.createObjectURL(new Blob([inhaltText], { type: typ })), download: name });
  a.click();
}

async function kurse() {
  const [liste, szenarien] = await Promise.all([api('GET', '/api/lehrende/kurse'), api('GET', '/api/lehrende/szenarien')]);
  const name = h('input', { id: 'kursname', required: true, maxlength: 120, placeholder: 'z. B. Technische Mechanik I, SoSe 2027' });
  const titel = h('h1', {}, 'Kurse');
  leere(inhalt, titel,
    h('ul', { class: 'kacheln' }, liste.map((k) => h('li', { class: 'karte kachel' },
      h('h2', {}, k.name),
      h('p', {}, 'Kurscode für Studierende: ', h('span', { class: 'code' }, k.codeAnzeige)),
      h('p', { class: 'gedaempft' }, `${k.teilnehmende} Teilnehmende (Pseudonyme)`),
      h('fieldset', { class: 'auswahl' }, h('legend', { class: 'beschriftung' }, 'Freigegebene Szenarien'),
        szenarien.map((s) => h('label', { class: 'auswahl-option' },
          h('input', { type: 'checkbox', value: s.id, checked: k.szenarien.includes(s.id), onchange: async (e) => {
            const gewaehlt = [...e.target.closest('fieldset').querySelectorAll('input:checked')].map((i) => i.value);
            try { await api('PUT', `/api/lehrende/kurse/${k.id}/szenarien`, { szenarien: gewaehlt }); melde('Freigabe gespeichert.'); } catch (err) { melde(err.message, 'fehler'); }
          } }), h('span', {}, s.titel)))))),
    ),
    h('section', { class: 'karte schmal' }, h('h2', {}, 'Neuer Kurs'),
      h('form', { class: 'stapel', onsubmit: async (e) => {
        e.preventDefault();
        try { const k = await api('POST', '/api/lehrende/kurse', { name: name.value, szenarien: szenarien.map((s) => s.id) }); melde(`Kurs angelegt, Code ${k.code}`); kurse(); } catch (err) { melde(err.message, 'fehler'); }
      } }, h('label', { for: 'kursname', class: 'beschriftung' }, 'Name'), name, h('button', { class: 'knopf knopf-haupt', type: 'submit' }, 'Anlegen'))));
  fokus(titel);
}

function fehlerliste(r) {
  return h('div', { class: 'pruefergebnis' },
    r.fehler.length === 0 ? h('p', { class: 'gut' }, '✓ Keine Fehler.') : h('p', { class: 'schlecht' }, `${r.fehler.length} Fehler:`),
    h('ul', {}, r.fehler.map((f) => h('li', {}, h('code', {}, f.pfad || '(Szenario)'), ' ', f.meldung))),
    r.warnungen.length ? h('p', { class: 'neutral' }, `${r.warnungen.length} Hinweise:`) : null,
    h('ul', {}, r.warnungen.map((f) => h('li', {}, h('code', {}, f.pfad), ' ', f.meldung))));
}

async function szenarien() {
  const liste = await api('GET', '/api/lehrende/szenarien');
  const datei = h('input', { id: 'datei', type: 'file', accept: '.json,application/json' });
  const ergebnis = h('div', { 'aria-live': 'polite' });
  const lies = async () => { const f = datei.files[0]; if (!f) throw new Error('Bitte eine Datei wählen'); return JSON.parse(await f.text()); };
  const titel = h('h1', {}, 'Szenarien');
  leere(inhalt, titel,
    h('div', { class: 'tabelle-rahmen' }, h('table', {},
      h('thead', {}, h('tr', {}, ['Titel', 'id', 'Version', 'Quelle', 'Aufgaben', 'Lizenz', ''].map((t) => h('th', { scope: 'col' }, t)))),
      h('tbody', {}, liste.map((s) => h('tr', {},
        h('td', {}, s.titel), h('td', {}, h('code', {}, s.id)), h('td', {}, s.version), h('td', {}, s.quelle), h('td', {}, s.aufgaben),
        h('td', {}, s.lizenz.replace(/-/g, ' ')),
        h('td', { class: 'knopfreihe' },
          h('a', { class: 'knopf-klein', href: `/#/spiel/${s.id}` }, 'Vorschau'),
          h('a', { class: 'knopf-klein', href: `/api/lehrende/oer/${s.id}`, download: `${s.id}-v${s.version}.html` }, 'OER-Export'),
          h('button', { class: 'knopf-klein', type: 'button', onclick: async () => herunterladen(`${s.id}-v${s.version}.metadaten.json`, JSON.stringify(await api('GET', `/api/lehrende/oer/${s.id}/metadaten`), null, 2)) }, 'Metadaten'))))))),
    h('section', { class: 'karte' }, h('h2', {}, 'Szenario prüfen oder hochladen'),
      h('p', {}, 'Eine Datei szenario.json (Format: docs/INHALTE.md im Repository). Hochladen legt eine neue Version an; laufende Versuche bleiben bei ihrer Version.'),
      h('div', { class: 'stapel' }, h('label', { for: 'datei', class: 'beschriftung' }, 'Datei'), datei),
      h('div', { class: 'knopfreihe' },
        h('button', { class: 'knopf', type: 'button', onclick: async () => { try { leere(ergebnis, fehlerliste(await api('POST', '/api/lehrende/szenarien/pruefen', await lies()))); } catch (e) { melde(e.message, 'fehler'); } } }, 'Nur prüfen'),
        h('button', { class: 'knopf knopf-haupt', type: 'button', onclick: async () => {
          try { const r = await api('POST', '/api/lehrende/szenarien', await lies()); leere(ergebnis, fehlerliste(r)); melde('Neue Version gespeichert.'); szenarien(); } catch (e) {
            if (e instanceof ApiFehler && e.status === 422) leere(ergebnis, fehlerliste(e.daten)); else melde(e.message, 'fehler');
          }
        } }, 'Hochladen')),
      ergebnis));
  fokus(titel);
}

async function auswertung() {
  const [liste, kursliste] = await Promise.all([api('GET', '/api/lehrende/szenarien'), api('GET', '/api/lehrende/kurse')]);
  const wahlS = h('select', { id: 'wahl-szenario' }, liste.map((s) => h('option', { value: s.id }, s.titel)));
  const wahlK = h('select', { id: 'wahl-kurs' }, h('option', { value: '' }, 'alle Kurse'), kursliste.map((k) => h('option', { value: k.id }, k.name)));
  const ziel = h('div', { 'aria-live': 'polite' });
  const lade = async () => {
    const q = new URLSearchParams({ szenario: wahlS.value, ...(wahlK.value ? { kurs: wahlK.value } : {}) });
    const r = await api('GET', `/api/lehrende/auswertung?${q}`);
    if (r.zuWenig) return leere(ziel, h('p', { class: 'karte' }, `Noch zu wenige Personen (${r.personen}); Auswertungen erscheinen ab ${r.minGruppe}, damit niemand erkennbar ist.`));
    const pz = (a, b) => (b ? `${zahl((a / b) * 100, 0)} %` : '–');
    leere(ziel,
      h('ul', { class: 'kennzahlen' },
        [['Personen', r.personen], ['Versuche', r.versuche], ['abgeschlossen', r.beendet ?? 0], ['mittlere Punktquote', r.quote === null ? '–' : `${zahl(r.quote * 100, 0)} %`],
          ['Erfolg', r.ergebnisse.erfolg ?? 0], ['Teilerfolg', r.ergebnisse.teilerfolg ?? 0], ['Misserfolg', r.ergebnisse.misserfolg ?? 0]]
          .map(([k, v]) => h('li', { class: 'karte kennzahl' }, h('span', { class: 'kennzahl-wert' }, String(v)), h('span', { class: 'kennzahl-name' }, k)))),
      h('div', { class: 'tabelle-rahmen' }, h('table', {},
        h('caption', {}, 'Wo stehen die Studierenden? Je Knoten'),
        h('thead', {}, h('tr', {}, ['Knoten', 'Typ', 'beantwortet', '1. Versuch richtig', 'aufgelöst', 'typische Fehler / Entscheidungen'].map((t) => h('th', { scope: 'col' }, t)))),
        h('tbody', {}, r.knoten.map((k) => h('tr', {},
          h('td', {}, k.titel), h('td', {}, k.typ), h('td', {}, k.typ === 'aufgabe' ? k.versuche : '–'),
          h('td', {}, k.typ === 'aufgabe' ? pz(k.ersterVersuchRichtig, k.versuche) : '–'), h('td', {}, k.typ === 'aufgabe' ? k.aufgeloest : '–'),
          h('td', {}, Object.entries(k.typ === 'szene' ? k.optionen : k.fehlerarten).map(([a, n]) => `${a}: ${n}`).join(' · ') || '–')))))),
      h('button', { class: 'knopf', type: 'button', onclick: async () => herunterladen(`xapi-${wahlS.value}.json`, JSON.stringify(await api('GET', `/api/lehrende/xapi?${q}`), null, 2)) }, 'xAPI-Statements herunterladen'));
  };
  wahlS.onchange = lade; wahlK.onchange = lade;
  const titel = h('h1', {}, 'Auswertung');
  leere(inhalt, titel, h('div', { class: 'filterzeile' },
    h('label', { for: 'wahl-szenario', class: 'beschriftung' }, 'Szenario'), wahlS,
    h('label', { for: 'wahl-kurs', class: 'beschriftung' }, 'Kurs'), wahlK), ziel);
  fokus(titel);
  if (liste.length) await lade();
}

async function zeige() {
  try {
    const ich = await api('GET', '/api/ich');
    if (ich.rolle !== 'lehrende') return anmeldung();
  } catch (e) { if (e instanceof ApiFehler && e.status === 401) return anmeldung(); throw e; }
  const bereich = location.hash.replace('#', '') || 'kurse';
  nav(bereich);
  try { await ({ kurse, szenarien, auswertung }[bereich] ?? kurse)(); } catch (e) { melde(e.message, 'fehler'); }
}

window.addEventListener('hashchange', zeige);
zeige();
