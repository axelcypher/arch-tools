import { useRef, useState } from 'react';
import { usePfadWerte } from '../einstellungen/pfade';
import { direktExportZielJetzt, GRUND_KEIN_PROJEKTORDNER, GRUND_UNGESPEICHERT, GRUND_WEB, type DirektExportAuftrag, type ExportDialogStart } from '../excel/direktExport';
import { isTauri } from '../platform/files';
import { pdfMoeglich } from '../platform/pdf';
import { direktExportMitMeldung } from './direktExport';
import type { MenuePunkt } from './Menue';
import { Symbol } from './Symbol';

/**
 * Knopf „Exportieren“ in der Leiste von QUADRIO, TERRIO und NUMIO (docs/design.md, „Direkter Export“): speichert ohne
 * Dialog mit der eingestellten Vorlage im Berechnungsordner (Excel, bei „PDF mitspeichern“ auch PDF). `title` nennt
 * Ziel und Formate. Fehlt etwas, ist er gesperrt (`aria-disabled`, bleibt per Tastatur erreichbar) und `title` nennt
 * den Grund; während des Exports ebenso.
 */

export interface DirektExportProps {
  /** Auftrag zum Zeitpunkt des Klicks (aktuelles Projekt) */
  auftrag: () => DirektExportAuftrag;
  dialogOeffnen: (start: ExportDialogStart) => void;
  /** von der App gesperrt (z. B. ohne Positionen) … */
  deaktiviert?: boolean;
  /** … mit diesem Grund, z. B. „Erst Positionen anlegen“ */
  hinweisDeaktiviert?: string;
}

/** Zustand des Knopfs: bereit oder gesperrt mit Grund; `titel` für den Tooltip */
export function direktExportZustand(p: Pick<DirektExportProps, 'auftrag' | 'deaktiviert' | 'hinweisDeaktiviert'>): { bereit: boolean; grund?: string; titel: string } {
  if (p.deaktiviert) return { bereit: false, grund: p.hinweisDeaktiviert, titel: p.hinweisDeaktiviert ?? 'Exportieren' };
  const z = direktExportZielJetzt(p.auftrag(), isTauri());
  if ('grund' in z) return { bereit: false, grund: z.grund, titel: z.grund };
  const formate = z.pdf && pdfMoeglich() ? 'Excel und PDF' : 'Excel';
  return { bereit: true, titel: `Als ${formate} in „${z.ordner}“ speichern (eingestellte Vorlage, ohne Dialog)` };
}

export function useDirektExport(p: DirektExportProps) {
  const [laeuft, setLaeuft] = useState(false);
  // Sperre ohne Umweg über den Zustand: zwei Auslösungen vor dem nächsten Rendern (Doppelklick) starten nur einen Export
  const sperre = useRef(false);
  // Tooltip und Sperre hängen an den Einstellungen („Pfade und Benennung“) – bei Änderungen neu rendern
  usePfadWerte();
  const zustand = direktExportZustand(p);
  const ausfuehren = async () => {
    if (sperre.current || !direktExportZustand(p).bereit) return;
    sperre.current = true;
    setLaeuft(true);
    try {
      await direktExportMitMeldung(p.auftrag(), (hinweise) => p.dialogOeffnen({ art: 'excel', hinweise }));
    } finally {
      sperre.current = false;
      setLaeuft(false);
    }
  };
  /** Eintrag für das Überlaufmenü „Mehr“ */
  const menue: MenuePunkt = {
    text: laeuft ? 'Exportiere …' : 'Exportieren',
    symbol: 'export',
    titel: zustand.titel,
    deaktiviert: !zustand.bereit || laeuft,
    hinweis: zustand.bereit ? undefined : kurzGrund(zustand.grund),
    aktion: () => void ausfuehren(),
  };
  return { laeuft, ausfuehren, zustand, menue };
}

/** kurzer Grund neben dem Menüpunkt (der volle steht im Tooltip) */
const kurzGrund = (grund?: string) =>
  grund === GRUND_WEB ? 'nur Desktop-App' : grund === GRUND_UNGESPEICHERT ? 'Projekt erst speichern' : grund === GRUND_KEIN_PROJEKTORDNER ? 'kein Berechnungsordner' : grund;

export function DirektExportKnopf({ laeuft, ausfuehren, zustand }: { laeuft: boolean; ausfuehren: () => void; zustand: { bereit: boolean; titel: string } }) {
  const text = laeuft ? 'Exportiere …' : 'Exportieren';
  return (
    <button onClick={ausfuehren} aria-disabled={!zustand.bereit || laeuft || undefined} aria-busy={laeuft || undefined} aria-label={text} title={zustand.titel}>
      <Symbol name="export" /> <span className="tb-text">{text}</span>
    </button>
  );
}

/** Untermenü „Datei → Exportieren“: Excel …, PDF … und – wo es ihn gibt – CSV … (öffnen jeweils den Dialog) */
export function exportUntermenue(o: { dialogOeffnen: (start: ExportDialogStart) => void; csv?: () => void; deaktiviert?: boolean; hinweis?: string }): MenuePunkt {
  const sperre = { deaktiviert: o.deaktiviert, hinweis: o.deaktiviert ? o.hinweis : undefined };
  return {
    text: 'Exportieren',
    symbol: 'export',
    ...sperre,
    unter: [
      { text: 'Excel …', symbol: 'tabelle', titel: 'Excel-Datei speichern – Standardlayout oder eigene Vorlage, Speicherort frei wählbar', aktion: () => o.dialogOeffnen({ art: 'excel' }) },
      {
        text: 'PDF …',
        symbol: 'formular',
        titel: pdfMoeglich() ? 'Die gefüllte Excel-Vorlage als PDF speichern (über Microsoft Excel bzw. LibreOffice)' : 'PDF aus der Excel-Vorlage gibt es nur in der Desktop-App',
        aktion: () => o.dialogOeffnen({ art: 'pdf' }),
        ...(pdfMoeglich() ? {} : { deaktiviert: true, hinweis: 'nur Desktop-App' }),
      },
      ...(o.csv ? [{ text: 'CSV …', symbol: 'export' as const, titel: 'Als CSV-Datei speichern (z. B. für andere Programme)', aktion: o.csv }] : []),
    ],
  };
}
