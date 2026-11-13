/**
 * Warum entfällt ein Feld? Ein Feld entfällt, wenn die Bedingung seines Abschnitts, seiner Gruppe oder seine eigene
 * nicht zutrifft (profil.ts: feldErforderlich). Hier stehen die Gründe – für den Hinweis am Feld: die Begründung der
 * Vorgabe, die Bedingung in Worten, noch nicht festgelegte Antragsmerkmale und die Rechtsgrundlage.
 *
 * Hängt eine Bedingung an einem nicht festgelegten Antragsmerkmal, entfällt das Feld nicht, sondern ist **offen**
 * (R-01): erforderlich, bis das Merkmal festgelegt ist. Dafür gibt es eigene Gründe (`offenGruende`) und den
 * Hinweis „Ungeklärt – hängt ab von: …“ – nie „Entfällt, weil … nicht festgelegt“.
 */

import type { Bedingung, BedingungKontext, Quelle, Wahrheit } from './bedingung';
import { auswerten, bedingungText, fehlendeMerkmale } from './bedingung';
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

/** Bedingungen des Felds (Abschnitt, Gruppe, eigene), deren Auswertung `art` ergibt */
function gruende(art: Wahrheit, f: Feld, a: Abschnitt | undefined, p: FormularProfil, k: BedingungKontext): Entfall[] {
  const out: Entfall[] = [];
  if (a) {
    const ap = p.abschnitte[abschnittId(a)];
    if (ap?.bedingung && auswerten(ap.bedingung, k) === art) out.push({ ebene: 'abschnitt', titel: ap.titel?.trim() || a.titel, bedingung: ap.bedingung });
  }
  const g = gruppeVon(p, f.schluessel);
  if (g?.bedingung && auswerten(g.bedingung, k) === art) out.push({ ebene: 'gruppe', titel: g.titel?.trim() || 'Gruppe', bedingung: g.bedingung });
  const b = p.bedingungen?.[f.schluessel];
  if (b && auswerten(b, k) === art) out.push({ ebene: 'feld', titel: '', bedingung: b });
  return out;
}

/** Bedingungen, die sicher nicht zutreffen und das Feld deshalb entfallen lassen (leer: das Feld ist erforderlich oder offen) */
export const entfallGruende = (f: Feld, a: Abschnitt | undefined, p: FormularProfil, k: BedingungKontext): Entfall[] => gruende('nein', f, a, p, k);

/** Bedingungen, die an nicht festgelegten Antragsmerkmalen hängen (nur, wenn das Feld nicht ohnehin entfällt) */
export const offenGruende = (f: Feld, a: Abschnitt | undefined, p: FormularProfil, k: BedingungKontext): Entfall[] => (entfallGruende(f, a, p, k).length ? [] : gruende('offen', f, a, p, k));

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
 * Bei offenen Gründen (fehlendes Merkmal) beginnt er mit „Ungeklärt – hängt ab von: Gebäudeart (nicht festgelegt)“ und
 * „Erforderlich, bis Gebäudeart festgelegt ist.“
 */
export function entfallText(gruende: Entfall[], felder: Feld[], p: FormularProfil, merkmale: Record<string, string>, art: 'entfaellt' | 'offen' = 'entfaellt'): string {
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
  if (art === 'entfaellt') return [`Entfällt`, ...zeilen].join('\n');
  const fehlt = [...new Set(gruende.flatMap((e) => fehlendeMerkmale(e.bedingung, merkmale)))].join(', ');
  return [`Ungeklärt – hängt ab von: ${fehlt} (nicht festgelegt)`, `Erforderlich, bis ${fehlt} festgelegt ist.`, ...zeilen].join('\n');
}
