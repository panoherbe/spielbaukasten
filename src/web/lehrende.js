// Oberfläche für Lehrende: Kurse und Freigaben, Szenarien bearbeiten (Editor), prüfen und hochladen, Live-Runde,
// Auswertung, Exporte (xAPI, OER).

import { api, ApiFehler } from './api.js';
import { h, leere, fokus, melde, zahl } from './ui.js';
import { symbol, ring } from './symbole.js';
import { editor } from './editor.js';
import { runden, rundeLive } from './kursrunde.js';

const inhalt = document.getElementById('inhalt');
const navigation = document.getElementById('navigation');
const BEREICHE = [['kurse', 'Kurse'], ['szenarien', 'Szenarien'], ['runde', 'Live-Runde'], ['auswertung', 'Auswertung']];
let offenerEditor = null; // fragt vor dem Verlassen, wenn Änderungen nicht gespeichert sind
let aufraeumen = null; // schließt die Live-Verbindung einer Runde
let neuerEntwurf = null; // Kennung und Titel für „Neues Szenario“
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

async function szenarien() {
  const liste = await api('GET', '/api/lehrende/szenarien');
  const neuId = h('input', { id: 'neu-id', required: true, autocomplete: 'off', spellcheck: 'false', pattern: '[a-z0-9][a-z0-9-]{1,60}', placeholder: 'z. B. fachwerk-knoten', 'aria-describedby': 'neu-id-h' });
  const neuTitel = h('input', { id: 'neu-titel', required: true, autocomplete: 'off', placeholder: 'z. B. Übung: Knotenpunktverfahren' });
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
          h('a', { class: 'knopf-klein', href: `#editor/${encodeURIComponent(s.id)}` }, symbol('stift'), 'Bearbeiten', h('span', { class: 'nur-vorlesen' }, `: ${s.titel}`)),
          h('a', { class: 'knopf-klein', href: `/#/spiel/${s.id}` }, 'Vorschau'),
          h('a', { class: 'knopf-klein', href: `/api/lehrende/oer/${s.id}`, download: `${s.id}-v${s.version}.html` }, 'OER-Export'),
          h('button', { class: 'knopf-klein', type: 'button', onclick: async () => herunterladen(`${s.id}-v${s.version}.metadaten.json`, JSON.stringify(await api('GET', `/api/lehrende/oer/${s.id}/metadaten`), null, 2)) }, 'Metadaten'))))))),
    h('section', { class: 'karte schmal' }, h('h2', {}, 'Neues Szenario anlegen'),
      h('p', {}, 'Öffnet den Editor mit einer Vorlage aus Szene, Aufgabe und Ende. Gespeichert wird erst, wenn Sie „Als neue Version speichern“ wählen.'),
      h('form', { class: 'stapel', onsubmit: (e) => {
        e.preventDefault();
        if (liste.some((s) => s.id === neuId.value)) return melde(`Die Kennung „${neuId.value}“ gibt es schon.`, 'fehler');
        neuerEntwurf = { id: neuId.value, titel: neuTitel.value };
        location.hash = '#editor/neu';
      } },
      h('label', { for: 'neu-titel', class: 'beschriftung' }, 'Titel'), neuTitel,
      h('label', { for: 'neu-id', class: 'beschriftung' }, 'Kennung'),
      h('p', { class: 'feld-hilfe', id: 'neu-id-h' }, 'Kleinbuchstaben, Ziffern und Bindestrich; bleibt über alle Versionen gleich.'), neuId,
      h('button', { class: 'knopf knopf-haupt', type: 'submit' }, symbol('plus'), 'Im Editor anlegen'))),
    h('section', { class: 'karte' }, h('h2', {}, 'Szenario-Datei prüfen oder hochladen (Fortgeschritten)'),
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
          h('caption', {}, 'Wo stehen die Studierenden? Je Knoten'),
          h('thead', {}, h('tr', {}, ['Knoten', 'Typ', 'beantwortet', '1. Versuch richtig', 'aufgelöst', 'typische Fehler / Entscheidungen'].map((t) => h('th', { scope: 'col' }, t)))),
          h('tbody', {}, r.knoten.map((k) => h('tr', {},
            h('td', {}, k.titel), h('td', {}, k.typ), h('td', {}, k.typ === 'aufgabe' ? k.versuche : '–'),
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
  nav(bereich === 'editor' ? 'szenarien' : bereich);
  try {
    if (bereich === 'editor' && id === 'neu') {
      if (!neuerEntwurf) { location.hash = '#szenarien'; return; }
      offenerEditor = await editor(inhalt, null, { neu: neuerEntwurf });
    } else if (bereich === 'editor' && id) offenerEditor = await editor(inhalt, decodeURIComponent(id));
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
