import type { AppKennung } from '../appNamen';
import type { Variable, Wert } from '../platzhalter';
import { unbekanntePlatzhalter } from '../platzhalter';

/**
 * Verzeichnis der Pfad- und Namenseinstellungen aller Apps – die Grundlage der Seite „Pfade und Benennung“ im zentralen
 * Einstellungsdialog (`ui/Einstellungen.tsx`) und des Zugriffs der Apps (`einstellungen/pfade.ts`).
 *
 * Jede Einstellung ist typisiert beschrieben (Kennung, App, Bezeichnung, Vorgabe, erlaubte Platzhalter, Erklärung) und
 * weiß, wo ihr Wert liegt (`speicher`). Gespeichert wird dort, wo die App ihn schon immer liest – im gemeinsamen
 * Einstellungsspeicher (`platform/konfig.ts`), also unter Beachtung des Speicherorts (Einzelplatz/Netzwerk). Neue
 * Einstellungen liegen in `allgemein.json` unter `pfade`; ältere bleiben unter ihrem bisherigen Schlüssel, damit nichts
 * verloren geht und die Apps sie unverändert weiter lesen.
 */

/** Thema, nach dem die Seite gegliedert ist */
export type PfadThema = 'projekt' | 'ablage' | 'plaene' | 'export' | 'vorlagen';

export const PFAD_THEMEN: { id: PfadThema; titel: string; text: string }[] = [
  { id: 'projekt', titel: 'Projekt', text: 'Stammordner, Projektordner, Projektnummer und Projektdatei' },
  { id: 'ablage', titel: 'Ablage', text: 'Ordner im Projekt, in denen die Apps suchen und ablegen' },
  { id: 'plaene', titel: 'Pläne und Dokumente', text: 'Dateinamen von Plänen, Anträgen und Rechnungen' },
  { id: 'export', titel: 'Export', text: 'Zielordner und Dateinamen beim Exportieren' },
  { id: 'vorlagen', titel: 'Vorlagen', text: 'Namen der Dateien, die aus Vorlagen entstehen' },
];

/**
 * Art des Werts:
 *  - `pfad`: Ordner bzw. Datei relativ zum Projektordner, Teile mit „/“ getrennt
 *  - `name`: ein Datei- oder Ordnername ohne „/“
 *  - `liste`: mehrere Namen bzw. Muster, je Zeile einer
 *  - `schalter`: ja/nein
 *  - `ordner`: ein absoluter Ordner (Laufwerk oder Netzwerkpfad) – ohne Platzhalter
 */
export type PfadArt = 'pfad' | 'name' | 'liste' | 'schalter' | 'ordner';

export type PfadWert = string | boolean | string[];

/** Wo der Wert liegt: Bereich im Einstellungsspeicher, Lesen aus und Schreiben in dessen Rohdaten */
export interface PfadSpeicher {
  bereich: string;
  /** gespeicherter Wert; `undefined` = keiner (dann gilt die Vorgabe) */
  lesen: (roh: Record<string, unknown>) => PfadWert | undefined;
  /** neue Rohdaten mit dem Wert; `undefined` = Vorgabe wiederherstellen */
  schreiben: (roh: Record<string, unknown>, wert: PfadWert | undefined) => Record<string, unknown>;
}

/** gleiche Werte? (Listen elementweise) */
export const gleicherWert = (a: PfadWert | undefined, b: PfadWert | undefined): boolean => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

export interface PfadEinstellung {
  /** Kennung, z. B. „export.berechnungsordner“ – bleibt stabil */
  id: string;
  /**
   * Abweichung einer gemeinsamen Angabe für eine App (`gemeinsam.ts`): steht unter der gemeinsamen und ist sonst
   * eingeklappt. `unterordner`: Ordner im gemeinsamen Ordner (leer = direkt darin); `ersetzt`: eigener Wert statt des
   * gemeinsamen (leer = der gemeinsame).
   */
  abweichungVon?: { id: string; art: 'unterordner' | 'ersetzt' };
  /** Apps, die die Einstellung nutzen */
  apps: AppKennung[];
  thema: PfadThema;
  art: PfadArt;
  bezeichnung: string;
  /** ein bis zwei Sätze: wofür, wie man sie liest */
  erklaerung: string;
  vorgabe: PfadWert;
  /** erlaubte Platzhalter (globale und lokale) */
  variablen?: Variable[];
  /** Beispielwerte der lokalen Platzhalter für die Vorschau */
  beispiel?: Record<string, Wert>;
  /** Endung, die die App anhängt (nur Anzeige in der Vorschau), z. B. „.xlsx“ */
  endung?: string;
  /** weitere Hinweise zum Wert (blockieren nichts), z. B. was eine App für den Namen verlangt */
  hinweise?: (wert: string) => string[];
  /** bei Listen: was je Zeile steht (Vorgabe: ein Name; `ordner`: ein vollständiger Ordner – als Liste mit Umsortieren und Entfernen) */
  zeilen?: 'name' | 'pfad' | 'ordner';
  /** darf nicht leer sein */
  pflicht?: boolean;
  speicher: PfadSpeicher;
  /** derselbe Wert zusätzlich unter diesem Schlüssel (Spiegel für Apps, die ihn dort lesen) */
  auch?: { bereich: string; schluessel: string };
  /**
   * Das Projekt kann einen eigenen Wert tragen (z. B. in der Projektdatei) – der Wert hier ist dann nur die Vorgabe
   * für neue Projekte. Text sagt, wo der Projektwert steht.
   */
  projektwert?: string;
}

const objekt = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

/** Wert lesen: Text (getrimmt), Liste (Texte) bzw. ja/nein; `leerGilt`: ein leerer Text ist ein Wert (bisherige Schlüssel) */
function wertAus(v: unknown, art: PfadArt, leerGilt = false): PfadWert | undefined {
  if (art === 'schalter') return typeof v === 'boolean' ? v : undefined;
  if (art === 'liste')
    return Array.isArray(v)
      ? v
          .filter((x): x is string => typeof x === 'string')
          .map((x) => x.trim())
          .filter(Boolean)
      : undefined;
  if (typeof v !== 'string') return undefined;
  return v.trim() || leerGilt ? v.trim() : undefined;
}

/** Wert unter `pfade.<id>` in `allgemein.json` – für neue Einstellungen; Vorgabe = kein Eintrag */
export function inPfade(id: string, art: PfadArt): PfadSpeicher {
  return {
    bereich: 'allgemein',
    lesen: (roh) => wertAus(objekt(roh.pfade)[id], art),
    schreiben: (roh, wert) => {
      const pfade = { ...objekt(roh.pfade) };
      if (wert === undefined) delete pfade[id];
      else pfade[id] = wert;
      return { ...roh, pfade };
    },
  };
}

/**
 * Rohdaten mit `wert` unter dem Schlüsselpfad (Teile mit Punkten); übrige Angaben bleiben. `elternNoetig`: Fehlt das
 * Objekt über dem Schlüssel oder ist es keins, wird nichts geschrieben, sondern dieser Fehler gemeldet (etwa die
 * Struktur von ATLAS, die nur ATLAS selbst vollständig anlegt). Ein Zwischenteil, das kein Objekt ist, wird nie
 * überschrieben.
 */
export function mitSchluessel(roh: Record<string, unknown>, schluessel: string, wert: unknown, elternNoetig?: string): Record<string, unknown> {
  const teile = schluessel.split('.');
  const setzen = (o: Record<string, unknown>, i: number): Record<string, unknown> => {
    if (i === teile.length - 1) return { ...o, [teile[i]]: wert };
    const kind = o[teile[i]];
    const istObjekt = !!kind && typeof kind === 'object' && !Array.isArray(kind);
    if (!istObjekt && (kind !== undefined || elternNoetig)) throw new Error(elternNoetig ?? `„${teile.slice(0, i + 1).join('.')}“ ist nicht lesbar – nichts geändert.`);
    return { ...o, [teile[i]]: setzen(objekt(kind), i + 1) };
  };
  return setzen(roh, 0);
}

/**
 * Wert unter einem bisherigen Schlüssel eines Bereichs (Pfad mit Punkten, z. B. „ablage.gewerke“) – die App liest ihn
 * dort unverändert weiter. „Vorgabe wiederherstellen“ schreibt die Vorgabe ausdrücklich hinein: Manche Apps übernehmen
 * einen fehlenden Wert sonst aus ihrem eigenen Speicher zurück.
 */
export function unterSchluessel(bereich: string, schluessel: string, art: PfadArt, vorgabe: PfadWert, elternNoetig?: string): PfadSpeicher {
  const teile = schluessel.split('.');
  return {
    bereich,
    lesen: (roh) =>
      wertAus(
        teile.reduce<unknown>((o, t) => objekt(o)[t], roh),
        art,
        true,
      ),
    schreiben: (roh, wert) => mitSchluessel(roh, schluessel, wert === undefined ? vorgabe : wert, elternNoetig),
  };
}

/* ---------- Prüfung ---------- */

/** in Windows-Datei- und Ordnernamen unzulässige Zeichen (ohne Platzhalter-Klammern) */
const UNZULAESSIG_NAME = /[<>:"\\/|?*\u0000-\u001f]/g;
const UNZULAESSIG_PFAD = /[<>:"|?*\u0000-\u001f]/g;
/** unter Windows reservierte Namen */
const RESERVIERT = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i;

export interface PfadMeldung {
  art: 'fehler' | 'hinweis';
  text: string;
}

/** Text ohne Platzhalter (für die Zeichenprüfung – die Klammern selbst sind erlaubt) */
const ohnePlatzhalter = (v: string) => v.replace(/\{\{?[^{}]*\}\}?/g, 'x');

/** Absoluter Pfad: Laufwerk („C:\…“), Netzwerkpfad („\\server\…“) oder Unix-Pfad („/…“) */
export const istAbsolut = (v: string) => /^[a-zA-Z]:[\\/]/.test(v) || /^\\\\[^\\]+\\[^\\]+/.test(v) || v.startsWith('/');

/**
 * Prüft einen Wert: leere Pflichtfelder, ungültige Zeichen, absolute Pfade, wo ein relativer verlangt ist, „..“,
 * reservierte Namen und unbekannte Platzhalter. Fehler verhindern das Speichern, Hinweise nicht.
 */
export function pfadPruefen(e: PfadEinstellung, wert: string): PfadMeldung[] {
  const out: PfadMeldung[] = [];
  const v = wert.trim();
  if (e.art === 'schalter') return out;
  if (e.art === 'liste') {
    const zeilen = v
      .split('\n')
      .map((z) => z.trim())
      .filter(Boolean);
    if (!zeilen.length && e.pflicht) out.push({ art: 'fehler', text: 'Mindestens eine Zeile angeben. Mit „Vorgabe wiederherstellen“ zurück zur Vorgabe.' });
    const einzel: PfadEinstellung = { ...e, art: e.zeilen ?? 'name', pflicht: false };
    for (const m of zeilen.flatMap((z) => pfadPruefen(einzel, z))) if (!out.some((x) => x.text === m.text)) out.push(m);
    return out;
  }
  if (!v) {
    if (e.pflicht) out.push({ art: 'fehler', text: 'Angabe fehlt – leer gilt nicht. Mit „Vorgabe wiederherstellen“ zurück zur Vorgabe.' });
    return out;
  }
  if (e.art === 'ordner') {
    if (!istAbsolut(v)) out.push({ art: 'fehler', text: 'Vollständigen Ordner angeben – mit Laufwerk (Z:\\Projekte) oder als Netzwerkpfad (\\\\server\\Projekte).' });
    return out;
  }
  const rein = ohnePlatzhalter(v);
  if (e.art === 'pfad') {
    if (istAbsolut(v)) out.push({ art: 'fehler', text: 'Relativ zum Projektordner angeben, ohne Laufwerk, z. B. „03 Berechnungen“.' });
    const zeichen = [...new Set(rein.replace(/^[a-zA-Z]:/, '').match(UNZULAESSIG_PFAD) ?? [])];
    if (zeichen.length) out.push({ art: 'fehler', text: `Nicht erlaubt in Ordner- und Dateinamen: ${zeichen.join(' ')}` });
    const teile = v.split(/[\\/]+/).filter(Boolean);
    if (teile.some((t) => t === '..' || t === '.')) out.push({ art: 'fehler', text: '„.“ und „..“ sind als Ordner nicht erlaubt – der Pfad bleibt im Projektordner.' });
    const reserviert = teile.filter((t) => RESERVIERT.test(t));
    if (reserviert.length) out.push({ art: 'fehler', text: `Unter Windows reservierter Name: ${reserviert.join(', ')}` });
    if (teile.some((t) => /[. ]$/.test(t))) out.push({ art: 'hinweis', text: 'Punkte und Leerzeichen am Ende eines Namens entfallen unter Windows.' });
  } else {
    const zeichen = [...new Set(rein.match(UNZULAESSIG_NAME) ?? [])];
    if (zeichen.length) out.push({ art: 'fehler', text: `Nicht erlaubt im Dateinamen: ${zeichen.join(' ')}` });
    if (RESERVIERT.test(rein)) out.push({ art: 'fehler', text: `Unter Windows reservierter Name: ${v}` });
  }
  for (const h of e.hinweise?.(v) ?? []) out.push({ art: 'hinweis', text: h });
  const fremd = e.variablen ? unbekanntePlatzhalter(v, e.variablen) : [];
  if (fremd.length) out.push({ art: 'hinweis', text: `Unbekannter Platzhalter, bleibt so stehen: ${fremd.join(', ')}` });
  return out;
}

export const hatFehler = (m: PfadMeldung[]) => m.some((x) => x.art === 'fehler');
