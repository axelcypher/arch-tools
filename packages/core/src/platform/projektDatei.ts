import { ARCHIV_ENDUNG, readProjectFile, writeArchive } from '../archive';
import type { Project } from '../model';
import { gleich, gleichesProjekt, zusammenfuehren } from '../zusammenfuehren';
import type { GewaehlteDatei } from './files';
import { dateiname, istPfad, ohneEndung, openFileWithPath, ordnerVon, saveMergedFile } from './files';
import { logger } from './log';

const log = logger('datei');

/**
 * Projektdatei der Apps (Flächenrechner, GRZ-Nachweis, Kostenermittlung): Öffnen, Speichern und
 * Speichern unter, Dateinamen für Exporte.
 *
 * `datei` ist auf dem Desktop der vollständige Pfad der geöffneten bzw. zuletzt gespeicherten Datei –
 * „Speichern“ schreibt dann ohne Rückfrage dorthin. Im Browser ist es nur der Dateiname (Download).
 */

export interface ProjektGespeichert {
  /** vollständiger Pfad (Desktop) bzw. Dateiname (Browser) */
  datei: string;
  /** das gespeicherte Projekt – mit den Änderungen, die eine andere App inzwischen in der Datei gespeichert hat */
  project: Project;
  /** true, wenn Änderungen aus der Datei übernommen wurden */
  zusammengefuehrt: boolean;
}

/**
 * Stand nach dem Speichern. `vorher` ist das Projekt, das gespeichert wurde, `gespeichert` das tatsächlich
 * geschriebene (ggf. mit Änderungen anderer Apps), `aktuell` der Stand jetzt. Wurde während des Speicherns
 * (Dialog, Schreiben) weitergearbeitet, werden die Änderungen aus der Datei in den aktuellen Stand übernommen –
 * sonst würde das nächste Speichern sie mit dem älteren eigenen Stand wieder überschreiben.
 */
export function standNachSpeichern(aktuell: Project, vorher: Project, gespeichert: Project): { project: Project; dirty: boolean; verlaufVerwerfen: boolean } {
  if (aktuell === vorher) return { project: gespeichert, dirty: false, verlaufVerwerfen: gespeichert !== aktuell };
  if (gespeichert === vorher) return { project: aktuell, dirty: true, verlaufVerwerfen: false };
  const project = zusammenfuehren(vorher, aktuell, gespeichert);
  const neu = !gleich(project, aktuell);
  return { project: neu ? project : aktuell, dirty: true, verlaufVerwerfen: neu };
}

let speichertGerade = false;
let laufend: Promise<unknown> = Promise.resolve();

/** Läuft gerade ein Speichervorgang? */
export function speichernLaeuft(): boolean {
  return speichertGerade;
}

/**
 * Wartet, bis ein laufendes Speichern fertig ist. Die Apps rufen das vor dem Speichern auf: Ein zweites Strg+S
 * während des ersten speichert danach den dann aktuellen Stand (statt verworfen zu werden).
 */
export async function speichernAbwarten(): Promise<void> {
  while (speichertGerade) await laufend.catch(() => undefined);
}

export function safeFileName(name: string) {
  return name.replace(/[\\/:*?"<>|]+/g, '_').trim() || 'Projekt';
}

/** Projektdatei bzw. IFC-Modell öffnen (Desktop: nativer Dialog mit Pfad) */
export function projektDateiWaehlen(o: { mitIfc?: boolean; datei?: string | null } = {}): Promise<GewaehlteDatei | null> {
  return openFileWithPath({
    filterName: o.mitIfc ? 'Projekt oder IFC-Modell' : 'Projekt',
    extensions: [ARCHIV_ENDUNG, 'json', ...(o.mitIfc ? ['ifc'] : [])],
    defaultDir: ordnerVon(o.datei),
  });
}

/**
 * Speichert das Projekt als Archiv (.oap). Mit bekanntem Pfad, Basis und ohne `unter` direkt in diese Datei,
 * sonst über den Speichern-Dialog (Vorschlag: bisheriger Dateiname im bisherigen Ordner, sonst der
 * Projektname). Steht in der Zieldatei bereits dasselbe Projekt, werden Änderungen anderer Apps
 * übernommen statt überschrieben (siehe zusammenfuehren.ts). `basis` ist das Projekt, wie es zuletzt
 * geöffnet bzw. gespeichert wurde; ohne Basis wird die Datei ersetzt.
 */
export async function projektSpeichern(o: {
  project: Project;
  basis: Project | null;
  /** Pfad bzw. Name der geöffneten/zuletzt gespeicherten Datei */
  datei?: string | null;
  /** „Speichern unter …“: immer den Dialog zeigen */
  unter?: boolean;
  /** App und Version fürs Manifest */
  app: string;
  filterName?: string;
  /** Ergänzungen nur für die Datei (z. B. die im Browser hinterlegte Excel-Vorlage) */
  fuerDatei?: (p: Project) => Project;
}): Promise<ProjektGespeichert | null> {
  // zweites Speichern während des ersten (Strg+S doppelt): würde die halb geschriebene Datei lesen
  if (speichertGerade) {
    log.info('Speichern läuft bereits – ignoriert');
    return null;
  }
  speichertGerade = true;
  const p = speichernIntern(o);
  laufend = p;
  try {
    return await p;
  } finally {
    speichertGerade = false;
  }
}

async function speichernIntern(o: Parameters<typeof projektSpeichern>[0]): Promise<ProjektGespeichert | null> {
  // Dateien, die erst fuerDatei ergänzt (z. B. die globale Excel-Vorlage) – nicht Teil des Projekts in der App.
  // Gleich heißt: gleiche Art, gleicher Name, gleicher Inhalt; eine andere Vorlage (etwa die projektbezogene eines
  // Kollegen) ist eine echte Änderung und bleibt erhalten.
  const eigeneIds = new Set((o.project.dateien ?? []).map((d) => d.id));
  const zusatz = ((o.fuerDatei ? o.fuerDatei(o.project) : o.project).dateien ?? []).filter((d) => !eigeneIds.has(d.id));
  const istZusatz = (d: NonNullable<Project['dateien']>[number]) => !eigeneIds.has(d.id) && zusatz.some((z) => z.art === d.art && z.name === d.name && gleich(z.daten, d.daten));
  const ohneZusatz = (p: Project): Project => {
    if (!zusatz.length) return p;
    const dateien = (p.dateien ?? []).filter((d) => !istZusatz(d));
    const { dateien: _weg, ...rest } = p;
    void _weg;
    return dateien.length ? { ...rest, dateien } : (rest as Project);
  };
  const bisher = o.datei && /\.oap$/i.test(o.datei) ? o.datei : null;
  const vorschlag = bisher ? dateiname(bisher) : `${safeFileName(o.datei ? ohneEndung(dateiname(o.datei)) : o.project.name)}.${ARCHIV_ENDUNG}`;
  let project = o.project;
  let zusammengefuehrt = false;
  const datei = await saveMergedFile({
    defaultName: vorschlag,
    defaultDir: ordnerVon(o.datei),
    // ohne Rückfrage nur in eine Datei, aus der das Projekt stammt (basis) – ein neues Projekt (z. B. aus
    // einer IFC übernommen) könnte sonst eine fremde Datei gleichen Namens überschreiben
    pfad: !o.unter && o.basis && bisher && istPfad(bisher) ? bisher : null,
    filterName: o.filterName ?? 'Projekt',
    extension: ARCHIV_ENDUNG,
    mime: 'application/zip',
    build: (vorhanden) => {
      if (vorhanden && o.basis) {
        try {
          const aufPlatte = readProjectFile(vorhanden);
          if (gleichesProjekt(o.basis, aufPlatte)) {
            project = zusammenfuehren(o.basis, o.project, aufPlatte);
            // nur Ergänzungen für die Datei (z. B. die globale Excel-Vorlage aus dem letzten Speichern) zählen nicht
            // als Änderung – sonst ginge nach jedem Speichern der Verlauf (Rückgängig) verloren
            zusammengefuehrt = !gleich(ohneZusatz(project), ohneZusatz(o.project));
            if (!zusammengefuehrt) project = o.project;
            if (zusammengefuehrt) log.info('Änderungen anderer Apps aus der Datei übernommen', { name: o.project.name });
          }
        } catch (e) {
          // vorhandene Datei unlesbar oder kein Projekt – sie wird ersetzt
          log.warn('Vorhandene Datei nicht lesbar, sie wird ersetzt', e);
        }
      }
      return writeArchive(o.fuerDatei ? o.fuerDatei(project) : project, { app: o.app });
    },
  });
  if (datei) log.info('Projekt gespeichert', { datei, zusammengefuehrt });
  return datei ? { datei, project, zusammengefuehrt } : null;
}

/**
 * Vorschlag für Exportdateien: „<Dateiname des Projekts> <Zusatz>.<Endung>“, z. B.
 * „Haus Müller WoFl+BGF+BRI.xlsx“. Ohne gespeicherte Projektdatei gilt der Projektname.
 */
export function exportDateiname(o: { datei?: string | null; projektName: string; zusatz: string; endung: string }): string {
  const basis = o.datei ? ohneEndung(dateiname(o.datei)) : o.projektName;
  return `${safeFileName(basis)} ${o.zusatz}.${o.endung}`.replace(/\s+/g, ' ');
}

/** Ordner, in dem Export-Dialoge starten: der Ordner der Projektdatei (nur Desktop) */
export function exportOrdner(datei?: string | null): string | null {
  return ordnerVon(datei);
}

/**
 * Drucken bzw. „Als PDF speichern“: Der Druckdialog schlägt den Dokumenttitel als Dateinamen vor –
 * für die Dauer des Drucks wird er auf den Exportnamen gesetzt (ohne Endung).
 */
export function druckenAls(o: { datei?: string | null; projektName: string; zusatz: string }) {
  const vorher = document.title;
  document.title = ohneEndung(exportDateiname({ ...o, endung: 'pdf' }));
  const zurueck = () => {
    document.title = vorher;
    window.removeEventListener('afterprint', zurueck);
  };
  window.addEventListener('afterprint', zurueck);
  window.print();
  // Browser ohne afterprint-Ereignis: spätestens nach dem (blockierenden) Druckaufruf zurücksetzen
  setTimeout(zurueck, 1000);
}
