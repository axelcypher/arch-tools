/**
 * Vorgaben der App je Formular und Stand (`<Kennung>|<Stand>`, wie der Profilschlüssel): Titel der Felder und
 * Abschnitte, Gruppen und Bedingungen nach der Rechtsgrundlage (BauO NRW, BauPrüfVO). Die eigenen Einstellungen
 * liegen darüber und gehen vor (siehe vorgabe.ts).
 */

import type { FormularProfil } from '../profil';

export const VORGABEN: Record<string, FormularProfil> = {};
