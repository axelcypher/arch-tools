// Welche Apps nutzen eine Datei des gemeinsamen Kerns (packages/core)? Für die Versionsprüfung: Eine Änderung am Kern
// verlangt nur für die Apps eine Versionsnotiz, deren ausgelieferter Code die Datei (auch über andere Kerndateien)
// einbindet. Im Zweifel mehr Apps als weniger: Was sich nicht sicher zuordnen lässt, gilt für alle.
//   - TypeScript/JavaScript/CSS: Importe (`from '…'`, `import '…'`, `import('…')`, CSS `@import`) über den Alias `@core/`
//     und relative Pfade, ausgehend von apps/<app>/src (ohne Tests).
//   - Rust: `include!("…")` in apps/<app>/src-tauri/src/*.rs (die Befehle des Kerns stecken per include! in den Hüllen).
//   - Alles andere im Kern (package.json, tsconfig, Konfiguration, Typdeklarationen *.d.ts, unbekannte Endungen) und
//     Dateien, die es im Arbeitsbaum nicht (mehr) gibt: alle Apps.
//   - Muster, die sich nicht sicher verfolgen lassen (`import.meta.glob` in den Kern oder als Liste, `new URL(…)`,
//     dynamische Importe mit Template, Rust `#[path]`, `include_str!`/`include_bytes!`, `mod x;` in einer Kerndatei):
//     Die App gilt als Nutzer des ganzen Kerns.
//   - Sicherheitsnetz: Eine Kerndatei, die weder eine App noch ein Test einbindet, gilt für alle Apps (die Zuordnung
//     hat sie dann vermutlich übersehen). Nur von Tests genutzte Dateien brauchen keine Notiz.
// Grundlage ist der Arbeitsbaum (in der CI der ausgecheckte PR-Stand). Lokal deshalb mit sauberem Arbeitsbaum und
// nach `git merge origin/main` prüfen.

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, normalize, relative } from 'node:path';

const QUELLE = /\.(tsx?|jsx?|mjs|css)$/;
const IMPORT = /(?:\bfrom\s*|\bimport\s*\(?\s*|@import\s+(?:url\()?\s*)['"]([^'"]+)['"]/g;
const INCLUDE = /include!\s*\(\s*"([^"]+)"\s*\)/g;
const GLOB = /import\.meta\.glob\s*(?:<[^>]*>)?\s*\(\s*['"]([^'"]+)['"]/g;
/** nicht sicher verfolgbar: die App nutzt dann den ganzen Kern */
const UNSICHER = /import\.meta\.glob\s*(?:<[^>]*>)?\s*\(\s*\[|new\s+URL\s*\(|\bimport\s*\(\s*`/;
const UNSICHER_RUST = /#\[path|include_str!|include_bytes!/;
const MOD_RUST = /\bmod\s+\w+\s*;/;
const ENDUNGEN = ['', '.ts', '.tsx', '.js', '.jsx', '.mjs', '.css', '/index.ts', '/index.tsx', '/index.js', '/index.mjs'];
const ausgeliefert = (pfad) => !/\.test\.[cm]?[jt]sx?$/.test(pfad) && !pfad.includes('/__fixtures__/');
const posix = (p) => p.split('\\').join('/');

function dateienUnter(wurzel, ordner, passt) {
  const voll = join(wurzel, ordner);
  if (!existsSync(voll)) return [];
  const aus = [];
  for (const eintrag of readdirSync(voll, { withFileTypes: true })) {
    const pfad = posix(join(ordner, eintrag.name));
    if (eintrag.isDirectory()) {
      if (eintrag.name !== 'node_modules' && eintrag.name !== 'dist') aus.push(...dateienUnter(wurzel, pfad, passt));
    } else if (passt(pfad)) aus.push(pfad);
  }
  return aus;
}

/** Import auflösen (Pfad relativ zur Wurzel) oder null (Paket aus node_modules, nicht gefunden) */
function aufloesen(wurzel, von, ziel) {
  let basis;
  if (ziel.startsWith('@core/')) basis = posix(join('packages/core/src', ziel.slice('@core/'.length)));
  else if (ziel.startsWith('.')) basis = posix(normalize(join(dirname(von), ziel)));
  else return null;
  // Vite-Zusätze wie „?url“, „?raw“
  basis = basis.replace(/\?.*$/, '');
  // ESM-Schreibweise „./a.js“ für eine TypeScript-Datei
  const ohneJs = basis.replace(/\.(m?js|jsx)$/, '');
  const kandidaten = [...ENDUNGEN.map((e) => basis + e), ...(ohneJs !== basis ? [`${ohneJs}.ts`, `${ohneJs}.tsx`] : [])];
  for (const p of kandidaten) {
    if (existsSync(join(wurzel, p)) && statSync(join(wurzel, p)).isFile()) return p;
  }
  return null;
}

/**
 * Alle Dateien, die von `start` aus (Quelltext bzw. Rust) erreichbar sind; `alles`: ein nicht sicher verfolgbares
 * Muster kam vor (Glob in den Kern bzw. als Liste, new URL, Template-Import, #[path], include_str!, mod in einer Kerndatei).
 */
function verfolgen(wurzel, quellen, rust = []) {
  const gesehen = new Set();
  let alles = false;
  const offen = [...quellen];
  while (offen.length) {
    const datei = offen.pop();
    if (gesehen.has(datei)) continue;
    gesehen.add(datei);
    const text = readFileSync(join(wurzel, datei), 'utf8');
    if (UNSICHER.test(text)) alles = true;
    for (const m of text.matchAll(GLOB)) if (m[1].startsWith('@core/') || posix(normalize(join(dirname(datei), m[1]))).startsWith('packages/core/')) alles = true;
    for (const m of text.matchAll(IMPORT)) {
      const ziel = aufloesen(wurzel, datei, m[1]);
      if (ziel && !gesehen.has(ziel) && QUELLE.test(ziel)) offen.push(ziel);
    }
  }
  // Rust: include! (auch verschachtelt, etwa befehle.rs einer anderen App in der Rahmen-App)
  const offenRust = [...rust];
  while (offenRust.length) {
    const datei = offenRust.pop();
    if (gesehen.has(datei)) continue;
    gesehen.add(datei);
    const text = readFileSync(join(wurzel, datei), 'utf8');
    if (UNSICHER_RUST.test(text) || (datei.startsWith('packages/core/') && MOD_RUST.test(text))) alles = true;
    for (const m of text.matchAll(INCLUDE)) {
      const ziel = posix(normalize(join(dirname(datei), m[1])));
      if (existsSync(join(wurzel, ziel)) && ziel.endsWith('.rs')) offenRust.push(ziel);
    }
  }
  return { gesehen, alles };
}

/**
 * Je App die Menge der Kerndateien, die ihr ausgelieferter Code einbindet (null: der ganze Kern). `apps`: Kennungen
 * (Ordner unter apps/).
 */
export function kernDateienJeApp(wurzel, apps) {
  const jeApp = new Map();
  for (const app of apps) {
    const { gesehen, alles } = verfolgen(
      wurzel,
      dateienUnter(wurzel, `apps/${app}/src`, (p) => QUELLE.test(p) && ausgeliefert(p)),
      dateienUnter(wurzel, `apps/${app}/src-tauri/src`, (p) => p.endsWith('.rs')),
    );
    jeApp.set(app, alles ? null : new Set([...gesehen].filter((p) => p.startsWith('packages/core/'))));
  }
  return jeApp;
}

/** Kerndateien, die Tests einbinden (Tests der Apps und des Kerns) */
function vonTestsGenutzt(wurzel) {
  const istTest = (p) => QUELLE.test(p) && !ausgeliefert(p);
  const tests = [...dateienUnter(wurzel, 'apps', istTest), ...dateienUnter(wurzel, 'packages/core', istTest)];
  return verfolgen(wurzel, tests).gesehen;
}

/**
 * Liefert eine Funktion Kerndatei → Apps (Kennungen), die sie nutzen. Nicht zuordenbar (siehe oben) sowie weder von
 * einer App noch von einem Test eingebunden: alle `apps`.
 */
export function kernNutzer(wurzel, apps) {
  const jeApp = kernDateienJeApp(wurzel, apps);
  let tests;
  return (pfad) => {
    const p = posix(relative(wurzel, join(wurzel, pfad)));
    const zuordenbar = (QUELLE.test(p) || p.endsWith('.rs')) && !p.endsWith('.d.ts') && existsSync(join(wurzel, p));
    if (!zuordenbar) return [...apps];
    const nutzer = apps.filter((a) => jeApp.get(a) === null || jeApp.get(a).has(p));
    if (nutzer.length) return nutzer;
    tests ??= vonTestsGenutzt(wurzel);
    return tests.has(p) ? [] : [...apps];
  };
}
