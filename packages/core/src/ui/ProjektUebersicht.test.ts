import { describe, expect, it } from 'vitest';
import type { UebersichtProjekt } from './ProjektUebersicht';
import { nachStatus, quellenName, sortiert, wann } from './ProjektUebersicht';
import { ausOrdnernameMit, ausOrdnernameNachSchema } from './projektListe';

describe('Zeitangaben auf den Projektkarten', () => {
  it('heute mit Uhrzeit, gestern, vor einigen Tagen, sonst das Datum', () => {
    const jetzt = new Date(2026, 10, 10, 15, 0).getTime();
    expect(wann(new Date(2026, 10, 10, 9, 5).getTime(), jetzt)).toBe('heute 09:05');
    expect(wann(new Date(2026, 10, 9, 23, 0).getTime(), jetzt)).toBe('gestern');
    expect(wann(new Date(2026, 10, 7, 12, 0).getTime(), jetzt)).toBe('vor 3 Tagen');
    expect(wann(new Date(2026, 9, 1, 12, 0).getTime(), jetzt)).toBe('01.10.2026');
  });
});

describe('Sortierung, Statusfilter, Ableitung aus dem Ordnernamen (P-09, P-15)', () => {
  const p = (kuerzel: string, titel: string, geaendert: number, projektStatus?: UebersichtProjekt['projektStatus']): UebersichtProjekt => ({
    schluessel: kuerzel,
    gruppe: 'g',
    kuerzel,
    titel,
    geaendert,
    ...(projektStatus ? { projektStatus } : {}),
  });
  const liste = [p('2026-002', 'Kita', 300), p('2026-010', 'Anbau', 100, 'abgeschlossen'), p('2025-099', 'Zentrum', 200, 'akquise')];
  it('nach Nummer (neueste zuerst), zuletzt geändert, Titel; Vorgabe lässt die Reihenfolge', () => {
    expect(sortiert(liste, 'nummer').map((x) => x.kuerzel)).toEqual(['2026-010', '2026-002', '2025-099']);
    expect(sortiert(liste, 'geaendert').map((x) => x.kuerzel)).toEqual(['2026-002', '2025-099', '2026-010']);
    expect(sortiert(liste, 'name').map((x) => x.titel)).toEqual(['Anbau', 'Kita', 'Zentrum']);
    expect(sortiert(liste, 'vorgabe')).toBe(liste);
  });
  it('abgeschlossene Projekte sind standardmäßig ausgeblendet, per Filter sichtbar; ohne Status gilt aktiv', () => {
    expect(nachStatus(liste, 'offen').map((x) => x.kuerzel)).toEqual(['2026-002', '2025-099']);
    expect(nachStatus(liste, 'abgeschlossen').map((x) => x.kuerzel)).toEqual(['2026-010']);
    expect(nachStatus(liste, 'aktiv').map((x) => x.kuerzel)).toEqual(['2026-002']);
    expect(nachStatus(liste, 'alle')).toHaveLength(3);
  });
  it('Nummer und Kurzname nach dem Schema der Struktur – in allen Apps gleich', () => {
    expect(ausOrdnernameNachSchema('{nummer} {kurzname}', '2026-014 EFH Musterweg')).toEqual({ nummer: '2026-014', kurzname: 'EFH Musterweg' });
    expect(ausOrdnernameNachSchema('{kurzname}_{nummer}', 'EFH Musterweg_2026-014')).toEqual({ nummer: '2026-014', kurzname: 'EFH Musterweg' });
    expect(ausOrdnernameMit('{kurzname}_{nummer}')('EFH_2026-014')).toEqual({ nummer: '2026-014', kurzname: 'EFH' });
    // passt nicht bzw. ohne Schema: bis zum ersten Leerzeichen die Nummer
    expect(ausOrdnernameMit('{kurzname}_{nummer}')('2026-014 EFH')).toEqual({ nummer: '2026-014', kurzname: 'EFH' });
    expect(ausOrdnernameMit(undefined)('2026-014 EFH')).toEqual({ nummer: '2026-014', kurzname: 'EFH' });
  });
});

describe('Name einer Quelle', () => {
  it('der Ordnername, bei gleichen Namen mit dem übergeordneten Ordner', () => {
    expect(quellenName('C:/FORMA', ['C:/FORMA', 'D:/Archiv'])).toBe('FORMA');
    expect(quellenName('Z:\\Akquise\\FORMA', ['C:/FORMA', 'Z:\\Akquise\\FORMA'])).toBe('Akquise/FORMA');
    expect(quellenName('C:/FORMA', ['C:/FORMA', 'Z:/Akquise/forma'])).toBe('C:/FORMA');
  });
});
