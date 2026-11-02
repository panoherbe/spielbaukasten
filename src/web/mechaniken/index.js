// Darstellungen der Mechaniken; Gegenstück zu src/engine/mechaniken/index.js.

import { zahlEingabe } from './zahl.js';
import { auswahlListe } from './auswahl.js';
import { reihenfolgeListe } from './reihenfolge.js';

export const DARSTELLUNGEN = { [zahlEingabe.typ]: zahlEingabe, [auswahlListe.typ]: auswahlListe, [reihenfolgeListe.typ]: reihenfolgeListe };
