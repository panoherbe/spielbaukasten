// Verzeichnis der Spielmechaniken. Eine neue Mechanik ist ein Modul mit `typ`, `pruefe`, `bewerte`, `loesung`
// (dazu eine Darstellung unter src/web/mechaniken/) und eine Zeile hier; Engine und Server bleiben unverändert.
// Anleitung: docs/ERWEITERN.md

import { zahl } from './zahl.js';
import { auswahl } from './auswahl.js';
import { reihenfolge } from './reihenfolge.js';

export const MECHANIKEN = { [zahl.typ]: zahl, [auswahl.typ]: auswahl, [reihenfolge.typ]: reihenfolge };
