import { describe, expect, it } from 'vitest';
import { istSammelordner, projekteAuflisten, SpeicherProjektordner, statusAusGruppe } from './projektordner';

const leer = { ordner: [], dateien: [] };

describe('Projektordner in den Stammordnern finden – auch in Gruppen-, Akquise- und Archivordnern', () => {
  it('Sammelordner am Namen oder am Inhalt, Projekte an Projektdatei bzw. nummerierten Unterordnern', () => {
    for (const n of ['Archiv', '_Archiv', '99 Abgeschlossen', 'Archiv 2024', '00_Akquise', 'Akquise']) expect(istSammelordner(n, leer), n).toBe(true);
    for (const n of ['2026-014 Stadtarchiv', '2026-020 Archiv Stadt', 'SIS Sanierung']) expect(istSammelordner(n, leer), n).toBe(false);
    // Gruppenordner: darin Ordner mit Projektnamen
    expect(istSammelordner('Wohnungsbau', { ordner: ['2026-014 EFH Musterweg', '2026-015 MFH Bahnhof'], dateien: [] })).toBe(true);
    expect(istSammelordner('Gewerbe', { ordner: ['SIS Sanierung ESG'], dateien: [] })).toBe(true);
    // Projekt: nummerierte Unterordner bzw. Projektdatei – auch wenn darin Ordner mit Ziffern stehen
    expect(istSammelordner('2026-014 EFH', { ordner: ['00 Projekt', '01 Grundlagen', '02 Pläne'], dateien: [] })).toBe(false);
    expect(istSammelordner('Altbau', { ordner: ['Pläne 2019 neu'], dateien: ['Altbau.oap'] })).toBe(false);
    expect(istSammelordner('Altbau', { ordner: ['Pläne'], dateien: [] })).toBe(false);
    expect(istSammelordner('2026-099 Kita Anfrage', { ordner: ['00 Projekt'], dateien: [] })).toBe(false);
    expect(statusAusGruppe('Archiv/2024')).toBe('abgeschlossen');
    expect(statusAusGruppe('00 Akquise')).toBe('akquise');
    expect(statusAusGruppe('Wohnungsbau')).toBeUndefined();
    expect(statusAusGruppe(undefined)).toBeUndefined();
  });

  it('listet Projekte direkt im Stammordner und in Sammelordnern, verschachtelt; Projekte werden nicht weiter durchsucht', async () => {
    const fs = new SpeicherProjektordner();
    for (const p of [
      '2026-014 EFH Musterweg/00 Projekt',
      '2026-014 EFH Musterweg/01 Grundlagen',
      'SIS Sanierung ESG/04 Schriftverkehr',
      'Akquise/2026-099 Kita Anfrage/00 Projekt',
      'Archiv/2024/2024-003 Altbau/00 Projekt',
      'Archiv/2024/2024-003 Altbau/01 Grundlagen',
      'Archiv/2023-010 Halle/Pläne',
      'Wohnungsbau/2025-007 MFH Bahnhof/00 Projekt',
      'Wohnungsbau/2025-008 Reihenhäuser/02 Pläne',
    ])
      await fs.ordnerAnlegen('/p', p);
    await fs.dateiAnlegen('/p', 'Liste.xlsx', new Uint8Array([1]));
    const r = await projekteAuflisten(fs, ['/p']);
    expect(r.fehler).toEqual([]);
    expect(r.projekte.map((p) => [p.gruppe ?? '', p.name])).toEqual([
      ['', '2026-014 EFH Musterweg'],
      ['Akquise', '2026-099 Kita Anfrage'],
      ['Archiv', '2023-010 Halle'],
      ['Archiv/2024', '2024-003 Altbau'],
      ['', 'SIS Sanierung ESG'],
      ['Wohnungsbau', '2025-007 MFH Bahnhof'],
      ['Wohnungsbau', '2025-008 Reihenhäuser'],
    ]);
    expect(r.projekte.find((p) => p.name === '2024-003 Altbau')!.pfad).toBe('/p/Archiv/2024/2024-003 Altbau');
    // nicht lesbarer Stammordner
    const kaputt = { ...fs, liste: async () => Promise.reject(new Error('Zugriff verweigert')) } as unknown as SpeicherProjektordner;
    expect((await projekteAuflisten(kaputt, ['/x'])).fehler).toEqual([{ root: '/x', text: 'Zugriff verweigert' }]);
  });
});
