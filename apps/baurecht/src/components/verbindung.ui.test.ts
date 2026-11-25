// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fehlerTeile, Fehlertext } from './Fehlertext';
import type { NetzPruefung } from './Verbindung';
import { befundText, proxyText, VerbindungDialog } from './Verbindung';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// Aufbau wie netz_fehler_text in apps/baurecht/src-tauri/src/netz_verbindung.rs
const ZERT = [
  'Zertifikat abgelehnt: Das Zertifikat der Verbindung zu www.gesetze-im-internet.de ist auf diesem Rechner nicht vertrauenswürdig – vermutlich prüft eine Firewall …',
  'Technische Einzelheiten: https://www.gesetze-im-internet.de/bbaug/xml.zip: Connection Failed: tls connection init failed: invalid peer certificate: UnknownIssuer',
].join('\n');
const ABBRUCH = [
  'Nicht erreichbar: Die Verbindung zu testphase.rechtsinformationen.bund.de wurde beim Aufbau abgebrochen – vermutlich blockiert eine Firewall oder ein Proxy sie.',
  'Proxy: http://proxy:3128 (Windows).',
  'Technische Einzelheiten: https://testphase.rechtsinformationen.bund.de/: unexpected end of file',
].join('\n');

const ergebnis: NetzPruefung[] = [
  {
    host: 'www.gesetze-im-internet.de',
    erreichbar: false,
    status: null,
    aussteller: 'Firmen-Firewall CA (Beispiel GmbH)',
    proxy: { proxy: null, quelle: 'keiner', hinweis: 'In Windows ist ein Proxy-Skript eingestellt (http://wpad/proxy.pac) – LEXIO wertet es nicht aus' },
    fehler: ZERT,
    dauerMs: 120,
  },
  {
    host: 'recht.nrw.de',
    erreichbar: true,
    status: 200,
    aussteller: 'ISRG Root X1 (Internet Security Research Group)',
    proxy: { proxy: 'http://proxy:3128', quelle: 'Windows', hinweis: null },
    fehler: null,
    dauerMs: 80,
  },
];

let root: ReturnType<typeof createRoot> | null = null;
function zeige(el: ReturnType<typeof createElement>): HTMLElement {
  const host = document.createElement('div');
  document.body.appendChild(host);
  act(() => {
    root = createRoot(host);
    root.render(el);
  });
  return host;
}
afterEach(() => {
  act(() => root?.unmount());
  document.body.innerHTML = '';
});

describe('Fehler beim Abruf und „Verbindung prüfen“', () => {
  it('Fehlertext: der Satz sichtbar (ohne doppelten Anfang), Proxy dazu, die technischen Einzelheiten aufklappbar wie in core; alte Texte bleiben ganz', () => {
    expect(fehlerTeile(ZERT)).toMatchObject({ art: 'Zertifikat abgelehnt', satz: expect.stringMatching(/^Das Zertifikat/), technik: expect.stringMatching(/UnknownIssuer$/) });
    expect(fehlerTeile(ABBRUCH)).toMatchObject({ art: 'Nicht erreichbar', proxy: 'http://proxy:3128 (Windows).' });
    expect(fehlerTeile('Nicht erreichbar: https://x.de/ (Fehler)')).toEqual({ satz: 'Nicht erreichbar: https://x.de/ (Fehler)' });
    expect(fehlerTeile('Host nicht freigegeben: x.de')).toEqual({ satz: 'Host nicht freigegeben: x.de' });
    const host = zeige(createElement(Fehlertext, { text: ABBRUCH, vorne: 'Text nicht verfügbar.', zu: 'BauGB' }));
    expect(host.querySelector('.br-fehlertext > span')!.textContent).toBe(
      'Text nicht verfügbar. Die Verbindung zu testphase.rechtsinformationen.bund.de wurde beim Aufbau abgebrochen – vermutlich blockiert eine Firewall oder ein Proxy sie. Proxy: http://proxy:3128 (Windows).',
    );
    const d = host.querySelector<HTMLDetailsElement>('details.rf-details')!;
    expect(d.open).toBe(false);
    expect(d.querySelector('summary')!.textContent).toBe('Technische Einzelheiten');
    expect(d.querySelector('summary')!.getAttribute('aria-label')).toBe('Technische Einzelheiten zu BauGB');
    expect(d.querySelector('pre')!.textContent).toMatch(/unexpected end of file/);
  });

  it('Dialog: je Quelle erreichbar, Aussteller und Proxy; Befund kopierbar; „Erneut prüfen“ behält beim Sperren den Fokus', async () => {
    const pruefen = vi.fn(async () => ergebnis);
    const schreiben = vi.fn(async (_text: string) => undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: schreiben }, configurable: true });
    zeige(createElement(VerbindungDialog, { onClose: () => undefined, pruefen }));
    expect(document.querySelector('[role="status"]')!.textContent).toMatch(/Verbindungen werden geprüft/);
    await act(async () => void (await Promise.resolve()));
    const d = document.querySelector<HTMLElement>('[role="dialog"]')!;
    expect(d.textContent).toContain('Verbindung zu Rechtsquellen und Geodiensten prüfen');
    expect(document.querySelector('[role="status"]')!.textContent).toBe('1 von 2 Quellen nicht erreichbar.');
    const zeilen = [...d.querySelectorAll('tbody tr')];
    expect(zeilen[0].querySelector('th[scope="row"]')!.textContent).toBe('www.gesetze-im-internet.de');
    expect(zeilen[0].textContent).toContain('nicht erreichbar');
    expect(zeilen[0].textContent).toContain('Firmen-Firewall CA (Beispiel GmbH)');
    expect(zeilen[0].textContent).toContain('Proxy-Skript eingestellt');
    // unter der Marke nur der Satz – kein zweites „Nicht erreichbar:“; Proxy nur in seiner Spalte
    expect(zeilen[0].querySelector('.br-fehlertext > span')!.textContent).toMatch(/^Das Zertifikat/);
    expect(zeilen[0].querySelector('details.rf-details summary')!.getAttribute('aria-label')).toBe('Technische Einzelheiten zu www.gesetze-im-internet.de');
    expect(zeilen[0].textContent).toContain('kein Proxy');
    expect(zeilen[0].textContent).not.toContain('kein Proxy (keiner)');
    expect(zeilen[1].querySelector('.marke.ok')!.textContent).toBe('erreichbar');
    expect(zeilen[1].textContent).toContain('http://proxy:3128 (Windows)');
    // Befund kopieren
    const knopf = (t: string) => [...d.querySelectorAll('button')].find((b) => b.textContent === t)!;
    await act(async () => knopf('Befund kopieren').click());
    const text = schreiben.mock.calls[0][0];
    expect(text).toMatch(/^LEXIO – Verbindung zu Rechtsquellen und Geodiensten, geprüft /);
    expect(text).toContain('www.gesetze-im-internet.de: nicht erreichbar');
    expect(text).toContain('Zertifikat ausgestellt von: Firmen-Firewall CA (Beispiel GmbH)');
    expect(text).toContain('recht.nrw.de: erreichbar (HTTP 200, 80 ms)');
    expect(document.querySelector('[role="status"]')!.textContent).toContain('Befund in die Zwischenablage kopiert.');
    // erneut prüfen: während der Prüfung gesperrt (aria-disabled), der Fokus bleibt am Knopf, ein zweiter Klick startet nichts
    const erneut = knopf('Erneut prüfen');
    let fertig: (r: NetzPruefung[]) => void = () => undefined;
    pruefen.mockImplementationOnce(() => new Promise<NetzPruefung[]>((r) => (fertig = r)));
    act(() => erneut.focus());
    await act(async () => erneut.click());
    expect(erneut.getAttribute('aria-disabled')).toBe('true');
    expect(document.activeElement).toBe(erneut);
    await act(async () => erneut.click());
    expect(pruefen).toHaveBeenCalledTimes(2);
    await act(async () => fertig(ergebnis));
    expect(erneut.getAttribute('aria-disabled')).toBeNull();
  });

  it('Kopieren gescheitert: als Alarm, nicht still angehängt', async () => {
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: async () => Promise.reject(new Error('verweigert')) }, configurable: true });
    zeige(createElement(VerbindungDialog, { onClose: () => undefined, pruefen: async () => ergebnis }));
    await act(async () => void (await Promise.resolve()));
    await act(async () => [...document.querySelectorAll('button')].find((b) => b.textContent === 'Befund kopieren')!.click());
    expect(document.querySelector('[role="alert"]')!.textContent).toBe('Kopieren fehlgeschlagen: verweigert');
  });

  it('scheitert die ganze Prüfung, steht der Grund in der stehenden Region (angesagt)', async () => {
    zeige(createElement(VerbindungDialog, { onClose: () => undefined, pruefen: async () => Promise.reject(new Error('Befehl nicht verfügbar')) }));
    await act(async () => void (await Promise.resolve()));
    expect(document.querySelector('[role="status"]')!.textContent).toBe('Prüfung nicht möglich: Befehl nicht verfügbar');
  });

  it('befundText: Fehler in einer Zeile; Proxy in Worten', () => {
    expect(befundText(ergebnis, new Date('2026-11-25T10:00:00Z'))).toMatch(/Fehler: Zertifikat abgelehnt: Das Zertifikat .* \| Technische Einzelheiten: https/);
    expect(proxyText({ proxy: null, quelle: 'Ausnahme in Windows' })).toBe('kein Proxy – Ausnahme in Windows');
    expect(proxyText({ proxy: null, quelle: 'keiner' })).toBe('kein Proxy');
    expect(proxyText({ proxy: 'http://p:1', quelle: 'Umgebung' })).toBe('http://p:1 (Umgebung)');
  });
});
