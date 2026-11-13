#!/usr/bin/env node
// Versionen aller Apps im Release-Lauf setzen – nach dem Muster von Changesets. PRs heben keine Versionen mehr; jeder
// PR legt stattdessen eine Notiz mit eindeutigem Namen an (.versionen/<zweig>.json, Format siehe .versionen/LIESMICH.md):
//
//   { "grz": { "stufe": "minor", "notiz": "Neuer Nachweis …" }, "kosten": { "stufe": "patch", "notiz": "…" } }
//
// Dateien mit verschiedenen Namen kollidieren nie, deshalb gibt es kein Wettrennen um Versionsnummern mehr. Der
// Release-Lauf sammelt alle Notizen auf main, hebt je App die größte verlangte Stufe (über der höchsten veröffentlichten
// Version), setzt Arkly (Minor, wenn eine App Minor oder Major erhöht, sonst Patch – oder höher, wenn eine Notiz für
// Arkly es verlangt), löscht die Notizen, committet nach main und baut danach.
//
//   node scripts/versionen-setzen.mjs automatisch    im Release-Lauf (Ausgabe für den Commit, Release-Notizen als JSON)
//   node scripts/versionen-setzen.mjs setzen <app> <x.y.z>   eine App von Hand an allen fünf Stellen setzen
//
// App-Liste und Tag-Schemata wie scripts/versionen-pruefen.mjs und .github/workflows/release.yml.

import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { APPS, NOTIZEN, notizAus, STUFEN, SUITE, tagVon, vergleich, versionAusTag } from './versionen-pruefen.mjs';

export { NOTIZEN };

/** Produktnamen für Commit und Release-Notizen (wie packages/core/src/appNamen.ts) */
export const NAMEN = { flaechenrechner: 'QUADRIO', grz: 'TERRIO', kosten: 'NUMIO', ordner: 'ATLAS', entzerrung: 'RECTIO', formulare: 'PERMIO', ava: 'FABRIO', suite: 'Arkly' };

/** höchste veröffentlichte Version einer App laut Tags (null = keine) */
export const veroeffentlicht = (app, tags) =>
  tags
    .map((t) => versionAusTag(app, t))
    .filter(Boolean)
    .reduce((m, v) => (m == null || vergleich(v, m) > 0 ? v : m), null);

/** Tags aus der Ausgabe von `git ls-remote --tags --refs` */
export const tagsAus = (lsRemote) =>
  lsRemote
    .split('\n')
    .map((z) => z.split('\t')[1]?.replace('refs/tags/', ''))
    .filter(Boolean);

const rang = (stufe) => STUFEN.indexOf(stufe);
export const hoehere = (a, b) => (a == null ? b : b == null ? a : rang(a) >= rang(b) ? a : b);

/** Version um eine Stufe erhöhen */
export function erhoehen(version, stufe) {
  const [x, y, z] = version.split('.').map(Number);
  if (stufe === 'major') return `${x + 1}.0.0`;
  if (stufe === 'minor') return `${x}.${y + 1}.0`;
  return `${x}.${y}.${z + 1}`;
}

/**
 * Neue Versionen aus Notizen. `versionen`: aktuelle Version je App auf main; `tags`: alle Tags; `eintraege`: aus allen
 * Notizen. Liefert je App, die eine neue Version bekommt: { alt, neu, stufe, notizen }. Arkly bekommt eine neue
 * Version, sobald eine andere App eine bekommt oder eine Notiz für Arkly vorliegt. Übergang: Hat eine App noch eine
 * von Hand gesetzte, unveröffentlichte Version, bleibt sie (ohne Notiz) unverändert und zählt für Arkly mit.
 */
export function neueVersionen({ versionen, tags, eintraege }) {
  const ergebnis = {};
  const stufeVon = (app) => eintraege.filter((e) => e.app === app).reduce((s, e) => hoehere(s, e.stufe), null);
  const unveroeffentlicht = (app) => !!versionen[app] && !tags.includes(tagVon(app, versionen[app]));
  const basisVon = (app) => [versionen[app], veroeffentlicht(app, tags)].filter(Boolean).reduce((m, v) => (vergleich(v, m) > 0 ? v : m));
  for (const app of APPS.filter((a) => a !== SUITE)) {
    const stufe = stufeVon(app);
    if (!stufe || !versionen[app]) continue;
    // schon von Hand gehoben (Übergang) und noch nicht veröffentlicht: diese Version gilt, wenn sie mindestens so hoch ist
    const neu = unveroeffentlicht(app) ? versionen[app] : erhoehen(basisVon(app), stufe);
    ergebnis[app] = { alt: versionen[app], neu, stufe, notizen: eintraege.filter((e) => e.app === app).map((e) => e.notiz) };
  }
  // Arkly enthält alle Apps
  const andere = APPS.filter((a) => a !== SUITE && (ergebnis[a] || unveroeffentlicht(a)));
  const abgeleitet = andere.length ? (andere.some((a) => (ergebnis[a]?.stufe ?? 'patch') !== 'patch') ? 'minor' : 'patch') : null;
  const stufe = hoehere(stufeVon(SUITE), abgeleitet);
  if (stufe && versionen[SUITE] && !unveroeffentlicht(SUITE)) {
    const notizen = [...eintraege.filter((e) => e.app === SUITE).map((e) => e.notiz), ...andere.filter((a) => ergebnis[a]).flatMap((a) => ergebnis[a].notizen.map((n) => `${NAMEN[a]}: ${n}`))];
    ergebnis[SUITE] = { alt: versionen[SUITE], neu: erhoehen(basisVon(SUITE), stufe), stufe, notizen };
  }
  return ergebnis;
}

/** Version einer App an allen fünf Stellen setzen – erst alles lesen und prüfen, dann schreiben (ganz oder gar nicht) */
export function versionSetzen(app, neu, wurzel = '.') {
  const pfad = (p) => `${wurzel}/${p}`;
  const d = `apps/${app}`;
  const cargo = readFileSync(pfad(`${d}/src-tauri/Cargo.toml`), 'utf8');
  const crate = /^name = "([^"]+)"/m.exec(cargo)?.[1];
  if (!crate) throw new Error(`${d}/src-tauri/Cargo.toml: Paketname nicht gefunden`);
  const neuJson = (p, f) => {
    const o = JSON.parse(readFileSync(pfad(p), 'utf8'));
    f(o);
    return `${JSON.stringify(o, null, 2)}\n`;
  };
  const neuText = (p, s, alt, ersatz) => {
    if (!alt.test(s)) throw new Error(`${p}: Version nicht gefunden`);
    return s.replace(alt, ersatz);
  };
  const lock = readFileSync(pfad(`${d}/src-tauri/Cargo.lock`), 'utf8');
  const name = crate.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const inhalte = {
    [`${d}/package.json`]: neuJson(`${d}/package.json`, (o) => (o.version = neu)),
    [`${d}/src-tauri/tauri.conf.json`]: neuJson(`${d}/src-tauri/tauri.conf.json`, (o) => (o.version = neu)),
    [`${d}/src-tauri/Cargo.toml`]: neuText(`${d}/src-tauri/Cargo.toml`, cargo, /^version = "[^"]*"/m, `version = "${neu}"`),
    [`${d}/src-tauri/Cargo.lock`]: neuText(`${d}/src-tauri/Cargo.lock`, lock, new RegExp(`(name = "${name}"\\nversion = )"[^"]*"`), `$1"${neu}"`),
  };
  for (const [p, inhalt] of Object.entries(inhalte)) writeFileSync(pfad(p), inhalt);
  return inhalte;
}

/** package-lock.json für mehrere Apps auf einmal nachziehen */
export function lockSetzen(neu, wurzel = '.') {
  const p = `${wurzel}/package-lock.json`;
  const o = JSON.parse(readFileSync(p, 'utf8'));
  for (const [app, v] of Object.entries(neu)) {
    if (!o.packages?.[`apps/${app}`]) throw new Error(`package-lock.json: apps/${app} nicht gefunden`);
    o.packages[`apps/${app}`].version = v;
  }
  writeFileSync(p, `${JSON.stringify(o, null, 2)}\n`);
}

/** alle Notizen des Ordners lesen (ohne LIESMICH) */
export function notizenLesen(wurzel = '.') {
  const ordner = `${wurzel}/${NOTIZEN}`;
  if (!existsSync(ordner)) return { dateien: [], eintraege: [], fehler: [] };
  const dateien = readdirSync(ordner)
    .filter((n) => n.endsWith('.json'))
    .sort();
  const eintraege = [];
  const fehler = [];
  for (const n of dateien) {
    const r = notizAus(`${NOTIZEN}/${n}`, readFileSync(`${ordner}/${n}`, 'utf8'));
    eintraege.push(...r.eintraege);
    fehler.push(...r.fehler);
  }
  return { dateien: dateien.map((n) => `${ordner}/${n}`), eintraege, fehler };
}

/* ---------- Aufruf ---------- */

function main() {
  const [befehl, a, b] = process.argv.slice(2);
  if (befehl === 'setzen' && APPS.includes(a) && /^\d+\.\d+\.\d+$/.test(b ?? '')) {
    versionSetzen(a, b);
    lockSetzen({ [a]: b });
    return;
  }
  if (befehl !== 'automatisch') {
    console.error('Aufruf: versionen-setzen.mjs automatisch | setzen <app> <x.y.z>');
    process.exit(2);
  }
  const versionen = Object.fromEntries(APPS.map((x) => [x, JSON.parse(readFileSync(`apps/${x}/package.json`, 'utf8')).version]));
  const tags = tagsAus(execFileSync('git', ['ls-remote', '--tags', '--refs', 'origin'], { encoding: 'utf8' }));
  const { dateien, eintraege, fehler } = notizenLesen();
  // eine kaputte Notiz darf die übrigen nicht aufhalten (die PR-Prüfung sollte sie verhindert haben)
  for (const f of fehler) console.log(`::warning::${f} – übergangen`);
  const neu = neueVersionen({ versionen, tags, eintraege });
  for (const [app, e] of Object.entries(neu)) if (e.neu !== e.alt) versionSetzen(app, e.neu);
  const geaendert = Object.fromEntries(
    Object.entries(neu)
      .filter(([, e]) => e.neu !== e.alt)
      .map(([app, e]) => [app, e.neu]),
  );
  if (Object.keys(geaendert).length) lockSetzen(geaendert);
  for (const d of dateien) rmSync(d);
  // Release-Notizen je App für den Bau (Datei aus der Umgebung, sonst nicht)
  if (process.env.NOTIZEN_AUS) writeFileSync(process.env.NOTIZEN_AUS, JSON.stringify(Object.fromEntries(Object.entries(neu).map(([app, e]) => [app, e.notizen.join('\n')]))));
  const zusammenfassung = Object.entries(neu)
    .map(([app, e]) => `${NAMEN[app]} ${e.neu}`)
    .join(', ');
  if (!zusammenfassung && !dateien.length) {
    console.log('Keine Notizen und keine neuen Versionen.');
    return;
  }
  console.log(`zusammenfassung=${zusammenfassung || 'nur Notizen entfernt'}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
