import { act } from 'react';

/**
 * Rauchtest für die UI-Tests der Apps (nur in Tests verwendet): Farbschema über das Menü ◐ der Titelleiste auf
 * „Dunkel“ und zurück auf „Hell“ stellen – das Schema am <html>-Element muss sofort wechseln.
 */
export function farbschemaWechseln(host: HTMLElement, wahl: 'Hell' | 'Dunkel'): string | undefined {
  const menue = host.querySelector<HTMLButtonElement>('.titlebar-menu > button');
  if (!menue) throw new Error('Farbschema-Menü fehlt');
  act(() => menue.click());
  const knopf = [...host.querySelectorAll<HTMLButtonElement>('.titlebar-dropdown button')].find((b) => b.textContent?.includes(wahl));
  if (!knopf) throw new Error(`Menüpunkt ${wahl} fehlt`);
  act(() => knopf.click());
  return document.documentElement.dataset.theme;
}

/**
 * Rauchtest „Stammdaten öffnen“: Knopf „Stammdaten …“ öffnet den gemeinsamen Dialog; Bebauungsplan Nr. eintragen und
 * übernehmen. Liefert den Dialogtitel.
 */
export function stammdatenAendern(host: HTMLElement, bplanNr: string): string {
  const knopf = [...host.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.trim() === 'Stammdaten …');
  if (!knopf) throw new Error('Knopf „Stammdaten …“ fehlt');
  act(() => knopf.click());
  const dialog = host.querySelector<HTMLElement>('.sd-dialog');
  if (!dialog) throw new Error('Stammdaten-Dialog fehlt');
  const titel = dialog.querySelector('h3')?.textContent ?? '';
  const feld = [...dialog.querySelectorAll('label.field')].find((l) => l.querySelector('.field-label')?.textContent?.startsWith('Bebauungsplan Nr.'))?.querySelector('input');
  if (!feld) throw new Error('Feld „Bebauungsplan Nr.“ fehlt');
  act(() => {
    feld.focus();
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(feld, bplanNr);
    feld.dispatchEvent(new Event('input', { bubbles: true }));
  });
  act(() => feld.blur());
  act(() => [...dialog.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent === 'Übernehmen')!.click());
  return titel;
}

/** Aktionen des einheitlichen Einstiegs ohne Projekt (ProjektEinstieg) */
export const einstiegsAktionen = (host: HTMLElement): string[] => [...host.querySelectorAll('.pw-einstieg .pw-aktionen button')].map((b) => b.textContent ?? '');
