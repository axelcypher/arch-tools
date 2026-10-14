import { useEffect, useState } from 'react';
import { computeProject } from '@core/calc';
import { projectToCsv } from '../core/export';
import { readProjectFile } from '@core/archive';
import { ProjectFormatError } from '@core/serialize';
import { isTauri, saveTextFile } from '@core/platform/files';
import { exportDateiname, exportOrdner, projektDateiWaehlen, projektSpeichern } from '@core/platform/projektDatei';
import { mitVorlage } from '../platform/vorlage';
import type { Tool } from '../store/store';
import { restoreIfcModel, useEditor } from '../store/store';
import { IfcImportDialog } from './IfcImportDialog';
import { logger } from '@core/platform/log';

const log = logger('datei');

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
  const st = useEditor.getState();

  const confirmDiscard = () => !useEditor.getState().dirty || window.confirm('Ungespeicherte Änderungen verwerfen?');

  const [ifcOpen, setIfcOpen] = useState(false);

  const onNew = () => {
    if (confirmDiscard()) st.newProject();
  };

  const onOpen = async () => {
    if (!confirmDiscard()) return;
    let name = '';
    try {
      const f = await projektDateiWaehlen({ datei: useEditor.getState().datei });
      if (!f) return;
      name = f.pfad ?? f.name;
      const done = log.time(`Öffnen: ${name}`);
      const p = readProjectFile(f.bytes);
      st.loadProject(p, p, name);
      done({ bytes: f.bytes.byteLength, geschosse: p.storeys.length, dateien: p.dateien?.length ?? 0 });
      void restoreIfcModel(p);
    } catch (e) {
      log.error(`Öffnen fehlgeschlagen: ${name}`, e);
      alert(e instanceof ProjectFormatError ? e.message : `Datei konnte nicht geladen werden: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const onSave = async (unter = false) => {
    const { project: p, basis, datei } = useEditor.getState();
    try {
      const r = await projektSpeichern({ project: p, basis, datei, unter, app: __APP_VERSION__, filterName: 'Flächenprojekt', fuerDatei: mitVorlage });
      // während des Dialogs weitergezeichnet? Dann bleibt der neue Stand ungespeichert.
      if (r && useEditor.getState().project === p) useEditor.getState().markSaved(r.project, r.datei);
      else if (r) useEditor.setState({ datei: r.datei, basis: r.project });
    } catch (e) {
      log.error('Speichern fehlgeschlagen', e);
      alert(`Speichern fehlgeschlagen: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

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
      alert(`Export fehlgeschlagen: ${String(e)}`);
    }
  };

  return (
    <div className="toolbar">
      <div className="tb-group">
        <button onClick={onNew} title="Neues Projekt">
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
        <button onClick={st.undo} disabled={!canUndo} title="Rückgängig (Strg+Z)">
          ↶
        </button>
        <button onClick={st.redo} disabled={!canRedo} title="Wiederholen (Strg+Y)">
          ↷
        </button>
      </div>
      <div className="tb-group">
        {TOOLS.map((t) => (
          <button
            key={t.id}
            className={tool === t.id ? 'active' : ''}
            onClick={() => st.setTool(t.id)}
            title={`${t.label}${t.key ? ` (${t.key})` : ''}`}
          >
            <span className="tb-icon">{t.icon}</span> {t.label}
          </button>
        ))}
      </div>
      <div className="tb-group" title="Art der neu gezeichneten Fläche">
        <span className="tb-label">als</span>
        <button className={drawKind === 'outline' ? 'active kind-outline' : ''} onClick={() => st.setDrawKind('outline')} title="BGF-Umriss (B)">
          BGF-Umriss
        </button>
        <button className={drawKind === 'room' ? 'active kind-room' : ''} onClick={() => st.setDrawKind('room')} title="Raum / NRF (N)">
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

