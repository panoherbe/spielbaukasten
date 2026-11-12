// Symbole der Oberfläche (24 × 24, Linien in currentColor). Sie stehen direkt in der Seite: Sie übernehmen so die
// Textfarbe des hellen und des dunklen Schemas, und die Offline-Fassung braucht keine weiteren Dateien.
// Szenarien wählen für Indikatoren eines der Symbole aus INDIKATOR_SYMBOLE (src/engine/szenario.js).

export const SYMBOLE = {
  sicherheit: '<path d="M12 3 5 6v5.5c0 4.4 2.9 7.9 7 9.5 4.1-1.6 7-5.1 7-9.5V6z"/><path d="m9 12 2.2 2.2L15.5 10"/>',
  budget: '<ellipse cx="12" cy="6.5" rx="7" ry="3"/><path d="M5 6.5v5c0 1.7 3.1 3 7 3s7-1.3 7-3v-5"/><path d="M5 11.5v5c0 1.7 3.1 3 7 3s7-1.3 7-3v-5"/>',
  tage: '<rect x="4" y="5" width="16" height="15" rx="2.5"/><path d="M4 10h16M8.5 3v4M15.5 3v4M8 14h2M14 14h2M8 17h2"/>',
  anzeige: '<path d="M4 16a8 8 0 0 1 16 0"/><path d="m12 16 3.5-4.5"/>',
  punkte: '<path d="m12 3.5 2.6 5.3 5.8.8-4.2 4.1 1 5.8L12 16.8l-5.2 2.7 1-5.8-4.2-4.1 5.8-.8z"/>',
  stern: '<path fill="currentColor" stroke="none" d="m12 2.2 2.95 6 6.6.96-4.78 4.65 1.13 6.57L12 17.27l-5.9 3.1 1.13-6.57-4.78-4.65 6.6-.96z"/>',
  karte: '<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>',
  hinweis: '<path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-3.6 10.8c.8.6 1.1 1.3 1.1 2.2h5c0-.9.3-1.6 1.1-2.2A6 6 0 0 0 12 3z"/>',
  richtig: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  falsch: '<path d="M12 5v9M12 19v.01"/>',
  vertretbar: '<path d="M12 4v16M8 20h8M5 8h14"/><path d="m5 8-2.5 6h5zM19 8l-2.5 6h5z"/>',
  schloss: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  pfeil: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  person: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/>',
  uhr: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  ziel: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><path d="M12 12h.01"/>',
  nochmal: '<path d="M4 12a8 8 0 1 0 2.4-5.7"/><path d="M4 4v4.5h4.5"/>',
  uebersicht: '<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/>',
  gruppe: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c1-3.5 3.6-5.5 6.5-5.5s5.5 2 6.5 5.5M16 4.8a3.5 3.5 0 0 1 0 6.4M18 14.8c1.7.8 3 2.5 3.5 5.2"/>',
  datei: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h4"/>',
  diagramm: '<path d="M4 20h16M7 16v-5M12 16V6M17 16v-8"/>',
  herunterladen: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>',
  auszeichnung: '<circle cx="12" cy="9" r="5.5"/><path d="m8.5 13.5-1.5 7 5-2.5 5 2.5-1.5-7"/>',
  schutz: '<path d="M12 3 5 6v5.5c0 4.4 2.9 7.9 7 9.5 4.1-1.6 7-5.1 7-9.5V6z"/>',
  zahlen: '<path d="M5 9h14M5 15h14M10 4 8 20M16 4l-2 16"/>',
  rueckmeldung: '<path d="M5 5h14a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1h-8l-4 3v-3H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z"/><path d="M8 10h8M8 13h5"/>',
  'ton-an': '<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/>',
  'ton-aus': '<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="m16 9.5 5 5M21 9.5l-5 5"/>',
  stift: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  live: '<circle cx="12" cy="12" r="3"/><path d="M7.8 7.8a6 6 0 0 0 0 8.4M16.2 7.8a6 6 0 0 1 0 8.4M5 5a10 10 0 0 0 0 14M19 5a10 10 0 0 1 0 14"/>',
  schluessel: '<circle cx="8" cy="14" r="4"/><path d="m11 11 9-9M17 5l2 2M15 7l2 2"/>',
  liste: '<path d="M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01"/>',
  einstellungen: '<circle cx="12" cy="12" r="3"/><path d="M12 2.5v3M12 18.5v3M4.6 4.6l2.1 2.1M17.3 17.3l2.1 2.1M2.5 12h3M18.5 12h3M4.6 19.4l2.1-2.1M17.3 6.7l2.1-2.1"/>',
};

const SVG = 'http://www.w3.org/2000/svg';

/** Ein Symbol als dekoratives SVG-Element; die Bedeutung steht immer als Text daneben. */
export function symbol(name, klasse = 'symbol') {
  const svg = document.createElementNS(SVG, 'svg');
  for (const [k, v] of Object.entries({ viewBox: '0 0 24 24', class: klasse, 'aria-hidden': 'true', focusable: 'false', fill: 'none', stroke: 'currentColor', 'stroke-width': '2', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' })) svg.setAttribute(k, v);
  svg.innerHTML = SYMBOLE[name] ?? SYMBOLE.anzeige;
  return svg;
}

/** Ring für einen Anteil 0…1, z. B. die Punkte am Ende. Der Bogen wird per CSSOM gesetzt (CSP ohne 'unsafe-inline'). */
export function ring(anteil, klasse = 'ring') {
  const svg = document.createElementNS(SVG, 'svg');
  for (const [k, v] of Object.entries({ viewBox: '0 0 100 100', class: klasse, 'aria-hidden': 'true', focusable: 'false' })) svg.setAttribute(k, v);
  const kreis = (cls) => {
    const c = document.createElementNS(SVG, 'circle');
    for (const [k, v] of Object.entries({ cx: 50, cy: 50, r: 42, pathLength: 100, class: cls })) c.setAttribute(k, v);
    return c;
  };
  const bogen = kreis('ring-bogen');
  bogen.dataset.anteil = String(Math.max(0, Math.min(1, anteil)));
  svg.append(kreis('ring-spur'), bogen);
  return svg;
}

/** Drei Sterne, `n` davon gefüllt; dekorativ, die Zahl steht immer als Text daneben. */
export function sterne(n, klasse = '') {
  const el = document.createElement('span');
  el.className = `sterne ${klasse}`.trim();
  el.setAttribute('aria-hidden', 'true');
  for (let i = 0; i < 3; i++) el.append(symbol('stern', `symbol${i < n ? ' voll' : ''}`));
  return el;
}
