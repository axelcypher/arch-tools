/**
 * Einstellungen der App – für das ganze Büro im gemeinsamen Konfigurationsordner (Bereich „ava“), damit alle
 * dieselbe Ablagestruktur, Benennung und dieselben Vorgaben verwenden. Alles ist im UI änderbar, damit die App
 * nicht nur mit der Struktur eines Büros funktioniert.
 */

import { konfigLesen, konfigSchreiben } from '@core/platform/konfig';
import type { Rechnungsart } from './abrechnung/benennung';
import { VORGABE_ARTEN, VORGABE_MUSTER } from './abrechnung/benennung';
import type { PruefVorgaben } from './abrechnung/pruefung';
import { VORGABE_PRUEFUNG } from './abrechnung/pruefung';
import { VORGABE_SCHLUSSTEXT } from './abrechnung/deckblatt';

export interface MailVorlage {
  id: string;
  name: string;
  /** Empfänger; Platzhalter {Zahler} = bezahlender Baubeteiligter, {Firma} = Auftragnehmer */
  an: string;
  cc: string;
  betreff: string;
  text: string;
}

export interface AvaEinstellungen {
  ablage: {
    /** Ordner der Gewerke im Projekt, z. B. „Gewerke“ (darunter je Gewerk ein Ordner „G08 Fenster“) */
    gewerke: string;
    /** Unterordner der LV-Dateien im Gewerkeordner; leer = direkt darin */
    lv: string;
    /** vergebene Aufträge und Rechnungen */
    auftrag: string;
    /** Mailverkehr des Gewerks */
    korrespondenz: string;
    /** Namen von Archivordnern (im Gewerk und im Auftragsordner) – ihr Inhalt zählt als alt */
    archive: string[];
    /** Name der Kostenkontrolle (Teil des Dateinamens), gesucht im ganzen Projekt */
    kostenkontrolle: string;
    /** Ordner für Bautagebuch, Protokolle, Mängellisten (PDF) */
    bauleitung: string;
    /** weitere Ordner mit Mails des Projekts (für den Mailverlauf), z. B. „Korrespondenz“ */
    mailOrdner: string[];
  };
  rechnungen: {
    /** Muster der Dateinamen: das erste für neue Dateien, alle zum Erkennen */
    muster: string[];
    arten: Rechnungsart[];
    /** Nummer der Rechnungsliste auf dem Deckblatt zeigen */
    nrAufDeckblatt: boolean;
    /** Deckblatt beim Übernehmen digital vor den Scan setzen (sonst wird es mit eingescannt) */
    deckblattVoranstellen: boolean;
  };
  pruefung: PruefVorgaben;
  scan: {
    /** Ordner, in dem der Scanner ablegt (vollständiger Pfad) */
    ordner: string;
    endungen: string[];
  };
  deckblatt: {
    /** Briefbogen als PDF (vollständiger Pfad) – erste Seite als Hintergrund */
    briefbogen: string;
    /** Büro (mehrzeilig) unter dem Gruß und oben rechts ohne Briefbogen */
    buero: string;
    /** „i.A. …“ – Vorgabe: Bearbeiter des Projekts */
    bearbeiter: string;
    /** Fußzeile ohne Briefbogen: Spalten durch Tab, Zeilen durch Zeilenumbruch */
    fusszeile: string;
    schlusstext: string;
  };
  mail: { vorlagen: MailVorlage[] };
  lv: {
    /** Format neuer LV-Dateien */
    neuesFormat: 'aslv' | 'oalv';
    /** Name neuer LV-Dateien: {Kürzel} {Datum} LV {Gewerk} */
    dateiname: string;
  };
}

export const VORGABE_MAIL: MailVorlage[] = [
  {
    id: 'rechnung',
    name: 'Geprüfte Rechnung an den Zahler',
    an: '{Zahler}',
    cc: '',
    betreff: '{Kürzel} {Projekt} – geprüfte Rechnung {Firma} {Rechnung}',
    text: 'Guten Tag,\n\nanbei erhalten Sie die geprüfte Rechnung {Rechnung} der Firma {Firma} ({Gewerk}) mit der Bitte um Überweisung von {Betrag}.\n\nMit freundlichen Grüßen\n{Bearbeiter}',
  },
  {
    id: 'auftrag',
    name: 'Auftrag an die Firma',
    an: '{Firma-Mail}',
    cc: '',
    betreff: '{Kürzel} {Projekt} – Auftrag {Gewerk}',
    text: 'Guten Tag,\n\nanbei erhalten Sie den Auftrag für die {Gewerk}.\n\nMit freundlichen Grüßen\n{Bearbeiter}',
  },
  {
    id: 'protokoll',
    name: 'Protokoll an die Teilnehmer',
    an: '{Teilnehmer}',
    cc: '',
    betreff: '{Kürzel} {Projekt} – Protokoll Nr. {Nr} vom {Datum}',
    text: 'Guten Tag,\n\nanbei das Protokoll der Baubesprechung vom {Datum}. Einwände bitte innerhalb einer Woche.\n\nMit freundlichen Grüßen\n{Bearbeiter}',
  },
];

export const VORGABE: AvaEinstellungen = {
  ablage: {
    gewerke: 'Gewerke',
    lv: '',
    auftrag: 'Auftrag',
    korrespondenz: 'Korrespondenz',
    archive: ['Archiv', '_archiv'],
    kostenkontrolle: 'Kostenkontrolle',
    bauleitung: 'Bauleitung',
    mailOrdner: ['Korrespondenz'],
  },
  rechnungen: { muster: [...VORGABE_MUSTER], arten: VORGABE_ARTEN, nrAufDeckblatt: false, deckblattVoranstellen: false },
  pruefung: VORGABE_PRUEFUNG,
  scan: { ordner: '', endungen: ['pdf', 'jpg', 'jpeg', 'png', 'tif', 'tiff'] },
  deckblatt: { briefbogen: '', buero: '', bearbeiter: '', fusszeile: '', schlusstext: VORGABE_SCHLUSSTEXT },
  mail: { vorlagen: VORGABE_MAIL },
  lv: { neuesFormat: 'aslv', dateiname: '{Kürzel} {Datum} LV {Gewerk}' },
};

const istObj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x);

/** Gespeichertes über die Vorgabe legen (fehlende Angaben aus der Vorgabe, Ungültiges fällt weg) */
export function einstellungenAus(roh: unknown): AvaEinstellungen {
  const r = istObj(roh) ? roh : {};
  const teil = <T extends object>(name: string, vorgabe: T): T => (istObj(r[name]) ? { ...vorgabe, ...(r[name] as Partial<T>) } : { ...vorgabe });
  const e: AvaEinstellungen = {
    ablage: teil('ablage', VORGABE.ablage),
    rechnungen: teil('rechnungen', VORGABE.rechnungen),
    pruefung: teil('pruefung', VORGABE.pruefung),
    scan: teil('scan', VORGABE.scan),
    deckblatt: teil('deckblatt', VORGABE.deckblatt),
    mail: teil('mail', VORGABE.mail),
    lv: teil('lv', VORGABE.lv),
  };
  if (!Array.isArray(e.ablage.archive)) e.ablage.archive = VORGABE.ablage.archive;
  if (!Array.isArray(e.ablage.mailOrdner)) e.ablage.mailOrdner = VORGABE.ablage.mailOrdner;
  if (!Array.isArray(e.rechnungen.muster) || !e.rechnungen.muster.length) e.rechnungen.muster = VORGABE.rechnungen.muster;
  if (!Array.isArray(e.rechnungen.arten) || !e.rechnungen.arten.length) e.rechnungen.arten = VORGABE.rechnungen.arten;
  if (!Array.isArray(e.mail.vorlagen)) e.mail.vorlagen = VORGABE.mail.vorlagen;
  if (!Array.isArray(e.scan.endungen)) e.scan.endungen = VORGABE.scan.endungen;
  return e;
}

export async function einstellungenLaden(): Promise<AvaEinstellungen> {
  return einstellungenAus(await konfigLesen('ava'));
}

export function einstellungenSpeichern(e: AvaEinstellungen): Promise<void> {
  return konfigSchreiben('ava', e);
}

/** Liegt ein Pfad (relativ, „/“) in einem Archivordner? */
export function imArchiv(pfad: string, archive: string[]): boolean {
  const teile = pfad.split('/').slice(0, -1).map((t) => t.toLowerCase());
  return teile.some((t) => archive.some((a) => a.toLowerCase() === t));
}
