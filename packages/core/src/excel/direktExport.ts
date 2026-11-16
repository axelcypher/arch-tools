import type { VorlagenHinweis } from './pruefung';
import { berechnungsordnerPfad, exportDateinameAusMuster, exportPfade, exportPfadeLaden, type ExportApp, type ExportPfade } from '../einstellungen/pfade';
import { istVollstaendig, projektordnerAusDatei } from './projektordner';
import type { GlobaleQuelle } from '../platzhalter';
import type { Knopf } from '../ui/Rueckfrage';

/**
 * Direktexport aus der Kopfzeile: füllt die eingestellte Vorlage (sonst das Standardlayout) und speichert die .xlsx
 * ohne Dialog im Berechnungsordner des Projekts – mit dem Dateinamen aus den Einstellungen („Pfade und Benennung“),
 * bei „PDF mitspeichern“ auch das PDF daneben. Vorhandene Dateien werden nie still überschrieben: Rückfrage mit
 * „Neue Fassung“ (Hauptknopf, hängt „ (2)“, „ (3)“ … an), „Ersetzen“ und „Abbrechen“. Geht es nicht direkt (Web,
 * Projekt nicht gespeichert, Projektordner unbekannt), meldet der Ablauf den Grund – die App öffnet dann den Dialog.
 *
 * Alles, was die Plattform betrifft, kommt über {@link DirektExportUmgebung} herein (in Tests nachgebildet).
 */

export interface DirektExportAuftrag {
  app: ExportApp;
  /** Pfad der Projektdatei (.oap); null = nicht gespeichert */
  datei: string | null;
  /** Stammdaten für die Platzhalter in Ordner und Dateinamen */
  werte: GlobaleQuelle;
  /** {Inhalt} im Dateinamen, z. B. „Flächenaufstellung“ */
  inhalt: string;
  /** Excel-Datei mit der eingestellten Vorlage (sonst Standardlayout) und die Hinweise der Vorlagenprüfung */
  erzeugen: () => Promise<{ daten: Uint8Array; vorlage: string | null; hinweise: VorlagenHinweis[] }>;
}

export interface DirektExportUmgebung {
  /** Desktop-App (Dateien direkt in Ordner schreiben)? */
  desktop: boolean;
  existiert: (pfad: string) => Promise<boolean>;
  /** Ordner samt fehlender Elternordner anlegen (vollständiger Pfad) */
  ordnerAnlegen: (pfad: string) => Promise<void>;
  schreiben: (pfad: string, daten: Uint8Array) => Promise<void>;
  /** .xlsx → PDF (Excel bzw. LibreOffice); wirft mit verständlicher Meldung */
  pdf: (xlsx: Uint8Array) => Promise<Uint8Array>;
  fragen: <T extends string>(f: { titel: string; text?: string; details?: string; knoepfe: Knopf<T>[] }) => Promise<T | null>;
}

export type DirektExportErgebnis =
  | {
      art: 'gespeichert';
      ordner: string;
      /** vollständige Pfade der geschriebenen Dateien (.xlsx, ggf. .pdf) */
      dateien: string[];
      /** Name der verwendeten Vorlage; null = Standardlayout */
      vorlage: string | null;
      hinweise: VorlagenHinweis[];
      /** PDF gewünscht, aber nicht entstanden (die .xlsx ist gespeichert) */
      pdfFehler?: string;
    }
  /** direkt geht es nicht – die App öffnet den Export-Dialog mit diesem Hinweis */
  | { art: 'dialog'; grund: string }
  | { art: 'abgebrochen' };

export const GRUND_WEB = 'Direkt in den Berechnungsordner speichern geht nur in der Desktop-App – hier wird die Datei heruntergeladen.';
export const GRUND_UNGESPEICHERT = 'Das Projekt ist noch nicht gespeichert. Erst mit einer Projektdatei im Projektordner gibt es einen Berechnungsordner – bis dahin hier speichern.';
export const GRUND_KEIN_PROJEKTORDNER = 'Die Projektdatei liegt nicht im üblichen Ordner des Projektordners, daher ist der Berechnungsordner unbekannt – bitte hier einen Speicherort wählen.';

const trenner = (pfad: string) => (pfad.includes('\\') ? '\\' : '/');
const verbinde = (ordner: string, name: string) => `${ordner.replace(/[\\/]+$/, '')}${trenner(ordner)}${name}`;
/** „A.xlsx“ → „A (2).xlsx“ */
export const fassungsName = (name: string, n: number) => (n <= 1 ? name : name.replace(/(\.[^.]+)?$/, (endung) => ` (${n})${endung}`));

/** Wie der Export-Dialog startet: Excel oder PDF, mit Grund (Direktexport ging nicht) bzw. Hinweisen der Vorlagenprüfung */
export interface ExportDialogStart {
  art: 'excel' | 'pdf';
  grund?: string;
  hinweise?: VorlagenHinweis[];
}

export type DirektExportZiel = { ordner: string; xlsx: string; pdf: string | null } | { grund: string };

/** Zielpfade aus den Einstellungen bestimmen, ohne etwas zu schreiben (auch für den Tooltip des Knopfs) */
export function direktExportZielAus(pfade: ExportPfade, a: Pick<DirektExportAuftrag, 'datei' | 'werte' | 'inhalt'>): DirektExportZiel {
  if (!a.datei) return { grund: GRUND_UNGESPEICHERT };
  const projektordner = projektordnerAusDatei(a.datei);
  const ordner = berechnungsordnerPfad(pfade.berechnungsordner, projektordner, a.werte);
  if (!ordner || !istVollstaendig(ordner)) return { grund: GRUND_KEIN_PROJEKTORDNER };
  const xlsx = exportDateinameAusMuster(pfade.dateinameExcel, { werte: a.werte, inhalt: a.inhalt, endung: 'xlsx' });
  const pdf = pfade.pdfMitspeichern ? exportDateinameAusMuster(pfade.dateinamePdf, { werte: a.werte, inhalt: a.inhalt, endung: 'pdf' }) : null;
  return { ordner, xlsx, pdf };
}

/** Ziel mit den zuletzt gelesenen Einstellungen (synchron, für Tooltips) */
export const direktExportZielJetzt = (a: Pick<DirektExportAuftrag, 'app' | 'datei' | 'werte' | 'inhalt'>) => direktExportZielAus(exportPfade(a.app), a);

/** Ziel mit frisch gelesenen Einstellungen (vor dem Export) */
export const direktExportZiel = async (a: Pick<DirektExportAuftrag, 'app' | 'datei' | 'werte' | 'inhalt'>) => direktExportZielAus(await exportPfadeLaden(a.app), a);

export async function direktExportieren(a: DirektExportAuftrag, u: DirektExportUmgebung): Promise<DirektExportErgebnis> {
  if (!u.desktop) return { art: 'dialog', grund: GRUND_WEB };
  const ziel = await direktExportZiel(a);
  if ('grund' in ziel) return { art: 'dialog', grund: ziel.grund };
  const { ordner } = ziel;

  // freie Fassung suchen; gibt es schon eine der Dateien, entscheidet der Nutzer
  const namen = (n: number) => ({ xlsx: fassungsName(ziel.xlsx, n), pdf: ziel.pdf ? fassungsName(ziel.pdf, n) : null });
  const belegt = async (n: number) => {
    const z = namen(n);
    return (await u.existiert(verbinde(ordner, z.xlsx))) || (z.pdf != null && (await u.existiert(verbinde(ordner, z.pdf))));
  };
  let n = 1;
  if (await belegt(1)) {
    const vorhanden = [ziel.xlsx, ziel.pdf].filter(Boolean).join(' bzw. ');
    const wahl = await u.fragen({
      titel: 'Datei gibt es schon',
      text: `Im Berechnungsordner gibt es „${vorhanden}“ schon. „Neue Fassung“ speichert daneben mit einer Nummer im Namen, „Ersetzen“ überschreibt die vorhandene Datei.`,
      details: ordner,
      knoepfe: [
        { id: 'abbrechen', label: 'Abbrechen' },
        { id: 'ersetzen', label: 'Ersetzen', art: 'danger' },
        { id: 'neu', label: 'Neue Fassung', art: 'primary' },
      ],
    });
    if (wahl !== 'neu' && wahl !== 'ersetzen') return { art: 'abgebrochen' };
    if (wahl === 'neu') {
      n = 2;
      while (await belegt(n)) n++;
    }
  }

  const { daten, vorlage, hinweise } = await a.erzeugen();
  const z = namen(n);
  await u.ordnerAnlegen(ordner);
  const dateien = [verbinde(ordner, z.xlsx)];
  await u.schreiben(dateien[0], daten);
  let pdfFehler: string | undefined;
  if (z.pdf) {
    try {
      const pdf = await u.pdf(daten);
      await u.schreiben(verbinde(ordner, z.pdf), pdf);
      dateien.push(verbinde(ordner, z.pdf));
    } catch (e) {
      pdfFehler = e instanceof Error ? e.message : String(e);
    }
  }
  return { art: 'gespeichert', ordner, dateien, vorlage, hinweise, ...(pdfFehler ? { pdfFehler } : {}) };
}

/**
 * `erzeugen` für den Direktexport: die eingestellte Vorlage (im Projekt bzw. hinterlegt) samt Vorlagenprüfung, sonst
 * das Standardlayout der App – dieselbe Wahl, mit der der Export-Dialog startet.
 */
export function mitEingestellterVorlage<P>(o: {
  vorlage: { name: string; daten: Uint8Array } | null;
  projekt: P;
  exportWithTemplate: (t: Uint8Array, p: P) => Promise<Uint8Array>;
  exportDefault: (p: P) => Promise<Uint8Array>;
  pruefeVorlage?: (t: Uint8Array, p: P) => Promise<VorlagenHinweis[]>;
}): DirektExportAuftrag['erzeugen'] {
  return async () => {
    const v = o.vorlage;
    if (!v) return { daten: await o.exportDefault(o.projekt), vorlage: null, hinweise: [] };
    const daten = await o.exportWithTemplate(v.daten, o.projekt);
    const hinweise = o.pruefeVorlage ? await o.pruefeVorlage(v.daten, o.projekt).catch(() => []) : [];
    return { daten, vorlage: v.name, hinweise };
  };
}

/** Werte der globalen Platzhalter aus den Stammdaten des Projekts */
export const werteAusMeta = (m: { projektcode?: string; kurzname?: string; vorhaben?: string; bearbeiter?: string } | undefined): GlobaleQuelle => ({
  projektcode: m?.projektcode ?? '',
  kurzname: m?.kurzname ?? '',
  vorhaben: m?.vorhaben ?? '',
  bearbeiter: m?.bearbeiter ?? '',
});
