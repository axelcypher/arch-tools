// Tests für scripts/versionen-setzen.mjs – Aufruf: node --test scripts/versionen-setzen.test.mjs
import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';
import { automatisch, erhoehen, hoehere, lockSetzen, neueVersionen, notizenLesen, tagsAus, veroeffentlicht, versionSetzen } from './versionen-setzen.mjs';
import { APPS } from './versionen-pruefen.mjs';

const stand = { flaechenrechner: '0.40.2', grz: '0.28.3', kosten: '0.24.3', ordner: '0.23.3', entzerrung: '0.18.3', formulare: '0.49.4', ava: '0.10.4', suite: '0.30.1' };
const tags = ['v0.40.2', 'grz-v0.28.3', 'kosten-v0.24.3', 'ordner-v0.23.3', 'entzerrung-v0.18.3', 'formulare-v0.49.4', 'ava-v0.10.4', 'suite-v0.30.1', 'suite-v0.30.0'];
const e = (app, stufe, notiz = 'Satz.') => ({ app, stufe, notiz });
const temp = [];
const tempOrdner = (name) => {
  const w = mkdtempSync(join(tmpdir(), name));
  temp.push(w);
  return w;
};
after(() => temp.forEach((w) => rmSync(w, { recursive: true, force: true })));

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
  // grz schon von Hand auf 0.29.0 (ohne Tag, Minor gegenüber 0.28.3): bleibt, zählt für Arkly als Minor
  const r = neueVersionen({ versionen: { ...stand, grz: '0.29.0' }, tags, eintraege: [e('grz', 'patch', 'Mit Notiz.')] });
  assert.deepEqual(r.grz, { alt: '0.29.0', neu: '0.29.0', stufe: 'minor', notizen: ['Mit Notiz.'] });
  assert.equal(r.suite.neu, '0.31.0');
  // Arkly selbst von Hand gehoben: bleibt, Sätze aber dabei
  const s = neueVersionen({ versionen: { ...stand, suite: '0.31.0' }, tags, eintraege: [e('grz', 'patch', 'a'), e('suite', 'patch', 'b')] });
  assert.deepEqual(s.suite, { alt: '0.31.0', neu: '0.31.0', stufe: 'patch', notizen: ['b', 'TERRIO: a'] });
  // unveröffentlicht, aber NICHT höher als der höchste Tag: gilt nicht als von Hand gehoben, wird über den Tag gehoben
  const t = neueVersionen({ versionen: { ...stand, grz: '0.28.1' }, tags, eintraege: [e('grz', 'patch')] });
  assert.equal(t.grz.neu, '0.28.4');
});

test('von Hand gehobene App ohne Notiz, schon in der veröffentlichten Arkly (gescheiterter Bau): Arkly nicht erneut heben', () => {
  const versionen = { ...stand, grz: '0.29.0' };
  assert.equal(neueVersionen({ versionen, tags, eintraege: [], inArkly: { ...stand, grz: '0.29.0' } }).suite, undefined);
  // Gegenprobe: noch nicht in Arkly – Arkly kommt mit
  assert.equal(neueVersionen({ versionen, tags, eintraege: [], inArkly: stand }).suite.neu, '0.31.0');
  // mit Notiz zählt sie immer
  assert.equal(neueVersionen({ versionen, tags, eintraege: [e('grz', 'patch')], inArkly: { ...stand, grz: '0.29.0' } }).suite.neu, '0.31.0');
});

test('Major-Sprung einer App: Arkly Minor; App ohne package.json wird übergangen', () => {
  const r = neueVersionen({ versionen: stand, tags, eintraege: [e('grz', 'major')] });
  assert.equal(r.grz.neu, '1.0.0');
  assert.equal(r.suite.neu, '0.31.0');
  const ohne = structuredClone(stand);
  delete ohne.ava;
  assert.deepEqual(Object.keys(neueVersionen({ versionen: ohne, tags, eintraege: [e('ava', 'minor')] })), []);
});

function kopie() {
  const w = tempOrdner('versionen-');
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
  // andere Apps unverändert (Vergleich mit dem Stand im Repo, nicht mit einer festen Nummer)
  assert.equal(lock.packages['apps/grz'].version, JSON.parse(readFileSync('apps/grz/package.json', 'utf8')).version);
});

test('ein Fehler beim Setzen hinterlässt keinen halb gesetzten Stand', () => {
  const w = kopie();
  writeFileSync(join(w, 'apps/grz/src-tauri/Cargo.lock'), 'kaputt\n');
  const vorher = readFileSync(join(w, 'apps/grz/package.json'), 'utf8');
  assert.throws(() => versionSetzen('grz', '9.9.9', w), /Cargo\.lock: Version nicht gefunden/);
  assert.equal(readFileSync(join(w, 'apps/grz/package.json'), 'utf8'), vorher);
});

test('Notizen lesen: nur *.json, sortiert, Fehler gesammelt', () => {
  const w = tempOrdner('notizen-');
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
  assert.deepEqual(
    r.gueltig.map((d) => d.split('/').pop()),
    ['a.json', 'b.json'],
  );
  // ohne Ordner: nichts
  assert.deepEqual(notizenLesen(tempOrdner('leer-')), { dateien: [], gueltig: [], eintraege: [], fehler: [] });
});

test('automatisch: setzt Versionen, löscht gültige Notizen, ungültige bleiben, liefert Sätze und Zusammenfassung', () => {
  const w = kopie();
  mkdirSync(join(w, '.versionen'));
  writeFileSync(join(w, '.versionen/LIESMICH.md'), '# Notizen');
  writeFileSync(join(w, '.versionen/a.json'), JSON.stringify({ grz: { stufe: 'minor', notiz: 'Neuer Nachweis.' } }));
  writeFileSync(join(w, '.versionen/b.json'), JSON.stringify({ kosten: { stufe: 'patch', notiz: 'Rundung.' } }));
  writeFileSync(join(w, '.versionen/kaputt.json'), JSON.stringify({ ava: { stufe: 'riesig', notiz: 'x' } }));
  const versionen = Object.fromEntries(APPS.map((a) => [a, JSON.parse(readFileSync(join(w, `apps/${a}/package.json`), 'utf8')).version]));
  const tagsJetzt = APPS.map((a) => (a === 'flaechenrechner' ? `v${versionen[a]}` : `${a}-v${versionen[a]}`));
  const r = automatisch({ wurzel: w, tags: tagsJetzt });
  const neuGrz = erhoehen(versionen.grz, 'minor');
  assert.match(r.zusammenfassung, new RegExp(`^TERRIO ${neuGrz.replace(/\./g, '\\.')}, NUMIO [\\d.]+, Arkly [\\d.]+$`));
  assert.equal(JSON.parse(readFileSync(join(w, 'apps/grz/package.json'), 'utf8')).version, neuGrz);
  assert.equal(JSON.parse(readFileSync(join(w, 'package-lock.json'), 'utf8')).packages['apps/grz'].version, neuGrz);
  assert.deepEqual(r.notizen.grz, '- Neuer Nachweis.');
  assert.deepEqual(r.notizen.suite, '- TERRIO: Neuer Nachweis.\n- NUMIO: Rundung.');
  assert.equal(existsSync(join(w, '.versionen/a.json')), false);
  assert.equal(existsSync(join(w, '.versionen/b.json')), false);
  // ungültig: bleibt liegen, mit Warnung; FABRIO unverändert
  assert.equal(existsSync(join(w, '.versionen/kaputt.json')), true);
  assert.equal(existsSync(join(w, '.versionen/LIESMICH.md')), true);
  assert.match(r.warnungen[0], /kaputt\.json: ava: .*Notiz bleibt liegen/);
  assert.equal(JSON.parse(readFileSync(join(w, 'apps/ava/package.json'), 'utf8')).version, versionen.ava);
  // zweiter Lauf: nichts mehr zu tun (die kaputte Notiz zählt nicht)
  assert.equal(automatisch({ wurzel: w, tags: tagsJetzt }).zusammenfassung, '');
});
