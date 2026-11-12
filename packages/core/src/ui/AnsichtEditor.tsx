import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent, ReactNode } from 'react';
import { useMemo, useRef, useState } from 'react';
import type { Ansicht, FeldDef } from './ansicht';
import { abschnittVerschieben, felderDerAnsicht, feldEntfernen, feldHinzufuegen, feldVerschieben, leereAnsicht, neueId } from './ansicht';
import { Modal } from './Dialog';
import { einfuegeStelle, zeigerZiehen } from './ziehen';
import './ansicht.css';

/**
 * Kleiner Editor für eigene Ansichten (siehe ansicht.ts): links die Abschnitte mit ihren Feldern – Reihenfolge per
 * Ziehen am Griff (auch in einen anderen Abschnitt) oder mit ↑/↓ –, rechts der Katalog der verfügbaren Felder mit
 * Suche; ein Haken nimmt ein Feld in den gewählten Abschnitt auf. Jede Änderung wirkt sofort (`onChange`).
 */
export function AnsichtEditor({
  titel,
  text,
  katalog,
  ansicht,
  onChange,
  onSchliessen,
  vorgabe,
}: {
  titel: string;
  text?: ReactNode;
  katalog: FeldDef[];
  /** null = noch keine eigene Ansicht (der Editor beginnt mit `vorgabe` bzw. einem leeren Abschnitt) */
  ansicht: Ansicht | null;
  onChange: (a: Ansicht | null) => void;
  onSchliessen: () => void;
  /** Ausgangspunkt, wenn es noch keine eigene Ansicht gibt */
  vorgabe?: Ansicht;
}) {
  const a = ansicht ?? vorgabe ?? leereAnsicht();
  const [aktiv, setAktiv] = useState<string>(a.abschnitte[0]?.id ?? '');
  const [suche, setSuche] = useState('');
  const [zug, setZug] = useState<{ feld: string; nach: string; stelle: number } | null>(null);
  const aufbau = useRef<HTMLDivElement>(null);
  const nach = useMemo(() => new Map(katalog.map((f) => [f.id, f])), [katalog]);
  const drin = new Set(felderDerAnsicht(a));
  const aktiverAbschnitt = a.abschnitte.find((x) => x.id === aktiv) ?? a.abschnitte[0];
  const setzen = (neu: Ansicht) => onChange(neu);

  const q = suche.trim().toLowerCase();
  const gruppen = useMemo(() => {
    const m = new Map<string, FeldDef[]>();
    for (const f of katalog) {
      if (q && !`${f.gruppe ?? ''} ${f.titel}`.toLowerCase().includes(q)) continue;
      const g = f.gruppe ?? '';
      m.set(g, [...(m.get(g) ?? []), f]);
    }
    return [...m];
  }, [katalog, q]);

  const umschalten = (f: FeldDef) => {
    if (drin.has(f.id)) setzen(feldEntfernen(a, f.id));
    else if (aktiverAbschnitt) setzen(feldHinzufuegen(a, aktiverAbschnitt.id, f.id));
  };

  /** Feld am Griff ziehen: Ziel ist der Abschnitt unter dem Zeiger, die Stelle nach den Mitten seiner Felder */
  const feldZiehen = (feld: string) => (e: ReactPointerEvent<HTMLElement>) => {
    e.preventDefault();
    let ziel: { feld: string; nach: string; stelle: number } | null = null;
    zeigerZiehen(e, {
      schwelle: 0,
      bewegen: (ev) => {
        const unter = document.elementFromPoint(ev.clientX, ev.clientY)?.closest<HTMLElement>('[data-ansicht-abschnitt]');
        if (!unter || !aufbau.current?.contains(unter)) return;
        const zeilen = [...unter.querySelectorAll<HTMLElement>('[data-ansicht-feld]')];
        const ohne = zeilen.findIndex((z) => z.dataset.ansichtFeld === feld);
        ziel = { feld, nach: unter.dataset.ansichtAbschnitt!, stelle: einfuegeStelle(zeilen, ev.clientY, ohne) };
        setZug(ziel);
      },
      ende: (gezogen) => {
        setZug(null);
        if (gezogen && ziel) setzen(feldVerschieben(a, ziel.feld, ziel.nach, ziel.stelle));
      },
    });
  };

  /** ↑/↓ am Griff: innerhalb des Abschnitts, am Rand in den Abschnitt davor bzw. danach */
  const feldTaste = (feld: string, ai: number, i: number) => (e: ReactKeyboardEvent<HTMLElement>) => {
    const abschnitt = a.abschnitte[ai];
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (i > 0) setzen(feldVerschieben(a, feld, abschnitt.id, i - 1));
      else if (ai > 0) setzen(feldVerschieben(a, feld, a.abschnitte[ai - 1].id, a.abschnitte[ai - 1].felder.length));
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (i < abschnitt.felder.length - 1) setzen(feldVerschieben(a, feld, abschnitt.id, i + 1));
      else if (ai < a.abschnitte.length - 1) setzen(feldVerschieben(a, feld, a.abschnitte[ai + 1].id, 0));
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      setzen(feldEntfernen(a, feld));
    }
  };

  const abschnittNeu = () => {
    const id = neueId();
    setzen({ abschnitte: [...a.abschnitte, { id, titel: 'Neuer Abschnitt', felder: [] }] });
    setAktiv(id);
  };

  return (
    <Modal titel={titel} className="av-editor" onClose={onSchliessen} klickDaneben={false}>
      <header className="av-ed-titel">
        <h3>{titel}</h3>
        <p className="muted small-text">
          {text ?? 'Rechts Felder anhaken – sie kommen in den gewählten Abschnitt. Links ordnen: am Griff ziehen (auch in einen anderen Abschnitt) oder Griff wählen und ↑/↓, Entf entfernt.'}
        </p>
      </header>
      <div className="av-ed-koerper">
        <div className="av-ed-aufbau" ref={aufbau} aria-label="Aufbau der Ansicht">
          {a.abschnitte.map((x, ai) => {
            const gewaehlt = x.id === aktiverAbschnitt?.id;
            const zielHier = zug?.nach === x.id;
            const uebrige = x.felder.filter((f) => f !== zug?.feld);
            return (
              <section key={x.id} className={`av-ed-abschnitt${gewaehlt ? ' aktiv' : ''}${zielHier ? ' ziel' : ''}`} data-ansicht-abschnitt={x.id} onPointerDown={() => setAktiv(x.id)} onFocus={() => setAktiv(x.id)}>
                <div className="av-ed-kopf">
                  <input className="av-ed-abschnitt-titel" value={x.titel} placeholder="Abschnitt ohne Titel" aria-label={`Titel von Abschnitt ${ai + 1}`} onChange={(e) => setzen({ abschnitte: a.abschnitte.map((y) => (y.id === x.id ? { ...y, titel: e.target.value } : y)) })} />
                  <button type="button" className="icon" disabled={ai === 0} title="Abschnitt nach oben" aria-label={`Abschnitt ${x.titel || ai + 1} nach oben`} onClick={() => setzen(abschnittVerschieben(a, x.id, ai - 1))}>
                    ↑
                  </button>
                  <button type="button" className="icon" disabled={ai === a.abschnitte.length - 1} title="Abschnitt nach unten" aria-label={`Abschnitt ${x.titel || ai + 1} nach unten`} onClick={() => setzen(abschnittVerschieben(a, x.id, ai + 1))}>
                    ↓
                  </button>
                  <button
                    type="button"
                    className="icon"
                    disabled={a.abschnitte.length === 1}
                    title="Abschnitt entfernen (die Felder bleiben im Katalog)"
                    aria-label={`Abschnitt ${x.titel || ai + 1} entfernen`}
                    onClick={() => setzen({ abschnitte: a.abschnitte.filter((y) => y.id !== x.id) })}
                  >
                    ×
                  </button>
                </div>
                <ul className="av-ed-felder">
                  {x.felder.map((f, i) => {
                    const def = nach.get(f);
                    const rang = uebrige.indexOf(f);
                    const markierung = zug && zielHier && zug.feld !== f && rang === zug.stelle ? ' davor' : '';
                    return (
                      <li key={f} className={`av-ed-feld${zug?.feld === f ? ' quelle' : ''}${markierung}${def ? '' : ' fehlt'}`} data-ansicht-feld={f}>
                        <button type="button" className="av-griff" title="Ziehen, um zu verschieben – oder wählen und ↑/↓, Entf entfernt" aria-label={`${def?.titel ?? f} verschieben`} onPointerDown={feldZiehen(f)} onKeyDown={feldTaste(f, ai, i)}>
                          ⠿
                        </button>
                        <span className="av-ed-feld-text">
                          {def?.titel ?? f}
                          <span className="muted small-text">{def ? def.gruppe : 'gibt es hier nicht'}</span>
                        </span>
                        <button type="button" className="icon av-ed-weg" title="Aus der Ansicht nehmen" aria-label={`${def?.titel ?? f} aus der Ansicht nehmen`} onClick={() => setzen(feldEntfernen(a, f))}>
                          ×
                        </button>
                      </li>
                    );
                  })}
                  {zug && zielHier && zug.stelle >= uebrige.length && <li className="av-ed-einfuegen" aria-hidden />}
                  {!x.felder.length && !zielHier && <li className="av-ed-leer muted small-text">Felder rechts anhaken oder hierher ziehen</li>}
                </ul>
              </section>
            );
          })}
          <button type="button" className="small av-ed-neu" onClick={abschnittNeu}>
            + Abschnitt
          </button>
        </div>
        <div className="av-ed-katalog" aria-label="Verfügbare Felder">
          <input type="search" placeholder="Felder suchen …" aria-label="Felder suchen" value={suche} onChange={(e) => setSuche(e.target.value)} />
          <p className="muted small-text">
            {drin.size} von {katalog.length} Feldern in der Ansicht{aktiverAbschnitt ? ` · neue kommen nach „${aktiverAbschnitt.titel || 'ohne Titel'}“` : ''}
          </p>
          <div className="av-ed-liste">
            {gruppen.map(([g, felder]) => (
              <div key={g} className="av-ed-gruppe">
                {g && <div className="av-ed-gruppe-titel">{g}</div>}
                {felder.map((f) => (
                  <label key={f.id} className={`av-ed-kat-feld${drin.has(f.id) ? ' drin' : ''}`} title={f.hinweis}>
                    <input type="checkbox" checked={drin.has(f.id)} onChange={() => umschalten(f)} />
                    <span>{f.titel}</span>
                  </label>
                ))}
              </div>
            ))}
            {!gruppen.length && <p className="muted small-text">Kein Feld passt zu „{suche.trim()}“.</p>}
          </div>
        </div>
      </div>
      <footer className="av-ed-fuss">
        <button type="button" className="small" disabled={!ansicht} title="Eigene Ansicht verwerfen – es gilt wieder die Vorgabe" onClick={() => onChange(null)}>
          Zurücksetzen
        </button>
        <span className="av-ed-abstand" />
        <button type="button" className="primary" onClick={onSchliessen}>
          Fertig
        </button>
      </footer>
    </Modal>
  );
}

/**
 * Eine eigene Ansicht anzeigen: je Abschnitt ein Kasten mit den Feldern im Raster; `feld` zeigt ein Feld so an, wie
 * es die App sonst auch tut (Eingabe, Auswahl, Kästchen …). Felder, die es im Katalog nicht (mehr) gibt, erscheinen
 * als Hinweis.
 */
export function AnsichtAnzeige({ ansicht, katalog, feld, leer }: { ansicht: Ansicht; katalog: FeldDef[]; feld: (f: FeldDef) => ReactNode; leer?: ReactNode }) {
  const nach = useMemo(() => new Map(katalog.map((f) => [f.id, f])), [katalog]);
  return (
    <div className="av">
      {ansicht.abschnitte.map((x) => (
        <section key={x.id} className="av-abschnitt" aria-label={x.titel || undefined}>
          {x.titel && <h3 className="av-abschnitt-titel">{x.titel}</h3>}
          {x.felder.length ? (
            <div className="av-raster">
              {x.felder.map((id) => {
                const f = nach.get(id);
                return f ? (
                  <div key={id} className={`av-feld${f.breit ? ' breit' : ''}`}>
                    {feld(f)}
                  </div>
                ) : (
                  <div key={id} className="av-feld av-fehlt muted small-text" title={id}>
                    Feld „{id}“ gibt es hier nicht
                  </div>
                );
              })}
            </div>
          ) : (
            (leer ?? <p className="muted small-text">Noch keine Felder in diesem Abschnitt.</p>)
          )}
        </section>
      ))}
    </div>
  );
}
