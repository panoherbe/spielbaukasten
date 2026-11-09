// HTTP-Server: statische Oberfläche, Medien der Szenarien und die JSON-Schnittstelle (beschrieben in
// docs/openapi.json). Nur Node.js-Bordmittel, keine Fremdbibliotheken.

import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync, createReadStream } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { join, resolve, extname, sep, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

import { oeffne, transaktion, raeumeAuf } from './db.js';
import { ladeVerzeichnis, speichereHochgeladen, szenario as ladeSzenario, alleSzenarien, medienPfad, MEDIENTYPEN } from './inhalte.js';
import { COOKIE, KOPFZEILEN, SVG_KOPFZEILEN, hash, token, code, normalisiereCode, gleich, pseudonym, leseCookies, cookieKopf, bremse } from './sicherheit.js';
import { starte, wende, spiele, SpielFehler } from '../engine/ablauf.js';
import { ansicht } from '../engine/ansicht.js';
import { neuerSeed } from '../engine/zufall.js';
import { statements } from '../engine/xapi.js';
import { sterne } from '../engine/wertung.js';
import { oerPaket } from '../oer-export.js';

const HIER = dirname(fileURLToPath(import.meta.url));
const WEB = resolve(HIER, '../web');
const OPENAPI = resolve(HIER, '../../docs/openapi.json');
const TYPEN = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json' };
const SITZUNG_TAGE = 120;
const MAX_KOERPER = 1024 * 1024;

/** Antwort mit eigenem Status oder eigenen Kopfzeilen; alles andere geht als 200 mit JSON. */
class Antwort {
  constructor(status, daten, kopf = {}) { this.status = status; this.daten = daten; this.kopf = kopf; }
}
const mit = (status, daten, kopf) => new Antwort(status, daten, kopf);

class HttpFehler extends Error {
  constructor(status, meldung, daten) { super(meldung); this.status = status; this.daten = daten; }
}

export function erstelleApp(cfg) {
  const db = oeffne(cfg.datenbank);
  const log = cfg.log ?? console;
  const bericht = ladeVerzeichnis(db, cfg.inhalte, log);
  for (const a of bericht.abgelehnt) log.error?.(`Szenario abgelehnt: ${a.datei}\n${a.fehler.map((f) => `  ${f.pfad}: ${f.meldung}`).join('\n')}`);
  if (cfg.demoKurscode) {
    const c = normalisiereCode(cfg.demoKurscode);
    if (!db.prepare('SELECT 1 FROM kurs WHERE code = ?').get(c)) {
      const k = db.prepare('INSERT INTO kurs (name, code, erstellt) VALUES (?, ?, ?)').run('Demokurs', c, new Date().toISOString());
      for (const s of alleSzenarien(db)) db.prepare('INSERT INTO kurs_szenario (kurs_id, szenario_id) VALUES (?, ?)').run(k.lastInsertRowid, s.id);
    }
  }
  raeumeAuf(db, cfg.aufbewahrungTage);
  const aufraeumen = setInterval(() => raeumeAuf(db, cfg.aufbewahrungTage), 6 * 3600 * 1000);
  aufraeumen.unref();
  const fehlversuche = bremse(cfg.maxFehlversuche ?? 20);

  // --- Hilfen -----------------------------------------------------------------------------------------------------
  const jetzt = () => new Date().toISOString();

  function json(res, status, daten, kopf = {}) {
    const text = JSON.stringify(daten);
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...KOPFZEILEN, ...kopf });
    res.end(text);
  }

  async function koerper(req) {
    if (!/^application\/json\b/.test(req.headers['content-type'] ?? '')) throw new HttpFehler(415, 'Erwartet wird application/json');
    const teile = [];
    let n = 0;
    for await (const t of req) {
      n += t.length;
      if (n > MAX_KOERPER) throw new HttpFehler(413, 'Anfrage zu groß (höchstens 1 MB)');
      teile.push(t);
    }
    try {
      return JSON.parse(Buffer.concat(teile).toString('utf8') || '{}');
    } catch {
      throw new HttpFehler(400, 'JSON nicht lesbar');
    }
  }

  function wer(req) {
    const t = leseCookies(req.headers.cookie)[COOKIE];
    if (!t) return null;
    const n = db.prepare(`SELECT n.id, n.rolle, n.pseudonym, n.kurs_id, k.name AS kurs FROM sitzung s JOIN nutzer n ON n.id = s.nutzer_id
                          LEFT JOIN kurs k ON k.id = n.kurs_id WHERE s.token_hash = ? AND s.ablauf > ?`).get(hash(t), jetzt());
    if (n) db.prepare('UPDATE nutzer SET zuletzt = ? WHERE id = ?').run(jetzt(), n.id);
    return n ?? null;
  }

  function neueSitzung(nutzerId) {
    const t = token();
    const ablauf = new Date(Date.now() + SITZUNG_TAGE * 86400000).toISOString();
    db.prepare('INSERT INTO sitzung (token_hash, nutzer_id, ablauf) VALUES (?, ?, ?)').run(hash(t), nutzerId, ablauf);
    return cookieKopf(t, SITZUNG_TAGE * 86400, cfg.sichereCookies);
  }

  function neuerNutzer(rolle, kursId) {
    for (let i = 0; i < 20; i++) {
      try {
        const p = pseudonym();
        const r = db.prepare('INSERT INTO nutzer (rolle, pseudonym, kurs_id, erstellt, zuletzt) VALUES (?, ?, ?, ?, ?)').run(rolle, p, kursId, jetzt(), jetzt());
        return { id: Number(r.lastInsertRowid), pseudonym: p };
      } catch (e) {
        if (!/UNIQUE/.test(e.message)) throw e;
      }
    }
    throw new HttpFehler(500, 'Kein freies Pseudonym gefunden');
  }

  function szenarioFuer(nutzer, id) {
    if (nutzer.rolle === 'studierende') {
      const frei = db.prepare('SELECT 1 FROM kurs_szenario WHERE kurs_id = ? AND szenario_id = ?').get(nutzer.kurs_id, id);
      if (!frei) throw new HttpFehler(404, 'Szenario in diesem Kurs nicht freigegeben');
    }
    const s = ladeSzenario(db, id);
    if (!s) throw new HttpFehler(404, 'Szenario nicht gefunden');
    return s;
  }

  function ladeVersuch(nutzer, id) {
    const v = db.prepare('SELECT * FROM versuch WHERE id = ?').get(id);
    if (!v || v.nutzer_id !== nutzer.id) throw new HttpFehler(404, 'Versuch nicht gefunden');
    const s = ladeSzenario(db, v.szenario_id, v.szenario_version);
    const ereignisse = db.prepare('SELECT daten FROM ereignis WHERE versuch_id = ? ORDER BY nr').all(id).map((e) => JSON.parse(e.daten));
    return { v, s, ereignisse, z: spiele(s, v.seed, ereignisse) };
  }

  // --- Routen -----------------------------------------------------------------------------------------------------
  const routen = [];
  const route = (methode, muster, rolle, fn) => routen.push({ methode, muster: new RegExp(`^${muster}$`), rolle, fn });

  route('GET', '/api/gesundheit', null, () => {
    const n = db.prepare('SELECT count(*) AS n FROM szenario').get().n;
    return { ok: true, version: cfg.version, szenarienVersionen: n };
  });

  route('GET', '/api/openapi.json', null, () => JSON.parse(readFileSync(OPENAPI, 'utf8')));

  route('POST', '/api/anmelden/studierende', null, async (req, res, _m, ip) => {
    if (!fehlversuche.erlaubt(ip)) throw new HttpFehler(429, 'Zu viele falsche Codes. Bitte eine Minute warten.');
    const { kurscode } = await koerper(req);
    const kurs = db.prepare('SELECT id, name FROM kurs WHERE code = ?').get(normalisiereCode(kurscode));
    if (!kurs) { fehlversuche.fehlschlag(ip); throw new HttpFehler(404, 'Diesen Kurscode gibt es nicht.'); }
    const n = neuerNutzer('studierende', kurs.id);
    const wiederkehr = code(12);
    db.prepare('UPDATE nutzer SET wiederkehr_hash = ? WHERE id = ?').run(hash(normalisiereCode(wiederkehr)), n.id);
    return mit(201, { rolle: 'studierende', pseudonym: n.pseudonym, kurs: kurs.name, wiederkehrcode: wiederkehr }, { 'Set-Cookie': neueSitzung(n.id) });
  });

  route('POST', '/api/anmelden/wiederkehr', null, async (req, _res, _m, ip) => {
    if (!fehlversuche.erlaubt(ip)) throw new HttpFehler(429, 'Zu viele falsche Codes. Bitte eine Minute warten.');
    const { wiederkehrcode } = await koerper(req);
    const n = db.prepare('SELECT n.id, n.pseudonym, k.name AS kurs FROM nutzer n LEFT JOIN kurs k ON k.id = n.kurs_id WHERE wiederkehr_hash = ?')
      .get(hash(normalisiereCode(wiederkehrcode)));
    if (!n) { fehlversuche.fehlschlag(ip); throw new HttpFehler(404, 'Code unbekannt oder schon gelöscht.'); }
    return mit(200, { rolle: 'studierende', pseudonym: n.pseudonym, kurs: n.kurs }, { 'Set-Cookie': neueSitzung(n.id) });
  });

  route('POST', '/api/anmelden/lehrende', null, async (req, _res, _m, ip) => {
    if (!fehlversuche.erlaubt(ip)) throw new HttpFehler(429, 'Zu viele Fehlversuche. Bitte eine Minute warten.');
    const { schluessel } = await koerper(req);
    if (!cfg.lehrendeSchluessel || !gleich(schluessel ?? '', cfg.lehrendeSchluessel)) { fehlversuche.fehlschlag(ip); throw new HttpFehler(403, 'Schlüssel falsch.'); }
    let n = db.prepare("SELECT id, pseudonym FROM nutzer WHERE rolle = 'lehrende' ORDER BY id LIMIT 1").get();
    if (!n) n = neuerNutzer('lehrende', null);
    return mit(200, { rolle: 'lehrende', pseudonym: n.pseudonym }, { 'Set-Cookie': neueSitzung(n.id) });
  });

  route('POST', '/api/abmelden', 'alle', (req) => {
    const t = leseCookies(req.headers.cookie)[COOKIE];
    db.prepare('DELETE FROM sitzung WHERE token_hash = ?').run(hash(t));
    return mit(200, { ok: true }, { 'Set-Cookie': cookieKopf('', 0, cfg.sichereCookies) });
  });

  route('GET', '/api/ich', 'alle', (_req, _res, _m, _ip, n) => ({ rolle: n.rolle, pseudonym: n.pseudonym, kurs: n.kurs }));

  // Recht auf Löschung (Art. 17 DSGVO): alles zu dieser Person, sofort
  route('DELETE', '/api/ich', 'studierende', (_req, _res, _m, _ip, n) => {
    db.prepare('DELETE FROM nutzer WHERE id = ?').run(n.id);
    return mit(200, { geloescht: true }, { 'Set-Cookie': cookieKopf('', 0, cfg.sichereCookies) });
  });

  route('GET', '/api/ich/daten', 'studierende', (_req, _res, _m, _ip, n) => ({
    pseudonym: n.pseudonym, kurs: n.kurs,
    versuche: db.prepare('SELECT id, szenario_id, szenario_version, gestartet, aktualisiert, beendet, ergebnis, punkte, max_punkte FROM versuch WHERE nutzer_id = ?').all(n.id)
      .map((v) => ({ ...v, ereignisse: db.prepare('SELECT nr, daten, zeit FROM ereignis WHERE versuch_id = ? ORDER BY nr').all(v.id).map((e) => ({ ...e, daten: JSON.parse(e.daten) })) })),
  }));

  route('GET', '/api/szenarien', 'alle', (_req, _res, _m, _ip, n) => {
    const liste = n.rolle === 'lehrende'
      ? alleSzenarien(db).map((r) => r.szenario)
      : db.prepare('SELECT szenario_id FROM kurs_szenario WHERE kurs_id = ? ORDER BY szenario_id').all(n.kurs_id).map((r) => ladeSzenario(db, r.szenario_id)).filter(Boolean);
    return liste.map((s) => {
      const st = db.prepare(`SELECT count(*) AS versuche, sum(beendet) AS beendet, max(CASE WHEN beendet THEN punkte * 1.0 / nullif(max_punkte, 0) END) AS beste,
                             (SELECT id FROM versuch WHERE nutzer_id = ? AND szenario_id = ? AND beendet = 0 ORDER BY aktualisiert DESC LIMIT 1) AS offen
                             FROM versuch WHERE nutzer_id = ? AND szenario_id = ?`).get(n.id, s.id, n.id, s.id);
      const besteSterne = Math.max(0, ...db.prepare('SELECT ergebnis, punkte, max_punkte FROM versuch WHERE nutzer_id = ? AND szenario_id = ? AND beendet = 1')
        .all(n.id, s.id).map((v) => sterne(v.ergebnis, v.max_punkte ? v.punkte / v.max_punkte : null)));
      return {
        id: s.id, version: s.version, titel: s.titel, kurzbeschreibung: s.kurzbeschreibung, fach: s.fach, zielgruppe: s.zielgruppe,
        dauerMinuten: s.dauer_minuten, lernziele: s.lernziele, lizenz: s.lizenz, urheber: s.urheber, titelbild: s.titelbild ?? null,
        eigene: { versuche: st.versuche, beendet: st.beendet ?? 0, besteQuote: st.beste, besteSterne, offenerVersuch: st.offen },
      };
    });
  });

  route('POST', '/api/versuche', 'alle', async (req, _res, _m, _ip, n) => {
    const { szenario: id } = await koerper(req);
    const s = szenarioFuer(n, id);
    const v = { id: randomUUID(), seed: neuerSeed() };
    const z = starte(s, v.seed);
    db.prepare(`INSERT INTO versuch (id, nutzer_id, szenario_id, szenario_version, seed, gestartet, aktualisiert, knoten, max_punkte)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(v.id, n.id, s.id, s.version, v.seed, jetzt(), jetzt(), z.knoten, z.maxPunkte);
    return mit(201, { versuch: v.id, nr: 0, ...ansicht(s, z) });
  });

  route('GET', '/api/versuche/([0-9a-f-]{36})', 'alle', (_req, _res, m, _ip, n) => {
    const { v, s, z, ereignisse } = ladeVersuch(n, m[1]);
    // Die letzte Rückmeldung gehört zum letzten Schritt; beim Fortsetzen wird sie nicht erneut gezeigt
    return { versuch: v.id, nr: ereignisse.length, ...ansicht(s, { ...z, rueckmeldung: null }) };
  });

  route('POST', '/api/versuche/([0-9a-f-]{36})/ereignisse', 'alle', async (req, _res, m, _ip, n) => {
    const { nr, ereignis } = await koerper(req);
    return transaktion(db, () => {
      const { v, s, z, ereignisse } = ladeVersuch(n, m[1]);
      if (nr !== ereignisse.length) throw new HttpFehler(409, 'Der Versuch wurde inzwischen fortgesetzt', { versuch: v.id, nr: ereignisse.length, ...ansicht(s, z) });
      const e = { typ: ereignis?.typ, knoten: ereignis?.knoten, ...(ereignis?.typ === 'wahl' ? { option: ereignis.option } : {}), ...(ereignis?.typ === 'antwort' ? { antwort: ereignis.antwort } : {}) };
      let neu;
      try {
        neu = wende(s, z, e);
      } catch (err) {
        if (err instanceof SpielFehler) throw new HttpFehler(422, err.message);
        throw err;
      }
      // Ungültige Eingaben (keine Zahl o. ä.) werden beantwortet, aber nicht gespeichert
      if (neu.rueckmeldung?.art === 'ungueltig') return { versuch: v.id, nr: ereignisse.length, ...ansicht(s, neu) };
      const ergebnis = neu.rueckmeldung ? JSON.stringify({ art: neu.rueckmeldung.art, typ: neu.rueckmeldung.typ }) : null;
      db.prepare('INSERT INTO ereignis (versuch_id, nr, daten, ergebnis, zeit) VALUES (?, ?, ?, ?, ?)').run(v.id, nr, JSON.stringify(e), ergebnis, jetzt());
      db.prepare('UPDATE versuch SET aktualisiert = ?, knoten = ?, beendet = ?, ergebnis = ?, punkte = ?, max_punkte = ? WHERE id = ?')
        .run(jetzt(), neu.knoten, neu.beendet ? 1 : 0, neu.ergebnis, neu.punkte, neu.maxPunkte, v.id);
      return { versuch: v.id, nr: nr + 1, ...ansicht(s, neu) };
    });
  });

  // --- Lehrende ---------------------------------------------------------------------------------------------------
  route('GET', '/api/lehrende/kurse', 'lehrende', () => db.prepare(`SELECT k.id, k.name, k.code, k.erstellt,
      (SELECT count(*) FROM nutzer WHERE kurs_id = k.id) AS teilnehmende,
      (SELECT json_group_array(szenario_id) FROM kurs_szenario WHERE kurs_id = k.id) AS szenarien FROM kurs k ORDER BY k.id`).all()
    .map((k) => ({ ...k, codeAnzeige: k.code.length === 8 ? `${k.code.slice(0, 4)}-${k.code.slice(4)}` : k.code, szenarien: JSON.parse(k.szenarien) })));

  route('POST', '/api/lehrende/kurse', 'lehrende', async (req) => {
    const { name, szenarien = [] } = await koerper(req);
    if (!name || String(name).length > 120) throw new HttpFehler(400, 'Name fehlt oder ist zu lang');
    const c = code(8);
    return transaktion(db, () => {
      const k = db.prepare('INSERT INTO kurs (name, code, erstellt) VALUES (?, ?, ?)').run(String(name), normalisiereCode(c), jetzt());
      for (const id of szenarien) {
        if (!ladeSzenario(db, id)) throw new HttpFehler(400, `Szenario „${id}“ gibt es nicht`);
        db.prepare('INSERT INTO kurs_szenario (kurs_id, szenario_id) VALUES (?, ?)').run(k.lastInsertRowid, id);
      }
      return mit(201, { id: Number(k.lastInsertRowid), name, code: c });
    });
  });

  route('PUT', '/api/lehrende/kurse/(\\d+)/szenarien', 'lehrende', async (req, _res, m) => {
    const { szenarien } = await koerper(req);
    if (!Array.isArray(szenarien)) throw new HttpFehler(400, 'szenarien muss eine Liste sein');
    return transaktion(db, () => {
      if (!db.prepare('SELECT 1 FROM kurs WHERE id = ?').get(Number(m[1]))) throw new HttpFehler(404, 'Kurs nicht gefunden');
      db.prepare('DELETE FROM kurs_szenario WHERE kurs_id = ?').run(Number(m[1]));
      for (const id of szenarien) {
        if (!ladeSzenario(db, id)) throw new HttpFehler(400, `Szenario „${id}“ gibt es nicht`);
        db.prepare('INSERT INTO kurs_szenario (kurs_id, szenario_id) VALUES (?, ?)').run(Number(m[1]), id);
      }
      return { ok: true, szenarien };
    });
  });

  route('GET', '/api/lehrende/szenarien', 'lehrende', () => alleSzenarien(db).map((r) => ({
    id: r.id, version: r.version, quelle: r.quelle, geladen: r.geladen, titel: r.szenario.titel,
    knoten: Object.keys(r.szenario.knoten).length, aufgaben: Object.values(r.szenario.knoten).filter((k) => k.typ === 'aufgabe').length,
    lernziele: r.szenario.lernziele, lizenz: r.szenario.lizenz,
  })));

  route('POST', '/api/lehrende/szenarien/pruefen', 'lehrende', async (req) => {
    const { pruefeSzenario } = await import('../engine/szenario.js');
    return pruefeSzenario(await koerper(req));
  });

  route('POST', '/api/lehrende/szenarien', 'lehrende', async (req) => {
    const r = speichereHochgeladen(db, await koerper(req));
    return mit(r.ok ? 201 : 422, r);
  });

  route('GET', '/api/lehrende/auswertung', 'lehrende', (req) => auswertung(new URL(req.url, 'http://x').searchParams));

  route('GET', '/api/lehrende/xapi', 'lehrende', (req) => {
    const q = new URL(req.url, 'http://x').searchParams;
    const versuche = db.prepare(`SELECT v.*, n.pseudonym FROM versuch v JOIN nutzer n ON n.id = v.nutzer_id
                                 WHERE v.szenario_id = ? AND (? IS NULL OR n.kurs_id = ?) AND n.rolle = 'studierende' ORDER BY v.gestartet`)
      .all(q.get('szenario'), q.get('kurs'), q.get('kurs'));
    return versuche.flatMap((v) => statements({
      basisUrl: cfg.basisUrl,
      szenario: ladeSzenario(db, v.szenario_id, v.szenario_version),
      versuch: { id: v.id, seed: v.seed, pseudonym: v.pseudonym, gestartet: v.gestartet, registration: v.id },
      ereignisse: db.prepare('SELECT daten, zeit FROM ereignis WHERE versuch_id = ? ORDER BY nr').all(v.id).map((e) => ({ daten: JSON.parse(e.daten), zeit: e.zeit })),
    }));
  });

  route('GET', '/api/lehrende/oer/([a-z0-9-]+)', 'lehrende', (_req, res, m) => {
    const s = ladeSzenario(db, m[1]);
    if (!s) throw new HttpFehler(404, 'Szenario nicht gefunden');
    const paket = oerPaket(s, { medienVerzeichnis: join(cfg.inhalte, s.id), basisUrl: cfg.basisUrl });
    res.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', ...KOPFZEILEN,
      'Content-Disposition': `attachment; filename="${s.id}-v${s.version}.html"`,
    });
    res.end(paket.html);
    return undefined;
  });

  route('GET', '/api/lehrende/oer/([a-z0-9-]+)/metadaten', 'lehrende', (_req, _res, m) => {
    const s = ladeSzenario(db, m[1]);
    if (!s) throw new HttpFehler(404, 'Szenario nicht gefunden');
    return oerPaket(s, { medienVerzeichnis: join(cfg.inhalte, s.id), basisUrl: cfg.basisUrl }).metadaten;
  });

  // Lesbare Bezeichnung einer Fehlerart: die ersten Worte der Rückmeldung, die das Szenario dafür vorsieht
  function fehlerart(knoten, typ) {
    const m = /^typisch-(\d+)$/.exec(typ ?? '');
    if (m) {
      const text = knoten?.typische_fehler?.[Number(m[1]) - 1]?.rueckmeldung ?? typ;
      return text.length > 48 ? `${text.slice(0, 46).replace(/\s+\S*$/, '')} …` : text;
    }
    return { vorzeichen: 'Vorzeichen falsch', einheit: 'Größenordnung (Einheit)' }[typ] ?? 'sonstige';
  }

  // Zähler je Knoten; bei Szenen dazu Text und Bewertung jeder Option, damit die Auswertung sie beschriften kann
  function neuerKnoten(s, id) {
    const def = s.knoten[id];
    const k = { knoten: id, titel: def?.titel ?? id, typ: def?.typ, versuche: 0, ersterVersuchRichtig: 0, aufgeloest: 0, optionen: {}, fehlerarten: {} };
    if (def?.typ === 'szene') {
      k.optionenText = Object.fromEntries(def.optionen.map((o) => [o.id, o.text]));
      k.optionenBewertung = Object.fromEntries(def.optionen.filter((o) => o.bewertung).map((o) => [o.id, o.bewertung]));
    }
    return k;
  }

  // Auswertung für Lehrende: nur Summen, und erst ab einer Mindestgruppe (Privacy by Default)
  function auswertung(q) {
    const id = q.get('szenario');
    const s = ladeSzenario(db, id);
    if (!s) throw new HttpFehler(404, 'Szenario nicht gefunden');
    const kurs = q.get('kurs') ? Number(q.get('kurs')) : null;
    const filter = "v.szenario_id = ? AND (? IS NULL OR n.kurs_id = ?) AND n.rolle = 'studierende'";
    const basis = db.prepare(`SELECT count(*) AS versuche, count(DISTINCT v.nutzer_id) AS personen, sum(v.beendet) AS beendet,
        avg(CASE WHEN v.beendet THEN v.punkte * 1.0 / nullif(v.max_punkte, 0) END) AS quote
        FROM versuch v JOIN nutzer n ON n.id = v.nutzer_id WHERE ${filter}`).get(id, kurs, kurs);
    const minGruppe = cfg.minGruppe ?? 3;
    if (basis.personen < minGruppe) return { szenario: id, zuWenig: true, minGruppe, personen: basis.personen };
    const ergebnisse = db.prepare(`SELECT v.ergebnis, count(*) AS n FROM versuch v JOIN nutzer n ON n.id = v.nutzer_id
        WHERE ${filter} AND v.beendet = 1 GROUP BY v.ergebnis`).all(id, kurs, kurs);
    const ereignisse = db.prepare(`SELECT e.daten, e.ergebnis, e.versuch_id FROM ereignis e JOIN versuch v ON v.id = e.versuch_id
        JOIN nutzer n ON n.id = v.nutzer_id WHERE ${filter} ORDER BY e.versuch_id, e.nr`).all(id, kurs, kurs);
    const knoten = {};
    const gesehen = new Set();
    for (const row of ereignisse) {
      const d = JSON.parse(row.daten);
      const r = row.ergebnis ? JSON.parse(row.ergebnis) : {};
      const k = (knoten[d.knoten] ??= neuerKnoten(s, d.knoten));
      if (d.typ === 'wahl') k.optionen[d.option] = (k.optionen[d.option] ?? 0) + 1;
      if (d.typ === 'antwort') {
        const erster = !gesehen.has(`${row.versuch_id}/${d.knoten}`);
        gesehen.add(`${row.versuch_id}/${d.knoten}`);
        if (erster) { k.versuche++; if (r.art === 'richtig') k.ersterVersuchRichtig++; }
        if (r.art === 'aufgeloest') k.aufgeloest++;
        if (r.art === 'falsch' || r.art === 'aufgeloest') {
          const art = fehlerart(s.knoten[d.knoten], r.typ);
          k.fehlerarten[art] = (k.fehlerarten[art] ?? 0) + 1;
        }
      }
    }
    const reihenfolge = Object.keys(s.knoten);
    return {
      szenario: id, version: s.version, ...basis, quote: basis.quote === null ? null : Math.round(basis.quote * 1000) / 1000,
      ergebnisse: Object.fromEntries(ergebnisse.map((e) => [e.ergebnis, e.n])),
      knoten: Object.values(knoten).sort((a, b) => reihenfolge.indexOf(a.knoten) - reihenfolge.indexOf(b.knoten)),
    };
  }

  // --- Auslieferung -----------------------------------------------------------------------------------------------
  // Text und SVG gehen komprimiert hinaus, wenn der Browser gzip annimmt; die komprimierte Fassung wird je Datei und
  // Änderungszeit einmal erzeugt und behalten (die Dateien sind klein und ändern sich selten).
  const gepackt = new Map();
  function sendeDatei(req, res, datei, kopf) {
    const typ = kopf['Content-Type'];
    const text = /^(text\/|application\/(json|manifest\+json)|image\/svg\+xml)/.test(typ);
    if (!text || !/\bgzip\b/.test(req.headers['accept-encoding'] ?? '')) {
      res.writeHead(200, text ? { ...kopf, Vary: 'Accept-Encoding' } : kopf);
      createReadStream(datei).pipe(res);
      return;
    }
    const stand = statSync(datei).mtimeMs;
    let g = gepackt.get(datei);
    if (!g || g.stand !== stand) gepackt.set(datei, (g = { stand, daten: gzipSync(readFileSync(datei), { level: 9 }) }));
    res.writeHead(200, { ...kopf, 'Content-Encoding': 'gzip', 'Content-Length': g.daten.length, Vary: 'Accept-Encoding' });
    res.end(g.daten);
  }

  function statisch(req, res, pfad) {
    if (pfad.startsWith('/medien/')) {
      const [, , sid, ...rest] = pfad.split('/');
      const datei = medienPfad(cfg.inhalte, sid, decodeURIComponent(rest.join('/')));
      if (!datei) return false;
      const typ = MEDIENTYPEN[extname(datei).toLowerCase()];
      sendeDatei(req, res, datei, { 'Content-Type': typ, 'Cache-Control': 'public, max-age=3600', ...(typ === 'image/svg+xml' ? SVG_KOPFZEILEN : KOPFZEILEN) });
      return true;
    }
    const rel = pfad === '/' || pfad === '/lehrende' ? (pfad === '/' ? '/index.html' : '/lehrende.html') : pfad;
    const datei = resolve(WEB, '.' + decodeURIComponent(rel));
    if (!datei.startsWith(WEB + sep) || !existsSync(datei) || !statSync(datei).isFile()) return false;
    const typ = TYPEN[extname(datei)] ?? 'application/octet-stream';
    sendeDatei(req, res, datei, { 'Content-Type': typ, 'Cache-Control': typ.startsWith('text/html') ? 'no-cache' : 'public, max-age=300', ...(typ === 'image/svg+xml' ? SVG_KOPFZEILEN : KOPFZEILEN) });
    return true;
  }

  const server = createServer(async (req, res) => {
    const start = process.hrtime.bigint();
    const url = new URL(req.url, 'http://lokal');
    const ip = req.socket.remoteAddress ?? '';
    res.on('finish', () => {
      if (cfg.zugriffsprotokoll) log.info?.(`${req.method} ${url.pathname} ${res.statusCode} ${(Number(process.hrtime.bigint() - start) / 1e6).toFixed(1)} ms`);
    });
    try {
      // Schreibende Anfragen nur von derselben Herkunft (zusätzlich zu SameSite=Strict)
      if (req.method !== 'GET' && req.method !== 'HEAD' && req.headers.origin) {
        const host = req.headers.host;
        if (new URL(req.headers.origin).host !== host) throw new HttpFehler(403, 'Fremde Herkunft');
      }
      for (const r of routen) {
        const m = r.methode === req.method && r.muster.exec(url.pathname);
        if (!m) continue;
        let nutzer = null;
        if (r.rolle) {
          nutzer = wer(req);
          if (!nutzer) throw new HttpFehler(401, 'Bitte anmelden');
          if (r.rolle !== 'alle' && nutzer.rolle !== r.rolle) throw new HttpFehler(403, 'Keine Berechtigung');
        }
        const out = await r.fn(req, res, m, ip, nutzer);
        if (out === undefined) return;
        if (out instanceof Antwort) json(res, out.status, out.daten, out.kopf);
        else json(res, 200, out);
        return;
      }
      if (url.pathname.startsWith('/api/')) throw new HttpFehler(404, 'Unbekannte Schnittstelle');
      if ((req.method === 'GET' || req.method === 'HEAD') && statisch(req, res, url.pathname)) return;
      throw new HttpFehler(404, 'Nicht gefunden');
    } catch (e) {
      if (e instanceof HttpFehler) return json(res, e.status, { fehler: e.message, ...(e.daten ? { stand: e.daten } : {}) });
      log.error?.(e);
      return json(res, 500, { fehler: 'Interner Fehler' });
    }
  });

  return {
    server, db, bericht,
    schliesse: () => new Promise((ok) => { clearInterval(aufraeumen); server.close(() => { db.close(); ok(); }); server.closeAllConnections?.(); }),
  };
}
