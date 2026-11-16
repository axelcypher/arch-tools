// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('../platform/files', async (orig) => ({ ...(await orig<typeof import('../platform/files')>()), saveBinaryFile: vi.fn(async () => true), pickFile: vi.fn(async () => null) }));

import { ExcelDialog } from './ExcelDialog';
import { dialogVerhaltenEinrichten } from './dialoge';
import { vorlagenSpeicher } from '../excel/vorlage';
import type { VorlagenHinweis } from '../excel/pruefung';
import { createProject } from '../model';
import { pickFile, saveBinaryFile } from '../platform/files';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: ReturnType<typeof createRoot> | null = null;
beforeAll(() => dialogVerhaltenEinrichten());
afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.innerHTML = '';
  localStorage.clear();
});

function zeigen(onClose = () => {}, update: (fn: unknown) => void = () => {}, pruefeVorlage = vi.fn(async () => [] as VorlagenHinweis[])) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const exportDefault = vi.fn(async () => new Uint8Array([1]));
  act(() => {
    root = createRoot(host);
    root.render(
      createElement(ExcelDialog, {
        project: createProject('Haus'),
        update,
        onClose,
        speicher: vorlagenSpeicher('vorlage', 'test-vorlage'),
        standardText: 'Blatt „Flächen“',
        referenz: (zu: () => void) => createElement('div', { className: 'test-referenz' }, createElement('button', { type: 'button', onClick: zu }, 'Referenz schließen')),
        pruefeVorlage,
        datei: null,
        zusatz: () => 'Test',
        musterName: 'Muster.xlsx',
        exportDefault,
        exportWithTemplate: vi.fn(async () => new Uint8Array([2])),
        buildSampleTemplate: vi.fn(async () => new Uint8Array([3])),
      }),
    );
  });
  return { host, exportDefault, pruefeVorlage };
}

describe('Excel-Dialog', () => {
  it('ist ein benannter Dialog, Erstfokus auf „Exportieren“, Enter exportiert und schließt', async () => {
    const onClose = vi.fn();
    const { host, exportDefault } = zeigen(onClose);
    const d = host.querySelector<HTMLElement>('.modal')!;
    expect(d.getAttribute('role')).toBe('dialog');
    expect(document.getElementById(d.getAttribute('aria-labelledby')!)?.textContent).toBe('Excel-Export');
    await act(() => new Promise<void>((r) => requestAnimationFrame(() => r())));
    expect(document.activeElement?.textContent).toBe('Excel speichern');
    await act(async () => {
      host.querySelector('form')!.requestSubmit();
    });
    expect(exportDefault).toHaveBeenCalledTimes(1);
    expect(saveBinaryFile).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it('Vorlagen-Knöpfe nur bei „Eigene Vorlage“; ohne Vorlage ist „Exportieren“ gesperrt', () => {
    const { host } = zeigen();
    expect(host.textContent).not.toContain('Muster-Vorlage herunterladen');
    act(() => host.querySelectorAll<HTMLInputElement>('input[type="radio"]')[1].click());
    expect(host.textContent).toContain('Vorlage wählen …');
    expect(host.textContent).toContain('Muster-Vorlage herunterladen');
    const exportieren = [...host.querySelectorAll('button')].find((b) => b.textContent === 'Excel speichern')!;
    expect(exportieren.disabled).toBe(true);
  });

  it('eine gewählte Datei, die keine Excel-Datei ist, wird abgewiesen und nicht übernommen', async () => {
    const update = vi.fn();
    vi.mocked(pickFile as (accept: string) => Promise<File | null>).mockResolvedValueOnce(new File([new TextEncoder().encode('kein zip')], 'Liste.xlsx'));
    const { host } = zeigen(() => {}, update);
    act(() => host.querySelectorAll<HTMLInputElement>('input[type="radio"]')[1].click());
    await act(async () => {
      [...host.querySelectorAll('button')].find((b) => b.textContent === 'Vorlage wählen …')!.click();
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(host.querySelector('[role="alert"]')?.textContent).toContain('„Liste.xlsx“: Die Datei ist keine gültige Excel-Datei');
    expect(update).not.toHaveBeenCalled();
  });

  it('„Platzhalter-Referenz …“ öffnet den Referenz-Dialog der App', () => {
    const { host } = zeigen();
    act(() => host.querySelectorAll<HTMLInputElement>('input[type="radio"]')[1].click());
    const knopf = [...host.querySelectorAll('button')].find((b) => b.textContent === 'Platzhalter-Referenz …')!;
    expect(knopf.getAttribute('aria-haspopup')).toBe('dialog');
    act(() => knopf.click());
    expect(document.querySelector('.test-referenz')).not.toBeNull();
    act(() => document.querySelector<HTMLButtonElement>('.test-referenz button')!.click());
    expect(document.querySelector('.test-referenz')).toBeNull();
  });

  it('Hinweise der Vorlagenprüfung nach dem Export: Dialog bleibt offen und nennt Blatt und Zelle', async () => {
    localStorage.setItem('test-vorlage', JSON.stringify({ name: 'Büro.xlsx', date: '16.11.2026', base64: btoa('xlsx') }));
    const onClose = vi.fn();
    const hinweise: VorlagenHinweis[] = [
      { art: 'filter', blatt: 'Flächen', ort: 'B12', platzhalter: '{{raum[wolf].name}}', text: 'Filter [wolf] gibt es nicht – er trifft nie zu. Meinten Sie [wofl]?' },
    ];
    const { host, pruefeVorlage } = zeigen(
      onClose,
      () => {},
      vi.fn(async () => hinweise),
    );
    expect(host.textContent).toContain('Büro.xlsx');
    await act(async () => host.querySelector('form')!.requestSubmit());
    expect(pruefeVorlage).toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(host.querySelector('[role="status"] summary')?.textContent).toBe('Exportiert – die Vorlagenprüfung meldet 1 Hinweis:');
    expect(host.querySelector<HTMLDetailsElement>('[role="status"] details')!.open).toBe(true);
    expect(document.activeElement?.tagName).toBe('SUMMARY');
    expect(host.querySelector('[role="status"] li')?.textContent).toContain('Flächen · B12: {{raum[wolf].name}} – Filter [wolf] gibt es nicht');
    expect([...host.querySelectorAll('button')].map((b) => b.textContent)).toContain('Schließen');
  });

  it('„Vorlage prüfen“ ohne Hinweise meldet das', async () => {
    localStorage.setItem('test-vorlage', JSON.stringify({ name: 'Büro.xlsx', date: '16.11.2026', base64: btoa('xlsx') }));
    const { host } = zeigen();
    await act(async () => [...host.querySelectorAll('button')].find((b) => b.textContent === 'Vorlage prüfen')!.click());
    expect(host.querySelector('[role="status"]')?.textContent).toBe('Vorlage geprüft: keine Hinweise.');
  });
});
