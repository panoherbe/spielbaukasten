// Darstellung der Mechanik „reihenfolge“: Liste mit Knöpfen „nach oben“/„nach unten“ (per Tastatur und Touch
// bedienbar, ohne Ziehen und Ablegen).

import { h, sage } from '../ui.js';

export const reihenfolgeListe = {
  typ: 'reihenfolge',
  zeige(knoten, sende) {
    const reihe = knoten.elemente.map((e) => e.id);
    const text = Object.fromEntries(knoten.elemente.map((e) => [e.id, e.text]));
    const liste = h('ol', { class: 'reihe', 'aria-label': 'Schritte in Ihrer Reihenfolge' });
    const verschiebe = (i, d) => {
      const j = i + d;
      if (j < 0 || j >= reihe.length) return;
      [reihe[i], reihe[j]] = [reihe[j], reihe[i]];
      zeichne();
      liste.children[j].querySelector(d < 0 ? '.hoch' : '.runter')?.focus();
      sage(`„${text[reihe[j]]}“ steht jetzt an Stelle ${j + 1}.`);
    };
    const zeichne = () => liste.replaceChildren(...reihe.map((id, i) => h('li', { class: 'reihe-element', 'data-id': id },
      h('span', { class: 'reihe-nr', 'aria-hidden': 'true' }, String(i + 1)),
      h('span', { class: 'reihe-text' }, text[id]),
      h('span', { class: 'reihe-knoepfe' },
        h('button', { type: 'button', class: 'knopf-klein hoch', 'aria-label': `„${text[id]}“ nach oben`, disabled: i === 0, onclick: () => verschiebe(i, -1) }, '▲'),
        h('button', { type: 'button', class: 'knopf-klein runter', 'aria-label': `„${text[id]}“ nach unten`, disabled: i === reihe.length - 1, onclick: () => verschiebe(i, 1) }, '▼')))));
    zeichne();
    return h('form', { class: 'aufgabe-form', onsubmit: (e) => { e.preventDefault(); sende([...reihe]); } },
      liste, h('button', { class: 'knopf knopf-haupt', type: 'submit' }, 'Reihenfolge prüfen'));
  },
};
