/**
 * Gemeinsames Menü aller Apps: Kontextmenü (Rechtsklick, Kontextmenütaste) und Aufklappmenü am Knopf, mit Untermenüs.
 * Tastatur: ↑/↓, Pos1/Ende, → bzw. Enter öffnet ein Untermenü, ← zurück; Esc schließt (über den gemeinsamen
 * Esc-Stapel – ein Dialog darunter bleibt offen), Tab schließt und gibt den Fokus an den Auslöser zurück.
 * `MenueHost` steckt in der Titelleiste (jede App) und in der Rahmen-App. Richtlinie: docs/design.md, „Menüs“.
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
      /** Bild statt Symbol (z. B. das Symbol einer App), 16px */
      bild?: string;
      /** rechts daneben, z. B. der Grund, warum der Punkt gesperrt ist */
      hinweis?: string;
      /** Tastenkürzel, wie es angezeigt wird (z. B. „Strg+C“, „Entf“); steht rechts und wird als aria-keyshortcuts vorgelesen */
      tasten?: string;
      /** Umschalter mit Haken: `true`/`false` macht den Punkt zu einem Kästchen (menuitemcheckbox), angehakt bei `true` */
      haken?: boolean;
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
  /** `oeffner`: am Auslöser aufgeklappt (`zeigeMenueAn`), nicht nur dorthin der Fokus zurück (Kontextmenü) */
  offen: { x: number; y: number; punkte: MenuePunkt[]; ausloeser: HTMLElement | SVGElement | null; name?: string; oeffner: boolean; nr: number } | null;
  zeigen: (x: number, y: number, punkte: MenuePunkt[], ausloeser?: HTMLElement | SVGElement | null, name?: string, oeffner?: boolean) => void;
  /** `fokusZurueck`: den Fokus an den Auslöser geben (nicht bei einem Klick daneben – dann gilt, was angeklickt wurde) */
  schliessen: (fokusZurueck?: boolean) => void;
}

type Offen = NonNullable<MenueZustand['offen']>;

/**
 * Öffner (`zeigeMenueAn`) mit `aria-haspopup="menu"` bekommen den Offen-Zustand (`aria-expanded`) auch ohne `MenueKnopf`, z. B. der
 * Zeilenknopf „⋯“. Wer das Attribut selbst über React setzt (wie `MenueKnopf` oder mit `useMenueOffen`), setzt denselben
 * Wert.
 */
function offenZeigen(o: Offen | null | undefined, offen: boolean) {
  const el = o?.oeffner ? o.ausloeser : null;
  if (el?.getAttribute('aria-haspopup') === 'menu') el.setAttribute('aria-expanded', String(offen));
}

/**
 * Druck auf den Öffner eines offenen Menüs schließt es; der zugehörige Klick öffnet es dann nicht wieder. Der Merker gilt
 * nur bis zu diesem Klick – kommt keiner (Zeiger weggezogen), verwirft ihn der nächste Druck oder Tastendruck.
 */
let geradeZu: { el: Element } | null = null;
function zweitklickMerken(el: Element) {
  const merker = { el };
  geradeZu = merker;
  const verwerfen = () => {
    if (geradeZu === merker) geradeZu = null;
    window.removeEventListener('click', nachKlick, true);
    window.removeEventListener('pointerdown', verwerfen, true);
    window.removeEventListener('keydown', verwerfen, true);
  };
  // nach dem Klick (der Knopf hat ihn dann schon gesehen) verwerfen
  const nachKlick = () => setTimeout(verwerfen);
  window.addEventListener('click', nachKlick, true);
  window.addEventListener('pointerdown', verwerfen, true);
  window.addEventListener('keydown', verwerfen, true);
}

const useMenue = create<MenueZustand>((set, get) => ({
  offen: null,
  zeigen: (x, y, punkte, ausloeser = null, name, oeffner = false) => {
    const vorher = get().offen;
    if (vorher && vorher.ausloeser !== ausloeser) offenZeigen(vorher, false);
    // nr: jedes Öffnen baut das Menü neu auf (Erstfokus, kein Untermenü von vorher)
    const offen = { x, y, punkte, ausloeser, name, oeffner, nr: (vorher?.nr ?? 0) + 1 };
    set({ offen });
    offenZeigen(offen, true);
  },
  schliessen: (fokusZurueck = false) => {
    const vorher = get().offen;
    const ausloeser = vorher?.ausloeser;
    set({ offen: null });
    offenZeigen(vorher, false);
    if (fokusZurueck && ausloeser?.isConnected) ausloeser.focus();
  },
}));

/** ob das Menü gerade an diesem Element offen ist – für `aria-expanded` an eigenen Auslösern */
export function useMenueOffen(ref: { readonly current: Element | null }): boolean {
  return useMenue((s) => !!s.offen?.oeffner && !!ref.current && s.offen.ausloeser === ref.current);
}

const TASTEN_ARIA: Record<string, string> = {
  strg: 'Control',
  umschalt: 'Shift',
  shift: 'Shift',
  alt: 'Alt',
  entf: 'Delete',
  einfg: 'Insert',
  pos1: 'Home',
  ende: 'End',
  esc: 'Escape',
  enter: 'Enter',
  eingabe: 'Enter',
  leertaste: 'Space',
  rücktaste: 'Backspace',
  tab: 'Tab',
  leer: 'Space',
  'bild↑': 'PageUp',
  'bild↓': 'PageDown',
  'bild auf': 'PageUp',
  'bild ab': 'PageDown',
  '↑': 'ArrowUp',
  '↓': 'ArrowDown',
  '←': 'ArrowLeft',
  '→': 'ArrowRight',
  '+': 'Plus',
};

/**
 * Angezeigtes Tastenkürzel → Wert für `aria-keyshortcuts` („Strg+Umschalt+Z“ → „Control+Shift+Z“). Mehrere Kürzel
 * mit „/“ (nicht direkt nach „+“) oder „, “ getrennt werden zu Alternativen (durch Leerzeichen getrennt).
 */
export function tastenAria(tasten: string): string {
  return (
    tasten
      // Alternativen an „/“, das nicht direkt auf „+“ folgt, und an „, “ – „Strg+/“ und „Strg+,“ bleiben ein Kürzel
      .split(/(?<!\+\s*)\s*\/\s*|,\s+/)
      .filter(Boolean)
      .map((kuerzel) =>
        // „Strg++“: das letzte Plus ist die Taste selbst
        (kuerzel.match(/\+$|[^+]+/g) ?? [])
          .map((t) => t.trim())
          .filter(Boolean)
          // unbekannte Namen ohne Leerzeichen: das Leerzeichen trennt in aria-keyshortcuts Alternativen
          .map((t) => TASTEN_ARIA[t.toLowerCase().replace(/\s+/g, ' ')] ?? (t.length === 1 ? t.toUpperCase() : t.replace(/\s+/g, '')))
          .join('+'),
      )
      .join(' ')
  );
}

const FOKUSSIERBAR = 'button, input, select, textarea, a[href], [tabindex]';

/** Kontextmenü an der Mausposition zeigen (Rechtsklick bzw. Kontextmenütaste); `name` benennt das Menü (aria-label) */
export function zeigeMenue(e: ReactMouseEvent | MouseEvent, punkte: MenuePunkt[], name?: string) {
  e.preventDefault();
  e.stopPropagation();
  // auch SVG-Auslöser (z. B. eine fokussierbare Zeichenfläche): Fokus kehrt nach Esc bzw. Auswahl dorthin zurück
  const aktuell = e.currentTarget instanceof HTMLElement || e.currentTarget instanceof SVGElement ? e.currentTarget : null;
  const aktiv = document.activeElement instanceof HTMLElement || document.activeElement instanceof SVGElement ? document.activeElement : null;
  const ziel = aktuell?.matches(FOKUSSIERBAR) ? aktuell : aktiv;
  // Kontextmenütaste (Umschalt+F10): ohne Mausposition – das Menü erscheint dann am Auslöser
  let { clientX: x, clientY: y } = e;
  if (x === 0 && y === 0 && aktuell) {
    const r = aktuell.getBoundingClientRect();
    x = r.left + 8;
    y = r.top + Math.min(r.height, 24);
  }
  if (punkte.length) useMenue.getState().zeigen(x, y, punkte, ziel, name);
}

/** Menü unter einem Element zeigen (Knopf mit Pfeil) */
export function zeigeMenueAn(el: HTMLElement, punkte: MenuePunkt[], name?: string) {
  // zweiter Klick auf den Auslöser eines offenen Menüs: Das Menü hat sich beim Drücken geschlossen und bleibt zu
  const zu = geradeZu;
  geradeZu = null;
  if (zu?.el === el) return;
  const r = el.getBoundingClientRect();
  // leerer Name (Knopf nur mit Symbol) zählt nicht: weiter zum nächsten
  useMenue.getState().zeigen(r.left, r.bottom + 2, punkte, el, name || el.getAttribute('aria-label') || el.textContent?.trim() || undefined, true);
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
  const offen = useMenueOffen(ref);
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
      if (e.type === 'pointerdown') {
        const ziel = e.target as Node | null;
        if ((ziel as Element | null)?.closest?.('.menue')) return;
        // Druck auf den Öffner: schließen und merken, damit der Klick danach das Menü nicht gleich wieder öffnet
        // (nicht beim Kontextmenü – dessen Fokusziel kann ein fremder Knopf sein, der dann sein eigenes Menü öffnen soll)
        const o = useMenue.getState().offen;
        if (o?.oeffner && o.ausloeser && ziel && o.ausloeser.contains(ziel)) zweitklickMerken(o.ausloeser);
      }
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
  return <Liste key={offen.nr} punkte={offen.punkte} x={offen.x} y={offen.y} name={offen.name} schliessen={() => schliessen(true)} wurzel />;
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
    if (!(wurzel || fokus)) return;
    // Erstfokus nie auf einem Gefahr-Punkt (sonst löscht Rechtsklick plus Enter): erster bedienbarer, ungefährlicher Punkt;
    // gibt es nur Gefahr-Punkte, bekommt das Menü selbst den Fokus – ↓ bzw. Pos1 erreichen dann den Punkt
    const el = ref.current;
    (el?.querySelector<HTMLButtonElement>(':scope > button:not([aria-disabled="true"]):not(.gefahr)') ?? el?.querySelector<HTMLButtonElement>(':scope > button:not(.gefahr)') ?? el)?.focus();
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
      // Fokus auf dem Menü selbst (i = −1): ↓ zum ersten, ↑ zum letzten Punkt
      const ziel = i < 0 ? (e.key === 'ArrowDown' ? 0 : knoepfe.length - 1) : (i + (e.key === 'ArrowDown' ? 1 : -1) + knoepfe.length) % knoepfe.length;
      knoepfe[ziel]?.focus();
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
    <div ref={ref} className="menue" role="menu" aria-label={name} tabIndex={-1} style={{ left: lage.x, top: lage.y }} onKeyDown={tasten} onContextMenu={(e) => e.preventDefault()}>
      {punkte.map((p, i) =>
        p.trenner ? (
          <div key={i} className="menue-trenner" role="separator" />
        ) : (
          <button
            key={i}
            role={p.haken === undefined ? 'menuitem' : 'menuitemcheckbox'}
            aria-checked={p.haken === undefined ? undefined : p.haken}
            aria-keyshortcuts={p.tasten ? tastenAria(p.tasten) : undefined}
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
            <span className="menue-symbol">
              {p.haken !== undefined ? p.haken && <Symbol name="haken" /> : p.bild ? <img src={p.bild} alt="" width={16} height={16} /> : p.symbol && <Symbol name={p.symbol} />}
            </span>
            <span className="menue-text">{p.text}</span>
            {p.hinweis && <span className="menue-hinweis">{p.hinweis}</span>}
            {p.tasten && (
              <span className="menue-hinweis menue-tasten" aria-hidden="true">
                {p.tasten}
              </span>
            )}
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
