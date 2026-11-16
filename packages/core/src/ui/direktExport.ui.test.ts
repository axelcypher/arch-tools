// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../platform/files', async (orig) => ({ ...(await orig<typeof import('../platform/files')>()), isTauri: vi.fn(() => true) }));
vi.mock('../platform/pdf', async (orig) => ({ ...(await orig<typeof import('../platform/pdf')>()), pdfMoeglich: () => true }));
vi.mock('../platform/projektordner', async (orig) => ({ ...(await orig<typeof import('../platform/projektordner')>()), ordnerZeigen: vi.fn(async () => {}) }));
vi.mock('./Rueckfrage', async (orig) => ({ ...(await orig<typeof import('./Rueckfrage')>()), meldung: vi.fn(async () => {}) }));

import type { DirektExportAuftrag, DirektExportUmgebung } from '../excel/direktExport';
import type { VorlagenHinweis } from '../excel/pruefung';
import { ordnerZeigen } from '../platform/projektordner';
import { DirektExportKnopf, useDirektExport } from './DirektExportKnopf';
import { direktExportMitMeldung, wurzelUndRest } from './direktExport';
import { meldung } from './Rueckfrage';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const OAP = 'C:\\P\\03 Berechnungen\\Flächen\\BS5.oap';
const ORDNER = 'C:\\P\\03 Berechnungen\\Flächen';
const hinweis: VorlagenHinweis = { art: 'feld', blatt: 'Flächen', ort: 'B3', platzhalter: '{{x}}', text: 'unbekannt' };

const auftrag = (o: Partial<DirektExportAuftrag> = {}): DirektExportAuftrag => ({
  app: 'flaechenrechner',
  datei: OAP,
  werte: { projektcode: 'BS5', datum: new Date(2026, 10, 16) },
  inhalt: 'Flächenaufstellung',
  erzeugen: async () => ({ daten: new Uint8Array([1]), vorlage: null, hinweise: [] }),
  ...o,
});

function umgebung(antwort: string | null, o: Partial<DirektExportUmgebung> = {}): DirektExportUmgebung {
  return {
    desktop: true,
    existiert: async () => false,
    ordnerAnlegen: async () => {},
    schreiben: async () => {},
    pdf: async () => new Uint8Array([2]),
    fragen: vi.fn(async () => antwort) as DirektExportUmgebung['fragen'],
    ...o,
  };
}

let weg: (() => void) | null = null;
afterEach(() => {
  weg?.();
  weg = null;
  vi.clearAllMocks();
  delete (window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
});

describe('Wurzel für projekt_ordner_anlegen', () => {
  it('Laufwerk, Freigabe und „/“; Rest mit „/“', () => {
    expect(wurzelUndRest('C:\\P\\03 Berechnungen\\Flächen\\')).toEqual({ root: 'C:\\', rel: 'P/03 Berechnungen/Flächen' });
    expect(wurzelUndRest('\\\\server\\daten\\Projekte\\P1')).toEqual({ root: '\\\\server\\daten\\', rel: 'Projekte/P1' });
    expect(wurzelUndRest('/home/a/P1')).toEqual({ root: '/', rel: 'home/a/P1' });
    expect(wurzelUndRest('C:\\')).toEqual({ root: 'C:\\', rel: '' });
    expect(() => wurzelUndRest('P1/x')).toThrow('Kein vollständiger Pfad');
  });
});

describe('Rückmeldung nach dem Direktexport', () => {
  it('„Gespeichert“ mit Ordner und Dateien; „Ordner öffnen“ öffnet den Berechnungsordner', async () => {
    const u = umgebung('ordner');
    await direktExportMitMeldung(auftrag(), vi.fn(), u);
    const f = vi.mocked(u.fragen).mock.calls[0][0];
    expect(f.titel).toBe('Gespeichert');
    expect(f.text).toBe(`Gespeichert in „${ORDNER}“: BS5 261116 Flächenaufstellung.xlsx und BS5 261116 Flächenaufstellung.pdf (Standardlayout).`);
    expect(f.knoepfe.map((k) => k.label)).toEqual(['Ordner öffnen', 'OK']);
    expect(ordnerZeigen).toHaveBeenCalledWith(ORDNER);
  });

  it('mit Prüfhinweisen: „Prüfhinweise …“ öffnet den Dialog mit der Liste', async () => {
    const zeigen = vi.fn();
    const u = umgebung('hinweise');
    await direktExportMitMeldung(auftrag({ erzeugen: async () => ({ daten: new Uint8Array([1]), vorlage: 'V.xlsx', hinweise: [hinweis] }) }), zeigen, u);
    const f = vi.mocked(u.fragen).mock.calls[0][0];
    expect(f.text).toContain('(Vorlage „V.xlsx“). Die Vorlagenprüfung meldet einen Hinweis.');
    expect(f.knoepfe.map((k) => k.label)).toEqual(['Prüfhinweise …', 'Ordner öffnen', 'OK']);
    expect(zeigen).toHaveBeenCalledWith([hinweis]);
  });

  it('Schreibfehler: Meldung „Export fehlgeschlagen“ mit dem Grund', async () => {
    const u = umgebung('ok', {
      schreiben: async () => {
        throw new Error('Datei ist in Excel geöffnet');
      },
    });
    await direktExportMitMeldung(auftrag(), vi.fn(), u);
    expect(u.fragen).not.toHaveBeenCalled();
    expect(meldung).toHaveBeenCalledWith('Export fehlgeschlagen', 'Die Datei ließ sich nicht speichern: Datei ist in Excel geöffnet', expect.any(Error));
  });

  it('PDF misslingt nach „Ersetzen“: die Meldung sagt, dass das PDF daneben den alten Stand hat', async () => {
    const pdf = `${ORDNER}\\BS5 261116 Flächenaufstellung.pdf`;
    const u = umgebung('ersetzen', {
      existiert: async (p) => p === pdf,
      pdf: async () => {
        throw new Error('Microsoft Excel ist nicht installiert');
      },
    });
    vi.mocked(u.fragen).mockResolvedValueOnce('ersetzen').mockResolvedValueOnce('ok');
    await direktExportMitMeldung(auftrag(), vi.fn(), u);
    const f = vi.mocked(u.fragen).mock.calls[1][0];
    expect(f.titel).toBe('Gespeichert – ohne PDF');
    expect(f.text).toContain('Das PDF daneben hat noch den alten Stand – das neue ließ sich nicht erzeugen: Microsoft Excel ist nicht installiert');
  });
});

describe('Knopf „Exportieren“', () => {
  function zeigen(p: Parameters<typeof useDirektExport>[0]) {
    function Knopf() {
      const d = useDirektExport(p);
      return createElement(DirektExportKnopf, d);
    }
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    act(() => root.render(createElement(Knopf)));
    weg = () => act(() => root.unmount());
    return { knopf: host.querySelector('button')!, weg: () => (weg?.(), (weg = null)) };
  }

  it('bereit: Tooltip nennt Formate und Ziel; ungespeichert gesperrt (aria-disabled) mit Grund', () => {
    const a = zeigen({ auftrag: () => auftrag(), dialogOeffnen: vi.fn() });
    expect(a.knopf.getAttribute('aria-disabled')).toBeNull();
    expect(a.knopf.title).toBe(`Als Excel und PDF in „${ORDNER}“ speichern (eingestellte Vorlage, ohne Dialog)`);
    a.weg();
    const b = zeigen({ auftrag: () => auftrag({ datei: null }), dialogOeffnen: vi.fn() });
    expect(b.knopf.getAttribute('aria-disabled')).toBe('true');
    expect(b.knopf.title).toContain('Erst das Projekt speichern');
    b.weg();
  });

  it('Doppelklick startet nur einen Export; während des Exports „Exportiere …“ und gesperrt', async () => {
    let fertig = () => {};
    const erzeugen = vi.fn(() => new Promise<{ daten: Uint8Array; vorlage: null; hinweise: [] }>((r) => (fertig = () => r({ daten: new Uint8Array([1]), vorlage: null, hinweise: [] }))));
    // Tauri-Aufrufe der echten Umgebung: Datei gibt es nicht, alles andere gelingt
    (window as unknown as { __TAURI_INTERNALS__: unknown }).__TAURI_INTERNALS__ = { invoke: vi.fn(async (cmd: string) => (cmd === 'excel_als_pdf' ? 'AA==' : null)) };
    const k = zeigen({ auftrag: () => auftrag({ erzeugen }), dialogOeffnen: vi.fn() });
    await act(async () => {
      k.knopf.click();
      k.knopf.click();
    });
    for (let i = 0; i < 20 && !erzeugen.mock.calls.length; i++) await act(async () => new Promise((r) => setTimeout(r, 0)));
    expect(erzeugen).toHaveBeenCalledTimes(1);
    expect(k.knopf.textContent?.trim()).toBe('Exportiere …');
    expect(k.knopf.getAttribute('aria-disabled')).toBe('true');
    await act(async () => fertig());
  });
});
