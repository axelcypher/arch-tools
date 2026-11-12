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
    ozMaske: d.lv.ozMaske ?? basis.ozMaske,
    bieter: Array.isArray(d.lv.bieter) && d.lv.bieter.length ? d.lv.bieter : basis.bieter,
    elemente: idsSichern(Array.isArray(d.lv.elemente) ? d.lv.elemente : []),
    einbehalte: d.lv.einbehalte ?? basis.einbehalte,
    nachtraege: d.lv.nachtraege ?? [],
    auftrag: d.lv.auftrag ?? null,
  };
  return { lv, roh: roh as Record<string, unknown> };
}

/** jedes Element braucht eine Kennung; xmlId gehört nur zur Datei des Originalprogramms */
function idsSichern(el: LvElement[]): LvElement[] {
  return el.map((e) => {
    const basis = { ...e, id: e.id || neueId(), xmlId: undefined, langtext: Array.isArray(e.langtext) ? e.langtext : [] };
    return basis.art === 'abschnitt' ? { ...basis, kinder: idsSichern(basis.kinder ?? []) } : basis;
  }) as LvElement[];
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
