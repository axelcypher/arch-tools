/**
 * Adressbuch aus FORMA: alle Adressen (Bauherren, Entwurfsverfasser, Behörden, Fachplaner …) aus den
 * Projektkarten aller FORMA-Projekte – gepflegt wird weiter in FORMA bzw. in der Projektkarte, hier wird nur
 * zusammengeführt. Gleiche Adressen (Name, Vorname, Straße, Ort) erscheinen einmal, mit allen Verwendungen.
 *
 * Stammdaten sind Vorgaben je Rolle (Gruppe der Projektkarte): z. B. „Entwurfsverfasser = unser Büro“,
 * „Bauaufsichtsbehörde = Kreis Soest“. Sie verweisen auf eine Adresse des Adressbuchs.
 */

import type { PkWert, Projektkarte } from './forma/projektkarte';
import { pkAnzeige, pkWertVon } from './forma/projektkarte';

export interface Verwendung {
  /** Kürzel des FORMA-Projekts */
  projekt: string;
  gruppe: number;
  rolle: string;
}

export interface Adresse {
  schluessel: string;
  /** Eintragsnummer (10 Branche, 30 Vorname, 40 Name/Firma, 70 Straße …) → Wert */
  werte: Record<string, PkWert>;
  /** angezeigte Texte je Eintrag (für Suche und Anzeige) */
  texte: Record<string, string>;
  verwendungen: Verwendung[];
}

const norm = (s: string | undefined) => (s ?? '').toLowerCase().replace(/\s+/g, ' ').replace(/[.,]/g, '').trim();

/** Schlüssel einer Adresse: Name, Vorname, Straße und Ort – ohne Groß/Klein, Satzzeichen und doppelte Leerzeichen */
export function adressSchluessel(texte: Record<string, string>): string {
  return [texte['40'], texte['30'], texte['70'], texte['110']].map(norm).join('|');
}

export const adressName = (a: Pick<Adresse, 'texte'>) => [a.texte['40'], a.texte['30']].map((x) => x?.trim()).filter(Boolean).join(', ');
export const adressOrt = (a: Pick<Adresse, 'texte'>) => [a.texte['90'], a.texte['110']].map((x) => x?.trim()).filter(Boolean).join(' ');

/** Gefüllte Adressgruppen (Typ 1, Name/Firma vorhanden) einer Projektkarte */
export function adressenAusKarte(projekt: string, pk: Projektkarte): Adresse[] {
  const out: Adresse[] = [];
  for (const g of pk.gruppen.filter((x) => x.typ === 1)) {
    const eintraege = pk.eintraege.filter((e) => e.gruppe === g.id);
    const werte: Record<string, PkWert> = {};
    const texte: Record<string, string> = {};
    for (const e of eintraege) {
      const w = pkWertVon(e);
      werte[String(e.id)] = w;
      texte[String(e.id)] = pkAnzeige(e, w);
    }
    if (!texte['40']?.trim()) continue;
    out.push({ schluessel: adressSchluessel(texte), werte, texte, verwendungen: [{ projekt, gruppe: g.id, rolle: g.text }] });
  }
  return out;
}

/** Gleiche Adressen zusammenführen; die Werte der zuletzt gesehenen Fassung gelten, wenn sie vollständiger ist */
export function zusammenfuehren(liste: Adresse[]): Adresse[] {
  const nach = new Map<string, Adresse>();
  const gefuellt = (a: Adresse) => Object.values(a.texte).filter((t) => t.trim()).length;
  for (const a of liste) {
    const da = nach.get(a.schluessel);
    if (!da) nach.set(a.schluessel, { ...a, verwendungen: [...a.verwendungen] });
    else {
      da.verwendungen.push(...a.verwendungen);
      if (gefuellt(a) > gefuellt(da)) {
        da.werte = a.werte;
        da.texte = a.texte;
      }
    }
  }
  return [...nach.values()].sort((a, b) => adressName(a).localeCompare(adressName(b), 'de'));
}

/** Adressen, die in einer Rolle (Gruppe) vorkommen – die häufigsten zuerst */
export function inRolle(adressen: Adresse[], gruppe: number): Adresse[] {
  const zahl = (a: Adresse) => a.verwendungen.filter((v) => v.gruppe === gruppe).length;
  return adressen.filter((a) => zahl(a) > 0).sort((a, b) => zahl(b) - zahl(a) || adressName(a).localeCompare(adressName(b), 'de'));
}

/** Suche über Name, Ort, Straße, Rollen */
export function sucheAdressen(adressen: Adresse[], q: string): Adresse[] {
  const woerter = q.toLowerCase().split(/\s+/).filter(Boolean);
  if (!woerter.length) return adressen;
  return adressen.filter((a) => {
    const text = `${Object.values(a.texte).join(' ')} ${a.verwendungen.map((v) => `${v.rolle} ${v.projekt}`).join(' ')}`.toLowerCase();
    return woerter.every((w) => text.includes(w));
  });
}
