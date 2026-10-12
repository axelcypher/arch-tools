import { useEffect, useMemo, useState } from 'react';
import { LogDialog } from '@core/ui/LogDialog';
import { TitleBar } from '@core/ui/TitleBar';
import { abbrechen, abschliessen, auswahlLoeschen, letztenPunktEntfernen } from './aktionen';
import { Arbeitsflaeche } from './components/Arbeitsflaeche';
import { Eigenschaften, WerkzeugKnopf } from './components/Eigenschaften';
import { FotoLeiste } from './components/FotoLeiste';
import { entzerrung } from './geo/ebene';
import { ablegen, fotosHinzufuegen, neu, oeffnen, speichern, zwischenspeicherStarten } from './projekt';
import { aktuell, useEntz } from './store';

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
  const [ziehtDatei, setZiehtDatei] = useState(false);
  const { foto, ebene } = aktuell({ doc, fotoId, ebeneId });
  const entzerrbar = useMemo(() => (foto && ebene ? entzerrung(foto, ebene).ok : false), [foto, ebene]);
  const entzerrt = ansicht === 'entzerrt' && entzerrbar;
  const name = dateiname?.replace(/\.entz$/i, '') ?? (doc.fotos[0]?.name || 'Neues Projekt');

  useEffect(() => {
    document.title = `${name} – Entzerrung`;
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

  // Tastenkürzel
  useEffect(() => {
    const taste = (e: KeyboardEvent) => {
      const s = useEntz.getState();
      const imFeld = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement;
      const strg = e.ctrlKey || e.metaKey;
      if (strg && e.key.toLowerCase() === 's') {
        e.preventDefault();
        void speichern();
        return;
      }
      if (strg && e.key.toLowerCase() === 'o') {
        e.preventDefault();
        void oeffnen();
        return;
      }
      if (imFeld) return;
      if (strg && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        e.preventDefault();
        s.rueckgaengig();
      } else if (strg && (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey))) {
        e.preventDefault();
        s.wiederholen();
      } else if (e.key === 'Escape') abbrechen();
      else if (e.key === 'Enter') abschliessen();
      else if (e.key === 'Backspace') {
        e.preventDefault();
        if (s.entwurf.length) letztenPunktEntfernen();
        else auswahlLoeschen();
      } else if (e.key === 'Delete') auswahlLoeschen();
      else if (e.key === 'Home') window.dispatchEvent(new Event('entz:einpassen'));
      else if (e.key === 'Tab' && !strg) {
        e.preventDefault();
        s.setze({ ansicht: s.ansicht === 'foto' ? 'entzerrt' : 'foto', werkzeug: 'auswahl', entwurf: [], auswahl: null });
      }
    };
    window.addEventListener('keydown', taste);
    return () => window.removeEventListener('keydown', taste);
  }, []);

  const ansichtWechseln = (a: 'foto' | 'entzerrt') => useEntz.getState().setze({ ansicht: a, werkzeug: 'auswahl', entwurf: [], auswahl: null });

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
      <TitleBar app="Entzerrung" name={name} dirty={dirty} onOpenLog={() => setLogOpen(true)} />
      <div className="toolbar">
        <div className="tb-group">
          <button onClick={neu} title="Neues Projekt">
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
          <button onClick={() => void fotosHinzufuegen()}>+ Foto</button>
        </div>
        <div className="tb-group">
          <button className={!entzerrt ? 'active' : ''} disabled={!foto} onClick={() => ansichtWechseln('foto')} title="Foto mit Referenz und Hilfslinien (Tab wechselt)">
            Foto
          </button>
          <button className={entzerrt ? 'active' : ''} disabled={!entzerrbar} onClick={() => ansichtWechseln('entzerrt')} title={entzerrbar ? 'Entzerrte Ebene zum Messen (Tab wechselt)' : 'Erst die Referenz vervollständigen'}>
            Entzerrt
          </button>
        </div>
        {foto && (
          <div className="tb-group">
            <WerkzeugKnopf w="auswahl" title="Auswählen, Punkte ziehen, Ansicht verschieben (Esc)" />
            {entzerrt ? (
              <>
                <WerkzeugKnopf w="strecke" />
                <WerkzeugKnopf w="linienzug" />
                <WerkzeugKnopf w="flaeche" />
              </>
            ) : (
              ebene && (
                <>
                  {ebene.methode === 'rechteck' && <WerkzeugKnopf w="ecken" />}
                  {ebene.methode === 'passpunkte' && <WerkzeugKnopf w="passpunkt" />}
                  {ebene.methode === 'fluchtlinien' && (
                    <>
                      <WerkzeugKnopf w="waagerecht" />
                      <WerkzeugKnopf w="senkrecht" />
                      <WerkzeugKnopf w="mass" />
                    </>
                  )}
                  <WerkzeugKnopf w="hilfslinie" title="Gekrümmte Kante für die Objektivverzeichnung" />
                </>
              )
            )}
          </div>
        )}
        <div className="tb-group">
          <button onClick={() => useEntz.getState().rueckgaengig()} disabled={!kannZurueck} title="Rückgängig (Strg+Z)">
            ↶
          </button>
          <button onClick={() => useEntz.getState().wiederholen()} disabled={!kannVor} title="Wiederholen (Strg+Y)">
            ↷
          </button>
          <button onClick={() => window.dispatchEvent(new Event('entz:einpassen'))} disabled={!foto} title="Alles zeigen (Pos1)">
            Einpassen
          </button>
        </div>
      </div>
      <div className="workspace">
        <FotoLeiste />
        <main className="main">
          <Arbeitsflaeche />
          {ziehtDatei && <div className="ef-ablegen">Fotos oder Entzerrungs-Projekt hier ablegen</div>}
        </main>
        <Eigenschaften />
      </div>
      {logOpen && <LogDialog onClose={() => setLogOpen(false)} />}
    </div>
  );
}
