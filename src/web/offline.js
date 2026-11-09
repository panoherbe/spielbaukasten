// Startpunkt der Offline-Fassung (OER-Export): Engine und Spieler laufen ganz im Browser, ohne Server und ohne
// Anmeldung. Der Fortschritt bleibt nur auf diesem Gerät (localStorage). Für Übung und Selbststudium gedacht;
// die Lösungen stehen in dieser Datei.

import { starte, wende } from '../engine/ablauf.js';
import { ansicht } from '../engine/ansicht.js';
import { neuerSeed } from '../engine/zufall.js';
import { spieler } from './spieler.js';

const szenario = JSON.parse(document.getElementById('szenario-daten').textContent);
const medien = JSON.parse(document.getElementById('medien-daten').textContent);
const grafik = JSON.parse(document.getElementById('grafik-daten').textContent);
const SPEICHER = `spielbaukasten:${szenario.id}:v${szenario.version}`;

function lade() {
  try { return JSON.parse(localStorage.getItem(SPEICHER)); } catch { return null; }
}
function speichere(stand) {
  try { localStorage.setItem(SPEICHER, JSON.stringify(stand)); } catch { /* privates Fenster: dann ohne Fortsetzen */ }
}

let stand = lade();
let z;
try {
  z = starte(szenario, stand?.seed ?? 1);
  for (const e of stand?.ereignisse ?? []) z = wende(szenario, z, e);
} catch {
  stand = null;
}
if (!stand) {
  stand = { seed: neuerSeed(), ereignisse: [] };
  z = starte(szenario, stand.seed);
}
z = { ...z, rueckmeldung: null };

const p = spieler(document.getElementById('inhalt'), {
  medienUrl: (datei) => medien[datei] ?? '',
  grafikUrl: (name) => grafik[name] ?? '',
  sende: async (e) => {
    const neu = wende(szenario, z, e);
    if (neu.rueckmeldung?.art !== 'ungueltig') { stand.ereignisse.push(e); speichere(stand); }
    z = neu;
    return ansicht(szenario, z);
  },
  neu: async () => {
    stand = { seed: neuerSeed(), ereignisse: [] };
    speichere(stand);
    z = starte(szenario, stand.seed);
    return ansicht(szenario, z);
  },
});
p.zeige(ansicht(szenario, z));
