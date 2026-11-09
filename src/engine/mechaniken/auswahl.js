// Mechanik „auswahl“: Einfach- oder Mehrfachauswahl mit Rückmeldung je Antwortoption.

export const auswahl = {
  typ: 'auswahl',

  /** Felder für die Oberfläche, ohne die Kennzeichnung der richtigen Optionen. */
  ansicht(def, t) {
    return { mehrfach: Boolean(def.mehrfach), auswahl: def.optionen.map((o) => ({ id: o.id, text: t(o.text) })) };
  },

  pruefe(def, pfad) {
    const fehler = [];
    const optionen = def.optionen;
    if (!Array.isArray(optionen) || optionen.length < 2) return [{ pfad: `${pfad}.optionen`, meldung: 'Mindestens zwei Optionen nötig' }];
    const ids = new Set();
    optionen.forEach((o, i) => {
      if (!o.id || typeof o.id !== 'string') fehler.push({ pfad: `${pfad}.optionen[${i}].id`, meldung: 'Option braucht eine id' });
      else if (ids.has(o.id)) fehler.push({ pfad: `${pfad}.optionen[${i}].id`, meldung: `id „${o.id}“ doppelt` });
      ids.add(o.id);
      if (!o.text) fehler.push({ pfad: `${pfad}.optionen[${i}].text`, meldung: 'Option braucht einen Text' });
    });
    const richtige = optionen.filter((o) => o.richtig).length;
    if (richtige === 0) fehler.push({ pfad: `${pfad}.optionen`, meldung: 'Keine Option ist als richtig markiert' });
    if (!def.mehrfach && richtige > 1) fehler.push({ pfad: `${pfad}.optionen`, meldung: 'Mehrere richtige Optionen, aber „mehrfach“ ist nicht gesetzt' });
    return fehler;
  },

  loesung(def) {
    return def.optionen.filter((o) => o.richtig).map((o) => o.text).join(' · ');
  },

  bewerte(def, antwort) {
    const gewaehlt = new Set(Array.isArray(antwort) ? antwort : [antwort]);
    const bekannt = new Set(def.optionen.map((o) => o.id));
    if (gewaehlt.size === 0 || [...gewaehlt].some((id) => !bekannt.has(id))) {
      return { gueltig: false, richtig: false, rueckmeldung: 'Bitte mindestens eine Option wählen.' };
    }
    if (!def.mehrfach && gewaehlt.size > 1) return { gueltig: false, richtig: false, rueckmeldung: 'Bitte genau eine Option wählen.' };
    const richtig = def.optionen.every((o) => Boolean(o.richtig) === gewaehlt.has(o.id));
    // Rückmeldung zur ersten falsch gewählten Option, sonst zur ersten übersehenen
    const falschGewaehlt = def.optionen.find((o) => gewaehlt.has(o.id) && !o.richtig);
    const uebersehen = def.optionen.find((o) => !gewaehlt.has(o.id) && o.richtig);
    const rueckmeldung = richtig
      ? (def.optionen.find((o) => gewaehlt.has(o.id) && o.rueckmeldung)?.rueckmeldung ?? def.rueckmeldung?.richtig)
      : (falschGewaehlt?.rueckmeldung ?? (uebersehen && def.mehrfach ? 'Eine zutreffende Option fehlt noch.' : def.rueckmeldung?.falsch));
    return { gueltig: true, richtig, rueckmeldung };
  },
};
