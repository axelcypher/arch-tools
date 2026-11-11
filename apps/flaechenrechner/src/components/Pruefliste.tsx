import { useDeferredValue, useMemo, useState } from 'react';
import { pruefeProjekt } from '@core/pruefung';
import type { PruefEintrag } from '@core/pruefung';
import { useEditor } from '../store/store';
import { useKatalog } from '../core/katalog';

/**
 * Prüfliste (F-10): Hinweise zur Plausibilität aller Geschosse – Ampel in der Auswertung, aufklappbar; ein Klick
 * auf einen Eintrag wechselt ins Geschoss und wählt die betroffenen Flächen. Alles sind Hinweise zum Prüfen.
 */
export function Pruefliste() {
  const project = useDeferredValue(useEditor((s) => s.project));
  const katalog = useKatalog((s) => s.katalog);
  const eigen = useKatalog((s) => s.eigen);
  const eintraege = useMemo(() => pruefeProjekt(project, { katalog: eigen ? katalog.map((k) => k.name) : undefined }), [project, katalog, eigen]);
  const [offen, setOffen] = useState(false);
  const warnungen = eintraege.filter((e) => e.art === 'warnung').length;
  const waehlen = (e: PruefEintrag) => {
    const st = useEditor.getState();
    if (st.activeStoreyId !== e.storeyId) st.setActiveStorey(e.storeyId);
    if (e.shapeIds.length) st.selectMany(e.shapeIds);
  };
  const name = (id: string) => project.storeys.find((s) => s.id === id)?.name ?? '';
  return (
    <div className="pruefliste">
      <button className={`small pruef-knopf ${warnungen ? 'pruef-warnung' : eintraege.length ? 'pruef-hinweis' : 'pruef-ok'}`} onClick={() => setOffen(!offen)} aria-expanded={offen}>
        <span className="ampel" aria-hidden />
        {eintraege.length
          ? `Prüfen: ${warnungen ? `${warnungen} Warnung${warnungen === 1 ? '' : 'en'}` : ''}${warnungen && eintraege.length > warnungen ? ', ' : ''}${eintraege.length > warnungen ? `${eintraege.length - warnungen} Hinweis${eintraege.length - warnungen === 1 ? '' : 'e'}` : ''}`
          : 'Prüfen: keine Auffälligkeiten'}
        {eintraege.length > 0 && <span aria-hidden>{offen ? ' ▴' : ' ▾'}</span>}
      </button>
      {offen && eintraege.length > 0 && (
        <ul className="pruef-liste small-text">
          {eintraege.map((e, i) => (
            <li key={i} className={e.art} onClick={() => waehlen(e)} title={e.shapeIds.length ? 'Klick wählt die Fläche(n)' : undefined}>
              <span className="pruef-geschoss">{name(e.storeyId)}</span> {e.text}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
