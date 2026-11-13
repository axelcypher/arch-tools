// @vitest-environment happy-dom
// Kopf in der Desktop-Fassung (isTauri) mit dem gemeinsamen Menü (MenueHost): „Mehr“ und Sammelmarke
import { act, createElement, Fragment } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readProjectFile } from '@core/archive';
import { projektdateiRoh } from '@core/projektdatei';

vi.mock('@core/platform/files', async (original) => ({
  ...(await original<typeof import('@core/platform/files')>()),
  isTauri: () => true,
}));

const { Kopf } = await import('./components/Kopf');
const { MenueHost } = await import('@core/ui/Menue');
const { beispielOap } = await import('./beispiel.test');
const { useBaurecht } = await import('./store');
const { pruefstandBerechnen } = await import('./pruefung');

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: ReturnType<typeof createRoot> | null = null;
afterEach(() => {
  act(() => root?.unmount());
  document.body.innerHTML = '';
});

function render(aufrufe: string[] = [], lageLaeuft = false): HTMLElement {
  const bytes = beispielOap();
  useBaurecht.getState().projektSetzen({ art: 'datei', name: 'EFH.oap', bytes }, readProjectFile(bytes), projektdateiRoh(bytes));
  const s = useBaurecht.getState();
  const stand = pruefstandBerechnen(s.paket, s.project, s.merkmale, s.pruefung.fakten, {}, '2026-12-01', {});
  const host = document.createElement('div');
  document.body.appendChild(host);
  act(() => {
    root = createRoot(host);
    root.render(
      createElement(
        Fragment,
        null,
        createElement(Kopf, {
          key: 'k',
          stand,
          onRechtsstand: () => aufrufe.push('rechtsstand'),
          onLage: () => aufrufe.push('lage'),
          onProtokoll: () => undefined,
          onSpeichern: () => undefined,
          onAntrag: () => undefined,
          lageLaeuft,
        }),
        createElement(MenueHost, { key: 'm' }),
      ),
    );
  });
  return host;
}

/** Klick wie im Browser: pointerdown (das gemeinsame Menü schließt darauf), Fokus, click */
function klick(el: HTMLElement) {
  act(() => {
    el.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    el.focus();
  });
  act(() => void el.dispatchEvent(new MouseEvent('click', { bubbles: true })));
}
const menue = () => document.querySelector<HTMLElement>('[role="menu"]');
const punkte = () => [...document.querySelectorAll<HTMLElement>('[role="menu"] [role="menuitem"]')];
const taste = (key: string) => act(() => void (document.activeElement as HTMLElement).dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true })));

describe('Kopf (Desktop): Menü „Mehr“ und Sammelmarke', () => {
  it('Sammelmarke öffnet das gemeinsame Menü mit „Lage abfragen“ und „Rechtsstand prüfen“; Esc gibt den Fokus an die Marke zurück', () => {
    const host = render();
    const marke = host.querySelector<HTMLButtonElement>('.br-marke-knopf')!;
    expect(marke, 'Sammelmarke der Warnungen').toBeTruthy();
    expect(marke.getAttribute('aria-haspopup')).toBe('menu');
    klick(marke);
    expect(menue()).not.toBeNull();
    expect(marke.getAttribute('aria-expanded')).toBe('true');
    expect(punkte().map((p) => p.textContent)).toEqual([expect.stringContaining('Lage abfragen'), expect.stringContaining('Rechtsstand prüfen')]);
    // die Warnungen stehen kurz als Hinweis an „Rechtsstand prüfen“, vollständig im Tooltip
    expect(punkte()[1].getAttribute('title')).toBe(marke.title);
    const n = marke.title.split(' · ').length;
    expect(punkte()[1].textContent).toContain(n > 1 ? `${n} Warnungen` : marke.title);
    expect(document.activeElement).toBe(punkte()[0]);
    taste('Escape');
    expect(menue()).toBeNull();
    expect(document.activeElement).toBe(marke);
    // zweiter Klick auf den Öffner eines offenen Menüs schließt es
    klick(marke);
    expect(menue()).not.toBeNull();
    klick(marke);
    expect(menue()).toBeNull();
  });

  it('„Mehr“ ist ein MenueKnopf mit Pfeil-Symbol; ein Punkt führt die Aktion aus', () => {
    const aufrufe: string[] = [];
    const host = render(aufrufe);
    const mehr = [...host.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.trim() === 'Mehr')!;
    expect(mehr.getAttribute('aria-haspopup')).toBe('menu');
    expect(mehr.querySelector('svg.symbol')).not.toBeNull();
    expect(mehr.textContent).not.toContain('▾');
    klick(mehr);
    expect(document.activeElement).toBe(punkte()[0]);
    taste('ArrowDown');
    expect(document.activeElement).toBe(punkte()[1]);
    act(() => punkte()[1].click());
    expect(aufrufe).toEqual(['rechtsstand']);
    expect(menue()).toBeNull();
  });

  it('„Speichern“ zeigt ungespeicherte Änderungen mit der Klasse „ungespeichert“ und im Namen', () => {
    const host = render();
    const speichern = () => [...host.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.trim() === 'Speichern')!;
    expect(speichern().classList.contains('ungespeichert')).toBe(false);
    expect(speichern().getAttribute('aria-label')).toBe('Speichern');
    act(() => useBaurecht.getState().einreichungSetzen('2027-03-01'));
    expect(speichern().classList.contains('ungespeichert')).toBe(true);
    expect(speichern().getAttribute('aria-label')).toBe('Speichern – ungespeicherte Änderungen');
  });

  it('gesperrte Punkte: aria-disabled mit Grund im Hinweis, ohne Wirkung, Erstfokus auf dem ersten bedienbaren Punkt', () => {
    const aufrufe: string[] = [];
    const host = render(aufrufe, true);
    const mehr = () => [...host.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.trim() === 'Mehr')!;
    klick(mehr());
    const [lage, rechtsstand] = punkte();
    expect(lage.getAttribute('aria-disabled')).toBe('true');
    expect(lage.textContent).toContain('läuft');
    expect(rechtsstand.getAttribute('aria-disabled')).toBeNull();
    expect(document.activeElement).toBe(rechtsstand);
    act(() => lage.click());
    expect(aufrufe).toEqual([]);
    expect(menue()).not.toBeNull();
    taste('Escape');
    // Texte werden geholt: auch „Rechtsstand prüfen“ gesperrt – erreichbar, der Grund steht daneben
    act(() => useBaurecht.setState({ laedt: ['bund/baugb'] }));
    klick(mehr());
    expect(punkte()[1].getAttribute('aria-disabled')).toBe('true');
    expect(punkte()[1].textContent).toContain('Texte werden geholt');
    act(() => punkte()[1].click());
    expect(aufrufe).toEqual([]);
    act(() => useBaurecht.setState({ laedt: [] }));
  });
});
