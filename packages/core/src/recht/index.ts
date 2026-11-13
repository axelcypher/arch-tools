/**
 * Gesetzestexte, auf die sich die Vorgaben der Formulare stützen: amtliche Fassungen von recht.nrw.de (BauO NRW
 * 2018, BauPrüfVO) und gesetze-im-internet.de (einzelne Paragrafen aus BauGB, BauNVO, BNatSchG, GEIG), geholt mit
 * `scripts/recht-holen.mjs` und mit der App ausgeliefert – lesbar auch ohne Netz. Die Texte werden erst geladen,
 * wenn man sie öffnet.
 */

import type { Quelle } from '../bedingung';

export interface Paragraf {
  titel: string;
  /** Fundstelle im Original (mit Sprungmarke) */
  url: string;
  /** Absätze und Aufzählungen, je eine Zeile */
  text: string[];
}

export interface Gesetz {
  id: string;
  kurz: string;
  titel: string;
  /** z. B. „gültig ab 01.09.2026“ */
  fassung: string;
  url: string;
  paragrafen: Record<string, Paragraf>;
}

const LADEN: Record<string, { kurz: string; laden: () => Promise<{ default: unknown }> }> = {
  'bauo-nrw': { kurz: 'BauO NRW 2018', laden: () => import('./daten/bauo-nrw.json') },
  baupruefvo: { kurz: 'BauPrüfVO', laden: () => import('./daten/baupruefvo.json') },
  baugb: { kurz: 'BauGB', laden: () => import('./daten/baugb.json') },
  baunvo: { kurz: 'BauNVO', laden: () => import('./daten/baunvo.json') },
  bnatschg: { kurz: 'BNatSchG', laden: () => import('./daten/bnatschg.json') },
  geig: { kurz: 'GEIG', laden: () => import('./daten/geig.json') },
};

/** Gibt es den Text dieses Gesetzes in der App? */
export const gesetzBekannt = (id: string) => id in LADEN;

/** Kurzname des Gesetzes (für Fundstellen) */
export const gesetzKurz = (id: string) => LADEN[id]?.kurz ?? id;

const geladen = new Map<string, Promise<Gesetz>>();

/** Text eines Gesetzes (einmal geladen, dann aus dem Speicher) */
export function gesetzLaden(id: string): Promise<Gesetz> {
  const l = LADEN[id];
  if (!l) return Promise.reject(new Error(`Gesetz „${id}“ ist nicht in der App`));
  let p = geladen.get(id);
  if (!p) {
    p = l.laden().then((m) => m.default as Gesetz);
    geladen.set(id, p);
  }
  return p;
}

/** Fundstelle in Worten: „§ 68 Absatz 2 Satz 3 BauO NRW 2018“ */
export function quelleText(q: Quelle): string {
  return [`§ ${q.paragraf}`, q.absatz && `Absatz ${q.absatz}`, q.satz && `Satz ${q.satz}`, q.nummer && `Nummer ${q.nummer}`, gesetzKurz(q.gesetz)].filter(Boolean).join(' ');
}

/**
 * Zeilen eines Paragrafen, die zum Absatz gehören: von „(n)“ bis vor den nächsten Absatz. Ohne Absatz (oder wenn der
 * Paragraf keine nummerierten Absätze hat) der ganze Paragraf.
 */
export function absatzZeilen(p: Paragraf, absatz?: number): { von: number; bis: number } {
  if (!absatz) return { von: 0, bis: p.text.length };
  const beginn = (z: string) => /^\((\d+)\)/.exec(z)?.[1];
  const von = p.text.findIndex((z) => beginn(z) === String(absatz));
  if (von < 0) return { von: 0, bis: p.text.length };
  const naechster = p.text.findIndex((z, i) => i > von && beginn(z) !== undefined);
  return { von, bis: naechster < 0 ? p.text.length : naechster };
}
