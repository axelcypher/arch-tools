import { useEffect, useRef, useState } from 'react';
import { isTauri } from '@core/platform/files';
import { logger } from '@core/platform/log';
import type { RahmenNachricht, RahmenStatus } from '@core/platform/rahmen';
import { AN_APP, AN_RAHMEN, ANDOCKEN, ASSISTENT_NEU, BEREIT, PROJEKT_ANGELEGT, PROJEKT_ANLEGEN, PROJEKT_APP, speichernImFenster, speichernImTab, ZUR_APP } from '@core/platform/rahmen';
import { APP_NAMEN } from '@core/appNamen';
import { LogDialog } from '@core/ui/LogDialog';
import { MenueHost } from '@core/ui/Menue';
import { aenderungenSpeichern, RueckfrageHost } from '@core/ui/Rueckfrage';
import { SpeicherortHost, SpeicherortKnopf, SpeicherortZeile } from '@core/ui/Speicherort';
import { umzugBestaetigen } from '@core/ui/umzug';
import { UpdateKnopf } from '@core/ui/UpdateKnopf';
import { APPS, appAdresse, appInfo, fensterLabel } from './apps';
import { sperrenFreigeben } from './sperren';
import { useRahmen } from './store';

const log = logger('rahmen');

type AppWindow = import('@tauri-apps/api/window').Window;
/** Tauri-Ereignisse (nur Desktop, nachgeladen) */
const ereignisse = () => import('@tauri-apps/api/event');

/**
 * Rahmen-App: alle Apps in einem Fenster. Jede geöffnete App ist ein Tab (iframe, bleibt beim Wechseln
 * erhalten); „Herauslösen“ öffnet sie in einem eigenen Fenster (nur Desktop), „Andocken“ dort holt sie zurück. Beim
 * Beenden (auch über das System) und vor einem Update fragt der Rahmen für jeden Tab und jedes Fenster mit
 * ungespeicherten Änderungen nach. Mehr kann der Rahmen nicht – alles andere machen die Apps selbst.
 */
export function App() {
  const desktop = isTauri();
  const { tabs, aktiv, status, fenster, oeffnen, waehlen, schliessen, setStatus, herausgeloest, angedockt, fensterZu } = useRahmen();
  const rahmen = useRef(new Map<string, HTMLIFrameElement>());
  /** angedockte Fenster: ihr Schließen gibt keine Sperren mehr frei (die App läuft als Tab weiter) */
  const angedocktGerade = useRef(new Set<string>());
  const [win, setWin] = useState<AppWindow | null>(null);
  const [maximiert, setMaximiert] = useState(false);
  const [menue, setMenue] = useState(false);
  const [logOffen, setLogOffen] = useState(false);
  /** Apps, die auf Nachrichten hören: Tabs (ihr Fenster) und herausgelöste Fenster (Kennung) */
  const bereitTabs = useRef(new WeakSet<Window>());
  const bereitFenster = useRef(new Set<string>());
  /** Nachrichten an Apps, die (noch) nicht hören – zugestellt, sobald sie sich melden */
  const warteschlange = useRef(new Map<string, RahmenNachricht[]>());
  const fensterJetzt = useRef(fenster);
  fensterJetzt.current = fenster;
  /** Generation je herausgelöstem Fenster: Ereignisse eines alten Fensters (Andocken, gleich wieder herausgelöst) zählen nicht */
  const fensterGen = useRef(new Map<string, number>());
  /** Beenden läuft (Rückfragen offen): ein zweites Alt+F4 fragt nicht noch einmal */
  const beendet = useRef(false);

  // Fenster (Desktop): Knöpfe, Größe
  useEffect(() => {
    if (!desktop) return;
    let ende: (() => void) | undefined;
    let lebt = true;
    void import('@tauri-apps/api/window').then(async ({ getCurrentWindow }) => {
      const w = getCurrentWindow();
      if (!lebt) return;
      setWin(w);
      setMaximiert(await w.isMaximized());
      const aus = [
        await w.onResized(async () => setMaximiert(await w.isMaximized())),
        // Schließen über das System (Alt+F4, Taskleiste) wie über ×: erst die Rückfragen
        await w.onCloseRequested((e) => {
          e.preventDefault();
          void beendenRef.current();
        }),
      ];
      ende = () => aus.forEach((f) => f());
      if (!lebt) ende();
    });
    return () => {
      lebt = false;
      ende?.();
    };
  }, [desktop]);

  // Meldungen der Tabs: Name des Projekts, ungespeicherte Änderungen; Aufträge zwischen den Apps
  useEffect(() => {
    const hoeren = (e: MessageEvent) => {
      const d = e.data as (Partial<RahmenStatus> & RahmenNachricht) | null;
      if (!d || e.origin !== window.location.origin) return;
      if (d.typ === 'arch-tools:status') {
        for (const [id, f] of rahmen.current) if (f.contentWindow && f.contentWindow === e.source) setStatus(id, { name: d.name ?? '', dirty: !!d.dirty });
        return;
      }
      verarbeiten.current(d, e.source as Window | null);
    };
    window.addEventListener('message', hoeren);
    return () => window.removeEventListener('message', hoeren);
  }, [setStatus]);

  // dasselbe aus herausgelösten Fenstern (Tauri-Ereignis)
  useEffect(() => {
    if (!desktop) return;
    let ende: (() => void) | undefined;
    let lebt = true;
    void ereignisse().then(async ({ listen }) => {
      const aus = await listen<RahmenNachricht & Partial<RahmenStatus>>(AN_RAHMEN, (e) => {
        const d = e.payload;
        // Meldung eines herausgelösten Fensters: Projekt und ungespeicherte Änderungen (für Rückfragen beim Beenden)
        if (d?.typ === 'arch-tools:status') {
          if (d.kennung && useRahmen.getState().fenster.includes(d.kennung)) setStatus(d.kennung, { name: d.name ?? '', dirty: !!d.dirty });
          return;
        }
        verarbeiten.current(d, null);
      });
      if (lebt) ende = aus;
      else aus();
    });
    return () => {
      lebt = false;
      ende?.();
    };
  }, [desktop, setStatus]);

  // herausgelöste Fenster: wieder andocken
  useEffect(() => {
    if (!desktop) return;
    let ende: (() => void) | undefined;
    let lebt = true;
    void ereignisse().then(async ({ listen }) => {
      const aus = await listen<{ app: string }>(ANDOCKEN, (e) => {
        const id = e.payload.app;
        if (!appInfo(id)) return;
        angedocktGerade.current.add(id);
        // erst freigeben, dann den Tab öffnen – der sperrt die geöffneten Formulare neu
        void sperrenFreigeben(id).then(() => angedockt(id));
      });
      if (lebt) ende = aus;
      else aus();
    });
    return () => {
      lebt = false;
      ende?.();
    };
  }, [desktop, angedockt]);

  const oeffnenOderZeigen = async (id: string) => {
    setMenue(false);
    if (fenster.includes(id) && desktop) {
      // schon herausgelöst: dieses Fenster nach vorn
      const { WebviewWindow } = await import('@tauri-apps/api/webviewWindow');
      const w = await WebviewWindow.getByLabel(fensterLabel(id));
      if (w) {
        await w.unminimize().catch(() => undefined);
        await w.setFocus();
        return;
      }
      fensterZu(id);
    }
    oeffnen(id);
  };

  /** Nachricht an eine App – im Tab, im herausgelösten Fenster oder, solange sie noch nicht hört, später */
  const zustellen = (id: string, n: RahmenNachricht) => {
    const nachricht = { ...n, an: id };
    const ziel = rahmen.current.get(id)?.contentWindow;
    if (ziel && bereitTabs.current.has(ziel)) return ziel.postMessage(nachricht, window.location.origin);
    if (desktop && fensterJetzt.current.includes(id) && bereitFenster.current.has(id)) {
      void ereignisse().then(({ emit }) => emit(AN_APP, nachricht));
      return;
    }
    warteschlange.current.set(id, [...(warteschlange.current.get(id) ?? []), nachricht]);
  };

  /** Neues Projekt: der Assistent von ATLAS – aus einer App (`von`) oder vom Rahmen selbst */
  const projektAnlegen = (von: string | null, kannOeffnen = false) => {
    setMenue(false);
    const info = von && von !== PROJEKT_APP ? appInfo(von) : undefined;
    log.info(`Neues Projekt anlegen${info ? ` (aus ${info.name})` : ''}`);
    void oeffnenOderZeigen(PROJEKT_APP);
    zustellen(PROJEKT_APP, { typ: ASSISTENT_NEU, von: info ? von : null, ...(info ? { vonName: info.name, kannOeffnen } : {}) });
  };

  /** Aufträge der Apps: hören jetzt, neues Projekt anlegen, zurück zu einer App (mit dem neuen Projekt) */
  const verarbeiten = useRef<(n: RahmenNachricht, quelle: Window | null) => void>(() => {});
  verarbeiten.current = (n, quelle) => {
    const id = [...rahmen.current].find(([, f]) => quelle && f.contentWindow === quelle)?.[0] ?? (n.app && appInfo(n.app) ? n.app : null);
    if (!id && n.typ !== PROJEKT_ANLEGEN) return;
    if (n.typ === BEREIT && id) {
      if (quelle) bereitTabs.current.add(quelle);
      else bereitFenster.current.add(id);
      const offen = warteschlange.current.get(id) ?? [];
      warteschlange.current.delete(id);
      for (const x of offen) zustellen(id, x);
    } else if (n.typ === PROJEKT_ANLEGEN) projektAnlegen(id, !!n.kannOeffnen);
    else if (n.typ === ZUR_APP && n.an && appInfo(n.an)) {
      void oeffnenOderZeigen(n.an);
      if (n.ordner) zustellen(n.an, { typ: PROJEKT_ANGELEGT, ordner: n.ordner });
    }
  };

  /** Tab in ein eigenes Fenster (nur Desktop – im Browser gibt es kein Andocken und keinen Weg zurück) */
  const herausloesen = async (id: string) => {
    const info = appInfo(id)!;
    const frame = rahmen.current.get(id);
    if (status[id]?.dirty && !(await umzugBestaetigen(id, info.name, status[id].name, 'herausloesen', () => (frame ? speichernImTab(frame) : false)))) return;
    // Tab zu, Sperren frei – dann das Fenster, das die geöffneten Formulare neu sperrt
    herausgeloest(id);
    await sperrenFreigeben(id);
    const gen = (fensterGen.current.get(id) ?? 0) + 1;
    fensterGen.current.set(id, gen);
    const aktuell = () => fensterGen.current.get(id) === gen;
    // ein Andocken des alten Fensters gilt nicht für das neue (dessen Ende gibt die Sperren wieder frei)
    angedocktGerade.current.delete(id);
    bereitFenster.current.delete(id);
    try {
      const { WebviewWindow } = await import('@tauri-apps/api/webviewWindow');
      // ein gerade angedocktes Fenster derselben App kann noch bestehen – sonst schlüge das neue fehl (gleiche Kennung)
      await (await WebviewWindow.getByLabel(fensterLabel(id)))?.destroy();
      const w = new WebviewWindow(fensterLabel(id), {
        url: appAdresse(id, 'fenster'),
        title: info.name,
        width: 1280,
        height: 900,
        minWidth: 900,
        minHeight: 600,
        decorations: false,
        dragDropEnabled: false,
      });
      void w.once('tauri://error', (e) => {
        if (!aktuell()) return;
        log.error(`Fenster für ${info.name} nicht geöffnet`, e.payload);
        fensterZu(id);
        oeffnen(id);
      });
      void w.once('tauri://destroyed', () => {
        if (!aktuell()) return;
        bereitFenster.current.delete(id);
        fensterZu(id);
        // angedockt: der Tab übernimmt (auch wartende Nachrichten); sonst ist die App zu
        if (!angedocktGerade.current.delete(id)) {
          warteschlange.current.delete(id);
          void sperrenFreigeben(id);
        }
      });
      log.info(`Herausgelöst: ${info.name}`);
    } catch (e) {
      log.error(`Herauslösen fehlgeschlagen: ${info.name}`, e);
      fensterZu(id);
      oeffnen(id);
    }
  };

  /** ungespeicherte Änderungen eines Tabs: speichern (in der App), verwerfen oder abbrechen; true = weiter */
  const tabFreigeben = async (id: string): Promise<boolean> => {
    if (!status[id]?.dirty) return true;
    const frame = rahmen.current.get(id);
    return aenderungenSpeichern(`${appInfo(id)?.name}${status[id]?.name ? ` – ${status[id].name}` : ''}`, () => (frame ? speichernImTab(frame) : false));
  };

  const tabSchliessen = async (id: string) => {
    if (status[id]?.dirty && !(await tabFreigeben(id))) return;
    schliessen(id);
    // Aufträge, die auf die App warteten, gelten nicht beim nächsten Öffnen
    warteschlange.current.delete(id);
    void sperrenFreigeben(id);
  };

  /** ungespeicherte Änderungen eines herausgelösten Fensters: Rückfrage hier, Speichern im Fenster; true = weiter */
  const fensterFreigeben = async (id: string): Promise<boolean> => {
    const s = useRahmen.getState().status[id];
    if (!s?.dirty) return true;
    return aenderungenSpeichern(`${appInfo(id)?.name}${s.name ? ` – ${s.name}` : ''}`, () => speichernImFenster(id));
  };

  /** vor dem Beenden bzw. Update: alle Tabs und Fenster mit ungespeicherten Änderungen nacheinander; true = weiter */
  const allesFreigeben = async (): Promise<boolean> => {
    const { tabs: offen, fenster: draussen, status: st } = useRahmen.getState();
    for (const id of offen) {
      if (!st[id]?.dirty) continue;
      waehlen(id);
      if (!(await tabFreigeben(id))) return false;
    }
    for (const id of draussen) if (!(await fensterFreigeben(id))) return false;
    return true;
  };

  /** Beenden (× oder System): Rückfragen, dann alle herausgelösten Fenster und das Hauptfenster schließen */
  const fensterSchliessen = async () => {
    if (beendet.current) return;
    beendet.current = true;
    try {
      if (!(await allesFreigeben())) return;
      log.info('Arkly wird beendet');
      const { WebviewWindow } = await import('@tauri-apps/api/webviewWindow');
      for (const id of useRahmen.getState().fenster) await (await WebviewWindow.getByLabel(fensterLabel(id)))?.destroy().catch(() => undefined);
      await win?.destroy();
    } finally {
      beendet.current = false;
    }
  };
  const beendenRef = useRef(fensterSchliessen);
  beendenRef.current = fensterSchliessen;

  const zuMenue = APPS.filter((a) => !tabs.includes(a.id));

  return (
    <div className="app rahmen">
      <header className="titlebar rahmen-leiste" data-tauri-drag-region>
        <img className="titlebar-icon" src="./favicon.svg" alt="" data-tauri-drag-region />
        <nav className="rahmen-tabs" role="tablist" aria-label="Geöffnete Apps">
          {tabs.map((id) => {
            const info = appInfo(id)!;
            const s = status[id];
            return (
              <div
                key={id}
                role="tab"
                aria-selected={id === aktiv}
                className={`rahmen-tab${id === aktiv ? ' aktiv' : ''}`}
                title={s?.name ? `${info.name} (${info.was}) – ${s.name}` : `${info.name} (${info.was})`}
                onClick={() => waehlen(id)}
                onAuxClick={(e) => e.button === 1 && void tabSchliessen(id)}
              >
                <img src={`apps/${id}/favicon.svg`} alt="" />
                <span className="rahmen-tab-name">{info.name}</span>
                {s?.name && <span className="rahmen-tab-projekt">{s.name}</span>}
                {s?.dirty && <span className="rahmen-tab-dirty" title="Ungespeicherte Änderungen">●</span>}
                {desktop && (
                  <button
                    className="rahmen-tab-knopf"
                    title="In eigenem Fenster öffnen"
                    aria-label={`${info.name} in eigenem Fenster`}
                    onClick={(e) => {
                      e.stopPropagation();
                      void herausloesen(id);
                    }}
                  >
                    ⧉
                  </button>
                )}
                <button
                  className="rahmen-tab-knopf"
                  title="Schließen"
                  aria-label={`${info.name} schließen`}
                  onClick={(e) => {
                    e.stopPropagation();
                    void tabSchliessen(id);
                  }}
                >
                  ×
                </button>
              </div>
            );
          })}
          <div className="rahmen-plus">
            <button className="titlebar-btn" title="App öffnen" aria-haspopup="menu" aria-expanded={menue} onClick={() => setMenue(!menue)}>
              +
            </button>
            {menue && (
              <div className="rahmen-menue" role="menu" onMouseLeave={() => setMenue(false)}>
                <button role="menuitem" className="rahmen-menue-anlegen" onClick={() => projektAnlegen(null)} title={`Assistent von ${APP_NAMEN.ordner.name} (${APP_NAMEN.ordner.was}): Stammdaten, Umfang, Beteiligte, Ordner und Vorlagen`}>
                  <span className="rahmen-plus-symbol" aria-hidden>
                    +
                  </span>
                  Neues Projekt anlegen …
                </button>
                <hr />
                {zuMenue.length ? (
                  zuMenue.map((a) => (
                    <button key={a.id} role="menuitem" onClick={() => void oeffnenOderZeigen(a.id)}>
                      <img src={`apps/${a.id}/favicon.svg`} alt="" />
                      {a.name}
                      <span className="muted small-text"> {a.was}</span>
                      {fenster.includes(a.id) && <span className="muted small-text"> – eigenes Fenster</span>}
                    </button>
                  ))
                ) : (
                  <span className="muted small-text">Alle Apps sind geöffnet.</span>
                )}
              </div>
            )}
          </div>
        </nav>
        <span className="titlebar-drag" data-tauri-drag-region />
        {desktop && <UpdateKnopf app={APP_NAMEN.suite.name} dirty={[...tabs, ...fenster].some((id) => status[id]?.dirty)} vorInstallation={allesFreigeben} />}
        <SpeicherortKnopf />
        <button className="titlebar-btn" title="Protokoll des Rahmens" onClick={() => setLogOffen(true)}>
          <span aria-hidden>≡</span>
        </button>
        {desktop && win && (
          <div className="window-controls">
            <button className="wc-btn" title="Minimieren" aria-label="Minimieren" onClick={() => void win.minimize()}>
              <svg viewBox="0 0 10 10" aria-hidden>
                <path d="M0 5.5h10" />
              </svg>
            </button>
            <button className="wc-btn" title={maximiert ? 'Wiederherstellen' : 'Maximieren'} aria-label={maximiert ? 'Wiederherstellen' : 'Maximieren'} onClick={() => void win.toggleMaximize()}>
              {maximiert ? (
                <svg viewBox="0 0 10 10" aria-hidden>
                  <path d="M2.5 0.5h7v7M0.5 2.5h7v7h-7z" />
                </svg>
              ) : (
                <svg viewBox="0 0 10 10" aria-hidden>
                  <path d="M0.5 0.5h9v9h-9z" />
                </svg>
              )}
            </button>
            <button className="wc-btn wc-close" title="Schließen" aria-label="Schließen" onClick={() => void fensterSchliessen()}>
              <svg viewBox="0 0 10 10" aria-hidden>
                <path d="M0.5 0.5l9 9M9.5 0.5l-9 9" />
              </svg>
            </button>
          </div>
        )}
      </header>
      <main className="rahmen-inhalt">
        {tabs.map((id) => (
          <iframe
            key={id}
            ref={(f) => {
              if (f) rahmen.current.set(id, f);
              else rahmen.current.delete(id);
            }}
            className={`rahmen-app${id === aktiv ? ' aktiv' : ''}`}
            title={`${appInfo(id)!.name} (${appInfo(id)!.was})`}
            src={appAdresse(id, 'tab')}
            allow="clipboard-read; clipboard-write; fullscreen"
          />
        ))}
        {!aktiv && (
          <div className="rahmen-start">
            <h2>{APP_NAMEN.suite.name}</h2>
            <p className="muted">Eine App öffnen – sie erscheint als Tab. Mit ⧉ am Tab läuft sie in einem eigenen Fenster weiter, „Andocken“ holt sie zurück.</p>
            <div className="rahmen-anlegen">
              <button className="primary" onClick={() => projektAnlegen(null)}>
                + Neues Projekt anlegen
              </button>
              <span className="muted small-text">Assistent: Stammdaten, Umfang, Beteiligte – dann entstehen Projektordner, Vorlagen und Projektdatei. Auch auf der Projektübersicht jeder App.</span>
            </div>
            <div className="rahmen-karten">
              {APPS.map((a) => (
                <button key={a.id} className="rahmen-karte" onClick={() => void oeffnenOderZeigen(a.id)}>
                  <img src={`apps/${a.id}/favicon.svg`} alt="" />
                  <span>
                    <strong>
                      {a.name} <span className="muted small-text rahmen-karte-was">{a.was}</span>
                    </strong>
                    <span className="muted small-text">{fenster.includes(a.id) ? 'läuft in eigenem Fenster' : a.text}</span>
                  </span>
                </button>
              ))}
            </div>
            {desktop && (
              <div className="rahmen-speicherort">
                <SpeicherortZeile />
              </div>
            )}
          </div>
        )}
      </main>
      {logOffen && <LogDialog onClose={() => setLogOffen(false)} />}
      <SpeicherortHost />
      <RueckfrageHost />
      <MenueHost />
    </div>
  );
}
