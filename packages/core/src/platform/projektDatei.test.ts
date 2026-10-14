import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readProjectFile, writeArchive } from '../archive';
import type { Project } from '../model';
import { createProject } from '../model';

/** Speicherziel nachbilden: Dialog (pfad null) liefert „gewaehlt“, sonst wird direkt geschrieben */
const platte = new Map<string, Uint8Array>();
let gewaehlt: string | null = 'C:/Neu/Gewählt.oap';
const aufrufe: { pfad: string | null; defaultName: string; defaultDir: string | null | undefined }[] = [];
vi.mock('./files', async (orig) => ({
  ...(await orig<typeof import('./files')>()),
  saveMergedFile: vi.fn(async (o: { pfad?: string | null; defaultName: string; defaultDir?: string | null; build: (v: Uint8Array | null) => Uint8Array }) => {
    aufrufe.push({ pfad: o.pfad ?? null, defaultName: o.defaultName, defaultDir: o.defaultDir });
    const ziel = o.pfad ?? gewaehlt;
    if (!ziel) return null;
    // langsames Schreiben: ein zweites Speichern in dieser Zeit muss abgewiesen werden
    await new Promise((r) => setTimeout(r, 5));
    platte.set(ziel, o.build(platte.get(ziel) ?? null));
    return ziel;
  }),
}));

const { exportDateiname, projektSpeichern, standNachSpeichern } = await import('./projektDatei');

beforeEach(() => {
  platte.clear();
  aufrufe.length = 0;
  gewaehlt = 'C:/Neu/Gewählt.oap';
});

describe('Speichern', () => {
  it('„Speichern“ schreibt ohne Dialog in die geöffnete Datei und behält ihren Namen', async () => {
    const p = createProject('Projektname');
    platte.set('C:/Projekte/Haus Müller.oap', writeArchive(p, { app: 'test' }));
    const r = await projektSpeichern({ project: p, basis: p, datei: 'C:/Projekte/Haus Müller.oap', app: 'test' });
    expect(r?.datei).toBe('C:/Projekte/Haus Müller.oap');
    expect(aufrufe[0].pfad).toBe('C:/Projekte/Haus Müller.oap');
  });

  it('„Speichern unter“ fragt immer – Vorschlag: bisheriger Dateiname im bisherigen Ordner', async () => {
    const p = createProject('Projektname');
    const r = await projektSpeichern({ project: p, basis: p, datei: 'C:/Projekte/Haus Müller.oap', unter: true, app: 'test' });
    expect(aufrufe[0]).toEqual({ pfad: null, defaultName: 'Haus Müller.oap', defaultDir: 'C:/Projekte' });
    expect(r?.datei).toBe('C:/Neu/Gewählt.oap');
  });

  it('ein neues Projekt (ohne Basis, z. B. aus einer IFC) fragt nach, statt eine Datei gleichen Namens zu überschreiben', async () => {
    const p = createProject('Haus');
    await projektSpeichern({ project: p, basis: null, datei: 'C:/IFC/Haus.oap', app: 'test' });
    expect(aufrufe[0].pfad).toBeNull();
    expect(aufrufe[0].defaultName).toBe('Haus.oap');
  });

  it('übernimmt Änderungen einer anderen App aus der Datei', async () => {
    const basis = createProject('Haus');
    const andere: Project = { ...structuredClone(basis), massNutzung: { grz: 0.4 } };
    platte.set('C:/P/Haus.oap', writeArchive(andere, { app: 'grz' }));
    const eigen = { ...basis, name: 'Haus Müller' };
    const r = await projektSpeichern({ project: eigen, basis, datei: 'C:/P/Haus.oap', app: 'test' });
    expect(r?.zusammengefuehrt).toBe(true);
    const aufPlatte = readProjectFile(platte.get('C:/P/Haus.oap')!);
    expect(aufPlatte.name).toBe('Haus Müller');
    expect(aufPlatte.massNutzung).toEqual({ grz: 0.4 });
  });

  it('ein zweites Speichern während des ersten wird abgewiesen', async () => {
    const p = createProject('Haus');
    const [a, b] = await Promise.all([
      projektSpeichern({ project: p, basis: p, datei: 'C:/P/Haus.oap', app: 'test' }),
      projektSpeichern({ project: p, basis: p, datei: 'C:/P/Haus.oap', app: 'test' }),
    ]);
    expect(a?.datei).toBe('C:/P/Haus.oap');
    expect(b).toBeNull();
    expect(aufrufe).toHaveLength(1);
  });
});

describe('Stand nach dem Speichern', () => {
  it('weitergearbeitet: eigene Änderung bleibt, Änderung aus der Datei kommt hinzu, ungespeichert', () => {
    const vorher = createProject('Haus');
    const aktuell = { ...vorher, name: 'Haus Müller' };
    const gespeichert = { ...vorher, massNutzung: { grz: 0.3 } };
    const n = standNachSpeichern(aktuell, vorher, gespeichert);
    expect(n.dirty).toBe(true);
    expect(n.project.name).toBe('Haus Müller');
    expect(n.project.massNutzung).toEqual({ grz: 0.3 });
  });
});

describe('Exportnamen', () => {
  it('Dateiname der Projektdatei + Zusatz, ohne Projektdatei der Projektname', () => {
    expect(exportDateiname({ datei: 'C:/Projekte/Haus Müller.oap', projektName: 'X', zusatz: 'WoFl+BGF+BRI', endung: 'xlsx' })).toBe('Haus Müller WoFl+BGF+BRI.xlsx');
    expect(exportDateiname({ datei: null, projektName: 'Haus: Müller', zusatz: 'GRZ+GFZ', endung: 'pdf' })).toBe('Haus_ Müller GRZ+GFZ.pdf');
    expect(exportDateiname({ datei: 'Haus.oap', projektName: 'X', zusatz: 'Kosten Kostenberechnung', endung: 'xlsx' })).toBe('Haus Kosten Kostenberechnung.xlsx');
  });
});

describe('Speichern mit Ergänzungen für die Datei', () => {
  it('die beim letzten Speichern ergänzte Vorlage gilt nicht als Änderung einer anderen App', async () => {
    const { addDatei } = await import('../model');
    const mitVorlage = (p: Project) => (p.dateien?.some((d) => d.art === 'vorlage') ? p : addDatei(p, 'Vorlage.xlsx', 'vorlage', new Uint8Array([80, 75])).project);
    const p = createProject('Haus');
    const r1 = await projektSpeichern({ project: p, basis: p, datei: 'C:/P/Haus.oap', app: 'test', fuerDatei: mitVorlage });
    expect(r1?.zusammengefuehrt).toBe(false);
    const r2 = await projektSpeichern({ project: r1!.project, basis: r1!.project, datei: 'C:/P/Haus.oap', app: 'test', fuerDatei: mitVorlage });
    expect(r2?.zusammengefuehrt).toBe(false);
    expect(r2?.project).toBe(r1!.project);
    // die Datei enthält die Vorlage weiterhin
    expect(readProjectFile(platte.get('C:/P/Haus.oap')!).dateien?.some((d) => d.art === 'vorlage')).toBe(true);
  });
});
