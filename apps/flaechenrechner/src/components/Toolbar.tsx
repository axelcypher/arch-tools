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
import type { MenuePunkt } from '@core/ui/Menue';
import { MenueKnopf } from '@core/ui/Menue';
import { Werkzeugleiste } from '@core/ui/Werkzeugleiste';
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

  // Datei: seltene Dateibefehle und Importe (design.md „Kopf- und Werkzeugleisten“)
  const dateiPunkte = (): MenuePunkt[] => [
    { text: 'Neu', symbol: 'datei', aktion: () => void onNew() },
    { text: 'Öffnen …', symbol: 'ordnerOffen', tasten: 'Strg+O', aktion: () => void onOpen() },
    ...(isTauri() ? [{ text: 'Speichern unter …', symbol: 'speichern' as const, tasten: 'Strg+Umschalt+S', aktion: () => void onSave(true) }] : []),
    { trenner: true },
    {
      text: hatPlan ? 'Plan ersetzen …' : 'Plan laden …',
      symbol: 'bild',
      titel: hatPlan ? 'Plan des Geschosses durch einen anderen ersetzen (PDF, DXF, Bild)' : 'Grundriss als PDF, DXF oder Bild laden – zum Nachzeichnen und Erkennen',
      aktion: () => void planLaden(aktivesGeschoss()),
    },
    { text: 'IFC importieren …', symbol: 'stapel', titel: 'Gebäudemodell als IFC-Datei aus dem CAD-Programm importieren', aktion: () => setIfcOpen(true) },
  ];
  const exportPunkte = (): MenuePunkt[] => [
    { text: 'CSV …', symbol: 'export', titel: 'Flächenaufstellung als CSV exportieren', aktion: () => void onCsv() },
    { text: 'Excel …', symbol: 'tabelle', titel: 'Excel-Export (Standardlayout oder eigene Vorlage)', aktion: () => st.setExcelOpen(true) },
  ];
  const kalibrierenAktiv = tool === 'calibrate' || tool === 'kontrolle';

  return (
    <>
      <Werkzeugleiste
        name="Werkzeugleiste"
        teile={[
          { id: 'datei', inhalt: <MenueKnopf punkte={dateiPunkte}>Datei</MenueKnopf> },
          {
            id: 'speichern',
            gruppe: true,
            inhalt: (
              // ungespeicherte Änderungen als Punkt in der Ecke – ändert die Breite der Leiste nicht
              <button
                className={dirty ? 'ungespeichert' : undefined}
                onClick={() => void onSave()}
                title={`${isTauri() ? 'Projekt speichern – in die geöffnete Datei (Strg+S)' : 'Projekt als Datei herunterladen (Strg+S)'}${dirty ? ' – ungespeicherte Änderungen' : ''}`}
                aria-label={dirty ? 'Speichern – ungespeicherte Änderungen' : 'Speichern'}
              >
                <Symbol name="speichern" /> <span className="tb-text">Speichern</span>
              </button>
            ),
          },
          {
            id: 'bearbeiten',
            gruppe: true,
            inhalt: (
              <>
                <button onClick={rueckgaengig} disabled={!canUndo} title="Rückgängig (Strg+Z) – beim Zeichnen zuerst den letzten Punkt" aria-label="Rückgängig">
                  <Symbol name="rueckgaengig" />
                </button>
                <button onClick={st.redo} disabled={!canRedo} title="Wiederholen (Strg+Y)" aria-label="Wiederholen">
                  <Symbol name="wiederholen" />
                </button>
              </>
            ),
          },
          {
            id: 'werkzeuge',
            gruppe: true,
            inhalt: (
              <div className="tb-werkzeuge" role="group" aria-label="Werkzeuge">
                {TOOLS.map((t) => (
                  <button key={t.id} className={tool === t.id ? 'active' : ''} aria-pressed={tool === t.id} aria-label={t.label} onClick={() => st.setTool(t.id)} title={t.title}>
                    <Symbol name={t.symbol} /> <span className="tb-werkzeug-text">{t.label}</span>
                  </button>
                ))}
                <button
                  className={kalibrierenAktiv ? 'active' : ''}
                  aria-pressed={kalibrierenAktiv}
                  aria-label="Kalibrieren"
                  disabled={!hatPlan && tool !== 'calibrate'}
                  onClick={() => st.setTool('calibrate')}
                  title={hatPlan ? 'Plan kalibrieren – zwei Punkte mit bekanntem Abstand (K)' : 'Zuerst einen Plan laden (Datei → Plan laden …)'}
                >
                  <Symbol name="kalibrieren" /> <span className="tb-werkzeug-text">Kalibrieren</span>
                </button>
              </div>
            ),
          },
          {
            id: 'art',
            inhalt: (
              // Haupt-Umschalter: Art der neu gezeichneten Fläche
              <div className="segment" role="group" aria-label="Neue Flächen zeichnen als" title="Neue Flächen zeichnen als BGF-Umriss oder Raum">
                <button
                  className={drawKind === 'outline' ? 'active kind-outline' : ''}
                  aria-pressed={drawKind === 'outline'}
                  onClick={() => st.setDrawKind('outline')}
                  title="Neue Flächen als BGF-Umriss (B)"
                >
                  BGF-Umriss
                </button>
                <button className={drawKind === 'room' ? 'active kind-room' : ''} aria-pressed={drawKind === 'room'} onClick={() => st.setDrawKind('room')} title="Neue Flächen als Raum / NRF (N)">
                  Raum
                </button>
              </div>
            ),
          },
          { abstand: true },
          { id: 'export', rang: 1, inhalt: <MenueKnopf punkte={exportPunkte}>Exportieren</MenueKnopf>, menue: { text: 'Exportieren', symbol: 'export', unter: exportPunkte() } },
          {
            id: 'haupt',
            inhalt: (
              <button className="primary" onClick={() => st.setReportOpen(true)} title="Flächenaufstellung zum Prüfen, Drucken und als PDF">
                <Symbol name="formular" /> Flächenaufstellung …
              </button>
            ),
          },
        ]}
      />
      {ifcOpen && <IfcImportDialog onClose={() => setIfcOpen(false)} />}
    </>
  );
}
