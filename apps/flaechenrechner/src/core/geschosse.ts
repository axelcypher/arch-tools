import { centroid, labelPoint } from '@core/geometry';
import type { Project, RoomShape, Shape, Storey } from '@core/model';
import { storeyElevations } from '@core/model';

/**
 * Raumnummern und Geschosse (F-01, F-02, F-03):
 *  - Raumnummer = Präfix des Geschosses + laufende Nummer; neue Räume zählen ab der höchsten vorhandenen Nummer weiter
 *    (nie nach der Anzahl – sonst entstehen nach dem Löschen doppelte Nummern).
 *  - Präfix je Geschoss einstellbar (Storey.nummernPraefix), sonst aus dem Namen (KG → -1, EG → 0, 1. OG → 1), erst
 *    zuletzt aus der Lage – damit ändert ein neu eingefügtes Geschoss die Nummern der anderen nicht.
 *  - Neu nummeriert wird nur auf ausdrücklichen Befehl; Räume aus dem IFC-Import behalten ihre Nummer.
 */

/** Präfix aus dem Geschossnamen, z. B. „EG“ → „0“, „2. OG“ → „2“, „KG“ → „-1“; undefined, wenn der Name nichts hergibt */
export function praefixAusName(name: string): string | undefined {
  const n = name.trim();
  let m = /(\d+)\s*\.?\s*(og|obergeschoss)\b/i.exec(n);
  if (m) return String(Number(m[1]));
  m = /(\d+)\s*\.?\s*(ug|kg|untergeschoss|kellergeschoss)\b/i.exec(n);
  if (m) return String(-Number(m[1]));
  if (/\beg\b|erdgeschoss/i.test(n)) return '0';
  if (/\bkg\b|\bug\b|keller|untergeschoss/i.test(n)) return '-1';
  if (/^og$|^obergeschoss$/i.test(n)) return '1';
  return undefined;
}

/** Geschosse nach Fußbodenhöhe (unten zuerst) – nicht nach Listenposition */
function nachHoehe(p: Project): Storey[] {
  const elev = storeyElevations(p);
  return p.storeys
    .map((s, i) => ({ s, e: elev[i], i }))
    .sort((a, b) => a.e - b.e || a.i - b.i)
    .map((x) => x.s);
}

/** Präfix der Raumnummern eines Geschosses: eigene Angabe, sonst aus dem Namen, sonst aus der Lage zum nächsten benannten Geschoss */
export function raumNummernPraefix(p: Project, storey: Storey): string {
  const eigen = storey.nummernPraefix?.trim();
  if (eigen) return eigen;
  const ausName = praefixAusName(storey.name);
  if (ausName !== undefined) return ausName;
  const liste = nachHoehe(p);
  const t = liste.indexOf(storey);
  let best: { d: number; v: number } | null = null;
  liste.forEach((s, j) => {
    const v = s.nummernPraefix?.trim() || praefixAusName(s.name);
    if (v === undefined || !/^-?\d+$/.test(v) || j === t) return;
    const d = Math.abs(j - t);
    if (!best || d < best.d) best = { d, v: Number(v) + (t - j) };
  });
  return String(best ? (best as { v: number }).v : Math.max(0, t));
}

/** laufende Nummer einer Raumnummer mit diesem Präfix („0.07“ → 7), sonst undefined */
function laufendeNummer(nummer: string, praefix: string): number | undefined {
  const m = /^(-?\d+)\.(\d+)$/.exec(nummer.trim());
  return m && m[1] === praefix ? Number(m[2]) : undefined;
}

function nummerText(praefix: string, n: number): string {
  return `${praefix}.${String(n).padStart(2, '0')}`;
}

/** höchste laufende Nummer der Räume im Geschoss mit diesem Präfix */
function hoechsteNummer(shapes: readonly Shape[], praefix: string): number {
  let max = 0;
  for (const s of shapes) if (s.kind === 'room') max = Math.max(max, laufendeNummer(s.nummer, praefix) ?? 0);
  return max;
}

/** Nächste Raumnummer im Geschoss: höchste vorhandene + 1 (z. B. nach 0.01–0.04, 0.02 gelöscht → 0.05) */
export function naechsteRaumnummer(p: Project, storey: Storey): string {
  const praefix = raumNummernPraefix(p, storey);
  return nummerText(praefix, hoechsteNummer(storey.shapes, praefix) + 1);
}

/** Raumnummern, die im Geschoss mehrfach vorkommen (ohne leere Nummern und ohne Abzugsflächen) */
export function doppelteNummern(storey: Storey): Set<string> {
  const gesehen = new Set<string>();
  const doppelt = new Set<string>();
  for (const s of storey.shapes) {
    if (s.kind !== 'room' || s.subtract) continue;
    const n = s.nummer.trim();
    if (!n) continue;
    if (gesehen.has(n)) doppelt.add(n);
    gesehen.add(n);
  }
  return doppelt;
}

export type NummerReihenfolge = 'liste' | 'uhrzeigersinn';

/**
 * Räume eines Geschosses neu nummerieren (nur auf ausdrücklichen Befehl). Räume aus dem IFC-Import (ifcId) behalten
 * ihre Nummer – sonst weichen die Nummern vom Modell und den Plänen ab; ihre Nummern werden übersprungen.
 * Abzugsflächen bleiben unverändert. Reihenfolge: wie in der Liste oder im Uhrzeigersinn um die Mitte, oben beginnend.
 */
export function raeumeNeuNummerieren(p: Project, storey: Storey, reihenfolge: NummerReihenfolge): { storey: Storey; geaendert: number; ifc: number } {
  const praefix = raumNummernPraefix(p, storey);
  const raeume = storey.shapes.filter((s): s is RoomShape => s.kind === 'room' && !s.subtract && s.points.length >= 3);
  const ifc = raeume.filter((r) => r.ifcId);
  const belegt = new Set(ifc.map((r) => r.nummer.trim()));
  let frei = raeume.filter((r) => !r.ifcId);
  if (reihenfolge === 'uhrzeigersinn' && frei.length) {
    const mitte = centroid(frei.map((r) => labelPoint(r.points)));
    // Bildschirmkoordinaten (y nach unten): 0 = oben, wachsend im Uhrzeigersinn
    const winkel = (r: RoomShape) => {
      const q = labelPoint(r.points);
      const a = Math.atan2(q.x - mitte.x, -(q.y - mitte.y));
      return a < 0 ? a + 2 * Math.PI : a;
    };
    frei = [...frei].sort((a, b) => winkel(a) - winkel(b));
  }
  const neu = new Map<string, string>();
  let n = 0;
  for (const r of frei) {
    let t: string;
    do t = nummerText(praefix, ++n);
    while (belegt.has(t));
    neu.set(r.id, t);
  }
  let geaendert = 0;
  const shapes = storey.shapes.map((s) => {
    const t = neu.get(s.id);
    if (t === undefined || s.kind !== 'room' || s.nummer === t) return s;
    geaendert++;
    return { ...s, nummer: t };
  });
  return { storey: geaendert ? { ...storey, shapes } : storey, geaendert, ifc: ifc.length };
}

/** Wie beim Einfügen bzw. Duplizieren mit Räumen umgegangen wird (F-02) */
export interface KopieOptionen {
  /** Raumnummern an das Zielgeschoss anpassen (Präfix, fortlaufend ab der höchsten vorhandenen Nummer) */
  nummernAnpassen: boolean;
  /** neue Wohnung für die Räume mit Wohnflächenanrechnung; null = Wohnung beibehalten */
  wohnung: string | null;
}

/**
 * Kopierte Flächen an das Zielgeschoss anpassen: Nummern fortlaufend nach dessen Präfix (die Reihenfolge der Kopie
 * bleibt), Wohnung wie gewählt. `vorhanden` sind die Flächen, die im Ziel schon liegen.
 */
export function kopieAnpassen(shapes: Shape[], praefix: string, vorhanden: readonly Shape[], o: KopieOptionen): Shape[] {
  let n = hoechsteNummer(vorhanden, praefix);
  return shapes.map((s) => {
    if (s.kind !== 'room') return s;
    let r: RoomShape = s;
    if (o.nummernAnpassen && !r.subtract) r = { ...r, nummer: nummerText(praefix, ++n) };
    if (o.wohnung !== null && r.wofl.kategorie !== 'keine') r = { ...r, wofl: { ...r.wofl, wohnung: o.wohnung } };
    return r;
  });
}

/** alle Wohnungen des Projekts (für die Auswahl statt freier Eingabe – verhindert „WE 01“ neben „WE01“) */
export function wohnungenImProjekt(p: Project): string[] {
  const set = new Set<string>();
  for (const st of p.storeys) for (const s of st.shapes) if (s.kind === 'room' && s.wofl.wohnung.trim()) set.add(s.wofl.wohnung.trim());
  return [...set].sort((a, b) => a.localeCompare(b, 'de', { numeric: true }));
}

export type Lage = 'darueber' | 'darunter';

/** Name eines neuen Geschosses nach seiner Lage zum Bezugsgeschoss: über dem EG „1. OG“, über dem obersten OG …, unter dem EG „KG“ */
export function geschossNameVorschlag(p: Project, bezug: Storey, lage: Lage): string {
  const v = Number(raumNummernPraefix(p, bezug));
  const ziel = Number.isFinite(v) ? v + (lage === 'darueber' ? 1 : -1) : NaN;
  const namen = new Set(p.storeys.map((s) => s.name.trim().toLowerCase()));
  const kandidat = !Number.isFinite(ziel) ? (lage === 'darueber' ? 'OG' : 'KG') : ziel > 0 ? `${ziel}. OG` : ziel === 0 ? 'EG' : ziel === -1 ? (namen.has('kg') ? 'UG' : 'KG') : `${-ziel}. UG`;
  if (!namen.has(kandidat.toLowerCase())) return kandidat;
  for (let i = 2; ; i++) if (!namen.has(`${kandidat} (${i})`.toLowerCase())) return `${kandidat} (${i})`;
}

/** Fußbodenhöhe eines neuen Geschosses über bzw. unter dem Bezugsgeschoss (aus dessen Kote und Höhe) */
export function neueKote(p: Project, bezug: Storey, lage: Lage, hoehe: number): number {
  const e = storeyElevations(p)[p.storeys.indexOf(bezug)] ?? 0;
  return Math.round((lage === 'darueber' ? e + bezug.hoehe : e - hoehe) * 1000) / 1000;
}
