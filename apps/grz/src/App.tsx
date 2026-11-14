import { speichernAbwarten } from '@core/platform/projektDatei';
import { APP_NAMEN, appMitWas } from '@core/appNamen';
import { dialogOffen, eingabeAbschliessen, istEingabeZiel } from '@core/platform/eingabe';
import { useEffect, useState } from 'react';
import { isTauri } from '@core/platform/files';
import { logger } from '@core/platform/log';
import { LogDialog } from '@core/ui/LogDialog';
import { Symbol } from '@core/ui/Symbol';
import type { MenuePunkt } from '@core/ui/Menue';
import { MenueKnopf } from '@core/ui/Menue';
import { Werkzeugleiste } from '@core/ui/Werkzeugleiste';
import { TitleBar } from '@core/ui/TitleBar';
import { ProjektEinstieg, ProjektWahl } from '@core/ui/ProjektWahl';
import { createProject } from '@core/model';
import { aenderungenSpeichern, bestaetigen, meldung, oeffnenFehlgeschlagen } from '@core/ui/Rueckfrage';
import { datumText } from '@core/ui/DruckKopf';
import { ExcelDialog } from './components/ExcelDialog';
import { GrzGfzView } from './components/GrzGfzView';
import { NachweisDruck } from './components/NachweisDruck';
import type { IfcBericht } from './datei';
import { ifcAktualisierenWaehlen, ifcBericht, oeffnen, speichern } from './datei';
import { useGrz } from './store';

const log = logger('app');

export function App() {
  const name = useGrz((s) => s.project.name);
  const dirty = useGrz((s) => s.dirty);
  const hatGebaeude = useGrz((s) => s.project.storeys.some((st) => st.shapes.some((x) => x.kind === 'outline')));
  const hatFlaechen = useGrz((s) => (s.project.lageplan?.flaechen.length ?? 0) > 0);
  /** Grund für gesperrte Knöpfe */
  const gesperrt = 'Erst ein Gebäude öffnen: Projekt (.oap) oder IFC-Modell';
  const canUndo = useGrz((s) => s.past.length > 0);
  const canRedo = useGrz((s) => s.future.length > 0);
  const undoName = useGrz((s) => s.pastAktionen[s.pastAktionen.length - 1]);
  const redoName = useGrz((s) => s.futureAktionen[0]);
  const [logOpen, setLogOpen] = useState(false);
  const datei = useGrz((s) => s.datei);
  const wiederhergestellt = useGrz((s) => s.wiederhergestellt);
  // Desktop: beim Start die Projektübersicht (das zuletzt bearbeitete Projekt bleibt über „Zurück zu …“ erreichbar)
  const [projekteOffen, setProjekteOffen] = useState(() => isTauri());
  const [excelOpen, setExcelOpen] = useState(false);
  const [druckOpen, setDruckOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [bericht, setBericht] = useState<IfcBericht | null>(null);

  useEffect(() => {
    document.title = `${dirty ? '• ' : ''}${name} – ${APP_NAMEN.grz.name}`;
  }, [name, dirty]);

  /** vor Öffnen/Neu: ungespeicherte Änderungen speichern, verwerfen oder abbrechen */
  const weiterNachRueckfrage = async () => {
    eingabeAbschliessen();
    return !useGrz.getState().dirty || (await aenderungenSpeichern(useGrz.getState().project.name, () => onSave()));
  };

  // Ansicht statt Einstieg: nach „Neues Projekt“ und nach jedem Öffnen – auch bei einem Projekt ohne Gebäude und Flächen
  const [neuBegonnen, setNeuBegonnen] = useState(false);
  // Einstiegskarte statt Ansicht: noch nichts geöffnet oder begonnen (Speichern ruht dann)
  const einstieg = !hatGebaeude && !hatFlaechen && !neuBegonnen;
  const onNeu = async () => {
    if (!(await weiterNachRueckfrage())) return;
    useGrz.getState().load(createProject());
    setBericht(null);
    setNeuBegonnen(true);
    setProjekteOffen(false);
  };

  const onOpen = async () => {
    if (!(await weiterNachRueckfrage())) return;
    try {
      const r = await oeffnen(setBusy, useGrz.getState().datei);
      if (r) {
        useGrz.getState().load(r.project, r.datei, r.basis);
        setBericht(r.basis === null ? ifcBericht(r.project, r.bericht, 'import') : null);
        setNeuBegonnen(true);
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
        useGrz.getState().update(() => r.project, undefined, 'IFC aktualisieren');
        setBericht(ifcBericht(r.project, r.bericht, 'abgleich'));
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
        if (!einstieg || useGrz.getState().dirty) void onSave(e.shiftKey);
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

  /** Menü „Datei“: seltene Dateibefehle (Speichern bleibt als Knopf sichtbar) */
  const dateiPunkte = (): MenuePunkt[] => [
    { text: 'Neu', symbol: 'datei', titel: 'Neues, leeres Projekt (fragt bei ungespeicherten Änderungen nach)', aktion: () => void onNeu() },
    { text: 'Öffnen …', symbol: 'ordnerOffen', tasten: 'Strg+O', titel: 'Projekt (.oap) oder IFC-Modell öffnen', aktion: () => void onOpen() },
    ...(isTauri()
      ? [{ text: 'Speichern unter …', symbol: 'speichern', tasten: 'Strg+Umschalt+S', titel: 'Projekt unter neuem Namen oder an anderem Ort speichern', aktion: () => void onSave(true) } as MenuePunkt]
      : []),
    { trenner: true },
    {
      text: 'IFC aktualisieren …',
      symbol: 'neuLaden',
      deaktiviert: !hatGebaeude,
      hinweis: hatGebaeude ? undefined : 'Kein Gebäude',
      titel: hatGebaeude ? 'Neuen Export desselben IFC-Modells übernehmen: Räume über die IFC-GlobalId abgleichen, Ihre Änderungen bleiben' : gesperrt,
      aktion: () => void onIfcAktualisieren(),
    },
  ];
  /** Menü „Mehr“: weitere Ausgabe (ein einzelnes Format – kein eigenes Menü „Exportieren“) */
  const mehrPunkte = (): MenuePunkt[] => [
    {
      text: 'Excel-Export …',
      symbol: 'tabelle',
      deaktiviert: !hatGebaeude,
      hinweis: hatGebaeude ? undefined : 'Kein Gebäude',
      titel: hatGebaeude ? 'Nachweis als Excel-Datei – Standardlayout oder eigene Vorlage' : gesperrt,
      aktion: () => setExcelOpen(true),
    },
  ];

  return (
    <div className="app">
      <TitleBar app={APP_NAMEN.grz.name} name={name} dirty={dirty} onOpenLog={() => setLogOpen(true)} regeln="grz" onProjekte={() => setProjekteOffen(true)} onSpeichern={() => onSave()} />
      <Werkzeugleiste
        name="Werkzeugleiste"
        teile={[
          // links „Datei“ und „Speichern“, dann Rückgängig/Wiederholen, rechts der Hauptknopf, zuletzt „Mehr“ (docs/design.md, „Kopf- und Werkzeugleisten“)
          { id: 'datei', rang: 1, inhalt: <MenueKnopf punkte={dateiPunkte}>Datei</MenueKnopf>, menue: { text: 'Datei', unter: dateiPunkte() } },
          {
            id: 'speichern',
            gruppe: true,
            inhalt: (
              // ungespeicherte Änderungen als Punkt in der Ecke – ändert die Breite der Leiste nicht
              <button
                className={dirty ? 'ungespeichert' : undefined}
                aria-label={dirty ? 'Speichern – ungespeicherte Änderungen' : 'Speichern'}
                onClick={() => void onSave()}
                disabled={einstieg && !dirty}
                title={
                  einstieg && !dirty ? 'Erst ein Projekt öffnen oder neu beginnen' : isTauri() ? 'Projekt speichern – in die geöffnete Datei (Strg+S)' : 'Projekt als Datei herunterladen (Strg+S)'
                }
              >
                <Symbol name="speichern" /> Speichern
              </button>
            ),
          },
          {
            id: 'verlauf',
            gruppe: true,
            inhalt: (
              <>
                <button
                  className="icon"
                  aria-label="Rückgängig"
                  onClick={() => useGrz.getState().undo()}
                  disabled={!canUndo}
                  title={canUndo ? `Rückgängig: ${undoName ?? 'Änderung'} (Strg+Z)` : 'Rückgängig (Strg+Z)'}
                >
                  <Symbol name="rueckgaengig" />
                </button>
                <button
                  className="icon"
                  aria-label="Wiederholen"
                  onClick={() => useGrz.getState().redo()}
                  disabled={!canRedo}
                  title={canRedo ? `Wiederholen: ${redoName ?? 'Änderung'} (Strg+Y)` : 'Wiederholen (Strg+Y)'}
                >
                  <Symbol name="wiederholen" />
                </button>
              </>
            ),
          },
          // Statusmarke: bleibt sichtbar, solange sie etwas meldet
          ...(busy ? [{ id: 'busy', kuerzbar: true, inhalt: <span className="busy">{busy}</span> }] : []),
          { abstand: true },
          {
            id: 'drucken',
            inhalt: (
              <button
                className="primary"
                onClick={() => setDruckOpen(true)}
                disabled={!hatGebaeude}
                title={hatGebaeude ? 'Druckbarer Nachweis – über den Druckdialog auch als PDF (Strg+P)' : gesperrt}
              >
                <Symbol name="drucken" /> Nachweis drucken …
              </button>
            ),
          },
        ]}
        mehr={mehrPunkte}
      />
      <main className="grz-main">
        {wiederhergestellt !== null && dirty && (
          <div className="meldung warnung grz-bericht" role="status">
            Ungespeicherter Stand vom {datumText(new Date(wiederhergestellt))} {new Date(wiederhergestellt).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })} wiederhergestellt –{' '}
            <button className="small" onClick={() => void onSave()}>
              Speichern
            </button>{' '}
            <button
              className="small"
              onClick={async () => {
                const ziel = useGrz.getState().basis ? `der Stand der Datei „${useGrz.getState().datei ?? ''}“` : 'ein leeres Projekt';
                if (await bestaetigen('Zwischenstand verwerfen?', `Die wiederhergestellten Änderungen gehen verloren; geöffnet bleibt ${ziel}.`, 'Verwerfen', true)) useGrz.getState().verwerfen();
              }}
            >
              Verwerfen
            </button>
          </div>
        )}
        {bericht && (
          // Warnfarbe nur, wenn der Bericht etwas meldet; Esc im Bericht schließt ihn
          <div
            className={bericht.zeilen.length > 0 ? 'meldung warnung grz-bericht' : 'meldung grz-bericht'}
            role="status"
            onKeyDown={(e) => {
              if (e.key === 'Escape') setBericht(null);
            }}
          >
            <div className="grz-bericht-kopf">
              <span>
                <strong>{bericht.titel}:</strong> {bericht.zusammenfassung}
              </span>
              <button className="icon small" aria-label="Bericht schließen" title="Bericht schließen" onClick={() => setBericht(null)}>
                <Symbol name="schliessen" />
              </button>
            </div>
            {bericht.zeilen.length > 0 && (
              <ul>
                {bericht.zeilen.map((z, i) => (
                  <li key={i}>{z}</li>
                ))}
              </ul>
            )}
          </div>
        )}
        {(neuBegonnen || hatFlaechen) && !hatGebaeude && (
          <div className="meldung grz-bericht" role="status">
            Das Projekt enthält noch keinen Gebäudeumriss. Gebäude in {appMitWas('flaechenrechner')} zeichnen oder ein IFC-Modell öffnen; Lageplan und Festsetzungen lassen sich schon pflegen.
          </div>
        )}
        {einstieg ? (
          <ProjektEinstieg
            titel={`${APP_NAMEN.grz.name} – ${APP_NAMEN.grz.was}`}
            text={`Öffnen Sie ein Projekt aus ${appMitWas('flaechenrechner')} oder ein IFC-Modell. Gebäude und Geschosse kommen von dort, den Lageplan zeichnen Sie hier. Gespeichert wird in dieselbe Projektdatei.`}
            onProjekte={isTauri() ? () => setProjekteOffen(true) : undefined}
            onDateiOeffnen={() => void onOpen()}
            dateiHinweis="Projektdatei (.oap) oder IFC-Modell"
            onNeu={() => void onNeu()}
          />
        ) : (
          <GrzGfzView />
        )}
      </main>
      {druckOpen && <NachweisDruck onClose={() => setDruckOpen(false)} />}
      {excelOpen && <ExcelDialog onClose={() => setExcelOpen(false)} />}
      {projekteOffen && (
        <ProjektWahl
          app={APP_NAMEN.grz.name}
          offeneDatei={datei}
          onGewaehlt={async (g) => {
            if (!(await weiterNachRueckfrage())) return;
            useGrz.getState().load(g.project, g.datei, g.project);
            setBericht(null);
            setNeuBegonnen(true);
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
