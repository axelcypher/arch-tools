import { projekteAuflisten } from '@core/platform/projektordner';
import type { Dateisystem } from './dateisystem';
import { projektEinlesen } from './projekt';
import type { BefundArt, Pruefergebnis } from './pruefung';
import { pruefe } from './pruefung';
import type { Struktur } from './struktur';

/**
 * „Alle Projekte prüfen“ (P-10): jeden Projektordner der Stammordner mit der Struktur vergleichen – nur lesend – und
 * je Projekt eine Zeile für die Übersicht liefern; dazu CSV für die Übersicht und für den Bericht eines Projekts.
 */

export const BEFUND_ART: Record<BefundArt, string> = { fehler: 'Fehler', warnung: 'Abweichung', hinweis: 'Hinweis', ok: 'in Ordnung' };

export interface SammelZeile {
  projekt: string;
  pfad: string;
  /** Befunde außer „in Ordnung“ */
  abweichungen: number;
  /** davon Fehler */
  fehler: number;
  projektdatei: boolean;
  /** Länge des längsten Pfads ab dem Projektordner (mit dessen Namen) */
  laengsterPfad: number;
  /** Ordner nicht lesbar */
  lesefehler?: string;
}

/** Zeile der Übersicht aus dem Ergebnis eines Projekts */
export function sammelZeile(projekt: string, pfad: string, eintraege: { pfad: string }[], ergebnis: Pruefergebnis, projektdatei: boolean): SammelZeile {
  return {
    projekt,
    pfad,
    abweichungen: ergebnis.befunde.filter((b) => b.art !== 'ok').length,
    fehler: ergebnis.befunde.filter((b) => b.art === 'fehler').length,
    projektdatei,
    laengsterPfad: eintraege.reduce((m, e) => Math.max(m, projekt.length + 1 + e.pfad.length), projekt.length),
  };
}

/** alle Projektordner der Stammordner prüfen, einer nach dem anderen; nicht lesbare stehen mit `lesefehler` in der Liste */
export async function allePruefen(fs: Dateisystem, roots: string[], struktur: Struktur, fortschritt?: (fertig: number, gesamt: number) => void): Promise<SammelZeile[]> {
  const { projekte } = await projekteAuflisten(fs, roots);
  const out: SammelZeile[] = [];
  for (const [i, p] of projekte.entries()) {
    try {
      const eintraege = await fs.liste(p.pfad, 12);
      const g = await projektEinlesen({ pfad: p.pfad, name: p.name, eintraege, lies: (rel) => fs.lies(p.pfad, rel) });
      out.push(sammelZeile(p.name, p.pfad, eintraege, pruefe(p.name, eintraege, struktur, g.angaben, g.quelle), !!g.projektdatei));
    } catch (e) {
      out.push({ projekt: p.name, pfad: p.pfad, abweichungen: 0, fehler: 0, projektdatei: false, laengsterPfad: 0, lesefehler: e instanceof Error ? e.message : String(e) });
    }
    fortschritt?.(i + 1, projekte.length);
  }
  return out;
}

/**
 * CSV-Feld (Semikolon, für Excel). Text, der mit = + - @ (oder Tab/Zeilenumbruch) beginnt, bekommt ein Apostroph
 * vorangestellt – sonst führte Excel einen Ordnernamen wie „=HYPERLINK(…)“ als Formel aus.
 */
const feld = (v: string | number) => {
  const s = typeof v === 'string' && /^[=+\-@\t\r]/.test(v) ? `'${v}` : String(v);
  return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
/** CSV mit BOM, damit Excel die Umlaute erkennt */
const csv = (zeilen: (string | number)[][]) => `﻿${zeilen.map((z) => z.map(feld).join(';')).join('\r\n')}\r\n`;

export function sammelCsv(zeilen: SammelZeile[]): string {
  return csv([
    ['Projekt', 'Abweichungen', 'davon Fehler', 'Projektdatei', 'Längster Pfad (Zeichen)', 'Pfad', 'Lesefehler'],
    ...zeilen.map((z) => [z.projekt, z.abweichungen, z.fehler, z.projektdatei ? 'ja' : 'nein', z.laengsterPfad, z.pfad, z.lesefehler ?? '']),
  ]);
}

/** Bericht eines Projekts: je Befund und betroffenem Pfad eine Zeile, nach Schwere */
export function berichtCsv(ergebnis: Pruefergebnis): string {
  return csv([['Art', 'Befund', 'Erläuterung', 'Pfad'], ...ergebnis.befunde.flatMap((b) => (b.pfade?.length ? b.pfade : ['']).map((p) => [BEFUND_ART[b.art], b.titel, b.text ?? '', p]))]);
}
