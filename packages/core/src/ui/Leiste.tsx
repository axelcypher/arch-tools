import type { ReactNode } from 'react';
import { useState } from 'react';
import { zeigerZiehen } from './ziehen';

/**
 * Seitenleisten mit veränderbarer Breite: Breite je Leiste gemerkt (lokal je Benutzer), Ziehgriff am rechten Rand
 * (Doppelklick: Vorgabe), mit der Tastatur ←/→ in 16-px-Schritten.
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

/**
 * Ziehgriff am Rand einer Leiste (das Elternelement braucht `position: relative`): rechts für Leisten am linken
 * Fensterrand, links für Leisten am rechten Rand (Ziehen nach links macht sie breiter). Tastatur: ←/→ in 16-px-Schritten,
 * Pos1/Ende auf Mindest- bzw. Höchstbreite.
 */
export function Ziehgriff({ breite, setBreite, vorgabe, titel = 'Breite ändern', min, max, links = false }: { breite: number; setBreite: (b: number) => void; vorgabe?: number; titel?: string; min?: number; max?: number; links?: boolean }) {
  const richtung = links ? -1 : 1;
  return (
    <div
      className={`leiste-griff${links ? ' leiste-griff-links' : ''}`}
      role="separator"
      aria-orientation="vertical"
      aria-label={titel}
      aria-valuenow={breite}
      {...(min !== undefined ? { 'aria-valuemin': min } : {})}
      {...(max !== undefined ? { 'aria-valuemax': max } : {})}
      aria-valuetext={`${breite} Pixel`}
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
        if (e.key === 'Home' && min !== undefined) {
          e.preventDefault();
          setBreite(min);
        }
        if (e.key === 'End' && max !== undefined) {
          e.preventDefault();
          setBreite(max);
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
  griffLinks = false,
  children,
}: {
  schluessel: string;
  vorgabe: number;
  min?: number;
  max?: number;
  className?: string;
  /** Leiste am rechten Fensterrand: Griff links */
  griffLinks?: boolean;
  children: ReactNode;
}) {
  const [breite, setBreite] = useLeistenBreite(schluessel, vorgabe, min, max);
  return (
    <div className={`leiste ${className}`} style={{ width: breite }}>
      {children}
      <Ziehgriff breite={breite} setBreite={setBreite} vorgabe={vorgabe} min={min ?? 180} max={max ?? 560} links={griffLinks} />
    </div>
  );
}
