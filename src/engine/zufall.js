// Reproduzierbarer Zufall: Jeder Versuch hat einen Startwert (seed). Daraus entstehen die Aufgabenparameter, im
// Browser wie auf dem Server gleich. So bekommt jede Person andere Zahlen, und der Server kann jede Antwort
// nachrechnen, ohne der Rechnung im Browser trauen zu müssen.

/** Zufallsgenerator mulberry32: klein, schnell, für Lernaufgaben ausreichend (nicht kryptografisch). */
export function zufallsfolge(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Zieht die Parameter eines Szenarios. Definition je Parameter:
 *   { "werte": [30, 45, 60] }                       eine Auswahl
 *   { "min": 30, "max": 60, "schritt": 5 }          Raster von min bis max
 * Die Reihenfolge folgt den Schlüsseln im Szenario, damit dieselbe Datei immer dieselben Werte ergibt.
 */
export function ziehe(parameterDef = {}, seed = 1) {
  const z = zufallsfolge(seed);
  const werte = {};
  for (const [name, def] of Object.entries(parameterDef)) {
    if (Array.isArray(def.werte)) {
      werte[name] = def.werte[Math.floor(z() * def.werte.length)];
    } else {
      const schritt = def.schritt ?? 1;
      const anzahl = Math.floor((def.max - def.min) / schritt + 1e-9) + 1;
      werte[name] = Number((def.min + Math.floor(z() * anzahl) * schritt).toFixed(10));
    }
  }
  return werte;
}

/** Neuer Startwert für einen Versuch (32 Bit). */
export function neuerSeed() {
  const buf = new Uint32Array(1);
  globalThis.crypto.getRandomValues(buf);
  return buf[0] || 1;
}
