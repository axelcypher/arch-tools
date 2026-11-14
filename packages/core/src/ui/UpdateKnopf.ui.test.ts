// @vitest-environment happy-dom
// Update-Dialog: vor dem Neustart Rückfragen der Rahmen-App und ausstehendes Schreiben (vorDemSchliessen) abwarten
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useUpdate } from '../platform/update';
import { vorDemSchliessen } from '../platform/rahmen';
import { RueckfrageHost } from './Rueckfrage';
import { UpdateKnopf, updatePunkt } from './UpdateKnopf';

vi.mock('../platform/update', async (orig) => ({ ...(await orig<typeof import('../platform/update')>()), starteUpdatePruefung: () => () => {} }));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: ReturnType<typeof createRoot> | null = null;
async function render(vorInstallation?: () => Promise<boolean>): Promise<HTMLElement> {
  const host = document.createElement('div');
  document.body.appendChild(host);
  await act(async () => {
    root = createRoot(host);
    root.render(createElement('div', null, createElement(UpdateKnopf, { app: 'Arkly', dirty: true, vorInstallation }), createElement(RueckfrageHost)));
  });
  return host;
}
afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.innerHTML = '';
});

const installieren = vi.fn(async () => {});
const oeffnen = async (host: HTMLElement) => {
  act(() => useUpdate.setState({ status: 'verfuegbar', version: '9.9.9', installieren }));
  await act(async () => host.querySelector<HTMLButtonElement>('button.titlebar-btn')!.click());
  return () => [...host.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent === 'Jetzt installieren')!;
};

describe('Update-Dialog', () => {
  it('updatePunkt: nur solange ein Update vorliegt; öffnet den Dialog des Knopfs', async () => {
    act(() => useUpdate.setState({ status: 'aktuell', version: undefined }));
    expect(updatePunkt()).toBeNull();
    const host = await render();
    act(() => useUpdate.setState({ status: 'verfuegbar', version: '9.9.9', installieren }));
    const punkt = updatePunkt()!;
    expect(punkt.text).toBe('Update auf 9.9.9 …');
    expect(host.querySelector('.modal')).toBeNull();
    await act(async () => punkt.aktion!());
    expect(host.querySelector('.modal')?.textContent).toContain('Version 9.9.9 ist verfügbar');
    await act(async () => [...host.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent === 'Später')!.click());
    expect(host.querySelector('.modal')).toBeNull();
  });

  it('Abbrechen in den Rückfragen der Rahmen-App verhindert die Installation; während des Wartens gesperrt', async () => {
    installieren.mockClear();
    let antwort: ((ok: boolean) => void) | undefined;
    const host = await render(() => new Promise<boolean>((f) => (antwort = f)));
    const knopf = await oeffnen(host);
    await act(async () => knopf().click());
    expect(knopf().disabled).toBe(true);
    await act(async () => antwort!(false));
    expect(installieren).not.toHaveBeenCalled();
    expect(knopf().disabled).toBe(false);
  });

  it('wartet auf ausstehendes Schreiben, dann Installation', async () => {
    installieren.mockClear();
    let schreiben: (() => void) | undefined;
    const aus = vorDemSchliessen(() => new Promise<void>((f) => (schreiben = f)));
    const host = await render();
    const knopf = await oeffnen(host);
    await act(async () => knopf().click());
    expect(installieren).not.toHaveBeenCalled();
    await act(async () => schreiben!());
    await act(async () => {});
    expect(installieren).toHaveBeenCalledTimes(1);
    aus();
  });
});
