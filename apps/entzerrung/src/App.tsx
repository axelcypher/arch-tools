import { useEffect, useMemo, useState } from 'react';
import { APP_NAMEN } from '@core/appNamen';
import { LogDialog } from '@core/ui/LogDialog';
import { TitleBar } from '@core/ui/TitleBar';
import { isTauri } from '@core/platform/files';
import { allgemeinLaden, VORGABE_ALLGEMEIN } from '@core/platform/konfig';
import { tauriProjektordner } from '@core/platform/projektordner';
import { ProjektWahl } from '@core/ui/ProjektWahl';
import { FotoWahl } from './components/FotoWahl';
import { abbrechen, abschliessen, auswahlLoeschen, letztenPunktEntfernen } from './aktionen';
import { Arbeitsflaeche } from './components/Arbeitsflaeche';
import { Eigenschaften, WerkzeugKnopf } from './components/Eigenschaften';
import { ansichtUmschalten } from './aktionen';
import { FotoLeiste } from './components/FotoLeiste';
import { entzerrung } from './geo/ebene';
import { ablegen, fotoImProjektOeffnen, fotosHinzufuegen, neu, oeffnen, speichern, zwischenspeicherStarten } from './projekt';
import { aktuell, useEntz } from './store';
import { dialogOffen, kuerzelErlaubt, verlaufErlaubt } from './tastatur';
import { BreitenLeiste } from '@core/ui/Leiste';
import { Symbol } from '@core/ui/Symbol';

export function App() {
  const doc = useEntz((s) => s.doc);
  const fotoId = useEntz((s) => s.fotoId);
  const ebeneId = useEntz((s) => s.ebeneId);
  const dirty = useEntz((s) => s.dirty);
  const dateiname = useEntz((s) => s.dateiname);
  const ansicht = useEntz((s) => s.ansicht);
  const kannZurueck = useEntz((s) => s.vergangenheit.length > 0);
  const kannVor = useEntz((s) => s.zukunft.length > 0);
  const [logOpen, setLogOpen] = useState(false);
  // Desktop: beim Start Projekt wählen, dann seine Fotos (Fotoordner aus den gemeinsamen Einstellungen)
  const [wahl, setWahl] = useState<'projekt' | 'fotos' | null>(() => (isTauri() ? 'projekt' : null));
  const [projektordner, setProjektordner] = useState<string | null>(null);
  const [fotoordner, setFotoordner] = useState(VORGABE_ALLGEMEIN.fotoordner);
  useEffect(() => {
    void allgemeinLaden()
      .then((a) => setFotoordner(a.fotoordner || VORGABE_ALLGEMEIN.fotoordner))
      .catch(() => undefined);
  }, [wahl]);
  const [ziehtDatei, setZiehtDatei] = useState(false);
  const { foto, ebene } = aktuell({ doc, fotoId, ebeneId });
  const entzerrbar = useMemo(() => (foto && ebene ? entzerrung(foto, ebene).ok : false), [foto, ebene]);
  const entzerrt = ansicht === 'entzerrt' && entzerrbar;
  const name = dateiname?.replace(/\.entz$/i, '') ?? (doc.fotos[0]?.name || 'Neues Projekt');

  useEffect(() => {
    document.title = `${name} – ${APP_NAMEN.entzerrung.name}`;
  }, [name]);

  useEffect(() => {
    let ende: (() => void) | undefined;
    let aktiv = true;
    void zwischenspeicherStarten().then((f) => (aktiv ? (ende = f) : f()));
    return () => {
      aktiv = false;
      ende?.();
    };
  }, []);

  // beim Schließen nachfragen, solange nicht gespeichert ist (der Zwischenstand bleibt ohnehin erhalten)
  useEffect(() => {
    const vorSchliessen = (e: BeforeUnloadEvent) => {
      if (useEntz.getState().dirty) e.preventDefault();
    };
    window.addEventListener('beforeunload', vorSchliessen);
    return () => window.removeEventListener('beforeunload', vorSchliessen);
  }, []);

  // Tastenkürzel ohne offenen Dialog: Strg+S/O überall, Strg+Z/Y und Esc außer in Textfeldern, die übrigen nicht auf Bedienelementen
  useEffect(() => {
    const taste = (e: KeyboardEvent) => {
      const s = useEntz.getState();
      const strg = e.ctrlKey || e.metaKey;
      const k = e.key.toLowerCase();
      if (strg && (k === 's' || k === 'o')) {
        if (dialogOffen()) return;
        e.preventDefault();
        void (k === 's' ? speichern() : oeffnen());
        return;
      }
      if (!verlaufErlaubt(e)) return;
      if (strg && k === 'z' && !e.shiftKey) {
        e.preventDefault();
        s.rueckgaengig();
        return;
      }
      if (strg && (k === 'y' || (k === 'z' && e.shiftKey))) {
        e.preventDefault();
        s.wiederholen();
        return;
      }
      if (strg || e.altKey) return;
      if (e.key === 'Escape') {
        abbrechen();
        return;
      }
      if (!kuerzelErlaubt(e)) return;
      if (e.key === 'Enter') abschliessen();
      else if (e.key === 'Backspace') {
        e.preventDefault();
        if (s.entwurf.length) letztenPunktEntfernen();
        else auswahlLoeschen();
      } else if (e.key === 'Delete') auswahlLoeschen();
      else if (e.key === 'Home') window.dispatchEvent(new Event('entz:einpassen'));
      else if (k === 'e') ansichtUmschalten();
    };
    window.addEventListener('keydown', taste);
    return () => window.removeEventListener('keydown', taste);
  }, []);

  const ansichtWechseln = (a: 'foto' | 'entzerrt') => useEntz.getState().setze({ ansicht: a, werkzeug: 'auswahl', entwurf: [], auswahl: null });
  const [linksZu, setLinksZu] = useState(false);

  return (
    <div
      className="app"
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes('Files')) {
          e.preventDefault();
          setZiehtDatei(true);
        }
      }}
      onDragLeave={(e) => e.currentTarget === e.target && setZiehtDatei(false)}
      onDrop={(e) => {
        e.preventDefault();
        setZiehtDatei(false);
        void ablegen([...e.dataTransfer.files]);
      }}
    >
      <TitleBar app={APP_NAMEN.entzerrung.name} name={name} dirty={dirty} onOpenLog={() => setLogOpen(true)} onProjekte={() => setWahl(projektordner ? 'fotos' : 'projekt')} onSpeichern={() => speichern()} />
      <div className="toolbar">
        <div className="tb-group">
          <button onClick={() => void neu()} title="Neues Projekt">
            Neu
          </button>
          <button onClick={() => void oeffnen()} title="Projekt öffnen (Strg+O)">
            Öffnen …
          </button>
          <button onClick={() => void speichern()} disabled={!doc.fotos.length} title="Projekt mit Fotos speichern (Strg+S)">
            Speichern
          </button>
        </div>
        <div className="tb-group">
          {isTauri() && (
            <button onClick={() => setWahl(projektordner ? 'fotos' : 'projekt')} title="Fotos aus dem Fotoordner des Projekts">
              Fotos des Projekts …
            </button>
          )}
          <button onClick={() => void fotosHinzufuegen()} title="Fotos hinzufügen (JPEG, PNG, WebP)">
            <Symbol name="plus" /> Foto …
          </button>
          <button onClick={() => setLinksZu((z) => !z)} aria-pressed={!linksZu} title={linksZu ? 'Leiste mit Fotos und Ebenen einblenden' : 'Leiste mit Fotos und Ebenen ausblenden (mehr Platz zum Zeichnen)'}>
            <Symbol name={linksZu ? 'pfeilRechts' : 'pfeilLinks'} /> Fotos
          </button>
        </div>
        <div className="tb-group">
          <div className="segment" role="group" aria-label="Ansicht">
            <button disabled={!foto} onClick={() => ansichtWechseln('foto')} title="Foto mit Referenz und Hilfslinien (Taste E wechselt)" aria-pressed={!entzerrt}>
              Foto
            </button>
            <button disabled={!entzerrbar} onClick={() => ansichtWechseln('entzerrt')} title={entzerrbar ? 'Entzerrte Ebene zum Messen (Taste E wechselt)' : 'Erst die Referenz vervollständigen'} aria-pressed={entzerrt}>
              Entzerrt
            </button>
          </div>
        </div>
        {foto && (
          <div className="tb-group">
            <WerkzeugKnopf w="auswahl" title="Auswählen, Punkte ziehen, Ansicht verschieben (Esc); Werkzeuge stehen rechts" />
          </div>
        )}
        <div className="tb-group">
          <button onClick={() => useEntz.getState().rueckgaengig()} disabled={!kannZurueck} title="Rückgängig (Strg+Z)" aria-label="Rückgängig">
            <Symbol name="rueckgaengig" />
          </button>
          <button onClick={() => useEntz.getState().wiederholen()} disabled={!kannVor} title="Wiederholen (Strg+Y)" aria-label="Wiederholen">
            <Symbol name="wiederholen" />
          </button>
          <button onClick={() => window.dispatchEvent(new Event('entz:einpassen'))} disabled={!foto} title="Alles zeigen (Pos1)">
            <Symbol name="einpassen" /> Einpassen
          </button>
        </div>
      </div>
      <div className="workspace">
        {!linksZu && (
          <BreitenLeiste schluessel="entzerrung:breite:links" vorgabe={260} min={190} max={420}>
            <FotoLeiste />
          </BreitenLeiste>
        )}
        <main className="main">
          <Arbeitsflaeche />
          {ziehtDatei && <div className="ef-ablegen">Fotos oder Entzerrungs-Projekt hier ablegen</div>}
        </main>
        <BreitenLeiste schluessel="entzerrung:breite:rechts" vorgabe={310} min={250} max={480} seite="rechts">
          <Eigenschaften />
        </BreitenLeiste>
      </div>
      {wahl === 'projekt' && (
        <ProjektWahl
          app={APP_NAMEN.entzerrung.name}
          nurOrdner
          onGewaehlt={(g) => {
            setProjektordner(g.ordner);
            useEntz.getState().setze({ projekt: [g.project.meta.projektcode, g.project.meta.vorhaben?.trim() || g.project.name].filter((x) => x?.trim()).join(' · ') || null });
            setWahl('fotos');
          }}
          onSchliessen={() => setWahl(null)}
          onDateiOeffnen={() => {
            setWahl(null);
            void oeffnen();
          }}
        />
      )}
      {wahl === 'fotos' && projektordner && (
        <FotoWahl
          key={projektordner}
          fs={tauriProjektordner}
          projektordner={projektordner}
          fotoordner={fotoordner}
          onFoto={(root, pfad) => {
            setWahl(null);
            void fotoImProjektOeffnen(tauriProjektordner, root, pfad);
          }}
          onAnderesProjekt={() => setWahl('projekt')}
          onSchliessen={() => setWahl(null)}
        />
      )}
      {logOpen && <LogDialog onClose={() => setLogOpen(false)} />}
    </div>
  );
}
