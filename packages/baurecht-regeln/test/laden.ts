/** Regelpaket aus dem Dateisystem laden (Tests und Werkzeuge) */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Paket } from '@core/baurecht/paket';
import { paketAusDateien } from '@core/baurecht/paket';
import type { Fassung, QuellenRef } from '@core/recht/typen';

export const WURZEL = fileURLToPath(new URL('..', import.meta.url));

/** alle JSON-Dateien unter module/ und texte/ (Pfad relativ zur Paketwurzel, mit „/“) */
export function paketDateien(): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const lauf = (dir: string) => {
    for (const n of readdirSync(dir)) {
      const p = join(dir, n);
      if (statSync(p).isDirectory()) lauf(p);
      else if (n.endsWith('.json')) out[relative(WURZEL, p).split('\\').join('/')] = JSON.parse(readFileSync(p, 'utf8')) as unknown;
    }
  };
  for (const d of ['module', 'texte']) lauf(join(WURZEL, d));
  return out;
}

export function paketLaden(): Paket {
  const version = (JSON.parse(readFileSync(join(WURZEL, 'package.json'), 'utf8')) as { version: string }).version;
  return paketAusDateien(paketDateien(), version);
}

/**
 * Quelle ohne eigenes Fassungsdatum: gesetze-im-internet.de nennt nur den Stand des Abrufs, eine Datei (Satzung als PDF
 * oder Seite) ohne erkennbares Datum bekommt das Datum des Abrufs. Dort ist „neuere Fassung als die Regeldatei“ kein
 * Befund – eine Änderung zeigen nur die Prüfsummen der Absätze.
 */
export function ohneFassungsdatum(quelle: QuellenRef, f: Pick<Fassung, 'fassung'>): boolean {
  return quelle.art === 'gii' || (quelle.art === 'datei' && !f.fassung.startsWith('vom '));
}
