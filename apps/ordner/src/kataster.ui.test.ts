// @vitest-environment happy-dom
import { act, createElement, Fragment } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readProjectFile, writeArchive } from '@core/archive';
import { createProject, leereMeta } from '@core/model';
import { RueckfrageHost } from '@core/ui/Rueckfrage';
import { VORGABE_KATASTER, vorlageLesen } from './kataster/kataster';
import { useKataster } from './kataster/katasterStore';
import { vorlageQgs, vorlageQgz } from './__fixtures__/qgisVorlage';
import { KatasterDialog } from './components/KatasterDialog';
import { KatasterEinstellungen } from './components/KatasterEinstellungen';
import { SpeicherProjektordner } from '@core/platform/projektordner';
import { SpeicherQgis } from './kataster/qgis';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const ORDNER = 'Z:/Projekte/BS9 Musterstraße 9';
const OAP = `${ORDNER}/Planung/Berechnungen/BS9 Flächen.oap`;
const VORLAGE = 'C:/Vorlagen/Kataster.qgz';
const jjmmtt = (d = new Date()) => `${String(d.getFullYear() % 100).padStart(2, '0')}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;

let fs: SpeicherProjektordner;
let qgis: SpeicherQgis;
let root: ReturnType<typeof createRoot> | null = null;

function oap(mitKoordinaten = true) {
  const p = createProject('BS9 Flächen');
  p.meta = {
    ...leereMeta(),
    projektcode: 'MUS',
    vorhaben: 'Neubau EFH',
    adresse: { strasse: 'Prinzipalmarkt 10', plz: '48143', ort: 'Münster' },
    ...(mitKoordinaten ? { koordinaten: { epsg: 25832, ost: 405577.31, nord: 5757743.76, lat: 51.9625, lon: 7.6282, quelle: 'Nominatim', adresse: 'Prinzipalmarkt 10, 48143 Münster' } } : {}),
  } as never;
  return writeArchive(p);
}

beforeEach(async () => {
  localStorage.clear();
  fs = new SpeicherProjektordner();
  fs.setze(OAP, oap());
  qgis = new SpeicherQgis(fs);
  qgis.dateien.set(VORLAGE, vorlageQgz());
  qgis.programme = ['C:/Program Files/QGIS 3.40.5/bin/qgis_process-qgis-ltr.bat'];
  useKataster.setState({ fs, qgis, einstellungen: structuredClone(VORGABE_KATASTER), programm: '', vorlageInfo: null, projekt: null, laeuft: false, ausgang: null });
  await useKataster.getState().aendern({ ...useKataster.getState().einstellungen, vorlage: VORLAGE, ziel: 'pfad', zielpfad: 'Kataster' });
  useKataster.getState().programmSetzen('C:/Program Files/QGIS 3.40.5/bin/qgis_process-qgis-ltr.bat');
});
afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.innerHTML = '';
});

const warte = () => act(async () => new Promise((r) => setTimeout(r, 0)));
const knopf = (host: Element, text: string) => [...host.querySelectorAll('button')].find((b) => b.textContent?.includes(text)) as HTMLButtonElement;
const klick = async (el: HTMLElement) => {
  act(() => el.click());
  for (let i = 0; i < 4; i++) await warte();
};
async function zeige(el: React.ReactElement) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root!.render(createElement(Fragment, null, el, createElement(RueckfrageHost))));
  for (let i = 0; i < 4; i++) await warte();
  return host;
}
const plaeneInOap = () => readProjectFile(fs.eintraege.get(OAP)!).dateien?.filter((d) => d.art === 'qgis') ?? [];

describe('Katasterpläne exportieren', () => {
  it('übernimmt die Vorlage in die Projektdatei, füllt die Planköpfe und legt die Pläne ab', async () => {
    const host = await zeige(createElement(KatasterDialog, { basis: ORDNER, name: 'BS9 Musterstraße 9', onClose: () => undefined }));
    expect(host.textContent).toContain('beim Export wird Kataster.qgz übernommen');
    expect(host.textContent).toContain('E 405.577,31');
    await klick(knopf(host, '4 Pläne exportieren'));

    // Vorlage liegt jetzt in der .oap
    expect(plaeneInOap()).toEqual([expect.objectContaining({ name: 'Kataster.qgz', art: 'qgis' })]);
    expect(host.textContent).toContain('Kataster.qgz übernommen am');

    const a = qgis.aufrufe[0];
    expect(a.programm).toContain('qgis_process-qgis-ltr.bat');
    expect(a.skript).toContain('class KatasterExport');
    expect(a.vorlageName).toBe('Kataster.qgz');
    expect(vorlageLesen(a.vorlage).layouts).toHaveLength(2);
    const auftrag = a.auftrag as { variablen: Record<string, string>; koordinaten: unknown; plaene: { id: string; ausgabe: string }[] };
    expect(auftrag.variablen).toEqual({ project_title: 'Neubau EFH', project_identifier: 'MUS', project_street: 'Prinzipalmarkt 10', project_city: 'Münster', project_zip_code: '48143' });
    expect(auftrag.koordinaten).toEqual({ ost: 405577.31, nord: 5757743.76, epsg: 25832 });
    const d = jjmmtt();
    // ohne aktiven Antrag in der Projektdatei entfällt {Art}
    const namen = ['Katasterauszug A4.pdf', 'Katasterauszug A3.pdf', 'Schwarzplan.dxf', 'Katasterplan.dxf'].map((n) => `Kataster/MUS ${d} ${n}`);
    expect(auftrag.plaene.map((p) => p.ausgabe)).toEqual(namen.map((n) => `${ORDNER}/${n}`));
    for (const n of namen) expect(fs.eintraege.has(`${ORDNER}/${n}`)).toBe(true);
    expect(host.querySelectorAll('.ka-ergebnis.ok')).toHaveLength(4);
    expect(host.textContent).toContain(`✓ Kataster/MUS ${d} Schwarzplan.dxf`);

    // noch einmal: vorhandene Dateien – überspringen heißt hier: nichts zu tun
    await klick(knopf(host, '4 Pläne exportieren'));
    expect(document.body.textContent).toContain('4 Dateien gibt es schon');
    await klick(knopf(document.body, 'Vorhandene überspringen'));
    expect(qgis.aufrufe).toHaveLength(1);

    // mit neuem Namen: nichts wird überschrieben, die neuen heißen „… (2)“
    await klick(knopf(host, '4 Pläne exportieren'));
    await klick(knopf(document.body, 'Mit neuem Namen ablegen'));
    expect(qgis.aufrufe).toHaveLength(2);
    expect(fs.eintraege.has(`${ORDNER}/Kataster/MUS ${d} Schwarzplan (2).dxf`)).toBe(true);
    // die Vorlage der Projektdatei wird weiter verwendet (nicht erneut übernommen)
    expect(plaeneInOap()).toHaveLength(1);
  });

  it('„Vorlage aktualisieren“ ersetzt die Vorlage der Projektdatei durch die globale', async () => {
    const host = await zeige(createElement(KatasterDialog, { basis: ORDNER, name: 'BS9 Musterstraße 9', onClose: () => undefined }));
    await klick(knopf(host, 'Vorlage übernehmen'));
    expect(vorlageLesen(plaeneInOap()[0].daten).layouts.map((l) => l.name)).toEqual(['Katasterauszug A4', 'Katasterauszug A3']);
    qgis.dateien.set(VORLAGE, vorlageQgz(vorlageQgs(['Katasterauszug A4', 'Katasterauszug A3', 'Lageplan A2'])));
    await klick(knopf(host, 'Vorlage aktualisieren'));
    expect(plaeneInOap()).toHaveLength(1);
    expect(vorlageLesen(plaeneInOap()[0].daten).layouts.map((l) => l.name)).toContain('Lageplan A2');
    expect(host.textContent).toContain('✓ übernommen');
  });

  it('Fehler je Plan aus QGIS; ohne Koordinaten kein Export', async () => {
    qgis.lauf = (a) => {
      const plaene = (a.auftrag as { plaene: { id: string; ausgabe: string }[] }).plaene;
      return {
        ok: ['a4'],
        ausgabe: plaene
          .map((p) => `ERGEBNIS ${JSON.stringify(p.id === 'a4' ? { id: p.id, ok: true, datei: p.ausgabe } : { id: p.id, ok: false, fehler: `${p.id}: Layer nicht erreichbar` })}`)
          .join('\n'),
      };
    };
    const host = await zeige(createElement(KatasterDialog, { basis: ORDNER, name: 'BS9 Musterstraße 9', onClose: () => undefined }));
    await klick(knopf(host, '4 Pläne exportieren'));
    expect(host.querySelectorAll('.ka-ergebnis.ok')).toHaveLength(1);
    expect(host.textContent).toContain('✗ schwarzplan: Layer nicht erreichbar');

    // QGIS bricht ohne Ergebnis ab: Auszug der Fehlerausgabe
    qgis.lauf = () => ({ code: 1, ausgabe: '', fehler: 'Traceback …\nModuleNotFoundError: No module named qgis' });
    await klick(knopf(host, '4 Pläne exportieren'));
    expect(document.body.textContent).toContain('Eine Datei gibt es schon');
    await klick(knopf(document.body, 'Mit neuem Namen ablegen'));
    expect(host.querySelector('.ka-meldung')!.textContent).toContain('No module named qgis');

    act(() => root!.unmount());
    root = null;
    fs.setze(OAP, oap(false));
    const h2 = await zeige(createElement(KatasterDialog, { basis: ORDNER, name: 'BS9 Musterstraße 9', onClose: () => undefined }));
    expect(h2.textContent).toContain('Keine Koordinaten');
    expect(knopf(h2, 'Pläne exportieren').disabled).toBe(true);
  });
});

describe('Ablage im Ordner des aktiven Antrags', () => {
  it('nimmt den aktiven Antrag aus der Projektdatei (meta.antrag) – ohne ihn kein Export', async () => {
    const p = readProjectFile(fs.eintraege.get(OAP)!);
    p.meta.antrag = { name: 'BAUA 2' };
    fs.setze(OAP, writeArchive(p));
    await useKataster.getState().aendern({ ziel: 'antrag' });
    const host = await zeige(createElement(KatasterDialog, { basis: ORDNER, name: 'BS9', onClose: () => undefined }));
    expect(host.textContent).toContain('Ablage: TÖB/BAUA 2');
    await klick(knopf(host, '4 Pläne exportieren'));
    expect(fs.eintraege.has(`${ORDNER}/TÖB/BAUA 2/MUS BAUA ${jjmmtt()} Katasterauszug A4.pdf`)).toBe(true);

    act(() => root!.unmount());
    root = null;
    delete p.meta.antrag;
    fs.setze(OAP, writeArchive(p));
    const h2 = await zeige(createElement(KatasterDialog, { basis: ORDNER, name: 'BS9', onClose: () => undefined }));
    expect(h2.textContent).toContain('Kein aktiver Antrag in der Projektdatei');
    expect(knopf(h2, 'Pläne exportieren').disabled).toBe(true);
  });

  it('übernimmt die Einstellungen aus Formulare beim ersten Laden', async () => {
    const { konfigAendern, konfigLesen } = await import('@core/platform/konfig');
    localStorage.clear();
    await konfigAendern('formulare', () => ({ kataster: { vorlage: 'C:/Alt/Kataster.qgz', ziel: 'pfad', zielpfad: 'Lagepläne', dateiname: '{Code} {Name}', plaene: [] } }));
    await useKataster.getState().laden();
    expect(useKataster.getState().einstellungen).toMatchObject({ vorlage: 'C:/Alt/Kataster.qgz', zielpfad: 'Lagepläne', dateiname: '{Code} {Name}' });
    expect(await konfigLesen('kataster')).toMatchObject({ zielpfad: 'Lagepläne' });
  });
});

describe('Einstellungen der Katasterpläne', () => {
  it('zeigt Layouts und Themen der Vorlage, sucht qgis_process, ändert Pläne', async () => {
    useKataster.getState().programmSetzen('');
    const host = await zeige(createElement(KatasterEinstellungen));
    expect(host.textContent).toContain('2 Layouts (Katasterauszug A4, Katasterauszug A3) · 2 Kartenthemen (Katasterplan, Schwarzplan)');
    // Ausschnitt aus Kartenobjekt und Maßstab
    expect(host.textContent).toContain('zeigt bei 1:1.000 einen Ausschnitt von 190 × 190 m');
    await klick(knopf(host, 'Suchen'));
    expect(useKataster.getState().programm).toBe('C:/Program Files/QGIS 3.40.5/bin/qgis_process-qgis-ltr.bat');
    expect(host.textContent).toContain('Gewählt');

    // Thema, das es nicht gibt → Hinweis; Plan entfernen und hinzufügen
    await act(() => useKataster.getState().planAendern('schwarzplan', { thema: 'Luftbild' }));
    await warte();
    expect(host.textContent).toContain('Kartenthema „Luftbild“ gibt es in der Vorlage nicht.');
    await klick(host.querySelector<HTMLButtonElement>('button[aria-label="Katasterplan entfernen"]')!);
    await klick(knopf(host, 'DXF'));
    expect(useKataster.getState().einstellungen.plaene.map((p) => p.name)).toEqual(['Katasterauszug A4', 'Katasterauszug A3', 'Schwarzplan', 'Neue DXF']);
    // gespeichert im gemeinsamen Konfigurationsbereich
    const roh = JSON.parse(Object.entries(localStorage).find(([k]) => k.includes('kataster') && String(localStorage.getItem(k)).includes('plaene'))![1] as string);
    expect(roh.plaene).toHaveLength(4);
  });
});
