import { describe, expect, it, vi } from 'vitest';
import { vollerOrt } from '@core/einstellungen/baum';
import { pfadEinstellung } from '@core/einstellungen/pfade';
import type { OrdnerEintrag } from '@core/projektdatei';
import type { AvaDateien } from './dateien';
import { VORGABE, type AvaEinstellungen } from './einstellungen';
import { neuesLvPfad, projektLesen } from './projekt';
import { auftragsordner, type Kontext } from './abrechnung/ablauf';
import { nameBilden } from './abrechnung/benennung';

/**
 * Bezüge auf „Pfade und Benennung“ gegen die Auflösung in FABRIO: Die Pfade der Unterordner bildet der Test aus dem
 * Baum (`vollerOrt`) – liest FABRIO sie anders, schlägt er fehl.
 */
const e: AvaEinstellungen = { ...VORGABE, ablage: { ...VORGABE.ablage, gewerke: 'Ausführung/Gewerke', lv: 'LV', auftrag: 'Auftrag', korrespondenz: 'Post' } };
const WERTE: Record<string, string> = {
  'ablage.fabrio.gewerke': e.ablage.gewerke,
  'ablage.fabrio.lv': e.ablage.lv,
  'ablage.fabrio.auftrag': e.ablage.auftrag,
  'ablage.fabrio.korrespondenz': e.ablage.korrespondenz,
};
const GEWERK = 'G08 Fenster';
const ort = (id: string, datei?: string) => {
  const o = vollerOrt(
    pfadEinstellung(id),
    (x) => WERTE[x],
    () => GEWERK,
  );
  expect(o?.von, id).toBe('projekt');
  return [...o!.teile, ...(datei ? [datei] : [])].join('/');
};

/** Dateisystem aus einer Liste relativer Dateipfade unter „P“ */
function dateien(pfade: string[]): AvaDateien {
  const alle = new Set<string>();
  for (const p of pfade) {
    const t = p.split('/');
    for (let i = 1; i < t.length; i++) alle.add(`${t.slice(0, i).join('/')}/`);
    alle.add(p);
  }
  const liste = async (root: string, tiefe: number): Promise<OrdnerEintrag[]> => {
    const praefix = root === 'P' ? '' : `${root.slice(2)}/`;
    return [...alle]
      .filter((p) => p.startsWith(praefix) && p !== praefix)
      .map((p) => ({ pfad: p.slice(praefix.length).replace(/\/$/, ''), ordner: p.endsWith('/'), groesse: 1 }))
      .filter((x) => x.pfad.split('/').length <= tiefe);
  };
  return { liste } as unknown as AvaDateien;
}

describe('Bezüge von FABRIO: Unterordner relativ zum Ordner des Gewerks im Ordner der Gewerke', () => {
  it('LV-Dateien, Aufträge und Mailverkehr werden dort erkannt', async () => {
    const lv = ort('ablage.fabrio.lv', 'LV Fenster.oalv');
    const auftrag = ort('ablage.fabrio.auftrag', 'Angebot.pdf');
    const post = ort('ablage.fabrio.korrespondenz', 'Rückfrage.msg');
    expect(lv).toBe('Ausführung/Gewerke/G08 Fenster/LV/LV Fenster.oalv');
    const p = await projektLesen(dateien([lv, auftrag, post]), 'P', e);
    const g = p.gewerke.find((x) => x.ordner === GEWERK)!;
    expect(g.lvs.map((d) => d.name)).toEqual(['LV Fenster.oalv']);
    expect(g.auftrag.map((d) => d.name)).toEqual(['Angebot.pdf']);
    expect(g.korrespondenz.map((d) => d.name)).toEqual(['Rückfrage.msg']);
    expect(g.sonstige).toEqual([]);
  });

  it('Auftragsordner wie in der Abrechnung; Rechnungsdateien nach dem ersten Muster werden dort als Rechnung erkannt', async () => {
    const k = { e } as Kontext;
    expect(auftragsordner(k, { pfad: `${e.ablage.gewerke}/${GEWERK}` } as never, 'G08')).toBe(ort('ablage.fabrio.auftrag'));
    // eine Datei nach dem Muster dort, wo der Baum die Rechnungsdateien zeigt (im Auftragsordner)
    const name = `${nameBilden(e.rechnungen.muster[0], { kuerzel: 'BS9', nr: 53, art: 'SR', lfd: 4, firma: 'Musterbau', datum: '2026-11-12', gewerk: 'G08' })}.pdf`;
    const p = await projektLesen(dateien([ort('plaene.fabrio.rechnungen', name)]), 'P', e);
    expect(p.gewerke.find((x) => x.ordner === GEWERK)!.rechnungen.map((d) => d.name)).toEqual([name]);
  });

  it('neue LV-Dateien im LV-Unterordner des Gewerks (wo FABRIO sie anlegt)', () => {
    const pfad = neuesLvPfad(e.ablage, { pfad: `${e.ablage.gewerke}/${GEWERK}` }, 'G08', 'BS9 LV', 'Fenster', 'oalv');
    expect(pfad).toBe(ort('vorlagen.fabrio.lv', 'BS9 LV Fenster.oalv'));
  });

  it('Bauleitung relativ zum Projektordner (wo FABRIO Berichte ablegt)', async () => {
    const { useAva } = await import('./store');
    const { berichtAblegen } = await import('./components/bauleitung/gemeinsam');
    const anlegen = vi.fn(async () => true);
    useAva.setState({ projekt: { ordner: 'P' } as never, einstellungen: { ...e, ablage: { ...e.ablage, bauleitung: 'Ausführung/Bauleitung' } }, fs: { anlegen } as never });
    const pfad = await berichtAblegen('Protokoll 1.pdf', new Uint8Array([1]));
    const o = vollerOrt(pfadEinstellung('ablage.fabrio.bauleitung'), () => 'Ausführung/Bauleitung');
    expect(o?.von).toBe('projekt');
    expect(pfad).toBe(`${o!.teile.join('/')}/Protokoll 1.pdf`);
    expect(anlegen).toHaveBeenCalledWith('P', pfad, expect.any(Uint8Array));
  });
});
