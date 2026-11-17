import { useState } from 'react';
import type { ProjectMeta } from '@core/model';
import { Modal } from '@core/ui/Dialog';
import { PlanphaseWahl } from '@core/ui/Stammdaten';

/**
 * Planungsphase eines Projekts wechseln – aus dem Kontextmenü der Projektkarte, ohne den Assistenten zu öffnen.
 * Gespeichert wird nur `meta.planphase` in der Projektdatei.
 */
export function PlanphaseDialog({
  name,
  meta: anfang,
  namensschema,
  onUebernehmen,
  onAbbrechen,
}: {
  /** „BS9 EFH Musterweg“ – im Titel */
  name: string;
  meta: ProjectMeta;
  namensschema?: unknown;
  onUebernehmen: (kuerzel: string | null) => Promise<void> | void;
  onAbbrechen: () => void;
}) {
  const [meta, setMeta] = useState(anfang);
  const [laeuft, setLaeuft] = useState(false);
  const uebernehmen = async () => {
    setLaeuft(true);
    try {
      await onUebernehmen(meta.planphase ?? null);
    } finally {
      setLaeuft(false);
    }
  };
  return (
    <Modal titel={`Planungsphase – ${name}`} kopf className="po-phase-dialog" onClose={laeuft ? undefined : onAbbrechen}>
      <PlanphaseWahl meta={meta} onChange={setMeta} namensschema={namensschema} />
      <div className="dialog-buttons">
        <button onClick={onAbbrechen} disabled={laeuft}>
          Abbrechen
        </button>
        <button className="primary" disabled={laeuft || (meta.planphase ?? '') === (anfang.planphase ?? '')} onClick={() => void uebernehmen()}>
          Übernehmen
        </button>
      </div>
    </Modal>
  );
}
