import { speichernAbwarten } from '@core/platform/projektDatei';
import { APP_NAMEN } from '@core/appNamen';
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
import { KatalogDialog } from './components/KatalogDialog';
import { KostenDruck } from './components/KostenDruck';
import { KostenView } from './components/KostenView';
import { MengenView } from './components/MengenView';
import { bauteileLaden } from './bauteile';
import { ifcAktualisierenWaehlen, oeffnen, speichern } from './datei';
import type { MengenBezug } from './mengen';
import { useKosten } from './store';

const log = logger('app');

export function App() {
  const name = useKosten((s) => s.project.name);
  const dirty = useKosten((s) => s.dirty);
  const hatGebaeude = useKosten((s) => s.project.storeys.some((st) => st.shapes.some((x) => x.kind === 'outline')));
  const hatPositionen = useKosten((s) => (s.project.kosten?.positionen.length ?? 0) > 0);
  const canUndo = useKosten((s) => s.past.length > 0);
  const canRedo = useKosten((s) => s.future.length > 0);
  const dateien = useKosten((s) => s.project.dateien);
  const [logOpen, setLogOpen] = useState(false);
  const datei = useKosten((s) => s.datei);
  // Desktop: beim Start die Projektübersicht (das zuletzt bearbeitete Projekt bleibt über „Zurück zu …“ erreichbar)
  const [projekteOffen, setProjekteOffen] = useState(() => isTauri());
  const [excelOpen, setExcelOpen] = useState(false);
  const [druckOpen, setDruckOpen] = useState(false);
  const [katalogOpen, setKatalogOpen] = useState(false);
  const [ansicht, setAnsicht] = useState<'kosten' | 'mengen'>('kosten');
  const [menge, setMenge] = useState<MengenBezug>('bgf');
  const [busy, setBusy] = useState<string | null>(null);
  const [bericht, setBericht] = useState<string[]>([]);

  // Wände des mitgespeicherten IFC-Modells für die Innenwandfläche
  useEffect(() => {
    void bauteileLaden(useKosten.getState().project);
  }, [dateien]);

  useEffect(() => {
    document.title = `${dirty ? '• ' : ''}${name} – ${APP_NAMEN.kosten.name}`;
  }, [name, dirty]);

  /** vor Öffnen/Neu: ungespeicherte Änderungen speichern, verwerfen oder abbrechen */
  const weiterNachRueckfrage = async () => {
    eingabeAbschliessen();
    return !useKosten.getState().dirty || (await aenderungenSpeichern(useKosten.getState().project.name, () => onSave()));
  };

  // „Neues Projekt“: leeres Projekt (z. B. nur Lageplan bzw. Mengen von Hand); verwirft auch den Zwischenstand
  const [neuBegonnen, setNeuBegonnen] = useState(false);
  const onNeu = async () => {
    if (!(await weiterNachRueckfrage())) return;
    useKosten.getState().load(createProject());
    setBericht([]);
    setNeuBegonnen(true);
    setProjekteOffen(false);
  };

  const onOpen = async () => {
    if (!(await weiterNachRueckfrage())) return;
    try {
      const r = await oeffnen(setBusy, useKosten.getState().datei);
      if (r) {
        useKosten.getState().load(r.project, r.datei, r.basis);
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
      const { project, datei } = useKosten.getState();
      const r = await ifcAktualisierenWaehlen(project, datei, setBusy);
      if (r) {
        useKosten.getState().update(() => r.project);
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
    const { project, datei, basis, dokument } = useKosten.getState();
    try {
      const r = await speichern(project, datei, basis, unter);
      // während des Speicherns weitergearbeitet? Dann bleibt der neue Stand ungespeichert (mit den Änderungen aus der Datei).
      if (r) useKosten.getState().markSaved(r.datei, r.project, project, dokument);
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
      } else if (k === 'p' && hatPositionen) {
        e.preventDefault();
        setDruckOpen(true);
      } else if ((istEingabeZiel(e.target) || dialogOffen()) && (k === 'z' || k === 'y')) {
        // im Feld: Rückgängig des Browsers für den Text; hinter einem Dialog nichts am Projekt ändern
      } else if (k === 'z' && !e.shiftKey) {
        e.preventDefault();
        useKosten.getState().undo();
      } else if (k === 'y' || (k === 'z' && e.shiftKey)) {
        e.preventDefault();
        useKosten.getState().redo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (useKosten.getState().dirty) e.preventDefault();
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, []);

  return (
    <div className="app">
      <TitleBar app={APP_NAMEN.kosten.name} name={name} dirty={dirty} onOpenLog={() => setLogOpen(true)} regeln="kosten" onProjekte={() => setProjekteOffen(true)} onSpeichern={() => onSave()} />
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
          <button className={ansicht === 'kosten' ? 'active' : ''} onClick={() => setAnsicht('kosten')} title="Grundlagen, Positionen und Kostenübersicht">
            Kosten
          </button>
          <button
            className={ansicht === 'mengen' ? 'active' : ''}
            onClick={() => setAnsicht('mengen')}
            disabled={!hatGebaeude}
            title="Zeigt im Grundriss und im 3D-Modell, aus welchen Flächen sich jede Menge zusammensetzt"
          >
            Mengen prüfen
          </button>
        </div>
        <div className="tb-group">
          <button onClick={() => setKatalogOpen(true)} title="Kennwertkatalog laden, speichern und Kennwerte als Positionen übernehmen">
            Kennwertkatalog …
          </button>
        </div>
        <div className="tb-group">
          <button onClick={() => setDruckOpen(true)} disabled={!hatPositionen} title="Druckbare Kostenermittlung – über den Druckdialog auch als PDF (Strg+P)">
            Kosten drucken
          </button>
          <button onClick={() => setExcelOpen(true)} disabled={!hatPositionen} title="Kostenermittlung als Excel-Datei – Standardlayout oder eigene Vorlage">
            Excel …
          </button>
        </div>
        <div className="tb-group">
          <button onClick={() => useKosten.getState().undo()} disabled={!canUndo} title="Rückgängig (Strg+Z)">
            ↶
          </button>
          <button onClick={() => useKosten.getState().redo()} disabled={!canRedo} title="Wiederholen (Strg+Y)">
            ↷
          </button>
        </div>
        {busy && <span className="busy">{busy}</span>}
      </div>
      <main className="ko-main">
        {bericht.length > 0 && (
          <div className="ko-bericht">
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
        {!hatGebaeude && !hatPositionen && !neuBegonnen && (
          <ProjektEinstieg
            titel="Kostenermittlung nach DIN 276"
            text={'Projekt oder IFC öffnen: ein Projekt aus QUADRIO (Flächenrechner, .oap) oder direkt ein IFC-Modell. BGF, BRI, Nutzungs- und Wohnflächen sowie grobe Bauteilmengen kommen aus dem Projekt; Kennwerte, Positionen und Kostenstände pflegt dieses Tool. Ohne Gebäudemodell lassen sich die Mengen auch von Hand eintragen („Neues Projekt“).'}
            onProjekte={isTauri() ? () => setProjekteOffen(true) : undefined}
            onDateiOeffnen={() => void onOpen()}
            dateiHinweis="Projektdatei (.oap) oder IFC-Modell"
            onNeu={() => void onNeu()}
          />
        )}
        {ansicht === 'mengen' && hatGebaeude ? (
          <MengenView bezug={menge} onBezug={setMenge} />
        ) : (
          <KostenView
            onKatalog={() => setKatalogOpen(true)}
            onMenge={
              hatGebaeude
                ? (b) => {
                    setMenge(b);
                    setAnsicht('mengen');
                  }
                : undefined
            }
          />
        )}
      </main>
      {druckOpen && <KostenDruck onClose={() => setDruckOpen(false)} />}
      {excelOpen && <ExcelDialog onClose={() => setExcelOpen(false)} />}
      {katalogOpen && <KatalogDialog onClose={() => setKatalogOpen(false)} />}
      {projekteOffen && (
        <ProjektWahl
          app={APP_NAMEN.kosten.name}
          offeneDatei={datei}
          onGewaehlt={async (g) => {
            if (!(await weiterNachRueckfrage())) return;
            useKosten.getState().load(g.project, g.datei, g.project);
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
