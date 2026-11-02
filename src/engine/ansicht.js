// Was die Oberfläche zu sehen bekommt: nur der aktuelle Knoten, Texte mit eingesetzten Zahlen, keine Lösungen,
// keine Formeln, keine Folgeknoten. Der Server schickt nur diese Ansicht an den Browser; die Lösungen verlassen den
// Server nicht. Die Offline-Fassung (OER-Export) benutzt dieselbe Funktion im Browser.

import { fuelleText } from './ausdruck.js';
import { verfuegbareOptionen } from './ablauf.js';
import { MECHANIKEN } from './mechaniken/index.js';

function bild(szenario, b) {
  return b ? { datei: b.datei, alt: b.alt ?? '' } : null;
}

export function ansicht(szenario, z) {
  const werte = { ...z.parameter, ...z.indikatoren };
  const t = (text) => (text === undefined || text === null ? text : fuelleText(text, werte));
  const k = szenario.knoten[z.knoten];
  const knoten = { id: z.knoten, typ: k.typ, titel: t(k.titel), text: t(k.text), bild: bild(szenario, k.bild) };

  if (k.typ === 'szene') {
    knoten.optionen = verfuegbareOptionen(szenario, z).map((o) => ({ id: o.id, text: t(o.text) }));
  } else if (k.typ === 'aufgabe') {
    knoten.mechanik = k.mechanik;
    knoten.frage = t(k.frage);
    knoten.versucheUebrig = (k.versuche ?? 2) - z.versuche;
    knoten.punkte = k.punkte ?? 10;
    knoten.hinweisVerfuegbar = Boolean(k.hinweis) && !z.hinweis;
    if (z.hinweis) knoten.hinweis = t(k.hinweis);
    if (k.mechanik === 'zahl') knoten.einheit = k.einheit ?? '';
    if (k.mechanik === 'auswahl') {
      knoten.mehrfach = Boolean(k.mehrfach);
      knoten.auswahl = k.optionen.map((o) => ({ id: o.id, text: t(o.text) }));
    }
    if (k.mechanik === 'reihenfolge') {
      const nachId = Object.fromEntries(k.elemente.map((e) => [e.id, e]));
      knoten.elemente = MECHANIKEN.reihenfolge.mische(k, z.seed).map((id) => ({ id, text: t(nachId[id].text) }));
    }
  } else if (k.typ === 'ende') {
    knoten.ergebnis = k.ergebnis;
  }

  const r = z.rueckmeldung;
  const rueckmeldung = r ? { ...r, text: t(r.text), erklaerung: t(r.erklaerung) } : null;

  return {
    szenario: { id: szenario.id, version: szenario.version, titel: szenario.titel },
    knoten,
    rueckmeldung,
    indikatoren: (szenario.indikatoren ?? []).map((i) => ({ id: i.id, name: i.name, wert: z.indikatoren[i.id], min: i.min, max: i.max, einheit: i.einheit ?? '' })),
    punkte: z.punkte,
    maxPunkte: z.maxPunkte,
    schritte: z.schritte,
    beendet: z.beendet,
    ergebnis: z.ergebnis,
    lernziele: z.beendet
      ? (szenario.lernziele ?? []).map((lz) => ({ id: lz.id, text: lz.text, stufe: z.lernziele[lz.id] ?? 'nicht_geprueft' }))
      : undefined,
  };
}
