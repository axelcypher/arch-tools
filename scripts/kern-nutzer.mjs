// Welche Apps nutzen eine Datei des gemeinsamen Kerns (packages/core)? Für die Versionsprüfung: Eine Änderung am Kern
// verlangt nur für die Apps eine Versionsnotiz, deren ausgelieferter Code die Datei (auch über andere Kerndateien)
// einbindet. Im Zweifel mehr Apps als weniger: Was sich nicht sicher zuordnen lässt, gilt für alle.
//   - TypeScript/JavaScript/CSS: Importe (`from '…'`, `import '…'`, `import('…')`, CSS `@import`) über den Alias `@core/`
//     und relative Pfade, ausgehend von apps/<app>/src (ohne Tests).
//   - Rust: `include!("…")` in apps/<app>/src-tauri/src/*.rs (die Befehle des Kerns stecken per include! in den Hüllen).
//   - Alles andere im Kern (package.json, tsconfig, Konfiguration, Typdeklarationen *.d.ts, unbekannte Endungen),
//     Dateien, die es im Arbeitsbaum nicht (mehr) gibt, und Apps mit `import.meta.glob` in den Kern: alle Apps.
// Grundlage ist der Arbeitsbaum (in der CI der ausgecheckte PR-Stand).

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, normalize, relative } from 'node:path';

const QUELLE = /\.(tsx?|jsx?|mjs|css)$/;
const IMPORT = /(?:\bfrom\s*|\bimport\s*\(?\s*|@import\s+(?:url\()?\s*)['"]([^'"]+)['"]/g;
const INCLUDE = /include!\s*\(\s*"([^"]+)"\s*\)/g;
const GLOB = /import\.meta\.glob\s*(?:<[^>]*>)?\s*\(\s*['"]([^'"]+)['"]/g;
const ENDUNGEN = ['', '.ts', '.tsx', '.js', '.mjs', '.css', '/index.ts', '/index.tsx', '/index.js'];
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
  for (const e of ENDUNGEN) {
    const p = basis + e;
    if (existsSync(join(wurzel, p)) && statSync(join(wurzel, p)).isFile()) return p;
  }
  return null;
}

/**
 * Je App die Menge der Kerndateien, die ihr ausgelieferter Code einbindet (null: der ganze Kern). `apps`: Kennungen
 * (Ordner unter apps/).
 */
export function kernDateienJeApp(wurzel, apps) {
  const jeApp = new Map();
  for (const app of apps) {
    const gesehen = new Set();
    let alles = false;
    const offen = dateienUnter(wurzel, `apps/${app}/src`, (p) => QUELLE.test(p) && ausgeliefert(p));
    while (offen.length) {
      const datei = offen.pop();
      if (gesehen.has(datei)) continue;
      gesehen.add(datei);
      const text = readFileSync(join(wurzel, datei), 'utf8');
      // Glob in den Kern lässt sich nicht sicher auflösen: die App nutzt dann den ganzen Kern
      for (const m of text.matchAll(GLOB)) if (m[1].startsWith('@core/') || posix(normalize(join(dirname(datei), m[1]))).startsWith('packages/core/')) alles = true;
      for (const m of text.matchAll(IMPORT)) {
        const ziel = aufloesen(wurzel, datei, m[1]);
        if (ziel && !gesehen.has(ziel) && QUELLE.test(ziel)) offen.push(ziel);
      }
    }
    // Rust: include! (auch verschachtelt, etwa befehle.rs einer anderen App in der Rahmen-App)
    const rust = dateienUnter(wurzel, `apps/${app}/src-tauri/src`, (p) => p.endsWith('.rs'));
    while (rust.length) {
      const datei = rust.pop();
      if (gesehen.has(datei)) continue;
      gesehen.add(datei);
      for (const m of readFileSync(join(wurzel, datei), 'utf8').matchAll(INCLUDE)) {
        const ziel = posix(normalize(join(dirname(datei), m[1])));
        if (existsSync(join(wurzel, ziel)) && ziel.endsWith('.rs')) rust.push(ziel);
      }
    }
    jeApp.set(app, alles ? null : new Set([...gesehen].filter((p) => p.startsWith('packages/core/'))));
  }
  return jeApp;
}

/**
 * Liefert eine Funktion Kerndatei → Apps (Kennungen), die sie nutzen. Nicht zuordenbar (siehe oben): alle `apps`.
 */
export function kernNutzer(wurzel, apps) {
  const jeApp = kernDateienJeApp(wurzel, apps);
  return (pfad) => {
    const p = posix(relative(wurzel, join(wurzel, pfad)));
    const zuordenbar = (QUELLE.test(p) || p.endsWith('.rs')) && !p.endsWith('.d.ts') && existsSync(join(wurzel, p));
    if (!zuordenbar) return [...apps];
    return apps.filter((a) => jeApp.get(a) === null || jeApp.get(a).has(p));
  };
}
