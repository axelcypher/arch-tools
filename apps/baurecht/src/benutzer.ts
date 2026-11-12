/**
 * Wer festlegt: Kürzel bzw. Name der Bearbeitung, je Rechner gemerkt (lokaler Speicher); Vorgabe aus den Stammdaten
 * des Projekts („Bearbeitung“).
 */

import { useBaurecht } from './store';

const SCHLUESSEL = 'baurecht:benutzer';

export function benutzer(): string {
  try {
    const g = localStorage.getItem(SCHLUESSEL);
    if (g?.trim()) return g.trim();
  } catch {
    // ohne Speicher
  }
  return useBaurecht.getState().project?.meta.bearbeiter?.trim() || 'Bearbeitung';
}

export function benutzerMerken(name: string): void {
  try {
    if (name.trim()) localStorage.setItem(SCHLUESSEL, name.trim());
  } catch {
    // ohne Speicher gilt der Name nur für diese Festlegung
  }
}
