import type { IfcExtract } from '../ifcData';
import type { IfcImportOptions } from '../ifcImport';
import { buildFromIfc } from '../ifcImport';
import { ifcAbgleichen } from '../ifcAbgleich';
import type { Project } from '../model';
import { addDatei } from '../model';
import { openFileWithPath, ordnerVon } from './files';
import { logger } from './log';

const log = logger('ifc');

/** Ersetzt die mitgespeicherte IFC-Datei (gleicher Name bzw. die einzige vorhandene) durch die neue */
export function ifcDateiErsetzen(p: Project, name: string, daten: Uint8Array): Project {
  const ifcs = (p.dateien ?? []).filter((d) => d.art === 'ifc');
  const gleicherName = ifcs.filter((d) => d.name === name);
  const weg = gleicherName.length ? gleicherName : ifcs.length === 1 ? ifcs : [];
  return addDatei({ ...p, dateien: (p.dateien ?? []).filter((d) => !weg.includes(d)) }, name, 'ifc', daten).project;
}

/**
 * IFC-Datei wählen und das Projekt damit aktualisieren (Abgleich über die GlobalIds, siehe ifcAbgleich.ts) –
 * für GRZ-Nachweis und Kostenermittlung. Liefert null bei Abbruch.
 */
export async function ifcAktualisieren(
  p: Project,
  o: { optionen: IfcImportOptions; datei?: string | null; onProgress?: (msg: string) => void },
): Promise<{ project: Project; bericht: string[]; extract: IfcExtract } | null> {
  const f = await openFileWithPath({ filterName: 'IFC-Modell', extensions: ['ifc'], defaultDir: ordnerVon(o.datei) });
  if (!f) return null;
  o.onProgress?.('IFC-Modell wird gelesen …');
  const { loadIfc } = await import('./ifc');
  const x = await loadIfc(f.bytes.slice(), o.onProgress);
  o.onProgress?.('Abgleich mit dem Projekt …');
  const r = buildFromIfc(x, o.optionen);
  const a = ifcAbgleichen(p, r, { raeume: o.optionen.rooms, umrisse: o.optionen.outlines, modelle: o.optionen.roof, lageplan: true, plaene: false });
  log.info(`IFC abgeglichen: ${f.name}`, a.zaehler);
  return { project: ifcDateiErsetzen(a.project, f.name, f.bytes), bericht: a.bericht, extract: x };
}
