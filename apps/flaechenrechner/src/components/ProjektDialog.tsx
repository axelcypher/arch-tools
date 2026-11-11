import { fmt2 } from '@core/format';
import type { Anschrift } from '@core/model';
import { bebauungsplanText, flurText, plzOrt } from '@core/model';
import { useEditor } from '../store/store';
import { StammdatenKnopf } from '@core/ui/Stammdaten';

/** Projektdaten in der Seitenleiste: nur Anzeige, Bearbeiten über den Dialog. */
export function ProjektInfo() {
  const project = useEditor((s) => s.project);
  const m = project.meta;
  const b = m.bauherr;
  const adresse = (a: Anschrift) => [a.strasse, plzOrt(a)].filter((x) => x.trim());
  const flur = flurText(m.grundstueck);
  const bplan = bebauungsplanText(m.bebauungsplan);
  const hatBauherr = b.name.trim() || adresse(b.adresse).length || b.kontakte.some((k) => k.wert.trim());

  return (
    <>
      <div className="projekt-info">
        {m.projektcode && <div className="projekt-code">{m.projektcode}</div>}
        <div className="projekt-name">{project.name}</div>
        {m.vorhaben && <div className="projekt-block">{m.vorhaben}</div>}
        {adresse(m.adresse).map((z, i) => (
          <div key={`a${i}`}>{z}</div>
        ))}
        {(flur || m.grundstueck.flaeche !== undefined || bplan) && (
          <div className="projekt-block">
            {flur && <div>{flur}</div>}
            {bplan && <div>Bebauungsplan {bplan}</div>}
            {m.grundstueck.flaeche !== undefined && <div>Grundstücksfläche {fmt2(m.grundstueck.flaeche)} m²</div>}
          </div>
        )}
        {hatBauherr && (
          <>
            <hr />
            {b.name && <div className="projekt-name">{b.name}</div>}
            {adresse(b.adresse).map((z, i) => (
              <div key={`b${i}`}>{z}</div>
            ))}
            {b.kontakte
              .filter((k) => k.wert.trim())
              .map((k, i) => (
                <div key={`k${i}`}>
                  <span className="muted">{k.art === 'email' ? 'E-Mail' : 'Tel.'}</span>{' '}
                  {k.art === 'email' ? <a href={`mailto:${k.wert.trim()}`}>{k.wert}</a> : k.wert}
                </div>
              ))}
          </>
        )}
        {!m.projektcode && !adresse(m.adresse).length && !hatBauherr && <div className="muted small-text">Noch keine Projektdaten erfasst.</div>}
      </div>
      <StammdatenKnopf kurz={false} project={project} onAendern={(meta, name) => useEditor.getState().update((p) => ({ ...p, name, meta }))} />
    </>
  );
}
