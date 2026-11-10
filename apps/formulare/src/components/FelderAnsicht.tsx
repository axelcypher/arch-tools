import { useEffect, useMemo, useRef, useState } from 'react';
import type { Feld } from '../forma/felder';
import { abschnitte, abschnittsReihen, zeilen } from '../forma/felder';
import { useMarkierung } from '../markierung';
import { feldTasten } from '../navigation';
import type { Entfall } from '../entfall';
import type { FormularProfil } from '../profil';
import { abschnittId, feldTitel, leeresProfil, profilSchluessel } from '../profil';
import type { OffenesFormular } from '../store';
import { useFormulare, useProfil, wertVon } from '../store';
import { EntfallInfo, useEntfallen } from './EntfallInfo';

type Filter = 'alle' | 'leer' | 'geaendert';

const FILTER: { id: Filter; label: string }[] = [
  { id: 'alle', label: 'Alle' },
  { id: 'leer', label: 'Leere' },
  { id: 'geaendert', label: 'Geänderte' },
];

/**
 * Feldansicht: die Felder im Aufbau des Formulars – Abschnitte, die auf dem Papier nebeneinander stehen,
 * auch hier nebeneinander, Felder einer Zeile in einer Zeile –, aber in gut lesbarer Größe und durchsuchbar.
 */
export function FelderAnsicht({ offen, gesperrt }: { offen: OffenesFormular; gesperrt: boolean }) {
  const [suche, setSuche] = useState('');
  const [filter, setFilter] = useState<Filter>('alle');
  const q = suche.trim().toLowerCase();
  const markierung = useMarkierung((s) => s.markierung);
  const markiert = useMemo(() => new Set(markierung?.felder), [markierung]);
  const huelle = useRef<HTMLDivElement>(null);
  const roh = useProfil(profilSchluessel(offen.formular, offen.name));
  const profil = useMemo(() => ({ ...leeresProfil(), ...roh }), [roh]);
  const entfall = useEntfallen(offen);
  useEffect(() => {
    if (markierung?.rahmen) huelle.current?.querySelector('.fo-feld.umrandet')?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
  }, [markierung]);

  const seiten = useMemo(
    () =>
      offen.felder.map((felder, i) => {
        const passend = felder.filter((f) => {
          const w = wertVon(offen, f);
          if (filter === 'leer' && (w === true || (typeof w === 'string' && w.trim()))) return false;
          if (filter === 'geaendert' && !(f.schluessel in offen.aenderungen)) return false;
          return !q || `${f.abschnitt} ${feldTitel(f, profil)} ${typeof w === 'string' ? w : ''}`.toLowerCase().includes(q);
        });
        return { i, reihen: abschnittsReihen(abschnitte(passend)) };
      }),
    [offen, q, filter, profil],
  );
  const tasten = useMemo(() => feldTasten(offen.felder.flat()), [offen.felder]);

  return (
    <div className="fo-felder" ref={huelle} onKeyDown={tasten}>
      <div className="fo-felder-kopf">
        <input type="search" className="fo-feldsuche" placeholder="Felder durchsuchen (Beschriftung oder Inhalt) …" value={suche} onChange={(e) => setSuche(e.target.value)} />
        <div className="tb-group">
          {FILTER.map((f) => (
            <button key={f.id} className={filter === f.id ? 'active' : ''} onClick={() => setFilter(f.id)}>
              {f.label}
            </button>
          ))}
        </div>
      </div>
      {seiten.map((s) => (
        <section key={s.i} className="fo-seite-felder" data-seite={s.i}>
          <h2>
            Seite {s.i + 1} <span className="muted">von {seiten.length}</span>
          </h2>
          {!s.reihen.length && <p className="muted small-text">{q || filter !== 'alle' ? 'Keine passenden Felder.' : 'Auf dieser Seite gibt es keine Felder.'}</p>}
          {s.reihen.map((reihe, n) => (
            <div key={n} className="fo-reihe">
              {reihe.map((a) => {
                const titel = profil.abschnitte[abschnittId(a)]?.titel?.trim() || a.titel;
                return (
                  <div key={a.felder[0].schluessel} className="fo-abschnitt" style={{ flexGrow: a.rahmen?.b ?? 700 }}>
                    {titel && <h3>{titel}</h3>}
                    {zeilen(a.felder).map((z) => (
                      <div key={z[0].schluessel} className="fo-zeile">
                        {z.map((f) => (
                          <FeldEingabe
                            key={f.schluessel}
                            feld={f}
                            offen={offen}
                            gesperrt={gesperrt}
                            profil={profil}
                            entfall={entfall.gruende.has(f.schluessel) ? { gruende: entfall.gruende.get(f.schluessel)!, text: entfall.text(f.schluessel) } : undefined}
                            ohneBeschriftung={feldTitel(f, profil) === titel && f.art === 'text'}
                            markiert={markiert.has(f.schluessel) ? (markierung?.rahmen ? 'umrandet' : 'markiert') : null}
                          />
                        ))}
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}

function FeldEingabe({
  feld,
  offen,
  gesperrt: gesperrtFormular,
  profil,
  entfall,
  ohneBeschriftung,
  markiert,
}: {
  feld: Feld;
  offen: OffenesFormular;
  gesperrt: boolean;
  profil: FormularProfil;
  /** entfällt nach den Bedingungen – mit Gründen und Hinweistext */
  entfall?: { gruende: Entfall[]; text: string };
  ohneBeschriftung: boolean;
  /** in der Gliederung gezeigt (umrandet: zusätzlich umrandet) */
  markiert: 'markiert' | 'umrandet' | null;
}) {
  const wertSetzen = useFormulare((s) => s.wertSetzen);
  const wert = wertVon(offen, feld);
  const geaendert = feld.schluessel in offen.aenderungen;
  const klasse = `fo-feld${geaendert ? ' geaendert' : ''}${markiert ? ' markiert' : ''}${markiert === 'umrandet' ? ' umrandet' : ''}${entfall ? ' entfaellt' : ''}`;
  const info = entfall && <EntfallInfo gruende={entfall.gruende} text={entfall.text} />;
  const breite = { flexGrow: Math.max(40, feld.kasten.b) };
  // von FORMA berechnete Felder trägt man nicht ein
  const gesperrt = gesperrtFormular || feld.berechnet;
  const titel = feldTitel(feld, profil);
  const hinweis = feld.berechnet ? `${titel} – berechnet FORMA` : feld.hinweis;

  if (feld.art === 'kreuz') {
    return (
      <label className={`${klasse} fo-kreuz`} title={hinweis} style={breite}>
        <input type="checkbox" checked={wert === true} disabled={gesperrt} data-feld={feld.schluessel} onChange={(e) => wertSetzen(feld, e.target.checked)} />
        <span>{titel}</span>
        {info}
      </label>
    );
  }
  const text = typeof wert === 'string' ? wert : '';
  // einzeilige Felder können durch FORMAs Zeilenumbruch trotzdem mehrere Zeilen enthalten
  const einzeilig = feld.einzeilig && !text.includes('\n');
  return (
    <label className={klasse} title={hinweis} style={breite}>
      {!ohneBeschriftung && (
        <span className="field-label">
          {titel}
          {info}
        </span>
      )}
      {ohneBeschriftung && info}
      {einzeilig ? (
        <input
          type="text"
          value={text}
          disabled={gesperrt}
          aria-label={titel}
          data-feld={feld.schluessel}
          onChange={(e) => wertSetzen(feld, e.target.value)}
          onBlur={() => useFormulare.getState().feldVerlassen(feld)}
        />
      ) : (
        <textarea
          value={text}
          disabled={gesperrt}
          aria-label={titel}
          data-feld={feld.schluessel}
          rows={Math.max(2, Math.min(12, text.split('\n').length + 1, Math.round(feld.kasten.h / 18)))}
          onChange={(e) => wertSetzen(feld, e.target.value)}
          onBlur={() => useFormulare.getState().feldVerlassen(feld)}
        />
      )}
    </label>
  );
}
