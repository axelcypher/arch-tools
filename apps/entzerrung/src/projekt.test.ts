import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useEntz } from './store';

/**
 * Datenpfade ohne Oberfläche: Speichern (ungespeichert-Kennzeichen, kein Doppelspeichern), Zwischenspeicher in der
 * IndexedDB (Fotos für Rückgängig/Wiederholen bleiben, fehlende werden nachgetragen) und Öffnen mit Pfad.
 */

type SpeicherOptionen = { build: () => Uint8Array; pfad: string | null; vorhandenLesen?: boolean; stand?: { groesse: number; geaendert: number } | null; defaultName: string };
const datei = vi.hoisted(() => ({
  speichern: null as null | ((o: SpeicherOptionen) => Promise<string | null>),
  oeffnen: null as null | (() => Promise<{ name: string; pfad: string | null; bytes: Uint8Array } | null>),
  /** Stand je Pfad für dateiStandLesen */
  staende: new Map<string, { groesse: number; geaendert: number } | null>(),
  /** Antwort auf die Rückfrage nach abgelehntem Speichern */
  antwort: null as string | null,
  fragen: [] as string[],
  meldungen: [] as string[],
  /** Antworten der Reihe nach (überschreibt `antwort`, solange welche da sind) */
  antworten: [] as string[],
  knoepfe: [] as string[][],
  tauri: false,
  gezeigt: [] as string[],
}));
vi.mock('@core/platform/files', async (original) => ({
  ...(await original<typeof import('@core/platform/files')>()),
  saveMergedFile: (o: SpeicherOptionen) => datei.speichern!(o),
  isTauri: () => datei.tauri,
  openFileWithPath: () => datei.oeffnen!(),
}));
vi.mock('@core/platform/projektordner', async (original) => ({
  ...(await original<typeof import('@core/platform/projektordner')>()),
  ordnerZeigen: async (p: string) => void datei.gezeigt.push(p),
}));
vi.mock('./dateistand', () => ({ dateiStandLesen: async (p: string) => (datei.staende.has(p) ? datei.staende.get(p) : undefined) }));
vi.mock('@core/ui/Rueckfrage', async (original) => ({
  ...(await original<typeof import('@core/ui/Rueckfrage')>()),
  fragen: async (f: { titel: string; knoepfe: { id: string }[] }) => {
    datei.fragen.push(f.titel);
    datei.knoepfe.push(f.knoepfe.map((k) => k.id));
    return datei.antworten.length ? datei.antworten.shift()! : datei.antwort;
  },
  meldung: async (titel: string, text: string) => {
    datei.meldungen.push(`${titel}|${text}`);
  },
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

const { speichern, verwendeteFotos, oeffnen, fotoImProjektOeffnen, fotosHinzufuegen } = await import('./projekt');
const { SpeicherProjektordner } = await import('@core/platform/projektordner');
const { DateiVonAussenGeaendert } = await import('@core/platform/files');
const { standSchreiben } = await import('./speicher');
const { packen } = await import('./datei');
const { mitEbene } = await import('./store');

const bytes = (n: number, v = 7) => new Uint8Array(n).fill(v);

beforeEach(() => {
  useEntz.getState().laden({ fotos: [] }, {}, null);
  datei.staende.clear();
  datei.fragen = [];
  datei.meldungen = [];
  datei.antworten = [];
  datei.knoepfe = [];
  datei.tauri = false;
  datei.gezeigt = [];
  datei.antwort = null;
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

describe('Datei von außen geändert', () => {
  const geoeffnet = () => {
    const z = packen({ fotos: [{ id: 'a1', name: 'Hof', mime: 'image/png', breite: 10, hoehe: 8, linse: { k1: 0, k2: 0 }, hilfslinien: [], ebenen: [] }] }, { a1: bytes(4) });
    datei.oeffnen = async () => ({ name: 'Hof.entz', pfad: 'C:\\Projekt\\Hof.entz', bytes: z });
    datei.staende.set('C:\\Projekt\\Hof.entz', { groesse: 100, geaendert: 1 });
    return oeffnen();
  };

  it('Speichern ohne Dialog prüft den Stand vom Öffnen und liest die alte Datei nicht', async () => {
    await geoeffnet();
    expect(useEntz.getState().dateiStand).toEqual({ groesse: 100, geaendert: 1 });
    const optionen: SpeicherOptionen[] = [];
    datei.speichern = async (o) => {
      optionen.push(o);
      o.build();
      datei.staende.set('C:\\Projekt\\Hof.entz', { groesse: 120, geaendert: 2 });
      return 'C:\\Projekt\\Hof.entz';
    };
    useEntz.getState().aendern((d) => ({ fotos: d.fotos.map((f) => ({ ...f, name: 'Ost' })) }));
    expect(await speichern()).toBe(true);
    expect(optionen[0]).toMatchObject({ pfad: 'C:\\Projekt\\Hof.entz', vorhandenLesen: false, stand: { groesse: 100, geaendert: 1 } });
    // danach gilt der neue Stand
    expect(useEntz.getState().dateiStand).toEqual({ groesse: 120, geaendert: 2 });
    expect(useEntz.getState().dirty).toBe(false);
  });

  it('außen geändert: nichts überschrieben, Rückfrage, Änderungen bleiben; „Unter neuem Namen“ speichert mit Dialog', async () => {
    await geoeffnet();
    useEntz.getState().aendern((d) => ({ fotos: d.fotos.map((f) => ({ ...f, name: 'Ost' })) }));
    const optionen: SpeicherOptionen[] = [];
    datei.speichern = async (o) => {
      optionen.push(o);
      if (o.stand !== undefined) throw new DateiVonAussenGeaendert(o.pfad ?? '');
      o.build();
      return 'C:\\Projekt\\Hof (Kopie).entz';
    };
    // Abbrechen: nicht gespeichert, weiter ungespeichert
    expect(await speichern()).toBe(false);
    expect(datei.fragen).toEqual(['Datei wurde inzwischen geändert']);
    // Gegenprobe Browser: kein „Ordner öffnen“
    expect(datei.knoepfe[0]).toEqual(['abbrechen', 'neu']);
    expect(useEntz.getState().dirty).toBe(true);
    expect(useEntz.getState().dateiname).toBe('C:\\Projekt\\Hof.entz');
    // Unter neuem Namen: Dialog (kein Pfad, keine Prüfung), Vorschlag mit „(Kopie)“
    datei.antwort = 'neu';
    expect(await speichern()).toBe(true);
    expect(optionen[2]).toMatchObject({ pfad: null, defaultName: 'Hof (Kopie).entz' });
    expect(optionen[2].stand).toBeUndefined();
    expect(useEntz.getState().dateiname).toBe('C:\\Projekt\\Hof (Kopie).entz');
    expect(useEntz.getState().dirty).toBe(false);
  });

  it('.entz neben dem Foto im Projekt: Stand aus dem Projektordner wird beim Speichern geprüft', async () => {
    const fs = new SpeicherProjektordner();
    const root = '/p/2026-014 Haus/09 Fotos';
    const z = packen({ fotos: [{ id: 'a1', name: 'Nord', mime: 'image/png', breite: 10, hoehe: 8, linse: { k1: 0, k2: 0 }, hilfslinien: [], ebenen: [] }] }, { a1: bytes(4) });
    await fs.dateiAnlegen(root, 'Bestand/Nord.entz', z);
    const stand = (await fs.liesMitStand(root, 'Bestand/Nord.entz'))!.stand;
    await fotoImProjektOeffnen(fs, root, 'Bestand/Nord.jpg');
    expect(useEntz.getState().dateiname).toBe(`${root}/Bestand/Nord.entz`);
    expect(useEntz.getState().dateiStand).toEqual(stand);
    let o0: SpeicherOptionen | null = null;
    datei.speichern = async (o) => {
      o0 = o;
      return o.pfad;
    };
    await speichern();
    expect(o0!).toMatchObject({ pfad: `${root}/Bestand/Nord.entz`, stand });
  });

  it('„Ordner öffnen“ (Desktop) zeigt den Ordner der Datei und fragt dann erneut', async () => {
    datei.tauri = true;
    await geoeffnet();
    useEntz.getState().aendern((d) => ({ fotos: d.fotos.map((f) => ({ ...f, name: 'Ost' })) }));
    datei.speichern = async (o) => {
      throw new DateiVonAussenGeaendert(o.pfad ?? '');
    };
    datei.antworten = ['ordner', 'abbrechen'];
    expect(await speichern()).toBe(false);
    expect(datei.gezeigt).toEqual(['C:\\Projekt']);
    expect(datei.fragen).toHaveLength(2);
    expect(datei.knoepfe[0]).toEqual(['abbrechen', 'ordner', 'neu']);
    expect(useEntz.getState().dirty).toBe(true);
  });

  it('Gegenprobe: im Browser (Stand unbekannt) wird nicht geprüft', async () => {
    useEntz.getState().fotoHinzufuegen('f1', 'Süd', 'image/jpeg', 100, 80, bytes(5));
    let o0: SpeicherOptionen | null = null;
    datei.speichern = async (o) => {
      o0 = o;
      return 'Süd.entz';
    };
    await speichern();
    expect(o0!.stand).toBeUndefined();
    expect(o0!.vorhandenLesen).toBe(false);
  });
});

describe('Fotos hinzufügen', () => {
  it('mehrere nicht lesbare Dateien: eine gemeinsame Meldung statt einer je Datei', async () => {
    await fotosHinzufuegen([new File(['x'], 'a.heic'), new File(['y'], 'b.jpg'), new File(['z'], 'c.png')]);
    expect(datei.meldungen).toHaveLength(1);
    const [titel, text] = datei.meldungen[0].split('|');
    expect(titel).toBe('3 von 3 Fotos ließen sich nicht hinzufügen');
    expect(text.split('\n')).toHaveLength(3);
    expect(text).toContain('a.heic');
    expect(useEntz.getState().doc.fotos).toHaveLength(0);
    // Gegenprobe: eine Datei – Einzahl
    datei.meldungen = [];
    await fotosHinzufuegen([new File(['x'], 'd.heic')]);
    expect(datei.meldungen[0].split('|')[0]).toBe('Foto ließ sich nicht hinzufügen');
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
