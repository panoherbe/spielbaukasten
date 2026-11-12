// Minimaler Client für das Chrome DevTools Protocol, nur mit Node.js-Bordmitteln (fetch, WebSocket).
// Ersetzt für die Nachweis-Messung ein Test-Framework wie Playwright, das hier eine Abhängigkeit wäre.

export class Cdp {
  static async neueSeite(basis = 'http://127.0.0.1:9222', kontext) {
    const version = await (await fetch(`${basis}/json/version`)).json();
    const browser = await Cdp.verbinde(version.webSocketDebuggerUrl);
    const { targetId } = await browser.sende('Target.createTarget', { url: 'about:blank', ...(kontext ? { browserContextId: kontext } : {}) });
    const ziel = (await (await fetch(`${basis}/json/list`)).json()).find((t) => t.id === targetId);
    const seite = await Cdp.verbinde(ziel.webSocketDebuggerUrl);
    seite.browser = browser;
    seite.version = version;
    await seite.sende('Page.enable');
    await seite.sende('Runtime.enable');
    seite.protokoll = [];
    seite.auf('Runtime.exceptionThrown', (p) => seite.protokoll.push(`Ausnahme: ${p.exceptionDetails.exception?.description ?? p.exceptionDetails.text}`));
    seite.auf('Runtime.consoleAPICalled', (p) => seite.protokoll.push(`console.${p.type}: ${p.args.map((a) => a.value ?? a.description).join(' ')}`));
    seite.auf('Log.entryAdded', (p) => seite.protokoll.push(`log: ${p.entry.text} ${p.entry.url ?? ''}`));
    await seite.sende('Log.enable');
    return seite;
  }

  static async neuerKontext(basis = 'http://127.0.0.1:9222') {
    const version = await (await fetch(`${basis}/json/version`)).json();
    const browser = await Cdp.verbinde(version.webSocketDebuggerUrl);
    const { browserContextId } = await browser.sende('Target.createBrowserContext');
    browser.schliesse();
    return browserContextId;
  }

  static verbinde(url) {
    return new Promise((ok, fehler) => {
      const ws = new WebSocket(url);
      const c = new Cdp(ws);
      ws.onopen = () => ok(c);
      ws.onerror = (e) => fehler(new Error(`CDP: ${e.message ?? 'Verbindung fehlgeschlagen'}`));
    });
  }

  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.offen = new Map();
    this.hoerer = new Map();
    ws.onmessage = (m) => {
      const d = JSON.parse(m.data);
      if (d.id && this.offen.has(d.id)) {
        const { ok, fehler } = this.offen.get(d.id);
        this.offen.delete(d.id);
        d.error ? fehler(new Error(`${d.error.message} ${d.error.data ?? ''}`)) : ok(d.result);
      } else if (d.method) {
        for (const f of this.hoerer.get(d.method) ?? []) f(d.params);
      }
    };
  }

  sende(methode, parameter = {}) {
    const id = ++this.id;
    this.ws.send(JSON.stringify({ id, method: methode, params: parameter }));
    return new Promise((ok, fehler) => this.offen.set(id, { ok, fehler }));
  }

  auf(ereignis, f) {
    if (!this.hoerer.has(ereignis)) this.hoerer.set(ereignis, []);
    this.hoerer.get(ereignis).push(f);
  }

  einmal(ereignis, zeit = 15000) {
    return new Promise((ok, fehler) => {
      const t = setTimeout(() => fehler(new Error(`Zeitüberschreitung: ${ereignis}`)), zeit);
      this.auf(ereignis, (p) => { clearTimeout(t); ok(p); });
    });
  }

  /** Wertet einen Ausdruck in der Seite aus (await erlaubt) und liefert den Wert. */
  async werte(ausdruck) {
    const r = await this.sende('Runtime.evaluate', { expression: ausdruck, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(`Seite: ${r.exceptionDetails.exception?.description ?? r.exceptionDetails.text}`);
    return r.result.value;
  }

  async gehe(url) {
    const geladen = this.einmal('Page.loadEventFired');
    await this.sende('Page.navigate', { url });
    await geladen;
  }

  /** Wartet, bis der Ausdruck wahr ist. */
  async warte(ausdruck, zeit = 10000) {
    const ende = Date.now() + zeit;
    while (Date.now() < ende) {
      if (await this.werte(`Boolean(${ausdruck})`)) return;
      await new Promise((r) => setTimeout(r, 50));
    }
    const lage = await this.werte(`location.href + ' | ' + document.body?.innerText.slice(0, 300)`).catch(() => '');
    throw new Error(`Wartezeit abgelaufen: ${ausdruck}\nSeite: ${lage}\n${(this.protokoll ?? []).join('\n')}`);
  }

  /** Bildschirmfoto als PNG; `ganz`: die ganze Seite, sonst nur der sichtbare Ausschnitt. */
  async bild({ ganz = true } = {}) {
    const { data } = await this.sende('Page.captureScreenshot', { format: 'png', captureBeyondViewport: ganz });
    return Buffer.from(data, 'base64');
  }

  schliesse() {
    this.ws.close();
  }
}
