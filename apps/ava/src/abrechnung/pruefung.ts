/**
 * Rechnungsprüfung („Kostenfeststellung / Anhang Rechnungsprüfung“): aus der geprüften Nettosumme bis zur
 * Zahlungsfreigabe – Nachlass, Umsatzsteuer, Gemeinkostenumlage (Bauumlage), Sicherheitseinbehalt, Skonto und
 * die bereits geleisteten Zahlungen. Jeder Schritt wird auf Cent gerundet, wie im Deckblatt des Büros:
 *
 *   Netto-Freigabesumme − Nachlass = 1. Zwischensumme; + USt = Brutto-Freigabesumme; − Umlage = 2. Zwischensumme;
 *   − Sicherheitseinbehalt = 3. Zwischensumme; − Skonto = Endsumme; − bisher freigegeben = Zahlungsfreigabe.
 */

import { rund2 } from '../lv/rechnen';
import type { Rechnungsart } from './benennung';
import { artTyp } from './benennung';

export interface VorigeZahlung {
  text: string;
  datum?: string;
  betrag: number;
}

export interface Pruefung {
  /** Nettoforderung laut Rechnung (bei Abschlagsrechnungen kumuliert) */
  forderungNetto: number | null;
  /** geprüfte, freigegebene Nettosumme (bei Abschlagsrechnungen kumuliert) */
  freigabeNetto: number;
  nachlassProzent: number;
  mwstProzent: number;
  /** Gemeinkostenumlage / Bauumlage in % vom Bruttobetrag */
  umlageProzent: number;
  /** Sicherheitseinbehalt in % (Abschläge: Vertragserfüllung; Schlussrechnung: Sicherheit für Mängelansprüche) */
  einbehaltProzent: number;
  /** Text neben dem Einbehalt, z. B. „bei Abschlagsrechnungen“ */
  einbehaltText?: string;
  skontoProzent: number;
  /** Skontofrist in Tagen ab Zugang (nur Anzeige auf dem Deckblatt) */
  skontoTage?: number;
  /** bisher freigegebene Zahlungen (vorige Abschläge) */
  bereits: VorigeZahlung[];
  /** Anmerkungen zur Prüfung (Korrekturen) */
  anmerkung?: string;
}

export interface PruefErgebnis {
  freigabeNetto: number;
  nachlass: number;
  zwischen1: number;
  mwst: number;
  brutto: number;
  umlage: number;
  zwischen2: number;
  einbehalt: number;
  zwischen3: number;
  skonto: number;
  endsumme: number;
  bereits: number;
  zahlung: number;
  /** Kürzung gegenüber der Forderung (netto) */
  kuerzungNetto: number | null;
}

export function pruefen(p: Pruefung): PruefErgebnis {
  const freigabeNetto = rund2(p.freigabeNetto);
  const nachlass = rund2((freigabeNetto * p.nachlassProzent) / 100);
  const zwischen1 = rund2(freigabeNetto - nachlass);
  const mwst = rund2((zwischen1 * p.mwstProzent) / 100);
  const brutto = rund2(zwischen1 + mwst);
  const umlage = rund2((brutto * p.umlageProzent) / 100);
  const zwischen2 = rund2(brutto - umlage);
  const einbehalt = rund2((zwischen2 * p.einbehaltProzent) / 100);
  const zwischen3 = rund2(zwischen2 - einbehalt);
  const skonto = rund2((zwischen3 * p.skontoProzent) / 100);
  const endsumme = rund2(zwischen3 - skonto);
  const bereits = rund2(p.bereits.reduce((s, z) => s + z.betrag, 0));
  return {
    freigabeNetto,
    nachlass,
    zwischen1,
    mwst,
    brutto,
    umlage,
    zwischen2,
    einbehalt,
    zwischen3,
    skonto,
    endsumme,
    bereits,
    zahlung: rund2(endsumme - bereits),
    kuerzungNetto: p.forderungNetto === null ? null : rund2(p.forderungNetto - freigabeNetto),
  };
}

export interface PruefVorgaben {
  mwstProzent: number;
  umlageProzent: number;
  einbehaltProzent: number;
  nachlassProzent: number;
  skontoProzent: number;
  /**
   * Sicherheit für Mängelansprüche in % (§ 17 VOB/B) bei Schluss- und Teilschlussrechnungen, falls im Büro üblich;
   * ohne Wert fragt die Prüfung nach (nichts wird als „vereinbart“ unterstellt)
   */
  sicherheitMaengelProzent?: number;
}

export const VORGABE_PRUEFUNG: PruefVorgaben = { mwstProzent: 19, umlageProzent: 0.5, einbehaltProzent: 10, nachlassProzent: 0, skontoProzent: 0 };

export const TEXT_EINBEHALT_ABSCHLAG = 'bei Abschlagsrechnungen';
export const TEXT_EINBEHALT_SCHLUSS = 'Sicherheit für Mängelansprüche';

/** Vorschlag für Einbehalt und bisherige Zahlungen je nach Rechnungsart */
export interface PruefVorschlag {
  einbehaltProzent: number;
  einbehaltText: string;
  bereits: VorigeZahlung[];
  /** Schluss-/Teilschlussrechnung ohne hinterlegten Satz für die Sicherheit für Mängelansprüche: bitte prüfen */
  einbehaltUnklar: boolean;
}

/**
 * Vorschlag je Rechnungsart:
 * - Abschlagsrechnung: Einbehalt nach Vorgabe; ab der zweiten die bisherigen Zahlungen der Reihe als „bisher freigegeben“.
 * - Schlussrechnung: alle bisherigen Zahlungen; Einbehalt = Sicherheit für Mängelansprüche (aus dem LV, sonst aus
 *   den Einstellungen, sonst 0 mit Hinweis „bitte prüfen“).
 * - Teilschlussrechnung (§ 16 Abs. 4 VOB/B): wie Schlussrechnung, aber bisherige Zahlungen nur nach Auswahl (leer).
 * - Rechnung: Einbehalt nach Vorgabe, keine bisherigen Zahlungen.
 */
export function pruefVorschlag(v: PruefVorgaben, art: Rechnungsart | undefined, lfd: number | null | undefined, vorige: VorigeZahlung[], maengelAusLv?: number): PruefVorschlag {
  const typ = artTyp(art);
  if (typ === 'schluss' || typ === 'teilschluss') {
    const satz = maengelAusLv ?? v.sicherheitMaengelProzent;
    return { einbehaltProzent: satz ?? 0, einbehaltText: TEXT_EINBEHALT_SCHLUSS, bereits: typ === 'schluss' ? vorige : [], einbehaltUnklar: satz === undefined };
  }
  if (typ === 'abschlag') return { einbehaltProzent: v.einbehaltProzent, einbehaltText: TEXT_EINBEHALT_ABSCHLAG, bereits: (lfd ?? 1) > 1 ? vorige : [], einbehaltUnklar: false };
  return { einbehaltProzent: v.einbehaltProzent, einbehaltText: TEXT_EINBEHALT_ABSCHLAG, bereits: [], einbehaltUnklar: false };
}

/** neue Prüfung mit den Vorgaben und dem Vorschlag der Rechnungsart */
export function neuePruefung(v: PruefVorgaben, o: { vorschlag?: PruefVorschlag; forderungNetto?: number | null } = {}): Pruefung {
  return {
    forderungNetto: o.forderungNetto ?? null,
    freigabeNetto: o.forderungNetto ?? 0,
    nachlassProzent: v.nachlassProzent,
    mwstProzent: v.mwstProzent,
    umlageProzent: v.umlageProzent,
    einbehaltProzent: o.vorschlag?.einbehaltProzent ?? v.einbehaltProzent,
    einbehaltText: o.vorschlag?.einbehaltText ?? TEXT_EINBEHALT_ABSCHLAG,
    skontoProzent: v.skontoProzent,
    bereits: o.vorschlag?.bereits ?? [],
  };
}

/** Euro wie im Deckblatt: „27.824,22 €“ */
export const euro = (n: number | null | undefined) =>
  n === null || n === undefined || !Number.isFinite(n) ? '' : `${n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;

export const prozent = (n: number) => `${n.toLocaleString('de-DE', { maximumFractionDigits: 2 })} %`;

export const datumDE = (iso: string | undefined) => (iso && /^\d{4}-\d{2}-\d{2}/.test(iso) ? `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}` : '');
