import { dialogOffen, eingabeAbschliessen, istEingabeZiel } from '@core/platform/eingabe';
import { useEffect, useState } from 'react';
import { isTauri } from '@core/platform/files';
import { logger } from '@core/platform/log';
import { LogDialog } from '@core/ui/LogDialog';
import { TitleBar } from '@core/ui/TitleBar';
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
    document.title = `${dirty ? '• ' : ''}${name} – Kostenermittlung`;
  }, [name, dirty]);

  const onOpen = async () => {
    eingabeAbschliessen();
    if (useKosten.getState().dirty && !window.confirm('Ungespeicherte Änderungen verwerfen?')) return;
    try {
      const r = await oeffnen(setBusy, useKosten.getState().datei);
      if (r) {
        useKosten.getState().load(r.project, r.datei, r.basis);
        setBericht(r.bericht);
      }
    } catch (e) {
      log.error('Öffnen fehlgeschlagen', e instanceof Error ? e.message : String(e));
      alert(`Datei konnte nicht geöffnet werden: ${e instanceof Error ? e.message : String(e)}`);
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
      alert(`IFC konnte nicht übernommen werden: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(null);
    }
  };

  const onSave = async (unter = false) => {
    eingabeAbschliessen();
    const { project, datei, basis, dokument } = useKosten.getState();
    try {
      const r = await speichern(project, datei, basis, unter);
      // während des Speicherns weitergearbeitet? Dann bleibt der neue Stand ungespeichert (mit den Änderungen aus der Datei).
      if (r) useKosten.getState().markSaved(r.datei, r.project, project, dokument);
    } catch (e) {
      log.error('Speichern fehlgeschlagen', e instanceof Error ? e.message : String(e));
      alert(`Speichern fehlgeschlagen: ${String(e)}`);
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
      <TitleBar app="Kostenermittlung" name={name} dirty={dirty} onOpenLog={() => setLogOpen(true)} regeln="kosten" />
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
        {!hatGebaeude && !hatPositionen && (
          <div className="ko-leer">
            <h2>Kostenermittlung nach DIN 276</h2>
            <p>
              Ein Projekt des Flächenrechners (<code>.oap</code>) oder direkt ein IFC-Modell öffnen. BGF, BRI, Nutzungs- und Wohnflächen sowie grobe
              Bauteilmengen kommen aus dem Projekt; Kennwerte, Positionen und Kostenstände pflegt dieses Tool. Gespeichert wird in dieselbe Projektdatei.
            </p>
            <p className="muted small-text">Ohne Gebäudemodell lassen sich die Mengen auch von Hand eintragen.</p>
            <button className="primary" onClick={onOpen}>
              Projekt oder IFC öffnen …
            </button>
          </div>
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
      {logOpen && <LogDialog onClose={() => setLogOpen(false)} />}
    </div>
  );
}
