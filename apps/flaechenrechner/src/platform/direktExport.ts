import { computeProject } from '@core/calc';
import { mitEingestellterVorlage, werteAusMeta, type DirektExportAuftrag } from '@core/excel/direktExport';
import { useEditor } from '../store/store';
import { vorlage } from './vorlage';

/** {Inhalt} im Dateinamen des Exports */
export const EXPORT_INHALT = 'Flächenaufstellung';

const excel = () => import('./excel');

/** Direktexport von QUADRIO: aktuelles Projekt mit der eingestellten Vorlage */
export function exportAuftrag(): DirektExportAuftrag {
  const { project, datei } = useEditor.getState();
  return {
    app: 'flaechenrechner',
    datei,
    werte: werteAusMeta(project.meta),
    inhalt: EXPORT_INHALT,
    erzeugen: mitEingestellterVorlage({
      vorlage: vorlage.aktuelle(project),
      projekt: project,
      exportWithTemplate: async (t, p) => (await excel()).exportWithTemplate(t, p, computeProject(p)),
      exportDefault: async (p) => (await excel()).exportDefault(p, computeProject(p)),
      pruefeVorlage: async (t, p) => (await excel()).pruefeMitVorlage(t, p, computeProject(p)),
    }),
  };
}
