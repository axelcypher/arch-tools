/**
 * Namen von Antragsfassungen – Ordner im Antragsordner (z. B. `TÖB/BAUA 2`) und Unterordner eines Sammelprojekts im
 * Formularprojekt: die Antragsart mit laufender Nummer, hinten („BAUA 2“, „BAUA_2“, „BAUA-2“, „BAUA2“) oder vorn
 * („2 BAUA“, „2. BAUA“, „02. BAUA“, „02 BAUA“, „2.BAUA“, „02_BAUA“). Ohne Nummer ist es die erste Fassung („BAUA“).
 * Ein Zusatz nach einem Leerzeichen zählt nicht mit („BAUA 2 Nachtrag“, „02. BAUA Umbau“). Gleichwertige Schreibweisen
 * der Antragsart (Namensschema: BVA = BAUVA) gelten als dieselbe Art.
 */
import type { Kuerzel } from './namensschema';
import { kuerzelZu, regexText } from './namensschema';

/** Schreibweise der Nummer: vorn oder hinten, Stellen („02“ = 2), Punkt dahinter („2.“) und Trenner zur Art */
export interface FassungsForm {
  vorn: boolean;
  stellen: number;
  punkt: boolean;
  trenner: string;
}

export interface FassungsName {
  /** Antragsart in der Schreibweise des Namens, groß („BVA“) */
  art: string;
  /** laufende Nummer (ohne Nummer: 1) */
  nr: number;
  /** Schreibweise der Nummer – fehlt ohne Nummer */
  form?: FassungsForm;
}

/**
 * Art und Nummer aus einem Ordnernamen – null, wenn er mit keiner der Antragsarten (`arten`, alle Schreibweisen)
 * gebildet ist. Nach der Nummer endet der Name oder es folgt ein Zusatz nach Leerzeichen, Punkt, „_“ oder „-“ („BAUA
 * 2-Nachtrag“ ist Fassung 2); vorn hat die Nummer höchstens zwei Stellen („2023 BAUA“ ist keine Fassung).
 */
export function fassungAus(name: string, arten: string[]): FassungsName | null {
  const n = name.trim();
  for (const a of arten) {
    const t = regexText(a.trim());
    if (!t) continue;
    const hinten = new RegExp(`^${t}(?:([\\s_-]*)(\\d+)(?=$|[\\s._-]))?(?:[\\s._-].*)?$`, 'i').exec(n);
    if (hinten)
      return { art: a.trim().toUpperCase(), nr: hinten[2] ? Number(hinten[2]) : 1, ...(hinten[2] ? { form: { vorn: false, stellen: hinten[2].length, punkt: false, trenner: hinten[1] } } : {}) };
    const vorn = new RegExp(`^(\\d{1,2})(\\.?)([\\s_-]*)${t}(?:[\\s._-].*)?$`, 'i').exec(n);
    if (vorn) return { art: a.trim().toUpperCase(), nr: Number(vorn[1]), form: { vorn: true, stellen: vorn[1].length, punkt: !!vorn[2], trenner: vorn[3] } };
  }
  return null;
}

/**
 * Antragsart einer Fassung („BAUA 2“, „02. BAUA“, „BAUA 2 Nachtrag“ → „BAUA“). Mit `arten` (alle Schreibweisen) nach
 * `fassungAus`; sonst – oder wenn keine passt – die Buchstaben am Anfang nach einer Nummer vorn, groß geschrieben.
 */
export function artDerFassung(name: string, arten: string[] = []): string {
  const gefunden = fassungAus(name, arten)?.art;
  if (gefunden) return gefunden;
  const ohneNummer = name.trim().replace(/^\d{1,2}\.?[\s_-]*(?=\D)/, '');
  return (/^[A-Za-zÄÖÜäöüß]+/.exec(ohneNummer)?.[0] ?? ohneNummer).toUpperCase();
}

/** Name einer Fassung in einer Schreibweise: ohne `form` „BAUA“ bzw. „BAUA 2“, sonst wie die Vorlage („03. BAUA“) */
export function fassungsName(art: string, nr: number, form?: FassungsForm): string {
  const a = art.trim().toUpperCase();
  if (!form) return nr <= 1 ? a : `${a} ${nr}`;
  const zahl = String(nr).padStart(form.stellen, '0');
  return form.vorn ? `${zahl}${form.punkt ? '.' : ''}${form.trenner}${a}` : `${a}${form.trenner}${zahl}`;
}

/**
 * Sind zwei Namen dieselbe Fassung? Gleiche Antragsart (gleichwertige Schreibweisen nach `antragsarten`) und gleiche
 * Nummer – „BAUA 2“ im Antragsordner ist „2. BAUA“ im Formularprojekt; „BAUA“ ist „BAUA 1“ und „01 BAUA“.
 */
export function gleicheFassung(a: string, b: string, antragsarten: Kuerzel[], arten: string[]): boolean {
  const x = fassungAus(a, arten);
  const y = fassungAus(b, arten);
  if (!x || !y || x.nr !== y.nr) return false;
  const haupt = (art: string) => kuerzelZu(antragsarten, art)?.kuerzel ?? art;
  return haupt(x.art) === haupt(y.art);
}
