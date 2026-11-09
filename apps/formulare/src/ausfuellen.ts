/**
 * Formular aus der Projektkarte ausfüllen – wie FORMA es tut: Jede Seite ordnet über `lstbxProkarte`
 * Textfeldern Einträge der Projektkarte zu. Vorgeschlagen werden nur Felder, deren Inhalt sich dadurch ändert;
 * FORMA speichert in Textfeldern die angezeigten Zeilen einzeln, deshalb zählen Unterschiede nur in
 * Leerzeichen und Zeilenumbrüchen nicht.
 */

import type { Feld } from './forma/felder';
import type { Projektkarte, Teil } from './forma/projektkarte';
import { ausfuellen, pkTitel, pkWert, verwendeteEintraege, zuordnungen } from './forma/projektkarte';
import type { OffenesFormular } from './store';
import { wertVon } from './store';

export interface Vorschlag {
  feld: Feld;
  aktuell: string;
  neu: string;
  /** woher der Wert kommt, z. B. „Bauherr: Name/Firma, Vorname“ */
  quelle: string;
}

const ohneLeerraum = (s: string) => s.replace(/\s+/g, ' ').trim();

function quelle(teile: Teil[], pk: Projektkarte): string {
  const nach = new Map<number, string[]>();
  for (const t of verwendeteEintraege(teile)) {
    const e = pk.eintraege.find((x) => x.gruppe === t.gruppe && x.id === t.id);
    if (!e) continue;
    nach.set(t.gruppe, [...(nach.get(t.gruppe) ?? []), pkTitel(e.titel)]);
  }
  return [...nach]
    .map(([g, titel]) => `${pk.gruppen.find((x) => x.id === g)?.text ?? `Gruppe ${g}`}: ${titel.join(', ')}`)
    .join(' · ');
}

/** Alle Felder, die sich durch die Projektkarte ändern würden */
export function vorschlaege(o: OffenesFormular, pk: Projektkarte): Vorschlag[] {
  const out: Vorschlag[] = [];
  o.formular.seiten.forEach((seite, i) => {
    const felder = new Map(o.felder[i].map((f) => [f.name, f]));
    for (const [name, teile] of zuordnungen(seite)) {
      const feld = felder.get(name);
      if (!feld || feld.art !== 'text') continue;
      const neu = ausfuellen(teile, (g, id) => pkWert(pk, g, id), feld.einzeilig);
      const w = wertVon(o, feld);
      const aktuell = typeof w === 'string' ? w : '';
      // nichts in der Projektkarte: Feld bleibt, wie es ist (kein Vorschlag zum Leeren)
      if (!neu.trim() || ohneLeerraum(neu) === ohneLeerraum(aktuell)) continue;
      out.push({ feld, aktuell, neu, quelle: quelle(teile, pk) });
    }
  });
  return out;
}

/** Wie viele Felder des Formulars aus der Projektkarte kommen können */
export function anzahlZugeordnet(o: OffenesFormular): number {
  return o.formular.seiten.reduce((n, s) => n + zuordnungen(s).size, 0);
}
