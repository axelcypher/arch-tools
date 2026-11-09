import { useMemo } from 'react';
import { abschnitte } from '../forma/felder';
import { springeZuFeld } from '../navigation';
import type { OffenesFormular } from '../store';
import { useFormulare, wertVon } from '../store';

/**
 * Gliederung des offenen Formulars: Seiten und Abschnitte mit Füllstand – ein Klick springt hin. Sie steht als
 * eigener Bereich direkt am Formular (nicht in der Navigation links) und gehört sichtbar zum Dokument.
 */
export function Gliederung({ offen }: { offen: OffenesFormular }) {
  const seiten = useMemo(
    () =>
      offen.felder.map((felder, i) => ({
        i,
        abschnitte: abschnitte(felder).map((a) => ({
          titel: a.titel || a.felder[0].beschriftung,
          erstes: a.felder[0].schluessel,
          gesamt: a.felder.length,
          gefuellt: a.felder.filter((f) => {
            const w = wertVon(offen, f);
            return w === true || (typeof w === 'string' && w.trim() !== '');
          }).length,
          geaendert: a.felder.some((f) => f.schluessel in offen.aenderungen),
        })),
      })),
    [offen],
  );

  const schliessen = () => useFormulare.getState().setGliederungOffen(false);
  const gesamt = seiten.reduce((n, s) => n + s.abschnitte.reduce((m, a) => m + a.gesamt, 0), 0);
  const gefuellt = seiten.reduce((n, s) => n + s.abschnitte.reduce((m, a) => m + a.gefuellt, 0), 0);
  return (
    <nav className="fo-gliederung" aria-label="Inhalt des Formulars">
      <div className="fo-gl-kopf">
        <div className="fo-gl-kopf-text">
          <span className="fo-gl-art">Inhalt des Formulars</span>
          <strong title={offen.name}>{offen.name}</strong>
          <span className="muted small-text">
            {gefuellt} von {gesamt} Feldern ausgefüllt
          </span>
        </div>
        <button className="fo-klein" title="Gliederung ausblenden" aria-label="Gliederung ausblenden" onClick={schliessen}>
          ×
        </button>
      </div>
      {seiten.map((s) => (
        <div key={s.i}>
          <button className="fo-gl-seite" onClick={() => document.querySelector(`[data-seite="${s.i}"]`)?.scrollIntoView({ block: 'start', behavior: 'smooth' })}>
            Seite {s.i + 1}
          </button>
          {s.abschnitte.map((a) => (
            <button key={a.erstes} className="fo-gl-abschnitt" title={a.titel} onClick={() => springeZuFeld(a.erstes)}>
              <span className="fo-gl-titel">
                {a.titel}
                {a.geaendert && <span className="fo-ungespeichert"> ●</span>}
              </span>
              <span className={`fo-gl-zahl${a.gefuellt === a.gesamt ? ' voll' : ''}`}>
                {a.gefuellt}/{a.gesamt}
              </span>
            </button>
          ))}
        </div>
      ))}
    </nav>
  );
}
