// Szenarien: Dateien unter inhalte/szenarien/<id>/szenario.json (mit Medien daneben), von Lehrenden hochgeladen oder
// im Editor gespeichert. Jede Version wird unverändert in der Datenbank abgelegt; ein Versuch bleibt an seine
// Version gebunden und lässt sich auch nach einer Überarbeitung des Szenarios noch nachrechnen.

import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, resolve, sep, extname, relative } from 'node:path';
import { pruefeSzenario } from '../engine/szenario.js';

export const MEDIENTYPEN = { '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' };

/** Liest alle Szenario-Dateien ein. Fehlerhafte werden gemeldet und nicht geladen. */
export function ladeVerzeichnis(db, verzeichnis, log = console) {
  const bericht = { geladen: [], unveraendert: [], abgelehnt: [] };
  if (!existsSync(verzeichnis)) return bericht;
  const jetzt = new Date().toISOString();
  for (const eintrag of readdirSync(verzeichnis, { withFileTypes: true })) {
    if (!eintrag.isDirectory() || eintrag.name.startsWith('.')) continue;
    const datei = join(verzeichnis, eintrag.name, 'szenario.json');
    if (!existsSync(datei)) continue;
    let s;
    try {
      s = JSON.parse(readFileSync(datei, 'utf8'));
    } catch (e) {
      bericht.abgelehnt.push({ datei, fehler: [{ pfad: '', meldung: `JSON nicht lesbar: ${e.message}` }] });
      continue;
    }
    const { fehler, warnungen } = pruefeSzenario(s);
    if (s.id !== eintrag.name) fehler.push({ pfad: 'id', meldung: `id „${s.id}“ passt nicht zum Ordnernamen „${eintrag.name}“` });
    if (fehler.length) { bericht.abgelehnt.push({ datei, fehler }); continue; }
    for (const w of warnungen) log.warn?.(`Szenario ${s.id}: ${w.pfad}: ${w.meldung}`);
    const json = JSON.stringify(s);
    const vorhanden = db.prepare('SELECT json FROM szenario WHERE id = ? AND version = ?').get(s.id, s.version);
    if (!vorhanden) {
      db.prepare("INSERT INTO szenario (id, version, json, quelle, geladen) VALUES (?, ?, ?, 'datei', ?)").run(s.id, s.version, json, jetzt);
      bericht.geladen.push(`${s.id} v${s.version}`);
    } else if (vorhanden.json !== json) {
      // Versionen sind unveränderlich: geänderter Inhalt braucht eine neue Versionsnummer
      bericht.abgelehnt.push({ datei, fehler: [{ pfad: 'version', meldung: `Inhalt geändert, aber version ${s.version} ist schon geladen. Bitte version erhöhen.` }] });
    } else {
      bericht.unveraendert.push(`${s.id} v${s.version}`);
    }
  }
  return bericht;
}

/** Speichert ein hochgeladenes Szenario als neue Version. */
export function speichereHochgeladen(db, s) {
  const { fehler, warnungen } = pruefeSzenario(s);
  if (fehler.length) return { ok: false, fehler, warnungen };
  const hoechste = db.prepare('SELECT max(version) AS v FROM szenario WHERE id = ?').get(s.id).v ?? 0;
  if (s.version <= hoechste) {
    return { ok: false, fehler: [{ pfad: 'version', meldung: `Version ${s.version} ist nicht neuer als die geladene Version ${hoechste}` }], warnungen };
  }
  db.prepare("INSERT INTO szenario (id, version, json, quelle, geladen) VALUES (?, ?, ?, 'hochgeladen', ?)")
    .run(s.id, s.version, JSON.stringify(s), new Date().toISOString());
  return { ok: true, fehler: [], warnungen };
}

/**
 * Speichert eine im Editor bearbeitete Fassung als neue Version (höchste + 1). `basis` ist die Version, die im Editor
 * geöffnet war (0 für ein neues Szenario); hat inzwischen jemand anderes gespeichert, wird nichts überschrieben.
 */
export function speichereVersion(db, s, { basis, quelle = 'editor' }) {
  const hoechste = db.prepare('SELECT max(version) AS v FROM szenario WHERE id = ?').get(s.id).v ?? 0;
  if (basis !== hoechste) {
    const meldung = basis === 0 ? `Die Kennung „${s.id}“ ist schon vergeben. Bitte eine andere wählen.` : `Inzwischen gibt es Version ${hoechste}. Bitte das Szenario neu öffnen; Ihre Änderungen sind nicht gespeichert.`;
    return { ok: false, konflikt: true, hoechste, fehler: [{ pfad: 'version', meldung }], warnungen: [] };
  }
  const neu = { ...s, version: hoechste + 1 };
  const { fehler, warnungen } = pruefeSzenario(neu);
  if (fehler.length) return { ok: false, fehler, warnungen };
  db.prepare('INSERT INTO szenario (id, version, json, quelle, geladen) VALUES (?, ?, ?, ?, ?)')
    .run(neu.id, neu.version, JSON.stringify(neu), quelle, new Date().toISOString());
  return { ok: true, version: neu.version, fehler: [], warnungen };
}

/** Alle Versionen eines Szenarios, neueste zuerst. */
export function versionen(db, id) {
  return db.prepare('SELECT version, quelle, geladen FROM szenario WHERE id = ? ORDER BY version DESC').all(id);
}

/** Bilder im Ordner eines Szenarios (für die Bildauswahl im Editor), relativ zum Ordner. */
export function medienListe(verzeichnis, szenarioId) {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(szenarioId)) return [];
  const basis = resolve(verzeichnis, szenarioId);
  if (!existsSync(basis)) return [];
  return readdirSync(basis, { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile() && MEDIENTYPEN[extname(e.name).toLowerCase()])
    .map((e) => relative(basis, join(e.parentPath ?? e.path, e.name)).split(sep).join('/')).sort();
}

const cache = new Map();

/** Ein Szenario in einer bestimmten Version, ohne Version die neueste. */
export function szenario(db, id, version) {
  const row = version
    ? db.prepare('SELECT id, version, json FROM szenario WHERE id = ? AND version = ?').get(id, version)
    : db.prepare('SELECT id, version, json FROM szenario WHERE id = ? ORDER BY version DESC LIMIT 1').get(id);
  if (!row) return null;
  const key = `${row.id}@${row.version}`;
  if (!cache.has(key)) cache.set(key, JSON.parse(row.json));
  return cache.get(key);
}

/** Alle Szenarien, jeweils die neueste Version. */
export function alleSzenarien(db) {
  return db.prepare(`SELECT s.id, s.version, s.quelle, s.geladen FROM szenario s
                     WHERE s.version = (SELECT max(version) FROM szenario WHERE id = s.id) ORDER BY s.id`).all()
    .map((r) => ({ ...r, szenario: szenario(db, r.id, r.version) }));
}

/** Pfad einer Mediendatei, nur innerhalb des Szenario-Ordners und nur Bildformate. */
export function medienPfad(verzeichnis, szenarioId, datei) {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(szenarioId)) return null;
  const basis = resolve(verzeichnis, szenarioId);
  const pfad = resolve(basis, datei);
  if (!pfad.startsWith(basis + sep) || !MEDIENTYPEN[extname(pfad).toLowerCase()] || !existsSync(pfad)) return null;
  return pfad;
}
