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
 * Wird die Frage zu dieser Angabe gestellt? Ohne Bedingung („wenn“) immer; sonst, solange die Bedingung nicht sicher
 * „nein“ ergibt (ein „nein“ nur aus Hinweisen verbirgt keine Frage – sonst fiele eine Antwort weg, die zählen könnte;
 * ein Widerspruch bzw. Vorbehalt – an einem Merkmal oder einer Angabe – öffnet keine; das Urteil hängt so nicht daran). Eine Rückfrage erst, wenn ihre Bedingung „ja“ ergibt – vorher stünde z. B. „Altbau
 * verfahrensfrei“ vor dem Umfang der Beseitigung. Eine fehlerhafte Bedingung: lieber fragen.
 */
export function frageGestellt(id: string, def: Pick<FaktDef, 'wenn'> | undefined, ctx: KurzKontext): boolean {
  return frageStand(id, def, ctx).gestellt;
}

/**
 * Wie frageGestellt, dazu die Hinweise (nicht bestätigte Angaben), auf denen das „gestellt“ beruht: Eine Frage, die nur
 * wegen eines Hinweises gestellt wird (z. B. „Altbau verfahrensfrei“, weil der Umfang „Abbruch mit Ersatzbau“ nur
 * Hinweis ist), trägt ihre Antwort nicht weiter als dieser Hinweis – die Antwort bekommt in der Auswertung den Auslöser
 * als `ueberHinweis` mit, Regeln zählen dann ihn als nicht gesichert. Ebenso `ueberWiderspruch` für eine widersprüchliche
 * Angabe als Auslöser (die Regel trägt dann deren Widerspruch).
 */
export function frageStand(id: string, def: Pick<FaktDef, 'wenn'> | undefined, ctx: KurzKontext): { gestellt: boolean; ueberHinweis: string[]; ueberWiderspruch: string[] } {
  if (!def?.wenn) return { gestellt: true, ueberHinweis: [], ueberWiderspruch: [] };
  try {
    const b = werten(def.wenn, ctx);
    // widersprüchliche Angaben (nicht Merkmale – deren Vorbehalt gilt in den Regeln schon unmittelbar), auf denen ein „ja“ beruht
    const wid = b.widerspruch.filter((w) => !w.startsWith('merkmal:'));
    if (RUECKFRAGE_IDS.has(id)) return b.w === 'ja' ? { gestellt: true, ueberHinweis: b.unsicher, ueberWiderspruch: wid } : { gestellt: false, ueberHinweis: [], ueberWiderspruch: [] };
    // „ja“ nur aus Hinweisen: gestellt, die Antwort trägt die Hinweise mit; „nein“ nur aus Hinweisen verbirgt die Frage
    // nicht (die Antwort könnte zählen) – auch dann beruht das Stellen auf Hinweisen
    if (b.w !== 'nein') return { gestellt: true, ueberHinweis: b.w === 'ja' ? b.unsicher : [], ueberWiderspruch: b.w === 'ja' ? wid : [] };
    return { gestellt: b.unsicher.length > 0, ueberHinweis: b.unsicher, ueberWiderspruch: [] };
  } catch {
    return { gestellt: true, ueberHinweis: [], ueberWiderspruch: [] };
  }
}
