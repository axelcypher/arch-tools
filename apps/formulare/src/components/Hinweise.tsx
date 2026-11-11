import type { CSSProperties } from 'react';
import { useMemo, useRef, useState } from 'react';
import { useMerkmalWerte } from '../merkmalWerte';
import type { Plausi } from '../plausibel';
import { plausibilitaet } from '../plausibel';
import { formularKontext, leeresProfil, profilSchluessel } from '../profil';
import type { OffenesFormular } from '../store';
import { useProfil, wertVon } from '../store';
import { PRUEFREGELN } from '../vorgaben/pruefregeln';
import { Tipp } from './EntfallInfo';
import { useGesetz } from './GesetzModal';
import { Symbol } from './Symbol';

/** Plausibilitätsmeldungen des offenen Formulars (U-04, U-05) */
export function usePlausibel(offen: OffenesFormular): Plausi[] {
  const schluessel = profilSchluessel(offen.formular, offen.name);
  const roh = useProfil(schluessel);
  const merkmale = useMerkmalWerte(offen);
  return useMemo(() => {
    const wert = (f: Parameters<typeof wertVon>[1]) => wertVon(offen, f);
    return plausibilitaet(offen.felder, { ...leeresProfil(), ...roh }, formularKontext(merkmale, offen.felder.flat(), wert), wert, PRUEFREGELN[schluessel]);
  }, [offen, roh, merkmale, schluessel]);
}

/**
 * Symbol am Feld für Plausibilitätsmeldungen: gelb (Hinweis) bzw. rot umrandet (Widerspruch); Zeigen oder Fokus nennt
 * die Meldung, ein Klick öffnet eine Rechtsgrundlage, wenn es eine gibt.
 */
export function HinweisSymbol({ hinweise, className = '', style, info }: { hinweise: Plausi[]; className?: string; style?: CSSProperties; info?: string }) {
  const knopf = useRef<HTMLButtonElement>(null);
  const [lage, setLage] = useState<DOMRect | null>(null);
  const text = hinweise.map((h) => `${h.art === 'fehler' ? 'Widerspruch' : 'Hinweis'}: ${h.text}`).join('\n');
  const quellen = hinweise.flatMap((h) => h.quellen ?? []);
  const zeigen = () => setLage(knopf.current?.getBoundingClientRect() ?? null);
  const verbergen = () => setLage(null);
  return (
    <>
      <button
        ref={knopf}
        type="button"
        className={`fo-entfall-info hinweis${hinweise.some((h) => h.art === 'fehler') ? ' fehler' : ''} ${className}`}
        style={style}
        aria-label={text}
        data-info={info}
        onPointerEnter={zeigen}
        onPointerLeave={verbergen}
        onFocus={zeigen}
        onBlur={verbergen}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
          if (quellen.length) {
            verbergen();
            useGesetz.getState().oeffnen(quellen);
          }
        }}
      >
        <Symbol name="info" />
      </button>
      {lage && <Tipp lage={lage} text={text} />}
    </>
  );
}

/** Meldungen je Feld (ein Feld kann mehrere haben) */
export function hinweiseJeFeld(liste: Plausi[]): Map<string, Plausi[]> {
  const out = new Map<string, Plausi[]>();
  for (const h of liste) for (const f of h.felder) out.set(f, [...(out.get(f) ?? []), h]);
  return out;
}
