// Übersetzung von Spielereignissen in xAPI-Statements (Experience API 1.0.3). Das ist die vorbereitete Schnittstelle
// zu Lernplattformen und Learning Record Stores: Ein späterer Moodle- oder LRS-Anschluss liest diese Statements,
// ohne dass Engine oder Datenbank geändert werden. Personen erscheinen nur als Pseudonym (Konto auf dieser Instanz).

import { spiele } from './ablauf.js';

const VERB = {
  gestartet: { id: 'http://adlnet.gov/expapi/verbs/attempted', display: { 'de-DE': 'hat begonnen' } },
  gewaehlt: { id: 'http://adlnet.gov/expapi/verbs/experienced', display: { 'de-DE': 'hat entschieden' } },
  beantwortet: { id: 'http://adlnet.gov/expapi/verbs/answered', display: { 'de-DE': 'hat beantwortet' } },
  abgeschlossen: { id: 'http://adlnet.gov/expapi/verbs/completed', display: { 'de-DE': 'hat abgeschlossen' } },
};

/**
 * @param {object} p  { basisUrl, szenario, versuch: {id, seed, pseudonym, gestartet}, ereignisse: [{daten, zeit}] }
 * @returns {object[]} Statements in zeitlicher Reihenfolge
 */
export function statements({ basisUrl, szenario, versuch, ereignisse }) {
  const actor = { objectType: 'Agent', account: { homePage: basisUrl, name: versuch.pseudonym } };
  const aktivitaet = (knoten) => ({
    objectType: 'Activity',
    id: `${basisUrl}/szenarien/${szenario.id}/v${szenario.version}${knoten ? `/knoten/${knoten}` : ''}`,
    definition: { name: { 'de-DE': knoten ? (szenario.knoten[knoten].titel ?? knoten) : szenario.titel } },
  });
  const registration = versuch.registration;
  const out = [{ actor, verb: VERB.gestartet, object: aktivitaet(), timestamp: versuch.gestartet, context: { registration } }];
  const verlauf = [];
  for (const e of ereignisse) {
    verlauf.push(e.daten);
    const z = spiele(szenario, versuch.seed, verlauf);
    const d = e.daten;
    if (d.typ === 'wahl') {
      out.push({ actor, verb: VERB.gewaehlt, object: aktivitaet(d.knoten), result: { response: d.option }, timestamp: e.zeit, context: { registration } });
    } else if (d.typ === 'antwort') {
      const art = z.rueckmeldung?.art;
      if (art === 'ungueltig') continue;
      out.push({
        actor, verb: VERB.beantwortet, object: aktivitaet(d.knoten), timestamp: e.zeit, context: { registration },
        result: { response: JSON.stringify(d.antwort), success: art === 'richtig' },
      });
    }
    if (z.beendet) {
      out.push({
        actor, verb: VERB.abgeschlossen, object: aktivitaet(), timestamp: e.zeit, context: { registration },
        result: {
          completion: true, success: z.ergebnis === 'erfolg',
          score: { raw: z.punkte, max: z.maxPunkte, min: 0, scaled: z.maxPunkte ? Math.round((z.punkte / z.maxPunkte) * 1000) / 1000 : 0 },
        },
      });
    }
  }
  return out;
}
