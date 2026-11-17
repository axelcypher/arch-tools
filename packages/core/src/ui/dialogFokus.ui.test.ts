// @vitest-environment happy-dom
import { act, createElement as h, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { Modal } from './Dialog';
import { dialogVerhaltenEinrichten } from './dialoge';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const warten = () => act(() => new Promise((r) => setTimeout(r, 30)));
let root: ReturnType<typeof createRoot> | null = null;
afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.innerHTML = '';
});

/** wie die Kürzelübersicht von QUADRIO: bedingt eingehängtes Modal mit autoFocus, geöffnet per Knopf in der Fußzeile
 *  (der je nach Zustand ein anderer ist) oder per Taste auf der Zeichenfläche */
function Ansicht() {
  const [offen, setOffen] = useState(false);
  const [hinweis, setHinweis] = useState(true);
  return h(
    'div',
    { className: 'karte' },
    h('svg', { className: 'canvas', tabIndex: 0, onKeyDown: (e: { key: string }) => e.key === '?' && setOffen(true) }),
    h(
      'footer',
      { className: 'karte-fuss zeichen-fuss' },
      // wie in Canvas.tsx: im Hinweis-Zweig steht der Knopf in einem span, sonst allein – React tauscht den Knoten aus
      hinweis
        ? h('span', { className: 'hud-hint' }, h('button', { id: 'knopf-a', 'aria-label': 'Alle Tastenkürzel …', onClick: () => (setOffen(true), setHinweis(false)) }, '?'))
        : h('button', { id: 'knopf-b', title: 'Alle Tastenkürzel …', onClick: () => setOffen(true) }, '? Tastenkürzel …'),
    ),
    offen && h(Modal, { titel: 'Tastenkürzel', onClose: () => setOffen(false), children: h('button', { className: 'primary', autoFocus: true, onClick: () => setOffen(false) }, 'Schließen') }),
  );
}

function zeigen() {
  dialogVerhaltenEinrichten();
  const host = document.createElement('div');
  document.body.appendChild(host);
  act(() => {
    root = createRoot(host);
    root.render(h(Ansicht));
  });
  return host;
}

const schliessen = async (host: HTMLElement) => {
  act(() => host.querySelector<HTMLButtonElement>('.modal button.primary')!.click());
  await warten();
};

describe('Fokus nach dem Schließen eines React-Modals mit autoFocus', () => {
  it('per Taste auf der Zeichenfläche geöffnet: zurück auf die Zeichenfläche', async () => {
    const host = zeigen();
    const flaeche = host.querySelector<SVGElement>('svg.canvas')!;
    flaeche.focus();
    act(() => flaeche.dispatchEvent(new KeyboardEvent('keydown', { key: '?', bubbles: true })));
    await warten();
    expect(document.activeElement?.textContent).toBe('Schließen');
    await schliessen(host);
    expect(document.activeElement).toBe(flaeche);
  });

  it('per Knopf geöffnet, der Knopf wird dabei ersetzt: auf seinen Ersatz in der Fußzeile', async () => {
    const host = zeigen();
    const knopf = host.querySelector<HTMLButtonElement>('#knopf-a')!;
    knopf.focus();
    act(() => knopf.click());
    await warten();
    expect(knopf.isConnected).toBe(false);
    expect(document.activeElement?.textContent).toBe('Schließen');
    await schliessen(host);
    expect(document.activeElement?.id).toBe('knopf-b');
  });

  for (const autoFocus of [true, false]) {
    it(`stand der Fokus vor dem Öffnen auf der Seite, bleibt er nach dem Schließen dort (autoFocus ${autoFocus})`, async () => {
      dialogVerhaltenEinrichten();
      document.body.innerHTML = '<input id="alt"><div id="host"></div>';
      const alt = document.getElementById('alt') as HTMLInputElement;
      alt.focus();
      alt.blur();
      expect(document.activeElement).toBe(document.body);
      root = createRoot(document.getElementById('host')!);
      act(() => root!.render(h(Modal, { titel: 'Rückfrage', onClose: () => {}, children: h('button', { className: 'primary', autoFocus }, 'OK') })));
      await warten();
      act(() => root!.render(null));
      await warten();
      expect(document.activeElement).toBe(document.body);
    });
  }

  for (const vorherBlur of [false, true]) {
    it(`verschachtelt: Rückfrage mit autoFocus über einem Dialog gibt den Fokus an den Knopf im äußeren zurück${vorherBlur ? ' (nach einem Blur außerhalb)' : ''}`, async () => {
      dialogVerhaltenEinrichten();
      document.body.innerHTML = '<input id="aussen-feld"><div id="host"></div>';
      if (vorherBlur) {
        const f = document.getElementById('aussen-feld') as HTMLInputElement;
        f.focus();
        f.blur();
      }
      function Zwei() {
        const [innen, setInnen] = useState(false);
        return h(Modal, {
          titel: 'Außen',
          onClose: () => {},
          children: [
            h('button', { key: 'w', id: 'weiter', onClick: () => setInnen(true) }, 'Weiter'),
            innen && h(Modal, { key: 'r', titel: 'Rückfrage', onClose: () => setInnen(false), children: h('button', { className: 'primary', autoFocus: true, onClick: () => setInnen(false) }, 'Ja') }),
          ],
        });
      }
      root = createRoot(document.getElementById('host')!);
      act(() => root!.render(h(Zwei)));
      await warten();
      const weiter = document.getElementById('weiter') as HTMLButtonElement;
      weiter.focus();
      act(() => weiter.click());
      await warten();
      expect(document.activeElement?.textContent).toBe('Ja');
      act(() => (document.activeElement as HTMLButtonElement).click());
      await warten();
      expect(document.activeElement).toBe(weiter);
    });
  }
});
