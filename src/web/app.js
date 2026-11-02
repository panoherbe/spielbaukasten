// Oberfläche für Studierende: Beitritt mit Kurscode, Übersicht der Szenarien, Spielen, eigene Daten.

import { api, ApiFehler } from './api.js';
import { h, leere, fokus, melde, zahl } from './ui.js';
import { spieler } from './spieler.js';

const inhalt = document.getElementById('inhalt');
const navigation = document.getElementById('navigation');
let ich = null;

async function ladeIch() {
  try { ich = await api('GET', '/api/ich'); } catch (e) { if (e instanceof ApiFehler && e.status === 401) ich = null; else throw e; }
  leere(navigation, ich ? [
    h('span', { class: 'pseudonym', title: 'Ihr Pseudonym' }, ich.pseudonym),
    h('button', { class: 'knopf-text', type: 'button', onclick: abmelden }, 'Abmelden'),
  ] : []);
}

async function abmelden() {
  await api('POST', '/api/abmelden', {});
  ich = null;
  location.hash = '#/';
  await zeige();
}

function anmeldung() {
  const kurs = h('input', { id: 'kurscode', name: 'kurscode', autocomplete: 'off', autocapitalize: 'characters', required: true, placeholder: 'z. B. K7QH-M3PZ' });
  const wieder = h('input', { id: 'wiederkehr', name: 'wiederkehr', autocomplete: 'off', autocapitalize: 'characters', placeholder: 'z. B. ABCD-EF23-GH45' });
  const titel = h('h1', {}, 'Willkommen');
  leere(inhalt,
    h('section', { class: 'karte schmal' },
      titel,
      h('p', {}, 'Mit dem Kurscode Ihrer Lehrveranstaltung geht es los. Sie brauchen kein Konto und geben keinen Namen an; Sie bekommen ein zufälliges Pseudonym.'),
      h('form', { class: 'stapel', onsubmit: async (e) => {
        e.preventDefault();
        try {
          const r = await api('POST', '/api/anmelden/studierende', { kurscode: kurs.value });
          await ladeIch();
          zeigeWiederkehrcode(r);
        } catch (err) { melde(err.message, 'fehler'); kurs.focus(); }
      } },
      h('label', { for: 'kurscode', class: 'beschriftung' }, 'Kurscode'), kurs,
      h('button', { class: 'knopf knopf-haupt', type: 'submit' }, 'Beitreten'))),
    h('details', { class: 'karte schmal' },
      h('summary', {}, 'Schon dabei? Mit Ihrem persönlichen Code weitermachen'),
      h('form', { class: 'stapel', onsubmit: async (e) => {
        e.preventDefault();
        try { await api('POST', '/api/anmelden/wiederkehr', { wiederkehrcode: wieder.value }); await ladeIch(); location.hash = '#/'; zeige(); } catch (err) { melde(err.message, 'fehler'); }
      } },
      h('label', { for: 'wiederkehr', class: 'beschriftung' }, 'Persönlicher Code'), wieder,
      h('button', { class: 'knopf', type: 'submit' }, 'Weitermachen'))));
  fokus(titel);
}

function zeigeWiederkehrcode(r) {
  const titel = h('h1', {}, `Hallo, ${r.pseudonym}`);
  leere(inhalt, h('section', { class: 'karte schmal' },
    titel,
    h('p', {}, `Sie sind im Kurs „${r.kurs}“. Ihr Fortschritt wird unter diesem Pseudonym gespeichert, ohne Namen.`),
    h('p', {}, 'Ihr persönlicher Code, um auf einem anderen Gerät weiterzumachen. Er wird nur jetzt angezeigt:'),
    h('p', { class: 'code-gross' }, r.wiederkehrcode),
    h('button', { class: 'knopf knopf-haupt', type: 'button', onclick: () => { location.hash = '#/'; zeige(); } }, 'Zu den Lernspielen')));
  fokus(titel);
}

async function uebersicht() {
  const liste = await api('GET', '/api/szenarien');
  const titel = h('h1', {}, 'Ihre Lernspiele');
  leere(inhalt, titel, liste.length === 0 ? h('p', { class: 'karte' }, 'In diesem Kurs ist noch kein Lernspiel freigegeben.') : null,
    h('ul', { class: 'kacheln' }, liste.map((s) => h('li', { class: 'karte kachel' },
      h('h2', {}, s.titel),
      h('p', { class: 'gedaempft' }, [s.fach, s.dauerMinuten ? `ca. ${s.dauerMinuten} Min.` : null].filter(Boolean).join(' · ')),
      h('p', {}, s.kurzbeschreibung),
      s.eigene.beendet ? h('p', { class: 'stand' }, `${s.eigene.beendet}× abgeschlossen, bestes Ergebnis ${zahl((s.eigene.besteQuote ?? 0) * 100, 0)} %`) : null,
      h('div', { class: 'knopfreihe' },
        s.eigene.offenerVersuch ? h('a', { class: 'knopf knopf-haupt', href: `#/versuch/${s.eigene.offenerVersuch}` }, 'Fortsetzen') : null,
        h('a', { class: s.eigene.offenerVersuch ? 'knopf' : 'knopf knopf-haupt', href: `#/spiel/${s.id}` }, s.eigene.offenerVersuch ? 'Neu beginnen' : 'Starten')),
      h('p', { class: 'lizenz' }, `${s.lizenz.replace(/-/g, ' ')} · ${s.urheber.join(', ')}`)))));
  fokus(titel);
}

function spiele(start) {
  const buehne = h('div', { class: 'buehne' });
  leere(inhalt, buehne);
  let versuch = null;
  let nr = 0;
  const merke = (a) => { versuch = a.versuch; nr = a.nr; return a; };
  const p = spieler(buehne, {
    medienUrl: (datei) => `/medien/${encodeURIComponent(start.szenario)}/${datei.split('/').map(encodeURIComponent).join('/')}`,
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
    titel,
    h('p', {}, 'Gespeichert sind nur Ihr Pseudonym, Ihr Kurs und Ihre Spielschritte mit Zeitpunkt. Keine Namen, keine E-Mail-Adresse, keine IP-Adresse. Nicht genutzte Daten werden nach der eingestellten Frist automatisch gelöscht.'),
    ich ? h('div', { class: 'knopfreihe' },
      h('button', { class: 'knopf', type: 'button', onclick: async () => {
        const d = await api('GET', '/api/ich/daten');
        const a = h('a', { href: URL.createObjectURL(new Blob([JSON.stringify(d, null, 2)], { type: 'application/json' })), download: `meine-daten-${d.pseudonym}.json` });
        a.click();
      } }, 'Alles herunterladen (JSON)'),
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
  if (!/^#\/versuch\//.test(location.hash) || !inhalt.querySelector('.buehne')) zeige();
});
ladeIch().then(zeige).catch((e) => melde(e.message, 'fehler'));
