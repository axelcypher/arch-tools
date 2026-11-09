import { useMemo, useState } from 'react';
import type { Feld } from '../forma/felder';
import { abschnitte } from '../forma/felder';
import { seitenTitel } from '../forma/formular';
import type { OffenesFormular } from '../store';
import { useFormulare, wertVon } from '../store';

/** Aufgeräumte Ansicht: alle Felder nach Seiten und Abschnitten, durchsuchbar */
export function FelderAnsicht({ offen, gesperrt }: { offen: OffenesFormular; gesperrt: boolean }) {
  const [suche, setSuche] = useState('');
  const q = suche.trim().toLowerCase();

  const seiten = useMemo(
    () =>
      offen.felder.map((felder, i) => {
        const passend = q
          ? felder.filter((f) => {
              const w = wertVon(offen, f);
              return `${f.abschnitt} ${f.beschriftung} ${typeof w === 'string' ? w : ''}`.toLowerCase().includes(q);
            })
          : felder;
        return { i, titel: seitenTitel(offen.formular.seiten[i]) ?? `Seite ${i + 1}`, abschnitte: abschnitte(passend) };
      }),
    [offen, q],
  );

  return (
    <div className="fo-felder">
      <input type="search" className="fo-feldsuche" placeholder="Felder durchsuchen (Beschriftung oder Inhalt) …" value={suche} onChange={(e) => setSuche(e.target.value)} />
      {seiten.map((s) => (
        <section key={s.i} className="fo-seite-felder">
          <h2>Seite {s.i + 1}</h2>
          {!s.abschnitte.length && <p className="muted small-text">{q ? 'Keine passenden Felder.' : 'Auf dieser Seite gibt es keine Felder.'}</p>}
          {s.abschnitte.map((a, n) => (
            <div key={n} className="fo-abschnitt">
              {a.titel && <h3>{a.titel}</h3>}
              {a.felder.map((f, j) => (
                <FeldEingabe key={f.schluessel} feld={f} offen={offen} gesperrt={gesperrt} ohneBeschriftung={j === 0 && f.beschriftung === a.titel && f.art === 'text'} />
              ))}
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}

function FeldEingabe({ feld, offen, gesperrt, ohneBeschriftung }: { feld: Feld; offen: OffenesFormular; gesperrt: boolean; ohneBeschriftung: boolean }) {
  const wertSetzen = useFormulare((s) => s.wertSetzen);
  const wert = wertVon(offen, feld);
  const geaendert = feld.schluessel in offen.aenderungen;
  const klasse = `fo-feld${geaendert ? ' geaendert' : ''}`;

  if (feld.art === 'kreuz') {
    return (
      <label className={`${klasse} fo-kreuz`} title={feld.hinweis}>
        <input type="checkbox" checked={wert === true} disabled={gesperrt} onChange={(e) => wertSetzen(feld, e.target.checked)} />
        <span>{feld.beschriftung}</span>
      </label>
    );
  }
  const text = typeof wert === 'string' ? wert : '';
  // einzeilige Felder können durch FORMAs Zeilenumbruch trotzdem mehrere Zeilen enthalten
  const einzeilig = feld.einzeilig && !text.includes('\n');
  return (
    <label className={klasse} title={feld.hinweis}>
      {!ohneBeschriftung && <span className="field-label">{feld.beschriftung}</span>}
      {einzeilig ? (
        <input type="text" value={text} disabled={gesperrt} aria-label={feld.beschriftung} onChange={(e) => wertSetzen(feld, e.target.value)} />
      ) : (
        <textarea
          value={text}
          disabled={gesperrt}
          aria-label={feld.beschriftung}
          rows={Math.max(2, Math.min(12, text.split('\n').length + 1, Math.round(feld.kasten.h / 18)))}
          onChange={(e) => wertSetzen(feld, e.target.value)}
        />
      )}
    </label>
  );
}
