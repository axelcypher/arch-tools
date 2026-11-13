import type { ReactNode } from 'react';
import { useLeistenBreite } from '@core/ui/Leiste';
import { zeigerZiehen } from '@core/ui/ziehen';

/**
 * Rechte Seitenleiste mit gemerkter, ziehbarer Breite. Wie `BreitenLeiste` aus core, nur mit dem Griff am linken
 * Rand: Ziehen nach links verbreitert, ←/→ in 16-px-Schritten, Doppelklick stellt die Vorgabe her.
 */
export function RechteLeiste({ schluessel, vorgabe, min, max, children }: { schluessel: string; vorgabe: number; min?: number; max?: number; children: ReactNode }) {
  const [breite, setBreite] = useLeistenBreite(schluessel, vorgabe, min, max);
  return (
    <div className="leiste" style={{ width: breite }}>
      {children}
      <div
        className="leiste-griff ef-griff-links"
        role="separator"
        aria-orientation="vertical"
        aria-label="Breite der rechten Leiste ändern"
        aria-valuenow={breite}
        tabIndex={0}
        title="Breite ändern – ziehen, Doppelklick: Vorgabe"
        onPointerDown={(e) => {
          e.preventDefault();
          const x0 = e.clientX;
          const b0 = breite;
          zeigerZiehen(e, { schwelle: 0, bewegen: (ev) => setBreite(b0 - (ev.clientX - x0)), ende: () => undefined });
        }}
        onDoubleClick={() => setBreite(vorgabe)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
            e.preventDefault();
            setBreite(breite + (e.key === 'ArrowLeft' ? 16 : -16));
          }
        }}
      />
    </div>
  );
}
