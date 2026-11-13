import type { DateiArt, Project } from '../model';
import { addDatei } from '../model';
import { unzipSync } from 'fflate';
import { base64ToBytes, bytesToBase64 } from '../platform/files';

/**
 * Excel-Vorlage einer App: Sie gehört zum Projekt (Project.dateien, eigene Art je App) und wird im
 * Projektarchiv mitgespeichert. Zusätzlich bleibt die zuletzt gewählte Vorlage im Browser hinterlegt und
 * gilt für Projekte ohne eigene Vorlage – beim Speichern wandert sie dann mit ins Archiv.
 */

export interface Vorlage {
  name: string;
  daten: Uint8Array;
  datum: string;
  /** aus dem Projekt (sonst die im Browser hinterlegte) */
  ausProjekt: boolean;
}

interface StoredTemplate {
  name: string;
  base64: string;
  date: string;
}

export interface VorlagenSpeicher {
  art: Extract<DateiArt, 'vorlage' | 'vorlage-grz' | 'vorlage-kosten'>;
  globale(): Vorlage | null;
  /** Liefert false, wenn die Vorlage zu groß für den Browserspeicher ist. */
  setGlobale(name: string, daten: Uint8Array): boolean;
  removeGlobale(): void;
  aktuelle(p: Project): Vorlage | null;
  /** Projekt mit Vorlage fürs Archiv: ohne eigene Vorlage wird die hinterlegte übernommen. */
  mit(p: Project): Project;
  /** Vorlage ins Projekt übernehmen */
  setzen(p: Project, name: string, daten: Uint8Array): Project;
  /** Vorlage aus dem Projekt entfernen */
  entfernen(p: Project): Project;
}

export function vorlagenSpeicher(art: VorlagenSpeicher['art'], key: string): VorlagenSpeicher {
  const globale = (): Vorlage | null => {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return null;
      const t = JSON.parse(raw) as StoredTemplate;
      return { name: t.name, daten: base64ToBytes(t.base64), datum: t.date, ausProjekt: false };
    } catch {
      return null;
    }
  };
  return {
    art,
    globale,
    setGlobale(name, daten) {
      const t: StoredTemplate = { name, base64: bytesToBase64(daten), date: new Date().toLocaleDateString('de-DE') };
      try {
        localStorage.setItem(key, JSON.stringify(t));
        return true;
      } catch {
        return false;
      }
    },
    removeGlobale() {
      try {
        localStorage.removeItem(key);
      } catch {
        // ignorieren
      }
    },
    aktuelle(p) {
      const d = p.dateien?.find((x) => x.art === art);
      return d ? { name: d.name, daten: d.daten, datum: d.datum, ausProjekt: true } : globale();
    },
    mit(p) {
      if (p.dateien?.some((x) => x.art === art)) return p;
      const g = globale();
      return g ? addDatei(p, g.name, art, g.daten).project : p;
    },
    setzen: (p, name, daten) => addDatei(p, name, art, daten).project,
    entfernen: (p) => (p.dateien?.some((d) => d.art === art) ? { ...p, dateien: p.dateien.filter((d) => d.art !== art) } : p),
  };
}

/**
 * Prüft eine gewählte Vorlage, bevor sie übernommen wird: `fehler` – keine gültige Excel-Datei (.xlsx ist ein
 * ZIP-Archiv mit xl/workbook.xml); `hinweis` – gültig, aber ohne Platzhalter ({{…}}), der Export wäre nur eine Kopie.
 */
export function vorlagePruefen(daten: Uint8Array): { fehler?: string; hinweis?: string } {
  let dateien: Record<string, Uint8Array>;
  try {
    dateien = unzipSync(daten, { filter: (f) => f.name === 'xl/workbook.xml' || f.name === 'xl/sharedStrings.xml' || /^xl\/worksheets\/[^/]+\.xml$/.test(f.name) });
  } catch {
    return { fehler: 'Die Datei ist keine gültige Excel-Datei (.xlsx) – sie lässt sich nicht öffnen.' };
  }
  if (!dateien['xl/workbook.xml']) return { fehler: 'Die Datei ist keine gültige Excel-Datei (.xlsx) – es fehlt die Arbeitsmappe.' };
  const text = new TextDecoder();
  const mitPlatzhalter = Object.entries(dateien).some(([name, d]) => name !== 'xl/workbook.xml' && text.decode(d).includes('{{'));
  return mitPlatzhalter ? {} : { hinweis: 'In der Vorlage wurden keine Platzhalter ({{…}}) gefunden – der Export enthielte nur die Vorlage selbst. „Platzhalter anzeigen“ listet, was möglich ist.' };
}
