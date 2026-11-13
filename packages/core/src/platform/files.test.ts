// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import { bytesToBase64, DateiVonAussenGeaendert, pickFile, saveMergedFile } from './files';

/** Speichern mit Blick auf die vorhandene Datei (Desktop) und Dateiwahl im Browser */

const PFAD = '/p/Foto.entz';
let dateien: Map<string, { daten: Uint8Array; stand: { groesse: number; geaendert: number } }>;
let aufrufe: string[];

function desktop() {
  dateien = new Map();
  aufrufe = [];
  (window as unknown as { __TAURI_INTERNALS__: unknown }).__TAURI_INTERNALS__ = {
    invoke: async (befehl: string, a: Record<string, unknown>) => {
      aufrufe.push(befehl);
      const d = dateien.get(a.path as string);
      if (befehl === 'datei_stand') return d ? d.stand : null;
      if (befehl === 'read_binary_file') return d ? bytesToBase64(d.daten) : null;
      if (befehl === 'write_binary_file') {
        const daten = Uint8Array.from(atob(a.contentsBase64 as string), (c) => c.charCodeAt(0));
        dateien.set(a.path as string, { daten, stand: { groesse: daten.length, geaendert: (d?.stand.geaendert ?? 0) + 1 } });
        return;
      }
      throw new Error(`unbekannt: ${befehl}`);
    },
  };
}

afterEach(() => {
  delete (window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
  document.body.innerHTML = '';
});

const optionen = { pfad: PFAD, defaultName: 'Foto.entz', filterName: 'Entzerrung', extension: 'entz', mime: 'application/zip' };

describe('saveMergedFile', () => {
  it('bisher: liest die vorhandene Datei und gibt sie an build', async () => {
    desktop();
    dateien.set(PFAD, { daten: new Uint8Array([1, 2]), stand: { groesse: 2, geaendert: 5 } });
    let gesehen: Uint8Array | null = null;
    expect(await saveMergedFile({ ...optionen, build: (v) => ((gesehen = v), new Uint8Array([9])) })).toBe(PFAD);
    expect([...gesehen!]).toEqual([1, 2]);
    expect([...dateien.get(PFAD)!.daten]).toEqual([9]);
  });

  it('vorhandenLesen: false – die Datei wird nicht gelesen (große .entz)', async () => {
    desktop();
    dateien.set(PFAD, { daten: new Uint8Array(10), stand: { groesse: 10, geaendert: 5 } });
    let gesehen: Uint8Array | null | undefined;
    await saveMergedFile({ ...optionen, vorhandenLesen: false, build: (v) => ((gesehen = v), new Uint8Array([7])) });
    expect(gesehen).toBeNull();
    expect(aufrufe).not.toContain('read_binary_file');
  });

  it('Stand unverändert: schreibt; von außen geändert: nichts geschrieben, klare Meldung', async () => {
    desktop();
    dateien.set(PFAD, { daten: new Uint8Array([1]), stand: { groesse: 1, geaendert: 5 } });
    await saveMergedFile({ ...optionen, vorhandenLesen: false, stand: { groesse: 1, geaendert: 5 }, build: () => new Uint8Array([2, 2]) });
    expect([...dateien.get(PFAD)!.daten]).toEqual([2, 2]);
    // jemand anderes speichert dazwischen
    dateien.set(PFAD, { daten: new Uint8Array([3]), stand: { groesse: 1, geaendert: 99 } });
    await expect(saveMergedFile({ ...optionen, stand: { groesse: 2, geaendert: 6 }, build: () => new Uint8Array([4]) })).rejects.toBeInstanceOf(DateiVonAussenGeaendert);
    expect([...dateien.get(PFAD)!.daten]).toEqual([3]);
    expect(aufrufe.filter((a) => a === 'write_binary_file')).toHaveLength(1);
  });

  it('stand: null – die Datei darf es noch nicht geben; Gegenprobe: neue Datei wird geschrieben', async () => {
    desktop();
    await saveMergedFile({ ...optionen, stand: null, build: () => new Uint8Array([1]) });
    expect(dateien.has(PFAD)).toBe(true);
    await expect(saveMergedFile({ ...optionen, stand: null, build: () => new Uint8Array([2]) })).rejects.toThrow('von außen geändert');
  });
});

describe('pickFile', () => {
  const waehle = (liste: File[]) => {
    const input = document.querySelector<HTMLInputElement>('input[type="file"]')!;
    Object.defineProperty(input, 'files', { value: liste });
    input.dispatchEvent(new Event('change'));
    return input;
  };

  it('eine Datei (wie bisher); mit mehrere: alle gewählten', async () => {
    const a = new File(['a'], 'a.jpg');
    const b = new File(['b'], 'b.jpg');
    const eine = pickFile('.jpg');
    expect(document.querySelector<HTMLInputElement>('input[type="file"]')!.multiple).toBe(false);
    waehle([a, b]);
    expect(await eine).toBe(a);
    const alle = pickFile('.jpg', { mehrere: true });
    expect(document.querySelector<HTMLInputElement>('input[type="file"]')!.multiple).toBe(true);
    waehle([a, b]);
    expect(await alle).toEqual([a, b]);
  });

  it('Abbruch: null bzw. leere Liste', async () => {
    const eine = pickFile('.jpg');
    document.querySelector('input[type="file"]')!.dispatchEvent(new Event('cancel'));
    expect(await eine).toBeNull();
    const alle = pickFile('.jpg', { mehrere: true });
    document.querySelector('input[type="file"]')!.dispatchEvent(new Event('cancel'));
    expect(await alle).toEqual([]);
  });
});
