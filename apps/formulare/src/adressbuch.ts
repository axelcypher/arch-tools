/**
 * Adressbuch: alle Adressen (Bauherren, Entwurfsverfasser, Behörden, Fachplaner …) aus den Projektkarten aller
 * Projekte, zusammengeführt – gleiche Adressen (Name, Vorname, Straße, Ort) erscheinen einmal, mit allen Verwendungen –,
 * dazu die eigenen Adressen der App: neu angelegte, geänderte Fassungen von Adressen aus den Projektkarten und
 * ausgeblendete. Die eigenen stehen im gemeinsamen Konfigurationsordner (für alle im Büro); die Projektkarten selbst
 * ändert das Adressbuch nicht. So funktioniert es mit und ohne Projektkarten.
 *
 * Stammdaten sind Vorgaben je Rolle (Gruppe der Projektkarte): z. B. „Entwurfsverfasser = unser Büro“,
 * „Bauaufsichtsbehörde = Kreis Soest“. Sie verweisen auf eine Adresse des Adressbuchs.
 */

import type { PkWert, Projektkarte } from './forma/projektkarte';
import { pkAnzeige, pkWertVon } from './forma/projektkarte';

export interface Verwendung {
  /** Kürzel des Projekts */
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
  /** Herkunft: aus Projektkarten (fehlt), dort gefunden und hier geändert, oder eigene Adresse der App */
  herkunft?: 'geaendert' | 'eigen';
}

/** Eigene Adresse der App: neu angelegt oder die geänderte bzw. ausgeblendete Fassung einer Adresse aus den Projektkarten */
export interface EigeneAdresse {
  /** neu angelegt: „e:…“; Fassung einer Adresse aus den Projektkarten: deren Schlüssel */
  schluessel: string;
  /** Eintragsnummer → Text (wie in den Adressgruppen der Projektkarte) */
  texte: Record<string, string>;
  /** aus dem Adressbuch ausgeblendet (nur Adressen aus den Projektkarten) */
  ausgeblendet?: boolean;
  /** zuletzt geändert (ms) */
  geaendert: number;
}

/** Einträge, die sich im Adressbuch bearbeiten lassen (Texte; Auswahllisten wie Anrede bleiben, wie sie sind) */
export const ADRESS_TEXTFELDER: [string, string][] = [
  ['10', 'Branche'],
  ['20', 'Titel'],
  ['30', 'Vorname'],
  ['40', 'Name/Firma'],
  ['50', 'Abteilung'],
  ['60', 'zu Händen'],
  ['70', 'Straße/Nr.'],
  ['80', 'Postfach'],
  ['90', 'PLZ'],
  ['100', 'PLZ Postfach'],
  ['110', 'Ort'],
  ['120', 'Land'],
  ['130', 'Telefon 1'],
  ['140', 'Telefon 2'],
  ['150', 'Telefax'],
  ['160', 'Mobilfunk'],
  ['170', 'E-Mail'],
  ['180', 'Internet'],
];

/** Gelesene eigene Adressen prüfen */
export function eigeneAdressenAus(roh: unknown): EigeneAdresse[] {
  if (!Array.isArray(roh)) return [];
  return roh
    .filter((x): x is Record<string, unknown> => !!x && typeof x === 'object' && typeof (x as { schluessel?: unknown }).schluessel === 'string')
    .map((x) => ({
      schluessel: String(x.schluessel),
      texte: x.texte && typeof x.texte === 'object' ? Object.fromEntries(Object.entries(x.texte as Record<string, unknown>).filter((e): e is [string, string] => typeof e[1] === 'string')) : {},
      ...(x.ausgeblendet === true ? { ausgeblendet: true } : {}),
      geaendert: typeof x.geaendert === 'number' ? x.geaendert : 0,
    }));
}

/** Neue eigene Adresse */
export const neueEigeneAdresse = (texte: Record<string, string> = {}): EigeneAdresse => ({ schluessel: `e:${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, texte, geaendert: Date.now() });

/**
 * Das Adressbuch, wie es gilt: die Adressen aus den Projektkarten – geänderte in der eigenen Fassung (Verwendungen
 * bleiben), ausgeblendete nicht –, dazu die neu angelegten. Werte zum Übernehmen in eine Projektkarte: die Texte der
 * eigenen Fassung, Auswahllisten (Anrede …) aus der Projektkarte.
 */
export function wirksameAdressen(karten: Adresse[], eigene: EigeneAdresse[]): Adresse[] {
  const nach = new Map(eigene.map((e) => [e.schluessel, e]));
  const out: Adresse[] = [];
  for (const a of karten) {
    const e = nach.get(a.schluessel);
    if (!e) out.push(a);
    else if (!e.ausgeblendet) out.push({ ...a, texte: { ...a.texte, ...e.texte }, werte: { ...a.werte, ...e.texte }, herkunft: 'geaendert' });
  }
  for (const e of eigene) if (e.schluessel.startsWith('e:') && !e.ausgeblendet && e.texte['40']?.trim()) out.push({ schluessel: e.schluessel, texte: { ...e.texte }, werte: { ...e.texte }, verwendungen: [], herkunft: 'eigen' });
  return out.sort((a, b) => adressName(a).localeCompare(adressName(b), 'de'));
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
