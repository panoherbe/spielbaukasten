// Kurze Töne für Rückmeldungen, erzeugt mit der Web Audio API: keine Tondateien, also keine Lizenzfragen und nichts
// zu laden. Voreinstellung: aus. Ein Ton ist nie das einzige Signal; dieselbe Rückmeldung steht immer als Text und
// Zeichen da. Wer den Ton einschaltet, behält die Einstellung (online beim Pseudonym, offline auf dem Gerät).
//
//   richtig      zwei aufsteigende Töne (richtige Antwort, gute Entscheidung)
//   falsch       ein tiefer, fallender Ton (falsche Antwort, riskante Entscheidung)
//   entscheidung ein kurzer Klick (Entscheidung ohne Bewertung, Stimme im Team abgegeben)
//   szene        ein leiser Zweiklang (neue Szene)

import { h } from './ui.js';
import { symbol } from './symbole.js';

const KLAENGE = {
  richtig: [{ f: 660, t: 0, d: 0.12 }, { f: 880, t: 0.11, d: 0.2 }],
  falsch: [{ f: 220, f2: 165, t: 0, d: 0.32, form: 'triangle' }],
  entscheidung: [{ f: 520, t: 0, d: 0.07 }],
  szene: [{ f: 392, t: 0, d: 0.34, leise: 0.5 }, { f: 587, t: 0.05, d: 0.32, leise: 0.5 }],
};

let an = false;
let kontext = null;
/** Was gespielt werden sollte, in Reihenfolge (für den Browsertest; der Ton selbst ist nicht messbar). */
export const tonProtokoll = [];

function audio() {
  const AC = globalThis.AudioContext ?? globalThis.webkitAudioContext;
  if (!AC) return null;
  kontext ??= new AC();
  if (kontext.state === 'suspended') kontext.resume().catch(() => {});
  return kontext;
}

export function tonAn() { return an; }

/** Ein- oder ausschalten. Der Audio-Kontext entsteht erst beim ersten Ton, also nach einem Klick (Regel der Browser). */
export function setzeTon(wert) {
  an = Boolean(wert);
}

export function spieleTon(art) {
  if (!an || !KLAENGE[art]) return;
  tonProtokoll.push(art);
  const ac = audio();
  if (!ac) return;
  const t0 = ac.currentTime + 0.01;
  for (const k of KLAENGE[art]) {
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = k.form ?? 'sine';
    osc.frequency.setValueAtTime(k.f, t0 + k.t);
    if (k.f2) osc.frequency.exponentialRampToValueAtTime(k.f2, t0 + k.t + k.d);
    const laut = 0.16 * (k.leise ?? 1);
    gain.gain.setValueAtTime(0.0001, t0 + k.t);
    gain.gain.exponentialRampToValueAtTime(laut, t0 + k.t + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + k.t + k.d);
    osc.connect(gain).connect(ac.destination);
    osc.start(t0 + k.t);
    osc.stop(t0 + k.t + k.d + 0.02);
  }
}

/** Schalter „Ton“ für die Kopfzeile (aria-pressed trägt den Zustand); `speichere(wert)` hält die Einstellung fest. */
export function tonSchalter(speichere) {
  const knopf = h('button', { type: 'button', class: 'ton-schalter', 'aria-pressed': String(an) });
  const zeichne = () => {
    knopf.setAttribute('aria-pressed', String(an));
    knopf.title = an ? 'Ton ist an' : 'Ton ist aus';
    knopf.replaceChildren(symbol(an ? 'ton-an' : 'ton-aus'), 'Ton');
  };
  knopf.addEventListener('click', async () => {
    setzeTon(!an);
    zeichne();
    if (an) spieleTon('entscheidung');
    try { await speichere?.(an); } catch { /* Einstellung bleibt für diese Seite */ }
  });
  zeichne();
  return knopf;
}
