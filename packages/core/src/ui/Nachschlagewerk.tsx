import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { create } from 'zustand';
import { externOeffnen } from '../platform/links';
import type { Regel, RegelApp } from '../regeln/regelwerk';
import { BEREICHE, suche } from '../regeln/regelwerk';

/**
 * Nachschlagewerk der Berechnungsregeln: zentral über die Titelleiste („Regeln“) und an den einzelnen Funktionen
 * über „?“ (HilfeKnopf) – dann vorgefiltert auf die Regeln, die dort gelten.
 */

interface HilfeState {
  offen: boolean;
  /** Themen der Stelle, von der aus geöffnet wurde (leer = alles) */
  themen: string[];
  /** Titel der Stelle, z. B. „BGF-Umriss“ */
  kontext?: string;
  oeffnen: (themen?: string[], kontext?: string) => void;
  schliessen: () => void;
}

export const useHilfe = create<HilfeState>((set) => ({
  offen: false,
  themen: [],
  oeffnen: (themen = [], kontext) => set({ offen: true, themen, kontext }),
  schliessen: () => set({ offen: false }),
}));

/** kleiner „?“-Knopf neben einer Funktion: öffnet die Regeln zu diesem Thema */
export function HilfeKnopf({ thema, titel }: { thema: string | string[]; titel?: string }) {
  const themen = Array.isArray(thema) ? thema : [thema];
  return (
    <button
      type="button"
      className="hilfe-knopf"
      title={`Berechnungsregeln${titel ? ` zu ${titel}` : ''} nachschlagen`}
      aria-label="Berechnungsregeln nachschlagen"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        useHilfe.getState().oeffnen(themen, titel);
      }}
    >
      ?
    </button>
  );
}

/** Text mit **fett** */
function inline(t: string): ReactNode {
  const teile = t.split(/(\*\*[^*]+\*\*)/g);
  return teile.map((x, i) => (x.startsWith('**') && x.endsWith('**') ? <strong key={i}>{x.slice(2, -2)}</strong> : <Fragment key={i}>{x}</Fragment>));
}

/** Absätze; aufeinanderfolgende Zeilen mit „- “ als Liste */
function Absaetze({ text }: { text: string[] }) {
  const bloecke: (string | string[])[] = [];
  for (const z of text) {
    if (z.startsWith('- ')) {
      const last = bloecke[bloecke.length - 1];
      if (Array.isArray(last)) last.push(z.slice(2));
      else bloecke.push([z.slice(2)]);
    } else bloecke.push(z);
  }
  return (
    <>
      {bloecke.map((b, i) =>
        Array.isArray(b) ? (
          <ul key={i}>
            {b.map((x, j) => (
              <li key={j}>{inline(x)}</li>
            ))}
          </ul>
        ) : (
          <p key={i}>{inline(b)}</p>
        ),
      )}
    </>
  );
}

function RegelAnsicht({ r }: { r: Regel }) {
  return (
    <article className="regel">
      <h3>{r.titel}</h3>
      <p className="regel-kurz">{r.kurz}</p>
      <Absaetze text={r.text} />
      {r.zitate?.map((z, i) => (
        <blockquote key={i} className="regel-zitat">
          „{z.text}“<footer>{z.quelle}</footer>
        </blockquote>
      ))}
      <h4>Quellen</h4>
      <ul className="regel-quellen">
        {r.quellen.map((q, i) => (
          <li key={i}>
            {q.url ? (
              <a
                href={q.url}
                onClick={(e) => {
                  e.preventDefault();
                  void externOeffnen(q.url!);
                }}
                title={q.url}
              >
                {q.titel}
              </a>
            ) : (
              q.titel
            )}
            {q.fundstelle && <span className="muted"> – {q.fundstelle}</span>}
          </li>
        ))}
      </ul>
    </article>
  );
}

/** Dialog des Nachschlagewerks; einmal je App eingebunden (über die Titelleiste) */
export function Nachschlagewerk({ app }: { app: RegelApp }) {
  const { offen, themen, kontext, schliessen } = useHilfe();
  const [q, setQ] = useState('');
  const [nurKontext, setNurKontext] = useState(true);
  const [gewaehlt, setGewaehlt] = useState<string | null>(null);
  const suchfeld = useRef<HTMLInputElement>(null);
  const dialog = useRef<HTMLDivElement>(null);

  // Fokus: beim Öffnen ins Suchfeld, beim Schließen zurück dorthin, wo er vorher war (z. B. der ?-Knopf)
  useEffect(() => {
    if (!offen) return;
    const vorher = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    return () => {
      if (vorher?.isConnected) vorher.focus();
    };
  }, [offen]);

  useEffect(() => {
    if (!offen) return;
    setQ('');
    setNurKontext(themen.length > 0);
    setGewaehlt(null);
    requestAnimationFrame(() => suchfeld.current?.focus());
  }, [offen, themen]);

  useEffect(() => {
    if (!offen) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && schliessen();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [offen, schliessen]);

  const treffer = useMemo(() => suche(q, { app, themen: nurKontext && themen.length ? themen : undefined }).map((t) => t.regel), [q, app, themen, nurKontext]);
  const aktiv = treffer.find((r) => r.id === gewaehlt) ?? treffer[0];

  if (!offen) return null;
  return (
    <div className="modal-backdrop" onPointerDown={(e) => e.target === e.currentTarget && schliessen()}>
      <div
        ref={dialog}
        className="modal nachschlagewerk"
        role="dialog"
        aria-modal="true"
        aria-label="Berechnungsregeln"
        onKeyDown={(e) => {
          // Tab bleibt im Dialog
          if (e.key !== 'Tab' || !dialog.current) return;
          const ziele = [...dialog.current.querySelectorAll<HTMLElement>('button, input, a[href], [tabindex]:not([tabindex="-1"])')].filter((el) => !el.hasAttribute('disabled'));
          if (!ziele.length) return;
          const erstes = ziele[0];
          const letztes = ziele[ziele.length - 1];
          if (e.shiftKey && document.activeElement === erstes) {
            e.preventDefault();
            letztes.focus();
          } else if (!e.shiftKey && document.activeElement === letztes) {
            e.preventDefault();
            erstes.focus();
          }
        }}
      >
        <div className="nw-kopf">
          <h3>Berechnungsregeln</h3>
          <input ref={suchfeld} className="nw-suche" type="search" placeholder="Suchen, z. B. Vollgeschoss, Putzabzug, Balkon …" value={q} onChange={(e) => setQ(e.target.value)} />
          {themen.length > 0 && (
            <label className="toggle small-text" title="nur die Regeln, die an dieser Stelle gelten">
              <input type="checkbox" checked={nurKontext} onChange={(e) => setNurKontext(e.target.checked)} />
              nur {kontext ?? 'dieses Thema'}
            </label>
          )}
          <button className="small" onClick={schliessen}>
            Schließen
          </button>
        </div>
        <div className="nw-inhalt">
          <nav className="nw-liste">
            {treffer.length === 0 && <p className="muted small-text">Keine Regel gefunden.</p>}
            {(q.trim() ? [{ id: 'treffer', titel: `${treffer.length} Treffer` }] : BEREICHE).map((b) => {
              const liste = q.trim() ? treffer : treffer.filter((r) => r.bereich === b.id);
              if (!liste.length) return null;
              return (
                <div key={b.id} className="nw-gruppe">
                  <div className="nw-gruppe-titel">{b.titel}</div>
                  {liste.map((r) => (
                    <button key={r.id} className={r.id === aktiv?.id ? 'nw-eintrag active' : 'nw-eintrag'} onClick={() => setGewaehlt(r.id)} title={r.kurz}>
                      {r.titel}
                    </button>
                  ))}
                </div>
              );
            })}
          </nav>
          <div className="nw-text">{aktiv ? <RegelAnsicht r={aktiv} /> : null}</div>
        </div>
        <p className="muted small-text nw-fuss">
          Wörtliche Zitate aus den amtlichen Texten (Stand Oktober 2026); DIN-Normen sinngemäß. Maßgebend ist der jeweilige Originaltext – die Links führen zu den Quellen.
        </p>
      </div>
    </div>
  );
}
