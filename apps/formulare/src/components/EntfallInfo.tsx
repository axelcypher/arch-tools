import type { CSSProperties } from 'react';
import { useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useMerkmalWerte } from '../merkmalWerte';
import type { Entfall } from '../entfall';
import { fehlendeMerkmale } from '../bedingung';
import { entfallGruende, entfallQuellen, entfallText, offenGruende } from '../entfall';
import { abschnitte } from '../forma/felder';
import { formularKontext, leeresProfil, profilSchluessel } from '../profil';
import type { OffenesFormular } from '../store';
import { useProfil, wertVon } from '../store';
import { useGesetz } from './GesetzModal';
import { Symbol } from './Symbol';

export interface Entfallen {
  /** entfallende Felder mit ihren Gründen (Schlüssel → Gründe) */
  gruende: Map<string, Entfall[]>;
  /** offene Felder (hängen an nicht festgelegten Projektmerkmalen) mit ihren Gründen */
  offen: Map<string, Entfall[]>;
  /** Hinweistext zu einem entfallenden oder offenen Feld */
  text: (schluessel: string) => string;
  /** Werte der Projektmerkmale (für die Auswahl fehlender am offenen Feld) */
  merkmale: Record<string, string>;
}

/**
 * Entfallende und offene Felder des offenen Formulars mit ihren Gründen und dem Hinweistext dazu.
 */
export function useEntfallen(offen: OffenesFormular): Entfallen {
  const roh = useProfil(profilSchluessel(offen.formular, offen.name));
  const merkmale = useMerkmalWerte(offen);
  return useMemo(() => {
    const gruende = new Map<string, Entfall[]>();
    const offene = new Map<string, Entfall[]>();
    const p = { ...leeresProfil(), ...roh };
    const felder = offen.felder.flat();
    if (roh) {
      const k = formularKontext(merkmale, felder, (f) => wertVon(offen, f));
      for (const seite of offen.felder)
        for (const a of abschnitte(seite))
          for (const f of a.felder) {
            const e = entfallGruende(f, a, p, k);
            if (e.length) gruende.set(f.schluessel, e);
            else {
              const o = offenGruende(f, a, p, k);
              if (o.length) offene.set(f.schluessel, o);
            }
          }
    }
    const texte = new Map<string, string>();
    const text = (s: string) => {
      if (!texte.has(s)) texte.set(s, gruende.has(s) ? entfallText(gruende.get(s)!, felder, p, merkmale) : offene.has(s) ? entfallText(offene.get(s)!, felder, p, merkmale, 'offen') : '');
      return texte.get(s)!;
    };
    return { gruende, offen: offene, text, merkmale };
  }, [roh, merkmale, offen]);
}

/**
 * Info-Symbol an einem entfallenden oder offenen Feld: Zeigen nennt den Grund, ein Klick öffnet die Rechtsgrundlage
 * (wenn die Vorgabe eine nennt) im Gesetzes-Fenster.
 */
export function EntfallInfo({
  gruende,
  text,
  offen = false,
  merkmale,
  className = '',
  style,
}: {
  gruende: Entfall[];
  text: string;
  offen?: boolean;
  /** offenes Feld: Werte der Projektmerkmale – die fehlenden lassen sich im Fenster festlegen */
  merkmale?: Record<string, string>;
  className?: string;
  style?: CSSProperties;
}) {
  const quellen = entfallQuellen(gruende);
  const fehlend = offen && merkmale ? [...new Set(gruende.flatMap((e) => fehlendeMerkmale(e.bedingung, merkmale)))] : [];
  const knopf = useRef<HTMLButtonElement>(null);
  const [lage, setLage] = useState<DOMRect | null>(null);
  const zeigen = () => setLage(knopf.current?.getBoundingClientRect() ?? null);
  const verbergen = () => setLage(null);
  return (
    <>
      <button
        ref={knopf}
        type="button"
        className={`fo-entfall-info${quellen.length || fehlend.length ? ' mit-quelle' : ''}${offen ? ' offen' : ''} ${className}`}
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
          if (quellen.length || fehlend.length) useGesetz.getState().oeffnen(quellen, fehlend);
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
