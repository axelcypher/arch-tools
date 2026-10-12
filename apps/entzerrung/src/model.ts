import type { Pt } from './geo/mat';

/**
 * Datenmodell. Alle Punkte, die etwas im Foto markieren (Referenz, Hilfslinien, Messpunkte), stehen in
 * Pixeln des Originalfotos (verzeichnet, y nach unten). So bleiben Messungen an ihren Bildmerkmalen,
 * wenn Referenz oder Verzeichnung nachgebessert werden – die Werte rechnen sich neu.
 * Koordinaten der Ebene sind Meter mit x nach rechts und y nach oben.
 */

export type Methode = 'rechteck' | 'passpunkte' | 'fluchtlinien';

export interface Linie {
  id: string;
  a: Pt;
  b: Pt;
}

export interface Passpunkt {
  id: string;
  bild: Pt;
  /** Koordinaten in der Ebene (m); fehlt einer, zählt der Punkt nicht */
  x?: number;
  y?: number;
}

export interface Mass extends Linie {
  /** wahre Länge in m */
  laenge?: number;
}

export type MessArt = 'strecke' | 'linienzug' | 'flaeche';

export interface Messung {
  id: string;
  art: MessArt;
  name: string;
  punkte: Pt[];
}

export interface Bereich {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface Ebene {
  id: string;
  name: string;
  methode: Methode;
  /** Ecken in der Reihenfolge links unten, rechts unten, rechts oben, links oben */
  rechteck: { ecken: Pt[]; breite?: number; hoehe?: number };
  passpunkte: Passpunkt[];
  fluchtlinien: { waagerecht: Linie[]; senkrecht: Linie[]; masse: Mass[] };
  /** Ausschnitt in Ebenenkoordinaten (m); ohne Angabe automatisch */
  ausschnitt?: Bereich;
  /** Auflösung für Ansicht und Export in m je Pixel; ohne Angabe automatisch */
  aufloesung?: number;
  messungen: Messung[];
}

export interface Hilfslinie {
  id: string;
  punkte: Pt[];
}

export interface Foto {
  id: string;
  name: string;
  mime: string;
  breite: number;
  hoehe: number;
  /** Objektivverzeichnung (siehe geo/verzeichnung.ts) */
  linse: { k1: number; k2: number; vorher?: number; nachher?: number };
  hilfslinien: Hilfslinie[];
  ebenen: Ebene[];
}

export interface Dokument {
  fotos: Foto[];
}

export const ECKEN = ['links unten', 'rechts unten', 'rechts oben', 'links oben'] as const;
export const ECKEN_KURZ = ['LU', 'RU', 'RO', 'LO'] as const;

export const FARBEN = ['#e8590c', '#1c7ed6', '#2b8a3e', '#ae3ec9', '#f08c00', '#0b7285'];

let zaehler = 0;
export function neueId(): string {
  zaehler = (zaehler + 1) % 1e6;
  return `${Date.now().toString(36)}${zaehler.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export function neueEbene(nummer: number): Ebene {
  return {
    id: neueId(),
    name: `Ebene ${nummer}`,
    methode: 'rechteck',
    rechteck: { ecken: [] },
    passpunkte: [],
    fluchtlinien: { waagerecht: [], senkrecht: [], masse: [] },
    messungen: [],
  };
}

export function neuesFoto(id: string, name: string, mime: string, breite: number, hoehe: number): Foto {
  return { id, name, mime, breite, hoehe, linse: { k1: 0, k2: 0 }, hilfslinien: [], ebenen: [neueEbene(1)] };
}

export const MESS_NAMEN: Record<MessArt, string> = { strecke: 'Strecke', linienzug: 'Linienzug', flaeche: 'Fläche' };
