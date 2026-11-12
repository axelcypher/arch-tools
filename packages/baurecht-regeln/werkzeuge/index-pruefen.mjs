/**
 * Gebautes Regelpaket gegen das Repo prüfen – vor dem Signieren, nur mit Node-Bordmitteln (kein npm, keine
 * Abhängigkeiten): Jede Datei unter module/ und texte/ wird wie in `npm run index` kompakt serialisiert; Index und
 * ausgelieferte Dateien müssen genau dazu passen (Pfade, Größe, SHA-256, Hosts, Version). So kann eine kompromittierte
 * Abhängigkeit im Bau-Job keine geänderten Regeln oder Hosts signieren lassen.
 *
 *   node packages/baurecht-regeln/werkzeuge/index-pruefen.mjs <ausgabe-ordner>
 */
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const wurzel = fileURLToPath(new URL('..', import.meta.url));
const ausgabe = process.argv[2];
if (!ausgabe) throw new Error('Ausgabe-Ordner angeben');
const fehler = [];
const sha = (b) => createHash('sha256').update(b).digest('hex');

const erwartet = {};
const hosts = new Set();
const lauf = (dir) => {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) lauf(p);
    else if (n.endsWith('.json')) {
      const inhalt = JSON.parse(readFileSync(p, 'utf8'));
      const pfad = relative(wurzel, p).split('\\').join('/');
      erwartet[pfad] = Buffer.from(JSON.stringify(inhalt), 'utf8');
      if (/^module\/[^/]+\/modul\.json$/.test(pfad)) for (const h of inhalt.hosts ?? []) hosts.add(h);
    }
  }
};
for (const d of ['module', 'texte']) lauf(join(wurzel, d));

const index = JSON.parse(readFileSync(join(ausgabe, 'index.json'), 'utf8'));
const version = JSON.parse(readFileSync(join(wurzel, 'package.json'), 'utf8')).version;
if (index.format !== 1) fehler.push(`Format ${index.format}`);
if (typeof index.paket !== 'string' || !index.paket.startsWith(`${version}-`)) fehler.push(`Paketversion ${index.paket} passt nicht zu ${version}`);
const imIndex = Object.keys(index.dateien ?? {}).sort();
const imRepo = Object.keys(erwartet).sort();
if (JSON.stringify(imIndex) !== JSON.stringify(imRepo)) fehler.push(`Dateiliste weicht ab: nur im Index ${imIndex.filter((p) => !erwartet[p]).join(', ') || '–'}; nur im Repo ${imRepo.filter((p) => !index.dateien[p]).join(', ') || '–'}`);
for (const [pfad, b] of Object.entries(erwartet)) {
  const e = index.dateien?.[pfad];
  if (!e) continue;
  if (e.groesse !== b.length || e.sha256 !== sha(b)) fehler.push(`${pfad}: Prüfsumme im Index passt nicht zum Repo`);
  let geliefert;
  try {
    geliefert = readFileSync(join(ausgabe, pfad.replace(/\//g, '__')));
  } catch {
    fehler.push(`${pfad}: Datei fehlt in der Ausgabe`);
    continue;
  }
  if (!geliefert.equals(b)) fehler.push(`${pfad}: ausgelieferte Datei weicht vom Repo ab`);
}
const hostsSoll = [...hosts].sort();
if (JSON.stringify(index.hosts) !== JSON.stringify(hostsSoll)) fehler.push(`Hosts weichen ab: ${JSON.stringify(index.hosts)} statt ${JSON.stringify(hostsSoll)}`);
const fremd = readdirSync(ausgabe).filter((n) => n !== 'index.json' && n !== 'index.json.sig' && !erwartet[n.replace(/__/g, '/')]);
if (fremd.length) fehler.push(`unbekannte Dateien in der Ausgabe: ${fremd.join(', ')}`);

if (fehler.length) {
  process.stderr.write(`Regelpaket passt nicht zum Repo:\n${fehler.map((f) => `  - ${f}`).join('\n')}\n`);
  process.exit(1);
}
process.stdout.write(`Regelpaket ${index.paket}: ${imIndex.length} Dateien passen zum Repo\n`);
