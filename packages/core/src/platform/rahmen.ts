/**
 * Rahmen-App: Alle Apps laufen in einem Fenster als Tabs (iframes desselben Ursprungs) oder herausgelöst in
 * eigenen Fenstern desselben Programms. Die Apps merken das hier und passen sich an:
 *
 *   'tab'     im Tab der Rahmen-App: keine eigenen Fensterknöpfe, kein Ziehen, keine Updates (die macht der Rahmen);
 *             Name und ungespeicherte Änderungen werden an den Rahmen gemeldet
 *   'fenster' herausgelöst in ein eigenes Fenster der Rahmen-App: eigene Fensterknöpfe, keine Updates, Knopf
 *             „Andocken“ zurück in den Rahmen
 *   null      eigenständige App (eigener Installer) oder Browser
 */

export type RahmenModus = 'tab' | 'fenster' | null;

/** Nachricht eines Tabs an den Rahmen */
export interface RahmenStatus {
  typ: 'arch-tools:status';
  /** Name der App (TitleBar) */
  app: string;
  /** Name des geöffneten Projekts */
  name: string;
  dirty: boolean;
}

/** Ereignis eines herausgelösten Fensters an den Rahmen: wieder als Tab andocken */
export const ANDOCKEN = 'arch-tools:andocken';

export function rahmenModus(): RahmenModus {
  if (typeof window === 'undefined') return null;
  try {
    if (window.parent !== window && /(^|[?&])rahmen=tab(&|$)/.test(window.location.search)) return 'tab';
  } catch {
    // fremder Rahmen: wie eigenständig
  }
  return /(^|[?&])rahmen=fenster(&|$)/.test(window.location.search) ? 'fenster' : null;
}

/** Kennung der App in der Rahmen-App (aus der Adresse, z. B. „formulare“) */
export function rahmenApp(): string | null {
  if (typeof window === 'undefined') return null;
  return new URLSearchParams(window.location.search).get('app');
}

/** Im Tab: Name und ungespeicherte Änderungen an den Rahmen melden */
export function anRahmenMelden(app: string, name: string, dirty: boolean): void {
  if (rahmenModus() !== 'tab') return;
  const nachricht: RahmenStatus = { typ: 'arch-tools:status', app, name, dirty };
  try {
    window.parent.postMessage(nachricht, window.location.origin);
  } catch {
    // ohne Rahmen nichts zu melden
  }
}

/** Herausgelöstes Fenster: zurück in den Rahmen (der Rahmen öffnet den Tab, dieses Fenster schließt sich) */
export async function andocken(): Promise<void> {
  const app = rahmenApp();
  if (!app) return;
  const [{ emit }, { getCurrentWindow }] = await Promise.all([import('@tauri-apps/api/event'), import('@tauri-apps/api/window')]);
  await emit(ANDOCKEN, { app });
  await getCurrentWindow().close();
}

/* ---------- Speichern auf Anfrage des Rahmens (Rückfrage „Änderungen speichern?“ beim Schließen eines Tabs) ---------- */

const SPEICHERN = 'arch-tools:speichern';
const GESPEICHERT = 'arch-tools:gespeichert';

/** Rahmen: den Tab speichern lassen; true, wenn gespeichert wurde */
export function speichernImTab(frame: HTMLIFrameElement): Promise<boolean> {
  const ziel = frame.contentWindow;
  if (!ziel) return Promise.resolve(false);
  const id = Math.random().toString(36).slice(2);
  return new Promise((fertig) => {
    const hoeren = (e: MessageEvent) => {
      const d = e.data as { typ?: string; id?: string; ok?: boolean } | null;
      if (e.source !== ziel || !d || d.typ !== GESPEICHERT || d.id !== id) return;
      window.removeEventListener('message', hoeren);
      fertig(!!d.ok);
    };
    window.addEventListener('message', hoeren);
    ziel.postMessage({ typ: SPEICHERN, id }, window.location.origin);
  });
}

/** Tab: Speichern-Anfragen des Rahmens beantworten (ohne `speichern`: „nicht gespeichert“). Liefert die Abmeldung. */
export function speichernAnfragenBeantworten(speichern: (() => Promise<boolean | void>) | undefined): () => void {
  if (rahmenModus() !== 'tab') return () => {};
  const hoeren = async (e: MessageEvent) => {
    const d = e.data as { typ?: string; id?: string } | null;
    if (e.source !== window.parent || e.origin !== window.location.origin || !d || d.typ !== SPEICHERN) return;
    let ok = false;
    try {
      ok = speichern ? (await speichern()) !== false : false;
    } catch {
      ok = false;
    }
    window.parent.postMessage({ typ: GESPEICHERT, id: d.id, ok }, window.location.origin);
  };
  window.addEventListener('message', hoeren);
  return () => window.removeEventListener('message', hoeren);
}

/* ---------- Nachrichten zwischen den Apps über den Rahmen (z. B. „Neues Projekt anlegen“ aus jeder App) ---------- */

/** App → Rahmen: den Assistenten von ATLAS für ein neues Projekt starten */
export const PROJEKT_ANLEGEN = 'arch-tools:projekt-anlegen';
/** Rahmen → ATLAS: Assistent für ein neues Projekt (mit der App, aus der der Auftrag kommt) */
export const ASSISTENT_NEU = 'arch-tools:assistent-neu';
/** ATLAS → Rahmen: zurück zu einer App (`an`), mit dem neu angelegten Projektordner (`ordner`) */
export const ZUR_APP = 'arch-tools:zur-app';
/** Rahmen → App: ein neues Projekt wurde angelegt (`ordner`) – Übersicht neu laden, wenn möglich öffnen */
export const PROJEKT_ANGELEGT = 'arch-tools:projekt-angelegt';
/** App → Rahmen: hört jetzt auf Nachrichten (vorher angekommene stellt der Rahmen danach zu) */
export const BEREIT = 'arch-tools:bereit';
/** Kanäle der herausgelösten Fenster (Tauri-Ereignisse) */
export const AN_RAHMEN = 'arch-tools:an-rahmen';
export const AN_APP = 'arch-tools:an-app';

/** Kennung der Projekt-App (ATLAS) im Rahmen */
export const PROJEKT_APP = 'ordner';

export interface RahmenNachricht {
  typ: string;
  /** Absender (Kennung der App) – setzt `anRahmen` */
  app?: string | null;
  /** Empfänger (Kennung der App) */
  an?: string | null;
  /** Auftrag kommt von dieser App (Kennung, Name); `kannOeffnen`: sie öffnet das neue Projekt selbst */
  von?: string | null;
  vonName?: string;
  kannOeffnen?: boolean;
  /** Projektordner (vollständiger Pfad) */
  ordner?: string;
}

const istTauri = () => typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

/** Nachricht an den Rahmen (Tab: postMessage an den Rahmen; herausgelöstes Fenster: Tauri-Ereignis) */
export function anRahmen(n: RahmenNachricht): void {
  const modus = rahmenModus();
  if (!modus) return;
  const nachricht: RahmenNachricht = { ...n, app: rahmenApp() };
  try {
    if (modus === 'tab') window.parent.postMessage(nachricht, window.location.origin);
    else if (istTauri()) void import('@tauri-apps/api/event').then(({ emit }) => emit(AN_RAHMEN, nachricht));
    else window.opener?.postMessage(nachricht, window.location.origin);
  } catch {
    // ohne Rahmen nichts zu melden
  }
}

/**
 * Auf Nachrichten des Rahmens hören (nur in der Rahmen-App). Meldet sich danach mit `BEREIT` beim Rahmen, damit er
 * zwischendurch Angekommenes zustellt. Liefert die Abmeldung.
 */
export function vomRahmen(typ: string, f: (n: RahmenNachricht) => void): () => void {
  const modus = rahmenModus();
  if (!modus) return () => {};
  const app = rahmenApp();
  const passt = (d: RahmenNachricht | null) => !!d && d.typ === typ && (!d.an || d.an === app);
  const hoeren = (e: MessageEvent) => {
    const d = e.data as RahmenNachricht | null;
    if (e.origin !== window.location.origin || (e.source !== window.parent && e.source !== window.opener) || !passt(d)) return;
    f(d!);
  };
  window.addEventListener('message', hoeren);
  let ende: (() => void) | undefined;
  let lebt = true;
  if (modus === 'fenster' && istTauri())
    void import('@tauri-apps/api/event').then(async ({ listen }) => {
      const aus = await listen<RahmenNachricht>(AN_APP, (e) => passt(e.payload) && f(e.payload));
      if (lebt) ende = aus;
      else aus();
      if (lebt) anRahmen({ typ: BEREIT });
    });
  else anRahmen({ typ: BEREIT });
  return () => {
    lebt = false;
    window.removeEventListener('message', hoeren);
    ende?.();
  };
}

/** Lässt sich aus dieser App ein neues Projekt mit dem Assistenten von ATLAS anlegen? (nur in der Rahmen-App) */
export const projektAnlegenMoeglich = (): boolean => rahmenModus() !== null && rahmenApp() !== PROJEKT_APP;

/** Assistenten von ATLAS starten; `kannOeffnen`: diese App öffnet das neue Projekt danach selbst */
export function projektAnlegenStarten(kannOeffnen = false): void {
  anRahmen({ typ: PROJEKT_ANLEGEN, von: rahmenApp(), kannOeffnen });
}
