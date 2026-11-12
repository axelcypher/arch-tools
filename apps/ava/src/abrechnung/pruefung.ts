/**
 * Rechnungsprüfung („Kostenfeststellung / Anhang Rechnungsprüfung“): aus der geprüften Nettosumme bis zur
 * Zahlungsfreigabe – Nachlass, Umsatzsteuer, Gemeinkostenumlage (Bauumlage), Sicherheitseinbehalt, Skonto und
 * die bereits geleisteten Zahlungen. Jeder Schritt wird auf Cent gerundet, wie im Deckblatt des Büros:
 *
 *   Netto-Freigabesumme − Nachlass = 1. Zwischensumme; + USt = Brutto-Freigabesumme; − Umlage = 2. Zwischensumme;
 *   − Sicherheitseinbehalt = 3. Zwischensumme; − Skonto = Endsumme; − bereits erhalten = Zahlungsfreigabe.
 */

import { rund2 } from '../lv/rechnen';

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
  /** Sicherheitseinbehalt in % (bei Schlussrechnungen meist 0) */
  einbehaltProzent: number;
  /** Text neben dem Einbehalt, z. B. „ä Abschlagsrechnungen“ */
  einbehaltText?: string;
  skontoProzent: number;
  /** bereits erhaltene Zahlungen (vorige Abschläge) */
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
}

export const VORGABE_PRUEFUNG: PruefVorgaben = { mwstProzent: 19, umlageProzent: 0.5, einbehaltProzent: 10, nachlassProzent: 0, skontoProzent: 0 };

/** neue Prüfung mit den Vorgaben; bei Schlussrechnungen ohne Einbehalt */
export function neuePruefung(v: PruefVorgaben, o: { schluss?: boolean; forderungNetto?: number | null; bereits?: VorigeZahlung[] } = {}): Pruefung {
  return {
    forderungNetto: o.forderungNetto ?? null,
    freigabeNetto: o.forderungNetto ?? 0,
    nachlassProzent: v.nachlassProzent,
    mwstProzent: v.mwstProzent,
    umlageProzent: v.umlageProzent,
    einbehaltProzent: o.schluss ? 0 : v.einbehaltProzent,
    einbehaltText: o.schluss ? 'Bei Schlussrechnung' : 'ä Abschlagsrechnungen',
    skontoProzent: v.skontoProzent,
    bereits: o.bereits ?? [],
  };
}

/** Euro wie im Deckblatt: „27.824,22 €“ */
export const euro = (n: number | null | undefined) =>
  n === null || n === undefined || !Number.isFinite(n) ? '' : `${n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;

export const prozent = (n: number) => `${n.toLocaleString('de-DE', { maximumFractionDigits: 2 })} %`;

export const datumDE = (iso: string | undefined) => (iso && /^\d{4}-\d{2}-\d{2}/.test(iso) ? `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}` : '');
