// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fehlerTeile, Fehlertext } from './Fehlertext';
import type { NetzPruefung } from './Verbindung';
import { befundText, VerbindungDialog } from './Verbindung';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const ZERT =
  'Nicht erreichbar: Das Zertifikat der Verbindung zu www.gesetze-im-internet.de ist auf diesem Rechner nicht vertrauenswürdig – vermutlich prüft eine Firewall …\nTechnische Angabe: https://www.gesetze-im-internet.de/bbaug/xml.zip: Connection Failed: tls connection init failed: invalid peer certificate: UnknownIssuer';

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
  it('Fehlertext: der verständliche Satz sichtbar, die technische Angabe aufklappbar; alte Texte ohne Rohfehler bleiben ganz', () => {
    expect(fehlerTeile(ZERT).satz).toMatch(/^Nicht erreichbar: Das Zertifikat/);
    expect(fehlerTeile(ZERT).technik).toMatch(/UnknownIssuer$/);
    expect(fehlerTeile('Host nicht freigegeben: x.de')).toEqual({ satz: 'Host nicht freigegeben: x.de' });
    const host = zeige(createElement(Fehlertext, { text: ZERT, vorne: 'Text nicht verfügbar – ' }));
    expect(host.querySelector('.br-fehlertext > span')!.textContent).toBe(`Text nicht verfügbar – ${fehlerTeile(ZERT).satz}`);
    const d = host.querySelector<HTMLDetailsElement>('details.br-technik')!;
    expect(d.open).toBe(false);
    expect(d.querySelector('summary')!.textContent).toBe('Technische Angabe');
    expect(d.querySelector('code')!.textContent).toMatch(/invalid peer certificate: UnknownIssuer/);
  });

  it('Dialog: je Quelle erreichbar, Aussteller und Proxy; Befund als Text kopierbar', async () => {
    const pruefen = vi.fn(async () => ergebnis);
    const schreiben = vi.fn(async (_text: string) => undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: schreiben }, configurable: true });
    const host = zeige(createElement(VerbindungDialog, { onClose: () => undefined, pruefen }));
    expect(document.querySelector('[role="status"]')!.textContent).toMatch(/Verbindungen werden geprüft/);
    await act(async () => void (await Promise.resolve()));
    const d = document.querySelector<HTMLElement>('[role="dialog"]')!;
    expect(d.textContent).toContain('Verbindung zu den Rechtsquellen prüfen');
    expect(document.querySelector('[role="status"]')!.textContent).toBe('1 von 2 Quellen nicht erreichbar.');
    const zeilen = [...d.querySelectorAll('tbody tr')];
    expect(zeilen[0].textContent).toContain('nicht erreichbar');
    expect(zeilen[0].textContent).toContain('Firmen-Firewall CA (Beispiel GmbH)');
    expect(zeilen[0].textContent).toContain('Proxy-Skript eingestellt');
    expect(zeilen[0].querySelector('details.br-technik')).not.toBeNull();
    expect(zeilen[1].querySelector('.marke.ok')!.textContent).toBe('erreichbar');
    expect(zeilen[1].textContent).toContain('http://proxy:3128 (Windows)');
    // Befund kopieren
    const kopieren = [...d.querySelectorAll('button')].find((b) => b.textContent === 'Befund kopieren')!;
    await act(async () => kopieren.click());
    const text = schreiben.mock.calls[0][0];
    expect(text).toMatch(/^LEXIO – Verbindung zu den Rechtsquellen, geprüft /);
    expect(text).toContain('www.gesetze-im-internet.de: nicht erreichbar');
    expect(text).toContain('Zertifikat ausgestellt von: Firmen-Firewall CA (Beispiel GmbH)');
    expect(text).toContain('recht.nrw.de: erreichbar (HTTP 200, 80 ms)');
    expect(document.querySelector('[role="status"]')!.textContent).toContain('Befund in die Zwischenablage kopiert.');
    // erneut prüfen
    await act(async () => [...d.querySelectorAll('button')].find((b) => b.textContent === 'Erneut prüfen')!.click());
    await act(async () => void (await Promise.resolve()));
    expect(pruefen).toHaveBeenCalledTimes(2);
    expect(host).toBeTruthy();
  });

  it('befundText: mit Fehler in einer Zeile', () => {
    expect(befundText(ergebnis, new Date('2026-11-25T10:00:00Z'))).toMatch(/Fehler: Nicht erreichbar: Das Zertifikat .* \| Technische Angabe: https/);
  });
});
