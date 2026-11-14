// Tests für scripts/regeln-matrix.mjs – Aufruf: node --test scripts/regeln-matrix.test.mjs
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, test } from 'node:test';
import { regelnKern, regelnVoll } from './regeln-matrix.mjs';

const wurzel = mkdtempSync(join(tmpdir(), 'regeln-matrix-'));
after(() => rmSync(wurzel, { recursive: true, force: true }));
const datei = (pfad, inhalt = '') => {
  mkdirSync(dirname(join(wurzel, pfad)), { recursive: true });
  writeFileSync(join(wurzel, pfad), inhalt);
};

// LEXIO nutzt auswertung → kurz; das Regelpaket (nur Test) nutzt fragen; ui/x nutzt nur eine andere App
datei('apps/baurecht/src/App.tsx', "import { auswerten } from '@core/baurecht/auswertung';");
datei('packages/core/src/baurecht/auswertung.ts', "import { werten } from './kurz';\nexport const auswerten = werten;");
datei('packages/core/src/baurecht/kurz.ts', 'export const werten = 1;');
datei('packages/core/src/baurecht/fragen.ts', 'export const f = 1;');
datei('packages/baurecht-regeln/test/paket.test.ts', "import { f } from '@core/baurecht/fragen';");
datei('packages/core/src/ui/x.ts', 'export const x = 1;');
datei('apps/kosten/src/App.tsx', "import { x } from '@core/ui/x';");

const kern = regelnKern(wurzel);
const voll = (...d) => regelnVoll(d, kern, (p) => !p.includes('geloescht'));

test('Kern von LEXIO und Regelpaket: auch über Importe im Kern und aus Tests des Regelpakets', () => {
  assert.deepEqual([...kern].sort(), ['packages/core/src/baurecht/auswertung.ts', 'packages/core/src/baurecht/fragen.ts', 'packages/core/src/baurecht/kurz.ts']);
});

test('voll: Regelpaket, LEXIO und deren Kern (auch nur über einen Test des Regelpakets erreicht)', () => {
  assert.equal(voll('packages/baurecht-regeln/module/soest.json'), true);
  assert.equal(voll('apps/baurecht/src/styles.css'), true);
  assert.equal(voll('packages/core/src/baurecht/kurz.ts'), true);
  assert.equal(voll('packages/core/src/baurecht/fragen.ts'), true);
});

test('voll im Zweifel: Wurzel, Workflows, Skripte, unbekannte Ordner, Kern ohne Zuordnung, gelöschte Kerndateien', () => {
  for (const p of [
    'package-lock.json',
    'package.json',
    'vitest.workspace.ts',
    '.github/workflows/ci.yml',
    'scripts/regeln-matrix.mjs',
    'neu/irgendwas.ts',
    'packages/core/package.json',
    'packages/core/src/typen.d.ts',
    'packages/core/src/geloescht.ts',
  ])
    assert.equal(voll(p), true, p);
  // nicht sicher verfolgbar: der ganze Kern gilt als erreicht
  assert.equal(regelnVoll(['packages/core/src/ui/x.ts'], null), true);
  // eine einzige riskante Datei reicht
  assert.equal(voll('docs/kosten.md', 'apps/kosten/src/App.tsx', 'packages/core/src/baurecht/kurz.ts'), true);
});

test('Stichprobe: nur Doku, Notizen, andere Apps und Kerndateien außerhalb', () => {
  assert.equal(voll('docs/kosten.md', '.versionen/x.json', 'README.md', '.claude/agents/review-code.md'), false);
  assert.equal(voll('apps/kosten/src/App.tsx', 'apps/suite/src/App.tsx'), false);
  assert.equal(voll('packages/core/src/ui/x.ts'), false);
  assert.equal(voll(), false);
});

test('nicht sicher verfolgbare Muster: nur, wenn sie in den Kern zeigen können, gilt der ganze Kern', () => {
  const fall = (name, inhalt) => {
    const w = mkdtempSync(join(tmpdir(), `regeln-matrix-${name}-`));
    try {
      const d = (pfad, text = '') => {
        mkdirSync(dirname(join(w, pfad)), { recursive: true });
        writeFileSync(join(w, pfad), text);
      };
      d('packages/core/src/a.ts', 'export const a = 1;');
      d('packages/core/src/b.ts', 'export const b = 1;');
      d('apps/baurecht/src/App.tsx', `import { a } from '@core/a';\n${inhalt}`);
      d('packages/baurecht-regeln/vitest.config.ts', "const kern = new URL('../core/src', import.meta.url);");
      const k = regelnKern(w);
      return k && [...k].sort();
    } finally {
      rmSync(w, { recursive: true, force: true });
    }
  };
  // harmlos: Adresse zur Laufzeit, Glob-Liste ins Regelpaket, Datei neben der App, Alias in der Vitest-Konfiguration
  assert.deepEqual(fall('laufzeit', "const u = new URL(href, 'https://recht.nrw.de');"), ['packages/core/src/a.ts']);
  assert.deepEqual(fall('glob', "const d = import.meta.glob(['../../../packages/baurecht-regeln/module/**/*.json'], { eager: true });"), ['packages/core/src/a.ts']);
  assert.deepEqual(fall('datei', "const u = new URL('./bild.png', import.meta.url);"), ['packages/core/src/a.ts']);
  // unsicher: in den Kern, nicht wörtlich, Template-Import
  assert.equal(fall('glob-kern', "const d = import.meta.glob(['../../../packages/core/src/*.ts']);"), null);
  assert.equal(fall('url-kern', "const u = new URL('../../../packages/core/src/b.ts', import.meta.url);"), null);
  assert.equal(fall('url-variabel', 'const u = new URL(name, import.meta.url);'), null);
  assert.equal(fall('template', 'const m = await import(`@core/${name}`);'), null);
});
