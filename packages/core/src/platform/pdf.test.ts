import { afterEach, describe, expect, it } from 'vitest';
import { excelAlsPdf, PDF_NUR_DESKTOP, pdfMoeglich } from './pdf';

type Fenster = { __TAURI_INTERNALS__?: { invoke: (cmd: string, args: unknown) => Promise<unknown> } };
const fenster = () => globalThis as unknown as { window?: Fenster };

afterEach(() => {
  delete fenster().window;
});

function tauri(invoke: (cmd: string, args: unknown) => Promise<unknown>) {
  fenster().window = { __TAURI_INTERNALS__: { invoke } };
}

describe('PDF aus Excel', () => {
  it('Web-Fassung: gesperrt, mit Grund', async () => {
    expect(pdfMoeglich()).toBe(false);
    await expect(excelAlsPdf(new Uint8Array([1]))).rejects.toThrow(PDF_NUR_DESKTOP);
  });

  it('Desktop: ruft excel_als_pdf mit Base64 auf und liefert die Bytes', async () => {
    const aufrufe: [string, unknown][] = [];
    tauri(async (cmd, args) => {
      aufrufe.push([cmd, args]);
      return btoa('%PDF');
    });
    expect(pdfMoeglich()).toBe(true);
    expect(new TextDecoder().decode(await excelAlsPdf(new Uint8Array([80, 75])))).toBe('%PDF');
    expect(aufrufe[0][0]).toBe('excel_als_pdf');
    expect(aufrufe[0][1]).toMatchObject({ xlsxBase64: btoa('PK') });
  });

  it('Fehler der Hülle kommen als lesbare Meldung', async () => {
    tauri(async () => {
      throw 'Für das PDF wird Microsoft Excel oder LibreOffice gebraucht – keines davon wurde auf diesem Rechner gefunden.';
    });
    await expect(excelAlsPdf(new Uint8Array([1]))).rejects.toThrow('Microsoft Excel oder LibreOffice');
  });
});
