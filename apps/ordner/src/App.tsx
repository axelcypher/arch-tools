import { useEffect, useState } from 'react';
import { APP_NAMEN } from '@core/appNamen';
import { LogDialog } from '@core/ui/LogDialog';
import { TitleBar } from '@core/ui/TitleBar';
import { AssistentView } from './components/AssistentView';
import { PruefView } from './components/PruefView';
import { EinstellungenView, StrukturView } from './components/StrukturView';
import { VorlagenView } from './components/VorlagenView';
import { KatasterEinstellungen } from './components/KatasterEinstellungen';
import { MailView } from './components/MailView';
import { ASSISTENT_NEU, vomRahmen } from '@core/platform/rahmen';
import type { Auftrag } from './components/AssistentView';
import type { GeladenerOrdner } from './projekt';
import { useOrdner } from './store';

type Ansicht = 'projekt' | 'pruefen' | 'mails' | 'struktur' | 'vorlagen' | 'kataster' | 'einstellungen';

const ANSICHTEN: { id: Ansicht; label: string; title: string }[] = [
  { id: 'projekt', label: 'Assistent', title: 'Assistent: neues Projekt anlegen oder ein bestehendes fortschreiben – Stammdaten, Grundstück, Bauherr, Umfang, Beteiligte, Vorlagen, Trockenlauf' },
  { id: 'pruefen', label: 'Ordner prüfen', title: 'Vorhandenen Projektordner mit der Struktur vergleichen – es wird nichts verschoben' },
  { id: 'mails', label: 'Mails', title: 'Mails (.msg) im Projektordner prüfen und nach dem Schema benennen: Projektcode von|an Name JJMMTT Thema' },
  { id: 'struktur', label: 'Struktur', title: 'Ordnerbaum des Büros zum Klicken – mit Bausteinen für wiederkehrende Unterordner (z. B. Gewerke) – und Namensschemata' },
  { id: 'vorlagen', label: 'Vorlagen', title: 'Vorlagenordner, Dateinamen und Presets: welche Vorlage wohin kommt und wie sie dort heißt' },
  { id: 'kataster', label: 'Katasterpläne', title: 'QGIS-Vorlage, Katasterauszüge und DXF-Pläne – exportiert wird je Projekt (Rechtsklick auf der Startseite)' },
  { id: 'einstellungen', label: 'Einstellungen', title: 'Gemeinsame Einstellungen aller Apps: Konfigurationsordner, Stammordner, Ort der Projektdatei, Büro, Mitarbeiter' },
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
  // „Mails prüfen“ aus der Projektübersicht bzw. aus „Ordner prüfen“
  const [mailStart, setMailStart] = useState<{ pfad: string; nr: number } | null>(null);
  const mailsPruefen = (pfad: string) => {
    setMailStart((m) => ({ pfad, nr: (m?.nr ?? 0) + 1 }));
    setAnsicht('mails');
  };
  // „Neues Projekt anlegen“ aus einer anderen App (Rahmen-App): Assistent für ein neues Projekt
  const [auftrag, setAuftrag] = useState<(Auftrag & { nr: number }) | null>(null);

  useEffect(
    () =>
      vomRahmen(ASSISTENT_NEU, (n) => {
        setStart(null);
        setAuftrag((a) => ({ von: n.von ?? null, ...(n.vonName ? { vonName: n.vonName } : {}), kannOeffnen: !!n.kannOeffnen, nr: (a?.nr ?? 0) + 1 }));
        setAnsicht('projekt');
      }),
    [],
  );

  useEffect(() => {
    document.title = APP_NAMEN.ordner.name;
  }, []);

  // gemeinsame Einstellungen aus dem Konfigurationsordner
  useEffect(() => {
    void useOrdner.getState().konfigLaden();
  }, []);

  // Struktur beim Wechsel in Einstellungen bzw. Vorlagen frisch lesen – ein anderer Rechner kann sie geändert haben
  useEffect(() => {
    if (ansicht === 'struktur' || ansicht === 'einstellungen' || ansicht === 'vorlagen') void useOrdner.getState().neuLesen();
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
        app={APP_NAMEN.ordner.name}
        name={start?.ordner.name ?? ''}
        dirty={false}
        onOpenLog={() => setLogOpen(true)}
        zeichenflaeche={false}
        // wie in den anderen Apps: „Projekte“ führt zur Startseite mit der gemeinsamen Projektübersicht
        onProjekte={() => {
          setStart(null);
          setAuftrag(null);
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
            key={`${start?.nr ?? 0}-${neustart}-${auftrag?.nr ?? 0}`}
            start={start?.ordner ?? null}
            auftrag={start ? null : auftrag}
            onEinstellungen={() => setAnsicht('einstellungen')}
            onPruefen={(pfad) => {
              setPruefStart({ pfad, nr: (pruefStart?.nr ?? 0) + 1 });
              setAnsicht('pruefen');
            }}
            onKatasterEinstellungen={() => setAnsicht('kataster')}
            onMails={mailsPruefen}
          />
        )}
        {ansicht === 'pruefen' && (
          <PruefView
            key={pruefStart?.nr ?? 0}
            start={pruefStart?.pfad ?? null}
            onMails={mailsPruefen}
            onErgaenzen={(ordner) => {
              setAuftrag(null);
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
        {ansicht === 'mails' && <MailView key={mailStart?.nr ?? 0} start={mailStart?.pfad ?? null} />}
        {ansicht === 'struktur' && <StrukturView />}
        {ansicht === 'einstellungen' && <EinstellungenView />}
      </main>
      {logOpen && <LogDialog onClose={() => setLogOpen(false)} />}
    </div>
  );
}
