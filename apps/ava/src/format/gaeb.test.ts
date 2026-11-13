import { strFromU8 } from 'fflate';
import { describe, expect, it } from 'vitest';
import { musterLv } from '../__fixtures__/muster';
import { positionen } from '../lv/modell';
import { summen } from '../lv/rechnen';
import { angebotUebernehmen, gaebLesen, gaebSchreiben } from './gaeb';
import { alsText } from './rtf';

describe('GAEB DA XML', () => {
  it('X83: Gliederung, Texte, Mengen und Positionsarten kommen unverändert zurück', () => {
    const lv = musterLv();
    const xml = gaebSchreiben(lv, { dp: 83, jetzt: new Date(2026, 10, 12, 10, 0) });
    const t = strFromU8(xml);
    expect(t).toContain('xmlns="http://www.gaeb.de/GAEB_DA_XML/DA83/3.3"');
    expect(t).toContain('<DP>83</DP>');
    expect(t).not.toContain('<UP>');
    expect(t).toContain('<Provis>WithoutTotal</Provis>');
    const g = gaebLesen(xml);
    expect(g.dp).toBe(83);
    expect(g.lv.kopf.bezeichnung).toBe('G08 Fensterarbeiten');
    const a = positionen(lv);
    const b = positionen(g.lv);
    expect(b.map((x) => [x.pfad.map((p) => p.oz).join('.'), x.pos.oz, x.pos.kurztext, x.pos.menge, x.pos.einheit, x.pos.positionsart])).toEqual(
      a.map((x) => [x.pfad.map((p) => p.oz).join('.'), x.pos.oz, x.pos.kurztext, x.pos.menge, x.pos.einheit, x.pos.positionsart]),
    );
    expect(alsText(b[1].pos.langtext)).toBe(alsText(a[1].pos.langtext));
    expect(b[1].pos.langtext[2].laeufe[1]).toEqual({ text: 'nach Wahl des AN', fett: true });
    expect(g.lv.elemente[0]).toMatchObject({ art: 'hinweis', vorbemerkung: true, kurztext: 'Vorbemerkungen' });
  });

  it('X84: Angebot eines Bieters wird über die OZ als neuer Bieter übernommen', () => {
    const lv = musterLv();
    const x84 = gaebLesen(gaebSchreiben(lv, { dp: 84, bieterId: 11 }));
    expect(x84.bieter?.name).toBe('Beispiel Fensterbau');
    expect(x84.preise.get('02.0010')).toBe(790);
    const ohne11 = { ...lv, bieter: lv.bieter.filter((b) => b.id !== 11) };
    const r = angebotUebernehmen(ohne11, x84);
    expect(r.zugeordnet).toBe(6);
    expect(r.ohneZuordnung).toEqual([]);
    expect(summen(r.lv).bieter.get(r.bieterId)!.ohneNachlass).toBe(summen(lv).bieter.get(11)!.ohneNachlass);
  });
});
