/**
 * Tastaturkürzel der Apps und Eingabefelder: Kürzel ruhen, solange in ein Feld geschrieben wird oder ein
 * Dialog offen ist; vor Speichern und Öffnen wird eine laufende Eingabe übernommen.
 */

/** Tastendruck gilt einem Eingabefeld (Text, Zahl, Auswahl, editierbarer Bereich) */
export function istEingabeZiel(t: EventTarget | null): boolean {
  if (typeof HTMLElement === 'undefined' || !(t instanceof HTMLElement)) return false;
  if (t.tagName === 'INPUT') return !['checkbox', 'radio', 'range', 'button', 'submit', 'color', 'file'].includes((t as HTMLInputElement).type);
  return t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable;
}

/** Ein modaler Dialog ist offen – Kürzel der Zeichenflächen ruhen */
export function dialogOffen(): boolean {
  return typeof document !== 'undefined' && !!document.querySelector('.modal-backdrop, [aria-modal="true"]');
}

/** Kürzel der Zeichenfläche ausführen? Nicht beim Schreiben in ein Feld und nicht hinter einem Dialog. */
export function zeichenKuerzelErlaubt(e: KeyboardEvent): boolean {
  return !istEingabeZiel(e.target) && !dialogOffen();
}

/**
 * Laufende Eingabe übernehmen: Das Feld verliert den Fokus und übergibt seinen Wert, bevor gespeichert,
 * geöffnet oder rückgängig gemacht wird (Felder übernehmen erst bei Enter oder Fokusverlust).
 */
export function eingabeAbschliessen(): void {
  if (typeof document === 'undefined') return;
  const el = document.activeElement;
  if (el instanceof HTMLElement && istEingabeZiel(el)) el.blur();
}
