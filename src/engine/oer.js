// Metadaten für die Veröffentlichung eines Szenarios als Open Educational Resource, im „Allgemeinen
// Metadatenprofil für Bildungsressourcen“ (AMB, https://w3id.org/kim/amb/latest/), das OER-Suchdienste wie OERSI
// einlesen. Der OER-Export (tools/oer-export.js) legt diese Datei neben die eigenständige HTML-Fassung.

const LIZENZ_URL = {
  'CC-BY-4.0': 'https://creativecommons.org/licenses/by/4.0/',
  'CC-BY-SA-4.0': 'https://creativecommons.org/licenses/by-sa/4.0/',
  'CC0-1.0': 'https://creativecommons.org/publicdomain/zero/1.0/',
};

export function lizenzUrl(id) {
  return LIZENZ_URL[id];
}

/** Lizenzhinweis nach TULLU-Regel (Titel, Urheber, Lizenz, Link), wie er unter jeder Kopie stehen muss. */
export function lizenzhinweis(szenario) {
  return `„${szenario.titel}“ von ${szenario.urheber.join(', ')}, Lizenz ${szenario.lizenz.replace(/-/g, ' ')} (${lizenzUrl(szenario.lizenz)})`;
}

/**
 * @param {object} szenario
 * @param {object} o  { id: URL der veröffentlichten Ressource, datum: 'JJJJ-MM-TT' }
 */
export function ambMetadaten(szenario, { id, datum }) {
  return {
    '@context': ['https://w3id.org/kim/amb/context.jsonld', { '@language': 'de' }],
    id,
    type: ['LearningResource'],
    name: szenario.titel,
    description: `${szenario.kurzbeschreibung} Lernziele: ${(szenario.lernziele ?? []).map((lz) => lz.text).join('; ')}.`,
    creator: szenario.urheber.map((name) => ({ type: 'Person', name })),
    license: { id: lizenzUrl(szenario.lizenz) },
    inLanguage: [szenario.sprache ?? 'de'],
    isAccessibleForFree: true,
    learningResourceType: [{ id: 'http://w3id.org/kim/hcrt/educational_game', prefLabel: { de: 'Lernspiel' } }],
    keywords: szenario.schlagworte ?? [],
    dateCreated: datum,
    encoding: [{ type: 'MediaObject', encodingFormat: 'text/html', contentUrl: id }],
  };
}
