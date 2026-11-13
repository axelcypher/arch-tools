/**
 * Summen eines LV je Bieter: Gesamtbetrag je Position (Menge × Einheitspreis, kaufmännisch auf Cent gerundet),
 * Abschnittssummen, Angebotssumme ohne und mit Nachlass, Umsatzsteuer, brutto. Bedarfs- und Wahlpositionen
 * haben einen Gesamtbetrag, zählen aber nicht in die Summen; Positionen aus Nachträgen werden je Nachtrag
 * summiert und gehören nicht zur Angebotssumme.
 */

import type { Lv, LvElement, Position } from './modell';
import { zaehltInSumme } from './modell';

/** kaufmännisch auf Cent runden (mit kleinem Ausgleich für Gleitkommafehler: 1,005 → 1,01) */
export const rund2 = (x: number) => Math.round((x + Math.sign(x) * 1e-9) * 100) / 100;

/** Umsatzsteuer auf einen Nettobetrag, auf Cent gerundet */
export const ustBetrag = (netto: number, prozent: number) => rund2((rund2(netto) * prozent) / 100);

/** Brutto = Netto (auf Cent) + Umsatzsteuer (auf Cent) – überall gleich gerechnet */
export const brutto = (netto: number, prozent: number) => rund2(rund2(netto) + ustBetrag(netto, prozent));

export interface BieterSumme {
  /** Summe der Positionen (ohne Nachlass) */
  ohneNachlass: number;
  /** nach Nachlass, netto */
  netto: number;
  mwst: number;
  brutto: number;
  /** Positionen mit Preis / ohne Preis (nur zählende) */
  mitPreis: number;
  ohnePreis: number;
}

export interface Summen {
  bieter: Map<number, BieterSumme>;
  /** Abschnitt (id) → Bieter → Summe */
  abschnitte: Map<string, Map<number, number>>;
  /** Position (id) → Bieter → Gesamtbetrag */
  positionen: Map<string, Map<number, number>>;
  /** Nachtrag → Summe (für den beauftragten Bieter) */
  nachtraege: Map<number, number>;
}

/** Gesamtbetrag einer Position für einen Bieter; null = kein Preis */
export function gesamtbetrag(pos: Position, bieterId: number): number | null {
  const p = pos.preise[String(bieterId)];
  if (!p || p.ep === null || p.ep === undefined) return p?.pauschal != null ? rund2(p.pauschal) : null;
  if (p.pauschal != null) return rund2(p.pauschal);
  const menge = p.menge ?? pos.menge ?? 0;
  return rund2(menge * p.ep);
}

export function summen(lv: Lv): Summen {
  const ids = lv.bieter.map((b) => b.id);
  const positionen = new Map<string, Map<number, number>>();
  const abschnitte = new Map<string, Map<number, number>>();
  const nachtraege = new Map<number, number>();
  const zaehler = new Map<number, { mit: number; ohne: number }>(ids.map((id) => [id, { mit: 0, ohne: 0 }]));
  const auftragId = lv.auftrag?.bieterId;

  const rek = (liste: LvElement[]): Map<number, number> => {
    const s = new Map<number, number>();
    for (const el of liste) {
      if (el.art === 'position') {
        const gb = new Map<number, number>();
        for (const id of ids) {
          const b = gesamtbetrag(el, id);
          if (b !== null) gb.set(id, b);
        }
        positionen.set(el.id, gb);
        if (el.nachtrag) {
          if (auftragId !== undefined && zaehltInSumme(el.positionsart)) nachtraege.set(el.nachtrag, rund2((nachtraege.get(el.nachtrag) ?? 0) + (gb.get(auftragId) ?? 0)));
          continue;
        }
        if (!zaehltInSumme(el.positionsart)) continue;
        for (const id of ids) {
          const b = gb.get(id);
          const z = zaehler.get(id)!;
          if (b === undefined) z.ohne++;
          else {
            z.mit++;
            s.set(id, rund2((s.get(id) ?? 0) + b));
          }
        }
      } else if (el.art === 'abschnitt') {
        const u = rek(el.kinder);
        abschnitte.set(el.id, u);
        for (const [id, v] of u) s.set(id, rund2((s.get(id) ?? 0) + v));
      }
    }
    return s;
  };
  const gesamt = rek(lv.elemente);
  const bieter = new Map<number, BieterSumme>();
  for (const b of lv.bieter) {
    const ohne = gesamt.get(b.id) ?? 0;
    const netto = rund2(ohne * (1 + (b.nachlass ?? 0) / 100));
    const mwst = ustBetrag(netto, lv.kopf.mwst);
    const z = zaehler.get(b.id)!;
    bieter.set(b.id, { ohneNachlass: ohne, netto, mwst, brutto: brutto(netto, lv.kopf.mwst), mitPreis: z.mit, ohnePreis: z.ohne });
  }
  return { bieter, abschnitte, positionen, nachtraege };
}

/* ---------- Preisspiegel ---------- */

export interface Spiegelzeile {
  /** Bieter → Einheitspreis */
  ep: Map<number, number>;
  min: number | null;
  max: number | null;
  mittel: number | null;
  /** Bieter mit dem niedrigsten Preis */
  guenstigster: number[];
  /** Abweichung je Bieter vom Mittel in % */
  abweichung: Map<number, number>;
}

/** Preisvergleich einer Position über die gewerteten Bieter (ohne Kostenansatz und ausgeschlossene) */
export function spiegelzeile(pos: Position, bieterIds: number[]): Spiegelzeile {
  const ep = new Map<number, number>();
  for (const id of bieterIds) {
    const p = pos.preise[String(id)];
    if (p && p.ep !== null && p.ep !== undefined) ep.set(id, p.ep);
  }
  const werte = [...ep.values()];
  if (!werte.length) return { ep, min: null, max: null, mittel: null, guenstigster: [], abweichung: new Map() };
  const min = Math.min(...werte);
  const max = Math.max(...werte);
  const mittel = werte.reduce((a, b) => a + b, 0) / werte.length;
  const abweichung = new Map<number, number>();
  for (const [id, v] of ep) abweichung.set(id, mittel ? ((v - mittel) / mittel) * 100 : 0);
  return { ep, min, max, mittel, guenstigster: [...ep].filter(([, v]) => v === min).map(([id]) => id), abweichung };
}

/** gewertete Bieter: alle außer Kostenansatz und ausgeschlossenen */
export const gewerteteBieter = (lv: Lv) => lv.bieter.filter((b) => b.id !== 0 && !b.ausgeschlossen).map((b) => b.id);

export interface Rang {
  id: number;
  netto: number;
  rang: number;
  /** Abstand zum Ersten in % */
  abstand: number;
  /** zählende Positionen ohne Preis */
  ohnePreis: number;
  /** Angebot unvollständig (fehlende Preise): nicht ohne Prüfung werten (§ 16a VOB/A) */
  unvollstaendig: boolean;
}

/**
 * Abstand zum günstigsten vollständigen Angebot als Text: „+5,0 %“, beim Ersten leer; unvollständige Angebote sind
 * nicht vergleichbar (ihre Summe ist durch die fehlenden Preise zu niedrig).
 */
export function abstandText(r: Rang): string {
  if (r.unvollstaendig) return 'nicht vergleichbar';
  if (r.rang <= 1) return '';
  const z = r.abstand.toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  return `${r.abstand > 0 ? '+' : ''}${z} %`;
}

/**
 * Rangfolge der Bieter nach Angebotssumme netto (nach Nachlass). Unvollständige Angebote (fehlende Preise)
 * stehen hinter den vollständigen – ihre Summe ist zu niedrig und nicht vergleichbar – und sind gekennzeichnet.
 */
export function rangfolge(lv: Lv, s = summen(lv)): Rang[] {
  const liste = gewerteteBieter(lv)
    .map((id) => {
      const b = s.bieter.get(id);
      const ohnePreis = b?.ohnePreis ?? 0;
      return { id, netto: b?.netto ?? 0, ohnePreis, unvollstaendig: ohnePreis > 0 };
    })
    .filter((x) => x.netto > 0)
    .sort((a, b) => Number(a.unvollstaendig) - Number(b.unvollstaendig) || a.netto - b.netto);
  const erst = liste.find((x) => !x.unvollstaendig)?.netto ?? liste[0]?.netto ?? 0;
  return liste.map((x, i) => ({ ...x, rang: i + 1, abstand: erst ? ((x.netto - erst) / erst) * 100 : 0 }));
}

/** Auffällige Preise: weicht ein Einheitspreis mehr als `grenze` % vom Mittel ab? */
export function auffaellig(z: Spiegelzeile, id: number, grenze = 30): boolean {
  const a = z.abweichung.get(id);
  return a !== undefined && z.ep.size >= 3 && Math.abs(a) > grenze;
}
