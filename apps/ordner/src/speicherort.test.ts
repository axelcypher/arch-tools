// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { attrappe, BASIS, installieren, KOPIE, legeAn, lies, NAS } from '@core/__fixtures__/konfigAttrappe';

/** ATLAS und der Speicherort der Einstellungen: Notbetrieb ohne Schreiben, Neuladen nach einem Wechsel */

beforeEach(() => {
  vi.resetModules();
  installieren();
  localStorage.clear();
});

/** frischer Store und frischer Kern (der Ort wird je Sitzung zwischengespeichert) */
async function laden() {
  const { useOrdner } = await import('./store');
  const konfig = await import('@core/platform/konfig');
  return { useOrdner, konfig };
}

describe('ATLAS: Speicherort der Einstellungen', () => {
  it('Notbetrieb ohne Einstellungen in der Kopie: Vorgaben gelten, nichts wird geschrieben', async () => {
    legeAn(`${BASIS}/konfig.json`, { modus: 'netzwerk', ordner: NAS });
    attrappe.nasErreichbar = false;
    const { useOrdner } = await laden();
    await useOrdner.getState().konfigLaden();
    const s = useOrdner.getState();
    expect(s.geladen).toBe(true);
    expect(s.konfig?.notbetrieb).toBe(true);
    expect(s.konfigFehler).toBeNull();
    expect(attrappe.aufrufe).not.toContain('write_binary_file');
    expect(attrappe.aufrufe).not.toContain('konfig_schreiben_wenn');
    expect([...attrappe.dateien.keys()].some((p) => p.startsWith(KOPIE) || p.startsWith(NAS))).toBe(false);
  });

  it('Gegenprobe: erreichbar legt die fehlenden Einstellungen beim ersten Start an', async () => {
    legeAn(`${BASIS}/konfig.json`, { modus: 'netzwerk', ordner: NAS });
    attrappe.dateien.set(`${NAS}/.platzhalter`, '');
    const { useOrdner } = await laden();
    await useOrdner.getState().konfigLaden();
    expect(lies(`${NAS}/allgemein.json`)).toBeTruthy();
    expect(lies(`${NAS}/projektordner.json`)).toMatchObject({ struktur: expect.any(Object) });
  });

  it('erster Start: legt ein anderer Rechner die Struktur zugleich an, gilt seine', async () => {
    attrappe.dazwischen = (pfad) => {
      if (pfad.endsWith('projektordner.json') && !attrappe.dateien.has(pfad)) legeAn(pfad, { struktur: { name: 'Vom anderen Rechner', ordner: [] }, vorlagenordner: 'X:/Vorlagen' });
    };
    const { useOrdner } = await laden();
    await useOrdner.getState().konfigLaden();
    expect(useOrdner.getState().vorlagenordner).toBe('X:/Vorlagen');
    expect(lies(`${BASIS}/projektordner.json`)).toMatchObject({ vorlagenordner: 'X:/Vorlagen' });
  });

  it('nach einem Wechsel liest ATLAS genau einmal neu und zeigt den Stand am neuen Ort; Ausstehendes wird vorher gespeichert', async () => {
    legeAn(`${BASIS}/allgemein.json`, { projekte: ['/lokal'] });
    legeAn(`${BASIS}/projektordner.json`, { struktur: { name: 'Lokal', ordner: [] }, vorlagenordner: '' });
    legeAn(`${NAS}/allgemein.json`, { projekte: ['/buero'] });
    const { useOrdner, konfig } = await laden();
    await useOrdner.getState().konfigLaden();
    expect(useOrdner.getState().allgemein.projekte).toEqual(['/lokal']);
    // noch nicht gespeicherte Änderung (entprellt)
    useOrdner.getState().setVorlagenordner('L:/Vorlagen');
    const neuLaden = vi.fn(useOrdner.getState().konfigLaden);
    useOrdner.setState({ konfigLaden: neuLaden });
    await konfig.konfigOrtWechseln({ modus: 'netzwerk', ordner: NAS }, 'uebernehmen');
    expect(lies(`${NAS}/projektordner.json`)).toMatchObject({ vorlagenordner: 'L:/Vorlagen' });
    await vi.waitFor(() => expect(useOrdner.getState().allgemein.projekte).toEqual(['/buero']));
    expect(useOrdner.getState().konfig?.ordner).toBe(NAS);
    await new Promise((r) => setTimeout(r, 20));
    expect(neuLaden).toHaveBeenCalledTimes(1);
  });
});
