// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { SpeicherProjektordner } from '@core/platform/projektordner';
import { FotoWahl } from './components/FotoWahl';
import { entzZuFoto } from './projekt';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: ReturnType<typeof createRoot> | null = null;
afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.innerHTML = '';
});
const warten = () =>
  act(async () => {
    for (let i = 0; i < 3; i++) await new Promise((r) => setTimeout(r, 0));
  });

describe('Fotos des Projekts', () => {
  it('die Entzerrung liegt neben dem Foto', () => {
    expect(entzZuFoto('Fassade/Nord/IMG_0012.JPG')).toBe('Fassade/Nord/IMG_0012.entz');
    expect(entzZuFoto('a.b/IMG.jpeg')).toBe('a.b/IMG.entz');
  });

  it('Fotoordner rekursiv: Fotos je Unterordner, vorhandene Entzerrung markiert, Klick öffnet', async () => {
    const fs = new SpeicherProjektordner();
    const b = new Uint8Array([1]);
    await fs.dateiAnlegen('/p/2026-014 Haus/09 Fotos', 'Bestand/Nord.jpg', b);
    await fs.dateiAnlegen('/p/2026-014 Haus/09 Fotos', 'Bestand/Nord.entz', b);
    await fs.dateiAnlegen('/p/2026-014 Haus/09 Fotos', 'Bestand/Sued.png', b);
    await fs.dateiAnlegen('/p/2026-014 Haus/09 Fotos', 'Baustelle/2026-11/Decke.webp', b);
    await fs.dateiAnlegen('/p/2026-014 Haus/09 Fotos', 'Baustelle/Notiz.txt', b);
    const geoeffnet: string[] = [];
    const host = document.createElement('div');
    document.body.appendChild(host);
    act(() => {
      root = createRoot(host);
      root.render(createElement(FotoWahl, { fs, projektordner: '/p/2026-014 Haus', fotoordner: '09 Fotos', onFoto: (r: string, p: string) => geoeffnet.push(`${r}|${p}`), onAnderesProjekt: () => {} }));
    });
    await warten();
    expect(host.textContent).toContain('3 Fotos');
    expect([...host.querySelectorAll('.fw-gruppe h3')].map((h) => h.textContent)).toEqual(['Baustelle/2026-11', 'Bestand']);
    const nord = [...host.querySelectorAll('.fw-foto')].find((x) => x.textContent?.includes('Nord.jpg')) as HTMLButtonElement;
    expect(nord.textContent).toContain('entzerrt');
    expect([...host.querySelectorAll('.fw-foto')].find((x) => x.textContent?.includes('Sued.png'))?.textContent).not.toContain('entzerrt');
    act(() => nord.click());
    expect(geoeffnet).toEqual(['/p/2026-014 Haus/09 Fotos|Bestand/Nord.jpg']);
  });

  it('ohne Fotoordner: verständlicher Hinweis', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const fs = new SpeicherProjektordner();
    fs.liste = () => Promise.reject(new Error('Ordner nicht gefunden'));
    act(() => {
      root = createRoot(host);
      root.render(createElement(FotoWahl, { fs, projektordner: '/p/X', fotoordner: '09 Fotos', onFoto: () => {}, onAnderesProjekt: () => {} }));
    });
    await warten();
    expect(host.textContent).toContain('Den Fotoordner gibt es nicht');
  });
});
