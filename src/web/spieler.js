// Der Spieler zeigt eine Ansicht (src/engine/ansicht.js) und meldet Entscheidungen und Antworten an ein „Backend“
// zurück. Online ist das der Server, im OER-Export die Engine im Browser. Der Spieler selbst kennt keine Lösungen.
//
//   spieler(element, { sende(ereignis) → Promise<Ansicht>, neu() → Promise<Ansicht>, medienUrl(datei), uebersicht() })

import { h, textBloecke, zahl, leere, fokus, melde } from './ui.js';
import { DARSTELLUNGEN } from './mechaniken/index.js';

const ERGEBNIS = {
  erfolg: { titel: 'Geschafft', klasse: 'gut' },
  teilerfolg: { titel: 'Teilweise geschafft', klasse: 'neutral' },
  misserfolg: { titel: 'Nicht geschafft', klasse: 'schlecht' },
};
const RUECKMELDUNG = {
  richtig: { titel: 'Richtig', klasse: 'gut', zeichen: '✓' },
  aufgeloest: { titel: 'Die Lösung', klasse: 'schlecht', zeichen: '!' },
  gut: { titel: 'Gute Entscheidung', klasse: 'gut', zeichen: '✓' },
  neutral: { titel: 'Vertretbar', klasse: 'neutral', zeichen: '~' },
  schlecht: { titel: 'Riskant', klasse: 'schlecht', zeichen: '!' },
};
const STUFE = { sicher: 'sicher', mit_hilfe: 'mit Hilfe', offen: 'noch offen', nicht_geprueft: 'nicht geprüft' };

export function spieler(wurzel, backend) {
  let a = null;
  let beschaeftigt = false;

  async function schritt(ereignis) {
    if (beschaeftigt) return;
    beschaeftigt = true;
    wurzel.setAttribute('aria-busy', 'true');
    try {
      const neu = await backend.sende({ ...ereignis, knoten: a.knoten.id });
      const alterKnoten = a.knoten.id;
      a = neu;
      const r = a.rueckmeldung;
      if (r && (r.art === 'falsch' || r.art === 'ungueltig') && a.knoten.id === alterKnoten) zeigeHinweisInline(r);
      else if (r) zeigeRueckmeldung(r);
      else zeigeKnoten();
    } catch (e) {
      melde(e.message || 'Das hat nicht geklappt. Bitte erneut versuchen.', 'fehler');
    } finally {
      beschaeftigt = false;
      wurzel.removeAttribute('aria-busy');
    }
  }

  function kopf() {
    return h('header', { class: 'spiel-kopf' },
      h('div', { class: 'spiel-titel' }, a.szenario.titel),
      h('div', { class: 'spiel-stand' },
        h('span', {}, `Schritt ${a.schritte + 1}`),
        h('span', {}, `${zahl(a.punkte)} / ${zahl(a.maxPunkte)} Punkte`)),
      a.indikatoren.length ? h('ul', { class: 'indikatoren', 'aria-label': 'Lage' }, a.indikatoren.map((i) => {
        const anteil = (i.wert - i.min) / (i.max - i.min || 1);
        return h('li', { class: 'indikator' },
          h('span', { class: 'indikator-name', id: `ind-${i.id}` }, i.name),
          h('span', { class: 'indikator-wert' }, `${zahl(i.wert, 0)}${i.einheit ? ' ' + i.einheit : ''}`),
          h('span', { class: 'balken', role: 'meter', 'aria-labelledby': `ind-${i.id}`, 'aria-valuemin': i.min, 'aria-valuemax': i.max, 'aria-valuenow': i.wert },
            h('span', { class: `balken-fuellung ${anteil < 0.34 ? 'tief' : anteil < 0.67 ? 'mittel' : 'hoch'}`, style: null, 'data-anteil': Math.round(anteil * 100) })));
      })) : null);
  }

  function balkenSetzen() {
    // Breite per CSSOM statt style-Attribut, damit die Content-Security-Policy ohne 'unsafe-inline' auskommt
    wurzel.querySelectorAll('.balken-fuellung').forEach((el) => { el.style.width = `${el.dataset.anteil}%`; });
  }

  function bild(b) {
    return b ? h('figure', { class: 'szenenbild' }, h('img', { src: backend.medienUrl(b.datei), alt: b.alt, loading: 'lazy', decoding: 'async' })) : null;
  }

  function zeigeKnoten() {
    if (a.beendet) return zeigeEnde();
    const k = a.knoten;
    const titel = h('h2', { class: 'szenen-titel' }, k.titel ?? '');
    let interaktion;
    if (k.typ === 'szene') {
      interaktion = h('div', { class: 'optionen', role: 'group', 'aria-label': 'Ihre Entscheidung' },
        k.optionen.map((o) => h('button', { class: 'knopf knopf-option', type: 'button', 'data-option': o.id, onclick: () => schritt({ typ: 'wahl', option: o.id }) }, o.text)));
    } else if (k.typ === 'aufgabe') {
      const darstellung = DARSTELLUNGEN[k.mechanik];
      interaktion = h('div', { class: 'aufgabe' },
        h('div', { class: 'frage' }, textBloecke(k.frage)),
        darstellung ? darstellung.zeige(k, (antwort) => schritt({ typ: 'antwort', antwort })) : h('p', {}, `Mechanik „${k.mechanik}“ wird hier nicht unterstützt.`),
        h('div', { class: 'aufgabe-fuss' },
          h('span', { class: 'gedaempft' }, `${k.punkte} Punkte · noch ${k.versucheUebrig} ${k.versucheUebrig === 1 ? 'Versuch' : 'Versuche'}`),
          k.hinweisVerfuegbar ? h('button', { type: 'button', class: 'knopf-text', onclick: () => schritt({ typ: 'hinweis' }) }, 'Hinweis (kostet 30 % der Punkte)') : null),
        k.hinweis ? h('aside', { class: 'hinweis' }, h('strong', {}, 'Hinweis: '), k.hinweis) : null,
        h('div', { class: 'inline-rueckmeldung', 'aria-live': 'assertive' }));
    }
    leere(wurzel, kopf(), h('article', { class: 'karte szene', 'data-knoten': k.id, 'data-typ': k.typ, 'data-mechanik': k.mechanik }, titel, bild(k.bild), h('div', { class: 'szenen-text' }, textBloecke(k.text)), interaktion));
    balkenSetzen();
    if (k.typ !== 'aufgabe' || k.mechanik !== 'zahl') fokus(titel);
  }

  function zeigeHinweisInline(r) {
    // Neu zeichnen (Versuchszähler, ggf. Hinweis), Eingabe bleibt leer; Rückmeldung unter der Aufgabe
    const vorher = wurzel.querySelector('.zahlfeld')?.value;
    zeigeKnoten();
    const feld = wurzel.querySelector('.zahlfeld');
    if (feld && vorher !== undefined) feld.value = vorher;
    const box = wurzel.querySelector('.inline-rueckmeldung');
    if (box) leere(box, h('div', { class: `rueckmeldung-inline ${r.art === 'falsch' ? 'schlecht' : 'neutral'}` },
      h('strong', {}, r.art === 'falsch' ? 'Noch nicht richtig. ' : ''), r.text ?? ''));
    feld?.focus();
  }

  function zeigeRueckmeldung(r) {
    const art = RUECKMELDUNG[r.art] ?? RUECKMELDUNG.neutral;
    const titel = h('h2', { class: 'rueckmeldung-titel' }, h('span', { class: 'zeichen', 'aria-hidden': 'true' }, art.zeichen), art.titel);
    const effekte = Object.entries(r.effekte ?? {}).filter(([, d]) => d !== 0);
    const namen = Object.fromEntries(a.indikatoren.map((i) => [i.id, i]));
    leere(wurzel, kopf(), h('article', { class: `karte rueckmeldung ${art.klasse}`, 'data-typ': 'rueckmeldung' },
      titel,
      h('div', {}, textBloecke(r.text)),
      r.loesung ? h('p', { class: 'loesung' }, h('strong', {}, 'Richtige Antwort: '), r.loesung) : null,
      r.erklaerung ? h('div', { class: 'erklaerung' }, h('strong', {}, 'Rechenweg: '), textBloecke(r.erklaerung)) : null,
      effekte.length ? h('ul', { class: 'effekte', 'aria-label': 'Auswirkungen' }, effekte.map(([id, d]) => h('li', { class: d > 0 ? 'plus' : 'minus' },
        `${namen[id]?.name ?? id}: ${d > 0 ? '+' : '−'}${zahl(Math.abs(d), 0)}${namen[id]?.einheit ? ' ' + namen[id].einheit : ''}`))) : null,
      h('button', { class: 'knopf knopf-haupt', type: 'button', onclick: () => { a = { ...a, rueckmeldung: null }; zeigeKnoten(); } }, a.beendet ? 'Zum Ergebnis' : 'Weiter')));
    balkenSetzen();
    fokus(titel);
  }

  function zeigeEnde() {
    const k = a.knoten;
    const e = ERGEBNIS[a.ergebnis] ?? ERGEBNIS.teilerfolg;
    const titel = h('h2', { class: 'szenen-titel' }, k.titel ?? e.titel);
    leere(wurzel, kopf(), h('article', { class: `karte ende ${e.klasse}`, 'data-typ': 'ende', 'data-ergebnis': a.ergebnis },
      h('p', { class: `ergebnis-band ${e.klasse}` }, e.titel),
      titel,
      bild(k.bild),
      h('div', { class: 'szenen-text' }, textBloecke(k.text)),
      h('p', { class: 'punkte-gross' }, `${zahl(a.punkte)} von ${zahl(a.maxPunkte)} Punkten`),
      a.lernziele?.length ? h('section', { class: 'lernziele' }, h('h3', {}, 'Ihre Lernziele'),
        h('ul', {}, a.lernziele.map((lz) => h('li', { class: `stufe-${lz.stufe}` }, h('span', { class: 'stufe' }, STUFE[lz.stufe] ?? lz.stufe), lz.text)))) : null,
      h('div', { class: 'knopfreihe' },
        h('button', { class: 'knopf knopf-haupt', type: 'button', onclick: async () => { a = await backend.neu(); zeigeKnoten(); } }, 'Noch einmal spielen'),
        backend.uebersicht ? h('button', { class: 'knopf', type: 'button', onclick: () => backend.uebersicht() }, 'Zur Übersicht') : null)));
    balkenSetzen();
    fokus(titel);
  }

  return {
    zeige(ansicht) { a = ansicht; zeigeKnoten(); },
  };
}
