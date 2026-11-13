// Tests für scripts/versionen-setzen.mjs – Aufruf: node --test scripts/versionen-setzen.test.mjs
import assert from 'node:assert/strict';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { erhoehen, hoehere, lockSetzen, neueVersionen, notizenLesen, tagsAus, veroeffentlicht, versionSetzen } from './versionen-setzen.mjs';
import { APPS } from './versionen-pruefen.mjs';

const stand = { flaechenrechner: '0.40.2', grz: '0.28.3', kosten: '0.24.3', ordner: '0.23.3', entzerrung: '0.18.3', formulare: '0.49.4', ava: '0.10.4', suite: '0.30.1' };
const tags = ['v0.40.2', 'grz-v0.28.3', 'kosten-v0.24.3', 'ordner-v0.23.3', 'entzerrung-v0.18.3', 'formulare-v0.49.4', 'ava-v0.10.4', 'suite-v0.30.1', 'suite-v0.30.0'];
const e = (app, stufe, notiz = 'Satz.') => ({ app, stufe, notiz });

test('Hilfen: Stufen, Erhöhen, Tags', () => {
  assert.equal(hoehere('patch', 'minor'), 'minor');
  assert.equal(hoehere(null, 'patch'), 'patch');
  assert.equal(hoehere('major', 'minor'), 'major');
  assert.equal(erhoehen('0.28.3', 'patch'), '0.28.4');
  assert.equal(erhoehen('0.28.3', 'minor'), '0.29.0');
  assert.equal(erhoehen('0.28.3', 'major'), '1.0.0');
  assert.deepEqual(tagsAus('a\trefs/tags/v0.40.2\nb\trefs/tags/suite-v0.30.1\n'), ['v0.40.2', 'suite-v0.30.1']);
  assert.equal(veroeffentlicht('suite', tags), '0.30.1');
});

test('je App die größte Stufe aller Notizen; Arkly Minor, sobald eine App Minor verlangt', () => {
  const r = neueVersionen({ versionen: stand, tags, eintraege: [e('grz', 'patch', 'a'), e('grz', 'minor', 'b'), e('kosten', 'patch', 'c')] });
  assert.deepEqual(Object.keys(r), ['grz', 'kosten', 'suite']);
  assert.deepEqual(r.grz, { alt: '0.28.3', neu: '0.29.0', stufe: 'minor', notizen: ['a', 'b'] });
  assert.equal(r.kosten.neu, '0.24.4');
  assert.equal(r.suite.neu, '0.31.0');
  assert.deepEqual(r.suite.notizen, ['TERRIO: a', 'TERRIO: b', 'NUMIO: c']);
});

test('nur Patches: Arkly Patch; Notiz für Arkly kann höher verlangen', () => {
  assert.equal(neueVersionen({ versionen: stand, tags, eintraege: [e('ava', 'patch')] }).suite.neu, '0.30.2');
  const r = neueVersionen({ versionen: stand, tags, eintraege: [e('ava', 'patch'), e('suite', 'minor', 'Tabs neu.')] });
  assert.equal(r.suite.neu, '0.31.0');
  assert.deepEqual(r.suite.notizen, ['Tabs neu.', 'FABRIO: Satz.']);
  // nur Arkly selbst geändert
  assert.deepEqual(Object.keys(neueVersionen({ versionen: stand, tags, eintraege: [e('suite', 'patch')] })), ['suite']);
});

test('über der höchsten veröffentlichten Version, auch wenn main dahinter liegt', () => {
  const r = neueVersionen({ versionen: stand, tags: [...tags, 'grz-v0.30.0'], eintraege: [e('grz', 'patch')] });
  assert.equal(r.grz.neu, '0.30.1');
});

test('Gegenproben: keine Notizen – nichts; Übergang mit von Hand gehobener, unveröffentlichter Version', () => {
  assert.deepEqual(neueVersionen({ versionen: stand, tags, eintraege: [] }), {});
  // grz schon von Hand auf 0.29.0 (ohne Tag): bleibt, Arkly kommt mit
  const r = neueVersionen({ versionen: { ...stand, grz: '0.29.0' }, tags, eintraege: [] });
  assert.deepEqual(Object.keys(r), ['suite']);
  assert.equal(r.suite.neu, '0.30.2');
  // Arkly selbst unveröffentlicht: bleibt
  assert.equal(neueVersionen({ versionen: { ...stand, suite: '0.31.0' }, tags, eintraege: [e('grz', 'patch')] }).suite, undefined);
});

function kopie() {
  const w = mkdtempSync(join(tmpdir(), 'versionen-'));
  for (const a of APPS) for (const p of ['package.json', 'src-tauri/tauri.conf.json', 'src-tauri/Cargo.toml', 'src-tauri/Cargo.lock']) cpSync(`apps/${a}/${p}`, join(w, `apps/${a}/${p}`));
  cpSync('package-lock.json', join(w, 'package-lock.json'));
  return w;
}

test('setzt alle fünf Stellen jeder App (Crate-Name aus Cargo.toml), sonst nichts', () => {
  const w = kopie();
  const vorher = readFileSync(join(w, 'apps/flaechenrechner/src-tauri/Cargo.lock'), 'utf8');
  versionSetzen('flaechenrechner', '9.8.7', w);
  versionSetzen('suite', '1.2.3', w);
  lockSetzen({ flaechenrechner: '9.8.7', suite: '1.2.3' }, w);
  const lies = (p) => readFileSync(join(w, p), 'utf8');
  assert.equal(JSON.parse(lies('apps/flaechenrechner/package.json')).version, '9.8.7');
  assert.equal(JSON.parse(lies('apps/flaechenrechner/src-tauri/tauri.conf.json')).version, '9.8.7');
  assert.match(lies('apps/flaechenrechner/src-tauri/Cargo.toml'), /^version = "9\.8\.7"$/m);
  assert.match(lies('apps/flaechenrechner/src-tauri/Cargo.lock'), /name = "arch-flaechen-tool"\nversion = "9\.8\.7"/);
  assert.deepEqual(
    lies('apps/flaechenrechner/src-tauri/Cargo.lock')
      .split('\n')
      .filter((z, i) => z !== vorher.split('\n')[i]),
    ['version = "9.8.7"'],
  );
  assert.match(lies('apps/suite/src-tauri/Cargo.lock'), /name = "arch-tools"\nversion = "1\.2\.3"/);
  const lock = JSON.parse(lies('package-lock.json'));
  assert.equal(lock.packages['apps/flaechenrechner'].version, '9.8.7');
  assert.equal(lock.packages['apps/suite'].version, '1.2.3');
  assert.equal(lock.packages['apps/grz'].version, stand.grz);
});

test('ein Fehler beim Setzen hinterlässt keinen halb gesetzten Stand', () => {
  const w = kopie();
  writeFileSync(join(w, 'apps/grz/src-tauri/Cargo.lock'), 'kaputt\n');
  const vorher = readFileSync(join(w, 'apps/grz/package.json'), 'utf8');
  assert.throws(() => versionSetzen('grz', '9.9.9', w), /Cargo\.lock: Version nicht gefunden/);
  assert.equal(readFileSync(join(w, 'apps/grz/package.json'), 'utf8'), vorher);
});

test('Notizen lesen: nur *.json, sortiert, Fehler gesammelt', () => {
  const w = mkdtempSync(join(tmpdir(), 'notizen-'));
  mkdirSync(join(w, '.versionen'));
  writeFileSync(join(w, '.versionen/LIESMICH.md'), '# Notizen');
  writeFileSync(join(w, '.versionen/b.json'), JSON.stringify({ ava: { stufe: 'minor', notiz: 'B' } }));
  writeFileSync(join(w, '.versionen/a.json'), JSON.stringify({ grz: { stufe: 'patch', notiz: 'A' } }));
  writeFileSync(join(w, '.versionen/c.json'), '{kaputt');
  const r = notizenLesen(w);
  assert.deepEqual(
    r.dateien.map((d) => d.split('/').pop()),
    ['a.json', 'b.json', 'c.json'],
  );
  assert.deepEqual(
    r.eintraege.map((x) => x.app),
    ['grz', 'ava'],
  );
  assert.match(r.fehler[0], /c\.json: kein gültiges JSON/);
  // ohne Ordner: nichts
  assert.deepEqual(notizenLesen(mkdtempSync(join(tmpdir(), 'leer-'))), { dateien: [], eintraege: [], fehler: [] });
});
