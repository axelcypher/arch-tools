import { speichernAbwarten } from '@core/platform/projektDatei';
import { dialogOffen, eingabeAbschliessen, istEingabeZiel } from '@core/platform/eingabe';
import { useEffect, useState } from 'react';
import { isTauri } from '@core/platform/files';
import { logger } from '@core/platform/log';
import { LogDialog } from '@core/ui/LogDialog';
import { TitleBar } from '@core/ui/TitleBar';
import { ProjektEinstieg, ProjektWahl } from '@core/ui/ProjektWahl';
import { createProject } from '@core/model';
import { aenderungenSpeichern, meldung, oeffnenFehlgeschlagen } from '@core/ui/Rueckfrage';
import { ExcelDialog } from './components/ExcelDialog';
import { GrzGfzView } from './components/GrzGfzView';
import { NachweisDruck } from './components/NachweisDruck';
import { ifcAktualisierenWaehlen, oeffnen, speichern } from './datei';
import { useGrz } from './store';

const log = logger('app');

export function App() {
  const name = useGrz((s) => s.project.name);
  const dirty = useGrz((s) => s.dirty);
  const hatGebaeude = useGrz((s) => s.project.storeys.some((st) => st.shapes.some((x) => x.kind === 'outline')));
  const canUndo = useGrz((s) => s.past.length > 0);
  const canRedo = useGrz((s) => s.future.length > 0);
  const [logOpen, setLogOpen] = useState(false);
  const datei = useGrz((s) => s.datei);
  // Desktop: beim Start die Projektübersicht (das zuletzt bearbeitete Projekt bleibt über „Zurück zu …“ erreichbar)
  const [projekteOffen, setProjekteOffen] = useState(() => isTauri());
  const [excelOpen, setExcelOpen] = useState(false);
  const [druckOpen, setDruckOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [bericht, setBericht] = useState<string[]>([]);

  useEffect(() => {
    document.title = `${dirty ? '• ' : ''}${name} – GRZ-Nachweis`;
  }, [name, dirty]);

  /** vor Öffnen/Neu: ungespeicherte Änderungen speichern, verwerfen oder abbrechen */
  const weiterNachRueckfrage = async () => {
    eingabeAbschliessen();
    return !useGrz.getState().dirty || (await aenderungenSpeichern(useGrz.getState().project.name, () => onSave()));
  };

  // „Neues Projekt“: leeres Projekt (z. B. nur Lageplan bzw. Mengen von Hand); verwirft auch den Zwischenstand
  const [neuBegonnen, setNeuBegonnen] = useState(false);
  const onNeu = async () => {
    if (!(await weiterNachRueckfrage())) return;
    useGrz.getState().load(createProject());
    setBericht([]);
    setNeuBegonnen(true);
    setProjekteOffen(false);
  };

  const onOpen = async () => {
    if (!(await weiterNachRueckfrage())) return;
    try {
      const r = await oeffnen(setBusy, useGrz.getState().datei);
      if (r) {
        useGrz.getState().load(r.project, r.datei, r.basis);
        setBericht(r.bericht);
      }
    } catch (e) {
      log.error('Öffnen fehlgeschlagen', e instanceof Error ? e.message : String(e));
      await oeffnenFehlgeschlagen(e);
    } finally {
      setBusy(null);
    }
  };

  const onIfcAktualisieren = async () => {
    try {
      const { project, datei } = useGrz.getState();
      const r = await ifcAktualisierenWaehlen(project, datei, setBusy);
      if (r) {
        useGrz.getState().update(() => r.project);
        setBericht(r.bericht);
      }
    } catch (e) {
      log.error('IFC-Aktualisierung fehlgeschlagen', e);
      await oeffnenFehlgeschlagen(e, undefined, 'Das Projekt bleibt unverändert.');
    } finally {
      setBusy(null);
    }
  };

  /** liefert true, wenn gespeichert wurde */
  const onSave = async (unter = false): Promise<boolean> => {
    eingabeAbschliessen();
    await speichernAbwarten(); // Strg+S während eines Speicherns: danach den aktuellen Stand speichern
    const { project, datei, basis, dokument } = useGrz.getState();
    try {
      const r = await speichern(project, datei, basis, unter);
      // während des Speicherns weitergearbeitet? Dann bleibt der neue Stand ungespeichert (mit den Änderungen aus der Datei).
      if (r) useGrz.getState().markSaved(r.datei, r.project, project, dokument);
      return !!r;
    } catch (e) {
      log.error('Speichern fehlgeschlagen', e instanceof Error ? e.message : String(e));
      await meldung('Speichern fehlgeschlagen', 'Das Projekt ließ sich nicht speichern. Die Änderungen bleiben in der App erhalten.', e);
      return false;
    }
  };

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
      } else if (k === 'p' && hatGebaeude) {
        e.preventDefault();
        setDruckOpen(true);
      } else if ((istEingabeZiel(e.target) || dialogOffen()) && (k === 'z' || k === 'y')) {
        // im Feld: Rückgängig des Browsers für den Text; hinter einem Dialog nichts am Projekt ändern
      } else if (k === 'z' && !e.shiftKey) {
        e.preventDefault();
        useGrz.getState().undo();
      } else if (k === 'y' || (k === 'z' && e.shiftKey)) {
        e.preventDefault();
        useGrz.getState().redo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (useGrz.getState().dirty) e.preventDefault();
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, []);

  return (
    <div className="app">
      <TitleBar app="GRZ-Nachweis" name={name} dirty={dirty} onOpenLog={() => setLogOpen(true)} regeln="grz" onProjekte={() => setProjekteOffen(true)} onSpeichern={() => onSave()} />
      <div className="toolbar">
        <div className="tb-group">
          <button onClick={onOpen} title="Projekt (.oap) oder IFC-Modell öffnen (Strg+O)">
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
          <button
            onClick={() => void onIfcAktualisieren()}
            disabled={!hatGebaeude}
            title="Neuen Export desselben IFC-Modells übernehmen: Räume über die IFC-GlobalId abgleichen, Ihre Änderungen bleiben"
          >
            IFC aktualisieren …
          </button>
        </div>
        <div className="tb-group">
          <button onClick={() => setDruckOpen(true)} disabled={!hatGebaeude} title="Druckbarer Nachweis – über den Druckdialog auch als PDF (Strg+P)">
            Nachweis drucken
          </button>
          <button onClick={() => setExcelOpen(true)} disabled={!hatGebaeude} title="Nachweis als Excel-Datei – Standardlayout oder eigene Vorlage">
            Excel …
          </button>
        </div>
        <div className="tb-group">
          <button onClick={() => useGrz.getState().undo()} disabled={!canUndo} title="Rückgängig (Strg+Z)">
            ↶
          </button>
          <button onClick={() => useGrz.getState().redo()} disabled={!canRedo} title="Wiederholen (Strg+Y)">
            ↷
          </button>
        </div>
        {busy && <span className="busy">{busy}</span>}
      </div>
      <main className="grz-main">
        {bericht.length > 0 && (
          <div className="grz-bericht">
            <strong>IFC-Import:</strong>
            <ul>
              {bericht.map((z, i) => (
                <li key={i}>{z}</li>
              ))}
            </ul>
            <button className="small" onClick={() => setBericht([])}>
              Schließen
            </button>
          </div>
        )}
        {!hatGebaeude && !neuBegonnen && (
          <ProjektEinstieg
            titel="GRZ-Nachweis"
            text={'Projekt oder IFC öffnen: ein Projekt des Flächenrechners (.oap) oder direkt ein IFC-Modell. Gebäudeumrisse, Geschosse und Geschossflächen kommen aus dem Projekt, den Lageplan pflegt dieses Tool; gespeichert wird in dieselbe Projektdatei.'}
            onProjekte={isTauri() ? () => setProjekteOffen(true) : undefined}
            onDateiOeffnen={() => void onOpen()}
            dateiHinweis="Projektdatei (.oap) oder IFC-Modell"
            onNeu={() => void onNeu()}
          />
        )}
        <GrzGfzView />
      </main>
      {druckOpen && <NachweisDruck onClose={() => setDruckOpen(false)} />}
      {excelOpen && <ExcelDialog onClose={() => setExcelOpen(false)} />}
      {projekteOffen && (
        <ProjektWahl
          app="GRZ-Nachweis"
          offeneDatei={datei}
          onGewaehlt={async (g) => {
            if (!(await weiterNachRueckfrage())) return;
            useGrz.getState().load(g.project, g.datei, g.project);
            setBericht([]);
            setProjekteOffen(false);
          }}
          onSchliessen={() => setProjekteOffen(false)}
          onDateiOeffnen={() => {
            setProjekteOffen(false);
            void onOpen();
          }}
          onNeu={() => void onNeu()}
          dateiHinweis="Projektdatei (.oap) oder IFC-Modell"
        />
      )}
      {logOpen && <LogDialog onClose={() => setLogOpen(false)} />}
    </div>
  );
}
