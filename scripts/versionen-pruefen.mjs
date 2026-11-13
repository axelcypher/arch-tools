#!/usr/bin/env node
// Prüft in einem Pull Request Versionen und Versionsnotizen. Versionen setzt seit dem Umbau auf Notizen (nach dem Muster
// von Changesets) nur noch der Release-Lauf (scripts/versionen-setzen.mjs); ein PR legt stattdessen eine Notiz mit
// eindeutigem Namen an (.versionen/<zweig>.json, Format in .versionen/LIESMICH.md). Fehlschlag, wenn
//   1. der PR eine App-Version ändert (das macht der Release-Lauf; zurücknehmen und eine Notiz anlegen),
//   2. Dateien einer App (apps/<app>/…) bzw. des gemeinsamen Kerns (packages/core/…, betrifft alle Apps außer Arkly)
//      geändert sind, die App aber in keiner Notiz des PRs steht – Doku (*.md) und Tests zählen nicht,
//   3. eine Notiz des PRs ungültig ist (unbekannte App, Stufe nicht patch/minor/major, Satz fehlt).
// „Geändert“ heißt: im PR-Kopf anders als an der Abzweigung vom Ziel-Branch (Merge-Base). Arkly bekommt ihre Version im
// Release-Lauf, sobald eine andere App eine bekommt; eine Notiz für Arkly braucht es nur bei Änderungen an apps/suite.
// Aufruf in der CI (nur pull_request, volle Historie): node scripts/versionen-pruefen.mjs <Ziel-Branch> <PR-Kopf-SHA>
// Vor dem Merge von Hand: git fetch origin main && node scripts/versionen-pruefen.mjs main HEAD
// Die Tag-Schemata und die Liste der Apps entsprechen .github/workflows/release.yml (neue App: beide Stellen).

import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export const APPS = ['flaechenrechner', 'grz', 'kosten', 'ordner', 'entzerrung', 'formulare', 'ava', 'suite'];
export const SUITE = 'suite';
export const STUFEN = ['patch', 'minor', 'major'];
export const NOTIZEN = '.versionen';

/** Tag des Releases einer App-Version (wie release.yml) */
export const tagVon = (app, version) => (app === 'flaechenrechner' ? `v${version}` : `${app}-v${version}`);

/** Version aus einem Tag der App, sonst null */
export function versionAusTag(app, tag) {
  const vorne = app === 'flaechenrechner' ? 'v' : `${app}-v`;
  if (!tag.startsWith(vorne)) return null;
  const v = tag.slice(vorne.length);
  return /^\d+\.\d+\.\d+$/.test(v) ? v : null;
}

/** Vergleich zweier Versionen x.y.z: negativ, 0, positiv */
export function vergleich(a, b) {
  const x = a.split('.').map(Number);
  const y = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) - (y[i] ?? 0);
  return 0;
}

/** ausgelieferter Code? Doku und Tests nicht */
const ausgeliefert = (pfad) => !/\.md$/i.test(pfad) && !/\.test\.[cm]?[jt]sx?$/.test(pfad) && !pfad.includes('/__fixtures__/');

/**
 * Apps, deren ausgelieferter Code sich laut Dateiliste ändert. packages/core betrifft alle außer Arkly: Arkly bekommt
 * ihre Version automatisch im Release-Lauf, sobald eine der anderen Apps eine neue hat.
 */
export function betroffeneApps(dateien) {
  const apps = new Set();
  for (const pfad of dateien.filter(ausgeliefert)) {
    if (pfad.startsWith('packages/core/')) APPS.filter((a) => a !== SUITE).forEach((a) => apps.add(a));
    const m = /^apps\/([^/]+)\//.exec(pfad);
    if (m && APPS.includes(m[1])) apps.add(m[1]);
  }
  return APPS.filter((a) => apps.has(a));
}

/**
 * Eine Notiz prüfen und lesen. Liefert die Einträge und die Fehler (leer = gültig).
 * Erlaubt: { "<app>": { "stufe": "patch" | "minor" | "major", "notiz": "ein Satz" }, … } mit mindestens einer App.
 */
export function notizAus(name, roh) {
  const fehler = [];
  const eintraege = [];
  let o;
  try {
    o = JSON.parse(roh);
  } catch {
    return { eintraege, fehler: [`${name}: kein gültiges JSON`] };
  }
  if (!o || typeof o !== 'object' || Array.isArray(o) || !Object.keys(o).length) return { eintraege, fehler: [`${name}: erwartet { "<app>": { "stufe", "notiz" } } mit mindestens einer App`] };
  for (const [app, e] of Object.entries(o)) {
    if (!APPS.includes(app)) {
      fehler.push(`${name}: unbekannte App „${app}“ (erlaubt: ${APPS.join(', ')})`);
      continue;
    }
    if (!e || typeof e !== 'object' || !STUFEN.includes(e.stufe)) {
      fehler.push(`${name}: ${app}: „stufe“ muss patch, minor oder major sein`);
      continue;
    }
    if (typeof e.notiz !== 'string' || !e.notiz.trim()) {
      fehler.push(`${name}: ${app}: „notiz“ fehlt (ein Satz für die Release-Notiz)`);
      continue;
    }
    eintraege.push({ app, stufe: e.stufe, notiz: e.notiz.trim() });
  }
  return { eintraege, fehler };
}

/** Vorlage einer Notiz für die Meldung */
const vorlage = (apps) => JSON.stringify(Object.fromEntries(apps.map((a) => [a, { stufe: 'patch', notiz: '…' }])));

/**
 * Die eigentliche Prüfung (ohne Git, für Tests). `kopf`, `basis`: Version je App im PR-Kopf und an der Abzweigung vom
 * Ziel-Branch; `dateien`: geänderte Dateien zwischen Abzweigung und PR-Kopf; `notizen`: die Notizen des PRs als
 * [{ name, inhalt }]. Liefert die Fehlermeldungen (leer = in Ordnung).
 */
export function pruefen({ kopf, basis, dateien = [], notizen = [] }) {
  const fehler = [];
  for (const app of APPS.filter((a) => kopf[a] && basis[a] && kopf[a] !== basis[a])) {
    fehler.push(`${app}: Version ${basis[app]} → ${kopf[app]} im PR geändert. Versionen setzt der Release-Lauf – bitte auf ${basis[app]} zurücksetzen und eine Notiz in ${NOTIZEN}/ anlegen.`);
  }
  const eintraege = [];
  for (const n of notizen) {
    const r = notizAus(n.name, n.inhalt);
    fehler.push(...r.fehler);
    eintraege.push(...r.eintraege);
  }
  const fehlend = betroffeneApps(dateien).filter((a) => kopf[a] && !eintraege.some((e) => e.app === a));
  if (fehlend.length) {
    fehler.push(
      `Geänderte Apps ohne Versionsnotiz: ${fehlend.join(', ')}. Bitte eine Datei ${NOTIZEN}/<zweig>.json anlegen, z. B. ${vorlage(fehlend)} – Stufe patch (Fehlerkorrektur), minor (neue Funktion) oder major, dazu ein Satz für die Release-Notiz.`,
    );
  }
  return fehler;
}

/* ---------- Aufruf in der CI bzw. vor dem Merge ---------- */

const git = (...args) => execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

function versionenIn(ref) {
  const v = {};
  for (const app of APPS) {
    try {
      v[app] = JSON.parse(git('show', `${ref}:apps/${app}/package.json`)).version;
    } catch {
      // App gibt es dort (noch) nicht
    }
  }
  return v;
}

function main() {
  const zielBranch = process.argv[2] || 'main';
  const kopfRef = process.argv[3] || 'HEAD';
  if (git('rev-parse', '--is-shallow-repository') === 'true') {
    console.log('::error::Für die Prüfung wird die volle Historie gebraucht (actions/checkout mit fetch-depth: 0 bzw. git fetch --unshallow).');
    process.exit(1);
  }
  git('fetch', '--quiet', '--no-tags', 'origin', `+refs/heads/${zielBranch}:refs/remotes/origin/${zielBranch}`);
  const basis = git('merge-base', `origin/${zielBranch}`, kopfRef);
  const dateien = git('diff', '--name-only', basis, kopfRef).split('\n').filter(Boolean);
  // Notizen des PRs: im Kopf vorhanden und gegenüber der Abzweigung neu oder geändert
  const notizen = git('diff', '--name-only', '--diff-filter=AM', basis, kopfRef, '--', `${NOTIZEN}/`)
    .split('\n')
    .filter((p) => p.endsWith('.json'))
    .map((name) => ({ name, inhalt: git('show', `${kopfRef}:${name}`) }));
  const fehler = pruefen({ kopf: versionenIn(kopfRef), basis: versionenIn(basis), dateien, notizen });
  for (const f of fehler) console.log(`::error::${f}`);
  if (fehler.length) process.exit(1);
  console.log(`Versionen und Notizen in Ordnung${notizen.length ? ` (${notizen.map((n) => n.name).join(', ')})` : ''}.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
