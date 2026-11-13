import { strFromU8 } from 'fflate';
import { describe, expect, it } from 'vitest';
import { musterLv } from '../__fixtures__/muster';
import { positionen } from '../lv/modell';
import { summen } from '../lv/rechnen';
import type { Lv, Position } from '../lv/modell';
import { leeresLv, neueId } from '../lv/modell';
import { angebotUebernehmen, gaebLesen, gaebPruefen, gaebSchreiben, gleicherBieter } from './gaeb';
import { alsText } from './rtf';

const enc = (s: string) => new TextEncoder().encode(s);
/** kleine fremde GAEB-Datei mit einer Position; `lang` ist der Inhalt von <Text> */
const fremd = (lang: string, extra = '', qu = 'm2') =>
  `<?xml version="1.0" encoding="UTF-8"?>
<GAEB xmlns="http://www.gaeb.de/GAEB_DA_XML/DA83/3.3">
  <Award><DP>83</DP>
    <BoQ><BoQInfo><LblTx><p><span>Fremd</span></p></LblTx></BoQInfo>
      <BoQBody>
        <BoQCtgy RNoPart="01"><LblTx><p>Abschnitt</p></LblTx>
          <BoQBody><Itemlist>
            <Remark ID="R1"><Description><CompleteText><OutlineText><OutlTxt><TextOutlTxt><p>Erster Hinweis</p></TextOutlTxt></OutlTxt></OutlineText></CompleteText></Description></Remark>
            <Remark ID="R2"><Description><CompleteText><OutlineText><OutlTxt><TextOutlTxt><p>Zweiter Hinweis</p></TextOutlTxt></OutlTxt></OutlineText></CompleteText></Description></Remark>
            <Item RNoPart="0010"><Qty>12.500</Qty><QU>${qu}</QU>${extra}
              <Description><CompleteText>
                <DetailTxt><Text>
                  ${lang}
                </Text></DetailTxt>
                <OutlineText><OutlTxt><TextOutlTxt><p>Kurz</p></TextOutlTxt></OutlTxt></OutlineText>
              </CompleteText></Description>
            </Item>
          </Itemlist></BoQBody>
        </BoQCtgy>
      </BoQBody>
    </BoQ>
  </Award>
</GAEB>`;

const p = (oz: string, extra: Partial<Position> = {}): Position => ({
  id: neueId(),
  art: 'position',
  oz,
  kurztext: `Pos ${oz}`,
  langtext: [],
  einheit: 'St',
  menge: 1,
  positionsart: 'normal',
  preise: { '0': { ep: 10 } },
  ...extra,
});

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

  it('fremder Langtext: gemischter Inhalt in Reihenfolge, <br/>, Einrückung als Leerzeichen', () => {
    const g = gaebLesen(
      enc(
        fremd(`<p>Vorher <span style="font-weight:bold">fett</span> nachher</p>
                  <p>Zeile1<br/>Zeile2</p>
                  <p>
                    <span>eingerückt</span>
                    <span>weiter</span>
                  </p>`),
      ),
    );
    const pos = (g.lv.elemente[0] as { kinder: Position[] }).kinder.find((x) => x.art === 'position')!;
    expect(pos.langtext[0].laeufe).toEqual([{ text: 'Vorher ' }, { text: 'fett', fett: true }, { text: ' nachher' }]);
    expect(alsText([pos.langtext[1]])).toBe('Zeile1\nZeile2');
    expect(alsText([pos.langtext[2]])).toBe('eingerückt weiter');
    expect(pos.kurztext).toBe('Kurz');
    expect(pos.menge).toBe(12.5);
  });

  it('Hinweise eines Abschnitts behalten ihre Reihenfolge', () => {
    const g = gaebLesen(enc(fremd('<p>x</p>')));
    const kinder = (g.lv.elemente[0] as { kinder: { kurztext: string }[] }).kinder;
    expect(kinder.map((x) => x.kurztext)).toEqual(['Erster Hinweis', 'Zweiter Hinweis', 'Kurz']);
  });

  it('„ha“ ist kein Stundenlohn, „h“ und „Std.“ schon', () => {
    const pos = (qu: string) => (gaebLesen(enc(fremd('<p>x</p>', '', qu))).lv.elemente[0] as { kinder: Position[] }).kinder.find((x) => x.art === 'position')!;
    expect(pos('ha').stundenlohn).toBeUndefined();
    expect(pos('hl').stundenlohn).toBeUndefined();
    expect(pos('h').stundenlohn).toBe(true);
    expect(pos('Std.').stundenlohn).toBe(true);
  });

  it('ISO-8859-1 auch mit einfachen Anführungszeichen; UTF-8 ohne Angabe; ungültiges UTF-8 als Windows-1252', () => {
    const latin = (kopf: string) => {
      const t = fremd('<p>Größe Maß</p>').replace('<?xml version="1.0" encoding="UTF-8"?>', kopf);
      return Uint8Array.from([...t].map((c) => c.charCodeAt(0)));
    };
    const lang = (b: Uint8Array) => alsText((gaebLesen(b).lv.elemente[0] as { kinder: Position[] }).kinder.find((x) => x.art === 'position')!.langtext);
    expect(lang(latin("<?xml version='1.0' encoding='ISO-8859-1'?>"))).toBe('Größe Maß');
    expect(lang(latin('<?xml version="1.0"?>'))).toBe('Größe Maß');
    expect(lang(enc(fremd('<p>Größe Maß</p>')))).toBe('Größe Maß');
  });

  it('abgeschnittene oder kaputte Datei: verständlicher Fehler statt Hängen', () => {
    expect(() => gaebLesen(enc('<GAEB><Award><!-- abgeschnitten'))).toThrow(/unvollständig/);
    expect(() => gaebLesen(enc('<GAEB><Award><![CDATA[ abgeschnitten'))).toThrow(/unvollständig/);
    expect(() => gaebLesen(enc('<?xml version="1.0"'))).toThrow(/unvollständig/);
    expect(() => gaebLesen(enc('<GAEB><Award><BoQ></Award></GAEB>'))).toThrow(/beschädigt/);
  });

  it('X83-Export: Hinweise nur in Positionslisten, Vorbemerkungen und Abschnitts-Langtext kommen zurück', () => {
    const lv = musterLv();
    const a = lv.elemente[1];
    if (a.art !== 'abschnitt') throw new Error();
    a.langtext = [{ laeufe: [{ text: 'Langtext des Abschnitts' }] }];
    const t = strFromU8(gaebSchreiben(lv, { dp: 83 }));
    // kein <Remark> direkt im BoQBody oder BoQCtgy
    expect(t).not.toMatch(/<BoQBody><Remark/);
    expect(t).not.toMatch(/<\/LblTx><Remark/);
    expect(t).not.toContain('RNoPart="99"');
    const g = gaebLesen(enc(t));
    expect(g.lv.elemente[0]).toMatchObject({ art: 'hinweis', vorbemerkung: true, kurztext: 'Vorbemerkungen' });
    expect(g.lv.elemente.filter((e) => e.art === 'abschnitt').map((e) => (e as { oz: string }).oz)).toEqual(['01', '02']);
    const a2 = g.lv.elemente[1];
    expect(a2.art === 'abschnitt' && alsText(a2.langtext)).toBe('Langtext des Abschnitts');
    expect(a2.art === 'abschnitt' && a2.kinder.some((x) => x.art === 'hinweis')).toBe(false);
  });

  it('Grund- und Wahlpositionen: fortlaufende Gruppen, Bezug kommt zurück', () => {
    const lv: Lv = leeresLv('Gruppen');
    const g1 = p('0010', { positionsart: 'grund' });
    const w1 = p('0020', { positionsart: 'wahl', bezug: g1.id });
    const g2 = p('0030', { positionsart: 'grund' });
    const w2 = p('0040', { positionsart: 'wahl' });
    lv.elemente = [{ id: neueId(), art: 'abschnitt', oz: '01', kurztext: 'A', langtext: [], kinder: [g1, w1, g2, w2] }];
    const t = strFromU8(gaebSchreiben(lv, { dp: 83 }));
    expect([...t.matchAll(/<ALNGroupNo>(\d+)<\/ALNGroupNo><ALNSerNo>(\d+)/g)].map((m) => `${m[1]}/${m[2]}`)).toEqual(['1/0', '1/1', '2/0', '2/1']);
    const kinder = (gaebLesen(enc(t)).lv.elemente[0] as { kinder: Position[] }).kinder;
    expect(kinder[1].bezug).toBe(kinder[0].id);
    expect(kinder[3].bezug).toBe(kinder[2].id);
  });

  it('Positionen neben Abschnitten: Prüfung meldet sie, X84 wird trotzdem vollständig zugeordnet', () => {
    const lv = musterLv();
    const lose = p('0500', { preise: { '0': { ep: 10 }, '11': { ep: 7.5 } } });
    lv.elemente.push(lose);
    expect(gaebPruefen(lv).join(' ')).toMatch(/Positionen neben Abschnitten/);
    expect(gaebPruefen(musterLv())).toEqual([]);
    const x84 = gaebLesen(gaebSchreiben(lv, { dp: 84, bieterId: 11 }));
    const ohne11 = { ...lv, bieter: lv.bieter.filter((b) => b.id !== 11), elemente: lv.elemente.map((e) => (e.art === 'position' ? { ...e, preise: { '0': { ep: 10 } } } : e)) };
    const r = angebotUebernehmen(ohne11, x84);
    expect(r.ohneZuordnung).toEqual([]);
    expect((r.lv.elemente.at(-1) as Position).preise[String(r.bieterId)].ep).toBe(7.5);
  });

  it('X84: Einheitspreis mit drei Stellen bleibt erhalten, Gesamtbetrag wie in der App gerundet', () => {
    const lv: Lv = leeresLv('Rundung');
    lv.bieter.push({ id: 10, name: 'A' });
    lv.elemente = [
      {
        id: neueId(),
        art: 'abschnitt',
        oz: '01',
        kurztext: 'A',
        langtext: [],
        kinder: [p('0010', { menge: 0.5, preise: { '10': { ep: 2.01 } } }), p('0020', { menge: 3, preise: { '10': { ep: 1.235 } } })],
      },
    ];
    const t = strFromU8(gaebSchreiben(lv, { dp: 84, bieterId: 10 }));
    expect(t).toContain('<UP>2.01</UP><IT>1.01</IT>');
    expect(t).toContain('<UP>1.235</UP><IT>3.71</IT>');
    expect(gaebLesen(enc(t)).preise.get('01.0020')).toBe(1.235);
  });

  it('erneutes Einlesen: gleicher Bieter wird erkannt, Ersetzen entfernt alte Preise', () => {
    const lv = musterLv();
    const x84 = gaebLesen(gaebSchreiben(lv, { dp: 84, bieterId: 11 }));
    expect(gleicherBieter(lv, x84)?.id).toBe(11);
    x84.preise.delete('02.0010');
    const r = angebotUebernehmen(lv, x84, 11);
    expect(r.zugeordnet).toBe(5);
    const erste = (r.lv.elemente[2] as { kinder: Position[] }).kinder[0];
    expect(erste.preise['11']).toBeUndefined();
    expect(erste.preise['10']).toBeDefined();
  });
});
