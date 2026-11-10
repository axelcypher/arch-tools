import type { MouseEvent as ReactMouseEvent, ReactNode } from 'react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { create } from 'zustand';
import type { SymbolName } from './Symbol';
import { Symbol } from './Symbol';

/** Eintrag eines Menüs: Befehl, Untermenü oder Trennlinie */
export type MenuePunkt =
  | { trenner: true }
  | {
      trenner?: false;
      text: string;
      symbol?: SymbolName;
      /** rechts daneben, z. B. ein Tastenkürzel */
      hinweis?: string;
      aktion?: () => void;
      deaktiviert?: boolean;
      /** rot (Löschen) */
      gefahr?: boolean;
      unter?: MenuePunkt[];
    };

interface MenueZustand {
  offen: { x: number; y: number; punkte: MenuePunkt[] } | null;
  zeigen: (x: number, y: number, punkte: MenuePunkt[]) => void;
  schliessen: () => void;
}

const useMenue = create<MenueZustand>((set) => ({
  offen: null,
  zeigen: (x, y, punkte) => set({ offen: { x, y, punkte } }),
  schliessen: () => set({ offen: null }),
}));

/** Kontextmenü an der Mausposition zeigen (Rechtsklick) */
export function zeigeMenue(e: ReactMouseEvent | MouseEvent, punkte: MenuePunkt[]) {
  e.preventDefault();
  e.stopPropagation();
  if (punkte.length) useMenue.getState().zeigen(e.clientX, e.clientY, punkte);
}

/** Menü unter einem Element zeigen (Knopf mit Pfeil) */
export function zeigeMenueAn(el: HTMLElement, punkte: MenuePunkt[]) {
  const r = el.getBoundingClientRect();
  useMenue.getState().zeigen(r.left, r.bottom + 2, punkte);
}

/** Knopf, der ein Menü aufklappt */
export function MenueKnopf({ punkte, children, title, className }: { punkte: () => MenuePunkt[]; children: ReactNode; title?: string; className?: string }) {
  return (
    <button className={className} title={title} aria-haspopup="menu" onClick={(e) => zeigeMenueAn(e.currentTarget, punkte())}>
      {children} <Symbol name="pfeilUnten" />
    </button>
  );
}

/** Stelle für das offene Menü – einmal in der App */
export function MenueHost() {
  const offen = useMenue((s) => s.offen);
  const schliessen = useMenue((s) => s.schliessen);
  useEffect(() => {
    if (!offen) return;
    const weg = (e: Event) => {
      if (e instanceof KeyboardEvent && e.key !== 'Escape') return;
      if (e.type === 'pointerdown' && (e.target as Element | null)?.closest?.('.menue')) return;
      schliessen();
    };
    window.addEventListener('pointerdown', weg, true);
    window.addEventListener('keydown', weg);
    window.addEventListener('blur', weg);
    window.addEventListener('resize', weg);
    return () => {
      window.removeEventListener('pointerdown', weg, true);
      window.removeEventListener('keydown', weg);
      window.removeEventListener('blur', weg);
      window.removeEventListener('resize', weg);
    };
  }, [offen, schliessen]);
  if (!offen) return null;
  return <Liste punkte={offen.punkte} x={offen.x} y={offen.y} schliessen={schliessen} wurzel />;
}

function Liste({ punkte, x, y, schliessen, wurzel = false }: { punkte: MenuePunkt[]; x: number; y: number; schliessen: () => void; wurzel?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const [lage, setLage] = useState({ x, y });
  const [unter, setUnter] = useState<{ index: number; x: number; y: number } | null>(null);

  // im Fenster halten
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const b = window.innerWidth || 1000;
    const h = window.innerHeight || 800;
    setLage({ x: Math.max(4, Math.min(x, b - r.width - 4)), y: Math.max(4, Math.min(y, h - r.height - 4)) });
  }, [x, y]);

  useEffect(() => {
    if (wurzel) ref.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
  }, [wurzel]);

  const tasten = (e: React.KeyboardEvent) => {
    const knoepfe = [...(ref.current?.querySelectorAll<HTMLButtonElement>(':scope > button:not(:disabled)') ?? [])];
    const i = knoepfe.indexOf(document.activeElement as HTMLButtonElement);
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      knoepfe[(i + (e.key === 'ArrowDown' ? 1 : -1) + knoepfe.length) % knoepfe.length]?.focus();
    }
  };

  return (
    <div ref={ref} className="menue" role="menu" style={{ left: lage.x, top: lage.y }} onKeyDown={tasten} onContextMenu={(e) => e.preventDefault()}>
      {punkte.map((p, i) =>
        p.trenner ? (
          <div key={i} className="menue-trenner" role="separator" />
        ) : (
          <button
            key={i}
            role="menuitem"
            className={`menue-punkt${p.gefahr ? ' gefahr' : ''}${unter?.index === i ? ' offen' : ''}`}
            disabled={p.deaktiviert}
            aria-haspopup={p.unter ? 'menu' : undefined}
            onMouseEnter={(e) => {
              const r = e.currentTarget.getBoundingClientRect();
              setUnter(p.unter ? { index: i, x: r.right - 2, y: r.top - 4 } : null);
            }}
            onClick={(e) => {
              if (p.unter) {
                const r = e.currentTarget.getBoundingClientRect();
                setUnter({ index: i, x: r.right - 2, y: r.top - 4 });
                return;
              }
              schliessen();
              p.aktion?.();
            }}
          >
            <span className="menue-symbol">{p.symbol && <Symbol name={p.symbol} />}</span>
            <span className="menue-text">{p.text}</span>
            {p.hinweis && <span className="menue-hinweis">{p.hinweis}</span>}
            {p.unter && <Symbol name="pfeilRechts" />}
          </button>
        ),
      )}
      {unter && (punkte[unter.index] as { unter?: MenuePunkt[] }).unter && (
        <Liste punkte={(punkte[unter.index] as { unter: MenuePunkt[] }).unter} x={unter.x} y={unter.y} schliessen={schliessen} />
      )}
    </div>
  );
}
