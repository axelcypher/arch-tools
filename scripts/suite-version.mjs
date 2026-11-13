#!/usr/bin/env node
// Version der Rahmen-App Arkly (apps/suite) automatisch im Release-Lauf setzen. Arkly enthält alle Apps; früher hob
// jeder PR ihre Version mit – bei vielen parallelen PRs ein Dauer-Wettrennen um dieselbe Nummer. Jetzt gilt:
// Erscheint auf main eine neue Version einer anderen App und ist die aktuelle Arkly-Version schon veröffentlicht
// (Tag suite-v<version> vorhanden), setzt der Release-Lauf Arkly auf die nächste freie Nummer – Minor, wenn eine der
// neuen App-Versionen Minor oder Major erhöht, sonst Patch –, committet das nach main und baut Arkly mit.
// Ein PR darf Arkly weiterhin selbst hochsetzen (eigene Änderungen an apps/suite); dann gilt diese Version.
//
//   node scripts/suite-version.mjs automatisch   im Release-Lauf: prüft, setzt die Dateien, gibt `neu=<version>` aus
//   node scripts/suite-version.mjs setzen 1.2.3   die fünf Stellen von Hand setzen
//
// Tag-Schemata und App-Liste wie scripts/versionen-pruefen.mjs und .github/workflows/release.yml.

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { APPS, SUITE, tagVon, vergleich, versionAusTag } from './versionen-pruefen.mjs';

const teile = (v) => v.split('.').map(Number);

/** Art der Erhöhung von `alt` auf `neu`: 'major', 'minor' oder 'patch' (alt fehlt = 'minor') */
export function erhoehung(alt, neu) {
  if (!alt) return 'minor';
  const [a, b] = [teile(alt), teile(neu)];
  if (b[0] !== a[0]) return 'major';
  if (b[1] !== a[1]) return 'minor';
  return 'patch';
}

/** höchste veröffentlichte Version einer App laut Tags (null = keine) */
export const veroeffentlicht = (app, tags) =>
  tags
    .map((t) => versionAusTag(app, t))
    .filter(Boolean)
    .reduce((m, v) => (m == null || vergleich(v, m) > 0 ? v : m), null);

/**
 * Neue Arkly-Version oder null (keine nötig). `versionen`: aktuelle Version je App auf main; `tags`: alle Tags.
 * Nötig, wenn eine andere App eine noch nicht veröffentlichte Version hat und die Arkly-Version schon veröffentlicht ist.
 */
export function naechsteSuiteVersion(versionen, tags) {
  const suite = versionen[SUITE];
  if (!tags.includes(tagVon(SUITE, suite))) return null;
  const neue = APPS.filter((a) => a !== SUITE && versionen[a] && !tags.includes(tagVon(a, versionen[a])));
  if (!neue.length) return null;
  const minor = neue.some((a) => erhoehung(veroeffentlicht(a, tags), versionen[a]) !== 'patch');
  const basis = [suite, veroeffentlicht(SUITE, tags)].filter(Boolean).reduce((m, v) => (vergleich(v, m) > 0 ? v : m));
  const [x, y, z] = teile(basis);
  return minor ? `${x}.${y + 1}.0` : `${x}.${y}.${z + 1}`;
}

/**
 * Arkly-Version an allen fünf Stellen setzen (package.json, tauri.conf.json, Cargo.toml, Cargo.lock, package-lock.json).
 * Erst alle Inhalte lesen und prüfen, dann schreiben – ein Fehler hinterlässt keinen halb gesetzten Stand.
 */
export function suiteVersionSetzen(neu, wurzel = '.') {
  const pfad = (p) => `${wurzel}/${p}`;
  const neuJson = (p, f) => {
    const o = JSON.parse(readFileSync(pfad(p), 'utf8'));
    f(o);
    return `${JSON.stringify(o, null, 2)}\n`;
  };
  const neuText = (p, alt, ersatz) => {
    const s = readFileSync(pfad(p), 'utf8');
    if (!alt.test(s)) throw new Error(`${p}: Version nicht gefunden`);
    return s.replace(alt, ersatz);
  };
  const inhalte = {
    'apps/suite/package.json': neuJson('apps/suite/package.json', (o) => (o.version = neu)),
    'apps/suite/src-tauri/tauri.conf.json': neuJson('apps/suite/src-tauri/tauri.conf.json', (o) => (o.version = neu)),
    'apps/suite/src-tauri/Cargo.toml': neuText('apps/suite/src-tauri/Cargo.toml', /^version = "[^"]*"/m, `version = "${neu}"`),
    'apps/suite/src-tauri/Cargo.lock': neuText('apps/suite/src-tauri/Cargo.lock', /(name = "arch-tools"\nversion = )"[^"]*"/, `$1"${neu}"`),
    'package-lock.json': neuJson('package-lock.json', (o) => {
      if (!o.packages?.['apps/suite']) throw new Error('package-lock.json: apps/suite nicht gefunden');
      o.packages['apps/suite'].version = neu;
    }),
  };
  for (const [p, inhalt] of Object.entries(inhalte)) writeFileSync(pfad(p), inhalt);
}

/** Tags aus der Ausgabe von `git ls-remote --tags --refs` */
export const tagsAus = (lsRemote) =>
  lsRemote
    .split('\n')
    .map((z) => z.split('\t')[1]?.replace('refs/tags/', ''))
    .filter(Boolean);

/* ---------- Aufruf ---------- */

function main() {
  const [befehl, version] = process.argv.slice(2);
  if (befehl === 'setzen' && /^\d+\.\d+\.\d+$/.test(version ?? '')) {
    suiteVersionSetzen(version);
    return;
  }
  if (befehl !== 'automatisch') {
    console.error('Aufruf: suite-version.mjs automatisch | setzen <x.y.z>');
    process.exit(2);
  }
  const versionen = Object.fromEntries(APPS.map((a) => [a, JSON.parse(readFileSync(`apps/${a}/package.json`, 'utf8')).version]));
  const tags = tagsAus(execFileSync('git', ['ls-remote', '--tags', '--refs', 'origin'], { encoding: 'utf8' }));
  const neu = naechsteSuiteVersion(versionen, tags);
  if (!neu) {
    console.log(`Arkly ${versionen[SUITE]}: keine neue Version nötig.`);
    return;
  }
  suiteVersionSetzen(neu);
  console.log(`Arkly ${versionen[SUITE]} → ${neu}`);
  console.log(`neu=${neu}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
