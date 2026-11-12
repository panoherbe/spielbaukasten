// Fehler mit HTTP-Status und deutscher Meldung; der Server schickt sie als {"fehler": "…"} zurück.

export class HttpFehler extends Error {
  constructor(status, meldung, daten) { super(meldung); this.status = status; this.daten = daten; }
}
