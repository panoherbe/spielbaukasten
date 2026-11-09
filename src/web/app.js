// Oberfläche für Studierende: Beitritt mit Kurscode, Übersicht der Lernspiele, Spielen, eigene Daten.

import { api, ApiFehler } from './api.js';
import { h, leere, fokus, melde, zahl } from './ui.js';
import { symbol, sterne } from './symbole.js';
import { spieler } from './spieler.js';

const inhalt = document.getElementById('inhalt');
const navigation = document.getElementById('navigation');
let ich = null;

const medienUrl = (szenario, datei) => `/medien/${encodeURIComponent(szenario)}/${datei.split('/').map(encodeURIComponent).join('/')}`;

async function ladeIch() {
  try { ich = await api('GET', '/api/ich'); } catch (e) { if (e instanceof ApiFehler && e.status === 401) ich = null; else throw e; }
  leere(navigation, ich ? [
    h('span', { class: 'pseudonym', title: 'Ihr Pseudonym' }, symbol('person'), ich.pseudonym),
    h('button', { class: 'knopf-text', type: 'button', onclick: abmelden }, 'Abmelden'),
  ] : []);
}

/** Zur Startseite: Ändert sich die Adresse, zeichnet der hashchange-Handler neu, sonst hier. So entsteht die
 * Übersicht nur einmal und überschreibt kein Spiel, das ein schneller Klick schon gestartet hat. */
function zurStart() {
  if (location.hash === '#/') zeige(); else location.hash = '#/';
}

async function abmelden() {
  await api('POST', '/api/abmelden', {});
  ich = null;
  zurStart();
}

/** Großes Bild mit Überschrift; Start und Übersicht. */
function held(titel, text, { klein = false, oberzeile = 'Lernspiele für die Ingenieurlehre' } = {}) {
  return h('section', { class: `held${klein ? ' klein' : ''}` },
    h('img', { class: 'held-bild', src: '/bilder/start.svg', alt: '' }),
    klein ? null : h('div', { class: 'held-figuren', 'aria-hidden': 'true' },
      h('img', { src: '/bilder/figur-laborleitung.svg', alt: '' }), h('img', { src: '/bilder/figur-bauleitung.svg', alt: '' })),
    h('div', { class: 'held-text' }, h('p', { class: 'oberzeile' }, symbol('punkte'), oberzeile), titel, text ? h('p', {}, text) : null));
}

function anmeldung() {
  const kurs = h('input', { id: 'kurscode', name: 'kurscode', autocomplete: 'off', autocapitalize: 'characters', required: true, placeholder: 'z. B. K7QH-M3PZ' });
  const wieder = h('input', { id: 'wiederkehr', name: 'wiederkehr', autocomplete: 'off', autocapitalize: 'characters', placeholder: 'z. B. ABCD-EF23-GH45' });
  const titel = h('h1', {}, 'Entscheiden. Rechnen. Folgen sehen.');
  leere(inhalt,
    held(titel, 'Fälle aus der Ingenieurpraxis als Spiel: mit eigenen Zahlen, sofortiger Rückmeldung und ohne Konto.'),
    h('section', { class: 'karte schmal beitritt' },
      h('h2', {}, 'Mit dem Kurscode beitreten'),
      h('p', {}, 'Sie brauchen kein Konto und geben keinen Namen an; Sie bekommen ein zufälliges Pseudonym.'),
      h('form', { class: 'stapel', onsubmit: async (e) => {
        e.preventDefault();
        try {
          const r = await api('POST', '/api/anmelden/studierende', { kurscode: kurs.value });
          await ladeIch();
          zeigeWiederkehrcode(r);
        } catch (err) { melde(err.message, 'fehler'); kurs.focus(); }
      } },
      h('label', { for: 'kurscode', class: 'beschriftung' }, 'Kurscode'),
      h('div', { class: 'beitritt-zeile' }, kurs, h('button', { class: 'knopf knopf-haupt', type: 'submit' }, 'Beitreten', symbol('pfeil'))))),
    h('details', { class: 'karte schmal' },
      h('summary', {}, 'Schon dabei? Mit Ihrem persönlichen Code weitermachen'),
      h('form', { class: 'stapel', onsubmit: async (e) => {
        e.preventDefault();
        try { await api('POST', '/api/anmelden/wiederkehr', { wiederkehrcode: wieder.value }); await ladeIch(); zurStart(); } catch (err) { melde(err.message, 'fehler'); }
      } },
      h('label', { for: 'wiederkehr', class: 'beschriftung' }, 'Persönlicher Code'), wieder,
      h('button', { class: 'knopf', type: 'submit' }, 'Weitermachen'))),
    h('ul', { class: 'merkmale', 'aria-label': 'Was Sie erwartet' }, [
      ['zahlen', 'Eigene Zahlen', 'Jede Person rechnet mit eigenen Werten.'],
      ['rueckmeldung', 'Rückmeldung, die hilft', 'Typische Fehler werden erkannt und erklärt.'],
      ['schutz', 'Ohne Namen', 'Zufälliges Pseudonym; Ihre Daten löschen Sie selbst.'],
    ].map(([s, t, x]) => h('li', { class: 'merkmal' }, h('span', { class: 'merkmal-zeichen' }, symbol(s)), h('span', {}, h('strong', {}, t), x)))));
  fokus(titel);
}

function zeigeWiederkehrcode(r) {
  const titel = h('h1', {}, `Hallo, ${r.pseudonym}!`);
  leere(inhalt, h('section', { class: 'karte schmal' },
    h('p', { class: 'chips' }, h('span', { class: 'chip' }, symbol('person'), 'Ihr Pseudonym')),
    titel,
    h('p', {}, `Sie sind im Kurs „${r.kurs}“. Ihr Fortschritt wird unter diesem Pseudonym gespeichert, ohne Namen.`),
    h('p', {}, 'Ihr persönlicher Code, um auf einem anderen Gerät weiterzumachen. Er wird nur jetzt angezeigt:'),
    h('p', { class: 'code-gross' }, r.wiederkehrcode),
    h('button', { class: 'knopf knopf-haupt', type: 'button', onclick: zurStart }, 'Zu den Lernspielen', symbol('pfeil'))));
  fokus(titel);
}

function spielkarte(s) {
  const e = s.eigene;
  return h('li', { class: 'karte kachel spielkarte' },
    h('div', { class: 'spielkarte-bild' },
      s.titelbild ? h('img', { src: medienUrl(s.id, s.titelbild.datei), alt: '' }) : null,
      s.dauerMinuten ? h('span', { class: 'spielkarte-marke' }, h('span', { class: 'chip' }, symbol('uhr'), `ca. ${s.dauerMinuten} Min.`)) : null),
    h('div', { class: 'spielkarte-inhalt' },
      h('p', { class: 'chips' },
        s.fach ? h('span', { class: 'chip' }, symbol('datei'), s.fach) : null,
        s.lernziele?.length ? h('span', { class: 'chip' }, symbol('ziel'), `${s.lernziele.length} Lernziele`) : null),
      h('h2', {}, s.titel),
      h('p', {}, s.kurzbeschreibung),
      e.beendet ? h('p', { class: 'stand' }, sterne(e.besteSterne ?? 0), h('span', { class: 'nur-vorlesen' }, `${e.besteSterne ?? 0} von 3 Sternen, `),
        `${e.beendet}× abgeschlossen, bestes Ergebnis ${zahl((e.besteQuote ?? 0) * 100, 0)} %`) : null,
      h('div', { class: 'knopfreihe' },
        e.offenerVersuch ? h('a', { class: 'knopf knopf-haupt', href: `#/versuch/${e.offenerVersuch}` }, 'Fortsetzen', symbol('pfeil')) : null,
        h('a', { class: e.offenerVersuch ? 'knopf' : 'knopf knopf-haupt', href: `#/spiel/${s.id}` }, e.offenerVersuch ? 'Neu beginnen' : 'Starten', e.offenerVersuch ? null : symbol('pfeil'))),
      h('p', { class: 'lizenz' }, `${s.lizenz.replace(/-/g, ' ')} · ${s.urheber.join(', ')}`)));
}

async function uebersicht() {
  const liste = await api('GET', '/api/szenarien');
  const titel = h('h1', {}, 'Ihre Lernspiele');
  leere(inhalt,
    held(titel, 'Wählen Sie einen Fall. Ihr Stand wird gespeichert, Sie können jederzeit unterbrechen.', { klein: true, oberzeile: ich?.kurs ?? 'Ihr Kurs' }),
    liste.length === 0 ? h('p', { class: 'karte' }, 'In diesem Kurs ist noch kein Lernspiel freigegeben.') : null,
    h('ul', { class: 'kacheln spiele' }, liste.map(spielkarte)));
  fokus(titel);
}

function spiele(start) {
  const buehne = h('div', { class: 'spielfeld' });
  leere(inhalt, buehne);
  let versuch = null;
  let nr = 0;
  const merke = (a) => { versuch = a.versuch; nr = a.nr; return a; };
  const p = spieler(buehne, {
    medienUrl: (datei) => medienUrl(start.szenario, datei),
    grafikUrl: (name) => `/bilder/${name}.svg`,
    sende: async (ereignis) => {
      try {
        return merke(await api('POST', `/api/versuche/${versuch}/ereignisse`, { nr, ereignis }));
      } catch (e) {
        // Anderer Tab hat weitergespielt: Stand übernehmen
        if (e instanceof ApiFehler && e.status === 409 && e.daten?.stand) { melde('Der Stand wurde aus einem anderen Fenster übernommen.'); return merke(e.daten.stand); }
        throw e;
      }
    },
    neu: async () => { const a = merke(await api('POST', '/api/versuche', { szenario: start.szenario })); history.replaceState(null, '', `#/versuch/${a.versuch}`); return a; },
    uebersicht: () => { location.hash = '#/'; },
  });
  (start.versuch ? api('GET', `/api/versuche/${start.versuch}`) : api('POST', '/api/versuche', { szenario: start.szenario }))
    .then((a) => { merke(a); start.szenario = a.szenario.id; history.replaceState(null, '', `#/versuch/${a.versuch}`); p.zeige(a); })
    .catch((e) => { melde(e.message, 'fehler'); location.hash = '#/'; });
}

async function meineDaten() {
  const titel = h('h1', {}, 'Meine Daten');
  leere(inhalt, h('section', { class: 'karte schmal' },
    h('p', { class: 'chips' }, h('span', { class: 'chip' }, symbol('schutz'), 'Datenschutz')),
    titel,
    h('p', {}, 'Gespeichert sind nur Ihr Pseudonym, Ihr Kurs und Ihre Spielschritte mit Zeitpunkt. Keine Namen, keine E-Mail-Adresse, keine IP-Adresse. Nicht genutzte Daten werden nach der eingestellten Frist automatisch gelöscht.'),
    ich ? h('div', { class: 'knopfreihe' },
      h('button', { class: 'knopf', type: 'button', onclick: async () => {
        const d = await api('GET', '/api/ich/daten');
        const a = h('a', { href: URL.createObjectURL(new Blob([JSON.stringify(d, null, 2)], { type: 'application/json' })), download: `meine-daten-${d.pseudonym}.json` });
        a.click();
      } }, symbol('herunterladen'), 'Alles herunterladen (JSON)'),
      h('button', { class: 'knopf knopf-gefahr', type: 'button', onclick: async () => {
        if (!confirm('Alle Ihre Daten unwiderruflich löschen?')) return;
        await api('DELETE', '/api/ich');
        ich = null; await ladeIch(); melde('Alle Daten gelöscht.'); location.hash = '#/';
      } }, 'Alles löschen')) : h('p', {}, 'Sie sind nicht angemeldet; es sind keine Daten zu Ihnen gespeichert.')));
  fokus(titel);
}

async function zeige() {
  const pfad = location.hash.replace(/^#/, '') || '/';
  if (pfad === '/daten') return meineDaten();
  if (!ich) return anmeldung();
  let m;
  if ((m = /^\/spiel\/([a-z0-9-]+)$/.exec(pfad))) return spiele({ szenario: m[1] });
  if ((m = /^\/versuch\/([0-9a-f-]{36})$/.exec(pfad))) return spiele({ versuch: m[1] });
  return uebersicht();
}

window.addEventListener('hashchange', () => {
  // Der Spieler ersetzt die Adresse selbst; nur echte Navigation neu zeichnen
  if (!/^#\/versuch\//.test(location.hash) || !inhalt.querySelector('.spielfeld')) zeige();
});
ladeIch().then(zeige).catch((e) => melde(e.message, 'fehler'));
