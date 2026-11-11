import type { AbzugArt, Massgrundlage, Nutzungsgruppe, ProjectSettings, Raumumschliessung, Storey, WoflAngaben, WoflKategorie } from './model';
import { istKellergeschoss } from './model';

/** Nutzungsgruppen der Netto-Raumfläche nach DIN 277 (Tabelle 1). */
export const NUTZUNGSGRUPPEN: { id: Nutzungsgruppe; kurz: string; label: string; bereich: 'NUF' | 'TF' | 'VF'; color: string }[] = [
  { id: 'NUF1', kurz: 'NUF 1', label: 'Wohnen und Aufenthalt', bereich: 'NUF', color: '#f4c95d' },
  { id: 'NUF2', kurz: 'NUF 2', label: 'Büroarbeit', bereich: 'NUF', color: '#8ecae6' },
  { id: 'NUF3', kurz: 'NUF 3', label: 'Produktion, Hand- und Maschinenarbeit, Forschung und Entwicklung', bereich: 'NUF', color: '#b5838d' },
  { id: 'NUF4', kurz: 'NUF 4', label: 'Lagern, Verteilen und Verkaufen', bereich: 'NUF', color: '#cdb4db' },
  { id: 'NUF5', kurz: 'NUF 5', label: 'Bildung, Unterricht und Kultur', bereich: 'NUF', color: '#90be6d' },
  { id: 'NUF6', kurz: 'NUF 6', label: 'Heilen und Pflegen', bereich: 'NUF', color: '#f28482' },
  { id: 'NUF7', kurz: 'NUF 7', label: 'Sonstige Nutzungen', bereich: 'NUF', color: '#e9c46a' },
  { id: 'TF', kurz: 'TF 8', label: 'Technische Anlagen', bereich: 'TF', color: '#a8a8a8' },
  { id: 'VF', kurz: 'VF 9', label: 'Verkehrserschließung und -sicherung', bereich: 'VF', color: '#f5a65b' },
];

export const NUF_IDS: Nutzungsgruppe[] = ['NUF1', 'NUF2', 'NUF3', 'NUF4', 'NUF5', 'NUF6', 'NUF7'];

export function nutzungInfo(id: Nutzungsgruppe) {
  return NUTZUNGSGRUPPEN.find((n) => n.id === id) ?? NUTZUNGSGRUPPEN[0];
}

/** Nutzungsgruppe aus der Nummer einer Nutzungsart (zweite Ebene): „7.1“ → NUF 7, „8.…“ → TF, „9.…“ → VF */
export function gruppeAusNutzungsart(nr: string | undefined): Nutzungsgruppe | undefined {
  const m = /^\s*([1-9])(?:\.|$)/.exec(nr ?? '');
  if (!m) return undefined;
  const d = Number(m[1]);
  return d <= 7 ? (`NUF${d}` as Nutzungsgruppe) : d === 8 ? 'TF' : 'VF';
}

/** Nutzungsgruppe eines Raums: aus der Nutzungsart, wenn eine angegeben ist, sonst die gewählte Gruppe */
export function raumNutzung(r: { nutzung: Nutzungsgruppe; nutzungsart?: string }): Nutzungsgruppe {
  return gruppeAusNutzungsart(r.nutzungsart) ?? r.nutzung;
}

/** Raumumschließung nach DIN 277:2021-08 (sinngemäß): kurz für Auswahllisten, label als Erläuterung */
export const UMSCHLIESSUNG: { id: Raumumschliessung; kurz: string; label: string }[] = [
  { id: 'R', kurz: 'R – Regelfall', label: 'R – Regelfall: allseitig in voller Höhe umschlossen' },
  { id: 'S', kurz: 'S – Sonderfall', label: 'S – Sonderfall: nicht allseitig in voller Höhe umschlossen (z. B. Balkon, Loggia, Terrasse, Dachterrasse)' },
];

export const WOFL_KATEGORIEN: { id: WoflKategorie; label: string; faktor: number | null }[] = [
  { id: 'keine', label: 'keine Wohnfläche', faktor: 0 },
  { id: 'voll', label: 'lichte Höhe ≥ 2 m (100 %)', faktor: 1 },
  { id: 'halb', label: 'lichte Höhe 1–2 m (50 %)', faktor: 0.5 },
  { id: 'null', label: 'lichte Höhe < 1 m (0 %)', faktor: 0 },
  { id: 'wintergarten', label: 'unbeheizbarer Wintergarten, Schwimmbad u. ä. (50 %)', faktor: 0.5 },
  { id: 'freisitz', label: 'Balkon, Loggia, Dachgarten, Terrasse (25–50 %)', faktor: null },
  { id: 'hoehen', label: 'Raumteile nach lichter Höhe (Teilflächen)', faktor: null },
  { id: 'individuell', label: 'individueller Faktor', faktor: null },
];

/** Hilfetext je Anrechnung (Eigenschaften) */
export const WOFL_HINWEIS: Partial<Record<WoflKategorie, string>> = {
  wintergarten: 'nur unbeheizbare Wintergärten, Schwimmbäder u. ä. (§ 4 Nr. 3 WoFlV); beheizbare Wintergärten: „lichte Höhe ≥ 2 m (100 %)“ wählen',
  hoehen: 'Teilflächen nach lichter Höhe: ≥ 2 m voll, 1–2 m zur Hälfte, < 1 m nicht (§ 4 Nr. 1–2 WoFlV)',
};

/** Was eine Abzugsfläche im Raum mindert */
export const ABZUG_ARTEN: { id: AbzugArt; label: string; hint: string }[] = [
  { id: 'beide', label: 'NRF und Wohnfläche', hint: 'z. B. Schornstein, Pfeiler über 0,1 m² und 1,50 m Höhe, Schacht im Raum' },
  { id: 'wofl', label: 'nur Wohnfläche (§ 3 Abs. 3 WoFlV)', hint: 'z. B. Treppe mit mehr als drei Steigungen samt Treppenabsatz – bleibt Teil der NRF (Verkehrsfläche)' },
  { id: 'din', label: 'nur NRF (DIN 277)', hint: 'z. B. Pfeiler bis 0,1 m², der nach WoFlV zur Wohnfläche zählt' },
];

/** Maßgrundlage der Flächen */
export const MASSGRUNDLAGEN: { id: Massgrundlage; label: string; text: string }[] = [
  { id: 'rohbau', label: 'Planmaß Rohbau', text: 'Flächen aus Planmaßen (Rohbau), Putzabzug je Raum' },
  { id: 'fertig', label: 'Planmaß Fertigmaß', text: 'Flächen aus Planmaßen (Fertigmaße)' },
  { id: 'aufmass', label: 'Aufmaß', text: 'Flächen aus örtlichem Aufmaß' },
];

/** Anrechnungsfaktor nach WoFlV § 4 für einen Raum. */
export function woflFaktor(w: WoflAngaben, settings: ProjectSettings): number {
  switch (w.kategorie) {
    case 'keine':
    case 'null':
      return 0;
    case 'voll':
      return 1;
    case 'halb':
    case 'wintergarten':
      return 0.5;
    case 'freisitz': {
      // WoFlV: "in der Regel zu einem Viertel, höchstens jedoch zur Hälfte"; II. BV (Altberechnung): bis zur Hälfte
      const f = w.faktor ?? (settings.zweiteBV ? 0.5 : settings.freisitzFaktor);
      return clamp(f, 0, 0.5);
    }
    case 'individuell':
      return clamp(w.faktor ?? 1, 0, 1);
    case 'hoehen': {
      // Raumteile ≥ 2 m voll, 1–2 m zur Hälfte, < 1 m nicht – exakt aus den Teilflächen, ohne gerundeten Faktor
      const a = w.anteile ?? { h2: 1, h12: 0, h01: 0 };
      return clamp(a.h2 + 0.5 * a.h12, 0, 1);
    }
  }
}

function clamp(v: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, v));
}

/**
 * Zählt ein Raum nach WoFlV zur Wohnfläche? Nicht dazu gehören (§ 2 Abs. 3) Zubehörräume wie Keller,
 * Abstellräume außerhalb der Wohnung, Waschküchen, Trockenräume, Heizungsräume, Garagen, Dachböden,
 * außerdem Treppen mit mehr als drei Steigungen und Räume, die Technik aufnehmen.
 */
const KEINE_WOFL = /keller|heiz|technik|hausanschluss|elektro|lüftung|server|garage|carport|stellplatz|waschküche|waschkueche|trockenraum|trockenboden|dachboden|spitzboden|\bboden\b|lager|fahrrad|müll|muell|tank|treppenhaus|treppenraum|^\s*treppe\s*$|\btr\b|\bth\b|aufzug|schacht/i;
/** Raum mit Treppe, aber kein eigener Treppenraum (z. B. „Diele/Treppe“): nur die Treppenfläche entfällt */
const TREPPE_IM_RAUM = /treppe/i;
const FREISITZ = /balkon|loggia|terrasse|dachgarten|freisitz/i;
const KEINE_WOFL_GESCHOSS = /spitzboden|dachboden|^dach$/i;

/**
 * Vorschlag der WoFlV-Einstufung nach Raumname und Geschoss. Kellergeschoss nach der Geschossart (Storey.keller),
 * ohne Angabe nach dem Namen – als Text übergeben gilt nur der Name.
 */
export function woflArt(raum: string, geschoss: string | Pick<Storey, 'name' | 'keller'>, nutzung: Nutzungsgruppe): 'wohnen' | 'freisitz' | 'keine' {
  const g = typeof geschoss === 'string' ? { name: geschoss } : geschoss;
  void nutzung; // die Nutzungsgruppe entscheidet nicht: HWR (NUF 7) zählt wie „Hauswirtschaft“, Technik nach dem Namen
  if (FREISITZ.test(raum)) return 'freisitz';
  if (KEINE_WOFL.test(raum) || istKellergeschoss(g) || KEINE_WOFL_GESCHOSS.test(g.name.trim())) return 'keine';
  return 'wohnen';
}

/**
 * Hinweis zum Vorschlag nach Raumname: Ein Raum mit Treppe, der kein eigener Treppenraum ist, zählt zur Wohnfläche –
 * nur die Treppenfläche (mehr als drei Steigungen, mit Absätzen) entfällt (§ 3 Abs. 3 Nr. 2 WoFlV).
 */
export function woflHinweis(raum: string): string | undefined {
  if (TREPPE_IM_RAUM.test(raum) && !KEINE_WOFL.test(raum)) return 'Treppe im Raum: Treppenfläche als Abzugsfläche „nur Wohnfläche“ erfassen (§ 3 Abs. 3 Nr. 2 WoFlV)';
  return undefined;
}
