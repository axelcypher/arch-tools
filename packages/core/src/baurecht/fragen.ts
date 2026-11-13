/**
 * Wann eine Frage gestellt wird – ein Kriterium für Kern (es fehlt, klärt am meisten), App (Angaben-Leiste) und Protokoll.
 */
import type { KurzKontext } from './kurz';
import { werten } from './kurz';
import type { FaktDef } from './typen';

/** Rückfragen zu einem Antragsmerkmal: stehen direkt unter dem Merkmal (Umfang der Beseitigung, beim Ersatzbau die Angaben zum Altbau) */
export const RUECKFRAGEN: Record<string, string[]> = { Vorhaben: ['vorhaben.beseitigung_umfang', 'nw.altbau_verfahrensfrei', 'nw.beseitigung_mit_beantragt'] };
export const RUECKFRAGE_IDS: ReadonlySet<string> = new Set(Object.values(RUECKFRAGEN).flat());

/**
 * Wird die Frage zu dieser Angabe gestellt? Ohne Bedingung („wenn“) immer; sonst, solange die Bedingung nicht „nein“
 * ergibt. Eine Rückfrage erst, wenn ihre Bedingung sicher „ja“ ergibt – vorher stünde z. B. „Altbau verfahrensfrei“
 * vor dem Umfang der Beseitigung. Eine fehlerhafte Bedingung: lieber fragen.
 */
export function frageGestellt(id: string, def: Pick<FaktDef, 'wenn'> | undefined, ctx: KurzKontext): boolean {
  if (!def?.wenn) return true;
  try {
    const w = werten(def.wenn, ctx).w;
    return RUECKFRAGE_IDS.has(id) ? w === 'ja' : w !== 'nein';
  } catch {
    return true;
  }
}
