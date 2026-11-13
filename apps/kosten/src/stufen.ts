import type { KostenStufe } from '@core/model';
import { KOSTEN_STUFEN } from '@core/model';

/**
 * Stufen der Kostenermittlung, wie NUMIO sie anzeigt: Leistungsphasen nach HOAI 2021 (Anlage 10.1),
 * Gliederungstiefe nach DIN 276:2018-12 und nach HOAI § 2 Abs. 10/11 (die dort auf DIN 276:2008-12 verweist).
 * Maßgeblich ist die im Vertrag vereinbarte Fassung.
 */

const LPH: Record<KostenStufe, string> = {
  rahmen: 'LPh 1, Bedarfsplanung',
  schaetzung: 'LPh 2',
  berechnung: 'LPh 3',
  voranschlag: 'LPh 6',
  anschlag: 'LPh 7',
  feststellung: 'LPh 8',
};

export const STUFEN: { id: KostenStufe; label: string; lph: string }[] = KOSTEN_STUFEN.map((s) => ({ ...s, lph: LPH[s.id] }));

/** Stufe ohne Angabe im Projekt: Kostenschätzung (wie die Vorbelegung der Auswahl) */
export const STUFE_STANDARD: KostenStufe = 'schaetzung';

export const stufeVon = (s: KostenStufe | undefined): KostenStufe => s ?? STUFE_STANDARD;

export const stufeLabel = (s: KostenStufe | undefined) => STUFEN.find((x) => x.id === stufeVon(s))!.label;

/** geforderte Gliederungstiefe je Stufe */
export const GLIEDERUNGSTIEFE: Record<KostenStufe, string> = {
  rahmen: 'DIN 276:2018-12: 1. Ebene, Bauwerkskosten gesondert',
  schaetzung: 'DIN 276:2018-12: mindestens 2. Ebene (HOAI § 2 Abs. 10 mit DIN 276:2008-12: 1. Ebene)',
  berechnung: 'DIN 276:2018-12: mindestens 3. Ebene, z. B. 331, 332, 334 (HOAI § 2 Abs. 11 mit DIN 276:2008-12: 2. Ebene)',
  voranschlag: 'DIN 276:2018-12: 3. Ebene bzw. Vergabeeinheiten',
  anschlag: 'DIN 276:2018-12: 3. Ebene bzw. Vergabeeinheiten',
  feststellung: 'DIN 276:2018-12: 3. Ebene bzw. Vergabeeinheiten',
};

/**
 * Kostenvoranschlag, -anschlag und -feststellung beruhen nach DIN 276 auf bepreisten Leistungsverzeichnissen,
 * Aufträgen bzw. abgerechneten Kosten. NUMIO rechnet mit Kennwerten und Pauschalen – Druck und Excel weisen darauf hin.
 */
export const istSpaeteStufe = (s: KostenStufe | undefined) => s === 'voranschlag' || s === 'anschlag' || s === 'feststellung';

export const SPAETE_STUFE_HINWEIS =
  'Fortschreibung mit Kennwerten und Pauschalen – die Grundlage (bepreiste Leistungsverzeichnisse, Aufträge, Abrechnung) ist von der Verfasserin bzw. dem Verfasser zu belegen.';

/** Kostenfeststellung: tatsächlich entstandene Kosten – ohne Bandbreite */
export const ohneBandbreite = (s: KostenStufe | undefined) => s === 'feststellung';
