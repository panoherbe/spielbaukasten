// Kleine Bausteine der Oberfläche. Inhalte aus Szenarien werden nie als HTML eingefügt, sondern als Text-Knoten:
// Ein Szenario kann so kein Skript in die Seite bringen.

/** Element erzeugen: h('button', { class: 'knopf', onclick }, 'Text', kindElement) */
export function h(tag, attrs = {}, ...kinder) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs ?? {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'class') el.className = v;
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, String(v));
  }
  for (const kind of kinder.flat(Infinity)) {
    if (kind === undefined || kind === null || kind === false) continue;
    el.append(kind instanceof Node ? kind : document.createTextNode(String(kind)));
  }
  return el;
}

/** Fließtext mit **fett**, Absätzen (Leerzeile) und Zeilenumbrüchen; alles andere bleibt Text. */
export function textBloecke(text) {
  if (!text) return [];
  return String(text).split(/\n{2,}/).map((absatz) => h('p', {}, absatz.split('\n').flatMap((zeile, i) => [
    i > 0 ? h('br') : null,
    ...zeile.split(/(\*\*[^*]+\*\*)/).map((teil) => (/^\*\*[^*]+\*\*$/.test(teil) ? h('strong', {}, teil.slice(2, -2)) : teil)),
  ])));
}

export function zahl(x, stellen = 1) {
  return Number(x).toLocaleString('de-DE', { maximumFractionDigits: stellen });
}

/** Kurze Meldung für Bildschirmleser und als sichtbarer Hinweis unten. */
export function melde(text, art = 'info') {
  let box = document.getElementById('meldung');
  if (!box) {
    box = h('div', { id: 'meldung', class: 'meldung', role: 'status', 'aria-live': 'polite' });
    document.body.append(box);
  }
  box.className = `meldung meldung-${art} sichtbar`;
  box.textContent = text;
  clearTimeout(melde.timer);
  melde.timer = setTimeout(() => box.classList.remove('sichtbar'), 4000);
}

/** Nur für Bildschirmleser ansagen, ohne sichtbare Meldung (z. B. beim Umsortieren). */
export function sage(text) {
  let box = document.getElementById('ansage');
  if (!box) {
    box = h('div', { id: 'ansage', class: 'nur-vorlesen', role: 'status', 'aria-live': 'polite' });
    document.body.append(box);
  }
  box.textContent = text;
}

export function leere(el, ...neu) {
  el.replaceChildren(...neu.flat().filter(Boolean));
  return el;
}

/** Fokus auf die neue Überschrift, damit Tastatur- und Bildschirmleser-Nutzung beim Szenenwechsel mitkommt. */
export function fokus(el) {
  if (!el) return;
  el.setAttribute('tabindex', '-1');
  el.focus({ preventScroll: false });
}
