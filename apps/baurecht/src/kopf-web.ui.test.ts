// @vitest-environment happy-dom
// Kopf in der Web-Version (ohne Tauri): keine festen Punkte in „Mehr“, Einträge nur, wenn sie etwas melden
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readProjectFile } from '@core/archive';
import { projektdateiRoh } from '@core/projektdatei';

vi.mock('@core/platform/files', async (original) => ({
  ...(await original<typeof import('@core/platform/files')>()),
  isTauri: () => false,
}));

const { Kopf } = await import('./components/Kopf');
const { beispielOap } = await import('./beispiel.test');
const { useBaurecht } = await import('./store');
const { auswertungMit, pruefstandBerechnen } = await import('./pruefung');

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: ReturnType<typeof createRoot> | null = null;
afterEach(() => {
  act(() => root?.unmount());
  document.body.innerHTML = '';
});

function render(vorher?: () => void): HTMLElement {
  const bytes = beispielOap();
  useBaurecht.getState().projektSetzen({ art: 'datei', name: 'EFH.oap', bytes }, readProjectFile(bytes), projektdateiRoh(bytes));
  vorher?.();
  const s = useBaurecht.getState();
  const stand = pruefstandBerechnen(s.paket, s.project, s.merkmale, s.pruefung.fakten, {}, '2026-12-01', {});
  const host = document.createElement('div');
  document.body.appendChild(host);
  act(() => {
    root = createRoot(host);
    root.render(
      createElement(Kopf, { stand, onRechtsstand: () => undefined, onLage: () => undefined, onProtokoll: () => undefined, onSpeichern: () => undefined, onAntrag: () => undefined, lageLaeuft: false }),
    );
  });
  return host;
}

const eintraege = (host: HTMLElement) => [...host.querySelectorAll<HTMLElement>('.br-kopf > [data-eintrag]')].map((e) => e.dataset.eintrag);

describe('Kopf (Web-Version)', () => {
  it('„Mehr“ ohne feste Punkte verborgen; keine Knöpfe für Lage und Rechtsstand; der Rechtsstand nennt die Web-Version', () => {
    const host = render();
    expect(host.querySelector<HTMLElement>('.br-kopf .leiste-mehr')!.hidden).toBe(true);
    const texte = [...host.querySelectorAll('button')].map((b) => b.textContent?.trim());
    expect(texte).not.toContain('Lage abfragen');
    expect(texte).not.toContain('Rechtsstand prüfen');
    const rs = host.querySelector('.br-kopf > [data-eintrag="rechtsstand"] .br-rechtsstand')!;
    expect(rs.getAttribute('aria-live')).toBe('polite');
    expect(rs.textContent).toBe('Web-Version: ohne Gesetzestexte');
    // keine Warnungen zum Rechtsstand in der Web-Version
    expect(eintraege(host)).not.toContain('warnungen');
  });

  it('Marken der Module nur, wenn sie etwas melden', () => {
    // Beispiel: Gemeindeschlüssel nur vorgeschlagen → Marke „Gemeinde unbestätigt“
    const mitMarke = render();
    expect(eintraege(mitMarke)).toContain('modul-marken');
    expect(mitMarke.querySelector('.br-kopf > [data-eintrag="modul-marken"]')!.textContent).toContain('Gemeinde unbestätigt');
    act(() => root?.unmount());
    document.body.innerHTML = '';
    // Gemeindeschlüssel bestätigt, Koordinaten vorhanden, alle Ebenen da → keine Marke, kein Eintrag
    const ohne = render(() => {
      const ags = auswertungMit(useBaurecht.getState().pruefung.fakten).fakten['lage.ags'];
      useBaurecht.getState().faktBestaetigen('lage.ags', ags, 'TP', 'Auskunft der Gemeinde vom 12.11.2026');
    });
    expect(ohne.querySelector('.br-kopf > [data-eintrag="modul-marken"]')?.textContent ?? '').toBe('');
    expect(eintraege(ohne)).not.toContain('modul-marken');
    expect(eintraege(ohne)).toEqual(['speichern', 'antrag', 'einreichung', 'module', 'rechtsstand', 'protokoll']);
  });
});
