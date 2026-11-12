import { useEffect, useState } from 'react';
import { LogDialog } from '@core/ui/LogDialog';
import { TitleBar } from '@core/ui/TitleBar';
import { AssistentView } from './components/AssistentView';
import { PruefView } from './components/PruefView';
import { StrukturView } from './components/StrukturView';
import { VorlagenView } from './components/VorlagenView';
import { KatasterEinstellungen } from './components/KatasterEinstellungen';
import type { GeladenerOrdner } from './projekt';
import { useOrdner } from './store';

type Ansicht = 'projekt' | 'pruefen' | 'vorlagen' | 'kataster' | 'einstellungen';

const ANSICHTEN: { id: Ansicht; label: string; title: string }[] = [
  { id: 'projekt', label: 'Assistent', title: 'Assistent: neues Projekt anlegen oder ein bestehendes ergänzen – Stammdaten, Umfang, Vorlagen, Trockenlauf' },
  { id: 'pruefen', label: 'Ordner prüfen', title: 'Vorhandenen Projektordner mit der Struktur vergleichen – es wird nichts verschoben' },
  { id: 'vorlagen', label: 'Vorlagen', title: 'Vorlagenordner, Dateinamen und Presets: welche Vorlage wohin kommt und wie sie dort heißt' },
  { id: 'kataster', label: 'Katasterpläne', title: 'QGIS-Vorlage, Katasterauszüge und DXF-Pläne – exportiert wird je Projekt (Rechtsklick auf der Startseite)' },
  { id: 'einstellungen', label: 'Einstellungen', title: 'Gemeinsame Einstellungen aller Apps, Ordnerbaum und Namensschemata des Büros' },
];

export function App() {
  const struktur = useOrdner((s) => s.struktur);
  const vorlagenordner = useOrdner((s) => s.vorlagenordner);
  const konflikt = useOrdner((s) => s.konflikt);
  const [ansicht, setAnsicht] = useState<Ansicht>('projekt');
  // ein Projekt aus dem Prüfmodus im Assistenten ergänzen: neuer Start des Assistenten
  const [start, setStart] = useState<{ ordner: GeladenerOrdner; nr: number } | null>(null);
  const [logOpen, setLogOpen] = useState(false);
  const [neustart, setNeustart] = useState(0);
  // „Projekt prüfen“ aus der Projektübersicht
  const [pruefStart, setPruefStart] = useState<{ pfad: string; nr: number } | null>(null);

  useEffect(() => {
    document.title = 'Projektordner';
  }, []);

  // gemeinsame Einstellungen aus dem Konfigurationsordner
  useEffect(() => {
    void useOrdner.getState().konfigLaden();
  }, []);

  // Struktur beim Wechsel in Einstellungen bzw. Vorlagen frisch lesen – ein anderer Rechner kann sie geändert haben
  useEffect(() => {
    if (ansicht === 'einstellungen' || ansicht === 'vorlagen') void useOrdner.getState().neuLesen();
  }, [ansicht]);

  // Anstehendes Schreiben der Einstellungen beim Schließen nicht verlieren
  useEffect(() => {
    const jetzt = () => void useOrdner.getState().speichernJetzt();
    window.addEventListener('beforeunload', jetzt);
    return () => window.removeEventListener('beforeunload', jetzt);
  }, []);

  // Vorlagenordner beim Start und bei jedem Wechsel der Ansicht frisch einlesen – Vorlagen ändern sich nebenher
  useEffect(() => {
    void useOrdner.getState().ladeVorlagen();
  }, [ansicht, vorlagenordner]);

  return (
    <div className="app">
      <TitleBar
        app="Projektordner"
        name={start?.ordner.name ?? ''}
        dirty={false}
        onOpenLog={() => setLogOpen(true)}
        zeichenflaeche={false}
        // wie in den anderen Apps: „Projekte“ führt zur Startseite mit der gemeinsamen Projektübersicht
        onProjekte={() => {
          setStart(null);
          setNeustart((n) => n + 1);
          setAnsicht('projekt');
        }}
      />
      <div className="toolbar">
        <div className="tb-group">
          {ANSICHTEN.map((a) => (
            <button key={a.id} className={ansicht === a.id ? 'active' : ''} title={a.title} onClick={() => setAnsicht(a.id)}>
              {a.label}
            </button>
          ))}
        </div>
        <span className="muted small-text">Struktur: {struktur.name}</span>
      </div>
      {konflikt && (
        <div className="warning po-konflikt" role="alert">
          Die Struktur wurde inzwischen von einem anderen Rechner geändert – neu laden? Ihre Änderungen sind noch nicht gespeichert.
          <button className="small" onClick={() => void useOrdner.getState().konfliktLoesen('neu-laden')}>
            Neu laden
          </button>
          <button className="small" onClick={() => void useOrdner.getState().konfliktLoesen('meine')}>
            Meine Fassung trotzdem speichern
          </button>
        </div>
      )}
      <main className="po-main">
        {ansicht === 'projekt' && (
          <AssistentView
            key={`${start?.nr ?? 0}-${neustart}`}
            start={start?.ordner ?? null}
            onEinstellungen={() => setAnsicht('einstellungen')}
            onPruefen={(pfad) => {
              setPruefStart({ pfad, nr: (pruefStart?.nr ?? 0) + 1 });
              setAnsicht('pruefen');
            }}
            onKatasterEinstellungen={() => setAnsicht('kataster')}
          />
        )}
        {ansicht === 'pruefen' && (
          <PruefView
            key={pruefStart?.nr ?? 0}
            start={pruefStart?.pfad ?? null}
            onErgaenzen={(ordner) => {
              setStart({ ordner, nr: (start?.nr ?? 0) + 1 });
              setAnsicht('projekt');
            }}
          />
        )}
        {ansicht === 'vorlagen' && <VorlagenView />}
        {ansicht === 'kataster' && (
          <div className="po-kataster">
            <KatasterEinstellungen />
          </div>
        )}
        {ansicht === 'einstellungen' && <StrukturView />}
      </main>
      {logOpen && <LogDialog onClose={() => setLogOpen(false)} />}
    </div>
  );
}
