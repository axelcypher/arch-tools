// Tests für scripts/versionen-pruefen.mjs – Aufruf: node --test scripts/
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { pruefen, tagVon, vergleich, versionAusTag } from './versionen-pruefen.mjs';

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

test('Versionen numerisch vergleichen (0.10.0 > 0.9.0)', () => {
  assert.ok(vergleich('0.10.0', '0.9.0') > 0);
  assert.equal(vergleich('1.2.3', '1.2.3'), 0);
  assert.ok(vergleich('0.6.0', '0.6.1') < 0);
});

test('in Ordnung: App und Suite über main hochgesetzt; Gegenprobe: PR ohne Versionsänderung', () => {
  assert.deepEqual(pruefen({ kopf: { ...stand, kosten: '0.22.0', suite: '0.24.0' }, ziel: stand, main: stand, tags }), []);
  assert.deepEqual(pruefen({ kopf: stand, ziel: stand, main: stand, tags }), []);
  // nur die Suite geändert genügt
  assert.deepEqual(pruefen({ kopf: { ...stand, suite: '0.24.0' }, ziel: stand, main: stand, tags }), []);
});

test('1. Version schon als Tag vorhanden', () => {
  // Zweig auf altem Stand: Suite 0.22.0 → 0.23.0, die gibt es schon
  const alt = { ...stand, suite: '0.22.0', kosten: '0.20.0' };
  const f = pruefen({ kopf: { ...alt, kosten: '0.21.0', suite: '0.23.0' }, ziel: alt, main: stand, tags });
  assert.equal(f.length, 2);
  assert.match(f[0], /kosten 0\.21\.0: Tag kosten-v0\.21\.0 gibt es schon.*main mergen und die Version von kosten über 0\.21\.0 setzen/);
  assert.match(f[1], /suite 0\.23\.0: Tag suite-v0\.23\.0 gibt es schon.*über 0\.23\.0/);
});

test('2. App-Version geändert, Suite nicht', () => {
  const f = pruefen({ kopf: { ...stand, grz: '0.27.0' }, ziel: stand, main: stand, tags });
  assert.equal(f.length, 1);
  assert.match(f[0], /Geänderte App-Versionen \(grz\).*Rahmen-App.*main mergen und die Version von suite über 0\.23\.0 setzen/);
});

test('3. geänderte Version nicht größer als auf main (main ist weiter, Tag noch nicht da)', () => {
  const neuerMain = { ...stand, ava: '0.7.0', suite: '0.25.0' };
  const f = pruefen({ kopf: { ...stand, ava: '0.6.5', suite: '0.24.0' }, ziel: stand, main: neuerMain, tags });
  assert.equal(f.length, 2);
  assert.match(f[0], /ava 0\.6\.5: nicht größer als auf main \(0\.7\.0\).*über 0\.7\.0/);
  assert.match(f[1], /suite 0\.24\.0: nicht größer als auf main \(0\.25\.0\).*über 0\.25\.0/);
});

test('neue App ohne Stand auf main und ohne Tags ist erlaubt', () => {
  const ohne = { ...stand };
  const f = pruefen({ kopf: { ...stand, suite: '0.24.0' }, ziel: ohne, main: ohne, tags });
  assert.deepEqual(f, []);
});
