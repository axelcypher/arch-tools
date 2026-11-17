/**
 * Planungsphase eines Projekts (`meta.planphase`): das Kürzel einer Planphase des wirksamen Namensschemas (GP, AP,
 * AB …). Name und Leistungsphase kommen aus dem Namensschema – Projekt vor Büro vor Vorgabe; Phasen ohne
 * Leistungsphase (AB) sind erlaubt. Ohne Festlegung bleibt die Phase leer; ein Vorschlag aus Leistungsphasen bzw.
 * aktivem Antrag wird nur angeboten, nie still gesetzt.
 */

import type { AntragKurz } from './model';
import type { UebersichtMarke } from './ui/ProjektUebersicht';
import type { Kuerzel, Namensschema } from './namensschema';
import { kuerzelZu, wirksamesNamensschema } from './namensschema';
import { bueroNamensschema } from './platform/konfig';

/** Planungsphase mit Name und Leistungsphase nach dem Namensschema */
export interface Planphase {
  kuerzel: string;
  /** Name aus dem Namensschema; leer, wenn das Kürzel dort (nicht mehr) steht */
  name: string;
  /** Leistungsphase (HOAI), wenn die Phase eine hat */
  lph?: number;
  /** steht im Namensschema */
  bekannt: boolean;
}

/** Hinweis, wenn eine Vorlage die Phase nutzt, das Projekt aber keine hat */
export const PHASE_FEHLT = 'Planungsphase nicht festgelegt';

/** Planungsphase zu einem Kürzel (auch eine gleichwertige Schreibweise des Namensschemas); null ohne Kürzel */
export function planphaseVon(kuerzel: string | undefined, schema: Pick<Namensschema, 'phasen'>): Planphase | null {
  const k = kuerzel?.trim().toUpperCase();
  if (!k) return null;
  const p = kuerzelZu(schema.phasen, k);
  if (!p) return { kuerzel: k, name: '', bekannt: false };
  return { kuerzel: p.kuerzel, name: p.name, ...(p.lph !== undefined ? { lph: p.lph } : {}), bekannt: true };
}

/** Planungsphase eines Projekts nach seinem Namensschema (sonst dem des Büros, sonst der Vorgabe) */
export function projektPlanphase(p: { meta?: { planphase?: string } | null; namensschema?: unknown } | null | undefined, buero: unknown = bueroNamensschema()): Planphase | null {
  if (!p?.meta?.planphase) return null;
  return planphaseVon(p.meta.planphase, wirksamesNamensschema(p.namensschema, buero));
}

/** „GP – Genehmigungsplanung (LPh 4)“; ohne Name nur das Kürzel */
export function planphaseText(p: Planphase): string {
  return `${p.kuerzel}${p.name ? ` – ${p.name}` : ''}${p.lph !== undefined ? ` (LPh ${p.lph})` : ''}`;
}

/** Text einer Planphase in einer Auswahl: „GP – Genehmigungsplanung · LPh 4“ bzw. „AB – … · ohne LPh“ */
export const phasenOption = (k: Kuerzel) => `${k.kuerzel}${k.name ? ` – ${k.name}` : ''} · ${k.lph !== undefined ? `LPh ${k.lph}` : 'ohne LPh'}`;

/** Antragsarten, deren Unterlagen in der Genehmigungsplanung (LPh 4) entstehen */
const ARTEN_LPH4 = ['BAUA', 'BAUF'];

export interface PhasenVorschlag {
  kuerzel: string;
  /** woraus der Vorschlag folgt – für den Hinweis am Knopf */
  grund: string;
}

/**
 * Vorschlag für die Planungsphase aus vorhandenen Angaben – nur als Angebot (Knopf „übernehmen“), nie still gesetzt:
 *  1. ein Antrag in Arbeit (nicht eingereicht): Bauantrag bzw. Genehmigungsfreistellung → die Phase mit LPh 4,
 *     Abgeschlossenheitsbescheinigung (ABGE) → AB, wenn das Namensschema sie hat;
 *  2. sonst die beauftragten Leistungsphasen: die Phase mit der kleinsten beauftragten Leistungsphase (zu Beginn
 *     des Auftrags).
 * Ohne passende Phase im Namensschema: null.
 */
export function planphaseVorschlag(meta: { leistungsphasen?: number[]; antrag?: AntragKurz }, schema: Pick<Namensschema, 'phasen'>): PhasenVorschlag | null {
  const beauftragt = meta.leistungsphasen ?? [];
  const a = meta.antrag;
  if (a && !a.eingereicht) {
    const art = a.name.trim().split(/\s+/)[0].toUpperCase();
    if (art === 'ABGE' && kuerzelZu(schema.phasen, 'AB')) return { kuerzel: kuerzelZu(schema.phasen, 'AB')!.kuerzel, grund: `Antrag ${a.name} in Arbeit` };
    const gp = schema.phasen.find((p) => p.lph === 4);
    if (ARTEN_LPH4.includes(art) && gp && (!beauftragt.length || beauftragt.includes(4))) return { kuerzel: gp.kuerzel, grund: `Antrag ${a.name} in Arbeit` };
  }
  if (!beauftragt.length) return null;
  const passend = schema.phasen.filter((p) => p.lph !== undefined && beauftragt.includes(p.lph)).sort((x, y) => x.lph! - y.lph!);
  return passend.length ? { kuerzel: passend[0].kuerzel, grund: `erste beauftragte Leistungsphase (LPh ${passend[0].lph})` } : null;
}

/** Werte der Phase für die globalen Platzhalter ({PHASE}, {PHASE_NAME}, {LPH}); null ohne Phase */
export const phaseQuelle = (p: Planphase | null): { kuerzel: string; name?: string; lph?: number } | null =>
  p ? { kuerzel: p.kuerzel, ...(p.name ? { name: p.name } : {}), ...(p.lph !== undefined ? { lph: p.lph } : {}) } : null;

/** Marke der Planungsphase für die Projektkarte (Slot `marken` der Projektübersicht): „Phase GP“, im Tooltip Name und LPh */
export function phaseMarke(p: Planphase): UebersichtMarke {
  return { text: `Phase ${p.kuerzel}`, art: 'neutral', titel: `Planungsphase ${planphaseText(p)}${p.bekannt ? '' : ' – nicht im Namensschema'}` };
}
