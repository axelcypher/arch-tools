import { modellRoofParams } from '@core/calc';
import { gelaendeAmUmfang, gelaendeHoeheFn } from '@core/gelaende';
import type { MultiPolygon } from '@core/polygon';
import { areaMP, diffMP, inMP, intersectMP, ringsOf, unionAll, unionMP } from '@core/polygon';
import { gaubenHoeheAt } from '@core/gaube';
import type { Point } from '@core/geometry';
import { bounds, pointInPolygon } from '@core/geometry';
import type {
  BauNVOFassung,
  BauOFassung,
  Einstufung,
  LageplanNutzung,
  MassNutzung,
  OutlineShape,
  Project,
  RoomShape,
  Storey,
  Versiegelung,
} from '@core/model';
import { storeyElevations } from '@core/model';
import { roofFrame, roofHeightFn } from '@core/roof';
import { meshRoofHeightAt } from '@core/roofMesh';

/**
 * Maß der baulichen Nutzung: GRZ, GFZ und Vollgeschosse nach dem Recht, das für den Bebauungsplan gilt
 * (siehe docs/grz-gfz.md). Grundlage: Gebäude und Geschosse aus dem gemeinsamen Projektformat,
 * der Lageplan aus project.lageplan.
 *
 *  - BauNVO: 1962 (bis 31.12.1968), 1968/1977 (bis 26.01.1990), 1990 ff. – Bundesrecht
 *  - Vollgeschoss: statische Verweisung auf die Bauordnung NRW zum Zeitpunkt des Plans
 *    (BauO NW 1962/1970 bis 1984, BauO NW 1984/1995/BauO NRW 2000 bis 2018, BauO NRW 2018)
 *  - Grundfläche als Überdeckung (Polygon-Vereinigung), nicht als Summe
 */

export const BAUNVO_FASSUNGEN: { id: BauNVOFassung; label: string; zeitraum: string }[] = [
  { id: '1962', label: 'BauNVO 1962', zeitraum: '01.08.1962 – 31.12.1968' },
  { id: '1968', label: 'BauNVO 1968/1977', zeitraum: '01.01.1969 – 26.01.1990' },
  { id: '1990', label: 'BauNVO 1990 ff.', zeitraum: 'ab 27.01.1990' },
];

export const BAUO_FASSUNGEN: { id: BauOFassung; label: string; zeitraum: string }[] = [
  { id: 'nw1962', label: 'BauO NW 1962/1970', zeitraum: '01.10.1962 – 31.12.1984' },
  { id: 'nw1985', label: 'BauO NW 1984/1995, BauO NRW 2000', zeitraum: '01.01.1985 – 31.12.2018' },
  { id: 'nrw2019', label: 'BauO NRW 2018', zeitraum: 'ab 01.01.2019' },
];

export const baunvoLabel = (f: BauNVOFassung) => BAUNVO_FASSUNGEN.find((x) => x.id === f)?.label ?? f;
export const bauoLabel = (f: BauOFassung) => BAUO_FASSUNGEN.find((x) => x.id === f)?.label ?? f;

export interface Recht {
  baunvo: BauNVOFassung;
  bauo: BauOFassung;
  /** aus dem Plandatum abgeleitet (sonst übersteuert oder aktuelles Recht) */
  ausDatum: boolean;
  hinweise: string[];
}

/** Welche Fassungen gelten? Aus dem Plandatum, übersteuerbar; ohne Datum aktuelles Recht (§ 34/35 BauGB). */
export function recht(m: MassNutzung | undefined): Recht {
  const hinweise: string[] = [];
  const d = m?.planDatum && /^\d{4}-\d{2}-\d{2}$/.test(m.planDatum) ? m.planDatum : undefined;
  let baunvo: BauNVOFassung = '1990';
  let bauo: BauOFassung = 'nrw2019';
  if (d) {
    baunvo = d < '1969-01-01' ? '1962' : d < '1990-01-27' ? '1968' : '1990';
    bauo = d < '1985-01-01' ? 'nw1962' : d < '2019-01-01' ? 'nw1985' : 'nrw2019';
    if (d < '1962-08-01') hinweise.push('Plan vor Inkrafttreten der BauNVO 1962: Maßfestsetzungen nach damaligem Recht prüfen.');
    if (d < '1962-10-01') hinweise.push('Plan vor der BauO NW 1962: Vollgeschossbegriff nach damaligem Recht prüfen.');
  } else hinweise.push('Ohne Plandatum gilt das aktuelle Recht (z. B. Vorhaben nach § 34 oder § 35 BauGB).');
  if (m?.baunvo) baunvo = m.baunvo;
  if (m?.bauo) bauo = m.bauo;
  return { baunvo, bauo, ausDatum: !!d && !m?.baunvo && !m?.bauo, hinweise };
}

/* ---------- Anrechnung der Lageplan-Flächen auf die Grundfläche ---------- */

/**
 * hauptanlage: wie das Gebäude · grz2: GRZ II (§ 19 Abs. 4 BauNVO 1990) · garage01: bis 0,1 der
 * Grundstücksfläche anrechnungsfrei (§ 21a Abs. 3 BauNVO 1968/77) · nein · pruefen: die Fassung regelt es nicht eindeutig
 */
export type Anrechnung = 'hauptanlage' | 'grz2' | 'garage01' | 'nein' | 'pruefen';

const REGELN: Record<BauNVOFassung, Record<LageplanNutzung, Anrechnung>> = {
  '1962': {
    zufahrt: 'pruefen',
    stellplatz: 'pruefen',
    // § 19 Abs. 5: Garagen nur in Kern-, Gewerbe- und Industriegebieten anrechnungsfrei
    garage: 'hauptanlage',
    terrasse: 'pruefen',
    weg: 'pruefen',
    nebenanlage: 'nein', // § 19 Abs. 4
    unterirdisch: 'pruefen',
    garten: 'nein',
    sonstige: 'pruefen',
  },
  '1968': {
    zufahrt: 'pruefen',
    stellplatz: 'pruefen', // § 21a Abs. 3 nennt nur überdachte Stellplätze
    garage: 'garage01', // § 21a Abs. 3
    terrasse: 'nein', // § 19 Abs. 4
    weg: 'pruefen',
    nebenanlage: 'nein', // § 19 Abs. 4
    unterirdisch: 'pruefen',
    garten: 'nein',
    sonstige: 'pruefen',
  },
  '1990': {
    zufahrt: 'grz2', // § 19 Abs. 4: Stellplätze mit ihren Zufahrten
    stellplatz: 'grz2',
    garage: 'grz2',
    terrasse: 'pruefen',
    weg: 'pruefen',
    nebenanlage: 'grz2',
    unterirdisch: 'grz2',
    garten: 'nein',
    sonstige: 'pruefen',
  },
};

export function anrechnungRegel(n: LageplanNutzung, f: BauNVOFassung): Anrechnung {
  return REGELN[f][n];
}

/** Regel mit der Festlegung für offene Fälle */
export function anrechnung(n: LageplanNutzung, f: BauNVOFassung, einstufung?: Partial<Record<LageplanNutzung, Einstufung>>): Anrechnung {
  const r = REGELN[f][n];
  if (r !== 'pruefen') return r;
  const e = einstufung?.[n];
  if (e === 'nein') return 'nein';
  if (e === 'ja') return f === '1990' ? 'grz2' : 'hauptanlage';
  return 'pruefen';
}

/* ---------- Polygone (gemeinsamer Unterbau: überlagernde Flächen zählen nie doppelt) ---------- */

export { areaMP, ringsOf };

/* ---------- Geschosse ---------- */

function outlinesOf(st: Storey): OutlineShape[] {
  return st.shapes.filter((s): s is OutlineShape => s.kind === 'outline');
}

/** Grundriss eines Geschosses (Umrisse abzüglich Abzugsflächen); nurR: ohne Balkone/Loggien/Terrassen (S) */
function geschossFlaeche(st: Storey, nurR: boolean): MultiPolygon {
  const o = outlinesOf(st);
  const plus = unionAll(o.filter((s) => !s.subtract && (!nurR || s.umschliessung === 'R')).map((s) => s.points));
  const minus = unionAll(o.filter((s) => s.subtract).map((s) => s.points));
  return diffMP(plus, minus);
}

/**
 * Höhe bis zur Dachhaut bzw. bis OK Fußboden darüber, gemessen vom Fußboden an dieser Stelle, je Punkt eines
 * Geschosses. Split-Level: Ein Höhenversatz verschiebt den ganzen Körper eines Umrisses (Höhe bleibt); liegt der
 * Fußboden eines Raums tiefer als der Körper, ist die Höhe dort entsprechend größer. Die Höhenfunktionen werden
 * einmal je Umriss aufgebaut.
 */
function hoehenFunktion(project: Project, st: Storey, floorZ: number): (p: Point) => { h: number; schraeg: boolean } | null {
  const raeume = st.shapes.filter((r): r is RoomShape => r.kind === 'room' && !r.subtract && r.versatz !== undefined && r.points.length >= 3);
  const teile = outlinesOf(st)
    .filter((s) => !s.subtract)
    .map((s) => {
      // Höhen ab Unterkante des Körpers
      const hs = s.hoehe ?? st.hoehe;
      const versatz = s.versatz ?? 0;
      const d = s.dach;
      let f: (p: Point) => { h: number; schraeg: boolean };
      if (!d || (d.typ === 'modell' && !project.dachModell)) f = () => ({ h: hs, schraeg: false });
      else if (d.typ === 'modell') {
        const r = modellRoofParams(project, st, s);
        f = (p) => {
          const cap = typeof r.cap === 'function' ? r.cap(p) : r.cap;
          const v = meshRoofHeightAt(project.dachModell!, s.points, floorZ + versatz, p);
          const h = Math.min(Number.isNaN(v) ? hs : Math.max(v, 0), cap);
          return { h, schraeg: h < hs - 0.05 };
        };
      } else {
        const roof = roofHeightFn(d, s.points);
        const fr = d.gauben?.length ? roofFrame(d, s.points) : null;
        f = (p) => ({ h: fr ? Math.max(roof(p), gaubenHoeheAt(d, fr, p)) : roof(p), schraeg: d.typ !== 'flach' });
      }
      return { pts: s.points, f, versatz };
    });
  return (p) => {
    for (const t of teile) {
      if (!pointInPolygon(p, t.pts)) continue;
      const r = t.f(p);
      const raum = raeume.find((x) => pointInPolygon(p, x.points));
      const boden = raum ? raum.versatz! : t.versatz;
      return { h: r.h + t.versatz - boden, schraeg: r.schraeg };
    }
    return null;
  };
}

export type GelaendeQuelle = 'festgelegt' | 'modell' | 'lageplan' | 'annahme';

export interface VollgeschossPruefung {
  storeyId: string;
  name: string;
  /** Geländeoberfläche entlang der Außenwände dieses Geschosses (über ±0,00) */
  gelaende: { mittel: number; min: number; max: number; quelle: GelaendeQuelle };
  /** Deckenoberkante über der Geländeoberfläche im Mittel [m] */
  ueberGelaende: number;
  oberirdisch: boolean;
  /** Anteil der Bezugsfläche mit der geforderten Höhe (0 … 1) */
  anteil: number;
  /** geforderter Anteil (z. B. 0,75) */
  anteilSoll: number;
  /** geforderte Höhe [m] und ob lichte Höhe (sonst bis OK Dachhaut/Fußboden darüber) */
  hoeheSoll: number;
  licht: boolean;
  bezug: 'eigene' | 'darunter';
  /** Fläche mit der geforderten Höhe [m²] */
  flaecheHoch: number;
  flaeche: number;
  bezugsflaeche: number;
  automatisch: boolean;
  vollgeschoss: boolean;
  begruendung: string;
}

/* ---------- Aufenthaltsräume ---------- */

const AUFENTHALT = /zimmer|wohn|schlaf|kind|arbeit|büro|buero|küche|kueche|essen|ess(zimmer|platz)|gäste|gaeste|hobby|studio|atelier|spiel|galerie/i;
const TREPPE = /treppe|treppenhaus|\btr\b/i;

/** Aufenthaltsraum nach BauNVO vor 1990? Aus der Angabe am Raum, sonst aus Raumname und Nutzungsgruppe. */
export function istAufenthaltsraum(r: RoomShape): 'ja' | 'nein' | 'treppe' {
  if (r.aufenthalt) return r.aufenthalt;
  if (TREPPE.test(r.name)) return 'treppe';
  if (AUFENTHALT.test(r.name)) return 'ja';
  if (/bad|wc|dusche|abstell|keller|technik|heiz|hwr|wasch|garage|lager|speicher|spitzboden/i.test(r.name)) return 'nein';
  return r.nutzung === 'NUF1' || r.nutzung === 'NUF2' ? 'ja' : 'nein';
}

/** Anforderung der Bauordnung an die lichte Höhe von Aufenthaltsräumen */
export interface AufenthaltAnforderung {
  /** geforderte lichte Höhe [m] */
  hoehe: number;
  /** über welchen Anteil der Raumfläche (0 … 1) */
  anteil: number;
  /** Raumteile unter dieser lichten Höhe bleiben außer Betracht (BauO NRW: 1,50 m im Dachraum) */
  ohneUnter: number;
  text: string;
}

/**
 * Lichte Höhe von Aufenthaltsräumen nach der maßgebenden Bauordnung:
 *  - BauO NW 1962/1970 (§ 59): 2,50 m, in Einfamilienhäusern und im Dachraum 2,30 m
 *  - BauO NRW 2000/2018 (§ 48 bzw. § 46): 2,40 m; im Dachraum und Kellergeschoss 2,20 m über mindestens die
 *    Hälfte der Netto-Raumfläche, Raumteile bis 1,50 m bleiben außer Betracht; Wohngebäude der
 *    Gebäudeklassen 1 und 2: 2,30 m kann gestattet werden
 */
export function aufenthaltAnforderung(bauo: BauOFassung, o: { dachraumOderKeller: boolean; kleinesWohngebaeude: boolean }): AufenthaltAnforderung {
  if (bauo === 'nw1962') {
    const h = o.dachraumOderKeller || o.kleinesWohngebaeude ? 2.3 : 2.5;
    return { hoehe: h, anteil: o.dachraumOderKeller ? 2 / 3 : 0.95, ohneUnter: 0, text: `lichte Höhe ${fmtM(h)} (BauO NW 1962/1970 § 59${o.dachraumOderKeller ? ', Dachraum' : o.kleinesWohngebaeude ? ', Einfamilienhaus' : ''})` };
  }
  if (o.dachraumOderKeller) {
    return { hoehe: 2.2, anteil: 0.5, ohneUnter: 1.5, text: 'lichte Höhe 2,20 m über mindestens die Hälfte der Netto-Raumfläche, Raumteile bis 1,50 m außer Betracht (Dachraum/Kellergeschoss)' };
  }
  const h = o.kleinesWohngebaeude ? 2.3 : 2.4;
  return { hoehe: h, anteil: 0.95, ohneUnter: 0, text: `lichte Höhe ${fmtM(h)}${o.kleinesWohngebaeude ? ' (Wohngebäude Gebäudeklasse 1/2)' : ''}` };
}

export interface RaumPruefung {
  storeyId: string;
  roomId: string;
  name: string;
  /** Vorschlag nach Name und Nutzung */
  nachName: 'ja' | 'nein' | 'treppe';
  anforderung: AufenthaltAnforderung;
  /** Anteil der (maßgebenden) Raumfläche mit der geforderten lichten Höhe */
  anteil: number;
  /** größte lichte Höhe im Raum [m] */
  maxHoehe: number;
  erfuellt: boolean;
  /** Ergebnis: Angabe am Raum, sonst Vorschlag (Aufenthaltsraum nur, wenn die lichte Höhe erfüllt ist) */
  ergebnis: 'ja' | 'nein' | 'treppe';
  automatisch: boolean;
  begruendung: string;
}

/** Räume eines Geschosses nach Nutzung und lichter Höhe prüfen */
/** Zwischenspeicher je Geschoss: hängt von Geschossen, Dachmodell und den Prüfparametern ab */
const raeumeCache = new WeakMap<Storey, { storeys: Storey[]; dach: Project['dachModell']; schluessel: string; out: RaumPruefung[] }>();

function raeumePruefen(project: Project, st: Storey, floorZ: number, bauo: BauOFassung, aufbau: number, keller: boolean, kleinesWohngebaeude: boolean): RaumPruefung[] {
  const schluessel = [floorZ, bauo, aufbau, keller, kleinesWohngebaeude].join('|');
  const c = raeumeCache.get(st);
  if (c && c.storeys === project.storeys && c.dach === project.dachModell && c.schluessel === schluessel) return c.out;
  const out = raeumePruefenRechnen(project, st, floorZ, bauo, aufbau, keller, kleinesWohngebaeude);
  raeumeCache.set(st, { storeys: project.storeys, dach: project.dachModell, schluessel, out });
  return out;
}

function raeumePruefenRechnen(project: Project, st: Storey, floorZ: number, bauo: BauOFassung, aufbau: number, keller: boolean, kleinesWohngebaeude: boolean): RaumPruefung[] {
  const hoehe = hoehenFunktion(project, st, floorZ);
  return st.shapes
    .filter((r): r is RoomShape => r.kind === 'room' && !r.subtract && r.points.length >= 3)
    .map((r) => {
      const b = bounds(r.points);
      const res = Math.max(0.1, Math.sqrt((b.maxX - b.minX) * (b.maxY - b.minY)) / 40);
      const hs: { h: number; schraeg: boolean }[] = [];
      for (let y = b.minY + res / 2; y < b.maxY; y += res) {
        for (let x = b.minX + res / 2; x < b.maxX; x += res) {
          const p = { x, y };
          if (!pointInPolygon(p, r.points)) continue;
          const v = hoehe(p);
          // lichte Höhe: bis UK Decke bzw. Dachhaut abzüglich Aufbau
          if (v) hs.push({ h: v.h - aufbau, schraeg: v.schraeg });
        }
      }
      const dach = hs.some((x) => x.schraeg);
      const anf = aufenthaltAnforderung(bauo, { dachraumOderKeller: dach || keller, kleinesWohngebaeude });
      const massgebend = hs.filter((x) => x.h >= anf.ohneUnter - 1e-9);
      const anteil = massgebend.length ? massgebend.filter((x) => x.h >= anf.hoehe - 1e-9).length / massgebend.length : 0;
      const erfuellt = hs.length > 0 && anteil >= anf.anteil - 1e-9;
      const nachName = istAufenthaltsraum({ ...r, aufenthalt: undefined });
      const vorschlag = nachName === 'ja' && !erfuellt ? 'nein' : nachName;
      const ergebnis = r.aufenthalt ?? vorschlag;
      const maxHoehe = hs.length ? Math.max(...hs.map((x) => x.h)) : 0;
      const name = [r.nummer, r.name].filter(Boolean).join(' ') || 'Raum';
      const begruendung = r.aufenthalt
        ? 'festgelegt'
        : nachName === 'ja'
          ? erfuellt
            ? `Aufenthaltsraum nach Nutzung; ${anf.text} auf ${pct(anteil)} erfüllt`
            : `nach Nutzung Aufenthaltsraum, aber ${anf.text} nur auf ${pct(anteil)} – kein Aufenthaltsraum im Sinne der Bauordnung`
          : nachName === 'treppe'
            ? 'Treppenraum'
            : 'kein Aufenthaltsraum nach Nutzung';
      return { storeyId: st.id, roomId: r.id, name, nachName, anforderung: anf, anteil, maxHoehe, erfuellt, ergebnis, automatisch: !r.aufenthalt, begruendung };
    });
}

/**
 * Fläche der Aufenthaltsräume einschließlich zugehöriger Treppenräume und ihrer Umfassungswände:
 * Räume um die Wanddicke erweitert (Raster 5 cm), begrenzt auf den Geschossgrundriss.
 */
/** Zwischenspeicher je Geschoss (unveränderlich): Wandzuschlag und gezählte Räume als Schlüssel */
const aufenthaltCache = new WeakMap<Storey, { schluessel: string; flaeche: number }>();

function aufenthaltsFlaeche(st: Storey, grundriss: MultiPolygon, wand: number, pruefung: RaumPruefung[]): number {
  const schluessel = `${wand}|${pruefung
    .filter((x) => x.ergebnis !== 'nein')
    .map((x) => x.roomId)
    .sort()
    .join(',')}`;
  const c = aufenthaltCache.get(st);
  if (c && c.schluessel === schluessel) return c.flaeche;
  const flaeche = aufenthaltsFlaecheRechnen(st, grundriss, wand, pruefung);
  aufenthaltCache.set(st, { schluessel, flaeche });
  return flaeche;
}

function aufenthaltsFlaecheRechnen(st: Storey, grundriss: MultiPolygon, wand: number, pruefung: RaumPruefung[]): number {
  const zaehlt = new Set(pruefung.filter((x) => x.ergebnis !== 'nein').map((x) => x.roomId));
  const rooms = st.shapes.filter((s): s is RoomShape => s.kind === 'room' && zaehlt.has(s.id));
  if (!rooms.length || !grundriss.length) return 0;
  const b = bounds(ringsOf(grundriss).flat());
  const res = 0.05;
  const w = Math.ceil((b.maxX - b.minX) / res) + 1;
  const h = Math.ceil((b.maxY - b.minY) / res) + 1;
  const cell = (i: number, j: number) => ({ x: b.minX + (i + 0.5) * res, y: b.minY + (j + 0.5) * res });
  const raum = new Uint8Array(w * h);
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) if (rooms.some((r) => pointInPolygon(cell(i, j), r.points))) raum[j * w + i] = 1;
  // Wandzuschlag: Abstand zum nächsten Raum ≤ wand
  const k = Math.max(0, Math.round(wand / res));
  const disk: [number, number][] = [];
  for (let dy = -k; dy <= k; dy++) for (let dx = -k; dx <= k; dx++) if (dx * dx + dy * dy <= k * k) disk.push([dx, dy]);
  const erweitert = new Uint8Array(w * h);
  for (let j = 0; j < h; j++)
    for (let i = 0; i < w; i++) {
      if (!raum[j * w + i]) continue;
      for (const [dx, dy] of disk) {
        const x = i + dx;
        const y = j + dy;
        if (x >= 0 && y >= 0 && x < w && y < h) erweitert[y * w + x] = 1;
      }
    }
  let n = 0;
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) if (erweitert[j * w + i] && inMP(cell(i, j), grundriss)) n++;
  return n * res * res;
}

/* ---------- Nachweis ---------- */

export type Status = 'ok' | 'ueberschritten' | 'pruefen' | 'offen';

export interface Kennzahl {
  wert: number;
  /** mit den noch offenen („prüfen“) Flächen */
  mitOffenen?: number;
  zulaessig?: number;
  /** Fläche, die noch zulässig wäre [m²] (negativ bei Überschreitung) */
  reserve?: number;
  status: Status;
}

export interface LageplanPosten {
  id: string;
  name: string;
  nutzung: LageplanNutzung;
  versiegelung: Versiegelung;
  flaeche: number;
  /** davon außerhalb des Gebäudes */
  flaecheAussen: number;
  /**
   * davon nur dieser Fläche zugeordnet: ohne Gebäude und ohne Teile, die eine andere Fläche mit höherem Rang
   * (Anrechnung) bereits abdeckt – Summen über diese Spalte zählen Überlagerungen nie doppelt
   */
  flaecheEindeutig: number;
  /** Fläche, die andere Lageplan-Flächen schon abdecken [m²] */
  ueberlagert: number;
  anrechnung: Anrechnung;
  /** Regel ohne Festlegung (für die Anzeige „prüfen“) */
  regel: Anrechnung;
  nachbar: boolean;
}

export interface Nachweis {
  recht: Recht;
  grundstueck: { flaeche?: number; ausLageplan?: number; quelle: 'projektdaten' | 'lageplan' | 'fehlt' };
  /** Geländeoberfläche im Mittel rund um das Gebäude */
  gelaende: { hoehe: number; quelle: GelaendeQuelle; min?: number; max?: number };
  hauptanlage: number;
  hauptanlagePolygone: Point[][];
  grundstueckPolygone: Point[][];
  /** GRZ I bzw. GRZ (vor 1990) */
  grz: Kennzahl;
  /** nur BauNVO 1990 ff. */
  grz2?: Kennzahl;
  /** 1968/77: anrechnungsfreie Garagenfläche */
  garagenFrei?: number;
  gf: number;
  gfAufenthalt: number;
  gfz: Kennzahl;
  vollgeschosse: { anzahl: number; zulaessig?: number; status: Status };
  geschosse: VollgeschossPruefung[];
  /** Geschossfläche je Geschoss (R-Umrisse der Vollgeschosse bzw. Aufenthaltsräume) */
  gfJeGeschoss: { storeyId: string; name: string; flaeche: number; art: 'vollgeschoss' | 'aufenthalt' | 'keine' }[];
  lageplan: LageplanPosten[];
  /** Räume der Nicht-Vollgeschosse (vor 1990): Aufenthaltsraum nach Nutzung und lichter Höhe */
  raeume: RaumPruefung[];
  /** sich überlagernde Lageplan-Flächen (b liegt teilweise auf a, a wird zuerst gezählt) */
  ueberlagerungen: { a: string; b: string; flaeche: number }[];
  bilanz: { gebaeude: number; voll: number; teil: number; gruen: number; summe: number; differenz?: number };
  hinweise: string[];
}


function kennzahl(flaeche: number, g: number | undefined, zul: number | undefined, mitOffenen?: number): Kennzahl {
  const wert = g ? flaeche / g : 0;
  const mit = mitOffenen !== undefined && g ? mitOffenen / g : undefined;
  let status: Status = 'offen';
  if (g && zul !== undefined) {
    status = wert > zul + 1e-9 ? 'ueberschritten' : mit !== undefined && mit > zul + 1e-9 ? 'pruefen' : 'ok';
  }
  return { wert, mitOffenen: mit !== undefined && Math.abs(mit - wert) > 1e-9 ? mit : undefined, zulaessig: zul, reserve: g && zul !== undefined ? zul * g - flaeche : undefined, status };
}

export function massNachweis(project: Project): Nachweis {
  const m = project.massNutzung ?? {};
  const re = recht(m);
  const hinweise = [...re.hinweise];
  const aufbau = m.dachaufbau ?? 0.3;
  const elev = storeyElevations(project);
  // Geschosse mit BGF (ein „Dach“-Geschoss ohne Umriss ist kein Geschoss im Sinne des Nachweises)
  const geschosse = project.storeys
    .filter((st) => st.shapes.some((s) => s.kind === 'outline' && !s.subtract))
    .map((st) => ({ st, e: elev[project.storeys.indexOf(st)] }))
    .sort((a, b) => a.e - b.e);
  const flaechen = project.lageplan?.flaechen ?? [];
  const eigene = flaechen.filter((f) => !f.nachbar);

  // Grundrisse je Geschoss
  const grundriss = new Map(geschosse.map(({ st }) => [st.id, geschossFlaeche(st, false)]));
  const alleGeschosse = unionMP(...grundriss.values());

  // Geländeoberfläche: festgelegt, sonst aus dem Geländemodell (IFC) bzw. den Lageplan-Flächen mit Höhe –
  // je Geschoss entlang seiner eigenen Außenwände (Hanglage: das Gelände steigt oder fällt am Gebäude)
  const b = ringsOf(alleGeschosse).flat();
  const hFn = gelaendeHoeheFn(project, b.length ? boundsOf(b) : undefined);
  const quelleModell: GelaendeQuelle = project.gelaendeModell ? 'modell' : 'lageplan';
  let gelaende: Nachweis['gelaende'];
  if (m.gelaende !== undefined) gelaende = { hoehe: m.gelaende, quelle: 'festgelegt' };
  else {
    const u = gelaendeAmUmfang(alleGeschosse, hFn);
    // ohne ausreichend Stützstellen (z. B. nur eine Zufahrt) sagt der Lageplan nichts über das Gelände
    if (u && u.abdeckung >= 0.5) gelaende = { hoehe: u.mittel, quelle: quelleModell, min: u.min, max: u.max };
    else {
      gelaende = { hoehe: 0, quelle: 'annahme' };
      hinweise.push('Geländeoberfläche unbekannt: ±0,00 angenommen. Höhe eintragen, das Gelände mit der IFC übernehmen oder den Lageplan rund um das Gebäude mit Flächen (mit Höhe) vervollständigen.');
    }
  }
  const gelaendeVon = (gr: MultiPolygon): VollgeschossPruefung['gelaende'] => {
    if (gelaende.quelle === 'festgelegt' || gelaende.quelle === 'annahme') return { mittel: gelaende.hoehe, min: gelaende.hoehe, max: gelaende.hoehe, quelle: gelaende.quelle };
    const u = gelaendeAmUmfang(gr, hFn);
    if (u && u.abdeckung >= 0.5) return { mittel: u.mittel, min: u.min, max: u.max, quelle: quelleModell };
    return { mittel: gelaende.hoehe, min: gelaende.min ?? gelaende.hoehe, max: gelaende.max ?? gelaende.hoehe, quelle: gelaende.quelle };
  };

  // Vollgeschossprüfung
  const pruefungen: VollgeschossPruefung[] = [];
  geschosse.forEach(({ st, e }, idx) => {
    const gr = grundriss.get(st.id)!;
    const A = areaMP(gr);
    const next = geschosse.slice(idx + 1).find((x) => x.e > e + 1e-6);
    const decke = next ? next.e : e + st.hoehe;
    const gel = gelaendeVon(gr);
    const ueber = decke - gel.mittel;
    // Geschoss darunter: alle Geschosse der nächsttieferen Ebene (gleich hohe Geschosse nebeneinander zählen zusammen)
    const tiefer = geschosse.filter((x) => x.e < e - 1e-6);
    const eUnten = tiefer.length ? Math.max(...tiefer.map((x) => x.e)) : undefined;
    const darunter = eUnten === undefined ? A : areaMP(unionMP(...tiefer.filter((x) => Math.abs(x.e - eUnten) < 1e-6).map((x) => grundriss.get(x.st.id)!)));
    // Höhenraster über dem Grundriss
    const samples = rasterHoehen(project, st, e, gr);
    const schraeg = samples.some((s) => s.schraeg);
    const staffel = eUnten !== undefined && A < darunter - 1 && !schraeg;
    const anteilVon = (soll: number, licht: boolean, bezug: number) => {
      const hoch = samples.filter((s) => (licht ? s.h - aufbau : s.h) >= soll - 1e-9).length * (samples[0]?.zelle ?? 0);
      return { hoch, anteil: bezug > 0 ? hoch / bezug : 0 };
    };
    let p: Omit<VollgeschossPruefung, 'storeyId' | 'name' | 'automatisch' | 'vollgeschoss'> & { vg: boolean };
    if (re.bauo === 'nrw2019') {
      const ob = ueber > 1.6;
      const { hoch, anteil } = anteilVon(2.3, true, darunter);
      p = {
        gelaende: gel,
        ueberGelaende: ueber,
        oberirdisch: ob,
        anteil,
        anteilSoll: 0.75,
        hoeheSoll: 2.3,
        licht: true,
        bezug: 'darunter',
        flaecheHoch: hoch,
        flaeche: A,
        bezugsflaeche: darunter,
        vg: ob && anteil > 0.75,
        begruendung: !ob ? `Decke im Mittel ${fmtM(ueber)} über Gelände (≤ 1,60 m): kein oberirdisches Geschoss` : `lichte Höhe ≥ 2,30 m auf ${pct(anteil)} der Grundfläche des Geschosses darunter (mehr als 75 % gefordert)`,
      };
    } else if (re.bauo === 'nw1985') {
      const ob = ueber > 1.6;
      const bezug = staffel ? darunter : A;
      const soll = staffel ? 2 / 3 : schraeg ? 0.75 : 0;
      const { hoch, anteil } = anteilVon(2.3, false, bezug);
      const vgHoehe = soll === 0 ? samples.length > 0 && samples.every((s) => s.h >= 2.3 - 1e-9) : anteil > soll;
      p = {
        gelaende: gel,
        ueberGelaende: ueber,
        oberirdisch: ob,
        anteil,
        anteilSoll: soll,
        hoeheSoll: 2.3,
        licht: false,
        bezug: staffel ? 'darunter' : 'eigene',
        flaecheHoch: hoch,
        flaeche: A,
        bezugsflaeche: bezug,
        vg: ob && vgHoehe,
        begruendung: !ob
          ? `Decke im Mittel ${fmtM(ueber)} über Gelände (≤ 1,60 m)`
          : staffel
            ? `Staffelgeschoss: Höhe ≥ 2,30 m (bis OK Dachhaut/Fußboden darüber) auf ${pct(anteil)} der Grundfläche darunter (mehr als zwei Drittel gefordert)`
            : schraeg
              ? `geneigte Dachflächen: Höhe ≥ 2,30 m bis OK Dachhaut auf ${pct(anteil)} der eigenen Grundfläche (mehr als drei Viertel gefordert)`
              : `Geschosshöhe ${vgHoehe ? '≥' : '<'} 2,30 m`,
      };
    } else {
      // BauO NW 1962/1970: „vollständig über der festgelegten Geländeoberfläche“ – auch am höchsten Punkt des Geländes
      const vollUeber = e >= gel.max - 0.005;
      const soll = schraeg || m.einfamilienhaus ? 2.3 : 2.5;
      const { hoch, anteil } = anteilVon(soll, true, A);
      const keller = !vollUeber && ueber > 1.4;
      p = {
        gelaende: gel,
        ueberGelaende: ueber,
        oberirdisch: vollUeber,
        anteil,
        anteilSoll: 2 / 3,
        hoeheSoll: soll,
        licht: true,
        bezug: 'eigene',
        flaecheHoch: hoch,
        flaeche: A,
        bezugsflaeche: A,
        vg: vollUeber ? anteil >= 2 / 3 - 1e-9 : keller,
        begruendung: vollUeber
          ? `lichte Höhe ≥ ${fmtM(soll)} auf ${pct(anteil)} der eigenen Grundfläche (mindestens zwei Drittel gefordert)`
          : keller
            ? `Kellergeschoss ragt im Mittel ${fmtM(ueber)} über Gelände (mehr als 1,40 m): wird angerechnet`
            : `nicht vollständig über der Geländeoberfläche (Fußboden ${fmtM(e - gel.max)} unter dem höchsten Geländepunkt), Decke im Mittel ${fmtM(ueber)} darüber: kein Vollgeschoss`,
      };
    }
    const { vg, ...rest } = p;
    pruefungen.push({ ...rest, storeyId: st.id, name: st.name, automatisch: st.vollgeschoss === undefined, vollgeschoss: st.vollgeschoss ?? vg });
  });
  if (re.bauo === 'nw1962') hinweise.push('BauO NW 1962/1970: Geschosse mit mehr als 1,80 m lichter Höhe unterhalb der Traufenoberkante und Garagengeschosse (> 2,00 m über Gelände) werden nicht automatisch angerechnet – bei Bedarf je Geschoss festlegen.');

  // Hauptanlage: oberirdische Geschosse (bzw. nicht vollständig unter Gelände); vor 1990 ohne Balkone usw. (1968/77)
  const oberirdisch = new Set(pruefungen.filter((x) => x.ueberGelaende > 0).map((x) => x.storeyId));
  const hauptTeile = geschosse.filter(({ st }) => oberirdisch.has(st.id)).map(({ st }) => geschossFlaeche(st, re.baunvo === '1968'));
  const haupt = unionMP(...hauptTeile);
  const hauptanlage = areaMP(haupt);
  const unterirdisch = diffMP(unionMP(...geschosse.filter(({ st }) => !oberirdisch.has(st.id)).map(({ st }) => grundriss.get(st.id)!)), haupt);

  // Lageplan-Flächen
  const posten: LageplanPosten[] = flaechen.map((f) => {
    const mp = unionAll([f.points]);
    return {
      id: f.id,
      name: f.name,
      nutzung: f.nutzung,
      versiegelung: f.versiegelung,
      flaeche: areaMP(mp),
      flaecheAussen: areaMP(diffMP(mp, haupt)),
      flaecheEindeutig: 0,
      ueberlagert: 0,
      anrechnung: f.nachbar ? 'nein' : anrechnung(f.nutzung, re.baunvo, m.einstufung),
      regel: f.nachbar ? 'nein' : anrechnungRegel(f.nutzung, re.baunvo),
      nachbar: !!f.nachbar,
    };
  });
  // Überlagerungen eindeutig zuordnen: Flächen nach Rang der Anrechnung, gleiche Ränge in Listenfolge
  const RANG: Record<Anrechnung, number> = { hauptanlage: 0, grz2: 1, garage01: 2, pruefen: 3, nein: 4 };
  const reihenfolge = flaechen
    .map((f, i) => ({ f, i, post: posten[i] }))
    .sort((a, b) => Number(a.post.nachbar) - Number(b.post.nachbar) || RANG[a.post.anrechnung] - RANG[b.post.anrechnung] || a.i - b.i);
  let belegt: MultiPolygon = haupt;
  const ueberlagerungen: Nachweis['ueberlagerungen'] = [];
  for (const { f, post } of reihenfolge) {
    const mp = unionAll([f.points]);
    const rest = diffMP(mp, belegt);
    post.flaecheEindeutig = areaMP(rest);
    post.ueberlagert = Math.max(0, post.flaecheAussen - post.flaecheEindeutig);
    if (post.ueberlagert > 0.05 && !post.nachbar) {
      // mit welchen Flächen?
      for (const g of reihenfolge) {
        if (g.f === f) break;
        if (g.post.nachbar) continue;
        const a = areaMP(intersectMP(diffMP(mp, haupt), unionAll([g.f.points])));
        if (a > 0.05) ueberlagerungen.push({ a: g.f.name || 'Fläche', b: f.name || 'Fläche', flaeche: a });
      }
    }
    belegt = unionMP(belegt, mp);
  }
  if (ueberlagerungen.length) {
    hinweise.push(
      `Lageplan-Flächen überlagern sich (${ueberlagerungen.map((u) => `${u.b} mit ${u.a}: ${fmtA(u.flaeche)}`).join('; ')}). Gerechnet wird jede Stelle nur einmal – mit der Fläche, die stärker angerechnet wird.`,
    );
  }

  const polys = (pred: (p: LageplanPosten) => boolean) => unionAll(flaechen.filter((f) => pred(posten.find((x) => x.id === f.id)!)).map((f) => f.points));
  const unterirdischAnr = anrechnung('unterirdisch', re.baunvo, m.einstufung);

  // Grundstück
  const ausLageplan = eigene.length ? areaMP(unionMP(unionAll(eigene.map((f) => f.points)), alleGeschosse)) : undefined;
  const gProjekt = project.meta.grundstueck.flaeche;
  const G = gProjekt ?? ausLageplan;
  const grundstueck: Nachweis['grundstueck'] = { flaeche: G, ausLageplan, quelle: gProjekt !== undefined ? 'projektdaten' : ausLageplan !== undefined ? 'lageplan' : 'fehlt' };
  if (G === undefined) hinweise.push('Grundstücksfläche fehlt: in den Projektdaten eintragen oder Lageplan-Flächen anlegen.');
  else if (gProjekt !== undefined && ausLageplan !== undefined && Math.abs(gProjekt - ausLageplan) > Math.max(0.5, gProjekt * 0.005)) {
    hinweise.push(`Grundstücksfläche laut Projektdaten ${fmtA(gProjekt)}, Lageplan-Flächen mit Gebäude ${fmtA(ausLageplan)} – Lageplan unvollständig oder Flächen überlappen.`);
  }
  const grundstueckPolygone = eigene.length ? ringsOf(unionMP(unionAll(eigene.map((f) => f.points)), alleGeschosse)) : [];

  // Grundfläche
  let grz: Kennzahl;
  let grz2: Kennzahl | undefined;
  let garagenFrei: number | undefined;
  const offen = polys((p) => p.anrechnung === 'pruefen');
  const unterOffen = unterirdischAnr === 'pruefen' ? unterirdisch : [];
  const anyOffen = areaMP(diffMP(unionMP(offen, unterOffen), haupt)) > 1e-6;
  if (re.baunvo === '1990') {
    const ii = unionMP(haupt, polys((p) => p.anrechnung === 'grz2' || p.anrechnung === 'hauptanlage'), unterirdischAnr === 'grz2' ? unterirdisch : []);
    const iiMit = unionMP(ii, offen, unterOffen);
    grz = kennzahl(hauptanlage, G, m.grz);
    const grz2Max = m.grzIIMax ?? (m.grz !== undefined ? Math.max(m.grz, Math.min(1.5 * m.grz, 0.8)) : undefined);
    grz2 = kennzahl(areaMP(ii), G, grz2Max, anyOffen ? areaMP(iiMit) : undefined);
  } else {
    const gr = unionMP(haupt, polys((p) => p.anrechnung === 'hauptanlage'), unterirdischAnr === 'hauptanlage' ? unterirdisch : []);
    let flaeche = areaMP(gr);
    if (re.baunvo === '1968') {
      const garagen = areaMP(diffMP(polys((p) => p.anrechnung === 'garage01'), gr));
      garagenFrei = G ? Math.min(garagen, 0.1 * G) : garagen;
      flaeche += garagen - garagenFrei;
    }
    const mit = anyOffen ? flaeche + areaMP(diffMP(unionMP(offen, unterOffen), gr)) : undefined;
    grz = kennzahl(flaeche, G, m.grz, mit);
  }
  if (anyOffen) hinweise.push('Einzelne Flächen sind nach der maßgebenden BauNVO-Fassung nicht eindeutig einzustufen („prüfen“). Die GRZ ist ohne und mit ihnen angegeben; die Einstufung lässt sich je Nutzung festlegen.');

  // Geschossfläche
  const vorher1990 = re.baunvo !== '1990';
  const wand = m.wandzuschlag ?? 0.25;
  // Räume der Nicht-Vollgeschosse nach Nutzung und lichter Höhe (nur vor 1990 für die Geschossfläche maßgebend)
  const raeume: RaumPruefung[] = vorher1990
    ? geschosse.flatMap(({ st, e }) => {
        const pr = pruefungen.find((x) => x.storeyId === st.id)!;
        return pr.vollgeschoss ? [] : raeumePruefen(project, st, e, re.bauo, aufbau, !pr.oberirdisch, !!m.einfamilienhaus);
      })
    : [];
  const gfJeGeschoss: Nachweis['gfJeGeschoss'] = geschosse.map(({ st }) => {
    const pr = pruefungen.find((x) => x.storeyId === st.id)!;
    if (pr.vollgeschoss) return { storeyId: st.id, name: st.name, flaeche: areaMP(geschossFlaeche(st, true)), art: 'vollgeschoss' as const };
    if (vorher1990) {
      const a = aufenthaltsFlaeche(st, grundriss.get(st.id)!, wand, raeume.filter((x) => x.storeyId === st.id));
      if (a > 0) return { storeyId: st.id, name: st.name, flaeche: a, art: 'aufenthalt' as const };
    }
    return { storeyId: st.id, name: st.name, flaeche: 0, art: 'keine' as const };
  });
  const gf = gfJeGeschoss.reduce((a, x) => a + x.flaeche, 0);
  const gfAufenthalt = gfJeGeschoss.filter((x) => x.art === 'aufenthalt').reduce((a, x) => a + x.flaeche, 0);
  if (vorher1990 && gfAufenthalt > 0) {
    hinweise.push(`${baunvoLabel(re.baunvo)}: Aufenthaltsräume in anderen Geschossen samt Treppenräumen und Umfassungswänden (${fmtM(wand)} Wandzuschlag) zählen zur Geschossfläche.`);
  }
  const gfz = kennzahl(gf, G, m.gfz);

  const anzahl = pruefungen.filter((x) => x.vollgeschoss).length;
  const vollgeschosse = {
    anzahl,
    zulaessig: m.vollgeschosseMax,
    status: (m.vollgeschosseMax === undefined ? 'offen' : anzahl > m.vollgeschosseMax ? 'ueberschritten' : 'ok') as Status,
  };

  // Flächenbilanz: jede Stelle einmal, Gebäude zuerst
  const klasse = (v: Versiegelung) => unionAll(eigene.filter((f) => f.versiegelung === v).map((f) => f.points));
  const vollMP = diffMP(klasse('voll'), haupt);
  const teilMP = diffMP(klasse('teil'), haupt, vollMP);
  const gruenMP = diffMP(klasse('gruen'), haupt, vollMP, teilMP);
  const bilanz = {
    gebaeude: hauptanlage,
    voll: areaMP(vollMP),
    teil: areaMP(teilMP),
    gruen: areaMP(gruenMP),
    summe: 0,
    differenz: undefined as number | undefined,
  };
  bilanz.summe = bilanz.gebaeude + bilanz.voll + bilanz.teil + bilanz.gruen;
  if (G !== undefined && eigene.length) bilanz.differenz = G - bilanz.summe;

  return {
    recht: re,
    grundstueck,
    gelaende,
    hauptanlage,
    hauptanlagePolygone: ringsOf(haupt),
    grundstueckPolygone,
    grz,
    grz2,
    garagenFrei,
    gf,
    gfAufenthalt,
    gfz,
    vollgeschosse,
    geschosse: pruefungen,
    gfJeGeschoss,
    lageplan: posten,
    ueberlagerungen,
    raeume,
    bilanz,
    hinweise,
  };
}

/** Höhen über dem Grundriss eines Geschosses in einem Raster (Zellgröße je nach Fläche, mind. 10 cm) */
type Probe = { h: number; schraeg: boolean; zelle: number };
/**
 * Raster je Geschoss zwischenspeichern: Es hängt nur von den Geschossen (Liste unverändert = Inhalt unverändert),
 * dem Dachmodell und der Fußbodenhöhe ab – Änderungen an Lageplan oder Festsetzungen rechnen es nicht neu.
 */
const rasterCache = new WeakMap<Storey, { storeys: Storey[]; dach: Project['dachModell']; floorZ: number; out: Probe[] }>();

function rasterHoehen(project: Project, st: Storey, floorZ: number, gr: MultiPolygon): Probe[] {
  const c = rasterCache.get(st);
  if (c && c.storeys === project.storeys && c.dach === project.dachModell && c.floorZ === floorZ) return c.out;
  const out = rasterRechnen(project, st, floorZ, gr);
  rasterCache.set(st, { storeys: project.storeys, dach: project.dachModell, floorZ, out });
  return out;
}

function rasterRechnen(project: Project, st: Storey, floorZ: number, gr: MultiPolygon): Probe[] {
  if (!gr.length) return [];
  const b = bounds(ringsOf(gr).flat());
  // etwa 120 × 120 Proben, mindestens 10 cm – genau genug für Flächenanteile von Prozent
  const res = Math.max(0.1, Math.sqrt((b.maxX - b.minX) * (b.maxY - b.minY)) / 120);
  const out: Probe[] = [];
  const hoehe = hoehenFunktion(project, st, floorZ);
  for (let y = b.minY + res / 2; y < b.maxY; y += res) {
    for (let x = b.minX + res / 2; x < b.maxX; x += res) {
      const p = { x, y };
      if (!inMP(p, gr)) continue;
      const hh = hoehe(p);
      if (hh) out.push({ ...hh, zelle: res * res });
    }
  }
  return out;
}

const fmtM = (v: number) => `${(Math.round(v * 100) / 100).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} m`;
const fmtA = (v: number) => `${(Math.round(v * 100) / 100).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} m²`;
const pct = (v: number) => `${Math.round(v * 100)} %`;

function boundsOf(pts: Point[]) {
  return bounds(pts);
}
