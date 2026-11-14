/**
 * Test-Hilfen für die Werkzeugleiste (gemeinsamer Baustein `Werkzeugleiste`): Menüs der Leiste öffnen und Punkte wählen.
 * Das Menü „Mehr“ wird über sein aria-label gefunden, die übrigen über ihren Text.
 */
import { act } from 'react';

const warte = async () => {
  for (let i = 0; i < 4; i++) await act(async () => new Promise((r) => setTimeout(r, 0)));
};

/** Menüknopf der Werkzeugleiste („Mehr“, „Datei“, „Ansicht“) */
export const leistenMenue = (host: Element, name: string) =>
  [...host.querySelectorAll<HTMLButtonElement>('.toolbar button[aria-haspopup="menu"]')].find((b) => b.getAttribute('aria-label') === name || b.textContent?.trim() === name)!;

/** Punkt im gerade offenen Menü */
export const leistenPunkt = (text: string) => [...document.querySelectorAll<HTMLButtonElement>('.menue-punkt')].find((b) => b.textContent?.includes(text))!;

/** Texte der Punkte im gerade offenen Hauptmenü (ohne Tastenkürzel) */
export const menueTexte = () =>
  [...document.querySelectorAll('.menue > .menue-punkt')].map((b) =>
    (b.querySelector('.menue-tasten') ? b.textContent!.replace(b.querySelector('.menue-tasten')!.textContent!, '') : b.textContent!).trim(),
  );

/** Menü öffnen und einen Punkt wählen */
export async function imLeistenMenue(host: Element, name: string, punkt: string) {
  act(() => leistenMenue(host, name).click());
  await warte();
  act(() => leistenPunkt(punkt).click());
  await warte();
}

/** Menü öffnen, seine Punkte lesen und wieder schließen (Esc) */
export async function leistenMenueTexte(host: Element, name: string) {
  act(() => leistenMenue(host, name).click());
  await warte();
  const t = menueTexte();
  act(() => void document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
  await warte();
  return t;
}
