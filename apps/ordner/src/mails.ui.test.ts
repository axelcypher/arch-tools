// @vitest-environment happy-dom
import { act, createElement, Fragment } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { testMsg } from '@core/__fixtures__/msg';
import { createProject } from '@core/model';
import { RueckfrageHost } from '@core/ui/Rueckfrage';
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
// einzelne Tests ersetzen setEigene – vor jedem Test wieder die echte Funktion
const echtesSetEigene = useMails.getState().setEigene;
beforeEach(() => {
  localStorage.clear();
  useOrdner.setState({ stamm: leereStammdaten(), struktur: STANDARD, allgemein: { ...VORGABE_ALLGEMEIN, projekte: ['/p'] }, konfigLaden: async () => {} });
  useMails.setState({ eigene: [], geladen: true, fehler: null, setEigene: echtesSetEigene });
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
  const p = createProject('Sanierung Musterschule');
  p.meta.projektcode = 'BSP';
  await fs.ordnerAnlegen('/p', 'BSP Sanierung/04 Schriftverkehr/Bauherr');
  await projektdateiAnlegen(fs, '/p/BSP Sanierung', '03 Berechnungen/BSP.oap', p, 'Test');
  const basis = '/p/BSP Sanierung/04 Schriftverkehr/Bauherr';
  // wie das Makro sie ablegt: Weiterleitung einer Kollegin, Absender als Adresse, Betreff mit „WG__“ und Endung
  await fs.dateiAnlegen(
    basis,
    'BSP von Max.Muster@statik-muster.example 261110 WG__Grundriss_Sanierung_Musterschule.docx.msg',
    testMsg({
      betreff: 'WG: Grundriss Sanierung Musterschule.docx',
      vonName: 'Erika Beispiel | Beispiel Architekten GmbH',
      vonMail: 'e.beispiel@architekten-beispiel.example',
      an: [{ name: 'Tom Planer', mail: 't.planer@architekten-beispiel.example' }],
      gesendet: mittag('2026-11-10'),
      empfangen: mittag('2026-11-10'),
      text: 'Zur Info\n\nVon: Muster, Max <Max.Muster@statik-muster.example>\nGesendet: Montag, 9. November 2026 10:10\nBetreff: Grundriss Sanierung Musterschule.docx',
      ansi: true,
    }),
  );
  // richtig benannt, aber mit dem Datum der Datei statt dem Versanddatum
  await fs.dateiAnlegen(
    basis,
    'BSP an Muster 261103 Planunterlagen.msg',
    testMsg({
      betreff: 'Planunterlagen',
      vonName: 'Tom Planer',
      vonMail: 't.planer@architekten-beispiel.example',
      an: [{ name: 'Muster, Max', mail: 'max.muster@statik-muster.example' }],
      gesendet: mittag('2026-11-02'),
      empfangen: mittag('2026-11-02'),
    }),
  );
  // richtig benannt
  await fs.dateiAnlegen(
    '/p/BSP Sanierung',
    'BSP von Muster 261020 Raumaufteilung.msg',
    testMsg({
      betreff: 'AW: Raumaufteilung',
      vonName: 'Muster, Max',
      vonMail: 'max.muster@statik-muster.example',
      an: [{ name: 'Tom Planer', mail: 't.planer@architekten-beispiel.example' }],
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
      root.render(createElement(MailView, { fs, start: '/p/BSP Sanierung' }));
    });
    await warten();
    expect(host.textContent).toContain('3 Mails, davon 1 nicht nach dem Schema');
    expect((host.querySelector('input[aria-label="Projektcode"]') as HTMLInputElement).value).toBe('BSP');
    const zeileMit = (text: string) => [...host.querySelectorAll('.po-mail')].find((z) => z.textContent?.includes(text))!;
    const zeile = () => zeileMit('Max.Muster@');
    expect(zeile().textContent).toContain('Name ist eine E-Mail-Adresse – nur der Nachname');
    expect(zeile().querySelector('.po-mail-ordner')!.textContent).toBe('04 Schriftverkehr/Bauherr');
    // ohne eigene Domain: Richtung aus dem bisherigen Namen, Absender der Nachricht – und der Vorschlag der Domain
    expect(host.querySelector('.po-hinweis')!.textContent).toContain('architekten-beispiel.example');
    act(() => knopf(host, 'Übernehmen').click());
    await warten();
    expect(useMails.getState().eigene).toEqual(['architekten-beispiel.example']);
    // die zum Raten gelesenen Mails sind jetzt auch geprüft: falsches Datum (Datei statt Versand)
    expect(host.textContent).toContain('3 Mails, davon 2 nicht nach dem Schema');
    // jetzt erkannt: Weiterleitung aus dem Büro, ursprünglich von Herrn Muster
    expect(zeile().querySelector('.po-mail-neu')!.textContent).toContain('BSP von Muster 261110 Grundriss Sanierung Musterschule.msg');
    expect(zeile().querySelector('.po-mail-neu')!.textContent).toContain('weitergeleitet von Erika Beispiel');
    // Thema von Hand
    eintippen(zeile().querySelector('input[aria-label="Thema"]') as HTMLInputElement, 'Raumaufteilung');
    expect(zeile().querySelector('.po-mail-neu')!.textContent).toContain('BSP von Muster 261110 Raumaufteilung.msg');
    // Vorschau der Mail
    expect(zeile().querySelector('.po-mail-vorschau')!.textContent).toContain('Von: Muster, Max');
    await act(async () => knopf(zeile(), 'Umbenennen').click());
    await warten();
    const pfade = [...fs.eintraege.keys()].filter((p) => p.endsWith('.msg'));
    expect(pfade).toContain('/p/BSP Sanierung/04 Schriftverkehr/Bauherr/BSP von Muster 261110 Raumaufteilung.msg');
    expect(pfade.some((p) => p.includes('Max.Muster@'))).toBe(false);
    expect(zeileMit('umbenannt (vorher: BSP von Max.Muster@statik-muster.example 261110 WG__Grundriss_Sanierung_Musterschule.docx.msg)')).toBeTruthy();
    expect(host.textContent).toContain('3 Mails, davon 1 nicht nach dem Schema');

    // auch die übrigen korrekt benannten lesen: die richtige bleibt richtig
    await act(async () => knopf(host, 'Auch korrekt benannte prüfen').click());
    await warten();
    expect(host.textContent).toContain('3 Mails, davon 1 nicht nach dem Schema');
    const datum = zeileMit('BSP an Muster 261103');
    expect(datum.textContent).toContain('Datum 261103 – die Mail ist vom 261102 (Versand)');
    expect(datum.querySelector('.po-mail-neu')!.textContent).toContain('BSP an Muster 261102 Planunterlagen.msg');
    // ausgewählte auf einmal umbenennen
    await act(async () => knopf(host, '1 Mail umbenennen').click());
    await warten();
    expect([...fs.eintraege.keys()]).toContain('/p/BSP Sanierung/04 Schriftverkehr/Bauherr/BSP an Muster 261102 Planunterlagen.msg');
    // den Namen gibt es schon: nicht überschreiben
    expect(await fs.umbenennen!('/p/BSP Sanierung', '04 Schriftverkehr/Bauherr/BSP an Muster 261102 Planunterlagen.msg', 'BSP von Muster 261020 Raumaufteilung.msg')).toBe(false);
  });

  it('Mails aus Outlook hereinziehen: Vorschlag, Zielordner, ablegen (kopiert, nie überschreibend), schon abgelegte erkannt', async () => {
    const fs = await projekt();
    useMails.setState({ eigene: ['architekten-beispiel.example'] });
    const host = document.createElement('div');
    document.body.appendChild(host);
    act(() => {
      root = createRoot(host);
      root.render(createElement(MailView, { fs, start: '/p/BSP Sanierung' }));
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
          vonName: 'Muster, Max',
          vonMail: 'max.muster@statik-muster.example',
          an: [{ name: 'TP', mail: 't.planer@architekten-beispiel.example' }],
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
          vonName: 'Muster, Max',
          vonMail: 'max.muster@statik-muster.example',
          an: [{ name: 'Tom Planer', mail: 't.planer@architekten-beispiel.example' }],
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
    expect(zeile('Türen').querySelector('.po-mail-neu')!.textContent).toContain('04 Schriftverkehr/Bauherr/BSP von Muster 261112 Türen Flurseite.msg');
    expect(zeile('AW Raumaufteilung').textContent).toContain('Diese Mail liegt schon im Projekt: BSP von Muster 261020 Raumaufteilung.msg');
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
    expect([...fs.eintraege.keys()]).toContain('/p/BSP Sanierung/04 Schriftverkehr/Bauherr/BSP von Muster 261112 Türen Flurseite.msg');
    expect(host.querySelector('.po-neue')).toBeNull();
    expect(host.textContent).toContain('abgelegt (aus Outlook: AW Türen Flurseite.msg)');
    expect(host.textContent).toContain('4 Mails');
  });
});

/** Dateisystem, dessen Lesen einzelner Dateien wartet, bis der Test es freigibt */
class GebremstesDateisystem extends SpeicherDateisystem {
  readonly sperren = new Map<string, Promise<void>>();
  override async lies(root: string, pfad: string) {
    const sperre = [...this.sperren].find(([teil]) => `${root}/${pfad}`.includes(teil))?.[1];
    if (sperre) await sperre;
    return super.lies(root, pfad);
  }
}
const schranke = () => {
  let auf = () => {};
  const p = new Promise<void>((r) => (auf = r));
  return { p, auf };
};
function zeigen(fs: SpeicherDateisystem, start?: string) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  act(() => {
    root = createRoot(host);
    root.render(createElement(Fragment, null, createElement(MailView, { fs, start: start ?? '/p/BSP Sanierung' }), createElement(RueckfrageHost)));
  });
  return host;
}
const fallenLassen = async (host: Element, dateien: File[]) => {
  const fallen = new Event('drop', { bubbles: true, cancelable: true });
  Object.defineProperty(fallen, 'dataTransfer', { value: { dropEffect: 'copy', files: dateien } });
  await act(async () => void host.querySelector('.po-ablage')!.dispatchEvent(fallen));
  await warten();
};
const raumaufteilung = (gesendet?: Date) =>
  testMsg({
    betreff: 'AW: Raumaufteilung',
    vonName: 'Muster, Max',
    vonMail: 'max.muster@statik-muster.example',
    an: [{ name: 'Tom Planer', mail: 't.planer@architekten-beispiel.example' }],
    ...(gesendet ? { gesendet, empfangen: gesendet } : {}),
  });

describe('Mails ablegen: Doppelte und Lesefehler', () => {
  it('erkennt eine schon korrekt abgelegte Mail – ohne „Auch korrekt benannte prüfen“', async () => {
    const fs = await projekt();
    useMails.setState({ eigene: ['architekten-beispiel.example'] });
    const host = zeigen(fs);
    await warten();
    // die korrekt benannte Mail ist noch nicht gelesen
    expect(host.textContent).not.toContain('Auch korrekt benannte prüfen …');
    await fallenLassen(host, [new File([raumaufteilung(mittag('2026-10-20'))], 'AW Raumaufteilung.msg')]);
    expect(host.querySelector('.po-mail.neu')!.textContent).toContain('Diese Mail liegt schon im Projekt: BSP von Muster 261020 Raumaufteilung.msg');
  });

  it('Gegenprobe: Entwürfe ohne Versandzeit sind nicht doppelt; dieselbe Mail zweimal im selben Drop schon', async () => {
    const fs = await projekt();
    useMails.setState({ eigene: ['architekten-beispiel.example'] });
    const host = zeigen(fs);
    await warten();
    await fallenLassen(host, [new File([raumaufteilung()], 'Entwurf 1.msg'), new File([raumaufteilung()], 'Entwurf 2.msg')]);
    expect(host.textContent).not.toContain('liegt schon im Projekt');
    expect(host.textContent).not.toContain('doppelt');
    // zwei Mails verwerfen: erst nach Rückfrage – Abbrechen lässt beide stehen
    act(() => knopf(host, 'Verwerfen').click());
    await warten();
    const dialog = () => document.body.querySelector('.modal');
    expect(dialog()!.textContent).toContain('2 Mails verwerfen?');
    act(() => knopf(dialog()!, 'Abbrechen').click());
    await warten();
    expect(host.textContent).toContain('2 Mails zum Ablegen');
    act(() => knopf(host, 'Verwerfen').click());
    await warten();
    act(() => knopf(dialog()!, 'Verwerfen').click());
    await warten();
    expect(host.querySelector('.po-neue')).toBeNull();
    const mail = testMsg({ betreff: 'Fenster', vonName: 'Muster, Max', vonMail: 'max.muster@statik-muster.example', an: [], gesendet: mittag('2026-11-12'), empfangen: mittag('2026-11-12') });
    await fallenLassen(host, [new File([mail], 'Fenster.msg'), new File([mail], 'Fenster (Kopie).msg')]);
    const zeilen = [...host.querySelectorAll('.po-mail.neu')];
    expect(zeilen[0].textContent).not.toContain('doppelt');
    expect(zeilen[1].textContent).toContain('Diese Mail ist in dieser Ablage doppelt – schon dabei als Fenster.msg');
  });

  it('nicht lesbare Mail: Klartext, keine Ordnerwahl, einzeln verwerfbar', async () => {
    const fs = await projekt();
    useMails.setState({ eigene: ['architekten-beispiel.example'] });
    const host = zeigen(fs);
    await warten();
    await fallenLassen(host, [new File([new Uint8Array([1, 2, 3])], 'Kaputt.msg')]);
    const zeile = host.querySelector('.po-mail.neu')!;
    expect(zeile.querySelector('.warning')!.textContent).toBe('Die Datei ist keine lesbare Outlook-Mail.');
    expect(zeile.querySelector('.warning')!.getAttribute('title')).toBeTruthy();
    expect(zeile.querySelector('select')).toBeNull();
    act(() => (zeile.querySelector('.po-mail-kopf button[aria-label="Kaputt.msg verwerfen"]') as HTMLButtonElement).click());
    expect(host.querySelector('.po-neue')).toBeNull();
  });
});

describe('Mails: Bedienung per Tastatur', () => {
  it('Projektliste aus Knöpfen mit aria-current, Pfeiltasten, Enter aus der Suche; „wählen …“ ist ein Knopf', async () => {
    const fs = await projekt();
    await fs.ordnerAnlegen('/p', 'BSP Zweites/Post');
    const host = zeigen(fs, null as unknown as string);
    await warten();
    // im Browser „einlesen“ – „Anderen Ordner wählen …“ erst mit einem Projekt (Desktop)
    expect(knopf(host, 'Anderen Ordner')).toBeUndefined();
    const knoepfe = () => [...host.querySelectorAll<HTMLButtonElement>('.po-projektliste button.po-projekt-knopf')];
    expect(knoepfe().map((b) => b.textContent)).toEqual(['BSP Sanierung', 'BSP Zweites']);
    const suche = host.querySelector('input.po-suche') as HTMLInputElement;
    act(() => suche.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })));
    expect(document.activeElement).toBe(knoepfe()[0]);
    act(() => knoepfe()[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })));
    expect(document.activeElement).toBe(knoepfe()[1]);
    act(() => knoepfe()[1].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true })));
    act(() => knoepfe()[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true })));
    expect(document.activeElement).toBe(suche);
    eintippen(suche, 'Sanierung');
    await act(async () => void suche.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })));
    await warten();
    expect(host.querySelector('.po-mails-kopf h3')!.textContent).toBe('BSP Sanierung');
    expect(knoepfe()[0].getAttribute('aria-current')).toBe('true');
    // Datei-Auswahl: ein echter Knopf öffnet das versteckte Dateifeld
    const feld = host.querySelector('.po-ablage input[type="file"]') as HTMLInputElement;
    let geoeffnet = 0;
    feld.click = () => void geoeffnet++;
    act(() => knopf(host.querySelector('.po-ablage')!, 'wählen …').click());
    expect(geoeffnet).toBe(1);
    // der Hinweis auf „Eigene Domains“ steht einmal über der Liste, nicht in jeder Zeile
    expect(host.querySelectorAll('.po-mails .po-hinweis').length).toBe(1);
    expect(host.querySelector('.po-mails .po-hinweis')!.textContent).toContain('links unter „Eigene Domains“ eintragen');
    expect(host.textContent).not.toContain('in den Einstellungen festlegen');
  });
});

describe('Mails: Knöpfe der Auswahl', () => {
  it('„Alle abweichenden wählen“ und „Umbenennen“ nur, wenn es abweichende Mails gibt', async () => {
    const fs = new SpeicherDateisystem();
    const p = createProject('Haus');
    p.meta.projektcode = 'BSP';
    await projektdateiAnlegen(fs, '/p/BSP Haus', 'BSP.oap', p, 'Test');
    await fs.dateiAnlegen('/p/BSP Haus', 'BSP von Muster 261020 Raumaufteilung.msg', raumaufteilung(mittag('2026-10-20')));
    const host = zeigen(fs, '/p/BSP Haus');
    await warten();
    expect(host.textContent).toContain('Alle Mails sind nach dem Schema benannt.');
    expect(knopf(host, 'Alle abweichenden wählen')).toBeUndefined();
    expect(host.querySelector('.po-mails-auswahl')).toBeNull();
    // Gegenprobe: mit einer abweichenden Mail sind sie da
    act(() => root?.unmount());
    root = null;
    document.body.innerHTML = '';
    const host2 = zeigen(await projekt());
    await warten();
    expect(knopf(host2, 'Alle abweichenden wählen')).toBeTruthy();
    expect(host2.querySelector('.po-mails-auswahl button.primary')!.textContent).toContain('1 Mail umbenennen');
  });
});

describe('Mails: kein Rennen beim Einlesen', () => {
  it('Projektwechsel während des Lesens: der alte Lauf schreibt nicht in die Zeilen des neuen Projekts', async () => {
    const fs = new GebremstesDateisystem();
    for (const p of ['AAA', 'BBB']) {
      const projekt = createProject(`Projekt ${p}`);
      projekt.meta.projektcode = p;
      await fs.ordnerAnlegen('/p', `${p} Haus/Post`);
      await projektdateiAnlegen(fs, `/p/${p} Haus`, `${p}.oap`, projekt, 'Test');
      // gleicher relativer Pfad in beiden Projekten
      await fs.dateiAnlegen(
        `/p/${p} Haus`,
        'Post/falsch benannt.msg',
        testMsg({ betreff: `Betreff ${p}`, vonName: `Absender ${p}`, vonMail: `x@${p.toLowerCase()}.example`, an: [], gesendet: mittag('2026-11-02') }),
      );
    }
    const s = schranke();
    fs.sperren.set('/p/AAA Haus/Post', s.p);
    useMails.setState({ eigene: ['architekten-beispiel.example'] });
    const host = zeigen(fs, '/p/AAA Haus');
    await warten();
    expect(host.textContent).toContain('Mails werden gelesen');
    // zu B wechseln, B liest fertig – dann wird A freigegeben
    const b = [...host.querySelectorAll<HTMLButtonElement>('button.po-projekt-knopf')].find((x) => x.textContent === 'BBB Haus')!;
    await act(async () => b.click());
    await warten();
    expect(host.querySelector('.po-mail-neu')!.textContent).toContain('BBB von BBB 261102 Betreff BBB.msg');
    s.auf();
    await warten();
    expect(host.querySelector('.po-mails-kopf h3')!.textContent).toBe('BBB Haus');
    expect(host.querySelector('.po-mail-neu')!.textContent).toContain('BBB von BBB 261102 Betreff BBB.msg');
    expect(host.textContent).not.toContain('Betreff AAA');
    expect(host.querySelector('.busy')).toBeNull();
  });

  it('eigene Domains während des Lesens: inzwischen gelesene Köpfe gehen nicht verloren', async () => {
    const fs = new GebremstesDateisystem();
    const p = createProject('Haus');
    p.meta.projektcode = 'BSP';
    await projektdateiAnlegen(fs, '/p/BSP Haus', 'BSP.oap', p, 'Test');
    await fs.dateiAnlegen('/p/BSP Haus', 'Post/eins.msg', testMsg({ betreff: 'Eins', vonName: 'Muster, Max', vonMail: 'max@extern.example', an: [], gesendet: mittag('2026-11-02') }));
    await fs.dateiAnlegen('/p/BSP Haus', 'Post/zwei.msg', testMsg({ betreff: 'Zwei', vonName: 'Muster, Max', vonMail: 'max@extern.example', an: [], gesendet: mittag('2026-11-03') }));
    const lesen = schranke();
    fs.sperren.set('zwei.msg', lesen.p);
    const speichern = schranke();
    const echt = useMails.getState().setEigene;
    useMails.setState({
      setEigene: async (l: string[]) => {
        await speichern.p;
        await echt(l);
      },
    });
    const host = zeigen(fs, '/p/BSP Haus');
    await warten();
    // „eins“ ist gelesen, „zwei“ hängt noch – jetzt die Domain eintragen (das Speichern dauert)
    const domains = host.querySelector('input[aria-label="Eigene Domains"]') as HTMLInputElement;
    eintippen(domains, 'architekten-beispiel.example');
    act(() => domains.dispatchEvent(new FocusEvent('focusout', { bubbles: true })));
    lesen.auf();
    await warten();
    speichern.auf();
    await warten();
    const zwei = [...host.querySelectorAll('.po-mail')].find((z) => z.textContent?.includes('zwei.msg'))!;
    expect(zwei.querySelector('.po-mail-neu')!.textContent).toContain('BSP von Muster 261103 Zwei.msg');
  });

  it('eigene Domains gespeichert, bevor eine hängende Mail gelesen ist: auch sie bekommt den Vorschlag mit Domain', async () => {
    const fs = new GebremstesDateisystem();
    const p = createProject('Haus');
    p.meta.projektcode = 'BSP';
    await projektdateiAnlegen(fs, '/p/BSP Haus', 'BSP.oap', p, 'Test');
    await fs.dateiAnlegen('/p/BSP Haus', 'Post/eins.msg', testMsg({ betreff: 'Eins', vonName: 'Muster, Max', vonMail: 'max@extern.example', an: [], gesendet: mittag('2026-11-02') }));
    await fs.dateiAnlegen('/p/BSP Haus', 'Post/zwei.msg', testMsg({ betreff: 'Zwei', vonName: 'Muster, Max', vonMail: 'max@extern.example', an: [], gesendet: mittag('2026-11-03') }));
    const lesen = schranke();
    fs.sperren.set('zwei.msg', lesen.p);
    const speichern = schranke();
    const echt = useMails.getState().setEigene;
    useMails.setState({
      setEigene: async (l: string[]) => {
        await speichern.p;
        await echt(l);
      },
    });
    const host = zeigen(fs, '/p/BSP Haus');
    await warten();
    const neuerName = (datei: string) => [...host.querySelectorAll('.po-mail')].find((z) => z.textContent?.includes(datei))!.querySelector('.po-mail-neu')!.textContent;
    // Gegenprobe: ohne Domain gilt die Richtung aus dem bisherigen Namen
    expect(neuerName('eins.msg')).toContain('Richtung aus dem bisherigen Namen');
    const domains = host.querySelector('input[aria-label="Eigene Domains"]') as HTMLInputElement;
    eintippen(domains, 'architekten-beispiel.example');
    act(() => domains.dispatchEvent(new FocusEvent('focusout', { bubbles: true })));
    // umgekehrt: erst ist das Speichern fertig, dann erst wird „zwei“ gelesen
    speichern.auf();
    await warten();
    expect(useMails.getState().eigene).toEqual(['architekten-beispiel.example']);
    expect(neuerName('eins.msg')).toContain('Absender max@extern.example');
    lesen.auf();
    await warten();
    expect(neuerName('zwei.msg')).toContain('Absender max@extern.example');
    expect(neuerName('zwei.msg')).not.toContain('Richtung aus dem bisherigen Namen');
    expect(host.querySelector('.busy')).toBeNull();
  });
});

describe('Mails: Sammel-Umbenennen und Pfadlänge', () => {
  const mail = (thema: string, tag: string) => testMsg({ betreff: thema, vonName: 'Muster, Max', vonMail: 'max@extern.example', an: [], gesendet: mittag(tag), empfangen: mittag(tag) });

  it('mehrere Mails umbenennen: erst nach Rückfrage mit Anzahl und Vorschau – Abbrechen ändert nichts', async () => {
    const fs = new SpeicherDateisystem();
    const p = createProject('Haus');
    p.meta.projektcode = 'BSP';
    await projektdateiAnlegen(fs, '/p/BSP Haus', 'BSP.oap', p, 'Test');
    for (let i = 1; i <= 6; i++) await fs.dateiAnlegen('/p/BSP Haus', `Post/m${i}.msg`, mail(`Thema ${i}`, `2026-11-0${i}`));
    useMails.setState({ eigene: ['architekten-beispiel.example'] });
    const host = zeigen(fs, '/p/BSP Haus');
    await warten();
    const msg = () => [...fs.eintraege.keys()].filter((x) => x.endsWith('.msg')).sort();
    const vorher = msg();
    await act(async () => knopf(host, '6 Mails umbenennen').click());
    await warten();
    const dialog = () => document.body.querySelector('.modal');
    expect(dialog()!.querySelector('h3')!.textContent).toBe('6 Mails umbenennen?');
    const text = dialog()!.querySelector('.rf-text')!.textContent!;
    expect(text).toContain('m1.msg\n   → BSP von Muster 261101 Thema 1.msg');
    expect(text).toContain('m4.msg');
    expect(text).not.toContain('m5.msg');
    expect(text).toContain('… und 2 weitere');
    expect(text).toContain('rückgängig machen lässt es sich nicht');
    act(() => knopf(dialog()!, 'Abbrechen').click());
    await warten();
    expect(msg()).toEqual(vorher);
    await act(async () => knopf(host, '6 Mails umbenennen').click());
    await warten();
    await act(async () => knopf(dialog()!, 'Umbenennen').click());
    await warten();
    expect(msg()).toContain('/p/BSP Haus/Post/BSP von Muster 261106 Thema 6.msg');
    expect(msg().some((x) => /\/m\d\.msg$/.test(x))).toBe(false);
  });

  it('Gegenprobe: eine einzelne Mail wird ohne Rückfrage umbenannt', async () => {
    const fs = new SpeicherDateisystem();
    const p = createProject('Haus');
    p.meta.projektcode = 'BSP';
    await projektdateiAnlegen(fs, '/p/BSP Haus', 'BSP.oap', p, 'Test');
    await fs.dateiAnlegen('/p/BSP Haus', 'Post/m1.msg', mail('Thema 1', '2026-11-01'));
    useMails.setState({ eigene: ['architekten-beispiel.example'] });
    const host = zeigen(fs, '/p/BSP Haus');
    await warten();
    await act(async () => knopf(host, '1 Mail umbenennen').click());
    await warten();
    expect(document.body.querySelector('.modal')).toBeNull();
    expect([...fs.eintraege.keys()]).toContain('/p/BSP Haus/Post/BSP von Muster 261101 Thema 1.msg');
  });

  it('zu langer Zielpfad: Klartext in der Zeile, Umbenennen und Ablegen gesperrt; Gegenprobe mit kürzerem Thema', async () => {
    const fs = new SpeicherDateisystem();
    const p = createProject('Haus');
    p.meta.projektcode = 'BSP';
    // Projektordner mit 200 Zeichen: Name „BSP von Muster 261101 …“ mit langem Thema überschreitet 260
    const ordner = `/p/BSP ${'x'.repeat(193)}`;
    expect(ordner.length).toBe(200);
    await projektdateiAnlegen(fs, ordner, 'BSP.oap', p, 'Test');
    const lang = 'Abstimmung der Ausführungsplanung Tragwerk';
    await fs.dateiAnlegen(ordner, 'Post/m1.msg', mail(lang, '2026-11-01'));
    useMails.setState({ eigene: ['architekten-beispiel.example'] });
    const host = zeigen(fs, ordner);
    await warten();
    const zeile = () => [...host.querySelectorAll('.po-mail')].find((z) => z.textContent?.includes('m1.msg'))!;
    expect(zeile().querySelector('.po-mail-problem')!.textContent).toMatch(/Pfad zu lang \(\d+ Zeichen, Windows erlaubt höchstens 259\) – Thema oder Name kürzen/);
    expect(knopf(zeile(), 'Umbenennen').disabled).toBe(true);
    // ablegen: dieselbe Prüfung
    await fallenLassen(host, [new File([mail(lang, '2026-11-02')], 'Neu.msg')]);
    const neu = host.querySelector('.po-mail.neu')!;
    expect(neu.querySelector('.po-mail-problem')!.textContent).toContain('Pfad zu lang');
    expect(knopf(neu, 'Ablegen').disabled).toBe(true);
    // Gegenprobe: kürzeres Thema – der Pfad passt
    eintippen(zeile().querySelector('input[aria-label="Thema"]') as HTMLInputElement, 'Tragwerk');
    expect(zeile().querySelector('.po-mail-problem')).toBeNull();
    expect(knopf(zeile(), 'Umbenennen').disabled).toBe(false);
    await act(async () => knopf(zeile(), 'Umbenennen').click());
    await warten();
    expect([...fs.eintraege.keys()]).toContain(`${ordner}/Post/BSP von Muster 261101 Tragwerk.msg`);
  });
});
