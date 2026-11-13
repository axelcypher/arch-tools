/**
 * Eigenes LV-Format (.oalv), damit die App auch ohne das Originalprogramm vollständig nutzbar ist: JSON mit dem
 * LV-Modell der App – Gliederung, Texte (formatiert), Bieter, Preise, Auftrag, Nachträge – und dem, was die
 * LV-Datei des Originalprogramms nicht aufnehmen kann (Wahl-, Grund- und Zulagepositionen, Bemerkungen der
 * Angebotsprüfung, Skonto). Lesbar mit jedem Texteditor; unbekannte Felder späterer Versionen bleiben erhalten.
 */

import type { Lv } from '../lv/modell';
import { leeresLv, neueId } from '../lv/modell';
import type { LvElement } from '../lv/modell';

export const EIGEN_ENDUNG = 'oalv';
export const EIGEN_FORMAT = 'arch-tools-lv';
export const EIGEN_VERSION = 1;

interface Datei {
  format: string;
  version: number;
  app?: string;
  gespeichert?: string;
  lv: Lv;
  [weiter: string]: unknown;
}

export function eigenLesen(bytes: Uint8Array): { lv: Lv; roh: Record<string, unknown> } {
  let roh: unknown;
  try {
    roh = JSON.parse(new TextDecoder('utf-8').decode(bytes));
  } catch {
    throw new Error('Keine LV-Datei (.oalv): kein gültiges JSON.');
  }
  const d = roh as Partial<Datei>;
  if (!d || d.format !== EIGEN_FORMAT || typeof d.lv !== 'object' || !d.lv) throw new Error('Keine LV-Datei (.oalv) dieser App.');
  if ((d.version ?? 0) > EIGEN_VERSION) throw new Error(`Die LV-Datei stammt aus einer neueren Version der App (Format ${d.version}) – bitte die App aktualisieren.`);
  const basis = leeresLv();
  const lv: Lv = {
    ...basis,
    ...d.lv,
    kopf: { ...basis.kopf, ...d.lv.kopf },
    ozMaske: d.lv.ozMaske && Array.isArray(d.lv.ozMaske.ebenen) && d.lv.ozMaske.position ? d.lv.ozMaske : basis.ozMaske,
    bieter: Array.isArray(d.lv.bieter) && d.lv.bieter.length ? d.lv.bieter : basis.bieter,
    elemente: idsSichern(Array.isArray(d.lv.elemente) ? d.lv.elemente : []),
    einbehalte: Array.isArray(d.lv.einbehalte) ? d.lv.einbehalte : basis.einbehalte,
    nachtraege: Array.isArray(d.lv.nachtraege) ? d.lv.nachtraege : [],
    preisanteile: Array.isArray(d.lv.preisanteile) ? d.lv.preisanteile : basis.preisanteile,
    auftrag: d.lv.auftrag ?? null,
  };
  return { lv, roh: roh as Record<string, unknown> };
}

/** jedes Element braucht eine Kennung; xmlId gehört nur zur Datei des Originalprogramms */
function idsSichern(el: LvElement[]): LvElement[] {
  return el
    .filter((e) => !!e && typeof e === 'object')
    .map((e) => {
      const basis = { ...e, id: e.id || neueId(), xmlId: undefined, kurztext: typeof e.kurztext === 'string' ? e.kurztext : '', langtext: Array.isArray(e.langtext) ? e.langtext : [] };
      if (basis.art === 'abschnitt') return { ...basis, oz: typeof basis.oz === 'string' ? basis.oz : '', kinder: idsSichern(Array.isArray(basis.kinder) ? basis.kinder : []) };
      if (basis.art === 'position')
        return {
          ...basis,
          oz: typeof basis.oz === 'string' ? basis.oz : '',
          einheit: typeof basis.einheit === 'string' ? basis.einheit : '',
          menge: typeof basis.menge === 'number' ? basis.menge : null,
          positionsart: basis.positionsart ?? 'normal',
          preise: basis.preise && typeof basis.preise === 'object' ? basis.preise : {},
        };
      return basis;
    })
    .filter((e) => e.art === 'abschnitt' || e.art === 'position' || e.art === 'hinweis') as LvElement[];
}

export function eigenSchreiben(lv: Lv, roh: Record<string, unknown> = {}, app = __APP_VERSION__, jetzt = new Date()): Uint8Array {
  const d: Datei = { ...roh, format: EIGEN_FORMAT, version: EIGEN_VERSION, app, gespeichert: jetzt.toISOString(), lv: { ...lv, elemente: ohneXml(lv.elemente) } };
  return new TextEncoder().encode(`${JSON.stringify(d, null, 1)}\n`);
}

function ohneXml(el: LvElement[]): LvElement[] {
  return el.map((e) => {
    const { xmlId: _x, ...rest } = e;
    return rest.art === 'abschnitt' ? { ...rest, kinder: ohneXml(rest.kinder) } : rest;
  }) as LvElement[];
}
