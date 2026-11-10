// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { VORGABE_EXPORT } from './antrag';
import { useAntrag } from './antragStore';
import { VORGABE_MERKMALE } from './bedingung';
import type { FormularProfil } from './profil';
import { SicherungEinstellungen } from './components/SicherungEinstellungen';
import { useFormulare } from './store';

const datei = vi.hoisted(() => ({ gespeichert: null as string | null, zuOeffnen: null as string | null }));
vi.mock('@core/platform/files', async (original) => ({
  ...(await original<typeof import('@core/platform/files')>()),
  saveTextFile: async (o: { contents: string }) => {
    datei.gespeichert = o.contents;
    return true;
  },
  openFileWithPath: async () => (datei.zuOeffnen == null ? null : { name: 'Büro.json', pfad: null, bytes: new TextEncoder().encode(datei.zuOeffnen) }),
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: ReturnType<typeof createRoot> | null = null;
const PROFIL: FormularProfil = { abschnitte: { '0:Panel1': { titel: 'Bauherrschaft', bedingung: { art: 'gruppe', op: 'oder', teile: [{ art: 'merkmal', merkmal: 'Gebäudeklasse', werte: ['3'] }] } } }, zaehlt: {} };

beforeEach(() => {
  localStorage.clear();
  datei.gespeichert = datei.zuOeffnen = null;
  useFormulare.setState({ ds: null, projektordner: ['C:/FORMA'], ablageordner: [], profile: {}, meldung: null });
  useAntrag.setState({ einstellungen: { ...VORGABE_EXPORT }, merkmalDefinitionen: VORGABE_MERKMALE, ueberschreibungen: {}, projektdatei: null });
});
afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.innerHTML = '';
});

const warte = async () => {
  for (let i = 0; i < 4; i++) await act(async () => new Promise((r) => setTimeout(r, 0)));
};
const knopf = (text: string) => [...document.querySelectorAll('button')].find((b) => b.textContent?.includes(text)) as HTMLButtonElement;
const klick = async (el: HTMLElement) => {
  act(() => el.click());
  await warte();
};
const zeigen = async () => {
  const host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  act(() => root!.render(createElement(SicherungEinstellungen)));
  await warte();
};

describe('Einstellungen › Sichern & Übertragen', () => {
  it('exportieren und auf einem anderen Rechner einspielen – Ordnerpfade bleiben, wenn nicht angehakt', async () => {
    // Rechner A: Gliederung, Projektmerkmale und Ordner eingestellt
    useFormulare.getState().profilSetzen('nw019999|2026A', PROFIL);
    useAntrag.getState().setMerkmalDefinitionen([{ name: 'Gebäudeklasse', werte: ['1', '2', '3', '4', '5'] }, { name: 'Denkmal', werte: ['ja', 'nein'] }]);
    await zeigen();
    expect(document.querySelector('[aria-label="Enthaltene Einstellungen"]')!.textContent).toContain('1 Formular');
    await klick(knopf('Exportieren'));
    expect(useFormulare.getState().meldung?.text).toBe('Einstellungen exportiert.');
    const text = datei.gespeichert!;
    expect(JSON.parse(text).daten['formulare:profile']).toEqual({ 'nw019999|2026A': PROFIL });
    act(() => root?.unmount());

    // Rechner B: nichts eingestellt, eigener FORMA-Ordner
    localStorage.clear();
    useFormulare.setState({ profile: {}, projektordner: ['D:/FORMA'] });
    useAntrag.getState().setMerkmalDefinitionen(null);
    datei.zuOeffnen = text;
    await zeigen();
    await klick(knopf('Datei wählen'));
    const gruppe = document.querySelector('[aria-label="Einstellungen aus der Datei"]')!;
    expect(gruppe.textContent).toContain('Büro.json');
    const haken = [...gruppe.querySelectorAll('label')].map((l) => [l.textContent, l.querySelector('input')!.checked]);
    expect(haken).toEqual([
      ['Gliederung der Formulare (Titel, Gruppen, Bedingungen)', true],
      ['Projektmerkmale', true],
      ['Ordner, angezeigte Pfade, Projektdatei, Ansicht', false],
    ]);
    await klick(knopf('Übernehmen'));
    expect(useFormulare.getState().profile).toEqual({ 'nw019999|2026A': PROFIL });
    expect(useAntrag.getState().merkmalDefinitionen.map((m) => m.name).slice(0, 2)).toEqual(['Gebäudeklasse', 'Denkmal']);
    expect(useFormulare.getState().projektordner).toEqual(['D:/FORMA']);
    expect(useFormulare.getState().meldung?.text).toContain('Einstellungen übernommen: Gliederung der Formulare');
  });

  it('eine fremde Datei wird abgelehnt', async () => {
    datei.zuOeffnen = '{"art":"etwas anderes"}';
    await zeigen();
    await klick(knopf('Datei wählen'));
    expect(document.querySelector('.warning')!.textContent).toContain('keine Einstellungen der App');
    expect(document.querySelector('[aria-label="Einstellungen aus der Datei"]')).toBeNull();
  });
});
