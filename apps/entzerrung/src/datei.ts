import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import type { Zippable } from 'fflate';
import { neueEbene } from './model';
import type { Dokument, Ebene, Foto } from './model';

/**
 * Projektdatei der Entzerrung (.entz): ZIP mit `entzerrung.json` (Fotos, Ebenen, Messungen) und den
 * Originalfotos unter `fotos/<id>.<endung>`. Die Fotos bleiben unverändert – entzerrt wird immer neu.
 */

export const FORMAT = 'arch-tools-entzerrung';
export const ENDUNG = 'entz';

const ENDUNGEN: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'image/bmp': 'bmp' };

export function fotoPfad(f: Pick<Foto, 'id' | 'mime'>): string {
  return `fotos/${f.id}.${ENDUNGEN[f.mime] ?? 'bin'}`;
}

export function packen(doc: Dokument, fotos: Record<string, Uint8Array>): Uint8Array {
  const inhalt: Zippable = {
    'entzerrung.json': strToU8(JSON.stringify({ format: FORMAT, version: 1, app: __APP_VERSION__, fotos: doc.fotos }, null, 1)),
  };
  for (const f of doc.fotos) {
    const daten = fotos[f.id];
    if (!daten) throw new Error(`Foto „${f.name}“ fehlt.`);
    // Fotos sind schon komprimiert
    inhalt[fotoPfad(f)] = [daten, { level: 0 }];
  }
  return zipSync(inhalt, { level: 6 });
}

export function entpacken(daten: Uint8Array): { doc: Dokument; fotos: Record<string, Uint8Array> } {
  let dateien: Record<string, Uint8Array>;
  try {
    dateien = unzipSync(daten);
  } catch {
    throw new Error('Die Datei ist keine Entzerrungs-Projektdatei (kein ZIP).');
  }
  const json = dateien['entzerrung.json'];
  if (!json) throw new Error('Die Datei ist keine Entzerrungs-Projektdatei (entzerrung.json fehlt).');
  const roh = JSON.parse(strFromU8(json)) as { format?: string; version?: number; fotos?: unknown };
  if (roh.format !== FORMAT) throw new Error('Die Datei ist keine Entzerrungs-Projektdatei.');
  if ((roh.version ?? 0) > 1) throw new Error('Die Datei stammt aus einer neueren Version – bitte die Entzerrung aktualisieren.');
  const fotos: Foto[] = (Array.isArray(roh.fotos) ? roh.fotos : []).map(fotoAus);
  const bilder: Record<string, Uint8Array> = {};
  for (const f of fotos) {
    const b = dateien[fotoPfad(f)];
    if (!b) throw new Error(`Foto „${f.name}“ fehlt in der Datei.`);
    bilder[f.id] = b;
  }
  return { doc: { fotos }, fotos: bilder };
}

/** ergänzt fehlende Felder (ältere oder von Hand bearbeitete Dateien) */
function fotoAus(r: Partial<Foto>): Foto {
  return {
    id: String(r.id),
    name: String(r.name ?? 'Foto'),
    mime: String(r.mime ?? 'image/jpeg'),
    breite: Number(r.breite),
    hoehe: Number(r.hoehe),
    linse: { k1: 0, k2: 0, ...r.linse },
    hilfslinien: r.hilfslinien ?? [],
    ebenen: (r.ebenen ?? []).map((e, i) => ebeneAus(e, i)),
  };
}

function ebeneAus(r: Partial<Ebene>, i: number): Ebene {
  const leer = neueEbene(i + 1);
  return {
    ...leer,
    ...r,
    rechteck: { ...leer.rechteck, ...r.rechteck },
    fluchtlinien: { ...leer.fluchtlinien, ...r.fluchtlinien },
    passpunkte: r.passpunkte ?? [],
    messungen: r.messungen ?? [],
  };
}
