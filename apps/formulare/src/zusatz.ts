import type { PkEintrag, Projektkarte } from './forma/projektkarte';

/**
 * Ergänzungen der Projektkarte durch die App („Schicht“ über FORMA): Angaben, für die die Projektkarte von FORMA
 * keinen Eintrag hat, die Vordrucke aber brauchen – bisher die Postleitzahl des Baugrundstücks. Sie erscheinen in der
 * Projektkarte wie ein Eintrag (Kennung ab 9000, damit sie nie mit FORMA zusammenstoßen), werden aber nie in
 * `sj_prokarte.sdb` geschrieben: Die App merkt sie sich je FORMA-Projekt und führt sie in der Projektdatei (.oap)
 * mit (`meta.adresse.plz`), wo es eine gibt.
 */

export const GRUNDSTUECK = 301;
/** Postleitzahl des Baugrundstücks */
export const PLZ_GRUNDSTUECK = 9010;

export const ZUSATZ: { gruppe: number; id: number; titel: string }[] = [{ gruppe: GRUNDSTUECK, id: PLZ_GRUNDSTUECK, titel: 'PLZ (Ergänzung der App):' }];

export const istZusatz = (gruppe: number, id: number) => ZUSATZ.some((z) => z.gruppe === gruppe && z.id === id);

/** Projektkarte mit den Ergänzungen (nur in Gruppen, die es gibt); `werte`: Schlüssel `<Gruppe>:<Eintrag>` → Text */
export function mitZusatz(pk: Projektkarte, werte: Record<string, string>): Projektkarte {
  const dazu: PkEintrag[] = ZUSATZ.filter((z) => pk.gruppen.some((g) => g.id === z.gruppe) && !pk.eintraege.some((e) => e.gruppe === z.gruppe && e.id === z.id)).map((z) => ({
    gruppe: z.gruppe,
    id: z.id,
    typ: 1,
    titel: z.titel,
    text: werte[`${z.gruppe}:${z.id}`] ?? '',
    zahl: null,
  }));
  return dazu.length ? { ...pk, eintraege: [...pk.eintraege, ...dazu] } : pk;
}
