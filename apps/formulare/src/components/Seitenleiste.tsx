import { useMemo, useState } from 'react';
import { dateiname } from '@core/platform/files';
import { oeffneOrdner, verbinde, waehleOrdner } from '../dateisystem';
import { hatEntwurf, istGeaendert, useFormulare } from '../store';

/** Links: Projektordner, Projekte darin und die Formulare des gewählten Projekts */
export function Seitenleiste() {
  const projektordner = useFormulare((s) => s.projektordner);
  const projekte = useFormulare((s) => s.projekte);
  const suchfehler = useFormulare((s) => s.suchfehler);
  const sucht = useFormulare((s) => s.sucht);
  const projekt = useFormulare((s) => s.projekt);
  const formulare = useFormulare((s) => s.formulare);
  const offen = useFormulare((s) => s.offen);
  const { ordnerHinzufuegen, ordnerEntfernen, projekteLaden, projektWaehlen, formularOeffnen } = useFormulare.getState();
  const [suche, setSuche] = useState('');

  const gefiltert = useMemo(() => {
    const q = suche.trim().toLowerCase();
    return q ? projekte.filter((p) => `${p.ordner} ${p.titel}`.toLowerCase().includes(q)) : projekte;
  }, [projekte, suche]);

  const hinzufuegen = async () => {
    const pfad = await waehleOrdner('Ordner mit FORMA-Projekten wählen');
    if (pfad) await ordnerHinzufuegen(pfad);
  };

  return (
    <aside className="fo-leiste">
      <section className="fo-block">
        <div className="section-head">
          <h3>Projektordner</h3>
          <button className="fo-klein" title="Projekte neu einlesen" disabled={sucht || !projektordner.length} onClick={() => void projekteLaden()}>
            ↻
          </button>
        </div>
        {projektordner.map((p) => (
          <div key={p} className="fo-ordner" title={p}>
            <span className="fo-ordner-name">{dateiname(p) || p}</span>
            <button className="fo-klein" title="Aus der Liste entfernen (der Ordner selbst bleibt unverändert)" onClick={() => void ordnerEntfernen(p)}>
              ×
            </button>
          </div>
        ))}
        <button onClick={() => void hinzufuegen()}>Ordner hinzufügen …</button>
        {suchfehler.map((f) => (
          <p key={f} className="warning small-text">
            {f}
          </p>
        ))}
      </section>

      {projektordner.length > 0 && (
        <section className="fo-block fo-wachsend">
          <h3>Projekte {sucht && <span className="muted small-text">(werden gesucht …)</span>}</h3>
          <input type="search" placeholder="Suchen …" value={suche} onChange={(e) => setSuche(e.target.value)} />
          <div className="fo-liste" role="list">
            {gefiltert.map((p) => (
              <button
                key={`${p.root}|${p.ordner}`}
                role="listitem"
                className={`fo-eintrag${projekt?.root === p.root && projekt.ordner === p.ordner ? ' active' : ''}`}
                title={verbinde(p.root, p.ordner)}
                onClick={() => void projektWaehlen(p)}
              >
                <strong>{p.ordner}</strong>
                {p.titel && <span className="muted">{p.titel}</span>}
              </button>
            ))}
            {!sucht && !gefiltert.length && <p className="muted small-text">Keine FORMA-Projekte gefunden.</p>}
          </div>
        </section>
      )}

      {projekt && (
        <section className="fo-block fo-wachsend">
          <div className="section-head">
            <h3>Formulare</h3>
            <button className="fo-klein" title="Projektordner im Explorer zeigen" onClick={() => void oeffneOrdner(verbinde(projekt.root, projekt.ordner))}>
              ↗
            </button>
          </div>
          <div className="fo-liste" role="list">
            {formulare.map((f) => {
              const aktiv = offen?.pfad === f.pfad;
              const ungespeichert = aktiv ? istGeaendert(offen) : hatEntwurf(projekt, f.pfad);
              const fremd = f.gesperrt && !(aktiv && offen?.sperre.art === 'eigen');
              return (
                <button key={f.pfad} role="listitem" className={`fo-eintrag${aktiv ? ' active' : ''}`} onClick={() => void formularOeffnen(f)}>
                  <span>
                    {fremd && (
                      <span title="Anderswo geöffnet (Sperrdatei vorhanden)" aria-label="gesperrt">
                        🔒{' '}
                      </span>
                    )}
                    {f.name}
                    {ungespeichert && (
                      <span className="fo-ungespeichert" title="Nicht gespeicherte Eingaben">
                        {' '}
                        ●
                      </span>
                    )}
                  </span>
                </button>
              );
            })}
            {!formulare.length && <p className="muted small-text">Keine Formulare in diesem Projekt.</p>}
          </div>
        </section>
      )}
    </aside>
  );
}
