// Darstellung der Mechanik „zahl“: Eingabefeld mit Einheit; Komma und Punkt werden akzeptiert.

import { h } from '../ui.js';
import { symbol } from '../symbole.js';

export const zahlEingabe = {
  typ: 'zahl',
  zeige(knoten, sende) {
    const id = `eingabe-${knoten.id}`;
    const feld = h('input', { id, class: 'zahlfeld', type: 'text', inputmode: 'decimal', autocomplete: 'off', spellcheck: 'false', 'aria-describedby': `${id}-einheit` });
    const form = h('form', { class: 'aufgabe-form', onsubmit: (e) => { e.preventDefault(); sende(feld.value); } },
      h('label', { for: id, class: 'beschriftung' }, 'Ihre Antwort'),
      h('div', { class: 'zahlzeile' }, feld, h('span', { id: `${id}-einheit`, class: 'einheit' }, knoten.einheit || '')),
      h('button', { class: 'knopf knopf-haupt', type: 'submit' }, symbol('richtig'), 'Prüfen'));
    queueMicrotask(() => feld.focus());
    return form;
  },
};
