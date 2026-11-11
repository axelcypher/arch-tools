import { useEffect, useRef, useState } from 'react';
import { create } from 'zustand';
import { externOeffnen } from '@core/platform/links';
import type { Quelle } from '../bedingung';
import type { Gesetz } from '../recht';
import { absatzZeilen, gesetzBekannt, gesetzLaden, quelleText } from '../recht';
import { useEscSchliessen } from '@core/ui/Dialog';
import { useFormulare } from '../store';
import { MerkmalWahl } from './MerkmalWahl';

interface GesetzState {
  /** geöffnete Fundstellen (null: geschlossen) */
  quellen: Quelle[] | null;
  /** am offenen Feld: Projektmerkmale, die noch fehlen – das Fenster bietet sie zum Festlegen an (U-02) */
  merkmale: string[];
  oeffnen: (quellen: Quelle[], merkmale?: string[]) => void;
  schliessen: () => void;
}

export const useGesetz = create<GesetzState>((set) => ({
  quellen: null,
  merkmale: [],
  oeffnen: (quellen, merkmale = []) => set(quellen.length || merkmale.length ? { quellen, merkmale } : { quellen: null, merkmale: [] }),
  schliessen: () => set({ quellen: null, merkmale: [] }),
}));

/**
 * Gesetzestext im Fenster über der App: der Paragraf der Fundstelle, der zitierte Absatz hervorgehoben und in den
 * Blick gerückt. Mehrere Fundstellen als Reiter. Der Text kommt aus der App (amtliche Fassung, siehe recht/), der
 * Link führt zum Original.
 */
export function GesetzModal() {
  const quellen = useGesetz((s) => s.quellen);
  const merkmale = useGesetz((s) => s.merkmale);
  const schliessen = useGesetz((s) => s.schliessen);
  const offen = useFormulare((s) => s.offen);
  const [aktiv, setAktiv] = useState(0);
  const [gesetz, setGesetz] = useState<Gesetz | null>(null);
  const [fehler, setFehler] = useState('');
  const markiert = useRef<HTMLDivElement>(null);
  const q = quellen?.[Math.min(aktiv, quellen.length - 1)];

  useEffect(() => {
    setAktiv(0);
  }, [quellen]);
  useEffect(() => {
    setGesetz(null);
    setFehler('');
    if (!q) return;
    if (!gesetzBekannt(q.gesetz)) {
      setFehler(`Den Text von „${q.gesetz}“ hat die App nicht.`);
      return;
    }
    let aktuell = true;
    gesetzLaden(q.gesetz)
      .then((g) => aktuell && setGesetz(g))
      .catch((e) => aktuell && setFehler(String(e)));
    return () => {
      aktuell = false;
    };
  }, [q]);
  useEscSchliessen(schliessen, !!quellen);
  // Block-Körper: scrollIntoView liefert in Chromium/WebView2 ein Promise – als Rückgabe hielte React es für die
  // Aufräumfunktion und stürzte beim Schließen oder Reiterwechsel ab („destroy is not a function“)
  useEffect(() => {
    markiert.current?.scrollIntoView?.({ block: 'center' });
  }, [gesetz, q]);

  if (!quellen) return null;
  const p = q && gesetz?.paragrafen[q.paragraf];
  const bereich = p ? absatzZeilen(p, q.absatz) : null;
  const mitAbsatz = !!q?.absatz && !!bereich && (bereich.von > 0 || bereich.bis < (p?.text.length ?? 0));

  return (
    <div className="modal-backdrop" onPointerDown={(e) => e.target === e.currentTarget && schliessen()}>
      <div className="modal modal-wide fo-gesetz" role="dialog" aria-label={q ? 'Gesetzestext' : 'Projektmerkmale festlegen'}>
        {offen && merkmale.length > 0 && (
          <div className="fo-gesetz-merkmale">
            <strong>{merkmale.join(', ')} festlegen</strong>
            <MerkmalWahl offen={offen} namen={merkmale} />
          </div>
        )}
        {q && quellen.length > 1 && (
          <div className="tb-group fo-gesetz-reiter">
            {quellen.map((x, i) => (
              <button key={i} className={i === aktiv ? 'active' : ''} onClick={() => setAktiv(i)}>
                {quelleText(x)}
              </button>
            ))}
          </div>
        )}
        {q && (
          <h3>
            § {q.paragraf} {gesetz?.kurz ?? ''}
            {p && <span className="fo-gesetz-titel"> – {p.titel}</span>}
          </h3>
        )}
        {q && gesetz && (
          <p className="muted small-text">
            {gesetz.titel}
            {gesetz.fassung && `, ${gesetz.fassung}`}
            {q.absatz || q.satz || q.nummer ? ` · zitiert: ${quelleText(q)}` : ''}
          </p>
        )}
        {q && (
          <div className="fo-gesetz-text">
            {fehler && <p className="fehler">{fehler}</p>}
            {!fehler && !gesetz && <p className="muted">Lädt …</p>}
            {gesetz && !p && <p className="fehler">§ {q.paragraf} gibt es in dieser Fassung nicht.</p>}
            {p &&
              p.text.map((z, i) => {
                const drin = mitAbsatz && i >= bereich!.von && i < bereich!.bis;
                return (
                  <div key={i} ref={drin && i === bereich!.von ? markiert : undefined} className={`fo-gesetz-zeile${drin ? ' markiert' : ''}${/^\d+\.|^[a-z]\)/.test(z) ? ' punkt' : ''}`}>
                    {z}
                  </div>
                );
              })}
          </div>
        )}
        <div className="dialog-buttons">
          {(p?.url || gesetz?.url) && <button onClick={() => void externOeffnen(p?.url ?? gesetz!.url)}>Im Original öffnen</button>}
          <button className="primary" onClick={schliessen}>
            Schließen
          </button>
        </div>
      </div>
    </div>
  );
}
