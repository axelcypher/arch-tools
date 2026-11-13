#!/usr/bin/env node
// Prüft in einem Pull Request die App-Versionen, damit kein Release verloren geht: Bei vielen parallelen PRs setzten
// mehrere dieselbe Version; der Release überspringt einen schon vorhandenen Tag, und die Änderung fehlte im
// ausgelieferten Stand. „Geändert“ heißt: im PR-Kopf anders als an der Abzweigung vom Ziel-Branch (Merge-Base) – nicht
// gegen die Merge-Ref, denn setzen zwei PRs dieselbe Version, mergt Git das ohne Konflikt und der Unterschied wäre weg.
// Fehlschlag, wenn
//   1. eine geänderte App-Version schon als Tag existiert,
//   2. eine geänderte Version nicht größer ist als die auf dem aktuellen main,
//   3. Dateien einer App (apps/<app>/…) bzw. des gemeinsamen Kerns (packages/core/…, betrifft alle Apps außer Arkly)
//      geändert wurden, ihre Version aber nicht – das fängt auch zwei PRs mit derselben Nummer, nachdem der zweite main
//      hereingemergt hat (dann ist die Version an der Merge-Base schon dieselbe); Doku (*.md) und Tests zählen nicht,
//   (4. eine Version nicht die Form x.y.z hat).
// Die Rahmen-App Arkly (apps/suite) hebt ein PR nur bei Änderungen an apps/suite selbst; enthält sie nur neue Fassungen
// anderer Apps, setzt der Release-Lauf ihre Version automatisch (scripts/suite-version.mjs).
// Aufruf in der CI (nur pull_request, volle Historie): node scripts/versionen-pruefen.mjs <Ziel-Branch> <PR-Kopf-SHA>
// Vor dem Merge von Hand: git fetch origin main && node scripts/versionen-pruefen.mjs main HEAD
// Die Tag-Schemata und die Liste der Apps entsprechen .github/workflows/release.yml (neue App: beide Stellen).

import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export const APPS = ['flaechenrechner', 'grz', 'kosten', 'ordner', 'entzerrung', 'formulare', 'ava', 'suite'];
export const SUITE = 'suite';

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

const groesste = (liste) => liste.filter(Boolean).reduce((m, v) => (m == null || vergleich(v, m) > 0 ? v : m), null);

const FORM = /^\d+\.\d+\.\d+$/;

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
 * Die eigentliche Prüfung (ohne Git, für Tests). `kopf`, `basis`, `main`: Version je App im PR-Kopf, an der Abzweigung
 * vom Ziel-Branch und auf dem aktuellen main (fehlt = App gibt es dort nicht); `tags`: alle Tags des Repositorys;
 * `dateien`: geänderte Dateien zwischen Abzweigung und PR-Kopf. Liefert die Fehlermeldungen (leer = in Ordnung).
 */
export function pruefen({ kopf, basis, main, tags, dateien = [] }) {
  const fehler = [];
  const geaendert = APPS.filter((a) => kopf[a] && kopf[a] !== basis[a]);
  const hoechste = (app) => groesste([main[app], basis[app], kopf[app], ...tags.map((t) => versionAusTag(app, t))]);
  for (const app of betroffeneApps(dateien)) {
    if (kopf[app] && !geaendert.includes(app))
      fehler.push(`${app}: Dateien geändert, Version nicht hochgesetzt. Bitte main mergen und die Version von ${app} über ${hoechste(app)} setzen (an allen fünf Stellen).`);
  }
  for (const app of geaendert) {
    const v = kopf[app];
    if (!FORM.test(v)) {
      fehler.push(`${app} ${v}: keine Version der Form x.y.z – der Release-Vergleich ginge daran vorbei.`);
      continue;
    }
    // höchste vergebene Version: main oder ein schon veröffentlichter Tag
    const ueber = groesste([main[app], ...tags.map((t) => versionAusTag(app, t))]);
    const rat = `main mergen und die Version von ${app} über ${ueber ?? v} setzen (an allen fünf Stellen).`;
    if (tags.includes(tagVon(app, v))) fehler.push(`${app} ${v}: Tag ${tagVon(app, v)} gibt es schon – der Release würde übersprungen. Bitte ${rat}`);
    else if (main[app] && vergleich(v, main[app]) <= 0) fehler.push(`${app} ${v}: nicht größer als auf main (${main[app]}). Bitte ${rat}`);
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
  git('fetch', '--quiet', '--no-tags', 'origin', '+refs/heads/main:refs/remotes/origin/main', `+refs/heads/${zielBranch}:refs/remotes/origin/${zielBranch}`);
  const tags = git('ls-remote', '--tags', '--refs', 'origin')
    .split('\n')
    .map((z) => z.split('\t')[1]?.replace('refs/tags/', ''))
    .filter(Boolean);
  const basis = git('merge-base', `origin/${zielBranch}`, kopfRef);
  const dateien = git('diff', '--name-only', basis, kopfRef).split('\n').filter(Boolean);
  const fehler = pruefen({ kopf: versionenIn(kopfRef), basis: versionenIn(basis), main: versionenIn('origin/main'), tags, dateien });
  for (const f of fehler) console.log(`::error::${f}`);
  if (fehler.length) process.exit(1);
  console.log('Versionen in Ordnung.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
