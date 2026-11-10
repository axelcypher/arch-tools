import { useEffect, useRef, useState } from 'react';
import { isTauri } from '@core/platform/files';
import { logger } from '@core/platform/log';
import type { RahmenStatus } from '@core/platform/rahmen';
import { ANDOCKEN } from '@core/platform/rahmen';
import { LogDialog } from '@core/ui/LogDialog';
import { UpdateKnopf } from '@core/ui/UpdateKnopf';
import { APPS, appAdresse, appInfo, fensterLabel } from './apps';
import { useRahmen } from './store';

const log = logger('rahmen');

type AppWindow = import('@tauri-apps/api/window').Window;

/**
 * Rahmen-App: alle Apps in einem Fenster. Jede geöffnete App ist ein Tab (iframe, bleibt beim Wechseln
 * erhalten); „Herauslösen“ öffnet sie in einem eigenen Fenster, „Andocken“ dort holt sie zurück. Mehr kann der
 * Rahmen nicht – alles andere machen die Apps selbst.
 */
export function App() {
  const desktop = isTauri();
  const { tabs, aktiv, status, fenster, oeffnen, waehlen, schliessen, setStatus, herausgeloest, angedockt, fensterZu } = useRahmen();
  const rahmen = useRef(new Map<string, HTMLIFrameElement>());
  const [win, setWin] = useState<AppWindow | null>(null);
  const [maximiert, setMaximiert] = useState(false);
  const [menue, setMenue] = useState(false);
  const [logOffen, setLogOffen] = useState(false);

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
      ende = await w.onResized(async () => setMaximiert(await w.isMaximized()));
    });
    return () => {
      lebt = false;
      ende?.();
    };
  }, [desktop]);

  // Meldungen der Tabs: Name des Projekts, ungespeicherte Änderungen
  useEffect(() => {
    const hoeren = (e: MessageEvent) => {
      const d = e.data as Partial<RahmenStatus> | null;
      if (!d || d.typ !== 'arch-tools:status' || e.origin !== window.location.origin) return;
      for (const [id, f] of rahmen.current) if (f.contentWindow === e.source) setStatus(id, { name: d.name ?? '', dirty: !!d.dirty });
    };
    window.addEventListener('message', hoeren);
    return () => window.removeEventListener('message', hoeren);
  }, [setStatus]);

  // herausgelöste Fenster: wieder andocken
  useEffect(() => {
    if (!desktop) return;
    let ende: (() => void) | undefined;
    let lebt = true;
    void import('@tauri-apps/api/event').then(async ({ listen }) => {
      const aus = await listen<{ app: string }>(ANDOCKEN, (e) => {
        if (appInfo(e.payload.app)) angedockt(e.payload.app);
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

  const herausloesen = async (id: string) => {
    const info = appInfo(id)!;
    if (status[id]?.dirty && !window.confirm(`${info.name}: Ungespeicherte Änderungen bleiben im Zwischenstand und werden im neuen Fenster wiederhergestellt. Herauslösen?`)) return;
    if (!desktop) {
      window.open(appAdresse(id, 'fenster'), `arch-tools-${id}`);
      herausgeloest(id);
      return;
    }
    try {
      const { WebviewWindow } = await import('@tauri-apps/api/webviewWindow');
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
        log.error(`Fenster für ${info.name} nicht geöffnet`, e.payload);
        fensterZu(id);
        oeffnen(id);
      });
      void w.once('tauri://destroyed', () => fensterZu(id));
      herausgeloest(id);
      log.info(`Herausgelöst: ${info.name}`);
    } catch (e) {
      log.error(`Herauslösen fehlgeschlagen: ${info.name}`, e);
    }
  };

  const tabSchliessen = (id: string) => {
    if (status[id]?.dirty && !window.confirm(`${appInfo(id)?.name}: Ungespeicherte Änderungen verwerfen und schließen?`)) return;
    schliessen(id);
  };

  const fensterSchliessen = async () => {
    const offen = tabs.filter((id) => status[id]?.dirty).map((id) => appInfo(id)?.name);
    if (offen.length && !window.confirm(`Ungespeicherte Änderungen in ${offen.join(', ')} verwerfen und beenden?`)) return;
    await win?.close();
  };

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
                title={s?.name ? `${info.name} – ${s.name}` : info.name}
                onClick={() => waehlen(id)}
                onAuxClick={(e) => e.button === 1 && tabSchliessen(id)}
              >
                <img src={`apps/${id}/favicon.svg`} alt="" />
                <span className="rahmen-tab-name">{info.name}</span>
                {s?.name && <span className="rahmen-tab-projekt">{s.name}</span>}
                {s?.dirty && <span className="rahmen-tab-dirty" title="Ungespeicherte Änderungen">●</span>}
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
                <button
                  className="rahmen-tab-knopf"
                  title="Schließen"
                  aria-label={`${info.name} schließen`}
                  onClick={(e) => {
                    e.stopPropagation();
                    tabSchliessen(id);
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
                {zuMenue.length ? (
                  zuMenue.map((a) => (
                    <button key={a.id} role="menuitem" onClick={() => void oeffnenOderZeigen(a.id)}>
                      <img src={`apps/${a.id}/favicon.svg`} alt="" />
                      {a.name}
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
        {desktop && <UpdateKnopf app="arch-tools" dirty={tabs.some((id) => status[id]?.dirty)} />}
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
            <button className="wc-btn" title={maximiert ? 'Verkleinern' : 'Maximieren'} aria-label="Maximieren" onClick={() => void win.toggleMaximize()}>
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
            title={appInfo(id)!.name}
            src={appAdresse(id, 'tab')}
            allow="clipboard-read; clipboard-write; fullscreen"
          />
        ))}
        {!aktiv && (
          <div className="rahmen-start">
            <h2>arch-tools</h2>
            <p className="muted">Eine App öffnen – sie erscheint als Tab. Mit ⧉ am Tab läuft sie in einem eigenen Fenster weiter, „Andocken“ holt sie zurück.</p>
            <div className="rahmen-karten">
              {APPS.map((a) => (
                <button key={a.id} className="rahmen-karte" onClick={() => void oeffnenOderZeigen(a.id)}>
                  <img src={`apps/${a.id}/favicon.svg`} alt="" />
                  <span>
                    <strong>{a.name}</strong>
                    <span className="muted small-text">{fenster.includes(a.id) ? 'läuft in eigenem Fenster' : a.text}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
      </main>
      {logOffen && <LogDialog onClose={() => setLogOffen(false)} />}
    </div>
  );
}
