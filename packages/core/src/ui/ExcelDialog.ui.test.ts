// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('../platform/files', async (orig) => ({ ...(await orig<typeof import('../platform/files')>()), saveBinaryFile: vi.fn(async () => true), pickFile: vi.fn(async () => null) }));

import { ExcelDialog } from './ExcelDialog';
import { dialogVerhaltenEinrichten } from './dialoge';
import { vorlagenSpeicher } from '../excel/vorlage';
import { createProject } from '../model';
import { saveBinaryFile } from '../platform/files';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: ReturnType<typeof createRoot> | null = null;
beforeAll(() => dialogVerhaltenEinrichten());
afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.innerHTML = '';
  localStorage.clear();
});

function zeigen(onClose = () => {}) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const exportDefault = vi.fn(async () => new Uint8Array([1]));
  act(() => {
    root = createRoot(host);
    root.render(
      createElement(ExcelDialog, {
        project: createProject('Haus'),
        update: () => {},
        onClose,
        speicher: vorlagenSpeicher('vorlage', 'test-vorlage'),
        standardText: 'Blatt „Flächen“',
        hilfe: 'Hilfe',
        docs: [],
        datei: null,
        zusatz: () => 'Test',
        musterName: 'Muster.xlsx',
        exportDefault,
        exportWithTemplate: vi.fn(async () => new Uint8Array([2])),
        buildSampleTemplate: vi.fn(async () => new Uint8Array([3])),
      }),
    );
  });
  return { host, exportDefault };
}

describe('Excel-Dialog', () => {
  it('ist ein benannter Dialog, Erstfokus auf „Exportieren“, Enter exportiert und schließt', async () => {
    const onClose = vi.fn();
    const { host, exportDefault } = zeigen(onClose);
    const d = host.querySelector<HTMLElement>('.modal')!;
    expect(d.getAttribute('role')).toBe('dialog');
    expect(document.getElementById(d.getAttribute('aria-labelledby')!)?.textContent).toBe('Excel-Export');
    await act(() => new Promise<void>((r) => requestAnimationFrame(() => r())));
    expect(document.activeElement?.textContent).toBe('Exportieren');
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
    const exportieren = [...host.querySelectorAll('button')].find((b) => b.textContent === 'Exportieren')!;
    expect(exportieren.disabled).toBe(true);
  });
});
