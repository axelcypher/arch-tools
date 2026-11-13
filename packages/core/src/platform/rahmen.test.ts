// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { anRahmenMelden, beimUmzug, rahmenApp, rahmenModus, SPEICHERN_ANTWORT_MS, speichernImTab } from './rahmen';

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
    return { contentWindow: ziel } as unknown as HTMLIFrameElement;
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
