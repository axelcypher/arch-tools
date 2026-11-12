/**
 * Das Leistungsverzeichnis der App – unabhängig vom Dateiformat. Gelesen und geschrieben wird es als LV-Datei
 * des Originalprogramms (.aslv) oder im eigenen Format (.oalv); die App rechnet und zeigt immer dieses Modell.
 *
 * Gliederung: Abschnitte (Lose, Titel, Untertitel – so viele Ebenen wie die OZ-Maske hat) enthalten Positionen,
 * Hinweise und weitere Abschnitte; Vorbemerkungen stehen vor der ersten Gliederungsebene.
 */

import type { Formattext } from '../format/rtf';

/** Art der Position – wie sie in die Summen eingeht */
export type PositionsArt =
  /** gewöhnliche Position */
  | 'normal'
  /** Bedarfsposition (Eventualposition): mit Einheitspreis, ohne Gesamtbetrag */
  | 'bedarf'
  /** Wahlposition (Alternative zu einer Grundposition): ohne Gesamtbetrag */
  | 'wahl'
  /** Grundposition, zu der es Wahlpositionen gibt */
  | 'grund'
  /** Zulageposition: Zuschlag auf eine andere Position */
  | 'zulage';

export const POSITIONSARTEN: { id: PositionsArt; name: string; text: string; nurEigen?: boolean }[] = [
  { id: 'normal', name: 'Normalposition', text: 'geht mit Menge × Einheitspreis in die Summe ein' },
  { id: 'bedarf', name: 'Bedarfsposition', text: 'Eventualposition: Einheitspreis wird angeboten, ohne Gesamtbetrag' },
  { id: 'grund', name: 'Grundposition', text: 'hat Wahlpositionen als Alternative; geht in die Summe ein', nurEigen: true },
  { id: 'wahl', name: 'Wahlposition', text: 'Alternative zu einer Grundposition, ohne Gesamtbetrag', nurEigen: true },
  { id: 'zulage', name: 'Zulageposition', text: 'Zuschlag zu einer anderen Position, geht in die Summe ein', nurEigen: true },
];

/** zählt die Position in die Summe? */
export const zaehltInSumme = (a: PositionsArt) => a === 'normal' || a === 'grund' || a === 'zulage';

/** Preis eines Bieters für eine Position */
export interface Preis {
  /** Einheitspreis netto; null = nicht angeboten */
  ep: number | null;
  /** Menge des Bieters, wenn abweichend (z. B. Kostenansatz) */
  menge?: number | null;
  /** Anteile des Einheitspreises (Lohn, Stoffe, Geräte, Sonstige) */
  anteile?: (number | null)[];
  /** Pauschalpreis statt Menge × EP (z. B. „psch“) */
  pauschal?: number | null;
  /** Bemerkung der Prüfung („rechnerisch berichtigt“, „Nebenangebot“ …) */
  bemerkung?: string;
}

interface Element {
  /** Kennung in der App (bleibt beim Speichern) */
  id: string;
  /** Kennung in der LV-Datei des Originalprogramms (Attribut ID) */
  xmlId?: number;
  /** Kurztext (eine Zeile) */
  kurztext: string;
  /** Langtext */
  langtext: Formattext;
  /** Nachtrag, mit dem das Element dazukam (0 = Hauptauftrag) */
  nachtrag?: number;
}

export interface Abschnitt extends Element {
  art: 'abschnitt';
  /** OZ dieser Ebene, z. B. „01“ */
  oz: string;
  kinder: LvElement[];
}

export interface Position extends Element {
  art: 'position';
  /** OZ der Position innerhalb ihres Abschnitts, z. B. „0010“ */
  oz: string;
  einheit: string;
  /** LV-Menge; null = ohne Menge */
  menge: number | null;
  positionsart: PositionsArt;
  /** Kostengruppe nach DIN 276 (z. B. „345“) */
  kostengruppe?: string;
  /** Preise je Bieter (Schlüssel: Bieter-ID, 0 = Kostenansatz) */
  preise: Record<string, Preis>;
  /** Bezug für Wahl- und Zulagepositionen (id der Grund- bzw. Hauptposition) */
  bezug?: string;
  /** Stundenlohnarbeiten */
  stundenlohn?: boolean;
}

export interface Hinweis extends Element {
  art: 'hinweis';
  /** Vorbemerkung (vor der Gliederung) statt Hinweis im Abschnitt */
  vorbemerkung?: boolean;
}

export type LvElement = Abschnitt | Position | Hinweis;

export interface Bieter {
  /** 0 = Kostenansatz (eigene Kostenberechnung), ab 1 die Bieter */
  id: number;
  name: string;
  /** Anschrift (mehrzeilig) */
  anschrift?: string;
  /** Nachlass in % (negativ = Abzug, wie im Originalprogramm: −2 = 2 % Nachlass) */
  nachlass?: number;
  /** Skonto in % bei Zahlung innerhalb der Frist */
  skonto?: number;
  skontoTage?: number;
  /** Datum des Angebots (JJJJ-MM-TT) */
  angebotsdatum?: string;
  /** Angebot geht nicht in den Preisspiegel ein (ausgeschlossen, zurückgezogen) */
  ausgeschlossen?: boolean;
  bemerkung?: string;
  kontakt?: { email?: string; telefon?: string };
}

/** Ebene der Ordnungszahl */
export interface OzEbene {
  name: string;
  /** Stellen */
  stellen: number;
  /** Schrittweite neuer Nummern */
  schritt: number;
  aktiv: boolean;
}

export interface OzMaske {
  /** Ebenen über den Positionen (Los, Abschnitt, Titel, Untertitel …) – nur aktive zählen */
  ebenen: OzEbene[];
  /** Positionsnummer */
  position: { stellen: number; schritt: number };
}

export interface Einbehalt {
  text: string;
  art: 'vertragserfuellung' | 'gewaehrleistung' | 'sonstig';
  /** in % der Auftrags- bzw. Abrechnungssumme */
  prozent?: number;
  /** vom Bruttobetrag */
  brutto: boolean;
}

export interface Nachtrag {
  nr: number;
  titel: string;
  datum?: string;
  status: 'angeboten' | 'beauftragt' | 'abgelehnt';
  /** Betrag netto (ohne Positionen von Hand; sonst Summe der Positionen mit diesem Nachtrag) */
  betrag?: number;
  bemerkung?: string;
}

export interface Auftrag {
  /** Bieter, der den Auftrag bekommen hat */
  bieterId: number;
  datum?: string;
  /** Auftragssumme netto, wenn abweichend vom Angebot (Verhandlung) */
  summeNetto?: number;
  bemerkung?: string;
}

export interface LvKopf {
  /** Bezeichnung, z. B. „G13 Fliesenarbeiten“ */
  bezeichnung: string;
  /** LV-Nummer */
  nummer?: string;
  /** Datum des LV (JJJJ-MM-TT) */
  datum?: string;
  /** Angebotsabgabe / Submission (JJJJ-MM-TTThh:mm) */
  eroeffnung?: string;
  /** Bindefrist (JJJJ-MM-TT) */
  bindefrist?: string;
  ausfuehrungVon?: string;
  ausfuehrungBis?: string;
  vergabeart?: string;
  /** Projektbezeichnung im LV (mehrzeilig) */
  projekt?: string;
  projektName?: string;
  auftraggeber?: string;
  ersteller?: string;
  /** Ort der Angebotsabgabe */
  abgabeort?: string;
  waehrung: string;
  /** Umsatzsteuer in % */
  mwst: number;
  /** Kostengliederung, z. B. „din276-08“ */
  kostengliederung?: string;
}

export interface Lv {
  kopf: LvKopf;
  ozMaske: OzMaske;
  /** Namen der Preisanteile (Löhne, Stoffe, Geräte, Sonstige) */
  preisanteile: string[];
  bieter: Bieter[];
  elemente: LvElement[];
  einbehalte: Einbehalt[];
  auftrag: Auftrag | null;
  nachtraege: Nachtrag[];
}

/* ---------- Helfer ---------- */

let zaehler = 0;
export const neueId = (praefix = 'e') => `${praefix}${Date.now().toString(36)}${(zaehler++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export const STANDARD_OZ_MASKE: OzMaske = {
  ebenen: [
    { name: 'Abschnitt', stellen: 2, schritt: 1, aktiv: true },
    { name: 'Titel', stellen: 2, schritt: 1, aktiv: true },
  ],
  position: { stellen: 4, schritt: 10 },
};

export function leeresLv(bezeichnung = 'Neues Leistungsverzeichnis'): Lv {
  return {
    kopf: { bezeichnung, waehrung: 'EUR', mwst: 19, kostengliederung: 'din276-08', datum: heuteIso() },
    ozMaske: structuredClone(STANDARD_OZ_MASKE),
    preisanteile: ['Löhne', 'Stoffe', 'Geräte', 'Sonstige'],
    bieter: [{ id: 0, name: 'Kostenansatz LV' }],
    elemente: [],
    einbehalte: [
      { text: 'Vertragserfüllung (Sicherheit)', art: 'vertragserfuellung', brutto: true },
      { text: 'Gewährleistung (Mängelansprüche)', art: 'gewaehrleistung', brutto: true },
    ],
    auftrag: null,
    nachtraege: [],
  };
}

export function heuteIso(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** alle Elemente in Lesereihenfolge mit ihrem Pfad (Abschnitte darüber) */
export function* durchlaufen(elemente: LvElement[], pfad: Abschnitt[] = []): Generator<{ el: LvElement; pfad: Abschnitt[] }> {
  for (const el of elemente) {
    yield { el, pfad };
    if (el.art === 'abschnitt') yield* durchlaufen(el.kinder, [...pfad, el]);
  }
}

export function positionen(lv: Lv): { pos: Position; pfad: Abschnitt[] }[] {
  const out: { pos: Position; pfad: Abschnitt[] }[] = [];
  for (const { el, pfad } of durchlaufen(lv.elemente)) if (el.art === 'position') out.push({ pos: el, pfad });
  return out;
}

export function finde(elemente: LvElement[], id: string): { el: LvElement; eltern: LvElement[]; index: number; pfad: Abschnitt[] } | null {
  const suche = (liste: LvElement[], pfad: Abschnitt[]): ReturnType<typeof finde> => {
    for (let i = 0; i < liste.length; i++) {
      const el = liste[i];
      if (el.id === id) return { el, eltern: liste, index: i, pfad };
      if (el.art === 'abschnitt') {
        const r = suche(el.kinder, [...pfad, el]);
        if (r) return r;
      }
    }
    return null;
  };
  return suche(elemente, []);
}

/** vollständige OZ, z. B. „01.02.0010“ */
export function ozVoll(pfad: Abschnitt[], el: LvElement): string {
  const teile = pfad.map((a) => a.oz);
  if (el.art !== 'hinweis') teile.push(el.oz);
  return teile.filter(Boolean).join('.');
}

/** OZ auf die Stellen der Maske bringen (führende Nullen) */
export function ozFormat(oz: string, stellen: number): string {
  return /^\d+$/.test(oz) && oz.length < stellen ? oz.padStart(stellen, '0') : oz;
}

/** Elementliste unveränderlich ändern: Element mit `id` durch das Ergebnis von `f` ersetzen */
export function aendereElement(elemente: LvElement[], id: string, f: (el: LvElement) => LvElement): LvElement[] {
  let gefunden = false;
  const rek = (liste: LvElement[]): LvElement[] =>
    liste.map((el) => {
      if (gefunden) return el;
      if (el.id === id) {
        gefunden = true;
        return f(el);
      }
      if (el.art === 'abschnitt') {
        const kinder = rek(el.kinder);
        return kinder === el.kinder || !gefunden ? el : { ...el, kinder };
      }
      return el;
    });
  return rek(elemente);
}

export function entferneElement(elemente: LvElement[], id: string): LvElement[] {
  const rek = (liste: LvElement[]): LvElement[] => liste.filter((el) => el.id !== id).map((el) => (el.art === 'abschnitt' ? { ...el, kinder: rek(el.kinder) } : el));
  return rek(elemente);
}

/** Element einfügen: in den Abschnitt `in` (null = oberste Ebene) an Stelle `index` (Ende, wenn nicht angegeben) */
export function fuegeEin(elemente: LvElement[], el: LvElement, inId: string | null, index?: number): LvElement[] {
  if (inId === null) {
    const neu = [...elemente];
    neu.splice(index ?? neu.length, 0, el);
    return neu;
  }
  return aendereElement(elemente, inId, (a) => {
    if (a.art !== 'abschnitt') return a;
    const kinder = [...a.kinder];
    kinder.splice(index ?? kinder.length, 0, el);
    return { ...a, kinder };
  });
}

/** nächste freie OZ in einer Liste (Abschnitte bzw. Positionen) nach der Maske */
export function naechsteOz(geschwister: LvElement[], art: 'abschnitt' | 'position', stellen: number, schritt: number): string {
  const nummern = geschwister.filter((g) => g.art === art).map((g) => Number((g as Abschnitt | Position).oz)).filter((n) => Number.isFinite(n));
  const n = nummern.length ? Math.max(...nummern) + schritt : schritt;
  return String(n).padStart(stellen, '0');
}

/** Positionen in einer Elementliste neu durchnummerieren (je Abschnitt bei Schritt beginnend) */
export function neuNummerieren(elemente: LvElement[], maske: OzMaske, tiefe = 0): LvElement[] {
  const ebene = maske.ebenen.filter((e) => e.aktiv)[tiefe];
  let a = 0;
  let p = 0;
  return elemente.map((el) => {
    if (el.art === 'abschnitt') {
      a += ebene?.schritt ?? 1;
      return { ...el, oz: String(a).padStart(ebene?.stellen ?? 2, '0'), kinder: neuNummerieren(el.kinder, maske, tiefe + 1) };
    }
    if (el.art === 'position') {
      p += maske.position.schritt;
      return { ...el, oz: String(p).padStart(maske.position.stellen, '0') };
    }
    return el;
  });
}

/** Kopie eines Elements mit neuen Kennungen (ohne Bezug zur Datei) */
export function elementKopie(el: LvElement): LvElement {
  const basis = { ...structuredClone(el), id: neueId(), xmlId: undefined };
  if (basis.art === 'abschnitt') basis.kinder = el.art === 'abschnitt' ? el.kinder.map(elementKopie) : [];
  return basis;
}
