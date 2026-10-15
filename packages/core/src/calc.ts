import type { Point } from './geometry';
import { distanceToEdges, labelPoint, pointInPolygon, polygonArea } from './geometry';
import type { Nutzungsgruppe, OutlineShape, Project, Raumumschliessung, RoomShape, Storey, WoflKategorie } from './model';
import type { MultiPolygon } from './polygon';
import { areaMP, diffMP, intersectMP, oeffnen, unionAll } from './polygon';
import { roomArea, storeyElevations } from './model';
import { gaubenVolumen } from './gaube';
import { roofStats } from './roof';
import { meshRoofStats } from './roofMesh';
import { nutzungInfo, woflFaktor } from './norms';

/**
 * Flächen- und Rauminhaltsberechnung.
 *
 *  BGF  = Σ Umrissflächen (R/S getrennt), Abzugsflächen negativ
 *  BRI  = Σ Umrissfläche × Höhe (Geschosshöhe oder Körperhöhe je Umriss)
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
 * Dach aus Modell: Fußbodenhöhe (Unterkante des Körpers, mit Höhenversatz) und Höhenbegrenzung eines Umrisses.
 * Ohne feste Begrenzung (maxHoehe) reicht der Körper bis zum Fußboden des nächsten Geschosses –
 * aber nur dort, wo dieses Geschoss BGF hat (Umriss, abzüglich Abzugsflächen). Sonst bis zur Dachhaut:
 * so wird z. B. die Dachspitze über einem DG erfasst, auch wenn sie als eigenes Geschoss ohne BGF modelliert ist.
 */
/** größte Abweichung [m], bis zu der Umrisse übereinanderliegender Geschosse als deckungsgleich gelten */
export const UMRISS_TOLERANZ = 0.02;

export function modellRoofParams(project: Project, storey: Storey, s: OutlineShape): { floorZ: number; cap: number | ((p: Point) => number) } {
  const elev = storeyElevations(project);
  const idx = project.storeys.indexOf(storey);
  const geschossZ = elev[idx] ?? 0;
  // der Höhenversatz verschiebt den ganzen Körper: Höhen gelten ab seiner Unterkante, die Dachhaut bleibt, wo sie ist
  const floorZ = geschossZ + (s.versatz ?? 0);
  if (s.dach?.maxHoehe !== undefined) return { floorZ, cap: s.dach.maxHoehe };
  if (storey.geschosshoeheBegrenzt) return { floorZ, cap: s.hoehe ?? storey.hoehe };
  // nächstes Geschoss darüber (nach Höhe, nicht nach Listenreihenfolge)
  let above = -1;
  elev.forEach((e, i) => {
    if (e > geschossZ + 1e-6 && (above < 0 || e < elev[above])) above = i;
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

/** Rauminhalt des Körpers eines BGF-Umrisses (ohne Vorzeichen): Fläche × Körperhöhe bzw. bis zur Dachhaut – unabhängig vom Höhenversatz */
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

/** Teil des Rauminhalts unterhalb der Unterkante des Körpers */
export interface UnterbauTeil {
  art: 'absenkung' | 'sohle';
  bezeichnung: string;
  flaeche: number;
  hoehe: number;
  /** Raum, dessen Absenkung gemeint ist */
  raumId?: string;
}

/** Beschriftungspunkt je Punktliste (teuer; Punktlisten sind unveränderlich) */
const labelCache = new WeakMap<readonly Point[], Point>();
function labelVon(pts: readonly Point[]): Point {
  let p = labelCache.get(pts);
  if (!p) {
    p = labelPoint(pts);
    labelCache.set(pts, p);
  }
  return p;
}

/**
 * Rauminhalt unter dem Körper eines BGF-Umrisses (DIN 277: BRI ab Unterseite der konstruktiven Sohle):
 *  - absenkung: Räume im Umriss liegen tiefer als dessen Fußboden (Split-Level) → Raumfläche (Polygon) × Absenkung
 *  - sohle:     Bodenplatte des Geschosses → Teil des Umrisses ohne Geschoss darunter × Sohlendicke
 * Beides zählt nur dort, wo kein Geschoss darunter liegt: Über einem Keller verschiebt ein tiefer liegender
 * Fußboden nur die Grenze zwischen den Geschossen – der Rauminhalt steckt bereits im Geschoss darunter
 * (es reicht bis zum Fußboden des Geschosses darüber).
 * Ein Höhenversatz des Umrisses verschiebt den ganzen Körper und ändert seinen Rauminhalt nicht; Absenkungen
 * und Bodenplatte liegen unter seiner Unterkante.
 */
export function unterbau(s: OutlineShape, storey: Storey, project: Project): UnterbauTeil[] {
  const out: UnterbauTeil[] = [];
  const v = s.versatz ?? 0;
  const absenkungen: { r: RoomShape; tiefe: number }[] = [];
  if (!s.subtract) {
    for (const r of storey.shapes) {
      if (r.kind !== 'room' || r.subtract || r.points.length < 3) continue;
      // ohne eigene Höhenlage liegt der Raum auf dem Fußboden des Umrisses
      const tiefe = v - (r.versatz ?? v);
      if (tiefe <= 1e-9 || !pointInPolygon(labelVon(r.points), s.points)) continue;
      absenkungen.push({ r, tiefe });
    }
  }
  const sohle = storey.sohle ?? 0;
  if (!absenkungen.length && sohle <= 1e-9) return out;
  const frei = sohlenPolygon(s, storey, project);
  const freiFlaeche = areaMP(frei);
  for (const { r, tiefe } of absenkungen) {
    const f = freiFlaeche > 1e-6 ? flaecheImFreien(r.points, frei) : 0;
    if (f > 1e-6) out.push({ art: 'absenkung', bezeichnung: `Absenkung ${raumText(r)}`, flaeche: f, hoehe: tiefe, raumId: r.id });
  }
  if (sohle > 1e-9 && freiFlaeche > 1e-6) out.push({ art: 'sohle', bezeichnung: 'Bodenplatte (UK Sohle bis Fußboden)', flaeche: freiFlaeche, hoehe: sohle });
  return out;
}

const freiCache = new WeakMap<readonly Point[], { frei: MultiPolygon; f: number }>();

/** Höhenlage des Fußbodens eines Raums gegenüber dem Geschoss: eigene Angabe, sonst die des Umrisses, in dem er liegt */
export function raumBodenVersatz(r: RoomShape, storey: Storey): number {
  if (r.versatz !== undefined) return r.versatz;
  if (r.points.length < 3) return 0;
  const p = labelVon(r.points);
  const o = storey.shapes.find((s): s is OutlineShape => s.kind === 'outline' && !s.subtract && pointInPolygon(p, s.points));
  return o?.versatz ?? 0;
}

/** Teil eines Raums ohne Geschoss darunter (zwischengespeichert je Raumgeometrie und Bodenplatten-Grundriss) */
function flaecheImFreien(pts: Point[], frei: MultiPolygon): number {
  const c = freiCache.get(pts);
  if (c && c.frei === frei) return c.f;
  let f: number;
  try {
    f = areaMP(intersectMP(unionAll([pts]), frei));
  } catch {
    f = polygonArea(pts);
  }
  freiCache.set(pts, { frei, f });
  return f;
}

function raumText(r: RoomShape) {
  return [r.nummer, r.name].filter(Boolean).join(' ') || 'Raum';
}

/** Teil eines Umrisses, unter dem kein Geschoss (mit BGF) liegt – dort sitzt die Bodenplatte */
export function sohlenFlaeche(s: OutlineShape, storey: Storey, project: Project): number {
  return areaMP(sohlenPolygon(s, storey, project));
}

/**
 * Zwischenspeicher je Umriss: Das Ergebnis hängt nur vom Umriss, seiner Fußbodenhöhe und den Umrissen des Geschosses
 * darunter ab. Flächen und Flächenlisten sind unveränderlich – gleiche Objekte heißen gleicher Inhalt.
 */
const sohlenCache = new WeakMap<OutlineShape, { floorZ: number; unten: Storey['shapes'] | null; untenZ: number; mp: MultiPolygon }>();

/** Grundriss der Bodenplatte unter einem Umriss (Teil ohne Geschoss darunter) – schmale Reststreifen entfallen */
export function sohlenPolygon(s: OutlineShape, storey: Storey, project: Project): MultiPolygon {
  const elev = storeyElevations(project);
  const floorZ = elev[project.storeys.indexOf(storey)] ?? 0;
  const below = geschossDarunter(elev, floorZ);
  const unten = below < 0 ? null : project.storeys[below].shapes;
  const untenZ = below < 0 ? 0 : elev[below];
  const c = sohlenCache.get(s);
  if (c && c.floorZ === floorZ && c.unten === unten && c.untenZ === untenZ) return c.mp;
  const mp = sohlenPolygonRechnen(s, unten);
  sohlenCache.set(s, { floorZ, unten, untenZ, mp });
  return mp;
}

/** nächstes Geschoss darunter (nach Höhe), -1 wenn keins */
function geschossDarunter(elev: number[], floorZ: number): number {
  let below = -1;
  elev.forEach((e, i) => {
    if (e < floorZ - 1e-6 && (below < 0 || e > elev[below])) below = i;
  });
  return below;
}

function sohlenPolygonRechnen(s: OutlineShape, untenShapes: Storey['shapes'] | null): MultiPolygon {
  const ganz = unionAll([s.points]);
  if (!untenShapes) return ganz;
  const unten = untenShapes.filter((x): x is OutlineShape => x.kind === 'outline');
  const plus = unionAll(unten.filter((x) => !x.subtract).map((x) => x.points));
  if (!plus.length) return ganz;
  try {
    const decke = diffMP(plus, unionAll(unten.filter((x) => x.subtract).map((x) => x.points)));
    // schmale Streifen aus leicht abweichend gezeichneten Umrissen zählen nicht (≤ 2 · UMRISS_TOLERANZ breit),
    // auch wenn sie an eine echte nicht unterkellerte Fläche anschließen
    return oeffnen(diffMP(ganz, decke), UMRISS_TOLERANZ);
  } catch {
    return ganz;
  }
}

/** Rauminhalt eines BGF-Umrisses (ohne Vorzeichen): Körper + Unterbau (Split-Level-Absenkungen, Bodenplatte) */
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
