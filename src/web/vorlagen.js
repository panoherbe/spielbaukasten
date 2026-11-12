// Vorlagen für neue Szenarien. Lehrende wählen eine, tragen Titel und ihren Namen ein und ändern danach nur noch
// Texte. Jede Vorlage besteht die Prüfung sofort (keine Fehler, keine Hinweise) und lässt sich bis zu einem Ende
// spielen; das prüft test/vorlagen.test.js. Die internen Kennungen der Schritte entstehen aus ihren Titeln.

import { kennung } from './klartext.js';

/** Was die Seite „Neues Szenario aus Vorlage“ zeigt. */
export const VORLAGEN = [
  {
    art: 'entscheidung', name: 'Entscheidungsspiel', zeichen: 'karte', titel: 'Entscheidung auf der Baustelle',
    beschreibung: 'Eine Lage, zwei Möglichkeiten mit Folgen und je ein Ende. Für Abwägen und Verantwortung.',
    ablauf: ['Szene', '2 Möglichkeiten', '2 Enden'],
  },
  {
    art: 'rechnen', name: 'Rechenübung', zeichen: 'zahlen', titel: 'Übung: Spannung im Zugstab',
    beschreibung: 'Eine Rechenaufgabe mit eigenen Zahlen je Person, Einheit, Toleranz und Rückmeldung zu einem typischen Fehler.',
    ablauf: ['Rechenaufgabe', 'Ende'],
  },
  {
    art: 'quiz', name: 'Quiz', zeichen: 'liste', titel: 'Quiz: Werkstoffe',
    beschreibung: 'Fragen mit Antworten zur Auswahl und einer Rückmeldung zu jeder Antwort.',
    ablauf: ['Frage 1', 'Frage 2', 'Ende'],
  },
];

const KOPF = { version: 1, sprache: 'de', lizenz: 'CC-BY-4.0' };

/**
 * Schritte mit vorläufigen Namen → Objekt aus Kennung (aus dem Titel) → Schritt; Verweise (ziel, weiter, sonst)
 * werden mit umbenannt.
 */
function mitKennungen(schritte) {
  const neu = {};
  for (const [name, k] of Object.entries(schritte)) neu[name] = kennung(k.titel, Object.values(neu), k.typ);
  const um = (z) => neu[z] ?? z;
  return {
    start: neu[Object.keys(schritte)[0]],
    knoten: Object.fromEntries(Object.entries(schritte).map(([name, k]) => {
      const kopie = structuredClone(k);
      if (kopie.typ === 'szene') for (const o of kopie.optionen) o.ziel = um(o.ziel);
      if (kopie.weiter) kopie.weiter = um(kopie.weiter);
      return [neu[name], kopie];
    })),
  };
}

const INHALT = {
  entscheidung: () => ({
    kurzbeschreibung: 'Ein kurzes Entscheidungsspiel: Auf der Baustelle gibt die Schalung nach. Stoppen oder weitermachen?',
    fach: 'Baubetrieb', dauer_minuten: 3,
    lernziele: [{ id: 'LZ1', text: 'Eine Gefahr auf der Baustelle erkennen und richtig handeln' }],
    indikatoren: [{ id: 'sicherheit', name: 'Sicherheit', start: 50, min: 0, max: 100, einheit: '%', symbol: 'sicherheit' }],
    parameter: {},
    ...mitKennungen({
      lage: {
        typ: 'szene', titel: 'Die Lage',
        text: 'Beim Betonieren der Decke meldet die Polierin: **Die Schalung gibt an einer Stelle nach.** Der Betonmischer wartet, die Zeit drängt.\n\nWas tun Sie?',
        optionen: [
          { id: 'a', text: 'Betonieren stoppen und die Schalung prüfen lassen', ziel: 'gut', bewertung: 'gut', lernziel: 'LZ1', effekte: { sicherheit: 40 },
            rueckmeldung: 'Gut: Erst die Sicherheit, dann der Zeitplan. Die Schalung wird nachgestützt.' },
          { id: 'b', text: 'Weiterbetonieren und die Stelle beobachten', ziel: 'riskant', bewertung: 'schlecht', lernziel: 'LZ1', effekte: { sicherheit: -40 },
            rueckmeldung: 'Riskant: Gibt die Schalung weiter nach, kann die frische Decke einbrechen. Hier gilt: Arbeiten stoppen.' },
        ],
      },
      gut: { typ: 'ende', ergebnis: 'erfolg', titel: 'Gut entschieden', text: 'Die Decke ist sicher betoniert, mit einer Stunde Verzug.' },
      riskant: { typ: 'ende', ergebnis: 'misserfolg', titel: 'Das war riskant', text: 'Die Schalung musste notgestützt werden. Verletzt wurde niemand, doch es hätte anders ausgehen können.' },
    }),
  }),
  rechnen: () => ({
    kurzbeschreibung: 'Eine kurze Rechenübung zur Festigkeitslehre: die Spannung in einem Zugstab, mit eigenen Zahlen für jede Person.',
    fach: 'Technische Mechanik', dauer_minuten: 3,
    lernziele: [{ id: 'LZ1', text: 'Die Spannung in einem Zugstab berechnen' }],
    indikatoren: [],
    parameter: { F: { min: 10, max: 50, schritt: 5, einheit: 'kN' }, A: { werte: [100, 150, 200, 250], einheit: 'mm²' } },
    ...mitKennungen({
      aufgabe: {
        typ: 'aufgabe', titel: 'Spannung im Zugstab', mechanik: 'zahl',
        frage: 'Ein Zugstab aus Stahl hat die Querschnittsfläche A = {A} mm² und wird mit der Kraft F = {F} kN gezogen. Wie groß ist die Spannung σ im Stab?',
        loesung: 'F * 1000 / A', einheit: 'N/mm²', toleranz_prozent: 1, stellen: 1,
        typische_fehler: [{ formel: 'F / A', rueckmeldung: 'Die Kraft steht in kN, die Fläche in mm². Rechnen Sie die Kraft zuerst in N um: 1 kN = 1000 N.' }],
        punkte: 10, versuche: 2, lernziel: 'LZ1',
        hinweis: 'Spannung ist Kraft durch Fläche: σ = F / A.',
        erklaerung: 'σ = F / A = {F} · 1000 N / {A} mm² = {= F * 1000 / A : 1} N/mm².',
        rueckmeldung: { richtig: 'Richtig.', falsch: 'Noch nicht. Spannung ist Kraft durch Fläche.' },
        weiter: 'ende',
      },
      ende: { typ: 'ende', ergebnis: 'erfolg', titel: 'Geschafft', text: 'Mit der Spannung lässt sich prüfen, ob der Stab hält: Sie muss unter der zulässigen Spannung des Stahls bleiben.' },
    }),
  }),
  quiz: () => ({
    kurzbeschreibung: 'Ein kurzes Quiz zur Werkstoffkunde: zwei Fragen mit Rückmeldung zu jeder Antwort.',
    fach: 'Werkstoffkunde', dauer_minuten: 2,
    lernziele: [{ id: 'LZ1', text: 'Werkstoffe nach Wärmeleitung und Dichte unterscheiden' }],
    indikatoren: [],
    parameter: {},
    ...mitKennungen({
      frage1: {
        typ: 'aufgabe', titel: 'Frage 1', mechanik: 'auswahl', frage: 'Welcher Werkstoff leitet Wärme am besten?',
        optionen: [
          { id: 'a', text: 'Kupfer', richtig: true, rueckmeldung: 'Richtig: Kupfer leitet Wärme sehr gut, deshalb steckt es in Wärmetauschern.' },
          { id: 'b', text: 'Edelstahl', rueckmeldung: 'Edelstahl leitet Wärme deutlich schlechter als Kupfer.' },
          { id: 'c', text: 'Glas', rueckmeldung: 'Glas leitet Wärme schlecht; es dient eher als Isolator.' },
        ],
        punkte: 10, versuche: 2, lernziel: 'LZ1', weiter: 'frage2',
      },
      frage2: {
        typ: 'aufgabe', titel: 'Frage 2', mechanik: 'auswahl', frage: 'Welcher Werkstoff ist bei gleichem Volumen am leichtesten?',
        optionen: [
          { id: 'a', text: 'Stahl', rueckmeldung: 'Stahl ist fast dreimal so schwer wie Aluminium.' },
          { id: 'b', text: 'Aluminium', richtig: true, rueckmeldung: 'Richtig: Aluminium hat etwa ein Drittel der Dichte von Stahl.' },
          { id: 'c', text: 'Kupfer', rueckmeldung: 'Kupfer ist sogar schwerer als Stahl.' },
        ],
        punkte: 10, versuche: 2, lernziel: 'LZ1', weiter: 'ende',
      },
      ende: { typ: 'ende', ergebnis: 'erfolg', titel: 'Quiz beendet', text: 'Unten sehen Sie Ihren Stand je Lernziel.' },
    }),
  }),
};

/**
 * Neues Szenario aus einer Vorlage. Die interne Kennung entsteht aus dem Titel und ist eindeutig gegenüber
 * `vorhanden` (Kennungen der Szenarien, die es schon gibt).
 */
export function ausVorlage(art, { titel, urheber, vorhanden = [] } = {}) {
  const v = VORLAGEN.find((x) => x.art === art);
  if (!v) throw new Error(`Vorlage „${art}“ gibt es nicht`);
  const t = String(titel ?? '').trim() || v.titel;
  const namen = String(urheber ?? '').split(',').map((x) => x.trim()).filter(Boolean);
  const inhalt = INHALT[art]();
  return { id: kennung(t, vorhanden, 'lernspiel'), ...KOPF, titel: t, urheber: namen, ...inhalt };
}
