// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

// Notbetrieb: der zentrale Dialog meldet den Grund über useEinstellungenGesperrt
vi.mock('@core/ui/Einstellungen', async (original) => ({
  ...(await original<typeof import('@core/ui/Einstellungen')>()),
  useEinstellungenGesperrt: () => 'Das Netzlaufwerk mit den Einstellungen ist nicht erreichbar.',
}));

const { PermioSeite } = await import('./components/Einstellungen');

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: ReturnType<typeof createRoot> | null = null;
afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.innerHTML = '';
});

describe('Seite PERMIO im Notbetrieb', () => {
  it('sperrt alle Felder und Knöpfe der Seite auf einmal, mit dem Grund im title', async () => {
    const host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
    act(() => root!.render(createElement(PermioSeite)));
    const feldgruppe = host.querySelector<HTMLFieldSetElement>('fieldset.es-seite')!;
    expect(feldgruppe.disabled).toBe(true);
    expect(feldgruppe.title).toContain('nicht erreichbar');
    // alle Abschnitte stehen in der gesperrten Gruppe
    expect([...host.querySelectorAll('.es-gruppe h4')].map((h) => h.textContent)).toEqual(
      expect.arrayContaining(['Formularprojekte', 'Vorgaben je Rolle', 'Formulare', 'Anträge im Projektordner', 'Antragsmerkmale', 'Projektdatei (.oap)', 'Einstellungen importieren']),
    );
    expect(host.querySelectorAll('.es-gruppe').length).toBe(feldgruppe.querySelectorAll('.es-gruppe').length);
    // Tabellen der Seite in der gemeinsamen Zahlentabelle aus core: Katalog der Antragsmerkmale mit Feldern, Angaben der Projektdatei als Text
    const tabellen = [...host.querySelectorAll('table')];
    expect(tabellen.length).toBeGreaterThanOrEqual(2);
    for (const t of tabellen) expect(['summary-table', 'text'].every((k) => t.classList.contains(k))).toBe(true);
    expect(host.querySelector('table.es-katalog')!.classList.contains('felder')).toBe(true);
  });
});
