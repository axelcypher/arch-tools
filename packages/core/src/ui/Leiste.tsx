import type { ReactNode } from 'react';
import { useState } from 'react';
import { zeigerZiehen } from './ziehen';

/**
 * Seitenleisten mit veränderbarer Breite: Breite je Leiste gemerkt (lokal je Benutzer), Ziehgriff am Rand zur
 * Arbeitsfläche – rechts bei einer linken Leiste, links bei einer rechten (`seite="rechts"`). Doppelklick: Vorgabe;
 * Tastatur ←/→ in 16-px-Schritten, die Pfeile bewegen den Griff in ihre Richtung.
 */

const lesen = (schluessel: string, vorgabe: number, min: number, max: number) => {
  try {
    const n = Number(localStorage.getItem(schluessel));
    return Number.isFinite(n) && n > 0 ? Math.min(max, Math.max(min, n)) : vorgabe;
  } catch {
    return vorgabe;
  }
};

/** Gemerkte Breite einer Leiste */
export function useLeistenBreite(schluessel: string, vorgabe: number, min = 180, max = 560): [number, (b: number) => void] {
  const [breite, setBreiteRoh] = useState(() => lesen(schluessel, vorgabe, min, max));
  const setBreite = (b: number) => {
    const n = Math.round(Math.min(max, Math.max(min, b)));
    setBreiteRoh(n);
    try {
      localStorage.setItem(schluessel, String(n));
    } catch {
      // nur für diese Sitzung
    }
  };
  return [breite, setBreite];
}

/** Ziehgriff am Rand einer Leiste (das Elternelement braucht `position: relative`); `seite`: wo die Leiste steht */
export function Ziehgriff({
  breite,
  setBreite,
  vorgabe,
  titel = 'Breite ändern',
  seite = 'links',
  min,
  max,
}: {
  breite: number;
  setBreite: (b: number) => void;
  vorgabe?: number;
  titel?: string;
  seite?: 'links' | 'rechts';
  /** Grenzen der Breite (für Screenreader) */
  min?: number;
  max?: number;
}) {
  // rechte Leiste: Griff am linken Rand, nach links ziehen macht sie breiter
  const richtung = seite === 'rechts' ? -1 : 1;
  return (
    <div
      className={`leiste-griff${seite === 'rechts' ? ' leiste-griff-links' : ''}`}
      role="separator"
      aria-orientation="vertical"
      aria-label={titel}
      aria-valuenow={breite}
      aria-valuemin={min}
      aria-valuemax={max}
      tabIndex={0}
      title={`${titel} – ziehen${vorgabe ? ', Doppelklick: Vorgabe' : ''}`}
      onPointerDown={(e) => {
        e.preventDefault();
        const x0 = e.clientX;
        const b0 = breite;
        zeigerZiehen(e, { schwelle: 0, bewegen: (ev) => setBreite(b0 + richtung * (ev.clientX - x0)), ende: () => undefined });
      }}
      onDoubleClick={() => vorgabe && setBreite(vorgabe)}
      onKeyDown={(e) => {
        if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
          e.preventDefault();
          setBreite(breite + richtung * (e.key === 'ArrowLeft' ? -16 : 16));
        }
      }}
    />
  );
}

/** Seitenleiste mit gemerkter, ziehbarer Breite um beliebigen Inhalt */
export function BreitenLeiste({
  schluessel,
  vorgabe,
  min,
  max,
  className = '',
  seite = 'links',
  children,
}: {
  schluessel: string;
  vorgabe: number;
  min?: number;
  max?: number;
  className?: string;
  /** links (Griff rechts, Vorgabe) oder rechts neben der Arbeitsfläche (Griff links) */
  seite?: 'links' | 'rechts';
  children: ReactNode;
}) {
  const [breite, setBreite] = useLeistenBreite(schluessel, vorgabe, min, max);
  return (
    <div className={`leiste ${className}`} style={{ width: breite }}>
      {children}
      <Ziehgriff breite={breite} setBreite={setBreite} vorgabe={vorgabe} seite={seite} min={min ?? 180} max={max ?? 560} />
    </div>
  );
}
