import { useEffect, useState } from 'react';
import { LogDialog } from '@core/ui/LogDialog';
import { TitleBar } from '@core/ui/TitleBar';
import type { GeladenerOrdner } from './components/AktualisierenView';
import { AktualisierenView } from './components/AktualisierenView';
import { NeuView } from './components/NeuView';
import { PruefView } from './components/PruefView';
import { StrukturView } from './components/StrukturView';
import { VorlagenView } from './components/VorlagenView';
import { ordnerName } from './plan';
import { useOrdner } from './store';

type Ansicht = 'neu' | 'aktualisieren' | 'pruefen' | 'vorlagen' | 'struktur';

const ANSICHTEN: { id: Ansicht; label: string; title: string }[] = [
  { id: 'neu', label: 'Neues Projekt', title: 'Stammdaten eingeben, Trockenlauf ansehen, Projektordner anlegen' },
  { id: 'aktualisieren', label: 'Projekt aktualisieren', title: 'In einem vorhandenen Projektordner ergänzen, was nach Struktur und Presets fehlt – vorhandene Dateien bleiben unverändert' },
  { id: 'pruefen', label: 'Ordner prüfen', title: 'Vorhandenen Projektordner mit der Struktur vergleichen – es wird nichts verschoben' },
  { id: 'vorlagen', label: 'Vorlagen', title: 'Vorlagenordner, Dateinamen und Presets: welche Vorlage wohin kommt und wie sie dort heißt' },
  { id: 'struktur', label: 'Struktur', title: 'Ordnerbaum und Namensschemata des Büros' },
];

export function App() {
  const stamm = useOrdner((s) => s.stamm);
  const struktur = useOrdner((s) => s.struktur);
  const vorlagenordner = useOrdner((s) => s.vorlagenordner);
  const [ansicht, setAnsicht] = useState<Ansicht>('neu');
  const [aktualisieren, setAktualisieren] = useState<GeladenerOrdner | null>(null);
  const [logOpen, setLogOpen] = useState(false);
  const name = ansicht === 'aktualisieren' && aktualisieren ? aktualisieren.name : ordnerName(stamm, struktur) || 'Neues Projekt';

  useEffect(() => {
    document.title = `${name} – Projektordner`;
  }, [name]);

  // Vorlagenordner beim Start und bei jedem Wechsel der Ansicht frisch einlesen – Vorlagen ändern sich nebenher
  useEffect(() => {
    void useOrdner.getState().ladeVorlagen();
  }, [ansicht, vorlagenordner]);

  return (
    <div className="app">
      <TitleBar app="Projektordner" name={name} dirty={false} onOpenLog={() => setLogOpen(true)} />
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
        {ansicht === 'neu' && <NeuView />}
        {ansicht === 'aktualisieren' && <AktualisierenView ordner={aktualisieren} setOrdner={setAktualisieren} />}
        {ansicht === 'pruefen' && (
          <PruefView
            onUebernommen={() => setAnsicht('neu')}
            onAktualisieren={(o) => {
              setAktualisieren(o);
              setAnsicht('aktualisieren');
            }}
          />
        )}
        {ansicht === 'vorlagen' && <VorlagenView />}
        {ansicht === 'struktur' && <StrukturView />}
      </main>
      {logOpen && <LogDialog onClose={() => setLogOpen(false)} />}
    </div>
  );
}
