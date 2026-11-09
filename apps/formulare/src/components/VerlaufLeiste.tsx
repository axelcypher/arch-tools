import { useMemo } from 'react';
import type { OffenesFormular } from '../store';
import { useFormulare } from '../store';

const zeit = (ms: number) => {
  const d = new Date(ms);
  const heute = new Date().toDateString() === d.toDateString();
  return heute ? d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) : d.toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
};

const kurz = (w: string | boolean | number | null) => (typeof w === 'boolean' ? (w ? '☒' : '☐') : typeof w !== 'string' ? String(w ?? '–') : w.trim() ? (w.length > 40 ? `${w.slice(0, 40).replace(/\n/g, ' ')}…` : w.replace(/\n/g, ' ')) : '(leer)');

/**
 * Verlauf rechts: alle Eingaben dieses Formulars, neueste oben – auch von früheren Sitzungen. Ein Klick stellt
 * den Stand nach diesem Schritt wieder her (alles danach ist zurückgenommen, lässt sich aber wiederholen).
 */
export function VerlaufLeiste({ offen }: { offen: OffenesFormular }) {
  const { zuVerlaufsstand, setVerlaufOffen } = useFormulare.getState();
  const beschriftung = useMemo(() => new Map(offen.felder.flat().map((f) => [f.schluessel, f.beschriftung])), [offen.felder]);
  const { schritte, position } = offen.verlauf;

  return (
    <aside className="fo-verlauf" aria-label="Verlauf">
      <div className="fo-verlauf-kopf">
        <h3>Verlauf</h3>
        <button className="fo-klein" title="Schließen" onClick={() => setVerlaufOffen(false)}>
          ×
        </button>
      </div>
      <p className="muted small-text">
        {offen.gesichert ? `Lokal gesichert ${zeit(offen.gesichert)}. ` : ''}Jede Eingabe wird sofort lokal gesichert; in die FORMA-Datei kommt sie mit „Speichern“.
      </p>
      <ol className="fo-verlauf-liste" reversed>
        {[...schritte.keys()].reverse().map((i) => {
          const s = schritte[i];
          const zurueckgenommen = i >= position;
          const titel = s.titel ?? beschriftung.get(s.aenderungen[0].feld) ?? s.aenderungen[0].feld;
          return (
            <li key={i}>
              <button
                className={`fo-verlauf-schritt${zurueckgenommen ? ' zurueck' : ''}${i === position - 1 ? ' aktuell' : ''}`}
                title={zurueckgenommen ? 'Zurückgenommen – Klick stellt diesen Stand wieder her' : 'Klick: Stand nach diesem Schritt'}
                onClick={() => zuVerlaufsstand(i + 1)}
              >
                <span className="fo-verlauf-zeit">{zeit(s.zeit)}</span>
                <span className="fo-verlauf-titel">{titel}</span>
                {s.aenderungen.length === 1 ? (
                  <span className="fo-verlauf-werte">
                    {kurz(s.aenderungen[0].vorher)} → {kurz(s.aenderungen[0].nachher)}
                  </span>
                ) : (
                  <span className="fo-verlauf-werte">{s.aenderungen.length} Felder</span>
                )}
              </button>
            </li>
          );
        })}
      </ol>
      {schritte.length > 0 && (
        <button className={`fo-verlauf-schritt${position === 0 ? ' aktuell' : ''}`} onClick={() => zuVerlaufsstand(0)}>
          <span className="fo-verlauf-titel">Anfang (vor der ersten Eingabe)</span>
        </button>
      )}
      {!schritte.length && <p className="muted small-text">Noch keine Eingaben.</p>}
    </aside>
  );
}
