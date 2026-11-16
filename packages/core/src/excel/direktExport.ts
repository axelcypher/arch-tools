import type { VorlagenHinweis } from './pruefung';
import { berechnungsordnerPfad, exportDateinameAusMuster, exportPfade, exportPfadeLaden, type ExportApp, type ExportPfade } from '../einstellungen/pfade';
import { istVollstaendig, projektordnerAusDatei } from './projektordner';
import type { GlobaleQuelle } from '../platzhalter';
import type { Knopf } from '../ui/Rueckfrage';

/**
 * Direktexport aus der Kopfzeile (docs/design.md, „Direkter Export“): füllt die eingestellte Vorlage (sonst das
 * Standardlayout) und speichert die .xlsx ohne Dialog im Berechnungsordner des Projekts – mit dem Dateinamen aus den
 * Einstellungen („Pfade und Benennung“), bei „PDF mitspeichern“ auch das PDF daneben. Gibt es eine der Dateien schon,
 * fragt „‚Name.xlsx‘ ersetzen?“ (Abbrechen | Ersetzen, Erstfokus auf Abbrechen) – still überschrieben wird nie. Fehlt
 * etwas (Web, Projekt nie gespeichert, kein Berechnungsordner), ist der Knopf gesperrt; der Grund steht im Tooltip.
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
      /** … und das vorhandene PDF daneben hat noch den alten Stand */
      pdfAlt?: boolean;
    }
  /** direkt geht es nicht (der Knopf hätte gesperrt sein müssen, z. B. Einstellungen inzwischen geändert) */
  | { art: 'gesperrt'; grund: string }
  | { art: 'abgebrochen' };

/** Gründe für den gesperrten Knopf (Tooltip bzw. Hinweis im Überlaufmenü) */
export const GRUND_WEB = 'Direkt in den Berechnungsordner speichern geht nur in der Desktop-App – „Datei → Exportieren → Excel …“ lädt die Datei herunter.';
export const GRUND_UNGESPEICHERT = 'Erst das Projekt speichern – der Berechnungsordner liegt im Projektordner. Bis dahin „Datei → Exportieren → Excel …“.';
export const GRUND_KEIN_PROJEKTORDNER = 'Kein Berechnungsordner: Die Projektdatei liegt nicht im Projektordner. „Datei → Exportieren → Excel …“ wählt den Speicherort frei.';

const trenner = (pfad: string) => (pfad.includes('\\') ? '\\' : '/');
const verbinde = (ordner: string, name: string) => `${ordner.replace(/[\\/]+$/, '')}${trenner(ordner)}${name}`;

/** Wie der Export-Dialog startet: Excel oder PDF, ggf. mit den Hinweisen der Vorlagenprüfung */
export interface ExportDialogStart {
  art: 'excel' | 'pdf';
  hinweise?: VorlagenHinweis[];
}

export type DirektExportZiel = { ordner: string; xlsx: string; pdf: string | null } | { grund: string };

/**
 * Gemeinsame Rückfrage, wenn es Zieldateien schon gibt (Direktexport und Export-Dialog): „‚A.xlsx‘ ersetzen?“ bzw.
 * „‚A.xlsx‘ und ‚A.pdf‘ ersetzen?“ mit Abbrechen | Ersetzen (Gefahr; Erstfokus und Enter auf Abbrechen); true = ersetzen
 */
export async function ersetzenFragen(fragen: DirektExportUmgebung['fragen'], namen: string[], ordner: string): Promise<boolean> {
  const wahl = await fragen({
    titel: `${namen.map((n) => `„${n}“`).join(' und ')} ersetzen?`,
    text: `${namen.length > 1 ? 'Die Dateien gibt' : 'Die Datei gibt'} es schon in „${ordner}“.`,
    knoepfe: [
      { id: 'abbrechen', label: 'Abbrechen' },
      { id: 'ersetzen', label: 'Ersetzen', art: 'danger' },
    ],
  });
  return wahl === 'ersetzen';
}

/** Zielpfade aus den Einstellungen bestimmen, ohne etwas zu schreiben (auch für den Tooltip des Knopfs) */
export function direktExportZielAus(pfade: ExportPfade, a: Pick<DirektExportAuftrag, 'datei' | 'werte' | 'inhalt'>, desktop = true): DirektExportZiel {
  if (!desktop) return { grund: GRUND_WEB };
  if (!a.datei) return { grund: GRUND_UNGESPEICHERT };
  const projektordner = projektordnerAusDatei(a.datei);
  const ordner = berechnungsordnerPfad(pfade.berechnungsordner, projektordner, a.werte);
  if (!ordner || !istVollstaendig(ordner)) return { grund: GRUND_KEIN_PROJEKTORDNER };
  const xlsx = exportDateinameAusMuster(pfade.dateinameExcel, { werte: a.werte, inhalt: a.inhalt, endung: 'xlsx' });
  const pdf = pfade.pdfMitspeichern ? exportDateinameAusMuster(pfade.dateinamePdf, { werte: a.werte, inhalt: a.inhalt, endung: 'pdf' }) : null;
  return { ordner, xlsx, pdf };
}

/** Ziel mit den zuletzt gelesenen Einstellungen (synchron, für Tooltip und Sperre) */
export const direktExportZielJetzt = (a: Pick<DirektExportAuftrag, 'app' | 'datei' | 'werte' | 'inhalt'>, desktop = true) => direktExportZielAus(exportPfade(a.app), a, desktop);

/** Ziel mit frisch gelesenen Einstellungen (vor dem Export) */
export const direktExportZiel = async (a: Pick<DirektExportAuftrag, 'app' | 'datei' | 'werte' | 'inhalt'>, desktop = true) => direktExportZielAus(await exportPfadeLaden(a.app), a, desktop);

export async function direktExportieren(a: DirektExportAuftrag, u: DirektExportUmgebung): Promise<DirektExportErgebnis> {
  const ziel = await direktExportZiel(a, u.desktop);
  if ('grund' in ziel) return { art: 'gesperrt', grund: ziel.grund };
  const { ordner } = ziel;
  const xlsx = verbinde(ordner, ziel.xlsx);
  const pdfPfad = ziel.pdf ? verbinde(ordner, ziel.pdf) : null;

  // gibt es schon eine der Dateien, entscheidet der Nutzer – nie still überschreiben
  const vorhanden: string[] = [];
  if (await u.existiert(xlsx)) vorhanden.push(ziel.xlsx);
  if (pdfPfad && ziel.pdf && (await u.existiert(pdfPfad))) vorhanden.push(ziel.pdf);
  if (vorhanden.length && !(await ersetzenFragen(u.fragen, vorhanden, ordner))) return { art: 'abgebrochen' };

  const { daten, vorlage, hinweise } = await a.erzeugen();
  await u.ordnerAnlegen(ordner);
  await u.schreiben(xlsx, daten);
  const dateien = [xlsx];
  let pdfFehler: string | undefined;
  if (pdfPfad) {
    try {
      await u.schreiben(pdfPfad, await u.pdf(daten));
      dateien.push(pdfPfad);
    } catch (e) {
      pdfFehler = e instanceof Error ? e.message : String(e);
    }
  }
  const pdfAlt = !!pdfFehler && !!ziel.pdf && vorhanden.includes(ziel.pdf);
  return { art: 'gespeichert', ordner, dateien, vorlage, hinweise, ...(pdfFehler ? { pdfFehler } : {}), ...(pdfAlt ? { pdfAlt } : {}) };
}

/**
 * `erzeugen` für den Direktexport: die eingestellte Vorlage (im Projekt bzw. hinterlegt) samt Vorlagenprüfung, sonst
 * das Standardlayout der App – dieselbe Wahl, mit der der Export-Dialog startet.
 */
export function mitEingestellterVorlage<P>(o: {
  /** erst beim Export gelesen (Vorlagen sind groß – nicht bei jedem Rendern für den Tooltip) */
  vorlage: () => { name: string; daten: Uint8Array } | null;
  projekt: P;
  exportWithTemplate: (t: Uint8Array, p: P) => Promise<Uint8Array>;
  exportDefault: (p: P) => Promise<Uint8Array>;
  pruefeVorlage?: (t: Uint8Array, p: P) => Promise<VorlagenHinweis[]>;
}): DirektExportAuftrag['erzeugen'] {
  return async () => {
    const v = o.vorlage();
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
