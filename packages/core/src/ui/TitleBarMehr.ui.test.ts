// @vitest-environment happy-dom
// Titelleiste (Browser): seltene Befehle im Menü „Mehr“ – Farbschema, Berechnungsregeln, Fehlerprotokoll; neue Fehler
// zählt die Marke am Knopf. Richtlinie: docs/design.md, „Kopf- und Werkzeugleisten“.
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TitleBar } from './TitleBar';
import { logger } from '../platform/log';
import { useTheme } from '../platform/theme';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: ReturnType<typeof createRoot> | null = null;
function render(props: Partial<Parameters<typeof TitleBar>[0]> = {}): HTMLElement {
  const host = document.createElement('div');
  document.body.appendChild(host);
  act(() => {
    root = createRoot(host);
    root.render(createElement(TitleBar, { app: 'QUADRIO', name: 'EFH', dirty: false, onOpenLog: () => {}, ...props }));
  });
  return host;
}
afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.innerHTML = '';
});

const mehr = (host: Element) => host.querySelector<HTMLButtonElement>('.titlebar .titlebar-mehr')!;
const punkte = () => [...document.querySelectorAll<HTMLElement>('.menue[aria-label="Mehr"] > .menue-punkt, .menue[aria-label="Mehr"] > [role="separator"]')];
const texte = () => punkte().map((p) => (p.getAttribute('role') === 'separator' ? '—' : (p.querySelector('.menue-text')?.textContent ?? p.textContent)));
const taste = (key: string) => act(() => void document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true })));

describe('Titelleiste: Menü „Mehr“', () => {
  it('Leiste ohne Farbschema-, Regeln- und Protokollknopf; „Mehr“ als Symbolknopf mit Namen, ohne Aufklapp-Pfeil', () => {
    const host = render({ regeln: 'flaechen' });
    const knoepfe = [...host.querySelectorAll('.titlebar button')].map((b) => b.getAttribute('aria-label') ?? b.textContent?.trim());
    expect(knoepfe).toEqual(['Mehr']);
    expect(host.querySelector('.titlebar-menu')).toBeNull();
    const m = mehr(host);
    expect(m.getAttribute('aria-haspopup')).toBe('menu');
    expect(m.getAttribute('aria-expanded')).toBe('false');
    expect(m.querySelectorAll('svg')).toHaveLength(1);
  });

  it('Inhalt: Farbschema (Untermenü), Trenner, Berechnungsregeln (F1), Fehlerprotokoll; Esc gibt den Fokus zurück', () => {
    const onOpenLog = vi.fn();
    const host = render({ regeln: 'flaechen', onOpenLog });
    act(() => mehr(host).focus());
    act(() => mehr(host).click());
    expect(texte()).toEqual(['Farbschema', '—', 'Berechnungsregeln …', 'Fehlerprotokoll …']);
    const regeln = punkte().find((p) => p.textContent?.includes('Berechnungsregeln'))!;
    expect(regeln.getAttribute('aria-keyshortcuts')).toBe('F1');
    taste('Escape');
    expect(document.querySelector('.menue')).toBeNull();
    expect(document.activeElement).toBe(mehr(host));
    // ohne Regelwerk kein Punkt „Berechnungsregeln“
    act(() => root?.unmount());
    document.body.innerHTML = '';
    const ohne = render({ onOpenLog });
    act(() => mehr(ohne).click());
    expect(texte()).toEqual(['Farbschema', '—', 'Fehlerprotokoll …']);
    act(() =>
      punkte()
        .find((p) => p.textContent?.includes('Fehlerprotokoll'))!
        .click(),
    );
    expect(onOpenLog).toHaveBeenCalledTimes(1);
  });

  it('Farbschema: Einfachauswahl mit Haken am gewählten; mit Zeichenfläche der Schalter „abdunkeln“, ohne nicht', () => {
    act(() => useTheme.getState().setWahl('hell'));
    const host = render();
    act(() => mehr(host).click());
    act(() => punkte()[0].click());
    const radios = [...document.querySelectorAll<HTMLElement>('[role="menuitemradio"]')];
    expect(radios.map((r) => [r.textContent, r.getAttribute('aria-checked')])).toEqual([
      ['Auto (wie System)', 'false'],
      ['Hell', 'true'],
      ['Dunkel', 'false'],
    ]);
    expect(document.querySelector('[role="menuitemcheckbox"]')?.textContent).toContain('Zeichenfläche im dunklen Schema abdunkeln');
    act(() => radios[2].click());
    expect(useTheme.getState().wahl).toBe('dunkel');
    expect(document.querySelector('.menue')).toBeNull();
    act(() => root?.unmount());
    document.body.innerHTML = '';
    const ordner = render({ zeichenflaeche: false });
    act(() => mehr(ordner).click());
    act(() => punkte()[0].click());
    expect(document.querySelector('[role="menuitemcheckbox"]')).toBeNull();
    act(() => useTheme.getState().setWahl('hell'));
  });

  it('neue Fehler: Marke am Knopf und im Namen, Hinweis am Punkt; nach dem Öffnen des Protokolls weg', () => {
    const host = render();
    expect(host.querySelector('.titlebar-badge')).toBeNull();
    act(() => {
      logger('test').error('Testfehler eins');
      logger('test').error('Testfehler zwei');
    });
    expect(host.querySelector('.titlebar-mehr .titlebar-badge')?.textContent).toBe('2');
    expect(mehr(host).getAttribute('aria-label')).toBe('Mehr – 2 neue Fehler im Fehlerprotokoll');
    act(() => mehr(host).click());
    const protokoll = punkte().find((p) => p.textContent?.includes('Fehlerprotokoll'))!;
    expect(protokoll.textContent).toContain('2 neu');
    act(() => protokoll.click());
    expect(host.querySelector('.titlebar-badge')).toBeNull();
    expect(mehr(host).getAttribute('aria-label')).toBe('Mehr');
  });
});
