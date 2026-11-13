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
// App eins: über den Alias und ein Verzeichnis (index.ts), CSS, Rust mit include!
datei('apps/eins/src/main.tsx', "import '@core/ui/base.css';\nimport { a } from '@core/ui';\nconst x = await import('./spaeter');");
datei('apps/eins/src/spaeter.ts', '');
datei('apps/eins/src/x.test.ts', "import { c } from '@core/c';");
datei('apps/eins/src-tauri/src/lib.rs', 'include!("../../../../packages/core/tauri/commands.rs");\ninclude!("../../../../packages/core/tauri/qgis.rs");');
// App zwei: nur b direkt, Rust nur commands
datei('apps/zwei/src/main.ts', "import { b } from '@core/b?raw';");
datei('apps/zwei/src-tauri/src/lib.rs', 'include!("../../../../packages/core/tauri/commands.rs");');
// App drei: Glob in den Kern – nicht sicher auflösbar
datei('apps/drei/src/main.ts', "const alle = import.meta.glob('@core/*.ts');");

const nutzer = kernNutzer(wurzel, ['eins', 'zwei', 'drei']);

test('Zuordnung über Importe (Alias, relativ, Verzeichnis, CSS, dynamisch) und include!', () => {
  assert.deepEqual(nutzer('packages/core/src/a.ts'), ['eins', 'drei']);
  assert.deepEqual(nutzer('packages/core/src/b.ts'), ['eins', 'zwei', 'drei']);
  assert.deepEqual(nutzer('packages/core/src/ui/d.css'), ['eins', 'drei']);
  assert.deepEqual(nutzer('packages/core/tauri/qgis.rs'), ['eins', 'drei']);
  assert.deepEqual(nutzer('packages/core/tauri/commands.rs'), ['eins', 'zwei', 'drei']);
});

test('nur von Tests genutzt: keine App (außer der mit Glob in den Kern)', () => {
  assert.deepEqual(nutzer('packages/core/src/c.ts'), ['drei']);
});

test('im Zweifel alle: Konfiguration, Typdeklarationen, gelöschte Dateien', () => {
  assert.deepEqual(nutzer('packages/core/package.json'), ['eins', 'zwei', 'drei']);
  assert.deepEqual(nutzer('packages/core/src/typen.d.ts'), ['eins', 'zwei', 'drei']);
  assert.deepEqual(nutzer('packages/core/src/weg.ts'), ['eins', 'zwei', 'drei']);
});

test('betroffeneApps nutzt die Zuordnung für Kerndateien', () => {
  const nurEins = (p) => (p.endsWith('qgis.rs') ? ['ordner', 'formulare'] : []);
  assert.deepEqual(betroffeneApps(['packages/core/tauri/qgis.rs', 'apps/grz/src/a.ts'], nurEins), ['grz', 'ordner', 'formulare']);
  assert.deepEqual(betroffeneApps(['packages/core/src/c.ts'], nurEins), []);
});

test('im echten Repo: umbenennen.rs nur ATLAS, konfig.ts alle', () => {
  const echt = kernNutzer('.', ['flaechenrechner', 'grz', 'kosten', 'ordner', 'entzerrung', 'formulare', 'ava']);
  assert.deepEqual(echt('packages/core/tauri/umbenennen.rs'), ['ordner']);
  assert.deepEqual(echt('packages/core/src/platform/konfig.ts'), ['flaechenrechner', 'grz', 'kosten', 'ordner', 'entzerrung', 'formulare', 'ava']);
});
