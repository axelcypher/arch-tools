/**
 * Ort des Vorhabens für die Bindung von Festlegungen und Merkmalen: Anschrift und Grundstück, dazu die Lage aus
 * gültigen Koordinaten (fehlt, wenn es keine gibt oder sie nicht mehr zur Anschrift passen). Eine Festlegung von Hand
 * gilt für genau diesen Ort – ändert er sich, ist sie überholt.
 */
import type { Project } from '../model';
import { koordinatenVeraltet } from '../platform/geokodierung';
import type { Ort } from './typen';
import { lageKennung } from './geodienste';

const glatt = (s: string | undefined) => (s ?? '').toLowerCase().replace(/\s+/g, ' ').trim();

export function ortVon(project: Project | null): Ort | undefined {
  if (!project) return undefined;
  const a = project.meta.adresse;
  const g = project.meta.grundstueck;
  const adresse = [a.strasse, a.plz, a.ort, g?.gemarkung, g?.flur, g?.flurstueck].map(glatt).join('|');
  const k = project.meta.koordinaten;
  const lage = k && !koordinatenVeraltet(project.meta) ? lageKennung(k.ost, k.nord) : null;
  const anzeige = [a.strasse.trim(), `${a.plz} ${a.ort}`.trim()].filter(Boolean).join(', ');
  return { adresse, lage, ...(anzeige ? { anzeige } : {}) };
}

/**
 * Planungsrecht und Ort: gesichert nur, wenn das Merkmal für genau diesen Ort und Wert bestätigt ist (in Baurecht
 * gesetzt oder „Gilt hier“). Ein Wert aus Formulare oder einer älteren Datei ist bis dahin nicht gesichert – sonst
 * zählte nach einem Umzug das Planungsrecht des alten Grundstücks. Gibt den Grund zurück, sonst undefined.
 */
export function planungsrechtOhneOrt(wert: string | undefined, gemerkt: Ort | undefined, jetzt: Ort | undefined): string | undefined {
  if (!wert || !jetzt) return undefined;
  const hier = jetzt.anzeige ?? 'diesen Ort';
  // ohne gemerkten Ort oder Wert (Formulare, ältere Datei): noch nicht bestätigt
  if (!gemerkt || gemerkt.wert === undefined) return `für ${hier} noch nicht bestätigt`;
  if (gemerkt.wert !== wert) return `seit der Bestätigung geändert (bestätigt war „${gemerkt.wert}“)`;
  const weg = ortGeaendert(gemerkt, jetzt);
  if (!weg) return undefined;
  return gemerkt.adresse !== jetzt.adresse ? `war für ${gemerkt.anzeige ?? 'einen früheren Ort'} bestätigt – für ${hier} noch nicht` : `für ${hier} nicht mehr bestätigt (${weg})`;
}

/** warum ein Ort nicht mehr der von damals ist; undefined = derselbe Ort (bzw. kein Vergleich möglich) */
export function ortGeaendert(alt: Ort | undefined, jetzt: Ort | undefined): string | undefined {
  if (!jetzt) return undefined;
  if (!alt) return 'ohne Ortsangabe getroffen';
  if (alt.adresse !== jetzt.adresse) return 'Anschrift bzw. Grundstück geändert';
  if (alt.lage && jetzt.lage && alt.lage !== jetzt.lage) return 'Koordinaten geändert';
  if (alt.lage && !jetzt.lage) return 'Koordinaten fehlen bzw. passen nicht mehr';
  return undefined;
}
