import { computeProject } from '@core/calc';
import { ExcelDialog as Dialog } from '@core/ui/ExcelDialog';
import { QUADRIO_SCHEMA } from '../core/platzhalterSchema';
import { PlatzhalterReferenz } from '@core/excel/PlatzhalterReferenz';
import { vorlage } from '../platform/vorlage';
import { useEditor } from '../store/store';

/** Excel-Export von QUADRIO: Standardlayout oder eigene Vorlage (.xlsx mit Platzhaltern). */
export function ExcelDialog() {
  const setOpen = useEditor((s) => s.setExcelOpen);
  const project = useEditor((s) => s.project);
  const datei = useEditor((s) => s.datei);
  return (
    <Dialog
      project={project}
      update={(fn) => useEditor.getState().update(fn)}
      onClose={() => setOpen(false)}
      speicher={vorlage}
      standardText="Blätter DIN 277, NRF nach Nutzungsgruppen, Raumliste und Wohnflächen – mit Summenformeln."
      referenz={(zu) => <PlatzhalterReferenz schema={QUADRIO_SCHEMA} onClose={zu} />}
      pruefeVorlage={async (t, p) => (await import('../platform/excel')).pruefeMitVorlage(t, p, computeProject(p))}
      datei={datei}
      zusatz={() => 'WoFl+BGF+BRI'}
      musterName="Flächen-Vorlage.xlsx"
      exportDefault={async (p) => (await import('../platform/excel')).exportDefault(p, computeProject(p))}
      exportWithTemplate={async (t, p) => (await import('../platform/excel')).exportWithTemplate(t, p, computeProject(p))}
      buildSampleTemplate={async () => (await import('../platform/excel')).buildSampleTemplate()}
    />
  );
}
