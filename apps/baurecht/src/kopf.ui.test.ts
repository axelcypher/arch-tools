// @vitest-environment happy-dom
// Kopf in der Desktop-Fassung (isTauri) allein gerendert: Menü „Mehr“ und Sammelmarke mit echter Fokusfolge
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readProjectFile } from '@core/archive';
import { projektdateiRoh } from '@core/projektdatei';

vi.mock('@core/platform/files', async (original) => ({
  ...(await original<typeof import('@core/platform/files')>()),
  isTauri: () => true,
}));

const { Kopf } = await import('./components/Kopf');
const { beispielOap } = await import('./beispiel.test');
const { useBaurecht } = await import('./store');
const { pruefstandBerechnen } = await import('./pruefung');

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: ReturnType<typeof createRoot> | null = null;
afterEach(() => {
  act(() => root?.unmount());
  document.body.innerHTML = '';
});

function render(): HTMLElement {
  const bytes = beispielOap();
  useBaurecht.getState().projektSetzen({ art: 'datei', name: 'EFH.oap', bytes }, readProjectFile(bytes), projektdateiRoh(bytes));
  const s = useBaurecht.getState();
  const stand = pruefstandBerechnen(s.paket, s.project, s.merkmale, s.pruefung.fakten, {}, '2026-12-01', {});
  const host = document.createElement('div');
  document.body.appendChild(host);
  act(() => {
    root = createRoot(host);
    root.render(createElement(Kopf, { stand, onRechtsstand: () => undefined, onLage: () => undefined, onProtokoll: () => undefined, onSpeichern: () => undefined, onAntrag: () => undefined, lageLaeuft: false }));
  });
  return host;
}

/** Klick wie im Browser: mousedown und Fokuswechsel (blur mit relatedTarget) als eigenes Ereignis, dann click */
function klick(el: HTMLElement) {
  act(() => {
    el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    const vorher = document.activeElement;
    if (vorher instanceof HTMLElement && vorher !== el) vorher.dispatchEvent(new FocusEvent('focusout', { bubbles: true, relatedTarget: el }));
    el.focus();
  });
  act(() => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
}

describe('Kopf (Desktop): Menü „Mehr“ und Sammelmarke', () => {
  it('Sammelmarke öffnet und schließt „Mehr“; Esc gibt den Fokus an die Sammelmarke zurück', () => {
    const host = render();
    const marke = host.querySelector<HTMLButtonElement>('.br-marke-knopf')!;
    expect(marke, 'Sammelmarke der Warnungen').toBeTruthy();
    klick(marke);
    expect(host.querySelector('[role="menu"]')).not.toBeNull();
    // Fokus steht im Menü; zweiter Klick auf die Marke schließt
    expect(document.activeElement?.getAttribute('role')).toBe('menuitem');
    klick(marke);
    expect(host.querySelector('[role="menu"]')).toBeNull();
    // erneut öffnen, mit Esc schließen: Fokus zurück an die Marke
    klick(marke);
    act(() => void document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
    expect(host.querySelector('[role="menu"]')).toBeNull();
    expect(document.activeElement).toBe(marke);
  });

  it('mit der Tastatur auf die Sammelmarke (ohne Maus) schließt das Menü wie jeder Fokuswechsel', () => {
    const host = render();
    const marke = host.querySelector<HTMLButtonElement>('.br-marke-knopf')!;
    klick(marke);
    expect(host.querySelector('[role="menu"]')).not.toBeNull();
    // Umschalt+Tab aus dem Menü landet auf der Sammelmarke – kein Mausdruck
    act(() => {
      document.activeElement!.dispatchEvent(new FocusEvent('focusout', { bubbles: true, relatedTarget: marke }));
      marke.focus();
    });
    expect(host.querySelector('[role="menu"]')).toBeNull();
  });

  it('Menüeinträge sind keine eigenen Tabstopps; Tab hinaus schließt', () => {
    const host = render();
    const mehr = [...host.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.startsWith('Mehr'))!;
    klick(mehr);
    const eintraege = [...host.querySelectorAll<HTMLElement>('[role="menuitem"]')];
    expect(eintraege.length).toBeGreaterThan(0);
    for (const e of eintraege) expect(e.tabIndex).toBe(-1);
    // Fokus verlässt das Menü (z. B. auf „Prüfprotokoll“)
    const weiter = [...host.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent === 'Prüfprotokoll')!;
    act(() => weiter.focus());
    expect(host.querySelector('[role="menu"]')).toBeNull();
  });
});
