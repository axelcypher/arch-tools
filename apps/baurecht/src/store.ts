/**
 * Zustand der App Baurecht: geöffnetes Projekt (Projektdatei), aktiver Antrag, Antragsmerkmale (gemeinsam mit
 * Formulare), die Prüfung des Antrags (Fakten von Hand, Festlegungen, Protokolle), Regelpaket und Rechtsstand.
 *
 * Festlegungen von Hand sind Entwürfe, bis sie beim Speichern ein zweites Mal bestätigt werden (`bestaetigt`).
 */

import { create } from 'zustand';
import type { Paket } from '@core/baurecht/paket';
import type { BaurechtPruefung } from '@core/baurecht/projekt';
import { angabeVonHand, hinweisBestaetigen } from '@core/baurecht/angaben';
import { geoZusammenfuehren } from '@core/baurecht/geodienste';
import { ortVon } from '@core/baurecht/ort';
import { isTauri } from '@core/platform/files';
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
  /**
   * nach dem Speichern: Stand der Datei übernehmen. `seit` ist der Stand bei Beginn des Speicherns – was sich seitdem in
   * der App geändert hat (z. B. Ergebnisse von „Lage abfragen“), wird auf den neuen Stand gesetzt, nicht verworfen.
   */
  /** `project`: das Projekt, frisch aus der gespeicherten Datei gelesen (Projektordner) */
  gespeichert: (roh: Record<string, unknown>, quelle?: Projektquelle, seit?: { pruefung: BaurechtPruefung; merkmale: Record<string, string> }, project?: Project) => void;
  schliessen: () => void;
  antragWaehlen: (antrag: string) => void;
  merkmalSetzen: (name: string, wert: string) => void;
  /** Planungsrecht gilt unverändert auch am jetzigen Ort (nach einem Adresswechsel) */
  planungsrechtBestaetigen: () => void;
  /**
   * Angabe von Hand; mit `grund` (Pflicht für Schutzgebiete und Angaben aus Geodiensten) wird sie wie eine Bestätigung
   * beim Speichern noch einmal abgefragt. Widerspricht sie einem Treffer eines Dienstes, bleibt das als Widerspruch.
   */
  /** `lage`: Kennung der Lage, an die die Angabe gebunden wird; `null` = sie müsste gebunden werden, es gibt aber keine Koordinaten */
  faktSetzen: (id: string, wert: FaktWert['wert'] | undefined, von: string, grund?: string, lage?: string | null) => void;
  /** Bestätigung (bzw. Angabe von Hand mit Beleg) zurücknehmen – es gilt wieder der Hinweis bzw. nichts */
  bestaetigungZuruecknehmen: (id: string) => void;
  /** Hinweis als gesichert übernehmen – mit Begründung; bei Geodaten an die Lage gebunden; beim Speichern noch einmal bestätigt */
  faktBestaetigen: (id: string, wert: FaktWert, von: string, grund: string, lage?: string | null) => void;
  geoFakten: (fakten: Record<string, FaktWert>) => void;
  einreichungSetzen: (datum: string) => void;
  festlegen: (p: ParagrafErgebnis, ampel: Ampel, grund: string, von: string, summen: Record<string, string>, werte: Record<string, string | number | boolean | null>, sicherheit?: Festlegung['sicherheit']) => void;
  festlegungAufheben: (id: string) => void;
  /** Festlegungen ohne Ortsangabe (ältere Datei) dem jetzigen Ort zuordnen – als Entwurf, bestätigt wird beim Speichern */
  festlegungenOrtUebernehmen: (ids: string[]) => void;
  /** „Rückgängig“ nach dem Aufheben: die vorige Festlegung unverändert zurück */
  festlegungWiederherstellen: (id: string, f: Festlegung) => void;
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
  /** kurze Ansage für Screenreader (nach Knöpfen, die verschwinden) */
  ansage: string;
  ansagen: (text: string) => void;
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
  ansage: '',
  ansagen: (text) => set({ ansage: text }),

  projektSetzen: (quelle, project, roh) => {
    const antrag = aktiverAntrag(roh);
    const antraege = antraegeAus(roh);
    const merkmale = merkmaleAusRoh(roh, antrag);
    const pruefung = baurechtAusRoh(roh).pruefungen[antrag] ?? leerePruefung();
    set({ quelle, project, roh, antrag, antraege: antraege.includes(antrag) ? antraege : [...antraege, antrag], merkmale, merkmaleDatei: { ...merkmale }, pruefung: kopie(pruefung), pruefungDatei: kopie(pruefung), auswahl: null, fokus: null });
  },
  gespeichert: (roh, quelle, seit, project) => {
    const s = get();
    const merkmaleDatei = merkmaleAusRoh(roh, s.antrag);
    const pruefungDatei = baurechtAusRoh(roh).pruefungen[s.antrag] ?? leerePruefung();
    const merkmale = { ...merkmaleDatei };
    const pruefung = kopie(pruefungDatei);
    if (seit) {
      const gleich = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
      for (const k of new Set([...Object.keys(s.merkmale), ...Object.keys(seit.merkmale)]))
        if (!gleich(s.merkmale[k], seit.merkmale[k])) {
          if (s.merkmale[k]) merkmale[k] = s.merkmale[k];
          else delete merkmale[k];
        }
      for (const art of ['fakten', 'festlegungen'] as const) {
        const jetzt = s.pruefung[art] as Record<string, unknown>;
        const vorher = seit.pruefung[art] as Record<string, unknown>;
        const ziel = pruefung[art] as Record<string, unknown>;
        for (const k of new Set([...Object.keys(jetzt), ...Object.keys(vorher)]))
          if (!gleich(jetzt[k], vorher[k])) {
            if (jetzt[k] === undefined) delete ziel[k];
            else ziel[k] = kopie(jetzt[k]);
          }
      }
      if (s.pruefung.einreichung !== seit.pruefung.einreichung) {
        if (s.pruefung.einreichung) pruefung.einreichung = s.pruefung.einreichung;
        else delete pruefung.einreichung;
      }
      // wie die Einreichung: ein während des Speicherns bestätigter Ort des Planungsrechts bleibt erhalten
      if (!gleich(s.pruefung.planungsrechtOrt, seit.pruefung.planungsrechtOrt)) {
        if (s.pruefung.planungsrechtOrt) pruefung.planungsrechtOrt = kopie(s.pruefung.planungsrechtOrt);
        else delete pruefung.planungsrechtOrt;
      }
      for (const pr of s.pruefung.protokolle) if (!seit.pruefung.protokolle.some((x) => x.am === pr.am) && !pruefung.protokolle.some((x) => x.am === pr.am)) pruefung.protokolle.push(pr);
    }
    // das Projekt neu aus der Datei, wenn sie frisch gelesen wurde – sonst blieben Änderungen anderer Apps (Adresse,
    // Koordinaten) für die Ortsbindung unsichtbar
    set({ roh, quelle: quelle ?? s.quelle, merkmale, merkmaleDatei, pruefung, pruefungDatei: kopie(pruefungDatei), ...(project ? { project } : {}) });
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
    // das Planungsrecht hängt am Ort: merken, für welchen es gesetzt wurde (nach einem Adresswechsel ein Hinweis)
    if (name === 'Planungsrecht') {
      const p = kopie(get().pruefung);
      const o = ortVon(get().project);
      if (wert && o) p.planungsrechtOrt = { ...o, wert };
      else delete p.planungsrechtOrt;
      set({ merkmale: m, pruefung: p });
      return;
    }
    set({ merkmale: m });
  },
  planungsrechtBestaetigen: () => {
    const o = ortVon(get().project);
    const wert = get().merkmale['Planungsrecht'];
    if (!o || !wert) return;
    const p = kopie(get().pruefung);
    p.planungsrechtOrt = { ...o, wert };
    set({ pruefung: p });
  },
  faktSetzen: (id, wert, von, grund, lage) => {
    const p = kopie(get().pruefung);
    // dieselbe Rechnung wie die Vorschau im Dialog (angabeVonHand): Beleg, Lagebezug, Widerspruch aus dem Dienst
    if (wert === undefined) delete p.fakten[id];
    else p.fakten[id] = angabeVonHand(p.fakten[id], id, wert, { von, grund, lage, heute: heute(), desktop: isTauri() });
    set({ pruefung: p });
  },
  faktBestaetigen: (id, wert, von, grund, lage) => {
    const p = kopie(get().pruefung);
    p.fakten[id] = JSON.parse(JSON.stringify(hinweisBestaetigen(wert, { von, grund, lage, heute: heute() }))) as FaktWert;
    set({ pruefung: p });
  },
  bestaetigungZuruecknehmen: (id) => {
    const p = kopie(get().pruefung);
    const f = p.fakten[id];
    if (!f) return;
    // Angaben von Hand und Werte aus der Projektdatei fallen weg; Ergebnisse eines Dienstes bleiben – als Hinweis
    if (f.herkunft === 'geodienst') {
      const { bestaetigt: _b, ...ohne } = f;
      p.fakten[id] = ohne;
    } else delete p.fakten[id];
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
  festlegen: (e, ampel, grund, von, summen, werte, sicherheit) => {
    const p = kopie(get().pruefung);
    // eine Festlegung gilt für den Ort, an dem sie getroffen wird (ändert er sich, ist sie überholt)
    const ort = ortVon(get().project);
    const f: Festlegung = { ampel, grund: grund.trim(), von, am: heute(), automatisch: e.automatisch, fakten: werte, stand: summen, ...(sicherheit && Object.keys(sicherheit).length ? { sicherheit } : {}), ...(ort ? { ort } : {}) };
    p.festlegungen[e.id] = f;
    set({ pruefung: p });
  },
  festlegungenOrtUebernehmen: (ids) => {
    const ort = ortVon(get().project);
    if (!ort) return;
    const p = kopie(get().pruefung);
    for (const id of ids) {
      const f = p.festlegungen[id];
      if (!f || f.ort) continue;
      const { bestaetigt: _b, ...entwurf } = f;
      p.festlegungen[id] = { ...entwurf, ort };
    }
    set({ pruefung: p });
  },
  festlegungAufheben: (id) => {
    const p = kopie(get().pruefung);
    delete p.festlegungen[id];
    set({ pruefung: p });
  },
  festlegungWiederherstellen: (id, f) => {
    const s = get();
    const p = kopie(s.pruefung);
    // genau der Stand der Datei: unverändert zurück; sonst als Entwurf – die zweite Bestätigung ist wieder nötig
    const datei = s.pruefungDatei.festlegungen[id];
    if (datei && JSON.stringify(datei) === JSON.stringify(f)) p.festlegungen[id] = kopie(f);
    else {
      const { bestaetigt: _b, ...entwurf } = kopie(f);
      p.festlegungen[id] = entwurf;
    }
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
  // offen: alles, was nicht bestätigt ist oder vom Stand der Datei abweicht (bestätigt wird nur beim Speichern – eine
  // abweichende Festlegung mit „bestätigt“ stammt also aus einem älteren Stand und braucht die Bestätigung erneut)
  const datei = s.pruefungDatei.festlegungen;
  const neu = Object.entries(jetzt)
    .filter(([id, f]) => !f.bestaetigt || JSON.stringify(f) !== JSON.stringify(datei[id]))
    .map(([id]) => id);
  const aufgehoben = Object.keys(s.pruefungDatei.festlegungen).filter((id) => !jetzt[id]);
  return [...neu, ...aufgehoben];
}

/**
 * Bestätigungen von Hinweisen und Angaben mit Beleg (z. B. „kein Schutzgebiet“), die seit dem letzten Speichern neu
 * oder geändert sind – verglichen werden Wert und Bestätigung, nicht nur die Bestätigung
 */
export function offeneBestaetigungen(s: Pick<Zustand, 'pruefung' | 'pruefungDatei'>): string[] {
  const kern = (f: FaktWert | undefined) => JSON.stringify(f ? { wert: f.wert, bestaetigt: f.bestaetigt ?? null } : null);
  return Object.entries(s.pruefung.fakten)
    .filter(([id, f]) => f.bestaetigt && kern(f) !== kern(s.pruefungDatei.fakten[id]))
    .map(([id]) => id);
}
