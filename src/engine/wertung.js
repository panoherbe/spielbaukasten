// Wertung am Ende eines Versuchs: Sterne und Auszeichnungen. Beides wird aus dem Zustand berechnet, also aus
// Startwert und Ereignissen, gilt für jedes Szenario und braucht keine Angaben in der Szenario-Datei. Server,
// Übersicht und Offline-Fassung benutzen dieselben Regeln.

/**
 * Sterne 0 bis 3: Der Ausgang zählt (Erfolg 2, Teilerfolg 1, Misserfolg 0), ein weiterer Stern für mindestens
 * 80 % der Punkte. Gute Rechnung rettet also keine riskante Entscheidung, das ist die Botschaft der Szenarien.
 */
export function sterne(ergebnis, quote) {
  const basis = { erfolg: 2, teilerfolg: 1, misserfolg: 0 }[ergebnis] ?? 0;
  return Math.min(3, basis + ((quote ?? 1) >= 0.8 ? 1 : 0));
}

export const AUSZEICHNUNGEN = [
  { id: 'geschafft', titel: 'Ziel erreicht', text: 'Den besten Ausgang des Szenarios erreicht' },
  { id: 'fehlerfrei', titel: 'Fehlerfrei', text: 'Jede Aufgabe im ersten Versuch richtig' },
  { id: 'ohne-hinweis', titel: 'Ohne Hinweis', text: 'Keinen Hinweis gebraucht' },
  { id: 'umsichtig', titel: 'Umsichtig', text: 'Jede Entscheidung fachlich gut' },
  { id: 'lernziele', titel: 'Alle Lernziele sicher', text: 'Jedes Lernziel ohne Hilfe nachgewiesen' },
];

/** Auszeichnungen, die in diesem Versuch möglich waren, jeweils mit `erreicht`. */
export function auszeichnungen(szenario, z) {
  const st = z.statistik;
  const lernziele = szenario.lernziele ?? [];
  const regel = {
    geschafft: [true, z.ergebnis === 'erfolg'],
    fehlerfrei: [st.aufgaben > 0, st.ersterVersuch === st.aufgaben],
    'ohne-hinweis': [st.mitHinweis > 0, st.hinweise === 0],
    umsichtig: [st.entscheidungen > 0, st.gut === st.entscheidungen],
    lernziele: [lernziele.length > 0, lernziele.every((lz) => z.lernziele[lz.id] === 'sicher')],
  };
  return AUSZEICHNUNGEN.filter((a) => regel[a.id][0]).map((a) => ({ ...a, erreicht: regel[a.id][1] }));
}
