import { eingabeAbschliessen } from '@core/platform/eingabe';
import { APP_NAMEN } from '@core/appNamen';
import { useEffect, useState } from 'react';
import { computeProject } from '@core/calc';
import { projectToCsv } from '../core/export';
import { readProjectFile } from '@core/archive';
import { isTauri, saveTextFile } from '@core/platform/files';
import { exportDateiname, exportOrdner, projektDateiWaehlen, projektSpeichern, speichernAbwarten } from '@core/platform/projektDatei';
import { mitVorlage } from '../platform/vorlage';
import type { Project } from '@core/model';
import type { Tool } from '../store/store';
import { restoreIfcModel, useEditor } from '../store/store';
import { IfcImportDialog } from './IfcImportDialog';
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

const TOOLS: { id: Tool; label: string; key: string; icon: string }[] = [
  { id: 'select', label: 'Auswählen', key: 'V', icon: '⬉' },
  { id: 'polygon', label: 'Polygon', key: 'P', icon: '⬠' },
  { id: 'rect', label: 'Rechteck', key: 'R', icon: '▭' },
  { id: 'detect', label: 'Erkennen', key: 'E', icon: '⊡' },
  { id: 'measure', label: 'Messen', key: 'M', icon: '📏' },
  { id: 'calibrate', label: 'Kalibrieren', key: '', icon: '⇔' },
];

export function Toolbar() {
  const tool = useEditor((s) => s.tool);
  const drawKind = useEditor((s) => s.drawKind);
  const canUndo = useEditor((s) => s.past.length > 0);
  const canRedo = useEditor((s) => s.future.length > 0);
  const dirty = useEditor((s) => s.dirty);
  // Kalibrieren braucht einen Plan im aktiven Geschoss
  const hatPlan = useEditor((s) => !!(s.project.storeys.find((x) => x.id === s.activeStoreyId) ?? s.project.storeys[0]).background);
  const st = useEditor.getState();

  const [ifcOpen, setIfcOpen] = useState(false);

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
        <button onClick={() => void onNew()} title="Neues Projekt">
          Neu
        </button>
        <button onClick={() => void onOpen()} title="Projekt öffnen (Strg+O)">
          Öffnen
        </button>
        <button onClick={() => void onSave()} title={isTauri() ? 'Projekt speichern – in die geöffnete Datei (Strg+S)' : 'Projekt als Datei herunterladen (Strg+S)'}>
          Speichern{dirty ? ' •' : ''}
        </button>
        {isTauri() && (
          <button onClick={() => void onSave(true)} title="Projekt unter neuem Namen oder an anderem Ort speichern (Strg+Umschalt+S)">
            Speichern unter …
          </button>
        )}
        <button onClick={() => setIfcOpen(true)} title="Gebäudemodell aus Archicad, Revit & Co. importieren">
          IFC-Import
        </button>
      </div>
      {ifcOpen && <IfcImportDialog onClose={() => setIfcOpen(false)} />}
      <div className="tb-group">
        <button onClick={st.undo} disabled={!canUndo} title="Rückgängig (Strg+Z)" aria-label="Rückgängig">
          ↶
        </button>
        <button onClick={st.redo} disabled={!canRedo} title="Wiederholen (Strg+Y)" aria-label="Wiederholen">
          ↷
        </button>
      </div>
      <div className="tb-group">
        {TOOLS.map((t) => (
          <button
            key={t.id}
            className={tool === t.id ? 'active' : ''}
            aria-pressed={tool === t.id}
            disabled={t.id === 'calibrate' && !hatPlan && tool !== 'calibrate'}
            onClick={() => st.setTool(t.id)}
            title={t.id === 'calibrate' && !hatPlan ? 'Kalibrieren – zuerst einen Plan laden (rechts unter „Hintergrundplan“)' : `${t.label}${t.key ? ` (${t.key})` : ''}`}
          >
            <span className="tb-icon">{t.icon}</span> {t.label}
          </button>
        ))}
      </div>
      <div className="tb-group" title="Art der neu gezeichneten Fläche">
        <span className="tb-label">als</span>
        <button className={drawKind === 'outline' ? 'active kind-outline' : ''} aria-pressed={drawKind === 'outline'} onClick={() => st.setDrawKind('outline')} title="BGF-Umriss (B)">
          BGF-Umriss
        </button>
        <button className={drawKind === 'room' ? 'active kind-room' : ''} aria-pressed={drawKind === 'room'} onClick={() => st.setDrawKind('room')} title="Raum / NRF (N)">
          Raum
        </button>
      </div>
      <div className="tb-spacer" />
      <div className="tb-group">
        <button onClick={onCsv} title="Flächenaufstellung als CSV exportieren">
          CSV
        </button>
        <button onClick={() => st.setExcelOpen(true)} title="Excel-Export (Standardlayout oder eigene Vorlage)">
          Excel
        </button>
        <button className="primary" onClick={() => st.setReportOpen(true)}>
          Flächenaufstellung
        </button>
      </div>
    </div>
  );
}

