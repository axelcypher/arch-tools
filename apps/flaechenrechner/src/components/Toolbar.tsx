import { eingabeAbschliessen } from '@core/platform/eingabe';
import { APP_NAMEN } from '@core/appNamen';
import { useEffect } from 'react';
import { computeProject } from '@core/calc';
import { projectToCsv } from '../core/export';
import { readProjectFile } from '@core/archive';
import { isTauri, saveTextFile } from '@core/platform/files';
import { exportDateiname, exportOrdner, projektDateiWaehlen, projektSpeichern, speichernAbwarten } from '@core/platform/projektDatei';
import { mitVorlage } from '../platform/vorlage';
import type { Project } from '@core/model';
import type { Tool } from '../store/store';
import { restoreIfcModel, rueckgaengig, useEditor } from '../store/store';
import { planLaden } from './BackgroundPanel';
import { IfcImportDialog } from './IfcImportDialog';
import type { SymbolName } from '@core/ui/Symbol';
import { Symbol } from '@core/ui/Symbol';
import { logger } from '@core/platform/log';
import { mitDatei } from '@core/platform/dateiFehler';
import { aenderungenSpeichern, meldung, oeffnenFehlgeschlagen } from '@core/ui/Rueckfrage';

const log = logger('datei');

/** Projekt speichern (Strg+S, „Speichern unter“, Rückfrage vor Öffnen/Beenden); true, wenn gespeichert wurde */
export async function projektSpeichernAktion(unter = false): Promise<boolean> {
  eingabeAbschliessen();
  await speichernAbwarten(); // Strg+S während eines Speicherns: danach den aktuellen Stand speichern
  const { project: p, basis, datei, dokument } = useEditor.getState();
  try {
    const r = await projektSpeichern({ project: p, basis, datei, unter, app: `${APP_NAMEN.flaechenrechner.name} ${__APP_VERSION__}`, filterName: 'Flächenprojekt', fuerDatei: mitVorlage });
    // während des Speicherns weitergezeichnet? Dann bleibt der neue Stand ungespeichert (mit den Änderungen aus der Datei).
    if (r) useEditor.getState().markSaved(r.project, r.datei, p, dokument);
    return !!r;
  } catch (e) {
    log.error('Speichern fehlgeschlagen', e);
    await meldung('Speichern fehlgeschlagen', 'Das Projekt ließ sich nicht speichern. Die Änderungen bleiben in der App erhalten.', e);
    return false;
  }
}

/** vor Öffnen/Neu: ungespeicherte Änderungen speichern, verwerfen oder abbrechen; true = weiter */
export async function verwerfenOk(): Promise<boolean> {
  eingabeAbschliessen();
  return !useEditor.getState().dirty || (await aenderungenSpeichern(useEditor.getState().project.name, () => projektSpeichernAktion()));
}

/** Projektdatei über den Dateidialog öffnen (Strg+O, auch aus der Projektübersicht) */
export async function projektDateiOeffnen() {
  if (!(await verwerfenOk())) return;
  let name = '';
  try {
    const f = await projektDateiWaehlen({ datei: useEditor.getState().datei });
    if (!f) return;
    name = f.pfad ?? f.name;
    const done = log.time(`Öffnen: ${name}`);
    const p = mitDatei(f.name, () => readProjectFile(f.bytes));
    useEditor.getState().loadProject(p, p, name);
    done({ bytes: f.bytes.byteLength, geschosse: p.storeys.length, dateien: p.dateien?.length ?? 0 });
    void restoreIfcModel(p);
  } catch (e) {
    log.error(`Öffnen fehlgeschlagen: ${name}`, e);
    await oeffnenFehlgeschlagen(e, name);
  }
}

/** Projekt aus der Projektübersicht übernehmen; false, wenn abgebrochen wurde (ungespeicherte Änderungen) */
export async function projektUebernehmen(p: Project, datei: string): Promise<boolean> {
  if (!(await verwerfenOk())) return false;
  useEditor.getState().loadProject(p, p, datei);
  void restoreIfcModel(p);
  return true;
}

// Symbole aus dem gemeinsamen Satz (SVG statt Emoji/Schriftzeichen); Tooltips sagen, was das Werkzeug tut
const TOOLS: { id: Tool; label: string; symbol: SymbolName; title: string }[] = [
  { id: 'select', label: 'Auswählen', symbol: 'auswahl', title: 'Auswählen und bearbeiten (V)' },
  { id: 'polygon', label: 'Polygon', symbol: 'polygon', title: 'Polygon zeichnen – Punkt für Punkt, Längen eintippbar (P)' },
  { id: 'rect', label: 'Rechteck', symbol: 'rechteck', title: 'Rechteck zeichnen – zwei Ecken oder Maß, z. B. 4,5x3 (R)' },
  { id: 'detect', label: 'Erkennen', symbol: 'erkennen', title: 'Fläche per Klick aus dem Plan erkennen (E)' },
  { id: 'measure', label: 'Messen', symbol: 'lineal', title: 'Strecken und Flächen messen – zählt nicht zur Auswertung (M)' },
];

export function Toolbar() {
  const tool = useEditor((s) => s.tool);
  const drawKind = useEditor((s) => s.drawKind);
  const canUndo = useEditor((s) => s.past.length > 0 || (s.entwurf && s.mainView === '2d'));
  const canRedo = useEditor((s) => s.future.length > 0);
  const dirty = useEditor((s) => s.dirty);
  // Kalibrieren braucht einen Plan im aktiven Geschoss
  const hatPlan = useEditor((s) => !!(s.project.storeys.find((x) => x.id === s.activeStoreyId) ?? s.project.storeys[0]).background);
  const st = useEditor.getState();
  const ifcOpen = useEditor((s) => s.ifcOpen);
  const setIfcOpen = st.setIfcOpen;
  const aktivesGeschoss = () => {
    const s = useEditor.getState();
    return (s.project.storeys.find((x) => x.id === s.activeStoreyId) ?? s.project.storeys[0]).id;
  };

  const onNew = async () => {
    if (await verwerfenOk()) st.newProject();
  };

  const onOpen = () => projektDateiOeffnen();

  const onSave = (unter = false) => projektSpeichernAktion(unter);

  // Strg+S / Strg+Umschalt+S / Strg+O
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      const k = e.key.toLowerCase();
      if (k === 's') {
        e.preventDefault();
        void onSave(e.shiftKey);
      } else if (k === 'o') {
        e.preventDefault();
        void onOpen();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const onCsv = async () => {
    const { project: p, datei } = useEditor.getState();
    try {
      await saveTextFile({
        defaultName: exportDateiname({ datei, projektName: p.name, zusatz: 'WoFl+BGF+BRI', endung: 'csv' }),
        defaultDir: exportOrdner(datei),
        contents: projectToCsv(p, computeProject(p)),
        filterName: 'CSV (Excel)',
        extension: 'csv',
        mime: 'text/csv;charset=utf-8',
      });
    } catch (e) {
      log.error('CSV-Export fehlgeschlagen', e);
      await meldung('Export fehlgeschlagen', 'Die CSV-Datei ließ sich nicht schreiben.', e);
    }
  };

  return (
    <div className="toolbar">
      <div className="tb-group">
        {/* bekannte Befehle: unter 1600 px nur das Symbol (Name über aria-label und title) */}
        <button onClick={() => void onNew()} title="Neues Projekt" aria-label="Neu">
          <Symbol name="datei" /> <span className="tb-text">Neu</span>
        </button>
        <button onClick={() => void onOpen()} title="Projekt öffnen … (Strg+O)" aria-label="Öffnen …">
          <Symbol name="ordnerOffen" /> <span className="tb-text">Öffnen …</span>
        </button>
        {/* ungespeicherte Änderungen als Punkt in der Ecke – ändert die Breite der Leiste nicht */}
        <button
          className={dirty ? 'ungespeichert' : undefined}
          onClick={() => void onSave()}
          title={`${isTauri() ? 'Projekt speichern – in die geöffnete Datei (Strg+S)' : 'Projekt als Datei herunterladen (Strg+S)'}${dirty ? ' – ungespeicherte Änderungen' : ''}`}
          aria-label={dirty ? 'Speichern – ungespeicherte Änderungen' : 'Speichern'}
        >
          <Symbol name="speichern" /> <span className="tb-text">Speichern</span>
        </button>
        {isTauri() && (
          <button onClick={() => void onSave(true)} title="Projekt unter neuem Namen oder an anderem Ort speichern (Strg+Umschalt+S)">
            <Symbol name="speichern" /> Speichern unter …
          </button>
        )}
        <button onClick={() => setIfcOpen(true)} title="Gebäudemodell aus Archicad, Revit & Co. importieren">
          <Symbol name="stapel" /> IFC-Import …
        </button>
      </div>
      {ifcOpen && <IfcImportDialog onClose={() => setIfcOpen(false)} />}
      <div className="tb-group">
        <button onClick={rueckgaengig} disabled={!canUndo} title="Rückgängig (Strg+Z) – beim Zeichnen zuerst den letzten Punkt" aria-label="Rückgängig">
          <Symbol name="rueckgaengig" />
        </button>
        <button onClick={st.redo} disabled={!canRedo} title="Wiederholen (Strg+Y)" aria-label="Wiederholen">
          <Symbol name="wiederholen" />
        </button>
      </div>
      <div className="tb-group" role="group" aria-label="Plan">
        <button onClick={() => void planLaden(aktivesGeschoss())} title={hatPlan ? 'Plan des Geschosses durch einen anderen ersetzen (PDF, DXF, Bild)' : 'Grundriss als PDF, DXF oder Bild laden – zum Nachzeichnen und Erkennen'}>
          <Symbol name="bild" /> {hatPlan ? 'Plan …' : 'Plan laden …'}
        </button>
        <button
          className={tool === 'calibrate' || tool === 'kontrolle' ? 'active' : ''}
          aria-pressed={tool === 'calibrate' || tool === 'kontrolle'}
          disabled={!hatPlan && tool !== 'calibrate'}
          onClick={() => st.setTool('calibrate')}
          title={hatPlan ? 'Plan kalibrieren – zwei Punkte mit bekanntem Abstand (K)' : 'Zuerst einen Plan laden (Plan laden …)'}
        >
          <Symbol name="kalibrieren" /> Kalibrieren
        </button>
      </div>
      <div className="tb-group" role="group" aria-label="Werkzeuge">
        {TOOLS.map((t) => (
          <button key={t.id} className={tool === t.id ? 'active' : ''} aria-pressed={tool === t.id} onClick={() => st.setTool(t.id)} title={t.title}>
            <Symbol name={t.symbol} /> {t.label}
          </button>
        ))}
      </div>
      <div className="tb-group">
        {/* Art der neu gezeichneten Fläche: Umschalter wie im Designsystem */}
        <div className="segment" role="group" aria-label="Neue Flächen zeichnen als" title="Neue Flächen zeichnen als BGF-Umriss oder Raum">
        <button className={drawKind === 'outline' ? 'active kind-outline' : ''} aria-pressed={drawKind === 'outline'} onClick={() => st.setDrawKind('outline')} title="Neue Flächen als BGF-Umriss (B)">
          BGF-Umriss
        </button>
        <button className={drawKind === 'room' ? 'active kind-room' : ''} aria-pressed={drawKind === 'room'} onClick={() => st.setDrawKind('room')} title="Neue Flächen als Raum / NRF (N)">
          Raum
        </button>
        </div>
      </div>
      <div className="tb-spacer" />
      <div className="tb-group">
        <button onClick={onCsv} title="Flächenaufstellung als CSV exportieren">
          <Symbol name="export" /> CSV …
        </button>
        <button onClick={() => st.setExcelOpen(true)} title="Excel-Export (Standardlayout oder eigene Vorlage)">
          <Symbol name="tabelle" /> Excel …
        </button>
        <button className="primary" onClick={() => st.setReportOpen(true)} title="Flächenaufstellung zum Prüfen, Drucken und als PDF">
          <Symbol name="formular" /> Flächenaufstellung …
        </button>
      </div>
    </div>
  );
}

