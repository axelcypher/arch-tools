// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  anRahmenMelden,
  beimUmzug,
  rahmenApp,
  rahmenModus,
  schliessenVorbereiten,
  SPEICHERN_ANTWORT_MS,
  speichernImTab,
  tabBrauchtVorbereitung,
  VORBEREITEN_MS,
  vorbereitenImTab,
  vorDemSchliessen,
} from './rahmen';

afterEach(() => window.history.replaceState(null, '', '/'));

describe('Rahmen-App: Modus der App', () => {
  it('eigenständig, herausgelöstes Fenster; Tab nur in einem Rahmen', () => {
    expect(rahmenModus()).toBeNull();
    window.history.replaceState(null, '', '/?rahmen=fenster&app=formulare');
    expect(rahmenModus()).toBe('fenster');
    expect(rahmenApp()).toBe('formulare');
    // ohne umgebenden Rahmen ist „tab“ in der Adresse kein Tab
    window.history.replaceState(null, '', '/?rahmen=tab&app=formulare');
    expect(rahmenModus()).toBeNull();
    const melden = vi.spyOn(window.parent, 'postMessage');
    anRahmenMelden('Formulare', 'BS5', true);
    expect(melden).not.toHaveBeenCalled();
  });
});

describe('Rahmen-App: Speichern auf Anfrage', () => {
  /** Tab-Ersatz: beantwortet Anfragen wie speichernAnfragenBeantworten (oder gar nicht) */
  const tab = (antwort: ((d: { typ: string; anfrage: string }, an: (x: object) => void) => void) | null) => {
    const ziel = {
      postMessage: (d: { typ: string; anfrage: string }) =>
        antwort?.(d, (x) => window.dispatchEvent(new MessageEvent('message', { data: x, source: ziel as unknown as Window, origin: window.location.origin }))),
    };
    return Object.assign(new EventTarget(), { contentWindow: ziel }) as unknown as HTMLIFrameElement;
  };
  afterEach(() => vi.useRealTimers());

  it('antwortet die App nicht (lädt, hängt), gilt nach dem Zeitlimit „nicht gespeichert“', async () => {
    vi.useFakeTimers();
    const ergebnis = speichernImTab(tab(null));
    vi.advanceTimersByTime(SPEICHERN_ANTWORT_MS + 1);
    await expect(ergebnis).resolves.toBe(false);
  });

  it('nach der Empfangsbestätigung darf das Speichern (mit Dialog) dauern', async () => {
    vi.useFakeTimers();
    let fertig: (() => void) | undefined;
    const ergebnis = speichernImTab(
      tab((d, an) => {
        an({ typ: 'arch-tools:speichert', anfrage: d.anfrage });
        fertig = () => an({ typ: 'arch-tools:gespeichert', anfrage: d.anfrage, ok: true });
      }),
    );
    vi.advanceTimersByTime(SPEICHERN_ANTWORT_MS * 10);
    fertig!();
    await expect(ergebnis).resolves.toBe(true);
  });

  it('lädt der Tab neu, während er speichert, gilt „nicht gespeichert“; ohne Bestätigung meldet sich der Zeitablauf', async () => {
    vi.useFakeTimers();
    const frame = Object.assign(new EventTarget(), {
      contentWindow: {
        postMessage: (d: { anfrage: string }) =>
          window.dispatchEvent(new MessageEvent('message', { data: { typ: 'arch-tools:speichert', anfrage: d.anfrage }, source: frame.contentWindow as unknown as Window })),
      },
    });
    const ergebnis = speichernImTab(frame as unknown as HTMLIFrameElement);
    frame.dispatchEvent(new Event('load'));
    await expect(ergebnis).resolves.toBe(false);
    const zeitablauf = vi.fn();
    const still = speichernImTab(tab(null), { zeitablauf });
    vi.advanceTimersByTime(SPEICHERN_ANTWORT_MS + 1);
    await expect(still).resolves.toBe(false);
    expect(zeitablauf).toHaveBeenCalledTimes(1);
  });

  it('fremde Antworten (andere Anfrage) zählen nicht', async () => {
    vi.useFakeTimers();
    const ergebnis = speichernImTab(tab((_d, an) => an({ typ: 'arch-tools:gespeichert', anfrage: 'andere', ok: true })));
    vi.advanceTimersByTime(SPEICHERN_ANTWORT_MS + 1);
    await expect(ergebnis).resolves.toBe(false);
  });

  it('was beim Umzug aus Änderungen wird: ATLAS und FABRIO verlieren sie, die übrigen nicht', () => {
    expect(beimUmzug('ordner').verliert).toBe(true);
    expect(beimUmzug('ava').verliert).toBe(true);
    expect(beimUmzug('formulare').verliert).toBe(false);
    expect(beimUmzug('kosten')).toEqual({ text: expect.stringContaining('Zwischenstand'), verliert: false });
    expect(beimUmzug(null).verliert).toBe(false);
  });
});

describe('Rahmen-App: vor dem Schließen ausstehendes Schreiben abwarten', () => {
  afterEach(() => vi.useRealTimers());

  it('ohne Vorbereitungen sofort; sonst alle abwarten; ein Fehler zählt als fertig; danach abgemeldet', async () => {
    await expect(schliessenVorbereiten()).resolves.toBe(true);
    const reihenfolge: string[] = [];
    const aus1 = vorDemSchliessen(async () => void reihenfolge.push('a'));
    const aus2 = vorDemSchliessen(() => {
      reihenfolge.push('b');
      throw new Error('Netzlaufwerk weg');
    });
    await expect(schliessenVorbereiten()).resolves.toBe(true);
    expect(reihenfolge.sort()).toEqual(['a', 'b']);
    aus1();
    aus2();
    reihenfolge.length = 0;
    await schliessenVorbereiten();
    expect(reihenfolge).toEqual([]);
  });

  it('hängt das Schreiben, gilt nach dem Zeitlimit „nicht fertig“', async () => {
    vi.useFakeTimers();
    const aus = vorDemSchliessen(() => new Promise<void>(() => {}));
    const ergebnis = schliessenVorbereiten();
    vi.advanceTimersByTime(VORBEREITEN_MS + 1);
    await expect(ergebnis).resolves.toBe(false);
    aus();
  });

  it('Tab ohne Antwort: nach dem Zeitlimit „nicht fertig“; ohne Vorbereitung im Tab sofort', async () => {
    vi.useFakeTimers();
    const haengt = { contentWindow: { __archToolsVorbereiten: () => new Promise<boolean>(() => {}), __archToolsVorbereitenNoetig: () => true } } as unknown as HTMLIFrameElement;
    expect(tabBrauchtVorbereitung(haengt)).toBe(true);
    const ergebnis = vorbereitenImTab(haengt, 1000);
    vi.advanceTimersByTime(1600);
    await expect(ergebnis).resolves.toBe(false);
    const leer = { contentWindow: {} } as unknown as HTMLIFrameElement;
    expect(tabBrauchtVorbereitung(leer)).toBe(false);
    await expect(vorbereitenImTab(leer)).resolves.toBe(true);
  });
});
