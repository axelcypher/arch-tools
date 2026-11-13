import { describe, expect, it } from 'vitest';
import { bedingungAus } from '../bedingung';
import { entfallGruende, entfallText, offenGruende } from '../entfall';
import type { Feld } from '../forma/felder';
import { leeresProfil } from '../profil';
import { wirksam } from '../vorgabe';
import { begruendet, ist, q, wenn } from '../vorgaben/hilfen';
import type { Paragraf } from './index';
import { absatzZeilen, gesetzBekannt, gesetzLaden, quelleText } from './index';

describe('Gesetzestexte', () => {
  it('Fundstelle in Worten', () => {
    expect(quelleText(q('bauo-nrw', '68', 2, 3))).toBe('§ 68 Absatz 2 Satz 3 BauO NRW 2018');
    expect(quelleText(q('baupruefvo', '10', 1, undefined, 4))).toBe('§ 10 Absatz 1 Nummer 4 BauPrüfVO');
  });

  it('Zeilen eines Absatzes: von „(n)“ bis vor den nächsten', () => {
    const p: Paragraf = { titel: 'T', url: '', text: ['(1) eins', '1. Punkt', '(2) zwei', '(3) drei'] };
    expect(absatzZeilen(p, 1)).toEqual({ von: 0, bis: 2 });
    expect(absatzZeilen(p, 3)).toEqual({ von: 3, bis: 4 });
    expect(absatzZeilen(p, 9)).toEqual({ von: 0, bis: 4 });
    expect(absatzZeilen(p)).toEqual({ von: 0, bis: 4 });
  });

  it('die amtlichen Texte sind in der App (BauO NRW 2018, BauPrüfVO)', async () => {
    const bauo = await gesetzLaden('bauo-nrw');
    expect(bauo.fassung).toMatch(/^gültig ab \d\d\.\d\d\.\d{4}$/);
    expect(bauo.paragrafen['68'].titel).toBe('Bautechnische Nachweise');
    expect(bauo.paragrafen['68'].url).toContain('#ss-68-');
    expect(absatzZeilen(bauo.paragrafen['68'], 2).von).toBeGreaterThan(0);
    expect(gesetzBekannt('baupruefvo') && gesetzBekannt('baugb')).toBe(true);
    expect(gesetzBekannt('unbekannt')).toBe(false);
  });
});

describe('Begründung an Bedingungen', () => {
  const b = begruendet(wenn(ist('Gebäudeart', 'Nichtwohngebäude')), 'Nur für Betriebe.', q('baupruefvo', '5', 2));

  it('bleibt beim Lesen und in der Vorgabe unter eigenen Einstellungen erhalten', () => {
    expect(bedingungAus(JSON.parse(JSON.stringify(b)))).toEqual(b);
    expect(bedingungAus({ ...b, quellen: [{ gesetz: 'x' }, { gesetz: 'bauo-nrw', paragraf: '6', absatz: -1 }] })?.quellen).toEqual([{ gesetz: 'bauo-nrw', paragraf: '6' }]);
    const p = wirksam({ ...leeresProfil(), bedingungen: { '0:A': b } }, { abschnitte: {}, zaehlt: {}, feldTitel: { '0:A': 'Titel' } });
    expect(p.bedingungen?.['0:A']).toEqual(b);
  });

  it('Gründe und Hinweis eines entfallenden Felds', () => {
    const feld = { schluessel: '0:A', name: 'A', art: 'kreuz', beschriftung: 'A' } as Feld;
    const p = { ...leeresProfil(), bedingungen: { '0:A': b } };
    const gruende = entfallGruende(feld, undefined, p, { merkmale: { Gebäudeart: 'Einfamilienhaus' } });
    expect(gruende.map((e) => e.ebene)).toEqual(['feld']);
    expect(entfallText(gruende, [feld], p, { Gebäudeart: 'Einfamilienhaus' }).split('\n')).toEqual([
      'Entfällt',
      'Nur für Betriebe.',
      '(nur erforderlich, wenn Gebäudeart Nichtwohngebäude)',
      'Rechtsgrundlage: § 5 Absatz 2 BauPrüfVO – klicken für den Gesetzestext',
    ]);
    expect(entfallGruende(feld, undefined, p, { merkmale: { Gebäudeart: 'Nichtwohngebäude' } })).toEqual([]);
    expect(offenGruende(feld, undefined, p, { merkmale: { Gebäudeart: 'Nichtwohngebäude' } })).toEqual([]);
  });

  it('fehlt das Merkmal, entfällt nichts: Offen-Grund und Offen-Hinweis statt „Entfällt“ (R-01)', () => {
    const feld = { schluessel: '0:A', name: 'A', art: 'kreuz', beschriftung: 'A' } as Feld;
    const p = { ...leeresProfil(), bedingungen: { '0:A': b } };
    expect(entfallGruende(feld, undefined, p, { merkmale: {} })).toEqual([]);
    const offen = offenGruende(feld, undefined, p, { merkmale: {} });
    expect(offen.map((e) => e.ebene)).toEqual(['feld']);
    const text = entfallText(offen, [feld], p, {}, 'offen');
    expect(text.split('\n')).toEqual([
      'Ungeklärt – hängt ab von: Gebäudeart (nicht festgelegt)',
      'Erforderlich, bis Gebäudeart festgelegt ist.',
      'Nur für Betriebe.',
      '(nur erforderlich, wenn Gebäudeart Nichtwohngebäude)',
      'Im Projekt noch nicht festgelegt: Gebäudeart',
      'Rechtsgrundlage: § 5 Absatz 2 BauPrüfVO – klicken für den Gesetzestext',
    ]);
    expect(text).not.toContain('Entfällt');
  });
});
