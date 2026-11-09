// Spielablauf als Folge von Ereignissen. Der Zustand eines Versuchs wird nie gespeichert, sondern immer aus
// Szenario + Startwert + Ereignissen neu berechnet. Browser und Server benutzen dieselbe Funktion: Der Browser
// für die sofortige Rückmeldung, der Server, um Punkte und Fortschritt selbst festzustellen (manipulierte Punkte
// aus dem Browser gibt es dadurch nicht).
//
// Ereignisse:  { typ: 'wahl', knoten, option }   { typ: 'antwort', knoten, antwort }   { typ: 'hinweis', knoten }

import { berechne } from './ausdruck.js';
import { ziehe } from './zufall.js';
import { MECHANIKEN } from './mechaniken/index.js';

export class SpielFehler extends Error {}

const HINWEIS_ABZUG = 0.3; // Anteil der Aufgabenpunkte, der für einen Hinweis abgezogen wird
const ZWEITER_VERSUCH = 0.5; // Anteil der Punkte bei richtiger Antwort im zweiten oder späteren Versuch

function werteFuer(_szenario, z) {
  return { ...z.parameter, ...z.indikatoren };
}

/** Optionen der aktuellen Szene, deren Bedingung erfüllt ist. */
export function verfuegbareOptionen(szenario, z) {
  const k = szenario.knoten[z.knoten];
  if (!k || k.typ !== 'szene') return [];
  const w = werteFuer(szenario, z);
  return k.optionen.filter((o) => !o.bedingung || berechne(o.bedingung, w));
}

function wirke(szenario, z, effekte) {
  for (const [id, delta] of Object.entries(effekte ?? {})) {
    const ind = szenario.indikatoren.find((i) => i.id === id);
    z.indikatoren[id] = Math.min(ind.max, Math.max(ind.min, z.indikatoren[id] + delta));
  }
}

function lernzielBuchen(z, id, stufe) {
  if (!id) return;
  const alt = z.lernziele[id];
  // Der schwächste Nachweis zählt: einmal „offen“ bleibt „offen“, auch wenn eine andere Aufgabe zum selben
  // Lernziel gelang. So zeigt das Ende ehrlich, was noch zu üben ist.
  const rang = { offen: 0, mit_hilfe: 1, sicher: 2 };
  if (!alt || rang[stufe] < rang[alt]) z.lernziele[id] = stufe;
}

function betrete(szenario, z, ziel) {
  let id = ziel;
  for (let tiefe = 0; tiefe < 50; tiefe++) {
    const k = szenario.knoten[id];
    if (!k) throw new SpielFehler(`Knoten „${id}“ fehlt`);
    if (k.typ === 'verzweigung') {
      const w = werteFuer(szenario, z);
      id = (k.regeln ?? []).find((r) => berechne(r.wenn, w))?.ziel ?? k.sonst;
      continue;
    }
    z.knoten = id;
    z.versuche = 0;
    z.hinweis = false;
    if (k.typ === 'aufgabe') { z.maxPunkte += k.punkte ?? 10; if (k.hinweis) z.statistik.mitHinweis++; }
    if (k.typ === 'ende') { z.beendet = true; z.ergebnis = k.ergebnis; }
    return;
  }
  throw new SpielFehler('Zu viele Verzweigungen hintereinander');
}

/** Anfangszustand eines Versuchs. */
export function starte(szenario, seed) {
  const z = {
    seed,
    parameter: ziehe(szenario.parameter, seed),
    indikatoren: Object.fromEntries((szenario.indikatoren ?? []).map((i) => [i.id, i.start])),
    knoten: null, versuche: 0, hinweis: false,
    punkte: 0, maxPunkte: 0, beendet: false, ergebnis: null,
    lernziele: {}, schritte: 0, rueckmeldung: null,
    // Zähler für die Auszeichnungen am Ende (src/engine/wertung.js)
    statistik: { aufgaben: 0, ersterVersuch: 0, hinweise: 0, mitHinweis: 0, entscheidungen: 0, gut: 0 },
  };
  betrete(szenario, z, szenario.start);
  return z;
}

/**
 * Wendet ein Ereignis an und liefert den neuen Zustand (der alte bleibt unverändert).
 * Ungültige Eingaben (keine Zahl, nichts gewählt) ändern nichts außer der Rückmeldung; sie zählen nicht als Versuch.
 * Ereignisse, die im aktuellen Zustand nicht möglich sind, werfen SpielFehler.
 */
export function wende(szenario, alt, e) {
  if (alt.beendet) throw new SpielFehler('Der Versuch ist schon beendet');
  if (!e || e.knoten !== alt.knoten) throw new SpielFehler(`Ereignis gehört zu „${e?.knoten}“, aktuell ist „${alt.knoten}“`);
  const z = structuredClone(alt);
  const k = szenario.knoten[z.knoten];
  z.rueckmeldung = null;

  if (e.typ === 'wahl') {
    if (k.typ !== 'szene') throw new SpielFehler('Hier ist keine Entscheidung möglich');
    const o = verfuegbareOptionen(szenario, z).find((x) => x.id === e.option);
    if (!o) throw new SpielFehler(`Option „${e.option}“ ist hier nicht verfügbar`);
    wirke(szenario, z, o.effekte);
    if (o.bewertung) { z.statistik.entscheidungen++; if (o.bewertung === 'gut') z.statistik.gut++; }
    if (o.lernziel) lernzielBuchen(z, o.lernziel, o.bewertung === 'schlecht' ? 'offen' : 'sicher');
    z.rueckmeldung = o.rueckmeldung ? { art: o.bewertung ?? 'neutral', text: o.rueckmeldung, effekte: o.effekte ?? {} } : null;
    z.schritte++;
    betrete(szenario, z, o.ziel);
    return z;
  }

  if (e.typ === 'hinweis') {
    if (k.typ !== 'aufgabe' || !k.hinweis) throw new SpielFehler('Für diesen Knoten gibt es keinen Hinweis');
    z.hinweis = true;
    z.statistik.hinweise++;
    return z;
  }

  if (e.typ === 'antwort') {
    if (k.typ !== 'aufgabe') throw new SpielFehler('Hier ist keine Antwort möglich');
    const mechanik = MECHANIKEN[k.mechanik];
    const w = werteFuer(szenario, z);
    const b = mechanik.bewerte(k, e.antwort, w);
    if (!b.gueltig) { z.rueckmeldung = { art: 'ungueltig', text: b.rueckmeldung }; return z; }
    z.versuche++;
    z.schritte++;
    const max = k.versuche ?? 2;
    if (b.richtig) {
      z.statistik.aufgaben++;
      if (z.versuche === 1) z.statistik.ersterVersuch++;
      const anteil = (z.versuche === 1 ? 1 : ZWEITER_VERSUCH) * (z.hinweis ? 1 - HINWEIS_ABZUG : 1);
      z.punkte += Math.round((k.punkte ?? 10) * anteil * 10) / 10;
      lernzielBuchen(z, k.lernziel, z.versuche === 1 && !z.hinweis ? 'sicher' : 'mit_hilfe');
      wirke(szenario, z, k.effekte_richtig);
      z.rueckmeldung = { art: 'richtig', text: b.rueckmeldung ?? 'Richtig.', versuch: z.versuche, erklaerung: k.erklaerung, effekte: k.effekte_richtig ?? {} };
      betrete(szenario, z, k.weiter);
    } else if (z.versuche < max) {
      z.rueckmeldung = { art: 'falsch', typ: b.typ, text: b.rueckmeldung ?? 'Prüfen Sie Ihren Rechenweg.', nochVersuche: max - z.versuche, hinweisMoeglich: Boolean(k.hinweis) && !z.hinweis };
    } else {
      z.statistik.aufgaben++;
      lernzielBuchen(z, k.lernziel, 'offen');
      wirke(szenario, z, k.effekte_falsch);
      z.rueckmeldung = { art: 'aufgeloest', typ: b.typ, text: b.rueckmeldung ?? 'Leider nicht richtig.', loesung: mechanik.loesung(k, w), erklaerung: k.erklaerung, effekte: k.effekte_falsch ?? {} };
      betrete(szenario, z, k.weiter);
    }
    return z;
  }
  throw new SpielFehler(`Unbekannter Ereignistyp „${e.typ}“`);
}

/** Spielt eine Ereignisfolge von Anfang an nach. */
export function spiele(szenario, seed, ereignisse) {
  let z = starte(szenario, seed);
  for (const e of ereignisse) z = wende(szenario, z, e);
  return z;
}
