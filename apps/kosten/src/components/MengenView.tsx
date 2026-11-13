import type { KeyboardEvent } from 'react';
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import type { Project } from '@core/model';
import { fmt2 } from '@core/format';
import type { MengenBezug } from '../mengen';
import { MENGEN_BEZUEGE, MENGEN_INFO, mengen } from '../mengen';
import { useBauteile } from '../bauteile';
import type { MengeNachweis, Teil } from '../nachweis';
import { mengenNachweis } from '../nachweis';
import { setKosten, useKosten } from '../store';
import { MengenPlan } from './MengenPlan';

const Mengen3D = lazy(() => import('./Mengen3D'));

/** Wert einer Menge bzw. eines Teils; negative Werte mit typografischem Minus */
export const wert = (b: MengenBezug, v: number) => (b === 'we' ? String(v) : fmt2(v)).replace(/^-/, '−');

/** Hinweise, die eine Schwäche des Ergebnisses beschreiben (als Warnung statt als Erläuterung) */
function schwach(bezug: MengenBezug, menge: MengeNachweis, project: Project): boolean {
  if (bezug === 'iwf') return !!menge.kanten; // ohne IFC-Modell nur grob aus den Räumen
  if (bezug === 'fbg' || bezug === 'auf') {
    if (!((project.meta.grundstueck.flaeche ?? 0) > 0)) return true;
    // überbaute Fläche größer als das Grundstück
    if (bezug === 'auf' && menge.teile.reduce((a, t) => a + (t.zaehlt ? t.wert : 0), 0) < 0) return true;
  }
  // fehlende Angaben, die der Rechenkern im Hinweis nennt (Näherungen wie bei AUF sind gewollt, kein Warnfall)
  return /fehlt|bitte .*prüfen/.test(menge.hinweis ?? '');
}

/**
 * Mengen prüfen: links alle Mengen, in der Mitte die Darstellung der gewählten Menge (Grundrisse je Geschoss
 * oder 3D-Modell), rechts der Rechenweg – die Teile, deren Summe die Menge ergibt. Bild und Tabelle zeigen
 * dieselben Teile; ein Teil unter dem Mauszeiger wird in beiden hervorgehoben. Jedes Teil lässt sich an- und
 * abwählen (Häkchen in der Tabelle oder Klick im Bild) – abgewählte Teile zählen nicht zur Menge.
 */
export function MengenView({ bezug, onBezug }: { bezug: MengenBezug; onBezug: (b: MengenBezug) => void }) {
  const project = useKosten((s) => s.project);
  const waende = useBauteile((s) => s.waende);
  const ifcStatus = useBauteile((s) => s.status);
  const nachweis = useMemo(() => mengenNachweis(project, undefined, waende), [project, waende]);
  const m = useMemo(() => mengen(project, undefined, waende), [project, waende]);
  const menge = nachweis.mengen[bezug];
  const info = MENGEN_INFO[bezug];
  const [ansicht, setAnsicht] = useState<'plan' | 'raum'>(menge.ansicht);
  const [aktiv, setAktiv] = useState<string | null>(null);
  const listeRef = useRef<HTMLTableSectionElement>(null);
  const wegRef = useRef<HTMLDivElement>(null);
  const alleRef = useRef<HTMLInputElement>(null);

  // jede Menge öffnet in ihrer üblichen Darstellung
  useEffect(() => {
    setAnsicht(nachweis.mengen[bezug].ansicht);
    setAktiv(null);
  }, [bezug]); // eslint-disable-line react-hooks/exhaustive-deps

  const hatGeometrie = menge.teile.some((t) => t.plan?.length || t.raum?.length);
  const festgelegt = m[bezug].festgelegt;
  const gezaehlt = menge.teile.filter((t) => t.zaehlt).length;
  const auswahlGeaendert = (b: MengenBezug) => nachweis.mengen[b].teile.some((t) => project.kosten?.teile?.[t.id] !== undefined);
  const abweichend = auswahlGeaendert(bezug);
  const hatAbzug = menge.teile.some((t) => t.wert < 0 && t.zaehlt);
  const hatAus = menge.teile.some((t) => !t.zaehlt);

  // Teil unter dem Mauszeiger (im Bild) im Rechenweg einblenden – nur innerhalb der Tabelle rollen, nie die Seite
  useEffect(() => {
    const wrap = wegRef.current;
    if (!aktiv || !wrap || wrap.scrollHeight <= wrap.clientHeight) return;
    const zeile = [...wrap.querySelectorAll<HTMLElement>('tr[data-teil]')].find((z) => z.dataset.teil === aktiv);
    if (!zeile) return;
    const r = zeile.getBoundingClientRect();
    const w = wrap.getBoundingClientRect();
    const kopf = wrap.querySelector('thead')?.getBoundingClientRect().height ?? 0;
    if (r.top < w.top + kopf) wrap.scrollTop -= w.top + kopf - r.top;
    else if (r.bottom > w.bottom) wrap.scrollTop += r.bottom - w.bottom;
  }, [aktiv]);

  // Kopf-Häkchen: teilweise gewählt
  useEffect(() => {
    if (alleRef.current) alleRef.current.indeterminate = gezaehlt > 0 && gezaehlt < menge.teile.length;
  });

  const handwertEntfernen = () =>
    useKosten.getState().update((p) => {
      const mengen = { ...(p.kosten?.mengen ?? {}) };
      delete mengen[bezug];
      return setKosten(p, { mengen: Object.keys(mengen).length ? mengen : undefined });
    });

  /** Mengenliste per Tastatur: eine Schaltfläche je Menge (Enter/Leertaste wählt), ↑/↓ bzw. Pos1/Ende wählen die nächste */
  const listeTaste = (e: KeyboardEvent<HTMLButtonElement>, b: MengenBezug) => {
    const i = MENGEN_BEZUEGE.indexOf(b);
    const ziel = { ArrowDown: i + 1, ArrowUp: i - 1, Home: 0, End: MENGEN_BEZUEGE.length - 1 }[e.key];
    if (ziel !== undefined) {
      e.preventDefault();
      const n = MENGEN_BEZUEGE[Math.max(0, Math.min(MENGEN_BEZUEGE.length - 1, ziel))];
      onBezug(n);
      listeRef.current?.querySelector<HTMLElement>(`[data-bezug="${n}"]`)?.focus();
    }
  };

  /** Auswahl setzen; was dem Standard entspricht, wird nicht gespeichert */
  const waehle = (teile: Teil[], an: (t: Teil) => boolean) =>
    useKosten.getState().update((p) => {
      const auswahl = { ...(p.kosten?.teile ?? {}) };
      for (const t of teile) {
        if (an(t) === !t.standardAus) delete auswahl[t.id];
        else auswahl[t.id] = an(t);
      }
      return setKosten(p, { teile: Object.keys(auswahl).length ? auswahl : undefined });
    });
  const umschalten = (id: string) => {
    const t = menge.teile.find((x) => x.id === id);
    if (t) waehle([t], () => !t.zaehlt);
  };

  return (
    <div className="mv-view">
      <section className="ko-col mv-liste">
        <h2>Mengen</h2>
        <table className="ko-table">
          <tbody ref={listeRef}>
            {MENGEN_BEZUEGE.map((b) => {
              const mi = MENGEN_INFO[b];
              const geaendert = auswahlGeaendert(b);
              const teile = nachweis.mengen[b].teile;
              return (
                <tr key={b} className={`${b === bezug ? 'selected' : ''}${m[b].festgelegt ? ' festgelegt' : ''}`} title={`${mi.label} – ${mi.ermittlung}`} onClick={() => onBezug(b)}>
                  <td className="mv-menge-titel">
                    <button type="button" className="mv-menge-knopf" data-bezug={b} aria-current={b === bezug} tabIndex={b === bezug ? 0 : -1} aria-label={`${mi.kurz} – ${mi.label}`} onKeyDown={(e) => listeTaste(e, b)}>
                      <strong>{mi.kurz}</strong> <span className="mv-menge-name muted small-text">{mi.label}</span>
                    </button>
                  </td>
                  <td className="num mv-menge-wert">
                    {wert(b, m[b].wert)} <span className="muted small-text">{mi.einheit}</span>
                  </td>
                  {(m[b].festgelegt || geaendert) && (
                    <td className="mv-menge-zusatz muted small-text">
                      {m[b].festgelegt && <span className="mv-kennzeichen">festgelegt</span>}
                      {geaendert && (
                        <span className="mv-kennzeichen" title={`${teile.filter((t) => t.zaehlt).length} von ${teile.length} Teilen zählen`}>
                          Auswahl geändert
                        </span>
                      )}
                      {m[b].festgelegt && <span className="num mv-abgeleitet">abgeleitet {wert(b, m[b].abgeleitet)}</span>}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="muted small-text">
          Mit diesen Werten rechnen die Kosten. Ist ein Wert von Hand festgelegt, steht der abgeleitete klein darunter. Eine Menge wählen, um ihre Teile zu sehen.
        </p>
      </section>

      <section className="ko-col mv-bild">
        <div className="mv-kopf">
          <h2>
            {info.kurz} – {info.label}: {wert(bezug, menge.summe)} {info.einheit}
          </h2>
          <div className="mv-umschalter" role="group" aria-label="Darstellung">
            <button aria-pressed={ansicht === 'plan'} className={ansicht === 'plan' ? 'active' : ''} onClick={() => setAnsicht('plan')}>
              Grundrisse
            </button>
            <button aria-pressed={ansicht === 'raum'} className={ansicht === 'raum' ? 'active' : ''} onClick={() => setAnsicht('raum')}>
              3D-Modell
            </button>
          </div>
        </div>
        {menge.hinweis && <p className={schwach(bezug, menge, project) ? 'warning' : 'muted small-text'}>{menge.hinweis}</p>}
        {bezug === 'iwf' && ifcStatus === 'laedt' && <p className="muted small-text">Die Wände des IFC-Modells werden gelesen …</p>}
        {bezug === 'iwf' && ifcStatus === 'fehler' && <p className="warning">Das IFC-Modell des Projekts konnte nicht gelesen werden – die Innenwandfläche ist nur grob aus den Räumen abgeleitet.</p>}
        {festgelegt && (
          <div className="warning mv-handwert">
            <span>
              Für die Kosten gilt der von Hand festgelegte Wert {wert(bezug, m[bezug].wert)} {info.einheit}. Die Darstellung zeigt die abgeleitete Menge {wert(bezug, menge.summe)}{' '}
              {info.einheit}.
            </span>
            <button className="small" onClick={handwertEntfernen}>
              Handwert entfernen
            </button>
          </div>
        )}
        {!hatGeometrie && !menge.lageplan ? (
          <p className="muted small-text">Für diese Menge gibt es im Projekt nichts darzustellen.</p>
        ) : ansicht === 'plan' ? (
          <MengenPlan project={project} menge={menge} einheit={info.einheit} aktiv={aktiv} onAktiv={setAktiv} onUmschalten={umschalten} format={(v) => wert(bezug, v)} />
        ) : (
          <Suspense fallback={<p className="muted small-text">3D-Modell wird geladen …</p>}>
            <Mengen3D project={project} nachweis={nachweis} menge={menge} einheit={info.einheit} format={(v) => wert(bezug, v)} aktiv={aktiv} onAktiv={setAktiv} onUmschalten={umschalten} />
          </Suspense>
        )}
        {(hatGeometrie || menge.lageplan) && (
          <p className="mv-legende small-text">
            {/* Muster wie im Bild: in den Grundrissen gehören sie zur Zeichenfläche (im dunklen Schema mit ihr umgekehrt) */}
            {menge.teile.some((t) => t.zaehlt && t.wert >= 0) && (
              <span>
                <i className={`zaehlt${ansicht === 'plan' ? ' canvas' : ''}`} /> zählt zur Menge
              </span>
            )}
            {hatAbzug && (
              <span>
                <i className={`abzug${ansicht === 'plan' ? ' canvas' : ''}`} /> Abzug
              </span>
            )}
            {hatAus && (
              <span>
                <i className={`aus${ansicht === 'plan' ? ' canvas' : ''}`} /> abgewählt, zählt nicht
              </span>
            )}
            <span>
              <i className={`bezug${ansicht === 'plan' ? ' canvas' : ''}`} /> übrige Geometrie des Projekts
            </span>
          </p>
        )}
      </section>

      <section className="ko-col mv-rechenweg">
        <h2>Rechenweg</h2>
        {festgelegt && <p className="muted small-text">Die Auswahl wirkt erst ohne Handwert – für die Kosten gilt der festgelegte Wert.</p>}
        {menge.teile.length > 1 && (
          <div className="mv-auswahl small-text">
            <span className="muted">
              {gezaehlt} von {menge.teile.length} Teilen zählen
            </span>
            <button className="small" onClick={() => waehle(menge.teile, () => true)} disabled={gezaehlt === menge.teile.length}>
              alle
            </button>
            <button className="small" onClick={() => waehle(menge.teile, () => false)} disabled={gezaehlt === 0}>
              keine
            </button>
            <button className="small" onClick={() => waehle(menge.teile, (t) => !t.standardAus)} disabled={!abweichend} title="Auswahl dieser Menge auf den Standard zurücksetzen">
              Standard
            </button>
          </div>
        )}
        {menge.teile.length ? (
          <div className="tbl-wrap" ref={wegRef}>
            <table className="ko-table" onMouseLeave={() => setAktiv(null)}>
              <thead>
                <tr>
                  <th className="mv-check">
                    {menge.teile.length > 1 && (
                      <label title="alle Teile an- bzw. abwählen">
                        <input type="checkbox" ref={alleRef} checked={gezaehlt === menge.teile.length} onChange={() => waehle(menge.teile, () => gezaehlt < menge.teile.length)} aria-label="Alle Teile zählen zur Menge" />
                      </label>
                    )}
                  </th>
                  <th>Geschoss</th>
                  <th>Teil</th>
                  <th className="num">{info.einheit}</th>
                </tr>
              </thead>
              <tbody>
                {menge.teile.map((t) => (
                  <tr key={t.id} data-teil={t.id} className={`${t.id === aktiv ? 'mv-aktiv' : ''}${t.wert < 0 ? ' mv-abzug' : ''}${t.zaehlt ? '' : ' mv-aus'}`} onMouseEnter={() => setAktiv(t.id)}>
                    <td className="mv-check">
                      <label title={t.zaehlt ? 'zählt zur Menge – abwählen' : 'zählt nicht – anwählen'}>
                        <input
                          type="checkbox"
                          checked={!!t.zaehlt}
                          onChange={() => umschalten(t.id)}
                          onFocus={() => setAktiv(t.id)}
                          onBlur={() => setAktiv((a) => (a === t.id ? null : a))}
                          aria-label={`${t.bezeichnung} zählt zur Menge`}
                        />
                      </label>
                    </td>
                    <td>{t.geschoss}</td>
                    <td>
                      {t.bezeichnung}
                      {t.ansatz && <div className="muted small-text">{t.ansatz}</div>}
                    </td>
                    <td className="num">{wert(bezug, t.wert)}</td>
                  </tr>
                ))}
                <tr className="sum">
                  <td colSpan={3}>Summe = {info.kurz}</td>
                  <td className="num">{wert(bezug, menge.summe)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        ) : (
          <p className="muted small-text">Keine Teile – die Menge ist 0.</p>
        )}
        <p className="muted small-text">{info.ermittlung}</p>
      </section>
    </div>
  );
}
