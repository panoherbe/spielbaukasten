// Mechanik „zahl“: Rechenaufgabe mit Einheit und Toleranz, Parameter je Versuch, gezielte Rückmeldung zu
// typischen Fehlern (Vorzeichen, Faktor 1000 bei kN/N, vom Szenario genannte Fehlerformeln).

import { berechne, formatiereZahl, parse, namen, AusdruckFehler } from '../ausdruck.js';

/** Liest „28,3“, „28.3“, „ 2,83e1 “; liefert null, wenn keine Zahl. */
export function leseZahl(eingabe) {
  if (typeof eingabe === 'number') return Number.isFinite(eingabe) ? eingabe : null;
  if (typeof eingabe !== 'string') return null;
  const t = eingabe.trim().replace(/\s/g, '').replace(',', '.');
  if (!/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(t)) return null;
  return Number(t);
}

function toleranz(def, soll) {
  const relativ = (def.toleranz_prozent ?? 1) / 100;
  return Math.max(Math.abs(soll) * relativ, def.toleranz_absolut ?? 0, 1e-9);
}

function nahe(ist, soll, def) {
  return Math.abs(ist - soll) <= toleranz(def, soll);
}

export const zahl = {
  typ: 'zahl',

  /** Felder für die Oberfläche, ohne Lösung. */
  ansicht(def) {
    return { einheit: def.einheit ?? '' };
  },

  pruefe(def, pfad, { bekannteNamen }) {
    const fehler = [];
    const formeln = [['loesung', def.loesung], ...(def.typische_fehler ?? []).map((f, i) => [`typische_fehler[${i}].formel`, f.formel])];
    for (const [feld, formel] of formeln) {
      if (typeof formel !== 'string') { fehler.push({ pfad: `${pfad}.${feld}`, meldung: 'Formel fehlt' }); continue; }
      try {
        for (const n of namen(parse(formel))) {
          if (!bekannteNamen.has(n)) fehler.push({ pfad: `${pfad}.${feld}`, meldung: `„${n}“ ist kein Parameter des Szenarios` });
        }
      } catch (e) {
        if (!(e instanceof AusdruckFehler)) throw e;
        fehler.push({ pfad: `${pfad}.${feld}`, meldung: `Formel nicht lesbar: ${e.message}` });
      }
    }
    if (def.toleranz_prozent !== undefined && !(def.toleranz_prozent >= 0 && def.toleranz_prozent <= 50)) {
      fehler.push({ pfad: `${pfad}.toleranz_prozent`, meldung: 'Toleranz muss zwischen 0 und 50 % liegen' });
    }
    return fehler;
  },

  loesung(def, werte) {
    const soll = berechne(def.loesung, werte);
    return `${formatiereZahl(soll, def.stellen ?? 2)}${def.einheit ? ' ' + def.einheit : ''}`;
  },

  bewerte(def, antwort, werte) {
    const ist = leseZahl(antwort);
    const soll = berechne(def.loesung, werte);
    if (ist === null) {
      return { gueltig: false, richtig: false, rueckmeldung: 'Bitte eine Zahl eingeben, z. B. 12,5.' };
    }
    if (nahe(ist, soll, def)) return { gueltig: true, richtig: true, rueckmeldung: def.rueckmeldung?.richtig };
    const typisch = (def.typische_fehler ?? []).findIndex((f) => nahe(ist, berechne(f.formel, werte), def));
    if (typisch >= 0) return { gueltig: true, richtig: false, rueckmeldung: def.typische_fehler[typisch].rueckmeldung, typ: `typisch-${typisch + 1}` };
    if (nahe(-ist, soll, def)) {
      return { gueltig: true, richtig: false, rueckmeldung: 'Der Betrag stimmt, das Vorzeichen nicht. Zug oder Druck? Prüfen Sie die angenommene Richtung.', typ: 'vorzeichen' };
    }
    if (nahe(ist / 1000, soll, def) || nahe(ist * 1000, soll, def)) {
      return { gueltig: true, richtig: false, rueckmeldung: `Die Ziffern stimmen, die Größenordnung nicht. Ist die Einheit ${def.einheit ?? ''} gemeint?`.replace(' ?', '?'), typ: 'einheit' };
    }
    return { gueltig: true, richtig: false, rueckmeldung: def.rueckmeldung?.falsch };
  },
};
