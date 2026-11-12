// Oberfläche der Administration: Zugänge für Lehrende vergeben, sperren und entsperren, Aufbewahrungsfrist setzen,
// Einstellungen der Instanz ansehen, Protokoll der Verwaltung lesen. Die Administration sieht keine Spielstände.

import { api, ApiFehler } from './api.js';
import { h, leere, fokus, melde } from './ui.js';
import { symbol } from './symbole.js';

const inhalt = document.getElementById('inhalt');
const navigation = document.getElementById('navigation');
const BEREICHE = [['zugaenge', 'Zugänge'], ['einstellungen', 'Einstellungen'], ['protokoll', 'Protokoll']];
const datum = (iso) => (iso ? new Date(iso).toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' }) : '–');

function nav(aktiv) {
  leere(navigation, BEREICHE.map(([id, name]) => h('a', { href: `#${id}`, class: 'nav-link', 'aria-current': id === aktiv ? 'page' : null }, name)),
    h('button', { class: 'knopf-text', type: 'button', onclick: async () => { await api('POST', '/api/abmelden', {}); anmeldung(); } }, 'Abmelden'));
}

function anmeldung() {
  leere(navigation);
  const feld = h('input', { id: 'schluessel', type: 'password', autocomplete: 'current-password', required: true });
  const titel = h('h1', {}, 'Anmeldung für die Administration');
  leere(inhalt, h('section', { class: 'karte schmal' }, titel,
    h('form', { class: 'stapel', onsubmit: async (e) => {
      e.preventDefault();
      try { await api('POST', '/api/anmelden/admin', { schluessel: feld.value }); zeige(); } catch (err) { melde(err.message, 'fehler'); }
    } }, h('label', { for: 'schluessel', class: 'beschriftung' }, 'Schlüssel der Administration'), feld,
    h('button', { class: 'knopf knopf-haupt', type: 'submit' }, 'Anmelden'))));
  fokus(titel);
}

async function zugaenge(neuerSchluessel = null) {
  const liste = await api('GET', '/api/admin/zugaenge');
  const name = h('input', { id: 'zugang-name', required: true, maxlength: 80, autocomplete: 'off', placeholder: 'z. B. Lehrstuhl Baustatik', 'aria-describedby': 'zugang-name-h' });
  const titel = h('h1', {}, 'Zugänge für Lehrende');
  leere(inhalt, titel,
    h('p', { class: 'gedaempft' }, 'Jeder Zugang hat einen eigenen Schlüssel. Ein gesperrter Zugang ist sofort abgemeldet und kann sich nicht mehr anmelden; entsperren stellt ihn wieder her. Der gemeinsame Schlüssel der Instanz ist ebenfalls ein Zugang.'),
    neuerSchluessel ? h('section', { class: 'karte schmal schluessel-neu', role: 'status' },
      h('h2', {}, symbol('schluessel'), `Neuer Zugang: ${neuerSchluessel.bezeichnung}`),
      h('p', {}, 'Der Schlüssel wird nur jetzt angezeigt. Geben Sie ihn auf einem sicheren Weg weiter:'),
      h('p', { class: 'code-gross' }, neuerSchluessel.schluessel)) : null,
    h('div', { class: 'tabelle-rahmen' }, h('table', {},
      h('caption', {}, `${liste.length} Zugänge, davon ${liste.filter((z) => z.gesperrt).length} gesperrt`),
      h('thead', {}, h('tr', {}, ['Bezeichnung', 'Art', 'angelegt', 'zuletzt aktiv', 'Stand', ''].map((t) => h('th', { scope: 'col' }, t)))),
      h('tbody', {}, liste.map((z) => h('tr', { 'data-zugang': z.id },
        h('td', {}, z.bezeichnung), h('td', {}, z.art === 'instanz' ? 'gemeinsamer Schlüssel' : 'persönlich'),
        h('td', {}, datum(z.erstellt)), h('td', {}, datum(z.zuletzt)),
        h('td', {}, h('span', { class: `zugang-stand ${z.gesperrt ? 'schlecht' : 'gut'}` }, symbol(z.gesperrt ? 'schloss' : 'richtig'), z.gesperrt ? 'gesperrt' : 'aktiv')),
        h('td', {}, h('button', { class: 'knopf-klein', type: 'button', onclick: async () => {
          try {
            await api('PUT', `/api/admin/zugaenge/${z.id}`, { gesperrt: !z.gesperrt });
            melde(z.gesperrt ? `„${z.bezeichnung}“ entsperrt.` : `„${z.bezeichnung}“ gesperrt und abgemeldet.`);
            await zugaenge();
            document.querySelector(`[data-zugang="${z.id}"] button`)?.focus();
          } catch (e) { melde(e.message, 'fehler'); }
        } }, z.gesperrt ? 'Entsperren' : 'Sperren', h('span', { class: 'nur-vorlesen' }, `: ${z.bezeichnung}`)))))))),
    h('section', { class: 'karte schmal' }, h('h2', {}, 'Neuer Zugang'),
      h('form', { class: 'stapel', onsubmit: async (e) => {
        e.preventDefault();
        try { const z = await api('POST', '/api/admin/zugaenge', { bezeichnung: name.value }); await zugaenge(z); fokus(inhalt.querySelector('.schluessel-neu h2')); } catch (err) { melde(err.message, 'fehler'); }
      } },
      h('label', { for: 'zugang-name', class: 'beschriftung' }, 'Bezeichnung'),
      h('p', { class: 'feld-hilfe', id: 'zugang-name-h' }, 'Eine Stelle oder Rolle, kein Personenname nötig.'), name,
      h('button', { class: 'knopf knopf-haupt', type: 'submit' }, symbol('plus'), 'Zugang anlegen'))));
  if (!neuerSchluessel) fokus(titel);
}

async function einstellungen() {
  const r = await api('GET', '/api/admin/einstellungen');
  const tage = h('input', { id: 'aufbewahrung', type: 'number', min: 7, max: 3650, step: 1, required: true, value: r.aufbewahrungTage, 'aria-describedby': 'aufbewahrung-h' });
  const titel = h('h1', {}, 'Einstellungen');
  leere(inhalt, titel,
    h('section', { class: 'karte schmal' }, h('h2', {}, 'Aufbewahrungsfrist'),
      h('form', { class: 'stapel', onsubmit: async (e) => {
        e.preventDefault();
        try {
          const a = await api('PUT', '/api/admin/einstellungen', { aufbewahrungTage: Number(tage.value) });
          const n = Object.values(a.geloescht).reduce((s, x) => s + x, 0);
          melde(`Gespeichert: ${a.aufbewahrungTage} Tage. Beim Aufräumen gelöscht: ${n} Einträge.`);
          await einstellungen();
        } catch (err) { melde(err.message, 'fehler'); }
      } },
      h('label', { for: 'aufbewahrung', class: 'beschriftung' }, 'Tage ohne Nutzung, nach denen Versuche, Teams und Pseudonyme gelöscht werden'),
      h('p', { class: 'feld-hilfe', id: 'aufbewahrung-h' }, `7 bis 3650 Tage. Gilt sofort: Beim Speichern wird aufgeräumt, danach alle sechs Stunden. Derzeit festgelegt durch: ${r.aufbewahrungQuelle}.`), tage,
      h('button', { class: 'knopf knopf-haupt', type: 'submit' }, 'Speichern'))),
    h('div', { class: 'tabelle-rahmen' }, h('table', {},
      h('caption', {}, 'Instanz (nur lesen; geändert über Umgebungsvariablen, siehe README)'),
      h('tbody', {}, r.instanz.map((x) => h('tr', {}, h('th', { scope: 'row' }, x.name), h('td', {}, x.wert)))))));
  fokus(titel);
}

async function protokoll() {
  const liste = await api('GET', '/api/admin/protokoll');
  const titel = h('h1', {}, 'Protokoll');
  leere(inhalt, titel,
    h('p', { class: 'gedaempft' }, 'Was in der Verwaltung geschehen ist: Anmeldungen von Lehrenden und Administration, Zugänge, Kurse, Freigaben, gespeicherte Szenarien, Kursrunden, Exporte. Keine Spielschritte von Studierenden, keine IP-Adressen. Einträge werden nach der Aufbewahrungsfrist gelöscht.'),
    // Auf schmalen Bildschirmen scrollt die Tabelle seitlich; der Rahmen ist dafür mit der Tastatur erreichbar
    h('div', { class: 'tabelle-rahmen', tabindex: '0', role: 'region', 'aria-label': 'Protokoll, seitlich scrollbar' }, h('table', {},
      h('caption', {}, `Die letzten ${liste.length} Einträge`),
      h('thead', {}, h('tr', {}, ['Zeit', 'Rolle', 'Wer', 'Was', 'Woran'].map((t) => h('th', { scope: 'col' }, t)))),
      h('tbody', {}, liste.map((p) => h('tr', {},
        h('td', {}, datum(p.zeit)), h('td', {}, { admin: 'Administration', lehrende: 'Lehrende' }[p.rolle] ?? p.rolle), h('td', {}, p.akteur),
        h('td', {}, p.aktion), h('td', {}, p.ziel ?? '–')))))));
  fokus(titel);
}

async function zeige() {
  try {
    const ich = await api('GET', '/api/ich');
    if (ich.rolle !== 'admin') return anmeldung();
  } catch (e) { if (e instanceof ApiFehler && e.status === 401) return anmeldung(); throw e; }
  const bereich = location.hash.replace('#', '') || 'zugaenge';
  nav(bereich);
  try { await ({ zugaenge, einstellungen, protokoll }[bereich] ?? zugaenge)(); } catch (e) { melde(e.message, 'fehler'); }
}

window.addEventListener('hashchange', zeige);
zeige();
