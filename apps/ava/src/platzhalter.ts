/**
 * Variablen von FABRIO – die globalen der Suite (@core/platzhalter) und die lokalen von FABRIO, je Zusammenhang. Alte Namen
 * aus gespeicherten Einstellungen gelten weiter: {Kürzel} = {PROJEKT_KUERZEL}, {Projekt} = {PROJEKT_VORHABEN} (ohne
 * Vorhaben der Name des Projekts), {Bearbeiter} = {BEARBEITER}, {Firma-Mail} = {FirmaMail}; {Datum} ist in den
 * Rechnungen das Rechnungsdatum, im Protokoll das Datum der Besprechung und im Namen neuer LV-Dateien der heutige Tag
 * ({DATUM}).
 */

import type { ProjectMeta } from '@core/model';
import { FABRIO_FIRMA, FABRIO_GEWERK, FABRIO_LV, FABRIO_RECHNUNG, GLOBAL_FABRIO } from '@core/einstellungen/variablen';
import { ersetzen, globaleWerte, type Variable, type Wert } from '@core/platzhalter';

/** globale Variablen mit den alten Namen von FABRIO; Rechnungs- und LV-Namen – eine Quelle in core (zentrale Einstellungen) */
const GLOBAL: Variable[] = GLOBAL_FABRIO;
const gewerk = FABRIO_GEWERK;
const firma = FABRIO_FIRMA;
export const RECHNUNG_NAME_VARIABLEN: Variable[] = FABRIO_RECHNUNG;
export const LV_NAME_VARIABLEN: Variable[] = FABRIO_LV;

/** Mailvorlage für geprüfte Rechnungen (und weitere Vorlagen außer dem Protokoll) */
export const MAIL_RECHNUNG_VARIABLEN: Variable[] = [
  ...GLOBAL,
  gewerk,
  firma,
  { name: 'FirmaMail', text: 'E-Mail des Auftragnehmers', aliase: ['Firma-Mail'] },
  { name: 'Rechnung', text: 'Rechnung, z. B. AB 2' },
  { name: 'Nr', text: 'Nummer der Rechnungsliste' },
  { name: 'Betrag', text: 'geprüfter Betrag' },
  { name: 'Rechnungsdatum', text: 'Rechnungsdatum (TT.MM.JJJJ)', aliase: ['Datum'] },
  { name: 'Zahler', text: 'E-Mail des bezahlenden Baubeteiligten' },
];

/** Mailvorlage für Protokolle */
export const MAIL_PROTOKOLL_VARIABLEN: Variable[] = [
  ...GLOBAL,
  { name: 'Nr', text: 'Nummer des Protokolls' },
  { name: 'Protokolldatum', text: 'Datum der Besprechung (TT.MM.JJJJ)', aliase: ['Datum'] },
  { name: 'Teilnehmer', text: 'E-Mail-Adressen der Teilnehmer' },
];

/** Variablen einer Mailvorlage nach ihrer Kennung */
export const mailVariablen = (id: string) => (id === 'protokoll' ? MAIL_PROTOKOLL_VARIABLEN : MAIL_RECHNUNG_VARIABLEN);

/**
 * Werte der globalen Variablen in FABRIO: {PROJEKT_VORHABEN} ohne Vorhaben der Name des Projekts (wie früher
 * {Projekt}), {BEARBEITER} aus den Einstellungen des Deckblatts, sonst aus der Projektdatei.
 */
export function globaleAva(meta: Pick<ProjectMeta, 'projektcode' | 'kurzname' | 'vorhaben' | 'bearbeiter'>, projektName: string, bearbeiter?: string, datum?: Date): Record<string, Wert> {
  return globaleWerte({ projektcode: meta.projektcode, kurzname: meta.kurzname, vorhaben: meta.vorhaben || projektName, bearbeiter: bearbeiter || meta.bearbeiter || '', datum });
}

/** Name einer neuen LV-Datei (ohne Bezeichnung und Endung); unbekannte Platzhalter fallen weg */
export function lvDateiname(vorlage: string, werte: Record<string, Wert>): string {
  // Werte ohne „/“ und andere unzulässige Zeichen – ein „/“ im Vorhaben darf keinen Unterordner ergeben
  return ersetzen(vorlage, LV_NAME_VARIABLEN, werte, { saeubern: (t) => t.replace(/[\\/:*?"<>|]+/g, ' ') })
    .replace(/\{[^}]*\}/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}
