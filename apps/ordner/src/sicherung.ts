import type { Struktur } from './struktur';

/**
 * Sicherungen der Bürostruktur: Bevor die Struktur ersetzt wird („Standard“, „Struktur laden …“, eine Sicherung
 * wiederherstellen), kommt der bisherige Stand in den Bereich `projektordner-sicherungen` des Konfigurationsordners
 * (Datei `projektordner-sicherungen.json`). Die neuesten `MAX_SICHERUNGEN` bleiben; Dateien werden dabei nicht
 * gelöscht – die Sicherungen stehen gemeinsam in dieser einen Datei.
 */

export const SICHERUNGEN = 'projektordner-sicherungen';
export const MAX_SICHERUNGEN = 10;

export interface Sicherung {
  /** z. B. „projektordner.json.bak-2026-11-11-0940“ */
  name: string;
  /** Anlass, z. B. „vor: Standard wiederhergestellt“ */
  grund: string;
  /** der gesicherte Inhalt von projektordner.json */
  inhalt: { struktur: Struktur; vorlagenordner: string };
}

const zwei = (n: number) => String(n).padStart(2, '0');

/** Name einer Sicherung: projektordner.json.bak-JJJJ-MM-TT-hhmm */
export const sicherungsName = (d: Date) => `projektordner.json.bak-${d.getFullYear()}-${zwei(d.getMonth() + 1)}-${zwei(d.getDate())}-${zwei(d.getHours())}${zwei(d.getMinutes())}`;

/** Sicherungen aus dem Rohinhalt des Bereichs (Ungültiges entfällt), neueste zuerst */
export function sicherungenAus(roh: unknown): Sicherung[] {
  const liste = roh && typeof roh === 'object' && Array.isArray((roh as { sicherungen?: unknown }).sicherungen) ? (roh as { sicherungen: unknown[] }).sicherungen : [];
  return liste.filter(
    (s): s is Sicherung =>
      !!s && typeof s === 'object' && typeof (s as Sicherung).name === 'string' && !!(s as Sicherung).inhalt && typeof (s as Sicherung).inhalt === 'object' && !!(s as Sicherung).inhalt.struktur,
  );
}

/** neue Sicherung vorne anfügen; nur die neuesten `max` bleiben */
export function sicherungenMit(roh: unknown, neu: Sicherung, max = MAX_SICHERUNGEN): { sicherungen: Sicherung[] } {
  return { sicherungen: [neu, ...sicherungenAus(roh)].slice(0, max) };
}

export interface StrukturUnterschied {
  /** Ordner, die entfallen */
  weg: string[];
  /** neue Ordner */
  neu: string[];
  /** Ordner mit geänderten Zusätzen (LPh, Dateischema) */
  geaendert: string[];
  /** geänderte Namensschemata (Bezeichnungen) */
  schemata: string[];
  /** Presets: entfallende und neue Namen */
  presetsWeg: string[];
  presetsNeu: string[];
  /** neuer Name der Struktur, wenn er sich ändert */
  name?: string;
}

const SCHEMATA: { feld: keyof Pick<Struktur, 'nummernschema' | 'ordnername' | 'dateischema' | 'vorlagenname'>; label: string }[] = [
  { feld: 'nummernschema', label: 'Projektnummer' },
  { feld: 'ordnername', label: 'Name des Projektordners' },
  { feld: 'dateischema', label: 'Dateinamenschema für Pläne' },
  { feld: 'vorlagenname', label: 'Dateinamen der Vorlagen' },
];

/** Was sich ändert, wenn `neu` die Struktur `alt` ersetzt – für die Vorschau in der Rückfrage */
export function strukturUnterschied(alt: Struktur, neu: Struktur): StrukturUnterschied {
  const altOrdner = new Map(alt.ordner.map((o) => [o.pfad.toLowerCase(), o]));
  const neuOrdner = new Map(neu.ordner.map((o) => [o.pfad.toLowerCase(), o]));
  const zusatz = (o: { lph?: number[]; dateischema?: boolean }) => `${(o.lph ?? []).join(',')}|${o.dateischema ? 1 : 0}`;
  const altPresets = new Set(alt.presets.map((p) => p.name.toLowerCase()));
  const neuPresets = new Set(neu.presets.map((p) => p.name.toLowerCase()));
  return {
    weg: alt.ordner.filter((o) => !neuOrdner.has(o.pfad.toLowerCase())).map((o) => o.pfad),
    neu: neu.ordner.filter((o) => !altOrdner.has(o.pfad.toLowerCase())).map((o) => o.pfad),
    geaendert: neu.ordner.filter((o) => altOrdner.has(o.pfad.toLowerCase()) && zusatz(altOrdner.get(o.pfad.toLowerCase())!) !== zusatz(o)).map((o) => o.pfad),
    schemata: SCHEMATA.filter((s) => alt[s.feld] !== neu[s.feld]).map((s) => s.label),
    presetsWeg: alt.presets.filter((p) => !neuPresets.has(p.name.toLowerCase())).map((p) => p.name),
    presetsNeu: neu.presets.filter((p) => !altPresets.has(p.name.toLowerCase())).map((p) => p.name),
    ...(alt.name !== neu.name ? { name: neu.name } : {}),
  };
}

const anzahl = (n: number, eins: string, mehr: string) => `${n} ${n === 1 ? eins : mehr}`;

/** Unterschied in Worten, z. B. „6 Ordner entfallen, 2 neu, 3 Schemata ändern sich“; leer, wenn sich nichts ändert */
export function unterschiedText(u: StrukturUnterschied): string {
  const teile: string[] = [];
  if (u.weg.length) teile.push(`${anzahl(u.weg.length, 'Ordner entfällt', 'Ordner entfallen')}`);
  if (u.neu.length) teile.push(u.weg.length ? `${u.neu.length} neu` : `${anzahl(u.neu.length, 'Ordner', 'Ordner')} neu`);
  if (u.geaendert.length) teile.push(`bei ${anzahl(u.geaendert.length, 'Ordner', 'Ordnern')} ändern sich Leistungsphasen oder Dateischema`);
  if (u.schemata.length) teile.push(`${anzahl(u.schemata.length, 'Schema ändert', 'Schemata ändern')} sich (${u.schemata.join(', ')})`);
  if (u.presetsWeg.length) teile.push(`${anzahl(u.presetsWeg.length, 'Preset entfällt', 'Presets entfallen')} (${u.presetsWeg.join(', ')})`);
  if (u.presetsNeu.length) teile.push(`${anzahl(u.presetsNeu.length, 'Preset', 'Presets')} neu (${u.presetsNeu.join(', ')})`);
  if (u.name) teile.push(`Name „${u.name}“`);
  return teile.join(', ');
}
