// Datenhaltung mit SQLite (node:sqlite, in Node.js enthalten; keine Fremdbibliothek, eine Datei, leicht zu sichern).
// Gespeichert werden nur Pseudonyme, Versuche und Spielereignisse: keine Namen, keine E-Mail-Adressen, keine
// IP-Adressen. Der Austausch gegen PostgreSQL wäre auf diese Datei beschränkt.

import { DatabaseSync } from 'node:sqlite';

const SCHEMA = [
  // Version 1
  `CREATE TABLE kurs (
     id INTEGER PRIMARY KEY, name TEXT NOT NULL, code TEXT NOT NULL UNIQUE, erstellt TEXT NOT NULL);
   CREATE TABLE kurs_szenario (
     kurs_id INTEGER NOT NULL REFERENCES kurs(id) ON DELETE CASCADE, szenario_id TEXT NOT NULL,
     PRIMARY KEY (kurs_id, szenario_id));
   CREATE TABLE nutzer (
     id INTEGER PRIMARY KEY, rolle TEXT NOT NULL CHECK (rolle IN ('studierende', 'lehrende')),
     pseudonym TEXT NOT NULL UNIQUE, kurs_id INTEGER REFERENCES kurs(id) ON DELETE CASCADE,
     wiederkehr_hash TEXT UNIQUE, erstellt TEXT NOT NULL, zuletzt TEXT NOT NULL);
   CREATE TABLE sitzung (
     token_hash TEXT PRIMARY KEY, nutzer_id INTEGER NOT NULL REFERENCES nutzer(id) ON DELETE CASCADE,
     ablauf TEXT NOT NULL);
   CREATE TABLE szenario (
     id TEXT NOT NULL, version INTEGER NOT NULL, json TEXT NOT NULL, quelle TEXT NOT NULL, geladen TEXT NOT NULL,
     PRIMARY KEY (id, version));
   CREATE TABLE versuch (
     id TEXT PRIMARY KEY, nutzer_id INTEGER NOT NULL REFERENCES nutzer(id) ON DELETE CASCADE,
     szenario_id TEXT NOT NULL, szenario_version INTEGER NOT NULL, seed INTEGER NOT NULL,
     gestartet TEXT NOT NULL, aktualisiert TEXT NOT NULL, knoten TEXT NOT NULL,
     beendet INTEGER NOT NULL DEFAULT 0, ergebnis TEXT, punkte REAL NOT NULL DEFAULT 0, max_punkte REAL NOT NULL DEFAULT 0,
     FOREIGN KEY (szenario_id, szenario_version) REFERENCES szenario(id, version));
   CREATE INDEX versuch_nutzer ON versuch(nutzer_id);
   CREATE INDEX versuch_szenario ON versuch(szenario_id);
   CREATE TABLE ereignis (
     versuch_id TEXT NOT NULL REFERENCES versuch(id) ON DELETE CASCADE, nr INTEGER NOT NULL,
     daten TEXT NOT NULL, ergebnis TEXT, zeit TEXT NOT NULL, PRIMARY KEY (versuch_id, nr));`,
];

export function oeffne(pfad) {
  const db = new DatabaseSync(pfad);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000; PRAGMA synchronous = NORMAL;');
  db.exec('CREATE TABLE IF NOT EXISTS schema_version (version INTEGER NOT NULL)');
  const aktuell = db.prepare('SELECT max(version) AS v FROM schema_version').get().v ?? 0;
  for (let v = aktuell; v < SCHEMA.length; v++) {
    db.exec('BEGIN');
    try {
      db.exec(SCHEMA[v]);
      db.prepare('INSERT INTO schema_version (version) VALUES (?)').run(v + 1);
      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }
  }
  return db;
}

/** Führt fn in einer Transaktion aus. */
export function transaktion(db, fn) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const r = fn();
    db.exec('COMMIT');
    return r;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

/** Löscht, was die Aufbewahrungsfrist überschritten hat (Privacy by Default). Liefert die Anzahl gelöschter Zeilen. */
export function raeumeAuf(db, tage, jetzt = new Date()) {
  const grenze = new Date(jetzt.getTime() - tage * 86400000).toISOString();
  const v = db.prepare('DELETE FROM versuch WHERE aktualisiert < ?').run(grenze).changes;
  const n = db.prepare("DELETE FROM nutzer WHERE rolle = 'studierende' AND zuletzt < ?").run(grenze).changes;
  const s = db.prepare('DELETE FROM sitzung WHERE ablauf < ?').run(jetzt.toISOString()).changes;
  return { versuche: v, nutzer: n, sitzungen: s };
}
