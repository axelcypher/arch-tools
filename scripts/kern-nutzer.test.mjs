// Tests für scripts/kern-nutzer.mjs – Aufruf: node --test scripts/kern-nutzer.test.mjs
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, test } from 'node:test';
import { kernNutzer } from './kern-nutzer.mjs';
import { betroffeneApps } from './versionen-pruefen.mjs';

const wurzel = mkdtempSync(join(tmpdir(), 'kern-nutzer-'));
after(() => rmSync(wurzel, { recursive: true, force: true }));
const datei = (pfad, inhalt = '') => {
  mkdirSync(dirname(join(wurzel, pfad)), { recursive: true });
  writeFileSync(join(wurzel, pfad), inhalt);
};

// Kern: a → b (relativ), c nur von einem Test genutzt, d per CSS-@import, Rust-Dateien
datei('packages/core/src/a.ts', "import { b } from './b';\nexport const a = b;");
datei('packages/core/src/b.ts', 'export const b = 1;');
datei('packages/core/src/c.ts', 'export const c = 1;');
datei('packages/core/src/ui/index.ts', "export * from '../a';");
datei('packages/core/src/ui/base.css', "@import './d.css';");
datei('packages/core/src/ui/d.css', '');
datei('packages/core/src/typen.d.ts', '');
datei('packages/core/tauri/commands.rs', '');
datei('packages/core/tauri/qgis.rs', '');
datei('packages/core/package.json', '{}');
datei('packages/core/src/e.ts', 'export const e = 1;');
datei('packages/core/src/f.ts', 'export const f = 1;');
datei('packages/core/src/g.ts', 'export const g = 1;');
datei('packages/core/tauri/extra.rs', '');
datei('packages/core/src/c.test.ts', "import { c } from './c';");
// App eins: über den Alias und ein Verzeichnis (index.ts), CSS, Rust mit include!
datei('apps/eins/src/main.tsx', "import '@core/ui/base.css';\nimport { a } from '@core/ui';\nconst x = await import('./spaeter');");
datei('apps/eins/src/spaeter.ts', '');
datei('apps/eins/src/x.test.ts', "import { c } from '@core/c';");
datei('apps/eins/src-tauri/src/lib.rs', 'include!("../../../../packages/core/tauri/commands.rs");\ninclude!("../../../../packages/core/tauri/qgis.rs");');
// App zwei: nur b direkt, Rust nur commands
datei('apps/zwei/src/main.ts', "import { b } from '@core/b?raw';\nimport { f } from '../../../packages/core/src/f.js';");
// verschachtelt: befehle.rs von App eins bindet eine weitere Kerndatei ein
datei('apps/zwei/src-tauri/src/lib.rs', 'include!("../../../../packages/core/tauri/commands.rs");\ninclude!("../../../eins/src-tauri/src/befehle.rs");');
datei('apps/eins/src-tauri/src/befehle.rs', 'include!("../../../../packages/core/tauri/extra.rs");');
// App drei: Glob in den Kern – nicht sicher auflösbar
datei('apps/drei/src/main.ts', "const alle = import.meta.glob('@core/*.ts');");
// App vier: relativer Glob in den Kern; App fünf: new URL (Worker) – beides nicht sicher verfolgbar
datei('apps/vier/src/main.ts', "const alle = import.meta.glob('../../../packages/core/src/*.ts');");
datei('apps/fuenf/src/main.ts', "const w = new Worker(new URL('@core/g.ts', import.meta.url));");

const nutzer = kernNutzer(wurzel, ['eins', 'zwei', 'drei', 'vier', 'fuenf']);
const ALLE = ['eins', 'zwei', 'drei', 'vier', 'fuenf'];
const UNSICHER = ['drei', 'vier', 'fuenf'];

test('Zuordnung über Importe (Alias, relativ, .js-Schreibweise, Verzeichnis, CSS, dynamisch) und include! (auch verschachtelt)', () => {
  assert.deepEqual(nutzer('packages/core/src/a.ts'), ['eins', ...UNSICHER]);
  assert.deepEqual(nutzer('packages/core/src/b.ts'), ['eins', 'zwei', ...UNSICHER]);
  assert.deepEqual(nutzer('packages/core/src/f.ts'), ['zwei', ...UNSICHER]);
  assert.deepEqual(nutzer('packages/core/src/ui/d.css'), ['eins', ...UNSICHER]);
  assert.deepEqual(nutzer('packages/core/tauri/qgis.rs'), ['eins', ...UNSICHER]);
  assert.deepEqual(nutzer('packages/core/tauri/commands.rs'), ['eins', 'zwei', ...UNSICHER]);
  assert.deepEqual(nutzer('packages/core/tauri/extra.rs'), ['eins', 'zwei', ...UNSICHER]);
});

test('nur von Tests genutzt: keine App (außer denen mit nicht verfolgbaren Mustern)', () => {
  assert.deepEqual(nutzer('packages/core/src/c.ts'), UNSICHER);
});

test('im Zweifel alle: Konfiguration, Typdeklarationen, gelöschte Dateien', () => {
  assert.deepEqual(nutzer('packages/core/package.json'), ALLE);
  assert.deepEqual(nutzer('packages/core/src/typen.d.ts'), ALLE);
  assert.deepEqual(nutzer('packages/core/src/weg.ts'), ALLE);
});

test('Sicherheitsnetz: weder von einer App noch von einem Test eingebunden – alle Apps', () => {
  const ohneUnsichere = kernNutzer(wurzel, ['eins', 'zwei']);
  assert.deepEqual(ohneUnsichere('packages/core/src/e.ts'), ['eins', 'zwei']);
  assert.deepEqual(ohneUnsichere('packages/core/src/c.ts'), []);
});

test('betroffeneApps: Zuordnung für Kerndateien; nutzt nur Arkly die Datei, braucht Arkly die Notiz', () => {
  const zuordnung = (p) => (p.endsWith('qgis.rs') ? ['ordner', 'formulare', 'suite'] : p.endsWith('nurArkly.ts') ? ['suite'] : []);
  assert.deepEqual(betroffeneApps(['packages/core/tauri/qgis.rs', 'apps/grz/src/a.ts'], zuordnung), ['grz', 'ordner', 'formulare']);
  assert.deepEqual(betroffeneApps(['packages/core/src/nurArkly.ts'], zuordnung), ['suite']);
  assert.deepEqual(betroffeneApps(['packages/core/src/c.ts'], zuordnung), []);
});

test('im echten Repo: stabile Eigenschaften', () => {
  const apps = ['flaechenrechner', 'grz', 'kosten', 'ordner', 'entzerrung', 'formulare', 'ava'];
  const echt = kernNutzer('.', apps);
  assert.ok(echt('packages/core/tauri/umbenennen.rs').includes('ordner'));
  assert.deepEqual(echt('packages/core/src/platform/konfig.ts'), apps);
  assert.deepEqual(echt('packages/core/tauri/commands.rs'), apps);
});
