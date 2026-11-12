// HTTP-Server: statische Oberfläche, Medien der Szenarien und die JSON-Schnittstelle (beschrieben in
// docs/openapi.json). Nur Node.js-Bordmittel, keine Fremdbibliotheken.

import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync, createReadStream } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { join, resolve, extname, sep, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

import { oeffne, transaktion, raeumeAuf, SCHEMA_VERSION } from './db.js';
import { ladeVerzeichnis, speichereHochgeladen, speichereVersion, szenario as ladeSzenario, alleSzenarien, versionen, medienListe, medienPfad, MEDIENTYPEN } from './inhalte.js';
import { COOKIE, KOPFZEILEN, SVG_KOPFZEILEN, hash, token, code, normalisiereCode, gleich, pseudonym, leseCookies, cookieKopf, bremse } from './sicherheit.js';
import { HttpFehler } from './fehler.js';
import { gruppen, fehlerart, saeubere } from './gruppen.js';
import { starte, wende, spiele, SpielFehler } from '../engine/ablauf.js';
import { ansicht } from '../engine/ansicht.js';
import { neuerSeed } from '../engine/zufall.js';
import { statements } from '../engine/xapi.js';
import { sterne } from '../engine/wertung.js';
import { pruefeSzenario } from '../engine/szenario.js';
import { oerPaket } from '../oer-export.js';

const HIER = dirname(fileURLToPath(import.meta.url));
const WEB = resolve(HIER, '../web');
const OPENAPI = resolve(HIER, '../../docs/openapi.json');
const TYPEN = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json' };
const SITZUNG_TAGE = 120;
const MAX_KOERPER = 1024 * 1024;
const VORSCHAU_MINUTEN = 120;
const SEITEN = { '/': '/index.html', '/lehrende': '/lehrende.html', '/admin': '/admin.html' };

/** Antwort mit eigenem Status oder eigenen Kopfzeilen; alles andere geht als 200 mit JSON. */
class Antwort {
  constructor(status, daten, kopf = {}) { this.status = status; this.daten = daten; this.kopf = kopf; }
}
const mit = (status, daten, kopf) => new Antwort(status, daten, kopf);

export function erstelleApp(cfg) {
  const db = oeffne(cfg.datenbank);
  const log = cfg.log ?? console;
  const bericht = ladeVerzeichnis(db, cfg.inhalte, log);
  for (const a of bericht.abgelehnt) log.error?.(`Szenario abgelehnt: ${a.datei}\n${a.fehler.map((f) => `  ${f.pfad}: ${f.meldung}`).join('\n')}`);
  // Der gemeinsame Schlüssel der Instanz ist ein Zugang wie jeder andere: Die Administration kann ihn sperren.
  if (!db.prepare("SELECT 1 FROM zugang WHERE art = 'instanz'").get()) {
    const bisher = db.prepare("SELECT id FROM nutzer WHERE rolle = 'lehrende' ORDER BY id LIMIT 1").get();
    db.prepare("INSERT INTO zugang (art, bezeichnung, nutzer_id, erstellt) VALUES ('instanz', 'Gemeinsamer Schlüssel der Instanz', ?, ?)")
      .run(bisher?.id ?? null, new Date().toISOString());
  }
  if (cfg.demoKurscode) {
    const c = normalisiereCode(cfg.demoKurscode);
    if (!db.prepare('SELECT 1 FROM kurs WHERE code = ?').get(c)) {
      const k = db.prepare('INSERT INTO kurs (name, code, erstellt) VALUES (?, ?, ?)').run('Demokurs', c, new Date().toISOString());
      for (const s of alleSzenarien(db)) db.prepare('INSERT INTO kurs_szenario (kurs_id, szenario_id) VALUES (?, ?)').run(k.lastInsertRowid, s.id);
    }
  }
  // Aufbewahrungsfrist: Die Administration kann sie in der Oberfläche setzen; sonst gilt SBK_AUFBEWAHRUNG_TAGE.
  const aufbewahrungTage = () => Number(db.prepare("SELECT wert FROM einstellung WHERE schluessel = 'aufbewahrung_tage'").get()?.wert ?? cfg.aufbewahrungTage);
  raeumeAuf(db, aufbewahrungTage());
  const aufraeumen = setInterval(() => raeumeAuf(db, aufbewahrungTage()), 6 * 3600 * 1000);
  aufraeumen.unref();
  const fehlversuche = bremse(cfg.maxFehlversuche ?? 20);
  const minGruppe = cfg.minGruppe ?? 3;
  const gr = gruppen({ db, ladeSzenario, minGruppe });
  const vorschauen = new Map(); // Entwürfe aus dem Editor für die Vorschau, nur im Speicher und nur kurz

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
    const n = db.prepare(`SELECT n.id, n.rolle, n.pseudonym, n.kurs_id, n.ton, k.name AS kurs, z.bezeichnung AS zugang, z.gesperrt
                          FROM sitzung s JOIN nutzer n ON n.id = s.nutzer_id LEFT JOIN kurs k ON k.id = n.kurs_id
                          LEFT JOIN zugang z ON z.nutzer_id = n.id WHERE s.token_hash = ? AND s.ablauf > ?`).get(hash(t), jetzt());
    if (!n || (n.rolle === 'lehrende' && n.gesperrt)) return null; // gesperrter Zugang: sofort abgemeldet
    db.prepare('UPDATE nutzer SET zuletzt = ? WHERE id = ?').run(jetzt(), n.id);
    return n;
  }

  /** Protokoll der Verwaltung: wer (Rolle und Zugang, nie Studierende) hat wann was getan. */
  function protokolliere(nutzer, aktion, ziel = null, details = null) {
    const rolle = nutzer?.rolle ?? 'unbekannt';
    const akteur = nutzer?.akteur ?? (rolle === 'admin' ? 'Administration' : nutzer?.zugang ?? nutzer?.pseudonym ?? 'unbekannt');
    db.prepare('INSERT INTO protokoll (zeit, rolle, akteur, aktion, ziel, details) VALUES (?, ?, ?, ?, ?, ?)')
      .run(jetzt(), rolle, akteur, aktion, ziel, details === null ? null : JSON.stringify(details));
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

  // Lehrende: gemeinsamer Schlüssel der Instanz oder ein persönlicher Zugang, den die Administration vergibt
  route('POST', '/api/anmelden/lehrende', null, async (req, _res, _m, ip) => {
    if (!fehlversuche.erlaubt(ip)) throw new HttpFehler(429, 'Zu viele Fehlversuche. Bitte eine Minute warten.');
    const { schluessel } = await koerper(req);
    let z = null;
    if (cfg.lehrendeSchluessel && gleich(schluessel ?? '', cfg.lehrendeSchluessel)) z = db.prepare("SELECT * FROM zugang WHERE art = 'instanz'").get();
    else if (typeof schluessel === 'string' && schluessel) z = db.prepare("SELECT * FROM zugang WHERE art = 'persoenlich' AND schluessel_hash = ?").get(hash(schluessel.trim()));
    if (!z) {
      fehlversuche.fehlschlag(ip);
      protokolliere({ rolle: 'lehrende', akteur: 'unbekannt' }, 'Anmeldung fehlgeschlagen');
      throw new HttpFehler(403, 'Schlüssel falsch.');
    }
    if (z.gesperrt) {
      protokolliere({ rolle: 'lehrende', akteur: z.bezeichnung }, 'Anmeldung abgewiesen: Zugang gesperrt');
      throw new HttpFehler(403, 'Dieser Zugang ist gesperrt. Bitte wenden Sie sich an die Administration.');
    }
    let n = z.nutzer_id ? db.prepare('SELECT id, pseudonym FROM nutzer WHERE id = ?').get(z.nutzer_id) : null;
    if (!n) {
      n = neuerNutzer('lehrende', null);
      db.prepare('UPDATE zugang SET nutzer_id = ? WHERE id = ?').run(n.id, z.id);
    }
    protokolliere({ rolle: 'lehrende', akteur: z.bezeichnung }, 'Anmeldung');
    return mit(200, { rolle: 'lehrende', pseudonym: n.pseudonym, zugang: z.bezeichnung }, { 'Set-Cookie': neueSitzung(n.id) });
  });

  route('POST', '/api/anmelden/admin', null, async (req, _res, _m, ip) => {
    if (!fehlversuche.erlaubt(ip)) throw new HttpFehler(429, 'Zu viele Fehlversuche. Bitte eine Minute warten.');
    const { schluessel } = await koerper(req);
    if (!cfg.adminSchluessel || !gleich(schluessel ?? '', cfg.adminSchluessel)) {
      fehlversuche.fehlschlag(ip);
      protokolliere({ rolle: 'admin', akteur: 'unbekannt' }, 'Anmeldung fehlgeschlagen');
      throw new HttpFehler(403, 'Schlüssel falsch.');
    }
    let n = db.prepare("SELECT id, pseudonym FROM nutzer WHERE rolle = 'admin' ORDER BY id LIMIT 1").get();
    if (!n) n = neuerNutzer('admin', null);
    protokolliere({ rolle: 'admin' }, 'Anmeldung');
    return mit(200, { rolle: 'admin', pseudonym: n.pseudonym }, { 'Set-Cookie': neueSitzung(n.id) });
  });

  route('POST', '/api/abmelden', 'alle', (req) => {
    const t = leseCookies(req.headers.cookie)[COOKIE];
    db.prepare('DELETE FROM sitzung WHERE token_hash = ?').run(hash(t));
    return mit(200, { ok: true }, { 'Set-Cookie': cookieKopf('', 0, cfg.sichereCookies) });
  });

  route('GET', '/api/ich', 'alle', (_req, _res, _m, _ip, n) => ({ rolle: n.rolle, pseudonym: n.pseudonym, kurs: n.kurs, zugang: n.zugang ?? null, ton: Boolean(n.ton) }));

  // Einstellungen je Person; bisher nur der Ton (aus, bis die Person ihn einschaltet)
  route('PUT', '/api/ich/einstellungen', 'alle', async (req, _res, _m, _ip, n) => {
    const { ton } = await koerper(req);
    if (typeof ton !== 'boolean') throw new HttpFehler(400, 'ton muss true oder false sein');
    db.prepare('UPDATE nutzer SET ton = ? WHERE id = ?').run(ton ? 1 : 0, n.id);
    return { ton };
  });

  // Recht auf Löschung (Art. 17 DSGVO): alles zu dieser Person, sofort
  route('DELETE', '/api/ich', 'studierende', (_req, _res, _m, _ip, n) => {
    db.prepare('DELETE FROM nutzer WHERE id = ?').run(n.id);
    return mit(200, { geloescht: true }, { 'Set-Cookie': cookieKopf('', 0, cfg.sichereCookies) });
  });

  route('GET', '/api/ich/daten', 'studierende', (_req, _res, _m, _ip, n) => ({
    pseudonym: n.pseudonym, kurs: n.kurs, ton: Boolean(n.ton),
    versuche: db.prepare('SELECT id, szenario_id, szenario_version, gestartet, aktualisiert, beendet, ergebnis, punkte, max_punkte FROM versuch WHERE nutzer_id = ?').all(n.id)
      .map((v) => ({ ...v, ereignisse: db.prepare('SELECT nr, daten, zeit FROM ereignis WHERE versuch_id = ? ORDER BY nr').all(v.id).map((e) => ({ ...e, daten: JSON.parse(e.daten) })) })),
    gruppen: db.prepare(`SELECT g.id, g.art, g.szenario_id, g.szenario_version, m.beigetreten FROM gruppe_mitglied m JOIN gruppe g ON g.id = m.gruppe_id
                         WHERE m.nutzer_id = ? ORDER BY m.beigetreten`).all(n.id)
      .map((g) => ({ ...g, stimmen: db.prepare('SELECT nr, daten, zeit FROM stimme WHERE gruppe_id = ? AND nutzer_id = ? ORDER BY nr').all(g.id, n.id).map((st) => ({ ...st, daten: JSON.parse(st.daten) })) })),
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
      const e = saeubere(ereignis);
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

  route('POST', '/api/lehrende/kurse', 'lehrende', async (req, _res, _m, _ip, n) => {
    const { name, szenarien = [] } = await koerper(req);
    if (!name || String(name).length > 120) throw new HttpFehler(400, 'Name fehlt oder ist zu lang');
    const c = code(8);
    return transaktion(db, () => {
      const k = db.prepare('INSERT INTO kurs (name, code, erstellt) VALUES (?, ?, ?)').run(String(name), normalisiereCode(c), jetzt());
      for (const id of szenarien) {
        if (!ladeSzenario(db, id)) throw new HttpFehler(400, `Szenario „${id}“ gibt es nicht`);
        db.prepare('INSERT INTO kurs_szenario (kurs_id, szenario_id) VALUES (?, ?)').run(k.lastInsertRowid, id);
      }
      protokolliere(n, 'Kurs angelegt', String(name));
      return mit(201, { id: Number(k.lastInsertRowid), name, code: c });
    });
  });

  route('PUT', '/api/lehrende/kurse/(\\d+)/szenarien', 'lehrende', async (req, _res, m, _ip, n) => {
    const { szenarien } = await koerper(req);
    if (!Array.isArray(szenarien)) throw new HttpFehler(400, 'szenarien muss eine Liste sein');
    return transaktion(db, () => {
      const kurs = db.prepare('SELECT name FROM kurs WHERE id = ?').get(Number(m[1]));
      if (!kurs) throw new HttpFehler(404, 'Kurs nicht gefunden');
      protokolliere(n, 'Freigabe geändert', kurs.name, { szenarien });
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

  route('POST', '/api/lehrende/szenarien/pruefen', 'lehrende', async (req) => pruefeSzenario(await koerper(req)));

  route('POST', '/api/lehrende/szenarien', 'lehrende', async (req, _res, _m, _ip, n) => {
    const s = await koerper(req);
    const r = speichereHochgeladen(db, s);
    if (r.ok) protokolliere(n, 'Szenario hochgeladen', `${s.id} v${s.version}`);
    return mit(r.ok ? 201 : 422, r);
  });

  // --- Editor: ein Szenario als JSON öffnen und als neue Version speichern ---------------------------------------
  route('GET', '/api/lehrende/szenarien/([a-z0-9-]+)', 'lehrende', (_req, _res, m) => {
    const s = ladeSzenario(db, m[1]);
    if (!s) throw new HttpFehler(404, 'Szenario nicht gefunden');
    return { szenario: s, versionen: versionen(db, s.id), medien: medienListe(cfg.inhalte, s.id) };
  });

  route('POST', '/api/lehrende/szenarien/([a-z0-9-]+)/versionen', 'lehrende', async (req, _res, m, _ip, n) => {
    const { szenario: s, basis } = await koerper(req);
    if (!s || typeof s !== 'object' || Array.isArray(s)) throw new HttpFehler(400, 'szenario fehlt');
    if (!Number.isInteger(basis) || basis < 0) throw new HttpFehler(400, 'basis muss die Version sein, auf der die Änderung beruht (0 für ein neues Szenario)');
    const r = speichereVersion(db, { ...s, id: m[1] }, { basis });
    if (r.ok) protokolliere(n, 'Szenario im Editor gespeichert', `${m[1]} v${r.version}`);
    return mit(r.ok ? 201 : r.konflikt ? 409 : 422, r);
  });

  // Vorschau eines Entwurfs: dieselbe Offline-Fassung wie der OER-Export, nur im Speicher und nur für Lehrende
  route('POST', '/api/lehrende/vorschau', 'lehrende', async (req) => {
    const { szenario: s } = await koerper(req);
    const r = pruefeSzenario(s);
    if (r.fehler.length) return mit(422, r);
    const grenze = Date.now() - VORSCHAU_MINUTEN * 60000;
    for (const [id, v] of vorschauen) if (v.zeit < grenze || vorschauen.size > 100) vorschauen.delete(id);
    const id = randomUUID();
    vorschauen.set(id, { szenario: s, zeit: Date.now() });
    return mit(201, { id, adresse: `/api/lehrende/vorschau/${id}`, warnungen: r.warnungen });
  });

  route('GET', '/api/lehrende/vorschau/([0-9a-f-]{36})', 'lehrende', (_req, res, m) => {
    const v = vorschauen.get(m[1]);
    if (!v) throw new HttpFehler(404, 'Vorschau abgelaufen. Bitte im Editor erneut „Vorschau“ wählen.');
    const p = oerPaket(v.szenario, { medienVerzeichnis: join(cfg.inhalte, v.szenario.id), basisUrl: cfg.basisUrl, vorschau: true });
    res.writeHead(200, {
      ...KOPFZEILEN, 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store',
      // Die Offline-Fassung hat Stil und Skript in der Seite; erlaubt sind genau diese beiden (Prüfsummen), sonst nichts
      'Content-Security-Policy': `default-src 'none'; img-src data:; style-src '${p.pruefsummen.stil}'; script-src '${p.pruefsummen.skript}'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'`,
    });
    res.end(p.html);
    return undefined;
  });

  route('GET', '/api/lehrende/auswertung', 'lehrende', (req) => auswertung(new URL(req.url, 'http://x').searchParams));

  route('GET', '/api/lehrende/xapi', 'lehrende', (req, _res, _m, _ip, n) => {
    const q = new URL(req.url, 'http://x').searchParams;
    protokolliere(n, 'xAPI-Export', q.get('szenario'));
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

  route('GET', '/api/lehrende/oer/([a-z0-9-]+)', 'lehrende', (_req, res, m, _ip, n) => {
    const s = ladeSzenario(db, m[1]);
    if (!s) throw new HttpFehler(404, 'Szenario nicht gefunden');
    protokolliere(n, 'OER-Export', `${s.id} v${s.version}`);
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

  // --- Teamspiel: Studierende eines Kurses teilen sich einen Spielstand ----------------------------------------
  route('POST', '/api/teams', 'studierende', async (req, _res, _m, _ip, n) => {
    const { szenario: id } = await koerper(req);
    const s = szenarioFuer(n, id);
    return mit(201, gr.neu('team', { kursId: n.kurs_id, szenario: s, nutzerId: n.id }));
  });

  route('POST', '/api/teams/beitreten', 'studierende', async (req, _res, _m, ip, n) => {
    if (!fehlversuche.erlaubt(ip)) throw new HttpFehler(429, 'Zu viele falsche Codes. Bitte eine Minute warten.');
    const { code: eingabe } = await koerper(req);
    const t = gr.teamMitCode(n.kurs_id, eingabe);
    if (!t) { fehlversuche.fehlschlag(ip); throw new HttpFehler(404, 'Diesen Team-Code gibt es in Ihrem Kurs nicht (oder das Spiel ist zu Ende).'); }
    gr.tritteBei(t.id, n.id);
    return { gruppe: t.id };
  });

  // Laufende Teams der Person und Kursrunden ihres Kurses (für die Übersicht)
  route('GET', '/api/gruppen', 'studierende', (_req, _res, _m, _ip, n) => {
    const titel = (id, v) => ladeSzenario(db, id, v)?.titel ?? id;
    return {
      runden: db.prepare(`SELECT g.id, g.szenario_id, g.szenario_version, g.erstellt, EXISTS (SELECT 1 FROM gruppe_mitglied WHERE gruppe_id = g.id AND nutzer_id = ?) AS dabei
                          FROM gruppe g WHERE g.art = 'runde' AND g.kurs_id = ? AND g.status = 'laeuft' AND g.beendet = 0 ORDER BY g.erstellt DESC`).all(n.id, n.kurs_id)
        .map((g) => ({ id: g.id, szenario: g.szenario_id, titel: titel(g.szenario_id, g.szenario_version), dabei: Boolean(g.dabei) })),
      teams: db.prepare(`SELECT g.id, g.szenario_id, g.szenario_version, g.code FROM gruppe g JOIN gruppe_mitglied m ON m.gruppe_id = g.id
                         WHERE m.nutzer_id = ? AND g.art = 'team' AND g.beendet = 0 ORDER BY g.aktualisiert DESC LIMIT 5`).all(n.id)
        .map((g) => ({ id: g.id, szenario: g.szenario_id, titel: titel(g.szenario_id, g.szenario_version), code: `${g.code.slice(0, 3)}-${g.code.slice(3)}` })),
    };
  });

  route('POST', '/api/runden/([0-9a-f-]{36})/beitreten', 'studierende', (_req, _res, m, _ip, n) => {
    const g = db.prepare("SELECT id FROM gruppe WHERE id = ? AND art = 'runde' AND kurs_id = ? AND status = 'laeuft'").get(m[1], n.kurs_id);
    if (!g) throw new HttpFehler(404, 'Diese Runde gibt es in Ihrem Kurs nicht (mehr).');
    gr.tritteBei(g.id, n.id);
    return { gruppe: g.id };
  });

  route('GET', '/api/gruppen/([0-9a-f-]{36})', 'studierende', (_req, _res, m, _ip, n) => gr.standFuer(m[1], n));

  route('GET', '/api/gruppen/([0-9a-f-]{36})/live', 'studierende', (req, res, m, _ip, n) => {
    gr.abonniere(req, res, m[1], { nutzerId: n.id });
    return undefined;
  });

  route('POST', '/api/gruppen/([0-9a-f-]{36})/stimmen', 'studierende', async (req, _res, m, _ip, n) => {
    const { nr, ereignis } = await koerper(req);
    return gr.stimme(m[1], n, { nr, ereignis });
  });

  route('POST', '/api/gruppen/([0-9a-f-]{36})/schliessen', 'studierende', async (req, _res, m, _ip, n) => {
    const { nr } = await koerper(req);
    gr.schliesse(m[1], { nutzer: n, nr });
    return gr.standFuer(m[1], n);
  });

  // --- Kursrunde: Lehrende starten eine Live-Runde, sehen Summen je Schritt und schließen die Abstimmung ---------
  route('GET', '/api/lehrende/runden', 'lehrende', () => db.prepare(`SELECT g.id, g.szenario_id, g.szenario_version, g.status, g.beendet, g.erstellt, k.name AS kurs,
      (SELECT count(*) FROM gruppe_mitglied WHERE gruppe_id = g.id) AS teilnehmende
      FROM gruppe g LEFT JOIN kurs k ON k.id = g.kurs_id WHERE g.art = 'runde' ORDER BY g.erstellt DESC LIMIT 20`).all()
    .map((g) => ({ id: g.id, kurs: g.kurs, szenario: g.szenario_id, titel: ladeSzenario(db, g.szenario_id, g.szenario_version)?.titel ?? g.szenario_id,
      laeuft: g.status === 'laeuft' && !g.beendet, teilnehmende: g.teilnehmende, gestartet: g.erstellt })));

  route('POST', '/api/lehrende/runden', 'lehrende', async (req, _res, _m, _ip, n) => {
    const { kurs, szenario: id } = await koerper(req);
    const k = db.prepare('SELECT id, name FROM kurs WHERE id = ?').get(Number(kurs));
    if (!k) throw new HttpFehler(400, 'Kurs nicht gefunden');
    if (!db.prepare('SELECT 1 FROM kurs_szenario WHERE kurs_id = ? AND szenario_id = ?').get(k.id, id)) throw new HttpFehler(400, 'Das Szenario ist in diesem Kurs nicht freigegeben');
    const s = ladeSzenario(db, id);
    const r = gr.neu('runde', { kursId: k.id, szenario: s });
    protokolliere(n, 'Live-Runde gestartet', `${k.name}: ${s.titel}`);
    return mit(201, { id: r.id });
  });

  route('GET', '/api/lehrende/runden/([0-9a-f-]{36})', 'lehrende', (_req, _res, m) => gr.rundeAnsicht(m[1]));

  route('GET', '/api/lehrende/runden/([0-9a-f-]{36})/live', 'lehrende', (req, res, m) => {
    gr.abonniere(req, res, m[1], { lehrende: true });
    return undefined;
  });

  route('POST', '/api/lehrende/runden/([0-9a-f-]{36})/schliessen', 'lehrende', async (req, _res, m) => {
    const { nr } = await koerper(req);
    gr.schliesse(m[1], { lehrende: true, nr });
    return gr.rundeAnsicht(m[1]);
  });

  route('POST', '/api/lehrende/runden/([0-9a-f-]{36})/beenden', 'lehrende', (_req, _res, m, _ip, n) => {
    gr.beende(m[1]);
    const r = gr.rundeAnsicht(m[1]);
    protokolliere(n, 'Live-Runde beendet', `${r.runde.kurs}: ${r.runde.szenario}`);
    return r;
  });

  // --- Administration: Zugänge für Lehrende, Aufbewahrungsfrist, Einstellungen der Instanz, Protokoll -----------
  route('GET', '/api/admin/zugaenge', 'admin', () => db.prepare(`SELECT z.id, z.art, z.bezeichnung, z.gesperrt, z.erstellt, n.zuletzt AS zuletzt
      FROM zugang z LEFT JOIN nutzer n ON n.id = z.nutzer_id ORDER BY z.id`).all().map((z) => ({ ...z, gesperrt: Boolean(z.gesperrt) })));

  route('POST', '/api/admin/zugaenge', 'admin', async (req, _res, _m, _ip, n) => {
    const { bezeichnung } = await koerper(req);
    const b = String(bezeichnung ?? '').trim();
    if (!b || b.length > 80) throw new HttpFehler(400, 'Bezeichnung fehlt oder ist länger als 80 Zeichen');
    const schluessel = `${code(8)}-${code(8)}`;
    const r = db.prepare("INSERT INTO zugang (art, bezeichnung, schluessel_hash, erstellt) VALUES ('persoenlich', ?, ?, ?)").run(b, hash(schluessel), jetzt());
    protokolliere(n, 'Zugang angelegt', b);
    return mit(201, { id: Number(r.lastInsertRowid), bezeichnung: b, schluessel });
  });

  route('PUT', '/api/admin/zugaenge/(\\d+)', 'admin', async (req, _res, m, _ip, n) => {
    const { gesperrt } = await koerper(req);
    if (typeof gesperrt !== 'boolean') throw new HttpFehler(400, 'gesperrt muss true oder false sein');
    const z = db.prepare('SELECT * FROM zugang WHERE id = ?').get(Number(m[1]));
    if (!z) throw new HttpFehler(404, 'Zugang nicht gefunden');
    transaktion(db, () => {
      db.prepare('UPDATE zugang SET gesperrt = ? WHERE id = ?').run(gesperrt ? 1 : 0, z.id);
      if (gesperrt && z.nutzer_id) db.prepare('DELETE FROM sitzung WHERE nutzer_id = ?').run(z.nutzer_id);
      protokolliere(n, gesperrt ? 'Zugang gesperrt' : 'Zugang entsperrt', z.bezeichnung);
    });
    return { id: z.id, gesperrt };
  });

  function instanz() {
    const zahl = (sql) => db.prepare(sql).get().n;
    const groesse = db.prepare('SELECT page_count * page_size AS n FROM pragma_page_count(), pragma_page_size()').get().n;
    return [
      ['Version', cfg.version], ['Node.js', process.version], ['Datenbank-Schema', `Version ${SCHEMA_VERSION}`],
      ['Datenbank', `${Math.round(groesse / 1024)} KB`], ['Öffentliche Adresse', cfg.basisUrl],
      ['Sichere Cookies (HTTPS)', cfg.sichereCookies ? 'an' : 'aus'], ['Zugriffsprotokoll', cfg.zugriffsprotokoll ? 'an' : 'aus'],
      ['Auswertung ab', `${minGruppe} Personen`], ['Szenarien', zahl('SELECT count(DISTINCT id) AS n FROM szenario')],
      ['Szenario-Versionen', zahl('SELECT count(*) AS n FROM szenario')], ['Kurse', zahl('SELECT count(*) AS n FROM kurs')],
      ['Studierende (Pseudonyme)', zahl("SELECT count(*) AS n FROM nutzer WHERE rolle = 'studierende'")],
      ['Zugänge für Lehrende', zahl('SELECT count(*) AS n FROM zugang')], ['davon gesperrt', zahl('SELECT count(*) AS n FROM zugang WHERE gesperrt = 1')],
      ['Laufende Live-Runden', zahl("SELECT count(*) AS n FROM gruppe WHERE art = 'runde' AND status = 'laeuft' AND beendet = 0")],
    ].map(([name, wert]) => ({ name, wert: String(wert) }));
  }

  route('GET', '/api/admin/einstellungen', 'admin', () => ({
    aufbewahrungTage: aufbewahrungTage(),
    aufbewahrungQuelle: db.prepare("SELECT 1 FROM einstellung WHERE schluessel = 'aufbewahrung_tage'").get() ? 'Oberfläche' : 'Voreinstellung (SBK_AUFBEWAHRUNG_TAGE)',
    instanz: instanz(),
  }));

  route('PUT', '/api/admin/einstellungen', 'admin', async (req, _res, _m, _ip, n) => {
    const { aufbewahrungTage: tage } = await koerper(req);
    if (!Number.isInteger(tage) || tage < 7 || tage > 3650) throw new HttpFehler(400, 'Aufbewahrungsfrist: ganze Zahl von 7 bis 3650 Tagen');
    const vorher = aufbewahrungTage();
    db.prepare("INSERT INTO einstellung (schluessel, wert) VALUES ('aufbewahrung_tage', ?) ON CONFLICT (schluessel) DO UPDATE SET wert = excluded.wert").run(String(tage));
    protokolliere(n, 'Aufbewahrungsfrist geändert', `${vorher} → ${tage} Tage`);
    const geloescht = raeumeAuf(db, tage);
    return { aufbewahrungTage: tage, geloescht };
  });

  route('GET', '/api/admin/protokoll', 'admin', () => db.prepare('SELECT id, zeit, rolle, akteur, aktion, ziel, details FROM protokoll ORDER BY id DESC LIMIT 200').all()
    .map((p) => ({ ...p, details: p.details ? JSON.parse(p.details) : null })));

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
    const rel = SEITEN[pfad] ?? pfad;
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
    schliesse: () => new Promise((ok) => { clearInterval(aufraeumen); gr.schliesseAlle(); server.close(() => { db.close(); ok(); }); server.closeAllConnections?.(); }),
  };
}
