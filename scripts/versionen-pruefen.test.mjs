// Tests für scripts/versionen-pruefen.mjs – Aufruf: node --test scripts/
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { APPS, betroffeneApps, pruefen, tagVon, vergleich, versionAusTag } from './versionen-pruefen.mjs';

const stand = { flaechenrechner: '0.35.0', grz: '0.26.0', kosten: '0.21.0', ordner: '0.19.0', entzerrung: '0.14.0', formulare: '0.47.0', ava: '0.6.0', suite: '0.23.0' };
const tags = ['v0.35.0', 'grz-v0.26.0', 'kosten-v0.21.0', 'ordner-v0.19.0', 'entzerrung-v0.14.0', 'formulare-v0.47.0', 'ava-v0.6.0', 'suite-v0.23.0', 'suite-v0.22.0'];

test('Tag-Schema wie release.yml', () => {
  assert.equal(tagVon('flaechenrechner', '1.2.3'), 'v1.2.3');
  assert.equal(tagVon('suite', '0.23.0'), 'suite-v0.23.0');
  assert.equal(versionAusTag('flaechenrechner', 'v0.35.0'), '0.35.0');
  assert.equal(versionAusTag('flaechenrechner', 'grz-v0.26.0'), null);
  assert.equal(versionAusTag('grz', 'grz-v0.26.0'), '0.26.0');
  assert.equal(versionAusTag('suite', 'suite-v0.23.0-rc'), null);
});

test('dieselben Apps wie die Schleife in release.yml (neue App: beide Stellen)', () => {
  const yml = readFileSync(new URL('../.github/workflows/release.yml', import.meta.url), 'utf8');
  assert.deepEqual(/^\s*for d in ([a-z ]+); do$/m.exec(yml)[1].trim().split(/\s+/), APPS);
});

test('Versionen numerisch vergleichen (0.10.0 > 0.9.0)', () => {
  assert.ok(vergleich('0.10.0', '0.9.0') > 0);
  assert.equal(vergleich('1.2.3', '1.2.3'), 0);
  assert.ok(vergleich('0.6.0', '0.6.1') < 0);
});

test('in Ordnung: App und Suite über main hochgesetzt; Gegenprobe: PR ohne Versionsänderung', () => {
  assert.deepEqual(pruefen({ kopf: { ...stand, kosten: '0.22.0', suite: '0.24.0' }, basis: stand, main: stand, tags }), []);
  assert.deepEqual(pruefen({ kopf: stand, basis: stand, main: stand, tags }), []);
  // nur die Suite geändert genügt
  assert.deepEqual(pruefen({ kopf: { ...stand, suite: '0.24.0' }, basis: stand, main: stand, tags }), []);
});

test('Version schon als Tag vorhanden', () => {
  // Zweig auf altem Stand: Suite 0.22.0 → 0.23.0, die gibt es schon
  const alt = { ...stand, suite: '0.22.0', kosten: '0.20.0' };
  const f = pruefen({ kopf: { ...alt, kosten: '0.21.0', suite: '0.23.0' }, basis: alt, main: stand, tags });
  assert.equal(f.length, 2);
  assert.match(f[0], /kosten 0\.21\.0: Tag kosten-v0\.21\.0 gibt es schon.*main mergen und die Version von kosten über 0\.21\.0 setzen/);
  assert.match(f[1], /suite 0\.23\.0: Tag suite-v0\.23\.0 gibt es schon.*zurücksetzen/);
});

test('App-Version geändert, Arkly nicht: erlaubt – Arkly setzt der Release-Lauf', () => {
  assert.deepEqual(pruefen({ kopf: { ...stand, grz: '0.27.0' }, basis: stand, main: stand, tags }), []);
});

test('geänderte Version nicht größer als auf main (main ist weiter, Tag noch nicht da)', () => {
  const neuerMain = { ...stand, ava: '0.7.0', suite: '0.25.0' };
  const f = pruefen({ kopf: { ...stand, ava: '0.6.5', suite: '0.24.0' }, basis: stand, main: neuerMain, tags });
  assert.equal(f.length, 2);
  assert.match(f[0], /ava 0\.6\.5: nicht größer als auf main \(0\.7\.0\).*über 0\.7\.0/);
  assert.match(f[1], /suite 0\.24\.0: nicht größer als auf main \(0\.25\.0\).*auf den Stand von main \(0\.25\.0\) zurücksetzen/);
});

test('parallele PRs mit derselben Version: der zweite fällt auf, obwohl die Merge-Ref keinen Unterschied zeigt', () => {
  // A hat grz 0.27.0 / suite 0.24.0 schon veröffentlicht; B zweigte vorher ab und setzt dasselbe
  const nachA = { ...stand, grz: '0.27.0', suite: '0.24.0' };
  const f = pruefen({ kopf: nachA, basis: stand, main: nachA, tags: [...tags, 'grz-v0.27.0', 'suite-v0.24.0'] });
  assert.equal(f.length, 2);
  assert.match(f[0], /grz 0\.27\.0: Tag grz-v0\.27\.0 gibt es schon.*über 0\.27\.0/);
  assert.match(f[1], /suite 0\.24\.0: Tag suite-v0\.24\.0 gibt es schon/);
  // A gemergt, aber noch nicht veröffentlicht: dann greift „nicht größer als auf main“
  const g = pruefen({ kopf: nachA, basis: stand, main: nachA, tags });
  assert.match(g[0], /grz 0\.27\.0: nicht größer als auf main \(0\.27\.0\)/);
});

test('neue App ohne Stand auf main und ohne Tags ist erlaubt', () => {
  const ohne = structuredClone(stand);
  delete ohne.ava;
  assert.deepEqual(pruefen({ kopf: stand, basis: ohne, main: ohne, tags: tags.filter((t) => !t.startsWith('ava-')) }), []);
});

test('Arkly in einem PR ohne eigene Änderungen gehoben und vom Release-Lauf überholt: zurücksetzen statt hochzählen', () => {
  const nachBot = { ...stand, suite: '0.24.0' };
  const f = pruefen({ kopf: { ...stand, grz: '0.27.0', suite: '0.24.0' }, basis: stand, main: nachBot, tags: [...tags, 'suite-v0.24.0'], dateien: ['apps/grz/src/a.ts'] });
  assert.equal(f.length, 1);
  assert.match(f[0], /suite 0\.24\.0: .*Arkly-Version auf den Stand von main \(0\.24\.0\) zurücksetzen/);
  // Gegenprobe: mit eigenen Änderungen an apps/suite der gewohnte Rat
  const g = pruefen({ kopf: { ...stand, suite: '0.24.0' }, basis: stand, main: nachBot, tags: [...tags, 'suite-v0.24.0'], dateien: ['apps/suite/src/App.tsx'] });
  assert.match(g[0], /über 0\.24\.0 setzen/);
});

test('Version außerhalb von x.y.z wird gemeldet statt still durchgelassen', () => {
  const f = pruefen({ kopf: { ...stand, kosten: '0.22.0-beta', suite: '0.24.0' }, basis: stand, main: stand, tags });
  assert.equal(f.length, 1);
  assert.match(f[0], /kosten 0\.22\.0-beta: keine Version der Form x\.y\.z/);
});

test('betroffene Apps aus der Dateiliste: App-Ordner, Kern betrifft alle außer Arkly; Doku und Tests nicht', () => {
  assert.deepEqual(betroffeneApps(['apps/grz/src/store.ts', 'apps/grz/README.md', 'docs/grz.md']), ['grz']);
  assert.deepEqual(
    betroffeneApps(['packages/core/src/platform/konfig.ts']),
    APPS.filter((a) => a !== 'suite'),
  );
  assert.deepEqual(betroffeneApps(['apps/suite/src/App.tsx']), ['suite']);
  assert.deepEqual(betroffeneApps(['packages/core/src/platform/konfig.test.ts', 'packages/core/src/__fixtures__/a.ts', 'apps/ava/src/x.ui.test.ts', 'scripts/x.mjs']), []);
});

test('B hat main mit derselben Version hereingemergt: App-Dateien geändert, Version gleich – Fehler', () => {
  // nach dem Merge von main ist die Version an der Merge-Base schon 0.27.0
  const nachA = { ...stand, grz: '0.27.0', suite: '0.24.0' };
  const f = pruefen({ kopf: nachA, basis: nachA, main: nachA, tags, dateien: ['apps/grz/src/nachweis.ts'] });
  assert.equal(f.length, 1);
  assert.match(f[0], /grz: Dateien geändert, Version nicht hochgesetzt.*über 0\.27\.0/);
  // Gegenprobe: B setzt danach neu hoch – in Ordnung
  assert.deepEqual(pruefen({ kopf: { ...nachA, grz: '0.28.0' }, basis: nachA, main: nachA, tags, dateien: ['apps/grz/src/nachweis.ts'] }), []);
  // Gegenprobe: nur Doku geändert – keine neue Version nötig
  assert.deepEqual(pruefen({ kopf: nachA, basis: nachA, main: nachA, tags, dateien: ['docs/grz.md', 'apps/grz/README.md'] }), []);
  // Arkly-eigener Code verlangt eine Arkly-Version
  assert.match(pruefen({ kopf: nachA, basis: nachA, main: nachA, tags, dateien: ['apps/suite/src/App.tsx'] })[0], /suite: Dateien geändert/);
});
