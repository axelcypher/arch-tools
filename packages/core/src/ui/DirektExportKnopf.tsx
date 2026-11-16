import { useState } from 'react';
import { direktExportZielJetzt, type DirektExportAuftrag, type ExportDialogStart } from '../excel/direktExport';
import { isTauri } from '../platform/files';
import { pdfMoeglich } from '../platform/pdf';
import { direktExportMitMeldung } from './direktExport';
import type { MenuePunkt } from './Menue';
import { Symbol } from './Symbol';

/**
 * Knopf „Exportieren“ in der Kopfzeile von QUADRIO, TERRIO und NUMIO: speichert ohne Dialog mit der eingestellten
 * Vorlage im Berechnungsordner (Excel, bei „PDF mitspeichern“ auch PDF). Der Tooltip nennt Ziel und Formate; geht es
 * nicht direkt (Web, ungespeichert), sagt er das und der Knopf öffnet den Export-Dialog. Während des Exports gesperrt.
 */

export interface DirektExportProps {
  /** Auftrag zum Zeitpunkt des Klicks (aktuelles Projekt) */
  auftrag: () => DirektExportAuftrag;
  dialogOeffnen: (start: ExportDialogStart) => void;
  deaktiviert?: boolean;
  /** Grund für `deaktiviert`, z. B. „Erst Positionen anlegen“ */
  hinweisDeaktiviert?: string;
}

/** Tooltip: wohin und in welchen Formaten der Knopf speichert */
export function direktExportTitel(a: Pick<DirektExportAuftrag, 'app' | 'datei' | 'werte' | 'inhalt'>): string {
  if (!isTauri()) return 'Exportieren – öffnet den Export-Dialog (direkt in den Berechnungsordner speichern geht nur in der Desktop-App)';
  const z = direktExportZielJetzt(a);
  if ('grund' in z) return `Exportieren – öffnet den Export-Dialog: ${z.grund}`;
  const formate = z.pdf && pdfMoeglich() ? 'Excel und PDF' : 'Excel';
  return `${formate} mit der eingestellten Vorlage direkt in den Berechnungsordner speichern, ohne Dialog: ${z.ordner}`;
}

export function useDirektExport(p: DirektExportProps) {
  const [laeuft, setLaeuft] = useState(false);
  const ausfuehren = async () => {
    if (laeuft || p.deaktiviert) return;
    setLaeuft(true);
    try {
      await direktExportMitMeldung(p.auftrag(), (o) => p.dialogOeffnen({ art: 'excel', ...o }));
    } finally {
      setLaeuft(false);
    }
  };
  return { laeuft, ausfuehren };
}

export function DirektExportKnopf(p: DirektExportProps & { laeuft: boolean; ausfuehren: () => void }) {
  const titel = p.deaktiviert ? p.hinweisDeaktiviert : direktExportTitel(p.auftrag());
  return (
    <button onClick={p.ausfuehren} disabled={p.deaktiviert || p.laeuft} aria-busy={p.laeuft || undefined} aria-label="Exportieren" title={titel}>
      <Symbol name="export" /> <span className="tb-text">{p.laeuft ? 'Exportiere …' : 'Exportieren'}</span>
    </button>
  );
}

/** Untermenü „Datei ▸ Export“: Excel …, PDF … und – wo es ihn gibt – CSV … (öffnen jeweils den Dialog) */
export function exportUntermenue(o: { dialogOeffnen: (start: ExportDialogStart) => void; csv?: () => void; deaktiviert?: boolean; hinweis?: string }): MenuePunkt {
  const sperre = { deaktiviert: o.deaktiviert, hinweis: o.deaktiviert ? o.hinweis : undefined };
  return {
    text: 'Export',
    symbol: 'export',
    ...sperre,
    unter: [
      { text: 'Excel …', symbol: 'tabelle', titel: 'Excel-Datei speichern – Standardlayout oder eigene Vorlage, Speicherort frei wählbar', aktion: () => o.dialogOeffnen({ art: 'excel' }), ...sperre },
      {
        text: 'PDF …',
        symbol: 'formular',
        titel: pdfMoeglich() ? 'Die gefüllte Excel-Vorlage als PDF speichern (über Microsoft Excel bzw. LibreOffice)' : 'PDF aus der Excel-Vorlage gibt es nur in der Desktop-App',
        aktion: () => o.dialogOeffnen({ art: 'pdf' }),
        ...sperre,
      },
      ...(o.csv ? [{ text: 'CSV …', symbol: 'export' as const, titel: 'Als CSV-Datei speichern (z. B. für andere Programme)', aktion: o.csv, ...sperre }] : []),
    ],
  };
}
