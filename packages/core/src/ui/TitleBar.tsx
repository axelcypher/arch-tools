import { useEffect, useId, useRef, useState, useSyncExternalStore } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import { appNameSetzen } from './appName';
import { isTauri } from '../platform/files';
import { andocken, anRahmenMelden, rahmenModus, speichernAnfragenBeantworten } from '../platform/rahmen';
import { getEntries, logger, logVersion, subscribe } from '../platform/log';
import { useTheme } from '../platform/theme';
import type { ThemeWahl } from '../platform/theme';
import { UpdateKnopf } from './UpdateKnopf';
import type { RegelApp } from '../regeln/regelwerk';
import { Nachschlagewerk, useHilfe } from './Nachschlagewerk';
import { dialogVerhaltenEinrichten } from './dialoge';
import { useEscSchliessen } from './Dialog';
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
  /** Name der Anwendung, z. B. „QUADRIO“ */
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

  // Name der App für Stellen, die allen Apps gehören (z. B. gespeichertes Protokoll)
  appNameSetzen(app);
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
          <span aria-hidden>≡</span> Protokoll
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

const WAHL: { id: ThemeWahl; label: string; kurz: string }[] = [
  { id: 'system', label: 'Auto (wie System)', kurz: 'Auto' },
  { id: 'hell', label: 'Hell', kurz: 'Hell' },
  { id: 'dunkel', label: 'Dunkel', kurz: 'Dunkel' },
];

/** Symbol des Farbschemas, gezeichnet statt Schriftzeichen (◐ ☀ ☾ fallen je nach Schrift winzig oder gar nicht aus) */
function SchemaSymbol({ id }: { id: ThemeWahl }) {
  return (
    <svg className="schema-symbol" viewBox="0 0 16 16" width="14" height="14" aria-hidden focusable="false">
      {id === 'hell' && (
        <g fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
          <circle cx="8" cy="8" r="3" />
          <path d="M8 1.5v1.5M8 13v1.5M1.5 8H3M13 8h1.5M3.4 3.4l1 1M11.6 11.6l1 1M3.4 12.6l1-1M11.6 4.4l1-1" />
        </g>
      )}
      {id === 'dunkel' && <path d="M10.5 2.2A6 6 0 1 0 13.8 10 4.8 4.8 0 0 1 10.5 2.2Z" fill="currentColor" />}
      {id === 'system' && (
        <g>
          <circle cx="8" cy="8" r="5.75" fill="none" stroke="currentColor" strokeWidth="1.5" />
          <path d="M8 2.25a5.75 5.75 0 0 1 0 11.5Z" fill="currentColor" />
        </g>
      )}
    </svg>
  );
}

export function ThemeMenu({ zeichenflaeche = true }: { zeichenflaeche?: boolean }) {
  const { wahl, setWahl, canvasDunkel, setCanvasDunkel } = useTheme();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const knopfRef = useRef<HTMLButtonElement>(null);
  const kopfId = useId();
  const listeRef = useRef<HTMLDivElement>(null);
  const schliessen = () => {
    setOpen(false);
    knopfRef.current?.focus();
  };
  // Esc schließt das Menü (über den gemeinsamen Esc-Stapel: offene Dialoge darunter bleiben offen)
  useEscSchliessen(schliessen, open);
  // beim Öffnen die aktuelle Wahl fokussieren
  useEffect(() => {
    if (open) listeRef.current?.querySelector<HTMLButtonElement>('[aria-checked="true"]')?.focus();
  }, [open]);
  /** ↑/↓ wechseln zwischen den Einträgen, Pos1/Ende springen an den Anfang/das Ende */
  const pfeile = (e: ReactKeyboardEvent) => {
    const eintraege = [...(listeRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]') ?? [])];
    const i = eintraege.indexOf(document.activeElement as HTMLButtonElement);
    const ziel = { ArrowDown: i + 1, ArrowUp: i - 1, Home: 0, End: eintraege.length - 1 }[e.key];
    if (ziel === undefined || !eintraege.length) return;
    e.preventDefault();
    eintraege[(ziel + eintraege.length) % eintraege.length].focus();
  };

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [open]);

  const cur = WAHL.find((w) => w.id === wahl)!;
  return (
    <div className="titlebar-menu" ref={ref}>
      <button
        ref={knopfRef}
        className="titlebar-btn"
        title={`Farbschema: ${cur.label}`}
        aria-label={`Farbschema: ${cur.label}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <SchemaSymbol id={wahl} /> {cur.kurz}
      </button>
      {open && (
        <div className="titlebar-dropdown">
          <div className="titlebar-dropdown-head" id={kopfId}>
            Farbschema
          </div>
          <div role="menu" aria-labelledby={kopfId} ref={listeRef} onKeyDown={pfeile}>
            {WAHL.map((w) => (
              <button
                key={w.id}
                role="menuitemradio"
                aria-checked={wahl === w.id}
                className={wahl === w.id ? 'active' : ''}
                tabIndex={wahl === w.id ? 0 : -1}
                onClick={() => {
                  setWahl(w.id);
                  schliessen();
                }}
              >
                <span className="tb-icon">
                  <SchemaSymbol id={w.id} />
                </span>{' '}
                {w.label}
              </button>
            ))}
          </div>
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
