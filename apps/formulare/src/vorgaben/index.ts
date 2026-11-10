/**
 * Vorgaben der App je Formular und Stand (`<Kennung>|<Stand>`, wie der Profilschlüssel): Titel der Felder und
 * Abschnitte, Gruppen und Bedingungen nach der Rechtsgrundlage (BauO NRW, BauPrüfVO). Die eigenen Einstellungen
 * liegen darüber und gehen vor (siehe vorgabe.ts).
 *
 * Eine Datei je Formular (`nw<Kennung>.ts`), die `vorgaben` exportiert – Schlüssel → Profil (mehrere Stände mit
 * denselben Feldern dürfen dasselbe Profil nutzen). Die Dateien tragen sich hier von selbst ein.
 *
 * Feld- und Abschnittsschlüssel prüft `vorgaben.test.ts` gegen die echten Formulare (unter `.ref/`).
 */

import type { FormularProfil } from '../profil';

const dateien = import.meta.glob<Record<string, FormularProfil>>('./nw*.ts', { eager: true, import: 'vorgaben' });

export const VORGABEN: Record<string, FormularProfil> = {};
for (const [datei, vorgaben] of Object.entries(dateien)) {
  for (const [schluessel, profil] of Object.entries(vorgaben ?? {})) {
    if (schluessel in VORGABEN) throw new Error(`Vorgabe ${schluessel} doppelt (${datei})`);
    VORGABEN[schluessel] = profil;
  }
}
