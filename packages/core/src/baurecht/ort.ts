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
  return { adresse, lage };
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
