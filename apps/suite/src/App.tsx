import type { KeyboardEvent as ReactKeyboardEvent, MouseEvent as ReactMouseEvent } from 'react';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { isTauri } from '@core/platform/files';
import { getEntries, logger, logVersion, subscribe } from '@core/platform/log';
import type { RahmenNachricht, RahmenStatus } from '@core/platform/rahmen';
import { ungespeichertSatz } from '@core/platform/rahmen';
import {
  AN_APP,
  AN_RAHMEN,
  ANDOCKEN,
  ASSISTENT_NEU,
  BEREIT,
  PROJEKT_ANGELEGT,
  PROJEKT_ANLEGEN,
  PROJEKT_APP,
  speichernImFenster,
  speichernImTab,
  tabBrauchtVorbereitung,
  vorbereitenImFenster,
  vorbereitenImTab,
  ZUR_APP,
} from '@core/platform/rahmen';
import { APP_NAMEN } from '@core/appNamen';
import { LogDialog } from '@core/ui/LogDialog';
import type { MenuePunkt } from '@core/ui/Menue';
import { MenueHost, MenueKnopf, zeigeMenue } from '@core/ui/Menue';
import { Symbol } from '@core/ui/Symbol';
import { ThemeMenu } from '@core/ui/TitleBar';
import { dialogVerhaltenEinrichten } from '@core/ui/dialoge';
import { aenderungenSpeichern, aenderungenVerwerfen, meldung, RueckfrageHost } from '@core/ui/Rueckfrage';
import { SpeicherortHost, SpeicherortKnopf, SpeicherortZeile } from '@core/ui/Speicherort';
import { umzugBestaetigen } from '@core/ui/umzug';
import { schreibenAbwarten } from '@core/ui/vorbereiten';
import { UpdateKnopf } from '@core/ui/UpdateKnopf';
import { APPS, appAdresse, appInfo, fensterLabel } from './apps';
import { sperrenFreigeben } from './sperren';
import { useRahmen } from './store';

const log = logger('rahmen');

type AppWindow = import('@tauri-apps/api/window').Window;
/** Kennungen für Tab und Inhalt (aria-controls, aria-labelledby) */
const tabKennung = (id: string) => `rahmen-tab-${id}`;
const tafelKennung = (id: string) => `rahmen-tafel-${id}`;
/** Fokusziel „Knopf +“ (nach dem Schließen des letzten Tabs) */
const PLUS = '+';
/** Tauri-Ereignisse (nur Desktop, nachgeladen) */
const ereignisse = () => import('@tauri-apps/api/event');
/** wonach Änderungen freigegeben werden (Verb im Knopf, Hauptwort im Text der Verwerfen-Rückfrage) */
type Freigabe = 'schließen' | 'beenden' | 'neu starten';
const FREIGABE_NOMEN: Record<Freigabe, string> = { schließen: 'Schließen', beenden: 'Beenden', 'neu starten': 'Neustart' };

/**
 * Meldung eines Tabs bzw. Fensters → Status. Der Satz für die Rückfrage (`ungespeichert`) gilt nur als kurzer Text,
 * sonst bleibt der allgemeine.
 */
const statusAus = (d: Partial<RahmenStatus>) => {
  const satz = ungespeichertSatz(d.ungespeichert);
  return { name: d.name ?? '', dirty: !!d.dirty, ...(satz ? { ungespeichert: satz } : {}), ...(d.kannSpeichern === false ? { kannSpeichern: false as const } : {}) };
};

/**
 * Rahmen-App: alle Apps in einem Fenster. Jede geöffnete App ist ein Tab (iframe, bleibt beim Wechseln
 * erhalten); „Herauslösen“ öffnet sie in einem eigenen Fenster (nur Desktop), „Andocken“ dort holt sie zurück. Beim
 * Beenden (auch über das System) und vor einem Update fragt der Rahmen für jeden Tab und jedes Fenster mit
 * ungespeicherten Änderungen nach. Mehr kann der Rahmen nicht – alles andere machen die Apps selbst.
 */
export function App() {
  const desktop = isTauri();
  const { tabs, aktiv, status, fenster, oeffnen, waehlen, startseite, schliessen, setStatus, herausgeloest, angedockt, fensterZu } = useRahmen();
  const rahmen = useRef(new Map<string, HTMLIFrameElement>());
  /** angedockte Fenster: ihr Schließen gibt keine Sperren mehr frei (die App läuft als Tab weiter) */
  const angedocktGerade = useRef(new Set<string>());
  const [win, setWin] = useState<AppWindow | null>(null);
  const [maximiert, setMaximiert] = useState(false);
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
  /** Tabs, deren Schließen gerade läuft (Rückfrage oder Warten auf ausstehendes Schreiben) */
  const schliesstGerade = useRef(new Set<string>());
  /** Beenden läuft (Rückfragen offen): ein zweites Alt+F4 fragt nicht noch einmal */
  const beendet = useRef(false);
  /** wer auf das Ende eines herausgelösten Fensters wartet (Speichern auf Anfrage: dann „nicht gespeichert“) */
  const fensterEnde = useRef(new Map<string, Set<() => void>>());

  // Dialoge: aria-modal, Fokus hinein und zurück, Tab bleibt im Dialog (in den Apps macht das die Titelleiste)
  useEffect(() => dialogVerhaltenEinrichten(), []);

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
        for (const [id, f] of rahmen.current) if (f.contentWindow && f.contentWindow === e.source) setStatus(id, statusAus(d));
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
          if (d.kennung && useRahmen.getState().fenster.includes(d.kennung)) setStatus(d.kennung, statusAus(d));
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
    if (
      status[id]?.dirty &&
      !(await umzugBestaetigen(
        id,
        info.name,
        status[id].name,
        'herausloesen',
        // kann die App gerade nicht speichern: nur Verwerfen anbieten
        status[id].kannSpeichern === false ? undefined : () => (frame ? speichernImTab(frame, { zeitablauf: antwortetNicht(id) }) : false),
        status[id].ungespeichert,
      ))
    )
      return;
    if (tabBrauchtVorbereitung(frame)) {
      // während des Wartens kein zweites Herauslösen bzw. Schließen dieses Tabs
      if (schliesstGerade.current.has(id)) return;
      schliesstGerade.current.add(id);
      const weiter = await tabVorbereiten(id, 'herauslösen').finally(() => schliesstGerade.current.delete(id));
      if (!weiter) return;
    }
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
        fensterEnde.current.get(id)?.forEach((f) => f());
        fensterEnde.current.delete(id);
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

  /** Speichern auf Anfrage ohne Antwort der App: sagen, warum nichts geschieht */
  const antwortetNicht = (id: string) => () => {
    log.warn(`${appInfo(id)?.name} antwortet nicht auf „Speichern“`);
    void meldung(`${appInfo(id)?.name} antwortet nicht`, 'Die Änderungen wurden nicht gespeichert – die App lädt noch oder reagiert nicht. Sie bleibt geöffnet; bitte dort speichern.');
  };

  /**
   * ungespeicherte Änderungen eines Tabs: speichern (in der App), verwerfen oder abbrechen; kann die App gerade nicht
   * speichern, nur verwerfen oder abbrechen. true = weiter
   */
  const tabFreigeben = async (id: string, verb: Freigabe = 'schließen'): Promise<boolean> => {
    // aktueller Stand (auch aus Menüpunkten, die vor einer Meldung gebaut wurden)
    const s = useRahmen.getState().status[id];
    if (!s?.dirty) return true;
    const name = `${appInfo(id)?.name}${s.name ? ` – ${s.name}` : ''}`;
    if (s.kannSpeichern === false) return aenderungenVerwerfen(name, `Die Änderungen gehen beim ${FREIGABE_NOMEN[verb]} verloren.`, verb);
    const frame = rahmen.current.get(id);
    return aenderungenSpeichern(name, () => (frame ? speichernImTab(frame, { zeitablauf: antwortetNicht(id) }) : false), s.ungespeichert);
  };

  /**
   * Tab schließen (mit Rückfrage bei ungespeicherten Änderungen); true = geschlossen. Ohne Änderungen und ohne
   * angemeldete Vorbereitung sofort (ohne await); eine geladene App hat praktisch immer eine (gemeinsame Einstellungen),
   * dann einen Takt später. `danach`: gleich nach dem Schließen (z. B. Fokus festlegen)
   */
  const tabSchliessen = async (id: string, danach?: () => void): Promise<boolean> => {
    // schon unterwegs (Rückfrage oder Warten offen): ein zweiter Klick, Entf oder „Andere schließen“ tut nichts
    if (schliesstGerade.current.has(id)) return false;
    schliesstGerade.current.add(id);
    try {
      if (useRahmen.getState().status[id]?.dirty && !(await tabFreigeben(id))) return false;
      // ausstehendes Schreiben der App abwarten (vorDemSchliessen; meist sofort fertig)
      if (tabBrauchtVorbereitung(rahmen.current.get(id)) && !(await tabVorbereiten(id, 'schließen'))) return false;
      schliessen(id);
      danach?.();
      // Aufträge, die auf die App warteten, gelten nicht beim nächsten Öffnen
      warteschlange.current.delete(id);
      void sperrenFreigeben(id);
      return true;
    } finally {
      schliesstGerade.current.delete(id);
    }
  };

  /** ungespeicherte Änderungen eines herausgelösten Fensters: Rückfrage hier, Speichern im Fenster; true = weiter */
  const fensterFreigeben = async (id: string, verb: Freigabe): Promise<boolean> => {
    const s = useRahmen.getState().status[id];
    if (!s?.dirty) return true;
    const name = `${appInfo(id)?.name}${s.name ? ` – ${s.name}` : ''}`;
    if (s.kannSpeichern === false) return aenderungenVerwerfen(name, `Die Änderungen gehen beim ${FREIGABE_NOMEN[verb]} verloren.`, verb);
    return aenderungenSpeichern(
      name,
      () =>
        speichernImFenster(id, {
          zeitablauf: antwortetNicht(id),
          // schließt jemand das Fenster, während es speichert, wartet die Rückfrage nicht ewig
          beiEnde: (f) => {
            const warten = fensterEnde.current.get(id) ?? new Set();
            fensterEnde.current.set(id, warten.add(f));
            return () => warten.delete(f);
          },
        }),
      s.ungespeichert,
    );
  };

  /** vor dem Beenden bzw. Update: alle Tabs und Fenster mit ungespeicherten Änderungen nacheinander; true = weiter */
  const allesFreigeben = async (verb: 'beenden' | 'neu starten'): Promise<boolean> => {
    const { tabs: offen, fenster: draussen, status: st } = useRahmen.getState();
    for (const id of offen) {
      if (!st[id]?.dirty) continue;
      waehlen(id);
      if (!(await tabFreigeben(id, verb))) return false;
    }
    for (const id of draussen) if (!(await fensterFreigeben(id, verb))) return false;
    // danach ausstehendes Schreiben abwarten (vorDemSchliessen), in Tabs und herausgelösten Fenstern
    for (const id of offen) if (tabBrauchtVorbereitung(rahmen.current.get(id)) && !(await tabVorbereiten(id, verb))) return false;
    // nur Fenster, die schon hören (ein ladendes hat nichts Ausstehendes); ohne Vorbereitung antworten sie sofort
    for (const id of draussen.filter((x) => bereitFenster.current.has(x))) if (!(await schreibenAbwarten(appInfo(id)?.name ?? id, () => vorbereitenImFenster(id), verb))) return false;
    return true;
  };

  /** ausstehendes Schreiben eines Tabs abwarten; true = weiter (fertig oder trotzdem) */
  const tabVorbereiten = (id: string, verb: string) => {
    const frame = rahmen.current.get(id);
    return frame ? schreibenAbwarten(appInfo(id)?.name ?? id, () => vorbereitenImTab(frame), verb) : Promise.resolve(true);
  };

  /** Beenden (× oder System): Rückfragen, dann alle herausgelösten Fenster und das Hauptfenster schließen */
  const fensterSchliessen = async () => {
    if (beendet.current) return;
    beendet.current = true;
    try {
      if (!(await allesFreigeben('beenden'))) return;
      log.info('Arkly wird beendet');
      const { WebviewWindow } = await import('@tauri-apps/api/webviewWindow');
      for (const id of useRahmen.getState().fenster) {
        try {
          await (await WebviewWindow.getByLabel(fensterLabel(id)))?.destroy();
        } catch (e) {
          // ein Fenster ohne Rahmen bliebe zurück (sein „Andocken“ ginge ins Leere) – dann nicht beenden
          log.error(`Fenster von ${appInfo(id)?.name} ließ sich nicht schließen`, e);
          await meldung('Arkly nicht beendet', `Das Fenster von ${appInfo(id)?.name} ließ sich nicht schließen. Bitte dort schließen und Arkly erneut beenden.`, e);
          return;
        }
      }
      await win?.destroy();
    } finally {
      beendet.current = false;
    }
  };
  const beendenRef = useRef(fensterSchliessen);
  beendenRef.current = fensterSchliessen;

  /** Tab per Tastatur gewählt: danach seinen Knopf fokussieren (nach dem Rendern) */
  const fokusTab = useRef<string | null>(null);
  useEffect(() => {
    if (!fokusTab.current) return;
    // letzter Tab zu: an den Knopf „+“ (die Startseite hat keinen Tab)
    (fokusTab.current === PLUS ? document.querySelector<HTMLElement>('button.rahmen-plus') : document.getElementById(tabKennung(fokusTab.current)))?.focus();
    fokusTab.current = null;
  });

  /** Tastatur am Tab: ←/→ wechseln, Pos1/Ende springen (der Wechsel wirkt sofort), Entf bzw. Strg+F4 schließt */
  const tabTasten = (e: ReactKeyboardEvent, id: string) => {
    const i = tabs.indexOf(id);
    const ziel = e.key === 'ArrowRight' ? tabs[(i + 1) % tabs.length] : e.key === 'ArrowLeft' ? tabs[(i - 1 + tabs.length) % tabs.length] : e.key === 'Home' ? tabs[0] : e.key === 'End' ? tabs[tabs.length - 1] : null;
    if (ziel) {
      e.preventDefault();
      fokusTab.current = ziel;
      waehlen(ziel);
    } else if (e.key === 'Delete' || (e.key === 'F4' && e.ctrlKey)) {
      e.preventDefault();
      // der Fokus geht an den nun gewählten Tab (sonst fiele er auf die Seite)
      void tabSchliessen(id, () => (fokusTab.current = useRahmen.getState().aktiv ?? PLUS));
    }
  };

  /** Kontextmenü am Tab (Rechtsklick, Kontextmenütaste) */
  const tabMenue = (e: ReactMouseEvent, id: string) =>
    zeigeMenue(
      e,
      [
        ...(desktop ? [{ text: 'In eigenem Fenster öffnen', symbol: 'extern' as const, aktion: () => void herausloesen(id) }] : []),
        { text: 'Schließen', symbol: 'schliessen' as const, tasten: 'Entf / Strg+F4', aktion: () => void tabSchliessen(id) },
        { text: 'Andere schließen', deaktiviert: tabs.length < 2, hinweis: tabs.length < 2 ? 'nur ein Tab offen' : undefined, aktion: () => void andereSchliessen(id) },
      ],
      `${appInfo(id)?.name}`,
    );

  /** alle anderen Tabs schließen; ein Tab mit Änderungen wird für seine Rückfrage gezeigt, Abbrechen hört auf */
  const andereSchliessen = async (id: string) => {
    for (const t of useRahmen.getState().tabs.filter((x) => x !== id)) {
      if (useRahmen.getState().status[t]?.dirty) waehlen(t);
      if (!(await tabSchliessen(t))) return;
    }
    waehlen(id);
  };

  /** Menü „+“: neues Projekt, Apps, die noch nicht als Tab offen sind, Startseite */
  const plusMenue = (): MenuePunkt[] => {
    const zu = APPS.filter((a) => !tabs.includes(a.id));
    return [
      { text: 'Neues Projekt anlegen …', symbol: 'plus', titel: `Assistent von ${APP_NAMEN.ordner.name} (${APP_NAMEN.ordner.was}): Stammdaten, Umfang, Beteiligte, Ordner und Vorlagen`, aktion: () => projektAnlegen(null) },
      { trenner: true },
      ...(zu.length
        ? zu.map((a): MenuePunkt => ({ text: `${a.name} – ${a.was}`, bild: `apps/${a.id}/favicon.svg`, hinweis: fenster.includes(a.id) ? 'eigenes Fenster' : undefined, titel: a.text, aktion: () => void oeffnenOderZeigen(a.id) }))
        : [{ text: 'Alle Apps sind geöffnet', deaktiviert: true }]),
      ...(aktiv ? [{ trenner: true } as const, { text: 'Startseite', titel: 'Alle Apps im Überblick', aktion: startseite }] : []),
    ];
  };

  // Fehler seit dem letzten Öffnen des Protokolls (wie in der Titelleiste der Apps)
  const logStand = useSyncExternalStore(subscribe, logVersion);
  const [gesehen, setGesehen] = useState(0);
  const fehler = getEntries().filter((e) => e.level === 'error' && e.id > gesehen).length;
  void logStand;

  return (
    <div className="app rahmen">
      <header className="titlebar rahmen-leiste" data-tauri-drag-region>
        <img className="titlebar-icon" src="./favicon.svg" alt="" data-tauri-drag-region />
        <div className="rahmen-tabs" role="tablist" aria-label="Geöffnete Apps" data-tauri-drag-region>
          {tabs.map((id) => {
            const info = appInfo(id)!;
            const s = status[id];
            const name = `${info.name} (${info.was})${s?.name ? ` – ${s.name}` : ''}`;
            return (
              // Wahl per Tastatur am Tab-Knopf; ⧉ und × sind für die Maus da (Tastatur: Entf bzw. Strg+F4, Kontextmenü)
              <div key={id} role="presentation" className={`rahmen-tab${id === aktiv ? ' aktiv' : ''}`} onAuxClick={(e) => e.button === 1 && void tabSchliessen(id)} onContextMenu={(e) => tabMenue(e, id)}>
                <button
                  id={tabKennung(id)}
                  role="tab"
                  className="rahmen-tab-wahl"
                  aria-selected={id === aktiv}
                  aria-controls={tafelKennung(id)}
                  aria-label={`${name}${s?.dirty ? ', ungespeicherte Änderungen' : ''}`}
                  tabIndex={id === aktiv || (!aktiv && id === tabs[0]) ? 0 : -1}
                  title={name}
                  onClick={() => waehlen(id)}
                  onKeyDown={(e) => tabTasten(e, id)}
                >
                  <img src={`apps/${id}/favicon.svg`} alt="" />
                  <span className="rahmen-tab-name">{info.name}</span>
                  {s?.name && <span className="rahmen-tab-projekt">{s.name}</span>}
                  {s?.dirty && (
                    <span className="titlebar-dirty rahmen-tab-dirty" aria-hidden>
                      ●
                    </span>
                  )}
                </button>
                {desktop && (
                  <button className="rahmen-tab-knopf rahmen-tab-extern" tabIndex={-1} title="In eigenem Fenster öffnen" aria-label={`${info.name} in eigenem Fenster öffnen`} onClick={() => void herausloesen(id)}>
                    <Symbol name="extern" />
                  </button>
                )}
                <button className="rahmen-tab-knopf" tabIndex={-1} title="Schließen (Entf)" aria-label={`${info.name} schließen`} onClick={() => void tabSchliessen(id)}>
                  <Symbol name="schliessen" />
                </button>
              </div>
            );
          })}
        </div>
        <MenueKnopf className="titlebar-btn rahmen-plus" title="App öffnen oder neues Projekt anlegen" ariaLabel="App öffnen" name="App öffnen" punkte={plusMenue}>
          <Symbol name="plus" />
        </MenueKnopf>
        <span className="titlebar-drag" data-tauri-drag-region />
        {desktop && <UpdateKnopf app={APP_NAMEN.suite.name} dirty={[...tabs, ...fenster].some((id) => status[id]?.dirty)} vorInstallation={() => allesFreigeben('neu starten')} />}
        <SpeicherortKnopf />
        <ThemeMenu zeichenflaeche={false} />
        <button
          className="titlebar-btn"
          title="Protokoll von Arkly (Fehlersuche)"
          aria-label={fehler ? `Protokoll, ${fehler} neue Fehler` : 'Protokoll'}
          onClick={() => {
            setGesehen(getEntries().at(-1)?.id ?? 0);
            setLogOffen(true);
          }}
        >
          <span aria-hidden>≡</span> <span className="titlebar-text">Protokoll</span>
          {fehler > 0 && (
            <span className="titlebar-badge" aria-hidden>
              {fehler}
            </span>
          )}
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
          // jede App bleibt geladen; nur die gewählte ist sichtbar
          <div key={id} id={tafelKennung(id)} role="tabpanel" aria-labelledby={tabKennung(id)} className={`rahmen-app${id === aktiv ? ' aktiv' : ''}`}>
            <iframe
              ref={(f) => {
                if (f) rahmen.current.set(id, f);
                else rahmen.current.delete(id);
              }}
              title={`${appInfo(id)!.name} (${appInfo(id)!.was})`}
              src={appAdresse(id, 'tab')}
              allow="clipboard-read; clipboard-write; fullscreen"
            />
          </div>
        ))}
        {!aktiv && (
          <div className="rahmen-start">
            <h2>{APP_NAMEN.suite.name}</h2>
            <p className="muted">Eine App öffnen – sie erscheint als Tab.</p>
            <div className="rahmen-anlegen">
              <button className="primary" onClick={() => projektAnlegen(null)} title="Assistent: Stammdaten, Umfang, Beteiligte – dann entstehen Projektordner, Vorlagen und Projektdatei. Auch auf der Projektübersicht jeder App.">
                <Symbol name="plus" /> Neues Projekt anlegen …
              </button>
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
