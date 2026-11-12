// Kursrunde für Lehrende: eine Live-Runde starten, live sehen, wie der Kurs abstimmt, und die Abstimmung schließen.
// Gezeigt werden nur Summen, und erst ab der Mindestgruppe (Voreinstellung drei Stimmen), wie in der Auswertung.

import { api } from './api.js';
import { h, leere, fokus, melde, zahl } from './ui.js';
import { symbol } from './symbole.js';

const BEWERTUNG = { gut: ['gut', 'richtig'], neutral: ['vertretbar', 'vertretbar'], schlecht: ['riskant', 'falsch'] };
const TYP = { szene: 'Entscheidung', aufgabe: 'Aufgabe', ende: 'Ende' };
const ERGEBNIS = { erfolg: 'Erfolg', teilerfolg: 'Teilerfolg', misserfolg: 'Misserfolg' };

function balken(liste) {
  const summe = liste.reduce((s, x) => s + x.n, 0);
  return h('ul', { class: 'balkenliste' }, liste.map((x) => {
    const p = summe ? (x.n / summe) * 100 : 0;
    const b = x.bewertung;
    const antwort = x.text === 'richtig' || x.text.startsWith('falsch:');
    return h('li', { class: 'balkenzeile' },
      h('span', { class: `balkenzeile-name ${b ?? ''}`.trim() },
        b ? h('span', { class: 'zeichen', 'aria-hidden': 'true' }, symbol(BEWERTUNG[b]?.[1] ?? 'anzeige')) : null,
        x.text, b && !antwort ? h('small', { class: 'bewertung' }, ` (${BEWERTUNG[b]?.[0]})`) : null),
      h('span', { class: 'balkenzeile-zahl' }, String(x.n), h('small', {}, ` ${zahl(p, 0)} %`)),
      h('span', { class: 'spur', 'aria-hidden': 'true' }, h('span', { class: `spur-wert ${b ?? ''}`.trim(), 'data-breite': String(Math.round(p * 10) / 10) })));
  }));
}

function setzeBreiten(wurzel) {
  wurzel.querySelectorAll('[data-breite]').forEach((el) => { el.style.width = `${el.dataset.breite}%`; });
}

/** Liste der Runden und das Formular zum Starten. */
export async function runden(inhalt) {
  const [liste, kurse, szenarien] = await Promise.all([api('GET', '/api/lehrende/runden'), api('GET', '/api/lehrende/kurse'), api('GET', '/api/lehrende/szenarien')]);
  const wahlK = h('select', { id: 'runde-kurs' }, kurse.map((k) => h('option', { value: k.id }, `${k.name} (${k.codeAnzeige})`)));
  const wahlS = h('select', { id: 'runde-szenario' });
  const passend = () => {
    const k = kurse.find((x) => String(x.id) === wahlK.value);
    leere(wahlS, szenarien.filter((s) => k?.szenarien.includes(s.id)).map((s) => h('option', { value: s.id }, s.titel)));
  };
  wahlK.onchange = passend;
  passend();
  const titel = h('h1', {}, 'Live-Runde');
  leere(inhalt, titel,
    h('p', { class: 'gedaempft' }, 'Ihr Kurs spielt ein Lernspiel gemeinsam, zum Beispiel in der Vorlesung: Alle sehen dieselbe Szene und stimmen auf dem eigenen Gerät ab; Sie sehen live die Verteilung (nur Summen, ab drei Stimmen) und schließen die Abstimmung. Die Mehrheit entscheidet, bei Gleichstand die zuerst gewählte Möglichkeit.'),
    h('section', { class: 'karte schmal' }, h('h2', {}, 'Neue Runde starten'),
      h('form', { class: 'stapel', onsubmit: async (e) => {
        e.preventDefault();
        if (!wahlS.value) return melde('In diesem Kurs ist kein Szenario freigegeben.', 'fehler');
        try { const r = await api('POST', '/api/lehrende/runden', { kurs: Number(wahlK.value), szenario: wahlS.value }); location.hash = `#runde/${r.id}`; } catch (err) { melde(err.message, 'fehler'); }
      } },
      h('label', { for: 'runde-kurs', class: 'beschriftung' }, 'Kurs'), wahlK,
      h('label', { for: 'runde-szenario', class: 'beschriftung' }, 'Szenario'), wahlS,
      h('p', { class: 'feld-hilfe' }, 'Studierende des Kurses sehen die Runde auf ihrer Übersicht und treten mit „Mitmachen“ bei.'),
      h('button', { class: 'knopf knopf-haupt', type: 'submit' }, symbol('live'), 'Runde starten'))),
    liste.length ? h('section', {}, h('h2', {}, 'Bisherige Runden'),
      h('div', { class: 'tabelle-rahmen' }, h('table', {},
        h('thead', {}, h('tr', {}, ['Szenario', 'Kurs', 'Teilnehmende', 'Stand', ''].map((t) => h('th', { scope: 'col' }, t)))),
        h('tbody', {}, liste.map((r) => h('tr', {},
          h('td', {}, r.titel), h('td', {}, r.kurs ?? '–'), h('td', {}, r.teilnehmende), h('td', {}, r.laeuft ? 'läuft' : 'beendet'),
          h('td', {}, h('a', { class: 'knopf-klein', href: `#runde/${r.id}` }, r.laeuft ? 'Öffnen' : 'Ansehen'))))))))
      : null);
  fokus(titel);
}

/** Live-Ansicht einer Runde; liefert eine Funktion zum Aufräumen (EventSource schließen). */
export function rundeLive(inhalt, id) {
  const kopf = h('div');
  const daten = h('div');
  const knoepfe = h('div', { class: 'knopfreihe runde-knoepfe' });
  const ansage = h('p', { class: 'nur-vorlesen', 'aria-live': 'polite' });
  let r = null;
  let quelle = null;
  let letzteNr = null;
  const titel = h('h1', {}, 'Live-Runde');
  leere(inhalt, h('p', { class: 'chips' }, h('a', { class: 'chip', href: '#runde' }, symbol('pfeil'), 'Alle Runden')), titel, kopf, knoepfe, daten, ansage);

  const schliessen = h('button', { class: 'knopf knopf-haupt', type: 'button', onclick: async () => {
    try { zeichne(await api('POST', `/api/lehrende/runden/${id}/schliessen`, { nr: r.nr })); } catch (e) { melde(e.message, 'fehler'); }
  } }, symbol('richtig'), 'Abstimmung schließen');
  const beenden = h('button', { class: 'knopf knopf-gefahr', type: 'button', onclick: async () => {
    if (!confirm('Die Runde für alle beenden?')) return;
    try { zeichne(await api('POST', `/api/lehrende/runden/${id}/beenden`, {})); quelle?.close(); } catch (e) { melde(e.message, 'fehler'); }
  } }, 'Runde beenden');

  function schritt(s) {
    return h('section', { class: `karte runde-schritt${s.aktuell ? ' aktuell' : ''}`, 'data-nr': s.nr },
      h('p', { class: 'chips' }, h('span', { class: 'chip' }, symbol(s.aktuell ? 'live' : 'richtig'), s.aktuell ? 'Jetzt' : `Schritt ${s.nr + 1}`),
        h('span', { class: 'chip' }, TYP[s.typ] ?? s.typ)),
      h(s.aktuell ? 'h2' : 'h3', {}, s.titel),
      h('p', {}, h('strong', {}, `${s.stimmen} ${s.stimmen === 1 ? 'Stimme' : 'Stimmen'}`), s.aktuell ? ` von ${r.teilnehmende} Teilnehmenden` : ''),
      s.zuWenig ? h('p', { class: 'gedaempft' }, `Noch zu wenige Stimmen: Die Verteilung erscheint ab ${r.minGruppe}, damit niemand erkennbar ist.`) : balken(s.verteilung),
      s.entschieden ? h('p', { class: 'runde-entscheidung' }, symbol('richtig'), 'Entschieden: ', h('strong', {}, s.entschieden.text), s.entschieden.fuer ? ` (${s.entschieden.fuer} von ${s.stimmen} Stimmen)` : '') : null,
      !s.aktuell && !s.entschieden && s.zuWenig ? h('p', { class: 'gedaempft' }, 'Entschieden mit weniger als drei Stimmen; die Wahl wird deshalb nicht gezeigt.') : null);
  }

  function zeichne(neu) {
    r = neu;
    const laeuft = r.runde.status === 'laeuft' && !r.beendet;
    titel.textContent = `Live-Runde: ${r.runde.szenario}`;
    leere(kopf, h('ul', { class: 'kennzahlen' },
      [['gruppe', 'Teilnehmende', r.teilnehmende], ['live', laeuft ? 'haben abgestimmt' : 'Stand', laeuft ? `${r.abgestimmt} von ${r.teilnehmende}` : r.beendet ? (ERGEBNIS[r.ergebnis] ?? 'zu Ende') : 'beendet'],
        ['karte', 'Kurs', r.runde.kurs ?? '–']].map(([s, k, v]) => h('li', { class: 'karte kennzahl' }, h('span', { class: 'kennzahl-zeichen' }, symbol(s)),
        h('span', { class: 'kennzahl-wert' }, String(v)), h('span', { class: 'kennzahl-name' }, k)))));
    schliessen.disabled = !laeuft || r.abgestimmt === 0;
    leere(knoepfe, laeuft ? [schliessen, beenden] : h('p', { class: 'gedaempft' }, r.beendet ? 'Das Spiel ist zu Ende.' : 'Die Runde ist beendet.'));
    leere(daten, r.schritte.length ? h('div', { class: 'runde-schritte' }, r.schritte.map(schritt)) : h('p', { class: 'karte' }, 'Noch keine Schritte.'));
    setzeBreiten(daten);
    if (letzteNr !== null && r.nr > letzteNr) { const e = r.schritte.find((s) => !s.aktuell); ansage.textContent = e?.entschieden ? `Entschieden: ${e.entschieden.text}` : 'Entschieden.'; }
    letzteNr = r.nr;
  }

  api('GET', `/api/lehrende/runden/${id}`).then((neu) => {
    zeichne(neu);
    fokus(titel);
    if (neu.runde.status === 'laeuft' && !neu.beendet) {
      quelle = new EventSource(`/api/lehrende/runden/${id}/live`);
      quelle.addEventListener('stand', (ev) => zeichne(JSON.parse(ev.data)));
    }
  }).catch((e) => { melde(e.message, 'fehler'); location.hash = '#runde'; });

  return () => quelle?.close();
}
