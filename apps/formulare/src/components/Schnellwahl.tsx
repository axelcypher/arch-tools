import { useMemo, useState } from 'react';
import { useFormulare } from '../store';

interface Treffer {
  art: 'projekt' | 'formular';
  titel: string;
  unter: string;
  los: () => void;
}

/**
 * Schnellwahl (Strg+K): Projekte nach Kürzel oder Titel und die Formulare des aktuellen Projekts finden und mit
 * Enter öffnen – ohne durch Listen zu scrollen.
 */
export function Schnellwahl({ onClose }: { onClose: () => void }) {
  const projekte = useFormulare((s) => s.projekte);
  const projekt = useFormulare((s) => s.projekt);
  const formulare = useFormulare((s) => s.formulare);
  const { projektWaehlen, formularOeffnen } = useFormulare.getState();
  const [q, setQ] = useState('');
  const [markiert, setMarkiert] = useState(0);

  const treffer = useMemo((): Treffer[] => {
    const woerter = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const passt = (s: string) => woerter.every((w) => s.toLowerCase().includes(w));
    const f: Treffer[] = formulare
      .filter((x) => passt(x.name))
      .map((x) => ({ art: 'formular', titel: x.name, unter: projekt?.ordner ?? '', los: () => void formularOeffnen(x) }));
    const p: Treffer[] = projekte
      .filter((x) => passt(`${x.ordner} ${x.titel}`))
      // exakter Treffer auf das Kürzel zuerst
      .sort((a, b) => Number(b.ordner.toLowerCase() === q.trim().toLowerCase()) - Number(a.ordner.toLowerCase() === q.trim().toLowerCase()))
      .map((x) => ({ art: 'projekt', titel: x.ordner, unter: x.titel, los: () => void projektWaehlen(x) }));
    return (woerter.length ? [...p, ...f] : [...f, ...p]).slice(0, 50);
  }, [q, projekte, formulare, projekt, projektWaehlen, formularOeffnen]);

  const waehle = (t: Treffer | undefined) => {
    if (!t) return;
    onClose();
    t.los();
  };

  return (
    <div className="modal-backdrop fo-schnellwahl-huelle" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal modal-wide fo-schnellwahl" aria-label="Schnellwahl">
        <input
          type="search"
          autoFocus
          placeholder="Projekt (Kürzel, Titel) oder Formular …"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setMarkiert(0);
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') setMarkiert((m) => Math.min(treffer.length - 1, m + 1));
            else if (e.key === 'ArrowUp') setMarkiert((m) => Math.max(0, m - 1));
            else if (e.key === 'Enter') waehle(treffer[markiert]);
            else if (e.key === 'Escape') onClose();
            else return;
            e.preventDefault();
          }}
        />
        <div className="fo-liste" role="listbox">
          {treffer.map((t, i) => (
            <button
              key={`${t.art}|${t.titel}|${t.unter}`}
              role="option"
              aria-selected={i === markiert}
              className={`fo-eintrag${i === markiert ? ' active' : ''}`}
              onMouseEnter={() => setMarkiert(i)}
              onClick={() => waehle(t)}
            >
              <span>
                <span className="fo-art">{t.art === 'projekt' ? 'Projekt' : 'Formular'}</span> <strong>{t.titel}</strong>
              </span>
              {t.unter && <span className="muted">{t.unter}</span>}
            </button>
          ))}
          {!treffer.length && <p className="muted small-text">Nichts gefunden.</p>}
        </div>
      </div>
    </div>
  );
}
