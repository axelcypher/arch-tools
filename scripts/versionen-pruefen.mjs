#!/usr/bin/env node
// Prüft in einem Pull Request die App-Versionen, damit kein Release verloren geht: Bei vielen parallelen PRs setzten
// mehrere dieselbe Version; der Release überspringt einen schon vorhandenen Tag, und die Änderung fehlte im
// ausgelieferten Stand. Fehlschlag, wenn
//   1. eine geänderte App-Version schon als Tag existiert,
//   2. eine App-Version geändert wurde, die Version der Rahmen-App (Arkly, apps/suite) aber nicht,
//   3. eine geänderte Version nicht größer ist als die auf dem aktuellen main.
// Aufruf in der CI (nur pull_request): node scripts/versionen-pruefen.mjs <Ziel-Branch>
// Die Tag-Schemata entsprechen .github/workflows/release.yml.

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

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

/**
 * Die eigentliche Prüfung (ohne Git, für Tests). `kopf`, `ziel`, `main`: Version je App im PR, auf dem Ziel-Branch
 * und auf dem aktuellen main (fehlt = App gibt es dort nicht); `tags`: alle Tags des Repositorys.
 * Liefert die Fehlermeldungen (leer = in Ordnung).
 */
export function pruefen({ kopf, ziel, main, tags }) {
  const fehler = [];
  const geaendert = APPS.filter((a) => kopf[a] && kopf[a] !== ziel[a]);
  for (const app of geaendert) {
    const v = kopf[app];
    // höchste vergebene Version: main oder ein schon veröffentlichter Tag
    const ueber = groesste([main[app], ...tags.map((t) => versionAusTag(app, t))]);
    const rat = `main mergen und die Version von ${app} über ${ueber ?? v} setzen (an allen fünf Stellen).`;
    if (tags.includes(tagVon(app, v))) fehler.push(`${app} ${v}: Tag ${tagVon(app, v)} gibt es schon – der Release würde übersprungen. Bitte ${rat}`);
    else if (main[app] && vergleich(v, main[app]) <= 0) fehler.push(`${app} ${v}: nicht größer als auf main (${main[app]}). Bitte ${rat}`);
  }
  if (geaendert.some((a) => a !== SUITE) && !geaendert.includes(SUITE)) {
    const ueber = groesste([main[SUITE], ziel[SUITE], ...tags.map((t) => versionAusTag(SUITE, t))]);
    fehler.push(
      `Geänderte App-Versionen (${geaendert.join(', ')}), aber die Rahmen-App (Arkly, apps/suite) ist unverändert – sie enthält alle Apps. Bitte main mergen und die Version von suite über ${ueber} setzen (an allen fünf Stellen).`,
    );
  }
  return fehler;
}

/* ---------- Aufruf in der CI ---------- */

const git = (...args) => execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

function versionenAus(lesen) {
  const v = {};
  for (const app of APPS) {
    try {
      v[app] = JSON.parse(lesen(`apps/${app}/package.json`)).version;
    } catch {
      // App gibt es dort (noch) nicht
    }
  }
  return v;
}

function main() {
  const zielBranch = process.argv[2] || 'main';
  git('fetch', '--quiet', '--no-tags', '--depth=1', 'origin', `+refs/heads/main:refs/remotes/origin/main`, `+refs/heads/${zielBranch}:refs/remotes/origin/${zielBranch}`);
  const tags = git('ls-remote', '--tags', '--refs', 'origin')
    .split('\n')
    .map((z) => z.split('\t')[1]?.replace('refs/tags/', ''))
    .filter(Boolean);
  const ausRef = (ref) => versionenAus((pfad) => git('show', `${ref}:${pfad}`));
  const fehler = pruefen({ kopf: versionenAus((pfad) => readFileSync(pfad, 'utf8')), ziel: ausRef(`origin/${zielBranch}`), main: ausRef('origin/main'), tags });
  for (const f of fehler) console.log(`::error::${f}`);
  if (fehler.length) process.exit(1);
  console.log('Versionen in Ordnung.');
}

if (import.meta.url === `file://${process.argv[1]}`) main();
