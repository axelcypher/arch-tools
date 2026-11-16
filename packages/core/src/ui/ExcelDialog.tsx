import type { ReactNode, RefObject } from 'react';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { VorlagenHinweis } from '../excel/pruefung';
import type { VorlagenSpeicher } from '../excel/vorlage';
import { vorlagePruefen } from '../excel/vorlage';
import type { Project } from '../model';
import { exportDateinameAusMuster, exportPfade, type ExportApp } from '../einstellungen/pfade';
import type { GlobaleQuelle } from '../platzhalter';
import { isTauri, pickFile, saveBinaryFile, saveMergedFile } from '../platform/files';
import { logger } from '../platform/log';
import { excelAlsPdf, PDF_NUR_DESKTOP, pdfMoeglich } from '../platform/pdf';
import { exportDateiname, exportOrdner } from '../platform/projektDatei';
import { Modal } from './Dialog';
import { fragen } from './Rueckfrage';
import { fassungsName, vorhandeneDateiFragen } from '../excel/direktExport';

const log = logger('excel');

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

export { safeFileName } from '../platform/projektDatei';

export interface ExcelDialogProps {
  project: Project;
  /** Änderung am Projekt (Vorlage übernehmen/entfernen) */
  update: (fn: (p: Project) => Project) => void;
  onClose: () => void;
  speicher: VorlagenSpeicher;
  /** Beschreibung des Standardlayouts */
  standardText: string;
  /** Platzhalter-Referenz der App als eigener Dialog (PlatzhalterReferenz aus core/excel) */
  referenz: (onClose: () => void) => ReactNode;
  /** Vorlagenprüfung: mögliche Tippfehler der Vorlage (nach dem Export und mit „Vorlage prüfen“) */
  pruefeVorlage?: (template: Uint8Array, p: Project) => Promise<VorlagenHinweis[]>;
  /** Projektdatei (Pfad bzw. Name) – Grundlage für Dateiname und Ordner des Exports */
  datei: string | null;
  /** Zusatz zum Dateinamen, z. B. „WoFl+BGF+BRI“ → „<Projektdatei> WoFl+BGF+BRI.xlsx“ */
  zusatz: (p: Project) => string;
  musterName: string;
  exportDefault: (p: Project) => Promise<Uint8Array>;
  exportWithTemplate: (template: Uint8Array, p: Project) => Promise<Uint8Array>;
  buildSampleTemplate: () => Promise<Uint8Array>;
  /** „excel“ (Vorgabe) speichert die .xlsx, „pdf“ die gefüllte Vorlage als PDF (nur Desktop; .xlsx auf Wunsch daneben) */
  art?: 'excel' | 'pdf';
  /** Hinweis oben im Dialog, z. B. warum der Direktexport nicht direkt speichern konnte */
  grund?: string;
  /** Hinweise der Vorlagenprüfung, mit denen der Dialog öffnet (nach dem Direktexport) */
  hinweise?: VorlagenHinweis[];
  /** Dateinamen nach den Einstellungen („Pfade und Benennung“); fehlt = „<Projektdatei> <Zusatz>“ */
  benennung?: { app: ExportApp; werte: GlobaleQuelle; inhalt: string };
}

const PDF_MIME = 'application/pdf';
/** „…\\A.xlsx“ → „…\\A (2).xlsx“ */
const fassungsPfad = (pfad: string, n: number) => pfad.replace(/[^\\/]+$/, (name) => fassungsName(name, n));
const pfadMitEndung = (pfad: string, endung: string) => pfad.replace(/\.[^.\\/]*$/, '') + '.' + endung;

/**
 * Excel-Export: Standardlayout oder eigene Vorlage (.xlsx mit Platzhaltern). Enter exportiert, der Erstfokus liegt auf
 * „Excel speichern“ bzw. „PDF speichern“; Vorlage wählen, Muster, Platzhalter-Referenz und Vorlagenprüfung erscheinen nur bei „Eigene Vorlage“.
 * Meldet die Vorlagenprüfung nach dem Export Hinweise, bleibt der Dialog offen und zeigt sie (mit Blatt und Zelle).
 */
export function ExcelDialog(props: ExcelDialogProps) {
  const { project, update, onClose, speicher } = props;
  const pdf = props.art === 'pdf';
  const pdfGesperrt = pdf && !pdfMoeglich();
  /** im PDF-Modus: die .xlsx daneben mitspeichern */
  const [excelMit, setExcelMit] = useState(false);
  // Zähler, damit Änderungen an der im Browser hinterlegten Vorlage neu gelesen werden
  const [rev, setRev] = useState(0);
  const template = useMemo(() => speicher.aktuelle(project), [project, rev, speicher]);
  const [mode, setMode] = useState<'default' | 'template'>(template ? 'template' : 'default');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hinweis, setHinweis] = useState<string | null>(null);
  const keineVorlageId = useId();
  const pdfGesperrtId = useId();
  const [referenzOffen, setReferenzOffen] = useState(false);
  /** Ergebnis der Vorlagenprüfung; `exportiert`: nach einem Export mit Vorlage */
  const [pruefung, setPruefung] = useState<{ hinweise: VorlagenHinweis[]; exportiert: boolean } | null>(props.hinweise?.length ? { hinweise: props.hinweise, exportiert: true } : null);
  const meldungRef = useRef<HTMLElement>(null);
  // Fokus auf das Ergebnis der Prüfung – „Exportieren“ bzw. „Vorlage prüfen“ war während der Arbeit gesperrt
  useEffect(() => {
    if (pruefung) meldungRef.current?.focus();
  }, [pruefung]);

  const chooseTemplate = async () => {
    const f = await pickFile('.xlsx,' + XLSX_MIME);
    if (!f) return;
    if (!f.name.toLowerCase().endsWith('.xlsx')) {
      setError('Bitte eine Excel-Datei im Format .xlsx wählen (.xls wird nicht unterstützt).');
      return;
    }
    const daten = new Uint8Array(await f.arrayBuffer());
    const pruefung = vorlagePruefen(daten);
    if (pruefung.fehler) {
      setError(`„${f.name}“: ${pruefung.fehler}`);
      return;
    }
    setHinweis(pruefung.hinweis ?? null);
    // gehört zum Projekt (wird im Archiv mitgespeichert) und gilt künftig auch für neue Projekte
    update((p) => speicher.setzen(p, f.name, daten));
    setError(speicher.setGlobale(f.name, daten) ? null : 'Die Vorlage ist zu groß, um sie für weitere Projekte zu hinterlegen – sie wird nur mit diesem Projekt gespeichert.');
    setRev(rev + 1);
    setMode('template');
    setPruefung(null);
  };

  const removeTemplate = () => {
    update((p) => speicher.entfernen(p));
    speicher.removeGlobale();
    setRev(rev + 1);
    setHinweis(null);
    setPruefung(null);
  };

  const pruefen = async (exportiert: boolean): Promise<VorlagenHinweis[]> => {
    if (!template || !props.pruefeVorlage) return [];
    try {
      const hinweise = await props.pruefeVorlage(template.daten, project);
      setPruefung({ hinweise, exportiert });
      return hinweise;
    } catch (e) {
      log.error('Vorlagenprüfung fehlgeschlagen', e);
      return [];
    }
  };

  const downloadSample = async () => {
    setBusy(true);
    try {
      await saveBinaryFile({ defaultName: props.musterName, defaultDir: exportOrdner(props.datei), data: await props.buildSampleTemplate(), filterName: 'Excel-Arbeitsmappe', extension: 'xlsx', mime: XLSX_MIME });
    } catch (e) {
      log.error('Muster-Vorlage fehlgeschlagen', e);
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  const dateiname = (endung: 'xlsx' | 'pdf') => {
    const b = props.benennung;
    if (!b) return exportDateiname({ datei: props.datei, projektName: project.name, zusatz: props.zusatz(project), endung });
    const p = exportPfade(b.app);
    return exportDateinameAusMuster(endung === 'pdf' ? p.dateinamePdf : p.dateinameExcel, { werte: b.werte, inhalt: b.inhalt, endung });
  };

  /** PDF speichern (Dialog), auf Wunsch die .xlsx mit gleichem Namen daneben; false bei Abbruch */
  const pdfSpeichern = async (xlsx: Uint8Array): Promise<boolean> => {
    const daten = await excelAlsPdf(xlsx);
    const pfad = await saveMergedFile({ defaultName: dateiname('pdf'), defaultDir: exportOrdner(props.datei), filterName: 'PDF-Dokument', extension: 'pdf', mime: PDF_MIME, vorhandenLesen: false, build: () => daten });
    if (!pfad) return false;
    if (excelMit && isTauri()) {
      const { invoke } = await import('@tauri-apps/api/core');
      const da = async (p: string) => (await invoke<unknown>('datei_stand', { path: p })) != null;
      let ziel = pfadMitEndung(pfad, 'xlsx');
      const name = (p: string) => p.split(/[\\/]/).pop() ?? p;
      if (await da(ziel)) {
        const wahl = await vorhandeneDateiFragen(fragen, [name(ziel)], ziel.slice(0, ziel.length - name(ziel).length));
        if (!wahl) return true;
        if (wahl === 'neu') {
          let n = 2;
          while (await da(fassungsPfad(ziel, n))) n++;
          ziel = fassungsPfad(ziel, n);
        }
      }
      await saveMergedFile({ pfad: ziel, defaultName: name(ziel), filterName: 'Excel-Arbeitsmappe', extension: 'xlsx', mime: XLSX_MIME, vorhandenLesen: false, build: () => xlsx });
    }
    return true;
  };

  const ohneVorlage = mode === 'template' && !template;
  const doExport = async () => {
    if (busy || ohneVorlage || pdfGesperrt) return;
    setBusy(true);
    setError(null);
    try {
      const done = log.time(mode === 'template' && template ? `Export mit Vorlage „${template.name}“` : 'Export Standardlayout');
      const data = mode === 'template' && template ? await props.exportWithTemplate(template.daten, project) : await props.exportDefault(project);
      done({ bytes: data.byteLength });
      const ok = pdf
        ? await pdfSpeichern(data)
        : await saveBinaryFile({ defaultName: dateiname('xlsx'), defaultDir: exportOrdner(props.datei), data, filterName: 'Excel-Arbeitsmappe', extension: 'xlsx', mime: XLSX_MIME });
      // Hinweise der Vorlagenprüfung zeigen, statt den Dialog zu schließen
      const hinweise = ok && mode === 'template' ? await pruefen(true) : [];
      if (ok && !hinweise.length) onClose();
    } catch (e) {
      log.error(pdf ? 'PDF-Export fehlgeschlagen' : 'Excel-Export fehlgeschlagen', e);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const vorlageKnoepfe = (
    <div className="button-row indent">
      <button type="button" className="small" onClick={chooseTemplate}>
        {template ? 'Andere Vorlage wählen …' : 'Vorlage wählen …'}
      </button>
      {template && (
        <button type="button" className="small danger" onClick={removeTemplate}>
          Vorlage entfernen
        </button>
      )}
      <button type="button" className="small" onClick={downloadSample} disabled={busy}>
        Muster-Vorlage herunterladen
      </button>
      <button type="button" className="small" aria-haspopup="dialog" onClick={() => setReferenzOffen(true)}>
        Platzhalter-Referenz …
      </button>
      {template && props.pruefeVorlage && (
        <button type="button" className="small" onClick={() => void pruefen(false)} disabled={busy}>
          Vorlage prüfen
        </button>
      )}
    </div>
  );

  return (
    <Modal titel={pdf ? 'PDF-Export' : 'Excel-Export'} kopf breit onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void doExport();
        }}
      >
        {props.grund && (
          <p className="meldung" role="status">
            {props.grund}
          </p>
        )}
        {pdf && (
          <p className="muted small-text">
            Die Berechnung wird wie beim Excel-Export gefüllt und dann über Microsoft Excel bzw. LibreOffice als PDF gespeichert – mit Druckbereich, Kopf- und Fußzeile und Seitenformat der Vorlage.
          </p>
        )}
        <label className="radio-row">
          <input type="radio" name="excel-art" checked={mode === 'default'} onChange={() => setMode('default')} />
          <span>
            <strong>Standardlayout</strong>
            <br />
            <span className="muted small-text">{props.standardText}</span>
          </span>
        </label>
        <label className="radio-row">
          <input type="radio" name="excel-art" checked={mode === 'template'} onChange={() => setMode('template')} />
          <span>
            <strong>Eigene Vorlage</strong>
            <br />
            {template ? (
              <span className="small-text">
                {template.name}{' '}
                <span className="muted">
                  ({template.ausProjekt ? 'im Projekt gespeichert' : 'hinterlegt'} am {template.datum})
                </span>
              </span>
            ) : (
              <span className="muted small-text" id={keineVorlageId}>
                Noch keine Vorlage hinterlegt – „Vorlage wählen …“.
              </span>
            )}
          </span>
        </label>
        {mode === 'template' && vorlageKnoepfe}

        {mode === 'template' && pruefung && (
          <div className={pruefung.hinweise.length ? 'meldung warnung' : 'meldung ok'} role="status">
            {pruefung.hinweise.length ? (
              <details open={pruefung.exportiert || pruefung.hinweise.length <= 5}>
                <summary ref={meldungRef as RefObject<HTMLElement>}>
                  {pruefung.exportiert ? 'Exportiert – die' : 'Die'} Vorlagenprüfung meldet {pruefung.hinweise.length === 1 ? '1 Hinweis' : `${pruefung.hinweise.length} Hinweise`}:
                </summary>
                <ul className="small-text">
                  {pruefung.hinweise.map((h, i) => (
                    <li key={i}>
                      {[h.blatt, h.ort].filter(Boolean).join(' · ')}
                      {h.blatt || h.ort ? ': ' : ''}
                      <code>{h.platzhalter}</code> – {h.text}
                    </li>
                  ))}
                </ul>
              </details>
            ) : (
              <span tabIndex={-1} ref={meldungRef as RefObject<HTMLSpanElement>}>
                Vorlage geprüft: keine Hinweise.
              </span>
            )}
          </div>
        )}

        {pdf && (
          <label className="toggle block">
            <input type="checkbox" checked={excelMit} disabled={pdfGesperrt} onChange={(e) => setExcelMit(e.target.checked)} />
            Excel-Datei daneben mitspeichern
          </label>
        )}
        {pdfGesperrt && (
          <p className="meldung warnung" id={pdfGesperrtId}>
            {PDF_NUR_DESKTOP}
          </p>
        )}
        {hinweis && mode === 'template' && <p className="warning">{hinweis}</p>}
        {error && (
          <p className="warning" role="alert">
            {error}
          </p>
        )}
        <div className="dialog-buttons">
          <button type="button" onClick={onClose}>
            {pruefung?.exportiert ? 'Schließen' : 'Abbrechen'}
          </button>
          <button type="submit" className="primary" disabled={busy || ohneVorlage || pdfGesperrt} aria-describedby={pdfGesperrt ? pdfGesperrtId : ohneVorlage ? keineVorlageId : undefined}>
            {busy ? (pdf ? 'Erzeuge PDF …' : 'Exportiere …') : pdf ? 'PDF speichern' : 'Excel speichern'}
          </button>
        </div>
      </form>
      {/* eigener Dialog über dem Excel-Dialog – außerhalb, damit dessen Bildlauf ihn nicht beschneidet */}
      {referenzOffen && createPortal(props.referenz(() => setReferenzOffen(false)), document.body)}
    </Modal>
  );
}
