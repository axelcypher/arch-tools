/**
 * Warum entfällt ein Feld? Ein Feld entfällt, wenn die Bedingung seines Abschnitts, seiner Gruppe oder seine eigene
 * nicht zutrifft (profil.ts: feldErforderlich). Hier stehen die Gründe – für den Hinweis am Feld: die Begründung der
 * Vorgabe, die Bedingung in Worten, noch nicht festgelegte Projektmerkmale und die Rechtsgrundlage.
 */

import type { Bedingung, BedingungKontext, Quelle } from './bedingung';
import { bedingungText, erfuellt, fehlendeMerkmale } from './bedingung';
import type { Abschnitt, Feld } from './forma/felder';
import type { FormularProfil } from './profil';
import { abschnittId, feldTitel, gruppeVon } from './profil';
import { quelleText } from './recht';

export interface Entfall {
  /** woran die Bedingung hängt */
  ebene: 'abschnitt' | 'gruppe' | 'feld';
  /** Titel des Abschnitts bzw. der Gruppe (beim Feld leer) */
  titel: string;
  bedingung: Bedingung;
}

/** Bedingungen, die nicht zutreffen und das Feld deshalb entfallen lassen (leer: das Feld ist erforderlich) */
export function entfallGruende(f: Feld, a: Abschnitt | undefined, p: FormularProfil, k: BedingungKontext): Entfall[] {
  const out: Entfall[] = [];
  if (a) {
    const ap = p.abschnitte[abschnittId(a)];
    if (ap?.bedingung && !erfuellt(ap.bedingung, k)) out.push({ ebene: 'abschnitt', titel: ap.titel?.trim() || a.titel, bedingung: ap.bedingung });
  }
  const g = gruppeVon(p, f.schluessel);
  if (g?.bedingung && !erfuellt(g.bedingung, k)) out.push({ ebene: 'gruppe', titel: g.titel?.trim() || 'Gruppe', bedingung: g.bedingung });
  const b = p.bedingungen?.[f.schluessel];
  if (b && !erfuellt(b, k)) out.push({ ebene: 'feld', titel: '', bedingung: b });
  return out;
}

/** alle Rechtsgrundlagen der Gründe (ohne doppelte) */
export function entfallQuellen(gruende: Entfall[]): Quelle[] {
  const out: Quelle[] = [];
  for (const q of gruende.flatMap((e) => e.bedingung.quellen ?? [])) if (!out.some((x) => quelleText(x) === quelleText(q))) out.push(q);
  return out;
}

/**
 * Hinweis in Worten, eine Zeile je Gedanke:
 *   Entfällt: Baubeschreibung beim Einfamilienhaus nicht nötig.
 *   Nur erforderlich, wenn Gebäudeart nicht Einfamilienhaus.
 *   Rechtsgrundlage: § 5 Absatz 1 BauPrüfVO
 */
export function entfallText(gruende: Entfall[], felder: Feld[], p: FormularProfil, merkmale: Record<string, string>): string {
  const nach = new Map(felder.map((f) => [f.schluessel, f]));
  const feldName = (s: string) => (nach.has(s) ? { titel: feldTitel(nach.get(s)!, p), kreuz: nach.get(s)!.art === 'kreuz' } : undefined);
  const zeilen: string[] = [];
  for (const e of gruende) {
    const wo = e.ebene === 'abschnitt' ? `Abschnitt „${e.titel}“: ` : e.ebene === 'gruppe' ? `„${e.titel}“: ` : '';
    const wenn = `nur erforderlich, wenn ${bedingungText(e.bedingung, feldName)}`;
    if (e.bedingung.grund) zeilen.push(`${wo}${e.bedingung.grund}`, `(${wenn})`);
    else zeilen.push(`${wo}${wenn[0].toUpperCase()}${wenn.slice(1)}`);
    const fehlt = [...new Set(fehlendeMerkmale(e.bedingung, merkmale))];
    if (fehlt.length) zeilen.push(`Im Projekt noch nicht festgelegt: ${fehlt.join(', ')}`);
  }
  const quellen = entfallQuellen(gruende);
  if (quellen.length) zeilen.push(`Rechtsgrundlage: ${quellen.map(quelleText).join('; ')} – klicken für den Gesetzestext`);
  return [`Entfällt`, ...zeilen].join('\n');
}
