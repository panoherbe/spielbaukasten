// Mechanik „reihenfolge“: Arbeitsschritte in die richtige Reihenfolge bringen. Die Elemente stehen im Szenario in
// der richtigen Reihenfolge; angezeigt werden sie gemischt (je Versuch reproduzierbar).

import { zufallsfolge } from '../zufall.js';

export const reihenfolge = {
  typ: 'reihenfolge',

  pruefe(def, pfad) {
    const e = def.elemente;
    if (!Array.isArray(e) || e.length < 3) return [{ pfad: `${pfad}.elemente`, meldung: 'Mindestens drei Elemente nötig' }];
    const ids = e.map((x) => x.id);
    if (ids.some((id) => !id) || new Set(ids).size !== ids.length) return [{ pfad: `${pfad}.elemente`, meldung: 'Jedes Element braucht eine eindeutige id' }];
    return [];
  },

  /** Anzeigereihenfolge: gemischt, aber nie schon richtig. */
  mische(def, seed) {
    const z = zufallsfolge(seed ^ 0x5bd1e995);
    const ids = def.elemente.map((x) => x.id);
    const out = [...ids];
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(z() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    if (out.every((id, i) => id === ids[i])) out.push(out.shift());
    return out;
  },

  loesung(def) {
    return def.elemente.map((x, i) => `${i + 1}. ${x.text}`).join('  ');
  },

  bewerte(def, antwort) {
    const ids = def.elemente.map((x) => x.id);
    if (!Array.isArray(antwort) || antwort.length !== ids.length || new Set(antwort).size !== ids.length || antwort.some((id) => !ids.includes(id))) {
      return { gueltig: false, richtig: false, rueckmeldung: 'Bitte alle Schritte genau einmal anordnen.' };
    }
    const anPlatz = antwort.filter((id, i) => id === ids[i]).length;
    if (anPlatz === ids.length) return { gueltig: true, richtig: true, rueckmeldung: def.rueckmeldung?.richtig };
    return { gueltig: true, richtig: false, rueckmeldung: `${anPlatz} von ${ids.length} Schritten stehen an der richtigen Stelle. ${def.rueckmeldung?.falsch ?? ''}`.trim() };
  },
};
