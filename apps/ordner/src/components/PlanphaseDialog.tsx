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
  const unveraendert = (meta.planphase ?? '') === (anfang.planphase ?? '');
  const uebernehmen = async () => {
    setLaeuft(true);
    try {
      await onUebernehmen(meta.planphase ?? null);
    } finally {
      setLaeuft(false);
    }
  };
  return (
    <Modal titel={`Planungsphase – ${name}`} kopf onClose={laeuft ? undefined : onAbbrechen}>
      {/* Enter im Auswahlfeld übernimmt (Hauptknopf), wie in allen Dialogen */}
      <form
        className="po-phase-dialog"
        onSubmit={(e) => {
          e.preventDefault();
          if (!unveraendert) void uebernehmen();
        }}
        // Enter in einer Auswahl sendet Formulare in Chromium nicht von selbst ab
        onKeyDown={(e) => {
          if (e.key === 'Enter' && e.target instanceof HTMLSelectElement) {
            e.preventDefault();
            e.currentTarget.requestSubmit();
          }
        }}
      >
        <PlanphaseWahl meta={meta} onChange={setMeta} namensschema={namensschema} startfokus />
        <div className="dialog-buttons">
          <button type="button" onClick={onAbbrechen} disabled={laeuft}>
            Abbrechen
          </button>
          <button type="submit" className="primary" disabled={laeuft || unveraendert}>
            Übernehmen
          </button>
        </div>
      </form>
    </Modal>
  );
}
