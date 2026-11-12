// Oberfläche für Lehrende: Kurse und Freigaben, Szenarien bearbeiten (Editor), prüfen und hochladen, Live-Runde,
// Auswertung, Exporte (xAPI, OER).

import { api, ApiFehler } from './api.js';
import { h, leere, fokus, melde, zahl } from './ui.js';
import { symbol, ring } from './symbole.js';
import { editor } from './editor.js';
import { runden, rundeLive } from './kursrunde.js';
import { VORLAGEN } from './vorlagen.js';
import { ARTEN } from './klartext.js';

const inhalt = document.getElementById('inhalt');
const navigation = document.getElementById('navigation');
const BEREICHE = [['kurse', 'Kurse'], ['szenarien', 'Szenarien'], ['runde', 'Live-Runde'], ['auswertung', 'Auswertung']];
let offenerEditor = null; // fragt vor dem Verlassen, wenn Änderungen nicht gespeichert sind
let aufraeumen = null; // schließt die Live-Verbindung einer Runde
let neuerEntwurf = null; // Vorlage, Titel und Name für „Neues Szenario aus Vorlage“
let letzteAdresse = location.hash;

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

const QUELLE = { datei: 'mitgeliefert', hochgeladen: 'hochgeladen', editor: 'im Editor' };

async function szenarien() {
  const liste = await api('GET', '/api/lehrende/szenarien');
  const datei = h('input', { id: 'datei', type: 'file', accept: '.json,application/json' });
  const ergebnis = h('div', { 'aria-live': 'polite' });
  const lies = async () => { const f = datei.files[0]; if (!f) throw new Error('Bitte eine Datei wählen'); return JSON.parse(await f.text()); };
  const titel = h('h1', {}, 'Szenarien');
  leere(inhalt, titel,
    h('div', { class: 'knopfreihe szenarien-kopf' },
      h('a', { class: 'knopf knopf-haupt', href: '#vorlage' }, symbol('plus'), 'Neues Szenario aus Vorlage'),
      h('p', { class: 'gedaempft' }, 'Entscheidungsspiel, Rechenübung oder Quiz: Sie ändern nur noch die Texte.')),
    h('div', { class: 'tabelle-rahmen' }, h('table', {},
      h('caption', { class: 'nur-vorlesen' }, 'Szenarien dieser Installation'),
      h('thead', {}, h('tr', {}, ['Titel', 'Version', 'Herkunft', 'Aufgaben', 'Lizenz', ''].map((t) => h('th', { scope: 'col' }, t)))),
      h('tbody', {}, liste.map((s) => h('tr', {},
        h('td', {}, s.titel), h('td', {}, s.version), h('td', {}, QUELLE[s.quelle] ?? s.quelle), h('td', {}, s.aufgaben),
        h('td', {}, s.lizenz.replace(/-/g, ' ')),
        h('td', { class: 'knopfreihe' },
          h('a', { class: 'knopf-klein', href: `#editor/${encodeURIComponent(s.id)}` }, symbol('stift'), 'Bearbeiten', h('span', { class: 'nur-vorlesen' }, `: ${s.titel}`)),
          h('a', { class: 'knopf-klein', href: `/#/spiel/${s.id}` }, 'Vorschau', h('span', { class: 'nur-vorlesen' }, `: ${s.titel}`)),
          h('a', { class: 'knopf-klein', href: `/api/lehrende/oer/${s.id}`, download: `${s.id}-v${s.version}.html` }, 'OER-Export', h('span', { class: 'nur-vorlesen' }, `: ${s.titel}`)),
          h('button', { class: 'knopf-klein', type: 'button', onclick: async () => herunterladen(`${s.id}-v${s.version}.metadaten.json`, JSON.stringify(await api('GET', `/api/lehrende/oer/${s.id}/metadaten`), null, 2)) }, 'Metadaten', h('span', { class: 'nur-vorlesen' }, `: ${s.titel}`)))))))),
    h('details', { class: 'karte fortgeschritten' }, h('summary', {}, symbol('einstellungen'), 'Für Fortgeschrittene: Szenario-Datei prüfen oder hochladen'),
      h('div', { class: 'fortgeschritten-inhalt' },
        h('p', {}, 'Eine Datei szenario.json (Format: docs/INHALTE.md im Repository). Hochladen legt eine neue Version an; laufende Versuche bleiben bei ihrer Version.'),
        h('div', { class: 'stapel' }, h('label', { for: 'datei', class: 'beschriftung' }, 'Datei'), datei),
        h('div', { class: 'knopfreihe' },
          h('button', { class: 'knopf', type: 'button', onclick: async () => { try { leere(ergebnis, fehlerliste(await api('POST', '/api/lehrende/szenarien/pruefen', await lies()))); } catch (e) { melde(e.message, 'fehler'); } } }, 'Nur prüfen'),
          h('button', { class: 'knopf knopf-haupt', type: 'button', onclick: async () => {
            try { const r = await api('POST', '/api/lehrende/szenarien', await lies()); leere(ergebnis, fehlerliste(r)); melde('Neue Version gespeichert.'); szenarien(); } catch (e) {
              if (e instanceof ApiFehler && e.status === 422) leere(ergebnis, fehlerliste(e.daten)); else melde(e.message, 'fehler');
            }
          } }, 'Hochladen')),
        ergebnis)));
  fokus(titel);
}

/** Neues Szenario aus einer Vorlage: Vorlage wählen, Titel und Name eintragen, im Editor öffnen. */
async function vorlage() {
  const liste = await api('GET', '/api/lehrende/szenarien');
  let gewaehlt = VORLAGEN[0];
  const neuTitel = h('input', { id: 'vorlage-titel', required: true, autocomplete: 'off', maxlength: 120, value: gewaehlt.titel, 'aria-describedby': 'vorlage-titel-h' });
  const urheber = h('input', { id: 'vorlage-urheber', required: true, autocomplete: 'organization', maxlength: 200, 'aria-describedby': 'vorlage-urheber-h' });
  let titelSelbst = false;
  neuTitel.addEventListener('input', () => { titelSelbst = true; });
  // Jede Vorlage eine Karte mit einem echten Optionsfeld (Pfeiltasten wählen); die Beschriftung deckt die ganze Karte ab
  const karten = VORLAGEN.map((v, i) => h('div', { class: 'vorlage-karte' },
    h('input', { type: 'radio', name: 'vorlage', id: `vorlage-${v.art}`, value: v.art, checked: i === 0, 'aria-describedby': `vorlage-${v.art}-b`,
      onchange: () => { gewaehlt = v; if (!titelSelbst) neuTitel.value = v.titel; } }),
    h('label', { for: `vorlage-${v.art}`, class: 'vorlage-name' }, h('span', { class: 'vorlage-zeichen', 'aria-hidden': 'true' }, symbol(v.zeichen)), v.name),
    h('p', { class: 'vorlage-text', id: `vorlage-${v.art}-b` }, v.beschreibung),
    h('p', { class: 'vorlage-ablauf' }, h('span', { class: 'nur-vorlesen' }, 'Ablauf: '), v.ablauf.map((x, j) => [j ? h('span', { class: 'vorlage-pfeil', 'aria-hidden': 'true' }, '→') : null, h('span', { class: 'chip' }, x)]))));
  const titel = h('h1', {}, 'Neues Szenario aus Vorlage');
  leere(inhalt,
    h('p', { class: 'chips' }, h('a', { class: 'chip zurueck', href: '#szenarien' }, symbol('pfeil'), 'Zurück zu den Szenarien')),
    titel,
    h('p', { class: 'einleitung' }, 'Wählen Sie eine Vorlage. Sie öffnet sich im Editor und ist sofort spielbar; Sie ändern nur noch die Texte. Gespeichert wird erst, wenn Sie „Als neue Version speichern“ wählen.'),
    h('form', { class: 'stapel vorlage-form', onsubmit: (e) => {
      e.preventDefault();
      neuerEntwurf = { vorlage: gewaehlt.art, titel: neuTitel.value.trim(), urheber: urheber.value.trim(), vorhanden: liste.map((s) => s.id) };
      location.hash = '#editor/neu';
    } },
    h('fieldset', { class: 'vorlagen' }, h('legend', { class: 'beschriftung' }, '1. Vorlage wählen'), h('div', { class: 'vorlagen-raster' }, karten)),
    h('div', { class: 'karte vorlage-angaben' },
      h('label', { for: 'vorlage-titel', class: 'beschriftung' }, '2. Titel des Szenarios'),
      h('p', { class: 'feld-hilfe', id: 'vorlage-titel-h' }, 'So sehen Studierende es in der Übersicht. Später unter „Allgemein“ änderbar.'), neuTitel,
      h('label', { for: 'vorlage-urheber', class: 'beschriftung' }, '3. Ihr Name oder Ihre Einrichtung'),
      h('p', { class: 'feld-hilfe', id: 'vorlage-urheber-h' }, 'Für die Lizenzangabe (CC BY 4.0), z. B. Lehrstuhl für Baustatik.'), urheber,
      h('button', { class: 'knopf knopf-haupt', type: 'submit' }, symbol('stift'), 'Im Editor öffnen'))));
  fokus(titel);
}

// --- Diagramme der Auswertung ---------------------------------------------------------------------------------------
// Alle Zahlen stehen als Text da; Balken und Farben sind Zugabe (aria-hidden). Breiten per CSSOM, damit die
// Content-Security-Policy ohne 'unsafe-inline' auskommt.
const BEWERTUNG = { gut: ['gut', 'richtig'], neutral: ['vertretbar', 'vertretbar'], schlecht: ['riskant', 'falsch'] };
const prozent = (a, b) => (b ? (a / b) * 100 : 0);

function spur(anteil, klasse = '') {
  return h('span', { class: 'spur', 'aria-hidden': 'true' }, h('span', { class: `spur-wert ${klasse}`.trim(), 'data-breite': String(Math.round(anteil * 10) / 10) }));
}

function zeigeBreiten(wurzel) {
  const setze = () => {
    wurzel.querySelectorAll('[data-breite]').forEach((el) => { el.style.width = `${el.dataset.breite}%`; });
    wurzel.querySelectorAll('.ring-bogen').forEach((el) => { el.style.strokeDashoffset = String(100 - Number(el.dataset.anteil) * 100); });
  };
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) setze(); else requestAnimationFrame(() => requestAnimationFrame(setze));
}

function diagramm(titel, zeichen, hinweis, inhalt, breit = false) {
  return h('section', { class: `karte diagramm${breit ? ' breit' : ''}` },
    h('h2', {}, symbol(zeichen), titel), hinweis ? h('p', { class: 'gedaempft diagramm-hinweis' }, hinweis) : null, inhalt);
}

function diagrammErgebnisse(r) {
  const teile = [['erfolg', 'Erfolg', 'gut', 'richtig'], ['teilerfolg', 'Teilerfolg', 'neutral', 'vertretbar'], ['misserfolg', 'Misserfolg', 'schlecht', 'falsch']]
    .map(([id, name, klasse, zeichen]) => ({ name, klasse, zeichen, n: r.ergebnisse[id] ?? 0 }));
  const summe = teile.reduce((s, t) => s + t.n, 0);
  return diagramm('Ausgang der abgeschlossenen Versuche', 'karte', `${summe} abgeschlossene Versuche`, summe ? [
    h('div', { class: 'gestapelt', 'aria-hidden': 'true' }, teile.map((t) => h('span', { class: t.klasse, 'data-breite': String(prozent(t.n, summe)) }))),
    h('ul', { class: 'legende' }, teile.map((t) => h('li', { class: t.klasse },
      h('span', { class: 'zeichen klein', 'aria-hidden': 'true' }, symbol(t.zeichen)), `${t.name}: `, h('strong', {}, String(t.n)), ` (${zahl(prozent(t.n, summe), 0)} %)`))),
    h('div', { class: 'punkte-block ausgang-ring' }, ring(teile[0].n / summe),
      h('p', { class: 'punkte-gross' }, `${zahl(prozent(teile[0].n, summe), 0)} %`, h('small', {}, 'erreichen den besten Ausgang')))] :
    h('p', {}, 'Noch kein Versuch abgeschlossen.'));
}

function diagrammErsterVersuch(r) {
  const aufgaben = r.knoten.filter((k) => k.typ === 'aufgabe' && k.versuche);
  return diagramm('Im ersten Versuch richtig', 'richtig', 'Je Aufgabe der Anteil der Versuche, die beim ersten Mal stimmten', aufgaben.length ?
    h('ul', { class: 'balkenliste' }, aufgaben.map((k) => {
      const p = prozent(k.ersterVersuchRichtig, k.versuche);
      return h('li', { class: 'balkenzeile' },
        h('span', { class: 'balkenzeile-name' }, k.titel),
        h('span', { class: 'balkenzeile-zahl' }, `${zahl(p, 0)} %`, h('small', {}, ` ${k.ersterVersuchRichtig} von ${k.versuche}${k.aufgeloest ? `, ${k.aufgeloest}× aufgelöst` : ''}`)),
        spur(p, p >= 67 ? 'gut' : p >= 34 ? 'neutral' : 'schlecht'));
    })) : h('p', {}, 'Noch keine Antworten.'));
}

function diagrammFehler(r) {
  const aufgaben = r.knoten.filter((k) => k.typ === 'aufgabe' && Object.keys(k.fehlerarten).length);
  return diagramm('Häufigste Fehler je Aufgabe', 'hinweis', 'Erkannte typische Fehler bei falschen Antworten; höchstens drei je Aufgabe', aufgaben.length ?
    h('div', { class: 'fehler-spalten' }, aufgaben.map((k) => {
      const liste = Object.entries(k.fehlerarten).sort((a, b) => b[1] - a[1]);
      const summe = liste.reduce((s, [, n]) => s + n, 0);
      return h('div', { class: 'entscheidung' }, h('h3', {}, k.titel),
        h('ul', { class: 'balkenliste' }, liste.slice(0, 3).map(([art, n]) => h('li', { class: 'balkenzeile' },
          h('span', { class: 'balkenzeile-name' }, art), h('span', { class: 'balkenzeile-zahl' }, `${n}×`, h('small', {}, ` ${zahl(prozent(n, summe), 0)} % der Fehler`)),
          spur(prozent(n, liste[0][1]), 'fehler')))));
    })) : h('p', {}, 'Bisher keine falschen Antworten.'), true);
}

function diagrammEntscheidungen(r) {
  const szenen = r.knoten.filter((k) => k.typ === 'szene' && Object.keys(k.optionen).length && Object.keys(k.optionenText ?? {}).length > 1);
  return diagramm('Entscheidungen', 'vertretbar', 'Welche Option gewählt wurde, mit der fachlichen Bewertung aus dem Szenario', szenen.length ?
    szenen.map((k) => {
      const summe = Object.values(k.optionen).reduce((s, n) => s + n, 0);
      return h('div', { class: 'entscheidung' }, h('h3', {}, k.titel),
        h('ul', { class: 'balkenliste' }, Object.keys(k.optionenText).map((id) => {
          const n = k.optionen[id] ?? 0;
          const b = k.optionenBewertung?.[id];
          return h('li', { class: 'balkenzeile' },
            h('span', { class: `balkenzeile-name ${b ?? ''}`.trim() },
              b ? h('span', { class: 'zeichen', 'aria-hidden': 'true' }, symbol(BEWERTUNG[b][1])) : null,
              k.optionenText[id], b ? h('small', { class: 'bewertung' }, ` (${BEWERTUNG[b][0]})`) : null),
            h('span', { class: 'balkenzeile-zahl' }, String(n), h('small', {}, ` ${zahl(prozent(n, summe), 0)} %`)),
            spur(prozent(n, summe), b ?? ''));
        })));
    }) : h('p', {}, 'Bisher keine Entscheidungen.'), true);
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
        [['gruppe', 'Personen', r.personen], ['nochmal', 'Versuche', r.versuche], ['richtig', 'abgeschlossen', r.beendet ?? 0],
          ['punkte', 'mittlere Punktquote', r.quote === null ? '–' : `${zahl(r.quote * 100, 0)} %`]]
          .map(([s, k, v]) => h('li', { class: 'karte kennzahl' }, h('span', { class: 'kennzahl-zeichen' }, symbol(s)),
            h('span', { class: 'kennzahl-wert' }, String(v)), h('span', { class: 'kennzahl-name' }, k)))),
      h('div', { class: 'diagramme' },
        diagrammErgebnisse(r), diagrammErsterVersuch(r), diagrammFehler(r), diagrammEntscheidungen(r)),
      h('details', { class: 'karte alle-zahlen' }, h('summary', {}, 'Alle Zahlen als Tabelle'),
        h('div', { class: 'tabelle-rahmen' }, h('table', {},
          h('caption', {}, 'Wo stehen die Studierenden? Je Schritt'),
          h('thead', {}, h('tr', {}, ['Schritt', 'Art', 'beantwortet', '1. Versuch richtig', 'aufgelöst', 'typische Fehler / Entscheidungen'].map((t) => h('th', { scope: 'col' }, t)))),
          h('tbody', {}, r.knoten.map((k) => h('tr', {},
            h('td', {}, k.titel), h('td', {}, ARTEN[k.typ] ?? k.typ), h('td', {}, k.typ === 'aufgabe' ? k.versuche : '–'),
            h('td', {}, k.typ === 'aufgabe' ? pz(k.ersterVersuchRichtig, k.versuche) : '–'), h('td', {}, k.typ === 'aufgabe' ? k.aufgeloest : '–'),
            h('td', {}, Object.entries(k.typ === 'szene' ? k.optionen : k.fehlerarten).map(([a, n]) => `${k.optionenText?.[a] ?? a}: ${n}`).join(' · ') || '–'))))))),
      h('button', { class: 'knopf', type: 'button', onclick: async () => herunterladen(`xapi-${wahlS.value}.json`, JSON.stringify(await api('GET', `/api/lehrende/xapi?${q}`), null, 2)) }, symbol('herunterladen'), 'xAPI-Statements herunterladen'));
    zeigeBreiten(ziel);
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
  aufraeumen?.();
  aufraeumen = null;
  offenerEditor = null;
  const adresse = location.hash.replace('#', '') || 'kurse';
  const [bereich, id] = adresse.split('/');
  nav(bereich === 'editor' || bereich === 'vorlage' ? 'szenarien' : bereich);
  try {
    if (bereich === 'editor' && id === 'neu') {
      if (!neuerEntwurf) { location.hash = '#vorlage'; return; }
      offenerEditor = await editor(inhalt, null, { neu: neuerEntwurf });
    } else if (bereich === 'vorlage') await vorlage();
    else if (bereich === 'editor' && id) offenerEditor = await editor(inhalt, decodeURIComponent(id));
    else if (bereich === 'runde' && id) aufraeumen = rundeLive(inhalt, id);
    else if (bereich === 'runde') await runden(inhalt);
    else await ({ kurse, szenarien, auswertung }[bereich] ?? kurse)();
  } catch (e) { melde(e.message, 'fehler'); }
}

window.addEventListener('hashchange', () => {
  // Ungespeicherte Änderungen im Editor: erst fragen
  if (offenerEditor?.ungespeichert() && !confirm('Ungespeicherte Änderungen im Editor verwerfen?')) {
    history.replaceState(null, '', letzteAdresse || '#szenarien');
    return;
  }
  letzteAdresse = location.hash;
  zeige();
});
window.addEventListener('beforeunload', (e) => { if (offenerEditor?.ungespeichert()) { e.preventDefault(); e.returnValue = ''; } });
zeige();
