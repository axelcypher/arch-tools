import { Symbol } from '@core/ui/Symbol';
import type { MenuePunkt } from '@core/ui/Menue';
import { MenueKnopf } from '@core/ui/Menue';
import { Werkzeugleiste } from '@core/ui/Werkzeugleiste';
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
import { aenderungenSpeichern, bestaetigen, meldung, oeffnenFehlgeschlagen } from '@core/ui/Rueckfrage';
import { datumText } from '@core/ui/DruckKopf';
import { ExcelDialog } from './components/ExcelDialog';
import { KatalogDialog } from './components/KatalogDialog';
import { KostenDruck } from './components/KostenDruck';
import { KostenView } from './components/KostenView';
import { MengenView } from './components/MengenView';
import { bauteileAusModell, bauteileLaden } from './bauteile';
import { ifcAktualisierenWaehlen, oeffnen, speichern } from './datei';
import type { MengenBezug } from './mengen';
import { useKosten } from './store';

const log = logger('app');

/** Zeilen des IFC-Berichts, die auf ein Problem hinweisen (die übrigen sind Erfolgsmeldungen) */
const istWarnung = (z: string) => /keine|nicht|fehlt|ohne|Abweichung|prüfen|übersprungen|falsch|Fehler/i.test(z) && !/Abweichung zum Modell 0,0 %/.test(z);

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
  const wiederhergestellt = useKosten((s) => s.wiederhergestellt);
  // Desktop: beim Start die Projektübersicht (das zuletzt bearbeitete Projekt bleibt über „Zurück zu …“ erreichbar)
  const [projekteOffen, setProjekteOffen] = useState(() => isTauri());
  const [excelOpen, setExcelOpen] = useState(false);
  const [druckOpen, setDruckOpen] = useState(false);
  const [katalogOpen, setKatalogOpen] = useState(false);
  const [ansicht, setAnsicht] = useState<'kosten' | 'mengen'>('kosten');
  const [menge, setMenge] = useState<MengenBezug>('bgf');
  const [busy, setBusy] = useState<string | null>(null);
  const [bericht, setBericht] = useState<string[]>([]);
  // Name der gelesenen IFC-Datei (die zuletzt dem Projekt hinzugefügte), nicht der Projektdatei
  const berichtDatei = useKosten((s) => (bericht.length ? (s.project.dateien?.filter((d) => d.art === 'ifc').pop()?.name ?? null) : null));

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
  const [begonnen, setBegonnen] = useState(false);
  const onNeu = async () => {
    if (!(await weiterNachRueckfrage())) return;
    useKosten.getState().load(createProject());
    setBericht([]);
    setBegonnen(true);
    setProjekteOffen(false);
  };

  // Startbildschirm: nur der Einstieg, bis ein Projekt geöffnet oder neu begonnen ist
  const einstieg = !hatGebaeude && !hatPositionen && !begonnen && !dirty && !datei;

  const onOpen = async () => {
    if (!(await weiterNachRueckfrage())) return;
    try {
      const r = await oeffnen(setBusy, useKosten.getState().datei);
      if (r) {
        useKosten.getState().load(r.project, r.datei, r.basis);
        setBericht(r.bericht);
        setBegonnen(true);
      }
    } catch (e) {
      log.error('Öffnen fehlgeschlagen', e instanceof Error ? e.message : String(e));
      await oeffnenFehlgeschlagen(e);
    } finally {
      setBusy(null);
    }
  };

  const onIfcAktualisieren = async () => {
    eingabeAbschliessen();
    try {
      const { project, datei, dokument } = useKosten.getState();
      const r = await ifcAktualisierenWaehlen(project, datei, setBusy);
      if (r) {
        // während des Lesens weitergearbeitet oder ein anderes Projekt geöffnet: nichts überschreiben
        const jetzt = useKosten.getState();
        if (jetzt.dokument !== dokument || jetzt.project !== project) {
          log.info('IFC-Aktualisierung verworfen – Projekt wurde währenddessen geändert');
          await meldung('IFC nicht übernommen', 'Das Projekt wurde geändert, während das IFC-Modell gelesen wurde. Bitte „IFC aktualisieren …“ erneut aufrufen.');
          return;
        }
        jetzt.update(() => r.project);
        bauteileAusModell(r.project, r.extract);
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
        // auf dem Startbildschirm gibt es nichts zu speichern (wie der gesperrte Knopf)
        if (!einstieg) void onSave(e.shiftKey);
      } else if (k === 'o') {
        e.preventDefault();
        if (!dialogOffen() && !busy) void onOpen();
      } else if (k === 'p') {
        e.preventDefault();
        if (hatPositionen && !dialogOffen()) {
          eingabeAbschliessen();
          setDruckOpen(true);
        }
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

  const kostenAktiv = !einstieg && (ansicht === 'kosten' || !hatGebaeude);
  const mengenAktiv = ansicht === 'mengen' && hatGebaeude;
  // Menü „Datei“ (docs/design.md, „Kopf- und Werkzeugleisten“): Neu, Öffnen, Speichern unter, IFC aktualisieren
  const dateiPunkte = (): MenuePunkt[] => [
    { text: 'Neu', symbol: 'datei', aktion: () => void onNeu(), titel: 'Neues, leeres Projekt (fragt bei ungespeicherten Änderungen nach)' },
    { text: 'Öffnen …', symbol: 'ordnerOffen', tasten: 'Strg+O', aktion: () => void onOpen(), deaktiviert: !!busy, hinweis: busy ? 'läuft gerade' : undefined, titel: 'Projekt (.oap) oder IFC-Modell öffnen' },
    ...(isTauri() ? [{ text: 'Speichern unter …', symbol: 'speichern', tasten: 'Strg+Umschalt+S', aktion: () => void onSave(true), titel: 'Projekt unter neuem Namen oder an anderem Ort speichern' } as MenuePunkt] : []),
    { trenner: true },
    {
      text: 'IFC aktualisieren …',
      symbol: 'neuLaden',
      aktion: () => void onIfcAktualisieren(),
      deaktiviert: !hatGebaeude || !!busy,
      hinweis: !hatGebaeude ? 'erst Projekt mit Gebäude oder IFC-Modell öffnen' : busy ? 'läuft gerade' : undefined,
      titel: 'Neuen Export desselben IFC-Modells übernehmen: Räume über die IFC-GlobalId abgleichen, Änderungen von Hand bleiben',
    },
  ];

  return (
    <div className="app">
      <TitleBar app={APP_NAMEN.kosten.name} name={name} dirty={dirty} onOpenLog={() => setLogOpen(true)} regeln="kosten" onProjekte={() => setProjekteOffen(true)} onSpeichern={() => onSave()} />
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
                aria-label={dirty ? 'Speichern – ungespeicherte Änderungen' : 'Speichern'}
                onClick={() => void onSave()}
                disabled={einstieg}
                title={
                  einstieg
                    ? 'Erst ein Projekt öffnen oder neu beginnen'
                    : `${isTauri() ? 'Projekt speichern – in die geöffnete Datei (Strg+S)' : 'Projekt als Datei herunterladen (Strg+S)'}${dirty ? ' – ungespeicherte Änderungen' : ''}`
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
                <button className="icon" onClick={() => useKosten.getState().undo()} disabled={!canUndo} title="Rückgängig (Strg+Z)" aria-label="Rückgängig">
                  <Symbol name="rueckgaengig" />
                </button>
                <button className="icon" onClick={() => useKosten.getState().redo()} disabled={!canRedo} title="Wiederholen (Strg+Y)" aria-label="Wiederholen">
                  <Symbol name="wiederholen" />
                </button>
              </>
            ),
          },
          {
            // Haupt-Umschalter der App: bleibt immer sichtbar
            id: 'ansicht',
            inhalt: (
              <div className="segment" role="group" aria-label="Ansicht">
                <button aria-pressed={kostenAktiv} onClick={() => setAnsicht('kosten')} title="Grundlagen, Positionen und Kostenübersicht">
                  Kosten
                </button>
                <button
                  aria-pressed={mengenAktiv}
                  onClick={() => setAnsicht('mengen')}
                  disabled={!hatGebaeude}
                  title={hatGebaeude ? 'Zeigt im Grundriss und im 3D-Modell, aus welchen Flächen sich jede Menge zusammensetzt' : 'Erst ein Projekt mit Gebäude oder ein IFC-Modell öffnen'}
                >
                  Mengen prüfen
                </button>
              </div>
            ),
          },
          ...(busy ? [{ id: 'busy', inhalt: <span className="busy">{busy}</span> }] : []),
          { abstand: true },
          {
            id: 'excel',
            rang: 1,
            inhalt: (
              <button onClick={() => setExcelOpen(true)} disabled={!hatPositionen} title={hatPositionen ? 'Kostenermittlung als Excel-Datei – Standardlayout oder eigene Vorlage' : 'Erst Positionen anlegen'}>
                <Symbol name="tabelle" /> Excel …
              </button>
            ),
            menue: { text: 'Excel …', symbol: 'tabelle', aktion: () => setExcelOpen(true), deaktiviert: !hatPositionen, hinweis: hatPositionen ? undefined : 'erst Positionen anlegen' },
          },
          {
            // Hauptknopf: bleibt immer sichtbar
            id: 'drucken',
            inhalt: (
              <button
                className="primary"
                onClick={() => setDruckOpen(true)}
                disabled={!hatPositionen}
                title={hatPositionen ? 'Druckbare Kostenermittlung – über den Druckdialog auch als PDF (Strg+P)' : 'Erst Positionen anlegen'}
              >
                <Symbol name="drucken" /> Kosten drucken …
              </button>
            ),
          },
        ]}
      />
      <main className="ko-main">
        {wiederhergestellt !== null && dirty && (
          <div className="ko-bericht meldung warnung" role="status">
            Ungespeicherter Stand vom {datumText(new Date(wiederhergestellt))}{' '}
            {new Date(wiederhergestellt).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })} wiederhergestellt –{' '}
            <button className="small" onClick={() => void onSave()}>
              Speichern
            </button>{' '}
            <button
              className="small"
              onClick={async () => {
                const st = useKosten.getState();
                const ziel = st.basis ? `der Stand der Datei „${st.datei ?? ''}“` : 'ein leeres Projekt';
                if (await bestaetigen('Zwischenstand verwerfen?', `Die wiederhergestellten Änderungen gehen verloren; geöffnet bleibt ${ziel}.`, 'Verwerfen', true)) useKosten.getState().verwerfen();
              }}
            >
              Verwerfen
            </button>
          </div>
        )}
        {bericht.length > 0 && (
          <div className="ko-bericht meldung" role="status">
            <strong>IFC-Import{berichtDatei ? ` „${berichtDatei}“` : ''}:</strong>
            <ul>
              {bericht.map((z, i) => (
                <li key={i} className={istWarnung(z) ? 'warnung' : 'muted'}>
                  {z}
                </li>
              ))}
            </ul>
            <p className="muted small-text">Flächen, Geschosse und Dächer werden in QUADRIO (Flächenrechner) bearbeitet; NUMIO übernimmt sie beim nächsten Öffnen.</p>
            <button className="small" onClick={() => setBericht([])}>
              Schließen
            </button>
          </div>
        )}
        {einstieg ? (
          <ProjektEinstieg
            titel="Kostenermittlung nach DIN 276"
            text={'Projekt oder IFC öffnen: ein Projekt aus QUADRIO (Flächenrechner, .oap) oder direkt ein IFC-Modell. BGF, BRI, Nutzungs- und Wohnflächen sowie grobe Bauteilmengen kommen aus dem Projekt; Kennwerte, Positionen und festgehaltene Stände pflegt NUMIO. Ohne Gebäudemodell lassen sich die Mengen auch von Hand eintragen („Neues Projekt“).'}
            onProjekte={isTauri() ? () => setProjekteOffen(true) : undefined}
            onDateiOeffnen={() => void onOpen()}
            dateiHinweis="Projektdatei (.oap) oder IFC-Modell"
            onNeu={() => void onNeu()}
          />
        ) : ansicht === 'mengen' && hatGebaeude ? (
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
            setBegonnen(true);
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
