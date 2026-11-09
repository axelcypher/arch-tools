import type { CSSProperties } from 'react';
import { useMemo } from 'react';
import { bezeichner, eigenschaft, text, zahl } from '../forma/dfm';
import type { Feld, Kasten } from '../forma/felder';
import { kaesten, ohneKuerzel } from '../forma/felder';
import type { OffenesFormular } from '../store';
import { useFormulare, wertVon } from '../store';

/**
 * Originalgetreue Ansicht: jede Seite so gezeichnet, wie FORMA sie anzeigt – aus den Positionen in der Datei.
 * Textfelder und Kästchen sind dieselben Eingaben wie in der Feldansicht.
 */
export function SeitenAnsicht({ offen, gesperrt }: { offen: OffenesFormular; gesperrt: boolean }) {
  const seiten = useMemo(
    () =>
      offen.formular.seiten.map((s, i) => {
        const k = kaesten(s);
        return {
          i,
          kaesten: k,
          breite: Math.max(...k.map((x) => x.x + x.b), 100) + 8,
          hoehe: Math.max(...k.map((x) => x.y + x.h), 100) + 8,
          felder: new Map(offen.felder[i].map((f) => [f.name, f])),
        };
      }),
    [offen.formular, offen.felder],
  );

  return (
    <div className="fo-seiten">
      {seiten.map((s) => (
        <section key={s.i} className="fo-seite-rahmen">
          <h2>Seite {s.i + 1}</h2>
          <div className="fo-seite" style={{ width: s.breite, height: s.hoehe }}>
            {s.kaesten.map((k, n) => (
              <Element key={n} k={k} feld={s.felder.get(k.o.name)} offen={offen} gesperrt={gesperrt} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function schrift(k: Kasten): CSSProperties {
  const hoehe = zahl(k.o, 'Font.Height');
  const stil = eigenschaft(k.o, 'Font.Style')?.wert;
  const name = text(k.o, 'Font.Name');
  return {
    fontSize: hoehe ? Math.abs(hoehe) : undefined,
    fontWeight: stil?.art === 'menge' && stil.elemente.includes('fsBold') ? 700 : undefined,
    fontStyle: stil?.art === 'menge' && stil.elemente.includes('fsItalic') ? 'italic' : undefined,
    fontFamily: name ? `'${name}', sans-serif` : undefined,
  };
}

const AUSRICHTUNG: Record<string, CSSProperties['textAlign']> = { taRightJustify: 'right', taCenter: 'center' };
const LINIE: Record<string, CSSProperties> = {
  bsBottomLine: { borderBottom: '1px solid var(--border)' },
  bsTopLine: { borderTop: '1px solid var(--border)' },
  bsLeftLine: { borderLeft: '1px solid var(--border)' },
  bsRightLine: { borderRight: '1px solid var(--border)' },
  bsSpacer: {},
};

function Element({ k, feld, offen, gesperrt }: { k: Kasten; feld: Feld | undefined; offen: OffenesFormular; gesperrt: boolean }) {
  const wertSetzen = useFormulare((s) => s.wertSetzen);
  const lage: CSSProperties = { left: k.x, top: k.y, width: k.b, height: k.h };
  const caption = ohneKuerzel(text(k.o, 'Caption') ?? '');

  switch (k.o.klasse) {
    case 'TPanel':
      return <div className="fo-el fo-panel" style={lage} />;
    case 'TBevel':
      return <div className="fo-el" style={{ ...lage, ...(LINIE[bezeichner(k.o, 'Shape') ?? ''] ?? { border: '1px solid var(--border)' }) }} />;
    case 'TLabel':
    case 'TExtendedLabel': {
      const fest = bezeichner(k.o, 'AutoSize') === 'False';
      const winkel = zahl(k.o, 'Angle') ?? 0;
      const style: CSSProperties = {
        ...lage,
        ...schrift(k),
        textAlign: AUSRICHTUNG[bezeichner(k.o, 'Alignment') ?? ''],
        whiteSpace: fest || bezeichner(k.o, 'WordWrap') === 'True' ? 'pre-wrap' : 'pre',
        ...(winkel ? { writingMode: 'vertical-rl', transform: winkel === 90 ? 'rotate(180deg)' : undefined } : {}),
      };
      return (
        <div className="fo-el fo-label" style={style}>
          {caption}
        </div>
      );
    }
    case 'TMemo': {
      if (!feld) return null;
      const w = wertVon(offen, feld);
      const geaendert = feld.schluessel in offen.aenderungen;
      return (
        <textarea
          className={`fo-el fo-memo${geaendert ? ' geaendert' : ''}`}
          style={{ ...lage, ...schrift(k) }}
          value={typeof w === 'string' ? w : ''}
          disabled={gesperrt}
          title={feld.beschriftung}
          aria-label={feld.beschriftung}
          spellCheck={false}
          // wie in FORMA: in einzeiligen Feldern (WantReturns = False) erzeugt Enter keinen Zeilenumbruch
          onKeyDown={(e) => feld.einzeilig && e.key === 'Enter' && e.preventDefault()}
          onChange={(e) => wertSetzen(feld, e.target.value)}
        />
      );
    }
    case 'TCheckBox': {
      if (!feld) return null;
      const geaendert = feld.schluessel in offen.aenderungen;
      return (
        <label className={`fo-el fo-check${geaendert ? ' geaendert' : ''}`} style={{ ...lage, ...schrift(k) }} title={feld.beschriftung}>
          <input type="checkbox" checked={wertVon(offen, feld) === true} disabled={gesperrt} aria-label={feld.beschriftung} onChange={(e) => wertSetzen(feld, e.target.checked)} />
          {caption && <span>{caption}</span>}
        </label>
      );
    }
    case 'TImage':
      return (
        <div className="fo-el fo-bild" style={lage}>
          Bild
        </div>
      );
    case 'TBitBtn':
    case 'TButton':
      return (
        <button className="fo-el fo-knopf" style={{ ...lage, ...schrift(k) }} disabled title="Schaltfläche aus FORMA (hier ohne Funktion)">
          {caption}
        </button>
      );
    default:
      return null;
  }
}
