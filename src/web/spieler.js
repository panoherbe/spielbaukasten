// Der Spieler zeigt eine Ansicht (src/engine/ansicht.js) und meldet Entscheidungen und Antworten an ein „Backend“
// zurück. Online ist das der Server, im OER-Export die Engine im Browser. Der Spieler selbst kennt keine Lösungen.
//
//   spieler(element, { sende(ereignis) → Promise<Ansicht>, neu() → Promise<Ansicht>, medienUrl(datei), grafikUrl(name), uebersicht() })
//
// Jede Ansicht hat denselben Aufbau: oben die Spielanzeige (Punkte, Indikatoren, Kapitelkarte), darunter die Bühne
// mit großem Bild und daneben Text, Figur und Handlung. Änderungen an Indikatoren und Punkten steigen als „+20 %“
// auf; mit „Bewegung reduzieren“ stehen sie still neben dem Wert.

import { h, textBloecke, zahl, leere, fokus, melde, bewegung } from './ui.js';
import { symbol, ring, sterne } from './symbole.js';
import { DARSTELLUNGEN } from './mechaniken/index.js';

const ERGEBNIS = {
  erfolg: { titel: 'Geschafft', klasse: 'gut', zeichen: 'richtig', stimmung: 'zufrieden' },
  teilerfolg: { titel: 'Teilweise geschafft', klasse: 'neutral', zeichen: 'vertretbar', stimmung: 'vertretbar' },
  misserfolg: { titel: 'Nicht geschafft', klasse: 'schlecht', zeichen: 'falsch', stimmung: 'besorgt' },
};
const RUECKMELDUNG = {
  richtig: { titel: 'Richtig', klasse: 'gut', zeichen: 'richtig', stimmung: 'zufrieden' },
  aufgeloest: { titel: 'Die Lösung', klasse: 'schlecht', zeichen: 'falsch', stimmung: 'besorgt' },
  gut: { titel: 'Gute Entscheidung', klasse: 'gut', zeichen: 'richtig', stimmung: 'zufrieden' },
  neutral: { titel: 'Vertretbar', klasse: 'neutral', zeichen: 'vertretbar', stimmung: 'vertretbar' },
  schlecht: { titel: 'Riskant', klasse: 'schlecht', zeichen: 'falsch', stimmung: 'besorgt' },
};
const STUFE = { sicher: ['sicher', 'richtig'], mit_hilfe: ['mit Hilfe', 'hinweis'], offen: ['noch offen', 'falsch'], nicht_geprueft: ['nicht geprüft', 'anzeige'] };
const KAPITEL_STAND = { erledigt: 'erledigt', aktuell: 'aktuelles Kapitel', offen: 'noch offen' };
const BUCHSTABEN = 'ABCDEFGH';
const fehlt = (e) => e.target.classList.add('fehlt'); // fehlendes Bild: Platz bleibt, kein kaputtes Symbol

export function spieler(wurzel, backend) {
  let a = null;
  let beschaeftigt = false;
  let zuletzt = null; // Punkte und Indikatoren der zuletzt gezeigten Anzeige; daraus entstehen die Änderungen
  let letztesBild = null; // Bild des zuletzt gezeigten Knotens: Die Rückmeldung erscheint vor dieser Szene
  const grafikUrl = backend.grafikUrl ?? ((name) => `/bilder/${name}.svg`);

  async function schritt(ereignis) {
    if (beschaeftigt) return;
    beschaeftigt = true;
    wurzel.setAttribute('aria-busy', 'true');
    try {
      const neu = await backend.sende({ ...ereignis, knoten: a.knoten.id });
      const alterKnoten = a.knoten.id;
      letztesBild = a.knoten.bild;
      a = neu;
      const r = a.rueckmeldung;
      if (r && (r.art === 'falsch' || r.art === 'ungueltig') && a.knoten.id === alterKnoten) zeigeHinweisInline(r);
      else if (r) zeigeRueckmeldung(r);
      else zeigeKnoten({ ruhig: a.knoten.id === alterKnoten });
    } catch (e) {
      melde(e.message || 'Das hat nicht geklappt. Bitte erneut versuchen.', 'fehler');
    } finally {
      beschaeftigt = false;
      wurzel.removeAttribute('aria-busy');
    }
  }

  // --- Spielanzeige -----------------------------------------------------------------------------------------------
  function aenderung(d, einheit = '') {
    if (!d) return null;
    const text = `${d > 0 ? '+' : '−'}${zahl(Math.abs(d))}${einheit ? ' ' + einheit : ''}`;
    return h('span', { class: `delta ${d > 0 ? 'plus' : 'minus'}`, 'data-text': text }, text);
  }

  function indikator(i, vorher) {
    const anteil = (w) => Math.round(((w - i.min) / (i.max - i.min || 1)) * 100);
    const d = vorher === undefined ? 0 : i.wert - vorher;
    const p = anteil(i.wert);
    const wert = `${zahl(i.wert, 0)}${i.einheit ? ' ' + i.einheit : ''}`;
    return h('li', { class: 'indikator', 'data-indikator': i.id },
      h('span', { class: 'indikator-symbol' }, symbol(i.symbol ?? 'anzeige')),
      h('span', { class: 'indikator-name', id: `ind-${i.id}` }, i.name),
      h('span', { class: 'indikator-wert' }, wert, aenderung(d, i.einheit)),
      h('span', { class: 'balken', role: 'meter', 'aria-labelledby': `ind-${i.id}`, 'aria-valuemin': i.min, 'aria-valuemax': i.max, 'aria-valuenow': i.wert, 'aria-valuetext': wert },
        h('span', { class: `balken-fuellung ${p < 34 ? 'tief' : p < 67 ? 'mittel' : 'hoch'}`, 'data-anteil': p, 'data-vorher': d ? anteil(vorher) : null })));
  }

  function kapitelkarte(liste) {
    return h('ol', { class: 'route', 'aria-label': 'Kapitel' }, liste.map((k, i) => h('li', { class: `route-punkt ${k.stand}`, 'aria-current': k.stand === 'aktuell' ? 'step' : null },
      h('span', { class: 'route-marke', 'aria-hidden': 'true' }, k.stand === 'erledigt' ? symbol('richtig') : String(i + 1)),
      h('span', { class: 'route-name' }, k.titel),
      h('span', { class: 'nur-vorlesen' }, `: ${KAPITEL_STAND[k.stand]}`))));
  }

  function anzeige() {
    const vorher = zuletzt;
    zuletzt = { punkte: a.punkte, werte: Object.fromEntries(a.indikatoren.map((i) => [i.id, i.wert])) };
    return h('section', { class: `anzeige${a.indikatoren.length ? '' : ' ohne-indikatoren'}`, 'aria-label': 'Spielstand' },
      h('div', { class: 'anzeige-kopf' },
        h('p', { class: 'anzeige-titel' }, symbol('karte'), a.szenario.titel),
        h('p', { class: 'anzeige-stand' },
          h('span', {}, `Schritt ${a.schritte + 1}`),
          h('span', {}, symbol('punkte'), h('strong', {}, zahl(a.punkte)), a.maxPunkte ? ` / ${zahl(a.maxPunkte)} Punkte` : ' Punkte', aenderung(vorher ? a.punkte - vorher.punkte : 0)))),
      a.indikatoren.length ? h('ul', { class: 'indikatoren', 'aria-label': 'Lage' }, a.indikatoren.map((i) => indikator(i, vorher?.werte[i.id]))) : null,
      a.kapitel?.length ? kapitelkarte(a.kapitel) : null);
  }

  function animiere() {
    // Breiten per CSSOM statt style-Attribut, damit die Content-Security-Policy ohne 'unsafe-inline' auskommt. Mit
    // Vorwert beginnt ein Balken beim alten Stand und läuft sichtbar zum neuen.
    const los = (fn) => (bewegung() ? requestAnimationFrame(() => requestAnimationFrame(fn)) : fn());
    const balken = [...wurzel.querySelectorAll('.balken-fuellung')];
    const wandern = bewegung() ? balken.filter((el) => el.dataset.vorher !== undefined) : [];
    for (const el of balken) el.style.width = `${wandern.includes(el) ? el.dataset.vorher : el.dataset.anteil}%`;
    if (wandern.length) los(() => wandern.forEach((el) => { el.style.width = `${el.dataset.anteil}%`; }));
    const boegen = [...wurzel.querySelectorAll('.ring-bogen')];
    if (boegen.length) los(() => boegen.forEach((el) => { el.style.strokeDashoffset = String(100 - Number(el.dataset.anteil) * 100); }));
  }

  // --- Bühne ------------------------------------------------------------------------------------------------------
  function kapitelMarke() {
    const i = (a.kapitel ?? []).findIndex((k) => k.stand === 'aktuell');
    return i < 0 ? null : h('p', { class: 'kapitel-marke' }, `Kapitel ${i + 1} · ${a.kapitel[i].titel}`);
  }

  /**
   * Links das Bild (Überschrift darauf, außer bei Skizzen) und darunter die Figur mit Sprechblase, rechts Text und
   * Handlung, `unten` über die ganze Breite. Auf schmalen Bildschirmen steht alles untereinander.
   */
  function buehne(attrs, b, ueberschrift, { figur = null, inhalt, unten = null, bildflaeche = null }) {
    const aufBild = b && !b.skizze;
    return h('article', { ...attrs, class: `karte buehne ${attrs.class ?? ''}${b || bildflaeche ? '' : ' ohne-bild'}` },
      bildflaeche ?? (b ? h('div', { class: `buehne-bild${b.skizze ? ' skizze' : ''}` }, h('div', { class: 'bild-rahmen' },
        aufBild ? h('div', { class: 'buehne-ueberschrift' }, ueberschrift) : null,
        h('img', { src: backend.medienUrl(b.datei), alt: b.alt, decoding: 'async', onerror: fehlt }))) : null),
      figur,
      h('div', { class: 'buehne-text' }, aufBild ? null : h('div', { class: 'buehne-kopf' }, ueberschrift), inhalt),
      unten);
  }

  function sprechzeile(text, stimmung = '') {
    if (!text) return null;
    const f = a.szenario.figur;
    const b = f && ({ zufrieden: f.zufrieden, besorgt: f.besorgt }[stimmung] ?? f.bild);
    return h('div', { class: `sprechzeile${b ? '' : ' ohne-figur'}` },
      b ? h('img', { class: 'figur', src: backend.medienUrl(b.datei), alt: '', onerror: fehlt }) : null,
      h('div', { class: `sprechblase ${stimmung}` }, f ? h('span', { class: 'sprecher' }, f.name) : null, textBloecke(text)));
  }

  function zeigeKnoten({ ruhig = false } = {}) {
    if (a.beendet) return zeigeEnde();
    const k = a.knoten;
    const titel = h('h2', { class: 'szenen-titel' }, k.titel ?? '');
    let interaktion;
    if (k.typ === 'szene') {
      interaktion = h('div', { class: 'optionen', role: 'group', 'aria-label': 'Ihre Entscheidung' },
        k.optionen.map((o, i) => h('button', { class: 'knopf knopf-option', type: 'button', 'data-option': o.id, onclick: () => schritt({ typ: 'wahl', option: o.id }) },
          h('span', { class: 'option-buchstabe', 'aria-hidden': 'true' }, BUCHSTABEN[i] ?? '•'), h('span', {}, o.text), symbol('pfeil'))));
    } else if (k.typ === 'aufgabe') {
      const darstellung = DARSTELLUNGEN[k.mechanik];
      interaktion = h('div', { class: 'aufgabe' },
        h('div', { class: 'frage' }, textBloecke(k.frage)),
        darstellung ? darstellung.zeige(k, (antwort) => schritt({ typ: 'antwort', antwort })) : h('p', {}, `Mechanik „${k.mechanik}“ wird hier nicht unterstützt.`),
        h('div', { class: 'aufgabe-fuss' },
          h('span', { class: 'gedaempft' }, symbol('punkte'), `${k.punkte} Punkte · noch ${k.versucheUebrig} ${k.versucheUebrig === 1 ? 'Versuch' : 'Versuche'}`),
          k.hinweisVerfuegbar ? h('button', { type: 'button', class: 'knopf-text', onclick: () => schritt({ typ: 'hinweis' }) }, symbol('hinweis'), 'Hinweis (kostet 30 % der Punkte)') : null),
        k.hinweis ? h('aside', { class: 'hinweis', 'aria-label': 'Hinweis' }, symbol('hinweis'), h('div', {}, h('strong', {}, 'Hinweis: '), k.hinweis)) : null,
        h('div', { class: 'inline-rueckmeldung', 'aria-live': 'assertive' }));
    }
    leere(wurzel, anzeige(), buehne({ class: `szene${ruhig ? ' ruhig' : ''}`, 'data-knoten': k.id, 'data-typ': k.typ, 'data-mechanik': k.mechanik }, k.bild, [kapitelMarke(), titel], {
      figur: sprechzeile(k.sprechblase),
      inhalt: [k.text ? h('div', { class: 'szenen-text' }, textBloecke(k.text)) : null, interaktion],
    }));
    animiere();
    if (k.typ !== 'aufgabe' || k.mechanik !== 'zahl') fokus(titel);
  }

  function zeigeHinweisInline(r) {
    // Neu zeichnen (Versuchszähler, ggf. Hinweis), Eingabe bleibt stehen; Rückmeldung unter der Aufgabe
    const vorher = wurzel.querySelector('.zahlfeld')?.value;
    zeigeKnoten({ ruhig: true });
    const feld = wurzel.querySelector('.zahlfeld');
    if (feld && vorher !== undefined) feld.value = vorher;
    const box = wurzel.querySelector('.inline-rueckmeldung');
    const falsch = r.art === 'falsch';
    if (box) leere(box, h('div', { class: `rueckmeldung-inline ${falsch ? 'schlecht' : 'neutral'}` },
      h('span', { class: 'zeichen', 'aria-hidden': 'true' }, symbol(falsch ? 'falsch' : 'hinweis')),
      h('div', {}, h('strong', {}, falsch ? 'Noch nicht richtig. ' : ''), r.text ?? '')));
    feld?.focus();
  }

  function zeigeRueckmeldung(r) {
    const art = RUECKMELDUNG[r.art] ?? RUECKMELDUNG.neutral;
    const titel = h('h2', { class: 'rueckmeldung-titel' }, h('span', { class: 'zeichen', 'aria-hidden': 'true' }, symbol(art.zeichen)),
      r.art === 'richtig' && r.versuch > 1 ? 'Richtig im zweiten Versuch' : art.titel);
    const effekte = Object.entries(r.effekte ?? {}).filter(([, d]) => d !== 0);
    const ind = Object.fromEntries(a.indikatoren.map((i) => [i.id, i]));
    const b = letztesBild;
    leere(wurzel, anzeige(), buehne({ class: `rueckmeldung ${art.klasse}`, 'data-typ': 'rueckmeldung' }, null, titel, {
      bildflaeche: h('div', { class: `buehne-bild${b ? '' : ' ohne'}` },
        h('div', { class: 'bild-rahmen' }, b ? h('img', { src: backend.medienUrl(b.datei), alt: '', onerror: fehlt }) : null),
        h('div', { class: 'emblem-flaeche', 'aria-hidden': 'true' },
          h('div', { class: 'emblem' }, symbol(art.zeichen), art.klasse === 'gut' ? h('span', { class: 'funken' }, Array.from({ length: 12 }, () => h('i'))) : null))),
      inhalt: [
        sprechzeile(r.text, art.stimmung),
        r.loesung ? h('p', { class: 'loesung' }, h('strong', {}, 'Richtige Antwort: '), r.loesung) : null,
        r.erklaerung ? h('div', { class: 'erklaerung' }, h('strong', {}, 'Rechenweg: '), textBloecke(r.erklaerung)) : null,
        effekte.length ? h('ul', { class: 'effekte', 'aria-label': 'Auswirkungen' }, effekte.map(([id, d]) => h('li', { class: d > 0 ? 'plus' : 'minus' },
          symbol(ind[id]?.symbol ?? 'anzeige'), `${ind[id]?.name ?? id} ${d > 0 ? '+' : '−'}${zahl(Math.abs(d), 0)}${ind[id]?.einheit ? ' ' + ind[id].einheit : ''}`))) : null,
        h('button', { class: 'knopf knopf-haupt weiter', type: 'button', onclick: () => { a = { ...a, rueckmeldung: null }; zeigeKnoten(); } }, a.beendet ? 'Zum Ergebnis' : 'Weiter', symbol('pfeil'))],
    }));
    animiere();
    fokus(titel);
  }

  function zeigeEnde() {
    const k = a.knoten;
    const e = ERGEBNIS[a.ergebnis] ?? ERGEBNIS.teilerfolg;
    const titel = h('h2', { class: 'szenen-titel' }, k.titel ?? e.titel);
    const quote = a.maxPunkte ? a.punkte / a.maxPunkte : 1;
    const liste = a.auszeichnungen ?? [];
    const unten = h('div', { class: 'ende-unten' },
      liste.length ? h('section', { class: 'auszeichnungen' },
        h('h3', {}, symbol('auszeichnung'), `Auszeichnungen: ${liste.filter((x) => x.erreicht).length} von ${liste.length}`),
        h('ul', {}, liste.map((x) => h('li', { class: `auszeichnung ${x.erreicht ? 'erreicht' : 'offen'}` },
          h('img', { src: grafikUrl(`auszeichnung-${x.id}`), alt: '' }),
          h('span', { class: 'auszeichnung-titel' }, x.titel),
          h('span', { class: 'auszeichnung-text' }, x.text),
          h('span', { class: 'auszeichnung-stand' }, symbol(x.erreicht ? 'richtig' : 'schloss'), x.erreicht ? 'erreicht' : 'noch nicht'))))) : null,
      a.lernziele?.length ? h('section', { class: 'lernziele' }, h('h3', {}, symbol('ziel'), 'Ihre Lernziele'),
        h('ul', {}, a.lernziele.map((lz) => h('li', { class: `lernziel stufe-${lz.stufe}` },
          h('span', { class: 'lernziel-text' }, lz.text),
          h('span', { class: 'stufe' }, symbol(STUFE[lz.stufe]?.[1] ?? 'anzeige'), STUFE[lz.stufe]?.[0] ?? lz.stufe),
          h('span', { class: 'stufenleiste', 'aria-hidden': 'true' }, h('i'), h('i'), h('i')))))) : null);
    leere(wurzel, anzeige(), buehne({ class: `ende ${e.klasse}`, 'data-typ': 'ende', 'data-ergebnis': a.ergebnis }, k.bild,
      [h('p', { class: `ergebnis-band ${e.klasse}` }, symbol(e.zeichen), e.titel), titel], {
      figur: sprechzeile(k.sprechblase, e.stimmung),
      inhalt: [
        h('div', { class: 'wertung' },
          h('div', {}, sterne(a.sterne ?? 0, 'gross'), h('p', { class: 'wertung-text' }, `${a.sterne ?? 0} von 3 Sternen`)),
          h('div', { class: 'punkte-block' }, ring(quote),
            h('p', { class: 'punkte-gross' }, `${zahl(a.punkte)} von ${zahl(a.maxPunkte)} Punkten`, h('small', {}, `${zahl(quote * 100, 0)} % der Punkte`)))),
        k.text ? h('div', { class: 'szenen-text' }, textBloecke(k.text)) : null,
        h('div', { class: 'knopfreihe' },
          h('button', { class: 'knopf knopf-haupt', type: 'button', onclick: async () => { a = await backend.neu(); zuletzt = null; letztesBild = null; zeigeKnoten(); } }, symbol('nochmal'), 'Noch einmal spielen'),
          backend.uebersicht ? h('button', { class: 'knopf', type: 'button', onclick: () => backend.uebersicht() }, symbol('uebersicht'), 'Zur Übersicht') : null)],
      unten,
    }));
    animiere();
    fokus(titel);
  }

  return {
    zeige(ansicht) { a = ansicht; zuletzt = null; zeigeKnoten(); },
  };
}
