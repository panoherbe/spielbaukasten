// Verzeichnis der Spielmechaniken. Eine neue Mechanik ist ein Modul mit `typ`, `pruefe`, `bewerte`, `loesung` und
// `ansicht` und eine Zeile hier, dazu eine Darstellung unter src/web/mechaniken/ mit einer Zeile in deren Verzeichnis;
// Engine und Server bleiben unverändert.
// Anleitung: docs/ERWEITERN.md

import { zahl } from './zahl.js';
import { auswahl } from './auswahl.js';
import { reihenfolge } from './reihenfolge.js';

export const MECHANIKEN = { [zahl.typ]: zahl, [auswahl.typ]: auswahl, [reihenfolge.typ]: reihenfolge };
