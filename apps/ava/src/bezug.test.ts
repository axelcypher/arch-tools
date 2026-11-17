import { describe, expect, it } from 'vitest';
import { vollerOrt } from '@core/einstellungen/baum';
import { pfadEinstellung } from '@core/einstellungen/pfade';
import type { OrdnerEintrag } from '@core/projektdatei';
import type { AvaDateien } from './dateien';
import { VORGABE, type AvaEinstellungen } from './einstellungen';
import { projektLesen } from './projekt';
import { auftragsordner, type Kontext } from './abrechnung/ablauf';

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

  it('Auftragsordner (Rechnungen, Muster der Rechnungsdateien) wie in der Abrechnung', () => {
    const k = { e } as Kontext;
    expect(auftragsordner(k, { pfad: `${e.ablage.gewerke}/${GEWERK}` } as never, 'G08')).toBe(ort('ablage.fabrio.auftrag'));
    // die Rechnungsdateien liegen im Auftragsordner
    expect(ort('plaene.fabrio.rechnungen', 'R.pdf')).toBe(`${ort('ablage.fabrio.auftrag')}/R.pdf`);
  });

  it('neue LV-Dateien im LV-Unterordner des Gewerks', () => {
    expect(ort('vorlagen.fabrio.lv', 'x')).toBe(`${ort('ablage.fabrio.lv')}/x`);
  });
});
