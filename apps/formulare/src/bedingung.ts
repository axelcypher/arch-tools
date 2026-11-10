/**
 * Bedingungen für die Erforderlichkeit: Abschnitte, Gruppen und Felder eines Formulars (und Dokumente des
 * Projektumfangs) können von Projektmerkmalen abhängen – „nur bei Gebäudeklasse 3, 4 oder 5“ – oder von anderen
 * Feldern desselben Formulars – „wenn ‚Sonderbau‘ angekreuzt ist“.
 *
 * Eine Bedingung ist eine Gruppe: Entweder müssen alle Teile zutreffen (und) oder mindestens einer (oder). Teile
 * sind einzelne Prüfungen oder wieder Gruppen – etwa „Gebäudeklasse 3–5 und (Sonderbau angekreuzt oder Verfahren
 * Baugenehmigungsverfahren)“. Ohne Bedingung ist immer erforderlich.
 *
 * Projektmerkmale (Gebäudeklasse, Sonderbau, Verfahren …) werden in den Einstellungen festgelegt; ihr Wert gilt je
 * Projekt für alle Formulare und steht in der Projektdatei (.oap) unter `meta.merkmale`.
 */

export interface Merkmal {
  name: string;
  /** mögliche Werte */
  werte: string[];
}

export const VORGABE_MERKMALE: Merkmal[] = [
  { name: 'Gebäudeklasse', werte: ['1', '2', '3', '4', '5'] },
  { name: 'Sonderbau', werte: ['ja', 'nein'] },
  { name: 'Verfahren', werte: ['Genehmigungsfreistellung', 'vereinfachtes Verfahren', 'Baugenehmigungsverfahren'] },
];

export type FeldPruefung = 'ausgefuellt' | 'leer' | 'gleich' | 'ungleich';

export type Teilbedingung =
  /** das Projektmerkmal hat einen dieser Werte (`nicht`: keinen davon) */
  | { art: 'merkmal'; merkmal: string; werte: string[]; nicht?: boolean }
  /** ein Feld desselben Formulars ist ausgefüllt (Kästchen: angekreuzt), leer, hat einen Wert oder nicht */
  | { art: 'feld'; feld: string; pruefung: FeldPruefung; wert?: string };

export type Verknuepfung = 'und' | 'oder';

/** Gruppe: alle Teile (und) bzw. mindestens einer (oder) */
export interface BedingungGruppe {
  art: 'gruppe';
  op: Verknuepfung;
  teile: BedingungTeil[];
}

export type BedingungTeil = Teilbedingung | BedingungGruppe;

/** Eine Bedingung ist immer eine Gruppe; `undefined` = immer erforderlich */
export type Bedingung = BedingungGruppe;

export interface BedingungKontext {
  /** Projektmerkmale des Projekts: Name → Wert */
  merkmale: Record<string, string>;
  /** Wert eines Felds im Formular (Text oder angekreuzt) */
  wert?: (schluessel: string) => string | boolean | undefined;
}

export const gruppe = (op: Verknuepfung, teile: BedingungTeil[] = []): BedingungGruppe => ({ art: 'gruppe', op, teile });

const gefuellt = (w: string | boolean | undefined) => w === true || (typeof w === 'string' && w.trim() !== '');
const gleichText = (w: string | boolean | undefined, soll: string | undefined) => typeof w === 'string' && w.trim().toLowerCase() === (soll ?? '').trim().toLowerCase();

/** Gibt es überhaupt etwas zu prüfen? */
export const hatBedingung = (b: Bedingung | undefined): b is Bedingung => !!b && blaetter(b).length > 0;

/** alle einzelnen Prüfungen (über alle Ebenen) */
export function blaetter(b: BedingungTeil | undefined): Teilbedingung[] {
  if (!b) return [];
  return b.art === 'gruppe' ? b.teile.flatMap(blaetter) : [b];
}

function trifft(t: BedingungTeil, k: BedingungKontext): boolean {
  if (t.art === 'gruppe') {
    const geprueft = t.teile.filter((x) => x.art !== 'gruppe' || blaetter(x).length);
    if (!geprueft.length) return true;
    return t.op === 'oder' ? geprueft.some((x) => trifft(x, k)) : geprueft.every((x) => trifft(x, k));
  }
  if (t.art === 'merkmal') {
    const v = k.merkmale[t.merkmal];
    // ohne Wert im Projekt trifft ein Merkmal nie zu – auch nicht verneint
    if (!v) return false;
    return t.nicht ? !t.werte.includes(v) : t.werte.includes(v);
  }
  const w = k.wert?.(t.feld);
  if (t.pruefung === 'ausgefuellt') return gefuellt(w);
  if (t.pruefung === 'leer') return !gefuellt(w);
  if (t.pruefung === 'ungleich') return !gleichText(w, t.wert);
  return gleichText(w, t.wert);
}

/** Trifft die Bedingung zu? Ohne Bedingung: ja. Ein Merkmal ohne Wert im Projekt trifft nicht zu. */
export function erfuellt(b: Bedingung | undefined, k: BedingungKontext): boolean {
  return !hatBedingung(b) || trifft(b, k);
}

/** Fehlt im Projekt ein Merkmal, von dem die Bedingung abhängt? (für den Hinweis „Gebäudeklasse festlegen“) */
export const fehlendeMerkmale = (b: Bedingung | undefined, merkmale: Record<string, string>) =>
  blaetter(b).flatMap((t) => (t.art === 'merkmal' && !merkmale[t.merkmal] ? [t.merkmal] : []));

/** Nur die Teile mit Projektmerkmalen (für Dokumente des Projektumfangs, die keine Felder kennen) */
export function nurMerkmale(b: Bedingung | undefined): Bedingung | undefined {
  const filtern = (g: BedingungGruppe): BedingungGruppe => ({ ...g, teile: g.teile.flatMap((t): BedingungTeil[] => (t.art === 'gruppe' ? [filtern(t)] : t.art === 'merkmal' ? [t] : [])) });
  const out = b && filtern(b);
  return hatBedingung(out) ? out : undefined;
}

/** Werte als Text: „3, 4 oder 5“ */
function liste(werte: string[], wort = 'oder'): string {
  if (werte.length <= 1) return werte[0] ?? '–';
  return `${werte.slice(0, -1).join(', ')} ${wort} ${werte[werte.length - 1]}`;
}

type FeldName = (schluessel: string) => { titel: string; kreuz: boolean } | undefined;

function teilText(t: BedingungTeil, feldName: FeldName, oben: boolean): string {
  if (t.art === 'gruppe') {
    const teile = t.teile.filter((x) => blaetter(x).length).map((x) => teilText(x, feldName, false));
    const text = teile.join(t.op === 'oder' ? ' oder ' : ' und ');
    return !oben && teile.length > 1 ? `(${text})` : text;
  }
  if (t.art === 'merkmal') {
    if (!t.werte.length) return `${t.merkmal} (noch kein Wert gewählt)`;
    return t.nicht ? `${t.merkmal} nicht ${liste(t.werte)}` : `${t.merkmal} ${liste(t.werte)}`;
  }
  const f = feldName(t.feld);
  const name = `„${f?.titel ?? t.feld}“`;
  if (t.pruefung === 'ausgefuellt') return `${name} ${f?.kreuz ? 'angekreuzt' : 'ausgefüllt'}`;
  if (t.pruefung === 'leer') return `${name} ${f?.kreuz ? 'nicht angekreuzt' : 'leer'}`;
  if (t.pruefung === 'ungleich') return `${name} ≠ „${t.wert ?? ''}“`;
  return `${name} = „${t.wert ?? ''}“`;
}

/** Bedingung in Worten: „Gebäudeklasse 3, 4 oder 5 und („Sonderbau“ angekreuzt oder Verfahren …)“ */
export function bedingungText(b: Bedingung | undefined, feldName: FeldName = () => undefined): string {
  return hatBedingung(b) ? teilText(b, feldName, true) : '';
}

/** eine gelesene Prüfung; Unbekanntes → null */
function teilAus(roh: unknown, tiefe: number): BedingungTeil | null {
  if (!roh || typeof roh !== 'object') return null;
  const o = roh as Record<string, unknown>;
  if (o.art === 'gruppe' || Array.isArray(roh)) {
    if (tiefe > 4) return null;
    const teile = (Array.isArray(roh) ? roh : Array.isArray(o.teile) ? o.teile : []).map((t) => teilAus(t, tiefe + 1)).filter((t): t is BedingungTeil => !!t);
    return gruppe(o.op === 'oder' ? 'oder' : 'und', teile);
  }
  if (o.art === 'merkmal' && typeof o.merkmal === 'string' && o.merkmal && Array.isArray(o.werte)) {
    // auch ohne gewählten Wert behalten (beim Bearbeiten) – trifft dann nie zu
    return { art: 'merkmal', merkmal: o.merkmal, werte: o.werte.filter((w): w is string => typeof w === 'string' && !!w), ...(o.nicht === true ? { nicht: true } : {}) };
  }
  if (o.art === 'feld' && typeof o.feld === 'string' && o.feld && (o.pruefung === 'ausgefuellt' || o.pruefung === 'leer' || o.pruefung === 'gleich' || o.pruefung === 'ungleich')) {
    return { art: 'feld', feld: o.feld, pruefung: o.pruefung, ...(o.pruefung === 'gleich' || o.pruefung === 'ungleich' ? { wert: typeof o.wert === 'string' ? o.wert : '' } : {}) };
  }
  return null;
}

/**
 * Gelesene Bedingung prüfen; Unbekanntes fällt weg. Die frühere Form (eine Liste, alle Teile müssen zutreffen)
 * wird zur Und-Gruppe.
 */
export function bedingungAus(roh: unknown): Bedingung | undefined {
  if (!roh || typeof roh !== 'object') return undefined;
  const t = teilAus(Array.isArray(roh) ? roh : (roh as { art?: unknown }).art === 'gruppe' ? roh : null, 0);
  return t && t.art === 'gruppe' && hatBedingung(t) ? t : undefined;
}

export function merkmaleAus(roh: unknown): Merkmal[] {
  if (!Array.isArray(roh)) return VORGABE_MERKMALE;
  return roh
    .filter((m): m is Record<string, unknown> => !!m && typeof m === 'object' && typeof (m as { name?: unknown }).name === 'string' && !!(m as { name: string }).name.trim())
    .map((m) => ({ name: String(m.name).trim(), werte: (Array.isArray(m.werte) ? m.werte : []).filter((w): w is string => typeof w === 'string' && !!w.trim()).map((w) => w.trim()) }));
}
