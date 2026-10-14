import type { Point } from './geometry';
import { distanceToEdges, labelPoint, pointInPolygon, polygonArea } from './geometry';
import type { Nutzungsgruppe, OutlineShape, Project, Raumumschliessung, RoomShape, Storey, WoflKategorie } from './model';
import type { MultiPolygon } from './polygon';
import { areaMP, diffMP, unionAll } from './polygon';
import { roomArea, storeyElevations } from './model';
import { gaubenVolumen } from './gaube';
import { roofStats } from './roof';
import { meshRoofStats } from './roofMesh';
import { nutzungInfo, woflFaktor } from './norms';

/**
 * Flächen- und Rauminhaltsberechnung.
 *
 *  BGF  = Σ Umrissflächen (R/S getrennt), Abzugsflächen negativ
 *  BRI  = Σ Umrissfläche × Höhe (Geschosshöhe oder abweichende Höhe je Umriss)
 *  NRF  = NUF + TF + VF (Σ Raumflächen je Nutzungsgruppe)
 *  KGF  = BGF − NRF
 *  WoFl = Σ Raumfläche × Anrechnungsfaktor (WoFlV § 4)
 */

export interface RS {
  R: number;
  S: number;
  total: number;
}

export type NutzungSummen = Record<Nutzungsgruppe, number>;

export interface RoomResult {
  shapeId: string;
  storeyId: string;
  storeyName: string;
  nummer: string;
  name: string;
  nutzung: Nutzungsgruppe;
  umschliessung: Raumumschliessung;
  subtract: boolean;
  /** vorzeichenbehaftet: Abzugsflächen negativ */
  area: number;
  woflKategorie: WoflKategorie;
  woflFaktor: number;
  woflArea: number;
  wohnung: string;
}

export interface AreaTotals {
  bgf: RS;
  bri: RS;
  nutzung: NutzungSummen;
  nuf: RS;
  tf: RS;
  vf: RS;
  nrf: RS;
  kgf: RS;
  wofl: number;
}

export interface StoreyResult extends AreaTotals {
  storeyId: string;
  name: string;
  hoehe: number;
  rooms: RoomResult[];
}

export interface WohnungResult {
  wohnung: string;
  wofl: number;
  grundflaeche: number;
  rooms: RoomResult[];
}

export interface ProjectResult {
  storeys: StoreyResult[];
  total: AreaTotals;
  wohnungen: WohnungResult[];
}

const rs = (): RS => ({ R: 0, S: 0, total: 0 });
const emptyNutzung = (): NutzungSummen => ({ NUF1: 0, NUF2: 0, NUF3: 0, NUF4: 0, NUF5: 0, NUF6: 0, NUF7: 0, TF: 0, VF: 0 });

function addRS(target: RS, key: Raumumschliessung, v: number) {
  target[key] += v;
  target.total += v;
}

function emptyTotals(): AreaTotals {
  return { bgf: rs(), bri: rs(), nutzung: emptyNutzung(), nuf: rs(), tf: rs(), vf: rs(), nrf: rs(), kgf: rs(), wofl: 0 };
}

/**
 * Dach aus Modell: Fußbodenhöhe und Höhenbegrenzung eines Umrisses.
 * Ohne feste Begrenzung (maxHoehe) reicht der Körper bis zum Fußboden des nächsten Geschosses –
 * aber nur dort, wo dieses Geschoss BGF hat (Umriss, abzüglich Abzugsflächen). Sonst bis zur Dachhaut:
 * so wird z. B. die Dachspitze über einem DG erfasst, auch wenn sie als eigenes Geschoss ohne BGF modelliert ist.
 */
/** größte Abweichung [m], bis zu der Umrisse übereinanderliegender Geschosse als deckungsgleich gelten */
export const UMRISS_TOLERANZ = 0.02;

export function modellRoofParams(project: Project, storey: Storey, s: OutlineShape): { floorZ: number; cap: number | ((p: Point) => number) } {
  const elev = storeyElevations(project);
  const idx = project.storeys.indexOf(storey);
  const floorZ = elev[idx] ?? 0;
  if (s.dach?.maxHoehe !== undefined) return { floorZ, cap: s.dach.maxHoehe };
  if (storey.geschosshoeheBegrenzt) return { floorZ, cap: s.hoehe ?? storey.hoehe };
  // nächstes Geschoss darüber (nach Höhe, nicht nach Listenreihenfolge)
  let above = -1;
  elev.forEach((e, i) => {
    if (e > floorZ + 1e-6 && (above < 0 || e < elev[above])) above = i;
  });
  if (above < 0) return { floorZ, cap: Infinity };
  const upper = project.storeys[above].shapes.filter((x) => x.kind === 'outline');
  const plus = upper.filter((x) => !x.subtract).map((x) => x.points);
  const minus = upper.filter((x) => x.subtract).map((x) => x.points);
  if (!plus.length) return { floorZ, cap: Infinity };
  const hUp = elev[above] - floorZ;
  // Umrisse gelten bis UMRISS_TOLERANZ als deckungsgleich: Punkte auf bzw. knapp neben dem Rand des
  // oberen Umrisses (Wände unterschiedlich gezeichnet/erkannt) sind überdeckt, sonst entstehen am Rand
  // schmale Streifen „bis zur Dachhaut“.
  const covered = (p: Point, q: Point[]) => pointInPolygon(p, q) || distanceToEdges(p, q) <= UMRISS_TOLERANZ;
  const cut = (p: Point, q: Point[]) => pointInPolygon(p, q) && distanceToEdges(p, q) > UMRISS_TOLERANZ;
  return {
    floorZ,
    cap: (p: Point) => (plus.some((q) => covered(p, q)) && !minus.some((q) => cut(p, q)) ? hUp : Infinity),
  };
}

/** Rauminhalt eines BGF-Umrisses über dem Geschossfußboden (ohne Vorzeichen): Fläche × Höhe bzw. bis zur Dachhaut */
export function koerperVolume(s: OutlineShape, storey: Storey, project: Project): number {
  const h = s.hoehe ?? storey.hoehe;
  if (!s.dach) return polygonArea(s.points) * h;
  if (s.dach.typ === 'modell') {
    if (!project.dachModell) return polygonArea(s.points) * h;
    const r = modellRoofParams(project, storey, s);
    return meshRoofStats(project.dachModell, s.points, r.floorZ, h, r.cap).volumen;
  }
  return Math.abs(roofStats(s.dach, s.points).volumen) + gaubenVolumen(s.dach);
}

/** Teil des Rauminhalts unterhalb des Geschossfußbodens (bzw. Abzug bei höher liegendem Fußboden) */
export interface UnterbauTeil {
  art: 'versatz' | 'absenkung' | 'sohle';
  bezeichnung: string;
  flaeche: number;
  /** Höhe; negativ bei einem höher liegenden Fußboden (Abzug) */
  hoehe: number;
  /** Raum, dessen Absenkung gemeint ist */
  raumId?: string;
}

/**
 * Rauminhalt unter dem Geschossfußboden eines BGF-Umrisses (DIN 277: BRI ab Unterseite der konstruktiven Sohle):
 *  - versatz:   der ganze Umriss liegt tiefer (höher) als das Geschoss → Fläche × Versatz
 *  - absenkung: Räume im Umriss liegen tiefer als dessen Fußboden (Split-Level) → Raumfläche (Polygon) × Absenkung
 *  - sohle:     Bodenplatte des Geschosses → Teil des Umrisses ohne Geschoss darunter × Sohlendicke
 */
export function unterbau(s: OutlineShape, storey: Storey, project: Project): UnterbauTeil[] {
  const out: UnterbauTeil[] = [];
  const A = polygonArea(s.points);
  const v = s.versatz ?? 0;
  if (Math.abs(v) > 1e-9) {
    out.push({ art: 'versatz', bezeichnung: v < 0 ? 'Fußboden tiefer (Split-Level)' : 'Fußboden höher (Split-Level)', flaeche: A, hoehe: -v });
  }
  if (!s.subtract) {
    for (const r of storey.shapes) {
      if (r.kind !== 'room' || r.subtract || r.points.length < 3) continue;
      const tiefe = v - (r.versatz ?? 0);
      if (tiefe <= 1e-9 || !pointInPolygon(labelPoint(r.points), s.points)) continue;
      out.push({ art: 'absenkung', bezeichnung: `Absenkung ${raumText(r)}`, flaeche: polygonArea(r.points), hoehe: tiefe, raumId: r.id });
    }
  }
  const sohle = storey.sohle ?? 0;
  if (sohle > 1e-9) {
    const frei = sohlenFlaeche(s, storey, project);
    if (frei > 1e-6) out.push({ art: 'sohle', bezeichnung: 'Bodenplatte (UK Sohle bis Fußboden)', flaeche: frei, hoehe: sohle });
  }
  return out;
}

function raumText(r: RoomShape) {
  return [r.nummer, r.name].filter(Boolean).join(' ') || 'Raum';
}

/** Teil eines Umrisses, unter dem kein Geschoss (mit BGF) liegt – dort sitzt die Bodenplatte */
export function sohlenFlaeche(s: OutlineShape, storey: Storey, project: Project): number {
  return areaMP(sohlenPolygon(s, storey, project));
}

/** Grundriss der Bodenplatte unter einem Umriss (Teil ohne Geschoss darunter) – schmale Reststreifen entfallen */
export function sohlenPolygon(s: OutlineShape, storey: Storey, project: Project): MultiPolygon {
  const elev = storeyElevations(project);
  const floorZ = elev[project.storeys.indexOf(storey)] ?? 0;
  // nächstes Geschoss darunter (nach Höhe)
  let below = -1;
  elev.forEach((e, i) => {
    if (e < floorZ - 1e-6 && (below < 0 || e > elev[below])) below = i;
  });
  const ganz = unionAll([s.points]);
  if (below < 0) return ganz;
  const unten = project.storeys[below].shapes.filter((x): x is OutlineShape => x.kind === 'outline');
  const plus = unionAll(unten.filter((x) => !x.subtract).map((x) => x.points));
  if (!plus.length) return ganz;
  try {
    const decke = diffMP(plus, unionAll(unten.filter((x) => x.subtract).map((x) => x.points)));
    const frei = diffMP(ganz, decke);
    // schmale Streifen aus leicht abweichend gezeichneten Umrissen zählen nicht (≤ UMRISS_TOLERANZ breit)
    return areaMP(frei) < sliverGrenze(s.points) ? [] : frei;
  } catch {
    return ganz;
  }
}

/** Fläche eines Randstreifens mit UMRISS_TOLERANZ Breite – darunter gilt eine Restfläche als Zeichenungenauigkeit */
function sliverGrenze(pts: Point[]): number {
  let u = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    u += Math.hypot(b.x - a.x, b.y - a.y);
  }
  return u * UMRISS_TOLERANZ;
}

/** Rauminhalt eines BGF-Umrisses (ohne Vorzeichen): Körper über dem Fußboden + Unterbau (Split-Level, Bodenplatte) */
export function outlineVolume(s: OutlineShape, storey: Storey, project: Project): number {
  const unten = unterbau(s, storey, project).reduce((a, t) => a + t.flaeche * t.hoehe, 0);
  return Math.max(0, koerperVolume(s, storey, project) + unten);
}

export function computeStorey(storey: Storey, project: Project): StoreyResult {
  const t = emptyTotals();
  const rooms: RoomResult[] = [];

  for (const s of storey.shapes) {
    const sign = s.subtract ? -1 : 1;
    const a = sign * (s.kind === 'room' ? roomArea(s) : polygonArea(s.points));
    if (s.kind === 'outline') {
      addRS(t.bgf, s.umschliessung, a);
      addRS(t.bri, s.umschliessung, sign * outlineVolume(s, storey, project));
    } else {
      t.nutzung[s.nutzung] += a;
      const bereich = nutzungInfo(s.nutzung).bereich;
      addRS(bereich === 'NUF' ? t.nuf : bereich === 'TF' ? t.tf : t.vf, s.umschliessung, a);
      addRS(t.nrf, s.umschliessung, a);
      const f = woflFaktor(s.wofl, project.settings);
      const woflArea = a * f;
      t.wofl += woflArea;
      rooms.push({
        shapeId: s.id,
        storeyId: storey.id,
        storeyName: storey.name,
        nummer: s.nummer,
        name: s.name,
        nutzung: s.nutzung,
        umschliessung: s.umschliessung,
        subtract: s.subtract,
        area: a,
        woflKategorie: s.wofl.kategorie,
        woflFaktor: f,
        woflArea,
        wohnung: s.wofl.wohnung.trim(),
      });
    }
  }

  t.kgf = { R: t.bgf.R - t.nrf.R, S: t.bgf.S - t.nrf.S, total: t.bgf.total - t.nrf.total };
  return { storeyId: storey.id, name: storey.name, hoehe: storey.hoehe, rooms, ...t };
}

function accumulate(target: AreaTotals, s: AreaTotals) {
  for (const k of ['bgf', 'bri', 'nuf', 'tf', 'vf', 'nrf', 'kgf'] as const) {
    target[k].R += s[k].R;
    target[k].S += s[k].S;
    target[k].total += s[k].total;
  }
  for (const k of Object.keys(target.nutzung) as Nutzungsgruppe[]) target.nutzung[k] += s.nutzung[k];
  target.wofl += s.wofl;
}

export function computeProject(project: Project): ProjectResult {
  const storeys = project.storeys.map((s) => computeStorey(s, project));
  const total = emptyTotals();
  for (const s of storeys) accumulate(total, s);

  const map = new Map<string, WohnungResult>();
  for (const st of storeys) {
    for (const r of st.rooms) {
      if (r.woflKategorie === 'keine') continue;
      const key = r.wohnung || '(ohne Zuordnung)';
      let w = map.get(key);
      if (!w) {
        w = { wohnung: key, wofl: 0, grundflaeche: 0, rooms: [] };
        map.set(key, w);
      }
      w.wofl += r.woflArea;
      w.grundflaeche += r.area;
      w.rooms.push(r);
    }
  }
  const wohnungen = [...map.values()].sort((a, b) => a.wohnung.localeCompare(b.wohnung, 'de', { numeric: true }));
  return { storeys, total, wohnungen };
}
