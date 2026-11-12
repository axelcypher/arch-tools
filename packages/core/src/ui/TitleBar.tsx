import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { isTauri } from '../platform/files';
import { andocken, anRahmenMelden, rahmenModus, speichernAnfragenBeantworten } from '../platform/rahmen';
import { getEntries, logger, logVersion, subscribe } from '../platform/log';
import { useTheme } from '../platform/theme';
import type { ThemeWahl } from '../platform/theme';
import { UpdateKnopf } from './UpdateKnopf';
import type { RegelApp } from '../regeln/regelwerk';
import { Nachschlagewerk, useHilfe } from './Nachschlagewerk';
import { dialogVerhaltenEinrichten } from './dialoge';
import { aenderungenSpeichern, bestaetigen, RueckfrageHost } from './Rueckfrage';
import { useBuero } from './DruckKopf';

const log = logger('fenster');

type AppWindow = import('@tauri-apps/api/window').Window;

/**
 * Eigene Titelleiste (die Windows-Titelleiste ist ausgeblendet, decorations: false):
 * Ziehen zum Verschieben, Doppelklick maximiert, rechts Version/Update, Schema, Protokoll und Fensterknöpfe.
 * Im Browser ohne Update- und Fensterknöpfe.
 */
export interface TitleBarProps {
  /** Name der Anwendung, z. B. „Flächenrechner“ */
  app: string;
  /** Name des geöffneten Projekts */
  name: string;
  /** ungespeicherte Änderungen */
  dirty: boolean;
  onOpenLog: () => void;
  /** Nachschlagewerk der Berechnungsregeln dieser App anbieten */
  regeln?: RegelApp;
  /** Knopf „Projekte“: die gemeinsame Projektübersicht öffnen */
  onProjekte?: () => void;
  /** die App hat eine Zeichenfläche: Option „Zeichenfläche abdunkeln“ im Farbmenü anbieten (Standard ja) */
  zeichenflaeche?: boolean;
  /** Speichern vor dem Beenden („Änderungen speichern?“); liefert false, wenn nicht gespeichert wurde */
  onSpeichern?: () => Promise<boolean | void>;
}

export function TitleBar({ app, name, dirty, onOpenLog, regeln, onProjekte, zeichenflaeche = true, onSpeichern }: TitleBarProps) {
  // in der Rahmen-App: als Tab ohne eigene Fensterknöpfe, herausgelöst mit „Andocken“; Updates macht der Rahmen
  const rahmen = rahmenModus();
  const desktop = isTauri() && rahmen !== 'tab';
  const ziehen = rahmen === 'tab' ? {} : { 'data-tauri-drag-region': true };

  // im Tab: Name und ungespeicherte Änderungen an den Rahmen melden (Tab-Beschriftung, Rückfrage beim Schließen)
  useEffect(() => anRahmenMelden(app, name, dirty), [app, name, dirty]);
  // im Tab: „Speichern“ aus der Rückfrage des Rahmens beim Schließen
  const speichernRef = useRef(onSpeichern);
  speichernRef.current = onSpeichern;
  useEffect(() => speichernAnfragenBeantworten(onSpeichern ? () => speichernRef.current!() : undefined), [!!onSpeichern]); // eslint-disable-line react-hooks/exhaustive-deps
  const [win, setWin] = useState<AppWindow | null>(null);
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    if (!desktop) return;
    let off: (() => void) | undefined;
    let alive = true;
    void import('@tauri-apps/api/window').then(async ({ getCurrentWindow }) => {
      const w = getCurrentWindow();
      if (!alive) return;
      setWin(w);
      setMaximized(await w.isMaximized());
      off = await w.onResized(async () => setMaximized(await w.isMaximized()));
    });
    return () => {
      alive = false;
      off?.();
    };
  }, [desktop]);

  // Büroname für Druck- und Excel-Köpfe einmal lesen
  useBuero();

  // Dialoge: aria-modal, Fokus hinein und zurück, Tab bleibt im Dialog (einmal je App)
  useEffect(() => dialogVerhaltenEinrichten(), []);

  // F1: Nachschlagewerk
  useEffect(() => {
    if (!regeln) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'F1') return;
      e.preventDefault();
      useHilfe.getState().oeffnen();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [regeln]);

  // Fehler seit dem letzten Öffnen des Protokolls
  const version = useSyncExternalStore(subscribe, logVersion);
  const [seen, setSeen] = useState(0);
  const errors = getEntries().filter((e) => e.level === 'error' && e.id > seen).length;
  void version;

  const close = async () => {
    if (dirty) {
      const weiter = onSpeichern
        ? await aenderungenSpeichern(name, onSpeichern, 'Vor dem Beenden speichern?')
        : await bestaetigen('Ungespeicherte Änderungen verwerfen?', 'Die Änderungen gehen beim Beenden verloren.', 'Verwerfen und beenden', true);
      if (!weiter) return;
    }
    log.info('Fenster wird geschlossen');
    await win?.close();
  };

  return (
    <>
      <header className={`titlebar${rahmen === 'tab' ? ' titlebar-im-rahmen' : ''}`} {...ziehen}>
        <img className="titlebar-icon" src="./favicon.svg" alt="" {...ziehen} />
        <span className="titlebar-app" {...ziehen}>
          {app}
        </span>
        {onProjekte && (
          <button className="titlebar-btn titlebar-projekte" title="Projektübersicht – Projekt aus den Projektordnern öffnen" onClick={onProjekte}>
            Projekte
          </button>
        )}
        <span className="titlebar-sep" {...ziehen}>
          ·
        </span>
        <span className="titlebar-project" {...ziehen} title={name}>
          {name}
          {dirty && <span className="titlebar-dirty" title="Ungespeicherte Änderungen"> ●</span>}
        </span>
        <span className="titlebar-drag" {...ziehen} />
        {desktop && !rahmen && <UpdateKnopf app={app} dirty={dirty} />}
        <ThemeMenu zeichenflaeche={zeichenflaeche} />
        {regeln && (
          <button className="titlebar-btn" title="Berechnungsregeln nachschlagen – mit Quellen und Suche (F1)" onClick={() => useHilfe.getState().oeffnen()}>
            <span aria-hidden>§</span> Regeln
          </button>
        )}
        {regeln && <Nachschlagewerk app={regeln} />}
        <button
          className="titlebar-btn"
          title="Protokoll (Fehlersuche)"
          onClick={() => {
            setSeen(getEntries().at(-1)?.id ?? 0);
            onOpenLog();
          }}
        >
          <span aria-hidden>≡</span> Fehlerprotokoll
          {errors > 0 && <span className="titlebar-badge">{errors}</span>}
        </button>
        {rahmen === 'fenster' && isTauri() && (
          <button className="titlebar-btn" title="Wieder als Tab in das Hauptfenster" onClick={() => void andocken().catch((e) => log.error('Andocken fehlgeschlagen', e))}>
            Andocken
          </button>
        )}
        {desktop && win && (
          <div className="window-controls">
            <button className="wc-btn" title="Minimieren" aria-label="Minimieren" onClick={() => void win.minimize()}>
              <svg viewBox="0 0 10 10" aria-hidden>
                <path d="M0 5.5h10" />
              </svg>
            </button>
            <button className="wc-btn" title={maximized ? 'Verkleinern' : 'Maximieren'} aria-label="Maximieren" onClick={() => void win.toggleMaximize()}>
              {maximized ? (
                <svg viewBox="0 0 10 10" aria-hidden>
                  <path d="M2.5 0.5h7v7M0.5 2.5h7v7h-7z" />
                </svg>
              ) : (
                <svg viewBox="0 0 10 10" aria-hidden>
                  <path d="M0.5 0.5h9v9h-9z" />
                </svg>
              )}
            </button>
            <button className="wc-btn wc-close" title="Schließen" aria-label="Schließen" onClick={() => void close()}>
              <svg viewBox="0 0 10 10" aria-hidden>
                <path d="M0.5 0.5l9 9M9.5 0.5l-9 9" />
              </svg>
            </button>
          </div>
        )}
      </header>
      <RueckfrageHost />
    </>
  );
}

const WAHL: { id: ThemeWahl; label: string }[] = [
  { id: 'system', label: 'wie System' },
  { id: 'hell', label: 'Hell' },
  { id: 'dunkel', label: 'Dunkel' },
];

/** Symbol des Farbschemas als SVG in 16 px (Glyphen wie ◐ fallen je nach Schrift winzig aus) */
function SchemaSymbol({ id }: { id: ThemeWahl }) {
  const p = { width: 16, height: 16, viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, 'aria-hidden': true } as const;
  if (id === 'hell')
    return (
      <svg {...p}>
        <circle cx="8" cy="8" r="3" />
        <path d="M8 1.5v1.8M8 12.7v1.8M1.5 8h1.8M12.7 8h1.8M3.4 3.4l1.3 1.3M11.3 11.3l1.3 1.3M3.4 12.6l1.3-1.3M11.3 4.7l1.3-1.3" strokeLinecap="round" />
      </svg>
    );
  if (id === 'dunkel')
    return (
      <svg {...p}>
        <path d="M13 9.6A5.5 5.5 0 0 1 6.4 3a5.5 5.5 0 1 0 6.6 6.6z" strokeLinejoin="round" />
      </svg>
    );
  return (
    <svg {...p}>
      <circle cx="8" cy="8" r="5.5" />
      <path d="M8 2.5a5.5 5.5 0 0 1 0 11z" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function ThemeMenu({ zeichenflaeche = true }: { zeichenflaeche?: boolean }) {
  const { wahl, setWahl, canvasDunkel, setCanvasDunkel } = useTheme();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [open]);

  const cur = WAHL.find((w) => w.id === wahl) ?? WAHL[0];
  const knopf = useRef<HTMLButtonElement>(null);
  // Fokus beim Öffnen auf die gewählte Option; Esc schließt und gibt den Fokus zurück, ↑/↓ bewegen, Tab hinaus schließt
  useEffect(() => {
    if (open) ref.current?.querySelector<HTMLElement>('[role="menuitemradio"][aria-checked="true"]')?.focus();
  }, [open]);
  const taste = (e: React.KeyboardEvent) => {
    if (!open) return;
    if (e.key === 'Escape') {
      e.stopPropagation();
      setOpen(false);
      knopf.current?.focus();
    }
    // Pos1/Ende springen an Anfang und Ende – nur außerhalb eines Eingabefelds, dort bewegen sie die Schreibmarke
    const imFeld = document.activeElement instanceof HTMLInputElement;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || ((e.key === 'Home' || e.key === 'End') && !imFeld)) {
      const el = [...(ref.current?.querySelectorAll<HTMLElement>('[role="menuitemradio"], .titlebar-dropdown input') ?? [])];
      if (!el.length) return;
      const i = el.indexOf(document.activeElement as HTMLElement);
      const ziel = e.key === 'Home' ? 0 : e.key === 'End' ? el.length - 1 : (i + (e.key === 'ArrowDown' ? 1 : el.length - 1)) % el.length;
      el[ziel]?.focus();
      e.preventDefault();
    }
  };
  return (
    <div
      className="titlebar-menu"
      ref={ref}
      onKeyDown={taste}
      onBlur={(e) => {
        if (open && !ref.current?.contains(e.relatedTarget as Node | null)) setOpen(false);
      }}
    >
      <button ref={knopf} className="titlebar-btn titlebar-schema" title={`Farbschema: ${cur.label}`} aria-label={`Farbschema: ${cur.label}`} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)}>
        <SchemaSymbol id={cur.id} />
      </button>
      {open && (
        <div className="titlebar-dropdown" role="menu" aria-label="Farbschema">
          <div className="titlebar-dropdown-head">Farbschema</div>
          {WAHL.map((w) => (
            <button
              key={w.id}
              role="menuitemradio"
              tabIndex={-1}
              aria-checked={wahl === w.id}
              className={wahl === w.id ? 'active' : ''}
              onClick={() => {
                setWahl(w.id);
                setOpen(false);
                // Menü schließt: Fokus zurück auf den Knopf (sonst fiele er auf die Seite)
                setTimeout(() => knopf.current?.focus(), 0);
              }}
            >
              <span className="tb-icon">
                <SchemaSymbol id={w.id} />
              </span>{' '}
              {w.label}
            </button>
          ))}
          {zeichenflaeche && (
            <label className="toggle block">
              <input type="checkbox" checked={canvasDunkel} onChange={(e) => setCanvasDunkel(e.target.checked)} />
              Zeichenfläche im dunklen Schema abdunkeln
            </label>
          )}
        </div>
      )}
    </div>
  );
}
