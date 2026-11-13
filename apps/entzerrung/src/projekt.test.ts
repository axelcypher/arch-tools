import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useEntz } from './store';

/**
 * Datenpfade ohne Oberfläche: Speichern (ungespeichert-Kennzeichen, kein Doppelspeichern), Zwischenspeicher in der
 * IndexedDB (Fotos für Rückgängig/Wiederholen bleiben, fehlende werden nachgetragen) und Öffnen mit Pfad.
 */

const datei = vi.hoisted(() => ({
  speichern: null as null | ((o: { build: () => Uint8Array; pfad: string | null }) => Promise<string | null>),
  oeffnen: null as null | (() => Promise<{ name: string; pfad: string | null; bytes: Uint8Array } | null>),
}));
vi.mock('@core/platform/files', async (original) => ({
  ...(await original<typeof import('@core/platform/files')>()),
  saveMergedFile: (o: { build: () => Uint8Array; pfad: string | null }) => datei.speichern!(o),
  openFileWithPath: () => datei.oeffnen!(),
}));

/** kleine IndexedDB-Attrappe: zwei Speicher, Ergebnisse asynchron wie im Browser */
function attrappe() {
  const daten: Record<string, Map<string, unknown>> = { stand: new Map(), fotos: new Map() };
  const anfrage = (f: () => unknown) => {
    const r: { result?: unknown } = {};
    r.result = f();
    return r;
  };
  const db = {
    createObjectStore: () => undefined,
    transaction: (store: string) => {
      const m = daten[store];
      const t: { oncomplete?: () => void; onerror?: () => void; objectStore: () => unknown } = {
        objectStore: () => ({
          put: (v: unknown, k: string) => anfrage(() => m.set(k, v)),
          get: (k: string) => anfrage(() => m.get(k)),
          getAllKeys: () => anfrage(() => [...m.keys()]),
          delete: (k: string) => anfrage(() => m.delete(k)),
        }),
      };
      setTimeout(() => t.oncomplete?.(), 0);
      return t;
    },
  };
  (globalThis as { indexedDB?: unknown }).indexedDB = {
    open: () => {
      const r: { result: unknown; onupgradeneeded?: () => void; onsuccess?: () => void } = { result: db };
      setTimeout(() => {
        r.onupgradeneeded?.();
        r.onsuccess?.();
      }, 0);
      return r;
    },
  };
  return daten;
}
const idb = attrappe();

const { speichern, verwendeteFotos, oeffnen } = await import('./projekt');
const { standSchreiben } = await import('./speicher');
const { packen } = await import('./datei');
const { mitEbene } = await import('./store');

const bytes = (n: number, v = 7) => new Uint8Array(n).fill(v);

beforeEach(() => {
  useEntz.getState().laden({ fotos: [] }, {}, null);
  idb.stand.clear();
  idb.fotos.clear();
});

describe('Speichern', () => {
  it('Änderung während des Speicherns bleibt als ungespeichert markiert', async () => {
    useEntz.getState().fotoHinzufuegen('f1', 'Süd', 'image/jpeg', 100, 80, bytes(5));
    let weiter: (v: string) => void = () => undefined;
    datei.speichern = (o) => {
      o.build();
      return new Promise((r) => (weiter = r));
    };
    const lauf = speichern();
    // zweiter Aufruf (Strg+S doppelt) wartet auf den ersten
    expect(speichern()).toBe(lauf);
    const { foto, ebene } = { foto: useEntz.getState().doc.fotos[0], ebene: useEntz.getState().doc.fotos[0].ebenen[0] };
    useEntz.getState().aendern(mitEbene(foto.id, ebene.id, (e) => ({ ...e, name: 'Nord' })));
    weiter('/Projekt/Süd.entz');
    expect(await lauf).toBe(true);
    expect(useEntz.getState().dateiname).toBe('/Projekt/Süd.entz');
    expect(useEntz.getState().dirty).toBe(true);
  });

  it('Gegenprobe: ohne Änderung ist danach alles gespeichert; der Pfad wird wiederverwendet', async () => {
    useEntz.getState().fotoHinzufuegen('f1', 'Süd', 'image/jpeg', 100, 80, bytes(5));
    const pfade: (string | null)[] = [];
    datei.speichern = async (o) => {
      pfade.push(o.pfad);
      o.build();
      return 'C:\\Projekt\\Süd.entz';
    };
    expect(await speichern()).toBe(true);
    expect(useEntz.getState().dirty).toBe(false);
    useEntz.getState().aendern((d) => ({ fotos: d.fotos.map((f) => ({ ...f, name: 'Ost' })) }));
    await speichern();
    expect(pfade).toEqual([null, 'C:\\Projekt\\Süd.entz']);
  });

  it('Öffnen über den Dateidialog übernimmt den Pfad (Speichern schreibt in dieselbe Datei)', async () => {
    const z = packen(
      { fotos: [{ ...useEntz.getState().doc.fotos[0], id: 'a1', name: 'Hof', mime: 'image/png', breite: 10, hoehe: 8, linse: { k1: 0, k2: 0 }, hilfslinien: [], ebenen: [] }] },
      { a1: bytes(4) },
    );
    datei.oeffnen = async () => ({ name: 'Hof.entz', pfad: 'C:\\Projekt\\Hof.entz', bytes: z });
    await oeffnen();
    expect(useEntz.getState().dateiname).toBe('C:\\Projekt\\Hof.entz');
    expect(useEntz.getState().doc.fotos[0].name).toBe('Hof');
    expect(idb.fotos.has('a1')).toBe(true);
  });
});

describe('Zwischenspeicher', () => {
  it('Foto entfernen, Rückgängig, Wiederholen: die Bilddaten bleiben erhalten', async () => {
    const s = useEntz.getState();
    s.fotoHinzufuegen('f1', 'Süd', 'image/jpeg', 100, 80, bytes(5, 1));
    s.fotoHinzufuegen('f2', 'Nord', 'image/jpeg', 100, 80, bytes(5, 2));
    const schreiben = async () => {
      const a = useEntz.getState();
      await standSchreiben({ doc: a.doc, dateiname: a.dateiname, dirty: a.dirty }, a.bilder, () => verwendeteFotos(useEntz.getState()));
    };
    await schreiben();
    expect([...idb.fotos.keys()].sort()).toEqual(['f1', 'f2']);
    // f2 entfernen: das Dokument braucht es nicht mehr, der Verlauf schon
    useEntz.getState().aendern((d) => ({ fotos: d.fotos.filter((f) => f.id !== 'f2') }));
    await schreiben();
    expect(idb.fotos.has('f2')).toBe(true);
    useEntz.getState().rueckgaengig();
    await schreiben();
    useEntz.getState().wiederholen();
    useEntz.getState().rueckgaengig();
    await schreiben();
    expect(idb.fotos.get('f2')).toEqual(bytes(5, 2));
    // Gegenprobe: nach „Neu“ (Verlauf leer) wird aufgeräumt
    useEntz.getState().laden({ fotos: [] }, {}, null);
    await schreiben();
    expect(idb.fotos.size).toBe(0);
  });

  it('fehlende Bilddaten des Dokuments werden nachgetragen', async () => {
    useEntz.getState().fotoHinzufuegen('f1', 'Süd', 'image/jpeg', 100, 80, bytes(5, 3));
    expect(idb.fotos.size).toBe(0);
    const a = useEntz.getState();
    await standSchreiben({ doc: a.doc, dateiname: null, dirty: true }, a.bilder);
    expect(idb.fotos.get('f1')).toEqual(bytes(5, 3));
    expect((idb.stand.get('stand') as { doc: { fotos: unknown[] } }).doc.fotos).toHaveLength(1);
  });
});
