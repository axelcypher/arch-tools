/**
 * Angaben der App zum Projekt im Abschnitt „ava“ der Projektdatei (.oap) – der gemeinsamen Quelle der
 * Projektdaten aller Apps: geprüfte Rechnungen (mit den Angaben für das Deckblatt), Angaben je Gewerk
 * (Auftragnehmer, Kontakt, Zahler), Bautagebuch, Protokolle, Mängel, Notizen, Beteiligte.
 *
 * Geändert wird immer auf dem frisch gelesenen Stand der Datei (`avaAendern`), damit Änderungen anderer Apps
 * und Kollegen nicht verloren gehen.
 */

import type { ProjektordnerZugriff } from '@core/platform/projektordner';
import { projektdateiSchreiben } from '@core/platform/projektordner';
import type { Pruefung } from './abrechnung/pruefung';

export interface GewerkAngaben {
  /** Auftragnehmer (Firma) */
  firma?: string;
  /** Ansprechpartner und Kontakt der Firma */
  ansprechpartner?: string;
  email?: string;
  telefon?: string;
  /** wer die Rechnungen dieses Gewerks bezahlt (E-Mail), falls abweichend vom Projekt */
  zahler?: string;
  /** Kostengruppe nach DIN 276 */
  kostengruppe?: string;
  notiz?: string;
}

export type RechnungsStatus = 'erfasst' | 'abgelegt' | 'versendet';

export interface RechnungsDatensatz {
  id: string;
  gewerk: string;
  /** Nummer der Rechnungsliste */
  nr: number | string;
  art: string;
  /** laufende Nummer der Art (1 bei AB1) */
  lfd?: number;
  firma: string;
  /** Rechnungsnummer des Auftragnehmers */
  rechnungsnummer?: string;
  rechnungsdatum?: string;
  /** Tag der Freigabe (Prüfung) */
  freigabe?: string;
  pruefung?: Pruefung;
  /** Zahlungsfreigabe (brutto) – so in der Rechnungsliste */
  betrag: number;
  /** abgelegte Datei, relativ zum Projektordner */
  datei?: string;
  status: RechnungsStatus;
  erfasst: string;
  /** an wen und wann weitergeleitet */
  versendet?: { an: string; am: string };
  bemerkung?: string;
}

export interface Beteiligter {
  id: string;
  rolle: string;
  firma?: string;
  name?: string;
  email?: string;
  telefon?: string;
  gewerk?: string;
}

export interface Firmeneinsatz {
  firma: string;
  gewerk?: string;
  personen?: number;
  taetigkeit?: string;
}

export interface Tagesbericht {
  id: string;
  datum: string;
  nr?: number;
  wetter?: string;
  temperatur?: string;
  firmen: Firmeneinsatz[];
  leistungen: string;
  behinderungen?: string;
  anordnungen?: string;
  besucher?: string;
  /** Fotos, relativ zum Projektordner */
  fotos: string[];
  verfasser?: string;
}

export interface Top {
  id: string;
  nr: string;
  titel: string;
  text: string;
  zustaendig?: string;
  frist?: string;
  erledigt?: boolean;
  /** aus Protokoll Nr. … übernommen */
  aus?: number;
}

export interface Protokoll {
  id: string;
  nr: number;
  art: string;
  datum: string;
  beginn?: string;
  ende?: string;
  ort?: string;
  teilnehmer: { name: string; firma?: string; email?: string; anwesend: boolean }[];
  tops: Top[];
  verteiler?: string;
  naechsterTermin?: string;
  verfasser?: string;
}

export type MangelStatus = 'offen' | 'angezeigt' | 'erledigt' | 'abgenommen';

export interface Mangel {
  id: string;
  nr: number;
  gewerk?: string;
  firma?: string;
  ort?: string;
  beschreibung: string;
  festgestellt: string;
  frist?: string;
  status: MangelStatus;
  fotos: string[];
  erledigtAm?: string;
}

export interface Notiz {
  id: string;
  datum: string;
  text: string;
  gewerk?: string;
  /** Aufgabe mit Frist */
  frist?: string;
  erledigt?: boolean;
}

export interface AvaProjekt {
  /** gewählte Kostenkontrolle (relativ zum Projektordner), wenn nicht die gefundene */
  kostenkontrolle?: string;
  /** wer die Rechnungen bezahlt (E-Mail), Vorgabe für alle Gewerke */
  zahler?: string;
  gewerke: Record<string, GewerkAngaben>;
  rechnungen: RechnungsDatensatz[];
  beteiligte: Beteiligter[];
  bautagebuch: Tagesbericht[];
  protokolle: Protokoll[];
  maengel: Mangel[];
  notizen: Notiz[];
}

export const leeresAvaProjekt = (): AvaProjekt => ({ gewerke: {}, rechnungen: [], beteiligte: [], bautagebuch: [], protokolle: [], maengel: [], notizen: [] });

const arr = <T>(x: unknown): T[] => (Array.isArray(x) ? (x as T[]) : []);

export function avaAus(roh: unknown): AvaProjekt {
  const r = roh && typeof roh === 'object' ? (roh as Record<string, unknown>) : {};
  return {
    ...(typeof r.kostenkontrolle === 'string' ? { kostenkontrolle: r.kostenkontrolle } : {}),
    ...(typeof r.zahler === 'string' ? { zahler: r.zahler } : {}),
    gewerke: r.gewerke && typeof r.gewerke === 'object' ? (r.gewerke as Record<string, GewerkAngaben>) : {},
    rechnungen: arr(r.rechnungen),
    beteiligte: arr(r.beteiligte),
    bautagebuch: arr(r.bautagebuch),
    protokolle: arr(r.protokolle),
    maengel: arr(r.maengel),
    notizen: arr(r.notizen),
  };
}

/** Abschnitt „ava“ der Projektdatei auf dem frischen Stand ändern; liefert den neuen Stand */
export async function avaAendern(fs: ProjektordnerZugriff, root: string, oapPfad: string, aendern: (a: AvaProjekt) => AvaProjekt): Promise<AvaProjekt> {
  let neu: AvaProjekt = leeresAvaProjekt();
  await projektdateiSchreiben(fs, root, oapPfad, (roh) => {
    neu = aendern(avaAus(roh.ava));
    return { ...roh, ava: neu };
  });
  return neu;
}
