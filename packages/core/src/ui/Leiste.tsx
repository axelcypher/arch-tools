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

/** Ziehgriff am rechten Rand einer Leiste (das Elternelement braucht `position: relative`) */
export function Ziehgriff({ breite, setBreite, vorgabe, titel = 'Breite ändern' }: { breite: number; setBreite: (b: number) => void; vorgabe?: number; titel?: string }) {
  return (
    <div
      className="leiste-griff"
      role="separator"
      aria-orientation="vertical"
      aria-label={titel}
      aria-valuenow={breite}
      tabIndex={0}
      title={`${titel} – ziehen${vorgabe ? ', Doppelklick: Vorgabe' : ''}`}
      onPointerDown={(e) => {
        e.preventDefault();
        const x0 = e.clientX;
        const b0 = breite;
        zeigerZiehen(e, { schwelle: 0, bewegen: (ev) => setBreite(b0 + ev.clientX - x0), ende: () => undefined });
      }}
      onDoubleClick={() => vorgabe && setBreite(vorgabe)}
      onKeyDown={(e) => {
        if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
          e.preventDefault();
          setBreite(breite + (e.key === 'ArrowLeft' ? -16 : 16));
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
  children,
}: {
  schluessel: string;
  vorgabe: number;
  min?: number;
  max?: number;
  className?: string;
  children: ReactNode;
}) {
  const [breite, setBreite] = useLeistenBreite(schluessel, vorgabe, min, max);
  return (
    <div className={`leiste ${className}`} style={{ width: breite }}>
      {children}
      <Ziehgriff breite={breite} setBreite={setBreite} vorgabe={vorgabe} />
    </div>
  );
}
