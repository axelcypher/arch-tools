// Tests für scripts/versionen-pruefen.mjs – Aufruf: node --test scripts/versionen-pruefen.test.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { APPS, betroffeneApps, notizAus, pruefen, tagVon, vergleich, versionAusTag } from './versionen-pruefen.mjs';

const stand = { flaechenrechner: '0.40.2', grz: '0.28.3', kosten: '0.24.3', ordner: '0.23.3', entzerrung: '0.18.3', formulare: '0.49.4', ava: '0.10.4', suite: '0.30.1' };
const notiz = (o, name = '.versionen/zweig.json') => ({ name, inhalt: JSON.stringify(o) });

test('Tag-Schema wie release.yml; Versionen numerisch vergleichen', () => {
  assert.equal(tagVon('flaechenrechner', '1.2.3'), 'v1.2.3');
  assert.equal(tagVon('suite', '0.23.0'), 'suite-v0.23.0');
  assert.equal(versionAusTag('grz', 'grz-v0.26.0'), '0.26.0');
  assert.equal(versionAusTag('flaechenrechner', 'grz-v0.26.0'), null);
  assert.ok(vergleich('0.10.0', '0.9.0') > 0);
});

test('dieselben Apps wie die Schleife in release.yml (neue App: beide Stellen)', () => {
  const yml = readFileSync(new URL('../.github/workflows/release.yml', import.meta.url), 'utf8');
  assert.deepEqual(/^\s*for d in ([a-z ]+); do$/m.exec(yml)[1].trim().split(/\s+/), APPS);
});

test('betroffene Apps: App-Ordner, Kern betrifft alle außer Arkly; Doku, Tests und Notizen nicht', () => {
  assert.deepEqual(betroffeneApps(['apps/grz/src/store.ts', 'apps/grz/README.md', 'docs/grz.md']), ['grz']);
  assert.deepEqual(
    betroffeneApps(['packages/core/src/platform/konfig.ts']),
    APPS.filter((a) => a !== 'suite'),
  );
  assert.deepEqual(betroffeneApps(['apps/suite/src/App.tsx']), ['suite']);
  assert.deepEqual(betroffeneApps(['packages/core/src/a.test.ts', 'packages/core/src/__fixtures__/a.ts', 'apps/ava/src/x.ui.test.ts', '.versionen/zweig.json', 'scripts/x.mjs']), []);
});

test('Notiz prüfen: gültig, und jede Art von Fehler mit klarer Meldung', () => {
  assert.deepEqual(notizAus('n', JSON.stringify({ grz: { stufe: 'minor', notiz: ' Neuer Nachweis. ' } })), { eintraege: [{ app: 'grz', stufe: 'minor', notiz: 'Neuer Nachweis.' }], fehler: [] });
  assert.match(notizAus('n', '{kaputt').fehler[0], /kein gültiges JSON/);
  assert.match(notizAus('n', '{}').fehler[0], /mindestens einer App/);
  assert.match(notizAus('n', JSON.stringify({ lexio: { stufe: 'patch', notiz: 'x' } })).fehler[0], /unbekannte App „lexio“/);
  assert.match(notizAus('n', JSON.stringify({ grz: { stufe: 'gross', notiz: 'x' } })).fehler[0], /patch, minor oder major/);
  assert.match(notizAus('n', JSON.stringify({ grz: { stufe: 'patch', notiz: '  ' } })).fehler[0], /„notiz“ fehlt/);
});

test('in Ordnung: geänderte App mit Notiz; Gegenprobe: nur Doku ohne Notiz', () => {
  assert.deepEqual(pruefen({ kopf: stand, basis: stand, dateien: ['apps/grz/src/a.ts'], notizen: [notiz({ grz: { stufe: 'patch', notiz: 'Fehler behoben.' } })] }), []);
  assert.deepEqual(pruefen({ kopf: stand, basis: stand, dateien: ['docs/grz.md'], notizen: [] }), []);
});

test('geänderte App ohne Notiz: Fehler mit Vorlage', () => {
  const f = pruefen({ kopf: stand, basis: stand, dateien: ['apps/grz/src/a.ts', 'packages/core/src/b.ts'], notizen: [notiz({ grz: { stufe: 'patch', notiz: 'x' } })] });
  assert.equal(f.length, 1);
  assert.match(f[0], /ohne Versionsnotiz: flaechenrechner, kosten, ordner, entzerrung, formulare, ava\./);
  assert.match(f[0], /"kosten":\{"stufe":"patch","notiz":"…"\}/);
  // Arkly braucht ohne eigene Änderungen keine Notiz
  assert.doesNotMatch(f[0], /suite/);
});

test('Notizen aus mehreren Dateien zählen zusammen', () => {
  const f = pruefen({
    kopf: stand,
    basis: stand,
    dateien: ['apps/grz/a.ts', 'apps/ava/b.ts'],
    notizen: [notiz({ grz: { stufe: 'patch', notiz: 'a' } }, '.versionen/a.json'), notiz({ ava: { stufe: 'minor', notiz: 'b' } }, '.versionen/b.json')],
  });
  assert.deepEqual(f, []);
});

test('Version im PR geändert: zurücksetzen statt hochzählen', () => {
  const f = pruefen({ kopf: { ...stand, grz: '0.29.0' }, basis: stand, dateien: ['apps/grz/a.ts'], notizen: [notiz({ grz: { stufe: 'minor', notiz: 'x' } })] });
  assert.equal(f.length, 1);
  assert.match(f[0], /grz: Version 0\.28\.3 → 0\.29\.0 im PR geändert\. Versionen setzt der Release-Lauf – bitte auf 0\.28\.3 zurücksetzen/);
});

test('ungültige Notiz fällt auf, auch wenn die App sonst abgedeckt wäre', () => {
  const f = pruefen({ kopf: stand, basis: stand, dateien: ['apps/grz/a.ts'], notizen: [notiz({ grz: { stufe: 'riesig', notiz: 'x' } })] });
  assert.equal(f.length, 2);
  assert.match(f[0], /patch, minor oder major/);
  assert.match(f[1], /ohne Versionsnotiz: grz/);
});

test('neue App (an der Abzweigung noch nicht da) gilt nicht als Versionsänderung', () => {
  const ohne = structuredClone(stand);
  delete ohne.ava;
  assert.deepEqual(pruefen({ kopf: stand, basis: ohne, dateien: ['apps/ava/a.ts'], notizen: [notiz({ ava: { stufe: 'minor', notiz: 'Neu.' } })] }), []);
});

test('gelöschte oder umbenannte Notiz im PR: Fehler; Gegenprobe ohne', () => {
  const f = pruefen({ kopf: stand, basis: stand, dateien: ['.versionen/fremd.json'], notizen: [], entfernt: ['.versionen/fremd.json'] });
  assert.equal(f.length, 1);
  assert.match(f[0], /fremd\.json: Versionsnotiz im PR gelöscht oder umbenannt/);
  assert.deepEqual(pruefen({ kopf: stand, basis: stand, dateien: [], notizen: [], entfernt: [] }), []);
});
