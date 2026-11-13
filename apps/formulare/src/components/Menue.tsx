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
      /** Tooltip – z. B. der volle Text, wenn er gekürzt werden kann */
      titel?: string;
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
export function MenueKnopf({
  punkte,
  children,
  title,
  className,
  disabled = false,
}: {
  punkte: () => MenuePunkt[];
  children: ReactNode;
  title?: string;
  className?: string;
  disabled?: boolean;
}) {
  return (
    <button className={className} title={title} aria-haspopup="menu" disabled={disabled} onClick={(e) => zeigeMenueAn(e.currentTarget, punkte())}>
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

/**
 * Eine Menüliste. Tastatur: ↑/↓ wandern, Enter bzw. → öffnet ein Untermenü und setzt den Fokus hinein, ← bzw. Esc führt
 * aus dem Untermenü zurück zu seinem Punkt (Esc im Hauptmenü schließt). Tasten eines Untermenüs gehen nicht an das
 * Menü darüber.
 */
function Liste({
  punkte,
  x,
  y,
  schliessen,
  wurzel = false,
  fokus = false,
  zurueck,
}: {
  punkte: MenuePunkt[];
  x: number;
  y: number;
  schliessen: () => void;
  wurzel?: boolean;
  /** beim Öffnen den ersten Punkt fokussieren (Untermenü per Tastatur geöffnet) */
  fokus?: boolean;
  /** Untermenü: zurück zum Punkt im Menü darüber */
  zurueck?: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [lage, setLage] = useState({ x, y });
  const [unter, setUnter] = useState<{ index: number; x: number; y: number; tastatur: boolean } | null>(null);

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
    if (wurzel || fokus) ref.current?.querySelector<HTMLButtonElement>(':scope > button:not(:disabled)')?.focus();
  }, [wurzel, fokus]);

  const oeffnen = (index: number, el: HTMLElement, tastatur: boolean) => {
    const r = el.getBoundingClientRect();
    setUnter({ index, x: r.right - 2, y: r.top - 4, tastatur });
  };
  // aus dem Untermenü zurück: es schließt, der Fokus kommt auf seinen Punkt
  const unterZurueck = () => {
    const index = unter?.index;
    setUnter(null);
    ref.current?.querySelector<HTMLButtonElement>(`:scope > button[data-index="${index}"]`)?.focus();
  };

  const tasten = (e: React.KeyboardEvent) => {
    const knoepfe = [...(ref.current?.querySelectorAll<HTMLButtonElement>(':scope > button:not(:disabled)') ?? [])];
    const aktiv = document.activeElement as HTMLButtonElement;
    const i = knoepfe.indexOf(aktiv);
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      e.stopPropagation();
      knoepfe[(i + (e.key === 'ArrowDown' ? 1 : -1) + knoepfe.length) % knoepfe.length]?.focus();
    } else if (e.key === 'ArrowRight' && i >= 0) {
      const index = Number(aktiv.dataset.index);
      const p = punkte[index];
      if (p && !p.trenner && p.unter) {
        e.preventDefault();
        e.stopPropagation();
        oeffnen(index, aktiv, true);
      }
    } else if ((e.key === 'ArrowLeft' || e.key === 'Escape') && !wurzel) {
      e.preventDefault();
      e.stopPropagation();
      zurueck?.();
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
            data-index={i}
            title={p.titel}
            disabled={p.deaktiviert}
            aria-haspopup={p.unter ? 'menu' : undefined}
            aria-expanded={p.unter ? unter?.index === i : undefined}
            onMouseEnter={(e) => {
              if (p.unter) oeffnen(i, e.currentTarget, false);
              else setUnter(null);
            }}
            onClick={(e) => {
              if (p.unter) {
                // per Tastatur (Enter/Leertaste – ohne Mausklick, detail 0): der Fokus geht ins Untermenü
                oeffnen(i, e.currentTarget, e.detail === 0);
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
        <Liste
          key={`${unter.index}|${unter.tastatur}`}
          punkte={(punkte[unter.index] as { unter: MenuePunkt[] }).unter}
          x={unter.x}
          y={unter.y}
          schliessen={schliessen}
          fokus={unter.tastatur}
          zurueck={unterZurueck}
        />
      )}
    </div>
  );
}
