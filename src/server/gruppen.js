// Teamspiel und Kursrunde: Mehrere Personen teilen sich einen Spielstand. Jede Gruppe hat einen Startwert und einen
// gemeinsamen Ereignisstrom (Tabelle gruppe_ereignis); der Zustand entsteht wie beim Einzelspiel durch Nachrechnen
// mit derselben Engine. Wer mitspielt, gibt eine Stimme ab (Tabelle stimme); ist die Abstimmung entschieden, wird
// die Stimme der Mehrheit als nächstes Ereignis angehängt. Neue Stände gehen über Server-Sent Events hinaus.
//
// Regel (docs/ARCHITEKTUR.md, „Abstimmen im Team“):
//   Die Mehrheit der abgegebenen Stimmen entscheidet; bei Gleichstand gilt die Möglichkeit, für die zuerst gestimmt
//   wurde. Im Team ist die Abstimmung zu Ende, sobald alle abgestimmt haben oder eine Möglichkeit mehr als die
//   Hälfte der Stimmen des Teams hat; wer das Team gegründet hat (Sprecherin oder Sprecher), kann sie vorher
//   schließen. In der Kursrunde schließen die Lehrenden; vorher endet sie nur, wenn alle abgestimmt haben.
//   Antworten auf Aufgaben zählen als gleich, wenn die Engine sie gleich bewertet (richtig oder dieselbe Fehlerart).

import { randomUUID } from 'node:crypto';
import { starte, wende, spiele, verfuegbareOptionen, SpielFehler } from '../engine/ablauf.js';
import { ansicht } from '../engine/ansicht.js';
import { neuerSeed } from '../engine/zufall.js';
import { fuelleText } from '../engine/ausdruck.js';
import { HttpFehler } from './fehler.js';
import { transaktion } from './db.js';
import { code, normalisiereCode, KOPFZEILEN } from './sicherheit.js';

/** Lesbare Bezeichnung einer Fehlerart: die ersten Worte der Rückmeldung, die das Szenario dafür vorsieht. */
export function fehlerart(knoten, typ) {
  const m = /^typisch-(\d+)$/.exec(typ ?? '');
  if (m) {
    const text = knoten?.typische_fehler?.[Number(m[1]) - 1]?.rueckmeldung ?? typ;
    return text.length > 48 ? `${text.slice(0, 46).replace(/\s+\S*$/, '')} …` : text;
  }
  return { vorzeichen: 'Vorzeichen falsch', einheit: 'Größenordnung (Einheit)' }[typ] ?? 'sonstige';
}

/** Nur die Felder, die ein Ereignis haben darf; alles andere aus dem Browser wird verworfen. */
export function saeubere(ereignis) {
  return {
    typ: ereignis?.typ, knoten: ereignis?.knoten,
    ...(ereignis?.typ === 'wahl' ? { option: ereignis.option } : {}),
    ...(ereignis?.typ === 'antwort' ? { antwort: ereignis.antwort } : {}),
  };
}

const LIVE_VERZUG_MS = 100; // Stimmen innerhalb dieser Zeit gehen als ein neuer Stand hinaus

export function gruppen({ db, ladeSzenario, minGruppe = 3 }) {
  const jetzt = () => new Date().toISOString();
  const zuhoerer = new Map(); // Gruppe → Set { res, nutzerId } oder { res, lehrende: true }
  const geplant = new Map(); // Gruppe → Zeitgeber für den nächsten Stand

  function lade(id) {
    const g = db.prepare('SELECT * FROM gruppe WHERE id = ?').get(id);
    if (!g) throw new HttpFehler(404, 'Team oder Runde nicht gefunden');
    const s = ladeSzenario(db, g.szenario_id, g.szenario_version);
    const reihe = db.prepare('SELECT daten, ergebnis, abstimmung FROM gruppe_ereignis WHERE gruppe_id = ? ORDER BY nr').all(id);
    const z = spiele(s, g.seed, reihe.map((r) => JSON.parse(r.daten)));
    const mitglieder = db.prepare('SELECT nutzer_id FROM gruppe_mitglied WHERE gruppe_id = ? ORDER BY beigetreten, rowid').all(id).map((m) => m.nutzer_id);
    return { g, s, z, nr: reihe.length, reihe, mitglieder };
  }

  function mitglied(l, nutzer) {
    if (!l.mitglieder.includes(nutzer.id)) throw new HttpFehler(404, 'Team oder Runde nicht gefunden');
  }

  const stimmenVon = (gid, nr) => db.prepare('SELECT nutzer_id, daten, schluessel FROM stimme WHERE gruppe_id = ? AND nr = ? ORDER BY rowid').all(gid, nr);

  // --- Anlegen und Beitreten ------------------------------------------------------------------------------------
  function neu(art, { kursId, szenario, nutzerId }) {
    const id = randomUUID();
    const c = art === 'team' ? code(6) : null;
    const t = jetzt();
    db.prepare(`INSERT INTO gruppe (id, art, kurs_id, szenario_id, szenario_version, seed, code, erstellt, aktualisiert)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(id, art, kursId, szenario.id, szenario.version, neuerSeed(), c ? normalisiereCode(c) : null, t, t);
    if (nutzerId) db.prepare('INSERT INTO gruppe_mitglied (gruppe_id, nutzer_id, beigetreten) VALUES (?, ?, ?)').run(id, nutzerId, t);
    return { id, code: c };
  }

  function tritteBei(gid, nutzerId) {
    db.prepare('INSERT OR IGNORE INTO gruppe_mitglied (gruppe_id, nutzer_id, beigetreten) VALUES (?, ?, ?)').run(gid, nutzerId, jetzt());
    plane(gid);
  }

  function teamMitCode(kursId, eingabe) {
    return db.prepare("SELECT id FROM gruppe WHERE art = 'team' AND kurs_id = ? AND code = ? AND status = 'laeuft' AND beendet = 0").get(kursId, normalisiereCode(eingabe));
  }

  // --- Abstimmen --------------------------------------------------------------------------------------------------
  /** Gruppiert eine Stimme: Wahl nach Option, Antwort nach der Bewertung der Engine. Wirft bei unmöglichen Ereignissen. */
  function bewerteStimme(s, z, e) {
    const neu = wende(s, z, e);
    if (e.typ === 'wahl') return { schluessel: `wahl:${e.option}` };
    if (neu.rueckmeldung?.art === 'ungueltig') return { ungueltig: neu.rueckmeldung.text };
    return { schluessel: neu.rueckmeldung?.art === 'richtig' ? 'richtig' : `falsch:${neu.rueckmeldung?.typ ?? 'sonstige'}` };
  }

  /** Zählt Stimmen je Möglichkeit, in der Reihenfolge der ersten Stimme. */
  function zaehle(stimmen) {
    const m = new Map();
    for (const st of stimmen) {
      const e = m.get(st.schluessel) ?? { schluessel: st.schluessel, n: 0, erste: st };
      e.n++;
      m.set(st.schluessel, e);
    }
    return [...m.values()];
  }

  /** Mehrheit; bei Gleichstand die Möglichkeit mit der frühesten Stimme (strenges „>“ behält die frühere). */
  const sieger = (liste) => liste.reduce((best, e) => (e.n > best.n ? e : best));

  function entscheide(l, stimmen) {
    const best = sieger(zaehle(stimmen));
    const e = JSON.parse(best.erste.daten);
    const neu = wende(l.s, l.z, e);
    const ergebnis = neu.rueckmeldung ? JSON.stringify({ art: neu.rueckmeldung.art, typ: neu.rueckmeldung.typ }) : null;
    const abstimmung = JSON.stringify({ stimmen: stimmen.length, von: l.mitglieder.length, fuer: best.n, schluessel: best.schluessel });
    db.prepare('INSERT INTO gruppe_ereignis (gruppe_id, nr, daten, ergebnis, abstimmung, zeit) VALUES (?, ?, ?, ?, ?, ?)')
      .run(l.g.id, l.nr, JSON.stringify(e), ergebnis, abstimmung, jetzt());
    db.prepare('UPDATE gruppe SET aktualisiert = ?, beendet = ?, ergebnis = ? WHERE id = ?').run(jetzt(), neu.beendet ? 1 : 0, neu.ergebnis, l.g.id);
  }

  function pruefeOffen(l, nutzerId, nr) {
    if (l.g.status !== 'laeuft') throw new HttpFehler(409, 'Die Runde ist beendet.', nutzerId ? stand(l, nutzerId) : undefined);
    if (l.z.beendet) throw new HttpFehler(409, 'Das Spiel ist schon zu Ende.', nutzerId ? stand(l, nutzerId) : undefined);
    if (nr !== l.nr) throw new HttpFehler(409, 'Inzwischen wurde schon entschieden. Der neue Stand ist geladen.', nutzerId ? stand(l, nutzerId) : undefined);
  }

  /** Eine Stimme abgeben (oder ändern). Liefert den Stand für diese Person. */
  function stimme(gid, nutzer, { nr, ereignis }) {
    let entschieden = false;
    const r = transaktion(db, () => {
      const l = lade(gid);
      mitglied(l, nutzer);
      pruefeOffen(l, nutzer.id, nr);
      const e = saeubere(ereignis);
      if (e.knoten !== l.z.knoten) throw new HttpFehler(422, `Ereignis gehört zu „${e.knoten}“, aktuell ist „${l.z.knoten}“`);
      try {
        if (e.typ === 'hinweis') {
          // Den Hinweis kann jede Person sofort abrufen; er gilt für alle und kostet die Gruppe Punkte
          wende(l.s, l.z, e);
          db.prepare('INSERT INTO gruppe_ereignis (gruppe_id, nr, daten, ergebnis, abstimmung, zeit) VALUES (?, ?, ?, NULL, NULL, ?)').run(gid, l.nr, JSON.stringify(e), jetzt());
          db.prepare('UPDATE gruppe SET aktualisiert = ? WHERE id = ?').run(jetzt(), gid);
          entschieden = true;
          return null;
        }
        const b = bewerteStimme(l.s, l.z, e);
        if (b.ungueltig) return { ...stand(l, nutzer.id), rueckmeldung: { art: 'ungueltig', text: b.ungueltig } };
        db.prepare('INSERT OR REPLACE INTO stimme (gruppe_id, nr, nutzer_id, daten, schluessel, zeit) VALUES (?, ?, ?, ?, ?, ?)')
          .run(gid, l.nr, nutzer.id, JSON.stringify(e), b.schluessel, jetzt());
      } catch (err) {
        if (err instanceof SpielFehler) throw new HttpFehler(422, err.message);
        throw err;
      }
      const stimmen = stimmenVon(gid, l.nr);
      const alle = stimmen.length >= l.mitglieder.length;
      const mehrheit = sieger(zaehle(stimmen)).n * 2 > l.mitglieder.length;
      if (alle || (l.g.art === 'team' && mehrheit)) { entscheide(l, stimmen); entschieden = true; }
      db.prepare('UPDATE gruppe SET aktualisiert = ? WHERE id = ?').run(jetzt(), gid);
      return null;
    });
    plane(gid, entschieden);
    return r ?? stand(lade(gid), nutzer.id);
  }

  /** Abstimmung vorzeitig schließen: im Team die Sprecherin oder der Sprecher, in der Runde die Lehrenden. */
  function schliesse(gid, { nutzer = null, lehrende = false, nr }) {
    transaktion(db, () => {
      const l = lade(gid);
      if (lehrende) {
        if (l.g.art !== 'runde') throw new HttpFehler(404, 'Runde nicht gefunden');
      } else {
        mitglied(l, nutzer);
        if (l.g.art !== 'team' || l.mitglieder[0] !== nutzer.id) throw new HttpFehler(403, 'Nur wer das Team gegründet hat, kann die Abstimmung schließen.');
      }
      pruefeOffen(l, nutzer?.id, nr);
      const stimmen = stimmenVon(gid, l.nr);
      if (!stimmen.length) throw new HttpFehler(409, 'Es hat noch niemand abgestimmt.');
      entscheide(l, stimmen);
    });
    plane(gid, true);
  }

  function beende(gid) {
    const l = lade(gid);
    if (l.g.art !== 'runde') throw new HttpFehler(404, 'Runde nicht gefunden');
    db.prepare("UPDATE gruppe SET status = 'beendet', aktualisiert = ? WHERE id = ?").run(jetzt(), gid);
    plane(gid, true);
  }

  // --- Stände -----------------------------------------------------------------------------------------------------
  /** Was alle Mitglieder gleich sehen; persönlich wird nur die eigene Stimme ergänzt. */
  function gemeinsam(l) {
    const a = ansicht(l.s, l.z);
    const stimmen = l.z.beendet || l.g.status !== 'laeuft' ? [] : stimmenVon(l.g.id, l.nr);
    const abstimmung = { stimmen: stimmen.length, von: l.mitglieder.length };
    // Im Team sieht man, wie die anderen stimmen (zum Besprechen); in der Kursrunde nur, wie viele schon abgestimmt haben
    if (l.g.art === 'team') {
      const k = l.s.knoten[l.z.knoten];
      if (k?.typ === 'szene') {
        abstimmung.optionen = {};
        for (const st of stimmen) { const o = JSON.parse(st.daten).option; abstimmung.optionen[o] = (abstimmung.optionen[o] ?? 0) + 1; }
      } else if (k?.mechanik === 'zahl') {
        abstimmung.antworten = stimmen.map((st) => String(JSON.parse(st.daten).antwort));
      }
    }
    const letzte = l.reihe.at(-1)?.abstimmung ? JSON.parse(l.reihe.at(-1).abstimmung) : null;
    return {
      gruppe: { id: l.g.id, art: l.g.art, code: l.g.code ? `${l.g.code.slice(0, 3)}-${l.g.code.slice(3)}` : null, mitglieder: l.mitglieder.length, status: l.g.status },
      nr: l.nr, ...a, abstimmung,
      letzteAbstimmung: letzte ? { stimmen: letzte.stimmen, von: letzte.von, fuer: letzte.fuer } : null,
      stimmenJeNutzer: new Map(stimmen.map((st) => [st.nutzer_id, JSON.parse(st.daten)])),
      sprecherId: l.g.art === 'team' ? l.mitglieder[0] : null,
    };
  }

  function persoenlich(basis, nutzerId) {
    const { stimmenJeNutzer, sprecherId, ...rest } = basis;
    const e = stimmenJeNutzer.get(nutzerId);
    return {
      ...rest,
      gruppe: { ...rest.gruppe, sprecher: sprecherId === nutzerId },
      abstimmung: { ...rest.abstimmung, eigene: e ? { typ: e.typ, ...(e.typ === 'wahl' ? { option: e.option } : { antwort: e.antwort }) } : null },
    };
  }

  const stand = (l, nutzerId) => persoenlich(gemeinsam(l), nutzerId);

  function standFuer(gid, nutzer) {
    const l = lade(gid);
    mitglied(l, nutzer);
    return stand(l, nutzer.id);
  }

  // --- Live-Ansicht der Kursrunde für Lehrende: nur Summen, erst ab der Mindestgruppe ---------------------------
  function verteilung(s, def, z, stimmen) {
    const werte = { ...z.parameter, ...z.indikatoren };
    const zahl = Object.fromEntries(zaehle(stimmen).map((e) => [e.schluessel, e.n]));
    if (def.typ === 'szene') {
      return verfuegbareOptionen(s, z).map((o) => ({ text: fuelleText(o.text, werte), bewertung: o.bewertung ?? null, n: zahl[`wahl:${o.id}`] ?? 0 }));
    }
    return Object.entries(zahl).map(([k, n]) => (k === 'richtig'
      ? { text: 'richtig', bewertung: 'gut', n }
      : { text: `falsch: ${fehlerart(def, k.slice('falsch:'.length))}`, bewertung: 'schlecht', n })).sort((a, b) => b.n - a.n);
  }

  function beschrifte(s, def, z, e, ab) {
    if (e.typ === 'wahl') return fuelleText(verfuegbareOptionen(s, z).find((o) => o.id === e.option)?.text ?? e.option, { ...z.parameter, ...z.indikatoren });
    return ab?.schluessel === 'richtig' ? 'richtige Antwort' : `falsche Antwort (${fehlerart(def, ab?.schluessel?.slice('falsch:'.length))})`;
  }

  function runde(l) {
    const kurs = db.prepare('SELECT name FROM kurs WHERE id = ?').get(l.g.kurs_id);
    const alle = db.prepare('SELECT nr, daten, schluessel FROM stimme WHERE gruppe_id = ? ORDER BY nr, rowid').all(l.g.id);
    const schritte = [];
    let z = starte(l.s, l.g.seed);
    for (let nr = 0; nr <= l.nr; nr++) {
      const def = l.s.knoten[z.knoten];
      const zeile = l.reihe[nr];
      const e = zeile ? JSON.parse(zeile.daten) : null;
      const stimmen = alle.filter((st) => st.nr === nr);
      const aktuell = nr === l.nr && !l.z.beendet && l.g.status === 'laeuft';
      if (e?.typ !== 'hinweis' && (aktuell || zeile)) {
        const ab = zeile?.abstimmung ? JSON.parse(zeile.abstimmung) : null;
        const genug = stimmen.length >= minGruppe;
        schritte.push({
          nr, knoten: z.knoten, titel: fuelleText(def.titel ?? z.knoten, { ...z.parameter, ...z.indikatoren }), typ: def.typ, mechanik: def.mechanik ?? null,
          aktuell, stimmen: stimmen.length, zuWenig: !genug,
          verteilung: genug ? verteilung(l.s, def, z, stimmen) : null,
          entschieden: e && genug ? { text: beschrifte(l.s, def, z, e, ab), fuer: ab?.fuer ?? null } : null,
        });
      }
      if (e) z = wende(l.s, z, e);
    }
    return {
      runde: { id: l.g.id, kurs: kurs?.name ?? null, szenario: l.s.titel, szenarioId: l.s.id, version: l.s.version, status: l.g.status, gestartet: l.g.erstellt },
      teilnehmende: l.mitglieder.length, minGruppe, nr: l.nr, beendet: l.z.beendet, ergebnis: l.z.ergebnis,
      abgestimmt: l.z.beendet || l.g.status !== 'laeuft' ? 0 : stimmenVon(l.g.id, l.nr).length,
      schritte: schritte.reverse(),
    };
  }

  const rundeAnsicht = (gid) => {
    const l = lade(gid);
    if (l.g.art !== 'runde') throw new HttpFehler(404, 'Runde nicht gefunden');
    return runde(l);
  };

  // --- Server-Sent Events -----------------------------------------------------------------------------------------
  function sende(eintrag, daten) {
    eintrag.res.write(`event: stand\ndata: ${JSON.stringify(daten)}\n\n`);
  }

  function abonniere(req, res, gid, wer) {
    const l = lade(gid);
    if (wer.lehrende) { if (l.g.art !== 'runde') throw new HttpFehler(404, 'Runde nicht gefunden'); } else mitglied(l, { id: wer.nutzerId });
    res.writeHead(200, { ...KOPFZEILEN, 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-store', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
    res.write('retry: 3000\n\n');
    const eintrag = { res, ...wer };
    if (!zuhoerer.has(gid)) zuhoerer.set(gid, new Set());
    zuhoerer.get(gid).add(eintrag);
    sende(eintrag, wer.lehrende ? runde(l) : { ...stand(l, wer.nutzerId), rueckmeldung: null });
    const puls = setInterval(() => res.write(': puls\n\n'), 25000);
    puls.unref();
    req.on('close', () => {
      clearInterval(puls);
      const set = zuhoerer.get(gid);
      set?.delete(eintrag);
      if (set && !set.size) zuhoerer.delete(gid);
    });
  }

  function verteile(gid) {
    const set = zuhoerer.get(gid);
    if (!set?.size) return;
    let l;
    try { l = lade(gid); } catch { return; }
    const basis = gemeinsam(l);
    let lehrendeStand = null;
    for (const eintrag of set) {
      try { sende(eintrag, eintrag.lehrende ? (lehrendeStand ??= runde(l)) : persoenlich(basis, eintrag.nutzerId)); } catch { /* Verbindung schon zu */ }
    }
  }

  /** Neuen Stand verschicken: nach einer Entscheidung sofort, nach einer Stimme gebündelt. */
  function plane(gid, sofort = false) {
    if (sofort) {
      clearTimeout(geplant.get(gid));
      geplant.delete(gid);
      verteile(gid);
      return;
    }
    if (geplant.has(gid)) return;
    const t = setTimeout(() => { geplant.delete(gid); verteile(gid); }, LIVE_VERZUG_MS);
    t.unref();
    geplant.set(gid, t);
  }

  function schliesseAlle() {
    for (const t of geplant.values()) clearTimeout(t);
    for (const set of zuhoerer.values()) for (const e of set) e.res.end();
    zuhoerer.clear();
  }

  return { neu, tritteBei, teamMitCode, stimme, schliesse, beende, standFuer, rundeAnsicht, abonniere, plane, schliesseAlle, lade };
}
