/**
 * Gemeinsame Teile der Erhebungsbögen der Bautätigkeitsstatistik (Hochbaustatistikgesetz, IT.NRW): Baugenehmigung
 * (nw010020), Baufertigstellung (nw010021) und Bauabgang (nw010022).
 *
 * Zahlen stehen dort in Ziffernkästchen (je Ziffer ein Textfeld). Eine Zahl ist eine Angabe: die Kästchen einer Zahl
 * bilden eine Gruppe „eins“ (führende Kästchen bleiben leer), ein Datum (Monat, Jahr) eine Gruppe „alle“.
 * Identifikationsnummer, Bauscheinnummer/Aktenzeichen und Straßenschlüssel trägt die Behörde bzw. das Statistische
 * Landesamt ein – sie zählen nicht.
 *
 * Der Baufertigstellungsbogen ist auch die dritte Seite des Baugenehmigungsbogens; er wird erst nach der
 * Bezugsfertigstellung ausgefüllt und eingereicht. Dort zählt er nicht (`spaeter`).
 */

import type { FormularProfil } from '../profil';
import { zusammen } from './antrag';
import { angekreuzt, fuer, gruppeV, s, wenn, zaehltNicht } from './hilfen';

/** `memos(5, 8)` → `['Memo5', 'Memo6', 'Memo7', 'Memo8']` */
export const memos = (von: number, bis: number): string[] => Array.from({ length: bis - von + 1 }, (_, i) => `Memo${von + i}`);

/** Titel der Ziffernkästchen einer Angabe: „<titel>, Ziffer 1“ … */
export const zifferTitel = (schluessel: string[], titel: string): Record<string, string> => Object.fromEntries(schluessel.map((k, i) => [k, `${titel}, Ziffer ${i + 1}`]));

/** Datum aus Monat (2 Kästchen) und Jahr (4 Kästchen) */
export const monatJahrTitel = (schluessel: string[], titel: string): Record<string, string> => ({
  ...zifferTitel(schluessel.slice(0, 2), `${titel}: Monat`),
  ...zifferTitel(schluessel.slice(2), `${titel}: Jahr`),
});

/** irgendeins der Felder ausgefüllt (z. B. eine Zahl in Ziffernkästchen angegeben) */
export const eineAngabe = (schluessel: string[]) => schluessel.map((k) => angekreuzt(k));

/**
 * Kopf des Baugenehmigungs- und des Baufertigstellungsbogens (gleiche Komponentennamen): Kennnummern,
 * Bauherr/Bauherrin, Anschrift und Lage des Baugrundstücks, Datum der Baugenehmigung bzw. Genehmigungsfreistellung.
 */
export function kopfBauherr(seite: number, vor = ''): Partial<FormularProfil> {
  const k = s(seite);
  return {
    feldTitel: {
      [`${seite}:Memo1`]: `${vor}Identifikationsnummer (trägt die Behörde ein)`,
      ...zifferTitel(k('Memo0', ...memos(2, 20)), `${vor}Bauscheinnummer/Aktenzeichen (trägt die Behörde ein)`),
      [`${seite}:Memo21`]: `${vor}Bauherr/Bauherrin: Name/Firma`,
      [`${seite}:Memo22`]: `${vor}Bauherr/Bauherrin: Name/Firma (2. Zeile)`,
      [`${seite}:Memo23`]: `${vor}Bauherr/Bauherrin: Anschrift (Straße, Hausnummer)`,
      [`${seite}:Memo24`]: `${vor}Bauherr/Bauherrin: Anschrift (Postleitzahl, Ort)`,
      [`${seite}:Memo25`]: `${vor}Baugrundstück: Straße`,
      [`${seite}:Memo26`]: `${vor}Baugrundstück: Hausnummer`,
      [`${seite}:Memo27`]: `${vor}Baugrundstück: Postleitzahl`,
      [`${seite}:Memo28`]: `${vor}Baugrundstück: Ort`,
      [`${seite}:Memo29`]: `${vor}Lage des Baugrundstücks: Gemeinde`,
      [`${seite}:Memo30`]: `${vor}Lage des Baugrundstücks: Gemeindeteil`,
      ...monatJahrTitel(k(...memos(31, 36)), `${vor}Datum der Baugenehmigung bzw. Genehmigungsfreistellung`),
    },
    // Kennnummern der Behörde; die zweite Namenszeile ist nur bei Bedarf
    zaehlt: zaehltNicht(...k('Memo1', 'Memo0', ...memos(2, 20), 'Memo22')),
  };
}

/**
 * Baufertigstellungsbogen auf Seite `seite` (eigenes Formular nw010021 oder Seite 3 von nw010020). Mit `spaeter`
 * zählt nichts davon (wird erst nach der Bezugsfertigstellung ausgefüllt).
 */
export function baufertigstellung(seite: number, spaeter = false): FormularProfil {
  const k = s(seite);
  const vor = spaeter ? 'Baufertigstellung: ' : '';
  const genehmigt = k(...memos(31, 36));
  const fertig = k(...memos(37, 42));
  const aenderung = k('CheckBox43', 'CheckBox44');
  const regel = spaeter ? 'nie' : undefined;
  return zusammen(kopfBauherr(seite, vor), {
    abschnitte: {
      [`${seite}:Panel1`]: { titel: spaeter ? 'Baufertigstellung (erst nach Bezugsfertigstellung): 1 Allgemeine Angaben' : '1 Allgemeine Angaben (Bauherr/Bauherrin, Baugrundstück)' },
      [`${seite}:Panel5`]: { titel: `${vor}Ansprechpartner/-in für Rückfragen (freiwillige Angabe)` },
      [`${seite}:-`]: { titel: `${vor}Lage des Baugrundstücks, Baugenehmigung und Bezugsfertigstellung` },
    },
    feldTitel: {
      [`${seite}:Memo51`]: `${vor}Ansprechpartner/-in: Name (freiwillig)`,
      [`${seite}:Memo52`]: `${vor}Ansprechpartner/-in: Telefon und/oder E-Mail (freiwillig)`,
      ...monatJahrTitel(fertig, `${vor}Datum der Bezugsfertigstellung`),
      [`${seite}:CheckBox43`]: `${vor}Änderungen seit dem Erhebungsbogen für Baugenehmigung: ja`,
      [`${seite}:CheckBox44`]: `${vor}Änderungen seit dem Erhebungsbogen für Baugenehmigung: nein`,
      [`${seite}:Memo45`]: `${vor}Angabe der Änderungen`,
    },
    zaehlt: spaeter ? zaehltNicht(...k(...memos(0, 42), 'Memo45', 'Memo51', 'Memo52', 'CheckBox43', 'CheckBox44')) : zaehltNicht(...k('Memo51', 'Memo52')),
    gruppen: [
      gruppeV(`bf${seite}-genehmigung`, `${vor}Datum der Baugenehmigung bzw. Genehmigungsfreistellung (Monat, Jahr)`, regel ?? 'alle', genehmigt),
      gruppeV(`bf${seite}-fertigstellung`, `${vor}Datum der Bezugsfertigstellung (Monat, Jahr)`, regel ?? 'alle', fertig),
      gruppeV(`bf${seite}-aenderungen`, `${vor}Änderungen seit dem Erhebungsbogen für Baugenehmigung: ja oder nein`, regel ?? 'eins', aenderung),
    ],
    // „Falls ‚Ja‘, geben Sie die Änderungen an“
    bedingungen: fuer(k('Memo45'), wenn(angekreuzt(`${seite}:CheckBox43`))),
  });
}
