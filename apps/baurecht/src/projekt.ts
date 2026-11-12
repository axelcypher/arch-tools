/**
 * Projektdatei öffnen und speichern. Desktop: Projektdatei im Projektordner, gezielt ersetzt (nur `projekt.json`
 * ändert sich; bei gleichzeitigen Änderungen anderer Apps wird neu gelesen und zusammengeführt). Web: Datei aus dem
 * Dateidialog, Speichern lädt die geänderte Datei herunter.
 */

import { readProjectFile } from '@core/archive';
import { merkmalSetzen, pruefungSetzen } from '@core/baurecht/projekt';
import { pickFile, saveBinaryFile } from '@core/platform/files';
import { logger } from '@core/platform/log';
import { projektdateiSchreiben, tauriProjektordner } from '@core/platform/projektordner';
import { projektdateiAendern, projektdateiRoh } from '@core/projektdatei';
import type { GewaehltesProjekt } from '@core/ui/ProjektWahl';
import type { Projektquelle } from './store';
import { useBaurecht } from './store';

const log = logger('baurecht');

/** relativer Pfad der Projektdatei im Projektordner („/“ getrennt) */
export function relativ(ordner: string, datei: string): string {
  const o = ordner.replace(/[\\/]+$/, '');
  const d = datei.startsWith(o) ? datei.slice(o.length).replace(/^[\\/]+/, '') : datei;
  return d.split(/[\\/]+/).join('/');
}

/** Projekt aus der Projektwahl (Desktop) öffnen */
export async function ausProjektwahl(g: GewaehltesProjekt): Promise<void> {
  const pfad = relativ(g.ordner, g.datei);
  const r = await tauriProjektordner.liesMitStand(g.ordner, pfad);
  if (!r) throw new Error(`${g.datei}: nicht gefunden`);
  useBaurecht.getState().projektSetzen({ art: 'ordner', root: g.ordner, pfad, datei: g.datei }, g.project, projektdateiRoh(r.daten));
  log.info('Projekt geöffnet', { datei: g.datei });
}

/** Projektdatei über den Dateidialog öffnen (Web und Desktop ohne Projektordner) */
export async function dateiOeffnen(): Promise<boolean> {
  const f = await pickFile('.oap');
  if (!f) return false;
  const bytes = new Uint8Array(await f.arrayBuffer());
  useBaurecht.getState().projektSetzen({ art: 'datei', name: f.name, bytes }, readProjectFile(bytes), projektdateiRoh(bytes));
  return true;
}

/** die Änderungen dieser App auf `projekt.json` anwenden: geänderte Merkmale und die Prüfung des Antrags */
export function aenderungenAnwenden(roh: Record<string, unknown>): Record<string, unknown> {
  const s = useBaurecht.getState();
  let out = roh;
  const namen = new Set([...Object.keys(s.merkmale), ...Object.keys(s.merkmaleDatei)]);
  for (const n of namen) if ((s.merkmale[n] ?? '') !== (s.merkmaleDatei[n] ?? '')) out = merkmalSetzen(out, s.antrag, n, s.merkmale[n] ?? '');
  return pruefungSetzen(out, s.antrag, s.pruefung);
}

/** Speichern; true, wenn gespeichert wurde */
export async function speichernJetzt(): Promise<boolean> {
  const s = useBaurecht.getState();
  const q: Projektquelle | null = s.quelle;
  if (!q) return false;
  if (q.art === 'ordner') {
    let neu: Record<string, unknown> | null = null;
    await projektdateiSchreiben(tauriProjektordner, q.root, q.pfad, (roh) => (neu = aenderungenAnwenden(roh)));
    const r = await tauriProjektordner.liesMitStand(q.root, q.pfad);
    const roh = r ? projektdateiRoh(r.daten) : neu;
    if (roh) useBaurecht.getState().gespeichert(roh);
    log.info('Gespeichert', { datei: q.datei });
    return true;
  }
  const bytes = projektdateiAendern(q.bytes, aenderungenAnwenden) ?? q.bytes;
  const ok = await saveBinaryFile({ data: bytes, defaultName: q.name, filterName: 'Projektdatei', extension: 'oap', mime: 'application/zip' });
  if (ok) useBaurecht.getState().gespeichert(projektdateiRoh(bytes), { ...q, bytes });
  return ok;
}
