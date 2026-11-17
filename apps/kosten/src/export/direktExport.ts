import { mitEingestellterVorlage, werteAusMeta, type DirektExportAuftrag } from '@core/excel/direktExport';
import type { Project } from '@core/model';
import { stufeLabel } from '../stufen';
import { useKosten } from '../store';
import { vorlage } from '../vorlage';

/** {Inhalt} im Dateinamen des Exports: die Stufe der Kostenermittlung, z. B. „Kostenschätzung“ */
export const exportInhalt = (p: Project) => stufeLabel(p.kosten?.stufe);

const excel = () => import('./excel');

/** Direktexport von NUMIO: aktuelles Projekt mit der eingestellten Vorlage */
export function exportAuftrag(): DirektExportAuftrag {
  const { project, datei } = useKosten.getState();
  return {
    app: 'kosten',
    datei,
    werte: werteAusMeta(project.meta, project.namensschema),
    inhalt: exportInhalt(project),
    erzeugen: mitEingestellterVorlage({
      vorlage: () => vorlage.aktuelle(project),
      projekt: project,
      exportWithTemplate: async (t, p) => (await excel()).exportWithTemplate(t, p),
      exportDefault: async (p) => (await excel()).exportDefault(p),
      pruefeVorlage: async (t, p) => (await excel()).pruefeMitVorlage(t, p),
    }),
  };
}
