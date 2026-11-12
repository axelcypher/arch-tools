// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readProjectFile } from '@core/archive';
import { projektdateiRoh } from '@core/projektdatei';
import { farbschemaWechseln } from '@core/ui/rauchtest';

vi.mock('./projekt', async (original) => ({ ...(await original<typeof import('./projekt')>()), speichernJetzt: vi.fn(async () => true) }));

const { App, speichern } = await import('./App');
const { beispielOap } = await import('./beispiel.test');
const { useBaurecht } = await import('./store');
const projekt = await import('./projekt');

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: ReturnType<typeof createRoot> | null = null;
function render(): HTMLElement {
  const host = document.createElement('div');
  document.body.appendChild(host);
  act(() => {
    root = createRoot(host);
    root.render(createElement(App));
  });
  return host;
}
const knopf = (host: ParentNode, text: string | RegExp) => [...host.querySelectorAll<HTMLButtonElement>('button')].find((b) => (typeof text === 'string' ? b.textContent?.trim() === text : text.test(b.textContent ?? '')));
const tippen = (el: HTMLTextAreaElement | HTMLInputElement, wert: string) =>
  act(() => {
    Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value')!.set!.call(el, wert);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });

describe('Baurecht – Oberfläche', () => {
  beforeEach(() => {
    const bytes = beispielOap();
    useBaurecht.getState().projektSetzen({ art: 'datei', name: 'EFH.oap', bytes }, readProjectFile(bytes), projektdateiRoh(bytes));
  });
  afterEach(() => {
    act(() => root?.unmount());
    document.body.innerHTML = '';
  });

  it('zeigt Kopf, Bilanz, Angaben, Vorschriften; Ampel immer mit Wort; Farbschema wechselt', () => {
    const host = render();
    expect(host.textContent).toContain('Antragsmerkmale');
    expect(host.querySelector('.br-bilanz')?.textContent).toMatch(/gilt.*prüfen.*entfällt/);
    const ampeln = [...host.querySelectorAll('.br-paragraf .br-ampel')];
    expect(ampeln.length).toBeGreaterThan(10);
    for (const a of ampeln) expect(a.textContent).toMatch(/gilt|prüfen|entfällt/);
    expect(farbschemaWechseln(host, 'Dunkel')).toBe('dunkel');
    expect(farbschemaWechseln(host, 'Hell')).toBe('hell');
  });

  it('Paragraf wählen → Einzelheiten; von Hand festlegen nur mit Begründung; beim Speichern zweite Bestätigung', async () => {
    const host = render();
    const zeile = host.querySelector<HTMLButtonElement>('.br-paragraf')!;
    act(() => zeile.click());
    expect(host.querySelector('.br-detail h3')?.textContent).toBe('Begründung');
    act(() => knopf(host, 'Von Hand festlegen …')!.click());
    const dialog = document.querySelector<HTMLElement>('[role="dialog"]')!;
    expect(dialog.textContent).toContain('von Hand festlegen');
    // ohne Begründung: Meldung, keine Festlegung
    act(() => knopf(dialog, 'Festlegen')!.click());
    expect(dialog.textContent).toMatch(/Bitte begründen/);
    expect(Object.keys(useBaurecht.getState().pruefung.festlegungen)).toHaveLength(0);
    tippen(dialog.querySelector('textarea')!, 'Abstimmung mit der Bauaufsicht am 05.11.2026');
    act(() => knopf(dialog, 'Festlegen')!.click());
    const ids = Object.keys(useBaurecht.getState().pruefung.festlegungen);
    expect(ids).toHaveLength(1);
    expect(host.querySelector('.br-marke-entwurf')).not.toBeNull();

    // Speichern: Liste der Festlegungen, Bestätigen erst nach dem Haken
    let fertig: Promise<boolean> | null = null;
    await act(async () => {
      fertig = speichern();
    });
    const best = [...document.querySelectorAll<HTMLElement>('[role="dialog"]')].find((d) => d.textContent?.includes('Festlegungen von Hand bestätigen'))!;
    expect(best).toBeTruthy();
    const bestaetigen = knopf(best, 'Festlegungen bestätigen und speichern')!;
    expect(bestaetigen.disabled).toBe(true);
    act(() => best.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click());
    expect(bestaetigen.disabled).toBe(false);
    await act(async () => {
      bestaetigen.click();
      await fertig;
    });
    expect(projekt.speichernJetzt).toHaveBeenCalled();
    expect(useBaurecht.getState().pruefung.festlegungen[ids[0]].bestaetigt).toMatch(/^\d{4}-/);
  });

  it('„Ohne diese Festlegungen speichern“ lässt sie als Entwurf offen', async () => {
    const host = render();
    act(() => host.querySelector<HTMLButtonElement>('.br-paragraf')!.click());
    act(() => knopf(host, 'Von Hand festlegen …')!.click());
    const dialog = document.querySelector<HTMLElement>('[role="dialog"]')!;
    tippen(dialog.querySelector('textarea')!, 'Sonderfall laut Vorbescheid vom 01.10.2026');
    act(() => knopf(dialog, 'Festlegen')!.click());
    const id = Object.keys(useBaurecht.getState().pruefung.festlegungen)[0];
    let fertig: Promise<boolean> | null = null;
    await act(async () => {
      fertig = speichern();
    });
    const best = [...document.querySelectorAll<HTMLElement>('[role="dialog"]')].find((d) => d.textContent?.includes('Festlegungen von Hand bestätigen'))!;
    await act(async () => {
      knopf(best, 'Ohne diese Festlegungen speichern')!.click();
      await fertig;
    });
    const f = useBaurecht.getState().pruefung.festlegungen[id];
    expect(f).toBeTruthy();
    expect(f.bestaetigt).toBeUndefined();
  });

  it('Merkmal ändern wirkt sofort auf die Ampeln und gilt als ungespeicherte Änderung', () => {
    const host = render();
    const vorher = host.querySelector('.br-bilanz')!.textContent;
    act(() => knopf(host.querySelector('[data-merkmal="Planungsrecht"]')!, 'Außenbereich')!.click());
    expect(host.querySelector('.br-bilanz')!.textContent).not.toBe(vorher);
    expect(host.querySelector('.titlebar-dirty')).not.toBeNull();
  });
});
