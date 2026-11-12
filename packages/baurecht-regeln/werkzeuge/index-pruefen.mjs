/**
 * Gebautes Regelpaket gegen das Repo prüfen – vor dem Signieren, nur mit Node-Bordmitteln (kein npm, keine
 * Abhängigkeiten): Jede Datei unter module/ und texte/ wird wie in `npm run index` kompakt serialisiert; Index und
 * ausgelieferte Dateien müssen genau dazu passen (Pfade, Größe, SHA-256, Hosts, Version). So kann eine kompromittierte
 * Abhängigkeit im Bau-Job keine geänderten Regeln oder Hosts signieren lassen.
 *
 * Die Paketversion muss `<package.json-Version>-<Laufnummer>` sein; im Workflow (GITHUB_RUN_NUMBER gesetzt) genau
 * die Nummer dieses Laufs. Eine schon mitgelieferte Signatur (*.sig) wird abgelehnt – signiert wird erst danach.
 *
 *   node packages/baurecht-regeln/werkzeuge/index-pruefen.mjs <ausgabe-ordner>
 */
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const WURZEL = fileURLToPath(new URL('..', import.meta.url));
const sha = (b) => createHash('sha256').update(b).digest('hex');

/** Fehler (leer = passt); `runNummer` = GITHUB_RUN_NUMBER, sonst nur das Format `<Version>-<Zahl>` */
export function indexPruefen(ausgabe, { runNummer, wurzel = WURZEL } = {}) {
  const fehler = [];
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

  let index;
  try {
    index = JSON.parse(readFileSync(join(ausgabe, 'index.json'), 'utf8'));
  } catch (e) {
    return [`index.json nicht lesbar: ${e instanceof Error ? e.message : String(e)}`];
  }
  const version = JSON.parse(readFileSync(join(wurzel, 'package.json'), 'utf8')).version;
  if (index.format !== 1) fehler.push(`Format ${index.format}`);
  const soll = runNummer ? `${version}-${runNummer}` : null;
  if (typeof index.paket !== 'string' || (soll ? index.paket !== soll : !new RegExp(`^${version.replace(/\./g, '\\.')}-\\d+$`).test(index.paket)))
    fehler.push(`Paketversion ${index.paket} passt nicht zu ${soll ?? `${version}-<Laufnummer>`}`);
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
  const namen = readdirSync(ausgabe);
  const signaturen = namen.filter((n) => n.endsWith('.sig'));
  if (signaturen.length) fehler.push(`Signatur schon in der Ausgabe (${signaturen.join(', ')}) – signiert wird erst nach dieser Prüfung`);
  const fremd = namen.filter((n) => n !== 'index.json' && !n.endsWith('.sig') && !erwartet[n.replace(/__/g, '/')]);
  if (fremd.length) fehler.push(`unbekannte Dateien in der Ausgabe: ${fremd.join(', ')}`);
  return fehler;
}

// als Skript aufgerufen
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const ausgabe = process.argv[2];
  if (!ausgabe) {
    process.stderr.write('Ausgabe-Ordner angeben\n');
    process.exit(2);
  }
  const fehler = indexPruefen(ausgabe, { runNummer: process.env.GITHUB_RUN_NUMBER });
  if (fehler.length) {
    process.stderr.write(`Regelpaket passt nicht zum Repo:\n${fehler.map((f) => `  - ${f}`).join('\n')}\n`);
    process.exit(1);
  }
  const index = JSON.parse(readFileSync(join(ausgabe, 'index.json'), 'utf8'));
  process.stdout.write(`Regelpaket ${index.paket}: ${Object.keys(index.dateien).length} Dateien passen zum Repo\n`);
}
