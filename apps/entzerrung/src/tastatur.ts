/**
 * Wann globale Tastenkürzel greifen dürfen: nicht, solange ein Dialog offen ist, und nicht, wenn der Fokus auf einem
 * Bedienelement liegt (dort gehören Tab, Leertaste, Enter, Rücktaste und Entf dem Element).
 */

/** ein Dialog oder eine Vollbild-Ebene (Projekt-/Fotowahl) ist offen */
export const dialogOffen = () => !!document.querySelector('[role="dialog"], .modal-backdrop, .pw-ebene');

/** Fokus in einem Eingabe- oder Bedienelement */
export function aufBedienelement(ziel: EventTarget | null): boolean {
  if (!(ziel instanceof Element)) return false;
  return !!ziel.closest('input, textarea, select, button, a[href], summary, [contenteditable="true"], [role="separator"], [role="button"], [tabindex]:not(.ef-overlay)');
}

/** Kürzel ohne Strg (Entf, Enter, Leertaste, E …) */
export const kuerzelErlaubt = (e: KeyboardEvent) => !dialogOffen() && !aufBedienelement(e.target);
