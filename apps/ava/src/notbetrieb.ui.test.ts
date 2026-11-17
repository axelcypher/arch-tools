// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

/** Seite „FABRIO“: im Notbetrieb gesperrt; Wechsel des Speicherorts verwirft den Entwurf */

let neuLesen: (() => void) | null = null;
vi.mock('@core/ui/Einstellungen', async (original) => ({
  ...(await original<typeof import('@core/ui/Einstellungen')>()),
  useEinstellungenGesperrt: () => 'Das Netzlaufwerk mit den Einstellungen ist nicht erreichbar.',
}));
vi.mock('@core/platform/konfig', async (original) => ({
  ...(await original<typeof import('@core/platform/konfig')>()),
  konfigNeuLesen: (f: () => void) => {
    neuLesen = f;
    return () => (neuLesen = null);
  },
}));

const { FabrioSeite, fabrioSeiteAnmelden, useFabrioEntwurf } = await import('./components/Einstellungen');
const { VORGABE } = await import('./einstellungen');

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: ReturnType<typeof createRoot> | null = null;
afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.innerHTML = '';
});

describe('Seite FABRIO', () => {
  it('im Notbetrieb sperrt ein fieldset alle Abschnitte, mit dem Grund im title', () => {
    const host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
    act(() => root!.render(createElement(FabrioSeite)));
    const fs = host.querySelector<HTMLFieldSetElement>('fieldset.ava-einst-seite')!;
    expect(fs.disabled).toBe(true);
    expect(fs.title).toContain('nicht erreichbar');
    expect(host.querySelectorAll('.ava-einst-gruppe').length).toBe(fs.querySelectorAll('.ava-einst-gruppe').length);
  });

  it('Wechsel des Speicherorts verwirft einen Entwurf', async () => {
    const abmelden = fabrioSeiteAnmelden();
    useFabrioEntwurf.setState({ entwurf: { ...structuredClone(VORGABE), scan: { ...VORGABE.scan, ordner: 'X:\\Scans' } } });
    act(() => neuLesen!());
    expect(useFabrioEntwurf.getState().entwurf).toBeNull();
    abmelden();
  });
});
