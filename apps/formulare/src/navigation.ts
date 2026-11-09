/**
 * Bewegen zwischen den Feldern: Tab und Enter (in einzeiligen Feldern) springen in Lesereihenfolge zum
 * nächsten Feld – auf dem Papier von oben nach unten, nebeneinanderliegende Rahmen von links nach rechts –
 * statt in der zufälligen Reihenfolge, in der FORMA die Elemente speichert.
 */

import type { KeyboardEvent } from 'react';
import type { Feld } from './forma/felder';

/** Element eines Felds in der aktuellen Ansicht */
export const feldElement = (schluessel: string, wurzel: ParentNode = document) => wurzel.querySelector<HTMLElement>(`[data-feld="${schluessel.replace(/["\\]/g, '\\$&')}"]`);

/** Zum Feld scrollen und hineinsetzen */
export function springeZuFeld(schluessel: string): boolean {
  const el = feldElement(schluessel);
  if (!el) return false;
  el.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
  el.focus({ preventScroll: true });
  return true;
}

/**
 * Tastatursteuerung für einen Bereich mit Feldern: Tab/Umschalt+Tab und Enter in einzeiligen Feldern
 * gehen zum nächsten bzw. vorigen Feld in `reihenfolge`.
 */
export function feldTasten(reihenfolge: Feld[]) {
  const index = new Map(reihenfolge.map((f, i) => [f.schluessel, i]));
  const einzeilig = new Set(reihenfolge.filter((f) => f.einzeilig).map((f) => f.schluessel));
  return (e: KeyboardEvent<HTMLElement>) => {
    const ziel = e.target as HTMLElement;
    const schluessel = ziel.dataset?.feld;
    if (!schluessel || !index.has(schluessel) || e.ctrlKey || e.altKey || e.metaKey) return;
    const enter = e.key === 'Enter' && (einzeilig.has(schluessel) || ziel instanceof HTMLInputElement) && !(ziel instanceof HTMLInputElement && ziel.type === 'checkbox');
    if (e.key !== 'Tab' && !enter) return;
    const schritt = e.shiftKey ? -1 : 1;
    const wurzel = e.currentTarget;
    for (let i = index.get(schluessel)! + schritt; i >= 0 && i < reihenfolge.length; i += schritt) {
      const el = feldElement(reihenfolge[i].schluessel, wurzel);
      if (el && !(el as HTMLInputElement).disabled) {
        e.preventDefault();
        el.focus();
        el.scrollIntoView?.({ block: 'nearest' });
        return;
      }
    }
  };
}
