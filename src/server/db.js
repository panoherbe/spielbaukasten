// Datenhaltung mit SQLite (node:sqlite, in Node.js enthalten; keine Fremdbibliothek, eine Datei, leicht zu sichern).
// Gespeichert werden nur Pseudonyme, Versuche, Spielereignisse, Teams und Stimmen: keine Namen, keine
// E-Mail-Adressen, keine IP-Adressen. Der Austausch gegen PostgreSQL wäre auf diese Datei beschränkt.

import { DatabaseSync } from 'node:sqlite';

export const SCHEMA = [
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
  // Version 2: Rolle Administration und Ton-Einstellung je Person (Tabelle nutzer neu, weil SQLite eine
  // CHECK-Bedingung nicht ändern kann), Zugänge für Lehrende, Einstellungen, Protokoll, Teams und Kursrunden
  {
    ohneFremdschluessel: true,
    sql: `CREATE TABLE nutzer_neu (
     id INTEGER PRIMARY KEY, rolle TEXT NOT NULL CHECK (rolle IN ('studierende', 'lehrende', 'admin')),
     pseudonym TEXT NOT NULL UNIQUE, kurs_id INTEGER REFERENCES kurs(id) ON DELETE CASCADE,
     wiederkehr_hash TEXT UNIQUE, erstellt TEXT NOT NULL, zuletzt TEXT NOT NULL, ton INTEGER NOT NULL DEFAULT 0);
   INSERT INTO nutzer_neu (id, rolle, pseudonym, kurs_id, wiederkehr_hash, erstellt, zuletzt)
     SELECT id, rolle, pseudonym, kurs_id, wiederkehr_hash, erstellt, zuletzt FROM nutzer;
   DROP TABLE nutzer;
   ALTER TABLE nutzer_neu RENAME TO nutzer;
   CREATE TABLE zugang (
     id INTEGER PRIMARY KEY, art TEXT NOT NULL CHECK (art IN ('instanz', 'persoenlich')), bezeichnung TEXT NOT NULL,
     schluessel_hash TEXT UNIQUE, nutzer_id INTEGER REFERENCES nutzer(id) ON DELETE SET NULL,
     gesperrt INTEGER NOT NULL DEFAULT 0, erstellt TEXT NOT NULL);
   CREATE TABLE einstellung (schluessel TEXT PRIMARY KEY, wert TEXT NOT NULL);
   CREATE TABLE protokoll (
     id INTEGER PRIMARY KEY, zeit TEXT NOT NULL, rolle TEXT NOT NULL, akteur TEXT NOT NULL, aktion TEXT NOT NULL,
     ziel TEXT, details TEXT);
   CREATE INDEX protokoll_zeit ON protokoll(zeit);
   CREATE TABLE gruppe (
     id TEXT PRIMARY KEY, art TEXT NOT NULL CHECK (art IN ('team', 'runde')),
     kurs_id INTEGER REFERENCES kurs(id) ON DELETE CASCADE, szenario_id TEXT NOT NULL, szenario_version INTEGER NOT NULL,
     seed INTEGER NOT NULL, code TEXT, status TEXT NOT NULL DEFAULT 'laeuft', erstellt TEXT NOT NULL, aktualisiert TEXT NOT NULL,
     beendet INTEGER NOT NULL DEFAULT 0, ergebnis TEXT,
     FOREIGN KEY (szenario_id, szenario_version) REFERENCES szenario(id, version));
   CREATE UNIQUE INDEX gruppe_code ON gruppe(kurs_id, code);
   CREATE TABLE gruppe_mitglied (
     gruppe_id TEXT NOT NULL REFERENCES gruppe(id) ON DELETE CASCADE,
     nutzer_id INTEGER NOT NULL REFERENCES nutzer(id) ON DELETE CASCADE, beigetreten TEXT NOT NULL,
     PRIMARY KEY (gruppe_id, nutzer_id));
   CREATE INDEX gruppe_mitglied_nutzer ON gruppe_mitglied(nutzer_id);
   CREATE TABLE gruppe_ereignis (
     gruppe_id TEXT NOT NULL REFERENCES gruppe(id) ON DELETE CASCADE, nr INTEGER NOT NULL, daten TEXT NOT NULL,
     ergebnis TEXT, abstimmung TEXT, zeit TEXT NOT NULL, PRIMARY KEY (gruppe_id, nr));
   CREATE TABLE stimme (
     gruppe_id TEXT NOT NULL REFERENCES gruppe(id) ON DELETE CASCADE, nr INTEGER NOT NULL,
     nutzer_id INTEGER NOT NULL REFERENCES nutzer(id) ON DELETE CASCADE, daten TEXT NOT NULL, schluessel TEXT NOT NULL,
     zeit TEXT NOT NULL, PRIMARY KEY (gruppe_id, nr, nutzer_id));`,
  },
];

export function oeffne(pfad) {
  const db = new DatabaseSync(pfad);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000; PRAGMA synchronous = NORMAL;');
  db.exec('CREATE TABLE IF NOT EXISTS schema_version (version INTEGER NOT NULL)');
  const aktuell = db.prepare('SELECT max(version) AS v FROM schema_version').get().v ?? 0;
  for (let v = aktuell; v < SCHEMA.length; v++) {
    const schritt = typeof SCHEMA[v] === 'string' ? { sql: SCHEMA[v] } : SCHEMA[v];
    // Eine Tabelle neu anlegen geht nur mit abgeschalteten Fremdschlüsseln (Verfahren aus der SQLite-Dokumentation,
    // „Making Other Kinds Of Table Schema Changes“); danach wird geprüft, dass alle Verweise noch stimmen.
    if (schritt.ohneFremdschluessel) db.exec('PRAGMA foreign_keys = OFF');
    db.exec('BEGIN');
    try {
      db.exec(schritt.sql);
      if (schritt.ohneFremdschluessel && db.prepare('PRAGMA foreign_key_check').all().length) throw new Error(`Schema ${v + 1}: Fremdschlüssel verletzt`);
      db.prepare('INSERT INTO schema_version (version) VALUES (?)').run(v + 1);
      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    } finally {
      if (schritt.ohneFremdschluessel) db.exec('PRAGMA foreign_keys = ON');
    }
  }
  return db;
}

export const SCHEMA_VERSION = SCHEMA.length;

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
  const g = db.prepare('DELETE FROM gruppe WHERE aktualisiert < ?').run(grenze).changes;
  const n = db.prepare("DELETE FROM nutzer WHERE rolle = 'studierende' AND zuletzt < ?").run(grenze).changes;
  const s = db.prepare('DELETE FROM sitzung WHERE ablauf < ?').run(jetzt.toISOString()).changes;
  const p = db.prepare('DELETE FROM protokoll WHERE zeit < ?').run(grenze).changes;
  return { versuche: v, gruppen: g, nutzer: n, sitzungen: s, protokoll: p };
}
