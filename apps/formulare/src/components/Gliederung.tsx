import { useMemo } from 'react';
import { abschnitte } from '../forma/felder';
import { springeZuFeld } from '../navigation';
import type { OffenesFormular } from '../store';
import { wertVon } from '../store';

/** Gliederung des offenen Formulars: Seiten und Abschnitte mit Füllstand – ein Klick springt hin */
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

  return (
    <nav className="fo-gliederung" aria-label="Gliederung">
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
