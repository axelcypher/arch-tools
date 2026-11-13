import { lazy, Suspense, useEffect, useState } from 'react';
import { APP_NAMEN } from '@core/appNamen';
import { Canvas } from './components/Canvas';
import { ExcelDialog } from './components/ExcelDialog';
import { Properties } from './components/Properties';
import { Report } from './components/Report';
import { Sidebar } from './components/Sidebar';
import { KopieDialogHost } from './components/KopieDialog';
import { PlanLadenHost } from './components/BackgroundPanel';
import { katalogLaden } from './core/katalog';
import { LogDialog } from '@core/ui/LogDialog';
import { TitleBar } from '@core/ui/TitleBar';
import { projektDateiOeffnen, projektSpeichernAktion, projektUebernehmen, Toolbar, verwerfenOk } from './components/Toolbar';
import { isTauri } from '@core/platform/files';
import { ProjektWahl } from '@core/ui/ProjektWahl';
import { useEditor } from './store/store';

const View3D = lazy(() => import('./components/View3D'));

export function App() {
  const reportOpen = useEditor((s) => s.reportOpen);
  const excelOpen = useEditor((s) => s.excelOpen);
  const mainView = useEditor((s) => s.mainView);
  const setMainView = useEditor((s) => s.setMainView);
  const name = useEditor((s) => s.project.name);
  const dirty = useEditor((s) => s.dirty);
  const [logOpen, setLogOpen] = useState(false);
  const datei = useEditor((s) => s.datei);
  // Beim Start die Projektübersicht – auf dem Desktop immer (das zuletzt bearbeitete Projekt bleibt über „Zurück zu …“
  // erreichbar), im Browser, solange kein Projekt bzw. kein Zwischenstand da ist (gleicher Einstieg wie die anderen Apps)
  const [projekteOffen, setProjekteOffen] = useState(() => {
    const s = useEditor.getState();
    return isTauri() || (!s.datei && s.project.storeys.every((st) => !st.shapes.length));
  });

  // Raumkatalog und Nutzungsarten aus dem Konfigurationsordner (F-11, F-14)
  useEffect(() => void katalogLaden(), []);

  useEffect(() => {
    document.title = `${dirty ? '• ' : ''}${name} – ${APP_NAMEN.flaechenrechner.name}`;
  }, [name, dirty]);

  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (useEditor.getState().dirty) e.preventDefault();
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, []);

  return (
    <div className="app">
      <TitleBar
        app={APP_NAMEN.flaechenrechner.name}
        name={name}
        dirty={dirty}
        onOpenLog={() => setLogOpen(true)}
        regeln="flaechen"
        onProjekte={() => setProjekteOffen(true)}
        onSpeichern={() => projektSpeichernAktion()}
      />
      <Toolbar />
      <div className="workspace">
        <Sidebar />
        <main className="main">
          <div className="segment view-switch" role="group" aria-label="Ansicht">
            <button aria-pressed={mainView === '2d'} onClick={() => setMainView('2d')}>
              Grundriss
            </button>
            <button aria-pressed={mainView === '3d'} onClick={() => setMainView('3d')}>
              3D
            </button>
          </div>
          <div className={mainView === '2d' ? 'view-pane' : 'view-pane hidden'}>
            <Canvas />
          </div>
          {mainView === '3d' && (
            <div className="view-pane">
              <Suspense fallback={<p className="busy view-loading">3D-Ansicht wird geladen …</p>}>
                <View3D />
              </Suspense>
            </div>
          )}
        </main>
        <Properties />
      </div>
      {reportOpen && <Report />}
      {excelOpen && <ExcelDialog />}
      {projekteOffen && (
        <ProjektWahl
          app={APP_NAMEN.flaechenrechner.name}
          offeneDatei={datei}
          onGewaehlt={async (g) => {
            if (await projektUebernehmen(g.project, g.datei)) setProjekteOffen(false);
          }}
          onSchliessen={() => setProjekteOffen(false)}
          onDateiOeffnen={() => {
            setProjekteOffen(false);
            void projektDateiOeffnen();
          }}
          onNeu={async () => {
            if (!(await verwerfenOk())) return;
            useEditor.getState().newProject();
            setProjekteOffen(false);
          }}
        />
      )}
      {logOpen && <LogDialog onClose={() => setLogOpen(false)} />}
      <KopieDialogHost />
      {/* außerhalb der Ansichten: die PDF-Seitenwahl ist auch aus der 3D-Ansicht sichtbar */}
      <PlanLadenHost />
    </div>
  );
}
