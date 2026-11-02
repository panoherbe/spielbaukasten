// Sichere Formelauswertung für Lösungen, Bedingungen und Textbausteine.
//
// Szenarien sind Daten, kein Code: Lehrende schreiben Formeln wie `F / (2 * sind(theta))` oder Bedingungen wie
// `sicherheit >= 70 && budget > 0`. Diese Datei zerlegt und rechnet solche Ausdrücke ohne `eval`, ohne Zugriff
// auf JavaScript-Objekte und mit festem Funktionsumfang. Läuft im Browser und auf dem Server.

const FUNKTIONEN = {
  sin: Math.sin, cos: Math.cos, tan: Math.tan,
  asin: Math.asin, acos: Math.acos, atan: Math.atan,
  // Winkelfunktionen in Grad, wie in Ingenieuraufgaben üblich
  sind: (x) => Math.sin((x * Math.PI) / 180),
  cosd: (x) => Math.cos((x * Math.PI) / 180),
  tand: (x) => Math.tan((x * Math.PI) / 180),
  sqrt: Math.sqrt, abs: Math.abs, ln: Math.log, log10: Math.log10, exp: Math.exp,
  min: Math.min, max: Math.max,
  runde: (x, n = 0) => { const f = 10 ** n; return Math.round(x * f) / f; },
};
const KONSTANTEN = { pi: Math.PI, e: Math.E, wahr: 1, falsch: 0 };

// Bindungsstärke der zweistelligen Operatoren (höher bindet stärker)
const BINDUNG = { '||': 1, '&&': 2, '==': 3, '!=': 3, '<': 4, '<=': 4, '>': 4, '>=': 4, '+': 5, '-': 5, '*': 6, '/': 6, '%': 6, '^': 8 };

export class AusdruckFehler extends Error {}

function zerlege(text) {
  const marken = [];
  let i = 0;
  while (i < text.length) {
    const c = text[i];
    if (/\s/.test(c)) { i++; continue; }
    if (/[0-9.]/.test(c)) {
      const m = /^(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/.exec(text.slice(i));
      if (!m) throw new AusdruckFehler(`Zahl an Stelle ${i + 1} nicht lesbar`);
      marken.push({ art: 'zahl', wert: Number(m[0]) });
      i += m[0].length;
      continue;
    }
    if (/[A-Za-z_äöüÄÖÜß]/.test(c)) {
      const m = /^[A-Za-z_äöüÄÖÜß][A-Za-z0-9_äöüÄÖÜß]*/.exec(text.slice(i));
      marken.push({ art: 'name', wert: m[0] });
      i += m[0].length;
      continue;
    }
    const zwei = text.slice(i, i + 2);
    if (['<=', '>=', '==', '!=', '&&', '||'].includes(zwei)) { marken.push({ art: 'op', wert: zwei }); i += 2; continue; }
    if ('+-*/%^<>!(),'.includes(c)) { marken.push({ art: 'op', wert: c }); i++; continue; }
    throw new AusdruckFehler(`Unbekanntes Zeichen „${c}“ an Stelle ${i + 1}`);
  }
  return marken;
}

/** Zerlegt einen Ausdruck in einen Baum. Wirft AusdruckFehler mit verständlicher Meldung. */
export function parse(text) {
  if (typeof text !== 'string' || !text.trim()) throw new AusdruckFehler('Ausdruck ist leer');
  const marken = zerlege(text);
  let pos = 0;
  const sieh = () => marken[pos];
  const nimm = (op) => {
    const m = marken[pos];
    if (!m || m.wert !== op) throw new AusdruckFehler(`„${op}“ erwartet${m ? `, „${m.wert}“ gefunden` : ' am Ende'}`);
    pos++;
  };

  function einfach() {
    const m = marken[pos++];
    if (!m) throw new AusdruckFehler('Ausdruck endet unerwartet');
    if (m.art === 'zahl') return { art: 'zahl', wert: m.wert };
    if (m.art === 'name') {
      if (sieh()?.wert === '(') {
        pos++;
        if (!(m.wert in FUNKTIONEN)) throw new AusdruckFehler(`Unbekannte Funktion „${m.wert}“`);
        const args = [];
        if (sieh()?.wert !== ')') {
          args.push(ausdruck(0));
          while (sieh()?.wert === ',') { pos++; args.push(ausdruck(0)); }
        }
        nimm(')');
        return { art: 'aufruf', name: m.wert, args };
      }
      return { art: 'name', name: m.wert };
    }
    if (m.wert === '(') { const k = ausdruck(0); nimm(')'); return k; }
    if (m.wert === '-' || m.wert === '!' || m.wert === '+') return { art: 'einstellig', op: m.wert, arg: ausdruck(7) };
    throw new AusdruckFehler(`„${m.wert}“ an dieser Stelle nicht erwartet`);
  }

  function ausdruck(minimum) {
    let links = einfach();
    for (;;) {
      const m = sieh();
      if (!m || m.art !== 'op' || !(m.wert in BINDUNG)) break;
      const b = BINDUNG[m.wert];
      if (b < minimum) break;
      pos++;
      // ^ ist rechtsassoziativ, alles andere linksassoziativ
      const rechts = ausdruck(m.wert === '^' ? b : b + 1);
      links = { art: 'zweistellig', op: m.wert, links, rechts };
    }
    return links;
  }

  const baum = ausdruck(0);
  if (pos < marken.length) throw new AusdruckFehler(`Unerwartet: „${marken[pos].wert}“`);
  return baum;
}

/** Namen, die ein Ausdruck verwendet (ohne Funktionen und Konstanten); für die Prüfung von Szenarien. */
export function namen(baum, gefunden = new Set()) {
  if (baum.art === 'name' && !(baum.name in KONSTANTEN)) gefunden.add(baum.name);
  if (baum.args) baum.args.forEach((a) => namen(a, gefunden));
  if (baum.arg) namen(baum.arg, gefunden);
  if (baum.links) { namen(baum.links, gefunden); namen(baum.rechts, gefunden); }
  return gefunden;
}

function rechne(k, werte) {
  switch (k.art) {
    case 'zahl': return k.wert;
    case 'name':
      if (k.name in KONSTANTEN) return KONSTANTEN[k.name];
      if (!Object.hasOwn(werte, k.name)) throw new AusdruckFehler(`Unbekannter Name „${k.name}“`);
      return Number(werte[k.name]);
    case 'aufruf': return FUNKTIONEN[k.name](...k.args.map((a) => rechne(a, werte)));
    case 'einstellig': {
      const x = rechne(k.arg, werte);
      return k.op === '-' ? -x : k.op === '!' ? Number(!x) : x;
    }
    default: {
      const a = rechne(k.links, werte);
      if (k.op === '&&') return a ? Number(Boolean(rechne(k.rechts, werte))) : 0;
      if (k.op === '||') return a ? 1 : Number(Boolean(rechne(k.rechts, werte)));
      const b = rechne(k.rechts, werte);
      switch (k.op) {
        case '+': return a + b; case '-': return a - b; case '*': return a * b; case '/': return a / b;
        case '%': return a % b; case '^': return a ** b;
        case '<': return Number(a < b); case '<=': return Number(a <= b);
        case '>': return Number(a > b); case '>=': return Number(a >= b);
        case '==': return Number(Math.abs(a - b) < 1e-9); case '!=': return Number(Math.abs(a - b) >= 1e-9);
      }
    }
  }
  throw new AusdruckFehler('Interner Fehler');
}

const cache = new Map();

/** Rechnet einen Ausdruck mit den gegebenen Werten aus. */
export function berechne(text, werte = {}) {
  let baum = cache.get(text);
  if (!baum) { baum = parse(text); cache.set(text, baum); }
  const x = rechne(baum, werte);
  if (!Number.isFinite(x)) throw new AusdruckFehler(`Ergebnis von „${text}“ ist keine endliche Zahl`);
  return x;
}

/** Zahl im deutschen Format, z. B. 28,28 */
export function formatiereZahl(x, stellen = 2) {
  const gerundet = Number(x.toFixed(stellen));
  return gerundet.toLocaleString('de-DE', { maximumFractionDigits: stellen });
}

/**
 * Setzt Werte in Text ein: `{F}` → Parameterwert, `{= F / 2 : 1}` → Formel, auf 1 Stelle gerundet.
 * Unbekannte Platzhalter bleiben stehen, damit Fehler im Szenario sichtbar werden.
 */
export function fuelleText(text, werte) {
  return String(text).replace(/\{(=?)\s*([^{}:]+?)\s*(?::\s*(\d))?\s*\}/g, (ganz, istFormel, inhalt, stellen) => {
    try {
      if (istFormel) return formatiereZahl(berechne(inhalt, werte), stellen === undefined ? 2 : Number(stellen));
      if (Object.hasOwn(werte, inhalt)) {
        const w = werte[inhalt];
        return typeof w === 'number' ? formatiereZahl(w, stellen === undefined ? 2 : Number(stellen)) : String(w);
      }
    } catch { /* bleibt sichtbar stehen */ }
    return ganz;
  });
}
