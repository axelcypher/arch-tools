import { ARCHIV_ENDUNG, readProjectFile } from '@core/archive';
import { buildFromIfc } from '@core/ifcImport';
import type { Project } from '@core/model';
import { addDatei, createProject } from '@core/model';
import type { ProjektGespeichert } from '@core/platform/projektDatei';
import { projektDateiWaehlen, projektSpeichern, safeFileName } from '@core/platform/projektDatei';
import { ifcAktualisieren } from '@core/platform/ifcAktualisieren';
import { logger } from '@core/platform/log';
import { bauteileAusModell } from './bauteile';
import { vorlage } from './vorlage';

const log = logger('datei');

export interface Geoeffnet {
  project: Project;
  datei: string;
  /** Stand der Datei (null beim IFC-Import) */
  basis: Project | null;
  /** Hinweise aus dem IFC-Import */
  bericht: string[];
}

/**
 * Projekt öffnen: Projektarchiv des Flächenrechners (.oap), frühere JSON-Projektdateien
 * oder direkt ein IFC-Modell (Geschosse, BGF-Umrisse, Räume mit Wohnflächen, Dach, Lageplan).
 */
export async function oeffnen(onProgress?: (msg: string) => void, bisher?: string | null): Promise<Geoeffnet | null> {
  const f = await projektDateiWaehlen({ mitIfc: true, datei: bisher });
  if (!f) return null;
  const bytes = f.bytes;
  if (/\.ifc$/i.test(f.name)) {
    onProgress?.('IFC-Modell wird gelesen …');
    const { loadIfc } = await import('@core/platform/ifc');
    const x = await loadIfc(bytes.slice(), onProgress);
    onProgress?.('Gebäude und Flächen werden ermittelt …');
    const r = buildFromIfc(x, { rooms: true, outlines: true, roof: true, wohnflaeche: true, dachform: true });
    let p = createProject(x.projectName || f.name.replace(/\.ifc$/i, ''));
    p.storeys = r.storeys;
    p.dachModell = r.dachModell;
    if (r.gelaendeModell) p.gelaendeModell = r.gelaendeModell;
    if (r.lageplan) p.lageplan = r.lageplan;
    p = addDatei(p, f.name, 'ifc', bytes).project;
    bauteileAusModell(p, x);
    log.info(`IFC übernommen: ${f.name}`, r.report);
    // noch keine Projektdatei (basis null): „Speichern“ fragt nach – Vorschlag im Ordner der IFC-Datei
    const ordner = f.pfad ? f.pfad.slice(0, f.pfad.length - f.name.length) : '';
    return { project: p, datei: `${ordner}${safeFileName(p.name)}.${ARCHIV_ENDUNG}`, basis: null, bericht: r.report };
  }
  const p = readProjectFile(bytes);
  log.info(`Projekt geöffnet: ${f.pfad ?? f.name}`);
  return { project: p, datei: f.pfad ?? f.name, basis: p, bericht: [] };
}

/** Speichert das Projekt als Archiv (.oap) – dieselbe Datei öffnen auch Flächenrechner und GRZ-Nachweis */
export function speichern(p: Project, datei: string | null, basis: Project | null, unter = false): Promise<ProjektGespeichert | null> {
  return projektSpeichern({ project: p, basis, datei, unter, app: `Kostenermittlung ${__APP_VERSION__}`, fuerDatei: vorlage.mit });
}

/** Projekt mit einem neuen Export desselben IFC-Modells aktualisieren – Änderungen von Hand bleiben */
export async function ifcAktualisierenWaehlen(p: Project, datei: string | null, onProgress?: (msg: string) => void): Promise<{ project: Project; bericht: string[] } | null> {
  const r = await ifcAktualisieren(p, { optionen: { rooms: true, outlines: true, roof: true, wohnflaeche: true, dachform: true }, datei, onProgress });
  if (!r) return null;
  bauteileAusModell(r.project, r.extract);
  return { project: r.project, bericht: r.bericht };
}
