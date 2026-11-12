import { useEffect, useMemo, useState } from 'react';
import type { SchrittArt } from '../autofill';
import { ART_TEXT } from '../autofill';
import { ignoriert, ignorierenSetzen, planOffen, uebernehmenOffen, unterlagenAktualisieren, useAktualisieren } from '../aktualisieren';
import { useAntrag } from '../antragStore';
import type { OffenesFormular } from '../store';
import { useFormulare } from '../store';
import { useEscSchliessen } from '@core/ui/Dialog';

const REIHENFOLGE: SchrittArt[] = ['auto', 'leer', 'manuell', 'unbekannt'];

/**
 * Daten aktualisieren im offenen Formular: Vorschau aller Felder, die die Projektkarte ändern würde. Vorgewählt
 * sind Felder, die noch den Auto-Wert tragen, und leere; von Hand überschriebene nur mit „Manuelle
 * Überschreibungen ignorieren“, Felder mit anderem Inhalt ohne gespeicherten Zustand nur auf Wunsch. Übernommen
 * wird in einem Schritt, der sich als Ganzes rückgängig machen lässt.
 */
export function AktualisierenDialog({ offen, onClose }: { offen: OffenesFormular; onClose: () => void }) {
  useEscSchliessen(onClose);
  const karte = useFormulare((s) => s.karte);
  const projektdatei = useAntrag((s) => s.projektdatei);
  const { karteLaden } = useFormulare.getState();
  const [gewaehlt, setGewaehlt] = useState<Set<string> | null>(null);
  const [gelesen, setGelesen] = useState(!!karte);

  useEffect(() => {
    if (!karte) void karteLaden().finally(() => setGelesen(true));
  }, [karte, karteLaden]);

  const plan = useMemo(() => planOffen(), [karte, offen, projektdatei]); // eslint-disable-line react-hooks/exhaustive-deps
  const ignorieren = ignoriert(offen.pfad);
  const liste = plan?.schritte ?? null;
  const auswahl = gewaehlt ?? new Set((liste ?? []).filter((v) => v.vorgewaehlt).map((v) => v.feld.schluessel));

  const umschalten = (s: string) => {
    const neu = new Set(auswahl);
    if (neu.has(s)) neu.delete(s);
    else neu.add(s);
    setGewaehlt(neu);
  };
  const uebernehmen = () => {
    if (!plan) return;
    uebernehmenOffen(
      plan.schritte.filter((v) => auswahl.has(v.feld.schluessel)),
      plan.auto,
    );
    onClose();
  };

  return (
    <div className="modal-backdrop" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal modal-wide fo-ausfuellen" aria-label="Daten aktualisieren">
        <h3>Daten aktualisieren</h3>
        <label className="fo-ausfuellen-haken">
          <input
            type="checkbox"
            checked={ignorieren}
            onChange={(e) => {
              ignorierenSetzen(e.target.checked);
              setGewaehlt(null);
            }}
          />
          Manuelle Überschreibungen ignorieren <span className="muted small-text">(überall der Wert aus der Projektkarte; die Überschreibungen bleiben gemerkt)</span>
        </label>
        {!liste && <p className="muted">{gelesen ? 'Dieses Projekt hat keine lesbare Projektkarte.' : 'Projektkarte wird gelesen …'}</p>}
        {liste && !liste.length && <p>Alle Felder aus der Projektkarte sind aktuell.</p>}
        {liste && liste.length > 0 && (
          <>
            <p className="muted small-text">
              Diese Felder sind Einträgen der Projektkarte zugeordnet. Vorgewählt sind Felder mit dem bisherigen Auto-Wert und leere. Von Hand überschriebene bleiben, außer du hakst sie an. Ein
              geleertes Feld bekommt den Auto-Wert; bewusst leer bleibt ein Feld mit einem Leerzeichen.
            </p>
            <div className="fo-ausfuellen-liste">
              {[...liste]
                .sort((a, b) => REIHENFOLGE.indexOf(a.art) - REIHENFOLGE.indexOf(b.art))
                .map((v) => (
                  <label key={v.feld.schluessel} className={`fo-ausfuellen-zeile ${v.art}`}>
                    <input type="checkbox" checked={auswahl.has(v.feld.schluessel)} onChange={() => umschalten(v.feld.schluessel)} />
                    <span className="fo-ausfuellen-text">
                      <strong>{v.feld.beschriftung}</strong> <span className="muted small-text">Seite {v.feld.seite + 1}</span> <span className="fo-ausfuellen-art">{ART_TEXT[v.art]}</span>
                      <span className="fo-ausfuellen-werte">
                        {v.aktuell.trim() ? <del>{v.aktuell}</del> : <span className="muted">{v.aktuell ? '(erzwungen leer)' : '(leer)'}</span>} → <ins>{v.neu}</ins>
                      </span>
                      <span className="muted small-text">{v.quelle}</span>
                    </span>
                  </label>
                ))}
            </div>
          </>
        )}
        <div className="dialog-buttons">
          <button onClick={onClose}>Abbrechen</button>
          <button className="primary" disabled={!liste || !auswahl.size} onClick={uebernehmen}>
            {auswahl.size ? `${auswahl.size} Feld(er) übernehmen` : 'Übernehmen'}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Rückfrage nach geänderten Projektdaten: welche Unterlagen wie aktualisiert würden */
export function UnterlagenDialog() {
  const plaene = useAktualisieren((s) => s.unterlagen);
  const laeuft = useAktualisieren((s) => s.laeuft);
  const schliessen = () => useAktualisieren.getState().unterlagenSchliessen();
  useEscSchliessen(laeuft ? undefined : schliessen, !!plaene);
  if (!plaene) return null;
  return (
    <div className="modal-backdrop" onPointerDown={(e) => e.target === e.currentTarget && !laeuft && schliessen()}>
      <div className="modal modal-wide" role="dialog" aria-label="Unterlagen aktualisieren">
        <h3>Projektdaten geändert – Unterlagen aktualisieren?</h3>
        <p className="muted small-text">
          Felder mit dem bisherigen Wert aus der Projektkarte und leere werden aktualisiert. Von Hand überschriebene und anders ausgefüllte bleiben, wie sie sind; nicht geöffnete Formulare werden
          gleich gespeichert (mit ungespeicherten Eingaben: dort hinein).
        </p>
        <ul className="fo-unterlagen">
          {plaene.map((p) => {
            const neu = p.schritte.filter((s) => s.vorgewaehlt).length;
            const bleiben = p.schritte.length - neu;
            return (
              <li key={p.eintrag.pfad}>
                <strong>{p.eintrag.name}</strong>
                {p.offen && <span className="muted small-text"> (geöffnet – als ungespeicherte Eingabe)</span>}
                <span className="small-text">
                  {' '}
                  – {neu} Feld(er) aktualisieren{bleiben ? `, ${bleiben} bleiben` : ''}
                </span>
              </li>
            );
          })}
        </ul>
        <div className="dialog-buttons">
          <button disabled={laeuft} onClick={schliessen}>
            Nicht jetzt
          </button>
          <button className="primary" disabled={laeuft} onClick={() => void unterlagenAktualisieren()}>
            {laeuft ? 'Aktualisiere …' : 'Unterlagen aktualisieren'}
          </button>
        </div>
      </div>
    </div>
  );
}
