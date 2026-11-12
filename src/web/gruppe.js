// Teamspiel und Kursrunde aus Sicht der Studierenden: derselbe Spieler wie allein, aber jede Entscheidung und jede
// Antwort ist eine Stimme. Der gemeinsame Stand kommt über Server-Sent Events (EventSource, im Browser enthalten).

import { api, ApiFehler } from './api.js';
import { h, leere, melde, sage } from './ui.js';
import { symbol } from './symbole.js';
import { spieler } from './spieler.js';
import { spieleTon } from './ton.js';

const BUCHSTABEN = 'ABCDEFGH';

/** Die Regel in zwei Sätzen, wie sie im Spiel steht. */
export const REGEL = {
  team: 'Die Mehrheit entscheidet; bei Gleichstand zählt die Möglichkeit, für die zuerst gestimmt wurde. Entschieden ist, sobald alle abgestimmt haben oder eine Möglichkeit mehr als die Hälfte der Stimmen hat; wer das Team gegründet hat, kann die Abstimmung vorher schließen.',
  runde: 'Die Mehrheit entscheidet; bei Gleichstand zählt die Möglichkeit, für die zuerst gestimmt wurde. Die Lehrperson schließt die Abstimmung; haben alle abgestimmt, ist sie sofort entschieden.',
};

function eigeneStimme(a) {
  const e = a.abstimmung?.eigene;
  if (!e) return null;
  if (e.typ === 'wahl') {
    const i = a.knoten.optionen?.findIndex((o) => o.id === e.option) ?? -1;
    return i >= 0 ? `${BUCHSTABEN[i]}: ${a.knoten.optionen[i].text}` : e.option;
  }
  if (a.knoten.mechanik === 'zahl') return `${e.antwort}${a.knoten.einheit ? ` ${a.knoten.einheit}` : ''}`;
  if (a.knoten.mechanik === 'auswahl') {
    const ids = Array.isArray(e.antwort) ? e.antwort : [e.antwort];
    return a.knoten.auswahl.filter((o) => ids.includes(o.id)).map((o) => o.text).join(', ');
  }
  return 'Reihenfolge abgegeben';
}

/** Die Abstimmung unter der Handlung: wie viele schon gestimmt haben, die eigene Stimme, im Team die Verteilung. */
function abstimmung(a, { schliessen }) {
  const ab = a.abstimmung ?? { stimmen: 0, von: 0 };
  const team = a.gruppe.art === 'team';
  const k = a.knoten;
  if (a.gruppe.status !== 'laeuft') return h('div', { class: 'abstimmung' }, h('p', { class: 'abstimmung-kopf' }, symbol('live'), 'Die Lehrperson hat die Runde beendet.'));
  if (a.beendet || (k.typ !== 'szene' && k.typ !== 'aufgabe')) return null;
  const eigene = eigeneStimme(a);
  return h('section', { class: 'abstimmung', 'aria-label': team ? 'Abstimmung im Team' : 'Abstimmung in der Live-Runde' },
    h('p', { class: 'abstimmung-kopf' }, symbol('gruppe'),
      h('span', {}, team ? 'Abstimmung im Team: ' : 'Abstimmung in der Live-Runde: ', h('strong', {}, `${ab.stimmen} von ${ab.von}`), ' haben abgestimmt')),
    team && ab.optionen && k.typ === 'szene' ? h('ul', { class: 'abstimmung-optionen' }, k.optionen.map((o, i) => {
      const n = ab.optionen[o.id] ?? 0;
      return h('li', {}, h('span', { class: 'option-buchstabe klein', 'aria-hidden': 'true' }, BUCHSTABEN[i]),
        h('span', { class: 'nur-vorlesen' }, `Option ${BUCHSTABEN[i]}: `), `${n} ${n === 1 ? 'Stimme' : 'Stimmen'}`);
    })) : null,
    team && ab.antworten?.length ? h('p', { class: 'abstimmung-antworten' }, 'Antworten im Team: ', ab.antworten.map((x, i) => [i ? ' · ' : '', h('strong', {}, x)])) : null,
    h('p', { class: 'abstimmung-eigene' }, eigene ? [symbol('richtig'), 'Ihre Stimme: ', h('strong', {}, eigene), h('span', { class: 'gedaempft' }, ' – ändern: einfach neu wählen')] : 'Sie haben noch nicht abgestimmt.'),
    team && a.gruppe.sprecher && ab.stimmen > 0 && ab.stimmen < ab.von
      ? h('button', { class: 'knopf', type: 'button', onclick: schliessen }, symbol('richtig'), 'Abstimmung jetzt schließen') : null,
    h('details', { class: 'abstimmung-regel' }, h('summary', {}, 'So wird entschieden'), h('p', {}, REGEL[a.gruppe.art])));
}

/** Kopfband über dem Spiel: Art, Team-Code zum Weitergeben, Mitglieder. */
function band(a) {
  const team = a.gruppe.art === 'team';
  return [
    h('span', { class: 'chip' }, symbol(team ? 'gruppe' : 'live'), team ? 'Teamspiel' : 'Live-Runde'),
    team ? h('span', {}, 'Team-Code ', h('strong', { class: 'code' }, a.gruppe.code), ' – zum Mitspielen weitergeben') : h('span', {}, 'Die Lehrperson sieht nur Summen, keine Namen.'),
    h('span', { class: 'gruppe-mitglieder' }, `${a.gruppe.mitglieder} ${a.gruppe.mitglieder === 1 ? 'Person' : 'Personen'}${team && a.gruppe.sprecher ? ' · Sie haben das Team gegründet' : ''}`),
  ];
}

/** Spielt eine Gruppe im Element `inhalt`; liefert eine Funktion zum Aufräumen (EventSource schließen). */
export function spieleGruppe(inhalt, gid, { medienUrl, uebersicht }) {
  const kopf = h('div', { class: 'gruppe-band karte', role: 'region', 'aria-label': 'Teamspiel' });
  const buehne = h('div', { class: 'spielfeld' });
  leere(inhalt, kopf, buehne);
  let a = null;
  let quelle = null;
  let p = null;

  const zeigeBand = () => { kopf.setAttribute('aria-label', a.gruppe.art === 'team' ? 'Teamspiel' : 'Live-Runde'); leere(kopf, band(a)); };
  const neuerStand = (stand) => {
    const vorher = a;
    a = stand;
    zeigeBand();
    if (vorher && stand.nr > vorher.nr && stand.letzteAbstimmung) sage(`Entschieden mit ${stand.letzteAbstimmung.fuer} von ${stand.letzteAbstimmung.stimmen} Stimmen.`);
    p.aktualisiere(stand);
  };
  const schliessen = async () => {
    try { neuerStand(await api('POST', `/api/gruppen/${gid}/schliessen`, { nr: a.nr })); } catch (e) { melde(e.message, 'fehler'); }
  };

  p = spieler(buehne, {
    medienUrl: (datei) => medienUrl(a.szenario.id, datei),
    grafikUrl: (name) => `/bilder/${name}.svg`,
    uebersicht,
    zusatz: (stand) => abstimmung(stand, { schliessen }),
    sende: async (ereignis) => {
      try {
        const stand = await api('POST', `/api/gruppen/${gid}/stimmen`, { nr: a.nr, ereignis });
        if (stand.rueckmeldung?.art === 'ungueltig' && stand.nr === a.nr) return stand; // keine Zahl o. ä.: Hinweis unter der Aufgabe
        if (ereignis.typ !== 'hinweis' && stand.nr === a.nr) { spieleTon('entscheidung'); sage('Ihre Stimme ist gezählt.'); }
        neuerStand(stand);
        return null;
      } catch (e) {
        if (e instanceof ApiFehler && e.status === 409 && e.daten?.stand) { melde(e.message); neuerStand(e.daten.stand); return null; }
        throw e;
      }
    },
  });

  api('GET', `/api/gruppen/${gid}`).then((stand) => {
    a = stand;
    zeigeBand();
    p.zeige({ ...stand, rueckmeldung: null });
    quelle = new EventSource(`/api/gruppen/${gid}/live`);
    quelle.addEventListener('stand', (ev) => neuerStand(JSON.parse(ev.data)));
  }).catch((e) => { melde(e.message, 'fehler'); uebersicht(); });

  return () => quelle?.close();
}
