import { useCallback } from 'react';
import type { ProjektordnerZugriff } from '@core/platform/projektordner';
import { useProjektordnerListe } from '@core/ui/projektListe';
import { ProjektUebersicht } from '@core/ui/ProjektUebersicht';
import { ausOrdnername } from '../nummer';
import { useOrdner } from '../store';

/**
 * Startseite des Assistenten: die gemeinsame Projektübersicht aller Apps – zuletzt geöffnet, darunter die
 * Projektordner je Stammordner. Titel und Marken kommen aus der Projektdatei (nur projekt.json, im Hintergrund
 * nachgeladen, zuletzt geöffnete zuerst). „Neues Projekt“ steht im Kopf.
 */
export function ProjektStart({
  fs,
  entwurf,
  onNeu,
  onLeerNeu,
  onOeffnen,
  onAndererOrdner,
  onEinstellungen,
}: {
  fs: ProjektordnerZugriff;
  /** angefangenes neues Projekt („2026-014 EFH Musterweg“), leer ohne */
  entwurf: string;
  onNeu: () => void;
  onLeerNeu: () => void;
  onOeffnen: (pfad: string) => void;
  onAndererOrdner: () => void;
  onEinstellungen?: () => void;
}) {
  const { allgemein, struktur } = useOrdner();
  // Nummer und Kurzname aus dem Ordnernamen nach dem Schema der Struktur
  const ausName = useCallback((name: string) => ausOrdnername(struktur.ordnername, name), [struktur.ordnername]);
  const liste = useProjektordnerListe(fs, allgemein.projekte, ausName);

  return (
    <ProjektUebersicht
      titel="Projekte"
      gruppen={liste.gruppen}
      projekte={liste.projekte}
      zuletzt={liste.zuletzt}
      sucht={liste.sucht}
      fehler={liste.fehler}
      onOeffnen={(p) => onOeffnen(p.schluessel)}
      onNeuLaden={liste.neuLaden}
      onEinstellungen={onEinstellungen}
      marken={liste.marken}
      kopf={
        <>
          <button className="primary" onClick={onNeu} title="Assistent für ein neues Projekt: Stammdaten, Umfang, Vorlagen, Anlegen">
            {entwurf ? `Weiter mit ${entwurf}` : 'Neues Projekt'}
          </button>
          {entwurf && <button onClick={onLeerNeu}>Neues Projekt (leer)</button>}
          <button onClick={onAndererOrdner} title="Einen Projektordner außerhalb der Stammordner ergänzen">
            Anderen Ordner …
          </button>
        </>
      }
    />
  );
}
