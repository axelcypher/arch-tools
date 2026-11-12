/**
 * Geodienste am Grundstück (docs/baurecht-konzept.md, 5.4): Flurstück und Gemeindeschlüssel aus ALKIS, Schutzgebiete
 * und Satzungsgebiete aus den Diensten, die die Module nennen (WMS GetFeatureInfo, ArcGIS REST, WFS).
 *
 * Ein Treffer macht den Fakt „ja“ (sicher). „Kein Treffer“ ist nie sicher: Ob seit dem Datenstand des Dienstes eine
 * neue Verordnung bekanntgemacht wurde (Bedingung 4), lässt sich nicht automatisch prüfen – die Dienste nennen keinen
 * Datenstand je Gebiet. Deshalb bleibt „nein“ ein Hinweis mit Begründung, bis die Bearbeitung ihn bestätigt.
 */

import type { Holen } from '../recht/netz';
import { alsText, holenOk } from '../recht/netz';
import type { FaktDef, FaktWert, GeodienstDef } from './typen';

export interface Punkt {
  x: number;
  y: number;
}

export interface Flurstueck {
  ags: string;
  gemeinde: string;
  gemarkung: string;
  flur: string;
  flurstueck: string;
  flaeche?: number;
  /** Umring in EPSG:25832 */
  umring: Punkt[];
  aktualitaet?: string;
}

const ALKIS = 'https://www.wfs.nrw.de/geobasis/wfs_nw_alkis_vereinfacht';

const tag = (xml: string, name: string) => new RegExp(`<(?:\\w+:)?${name}>([^<]*)</(?:\\w+:)?${name}>`).exec(xml)?.[1]?.trim();

/** Flurstück aus der Antwort des ALKIS-WFS (vereinfachtes Schema) */
export function flurstueckAus(xml: string): Flurstueck | null {
  const f = /<(?:\w+:)?Flurstueck\b[\s\S]*?<\/(?:\w+:)?Flurstueck>/.exec(xml)?.[0];
  if (!f) return null;
  const ags = tag(f, 'gmdschl');
  if (!ags) return null;
  const nenner = tag(f, 'flstnrnen');
  const pos = /<gml:posList[^>]*>([^<]*)<\/gml:posList>/.exec(f)?.[1]?.trim().split(/\s+/).map(Number) ?? [];
  const umring: Punkt[] = [];
  for (let i = 0; i + 1 < pos.length; i += 2) umring.push({ x: pos[i], y: pos[i + 1] });
  const flaeche = Number(tag(f, 'flaeche'));
  return {
    ags,
    gemeinde: tag(f, 'gemeinde') ?? '',
    gemarkung: tag(f, 'gemarkung') ?? '',
    flur: String(Number(tag(f, 'flur') ?? '')) || '',
    flurstueck: `${tag(f, 'flstnrzae') ?? ''}${nenner ? `/${nenner}` : ''}`,
    ...(Number.isFinite(flaeche) ? { flaeche } : {}),
    umring,
    ...(tag(f, 'aktualit') ? { aktualitaet: tag(f, 'aktualit')!.replace(/Z$/, '') } : {}),
  };
}

/** Flurstück am Punkt (EPSG:25832) */
export async function flurstueckAbfragen(h: Holen, p: Punkt): Promise<Flurstueck | null> {
  const b = [p.x - 0.5, p.y - 0.5, p.x + 0.5, p.y + 0.5].map((v) => v.toFixed(2)).join(',');
  const url = `${ALKIS}?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetFeature&TYPENAMES=ave:Flurstueck&COUNT=1&SRSNAME=EPSG:25832&BBOX=${b},urn:ogc:def:crs:EPSG::25832`;
  return flurstueckAus(alsText(await holenOk(h, url)));
}

/* ---------- Prüfpunkte ---------- */

const mitte = (u: Punkt[]): Punkt => ({ x: u.reduce((s, p) => s + p.x, 0) / u.length, y: u.reduce((s, p) => s + p.y, 0) / u.length });

/**
 * Prüfpunkte für Punktabfragen (WMS): Mittelpunkt, Eckpunkte und Punkte entlang des um den Puffer erweiterten
 * Umrings (alle `abstand` m). Ohne Umring: Punkt und Kreis mit Pufferradius.
 */
export function pruefpunkte(umring: Punkt[] | null, punkt: Punkt, puffer: number, abstand = 10, hoechstens = 64): Punkt[] {
  const out: Punkt[] = [];
  if (!umring || umring.length < 3) {
    out.push(punkt);
    for (let i = 0; i < 12; i++) out.push({ x: punkt.x + puffer * Math.cos((i * Math.PI) / 6), y: punkt.y + puffer * Math.sin((i * Math.PI) / 6) });
    return out;
  }
  const m = mitte(umring);
  out.push(m, ...umring);
  // Umring um den Puffer nach außen schieben (vom Mittelpunkt weg) und dicht abtasten
  const aussen = umring.map((p) => {
    const dx = p.x - m.x;
    const dy = p.y - m.y;
    const l = Math.hypot(dx, dy) || 1;
    return { x: p.x + (dx / l) * puffer, y: p.y + (dy / l) * puffer };
  });
  for (let i = 0; i < aussen.length; i++) {
    const a = aussen[i];
    const b = aussen[(i + 1) % aussen.length];
    const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / abstand));
    for (let k = 0; k < n; k++) out.push({ x: a.x + ((b.x - a.x) * k) / n, y: a.y + ((b.y - a.y) * k) / n });
  }
  if (out.length <= hoechstens) return out;
  const schritt = out.length / hoechstens;
  return Array.from({ length: hoechstens }, (_, i) => out[Math.floor(i * schritt)]);
}

/* ---------- Abfrage eines Dienstes ---------- */

export interface GeoErgebnis {
  treffer: boolean;
  /** Attribut des Treffers (z. B. Zone) */
  wert?: string;
  /** alle Anfragen gültig beantwortet */
  vollstaendigAbgefragt: boolean;
  fehler?: string;
  punkte: number;
}

/** GetFeatureInfo-Antwort (GML von MapServer bzw. GeoJSON): Treffer und ggf. Attribut */
export function gfiAus(text: string, attribut?: string): { treffer: boolean; wert?: string } {
  const t = text.trim();
  if (t.startsWith('{')) {
    const j = JSON.parse(t) as { features?: { properties?: Record<string, unknown> }[] };
    const f = j.features?.[0];
    return { treffer: !!f, ...(f && attribut && f.properties?.[attribut] != null ? { wert: String(f.properties[attribut]) } : {}) };
  }
  if (/ServiceException/i.test(t)) throw new Error(`Dienst meldet einen Fehler: ${/<ServiceException[^>]*>([\s\S]*?)<\/ServiceException>/i.exec(t)?.[1]?.trim() ?? 'unbekannt'}`);
  const treffer = /<\w+_feature>/.test(t) || /<gml:featureMember>/.test(t);
  const wert = treffer && attribut ? tag(t, attribut) : undefined;
  return { treffer, ...(wert ? { wert } : {}) };
}

async function wmsPunkt(h: Holen, d: GeodienstDef, ebene: string, p: Punkt): Promise<{ treffer: boolean; wert?: string }> {
  const b = [p.x - 1, p.y - 1, p.x + 1, p.y + 1].map((v) => v.toFixed(2)).join(',');
  const trenner = d.url.includes('?') ? '&' : '?';
  const url = `${d.url}${trenner}SERVICE=WMS&VERSION=1.3.0&REQUEST=GetFeatureInfo&LAYERS=${encodeURIComponent(ebene)}&QUERY_LAYERS=${encodeURIComponent(ebene)}&STYLES=&CRS=EPSG:25832&BBOX=${b}&WIDTH=3&HEIGHT=3&I=1&J=1&INFO_FORMAT=application/vnd.ogc.gml&FEATURE_COUNT=5`;
  return gfiAus(alsText(await holenOk(h, url)), d.attribut);
}

/** ArcGIS-REST: Schnitt mit dem um den Puffer erweiterten Umring (Polygon + distance) */
async function arcgisAbfrage(h: Holen, d: GeodienstDef, ebene: string, umring: Punkt[] | null, punkt: Punkt, puffer: number): Promise<{ treffer: boolean; wert?: string }> {
  const geometrie = umring && umring.length >= 3 ? { rings: [[...umring, umring[0]].map((p) => [p.x, p.y])], spatialReference: { wkid: 25832 } } : { x: punkt.x, y: punkt.y, spatialReference: { wkid: 25832 } };
  const typ = umring && umring.length >= 3 ? 'esriGeometryPolygon' : 'esriGeometryPoint';
  const q = new URLSearchParams({ geometry: JSON.stringify(geometrie), geometryType: typ, inSR: '25832', spatialRel: 'esriSpatialRelIntersects', distance: String(puffer), units: 'esriSRUnit_Meter', outFields: d.attribut ?? '*', returnGeometry: 'false', f: 'json' });
  const r = await holenOk(h, `${d.url.replace(/\/$/, '')}/${encodeURIComponent(ebene)}/query?${q.toString()}`);
  const j = JSON.parse(alsText(r)) as { features?: { attributes?: Record<string, unknown> }[]; error?: { message?: string } };
  if (j.error) throw new Error(`Dienst meldet einen Fehler: ${j.error.message ?? 'unbekannt'}`);
  const f = j.features?.[0];
  return { treffer: !!f, ...(f && d.attribut && f.attributes?.[d.attribut] != null ? { wert: String(f.attributes[d.attribut]) } : {}) };
}

/** Einen Dienst am Grundstück abfragen: Hauptebene(n) und Vorstufen; ein Treffer genügt */
export async function dienstAbfragen(h: Holen, d: GeodienstDef, umring: Punkt[] | null, punkt: Punkt): Promise<GeoErgebnis> {
  const puffer = Math.max(25, d.puffer ?? 25);
  const ebenen = [...d.ebene.split(',').map((e) => e.trim()), ...(d.vorstufen ?? [])].filter(Boolean);
  let vollstaendig = true;
  let fehler: string | undefined;
  let punkte = 0;
  for (const ebene of ebenen) {
    try {
      if (d.art === 'arcgis') {
        punkte++;
        const r = await arcgisAbfrage(h, d, ebene, umring, punkt, puffer);
        if (r.treffer) return { ...r, vollstaendigAbgefragt: vollstaendig, punkte };
      } else {
        for (const p of pruefpunkte(umring, punkt, puffer)) {
          punkte++;
          const r = await wmsPunkt(h, d, ebene, p);
          if (r.treffer) return { ...r, vollstaendigAbgefragt: vollstaendig, punkte };
        }
      }
    } catch (e) {
      vollstaendig = false;
      fehler = e instanceof Error ? e.message : String(e);
    }
  }
  return { treffer: false, vollstaendigAbgefragt: vollstaendig, ...(fehler ? { fehler } : {}), punkte };
}

/** Quelle mit Lizenzhinweis (z. B. „Datenlizenz Deutschland – Namensnennung 2.0, Land NRW“ verlangt den Vermerk) */
export const quelleMitLizenz = (d: GeodienstDef) => (d.lizenz ? `${d.quelle} · ${d.lizenz}` : d.quelle);

/**
 * Ergebnis einer Abfrage als Fakt. Treffer → sicher (rot ist die sichere Seite). Kein Treffer → Hinweis mit Grund,
 * auch wenn alles andere stimmt (Bedingung 4 nicht automatisch prüfbar).
 */
export function alsFakt(def: FaktDef, d: GeodienstDef, e: GeoErgebnis, o: { genau: boolean; heute: string }): FaktWert | null {
  if (e.treffer) {
    const wert = def.typ === 'janein' ? true : (e.wert ?? null);
    if (wert === null) return null;
    return { wert, herkunft: 'geodienst', quelle: quelleMitLizenz(d), stand: o.heute, sicherheit: 'sicher' };
  }
  if (def.typ !== 'janein') return null;
  const gruende: string[] = [];
  if (!e.vollstaendigAbgefragt) gruende.push(`nicht alle Abfragen beantwortet${e.fehler ? ` (${e.fehler})` : ''}`);
  if (!d.vollstaendig) gruende.push('Datensatz nicht als vollständig gekennzeichnet');
  if (!o.genau) gruende.push('Lage nur ungefähr (kein Flurstück bzw. Adresse nicht hausnummerngenau)');
  gruende.push('ob seit dem Datenstand neue Verordnungen bekanntgemacht wurden, prüft die App nicht – Amtsblatt bzw. Auskunft der Behörde');
  return { wert: false, herkunft: 'geodienst', quelle: quelleMitLizenz(d), stand: o.heute, sicherheit: 'hinweis', grund: `Kein Treffer (Flurstück mit ${Math.max(25, d.puffer ?? 25)} m Puffer) – nur Hinweis: ${gruende.join('; ')}` };
}
