import { ExcelDialog as Dialog } from '@core/ui/ExcelDialog';
import { NUMIO_SCHEMA } from '../export/platzhalterSchema';
import { PlatzhalterReferenz } from '@core/excel/PlatzhalterReferenz';
import { stufeLabel } from '../stufen';
import { useKosten } from '../store';
import { vorlage } from '../vorlage';
import { werteAusMeta, type ExportDialogStart } from '@core/excel/direktExport';
import { exportInhalt } from '../export/direktExport';

/** Export-Dialog der Kostenermittlung (Excel bzw. PDF): Standardlayout oder eigene Vorlage (.xlsx mit Platzhaltern). */
export function ExcelDialog({ onClose, start }: { onClose: () => void; start: ExportDialogStart }) {
  const project = useKosten((s) => s.project);
  const datei = useKosten((s) => s.datei);
  return (
    <Dialog
      project={project}
      update={(fn) => useKosten.getState().update(fn)}
      onClose={onClose}
      art={start.art}
      grund={start.grund}
      hinweise={start.hinweise}
      benennung={{ app: 'kosten', werte: werteAusMeta(project.meta), inhalt: exportInhalt(project) }}
      speicher={vorlage}
      standardText="Blatt „Kosten“: Grundlagen, Kostenübersicht nach Kostengruppen mit Bandbreite, Kennwerte des Bauwerks, Positionen, Mengen, Kostenstände und Hinweise – mit Summenformeln."
      referenz={(zu) => <PlatzhalterReferenz schema={NUMIO_SCHEMA} onClose={zu} />}
      pruefeVorlage={async (t, p) => (await import('../export/excel')).pruefeMitVorlage(t, p)}
      datei={datei}
      zusatz={(p) => `Kosten ${stufeLabel(p.kosten?.stufe)}`}
      musterName="Kosten-Vorlage.xlsx"
      exportDefault={async (p) => (await import('../export/excel')).exportDefault(p)}
      exportWithTemplate={async (t, p) => (await import('../export/excel')).exportWithTemplate(t, p)}
      buildSampleTemplate={async () => (await import('../export/excel')).buildSampleTemplate()}
    />
  );
}
