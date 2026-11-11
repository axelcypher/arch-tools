/**
 * Werte der Projektmerkmale für das offene Formular: aus der Projektdatei (.oap) des Projekts.
 */
import { useAntrag } from './antragStore';
import type { OffenesFormular } from './store';

const LEER: Record<string, string> = {};

/** Projektmerkmale (Name → Wert), die für die Bedingungen des offenen Formulars gelten */
export function useMerkmalWerte(_offen: OffenesFormular | null): Record<string, string> {
  return useAntrag((s) => s.projektdatei?.merkmale) ?? LEER;
}
