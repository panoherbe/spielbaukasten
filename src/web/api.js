// Zugriff auf die Schnittstelle des Servers; Fehlermeldungen kommen auf Deutsch vom Server.

export class ApiFehler extends Error {
  constructor(status, meldung, daten) { super(meldung); this.status = status; this.daten = daten; }
}

export async function api(methode, pfad, daten) {
  const antwort = await fetch(pfad, {
    method: methode,
    headers: daten === undefined ? {} : { 'Content-Type': 'application/json' },
    body: daten === undefined ? undefined : JSON.stringify(daten),
    credentials: 'same-origin',
  });
  const text = await antwort.text();
  const json = text ? JSON.parse(text) : null;
  if (!antwort.ok) throw new ApiFehler(antwort.status, json?.fehler ?? `Fehler ${antwort.status}`, json);
  return json;
}
