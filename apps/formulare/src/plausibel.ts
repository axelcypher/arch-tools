/**
 * Plausibilität (U-04, U-05): widersprüchliche Kreuze, Hinweise nach den Prüfregeln der Vorgabe und Abweichungen
 * zwischen Formular und Projektmerkmalen. Alles nicht blockierend – es erscheint als Hinweis in der Prüfliste, am
 * Abschnitt in der Gliederung und am Feld.
 */

import type { BedingungKontext, Quelle } from './bedingung';
import { auswerten } from './bedingung';
import type { Feld } from './forma/felder';
import { abschnitte } from './forma/felder';
import type { FormularProfil } from './profil';
import { abschnittId, abschnittZustand, einheiten, einheitTitel } from './profil';
import type { Pruefregeln } from './vorgaben/pruefregeln';

export interface Plausi {
  /** fehler: Widerspruch (z. B. Bauantrag und Vorbescheid); hinweis: bitte prüfen */
  art: 'fehler' | 'hinweis';
  text: string;
  /** betroffene Felder (leer: das ganze Formular) */
  felder: string[];
  /** Abschnitt der Felder (`<Seite>:<Rahmen>`) */
  abschnitt?: string;
  quellen?: Quelle[];
}

const gefuellt = (w: string | boolean) => w === true || (typeof w === 'string' && w.trim() !== '');

/** kurzer Name eines Merkmals in der Meldung */
const kurz = (merkmal: string) => (merkmal === 'Gebäudeklasse' ? 'GK' : merkmal);

/** Werte, die das Formular für ein Merkmal angekreuzt hat (nach den Prüfregeln) */
export function formularWerte(map: Record<string, string>, wertVon: (schluessel: string) => string | boolean | undefined): string[] {
  return Object.entries(map)
    .filter(([, feld]) => wertVon(feld) === true)
    .map(([w]) => w);
}

export function plausibilitaet(felderJeSeite: Feld[][], profil: FormularProfil, k: BedingungKontext, wert: (f: Feld) => string | boolean, regeln?: Pruefregeln): Plausi[] {
  const out: Plausi[] = [];
  const nach = new Map(felderJeSeite.flat().map((f) => [f.schluessel, f]));
  const abschnittVon = new Map<string, string>();
  for (const felder of felderJeSeite)
    for (const a of abschnitte(felder)) {
      const id = abschnittId(a);
      for (const f of a.felder) abschnittVon.set(f.schluessel, id);
      if (abschnittZustand(a, profil, k) === 'nein') continue;
      // Gruppen: „genau eine“ mit mehreren Angaben ist ein Widerspruch; andere Gruppen nur nach den Prüfregeln
      for (const e of einheiten(a, profil, k)) {
        if (!e.gruppe || e.entfaellt) continue;
        const angegeben = e.felder.filter((f) => gefuellt(wert(f)));
        if (angegeben.length < 2) continue;
        const titel = einheitTitel(e, profil);
        if (e.gruppe.regel === 'genau')
          out.push({ art: 'fehler', text: `„${titel}“: mehr als eine Angabe angekreuzt – bitte nur eine wählen.`, felder: angegeben.map((f) => f.schluessel), abschnitt: id });
        else if (regeln?.mehrfach?.[e.gruppe.id]) out.push({ art: 'hinweis', text: regeln.mehrfach[e.gruppe.id], felder: angegeben.map((f) => f.schluessel), abschnitt: id });
      }
    }
  for (const h of regeln?.hinweise ?? []) if (auswerten(h.bedingung, k) === 'ja') out.push({ art: 'hinweis', text: h.text, felder: [], ...(h.quellen ? { quellen: h.quellen } : {}) });
  // Abweichung zwischen Projektmerkmal und Formular (U-05)
  const wertVon = (s: string) => (nach.has(s) ? wert(nach.get(s)!) : undefined);
  for (const [merkmal, map] of Object.entries(regeln?.merkmalFelder ?? {})) {
    const v = k.merkmale[merkmal];
    if (!v || !map[v] || !nach.has(map[v])) continue;
    const imFormular = formularWerte(map, wertVon);
    if (!imFormular.length || imFormular.includes(v)) continue;
    const felder = imFormular.map((w) => map[w]);
    out.push({ art: 'hinweis', text: `Projekt: ${kurz(merkmal)} ${v}, Formular: ${kurz(merkmal)} ${imFormular.join(', ')}`, felder, abschnitt: abschnittVon.get(felder[0]) });
  }
  return out;
}
