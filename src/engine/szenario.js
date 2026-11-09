// Prüfung eines Szenarios (Datei inhalte/szenarien/<id>/szenario.json). Lehrende bekommen jede Abweichung als
// deutsche Meldung mit Fundstelle, bevor ein Szenario Studierenden gezeigt wird.
// Aufbau des Formats: docs/INHALTE.md

import { parse, namen, AusdruckFehler } from './ausdruck.js';
import { MECHANIKEN } from './mechaniken/index.js';

export const KNOTENTYPEN = ['szene', 'aufgabe', 'verzweigung', 'ende'];
export const LIZENZEN = ['CC-BY-4.0', 'CC-BY-SA-4.0', 'CC0-1.0'];
/** Symbole für Indikatoren; die Oberfläche hat für jedes ein Zeichen (src/web/symbole.js). */
export const INDIKATOR_SYMBOLE = ['sicherheit', 'budget', 'tage'];

function ziele(k) {
  if (k.typ === 'szene') return (k.optionen ?? []).map((o) => o.ziel);
  if (k.typ === 'aufgabe') return [k.weiter];
  if (k.typ === 'verzweigung') return [...(k.regeln ?? []).map((r) => r.ziel), k.sonst];
  return [];
}

/** Prüft ein Szenario. Liefert { fehler: [{pfad, meldung}], warnungen: [...] }; leer = einsatzbereit. */
export function pruefeSzenario(s) {
  const fehler = [];
  const warnungen = [];
  const f = (pfad, meldung) => fehler.push({ pfad, meldung });
  if (!s || typeof s !== 'object') return { fehler: [{ pfad: '', meldung: 'Kein Szenario-Objekt' }], warnungen };

  if (!/^[a-z0-9][a-z0-9-]{1,60}$/.test(s.id ?? '')) f('id', 'id fehlt oder enthält andere Zeichen als a–z, 0–9 und „-“');
  if (!Number.isInteger(s.version) || s.version < 1) f('version', 'version muss eine ganze Zahl ≥ 1 sein');
  for (const feld of ['titel', 'kurzbeschreibung']) if (!s[feld]) f(feld, `${feld} fehlt`);
  if (!LIZENZEN.includes(s.lizenz)) f('lizenz', `lizenz muss eine offene Lizenz sein: ${LIZENZEN.join(', ')}`);
  if (!Array.isArray(s.urheber) || s.urheber.length === 0) f('urheber', 'urheber fehlt (für die Namensnennung der Lizenz)');

  // Bilder: { datei, alt } mit einem Pfad im Szenario-Ordner
  const bild = (pfad, b) => {
    if (b !== undefined && (typeof b?.datei !== 'string' || !b.datei)) f(pfad, 'Bild braucht „datei“, z. B. { "datei": "medien/bild.svg", "alt": "…" }');
  };
  bild('titelbild', s.titelbild);
  if (s.figur !== undefined) {
    if (!s.figur?.name) f('figur.name', 'Figur braucht einen Namen');
    if (!s.figur?.bild) f('figur.bild', 'Figur braucht ein Bild');
    for (const feld of ['bild', 'zufrieden', 'besorgt']) bild(`figur.${feld}`, s.figur?.[feld]);
  }

  const lernziele = new Set();
  (s.lernziele ?? []).forEach((lz, i) => {
    if (!lz.id || !lz.text) f(`lernziele[${i}]`, 'Lernziel braucht id und text');
    lernziele.add(lz.id);
  });
  if (lernziele.size === 0) f('lernziele', 'Mindestens ein Lernziel angeben');

  const indikatoren = new Set();
  (s.indikatoren ?? []).forEach((ind, i) => {
    if (!ind.id || !ind.name) f(`indikatoren[${i}]`, 'Indikator braucht id und name');
    if (!(ind.min <= ind.start && ind.start <= ind.max)) f(`indikatoren[${i}]`, 'Es muss min ≤ start ≤ max gelten');
    if (ind.symbol !== undefined && !INDIKATOR_SYMBOLE.includes(ind.symbol)) f(`indikatoren[${i}].symbol`, `symbol muss einer von ${INDIKATOR_SYMBOLE.join(', ')} sein`);
    indikatoren.add(ind.id);
  });

  const parameter = new Set(Object.keys(s.parameter ?? {}));
  for (const [name, def] of Object.entries(s.parameter ?? {})) {
    const ok = Array.isArray(def.werte) ? def.werte.length > 0 : (def.min <= def.max && (def.schritt ?? 1) > 0);
    if (!ok) f(`parameter.${name}`, 'Parameter braucht „werte“ oder „min ≤ max“ mit positivem „schritt“');
    if (indikatoren.has(name)) f(`parameter.${name}`, `Name „${name}“ ist schon ein Indikator`);
  }

  const knoten = s.knoten ?? {};
  const ids = new Set(Object.keys(knoten));
  if (!ids.has(s.start)) f('start', `Startknoten „${s.start}“ gibt es nicht`);

  const formel = (pfad, text, erlaubt) => {
    try {
      for (const n of namen(parse(text))) if (!erlaubt.has(n)) f(pfad, `„${n}“ ist weder Parameter noch Indikator`);
    } catch (e) {
      if (!(e instanceof AusdruckFehler)) throw e;
      f(pfad, `Ausdruck nicht lesbar: ${e.message}`);
    }
  };
  const alleNamen = new Set([...parameter, ...indikatoren]);
  const effekte = (pfad, eff) => {
    for (const [ind, delta] of Object.entries(eff ?? {})) {
      if (!indikatoren.has(ind)) f(`${pfad}.${ind}`, `Indikator „${ind}“ gibt es nicht`);
      if (typeof delta !== 'number') f(`${pfad}.${ind}`, 'Wirkung muss eine Zahl sein');
    }
  };

  for (const [id, k] of Object.entries(knoten)) {
    const p = `knoten.${id}`;
    if (!/^[a-z0-9_-]+$/.test(id)) f(p, 'Knoten-id nur aus a–z, 0–9, „_“, „-“');
    if (!KNOTENTYPEN.includes(k.typ)) { f(`${p}.typ`, `typ muss einer von ${KNOTENTYPEN.join(', ')} sein`); continue; }
    if (k.lernziel && !lernziele.has(k.lernziel)) f(`${p}.lernziel`, `Lernziel „${k.lernziel}“ gibt es nicht`);
    bild(`${p}.bild`, k.bild);
    if (k.typ === 'szene') {
      if (!k.text) f(`${p}.text`, 'Szene braucht einen Text');
      if (!Array.isArray(k.optionen) || k.optionen.length === 0) f(`${p}.optionen`, 'Szene braucht mindestens eine Option');
      const oids = new Set();
      (k.optionen ?? []).forEach((o, i) => {
        if (!o.id || oids.has(o.id)) f(`${p}.optionen[${i}].id`, 'Option braucht eine eindeutige id');
        oids.add(o.id);
        if (!o.text) f(`${p}.optionen[${i}].text`, 'Option braucht einen Text');
        effekte(`${p}.optionen[${i}].effekte`, o.effekte);
        if (o.bedingung) formel(`${p}.optionen[${i}].bedingung`, o.bedingung, alleNamen);
        if (o.lernziel && !lernziele.has(o.lernziel)) f(`${p}.optionen[${i}].lernziel`, `Lernziel „${o.lernziel}“ gibt es nicht`);
      });
      if ((k.optionen ?? []).length > 0 && (k.optionen ?? []).every((o) => o.bedingung)) {
        warnungen.push({ pfad: `${p}.optionen`, meldung: 'Alle Optionen haben Bedingungen; die Szene kann zur Sackgasse werden' });
      }
    } else if (k.typ === 'aufgabe') {
      const m = MECHANIKEN[k.mechanik];
      if (!m) f(`${p}.mechanik`, `Mechanik „${k.mechanik}“ gibt es nicht (vorhanden: ${Object.keys(MECHANIKEN).join(', ')})`);
      else fehler.push(...m.pruefe(k, p, { bekannteNamen: parameter }));
      if (!k.frage) f(`${p}.frage`, 'Aufgabe braucht eine Frage');
      if (k.versuche !== undefined && !(Number.isInteger(k.versuche) && k.versuche >= 1 && k.versuche <= 5)) f(`${p}.versuche`, 'versuche: 1 bis 5');
      effekte(`${p}.effekte_richtig`, k.effekte_richtig);
      effekte(`${p}.effekte_falsch`, k.effekte_falsch);
    } else if (k.typ === 'verzweigung') {
      if (!k.sonst) f(`${p}.sonst`, 'Verzweigung braucht ein Ziel „sonst“');
      (k.regeln ?? []).forEach((r, i) => formel(`${p}.regeln[${i}].wenn`, r.wenn ?? '', alleNamen));
    } else if (k.typ === 'ende') {
      if (!['erfolg', 'teilerfolg', 'misserfolg'].includes(k.ergebnis)) f(`${p}.ergebnis`, 'ergebnis: erfolg, teilerfolg oder misserfolg');
    }
    ziele(k).forEach((z) => { if (z !== undefined && !ids.has(z)) f(p, `Ziel „${z}“ gibt es nicht`); });
  }

  // Kapitel für die Fortschrittskarte: [{ titel, knoten: [id, …] }]; jeder sichtbare Knoten gehört in eines
  if (s.kapitel !== undefined) {
    if (!Array.isArray(s.kapitel)) f('kapitel', 'kapitel muss eine Liste sein');
    else {
      s.kapitel.forEach((kap, i) => {
        if (!kap?.titel) f(`kapitel[${i}].titel`, 'Kapitel braucht einen Titel');
        if (!Array.isArray(kap?.knoten) || kap.knoten.length === 0) f(`kapitel[${i}].knoten`, 'Kapitel braucht eine Liste von Knoten');
        else for (const id of kap.knoten) if (!ids.has(id)) f(`kapitel[${i}].knoten`, `Knoten „${id}“ gibt es nicht`);
      });
      for (const [id, k] of Object.entries(knoten)) {
        if (k.typ !== 'verzweigung' && !s.kapitel.some((kap) => kap?.knoten?.includes?.(id))) warnungen.push({ pfad: `knoten.${id}`, meldung: 'Knoten steht in keinem Kapitel; die Fortschrittskarte zeigt dort kein aktuelles Kapitel' });
      }
    }
  }

  // Erreichbarkeit: jeder Knoten vom Start aus, und von jedem Knoten aus ein Ende
  if (ids.has(s.start)) {
    const erreicht = new Set([s.start]);
    const offen = [s.start];
    while (offen.length) for (const z of ziele(knoten[offen.pop()] ?? {})) if (knoten[z] && !erreicht.has(z)) { erreicht.add(z); offen.push(z); }
    for (const id of ids) if (!erreicht.has(id)) warnungen.push({ pfad: `knoten.${id}`, meldung: 'Knoten ist vom Start aus nicht erreichbar' });
    if (![...erreicht].some((id) => knoten[id].typ === 'ende')) f('knoten', 'Vom Start aus ist kein Ende erreichbar');
    const endetIrgendwann = new Set([...ids].filter((id) => knoten[id].typ === 'ende'));
    for (let geaendert = true; geaendert;) {
      geaendert = false;
      for (const id of ids) if (!endetIrgendwann.has(id) && ziele(knoten[id]).some((z) => endetIrgendwann.has(z))) { endetIrgendwann.add(id); geaendert = true; }
    }
    for (const id of erreicht) if (!endetIrgendwann.has(id)) f(`knoten.${id}`, 'Von hier aus ist kein Ende erreichbar (Endlosschleife)');
  }
  return { fehler, warnungen };
}
