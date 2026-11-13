import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Modal } from '@core/ui/Dialog';
import { useFormulare } from '../store';

interface Treffer {
  art: 'projekt' | 'formular';
  titel: string;
  unter: string;
  los: () => void;
}

/**
 * Schnellwahl (Strg+K): Projekte nach Kürzel oder Titel und die Formulare des aktuellen Projekts finden und mit
 * Enter öffnen – ohne durch Listen zu scrollen. Der Fokus bleibt im Suchfeld (auch Tab führt nicht hinaus); ↑/↓
 * markieren einen Treffer (aria-activedescendant), Esc schließt, danach steht der Fokus wieder dort, wo er vorher war
 * (Modal, dialoge.ts).
 */
export function Schnellwahl({ onClose }: { onClose: () => void }) {
  const projekte = useFormulare((s) => s.projekte);
  const projekt = useFormulare((s) => s.projekt);
  const formulare = useFormulare((s) => s.formulare);
  const { projektWaehlen, formularOeffnen } = useFormulare.getState();
  const [q, setQ] = useState('');
  const [markiert, setMarkiert] = useState(0);
  const id = useId();
  const liste = useRef<HTMLDivElement>(null);

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

  const optionId = (i: number) => `${id}-treffer-${i}`;
  const aktiv = treffer.length ? Math.min(markiert, treffer.length - 1) : -1;

  // der markierte Treffer bleibt beim Blättern mit ↑/↓ im Bild
  useEffect(() => {
    if (aktiv >= 0) liste.current?.querySelector(`[id="${optionId(aktiv)}"]`)?.scrollIntoView?.({ block: 'nearest' });
  }, [aktiv]); // eslint-disable-line react-hooks/exhaustive-deps

  const waehle = (t: Treffer | undefined) => {
    if (!t) return;
    onClose();
    t.los();
  };

  return (
    <Modal titel="Schnellwahl" kopf onClose={onClose} breit className="fo-schnellwahl">
      {/* kein autoFocus: den Startfokus setzt dialoge.ts (erstes Bedienelement) – so merkt es sich vorher die Stelle für die Rückkehr */}
      <input
        type="search"
        role="combobox"
        aria-label="Projekt oder Formular suchen"
        aria-autocomplete="list"
        aria-expanded={treffer.length > 0}
        aria-controls={`${id}-liste`}
        aria-activedescendant={aktiv >= 0 ? optionId(aktiv) : undefined}
        placeholder="Projekt (Kürzel, Titel) oder Formular …"
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setMarkiert(0);
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') setMarkiert((m) => Math.min(treffer.length - 1, m + 1));
          else if (e.key === 'ArrowUp') setMarkiert((m) => Math.max(0, m - 1));
          else if (e.key === 'Enter') waehle(treffer[aktiv]);
          // das Suchfeld ist das einzige Bedienelement des Dialogs – Tab bleibt hier
          else if (e.key !== 'Tab') return;
          e.preventDefault();
        }}
      />
      <div className="sw-liste" role="listbox" id={`${id}-liste`} aria-label="Treffer" ref={liste}>
        {treffer.map((t, i) => (
          // keine Knöpfe: Treffer wählt man über das Suchfeld (↑/↓, Enter) oder mit der Maus – sie sind kein Tab-Ziel
          <div
            key={`${t.art}|${t.titel}|${t.unter}`}
            id={optionId(i)}
            role="option"
            aria-selected={i === aktiv}
            className={`sw-eintrag${i === aktiv ? ' active' : ''}`}
            onMouseEnter={() => setMarkiert(i)}
            onClick={() => waehle(t)}
          >
            <span>
              <span className="fo-art">{t.art === 'projekt' ? 'Projekt' : 'Formular'}</span> <strong>{t.titel}</strong>
            </span>
            {t.unter && <span className="muted">{t.unter}</span>}
          </div>
        ))}
        {!treffer.length && <p className="muted small-text">Nichts gefunden.</p>}
      </div>
    </Modal>
  );
}
