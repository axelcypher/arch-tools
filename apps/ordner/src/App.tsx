import { useEffect, useState } from 'react';
import { LogDialog } from '@core/ui/LogDialog';
import { TitleBar } from '@core/ui/TitleBar';
import { AssistentView } from './components/AssistentView';
import { PruefView } from './components/PruefView';
import { StrukturView } from './components/StrukturView';
import { VorlagenView } from './components/VorlagenView';
import type { GeladenerOrdner } from './projekt';
import { useOrdner } from './store';

type Ansicht = 'projekt' | 'pruefen' | 'vorlagen' | 'einstellungen';

const ANSICHTEN: { id: Ansicht; label: string; title: string }[] = [
  { id: 'projekt', label: 'Projekt', title: 'Assistent: neues Projekt anlegen oder ein bestehendes ergänzen – Stammdaten, Umfang, Vorlagen, Trockenlauf' },
  { id: 'pruefen', label: 'Ordner prüfen', title: 'Vorhandenen Projektordner mit der Struktur vergleichen – es wird nichts verschoben' },
  { id: 'vorlagen', label: 'Vorlagen', title: 'Vorlagenordner, Dateinamen und Presets: welche Vorlage wohin kommt und wie sie dort heißt' },
  { id: 'einstellungen', label: 'Einstellungen', title: 'Gemeinsame Einstellungen aller Apps, Ordnerbaum und Namensschemata des Büros' },
];

export function App() {
  const struktur = useOrdner((s) => s.struktur);
  const vorlagenordner = useOrdner((s) => s.vorlagenordner);
  const [ansicht, setAnsicht] = useState<Ansicht>('projekt');
  // ein Projekt aus dem Prüfmodus im Assistenten ergänzen: neuer Start des Assistenten
  const [start, setStart] = useState<{ ordner: GeladenerOrdner; nr: number } | null>(null);
  const [logOpen, setLogOpen] = useState(false);

  useEffect(() => {
    document.title = 'Projektordner';
  }, []);

  // gemeinsame Einstellungen aus dem Konfigurationsordner
  useEffect(() => {
    void useOrdner.getState().konfigLaden();
  }, []);

  // Vorlagenordner beim Start und bei jedem Wechsel der Ansicht frisch einlesen – Vorlagen ändern sich nebenher
  useEffect(() => {
    void useOrdner.getState().ladeVorlagen();
  }, [ansicht, vorlagenordner]);

  return (
    <div className="app">
      <TitleBar app="Projektordner" name={start?.ordner.name ?? ''} dirty={false} onOpenLog={() => setLogOpen(true)} />
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
      <main className="po-main">
        {ansicht === 'projekt' && <AssistentView key={start?.nr ?? 0} start={start?.ordner ?? null} />}
        {ansicht === 'pruefen' && (
          <PruefView
            onErgaenzen={(ordner) => {
              setStart({ ordner, nr: (start?.nr ?? 0) + 1 });
              setAnsicht('projekt');
            }}
          />
        )}
        {ansicht === 'vorlagen' && <VorlagenView />}
        {ansicht === 'einstellungen' && <StrukturView />}
      </main>
      {logOpen && <LogDialog onClose={() => setLogOpen(false)} />}
    </div>
  );
}
