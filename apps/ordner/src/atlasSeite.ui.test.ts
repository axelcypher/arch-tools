// @vitest-environment happy-dom
import { act, createElement, Fragment } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { VORGABE_NAMENSSCHEMA } from '@core/namensschema';

/** Seite „ATLAS“: Scheitern beim Speichern lässt den Entwurf stehen; im Notbetrieb gesperrt */

const zustand = vi.hoisted(() => ({ gesperrt: null as string | null, aendernFehler: null as Error | null }));
vi.mock('@core/platform/konfig', async (original) => {
  const echt = await original<typeof import('@core/platform/konfig')>();
  return {
    ...echt,
    allgemeinAendern: (patch: Parameters<typeof echt.allgemeinAendern>[0]) => (zustand.aendernFehler ? Promise.reject(zustand.aendernFehler) : echt.allgemeinAendern(patch)),
  };
});
vi.mock('@core/ui/Einstellungen', async (original) => ({
  ...(await original<typeof import('@core/ui/Einstellungen')>()),
  useEinstellungenGesperrt: () => zustand.gesperrt,
}));

const { EinstellungenHost, einstellungenEntwurfMelden, einstellungenOeffnen, useEinstellungen } = await import('@core/ui/Einstellungen');
const { atlasSeiteAnmelden, useAtlasEntwurf } = await import('./components/AtlasEinstellungen');
const { useOrdner } = await import('./store');

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: ReturnType<typeof createRoot> | null = null;
let abmelden: (() => void) | null = null;
const warten = () => act(() => new Promise((r) => setTimeout(r, 20)));

beforeEach(async () => {
  localStorage.clear();
  zustand.gesperrt = null;
  zustand.aendernFehler = null;
  useAtlasEntwurf.setState({ entwurf: {} });
  useEinstellungen.setState({ offen: false });
  abmelden = atlasSeiteAnmelden();
  const host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  act(() => root!.render(createElement(Fragment, null, createElement(EinstellungenHost))));
  act(() => einstellungenOeffnen());
  await warten();
});
afterEach(() => {
  act(() => root?.unmount());
  root = null;
  abmelden?.();
  document.body.innerHTML = '';
});

describe('Seite ATLAS', () => {
  it('Namensschema nicht gespeichert (Netzlaufwerk weg): Dialog bleibt offen mit Fehler, der Entwurf bleibt', async () => {
    zustand.aendernFehler = new Error('Das Netzlaufwerk ist nicht erreichbar.');
    const neu = { ...structuredClone(VORGABE_NAMENSSCHEMA), indexAbLph: 3 };
    act(() => {
      useAtlasEntwurf.setState({ entwurf: { namensschema: neu } });
      einstellungenEntwurfMelden();
    });
    const vorher = useOrdner.getState().allgemein.namensschema;
    await act(async () => [...document.querySelectorAll<HTMLButtonElement>('.einst button')].find((b) => b.textContent?.trim() === 'Übernehmen')!.click());
    await warten();
    expect(document.querySelector('.einst')).not.toBeNull();
    expect(document.querySelector('.einst-fehler')!.textContent).toContain('Netzlaufwerk ist nicht erreichbar');
    expect(useAtlasEntwurf.getState().entwurf.namensschema).toEqual(neu);
    expect(useOrdner.getState().allgemein.namensschema).toEqual(vorher);
  });

  it('im Notbetrieb sperrt ein fieldset alle Abschnitte, mit dem Grund im title', async () => {
    zustand.gesperrt = 'Das Netzlaufwerk mit den Einstellungen ist nicht erreichbar.';
    act(() => useEinstellungen.setState({ offen: false }));
    act(() => einstellungenOeffnen('ordner'));
    await warten();
    const fs = document.querySelector<HTMLFieldSetElement>('fieldset.po-einst-seite')!;
    expect(fs.disabled).toBe(true);
    expect(fs.title).toContain('nicht erreichbar');
    expect(document.querySelectorAll('.einst-inhalt .po-einst-gruppe').length).toBe(fs.querySelectorAll('.po-einst-gruppe').length);
  });
});
