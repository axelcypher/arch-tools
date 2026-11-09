import { useEffect, useState } from 'react';
import { LogDialog } from '@core/ui/LogDialog';
import { TitleBar } from '@core/ui/TitleBar';
import { FelderAnsicht } from './components/FelderAnsicht';
import { SeitenAnsicht } from './components/SeitenAnsicht';
import { Seitenleiste } from './components/Seitenleiste';
import { kennung, stand } from './forma/formular';
import type { Ansicht, OffenesFormular } from './store';
import { istGeaendert, useFormulare } from './store';

const ANSICHTEN: { id: Ansicht; label: string; title: string }[] = [
  { id: 'felder', label: 'Felder', title: 'Alle Felder aufgeräumt nach Abschnitten – zum schnellen Ausfüllen' },
  { id: 'seite', label: 'Seite', title: 'Die Seiten so, wie FORMA sie zeigt – zur Kontrolle' },
];

/** Warum nicht bearbeitet werden kann – sonst null */
function sperrgrund(o: OffenesFormular): string | null {
  if (o.nurLesen) return o.nurLesen;
  if (o.sperre.art !== 'fremd') return null;
  const s = o.sperre.sperre;
  const wer = [s.benutzer, s.computer && `auf ${s.computer}`].filter(Boolean).join(' ') || 'jemand anderem';
  return `Nur ansehen: Das Formular ist bei ${wer} geöffnet${s.angemeldet ? ` (seit ${s.angemeldet})` : ''}.`;
}

export function App() {
  const ds = useFormulare((s) => s.ds);
  const offen = useFormulare((s) => s.offen);
  const ansicht = useFormulare((s) => s.ansicht);
  const meldung = useFormulare((s) => s.meldung);
  const konflikt = useFormulare((s) => s.konflikt);
  const { setAnsicht, setMeldung, speichern, neuLaden, dateiOeffnen, projekteLaden } = useFormulare.getState();
  const [logOpen, setLogOpen] = useState(false);
  const geaendert = istGeaendert(offen);
  const grund = offen ? sperrgrund(offen) : null;
  const name = offen?.name ?? 'Kein Formular geöffnet';

  useEffect(() => {
    document.title = `${geaendert ? '● ' : ''}${name} – Formulare`;
  }, [name, geaendert]);

  useEffect(() => {
    void projekteLaden();
  }, [projekteLaden]);

  // Strg+S speichert
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        void useFormulare.getState().speichern();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="app">
      <TitleBar app="Formulare" name={name} dirty={geaendert} onOpenLog={() => setLogOpen(true)} />
      <div className="toolbar">
        <div className="tb-group">
          {ANSICHTEN.map((a) => (
            <button key={a.id} className={ansicht === a.id ? 'active' : ''} title={a.title} onClick={() => setAnsicht(a.id)}>
              {a.label}
            </button>
          ))}
        </div>
        <div className="tb-group">
          <button className="primary" disabled={!geaendert || !!grund || konflikt} title="Speichern (Strg+S)" onClick={() => void speichern()}>
            {ds ? 'Speichern' : 'Herunterladen'}
          </button>
          {konflikt && (
            <button title="Datei neu einlesen; deine Eingaben werden wieder eingetragen" onClick={() => void neuLaden()}>
              Neu laden
            </button>
          )}
        </div>
        {!ds && (
          <div className="tb-group">
            <button onClick={() => void dateiOeffnen()}>Formular öffnen …</button>
          </div>
        )}
        <span className="tb-spacer" />
        {offen && (
          <span className="muted small-text">
            {[kennung(offen.formular), stand(offen.formular) && `Stand ${stand(offen.formular)}`].filter(Boolean).join(' · ')}
            {geaendert && ` · ${Object.keys(offen.aenderungen).length} Feld(er) geändert`}
          </span>
        )}
      </div>
      {(meldung || grund) && (
        <div className={`fo-meldung ${meldung?.art === 'fehler' ? 'fehler' : grund ? 'hinweis' : 'info'}`} role="status">
          <span>{meldung?.text ?? grund}</span>
          {meldung && (
            <button className="fo-klein" title="Schließen" onClick={() => setMeldung(null)}>
              ×
            </button>
          )}
        </div>
      )}
      <main className="fo-main">
        {ds && <Seitenleiste />}
        <section className="fo-inhalt">
          {offen ? (
            ansicht === 'felder' ? (
              <FelderAnsicht offen={offen} gesperrt={!!grund} />
            ) : (
              <SeitenAnsicht offen={offen} gesperrt={!!grund} />
            )
          ) : (
            <Leer desktop={!!ds} />
          )}
        </section>
      </main>
      {logOpen && <LogDialog onClose={() => setLogOpen(false)} />}
    </div>
  );
}

function Leer({ desktop }: { desktop: boolean }) {
  const ordner = useFormulare((s) => s.projektordner.length);
  const projekt = useFormulare((s) => s.projekt);
  return (
    <div className="fo-leer">
      <h2>Bauantragsformulare aus FORMA</h2>
      {!desktop && (
        <p>
          In der Web-Version lässt sich ein einzelnes Formular (<code>.frmsjf</code>) öffnen; die geänderte Fassung wird heruntergeladen. Projektordner, Sperrdateien und
          direktes Speichern gibt es nur in der Desktop-App.
        </p>
      )}
      {desktop && !ordner && <p>Füge links den Ordner hinzu, in dem eure FORMA-Projekte liegen. Es können mehrere sein.</p>}
      {desktop && ordner > 0 && !projekt && <p>Wähle links ein Projekt.</p>}
      {desktop && projekt && <p>Wähle links ein Formular.</p>}
      <p className="muted small-text">
        Geändert wird nur der Inhalt der Felder – Layout und alles andere bleiben Byte für Byte erhalten, damit FORMA die Dateien weiter liest. Ist ein Formular in FORMA
        geöffnet, lässt es sich hier nur ansehen.
      </p>
    </div>
  );
}
