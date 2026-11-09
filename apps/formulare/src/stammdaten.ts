/**
 * Bürostammdaten: Adressen, die in vielen Projekten wiederkehren (das eigene Büro als Entwurfsverfasser, der
 * Bauvorlageberechtigte, die Bauaufsichtsbehörde …). Sie werden aus einer Adressgruppe der Projektkarte gemerkt
 * und in andere Projektkarten übernommen. Sie liegen nur in dieser App (nicht im FORMA-Projekt).
 */

import type { PkWert } from './forma/projektkarte';

export interface Stammadresse {
  name: string;
  /** Eintragsnummer der Adressgruppe (10 = Branche, 40 = Name/Firma, 210 = Anrede …) → Wert */
  werte: Record<string, PkWert>;
}

const SCHLUESSEL = 'formulare:stammdaten';

const istWert = (v: unknown): v is PkWert => v === null || typeof v === 'string' || typeof v === 'number';

export function stammdatenLaden(): Stammadresse[] {
  try {
    const o = JSON.parse(localStorage.getItem(SCHLUESSEL) ?? '[]') as unknown;
    if (!Array.isArray(o)) return [];
    return o
      .filter((x): x is Stammadresse => !!x && typeof x === 'object' && typeof (x as Stammadresse).name === 'string' && !!(x as Stammadresse).werte)
      .map((x) => ({ name: x.name, werte: Object.fromEntries(Object.entries(x.werte).filter(([, v]) => istWert(v))) }));
  } catch {
    return [];
  }
}

export function stammdatenSpeichern(liste: Stammadresse[]): void {
  try {
    localStorage.setItem(SCHLUESSEL, JSON.stringify(liste));
  } catch {
    // ohne Speicher keine Stammdaten
  }
}

/** Merken oder ersetzen (gleicher Name) */
export function stammadresseMerken(liste: Stammadresse[], neu: Stammadresse): Stammadresse[] {
  const rest = liste.filter((s) => s.name !== neu.name);
  return [...rest, neu].sort((a, b) => a.name.localeCompare(b.name, 'de'));
}
