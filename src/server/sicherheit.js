// Anmeldung ohne Personendaten: Studierende treten mit einem Kurscode bei und bekommen ein Pseudonym; Lehrende
// melden sich mit dem Schlüssel der Instanz an. Sitzungen sind Zufallstoken im HttpOnly-Cookie; gespeichert wird
// nur ihr SHA-256-Hash.

import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

export const COOKIE = 'sbk_sitzung';
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // ohne 0/O und 1/I

export function hash(text) {
  return createHash('sha256').update(text).digest('hex');
}

export function token() {
  return randomBytes(32).toString('base64url');
}

/** Lesbarer Code, z. B. für Kurse („K7QH-M3PZ“) oder die Wiederanmeldung. */
export function code(laenge = 8) {
  const b = randomBytes(laenge);
  let s = '';
  for (let i = 0; i < laenge; i++) s += ALPHABET[b[i] % ALPHABET.length];
  return `${s.slice(0, laenge / 2)}-${s.slice(laenge / 2)}`;
}

export function normalisiereCode(eingabe) {
  return String(eingabe ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export function gleich(a, b) {
  const x = Buffer.from(hash(String(a)));
  const y = Buffer.from(hash(String(b)));
  return timingSafeEqual(x, y);
}

const EIGENSCHAFT = ['Mutige', 'Kluge', 'Flinke', 'Ruhige', 'Wache', 'Kühne', 'Heitere', 'Stille', 'Rasche', 'Weise', 'Frohe', 'Gelassene'];
const TIER = ['Biber', 'Eule', 'Otter', 'Luchs', 'Dachs', 'Falke', 'Wiesel', 'Kranich', 'Igel', 'Fuchs', 'Elster', 'Möwe'];

export function pseudonym() {
  const b = randomBytes(3);
  return `${EIGENSCHAFT[b[0] % EIGENSCHAFT.length]}-${TIER[b[1] % TIER.length]}-${10 + (b[2] % 90)}`;
}

export function leseCookies(header = '') {
  const out = {};
  for (const teil of header.split(';')) {
    const i = teil.indexOf('=');
    if (i > 0) out[teil.slice(0, i).trim()] = decodeURIComponent(teil.slice(i + 1).trim());
  }
  return out;
}

export function cookieKopf(wert, maxAlterSek, sicher) {
  return `${COOKIE}=${wert}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAlterSek}${sicher ? '; Secure' : ''}`;
}

/**
 * Bremse gegen das Durchprobieren von Codes: Gezählt werden nur Fehlversuche, höchstens `max` je Absender und
 * Minute. Ein ganzer Hörsaal hinter einer gemeinsamen Adresse kann also gleichzeitig beitreten.
 */
export function bremse(max = 20) {
  const fenster = new Map();
  const eintrag = (schluessel) => {
    const minute = Math.floor(Date.now() / 60000);
    let e = fenster.get(schluessel);
    if (!e || e.minute !== minute) {
      if (fenster.size > 10000) fenster.clear();
      e = { minute, n: 0 };
      fenster.set(schluessel, e);
    }
    return e;
  };
  return {
    erlaubt: (schluessel) => eintrag(schluessel).n < max,
    fehlschlag: (schluessel) => { eintrag(schluessel).n++; },
  };
}

export const KOPFZEILEN = {
  'Content-Security-Policy': "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
  'Cross-Origin-Opener-Policy': 'same-origin',
};
