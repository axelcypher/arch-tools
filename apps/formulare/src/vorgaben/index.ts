/**
 * Vorgaben der App je Formular und Stand (`<Kennung>|<Stand>`, wie der Profilschlüssel): Titel der Felder und
 * Abschnitte, Gruppen und Bedingungen nach der Rechtsgrundlage (BauO NRW, BauPrüfVO). Die eigenen Einstellungen
 * liegen darüber und gehen vor (siehe vorgabe.ts).
 *
 * Feld- und Abschnittsschlüssel prüft `vorgaben.test.ts` gegen die echten Formulare (unter `.ref/`).
 */

import type { FormularProfil } from '../profil';
import { nw010001_2026I } from './nw010001';
import { nw010002_2026I } from './nw010002';
import { nw010005_2026I } from './nw010005';
import { nw010010 } from './nw010010';
import { nw010013_2026I } from './nw010013';

export const VORGABEN: Record<string, FormularProfil> = {
  'nw010001|2026I': nw010001_2026I,
  'nw010002|2026I': nw010002_2026I,
  'nw010005|2026I': nw010005_2026I,
  'nw010010|2024G': nw010010,
  'nw010010|2026I': nw010010,
  'nw010013|2026I': nw010013_2026I,
};
