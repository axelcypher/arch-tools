#!/usr/bin/env node
/**
 * Erzeugt die Abschnitte von docs/excel-vorlagen.md aus dem Platzhalter-Schema neu (Syntax aus
 * packages/core/src/excel/kern.ts, Platzhalter aus apps/*\/…/platzhalterSchema.ts).
 *
 * Die Prüfung, dass die Datei aktuell ist, läuft in `npm test` (Tests „docs/excel-vorlagen.md, Abschnitt … ist aktuell“)
 * und damit in der CI. Dieses Skript führt dieselben Tests mit EXCEL_DOKU_SCHREIBEN=1 nacheinander aus – dann schreiben
 * sie die Abschnitte, statt zu vergleichen. Aufruf: node scripts/excel-doku.mjs
 */
import { spawnSync } from 'node:child_process';

const DATEIEN = [
  'packages/core/src/excel/kern.test.ts',
  'apps/flaechenrechner/src/core/platzhalterSchema.test.ts',
  'apps/grz/src/export/platzhalterSchema.test.ts',
  'apps/kosten/src/export/platzhalterSchema.test.ts',
];

for (const datei of DATEIEN) {
  // nacheinander, damit nie zwei Tests gleichzeitig dieselbe Datei schreiben
  const r = spawnSync('npx', ['vitest', 'run', datei, '-t', 'ist aktuell'], { stdio: 'inherit', env: { ...process.env, EXCEL_DOKU_SCHREIBEN: '1' }, shell: process.platform === 'win32' });
  if (r.status !== 0) process.exit(r.status ?? 1);
}
console.log('docs/excel-vorlagen.md erzeugt.');
