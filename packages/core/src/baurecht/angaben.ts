/**
 * Angaben von Hand und Bestätigungen – als reine Funktionen, damit die Vorschau im Dialog und die Übernahme in den
 * Zustand genau dasselbe rechnen (docs/baurecht.md, „Hinweise bestätigen“).
 */
import { mitDienst } from './geodienste';
import type { FaktWert } from './typen';

export interface AngabeOptionen {
  von: string;
  /** Beleg (worauf gestützt) – mit Beleg gilt die Angabe als bestätigt */
  grund?: string;
  /** Lage, an die die Angabe gebunden wird; `null` = sie müsste gebunden werden, es gibt aber keine Koordinaten */
  lage?: string | null;
  heute: string;
  /** Desktop-App (für die Hinweistexte: „Lage abfragen“ gibt es nur dort) */
  desktop?: boolean;
}

const OHNE_LAGE = 'ohne Koordinaten an keine Lage gebunden – bitte Adresse/Koordinaten in den Stammdaten eintragen';

/** das Ergebnis eines Dienstes, das an einer Angabe hängt: bei Werten des Dienstes der Wert selbst, sonst `dienst` */
export function dienstVon(f: FaktWert | undefined): FaktWert['dienst'] {
  if (!f) return undefined;
  if (f.herkunft === 'geodienst') return { wert: f.wert, sicherheit: f.sicherheit, ...(f.quelle ? { quelle: f.quelle } : {}), ...(f.stand ? { stand: f.stand } : {}) };
  return f.dienst;
}

/**
 * Angabe von Hand. Mit Beleg wie eine Bestätigung (bei Lagebezug an die Lage gebunden; ohne Koordinaten nur Hinweis).
 * Das letzte Ergebnis eines Dienstes bleibt an der Angabe, der Widerspruch wird daraus bestimmt.
 */
export function angabeVonHand(alt: FaktWert | undefined, id: string, wert: FaktWert['wert'], o: AngabeOptionen): FaktWert {
  const f: FaktWert = { wert, herkunft: 'manuell', sicherheit: 'sicher', stand: o.heute, quelle: o.von ? `von Hand (${o.von})` : 'von Hand' };
  const grund = o.grund?.trim();
  // Gemeindeschlüssel von Hand steuert Gebietsmodule und Schutzgebietswerte: nur Hinweis, bis er mit Beleg bestätigt ist
  if (id === 'lage.ags' && !grund) Object.assign(f, { sicherheit: 'hinweis', grund: `von Hand eingetragen – bitte mit Beleg bestätigen (z. B. Flurstücksnachweis)${o.desktop ? ' oder „Lage abfragen“' : ''}` });
  if (grund && o.lage !== null) f.bestaetigt = { von: o.von, am: o.heute, grund, ...(o.lage ? { lage: o.lage } : {}) };
  if (grund && o.lage === null) Object.assign(f, { sicherheit: 'hinweis', grund: `${OHNE_LAGE} (Beleg: ${grund})` });
  // Angaben zur Lage (Gemeindeschlüssel, Altlasten, Kampfmittel …) gelten auch ohne Beleg nur für diese Lage: ändert
  // sich die Adresse, werden sie zum Hinweis; ohne Koordinaten sind sie von vornherein nur Hinweis
  if (!grund && o.lage) f.lage = o.lage;
  if (!grund && o.lage === null) Object.assign(f, { sicherheit: 'hinweis', grund: OHNE_LAGE });
  return mitDienst(f, dienstVon(alt));
}

/**
 * Hinweis als gesichert übernehmen. Ein Widerspruch eines Dienstes bleibt bestehen (aus dem gespeicherten Ergebnis neu
 * bestimmt) – die Bestätigung löscht ihn nicht.
 */
export function hinweisBestaetigen(wert: FaktWert, o: AngabeOptionen & { grund: string }): FaktWert {
  const { widerspruch: _w, bestaetigt: _b, ...ohne } = wert;
  const f: FaktWert = o.lage === null ? { ...ohne, grund: OHNE_LAGE } : { ...ohne, bestaetigt: { von: o.von, am: o.heute, grund: o.grund.trim(), ...(o.lage ? { lage: o.lage } : {}) } };
  return wert.dienst ? mitDienst(f, wert.dienst) : f;
}
