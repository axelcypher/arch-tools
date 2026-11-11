import { create } from 'zustand';
import type { Nutzungsgruppe, Project, RoomShape, Storey, WoflKategorie } from '@core/model';
import { istKellergeschoss } from '@core/model';
import { gruppeAusNutzungsart, NUTZUNGSGRUPPEN, WOFL_KATEGORIEN } from '@core/norms';
import { konfigLesen } from '@core/platform/konfig';
import { logger } from '@core/platform/log';

/**
 * Raumkatalog des Büros (F-11) und Nutzungsarten als zweite Ebene (F-14).
 *
 * Ein Katalogeintrag ordnet einer Raumbezeichnung Nutzungsgruppe (ggf. Nutzungsart) nach DIN 277 und
 * WoFlV-Anrechnung zu. Die Auswahl setzt beides; das Ergebnis ist ein Vorschlag („aus Katalog“), der sich je Raum
 * ändern lässt. Gepflegt wird der Katalog im Konfigurationsordner (`raumkatalog.json`, `nutzungsarten.json`);
 * ohne eigene Datei gilt die kleine Vorgabe unten. DIN 277 ist urheberrechtlich geschützt – die Vorgabe enthält nur
 * kurze, sinngemäße Bezeichnungen; die vollständige Tabelle pflegt das Büro selbst (es besitzt die Norm).
 * Ein Katalog darf auch im Dachgeschoss 100 % ansetzen – geprüft wird nur mit Hinweisen (Prüfliste).
 */

const log = logger('katalog');

export interface KatalogEintrag {
  name: string;
  nutzung: Nutzungsgruppe;
  /** Nutzungsart (z. B. „7.1“); bestimmt die Nutzungsgruppe mit */
  nutzungsart?: string;
  wofl: WoflKategorie;
}

export interface Nutzungsart {
  /** z. B. „7.1“ – die erste Ziffer ist die Nutzungsgruppe (1–7 NUF, 8 TF, 9 VF) */
  nr: string;
  bezeichnung: string;
}

/** Vorgabe-Katalog (büroeigene Zuordnung, sinngemäß nach DIN 277:2021-08 und WoFlV) */
export const VORGABE_KATALOG: KatalogEintrag[] = [
  { name: 'Wohnen', nutzung: 'NUF1', nutzungsart: '1.1', wofl: 'voll' },
  { name: 'Wohnen/Essen', nutzung: 'NUF1', nutzungsart: '1.1', wofl: 'voll' },
  { name: 'Essen', nutzung: 'NUF1', nutzungsart: '1.1', wofl: 'voll' },
  { name: 'Küche', nutzung: 'NUF1', nutzungsart: '1.1', wofl: 'voll' },
  { name: 'Schlafen', nutzung: 'NUF1', nutzungsart: '1.1', wofl: 'voll' },
  { name: 'Kind', nutzung: 'NUF1', nutzungsart: '1.1', wofl: 'voll' },
  { name: 'Arbeiten', nutzung: 'NUF1', nutzungsart: '1.1', wofl: 'voll' },
  { name: 'Gast', nutzung: 'NUF1', nutzungsart: '1.1', wofl: 'voll' },
  { name: 'Galerie', nutzung: 'NUF1', nutzungsart: '1.1', wofl: 'voll' },
  { name: 'Bad', nutzung: 'NUF7', nutzungsart: '7.1', wofl: 'voll' },
  { name: 'WC', nutzung: 'NUF7', nutzungsart: '7.1', wofl: 'voll' },
  { name: 'Dusche', nutzung: 'NUF7', nutzungsart: '7.1', wofl: 'voll' },
  { name: 'Diele (in der Wohnung)', nutzung: 'VF', nutzungsart: '9.1', wofl: 'voll' },
  { name: 'Flur (in der Wohnung)', nutzung: 'VF', nutzungsart: '9.1', wofl: 'voll' },
  { name: 'Flur', nutzung: 'VF', nutzungsart: '9.1', wofl: 'keine' },
  { name: 'Treppenraum', nutzung: 'VF', wofl: 'keine' },
  { name: 'Abstellraum (in der Wohnung)', nutzung: 'NUF7', nutzungsart: '7.3', wofl: 'voll' },
  { name: 'Abstellraum/Keller (außerhalb)', nutzung: 'NUF7', nutzungsart: '7.3', wofl: 'keine' },
  { name: 'HWR (in der Wohnung)', nutzung: 'NUF7', wofl: 'voll' },
  { name: 'Waschküche', nutzung: 'NUF7', wofl: 'keine' },
  { name: 'Heizung/Technik', nutzung: 'TF', wofl: 'keine' },
  { name: 'Hausanschluss', nutzung: 'TF', wofl: 'keine' },
  { name: 'Garage', nutzung: 'NUF7', nutzungsart: '7.4', wofl: 'keine' },
  { name: 'Dachboden', nutzung: 'NUF7', nutzungsart: '7.3', wofl: 'keine' },
  { name: 'Balkon', nutzung: 'NUF1', wofl: 'freisitz' },
  { name: 'Loggia', nutzung: 'NUF1', wofl: 'freisitz' },
  { name: 'Terrasse', nutzung: 'NUF1', wofl: 'freisitz' },
  { name: 'Wintergarten (unbeheizbar)', nutzung: 'NUF1', wofl: 'wintergarten' },
  { name: 'Lager', nutzung: 'NUF4', wofl: 'keine' },
  { name: 'Büro', nutzung: 'NUF2', wofl: 'keine' },
];

/** Vorgabe der Nutzungsarten: nur die gebräuchlichsten mit kurzen Bezeichnungen */
export const VORGABE_NUTZUNGSARTEN: Nutzungsart[] = [
  { nr: '1.1', bezeichnung: 'Wohnräume' },
  { nr: '7.1', bezeichnung: 'Sanitärräume' },
  { nr: '7.3', bezeichnung: 'Abstellräume' },
  { nr: '7.4', bezeichnung: 'Fahrzeugabstellflächen' },
  { nr: '9.1', bezeichnung: 'Flure, Hallen' },
];

const GRUPPEN = new Set(NUTZUNGSGRUPPEN.map((n) => n.id));
const KATEGORIEN = new Set(WOFL_KATEGORIEN.map((k) => k.id));

/** Katalog aus der Einstellungsdatei; ungültige Einträge entfallen */
export function katalogAus(roh: unknown): KatalogEintrag[] | null {
  const liste = Array.isArray(roh) ? roh : roh && typeof roh === 'object' && Array.isArray((roh as { eintraege?: unknown }).eintraege) ? (roh as { eintraege: unknown[] }).eintraege : null;
  if (!liste) return null;
  const out: KatalogEintrag[] = [];
  for (const e of liste) {
    if (!e || typeof e !== 'object') continue;
    const x = e as Record<string, unknown>;
    if (typeof x.name !== 'string' || !x.name.trim()) continue;
    const art = typeof x.nutzungsart === 'string' && x.nutzungsart.trim() ? x.nutzungsart.trim() : undefined;
    const nutzung = (GRUPPEN.has(x.nutzung as Nutzungsgruppe) ? x.nutzung : (art && gruppeAusNutzungsart(art)) || 'NUF1') as Nutzungsgruppe;
    const wofl = (KATEGORIEN.has(x.wofl as WoflKategorie) ? x.wofl : 'keine') as WoflKategorie;
    out.push({ name: x.name.trim(), nutzung, wofl, ...(art ? { nutzungsart: art } : {}) });
  }
  return out;
}

export function nutzungsartenAus(roh: unknown): Nutzungsart[] | null {
  if (!Array.isArray(roh)) return null;
  return roh
    .filter((e): e is Record<string, unknown> => !!e && typeof e === 'object')
    .filter((e) => typeof e.nr === 'string' && /^[1-9](\.\d+)*$/.test(e.nr.trim()))
    .map((e) => ({ nr: String(e.nr).trim(), bezeichnung: typeof e.bezeichnung === 'string' ? e.bezeichnung : '' }));
}

/** Katalogeintrag auf einen Raum anwenden: Name, Nutzung, Nutzungsart und Anrechnung (Wohnung bleibt) */
export function katalogAnwenden(r: RoomShape, e: KatalogEintrag): RoomShape {
  const { nutzungsart: _alt, ...rest } = r;
  void _alt;
  return {
    ...rest,
    name: e.name,
    nutzung: e.nutzung,
    ...(e.nutzungsart ? { nutzungsart: e.nutzungsart } : {}),
    katalog: e.name,
    wofl: { ...r.wofl, kategorie: e.wofl, faktor: undefined, anteile: undefined },
  };
}

/** Eintrag zu einer Bezeichnung (Groß-/Kleinschreibung egal) */
export function katalogEintrag(katalog: readonly KatalogEintrag[], name: string): KatalogEintrag | undefined {
  const n = name.trim().toLowerCase();
  return n ? katalog.find((e) => e.name.toLowerCase() === n) : undefined;
}

/** Schreibweise ohne Leerzeichen, Punkte, Bindestriche – „WE 01“ = „WE01“ = „we-01“ */
const vergleich = (s: string) => s.toLowerCase().replace(/[\s._-]+/g, '');

/** Eingabe einer Wohnung: entspricht sie einer vorhandenen bis auf die Schreibweise, gilt die vorhandene */
export function wohnungNormalisieren(eingabe: string, vorhandene: readonly string[]): string {
  const t = eingabe.trim();
  if (!t) return '';
  return vorhandene.find((w) => vergleich(w) === vergleich(t)) ?? t;
}

/**
 * Vorgaben für einen neu gezeichneten Raum: Nutzung und Anrechnung vom zuletzt angelegten Raum des Geschosses; im
 * leeren Geschoss außerhalb des Kellers „voll“, wenn das Projekt schon Wohnflächen hat (mit deren einziger Wohnung).
 */
export function neuerRaumVorgabe(p: Project, storey: Storey): Partial<Pick<RoomShape, 'nutzung' | 'wofl'>> {
  const letzter = [...storey.shapes].reverse().find((s): s is RoomShape => s.kind === 'room' && !s.subtract);
  if (letzter) return { nutzung: letzter.nutzung, wofl: { ...letzter.wofl, anteile: undefined } };
  if (istKellergeschoss(storey)) return {};
  const mitWofl = p.storeys.flatMap((s) => s.shapes).filter((s): s is RoomShape => s.kind === 'room' && !s.subtract && s.wofl.kategorie !== 'keine');
  if (!mitWofl.length) return {};
  const wohnungen = [...new Set(mitWofl.map((r) => r.wofl.wohnung.trim()).filter(Boolean))];
  return { wofl: { kategorie: 'voll', wohnung: wohnungen.length === 1 ? wohnungen[0] : '' } };
}

/* ---------- geladener Katalog (für die Oberfläche) ---------- */

export const useKatalog = create<{ katalog: KatalogEintrag[]; nutzungsarten: Nutzungsart[]; eigen: boolean }>(() => ({
  katalog: VORGABE_KATALOG,
  nutzungsarten: VORGABE_NUTZUNGSARTEN,
  eigen: false,
}));

/** Katalog und Nutzungsarten aus dem Konfigurationsordner laden (einmal beim Start) */
export async function katalogLaden(): Promise<void> {
  try {
    const [k, n] = await Promise.all([konfigLesen('raumkatalog'), konfigLesen('nutzungsarten')]);
    const katalog = katalogAus(k);
    const arten = nutzungsartenAus(n);
    useKatalog.setState({ katalog: katalog?.length ? katalog : VORGABE_KATALOG, nutzungsarten: arten?.length ? arten : VORGABE_NUTZUNGSARTEN, eigen: !!katalog?.length });
  } catch (e) {
    log.warn('Raumkatalog nicht lesbar – Vorgabe gilt', e);
  }
}
