import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import type { Zippable } from 'fflate';
import type { Pt } from './geo/mat';
import { neueEbene, neueId } from './model';
import type { Bereich, Dokument, Ebene, Foto, Linie, Mass, MessArt, Methode } from './model';

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
  let roh: { format?: string; version?: number; fotos?: unknown };
  try {
    roh = JSON.parse(strFromU8(json));
  } catch {
    throw new Error('Die Datei ist beschädigt (entzerrung.json ist kein gültiges JSON).');
  }
  if (roh.format !== FORMAT) throw new Error('Die Datei ist keine Entzerrungs-Projektdatei.');
  if ((roh.version ?? 0) > 1) throw new Error('Die Datei stammt aus einer neueren Version – bitte RECTIO aktualisieren.');
  const fotos: Foto[] = (Array.isArray(roh.fotos) ? roh.fotos : []).map((r, i) => fotoAus(r, i));
  const ids = fotos.flatMap((f) => [
    f.id,
    ...f.hilfslinien.map((l) => l.id),
    ...f.ebenen.flatMap((e) => [e.id, ...e.passpunkte.map((p) => p.id), ...e.messungen.map((m) => m.id), ...Object.values(e.fluchtlinien).flatMap((l) => l.map((x) => x.id))]),
  ]);
  if (new Set(ids).size !== ids.length) throw new Error('Die Datei ist beschädigt (doppelte Kennungen).');
  const bilder: Record<string, Uint8Array> = {};
  for (const f of fotos) {
    const b = dateien[fotoPfad(f)];
    if (!b) throw new Error(`Foto „${f.name}“ fehlt in der Datei.`);
    bilder[f.id] = b;
  }
  return { doc: { fotos }, fotos: bilder };
}

// ---------- Prüfen und Ergänzen (ältere, von Hand bearbeitete oder beschädigte Dateien) ----------

const istObjekt = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const zahl = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
const liste = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const text = (v: unknown, vorgabe: string) => (typeof v === 'string' && v.trim() ? v : vorgabe);
const kennung = (v: unknown) => (typeof v === 'string' && v ? v : neueId());

/** Punkt mit endlichen Koordinaten oder undefined */
function punkt(v: unknown): Pt | undefined {
  if (!istObjekt(v)) return undefined;
  const x = zahl(v.x);
  const y = zahl(v.y);
  return x === undefined || y === undefined ? undefined : { x, y };
}
const punkte = (v: unknown): Pt[] =>
  liste(v)
    .map(punkt)
    .filter((p): p is Pt => !!p);

function linien<T extends Linie>(v: unknown, mehr: (r: Record<string, unknown>) => Partial<T> = () => ({})): T[] {
  return liste(v).flatMap((r) => {
    if (!istObjekt(r)) return [];
    const a = punkt(r.a);
    const b = punkt(r.b);
    return a && b ? [{ id: kennung(r.id), a, b, ...mehr(r) } as T] : [];
  });
}

const METHODEN: Methode[] = ['rechteck', 'passpunkte', 'fluchtlinien'];
const MESSARTEN: MessArt[] = ['strecke', 'linienzug', 'flaeche'];
const MINDEST: Record<MessArt, number> = { strecke: 2, linienzug: 2, flaeche: 3 };

function fotoAus(roh: unknown, i: number): Foto {
  const r = istObjekt(roh) ? roh : {};
  const name = text(r.name, `Foto ${i + 1}`);
  const breite = zahl(r.breite);
  const hoehe = zahl(r.hoehe);
  if (!(breite && breite > 0 && hoehe && hoehe > 0)) throw new Error(`Die Datei ist beschädigt (Bildgröße von „${name}“ fehlt).`);
  const linse = istObjekt(r.linse) ? r.linse : {};
  const ebenen = liste(r.ebenen).map((e, j) => ebeneAus(e, j));
  return {
    id: kennung(r.id),
    name,
    mime: text(r.mime, 'image/jpeg'),
    breite,
    hoehe,
    linse: { k1: zahl(linse.k1) ?? 0, k2: zahl(linse.k2) ?? 0, vorher: zahl(linse.vorher), nachher: zahl(linse.nachher) },
    hilfslinien: liste(r.hilfslinien).flatMap((l) => (istObjekt(l) ? [{ id: kennung(l.id), punkte: punkte(l.punkte) }] : [])),
    ebenen: ebenen.length ? ebenen : [neueEbene(1)],
  };
}

function bereich(v: unknown): Bereich | undefined {
  if (!istObjekt(v)) return undefined;
  const [x0, y0, x1, y1] = [zahl(v.x0), zahl(v.y0), zahl(v.x1), zahl(v.y1)];
  return x0 !== undefined && y0 !== undefined && x1 !== undefined && y1 !== undefined && x1 > x0 && y1 > y0 ? { x0, y0, x1, y1 } : undefined;
}

function ebeneAus(roh: unknown, i: number): Ebene {
  const r = istObjekt(roh) ? roh : {};
  const leer = neueEbene(i + 1);
  const re = istObjekt(r.rechteck) ? r.rechteck : {};
  const fl = istObjekt(r.fluchtlinien) ? r.fluchtlinien : {};
  const positiv = (v: unknown) => {
    const n = zahl(v);
    return n !== undefined && n > 0 ? n : undefined;
  };
  return {
    id: kennung(r.id),
    name: text(r.name, leer.name),
    methode: METHODEN.includes(r.methode as Methode) ? (r.methode as Methode) : 'rechteck',
    rechteck: { ecken: punkte(re.ecken).slice(0, 4), breite: positiv(re.breite), hoehe: positiv(re.hoehe) },
    passpunkte: liste(r.passpunkte).flatMap((p) => {
      const bild = istObjekt(p) ? punkt(p.bild) : undefined;
      return istObjekt(p) && bild ? [{ id: kennung(p.id), bild, x: zahl(p.x), y: zahl(p.y) }] : [];
    }),
    fluchtlinien: { waagerecht: linien(fl.waagerecht), senkrecht: linien(fl.senkrecht), masse: linien<Mass>(fl.masse, (m) => ({ laenge: positiv(m.laenge) })) },
    ausschnitt: bereich(r.ausschnitt),
    aufloesung: positiv(r.aufloesung),
    messungen: liste(r.messungen).flatMap((m, j) => {
      if (!istObjekt(m) || !MESSARTEN.includes(m.art as MessArt)) return [];
      const art = m.art as MessArt;
      const p = punkte(m.punkte);
      return p.length >= MINDEST[art] ? [{ id: kennung(m.id), art, name: text(m.name, `Messung ${j + 1}`), punkte: art === 'strecke' ? p.slice(0, 2) : p }] : [];
    }),
  };
}
