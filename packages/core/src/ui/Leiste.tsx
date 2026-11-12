import type { ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';
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
/**
 * Platz, den eine Leiste höchstens bekommen kann: Breite des Arbeitsbereichs minus die anderen Leisten minus die
 * Mindestbreite der Mitte. Ohne `mitteMin` keine Grenze.
 */
function verfuegbar(griff: HTMLElement | null, mitteMin: number | undefined): number {
  const leiste = griff?.parentElement;
  const arbeit = leiste?.parentElement;
  if (!leiste || !arbeit || mitteMin === undefined) return Infinity;
  // die anderen Leisten mit ihrer Basisbreite (gesetzte Breite), nicht der geschrumpften – sonst wüchse diese auf
  // deren Kosten über den Platz hinaus
  const andere = [...arbeit.children]
    .filter((c): c is HTMLElement => c !== leiste && c.classList.contains('leiste') && c instanceof HTMLElement)
    .reduce((s, c) => s + (parseFloat(c.style.width) || c.getBoundingClientRect().width), 0);
  return Math.floor(arbeit.clientWidth - andere - mitteMin);
}

export function Ziehgriff({ breite, setBreite, vorgabe, titel = 'Breite ändern', min, max, links = false, ist, mitteMin }: { breite: number; setBreite: (b: number) => void; vorgabe?: number; titel?: string; min?: number; max?: number; links?: boolean; ist?: number; mitteMin?: number }) {
  const richtung = links ? -1 : 1;
  const griff = useRef<HTMLDivElement>(null);
  // nie breiter als der verfügbare Platz (die Mitte behält ihre Mindestbreite) – sonst entstünde eine tote Zone
  // Wachsen nur bis zum verfügbaren Platz; geht es nicht weiter, bleibt alles, wie es ist (Ende oder → am Maximum
  // verkleinern nichts). Ist die Leiste schon geschrumpft (gezeichnet schmaler als gesetzt), fehlt der Platz ohnehin.
  // Schrumpfen frei bis min, von der gezeichneten Breite aus.
  const setzen = (b: number) => {
    if (b <= jetzt) return setBreite(b);
    if (jetzt < breite - 1) return;
    const ziel = Math.min(b, Math.max(min ?? 0, verfuegbar(griff.current, mitteMin)));
    if (ziel > jetzt) setBreite(ziel);
  };
  // die tatsächliche Breite (eine Leiste kann bei schmalen Fenstern schrumpfen): für Screenreader und als Ausgangspunkt
  // beim Ziehen – sonst gäbe es eine tote Zone zwischen gemerkter und sichtbarer Breite
  const jetzt = ist ?? breite;
  return (
    <div
      ref={griff}
      className={`leiste-griff${links ? ' leiste-griff-links' : ''}`}
      role="separator"
      aria-orientation="vertical"
      aria-label={titel}
      aria-valuenow={jetzt}
      {...(min !== undefined ? { 'aria-valuemin': Math.min(min, jetzt) } : {})}
      {...(max !== undefined ? { 'aria-valuemax': Math.max(jetzt, Math.min(max, verfuegbar(griff.current, mitteMin))) } : {})}
      aria-valuetext={`${jetzt} Pixel`}
      tabIndex={0}
      title={`${titel} – ziehen${vorgabe ? ', Doppelklick: Vorgabe' : ''}`}
      onPointerDown={(e) => {
        e.preventDefault();
        const x0 = e.clientX;
        const b0 = jetzt;
        zeigerZiehen(e, { schwelle: 0, bewegen: (ev) => setzen(b0 + richtung * (ev.clientX - x0)), ende: () => undefined });
      }}
      onDoubleClick={() => vorgabe && setBreite(vorgabe)}
      onKeyDown={(e) => {
        if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
          e.preventDefault();
          setzen(jetzt + richtung * (e.key === 'ArrowLeft' ? -16 : 16));
        }
        if (e.key === 'Home' && min !== undefined) {
          e.preventDefault();
          setBreite(min);
        }
        if (e.key === 'End' && max !== undefined) {
          e.preventDefault();
          setzen(max);
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
  titel,
  mitteMin,
  children,
}: {
  /** Name des Griffs („Breite der Angaben“) – mehrere Leisten sind so unterscheidbar */
  titel?: string;
  /** Mindestbreite, die der Mitte bleibt: Ziehen und Tastatur gehen nicht darüber hinaus */
  mitteMin?: number;
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
  // tatsächliche Breite messen (die Leiste darf per CSS schrumpfen)
  const rahmen = useRef<HTMLDivElement>(null);
  const [ist, setIst] = useState<number | undefined>(undefined);
  // neu messen, wenn sich die Leiste, der Arbeitsbereich oder eine andere Leiste ändert (für aria-valuemax)
  const [, setTakt] = useState(0);
  useEffect(() => {
    const el = rahmen.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => {
      setIst(Math.round(el.getBoundingClientRect().width));
      setTakt((t) => t + 1);
    });
    ro.observe(el);
    if (el.parentElement) {
      ro.observe(el.parentElement);
      for (const c of el.parentElement.children) if (c !== el && c.classList.contains('leiste')) ro.observe(c);
    }
    return () => ro.disconnect();
  }, []);
  return (
    <div ref={rahmen} className={`leiste ${className}`} style={{ width: breite }}>
      {children}
      <Ziehgriff breite={breite} setBreite={setBreite} vorgabe={vorgabe} min={min ?? 180} max={max ?? 560} links={griffLinks} ist={ist || undefined} titel={titel} mitteMin={mitteMin} />
    </div>
  );
}
