// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readProjectFile } from '../archive';
import { createProject } from '../model';
import { projektdateiAnlegen, SpeicherProjektordner } from '../platform/projektordner';
import type { GewaehltesProjekt } from './ProjektWahl';
import { ProjektWahl } from './ProjektWahl';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: ReturnType<typeof createRoot> | null = null;
beforeEach(() => localStorage.clear());
afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.innerHTML = '';
});
const warten = () =>
  act(async () => {
    for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0));
  });
const knopf = (host: Element, text: string) => [...host.querySelectorAll('button')].find((b) => b.textContent?.trim().startsWith(text)) as HTMLButtonElement;
const karte = (host: Element, text: string) => [...host.querySelectorAll('.pa-karte')].find((k) => k.textContent?.includes(text)) as HTMLElement;

describe('Projektwahl (Flächenrechner, GRZ-Nachweis, Kostenermittlung)', () => {
  it('öffnet die Projektdatei eines Projektordners; ohne Projektdatei: Stammdaten-Dialog, Projektdatei anlegen, öffnen', async () => {
    localStorage.setItem('arch-tools:konfig:allgemein', JSON.stringify({ projekte: ['/p'], oapPfad: 'Berechnungen/{nummer} {kurzname}.oap' }));
    const fs = new SpeicherProjektordner();
    const p = createProject('Kita am Park');
    p.meta.projektcode = '2025-007';
    await fs.ordnerAnlegen('/p', '2025-007 Kita');
    await projektdateiAnlegen(fs, '/p/2025-007 Kita', 'Berechnungen/2025-007.oap', p, 'Test');
    await fs.ordnerAnlegen('/p', '2019-003 Altbau/Pläne');

    const gewaehlt: GewaehltesProjekt[] = [];
    const host = document.createElement('div');
    document.body.appendChild(host);
    act(() => {
      root = createRoot(host);
      root.render(createElement(ProjektWahl, { app: 'Flächenrechner', fs, onGewaehlt: (g: GewaehltesProjekt) => void gewaehlt.push(g), onSchliessen: () => {} }));
    });
    await warten();
    act(() => knopf(host, 'p').click()); // Gruppe „p“ aufklappen
    await warten();
    expect(host.textContent).toContain('Kita am Park');
    expect(host.textContent).toContain('ohne Projektdatei');

    act(() => karte(host, 'Kita am Park').click());
    await warten();
    expect(gewaehlt[0]).toMatchObject({ datei: '/p/2025-007 Kita/Berechnungen/2025-007.oap', ordner: '/p/2025-007 Kita', neu: false });
    expect(gewaehlt[0].project.meta.projektcode).toBe('2025-007');

    act(() => karte(host, '2019-003').click());
    await warten();
    expect(host.textContent).toContain('liegt noch keine Projektdatei');
    expect((host.querySelector('.sd-dialog input') as HTMLInputElement).value).toBe('2019-003');
    await act(async () => knopf(host, 'Projektdatei anlegen').click());
    await warten();
    expect(gewaehlt[1]).toMatchObject({ datei: '/p/2019-003 Altbau/Berechnungen/2019-003 Altbau.oap', neu: true });
    const neu = readProjectFile(fs.eintraege.get('/p/2019-003 Altbau/Berechnungen/2019-003 Altbau.oap')!);
    expect(neu.meta).toMatchObject({ projektcode: '2019-003', kurzname: 'Altbau' });
    expect(neu.meta.angelegt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    // zuletzt geöffnet: je Benutzer, lokal
    expect(JSON.parse(localStorage.getItem('arch-tools:lokal:zuletzt')!).eintraege.map((e: { pfad: string }) => e.pfad)).toEqual(['/p/2019-003 Altbau', '/p/2025-007 Kita']);
  });

  it('ohne Stammordner: Hinweis und Datei öffnen', async () => {
    let dateiOeffnen = 0;
    const host = document.createElement('div');
    document.body.appendChild(host);
    act(() => {
      root = createRoot(host);
      root.render(createElement(ProjektWahl, { app: 'X', fs: new SpeicherProjektordner(), onGewaehlt: () => {}, onDateiOeffnen: () => dateiOeffnen++ }));
    });
    await warten();
    expect(host.textContent).toContain('Noch kein Stammordner eingestellt');
    act(() => knopf(host, 'Datei öffnen').click());
    expect(dateiOeffnen).toBe(1);
  });
});
