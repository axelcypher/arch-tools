import { describe, expect, it } from 'vitest';
import type { UebersichtProjekt } from './ProjektUebersicht';
import { antragMarke, nachStatus, quellenName, sortiert, wann } from './ProjektUebersicht';
import { antragKurzAus, parseProjectData } from '../serialize';
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

describe('aktuellster Antrag auf der Karte (meta.antrag)', () => {
  it('liest meta.antrag robust und zeigt „eingereicht“ als grüne Marke', () => {
    expect(antragKurzAus(null)).toBeNull();
    expect(antragKurzAus({ name: ' ' })).toBeNull();
    expect(antragKurzAus({ name: 'BAUA 2', angelegt: '11.11.2026', eingereicht: { datei: 'x.pdf', datum: 'gestern' } })).toEqual({ name: 'BAUA 2' });
    const a = antragKurzAus({ name: 'BAUA 2', angelegt: '2026-10-01', eingereicht: { datei: 'Eingangsbestätigung.pdf', datum: '2026-11-03' } })!;
    expect(antragMarke(a)).toMatchObject({ text: 'BAUA 2 · eingereicht 03.11.2026', art: 'ok' });
    // von Hand gesetzt: ohne Datei
    const m = antragKurzAus({ name: 'BAUA', eingereicht: { datum: '2026-11-04', manuell: true } })!;
    expect(m).toEqual({ name: 'BAUA', eingereicht: { datum: '2026-11-04', manuell: true } });
    expect(antragMarke(m)).toMatchObject({ text: 'BAUA · eingereicht 04.11.2026', art: 'ok', titel: 'Antrag BAUA eingereicht – von Hand gesetzt' });
    expect(antragKurzAus({ name: 'BAUA', eingereicht: { datum: '2026-11-04' } })).toEqual({ name: 'BAUA' });
    expect(antragMarke({ name: 'BAUVA', angelegt: '2026-10-01' })).toMatchObject({ text: 'BAUVA in Arbeit', art: 'neutral', titel: expect.stringContaining('01.10.2026') });
    // bleibt beim Lesen der Projektdatei erhalten
    const p = parseProjectData({ format: 'arch-flaechen-tool', version: 1, name: 'X', meta: { projektcode: 'BS9', antrag: { name: 'BAUA', eingereicht: { datei: 'Antragsprotokoll.pdf', datum: '2026-11-03' } } }, storeys: [] });
    expect(p.meta.antrag).toEqual({ name: 'BAUA', eingereicht: { datei: 'Antragsprotokoll.pdf', datum: '2026-11-03' } });
  });
});
