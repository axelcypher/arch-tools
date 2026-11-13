// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BASIS, installieren, legeAn, lies, NAS } from '@core/__fixtures__/konfigAttrappe';

/** FABRIO und der Speicherort der Einstellungen: nach einem Wechsel nicht mit dem alten Stand überschreiben, mehrere Rechner */

beforeEach(() => {
  vi.resetModules();
  installieren();
  localStorage.clear();
});

async function laden() {
  const { useAva } = await import('./store');
  const konfig = await import('@core/platform/konfig');
  return { useAva, konfig };
}

describe('FABRIO: Speicherort der Einstellungen', () => {
  it('Wechsel mit „übernehmen“: die Einstellungen am Ziel gelten, Speichern danach überschreibt sie nicht mit dem alten Stand', async () => {
    legeAn(`${BASIS}/ava.json`, { mail: { vorlagen: [{ name: 'Lokal', betreff: '', text: '' }] } });
    legeAn(`${NAS}/ava.json`, { mail: { vorlagen: [{ name: 'Büro', betreff: '', text: '' }] } });
    const { useAva, konfig } = await laden();
    await useAva.getState().einstellungenLaden();
    expect(useAva.getState().einstellungen.mail.vorlagen.map((v) => v.name)).toEqual(['Lokal']);
    await konfig.konfigOrtWechseln({ modus: 'netzwerk', ordner: NAS }, 'uebernehmen');
    await vi.waitFor(() => expect(useAva.getState().einstellungen.mail.vorlagen.map((v) => v.name)).toEqual(['Büro']));
    const e = useAva.getState().einstellungen;
    await useAva.getState().einstellungenSetzen({ ...e, scan: { ...e.scan, ordner: 'S:/Scans' } });
    expect(lies(`${NAS}/ava.json`)).toMatchObject({ mail: { vorlagen: [{ name: 'Büro' }] }, scan: { ordner: 'S:/Scans' } });
  });

  it('ein anderer Rechner hat inzwischen gespeichert: nichts überschrieben, Meldung, der neue Stand wird geladen', async () => {
    legeAn(`${BASIS}/konfig.json`, { modus: 'netzwerk', ordner: NAS });
    legeAn(`${NAS}/ava.json`, { scan: { ordner: 'A' } });
    const { useAva } = await laden();
    await useAva.getState().einstellungenLaden();
    legeAn(`${NAS}/ava.json`, { scan: { ordner: 'B' } });
    const e = useAva.getState().einstellungen;
    await expect(useAva.getState().einstellungenSetzen({ ...e, scan: { ...e.scan, ordner: 'C' } })).rejects.toThrow('anderen Rechner');
    expect(lies(`${NAS}/ava.json`)).toEqual({ scan: { ordner: 'B' } });
    expect(useAva.getState().einstellungen.scan.ordner).toBe('B');
    // Gegenprobe: mit dem neuen Stand gelingt es
    await useAva.getState().einstellungenSetzen({ ...useAva.getState().einstellungen, scan: { ...useAva.getState().einstellungen.scan, ordner: 'C' } });
    expect(lies(`${NAS}/ava.json`)).toMatchObject({ scan: { ordner: 'C' } });
  });
});
