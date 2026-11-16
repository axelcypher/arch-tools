// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

const pdfMoeglich = vi.fn(() => true);
vi.mock('../platform/files', async (orig) => ({
  ...(await orig<typeof import('../platform/files')>()),
  isTauri: () => true,
  saveMergedFile: vi.fn(async (o: { pfad?: string; defaultName: string }) => o.pfad ?? `C:\\Ablage\\${o.defaultName}`),
}));
vi.mock('../platform/pdf', async (orig) => ({ ...(await orig<typeof import('../platform/pdf')>()), pdfMoeglich: () => pdfMoeglich(), excelAlsPdf: vi.fn(async () => new Uint8Array([9])) }));
vi.mock('./Rueckfrage', async (orig) => ({ ...(await orig<typeof import('./Rueckfrage')>()), fragen: vi.fn(async () => 'abbrechen') }));

import { ExcelDialog } from './ExcelDialog';
import { dialogVerhaltenEinrichten } from './dialoge';
import { vorlagenSpeicher } from '../excel/vorlage';
import type { VorlagenHinweis } from '../excel/pruefung';
import { createProject } from '../model';
import { saveMergedFile } from '../platform/files';
import { excelAlsPdf, PDF_NUR_DESKTOP } from '../platform/pdf';
import { fragen } from './Rueckfrage';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: ReturnType<typeof createRoot> | null = null;
beforeAll(() => dialogVerhaltenEinrichten());
afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.innerHTML = '';
  vi.clearAllMocks();
  pdfMoeglich.mockReturnValue(true);
  delete (window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
});

function zeigen(o: { hinweise?: VorlagenHinweis[]; onClose?: () => void } = {}) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  act(() => {
    root = createRoot(host);
    root.render(
      createElement(ExcelDialog, {
        project: createProject('Haus'),
        update: () => {},
        onClose: o.onClose ?? (() => {}),
        speicher: vorlagenSpeicher('vorlage', 'test-vorlage-pdf'),
        standardText: 'Blatt „Flächen“',
        referenz: () => null,
        datei: 'C:\\P\\03 Berechnungen\\Flächen\\BS5.oap',
        zusatz: () => 'Test',
        musterName: 'Muster.xlsx',
        exportDefault: vi.fn(async () => new Uint8Array([1])),
        exportWithTemplate: vi.fn(async () => new Uint8Array([2])),
        buildSampleTemplate: vi.fn(async () => new Uint8Array([3])),
        art: 'pdf',
        hinweise: o.hinweise,
        benennung: { app: 'flaechenrechner', werte: { projektcode: 'BS5', datum: new Date(2026, 10, 16) }, inhalt: 'Flächenaufstellung' },
      }),
    );
  });
  const knopf = (t: string) => [...host.querySelectorAll('button')].find((b) => b.textContent?.trim() === t)!;
  return { host, knopf };
}

const absenden = async (host: HTMLElement) => {
  await act(async () => host.querySelector('form')!.requestSubmit());
  for (let i = 0; i < 20 && !vi.mocked(saveMergedFile).mock.calls.length; i++) await act(async () => new Promise((r) => setTimeout(r, 0)));
};

describe('Export-Dialog im PDF-Modus', () => {
  it('Web: „PDF speichern“ gesperrt, der Grund ist ihm zugeordnet; keine Einleitung', () => {
    pdfMoeglich.mockReturnValue(false);
    const { host, knopf } = zeigen();
    const k = knopf('PDF speichern');
    expect(k.disabled).toBe(true);
    expect(document.getElementById(k.getAttribute('aria-describedby')!)?.textContent).toBe(PDF_NUR_DESKTOP);
    expect(host.textContent).not.toContain('über Microsoft Excel bzw. LibreOffice als PDF gespeichert');
  });

  it('speichert das PDF mit dem Dateinamen aus den Einstellungen', async () => {
    const onClose = vi.fn();
    const { host } = zeigen({ onClose });
    await absenden(host);
    expect(excelAlsPdf).toHaveBeenCalledWith(new Uint8Array([1]));
    expect(vi.mocked(saveMergedFile).mock.calls[0][0]).toMatchObject({ defaultName: 'BS5 261116 Flächenaufstellung.pdf', extension: 'pdf', vorhandenLesen: false });
    expect(onClose).toHaveBeenCalled();
  });

  it('„Excel-Datei daneben mitspeichern“: gibt es sie schon, fragt „… ersetzen?“; Abbrechen lässt sie unverändert', async () => {
    (window as unknown as { __TAURI_INTERNALS__: unknown }).__TAURI_INTERNALS__ = { invoke: vi.fn(async (cmd: string) => (cmd === 'datei_stand' ? { groesse: 1, geaendert: 1 } : null)) };
    const { host } = zeigen();
    act(() => host.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click());
    await absenden(host);
    for (let i = 0; i < 20 && !vi.mocked(fragen).mock.calls.length; i++) await act(async () => new Promise((r) => setTimeout(r, 0)));
    expect(vi.mocked(fragen).mock.calls[0][0]).toMatchObject({ titel: '„BS5 261116 Flächenaufstellung.xlsx“ ersetzen?', text: 'Die Datei gibt es schon in „C:\\Ablage“.' });
    // nur das PDF geschrieben
    expect(vi.mocked(saveMergedFile).mock.calls.map((c) => c[0].extension)).toEqual(['pdf']);
  });

  it('„Ersetzen“ schreibt die .xlsx neben das PDF', async () => {
    (window as unknown as { __TAURI_INTERNALS__: unknown }).__TAURI_INTERNALS__ = { invoke: vi.fn(async (cmd: string) => (cmd === 'datei_stand' ? { groesse: 1, geaendert: 1 } : null)) };
    vi.mocked(fragen).mockResolvedValueOnce('ersetzen');
    const { host } = zeigen();
    act(() => host.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click());
    await absenden(host);
    for (let i = 0; i < 20 && vi.mocked(saveMergedFile).mock.calls.length < 2; i++) await act(async () => new Promise((r) => setTimeout(r, 0)));
    expect(vi.mocked(saveMergedFile).mock.calls[1][0]).toMatchObject({ pfad: 'C:\\Ablage\\BS5 261116 Flächenaufstellung.xlsx', extension: 'xlsx' });
  });

  it('startet mit den Hinweisen der Vorlagenprüfung aus dem Direktexport (Knopf „Schließen“)', () => {
    const { knopf } = zeigen({ hinweise: [{ art: 'feld', blatt: 'Flächen', ort: 'B3', platzhalter: '{{x}}', text: 'unbekannt' }] });
    // die Liste selbst erscheint bei „Eigene Vorlage“; ohne Vorlage startet der Dialog im Standardlayout
    expect(knopf('Schließen')).toBeDefined();
  });
});
