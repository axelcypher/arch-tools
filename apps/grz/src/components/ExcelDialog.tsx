import { ExcelDialog as Dialog } from '@core/ui/ExcelDialog';
import { TERRIO_SCHEMA } from '../export/platzhalterSchema';
import { PlatzhalterReferenz } from '@core/excel/PlatzhalterReferenz';
import { useGrz } from '../store';
import { vorlage } from '../vorlage';

/** Excel-Export des GRZ-Nachweises: Standardlayout oder eigene Vorlage (.xlsx mit Platzhaltern). */
export function ExcelDialog({ onClose }: { onClose: () => void }) {
  const project = useGrz((s) => s.project);
  const datei = useGrz((s) => s.datei);
  return (
    <Dialog
      project={project}
      update={(fn) => useGrz.getState().update(fn, undefined, 'Excel-Vorlage ändern')}
      onClose={onClose}
      speicher={vorlage}
      standardText="Blatt „GRZ GFZ“: Grundlagen, Kennzahlen, Vollgeschosse, Geschossfläche, Flächenbilanz, Lageplan-Flächen und Hinweise – mit Summenformeln."
      referenz={(zu) => <PlatzhalterReferenz schema={TERRIO_SCHEMA} onClose={zu} />}
      pruefeVorlage={async (t, p) => (await import('../export/excel')).pruefeMitVorlage(t, p)}
      datei={datei}
      zusatz={() => 'GRZ+GFZ'}
      musterName="GRZ-Vorlage.xlsx"
      exportDefault={async (p) => (await import('../export/excel')).exportDefault(p)}
      exportWithTemplate={async (t, p) => (await import('../export/excel')).exportWithTemplate(t, p)}
      buildSampleTemplate={async () => (await import('../export/excel')).buildSampleTemplate()}
    />
  );
}
