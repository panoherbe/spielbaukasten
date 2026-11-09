// Spielt die mitgelieferten Szenarien so, wie eine Person es täte: Zahlen werden aus dem angezeigten Text gelesen,
// nicht aus dem Szenario. Benutzt von Last- und Browsertest. `fehlerquote` streut absichtlich falsche erste
// Antworten ein, damit die Messung auch Rückmeldungen und zweite Versuche enthält.

const zahl = (t) => Number(String(t).replace(/\./g, '').replace(',', '.'));
const sind = (g) => Math.sin((g * Math.PI) / 180);
const tand = (g) => Math.tan((g * Math.PI) / 180);
const runde = (x) => String(Math.round(x * 100) / 100).replace('.', ',');

export function neuerLoeser({ fehlerquote = 0, wahlStreuung = 0, zufall = Math.random } = {}) {
  const w = {};
  const falschZuerst = new Set();
  return function naechstes(a) {
    const k = a.knoten;
    const text = `${k.text ?? ''} ${k.frage ?? ''}`;
    let m;
    if ((m = /F = ([\d.,]+) kN/.exec(text))) w.F = zahl(m[1]);
    if ((m = /θ = ([\d.,]+)°/.exec(text))) w.theta = zahl(m[1]);
    if ((m = /U = ([\d.,]+) V, oben R1 = ([\d.,]+) kΩ, unten R2 = ([\d.,]+) kΩ/.exec(text))) Object.assign(w, { U: zahl(m[1]), R1: zahl(m[2]), R2: zahl(m[3]) });

    if (k.typ === 'szene') {
      const bevorzugt = ['sperren', 'reparatur', 'rechnen', 'los'];
      const o = zufall() < wahlStreuung ? k.optionen[Math.floor(zufall() * k.optionen.length)] : k.optionen.find((x) => bevorzugt.includes(x.id)) ?? k.optionen[0];
      return { typ: 'wahl', knoten: k.id, option: o.id };
    }
    let antwort;
    if (k.id === 'pruefschritte') antwort = ['unterlagen', 'sicht', 'kraft', 'nachweis', 'massnahme'];
    else if (k.id === 'diagonale') antwort = runde(w.F / (2 * sind(w.theta)));
    else if (k.id === 'zugband') antwort = runde(w.F / (2 * tand(w.theta)));
    else if (k.id === 'spannung') antwort = runde((1.5 * w.F / (2 * tand(w.theta)) * 1000) / 160);
    else if (k.id === 'teilspannung') antwort = runde((w.U * w.R2) / (w.R1 + w.R2));
    else if (k.id === 'last') antwort = 'sinkt';
    else throw new Error(`Unbekannter Knoten ${k.id}`);
    if (k.mechanik === 'zahl' && !falschZuerst.has(k.id) && zufall() < fehlerquote) {
      falschZuerst.add(k.id);
      antwort = runde(zahl(antwort) * 2);
    }
    return { typ: 'antwort', knoten: k.id, antwort };
  };
}
