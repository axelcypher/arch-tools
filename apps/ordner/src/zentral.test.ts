// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';

/** ATLAS und die zentralen Einstellungen: Änderungsmeldungen laden neu, ohne eigene, noch nicht geschriebene Änderungen zu verlieren */

beforeEach(() => {
  vi.resetModules();
  localStorage.clear();
});

const roh = (bereich: string) => JSON.parse(localStorage.getItem(`arch-tools:konfig:${bereich}`) ?? 'null') as Record<string, unknown> | null;

describe('ATLAS: zentrale Änderungen', () => {
  it('eine Meldung während des Entprellens verliert die eigene Struktur-Änderung nicht', async () => {
    const { useOrdner, SPEICHERN_NACH_MS } = await import('./store');
    const { konfigGeaendertMelden } = await import('@core/platform/konfig');
    await useOrdner.getState().konfigLaden();
    vi.useFakeTimers();
    try {
      const s = useOrdner.getState();
      s.setStruktur({ ...s.struktur, ordner: [...s.struktur.ordner, { pfad: '10 Neu' }] });
      konfigGeaendertMelden(['allgemein']);
      konfigGeaendertMelden(['projektordner']);
      await vi.advanceTimersByTimeAsync(SPEICHERN_NACH_MS + 50);
    } finally {
      vi.useRealTimers();
    }
    await vi.waitFor(() => expect(useOrdner.getState().struktur.ordner.map((o) => o.pfad)).toContain('10 Neu'));
    const gespeichert = roh('projektordner')!.struktur as { ordner: { pfad: string }[] };
    expect(gespeichert.ordner.map((o) => o.pfad)).toContain('10 Neu');
  });

  it('eine zentrale Änderung der Namen bzw. gemeinsamen Angaben kommt an', async () => {
    const { useOrdner } = await import('./store');
    const { pfadSpeichern } = await import('@core/einstellungen/pfade');
    await useOrdner.getState().konfigLaden();
    await pfadSpeichern('projekt.ordnername', '{PROJEKT_KUERZEL}_{PROJEKT_KURZNAME}');
    await pfadSpeichern('ablage.fotoordner', 'Bilder');
    await vi.waitFor(() => expect(useOrdner.getState().struktur.ordnername).toBe('{PROJEKT_KUERZEL}_{PROJEKT_KURZNAME}'));
    await vi.waitFor(() => expect(useOrdner.getState().allgemein.fotoordner).toBe('Bilder'));
    // die übrige Struktur blieb, die Konflikterkennung kennt den neuen Stand
    expect(useOrdner.getState().konflikt).toBeNull();
    expect(useOrdner.getState().struktur.ordner.length).toBeGreaterThan(5);
  });
});
