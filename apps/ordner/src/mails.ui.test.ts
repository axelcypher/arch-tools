// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { testMsg } from '@core/__fixtures__/msg';
import { createProject } from '@core/model';
import { VORGABE_ALLGEMEIN } from '@core/platform/konfig';
import { projektdateiAnlegen } from '@core/platform/projektordner';
import { MailView } from './components/MailView';
import { SpeicherDateisystem } from './dateisystem';
import { useMails } from './mail/mailStore';
import { leereStammdaten } from './stammdaten';
import { useOrdner } from './store';
import { STANDARD } from './struktur';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: ReturnType<typeof createRoot> | null = null;
beforeEach(() => {
  localStorage.clear();
  useOrdner.setState({ stamm: leereStammdaten(), struktur: STANDARD, allgemein: { ...VORGABE_ALLGEMEIN, projekte: ['/p'] }, konfigLaden: async () => {} });
  useMails.setState({ eigene: [], geladen: true, fehler: null });
});
afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.innerHTML = '';
});
const warten = () =>
  act(async () => {
    for (let i = 0; i < 10; i++) await new Promise((r) => setTimeout(r, 0));
  });
const knopf = (host: Element, text: string) => [...host.querySelectorAll('button')].find((b) => b.textContent?.trim().startsWith(text)) as HTMLButtonElement;
const eintippen = (el: HTMLInputElement, wert: string) =>
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(el, wert);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
const mittag = (iso: string) => new Date(`${iso}T11:00:00Z`);

async function projekt() {
  const fs = new SpeicherDateisystem();
  const p = createProject('Sanierung ESG');
  p.meta.projektcode = 'SIS';
  await fs.ordnerAnlegen('/p', 'SIS Sanierung/04 Schriftverkehr/Bauherr');
  await projektdateiAnlegen(fs, '/p/SIS Sanierung', '03 Berechnungen/SIS.oap', p, 'Test');
  const basis = '/p/SIS Sanierung/04 Schriftverkehr/Bauherr';
  // wie das Makro sie ablegt: Weiterleitung einer Kollegin, Absender als Adresse, Betreff mit „WG__“ und Endung
  await fs.dateiAnlegen(
    basis,
    'SIS von Ruediger.Peitz@shs-soest.de 261110 WG__Grundriss_Sanierung_ESG.docx.msg',
    testMsg({
      betreff: 'WG: Grundriss Sanierung ESG.docx',
      vonName: 'Nicole Aring | AKH Architektur GmbH',
      vonMail: 'n.aring@akh-architektur.de',
      an: [{ name: 'Tobias Pendzialek', mail: 't.pendzialek@akh-architektur.de' }],
      gesendet: mittag('2026-11-10'),
      empfangen: mittag('2026-11-10'),
      text: 'Zur Info\n\nVon: Peitz, Rüdiger <Ruediger.Peitz@shs-soest.de>\nGesendet: Montag, 9. November 2026 10:10\nBetreff: Grundriss Sanierung ESG.docx',
      ansi: true,
    }),
  );
  // richtig benannt, aber mit dem Datum der Datei statt dem Versanddatum
  await fs.dateiAnlegen(
    basis,
    'SIS an Peitz 261103 Planunterlagen.msg',
    testMsg({
      betreff: 'Planunterlagen',
      vonName: 'Tobias Pendzialek',
      vonMail: 't.pendzialek@akh-architektur.de',
      an: [{ name: 'Peitz, Rüdiger', mail: 'ruediger.peitz@shs-soest.de' }],
      gesendet: mittag('2026-11-02'),
      empfangen: mittag('2026-11-02'),
    }),
  );
  // richtig benannt
  await fs.dateiAnlegen(
    '/p/SIS Sanierung',
    'SIS von Peitz 261020 Raumaufteilung.msg',
    testMsg({
      betreff: 'AW: Raumaufteilung',
      vonName: 'Peitz, Rüdiger',
      vonMail: 'ruediger.peitz@shs-soest.de',
      an: [{ name: 'Tobias Pendzialek', mail: 't.pendzialek@akh-architektur.de' }],
      gesendet: mittag('2026-10-20'),
      empfangen: mittag('2026-10-20'),
    }),
  );
  return fs;
}

describe('Mails prüfen und benennen', () => {
  it('findet falsch benannte Mails in Unterordnern, schlägt den Namen aus der Mail vor und benennt um', async () => {
    const fs = await projekt();
    const host = document.createElement('div');
    document.body.appendChild(host);
    act(() => {
      root = createRoot(host);
      root.render(createElement(MailView, { fs, start: '/p/SIS Sanierung' }));
    });
    await warten();
    expect(host.textContent).toContain('3 Mails, davon 1 nicht nach dem Schema');
    expect((host.querySelector('input[aria-label="Projektcode"]') as HTMLInputElement).value).toBe('SIS');
    const zeileMit = (text: string) => [...host.querySelectorAll('.po-mail')].find((z) => z.textContent?.includes(text))!;
    const zeile = () => zeileMit('Ruediger.Peitz@');
    expect(zeile().textContent).toContain('Name ist eine E-Mail-Adresse – nur der Nachname');
    expect(zeile().querySelector('.po-mail-ordner')!.textContent).toBe('04 Schriftverkehr/Bauherr');
    // ohne eigene Domain: Richtung aus dem bisherigen Namen, Absender der Nachricht – und der Vorschlag der Domain
    expect(host.querySelector('.po-hinweis')!.textContent).toContain('akh-architektur.de');
    act(() => knopf(host, 'Übernehmen').click());
    await warten();
    expect(useMails.getState().eigene).toEqual(['akh-architektur.de']);
    // die zum Raten gelesenen Mails sind jetzt auch geprüft: falsches Datum (Datei statt Versand)
    expect(host.textContent).toContain('3 Mails, davon 2 nicht nach dem Schema');
    // jetzt erkannt: Weiterleitung aus dem Büro, ursprünglich von Herrn Peitz
    expect(zeile().querySelector('.po-mail-neu')!.textContent).toContain('SIS von Peitz 261110 Grundriss Sanierung ESG.msg');
    expect(zeile().querySelector('.po-mail-neu')!.textContent).toContain('weitergeleitet von Nicole Aring');
    // Thema von Hand
    eintippen(zeile().querySelector('input[aria-label="Thema"]') as HTMLInputElement, 'Raumaufteilung');
    expect(zeile().querySelector('.po-mail-neu')!.textContent).toContain('SIS von Peitz 261110 Raumaufteilung.msg');
    // Vorschau der Mail
    expect(zeile().querySelector('.po-mail-vorschau')!.textContent).toContain('Von: Peitz, Rüdiger');
    await act(async () => knopf(zeile(), 'Umbenennen').click());
    await warten();
    const pfade = [...fs.eintraege.keys()].filter((p) => p.endsWith('.msg'));
    expect(pfade).toContain('/p/SIS Sanierung/04 Schriftverkehr/Bauherr/SIS von Peitz 261110 Raumaufteilung.msg');
    expect(pfade.some((p) => p.includes('Ruediger.Peitz@'))).toBe(false);
    expect(zeileMit('umbenannt (vorher: SIS von Ruediger.Peitz@shs-soest.de 261110 WG__Grundriss_Sanierung_ESG.docx.msg)')).toBeTruthy();
    expect(host.textContent).toContain('3 Mails, davon 1 nicht nach dem Schema');

    // auch die übrigen korrekt benannten lesen: die richtige bleibt richtig
    await act(async () => knopf(host, 'Auch korrekt benannte prüfen').click());
    await warten();
    expect(host.textContent).toContain('3 Mails, davon 1 nicht nach dem Schema');
    const datum = zeileMit('SIS an Peitz 261103');
    expect(datum.textContent).toContain('Datum 261103 – die Mail ist vom 261102 (Versand)');
    expect(datum.querySelector('.po-mail-neu')!.textContent).toContain('SIS an Peitz 261102 Planunterlagen.msg');
    // ausgewählte auf einmal umbenennen
    await act(async () => knopf(host, '1 Mail umbenennen').click());
    await warten();
    expect([...fs.eintraege.keys()]).toContain('/p/SIS Sanierung/04 Schriftverkehr/Bauherr/SIS an Peitz 261102 Planunterlagen.msg');
    // den Namen gibt es schon: nicht überschreiben
    expect(await fs.umbenennen!('/p/SIS Sanierung', '04 Schriftverkehr/Bauherr/SIS an Peitz 261102 Planunterlagen.msg', 'SIS von Peitz 261020 Raumaufteilung.msg')).toBe(false);
  });

  it('Mails aus Outlook hereinziehen: Vorschlag, Zielordner, ablegen (kopiert, nie überschreibend), schon abgelegte erkannt', async () => {
    const fs = await projekt();
    useMails.setState({ eigene: ['akh-architektur.de'] });
    const host = document.createElement('div');
    document.body.appendChild(host);
    act(() => {
      root = createRoot(host);
      root.render(createElement(MailView, { fs, start: '/p/SIS Sanierung' }));
    });
    await warten();
    await act(async () => knopf(host, 'Auch korrekt benannte prüfen').click());
    await warten();
    const zone = host.querySelector('.po-ablage')!;
    // wie Outlook: virtuelle Datei „<Betreff>.msg“; dazu eine Mail, die schon abgelegt ist, und ein Fremdling
    const neu = new File(
      [
        testMsg({
          betreff: 'AW: Türen Flurseite',
          vonName: 'Peitz, Rüdiger',
          vonMail: 'ruediger.peitz@shs-soest.de',
          an: [{ name: 'TP', mail: 't.pendzialek@akh-architektur.de' }],
          gesendet: mittag('2026-11-11'),
          empfangen: mittag('2026-11-12'),
        }),
      ],
      'AW Türen Flurseite.msg',
    );
    const doppelt = new File(
      [
        testMsg({
          betreff: 'AW: Raumaufteilung',
          vonName: 'Peitz, Rüdiger',
          vonMail: 'ruediger.peitz@shs-soest.de',
          an: [{ name: 'Tobias Pendzialek', mail: 't.pendzialek@akh-architektur.de' }],
          gesendet: mittag('2026-10-20'),
          empfangen: mittag('2026-10-20'),
        }),
      ],
      'AW Raumaufteilung.msg',
    );
    const ueber = new Event('dragover', { bubbles: true, cancelable: true }) as Event & { dataTransfer: { dropEffect: string; files: File[] } };
    Object.defineProperty(ueber, 'dataTransfer', { value: { dropEffect: 'move', files: [] } });
    act(() => zone.dispatchEvent(ueber));
    // nie verschieben – sonst nimmt Outlook die Mail aus dem Postfach
    expect(ueber.dataTransfer.dropEffect).toBe('copy');
    const fallen = new Event('drop', { bubbles: true, cancelable: true });
    Object.defineProperty(fallen, 'dataTransfer', { value: { dropEffect: 'copy', files: [neu, doppelt, new File(['x'], 'Notiz.txt')] } });
    await act(async () => void zone.dispatchEvent(fallen));
    await warten();
    expect(host.textContent).toContain('2 Mails zum Ablegen');
    const zeile = (text: string) => [...host.querySelectorAll('.po-mail.neu')].find((z) => z.textContent?.includes(text))!;
    // Zielordner: wo die meisten Mails liegen
    expect((zeile('Türen').querySelector('select.po-mail-zielordner') as HTMLSelectElement).value).toBe('04 Schriftverkehr/Bauherr');
    expect(zeile('Türen').querySelector('.po-mail-neu')!.textContent).toContain('04 Schriftverkehr/Bauherr/SIS von Peitz 261112 Türen Flurseite.msg');
    expect(zeile('AW Raumaufteilung').textContent).toContain('Diese Mail liegt schon im Projekt: SIS von Peitz 261020 Raumaufteilung.msg');
    // den Namen gibt es schon (im Stamm): Ablegen gesperrt
    expect(zeile('AW Raumaufteilung').querySelector('.po-mail-problem')).toBeNull();
    const ordner = zeile('AW Raumaufteilung').querySelector('select.po-mail-zielordner') as HTMLSelectElement;
    act(() => {
      ordner.value = '';
      ordner.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(zeile('AW Raumaufteilung').querySelector('.po-mail-problem')!.textContent).toContain('diesen Namen gibt es in dem Ordner schon');
    act(() => knopf(zeile('AW Raumaufteilung'), '×').click());
    await act(async () => knopf(host, 'Alle ablegen').click());
    await warten();
    expect([...fs.eintraege.keys()]).toContain('/p/SIS Sanierung/04 Schriftverkehr/Bauherr/SIS von Peitz 261112 Türen Flurseite.msg');
    expect(host.querySelector('.po-neue')).toBeNull();
    expect(host.textContent).toContain('abgelegt (aus Outlook: AW Türen Flurseite.msg)');
    expect(host.textContent).toContain('4 Mails');
  });
});
