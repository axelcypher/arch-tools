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

/** Fokus in einem Textfeld (dort gelten Rückgängig und Esc des Felds) */
export function inTextfeld(ziel: EventTarget | null): boolean {
  if (!(ziel instanceof Element)) return false;
  if (ziel instanceof HTMLInputElement) return !['checkbox', 'radio', 'button', 'submit', 'range', 'color', 'file'].includes(ziel.type);
  return !!ziel.closest('textarea, select, [contenteditable="true"]');
}

/** Kürzel ohne Strg (Entf, Enter, Leertaste, Rücktaste, E …): nicht auf Bedienelementen */
export const kuerzelErlaubt = (e: KeyboardEvent) => !dialogOffen() && !aufBedienelement(e.target);

/** Strg+Z/Y und Esc: auch auf Knöpfen und Listenzeilen, nur nicht in Textfeldern */
export const verlaufErlaubt = (e: KeyboardEvent) => !dialogOffen() && !inTextfeld(e.target);
