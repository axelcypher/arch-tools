/**
 * Gemeinsames Menü aller Apps: Kontextmenü (Rechtsklick, Kontextmenütaste) und Aufklappmenü am Knopf, mit Untermenüs.
 * Tastatur: ↑/↓, Pos1/Ende, → bzw. Enter öffnet ein Untermenü, ← zurück; Esc schließt (über den gemeinsamen
 * Esc-Stapel – ein Dialog darunter bleibt offen), Tab schließt und gibt den Fokus an den Auslöser zurück.
 * `MenueHost` steckt in der Titelleiste (jede App) und in der Rahmen-App. Vorlage: PERMIO (Menue.tsx).
 */
import type { KeyboardEvent as ReactKeyboardEvent, MouseEvent as ReactMouseEvent, ReactNode } from 'react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { create } from 'zustand';
import type { SymbolName } from './Symbol';
import { Symbol } from './Symbol';
import { useEscSchliessen } from './Dialog';

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
  /** `ausloeser`: Element, das das Menü geöffnet hat – bekommt den Fokus nach Esc, Tab oder einer Auswahl zurück */
  offen: { x: number; y: number; punkte: MenuePunkt[]; ausloeser: HTMLElement | null; name?: string } | null;
  zeigen: (x: number, y: number, punkte: MenuePunkt[], ausloeser?: HTMLElement | null, name?: string) => void;
  /** `fokusZurueck`: den Fokus an den Auslöser geben (nicht bei einem Klick daneben – dann gilt, was angeklickt wurde) */
  schliessen: (fokusZurueck?: boolean) => void;
}

const useMenue = create<MenueZustand>((set, get) => ({
  offen: null,
  zeigen: (x, y, punkte, ausloeser = null, name) => set({ offen: { x, y, punkte, ausloeser, name } }),
  schliessen: (fokusZurueck = false) => {
    const ausloeser = get().offen?.ausloeser;
    set({ offen: null });
    if (fokusZurueck && ausloeser?.isConnected) ausloeser.focus();
  },
}));

const FOKUSSIERBAR = 'button, input, select, textarea, a[href], [tabindex]';

/** Kontextmenü an der Mausposition zeigen (Rechtsklick bzw. Kontextmenütaste); `name` benennt das Menü (aria-label) */
export function zeigeMenue(e: ReactMouseEvent | MouseEvent, punkte: MenuePunkt[], name?: string) {
  e.preventDefault();
  e.stopPropagation();
  const ziel = e.currentTarget instanceof HTMLElement && e.currentTarget.matches(FOKUSSIERBAR) ? e.currentTarget : document.activeElement instanceof HTMLElement ? document.activeElement : null;
  // Kontextmenütaste (Umschalt+F10): ohne Mausposition – das Menü erscheint dann am Auslöser
  let { clientX: x, clientY: y } = e;
  if (x === 0 && y === 0 && e.currentTarget instanceof HTMLElement) {
    const r = e.currentTarget.getBoundingClientRect();
    x = r.left + 8;
    y = r.top + Math.min(r.height, 24);
  }
  if (punkte.length) useMenue.getState().zeigen(x, y, punkte, ziel, name);
}

/** Menü unter einem Element zeigen (Knopf mit Pfeil) */
export function zeigeMenueAn(el: HTMLElement, punkte: MenuePunkt[], name?: string) {
  const r = el.getBoundingClientRect();
  useMenue.getState().zeigen(r.left, r.bottom + 2, punkte, el, name ?? el.getAttribute('aria-label') ?? el.textContent?.trim() ?? undefined);
}

/** Knopf, der ein Menü aufklappt */
export function MenueKnopf({
  punkte,
  children,
  title,
  ariaLabel,
  className,
  disabled = false,
  name,
}: {
  punkte: () => MenuePunkt[];
  children: ReactNode;
  title?: string;
  /** Name für Screenreader, wenn der Knopf keinen (vollständigen) Text hat */
  ariaLabel?: string;
  className?: string;
  disabled?: boolean;
  /** Name des Menüs (Vorgabe: aria-label bzw. Text des Knopfs) */
  name?: string;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  const offen = useMenue((s) => !!s.offen && !!ref.current && s.offen.ausloeser === ref.current);
  return (
    <button
      ref={ref}
      className={className}
      title={title}
      aria-label={ariaLabel}
      aria-haspopup="menu"
      aria-expanded={offen}
      disabled={disabled}
      onClick={(e) => zeigeMenueAn(e.currentTarget, punkte(), name)}
    >
      {children} <Symbol name="pfeilUnten" />
    </button>
  );
}

/** Stelle für das offene Menü – einmal in der App */
export function MenueHost() {
  const offen = useMenue((s) => s.offen);
  const schliessen = useMenue((s) => s.schliessen);
  // Esc schließt nur das Menü (oberster Eintrag im Esc-Stapel), nicht zugleich einen Dialog darunter
  useEscSchliessen(() => schliessen(true), !!offen);
  useEffect(() => {
    if (!offen) return;
    const weg = (e: Event) => {
      if (e instanceof KeyboardEvent) {
        // Tab schließt; der Fokus geht an den Auslöser zurück (Tab wandert von dort weiter). Esc: siehe oben
        if (e.key === 'Tab') schliessen(true);
        return;
      }
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
  return <Liste punkte={offen.punkte} x={offen.x} y={offen.y} name={offen.name} schliessen={() => schliessen(true)} wurzel />;
}

/**
 * Eine Menüliste. Tastatur: ↑/↓ wandern, Enter bzw. → öffnet ein Untermenü und setzt den Fokus hinein, ← bzw. Esc führt
 * aus dem Untermenü zurück zu seinem Punkt; Esc und Tab im Hauptmenü schließen es, der Fokus geht an den Auslöser zurück.
 * Tasten eines Untermenüs gehen nicht an das Menü darüber.
 */
function Liste({
  punkte,
  x,
  y,
  schliessen,
  wurzel = false,
  fokus = false,
  zurueck,
  name,
}: {
  punkte: MenuePunkt[];
  /** Name des Menüs für Screenreader (Untermenü: Text des Punkts darüber) */
  name?: string;
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
    if (wurzel || fokus) (ref.current?.querySelector<HTMLButtonElement>(':scope > button:not([aria-disabled="true"])') ?? ref.current?.querySelector<HTMLButtonElement>(':scope > button'))?.focus();
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

  const tasten = (e: ReactKeyboardEvent) => {
    // gesperrte Punkte bleiben erreichbar (aria-disabled): ihr Grund im Hinweis soll vorgelesen werden
    const knoepfe = [...(ref.current?.querySelectorAll<HTMLButtonElement>(':scope > button') ?? [])];
    const aktiv = document.activeElement as HTMLButtonElement;
    const i = knoepfe.indexOf(aktiv);
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      e.stopPropagation();
      knoepfe[(i + (e.key === 'ArrowDown' ? 1 : -1) + knoepfe.length) % knoepfe.length]?.focus();
    } else if (e.key === 'Home' || e.key === 'End') {
      e.preventDefault();
      e.stopPropagation();
      (e.key === 'Home' ? knoepfe[0] : knoepfe[knoepfe.length - 1])?.focus();
    } else if (e.key === 'ArrowRight' && i >= 0) {
      const index = Number(aktiv.dataset.index);
      const p = punkte[index];
      if (p && !p.trenner && p.unter && !p.deaktiviert) {
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
    <div ref={ref} className="menue" role="menu" aria-label={name} style={{ left: lage.x, top: lage.y }} onKeyDown={tasten} onContextMenu={(e) => e.preventDefault()}>
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
            aria-disabled={p.deaktiviert || undefined}
            aria-haspopup={p.unter ? 'menu' : undefined}
            aria-expanded={p.unter ? unter?.index === i : undefined}
            onMouseEnter={(e) => {
              // gesperrt: sein Untermenü bleibt zu
              if (p.unter && !p.deaktiviert) oeffnen(i, e.currentTarget, false);
              else setUnter(null);
            }}
            onClick={(e) => {
              if (p.deaktiviert) return;
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
          name={(punkte[unter.index] as { text: string }).text}
        />
      )}
    </div>
  );
}
