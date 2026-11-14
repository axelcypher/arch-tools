// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { IfcImportDialog } from './IfcImportDialog';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const lesen = vi.hoisted(() => ({ ergebnis: null as unknown, fehler: null as Error | null }));
vi.mock('@core/platform/files', async (orig) => ({
  ...(await orig<typeof import('@core/platform/files')>()),
  pickFile: async () => new File([new Uint8Array([1, 2, 3])], 'modell.ifc'),
}));
vi.mock('@core/platform/ifc', () => ({
  loadIfc: async () => {
    if (lesen.fehler) throw lesen.fehler;
    return lesen.ergebnis;
  },
  ifcReference: () => null,
}));

// das große WebAssembly-Modul wird im Test nicht gebraucht (loadIfc ist ersetzt)
vi.mock('web-ifc', () => ({}));

let root: ReturnType<typeof createRoot> | null = null;
function oeffnen(): HTMLElement {
  const host = document.createElement('div');
  document.body.appendChild(host);
  act(() => {
    root = createRoot(host);
    root.render(createElement(IfcImportDialog, { onClose: () => undefined }));
  });
  return host;
}
async function dateiWaehlen(host: HTMLElement) {
  const knopf = [...host.querySelectorAll('button')].find((b) => b.textContent?.includes('IFC-Datei wählen'))!;
  await act(async () => knopf.click());
  // Laden läuft asynchron (dynamische Importe): warten, bis der Ladeschritt vorbei ist
  for (let i = 0; i < 100 && host.querySelector('.busy'); i++) await act(async () => new Promise((r) => setTimeout(r, 20)));
}
afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.innerHTML = '';
  lesen.ergebnis = null;
  lesen.fehler = null;
});

describe('IFC-Import (Dialog)', () => {
  it('ist ein Dialog mit Namen; der Hauptknopf „IFC-Datei wählen …“ hat den Fokus, nicht „Abbrechen“', () => {
    const host = oeffnen();
    const dlg = host.querySelector('[role="dialog"]');
    expect(document.getElementById(dlg!.getAttribute('aria-labelledby')!)?.textContent).toBe('IFC-Import');
    expect(document.activeElement?.textContent).toContain('IFC-Datei wählen');
  });

  it('Einleitung neutral („aus dem CAD-Programm“); nur die Export-Anleitung nennt ein bestimmtes Programm', () => {
    const host = oeffnen();
    const absaetze = [...host.querySelectorAll('[role="dialog"] p')].map((p) => p.textContent ?? '');
    expect(absaetze[0]).toContain('aus dem CAD-Programm');
    // Gegenprobe: keine Herstellerliste in der Einleitung
    expect(absaetze[0]).not.toMatch(/Archicad|Revit|Vectorworks/);
    // erlaubt: Schritt-für-Schritt-Anleitung zum Export aus einem bestimmten Programm
    expect(absaetze[1]).toMatch(/^Export aus Archicad: Datei → Speichern unter → IFC/);
  });

  it('unlesbare Datei: Klartext statt Ausnahmetext', async () => {
    lesen.fehler = new TypeError("Cannot read properties of undefined (reading 'arguments')");
    const host = oeffnen();
    await dateiWaehlen(host);
    const meldung = host.querySelector('[role="alert"]')?.textContent ?? '';
    expect(meldung).toContain('keine gültige IFC-Datei');
    expect(meldung).not.toContain('Cannot read'); // Gegenprobe: technischer Text bleibt im Protokoll
  });

  it('Datei ohne Geschosse wird eigens gemeldet; mit Geschossen erscheinen die Optionen, oberstes Geschoss oben, Einzahl richtig', async () => {
    lesen.ergebnis = { schema: 'IFC4', projectName: 'X', storeys: [], spaces: [], elements: [] };
    let host = oeffnen();
    await dateiWaehlen(host);
    expect(host.querySelector('[role="alert"]')?.textContent).toContain('keine Geschosse');
    act(() => root?.unmount());
    document.body.innerHTML = '';
    const eg = { expressId: 1, name: 'EG', elevation: 0 };
    const og = { expressId: 2, name: 'OG', elevation: 3 };
    lesen.ergebnis = { schema: 'IFC4', projectName: 'X', storeys: [eg, og], spaces: [{ storey: 0 }], elements: [{}] };
    host = oeffnen();
    await dateiWaehlen(host);
    expect(host.querySelector('[role="alert"]')).toBeNull();
    expect([...host.querySelectorAll('.ifc-storeys li')].map((l) => l.textContent?.split(' ')[0])).toEqual(['OG', 'EG']);
    expect(host.textContent).toContain('1 Raum/Zone, 1 Bauteil');
    expect(host.textContent).toContain('(± 0,00 m, 1 Raum)');
    expect(host.querySelector('legend')?.textContent).toBe('Art des Imports');
    expect(document.activeElement?.textContent).toBe('Importieren');
  });
});
