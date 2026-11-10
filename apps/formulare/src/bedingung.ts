/**
 * Bedingungen für die Erforderlichkeit: Abschnitte, Gruppen und Felder eines Formulars (und Dokumente des
 * Projektumfangs) können von Projektmerkmalen abhängen – „nur bei Gebäudeklasse 3, 4 oder 5“ – oder von anderen
 * Feldern desselben Formulars – „wenn ‚Sonderbau‘ angekreuzt ist“. Alle Teile einer Bedingung müssen zutreffen.
 *
 * Projektmerkmale (Gebäudeklasse, Sonderbau, Verfahren …) werden in den Einstellungen festgelegt; ihr Wert gilt je
 * Projekt für alle Formulare und steht im Abschnitt „formulare“ der Projektdatei (.oap).
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

export type FeldPruefung = 'ausgefuellt' | 'leer' | 'gleich';

export type Teilbedingung =
  /** das Projektmerkmal hat einen dieser Werte */
  | { art: 'merkmal'; merkmal: string; werte: string[] }
  /** ein Feld desselben Formulars ist ausgefüllt (Kästchen: angekreuzt), leer oder hat einen Wert */
  | { art: 'feld'; feld: string; pruefung: FeldPruefung; wert?: string };

/** alle Teile müssen zutreffen; leer = immer erforderlich */
export type Bedingung = Teilbedingung[];

export interface BedingungKontext {
  /** Projektmerkmale des Projekts: Name → Wert */
  merkmale: Record<string, string>;
  /** Wert eines Felds im Formular (Text oder angekreuzt) */
  wert?: (schluessel: string) => string | boolean | undefined;
}

const gefuellt = (w: string | boolean | undefined) => w === true || (typeof w === 'string' && w.trim() !== '');

/** Trifft die Bedingung zu? Ein Merkmal ohne Wert im Projekt trifft nicht zu. */
export function erfuellt(b: Bedingung | undefined, k: BedingungKontext): boolean {
  if (!b?.length) return true;
  return b.every((t) => {
    if (t.art === 'merkmal') {
      const v = k.merkmale[t.merkmal];
      return !!v && t.werte.includes(v);
    }
    const w = k.wert?.(t.feld);
    if (t.pruefung === 'ausgefuellt') return gefuellt(w);
    if (t.pruefung === 'leer') return !gefuellt(w);
    return typeof w === 'string' && w.trim().toLowerCase() === (t.wert ?? '').trim().toLowerCase();
  });
}

/** Fehlt im Projekt ein Merkmal, von dem die Bedingung abhängt? (für den Hinweis „Gebäudeklasse festlegen“) */
export const fehlendeMerkmale = (b: Bedingung | undefined, merkmale: Record<string, string>) => (b ?? []).filter((t) => t.art === 'merkmal' && !merkmale[t.merkmal]).map((t) => (t as { merkmal: string }).merkmal);

/** Werte als Text: „3, 4 oder 5“ */
function liste(werte: string[]): string {
  if (werte.length <= 1) return werte[0] ?? '–';
  return `${werte.slice(0, -1).join(', ')} oder ${werte[werte.length - 1]}`;
}

/** Bedingung in Worten: „Gebäudeklasse 3, 4 oder 5 und ‚Sonderbau‘ angekreuzt“ */
export function bedingungText(b: Bedingung | undefined, feldName: (schluessel: string) => { titel: string; kreuz: boolean } | undefined = () => undefined): string {
  if (!b?.length) return '';
  return b
    .map((t) => {
      if (t.art === 'merkmal') return `${t.merkmal} ${liste(t.werte)}`;
      const f = feldName(t.feld);
      const name = `„${f?.titel ?? t.feld}“`;
      if (t.pruefung === 'ausgefuellt') return `${name} ${f?.kreuz ? 'angekreuzt' : 'ausgefüllt'}`;
      if (t.pruefung === 'leer') return `${name} ${f?.kreuz ? 'nicht angekreuzt' : 'leer'}`;
      return `${name} = „${t.wert ?? ''}“`;
    })
    .join(' und ');
}

/** gelesene Bedingung prüfen; Unbekanntes fällt weg */
export function bedingungAus(roh: unknown): Bedingung | undefined {
  if (!Array.isArray(roh)) return undefined;
  const out: Bedingung = [];
  for (const t of roh) {
    if (!t || typeof t !== 'object') continue;
    const o = t as Record<string, unknown>;
    if (o.art === 'merkmal' && typeof o.merkmal === 'string' && o.merkmal && Array.isArray(o.werte)) {
      // auch ohne gewählten Wert behalten (beim Bearbeiten) – trifft dann nie zu
      out.push({ art: 'merkmal', merkmal: o.merkmal, werte: o.werte.filter((w): w is string => typeof w === 'string' && !!w) });
    } else if (o.art === 'feld' && typeof o.feld === 'string' && o.feld && (o.pruefung === 'ausgefuellt' || o.pruefung === 'leer' || o.pruefung === 'gleich')) {
      out.push({ art: 'feld', feld: o.feld, pruefung: o.pruefung, ...(o.pruefung === 'gleich' ? { wert: typeof o.wert === 'string' ? o.wert : '' } : {}) });
    }
  }
  return out.length ? out : undefined;
}

export function merkmaleAus(roh: unknown): Merkmal[] {
  if (!Array.isArray(roh)) return VORGABE_MERKMALE;
  return roh
    .filter((m): m is Record<string, unknown> => !!m && typeof m === 'object' && typeof (m as { name?: unknown }).name === 'string' && !!(m as { name: string }).name.trim())
    .map((m) => ({ name: String(m.name).trim(), werte: (Array.isArray(m.werte) ? m.werte : []).filter((w): w is string => typeof w === 'string' && !!w.trim()).map((w) => w.trim()) }));
}
