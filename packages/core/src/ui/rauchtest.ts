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
