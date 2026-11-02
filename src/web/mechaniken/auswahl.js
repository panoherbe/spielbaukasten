// Darstellung der Mechanik „auswahl“: Optionsfelder (eine Antwort) oder Kontrollkästchen (mehrere).

import { h } from '../ui.js';

export const auswahlListe = {
  typ: 'auswahl',
  zeige(knoten, sende) {
    const art = knoten.mehrfach ? 'checkbox' : 'radio';
    const name = `auswahl-${knoten.id}`;
    const felder = knoten.auswahl.map((o) => h('label', { class: 'auswahl-option' },
      h('input', { type: art, name, value: o.id }), h('span', {}, o.text)));
    return h('form', {
      class: 'aufgabe-form',
      onsubmit: (e) => {
        e.preventDefault();
        const gewaehlt = [...e.currentTarget.querySelectorAll('input:checked')].map((i) => i.value);
        sende(knoten.mehrfach ? gewaehlt : gewaehlt[0]);
      },
    },
    h('fieldset', { class: 'auswahl' }, h('legend', { class: 'beschriftung' }, knoten.mehrfach ? 'Alle zutreffenden wählen' : 'Eine Antwort wählen'), felder),
    h('button', { class: 'knopf knopf-haupt', type: 'submit' }, 'Prüfen'));
  },
};
