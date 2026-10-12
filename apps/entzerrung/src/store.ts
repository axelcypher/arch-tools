import { create } from 'zustand';
import type { Pt } from './geo/mat';
import { neueEbene, neuesFoto } from './model';
import type { Dokument, Ebene, Foto } from './model';

export type Ansicht = 'foto' | 'entzerrt';

export type Werkzeug =
  | 'auswahl'
  // Fotoansicht
  | 'hilfslinie'
  | 'ecken'
  | 'passpunkt'
  | 'waagerecht'
  | 'senkrecht'
  | 'mass'
  // entzerrte Ansicht
  | 'strecke'
  | 'linienzug'
  | 'flaeche'
  | 'ausschnitt';

export const FOTO_WERKZEUGE: Werkzeug[] = ['auswahl', 'hilfslinie', 'ecken', 'passpunkt', 'waagerecht', 'senkrecht', 'mass'];
export const ENTZERRT_WERKZEUGE: Werkzeug[] = ['auswahl', 'strecke', 'linienzug', 'flaeche', 'ausschnitt'];

/** Ausgewähltes Element; `index` = Punkt innerhalb des Elements */
export interface Auswahl {
  art: 'hilfslinie' | 'ecke' | 'passpunkt' | 'waagerecht' | 'senkrecht' | 'mass' | 'messung';
  id: string;
  index?: number;
}

interface Zustand {
  doc: Dokument;
  /** Originaldaten der Fotos (nicht im Rückgängig-Verlauf) */
  bilder: Record<string, Uint8Array>;
  dateiname: string | null;
  dirty: boolean;
  fotoId: string | null;
  ebeneId: string | null;
  ansicht: Ansicht;
  werkzeug: Werkzeug;
  auswahl: Auswahl | null;
  /** Punkte des gerade gezeichneten Elements (Fotopixel) */
  entwurf: Pt[];
  /** Fotoansicht mit korrigierter Verzeichnung */
  korrigiert: boolean;
  vergangenheit: Dokument[];
  zukunft: Dokument[];

  /** Dokument ändern; `verlauf: false` für Zwischenschritte beim Ziehen (vorher `merken()`) */
  aendern: (f: (d: Dokument) => Dokument, verlauf?: boolean) => void;
  merken: () => void;
  rueckgaengig: () => void;
  wiederholen: () => void;
  setze: (p: Partial<Pick<Zustand, 'ansicht' | 'werkzeug' | 'auswahl' | 'entwurf' | 'korrigiert'>>) => void;
  waehleFoto: (id: string | null) => void;
  waehleEbene: (id: string) => void;
  fotoHinzufuegen: (id: string, name: string, mime: string, breite: number, hoehe: number, daten: Uint8Array) => void;
  laden: (doc: Dokument, bilder: Record<string, Uint8Array>, dateiname: string | null, dirty?: boolean) => void;
  gespeichert: (dateiname: string) => void;
}

const MAX_VERLAUF = 100;

export const useEntz = create<Zustand>((set, get) => ({
  doc: { fotos: [] },
  bilder: {},
  dateiname: null,
  dirty: false,
  fotoId: null,
  ebeneId: null,
  ansicht: 'foto',
  werkzeug: 'auswahl',
  auswahl: null,
  entwurf: [],
  korrigiert: true,
  vergangenheit: [],
  zukunft: [],

  aendern: (f, verlauf = true) =>
    set((s) => {
      const doc = f(s.doc);
      if (doc === s.doc) return {};
      return verlauf
        ? { doc, dirty: true, vergangenheit: [...s.vergangenheit, s.doc].slice(-MAX_VERLAUF), zukunft: [] }
        : { doc, dirty: true };
    }),
  merken: () => set((s) => ({ vergangenheit: [...s.vergangenheit, s.doc].slice(-MAX_VERLAUF), zukunft: [] })),
  rueckgaengig: () =>
    set((s) => {
      const vorher = s.vergangenheit[s.vergangenheit.length - 1];
      if (!vorher) return {};
      return { doc: vorher, vergangenheit: s.vergangenheit.slice(0, -1), zukunft: [s.doc, ...s.zukunft], dirty: true, ...gueltigeAuswahl(vorher, s) };
    }),
  wiederholen: () =>
    set((s) => {
      const nach = s.zukunft[0];
      if (!nach) return {};
      return { doc: nach, zukunft: s.zukunft.slice(1), vergangenheit: [...s.vergangenheit, s.doc], dirty: true, ...gueltigeAuswahl(nach, s) };
    }),
  setze: (p) => set(p),
  waehleFoto: (id) => {
    const f = get().doc.fotos.find((x) => x.id === id);
    set({ fotoId: f?.id ?? null, ebeneId: f?.ebenen[0]?.id ?? null, auswahl: null, entwurf: [], ansicht: 'foto', werkzeug: 'auswahl' });
  },
  waehleEbene: (id) => set({ ebeneId: id, auswahl: null, entwurf: [] }),
  fotoHinzufuegen: (id, name, mime, breite, hoehe, daten) => {
    const foto = neuesFoto(id, name, mime, breite, hoehe);
    set((s) => ({ bilder: { ...s.bilder, [id]: daten } }));
    get().aendern((d) => ({ fotos: [...d.fotos, foto] }));
    get().waehleFoto(id);
  },
  laden: (doc, bilder, dateiname, dirty = false) => {
    set({ doc, bilder, dateiname, dirty, vergangenheit: [], zukunft: [] });
    get().waehleFoto(doc.fotos[0]?.id ?? null);
  },
  gespeichert: (dateiname) => set({ dateiname, dirty: false }),
}));

/** nach Rückgängig: Auswahl von Foto und Ebene gültig halten */
function gueltigeAuswahl(doc: Dokument, s: Zustand): Partial<Zustand> {
  const foto = doc.fotos.find((f) => f.id === s.fotoId) ?? doc.fotos[0];
  const ebene = foto?.ebenen.find((e) => e.id === s.ebeneId) ?? foto?.ebenen[0];
  return { fotoId: foto?.id ?? null, ebeneId: ebene?.id ?? null, auswahl: null, entwurf: [] };
}

// ---------- Hilfen für unveränderliche Änderungen ----------

export function mitFoto(fotoId: string, f: (foto: Foto) => Foto) {
  return (d: Dokument): Dokument => ({ fotos: d.fotos.map((x) => (x.id === fotoId ? f(x) : x)) });
}

export function mitEbene(fotoId: string, ebeneId: string, f: (e: Ebene) => Ebene) {
  return mitFoto(fotoId, (foto) => ({ ...foto, ebenen: foto.ebenen.map((e) => (e.id === ebeneId ? f(e) : e)) }));
}

export function aktuell(s: Pick<Zustand, 'doc' | 'fotoId' | 'ebeneId'>): { foto: Foto | null; ebene: Ebene | null } {
  const foto = s.doc.fotos.find((f) => f.id === s.fotoId) ?? null;
  const ebene = foto?.ebenen.find((e) => e.id === s.ebeneId) ?? null;
  return { foto, ebene };
}

export function ebeneHinzufuegen(fotoId: string) {
  const s = useEntz.getState();
  const foto = s.doc.fotos.find((f) => f.id === fotoId);
  if (!foto) return;
  const e = neueEbene(foto.ebenen.length + 1);
  s.aendern(mitFoto(fotoId, (f) => ({ ...f, ebenen: [...f.ebenen, e] })));
  s.waehleEbene(e.id);
  s.setze({ ansicht: 'foto', werkzeug: 'ecken' });
}
