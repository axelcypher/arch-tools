// Umfang der großen Regel-Matrizen (packages/baurecht-regeln/test/paket.test.ts) im PR: voll nur, wenn der PR etwas
// ändert, das die Auswertung von LEXIO erreichen kann – sonst die feste Stichprobe (wie lokal). Auf main, im
// Release-Lauf (LEXIO und Arkly) und im Regel-Workflow bleibt es immer voll; dort wird dieses Skript nicht aufgerufen.
// Im Zweifel voll: Die Stichprobe gilt nur, wenn JEDE geänderte Datei sicher außerhalb liegt –
//   - Doku und Notizen: docs/, .versionen/, .claude/, Markdown-Dateien
//   - andere Apps: apps/<app>/ außer apps/baurecht/ (Arkly bettet LEXIO ein, wertet aber nicht selbst aus), solange
//     LEXIO und das Regelpaket nichts aus ihnen einbinden
//   - Kerndateien (packages/core/), die weder LEXIO (auch Tests) noch das Regelpaket (auch Tests und Werkzeuge) über
//     Importe erreicht (scripts/kern-nutzer.mjs, erreichbarAus); nicht zuordenbare Kerndateien gelten als erreicht
// Alles andere (Regelpaket, LEXIO, Wurzel-Konfiguration, package-lock, Workflows, Skripte, unbekannte Ordner): voll.
// Aufruf in der CI: node scripts/regeln-matrix.mjs <ziel-branch> <kopf> – schreibt voll=true|false nach $GITHUB_OUTPUT.
// Jeder Fehler ergibt voll=true.

import { execFileSync } from 'node:child_process';
import { appendFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { erreichbarAus } from './kern-nutzer.mjs';

const LEXIO = 'apps/baurecht/';
const REGELN = 'packages/baurecht-regeln/';
const QUELLE = /\.(tsx?|jsx?|mjs|css)$/;

/** Dateien, die LEXIO oder das Regelpaket über Importe erreichen (null: nicht sicher verfolgbar) – aus dem Arbeitsbaum */
export function regelnKern(wurzel) {
  return erreichbarAus(wurzel, [`${LEXIO}src`, REGELN]);
}

/**
 * true: volle Matrix; `dateien`: im PR geänderte Pfade (auch gelöschte); `kern`: Menge aus regelnKern (null = alle);
 * `gibt`: Datei im Arbeitsbaum vorhanden (gelöschte Kerndateien lassen sich nicht zuordnen)
 */
export function regelnVoll(dateien, kern, gibt = () => true) {
  return dateien.some((p) => !sicherAusserhalb(p, kern, gibt));
}

function sicherAusserhalb(p, kern, gibt) {
  if (p.startsWith(LEXIO) || p.startsWith(REGELN)) return false;
  if (/^(docs|\.versionen|\.claude)\//.test(p) || (p.endsWith('.md') && !p.startsWith('packages/core/'))) return true;
  // andere App: nur, wenn LEXIO und das Regelpaket nichts aus ihr einbinden
  const app = /^apps\/[^/]+\//.exec(p);
  if (app) return !!kern && ![...kern].some((k) => k.startsWith(app[0]));
  if (p.startsWith('packages/core/')) return !!kern && QUELLE.test(p) && !p.endsWith('.d.ts') && gibt(p) && !kern.has(p);
  return false;
}

const git = (...args) => execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

function main() {
  let voll = true;
  try {
    const ziel = process.argv[2] || 'main';
    const kopf = process.argv[3] || 'HEAD';
    git('fetch', '--quiet', '--no-tags', 'origin', `+refs/heads/${ziel}:refs/remotes/origin/${ziel}`);
    const basis = git('merge-base', `origin/${ziel}`, kopf);
    // --no-renames: bei einer Umbenennung zählen alter und neuer Pfad (ein Regelmodul, das das Paket verlässt)
    const dateien = git('diff', '--name-only', '--no-renames', basis, kopf).split('\n').filter(Boolean);
    voll = regelnVoll(dateien, regelnKern('.'), (p) => existsSync(join('.', p)));
    console.log(
      voll
        ? 'Regel-Matrizen: voll – der PR berührt die Auswertung von LEXIO (oder ist nicht sicher zuzuordnen).'
        : 'Regel-Matrizen: Stichprobe – der PR berührt weder LEXIO noch das Regelpaket noch ihren Kern.',
    );
  } catch (e) {
    console.log(`::warning::Umfang der Regel-Matrizen nicht bestimmbar (${e instanceof Error ? e.message.split('\n')[0] : e}) – voll.`);
    voll = true;
  }
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `voll=${voll}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
