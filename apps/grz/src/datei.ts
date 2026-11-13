import { ARCHIV_ENDUNG, readProjectFile } from '@core/archive';
import { APP_NAMEN } from '@core/appNamen';
import { buildFromIfc } from '@core/ifcImport';
import { projektAusIfc } from '@core/ifcAbgleich';
import type { Project } from '@core/model';
import { addDatei } from '@core/model';
import type { ProjektGespeichert } from '@core/platform/projektDatei';
import { projektDateiWaehlen, projektSpeichern, safeFileName } from '@core/platform/projektDatei';
import { ifcAktualisieren } from '@core/platform/ifcAktualisieren';
import { logger } from '@core/platform/log';
import { DateiLesenFehler, mitDatei } from '@core/platform/dateiFehler';
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
 * Projekt öffnen: Projektarchiv von QUADRIO (.oap), frühere JSON-Projektdateien
 * oder direkt ein IFC-Modell (Geschosse, BGF-Umrisse, Räume, Dach, Lageplan).
 */
export async function oeffnen(onProgress?: (msg: string) => void, bisher?: string | null): Promise<Geoeffnet | null> {
  const f = await projektDateiWaehlen({ mitIfc: true, datei: bisher });
  if (!f) return null;
  const bytes = f.bytes;
  if (/\.ifc$/i.test(f.name)) {
    onProgress?.('IFC-Modell wird gelesen …');
    const { loadIfc } = await import('@core/platform/ifc');
    const x = await loadIfc(bytes.slice(), onProgress).catch((e: unknown) => {
      throw new DateiLesenFehler(f.name, e);
    });
    onProgress?.('Gebäude und Lageplan werden ermittelt …');
    const r = buildFromIfc(x, { rooms: true, outlines: true, roof: true, wohnflaeche: false, dachform: true });
    let p = projektAusIfc(x.projectName || f.name.replace(/\.ifc$/i, ''), r);
    p = addDatei(p, f.name, 'ifc', bytes).project;
    log.info(`IFC übernommen: ${f.name}`, r.report);
    // noch keine Projektdatei (basis null): „Speichern“ fragt nach – Vorschlag im Ordner der IFC-Datei
    const ordner = f.pfad ? f.pfad.slice(0, f.pfad.length - f.name.length) : '';
    return { project: p, datei: `${ordner}${safeFileName(p.name)}.${ARCHIV_ENDUNG}`, basis: null, bericht: r.report };
  }
  const p = mitDatei(f.name, () => readProjectFile(bytes));
  log.info(`Projekt geöffnet: ${f.pfad ?? f.name}`);
  return { project: p, datei: f.pfad ?? f.name, basis: p, bericht: [] };
}

/** Speichert das Projekt als Archiv (.oap) – dieselbe Datei öffnet auch QUADRIO */
export function speichern(p: Project, datei: string | null, basis: Project | null, unter = false): Promise<ProjektGespeichert | null> {
  return projektSpeichern({ project: p, basis, datei, unter, app: `${APP_NAMEN.grz.name} ${__APP_VERSION__}`, fuerDatei: vorlage.mit });
}

/** Projekt mit einem neuen Export desselben IFC-Modells aktualisieren – Änderungen von Hand bleiben */
export async function ifcAktualisierenWaehlen(p: Project, datei: string | null, onProgress?: (msg: string) => void): Promise<{ project: Project; bericht: string[] } | null> {
  const r = await ifcAktualisieren(p, { optionen: { rooms: true, outlines: true, roof: true, wohnflaeche: false, dachform: true }, datei, onProgress });
  if (!r) return null;
  return { project: r.project, bericht: r.bericht };
}

/** Hinweise des IFC-Imports, die nur QUADRIO betreffen (BRI, Putzabzug, Wohnfläche, Geschossschnitte) */
const NUR_FLAECHENRECHNER =
  /\bBRI\b|Rauminhalt|Bodenplatte|UK Sohle|Putzabzug|Nettofläche|Wohnfläche|WoFlV|Wohnung|Zonenkategorie|Geschossschnitte|„Erkennen“|BGF bis zur Dachhaut|Dachform|Dachbauteil/;

export interface IfcBericht {
  titel: 'IFC-Import' | 'IFC-Abgleich';
  /** Zusammenfassung für TERRIO: Lageplan-Flächen, Geländemodell, Geschosse */
  zusammenfassung: string;
  zeilen: string[];
}

/** Bericht des IFC-Imports bzw. -Abgleichs auf TERRIO zugeschnitten */
export function ifcBericht(p: Project, zeilen: string[], art: 'import' | 'abgleich'): IfcBericht {
  const geschosse = p.storeys.filter((st) => st.shapes.some((x) => x.kind === 'outline')).map((st) => st.name);
  const lp = p.lageplan?.flaechen.length ?? 0;
  return {
    titel: art === 'import' ? 'IFC-Import' : 'IFC-Abgleich',
    zusammenfassung: `Lageplan: ${lp} ${lp === 1 ? 'Fläche' : 'Flächen'}, Geländemodell: ${p.gelaendeModell ? 'ja' : 'nein'}, Geschosse: ${geschosse.join(', ') || 'keine'}`,
    zeilen: zeilen.filter((z) => !NUR_FLAECHENRECHNER.test(z)),
  };
}
