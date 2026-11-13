// Tests für scripts/suite-version.mjs – Aufruf: node --test scripts/suite-version.test.mjs
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { erhoehung, naechsteSuiteVersion, suiteVersionSetzen, tagsAus, veroeffentlicht } from './suite-version.mjs';

const stand = { flaechenrechner: '0.35.0', grz: '0.26.0', kosten: '0.21.0', ordner: '0.19.0', entzerrung: '0.14.0', formulare: '0.47.0', ava: '0.6.0', suite: '0.27.0' };
const tags = ['v0.35.0', 'grz-v0.26.0', 'grz-v0.25.0', 'kosten-v0.21.0', 'ordner-v0.19.0', 'entzerrung-v0.14.0', 'formulare-v0.47.0', 'ava-v0.6.0', 'suite-v0.27.0', 'suite-v0.26.0'];

test('Art der Erhöhung', () => {
  assert.equal(erhoehung('0.26.0', '0.27.0'), 'minor');
  assert.equal(erhoehung('0.26.0', '0.26.1'), 'patch');
  assert.equal(erhoehung('0.26.0', '1.0.0'), 'major');
  assert.equal(erhoehung(null, '0.1.0'), 'minor');
  assert.equal(veroeffentlicht('grz', tags), '0.26.0');
  assert.equal(veroeffentlicht('flaechenrechner', tags), '0.35.0');
});

test('neue App-Version mit Minor: Arkly bekommt die nächste Minor', () => {
  assert.equal(naechsteSuiteVersion({ ...stand, grz: '0.27.0' }, tags), '0.28.0');
});

test('Major-Sprung einer App: Arkly bekommt eine Minor', () => {
  assert.equal(naechsteSuiteVersion({ ...stand, grz: '1.0.0' }, tags), '0.28.0');
});

test('Tags aus git ls-remote', () => {
  assert.deepEqual(tagsAus('abc\trefs/tags/suite-v0.27.0\ndef\trefs/tags/v0.35.0\n'), ['suite-v0.27.0', 'v0.35.0']);
  assert.deepEqual(tagsAus(''), []);
});

test('ein Fehler beim Setzen hinterlässt keinen halb gesetzten Stand', () => {
  const w = mkdtempSync(join(tmpdir(), 'suite-version-'));
  for (const p of ['apps/suite/package.json', 'apps/suite/src-tauri/tauri.conf.json', 'apps/suite/src-tauri/Cargo.toml', 'package-lock.json']) cpSync(p, join(w, p));
  writeFileSync(join(w, 'apps/suite/src-tauri/Cargo.lock'), 'kein arch-tools hier\n');
  const vorher = readFileSync(join(w, 'apps/suite/package.json'), 'utf8');
  assert.throws(() => suiteVersionSetzen('9.8.7', w), /Cargo\.lock: Version nicht gefunden/);
  assert.equal(readFileSync(join(w, 'apps/suite/package.json'), 'utf8'), vorher);
});

test('nur Patch-Erhöhungen: Arkly bekommt einen Patch', () => {
  assert.equal(naechsteSuiteVersion({ ...stand, kosten: '0.21.1', ava: '0.6.1' }, tags), '0.27.1');
});

test('gemischt: eine Minor genügt für Arkly-Minor', () => {
  assert.equal(naechsteSuiteVersion({ ...stand, kosten: '0.21.1', formulare: '0.48.0' }, tags), '0.28.0');
});

test('Gegenproben: keine neue App-Version oder Arkly schon selbst hochgesetzt – nichts zu tun', () => {
  assert.equal(naechsteSuiteVersion(stand, tags), null);
  // ein PR hat Arkly selbst auf 0.28.0 gesetzt (noch ohne Tag): diese gilt
  assert.equal(naechsteSuiteVersion({ ...stand, grz: '0.27.0', suite: '0.28.0' }, tags), null);
});

test('über dem höchsten Arkly-Tag, auch wenn main dahinter liegt', () => {
  assert.equal(naechsteSuiteVersion({ ...stand, grz: '0.27.0' }, [...tags, 'suite-v0.29.0']), '0.30.0');
});

test('setzt alle fünf Stellen und lässt den Rest unverändert', () => {
  const w = mkdtempSync(join(tmpdir(), 'suite-version-'));
  for (const p of ['apps/suite/package.json', 'apps/suite/src-tauri/tauri.conf.json', 'apps/suite/src-tauri/Cargo.toml', 'apps/suite/src-tauri/Cargo.lock', 'package-lock.json']) cpSync(p, join(w, p));
  const vorher = readFileSync(join(w, 'apps/suite/src-tauri/Cargo.lock'), 'utf8');
  suiteVersionSetzen('9.8.7', w);
  const lies = (p) => readFileSync(join(w, p), 'utf8');
  assert.equal(JSON.parse(lies('apps/suite/package.json')).version, '9.8.7');
  assert.equal(JSON.parse(lies('apps/suite/src-tauri/tauri.conf.json')).version, '9.8.7');
  assert.match(lies('apps/suite/src-tauri/Cargo.toml'), /^version = "9\.8\.7"$/m);
  assert.match(lies('apps/suite/src-tauri/Cargo.lock'), /name = "arch-tools"\nversion = "9\.8\.7"/);
  assert.equal(JSON.parse(lies('package-lock.json')).packages['apps/suite'].version, '9.8.7');
  // im Cargo.lock nur die eine Zeile
  const diff = lies('apps/suite/src-tauri/Cargo.lock')
    .split('\n')
    .filter((z, i) => z !== vorher.split('\n')[i]);
  assert.deepEqual(diff, ['version = "9.8.7"']);
  // Formatierung der JSON-Dateien bleibt (zwei Leerzeichen, Zeilenende)
  assert.equal(
    lies('package-lock.json'),
    `${JSON.stringify(JSON.parse(readFileSync('package-lock.json', 'utf8')), null, 2).replace(/("apps\/suite": \{\n\s+"name": "arch-tools-suite",\n\s+"version": )"[^"]*"/, '$1"9.8.7"')}\n`,
  );
});
