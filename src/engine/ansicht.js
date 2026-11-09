// Was die Oberfläche zu sehen bekommt: nur der aktuelle Knoten, Texte mit eingesetzten Zahlen, keine Lösungen,
// keine Formeln, keine Folgeknoten. Der Server schickt nur diese Ansicht an den Browser; die Lösungen verlassen den
// Server nicht. Die Offline-Fassung (OER-Export) benutzt dieselbe Funktion im Browser.

import { fuelleText } from './ausdruck.js';
import { verfuegbareOptionen } from './ablauf.js';
import { MECHANIKEN } from './mechaniken/index.js';
import { sterne, auszeichnungen } from './wertung.js';

function bild(b) {
  return b ? { datei: b.datei, alt: b.alt ?? '', ...(b.skizze ? { skizze: true } : {}) } : null;
}

function figur(f) {
  return f ? { name: f.name, bild: bild(f.bild), zufrieden: bild(f.zufrieden), besorgt: bild(f.besorgt) } : null;
}

/** Kapitelkarte: nur Titel und Stand, keine Knoten, damit sie nichts über den weiteren Weg verrät. */
function kapitel(szenario, z) {
  const liste = szenario.kapitel ?? [];
  const aktuell = liste.findIndex((kap) => kap.knoten.includes(z.knoten));
  return liste.map((kap, i) => ({ titel: kap.titel, stand: z.beendet || i < aktuell ? 'erledigt' : i === aktuell ? 'aktuell' : 'offen' }));
}

export function ansicht(szenario, z) {
  const werte = { ...z.parameter, ...z.indikatoren };
  const t = (text) => (text === undefined || text === null ? text : fuelleText(text, werte));
  const k = szenario.knoten[z.knoten];
  const knoten = { id: z.knoten, typ: k.typ, titel: t(k.titel), text: t(k.text), bild: bild(k.bild), sprechblase: t(k.sprechblase) };

  if (k.typ === 'szene') {
    knoten.optionen = verfuegbareOptionen(szenario, z).map((o) => ({ id: o.id, text: t(o.text) }));
  } else if (k.typ === 'aufgabe') {
    knoten.mechanik = k.mechanik;
    knoten.frage = t(k.frage);
    knoten.versucheUebrig = (k.versuche ?? 2) - z.versuche;
    knoten.punkte = k.punkte ?? 10;
    knoten.hinweisVerfuegbar = Boolean(k.hinweis) && !z.hinweis;
    if (z.hinweis) knoten.hinweis = t(k.hinweis);
    // Was die Darstellung der Mechanik braucht (ohne Lösung), liefert die Mechanik selbst.
    Object.assign(knoten, MECHANIKEN[k.mechanik]?.ansicht?.(k, t, z) ?? {});
  } else if (k.typ === 'ende') {
    knoten.ergebnis = k.ergebnis;
  }

  const r = z.rueckmeldung;
  const rueckmeldung = r ? { ...r, text: t(r.text), erklaerung: t(r.erklaerung) } : null;

  return {
    szenario: { id: szenario.id, version: szenario.version, titel: szenario.titel, figur: figur(szenario.figur) },
    knoten,
    rueckmeldung,
    indikatoren: (szenario.indikatoren ?? []).map((i) => ({ id: i.id, name: i.name, wert: z.indikatoren[i.id], min: i.min, max: i.max, einheit: i.einheit ?? '', symbol: i.symbol ?? null })),
    kapitel: kapitel(szenario, z),
    punkte: z.punkte,
    maxPunkte: z.maxPunkte,
    schritte: z.schritte,
    beendet: z.beendet,
    ergebnis: z.ergebnis,
    lernziele: z.beendet
      ? (szenario.lernziele ?? []).map((lz) => ({ id: lz.id, text: lz.text, stufe: z.lernziele[lz.id] ?? 'nicht_geprueft' }))
      : undefined,
    sterne: z.beendet ? sterne(z.ergebnis, z.maxPunkte ? z.punkte / z.maxPunkte : null) : undefined,
    auszeichnungen: z.beendet ? auszeichnungen(szenario, z) : undefined,
  };
}
