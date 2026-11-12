// Szenario-Editor für Lehrende: ein Lernspiel in Formularen bearbeiten statt im Texteditor. Links der Ablauf (alle
// Schritte mit ihren Wegen), rechts das Formular des gewählten Teils. Gespeichert wird dasselbe JSON wie bisher, als
// neue Version; die alte bleibt erhalten. Geprüft wird mit derselben Prüfung wie beim Hochladen; jede Meldung nennt
// den Schritt bei seinem Titel und führt mit „Zur Stelle“ zum Feld. Die Vorschau spielt den Entwurf in einem neuen
// Tab, ohne ihn zu speichern.
//
// Einfach für Lehrende ohne Programmierkenntnisse: Interne Kennungen entstehen aus den Titeln und bleiben verborgen;
// Umbenennen, den ersten Schritt festlegen und das JSON stehen unter „Für Fortgeschrittene“ (zu Beginn geschlossen).

import { api, ApiFehler } from './api.js';
import { h, leere, fokus, melde, sage } from './ui.js';
import { symbol } from './symbole.js';
import { kennung, klartext, ARTEN } from './klartext.js';
import { ausVorlage, VORLAGEN } from './vorlagen.js';

const ZEICHEN = { szene: 'karte', aufgabe: 'richtig', verzweigung: 'vertretbar', ende: 'ziel' };
const MECHANIKEN = [['zahl', 'Rechenaufgabe'], ['auswahl', 'Auswahl'], ['reihenfolge', 'Reihenfolge']];
const LIZENZEN = [['CC-BY-4.0', 'CC BY 4.0'], ['CC-BY-SA-4.0', 'CC BY-SA 4.0'], ['CC0-1.0', 'CC0 1.0']];
const BEWERTUNGEN = [['', 'ohne Bewertung'], ['gut', 'gut'], ['neutral', 'vertretbar'], ['schlecht', 'riskant']];
const ERGEBNISSE = [['erfolg', 'Erfolg'], ['teilerfolg', 'Teilerfolg'], ['misserfolg', 'Misserfolg']];
const SYMBOLE = [['', 'ohne Symbol'], ['sicherheit', 'Sicherheit'], ['budget', 'Budget'], ['tage', 'Tage']];
const QUELLE = { datei: 'mitgeliefert', hochgeladen: 'hochgeladen', editor: 'im Editor gespeichert' };
const NEUE_TITEL = { szene: 'Neue Szene', aufgabe: 'Neue Aufgabe', verzweigung: 'Verzweigung', ende: 'Ende' };
const BUCHSTABEN = 'ABCDEFGHIJKL';

const alsZahl = (t) => {
  const x = String(t ?? '').trim().replace(',', '.');
  if (x === '') return undefined;
  return Number.isFinite(Number(x)) ? Number(x) : String(t).trim();
};
const ziele = (k) => (k.typ === 'szene' ? (k.optionen ?? []).map((o) => o.ziel) : k.typ === 'aufgabe' ? [k.weiter] : k.typ === 'verzweigung' ? [...(k.regeln ?? []).map((r) => r.ziel), k.sonst] : []);

/** Beispiele für die Hilfen an Formelfeldern, aus dem Szenario, wie es geöffnet wurde. */
function beispiele(s) {
  const aufgaben = Object.values(s.knoten ?? {}).filter((k) => k.typ === 'aufgabe' && k.mechanik === 'zahl');
  return {
    loesung: aufgaben.find((k) => typeof k.loesung === 'string' && k.loesung.trim())?.loesung,
    fehler: aufgaben.flatMap((k) => k.typische_fehler ?? []).find((f) => typeof f.formel === 'string' && f.formel.trim())?.formel,
  };
}

/**
 * Öffnet den Editor in `inhalt`. `id` eines vorhandenen Szenarios oder `neu: { vorlage, titel, urheber, vorhanden }`
 * für ein neues aus einer Vorlage. Liefert { ungespeichert() } für die Navigation.
 */
export async function editor(inhalt, id, { neu = null } = {}) {
  let e;
  let basis;
  let meta = { versionen: [], medien: [] };
  if (neu) {
    e = ausVorlage(neu.vorlage, neu);
    basis = 0;
  } else {
    const r = await api('GET', `/api/lehrende/szenarien/${encodeURIComponent(id)}`);
    e = structuredClone(r.szenario);
    basis = r.szenario.version;
    meta = r;
  }
  const vorlageName = neu ? VORLAGEN.find((v) => v.art === neu.vorlage)?.name : null;
  const beispiel = beispiele(e);
  let auswahl = 'allgemein';
  let pruefung = null;
  let geaendert = false;
  let gespeichert = null; // Versionsnummer, die in dieser Sitzung gespeichert wurde
  let feldNr = 0;
  // Schritte, die noch nie gespeichert waren: Ihre interne Kennung folgt dem Titel (beim Prüfen, Vorschauen, Speichern)
  const frisch = new Set(neu ? Object.keys(e.knoten) : []);

  const status = h('p', { class: 'editor-status', 'aria-live': 'polite' });
  const ergebnis = h('div', { class: 'editor-ergebnis', 'aria-live': 'polite' });
  const ablauf = h('div', { class: 'editor-ablauf' });
  const formular = h('div', { class: 'editor-formular' });
  const info = h('p', { class: 'gedaempft' });

  // --- Hilfen -----------------------------------------------------------------------------------------------------
  const knotenIds = () => Object.keys(e.knoten ?? {});
  const titelVon = (kid) => e.knoten?.[kid]?.titel || ARTEN[e.knoten?.[kid]?.typ] || 'Schritt';
  const namenInFormeln = () => [...Object.keys(e.parameter ?? {}), ...(e.indikatoren ?? []).map((i) => i.id).filter(Boolean)];
  /** Auswahl eines Schritts als Ziel: Art und Titel, nie die interne Kennung. */
  const zielAuswahl = (wert) => {
    const gesehen = new Map();
    const liste = knotenIds().map((k) => {
      const t = `${ARTEN[e.knoten[k].typ] ?? 'Schritt'}: ${titelVon(k)}`;
      gesehen.set(t, (gesehen.get(t) ?? 0) + 1);
      return [k, gesehen.get(t) > 1 ? `${t} (${gesehen.get(t)})` : t];
    });
    if (wert && !e.knoten[wert]) liste.unshift([wert, 'ein Schritt, den es nicht mehr gibt']);
    if (!wert) liste.unshift(['', '– bitte wählen –']);
    return liste;
  };
  const lernzielAuswahl = () => [['', 'ohne Lernziel'], ...(e.lernziele ?? []).map((lz, i) => [lz.id, lz.text || `Lernziel ${i + 1} (noch ohne Text)`])];
  const setze = (obj, schluessel) => (wert) => { if (wert === undefined || wert === '') delete obj[schluessel]; else obj[schluessel] = wert; };

  /** Meldungen der Prüfung im Klartext (Schritt beim Titel, Feld wie im Formular). */
  const klar = () => (pruefung ? { fehler: pruefung.fehler.map((f) => klartext(e, f)), warnungen: pruefung.warnungen.map((f) => klartext(e, f)) } : { fehler: [], warnungen: [] });

  function fehlerZu(pfad) {
    const k = klar();
    return [...k.fehler.filter((f) => f.pfad === pfad).map((f) => f.text), ...k.warnungen.filter((f) => f.pfad === pfad).map((f) => `Hinweis: ${f.text}`)];
  }

  function ortVon(pfad) {
    const m = /^knoten\.([^.[\]]+)/.exec(pfad ?? '');
    if (m && e.knoten?.[m[1]]) return m[1];
    if (/^kapitel/.test(pfad ?? '')) return 'kapitel';
    return 'allgemein';
  }

  function aenderung({ liste = false, formular: neuZeichnen = false } = {}) {
    if (!geaendert) { geaendert = true; zeigeStatus(); }
    if (liste) zeichneAblauf();
    if (neuZeichnen) zeichneFormular();
  }

  /** Ein beschriftetes Feld; `pfad` verbindet es mit den Meldungen der Prüfung. */
  function feld(beschriftung, wert, setzer, o = {}) {
    const fid = `ef-${++feldNr}`;
    const meldungen = o.pfad ? fehlerZu(o.pfad) : [];
    const beschrieben = [o.hilfe ? `${fid}-h` : null, meldungen.length ? `${fid}-f` : null].filter(Boolean).join(' ') || null;
    const a = { id: fid, 'data-pfad': o.pfad ?? null, 'aria-describedby': beschrieben, 'aria-invalid': meldungen.some((m) => !m.startsWith('Hinweis')) ? 'true' : null, required: o.pflicht ?? null };
    const nach = { liste: o.liste ?? false, formular: o.neuZeichnen ?? false };
    let el;
    if (o.auswahl) {
      el = h('select', { ...a, onchange: (ev) => { setzer(ev.target.value); aenderung({ liste: true, formular: nach.formular }); } },
        o.auswahl.map(([w, t]) => h('option', { value: w, selected: String(w) === String(wert ?? '') }, t)));
    } else if (o.art === 'haken') {
      el = h('input', { ...a, type: 'checkbox', checked: Boolean(wert), onchange: (ev) => { setzer(ev.target.checked); aenderung(nach); } });
      return h('div', { class: 'feld feld-haken' }, h('label', { class: 'auswahl-option', for: fid }, el, h('span', {}, beschriftung)),
        o.hilfe ? h('p', { class: 'feld-hilfe', id: `${fid}-h` }, o.hilfe) : null, meldungsliste(fid, meldungen));
    } else if (o.mehrzeilig) {
      el = h('textarea', { ...a, rows: o.zeilen ?? 3, oninput: (ev) => { setzer(ev.target.value); aenderung(); }, onchange: () => { if (nach.liste) zeichneAblauf(); } });
      el.value = wert ?? '';
    } else {
      el = h('input', {
        ...a, type: o.art === 'ganzzahl' ? 'number' : 'text', inputmode: o.art === 'zahl' ? 'decimal' : null, step: o.art === 'ganzzahl' ? '1' : null,
        min: o.min ?? null, max: o.max ?? null, value: wert ?? '', spellcheck: o.formel ? 'false' : null, autocomplete: 'off', class: o.formel ? 'formel' : null,
        oninput: (ev) => { setzer(o.art === 'ganzzahl' ? (ev.target.value === '' ? undefined : Number(ev.target.value)) : o.art === 'zahl' ? alsZahl(ev.target.value) : ev.target.value); aenderung(); },
        onchange: () => { if (nach.liste) zeichneAblauf(); },
      });
    }
    return h('div', { class: `feld${o.breit ? ' breit' : ''}${meldungen.length ? ' mit-meldung' : ''}` },
      h('label', { for: fid }, beschriftung, o.pflicht ? h('span', { class: 'pflicht' }, ' (Pflicht)') : null),
      o.hilfe ? h('p', { class: 'feld-hilfe', id: `${fid}-h` }, o.hilfe) : null, el, meldungsliste(fid, meldungen));
  }

  function meldungsliste(fid, meldungen) {
    return meldungen.length ? h('p', { class: 'feld-meldung', id: `${fid}-f` }, symbol('falsch'), meldungen.join(' · ')) : null;
  }

  const knopf = (text, zeichen, onclick, o = {}) => h('button', { type: 'button', class: o.klasse ?? 'knopf-klein', 'aria-label': o.label ?? null, disabled: o.aus ?? null, onclick }, zeichen ? symbol(zeichen) : null, text);

  /** Bereich „Für Fortgeschrittene“: zu Beginn geschlossen, mit der Tastatur über die Zusammenfassung zu öffnen. */
  const fortgeschritten = (klasse, ...inhaltTeile) => h('details', { class: `fortgeschritten ${klasse}`.trim() },
    h('summary', {}, symbol('einstellungen'), 'Für Fortgeschrittene'), h('div', { class: 'fortgeschritten-inhalt' }, inhaltTeile));

  /**
   * Liste mit Einträgen, die man verschieben und entfernen kann (Möglichkeiten, Regeln, Lernziele …). `schreibe`
   * überträgt die Liste zurück ins Szenario, wo sie nicht dasselbe Objekt ist (Zahlen je Person). Nach jeder Änderung
   * steht der Fokus wieder an der passenden Stelle.
   */
  function liste(titel, eintraege, { zeichneEintrag, neu: neuerEintrag, name, pfad, schreibe = null, hilfe = null }) {
    const sel = `[data-liste="${CSS.escape(pfad)}"]`;
    const danach = (fokusSuche, ansage) => {
      schreibe?.();
      aenderung({ liste: true, formular: true });
      (formular.querySelector(`${sel} ${fokusSuche}`) ?? formular.querySelector(`${sel} .liste-neu`))?.focus();
      if (ansage) sage(ansage);
    };
    const nr = (i) => BUCHSTABEN[i] ?? i + 1;
    const verschiebe = (i, d) => {
      const j = i + d;
      [eintraege[i], eintraege[j]] = [eintraege[j], eintraege[i]];
      danach(`fieldset:nth-of-type(${j + 1}) ${d < 0 && j > 0 ? '.hoch' : d > 0 && j < eintraege.length - 1 ? '.runter' : 'legend + * :is(input, textarea, select)'}`, `${name} ${nr(i)} steht jetzt an Stelle ${nr(j)}.`);
    };
    const meldungen = fehlerZu(pfad);
    return h('section', { class: 'editor-liste', 'data-liste': pfad, 'data-pfad': pfad, tabindex: '-1' }, h('h3', {}, titel),
      hilfe ? h('p', { class: 'feld-hilfe' }, hilfe) : null,
      meldungen.length ? h('p', { class: 'feld-meldung' }, symbol('falsch'), meldungen.join(' · ')) : null,
      eintraege.map((x, i) => h('fieldset', { class: 'unterkarte' },
        h('legend', {}, `${name} ${nr(i)}`),
        zeichneEintrag(x, i),
        h('div', { class: 'knopfreihe klein' },
          knopf('', 'pfeil', () => verschiebe(i, -1), { label: `${name} ${nr(i)} nach oben`, aus: i === 0, klasse: 'knopf-klein hoch' }),
          knopf('', 'pfeil', () => verschiebe(i, 1), { label: `${name} ${nr(i)} nach unten`, aus: i === eintraege.length - 1, klasse: 'knopf-klein runter' }),
          knopf(`${name} ${nr(i)} entfernen`, null, () => { eintraege.splice(i, 1); danach('.liste-neu', `${name} entfernt.`); })))),
      knopf(`${name} hinzufügen`, 'plus', () => { eintraege.push(neuerEintrag()); danach('fieldset:last-of-type :is(input, textarea, select)', `${name} ${nr(eintraege.length - 1)} hinzugefügt.`); }, { klasse: 'knopf liste-neu' }));
  }

  const freieId = (praefix, vorhanden) => { let n = 1; while (vorhanden.includes(`${praefix}${n}`)) n++; return `${praefix}${n}`; };

  function wirkung(obj, schluessel, pfad) {
    const ind = e.indikatoren ?? [];
    if (!ind.length) return null;
    const eff = obj[schluessel] ?? {};
    return h('div', { class: 'feldgruppe' }, ind.map((i) => feld(`${i.name || i.id}${i.einheit ? ` (${i.einheit})` : ''}`, eff[i.id], (w) => {
      const neuEff = { ...(obj[schluessel] ?? {}) };
      if (w === undefined) delete neuEff[i.id]; else neuEff[i.id] = w;
      if (Object.keys(neuEff).length) obj[schluessel] = neuEff; else delete obj[schluessel];
    }, { art: 'zahl', pfad: `${pfad}.${i.id}`, hilfe: 'z. B. 20 oder -15; leer = keine Wirkung' })));
  }

  // Einzeilige Hilfen mit einem Beispiel aus diesem Szenario
  function hilfeFormel() {
    const n = Object.keys(e.parameter ?? {});
    const bsp = beispiel.loesung ?? (n.length >= 2 ? `${n[0]} / ${n[1]}` : n.length ? `2 * ${n[0]}` : '(12 + 8) / 4');
    return n.length ? `Wie auf dem Papier, mit den Namen aus „Zahlen je Person“ (${n.join(', ')}): z. B. ${bsp}`
      : `Wie auf dem Papier, mit + − * / und Klammern, z. B. ${bsp}; eigene Zahlen je Person legen Sie unter „Allgemein“ an.`;
  }
  function hilfeIrrweg() {
    return `Die Rechnung, die Studierende oft falsch machen${beispiel.fehler ? `, z. B. ${beispiel.fehler}` : ''}; trifft eine Antwort sie, erscheint Ihre Rückmeldung.`;
  }
  function hilfeBedingung() {
    const n = namenInFormeln();
    return `Leer lassen, wenn die Möglichkeit immer erscheinen soll${n.length ? `; sonst z. B. ${n.at(-1)} >= 50` : ''}.`;
  }
  function hilfeText() {
    const p = Object.keys(e.parameter ?? {})[0];
    return `${p ? `{${p}} setzt die Zahl ${p} der Person ein; ` : ''}eine Leerzeile beginnt einen neuen Absatz, **so** wird ein Wort fett.`;
  }

  // --- Ablauf (links) ---------------------------------------------------------------------------------------------
  function zahlFehler(ort) {
    return pruefung ? pruefung.fehler.filter((f) => ortVon(klartext(e, f).pfad) === ort).length : 0;
  }

  function eintrag(wahl, inhaltTeile, klasse = '') {
    const n = zahlFehler(wahl);
    return h('li', { class: `ablauf-punkt ${klasse}`.trim() },
      h('button', { type: 'button', class: 'ablauf-eintrag', 'aria-current': auswahl === wahl ? 'true' : null, 'data-wahl': wahl, onclick: () => waehle(wahl) },
        inhaltTeile, n ? h('span', { class: 'ablauf-fehler' }, symbol('falsch'), `${n} Fehler`) : null));
  }

  function zeichneAblauf() {
    const ids = knotenIds();
    const typWahl = h('select', { id: 'neuer-schritt-typ' }, Object.entries(ARTEN).map(([t, name]) => h('option', { value: t }, name)));
    leere(ablauf,
      h('h2', {}, 'Ablauf'),
      h('ol', { class: 'ablauf-liste' },
        eintrag('allgemein', [h('span', { class: 'ablauf-typ' }, symbol('einstellungen'), 'Allgemein'), h('span', { class: 'ablauf-titel' }, 'Titel, Lizenz, Lernziele, Zahlen')]),
        eintrag('kapitel', [h('span', { class: 'ablauf-typ' }, symbol('liste'), 'Kapitel'), h('span', { class: 'ablauf-titel' }, (e.kapitel ?? []).length ? `${e.kapitel.length} Kapitel für die Fortschrittskarte` : 'Fortschrittskarte (noch ohne Kapitel)')])),
      h('ol', { class: 'ablauf-liste knoten', 'aria-label': 'Schritte in der Reihenfolge des Szenarios' }, ids.map((kid) => {
        const k = e.knoten[kid];
        const name = ARTEN[k.typ] ?? 'Schritt';
        const wege = [...new Set(ziele(k).filter(Boolean))];
        return eintrag(kid, [
          h('span', { class: 'ablauf-typ' }, symbol(ZEICHEN[k.typ] ?? 'anzeige'), k.typ === 'aufgabe' ? `${name} · ${(MECHANIKEN.find(([m]) => m === k.mechanik)?.[1] ?? '').split(' ')[0]}` : name,
            kid === e.start ? h('span', { class: 'ablauf-start' }, 'Start') : null),
          h('span', { class: 'ablauf-titel' }, k.titel || (k.typ === 'verzweigung' ? 'ohne Anzeige' : '(ohne Titel)')),
          wege.length ? h('span', { class: 'ablauf-wege' }, wege.map((z) => h('span', { class: e.knoten[z] ? '' : 'fehlt' }, '→ ', e.knoten[z] ? titelVon(z) : 'fehlt'))) : null,
        ], `typ-${k.typ}`);
      })),
      h('div', { class: 'knoten-neu' },
        h('label', { for: 'neuer-schritt-typ', class: 'beschriftung' }, 'Neuer Schritt nach dem gewählten'),
        h('div', { class: 'eingabe-zeile' }, typWahl, knopf('Hinzufügen', 'plus', () => fuegeEin(typWahl.value), { klasse: 'knopf' }))));
  }

  function waehle(wahl, pfad = null) {
    auswahl = wahl;
    zeichneAblauf();
    zeichneFormular();
    let ziel = null;
    for (let p = pfad; p && !ziel; p = p.includes('.') || p.includes('[') ? p.replace(/(\.[^.[\]]+|\[\d+\])$/, '') : null) ziel = formular.querySelector(`[data-pfad="${CSS.escape(p)}"]`);
    if (ziel) {
      // Liegt die Stelle unter „Für Fortgeschrittene“, wird der Bereich geöffnet
      for (let d = ziel.closest('details'); d; d = d.parentElement?.closest('details')) d.open = true;
      ziel.scrollIntoView({ block: 'center' });
      ziel.focus();
    } else fokus(formular.querySelector('h2'));
  }

  // --- Schritte anlegen, verschieben, umbenennen, entfernen ---------------------------------------------------
  function ordne(ids) {
    e.knoten = Object.fromEntries(ids.map((k) => [k, e.knoten[k]]));
  }

  /** Interne Kennung ändern, alle Verweise mitnehmen (ohne Meldung, ohne neu zu zeichnen). */
  function benenne(alt, neuId) {
    e.knoten = Object.fromEntries(Object.entries(e.knoten).map(([k, v]) => [k === alt ? neuId : k, v]));
    const um = (z) => (z === alt ? neuId : z);
    if (e.start === alt) e.start = neuId;
    for (const k of Object.values(e.knoten)) {
      for (const o of k.typ === 'szene' ? k.optionen ?? [] : []) o.ziel = um(o.ziel);
      if (k.weiter !== undefined) k.weiter = um(k.weiter);
      for (const r of k.regeln ?? []) r.ziel = um(r.ziel);
      if (k.sonst !== undefined) k.sonst = um(k.sonst);
    }
    for (const kap of e.kapitel ?? []) kap.knoten = (kap.knoten ?? []).map(um);
    if (auswahl === alt) auswahl = neuId;
    if (frisch.delete(alt)) frisch.add(neuId);
  }

  /** Neue, noch nie gespeicherte Schritte heißen intern wie ihr Titel. Liefert true, wenn sich etwas geändert hat. */
  function ordneKennungen() {
    let umbenannt = false;
    for (const kid of [...frisch]) {
      const k = e.knoten[kid];
      if (!k) { frisch.delete(kid); continue; }
      if (k.typ === 'verzweigung' || !k.titel) continue;
      const soll = kennung(k.titel, knotenIds().filter((x) => x !== kid), k.typ);
      if (soll !== kid) { benenne(kid, soll); umbenannt = true; }
    }
    if (umbenannt) { zeichneAblauf(); zeichneFormular(); }
    return umbenannt;
  }

  function fuegeEin(typ) {
    const ids = knotenIds();
    const kid = kennung(NEUE_TITEL[typ], ids, typ);
    const ende = ids.find((k) => e.knoten[k].typ === 'ende') ?? e.start;
    const neuK = {
      szene: { typ, titel: NEUE_TITEL.szene, text: '', optionen: [{ id: 'o1', text: '', ziel: ende }] },
      aufgabe: { typ, titel: NEUE_TITEL.aufgabe, mechanik: 'auswahl', frage: '', optionen: [{ id: 'a', text: '', richtig: true }, { id: 'b', text: '' }], punkte: 10, weiter: ende },
      verzweigung: { typ, regeln: [{ wenn: '', ziel: ende }], sonst: ende },
      ende: { typ, ergebnis: 'erfolg', titel: NEUE_TITEL.ende, text: '' },
    }[typ];
    e.knoten[kid] = neuK;
    frisch.add(kid);
    const pos = ids.indexOf(auswahl);
    if (pos >= 0) { ids.splice(pos + 1, 0, kid); ordne(ids); }
    aenderung();
    melde(`${ARTEN[typ]} angelegt. Verbinden Sie sie über „Führt zu“ oder „Weiter zu“ mit dem Ablauf.`);
    waehle(kid);
  }

  function verschiebeKnoten(kid, d) {
    const ids = knotenIds();
    const i = ids.indexOf(kid);
    const j = i + d;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    ordne(ids);
    aenderung({ liste: true, formular: true });
    sage(`„${titelVon(kid)}“ steht jetzt an Stelle ${j + 1}.`);
    formular.querySelector(d < 0 ? '.knoten-hoch' : '.knoten-runter')?.focus();
  }

  function benenneUm(alt, neuId) {
    if (neuId === alt) return;
    if (!/^[a-z0-9_-]+$/.test(neuId)) return melde('Kennung nur aus a–z, 0–9, „_“ und „-“.', 'fehler');
    if (e.knoten[neuId]) return melde(`„${neuId}“ gibt es schon.`, 'fehler');
    benenne(alt, neuId);
    frisch.delete(neuId); // selbst gewählt: folgt nicht mehr dem Titel
    aenderung();
    melde(`Umbenannt in „${neuId}“; alle Verweise sind angepasst.`);
    waehle(neuId, `knoten.${neuId}.kennung`);
  }

  function entferne(kid) {
    if (kid === e.start) return melde('Mit diesem Schritt beginnt das Spiel; er lässt sich nicht entfernen. Legen Sie zuerst unter „Für Fortgeschrittene“ einen anderen ersten Schritt fest.', 'fehler');
    const verweise = knotenIds().filter((k) => k !== kid && ziele(e.knoten[k]).includes(kid));
    if (!confirm(`„${titelVon(kid)}“ entfernen?${verweise.length ? ` ${verweise.length === 1 ? 'Ein anderer Schritt führt' : `${verweise.length} andere Schritte führen`} hierher; die Prüfung zeigt das danach als Fehler.` : ''}`)) return;
    const titel = titelVon(kid);
    delete e.knoten[kid];
    frisch.delete(kid);
    for (const kap of e.kapitel ?? []) kap.knoten = (kap.knoten ?? []).filter((x) => x !== kid);
    aenderung();
    melde(`„${titel}“ entfernt.`);
    waehle(verweise[0] ?? 'allgemein');
  }

  // --- Formulare (rechts) -----------------------------------------------------------------------------------------
  function bildFeld(obj, schluessel, pfad, titel = 'Bild') {
    const b = obj[schluessel];
    const vorschau = b?.datei && meta.medien.includes(b.datei) ? h('img', { class: 'bild-vorschau', src: `/medien/${encodeURIComponent(e.id)}/${b.datei.split('/').map(encodeURIComponent).join('/')}`, alt: '' }) : null;
    return h('div', { class: 'feldgruppe bild' },
      feld(titel, b?.datei ?? '', (w) => { if (!w) delete obj[schluessel]; else obj[schluessel] = { ...(obj[schluessel] ?? {}), datei: w, alt: obj[schluessel]?.alt ?? '' }; },
        { auswahl: [['', 'kein Bild'], ...meta.medien.map((m) => [m, m.replace(/^medien\//, '')]), ...(b?.datei && !meta.medien.includes(b.datei) ? [[b.datei, `${b.datei} (nicht im Ordner)`]] : [])], pfad, neuZeichnen: true,
          hilfe: meta.medien.length ? 'Bilder aus dem Ordner dieses Szenarios.' : 'Dieses Szenario hat noch keine Bilder auf dem Server; Bilder legt Ihre IT ab.' }),
      vorschau,
      b ? feld('Alternativtext (was auf dem Bild zu sehen ist)', b.alt, (w) => { obj[schluessel].alt = w; }, { mehrzeilig: true, zeilen: 2, breit: true }) : null);
  }

  function formAllgemein() {
    const urheber = (e.urheber ?? []).join(', ');
    return [
      h('h2', {}, 'Allgemeine Angaben'),
      h('div', { class: 'feldgruppe' },
        feld('Titel', e.titel, setze(e, 'titel'), { pfad: 'titel', pflicht: true, breit: true, liste: true }),
        feld('Kurzbeschreibung', e.kurzbeschreibung, setze(e, 'kurzbeschreibung'), { pfad: 'kurzbeschreibung', pflicht: true, mehrzeilig: true, breit: true, hilfe: 'Erscheint auf der Spielkarte in der Übersicht.' }),
        feld('Fach', e.fach, setze(e, 'fach'), { pfad: 'fach' }),
        feld('Zielgruppe', e.zielgruppe, setze(e, 'zielgruppe'), { pfad: 'zielgruppe' }),
        feld('Dauer in Minuten', e.dauer_minuten, setze(e, 'dauer_minuten'), { art: 'ganzzahl', min: 1, pfad: 'dauer_minuten' }),
        feld('Lizenz', e.lizenz, setze(e, 'lizenz'), { auswahl: LIZENZEN, pfad: 'lizenz', pflicht: true }),
        feld('Urheberinnen und Urheber', urheber, (w) => { e.urheber = w.split(',').map((x) => x.trim()).filter(Boolean); }, { pfad: 'urheber', pflicht: true, hilfe: 'Namen für die Lizenzangabe, durch Komma getrennt.' })),
      liste('Lernziele', e.lernziele ??= [], {
        name: 'Lernziel', pfad: 'lernziele', hilfe: 'Am Ende sehen Studierende ihren Stand je Lernziel; Aufgaben und Entscheidungen ordnen Sie einem Lernziel zu.',
        neu: () => ({ id: freieId('LZ', e.lernziele.map((x) => x.id)), text: '' }),
        zeichneEintrag: (lz, i) => feld(`Lernziel ${i + 1}`, lz.text, (w) => { lz.text = w; }, { pfad: `lernziele[${i}]`, breit: true }),
      }),
      liste('Spielanzeige (z. B. Sicherheit, Budget)', e.indikatoren ??= [], {
        name: 'Anzeige', pfad: 'indikatoren', hilfe: 'Werte, die oben im Spiel stehen und sich durch Entscheidungen ändern.',
        neu: () => ({ id: freieId('wert', e.indikatoren.map((x) => x.id)), name: '', start: 50, min: 0, max: 100, einheit: '' }),
        zeichneEintrag: (ind, i) => h('div', { class: 'feldgruppe' },
          feld('Name', ind.name, (w) => { ind.name = w; }, { pfad: `indikatoren[${i}]` }),
          feld('Kurzname in Formeln', ind.id, (w) => { ind.id = w; }, { hilfe: 'Kleinbuchstaben, z. B. sicherheit' }),
          feld('Start', ind.start, (w) => { ind.start = w; }, { art: 'zahl' }),
          feld('Minimum', ind.min, (w) => { ind.min = w; }, { art: 'zahl' }),
          feld('Maximum', ind.max, (w) => { ind.max = w; }, { art: 'zahl' }),
          feld('Einheit', ind.einheit, setze(ind, 'einheit')),
          feld('Symbol', ind.symbol ?? '', setze(ind, 'symbol'), { auswahl: SYMBOLE, pfad: `indikatoren[${i}].symbol` })),
      }),
      parameterListe(),
      h('section', { class: 'editor-liste' }, h('h3', {}, 'Titelbild'), bildFeld(e, 'titelbild', 'titelbild', 'Titelbild der Spielkarte')),
      fortgeschritten('',
        h('p', { class: 'feld-hilfe', 'data-pfad': 'id', tabindex: '-1' }, 'Interne Kennung des Szenarios: ', h('code', {}, e.id), basis ? ' (bleibt über alle Versionen gleich)' : ' (entsteht beim ersten Speichern aus dem Titel)'),
        h('div', { class: 'feldgruppe' },
          feld('Erster Schritt', e.start, (w) => { e.start = w; }, { auswahl: zielAuswahl(e.start), pfad: 'start', pflicht: true, hilfe: 'Mit diesem Schritt beginnt das Spiel.' })),
        jsonBereich()),
    ];
  }

  function parameterListe() {
    const eintraege = Object.entries(e.parameter ?? {}).map(([name, def]) => ({ name, def }));
    const schreibe = () => { e.parameter = Object.fromEntries(eintraege.filter((x) => x.name).map((x) => [x.name, x.def])); };
    return liste('Zahlen je Person', eintraege, {
      name: 'Zahl', pfad: 'parameter', schreibe, hilfe: 'Jede Person bekommt eigene Zahlen aus diesem Bereich; so rechnet niemand bloß ab.',
      neu: () => ({ name: freieId('p', eintraege.map((x) => x.name)), def: { min: 1, max: 10, schritt: 1 } }),
      zeichneEintrag: (x) => {
        const istListe = Array.isArray(x.def.werte);
        return h('div', { class: 'feldgruppe' },
          feld('Name in Formeln', x.name, (w) => { x.name = w.trim(); schreibe(); }, { pfad: `parameter.${x.name}`, hilfe: `z. B. F; in Texten als {F}` }),
          feld('Art', istListe ? 'werte' : 'bereich', (w) => { x.def = w === 'werte' ? { werte: [x.def.min ?? 1], einheit: x.def.einheit } : { min: 1, max: 10, schritt: 1, einheit: x.def.einheit }; schreibe(); },
            { auswahl: [['bereich', 'Bereich mit Schritt'], ['werte', 'Liste von Werten']], neuZeichnen: true }),
          istListe ? feld('Werte', x.def.werte.join('; '), (w) => { x.def.werte = w.split(';').map(alsZahl).filter((v) => v !== undefined); schreibe(); }, { hilfe: 'durch Semikolon getrennt, z. B. 30; 45; 60', breit: true })
            : [feld('von', x.def.min, (w) => { x.def.min = w; schreibe(); }, { art: 'zahl' }), feld('bis', x.def.max, (w) => { x.def.max = w; schreibe(); }, { art: 'zahl' }),
              feld('Schritt', x.def.schritt, (w) => { x.def.schritt = w; schreibe(); }, { art: 'zahl' })],
          feld('Einheit', x.def.einheit, (w) => { setze(x.def, 'einheit')(w); schreibe(); }));
      },
    });
  }

  function jsonBereich() {
    const feldJson = h('textarea', { id: 'editor-json', rows: 16, spellcheck: 'false', class: 'formel' });
    const lade = () => { feldJson.value = JSON.stringify(e, null, 2); };
    lade();
    return h('section', { class: 'editor-liste editor-json' },
      h('h3', {}, 'Das Szenario als Datei (JSON)'),
      h('p', { class: 'feld-hilfe' }, 'Dasselbe Szenario als Datei (Format: docs/INHALTE.md). Änderungen hier ersetzen den Entwurf, wenn Sie „JSON übernehmen“ wählen.'),
      h('label', { for: 'editor-json', class: 'beschriftung' }, 'Szenario als JSON'), feldJson,
      h('div', { class: 'knopfreihe' },
        knopf('JSON übernehmen', 'richtig', () => {
          try {
            const neuE = JSON.parse(feldJson.value);
            if (!neuE || typeof neuE !== 'object' || !neuE.knoten) throw new Error('Kein Szenario: „knoten“ fehlt');
            e = { ...neuE, id: e.id };
            frisch.clear();
            aenderung({ liste: true, formular: true });
            melde('JSON übernommen.');
          } catch (err) { melde(`JSON nicht lesbar: ${err.message}`, 'fehler'); }
        }, { klasse: 'knopf' }),
        knopf('Neu aus dem Entwurf', 'nochmal', () => { ordneKennungen(); lade(); }, { klasse: 'knopf' }),
        knopf('JSON herunterladen', 'herunterladen', herunterladen, { klasse: 'knopf' })));
  }

  function formKapitel() {
    return [
      h('h2', {}, 'Kapitel'),
      h('p', { class: 'feld-hilfe' }, 'Kapitel bilden die Fortschrittskarte oben im Spiel. Welcher Schritt zu welchem Kapitel gehört, wählen Sie im Formular des Schritts.'),
      liste('Kapitel', e.kapitel ??= [], {
        name: 'Kapitel', pfad: 'kapitel',
        neu: () => ({ titel: '', knoten: [] }),
        zeichneEintrag: (kap, i) => h('div', {},
          feld('Titel', kap.titel, (w) => { kap.titel = w; }, { pfad: `kapitel[${i}].titel`, breit: true }),
          h('p', { class: 'feld-hilfe', 'data-pfad': `kapitel[${i}].knoten`, tabindex: '-1' }, 'Schritte: ', (kap.knoten ?? []).length ? kap.knoten.map((k) => titelVon(k)).join(' · ') : 'noch keiner'),
          meldungsliste(`kap-${i}`, fehlerZu(`kapitel[${i}].knoten`))),
      }),
    ];
  }

  function kapitelFeld(kid) {
    const kapitel = e.kapitel ?? [];
    if (!kapitel.length) return null;
    const jetzt = kapitel.findIndex((k) => (k.knoten ?? []).includes(kid));
    return feld('Kapitel', String(jetzt), (w) => {
      for (const k of kapitel) k.knoten = (k.knoten ?? []).filter((x) => x !== kid);
      if (w !== '-1') kapitel[Number(w)].knoten.push(kid);
    }, { auswahl: [['-1', 'in keinem Kapitel'], ...kapitel.map((k, i) => [String(i), k.titel || `Kapitel ${i + 1}`])], pfad: `knoten.${kid}.kapitel` });
  }

  function formKnoten(kid) {
    const k = e.knoten[kid];
    const p = `knoten.${kid}`;
    const ids = knotenIds();
    const i = ids.indexOf(kid);
    const kennungFeld = h('input', { id: 'schritt-kennung', value: kid, autocomplete: 'off', spellcheck: 'false', class: 'formel', 'data-pfad': `${p}.kennung`, 'aria-describedby': 'schritt-kennung-h' });
    const knotenMeldungen = fehlerZu(p);
    const teile = [
      h('h2', { 'data-pfad': p, tabindex: '-1' }, h('span', { class: 'chip' }, symbol(ZEICHEN[k.typ] ?? 'anzeige'), ARTEN[k.typ] ?? 'Schritt'), ' ', k.titel || ARTEN[k.typ] || 'Schritt'),
      knotenMeldungen.length ? h('div', { class: 'feld-meldung block', role: 'note' }, symbol('falsch'), knotenMeldungen.join(' · ')) : null,
      h('div', { class: 'knopfreihe' },
        knopf('Nach oben', 'pfeil', () => verschiebeKnoten(kid, -1), { aus: i === 0, klasse: 'knopf-klein knoten-hoch' }),
        knopf('Nach unten', 'pfeil', () => verschiebeKnoten(kid, 1), { aus: i === ids.length - 1, klasse: 'knopf-klein knoten-runter' }),
        knopf('Schritt entfernen', null, () => entferne(kid), { klasse: 'knopf-klein gefahr' })),
      fortgeschritten('schritt',
        h('div', { class: 'feld' }, h('label', { for: 'schritt-kennung' }, 'Interne Kennung'),
          h('div', { class: 'eingabe-zeile kurz' }, kennungFeld, knopf('Umbenennen', 'stift', () => benenneUm(kid, kennungFeld.value.trim()), { klasse: 'knopf' })),
          h('p', { class: 'feld-hilfe', id: 'schritt-kennung-h' }, frisch.has(kid) ? 'Entsteht aus dem Titel, bis Sie das Szenario speichern. Umbenennen passt alle Verweise an.' : 'Umbenennen passt alle Verweise an.')),
        kid === e.start ? h('p', { class: 'feld-hilfe' }, symbol('karte'), 'Mit diesem Schritt beginnt das Spiel.')
          : k.typ !== 'verzweigung' && k.typ !== 'ende' ? h('div', { class: 'knopfreihe' }, knopf('Als Start festlegen', 'karte', () => { e.start = kid; aenderung({ liste: true, formular: true }); melde('Das Spiel beginnt jetzt mit diesem Schritt.'); })) : null),
      k.typ !== 'verzweigung' ? h('div', { class: 'feldgruppe' },
        feld('Titel', k.titel, setze(k, 'titel'), { pfad: `${p}.titel`, liste: true }),
        kapitelFeld(kid)) : null,
    ];
    // Erst der Inhalt (Text, Frage, Lösung, Wege), dann die Darstellung (Sprechblase, Bild)
    if (k.typ === 'szene') teile.push(...formSzene(k, p));
    if (k.typ === 'aufgabe') teile.push(...formAufgabe(k, p));
    if (k.typ === 'verzweigung') teile.push(...formVerzweigung(k, p));
    if (k.typ === 'ende') {
      teile.push(h('div', { class: 'feldgruppe' },
        feld('Ergebnis', k.ergebnis, setze(k, 'ergebnis'), { auswahl: ERGEBNISSE, pfad: `${p}.ergebnis` }),
        feld('Text am Ende', k.text, setze(k, 'text'), { pfad: `${p}.text`, mehrzeilig: true, zeilen: 4, breit: true })));
    }
    if (k.typ !== 'verzweigung') {
      teile.push(h('section', { class: 'editor-liste' }, h('h3', {}, 'Bild und Figur'),
        feld('Sprechblase der Figur', k.sprechblase, setze(k, 'sprechblase'), { pfad: `${p}.sprechblase`, mehrzeilig: true, zeilen: 2, breit: true }),
        bildFeld(k, 'bild', `${p}.bild`)));
    }
    return teile;
  }

  function formSzene(k, p) {
    return [
      feld('Text der Szene', k.text, setze(k, 'text'), { pfad: `${p}.text`, mehrzeilig: true, zeilen: 5, breit: true, hilfe: hilfeText() }),
      liste('Entscheidungen', k.optionen ??= [], {
        name: 'Möglichkeit', pfad: `${p}.optionen`,
        neu: () => ({ id: freieId('o', k.optionen.map((o) => o.id)), text: '', ziel: k.optionen.at(-1)?.ziel ?? '' }),
        zeichneEintrag: (o, i) => h('div', { class: 'feldgruppe' },
          feld('Text', o.text, (w) => { o.text = w; }, { pfad: `${p}.optionen[${i}].text`, mehrzeilig: true, zeilen: 2, breit: true }),
          feld('Führt zu', o.ziel, (w) => { o.ziel = w; }, { auswahl: zielAuswahl(o.ziel), pfad: `${p}.optionen[${i}].ziel` }),
          feld('Bewertung', o.bewertung ?? '', setze(o, 'bewertung'), { auswahl: BEWERTUNGEN, pfad: `${p}.optionen[${i}].bewertung` }),
          feld('Rückmeldung nach der Wahl', o.rueckmeldung, setze(o, 'rueckmeldung'), { pfad: `${p}.optionen[${i}].rueckmeldung`, mehrzeilig: true, zeilen: 2, breit: true }),
          feld('Lernziel', o.lernziel ?? '', setze(o, 'lernziel'), { auswahl: lernzielAuswahl(), pfad: `${p}.optionen[${i}].lernziel` }),
          feld('Nur anzeigen, wenn', o.bedingung, setze(o, 'bedingung'), { pfad: `${p}.optionen[${i}].bedingung`, formel: true, hilfe: hilfeBedingung() }),
          wirkung(o, 'effekte', `${p}.optionen[${i}].effekte`)),
      }),
    ];
  }

  function mechanikWechsel(k, neuM) {
    for (const f of ['loesung', 'einheit', 'toleranz_prozent', 'toleranz_absolut', 'stellen', 'typische_fehler', 'optionen', 'mehrfach', 'elemente']) delete k[f];
    k.mechanik = neuM;
    if (neuM === 'zahl') Object.assign(k, { loesung: '', einheit: '', toleranz_prozent: 1, typische_fehler: [] });
    if (neuM === 'auswahl') k.optionen = [{ id: 'a', text: '', richtig: true }, { id: 'b', text: '' }];
    if (neuM === 'reihenfolge') k.elemente = [{ id: 's1', text: '' }, { id: 's2', text: '' }, { id: 's3', text: '' }];
  }

  function formAufgabe(k, p) {
    const teile = [
      h('div', { class: 'feldgruppe' },
        feld('Art der Aufgabe', k.mechanik, (w) => mechanikWechsel(k, w), { auswahl: MECHANIKEN, pfad: `${p}.mechanik`, neuZeichnen: true }),
        feld('Frage', k.frage, setze(k, 'frage'), { pfad: `${p}.frage`, mehrzeilig: true, zeilen: 3, breit: true, pflicht: true, hilfe: hilfeText() })),
    ];
    if (k.mechanik === 'zahl') {
      teile.push(h('div', { class: 'feldgruppe' },
        feld('Lösung (Formel)', k.loesung, setze(k, 'loesung'), { pfad: `${p}.loesung`, formel: true, pflicht: true, breit: true, hilfe: hilfeFormel() }),
        feld('Einheit', k.einheit, setze(k, 'einheit'), { pfad: `${p}.einheit` }),
        feld('Toleranz in %', k.toleranz_prozent, setze(k, 'toleranz_prozent'), { art: 'zahl', pfad: `${p}.toleranz_prozent`, hilfe: 'erlaubte Abweichung, meist 1' }),
        feld('Toleranz absolut', k.toleranz_absolut, setze(k, 'toleranz_absolut'), { art: 'zahl', pfad: `${p}.toleranz_absolut` }),
        feld('Nachkommastellen der Lösung', k.stellen, setze(k, 'stellen'), { art: 'ganzzahl', min: 0, max: 6, pfad: `${p}.stellen` })),
      liste('Typische Fehler (gezielte Rückmeldung)', k.typische_fehler ??= [], {
        name: 'Typischer Fehler', pfad: `${p}.typische_fehler`,
        neu: () => ({ formel: '', rueckmeldung: '' }),
        zeichneEintrag: (f, i) => h('div', { class: 'feldgruppe' },
          feld('Formel des Fehlers', f.formel, (w) => { f.formel = w; }, { pfad: `${p}.typische_fehler[${i}].formel`, formel: true, breit: true, hilfe: i === 0 ? hilfeIrrweg() : null }),
          feld('Rückmeldung, wenn die Antwort diesen Fehler trifft', f.rueckmeldung, (w) => { f.rueckmeldung = w; }, { mehrzeilig: true, zeilen: 2, breit: true })),
      }));
    }
    if (k.mechanik === 'auswahl') {
      teile.push(feld('Mehrere Antworten richtig', k.mehrfach, (w) => { if (w) k.mehrfach = true; else delete k.mehrfach; }, { art: 'haken', pfad: `${p}.mehrfach` }),
        liste('Antworten', k.optionen ??= [], {
          name: 'Antwort', pfad: `${p}.optionen`,
          neu: () => ({ id: freieId('x', k.optionen.map((o) => o.id)), text: '' }),
          zeichneEintrag: (o, i) => h('div', { class: 'feldgruppe' },
            feld('Text', o.text, (w) => { o.text = w; }, { pfad: `${p}.optionen[${i}].text`, mehrzeilig: true, zeilen: 2, breit: true }),
            feld('Diese Antwort ist richtig', o.richtig, (w) => { if (w) o.richtig = true; else delete o.richtig; }, { art: 'haken' }),
            feld('Rückmeldung zu dieser Antwort', o.rueckmeldung, setze(o, 'rueckmeldung'), { mehrzeilig: true, zeilen: 2, breit: true })),
        }));
    }
    if (k.mechanik === 'reihenfolge') {
      teile.push(liste('Karten in der richtigen Reihenfolge (angezeigt werden sie gemischt)', k.elemente ??= [], {
        name: 'Karte', pfad: `${p}.elemente`,
        neu: () => ({ id: freieId('s', k.elemente.map((x) => x.id)), text: '' }),
        zeichneEintrag: (x, i) => feld('Text', x.text, (w) => { x.text = w; }, { pfad: `${p}.elemente[${i}].text`, breit: true }),
      }));
    }
    teile.push(
      h('div', { class: 'feldgruppe' },
        feld('Punkte', k.punkte ?? 10, setze(k, 'punkte'), { art: 'ganzzahl', min: 0, pfad: `${p}.punkte` }),
        feld('Versuche', k.versuche ?? 2, setze(k, 'versuche'), { art: 'ganzzahl', min: 1, max: 5, pfad: `${p}.versuche` }),
        feld('Lernziel', k.lernziel ?? '', setze(k, 'lernziel'), { auswahl: lernzielAuswahl(), pfad: `${p}.lernziel` }),
        feld('Weiter zu', k.weiter, setze(k, 'weiter'), { auswahl: zielAuswahl(k.weiter), pfad: `${p}.weiter` }),
        feld('Hinweis (kostet 30 % der Punkte)', k.hinweis, setze(k, 'hinweis'), { pfad: `${p}.hinweis`, mehrzeilig: true, zeilen: 2, breit: true }),
        feld('Rechenweg nach dem Lösen', k.erklaerung, setze(k, 'erklaerung'), { pfad: `${p}.erklaerung`, mehrzeilig: true, zeilen: 3, breit: true }),
        feld('Rückmeldung bei richtig', k.rueckmeldung?.richtig, (w) => { k.rueckmeldung = { ...(k.rueckmeldung ?? {}), richtig: w || undefined }; }, { mehrzeilig: true, zeilen: 2, breit: true }),
        feld('Rückmeldung bei falsch', k.rueckmeldung?.falsch, (w) => { k.rueckmeldung = { ...(k.rueckmeldung ?? {}), falsch: w || undefined }; }, { mehrzeilig: true, zeilen: 2, breit: true })),
      (e.indikatoren ?? []).length ? h('section', { class: 'editor-liste' }, h('h3', {}, 'Wirkung bei richtiger Antwort'), wirkung(k, 'effekte_richtig', `${p}.effekte_richtig`)) : null,
      (e.indikatoren ?? []).length ? h('section', { class: 'editor-liste' }, h('h3', {}, 'Wirkung, wenn die Aufgabe aufgelöst wird'), wirkung(k, 'effekte_falsch', `${p}.effekte_falsch`)) : null);
    return teile;
  }

  function formVerzweigung(k, p) {
    return [
      h('p', { class: 'feld-hilfe' }, 'Eine Verzweigung ist für Studierende unsichtbar: Sie prüft die Regeln von oben nach unten und führt zum ersten Schritt, dessen Bedingung stimmt; sonst zu „Sonst weiter zu“.'),
      liste('Regeln', k.regeln ??= [], {
        name: 'Regel', pfad: `${p}.regeln`,
        neu: () => ({ wenn: '', ziel: k.sonst ?? '' }),
        zeichneEintrag: (r, i) => h('div', { class: 'feldgruppe' },
          feld('Wenn', r.wenn, (w) => { r.wenn = w; }, { pfad: `${p}.regeln[${i}].wenn`, formel: true, hilfe: `z. B. ${namenInFormeln().at(-1) ?? 'sicherheit'} >= 90` }),
          feld('dann weiter zu', r.ziel, (w) => { r.ziel = w; }, { auswahl: zielAuswahl(r.ziel), pfad: `${p}.regeln[${i}].ziel` })),
      }),
      feld('Sonst weiter zu', k.sonst, setze(k, 'sonst'), { auswahl: zielAuswahl(k.sonst), pfad: `${p}.sonst` }),
    ];
  }

  function zeichneFormular() {
    feldNr = 0;
    const teile = auswahl === 'allgemein' ? formAllgemein() : auswahl === 'kapitel' ? formKapitel() : e.knoten[auswahl] ? formKnoten(auswahl) : formAllgemein();
    leere(formular, h('section', { class: 'karte editor-karte' }, teile));
  }

  // --- Prüfen, Vorschau, Speichern --------------------------------------------------------------------------------
  function zeigeStatus() {
    const hoechste = meta.versionen?.[0]?.version ?? 0;
    const quelle = meta.versionen?.[0] ? QUELLE[meta.versionen[0].quelle] ?? meta.versionen[0].quelle : null;
    leere(info, basis
      ? `Geöffnet: Version ${basis}${quelle ? ` (${quelle})` : ''} · Speichern legt Version ${hoechste + 1} an, die bisherigen bleiben erhalten.`
      : `Aus der Vorlage „${vorlageName ?? 'Neu'}“ · Speichern legt Version 1 an.`);
    // Neutral, solange nichts geändert ist: „Gespeichert“ erscheint nur nach einem Speichern in dieser Sitzung
    const [art, zeichen, text] = geaendert ? ['offen', 'stift', 'Ungespeicherte Änderungen']
      : gespeichert ? ['gespeichert', 'richtig', `Version ${gespeichert} gespeichert`]
        : basis ? ['neutral', null, 'Keine Änderungen'] : ['offen', 'stift', 'Noch nicht gespeichert'];
    leere(status, zeichen ? symbol(zeichen) : null, text);
    status.className = `editor-status ${art}`;
  }

  function zeigePruefung(titel) {
    if (!pruefung) return leere(ergebnis);
    const { fehler, warnungen } = klar();
    const zeile = (k) => h('li', {}, h('strong', {}, k.ort), k.feld ? `, ${k.feld}` : '', ': ', k.text, ' ',
      h('button', { type: 'button', class: 'knopf-text', onclick: () => waehle(ortVon(k.pfad), k.pfad) }, 'Zur Stelle', h('span', { class: 'nur-vorlesen' }, `: ${k.ort}${k.feld ? `, ${k.feld}` : ''}`)));
    leere(ergebnis, h('div', { class: `karte pruefergebnis ${fehler.length ? 'mit-fehlern' : 'ohne-fehler'}` },
      h('h2', {}, titel),
      fehler.length === 0 ? h('p', { class: 'gut' }, symbol('richtig'), 'Keine Fehler. Das Szenario lässt sich spielen.') : h('p', { class: 'schlecht' }, `${fehler.length} ${fehler.length === 1 ? 'Fehler' : 'Fehler'}:`),
      fehler.length ? h('ul', {}, fehler.map(zeile)) : null,
      warnungen.length ? h('p', { class: 'neutral' }, `${warnungen.length} ${warnungen.length === 1 ? 'Hinweis' : 'Hinweise'}:`) : null,
      warnungen.length ? h('ul', {}, warnungen.map(zeile)) : null));
  }

  async function pruefe() {
    ordneKennungen();
    try {
      pruefung = await api('POST', '/api/lehrende/szenarien/pruefen', { ...e, version: (meta.versionen?.[0]?.version ?? 0) + 1 });
      zeigePruefung('Ergebnis der Prüfung');
      zeichneAblauf();
      zeichneFormular();
      sage(pruefung.fehler.length ? `${pruefung.fehler.length} Fehler gefunden.` : 'Keine Fehler.');
    } catch (err) { melde(err.message, 'fehler'); }
  }

  async function vorschau() {
    // Fenster sofort öffnen (im Klick), sonst blockiert der Browser es als Pop-up; die Adresse folgt nach der Prüfung
    const fenster = window.open('', '_blank');
    ordneKennungen();
    try {
      const r = await api('POST', '/api/lehrende/vorschau', { szenario: { ...e, version: (meta.versionen?.[0]?.version ?? 0) + 1 } });
      if (fenster) fenster.location.href = r.adresse; else location.assign(r.adresse);
      melde('Vorschau im neuen Tab geöffnet. Gespeichert ist noch nichts.');
    } catch (err) {
      fenster?.close();
      if (err instanceof ApiFehler && err.status === 422) { pruefung = err.daten; zeigePruefung('Vorschau nicht möglich: erst die Fehler beheben'); zeichneAblauf(); zeichneFormular(); fokus(ergebnis.querySelector('h2')); } else melde(err.message, 'fehler');
    }
  }

  async function speichere() {
    ordneKennungen();
    try {
      if (basis === 0) {
        // Neues Szenario: Die interne Kennung entsteht aus dem Titel, eindeutig gegenüber allen vorhandenen
        const vorhanden = (await api('GET', '/api/lehrende/szenarien')).map((s) => s.id);
        e.id = kennung(e.titel, vorhanden, 'lernspiel');
      }
      const r = await api('POST', `/api/lehrende/szenarien/${encodeURIComponent(e.id)}/versionen`, { szenario: e, basis });
      basis = r.version;
      e.version = r.version;
      geaendert = false;
      gespeichert = r.version;
      frisch.clear();
      pruefung = { fehler: [], warnungen: r.warnungen ?? [] };
      meta = { ...meta, ...(await api('GET', `/api/lehrende/szenarien/${encodeURIComponent(e.id)}`)) };
      if (neu) history.replaceState(null, '', `#editor/${encodeURIComponent(e.id)}`);
      zeigeStatus();
      zeigePruefung(`Version ${r.version} gespeichert`);
      zeichneAblauf();
      zeichneFormular();
      melde(`Version ${r.version} gespeichert.${r.version > 1 ? ` Version ${r.version - 1} bleibt erhalten.` : ''}`);
    } catch (err) {
      if (err instanceof ApiFehler && (err.status === 422 || err.status === 409) && err.daten?.fehler) {
        pruefung = err.daten;
        zeigePruefung(err.status === 409 ? 'Nicht gespeichert' : 'Nicht gespeichert: erst die Fehler beheben');
        zeichneAblauf();
        zeichneFormular();
        fokus(ergebnis.querySelector('h2'));
      } else melde(err.message, 'fehler');
    }
  }

  function herunterladen() {
    ordneKennungen();
    const a = h('a', { href: URL.createObjectURL(new Blob([JSON.stringify(e, null, 2)], { type: 'application/json' })), download: `${e.id}-entwurf.json` });
    a.click();
  }

  // --- Aufbau -----------------------------------------------------------------------------------------------------
  const titel = h('h1', {}, neu ? 'Neues Szenario' : 'Szenario bearbeiten');
  leere(inhalt,
    h('div', { class: 'editor-kopf' },
      h('p', { class: 'chips' }, h('a', { class: 'chip', href: '#szenarien' }, symbol('pfeil'), 'Zurück zu den Szenarien')),
      titel, info,
      h('div', { class: 'editor-werkzeuge', role: 'toolbar', 'aria-label': 'Szenario' },
        knopf('Prüfen', 'richtig', pruefe, { klasse: 'knopf' }),
        knopf('Vorschau im neuen Tab', 'karte', vorschau, { klasse: 'knopf' }),
        knopf('Als neue Version speichern', 'herunterladen', speichere, { klasse: 'knopf knopf-haupt' }),
        status)),
    ergebnis,
    h('div', { class: 'editor' }, ablauf, formular));
  // Ein neues Szenario öffnet beim ersten Schritt, ein vorhandenes bei „Allgemein“
  if (neu) auswahl = e.start;
  zeigeStatus();
  zeichneAblauf();
  zeichneFormular();
  fokus(titel);

  return { ungespeichert: () => geaendert || basis === 0 };
}
