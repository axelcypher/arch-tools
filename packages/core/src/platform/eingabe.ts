/**
 * Tastaturkürzel der Apps und Eingabefelder: Kürzel ruhen, solange in ein Feld geschrieben wird oder ein
 * Dialog offen ist; vor Speichern und Öffnen wird eine laufende Eingabe übernommen.
 */

/** Tastendruck gilt einem Eingabefeld (Text, Zahl, Auswahl, editierbarer Bereich) */
export function istEingabeZiel(t: EventTarget | null): boolean {
  if (typeof HTMLElement === 'undefined' || !(t instanceof HTMLElement)) return false;
  // Schieberegler zählen mit: Pfeiltasten verstellen sie, statt die Auswahl zu verschieben
  if (t.tagName === 'INPUT') return !['checkbox', 'radio', 'button', 'submit', 'color', 'file'].includes((t as HTMLInputElement).type);
  return t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable;
}

/** Ein modaler Dialog bzw. eine Bericht-/Druckansicht ist offen – Kürzel der Zeichenflächen ruhen */
export function dialogOffen(): boolean {
  return typeof document !== 'undefined' && !!document.querySelector('.modal-backdrop, .report-backdrop, [aria-modal="true"]');
}

/**
 * Kürzel der Zeichenfläche ausführen? Nicht beim Schreiben in ein Feld, nicht hinter einem Dialog und nicht,
 * solange die Zeichenfläche selbst nicht sichtbar ist (z. B. 3D-Ansicht im Vordergrund).
 */
export function zeichenKuerzelErlaubt(e: KeyboardEvent, flaeche?: Element | null): boolean {
  if (istEingabeZiel(e.target) || dialogOffen()) return false;
  if (flaeche && !sichtbar(flaeche)) return false;
  return true;
}

function sichtbar(el: Element): boolean {
  if (!el.isConnected) return false;
  // ohne Layout (Tests) gilt das Element als sichtbar, solange kein Vorfahr ausgeblendet ist
  for (let x: Element | null = el; x; x = x.parentElement) {
    if (x instanceof HTMLElement && (x.hidden || x.classList.contains('hidden') || x.style.display === 'none')) return false;
  }
  return true;
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
