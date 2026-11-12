// Klartext für Lehrende: interne Kennungen aus Titeln bilden und die Meldungen der Prüfung (src/engine/szenario.js)
// so umschreiben, dass sie den Schritt bei seinem Titel nennen und das Feld so heißen wie im Editor. Reine Funktionen
// ohne Zugriff auf die Seite; getestet in test/vorlagen.test.js. Die Prüfung selbst und ihre Meldungen für Dateien
// (Hochladen, tools/pruefe.js) bleiben unverändert.

export const ARTEN = { szene: 'Szene', aufgabe: 'Aufgabe', verzweigung: 'Verzweigung', ende: 'Ende' };
const BUCHSTABEN = 'ABCDEFGHIJKL';
const nr = (i) => BUCHSTABEN[i] ?? String(i + 1);
const UMLAUTE = { ä: 'ae', ö: 'oe', ü: 'ue', ß: 'ss' };

/**
 * Interne Kennung aus einem Titel: Kleinbuchstaben, Ziffern und Bindestrich, höchstens 40 Zeichen, eindeutig gegenüber
 * `vorhanden` (sonst mit -2, -3 …). Ohne verwertbaren Titel gilt `ersatz`.
 * kennung('Übung: Spannung im Zugstab') → 'uebung-spannung-im-zugstab'
 */
export function kennung(titel, vorhanden = [], ersatz = 'schritt') {
  let basis = String(titel ?? '').toLowerCase().replace(/[äöüß]/g, (c) => UMLAUTE[c])
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  if (basis.length > 40) basis = basis.slice(0, 40).replace(/-[^-]*$/, '') || basis.slice(0, 40);
  if (basis.length < 2) basis = ersatz;
  const belegt = new Set(vorhanden);
  let k = basis;
  for (let n = 2; belegt.has(k); n++) k = `${basis}-${n}`;
  return k;
}

/** Wie Lehrende einen Schritt kennen: Art und Titel, z. B. Aufgabe „Teilspannung“. */
export function schrittName(s, id) {
  const k = s?.knoten?.[id];
  if (!k) return 'Ein Schritt, den es nicht gibt';
  const art = ARTEN[k.typ] ?? 'Schritt';
  if (k.titel) return `${art} „${k.titel}“`;
  return `${art} ohne Titel (Schritt ${Object.keys(s.knoten).indexOf(id) + 1} im Ablauf)`;
}

/** Bezeichnung eines Felds innerhalb eines Schritts, so wie es im Editor heißt. */
function feldImSchritt(k, rest) {
  const teile = [];
  const m = /^(optionen|typische_fehler|elemente|regeln)\[(\d+)\](?:\.(\w+))?/.exec(rest);
  if (m) {
    const i = Number(m[2]);
    const name = { optionen: k?.typ === 'szene' ? `Möglichkeit ${nr(i)}` : `Antwort ${nr(i)}`, typische_fehler: `Typischer Fehler ${i + 1}`, elemente: `Karte ${i + 1}`, regeln: `Regel ${i + 1}` }[m[1]];
    teile.push(name);
    const unter = { text: 'Text', ziel: m[1] === 'regeln' ? 'dann weiter zu' : 'Führt zu', bedingung: 'Nur anzeigen, wenn', lernziel: 'Lernziel', effekte: 'Wirkung', formel: 'Formel', wenn: 'Wenn', rueckmeldung: 'Rückmeldung' }[m[3]];
    if (unter) teile.push(unter);
    return teile.join(', ');
  }
  const feld = rest.split('.')[0];
  return {
    titel: 'Titel', text: k?.typ === 'ende' ? 'Text am Ende' : 'Text der Szene', sprechblase: 'Sprechblase der Figur', bild: 'Bild',
    lernziel: 'Lernziel', mechanik: 'Art der Aufgabe', frage: 'Frage', loesung: 'Lösung (Formel)', einheit: 'Einheit',
    toleranz_prozent: 'Toleranz in %', toleranz_absolut: 'Toleranz absolut', stellen: 'Nachkommastellen', versuche: 'Versuche',
    punkte: 'Punkte', weiter: 'Weiter zu', hinweis: 'Hinweis', mehrfach: 'Mehrere Antworten richtig', sonst: 'Sonst weiter zu',
    ergebnis: 'Ergebnis', kapitel: 'Kapitel', effekte_richtig: 'Wirkung bei richtiger Antwort', effekte_falsch: 'Wirkung, wenn die Aufgabe aufgelöst wird',
    optionen: k?.typ === 'szene' ? 'Entscheidungen' : 'Antworten', typische_fehler: 'Typische Fehler', elemente: 'Karten', regeln: 'Regeln',
  }[feld] ?? null;
}

/** Ort und Feld einer Meldung außerhalb der Schritte (Allgemein, Kapitel). */
function ortAllgemein(s, pfad) {
  let m;
  if ((m = /^kapitel\[(\d+)\](?:\.(\w+))?/.exec(pfad))) {
    const kap = s?.kapitel?.[Number(m[1])];
    return { ort: kap?.titel ? `Kapitel „${kap.titel}“` : `Kapitel ${Number(m[1]) + 1}`, feld: m[2] === 'titel' ? 'Titel' : null };
  }
  if (pfad === 'kapitel') return { ort: 'Kapitel', feld: null };
  if ((m = /^lernziele\[(\d+)\]/.exec(pfad))) return { ort: 'Allgemein', feld: `Lernziel ${Number(m[1]) + 1}` };
  if ((m = /^indikatoren\[(\d+)\](?:\.(\w+))?/.exec(pfad))) {
    const ind = s?.indikatoren?.[Number(m[1])];
    return { ort: 'Allgemein', feld: `Spielanzeige ${ind?.name ? `„${ind.name}“` : Number(m[1]) + 1}${m[2] === 'symbol' ? ', Symbol' : ''}` };
  }
  if ((m = /^parameter\.(.+)$/.exec(pfad))) return { ort: 'Allgemein', feld: `Zahl je Person „${m[1]}“` };
  if (/^figur/.test(pfad)) return { ort: 'Allgemein', feld: 'Spielfigur' };
  if (pfad === 'version') return { ort: 'Speichern', feld: null };
  const feld = { titel: 'Titel', kurzbeschreibung: 'Kurzbeschreibung', lizenz: 'Lizenz', urheber: 'Urheberinnen und Urheber', lernziele: 'Lernziele',
    start: 'Erster Schritt', titelbild: 'Titelbild', id: 'Interne Kennung', knoten: null, '': null }[pfad];
  return { ort: pfad === 'knoten' ? 'Ablauf' : 'Allgemein', feld: feld ?? null };
}

// Meldungen der Prüfung → Klartext. `c.namen`: Zahlen je Person und Spielanzeigen, die Formeln kennen.
const REGELN = [
  [/^„(.+)“ ist (?:kein Parameter des Szenarios|weder Parameter noch Indikator)$/, (m, c) => `„${m[1]}“ kennt das Spiel nicht.${c.namen.length ? ` Erlaubt sind: ${c.namen.join(', ')}.` : ' Legen Sie die Zahl zuerst unter „Allgemein“ bei „Zahlen je Person“ an.'}`],
  [/^(?:Formel|Ausdruck) nicht lesbar: (.+)$/, (m) => `Die Formel ist so nicht lesbar (${m[1]}).`],
  [/^Formel fehlt$/, () => 'Bitte eine Formel eintragen.'],
  [/^(?:titel|kurzbeschreibung) fehlt$/, () => 'Bitte ausfüllen.'],
  [/^lizenz muss/, () => 'Bitte eine offene Lizenz wählen.'],
  [/^urheber fehlt/, () => 'Bitte mindestens einen Namen eintragen (für die Lizenzangabe).'],
  [/^Lernziel braucht id und text$/, () => 'Der Text fehlt.'],
  [/^Mindestens ein Lernziel angeben$/, () => 'Bitte mindestens ein Lernziel eintragen.'],
  [/^Indikator braucht id und name$/, () => 'Name oder Kurzname fehlt.'],
  [/^Es muss min ≤ start ≤ max gelten$/, () => 'Der Startwert muss zwischen Minimum und Maximum liegen.'],
  [/^symbol muss/, () => 'Bitte ein Symbol aus der Liste wählen.'],
  [/^Parameter braucht/, () => '„von“ darf nicht größer sein als „bis“, und der Schritt muss größer als 0 sein.'],
  [/^Name „(.+)“ ist schon ein Indikator$/, (m) => `„${m[1]}“ heißt schon eine Spielanzeige; bitte einen anderen Namen wählen.`],
  [/^Startknoten „.*“ gibt es nicht$/, () => 'Bitte unter „Für Fortgeschrittene“ den ersten Schritt wählen.'],
  [/^Knoten-id nur aus/, () => 'Die interne Kennung enthält unerlaubte Zeichen; bitte unter „Für Fortgeschrittene“ umbenennen.'],
  [/^typ muss/, () => 'Unbekannte Art von Schritt.'],
  [/^Lernziel „.+“ gibt es nicht$/, () => 'Dieses Lernziel gibt es nicht mehr; bitte ein anderes wählen.'],
  [/^Szene braucht einen Text$/, () => 'Der Text der Szene fehlt.'],
  [/^Szene braucht mindestens eine Option$/, () => 'Bitte mindestens eine Möglichkeit eintragen.'],
  [/^Option braucht eine (?:eindeutige )?id$|^id „.*“ doppelt$|^Jedes Element braucht eine eindeutige id$/, () => 'Zwei Einträge haben dieselbe interne Kennung; bitte einen entfernen und neu hinzufügen.'],
  [/^Option braucht einen Text$/, () => 'Der Text fehlt.'],
  [/^Indikator „(.+)“ gibt es nicht$/, (m) => `Die Spielanzeige „${m[1]}“ gibt es nicht (mehr).`],
  [/^Wirkung muss eine Zahl sein$/, () => 'Bitte eine Zahl eintragen, z. B. 20 oder -15.'],
  [/^Alle Optionen haben Bedingungen/, () => 'Jede Möglichkeit hat eine Bedingung; es kann vorkommen, dass keine angezeigt wird.'],
  [/^Mechanik „.*“ gibt es nicht/, () => 'Bitte eine Art der Aufgabe wählen.'],
  [/^Aufgabe braucht eine Frage$/, () => 'Die Frage fehlt.'],
  [/^versuche: 1 bis 5$/, () => 'Erlaubt sind 1 bis 5 Versuche.'],
  [/^Toleranz muss zwischen 0 und 50 % liegen$/, () => 'Die Toleranz muss zwischen 0 und 50 % liegen.'],
  [/^Mindestens zwei Optionen nötig$/, () => 'Bitte mindestens zwei Antworten eintragen.'],
  [/^Keine Option ist als richtig markiert$/, () => 'Keine Antwort ist als richtig angekreuzt.'],
  [/^Mehrere richtige Optionen, aber „mehrfach“ ist nicht gesetzt$/, () => 'Mehrere Antworten sind als richtig angekreuzt; dann bitte auch „Mehrere Antworten richtig“ ankreuzen.'],
  [/^Mindestens drei Elemente nötig$/, () => 'Bitte mindestens drei Karten eintragen.'],
  [/^Verzweigung braucht ein Ziel „sonst“$/, () => 'Bitte unter „Sonst weiter zu“ einen Schritt wählen.'],
  [/^ergebnis: /, () => 'Bitte ein Ergebnis wählen: Erfolg, Teilerfolg oder Misserfolg.'],
  [/^kapitel muss eine Liste sein$/, () => 'Die Kapitel sind beschädigt; bitte unter „Für Fortgeschrittene“ im JSON prüfen.'],
  [/^Kapitel braucht einen Titel$/, () => 'Der Titel fehlt.'],
  [/^Kapitel braucht eine Liste von Knoten$/, () => 'Noch kein Schritt gehört zu diesem Kapitel. Wählen Sie es im Feld „Kapitel“ eines Schritts.'],
  [/^Knoten „.+“ gibt es nicht$/, () => 'Enthält einen Schritt, den es nicht mehr gibt.'],
  [/^Knoten steht in keinem Kapitel/, () => 'Gehört zu keinem Kapitel; die Fortschrittskarte zeigt hier kein Kapitel. Bitte im Feld „Kapitel“ eines wählen.'],
  [/^Knoten ist vom Start aus nicht erreichbar$/, () => 'Kein Weg führt hierher. Verbinden Sie den Schritt über „Führt zu“ oder „Weiter zu“ eines anderen Schritts.'],
  [/^Vom Start aus ist kein Ende erreichbar$/, () => 'Kein Weg führt zu einem Ende. Bitte einen Schritt der Art „Ende“ anlegen und verbinden.'],
  [/^Von hier aus ist kein Ende erreichbar/, () => 'Von hier aus führt kein Weg zu einem Ende; die Wege laufen im Kreis.'],
  [/^Bild braucht/, () => 'Bitte ein Bild wählen oder „kein Bild“.'],
  [/^Figur braucht/, () => 'Die Spielfigur braucht Name und Bild; bitte unter „Für Fortgeschrittene“ im JSON ergänzen.'],
  [/^id fehlt oder/, () => 'Die interne Kennung des Szenarios ist ungültig (nur a–z, 0–9 und Bindestrich).'],
  [/^version muss/, () => 'Die Versionsnummer muss eine ganze Zahl ab 1 sein.'],
  [/^Die Kennung „.*“ ist schon vergeben/, () => 'Ein Szenario mit diesem Namen gibt es schon. Bitte den Titel ändern und erneut speichern.'],
];

/**
 * Eine Meldung der Prüfung ({ pfad, meldung }) im Klartext: { ort, feld, text, pfad, voll }. `ort` nennt den Schritt bei
 * seinem Titel (oder „Allgemein“, „Kapitel“), `feld` das Feld wie im Editor, `pfad` die Stelle für „Zur Stelle“ (bei
 * einem fehlenden Ziel genauer als in der Prüfung: das Feld „Führt zu“ der betroffenen Möglichkeit).
 */
export function klartext(s, f) {
  let pfad = f?.pfad ?? '';
  const meldung = f?.meldung ?? '';
  const namen = [...Object.keys(s?.parameter ?? {}), ...(s?.indikatoren ?? []).map((i) => i.id).filter(Boolean)];
  let ort;
  let feld;
  let text;
  const m = /^knoten\.([^.[\]]+)(?:\.(.+))?$/.exec(pfad);
  if (m) {
    const [, id, rest] = m;
    const k = s?.knoten?.[id];
    ort = schrittName(s, id);
    const ziel = /^Ziel „(.*)“ gibt es nicht$/.exec(meldung);
    if (ziel && !rest && k) {
      // Welches Feld zeigt ins Leere? Dort hin führt „Zur Stelle“.
      const z = ziel[1];
      const i = (k.optionen ?? []).findIndex((o) => o.ziel === z);
      const r = (k.regeln ?? []).findIndex((x) => x.ziel === z);
      const genauer = k.typ === 'szene' && i >= 0 ? `optionen[${i}].ziel` : k.typ === 'aufgabe' ? 'weiter' : k.typ === 'verzweigung' ? (r >= 0 ? `regeln[${r}].ziel` : 'sonst') : null;
      if (genauer) pfad = `knoten.${id}.${genauer}`;
      feld = genauer ? feldImSchritt(k, genauer) : null;
      text = z ? 'Zeigt auf einen Schritt, den es nicht mehr gibt. Bitte einen Schritt wählen.' : 'Bitte einen Schritt wählen.';
    } else {
      feld = rest ? feldImSchritt(k, rest) : null;
    }
  } else {
    ({ ort, feld } = ortAllgemein(s, pfad));
  }
  if (!text) {
    const regel = REGELN.find(([muster]) => muster.test(meldung));
    text = regel ? regel[1](regel[0].exec(meldung), { namen }) : meldung;
  }
  return { ort, feld, text, pfad, voll: `${ort}${feld ? `, ${feld}` : ''}: ${text}` };
}
