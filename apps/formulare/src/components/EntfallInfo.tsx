import type { CSSProperties } from 'react';
import { useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useAntrag } from '../antragStore';
import type { Entfall } from '../entfall';
import { entfallGruende, entfallQuellen, entfallText } from '../entfall';
import { abschnitte } from '../forma/felder';
import { formularKontext, leeresProfil, profilSchluessel } from '../profil';
import type { OffenesFormular } from '../store';
import { useProfil, wertVon } from '../store';
import { useGesetz } from './GesetzModal';
import { Symbol } from './Symbol';

/**
 * Entfallende Felder des offenen Formulars mit ihren Gründen (Schlüssel → Gründe) und dem Hinweistext dazu.
 */
export function useEntfallen(offen: OffenesFormular): { gruende: Map<string, Entfall[]>; text: (schluessel: string) => string } {
  const roh = useProfil(profilSchluessel(offen.formular, offen.name));
  const merkmale = useAntrag((s) => s.projektdatei?.merkmale);
  return useMemo(() => {
    const gruende = new Map<string, Entfall[]>();
    const p = { ...leeresProfil(), ...roh };
    const felder = offen.felder.flat();
    if (roh) {
      const k = formularKontext(merkmale ?? {}, felder, (f) => wertVon(offen, f));
      for (const seite of offen.felder)
        for (const a of abschnitte(seite))
          for (const f of a.felder) {
            const e = entfallGruende(f, a, p, k);
            if (e.length) gruende.set(f.schluessel, e);
          }
    }
    const texte = new Map<string, string>();
    const text = (s: string) => {
      if (!texte.has(s)) texte.set(s, gruende.has(s) ? entfallText(gruende.get(s)!, felder, p, merkmale ?? {}) : '');
      return texte.get(s)!;
    };
    return { gruende, text };
  }, [roh, merkmale, offen]);
}

/**
 * Info-Symbol an einem entfallenden Feld: Zeigen nennt den Grund, ein Klick öffnet die Rechtsgrundlage (wenn die
 * Vorgabe eine nennt) im Gesetzes-Fenster.
 */
export function EntfallInfo({ gruende, text, className = '', style }: { gruende: Entfall[]; text: string; className?: string; style?: CSSProperties }) {
  const quellen = entfallQuellen(gruende);
  const knopf = useRef<HTMLButtonElement>(null);
  const [lage, setLage] = useState<DOMRect | null>(null);
  const zeigen = () => setLage(knopf.current?.getBoundingClientRect() ?? null);
  const verbergen = () => setLage(null);
  return (
    <>
      <button
        ref={knopf}
        type="button"
        className={`fo-entfall-info${quellen.length ? ' mit-quelle' : ''} ${className}`}
        style={style}
        aria-label={text}
        tabIndex={-1}
        onPointerEnter={zeigen}
        onPointerLeave={verbergen}
        onFocus={zeigen}
        onBlur={verbergen}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
          verbergen();
          if (quellen.length) useGesetz.getState().oeffnen(quellen);
        }}
      >
        <Symbol name="info" />
      </button>
      {lage && <Tipp lage={lage} text={text} />}
    </>
  );
}

/** Hinweis neben dem Symbol – außerhalb des Blatts, damit ihn der Rand des Formulars nicht abschneidet */
function Tipp({ lage, text }: { lage: DOMRect; text: string }) {
  const breite = 340;
  const links = Math.max(8, Math.min(lage.left, window.innerWidth - breite - 8));
  const unten = lage.bottom + 6;
  const style: CSSProperties = unten + 160 > window.innerHeight ? { left: links, bottom: window.innerHeight - lage.top + 6, maxWidth: breite } : { left: links, top: unten, maxWidth: breite };
  return createPortal(
    <div className="fo-tipp" role="tooltip" style={style}>
      {text}
    </div>,
    document.body,
  );
}
