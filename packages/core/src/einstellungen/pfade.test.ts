// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';

/** Zugriff der Apps: Lesen, Speichern (im gemeinsamen Speicher, hier der Browser-Speicher), Änderungsmeldung, Export */

const roh = (bereich: string) => JSON.parse(localStorage.getItem(`arch-tools:konfig:${bereich}`) ?? 'null') as Record<string, unknown> | null;
const setze = (bereich: string, wert: unknown) => localStorage.setItem(`arch-tools:konfig:${bereich}`, JSON.stringify(wert));

beforeEach(() => {
  localStorage.clear();
  vi.resetModules();
});

describe('pfade', () => {
  it('liest bisherige Werte, speichert unter ihrem Schlüssel und meldet die Änderung allen Beobachtern', async () => {
    setze('allgemein', { oapPfad: 'Organisation/{PROJEKT_KUERZEL}.oap', buero: 'Muster' });
    setze('projektordner', { struktur: { ordnername: '{PROJEKT_KUERZEL}', ordner: [] } });
    const p = await import('./pfade');
    const { konfigBeobachten } = await import('../platform/konfig');
    expect(await p.pfadWertLesen('projekt.oapPfad')).toBe('Organisation/{PROJEKT_KUERZEL}.oap');
    expect(p.pfadWert('ablage.fotoordner')).toBe('09 Fotos');
    const gemeldet: string[] = [];
    konfigBeobachten('allgemein', () => gemeldet.push('allgemein'));
    konfigBeobachten('projektordner', () => gemeldet.push('projektordner'));

    await p.pfadSpeichern('projekt.ordnername', '{PROJEKT_KUERZEL}_{PROJEKT_KURZNAME}');
    expect(roh('projektordner')).toEqual({ struktur: { ordnername: '{PROJEKT_KUERZEL}_{PROJEKT_KURZNAME}', ordner: [] } });
    // gespiegelt für alle Apps; übrige gemeinsame Angaben bleiben
    expect(roh('allgemein')).toEqual({ oapPfad: 'Organisation/{PROJEKT_KUERZEL}.oap', buero: 'Muster', ordnerSchema: '{PROJEKT_KUERZEL}_{PROJEKT_KURZNAME}' });
    expect(gemeldet).toEqual(['projektordner', 'allgemein']);
    expect(p.pfadWert('projekt.ordnername')).toBe('{PROJEKT_KUERZEL}_{PROJEKT_KURZNAME}');

    // neue Einstellung: unter pfade; gleich der Vorgabe bzw. „Vorgabe wiederherstellen“ = kein Eintrag
    await p.pfadSpeichern('export.pdfMitspeichern', false);
    expect((roh('allgemein')!.pfade as Record<string, unknown>)['export.pdfMitspeichern']).toBe(false);
    await p.pfadSpeichern('export.pdfMitspeichern', true);
    expect(roh('allgemein')!.pfade).toEqual({});
    await p.pfadSpeichern('export.excel.kosten', '  {PROJEKT_KUERZEL} Kosten  ');
    expect(p.pfadWert('export.excel.kosten')).toBe('{PROJEKT_KUERZEL} Kosten');
    await p.pfadSpeichern('export.excel.kosten', undefined);
    expect(p.pfadWert('export.excel.kosten')).toBe('{PROJEKT_KUERZEL} {DATUM} {Inhalt}');
  });

  it('Export: Einstellungen je App, Berechnungsordner und Dateiname aus den Vorlagen', async () => {
    setze('allgemein', { pfade: { 'export.berechnungsordner.grz': '03 Berechnungen/{PROJEKT_KUERZEL} GRZ', 'export.pdfMitspeichern': false } });
    const p = await import('./pfade');
    expect(await p.exportPfadeLaden('grz')).toEqual({
      berechnungsordner: '03 Berechnungen/{PROJEKT_KUERZEL} GRZ',
      dateinameExcel: '{PROJEKT_KUERZEL} {DATUM} {Inhalt}',
      dateinamePdf: '{PROJEKT_KUERZEL} {DATUM} {Inhalt}',
      pdfMitspeichern: false,
    });
    expect(p.exportPfade('kosten')).toMatchObject({ berechnungsordner: '03 Berechnungen/Kosten', pdfMitspeichern: false });
    const werte = { projektcode: 'BS9', kurzname: 'EFH/Musterweg', datum: new Date(2026, 10, 13) };
    expect(p.berechnungsordnerPfad('03 Berechnungen/{PROJEKT_KUERZEL} {PROJEKT_KURZNAME}', 'P:\\BS9 EFH', werte)).toBe('P:\\BS9 EFH\\03 Berechnungen\\BS9 EFH Musterweg');
    expect(p.berechnungsordnerPfad('../../{PROJEKT_KUERZEL}', '/srv/BS9', werte)).toBe('/srv/BS9/BS9');
    expect(p.berechnungsordnerPfad('03 Berechnungen', null, werte)).toBeNull();
    expect(p.exportDateinameAusMuster('{PROJEKT_KUERZEL} {DATUM} {Inhalt}', { werte, inhalt: 'Flächenaufstellung', endung: 'xlsx' })).toBe('BS9 261113 Flächenaufstellung.xlsx');
    expect(p.exportDateinameAusMuster('{PROJEKT_KURZNAME}', { werte, inhalt: 'X', endung: 'pdf' })).toBe('EFH Musterweg.pdf');
    // leer bleibt nie: dann der Inhalt
    expect(p.exportDateinameAusMuster('{BEARBEITER}', { werte, inhalt: 'GRZ-Nachweis', endung: 'pdf' })).toBe('GRZ-Nachweis.pdf');
  });

  it('PERMIO sucht Berechnungen in den Berechnungsordnern der Rechen-Apps und in den zusätzlichen – ohne doppelte', async () => {
    setze('allgemein', { pfade: { 'ablage.permio.berechnungsordner': ['Statik', '03 berechnungen/kosten'] } });
    const p = await import('./pfade');
    await p.pfadWerteLaden();
    expect(p.berechnungenSuchordner()).toEqual(['03 Berechnungen/Flächen', '03 Berechnungen/Nachweise', '03 Berechnungen/Kosten', 'Statik']);
  });

  it('Übernahme alter PERMIO-Werte je Rechner nur einmal: „Vorgabe wiederherstellen“ bleibt bestehen', async () => {
    localStorage.setItem('formulare:export', JSON.stringify({ antragsordner: 'Anträge' }));
    const p = await import('./pfade');
    const { pfadeUebernehmen } = await import('./uebernahme');
    expect(await pfadeUebernehmen()).toEqual([]);
    expect(await p.pfadWertLesen('ablage.permio.antragsordner')).toBe('Anträge');
    await p.pfadSpeichern('ablage.permio.antragsordner', undefined);
    expect(await pfadeUebernehmen()).toEqual([]);
    expect(await p.pfadWertLesen('ablage.permio.antragsordner')).toBe('TÖB');
    // der alte Eintrag bleibt unverändert
    expect(JSON.parse(localStorage.getItem('formulare:export')!)).toEqual({ antragsordner: 'Anträge' });
  });

  it('ein anderes Fenster ändert eine Einstellung: neu lesen', async () => {
    const p = await import('./pfade');
    await p.pfadWerteLaden();
    const f = vi.fn();
    p.pfadeAbonnieren(f);
    setze('allgemein', { fotoordner: 'Bilder' });
    window.dispatchEvent(new StorageEvent('storage', { key: 'arch-tools:konfig-geaendert', newValue: JSON.stringify({ bereiche: ['allgemein'] }) }));
    await vi.waitFor(() => expect(p.pfadWert('ablage.fotoordner')).toBe('Bilder'));
    expect(f).toHaveBeenCalled();
  });
});
