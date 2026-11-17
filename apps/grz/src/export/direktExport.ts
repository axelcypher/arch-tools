import { mitEingestellterVorlage, werteAusMeta, type DirektExportAuftrag } from '@core/excel/direktExport';
import { useGrz } from '../store';
import { vorlage } from '../vorlage';

/** {Inhalt} im Dateinamen des Exports */
export const EXPORT_INHALT = 'GRZ-Nachweis';

const excel = () => import('./excel');

/** Direktexport von TERRIO: aktuelles Projekt mit der eingestellten Vorlage */
export function exportAuftrag(): DirektExportAuftrag {
  const { project, datei } = useGrz.getState();
  return {
    app: 'grz',
    datei,
    werte: werteAusMeta(project.meta, project.namensschema),
    inhalt: EXPORT_INHALT,
    erzeugen: mitEingestellterVorlage({
      vorlage: () => vorlage.aktuelle(project),
      projekt: project,
      exportWithTemplate: async (t, p) => (await excel()).exportWithTemplate(t, p),
      exportDefault: async (p) => (await excel()).exportDefault(p),
      pruefeVorlage: async (t, p) => (await excel()).pruefeMitVorlage(t, p),
    }),
  };
}
