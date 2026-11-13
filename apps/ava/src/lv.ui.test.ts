// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { demoLaden } from './demo';
import { aendereElement, finde } from './lv/modell';
import type { Position } from './lv/modell';
import { lvGeaendert, useAva } from './store';
import { lvSpeichernMitMeldung } from './App';
import { Navigation } from './components/Navigation';
import { GewerkAnsicht } from './components/GewerkAnsicht';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: ReturnType<typeof createRoot> | null = null;
let host: HTMLDivElement;

const warte = async (bis: () => unknown, n = 40) => {
  for (let i = 0; i < n && !bis(); i++) await act(async () => new Promise((r) => setTimeout(r, 5)));
};

/** Wert in ein React-Eingabefeld schreiben (wie Tippen) */
const tippe = (el: HTMLInputElement, wert: string) => {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(el, wert);
  el.dispatchEvent(new Event('input', { bubbles: true }));
};

const zeige = (el: React.ReactElement) =>
  act(() => {
    root = createRoot(host);
    root.render(el);
  });

/** Position 02.0010 (erste Position im Abschnitt 02) */
const position = () => {
  const lv = useAva.getState().lv!.lv;
  const a = lv.elemente.find((e) => e.art === 'abschnitt' && e.oz === '02');
  return (a && a.art === 'abschnitt' ? a.kinder.find((k) => k.art === 'position') : undefined) as Position;
};

beforeEach(async () => {
  host = document.createElement('div');
  document.body.appendChild(host);
  await demoLaden();
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.innerHTML = '';
});

const lvOeffnen = async () => {
  await zeige(createElement(GewerkAnsicht, { gewerk: 'G8', tab: 'lv' }));
  await warte(() => useAva.getState().lv && host.querySelector('.ava-lv-zeilen'));
  expect(useAva.getState().lv).not.toBeNull();
};

describe('Navigation (Tastatur)', () => {
  it('Einträge sind Knöpfe; der aktive trägt aria-current, ein Klick wechselt die Ansicht', async () => {
    await zeige(createElement(Navigation, { onStammdaten: () => {} }));
    const knoepfe = [...host.querySelectorAll<HTMLButtonElement>('.ava-nav-knopf')];
    expect(knoepfe.length).toBeGreaterThan(5);
    const aktiv = knoepfe.filter((b) => b.getAttribute('aria-current') === 'page');
    expect(aktiv.map((b) => b.textContent)).toEqual(['Kostenübersicht']);
    // Gegenprobe: nach dem Klick auf „Rechnungen“ ist dieser Eintrag aktiv
    const rechnungen = knoepfe.find((b) => b.textContent === 'Rechnungen')!;
    await act(async () => rechnungen.click());
    await warte(() => useAva.getState().ansicht.art === 'rechnungen');
    expect(useAva.getState().ansicht.art).toBe('rechnungen');
    expect(host.querySelector('.ava-nav-knopf[aria-current="page"]')?.textContent).toBe('Rechnungen');
  });
});

describe('LV-Editor', () => {
  it('ein EP mit drei Nachkommastellen bleibt beim Durchklicken unverändert; eine echte Eingabe wird übernommen', async () => {
    await lvOeffnen();
    const pos = position();
    act(() => useAva.getState().lvAendern((l) => ({ ...l, elemente: aendereElement(l.elemente, pos.id, (p) => ({ ...(p as Position), preise: { ...(p as Position).preise, '0': { ep: 1.235 } } })) })));
    const feld = host.querySelector<HTMLInputElement>('input[aria-label="EP Kostenansatz 02.0010"]')!;
    expect(feld.value).toBe('1,24');
    act(() => {
      feld.focus();
      feld.blur();
    });
    expect((finde(useAva.getState().lv!.lv.elemente, pos.id)!.el as Position).preise['0'].ep).toBe(1.235);
    // Gegenprobe: geänderter Text wird übernommen
    act(() => {
      feld.focus();
      tippe(feld, '1,5');
    });
    act(() => feld.blur());
    expect((finde(useAva.getState().lv!.lv.elemente, pos.id)!.el as Position).preise['0'].ep).toBe(1.5);
  });

  it('Suche ohne Treffer zeigt eine Meldung mit „Suche leeren“; mit Treffer erscheinen die Zeilen samt Abschnitt', async () => {
    await lvOeffnen();
    const suche = host.querySelector<HTMLInputElement>('input[aria-label="LV durchsuchen"]')!;
    act(() => tippe(suche, 'gibtesnicht'));
    expect(host.querySelector('.ava-leer-zelle')?.textContent).toContain('Keine Treffer für „gibtesnicht“');
    // Gegenprobe: Treffer – keine Meldung, Abschnitt 02 bleibt als Zusammenhang sichtbar
    act(() => tippe(suche, 'Fenstertür'));
    expect(host.querySelector('.ava-leer-zelle')).toBeNull();
    const ozs = [...host.querySelectorAll('.ava-lv-zeilen tbody tr td.ava-oz')].map((td) => td.textContent);
    expect(ozs).toEqual(['02', '02.0030']);
    const leeren = () => [...host.querySelectorAll('button')].find((b) => b.textContent === 'Suche leeren');
    act(() => tippe(suche, 'gibtesnicht'));
    act(() => leeren()!.click());
    expect(suche.value).toBe('');
  });

  it('Speichern (Strg+S) übernimmt die laufende Eingabe im Kurztext', async () => {
    await lvOeffnen();
    const pos = position();
    act(() => useAva.getState().setAuswahl(pos.id));
    const kurztext = host.querySelector<HTMLInputElement>('.ava-panel [data-feld="kurztext"]')!;
    act(() => {
      kurztext.focus();
      tippe(kurztext, 'Neuer Kurztext');
    });
    // noch nicht übernommen: die Eingabe läuft
    expect((finde(useAva.getState().lv!.lv.elemente, pos.id)!.el as Position).kurztext).not.toBe('Neuer Kurztext');
    let ok = false;
    await act(async () => {
      ok = await lvSpeichernMitMeldung();
    });
    expect(ok).toBe(true);
    const lv = useAva.getState().lv!;
    expect((finde(lv.lv.elemente, pos.id)!.el as Position).kurztext).toBe('Neuer Kurztext');
    expect(lvGeaendert(lv)).toBe(false);
  });

  it('Tabs: Pfeiltaste rechts wechselt zum nächsten Bereich (role="tab", tabpanel)', async () => {
    await lvOeffnen();
    const tabs = host.querySelector<HTMLElement>('[role="tablist"]')!;
    expect(host.querySelector('[role="tabpanel"]')?.getAttribute('aria-labelledby')).toBe('ava-tab-lv');
    act(() => tabs.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })));
    expect(useAva.getState().ansicht).toMatchObject({ art: 'gewerk', tab: 'angebote' });
  });
});
