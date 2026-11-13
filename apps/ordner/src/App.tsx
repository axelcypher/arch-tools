import { useEffect, useRef, useState } from 'react';
import { APP_NAMEN } from '@core/appNamen';
import { LogDialog } from '@core/ui/LogDialog';
import { bestaetigen, meldung } from '@core/ui/Rueckfrage';
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
import { NICHT_GESPEICHERT, useOrdner } from './store';
import { ordnerAlsText } from './struktur';

type Ansicht = 'projekt' | 'pruefen' | 'mails' | 'struktur' | 'vorlagen' | 'kataster' | 'einstellungen';

const ANSICHTEN: { id: Ansicht; label: string; title: string }[] = [
  { id: 'projekt', label: 'Assistent', title: 'Assistent: neues Projekt anlegen oder ein bestehendes fortschreiben – Stammdaten, Grundstück, Bauherr, Umfang, Beteiligte, Vorlagen, Trockenlauf' },
  { id: 'pruefen', label: 'Ordner prüfen', title: 'Vorhandenen Projektordner mit der Struktur vergleichen – es wird nichts verschoben' },
  { id: 'mails', label: 'Mails', title: 'Mails (.msg) im Projektordner prüfen und nach dem Schema benennen: Projektcode von|an Name JJMMTT Thema' },
  { id: 'struktur', label: 'Struktur', title: 'Ordnerbaum des Büros zum Klicken – mit Bausteinen für wiederkehrende Unterordner (z. B. Gewerke) – und Namensschemata' },
  { id: 'vorlagen', label: 'Vorlagen', title: 'Vorlagenordner, Dateinamen und Presets: welche Vorlage wohin kommt und wie sie dort heißt' },
  { id: 'kataster', label: 'Katasterpläne', title: 'QGIS-Vorlage, Katasterauszüge und DXF-Pläne einstellen – exportiert wird je Projekt über die Startseite' },
  { id: 'einstellungen', label: 'Einstellungen', title: 'Gemeinsame Einstellungen aller Apps: Konfigurationsordner, Stammordner, Ort der Projektdatei, Büro, Mitarbeiter' },
];

export function App() {
  const struktur = useOrdner((s) => s.struktur);
  const vorlagenordner = useOrdner((s) => s.vorlagenordner);
  const konflikt = useOrdner((s) => s.konflikt);
  const strukturFehler = useOrdner((s) => s.strukturFehler);
  const konfliktLaeuft = useOrdner((s) => s.konfliktLaeuft);
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
  /** was im Assistenten noch nicht angelegt ist (meldet AssistentView) – ein Neustart über den key fragt dann vorher */
  const assistentOffen = useRef<string | null>(null);
  /** dasselbe als Zustand – für die Meldung „ungespeicherte Änderungen“ an Titelleiste und Rahmen */
  const [assistentOffenText, setAssistentOffenText] = useState<string | null>(null);
  /** Assistent neu beginnen (`neustart`): ohne offene Eingaben sofort, sonst erst nach Rückfrage (Verwerfen/Abbrechen) */
  const nachRueckfrage = (neustart: () => void) => {
    const was = assistentOffen.current;
    if (!was) return neustart();
    void bestaetigen('Eingaben im Assistenten verwerfen?', `Noch nicht angelegt: ${was}. Beim Neubeginn gehen sie verloren.`, 'Verwerfen', true).then((ok) => ok && neustart());
  };

  /**
   * Ungespeicherte Änderungen (Titelleiste: Punkt, Rückfrage beim Beenden und vor einem Update; Rahmen-App Arkly:
   * Rückfrage beim Schließen, Beenden, Herauslösen, Andocken und Update) – nur, was beim Beenden wirklich verloren ginge:
   * offene Eingaben im Assistenten (nicht der Entwurf eines neuen Projekts: der liegt im lokalen Speicher und übersteht
   * auch ein Beenden), der nicht übernommene Text der Ordnerliste (Struktur, Textansicht) und eigene Änderungen an der
   * Struktur, die wegen eines Konflikts mit einem anderen Rechner oder eines gescheiterten Schreibens (z. B. Laufwerk
   * nicht erreichbar) nicht gespeichert sind. Alles Übrige speichert ATLAS
   * sofort (Einstellungen, Vorlagen, Kataster) oder es entsteht neu aus dem Projektordner (Prüfen, Mails).
   */
  const strukturEntwurf = useOrdner((s) => s.ordnerEntwurf !== null);
  const strukturKonflikt = useOrdner((s) => s.konflikt !== null);
  // das Schreiben der Struktur ist gescheitert (z. B. Netzlaufwerk weg): bis zum nächsten gelungenen Schreiben offen
  const schreibenGescheitert = useOrdner((s) => !!s.konfigFehler?.startsWith(NICHT_GESPEICHERT));
  const dirty = !!assistentOffenText || strukturEntwurf || strukturKonflikt || schreibenGescheitert;

  /**
   * Speichern auf Anfrage (Rückfrage der Titelleiste bzw. des Rahmens, Knopf „Speichern“): gespeichert wird nur, was
   * ohne weitere Entscheidung geht – der Text der Ordnerliste wird übernommen wie mit „Übernehmen“ (vorher gesichert,
   * mit „Rückgängig“), wenn er gültig ist und vom aktuellen Stand ausgeht. Nicht still ausgeführt wird, was eine
   * eigene Entscheidung braucht: Im Assistenten hieße „Speichern“, den Projektordner anzulegen bzw. die Projektdatei
   * zu schreiben; ein Konflikt verlangt „Neu laden“ oder „Meine Fassung trotzdem speichern“; ein Text, der von einem
   * älteren Stand ausgeht, überschriebe ungesehen die neuere Struktur. Dann liefert es false („nicht gespeichert“):
   * Beenden, Herauslösen, Andocken bzw. Update unterbleiben, und eine Meldung in ATLAS sagt, was noch offen ist.
   */
  const speichernAufAnfrage = async (): Promise<boolean> => {
    const offen: string[] = [];
    const s = useOrdner.getState();
    // im Konflikt bzw. bei unlesbarer Struktur nicht übernehmen: das hieße, die Entscheidung still vorwegzunehmen
    // (den Konflikt samt dem Text nennt die Meldung unten)
    if (s.ordnerEntwurf && !s.konflikt) {
      if (s.strukturFehler) offen.push('der Text der Ordnerliste – die Struktur ist nicht lesbar und deshalb gesperrt');
      else if (s.ordnerEntwurf.basis !== ordnerAlsText(s.struktur.ordner))
        offen.push('der Text der Ordnerliste – er geht von einem älteren Stand aus; bitte unter „Struktur“ prüfen und übernehmen oder verwerfen');
      else {
        try {
          const grund = await s.ordnerEntwurfUebernehmen();
          if (grund) offen.push(`der Text der Ordnerliste: ${grund}`);
        } catch (e) {
          offen.push(`der Text der Ordnerliste (${e instanceof Error ? e.message : String(e)})`);
        }
      }
    }
    // ausstehendes Schreiben der Struktur jetzt, nicht erst nach der Wartezeit – sonst wäre „gespeichert“ nicht wahr
    await useOrdner.getState().speichernJetzt();
    const n = useOrdner.getState();
    if (n.konflikt)
      offen.push(
        `Ihre Änderungen an der Struktur${n.ordnerEntwurf ? ' samt dem Text der Ordnerliste' : ''} – ein anderer Rechner hat sie inzwischen geändert; bitte „Neu laden“ oder „Meine Fassung trotzdem speichern“ wählen`,
      );
    else if (n.konfigFehler?.startsWith(NICHT_GESPEICHERT)) offen.push(`die Struktur (${n.konfigFehler})`);
    if (assistentOffen.current)
      offen.push(`im Assistenten ${assistentOffen.current} – „Speichern“ hieße, den Projektordner anzulegen bzw. die Projektdatei zu schreiben; das geschieht nur im Assistenten selbst`);
    if (!offen.length) return true;
    // nicht abwarten: die Rückfrage, die das Speichern angefordert hat, soll sofort „nicht gespeichert“ erfahren
    void meldung('Nicht alles gespeichert', `Noch offen: ${offen.join('; ')}. Bitte dort abschließen oder die Änderungen bewusst verwerfen („Nicht speichern“).`);
    return false;
  };

  useEffect(
    () =>
      vomRahmen(ASSISTENT_NEU, (n) => {
        nachRueckfrage(() => {
          setStart(null);
          setAuftrag((a) => ({ von: n.von ?? null, ...(n.vonName ? { vonName: n.vonName } : {}), kannOeffnen: !!n.kannOeffnen, nr: (a?.nr ?? 0) + 1 }));
          setAnsicht('projekt');
        });
      }),
    [], // eslint-disable-line react-hooks/exhaustive-deps
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
        dirty={dirty}
        onSpeichern={speichernAufAnfrage}
        onOpenLog={() => setLogOpen(true)}
        zeichenflaeche={false}
        // wie in den anderen Apps: „Projekte“ führt zur Startseite mit der gemeinsamen Projektübersicht
        onProjekte={() =>
          nachRueckfrage(() => {
            setStart(null);
            setAuftrag(null);
            setNeustart((n) => n + 1);
            setAnsicht('projekt');
          })
        }
      />
      <div className="toolbar">
        <div className="tb-group">
          {ANSICHTEN.map((a) => (
            <button key={a.id} className={ansicht === a.id ? 'active' : ''} aria-pressed={ansicht === a.id} title={a.title} onClick={() => setAnsicht(a.id)}>
              {a.label}
            </button>
          ))}
        </div>
        <span className="muted small-text">Struktur: {struktur.name}</span>
      </div>
      {strukturFehler && ansicht !== 'struktur' && ansicht !== 'vorlagen' && (
        <div className="warning po-konflikt" role="alert">
          Die Bürostruktur ist nicht lesbar – bis zur Klärung gilt die Standardstruktur von ATLAS; neue Projekte entstehen nach ihr.
          <button className="small" onClick={() => setAnsicht('struktur')}>
            Zur Struktur
          </button>
        </div>
      )}
      {konflikt && (
        <div className="warning po-konflikt" role="alert">
          Die Struktur wurde inzwischen von einem anderen Rechner geändert – neu laden? Ihre Änderungen sind noch nicht gespeichert.
          <button className="small" disabled={konfliktLaeuft} onClick={() => void useOrdner.getState().konfliktLoesen('neu-laden')}>
            Neu laden
          </button>
          <button
            className="small"
            disabled={konfliktLaeuft}
            title="Ihre Fassung speichern – die des anderen Rechners kommt vorher in die Sicherungen (unter „Struktur“)"
            onClick={() =>
              void useOrdner
                .getState()
                .konfliktLoesen('meine')
                .catch((e) => meldung('Nicht gespeichert', e instanceof Error ? e.message : String(e)))
            }
          >
            Meine Fassung trotzdem speichern
          </button>
          {/* solange gesichert und gespeichert wird: Knöpfe gesperrt, der Grund sichtbar */}
          {konfliktLaeuft && <span className="muted small-text">Speichert …</span>}
        </div>
      )}
      <main className="po-main">
        {/* der Assistent bleibt beim Wechsel der Ansicht eingehängt (nur ausgeblendet): Schritt und Eingaben bleiben erhalten */}
        <div className="po-assistent-huelle" hidden={ansicht !== 'projekt'}>
          <AssistentView
            key={`${start?.nr ?? 0}-${neustart}-${auftrag?.nr ?? 0}`}
            sichtbar={ansicht === 'projekt'}
            start={start?.ordner ?? null}
            auftrag={start ? null : auftrag}
            onEinstellungen={() => setAnsicht('einstellungen')}
            onPruefen={(pfad) => {
              setPruefStart({ pfad, nr: (pruefStart?.nr ?? 0) + 1 });
              setAnsicht('pruefen');
            }}
            onKatasterEinstellungen={() => setAnsicht('kataster')}
            onMails={mailsPruefen}
            onOffen={(was) => {
              assistentOffen.current = was;
              setAssistentOffenText(was);
            }}
          />
        </div>
        {ansicht === 'pruefen' && (
          <PruefView
            key={pruefStart?.nr ?? 0}
            start={pruefStart?.pfad ?? null}
            onMails={mailsPruefen}
            onErgaenzen={(ordner) =>
              nachRueckfrage(() => {
                setAuftrag(null);
                setStart((s) => ({ ordner, nr: (s?.nr ?? 0) + 1 }));
                setAnsicht('projekt');
              })
            }
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
