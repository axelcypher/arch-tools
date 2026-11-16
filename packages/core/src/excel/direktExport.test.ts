import { describe, expect, it, vi } from 'vitest';
import { direktExportieren, fassungsName, GRUND_KEIN_PROJEKTORDNER, GRUND_UNGESPEICHERT, GRUND_WEB, type DirektExportAuftrag, type DirektExportUmgebung } from './direktExport';
import { berechnungsordnerPfad, exportDateinameAusMuster } from '../einstellungen/pfade';
import { projektordnerAusDatei } from './projektordner';
import type { VorlagenHinweis } from './pruefung';

const TAG = new Date(2026, 10, 16);
const werte = { projektcode: 'BS5', kurzname: 'EFH Musterweg', datum: TAG };
const OAP = 'C:\\Projekte\\BS5 EFH Musterweg\\03 Berechnungen\\Flächen\\BS5 EFH Musterweg.oap';

function umgebung(vorhanden: string[] = [], o: Partial<DirektExportUmgebung> = {}) {
  const geschrieben = new Map<string, Uint8Array>();
  const u: DirektExportUmgebung & { geschrieben: Map<string, Uint8Array>; angelegt: string[] } = {
    desktop: true,
    geschrieben,
    angelegt: [],
    existiert: async (p) => vorhanden.includes(p) || geschrieben.has(p),
    ordnerAnlegen: async (p) => void u.angelegt.push(p),
    schreiben: async (p, d) => void geschrieben.set(p, d),
    pdf: async () => new Uint8Array([37, 80, 68, 70]),
    fragen: vi.fn(async () => null) as DirektExportUmgebung['fragen'],
    ...o,
  };
  return u;
}

const auftrag = (o: Partial<DirektExportAuftrag> = {}): DirektExportAuftrag => ({
  app: 'flaechenrechner',
  datei: OAP,
  werte,
  inhalt: 'Flächenaufstellung',
  erzeugen: async () => ({ daten: new Uint8Array([1, 2, 3]), vorlage: 'Büro.xlsx', hinweise: [] }),
  ...o,
});

const ORDNER = 'C:\\Projekte\\BS5 EFH Musterweg\\03 Berechnungen\\Flächen';
const XLSX = `${ORDNER}\\BS5 261116 Flächenaufstellung.xlsx`;
const PDF = `${ORDNER}\\BS5 261116 Flächenaufstellung.pdf`;

describe('Ziel des Direktexports', () => {
  it('Projektordner aus dem Pfad der Projektdatei (Muster der Ordner abgeschnitten)', () => {
    expect(projektordnerAusDatei(OAP)).toBe('C:\\Projekte\\BS5 EFH Musterweg');
    expect(projektordnerAusDatei('/home/a/P1/03 berechnungen/flächen/x.oap')).toBe('/home/a/P1');
    // liegt woanders: unbekannt
    expect(projektordnerAusDatei('C:\\Ablage\\x.oap')).toBeNull();
    expect(projektordnerAusDatei('x.oap')).toBeNull();
    expect(projektordnerAusDatei(null)).toBeNull();
  });

  it('Berechnungsordner relativ zum Projektordner, ohne Projektordner unbekannt', () => {
    expect(berechnungsordnerPfad('03 Berechnungen/Flächen', 'C:\\P', werte)).toBe('C:\\P\\03 Berechnungen\\Flächen');
    expect(berechnungsordnerPfad('Export/{PROJEKT_KUERZEL}', '/p', werte)).toBe('/p/Export/BS5');
    expect(berechnungsordnerPfad('03 Berechnungen', null, werte)).toBeNull();
  });

  it('Dateiname aus dem Muster mit {Inhalt}; unzulässige Zeichen und Schrägstriche fallen weg', () => {
    expect(exportDateinameAusMuster('{PROJEKT_KUERZEL} {DATUM} {Inhalt}', { werte, inhalt: 'Flächenaufstellung', endung: 'xlsx' })).toBe('BS5 261116 Flächenaufstellung.xlsx');
    expect(exportDateinameAusMuster('{PROJEKT_KURZNAME}/{Inhalt}', { werte, inhalt: 'GRZ-Nachweis', endung: 'pdf' })).toBe('EFH Musterweg GRZ-Nachweis.pdf');
    expect(exportDateinameAusMuster('{PROJEKT_VORHABEN}', { werte, inhalt: 'Kosten', endung: 'xlsx' })).toBe('Kosten.xlsx');
  });

  it('Fassungen: Nummer vor der Endung', () => {
    expect(fassungsName('A.xlsx', 1)).toBe('A.xlsx');
    expect(fassungsName('A.xlsx', 2)).toBe('A (2).xlsx');
    expect(fassungsName('A b.pdf', 3)).toBe('A b (3).pdf');
  });
});

describe('Direktexport', () => {
  it('speichert .xlsx und PDF im Berechnungsordner (legt ihn an), ohne Rückfrage', async () => {
    const u = umgebung();
    const r = await direktExportieren(auftrag(), u);
    expect(r).toEqual({ art: 'gespeichert', ordner: ORDNER, dateien: [XLSX, PDF], vorlage: 'Büro.xlsx', hinweise: [] });
    expect(u.angelegt).toEqual([ORDNER]);
    expect([...u.geschrieben.keys()]).toEqual([XLSX, PDF]);
    expect(u.fragen).not.toHaveBeenCalled();
  });

  it('geht nicht direkt: Web, ungespeichertes Projekt, Projektordner unbekannt → Dialog mit Grund', async () => {
    expect(await direktExportieren(auftrag(), umgebung([], { desktop: false }))).toEqual({ art: 'dialog', grund: GRUND_WEB });
    expect(await direktExportieren(auftrag({ datei: null }), umgebung())).toEqual({ art: 'dialog', grund: GRUND_UNGESPEICHERT });
    expect(await direktExportieren(auftrag({ datei: 'C:\\Ablage\\x.oap' }), umgebung())).toEqual({ art: 'dialog', grund: GRUND_KEIN_PROJEKTORDNER });
  });

  it('vorhandene Datei: Rückfrage, Hauptknopf „Neue Fassung“ (nie der Gefahrknopf), Abbrechen schreibt nichts', async () => {
    const u = umgebung([PDF]);
    expect(await direktExportieren(auftrag(), u)).toEqual({ art: 'abgebrochen' });
    expect(u.geschrieben.size).toBe(0);
    const frage = vi.mocked(u.fragen).mock.calls[0][0];
    expect(frage.knoepfe.find((k) => k.art === 'primary')?.id).toBe('neu');
    expect(frage.knoepfe.find((k) => k.id === 'ersetzen')?.art).toBe('danger');
  });

  it('„Neue Fassung“ nimmt die erste freie Nummer für beide Dateien', async () => {
    const u = umgebung([XLSX, `${ORDNER}\\BS5 261116 Flächenaufstellung (2).pdf`], { fragen: (async () => 'neu') as DirektExportUmgebung['fragen'] });
    const r = await direktExportieren(auftrag(), u);
    expect(r.art === 'gespeichert' && r.dateien).toEqual([`${ORDNER}\\BS5 261116 Flächenaufstellung (3).xlsx`, `${ORDNER}\\BS5 261116 Flächenaufstellung (3).pdf`]);
  });

  it('„Ersetzen“ schreibt über die vorhandene Datei', async () => {
    const u = umgebung([XLSX], { fragen: (async () => 'ersetzen') as DirektExportUmgebung['fragen'] });
    const r = await direktExportieren(auftrag(), u);
    expect(r.art === 'gespeichert' && r.dateien).toEqual([XLSX, PDF]);
  });

  it('PDF misslingt: .xlsx bleibt gespeichert, der Grund kommt mit', async () => {
    const u = umgebung([], {
      pdf: async () => {
        throw new Error('Für das PDF wird Microsoft Excel oder LibreOffice gebraucht.');
      },
    });
    const r = await direktExportieren(auftrag(), u);
    expect(r).toMatchObject({ art: 'gespeichert', dateien: [XLSX], pdfFehler: 'Für das PDF wird Microsoft Excel oder LibreOffice gebraucht.' });
  });

  it('Hinweise der Vorlagenprüfung werden durchgereicht (blockieren nicht)', async () => {
    const hinweise: VorlagenHinweis[] = [{ art: 'feld', blatt: 'Flächen', ort: 'B3', platzhalter: '{{flaeche.wfl}}', text: 'unbekannt' }];
    const r = await direktExportieren(auftrag({ erzeugen: async () => ({ daten: new Uint8Array([1]), vorlage: 'V.xlsx', hinweise }) }), umgebung());
    expect(r).toMatchObject({ art: 'gespeichert', hinweise });
  });
});
