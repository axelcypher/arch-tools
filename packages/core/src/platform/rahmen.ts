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

import { logger } from './log';

const log = logger('rahmen');

export type RahmenModus = 'tab' | 'fenster' | null;

/** Nachricht eines Tabs bzw. herausgelösten Fensters an den Rahmen */
export interface RahmenStatus {
  typ: 'arch-tools:status';
  /** Name der App (TitleBar) */
  app: string;
  /** Kennung der App (nur aus herausgelösten Fenstern – beim Tab erkennt der Rahmen sie am Absender) */
  kennung?: string | null;
  /** Name des geöffneten Projekts */
  name: string;
  dirty: boolean;
  /**
   * Satz für die Rückfrage bei ungespeicherten Änderungen, z. B. „Das LV hat ungespeicherte Änderungen.“; leer oder
   * länger als UNGESPEICHERT_MAX Zeichen: der allgemeine
   */
  ungespeichert?: string;
}

/** Höchstlänge des Satzes `ungespeichert` (RahmenStatus), den die Rahmen-App übernimmt */
export const UNGESPEICHERT_MAX = 200;
/** Satz `ungespeichert` geprüft: gekürzt, nicht leer, höchstens UNGESPEICHERT_MAX Zeichen – sonst undefined (allgemeiner Satz) */
export function ungespeichertSatz(satz: unknown): string | undefined {
  const s = typeof satz === 'string' ? satz.trim() : '';
  return s && s.length <= UNGESPEICHERT_MAX ? s : undefined;
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

/**
 * Im Tab bzw. herausgelösten Fenster: Name und ungespeicherte Änderungen an den Rahmen melden; `ungespeichert`: Satz für
 * dessen Rückfrage beim Schließen (siehe RahmenStatus)
 */
export function anRahmenMelden(app: string, name: string, dirty: boolean, ungespeichert?: string): void {
  const modus = rahmenModus();
  if (!modus) return;
  const nachricht: RahmenStatus = { typ: 'arch-tools:status', app, name, dirty, ...(ungespeichert ? { ungespeichert } : {}) };
  try {
    if (modus === 'tab') window.parent.postMessage(nachricht, window.location.origin);
    else if (istTauri()) void import('@tauri-apps/api/event').then(({ emit }) => emit(AN_RAHMEN, { ...nachricht, kennung: rahmenApp() }));
  } catch {
    // ohne Rahmen nichts zu melden
  }
}

/**
 * Was beim Herauslösen bzw. Andocken (die App startet dabei neu) aus ungespeicherten Änderungen wird – je Kennung.
 * `verliert`: sie gehen verloren (dann bietet die Rückfrage „Speichern“ an).
 */
export const BEIM_UMZUG: Record<string, { text: string; verliert: boolean }> = {
  ordner: { text: 'Ungespeicherte Änderungen gehen verloren – bitte vorher speichern.', verliert: true },
  formulare: {
    text: 'Nicht gespeicherte Eingaben bleiben als Entwurf erhalten und erscheinen beim erneuten Öffnen des Formulars wieder; ungespeicherte Bearbeitungen in PDF-, Excel- und Word-Dokumenten der Dateiansicht gehen verloren.',
    verliert: false,
  },
  ava: { text: 'Ungespeicherte Änderungen am LV gehen verloren – bitte vorher speichern (alles andere speichert die App sofort).', verliert: true },
  baurecht: { text: 'Ungespeicherte Angaben und Festlegungen gehen verloren – bitte vorher speichern.', verliert: true },
};
const ZWISCHENSTAND = { text: 'Ungespeicherte Änderungen bleiben im Zwischenstand und werden im neuen Fenster wiederhergestellt.', verliert: false };
/** Umzug einer App (Kennung): Text und ob Änderungen verloren gehen */
export const beimUmzug = (kennung: string | null) => (kennung && BEIM_UMZUG[kennung]) || ZWISCHENSTAND;

/**
 * Herausgelöstes Fenster: zurück in den Rahmen (der Rahmen öffnet den Tab, dieses Fenster verschwindet). Die Rückfrage
 * zu ungespeicherten Änderungen kommt vorher (TitleBar) – `destroy` statt `close`, damit sie nicht ein zweites Mal kommt.
 */
export async function andocken(): Promise<void> {
  const app = rahmenApp();
  if (!app) return;
  const [{ emit }, { getCurrentWindow }] = await Promise.all([import('@tauri-apps/api/event'), import('@tauri-apps/api/window')]);
  await emit(ANDOCKEN, { app });
  await getCurrentWindow().destroy();
}

/* ---------- Speichern auf Anfrage des Rahmens (Rückfrage „Änderungen speichern?“ beim Schließen, Beenden, Update) ---------- */

const SPEICHERN = 'arch-tools:speichern';
/** Antwort sofort beim Empfang: die App hat die Anfrage – danach darf das Speichern (mit Dialogen) dauern */
const SPEICHERT = 'arch-tools:speichert';
const GESPEICHERT = 'arch-tools:gespeichert';
/** so lange wartet der Rahmen auf die Empfangsbestätigung, sonst gilt „nicht gespeichert“ (App lädt, hängt, hört nicht) */
export const SPEICHERN_ANTWORT_MS = 3000;

interface SpeichernAntwort {
  typ?: string;
  anfrage?: string;
  ok?: boolean;
}

/** Wahl beim Speichern auf Anfrage */
export interface SpeichernOptionen {
  /** keine Empfangsbestätigung binnen SPEICHERN_ANTWORT_MS (z. B. für eine Meldung „antwortet nicht“) */
  zeitablauf?: () => void;
  /** meldet das Ende des Ziels (Fenster geschlossen, Tab neu geladen): dann gilt „nicht gespeichert“; liefert die Abmeldung */
  beiEnde?: (f: () => void) => () => void;
}

/**
 * gemeinsamer Ablauf: Anfrage senden, auf Empfang (mit Zeitlimit) und Ergebnis warten. `hoeren` ist schon angemeldet,
 * bevor gesendet wird – sonst ginge eine schnelle Antwort verloren.
 */
function speichernAnfragen(senden: (anfrage: string) => void, hoeren: (f: (d: SpeichernAntwort) => void) => () => void, o: SpeichernOptionen = {}): Promise<boolean> {
  const anfrage = Math.random().toString(36).slice(2);
  return new Promise((fertig) => {
    const aus: (() => void)[] = [];
    let offen = true;
    const schluss = (ok: boolean) => {
      if (!offen) return;
      offen = false;
      clearTimeout(uhr);
      aus.forEach((f) => f());
      fertig(ok);
    };
    const uhr = setTimeout(() => {
      o.zeitablauf?.();
      schluss(false);
    }, SPEICHERN_ANTWORT_MS);
    aus.push(
      hoeren((d) => {
        if (d.anfrage !== anfrage) return;
        if (d.typ === SPEICHERT) clearTimeout(uhr);
        else if (d.typ === GESPEICHERT) schluss(!!d.ok);
      }),
    );
    if (o.beiEnde) aus.push(o.beiEnde(() => schluss(false)));
    if (offen) senden(anfrage);
  });
}

/** Rahmen: den Tab speichern lassen; true, wenn gespeichert wurde (false auch, wenn die App nicht antwortet oder neu lädt) */
export function speichernImTab(frame: HTMLIFrameElement, o: SpeichernOptionen = {}): Promise<boolean> {
  const ziel = frame.contentWindow;
  if (!ziel) return Promise.resolve(false);
  return speichernAnfragen(
    (anfrage) => ziel.postMessage({ typ: SPEICHERN, anfrage }, window.location.origin),
    (f) => {
      const hoeren = (e: MessageEvent) => {
        if (e.source === ziel && e.data) f(e.data as SpeichernAntwort);
      };
      window.addEventListener('message', hoeren);
      return () => window.removeEventListener('message', hoeren);
    },
    {
      ...o,
      // lädt der Tab neu (Absturz, „Neu laden“), kommt keine Antwort mehr
      beiEnde: (f) => {
        const weg = o.beiEnde?.(f);
        frame.addEventListener('load', f);
        return () => {
          weg?.();
          frame.removeEventListener('load', f);
        };
      },
    },
  );
}

/** Rahmen: ein herausgelöstes Fenster (Kennung) speichern lassen; true, wenn gespeichert wurde */
export async function speichernImFenster(kennung: string, o: SpeichernOptionen = {}): Promise<boolean> {
  const { emit, listen } = await import('@tauri-apps/api/event');
  // erst anmelden, dann senden
  let weiter: (d: SpeichernAntwort) => void = () => {};
  const aus = await listen<SpeichernAntwort & { app?: string }>(AN_RAHMEN, (e) => e.payload?.app === kennung && weiter(e.payload));
  return speichernAnfragen(
    (anfrage) => void emit(AN_APP, { typ: SPEICHERN, anfrage, an: kennung }),
    (f) => {
      weiter = f;
      return aus;
    },
    o,
  );
}

/** Tab bzw. Fenster: Speichern-Anfragen des Rahmens beantworten (ohne `speichern`: „nicht gespeichert“). Liefert die Abmeldung. */
export function speichernAnfragenBeantworten(speichern: (() => Promise<boolean | void>) | undefined): () => void {
  const modus = rahmenModus();
  if (!modus) return () => {};
  const beantworten = async (anfrage: string | undefined, antworten: (d: SpeichernAntwort) => void) => {
    antworten({ typ: SPEICHERT, anfrage });
    let ok = false;
    try {
      ok = speichern ? (await speichern()) !== false : false;
    } catch {
      ok = false;
    }
    antworten({ typ: GESPEICHERT, anfrage, ok });
  };
  if (modus === 'fenster') {
    if (!istTauri()) return () => {};
    const app = rahmenApp();
    let aus: (() => void) | undefined;
    let lebt = true;
    void import('@tauri-apps/api/event').then(async ({ emit, listen }) => {
      const u = await listen<RahmenNachricht & { anfrage?: string }>(AN_APP, (e) => {
        if (e.payload?.typ === SPEICHERN && e.payload.an === app) void beantworten(e.payload.anfrage, (d) => void emit(AN_RAHMEN, { ...d, app }));
      });
      if (lebt) aus = u;
      else u();
    });
    return () => {
      lebt = false;
      aus?.();
    };
  }
  const hoeren = (e: MessageEvent) => {
    const d = e.data as { typ?: string; anfrage?: string } | null;
    if (e.source !== window.parent || e.origin !== window.location.origin || !d || d.typ !== SPEICHERN) return;
    void beantworten(d.anfrage, (a) => window.parent.postMessage(a, window.location.origin));
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

/* ---------- Vor dem Schließen: ausstehendes Schreiben abwarten (z. B. verzögertes Speichern) ---------- */

/** so lange warten Schließen, Andocken, Herauslösen und Update-Neustart höchstens auf ausstehendes Schreiben */
export const VORBEREITEN_MS = 5000;
const VORBEREITEN = 'arch-tools:vorbereiten';
const VORBEREITET = 'arch-tools:vorbereitet';

/** Ergebnis des Abwartens: fertig, Zeitlimit überschritten oder gescheitert (z. B. Netzlaufwerk weg) */
export type Vorbereitet = 'fertig' | 'zeitlimit' | 'fehler';

const vorbereitungen = new Set<() => Promise<void | boolean> | void | boolean>();

/**
 * App: etwas, das vor dem Ende dieses Fensters bzw. Tabs noch fertig werden muss – etwa ein verzögertes Schreiben
 * (sofort ausführen und abwarten). Läuft vor dem Schließen (× und System), Andocken, Herauslösen, Schließen des Tabs und
 * dem Update-Neustart, auch wenn keine ungespeicherten Änderungen gemeldet sind. Sie kann mehrfach aufgerufen werden
 * (etwa nach „Weiter warten“ bzw. „Erneut versuchen“): Läuft noch ein Schreiben, soll sie es abwarten statt doppelt zu
 * schreiben; ist das letzte gescheitert, muss sie neu schreiben bzw. weiter `false` liefern, solange nichts gespeichert
 * ist. Liefert sie `false` oder scheitert sie (Promise abgelehnt), gilt das als „nicht gespeichert“ – die App fragt dann
 * nach, statt zu schließen. Liefert die Abmeldung.
 */
export function vorDemSchliessen(f: () => Promise<void | boolean> | void | boolean): () => void {
  vorbereitungen.add(f);
  return () => vorbereitungen.delete(f);
}

/** dieses Fenster bzw. dieser Tab: alle Vorbereitungen ausführen und abwarten (höchstens `ms`) */
export function schliessenVorbereiten(ms = VORBEREITEN_MS): Promise<Vorbereitet> {
  if (!vorbereitungen.size) return Promise.resolve('fertig');
  const alle = Promise.allSettled([...vorbereitungen].map((f) => Promise.resolve().then(f)));
  return new Promise((fertig) => {
    const uhr = setTimeout(() => fertig('zeitlimit'), ms);
    // jede Vorbereitung einzeln abwarten (eine, die sofort scheitert, schneidet die anderen nicht ab), Gründe protokollieren
    void alle.then((ergebnisse) => {
      clearTimeout(uhr);
      for (const e of ergebnisse) if (e.status === 'rejected') log.warn('Vorbereitung vor dem Schließen gescheitert', e.reason);
      fertig(ergebnisse.some((e) => e.status === 'rejected' || e.value === false) ? 'fehler' : 'fertig');
    });
  });
}

const alsVorbereitet = (x: unknown): Vorbereitet => (x === 'fertig' || x === 'zeitlimit' || x === 'fehler' ? x : 'fehler');

/** Rahmen: hat der Tab etwas vorzubereiten? (sonst schließt er ohne Warten) */
export function tabBrauchtVorbereitung(frame: HTMLIFrameElement | undefined): boolean {
  try {
    return !!(frame?.contentWindow as (Window & { __archToolsVorbereitenNoetig?: () => boolean }) | null)?.__archToolsVorbereitenNoetig?.();
  } catch {
    return false;
  }
}

/** Rahmen: einen Tab vorbereiten lassen (gleicher Ursprung – direkter Aufruf) */
export function vorbereitenImTab(frame: HTMLIFrameElement, ms = VORBEREITEN_MS): Promise<Vorbereitet> {
  try {
    const f = (frame.contentWindow as (Window & { __archToolsVorbereiten?: (ms: number) => Promise<Vorbereitet> }) | null)?.__archToolsVorbereiten;
    if (!f) return Promise.resolve('fertig');
    // der Tab hält sein eigenes Zeitlimit; hängt er ganz, greift dieses
    return new Promise((fertig) => {
      const uhr = setTimeout(() => fertig('zeitlimit'), ms + 500);
      f(ms).then(
        (e) => (clearTimeout(uhr), fertig(alsVorbereitet(e))),
        () => (clearTimeout(uhr), fertig('fehler')),
      );
    });
  } catch {
    return Promise.resolve('fehler');
  }
}

/** Rahmen: ein herausgelöstes Fenster (Kennung) vorbereiten lassen; ohne Antwort wie Zeitlimit */
export async function vorbereitenImFenster(kennung: string, ms = VORBEREITEN_MS): Promise<Vorbereitet> {
  const { emit, listen } = await import('@tauri-apps/api/event');
  const anfrage = Math.random().toString(36).slice(2);
  let fertig: (e: Vorbereitet) => void = () => {};
  const antwort = new Promise<Vorbereitet>((f) => (fertig = f));
  const aus = await listen<{ typ?: string; anfrage?: string; ergebnis?: string; ok?: boolean }>(
    AN_RAHMEN,
    (e) => e.payload?.typ === VORBEREITET && e.payload.anfrage === anfrage && fertig(alsVorbereitet(e.payload.ergebnis ?? (e.payload.ok ? 'fertig' : 'zeitlimit'))),
  );
  try {
    await emit(AN_APP, { typ: VORBEREITEN, anfrage, an: kennung });
    // ohne Antwort (Fenster hängt, alte Fassung): wie Zeitablauf
    return await Promise.race([antwort, new Promise<Vorbereitet>((f) => setTimeout(() => f('zeitlimit'), ms + 1000))]);
  } finally {
    aus();
  }
}

/** Tab bzw. Fenster: Vorbereitungs-Anfragen des Rahmens beantworten (TitleBar richtet das ein). Liefert die Abmeldung. */
export function vorbereitenAnfragenBeantworten(): () => void {
  const modus = rahmenModus();
  if (modus === 'tab') {
    const w = window as Window & { __archToolsVorbereiten?: (ms: number) => Promise<Vorbereitet>; __archToolsVorbereitenNoetig?: () => boolean };
    w.__archToolsVorbereiten = (ms) => schliessenVorbereiten(ms);
    w.__archToolsVorbereitenNoetig = () => vorbereitungen.size > 0;
    return () => {
      delete w.__archToolsVorbereiten;
      delete w.__archToolsVorbereitenNoetig;
    };
  }
  if (modus !== 'fenster' || !istTauri()) return () => {};
  const app = rahmenApp();
  let aus: (() => void) | undefined;
  let lebt = true;
  void import('@tauri-apps/api/event').then(async ({ emit, listen }) => {
    const u = await listen<RahmenNachricht & { anfrage?: string }>(AN_APP, (e) => {
      if (e.payload?.typ !== VORBEREITEN || e.payload.an !== app) return;
      void schliessenVorbereiten().then((ergebnis) => emit(AN_RAHMEN, { typ: VORBEREITET, anfrage: e.payload.anfrage, ergebnis, app }));
    });
    if (lebt) aus = u;
    else u();
  });
  return () => {
    lebt = false;
    aus?.();
  };
}
