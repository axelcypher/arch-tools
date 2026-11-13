import type { ProjectResult } from '@core/calc';
import { isSelfIntersecting } from '@core/geometry';
import type { Project } from '@core/model';
import { MASSGRUNDLAGEN } from '@core/norms';
import { NUF_IDS } from '@core/norms';

/**
 * Bericht für die Bauvorlage (F-17): Vorlagen und Abschnitte, Regeln fürs Weglassen leerer Abschnitte, Warnungen,
 * Angaben für die Hochbaustatistik (FR-20).
 *
 * Vorlage „Bauantrag NRW“ = Kopf + Grundflächen und Rauminhalte nach DIN 277 mit R/S + BRI-Rechenweg, optional
 * Wohnflächen und Statistik: BRI-Rechenweg und R/S-Trennung sind dort nicht abwählbar (§ 6 Nr. 1 BauPrüfVO NRW:
 * nachprüfbare BRI-Berechnung; Gebührentarif NRW Tarifstelle 3.1.1.2). Freie Auswahl nur außerhalb dieser Vorlage.
 */

export type BerichtVorlage = 'vollstaendig' | 'bauantrag' | 'frei';
export type Abschnitt = 'din277' | 'bri' | 'nutzung' | 'raeume' | 'wofl' | 'statistik';

export const VORLAGEN: { id: BerichtVorlage; label: string }[] = [
  { id: 'vollstaendig', label: 'Vollständige Flächenaufstellung' },
  { id: 'bauantrag', label: 'Bauantrag NRW (BRI + WoFl)' },
  { id: 'frei', label: 'Abschnitte frei wählen' },
];

export const ABSCHNITTE: { id: Abschnitt; label: string }[] = [
  { id: 'din277', label: 'Grundflächen und Rauminhalte (DIN 277, R/S)' },
  { id: 'bri', label: 'BRI-Rechenweg' },
  { id: 'nutzung', label: 'NRF nach Nutzungsgruppen' },
  { id: 'raeume', label: 'Raumlisten je Geschoss' },
  { id: 'wofl', label: 'Wohnflächen (WoFlV)' },
  { id: 'statistik', label: 'Angaben für die Hochbaustatistik' },
];

export interface BerichtEinstellung {
  vorlage: BerichtVorlage;
  /** gewählte Abschnitte (bei „Bauantrag NRW“ nur die wählbaren: Raumlisten, Nutzungsgruppen, Wohnflächen, Statistik) */
  abschnitte: Abschnitt[];
}

export const VORGABE_BERICHT: BerichtEinstellung = { vorlage: 'vollstaendig', abschnitte: ABSCHNITTE.map((a) => a.id) };

/** Einstellung aus den Projekteinstellungen (settings.bericht) – Unbekanntes fällt auf die Vorgabe zurück */
export function berichtEinstellung(roh: unknown): BerichtEinstellung {
  if (!roh || typeof roh !== 'object') return VORGABE_BERICHT;
  const r = roh as Record<string, unknown>;
  const vorlage = VORLAGEN.some((v) => v.id === r.vorlage) ? (r.vorlage as BerichtVorlage) : 'vollstaendig';
  const ids = new Set(ABSCHNITTE.map((a) => a.id));
  const abschnitte = Array.isArray(r.abschnitte) ? (r.abschnitte.filter((a) => ids.has(a as Abschnitt)) as Abschnitt[]) : VORGABE_BERICHT.abschnitte;
  return { vorlage, abschnitte };
}

/** in der Vorlage „Bauantrag NRW“ immer enthalten (nicht abwählbar) */
export const BAUANTRAG_PFLICHT: readonly Abschnitt[] = ['din277', 'bri'];

export interface BerichtPlan {
  /** Abschnitte, die gedruckt werden (in dieser Reihenfolge) */
  abschnitte: Abschnitt[];
  /** Abschnitte, die sich in der gewählten Vorlage nicht abwählen lassen */
  gesperrt: Abschnitt[];
  /** Spalten für den Sonderfall S zeigen (sonst sind alle Flächen R) */
  sSpalten: boolean;
  /** Mängel, die im Bericht als Warnung erscheinen statt still zu fehlen */
  warnungen: string[];
}

const nah0 = (v: number) => Math.abs(v) < 0.005;

/**
 * Planungsunterlagen für Kopf von Bericht und Excel (DIN 277:2021-08, 5.1: „Messverfahren und zugrundeliegende
 * Planungsunterlagen sind anzugeben“): Eingabe im Projekt, sonst die hinterlegten Pläne je Geschoss.
 */
export function planungsunterlagen(project: Project): string {
  const eigen = project.settings.planunterlagen?.trim();
  if (eigen) return eigen;
  return project.storeys.flatMap((s) => (s.background?.name ? [`${s.name}: ${s.background.name}`] : [])).join('; ');
}

/** Messverfahren (Maßgrundlage) als Satz – leer, wenn nicht angegeben */
export function messverfahren(project: Project): string {
  return MASSGRUNDLAGEN.find((m) => m.id === project.settings.massgrundlage)?.text ?? '';
}

/**
 * Welche Abschnitte gedruckt werden: Vorlage, Auswahl, leere Abschnitte entfallen; ein fehlender BRI ist ein Mangel,
 * ebenso (mit Projekt) selbstüberschneidende Flächen, deren Fläche so nicht stimmt.
 */
export function berichtPlan(e: BerichtEinstellung, result: ProjectResult, project?: Project): BerichtPlan {
  const gewaehlt = new Set<Abschnitt>(e.vorlage === 'vollstaendig' ? ABSCHNITTE.map((a) => a.id) : e.abschnitte);
  const gesperrt = e.vorlage === 'bauantrag' ? [...BAUANTRAG_PFLICHT] : [];
  for (const a of gesperrt) gewaehlt.add(a);
  const t = result.total;
  const hatWofl = result.wohnungen.length > 0 && !nah0(t.wofl);
  const hatRaeume = result.storeys.some((s) => s.rooms.length > 0);
  const abschnitte = ABSCHNITTE.map((a) => a.id).filter((a) => {
    if (!gewaehlt.has(a)) return false;
    if (a === 'wofl') return hatWofl; // leerer WoFlV-Abschnitt entfällt
    if (a === 'nutzung' || a === 'raeume') return hatRaeume;
    if (a === 'statistik') return hatWofl || hatRaeume;
    return true;
  });
  const warnungen: string[] = [];
  if (nah0(t.bri.total)) warnungen.push('Kein Brutto-Rauminhalt ermittelt – BGF-Umrisse und Geschosshöhen fehlen. Für Bauantrag und Gebühr ist eine nachprüfbare BRI-Berechnung erforderlich.');
  if (nah0(t.bgf.total) && hatRaeume) warnungen.push('Keine Brutto-Grundfläche – es sind nur Räume gezeichnet.');
  const verdreht = (project?.storeys ?? []).flatMap((s) =>
    s.shapes.filter((x) => isSelfIntersecting(x.points)).map((x) => `${s.name}: ${x.kind === 'room' ? [x.nummer, x.name].filter(Boolean).join(' ') || 'Raum' : `BGF-Umriss „${x.name}“`}`),
  );
  if (project && !messverfahren(project)) warnungen.push('Messverfahren nicht angegeben (DIN 277:2021-08, 5.1) – links unter „Projekt“ die Maßgrundlage wählen.');
  if (project && !planungsunterlagen(project)) warnungen.push('Planungsunterlagen nicht angegeben (DIN 277:2021-08, 5.1) – links unter „Projekt“ eintragen, z. B. „Grundrisse 1:100, Stand …“.');
  if (verdreht.length) warnungen.push(`Selbstüberschneidende Flächen – ihre Fläche ist so nicht korrekt, Eckpunkte prüfen: ${verdreht.join('; ')}.`);
  const sSpalten = [t.bgf.S, t.bri.S, t.nrf.S, t.kgf.S].some((v) => !nah0(v));
  return { abschnitte, gesperrt, sSpalten, warnungen };
}

/* ---------- Hochbaustatistik (FR-20) ---------- */

export interface StatistikWohnung {
  wohnung: string;
  wohnflaeche: number;
  /**
   * Räume nach der Bautätigkeitsstatistik: Wohn-, Ess-, Schlafzimmer und andere Wohn- und Aufenthaltsräume (NUF 1) ab
   * 6 m² sowie Küchen unabhängig von ihrer Größe; Bad, WC, Flur, Abstell- und Wirtschaftsräume zählen nicht
   */
  raeume: number;
}

export interface Statistik {
  wohnungen: StatistikWohnung[];
  wohnflaeche: number;
  /** Nutzungsfläche ohne die Räume mit Wohnflächenanrechnung */
  sonstigeNutzflaeche: number;
  bri: number;
}

/** kleinste Raumgröße, ab der ein Wohnraum gezählt wird [m²] */
export const STATISTIK_MIN_RAUM = 6;

/** Küche (auch Kochnische, Wohnküche) nach dem Raumnamen – zählt in der Statistik unabhängig von der Größe */
export const istKueche = (name: string) => /k(ü|ue)che|kochnische/i.test(name);

export function statistik(result: ProjectResult): Statistik {
  const wohnungen = result.wohnungen.map((w) => ({
    wohnung: w.wohnung,
    wohnflaeche: w.wofl,
    raeume: w.rooms.filter((r) => !r.subtract && r.woflKategorie !== 'freisitz' && !r.ausserhalbBgf && (istKueche(r.name) || (r.nutzung === 'NUF1' && r.area >= STATISTIK_MIN_RAUM))).length,
  }));
  const nuf = new Set<string>(NUF_IDS);
  let sonstige = 0;
  for (const s of result.storeys) for (const r of s.rooms) if (nuf.has(r.nutzung) && r.woflKategorie === 'keine' && r.abzugArt !== 'wofl') sonstige += r.area;
  return { wohnungen, wohnflaeche: result.total.wofl, sonstigeNutzflaeche: sonstige, bri: result.total.bri.total };
}
