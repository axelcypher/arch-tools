/**
 * Zustand der App Baurecht: geöffnetes Projekt (Projektdatei), aktiver Antrag, Antragsmerkmale (gemeinsam mit
 * Formulare), die Prüfung des Antrags (Fakten von Hand, Festlegungen, Protokolle), Regelpaket und Rechtsstand.
 *
 * Festlegungen von Hand sind Entwürfe, bis sie beim Speichern ein zweites Mal bestätigt werden (`bestaetigt`).
 */

import { create } from 'zustand';
import type { Paket } from '@core/baurecht/paket';
import type { BaurechtPruefung } from '@core/baurecht/projekt';
import { geoZusammenfuehren } from '@core/baurecht/geodienste';
import { aktiverAntrag, baurechtAusRoh, leerePruefung, merkmaleAusRoh } from '@core/baurecht/projekt';
import type { Ampel, FaktWert, Festlegung, ParagrafErgebnis } from '@core/baurecht/typen';
import type { Project } from '@core/model';
import type { TextStand } from '@core/baurecht/auswertung';
import { mitgeliefert } from './regelpaket';

export type Projektquelle =
  /** Projektdatei im Projektordner (Desktop): wird gezielt ersetzt */
  | { art: 'ordner'; root: string; pfad: string; datei: string }
  /** Datei aus dem Dateidialog (Web): Speichern lädt die geänderte Datei herunter */
  | { art: 'datei'; name: string; bytes: Uint8Array };

export const heute = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export interface Zustand {
  quelle: Projektquelle | null;
  project: Project | null;
  /** projekt.json wie zuletzt gelesen bzw. gespeichert */
  roh: Record<string, unknown> | null;
  antrag: string;
  antraege: string[];
  merkmale: Record<string, string>;
  merkmaleDatei: Record<string, string>;
  pruefung: BaurechtPruefung;
  pruefungDatei: BaurechtPruefung;
  paket: Paket;
  paketMeldung: string;
  texte: Record<string, TextStand>;
  /** Normen, deren Text gerade geholt wird */
  laedt: string[];
  /** letzte Prüfung des Rechtsstands */
  rechtsstandGeprueft: string | null;
  auswahl: string | null;
  /** Fakt, zu dem die Angaben-Leiste springen soll */
  fokus: string | null;

  projektSetzen: (q: Projektquelle, project: Project, roh: Record<string, unknown>) => void;
  gespeichert: (roh: Record<string, unknown>, quelle?: Projektquelle) => void;
  schliessen: () => void;
  antragWaehlen: (antrag: string) => void;
  merkmalSetzen: (name: string, wert: string) => void;
  /**
   * Angabe von Hand; mit `grund` (Pflicht für Schutzgebiete und Angaben aus Geodiensten) wird sie wie eine Bestätigung
   * beim Speichern noch einmal abgefragt. Widerspricht sie einem Treffer eines Dienstes, bleibt das als Widerspruch.
   */
  faktSetzen: (id: string, wert: FaktWert['wert'] | undefined, von: string, grund?: string) => void;
  /** Hinweis als gesichert übernehmen – mit Begründung; bei Geodaten an die Lage gebunden; beim Speichern noch einmal bestätigt */
  faktBestaetigen: (id: string, wert: FaktWert, von: string, grund: string, lage: string | null) => void;
  geoFakten: (fakten: Record<string, FaktWert>) => void;
  einreichungSetzen: (datum: string) => void;
  festlegen: (p: ParagrafErgebnis, ampel: Ampel, grund: string, von: string, summen: Record<string, string>, werte: Record<string, string | number | boolean | null>) => void;
  festlegungAufheben: (id: string) => void;
  festlegungenBestaetigen: (ids: string[]) => void;
  /** offene Festlegungen und Bestätigungen auf den Stand der Datei zurücksetzen („ohne diese speichern“) */
  aufDateistand: (festlegungen: string[], fakten: string[]) => void;
  protokollAnhaengen: (p: BaurechtPruefung['protokolle'][number]) => void;
  paketSetzen: (paket: Paket, meldung: string) => void;
  textSetzen: (key: string, stand: TextStand) => void;
  laedtSetzen: (keys: string[]) => void;
  rechtsstandGeprueftSetzen: (iso: string) => void;
  waehlen: (id: string | null) => void;
  fokusSetzen: (id: string | null) => void;
}

const kopie = <T>(x: T): T => structuredClone(x);

function antraegeAus(roh: Record<string, unknown>): string[] {
  const f = (roh.formulare ?? (roh.erweiterungen as Record<string, unknown> | undefined)?.formulare) as { antraege?: Record<string, unknown> } | undefined;
  return Object.keys(f?.antraege ?? {}).sort((a, b) => a.localeCompare(b, 'de', { numeric: true }));
}

export const useBaurecht = create<Zustand>((set, get) => ({
  quelle: null,
  project: null,
  roh: null,
  antrag: 'Projekt',
  antraege: [],
  merkmale: {},
  merkmaleDatei: {},
  pruefung: leerePruefung(),
  pruefungDatei: leerePruefung(),
  paket: mitgeliefert,
  paketMeldung: '',
  texte: {},
  laedt: [],
  rechtsstandGeprueft: null,
  auswahl: null,
  fokus: null,

  projektSetzen: (quelle, project, roh) => {
    const antrag = aktiverAntrag(roh);
    const antraege = antraegeAus(roh);
    const merkmale = merkmaleAusRoh(roh, antrag);
    const pruefung = baurechtAusRoh(roh).pruefungen[antrag] ?? leerePruefung();
    set({ quelle, project, roh, antrag, antraege: antraege.includes(antrag) ? antraege : [...antraege, antrag], merkmale, merkmaleDatei: { ...merkmale }, pruefung: kopie(pruefung), pruefungDatei: kopie(pruefung), auswahl: null, fokus: null });
  },
  gespeichert: (roh, quelle) => {
    const s = get();
    const merkmale = merkmaleAusRoh(roh, s.antrag);
    const pruefung = baurechtAusRoh(roh).pruefungen[s.antrag] ?? leerePruefung();
    set({ roh, quelle: quelle ?? s.quelle, merkmale: { ...merkmale }, merkmaleDatei: { ...merkmale }, pruefung: kopie(pruefung), pruefungDatei: kopie(pruefung) });
  },
  schliessen: () => set({ quelle: null, project: null, roh: null, antrag: 'Projekt', antraege: [], merkmale: {}, merkmaleDatei: {}, pruefung: leerePruefung(), pruefungDatei: leerePruefung(), auswahl: null }),
  antragWaehlen: (antrag) => {
    const roh = get().roh;
    if (!roh) return;
    const merkmale = merkmaleAusRoh(roh, antrag);
    const pruefung = baurechtAusRoh(roh).pruefungen[antrag] ?? leerePruefung();
    set({ antrag, merkmale, merkmaleDatei: { ...merkmale }, pruefung: kopie(pruefung), pruefungDatei: kopie(pruefung), auswahl: null });
  },
  merkmalSetzen: (name, wert) => {
    const m = { ...get().merkmale };
    if (wert) m[name] = wert;
    else delete m[name];
    set({ merkmale: m });
  },
  faktSetzen: (id, wert, von, grund) => {
    const p = kopie(get().pruefung);
    const alt = p.fakten[id];
    if (wert === undefined) delete p.fakten[id];
    else {
      const f: FaktWert = { wert, herkunft: 'manuell', sicherheit: 'sicher', stand: heute(), quelle: von ? `von Hand (${von})` : 'von Hand' };
      if (grund?.trim()) f.bestaetigt = { von, am: heute(), grund: grund.trim() };
      // ein Ergebnis eines Dienstes (außer einem bloßen „kein Treffer“) bleibt als Widerspruch stehen
      const dienst = alt?.herkunft === 'geodienst' ? alt : undefined;
      if (dienst && dienst.wert !== wert && !(dienst.wert === false && dienst.sicherheit === 'hinweis')) f.widerspruch = `${dienst.quelle ?? 'Geodienst'} meldet „${dienst.wert === true ? 'ja' : dienst.wert === false ? 'nein' : String(dienst.wert)}“ (${dienst.stand ?? ''})`.replace(' ()', '');
      else if (alt?.herkunft === 'manuell' && alt.widerspruch && alt.wert === wert) f.widerspruch = alt.widerspruch;
      p.fakten[id] = f;
    }
    set({ pruefung: p });
  },
  faktBestaetigen: (id, wert, von, grund, lage) => {
    const p = kopie(get().pruefung);
    const { widerspruch: _w, ...ohne } = wert;
    p.fakten[id] = { ...ohne, bestaetigt: { von, am: heute(), grund: grund.trim(), ...(lage && wert.herkunft === 'geodienst' ? { lage } : {}) } };
    set({ pruefung: p });
  },
  geoFakten: (fakten) => {
    const p = kopie(get().pruefung);
    p.fakten = geoZusammenfuehren(p.fakten, fakten);
    set({ pruefung: p });
  },
  einreichungSetzen: (datum) => {
    const p = kopie(get().pruefung);
    if (datum) p.einreichung = datum;
    else delete p.einreichung;
    set({ pruefung: p });
  },
  festlegen: (e, ampel, grund, von, summen, werte) => {
    const p = kopie(get().pruefung);
    const f: Festlegung = { ampel, grund: grund.trim(), von, am: heute(), automatisch: e.automatisch, fakten: werte, stand: summen };
    p.festlegungen[e.id] = f;
    set({ pruefung: p });
  },
  festlegungAufheben: (id) => {
    const p = kopie(get().pruefung);
    delete p.festlegungen[id];
    set({ pruefung: p });
  },
  festlegungenBestaetigen: (ids) => {
    const p = kopie(get().pruefung);
    const jetzt = new Date().toISOString();
    for (const id of ids) if (p.festlegungen[id]) p.festlegungen[id].bestaetigt = jetzt;
    set({ pruefung: p });
  },
  aufDateistand: (festlegungen, fakten) => {
    const s = get();
    const p = kopie(s.pruefung);
    for (const id of festlegungen) {
      const alt = s.pruefungDatei.festlegungen[id];
      if (alt) p.festlegungen[id] = kopie(alt);
      else delete p.festlegungen[id];
    }
    for (const id of fakten) {
      const alt = s.pruefungDatei.fakten[id];
      if (alt) p.fakten[id] = kopie(alt);
      else delete p.fakten[id];
    }
    set({ pruefung: p });
  },
  protokollAnhaengen: (pr) => {
    const p = kopie(get().pruefung);
    p.protokolle = [...p.protokolle, pr];
    set({ pruefung: p });
  },
  paketSetzen: (paket, paketMeldung) => set({ paket, paketMeldung }),
  textSetzen: (key, stand) => set({ texte: { ...get().texte, [key]: stand } }),
  laedtSetzen: (laedt) => set({ laedt }),
  rechtsstandGeprueftSetzen: (iso) => set({ rechtsstandGeprueft: iso }),
  waehlen: (auswahl) => set({ auswahl }),
  fokusSetzen: (fokus) => set({ fokus }),
}));

/** ungespeicherte Änderungen */
export function istGeaendert(s: Pick<Zustand, 'pruefung' | 'pruefungDatei' | 'merkmale' | 'merkmaleDatei'>): boolean {
  return JSON.stringify(s.pruefung) !== JSON.stringify(s.pruefungDatei) || JSON.stringify(s.merkmale) !== JSON.stringify(s.merkmaleDatei);
}

/**
 * Festlegungen, die die zweite Bestätigung brauchen: neu oder geändert (ohne `bestaetigt`) und aufgehoben (in der
 * Datei, aber nicht mehr in der App – das Aufheben einer Festlegung kann eine Herabstufung sein).
 */
export function offeneFestlegungen(s: Pick<Zustand, 'pruefung' | 'pruefungDatei'>): string[] {
  const jetzt = s.pruefung.festlegungen;
  const neu = Object.entries(jetzt)
    .filter(([, f]) => !f.bestaetigt)
    .map(([id]) => id);
  const aufgehoben = Object.keys(s.pruefungDatei.festlegungen).filter((id) => !jetzt[id]);
  return [...neu, ...aufgehoben];
}

/** Bestätigungen von Hinweisen (z. B. „kein Schutzgebiet“), die seit dem letzten Speichern neu sind */
export function offeneBestaetigungen(s: Pick<Zustand, 'pruefung' | 'pruefungDatei'>): string[] {
  return Object.entries(s.pruefung.fakten)
    .filter(([id, f]) => f.bestaetigt && JSON.stringify(f.bestaetigt) !== JSON.stringify(s.pruefungDatei.fakten[id]?.bestaetigt))
    .map(([id]) => id);
}
