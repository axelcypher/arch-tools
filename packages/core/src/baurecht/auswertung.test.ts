import { describe, expect, it } from 'vitest';
import { VORGABE_MERKMALE } from '../bedingung';
import type { Fassung } from '../recht/typen';
import type { AuswertungsEingabe } from './auswertung';
import { auswerten, modulFakten } from './auswertung';
import { kurzText, werten } from './kurz';
import { agsVorschlag, aktiveModule, fehlendeEbenen, paketAusDateien, paketPruefen, regeldateiFuer, signaturPruefen } from './paket';
import type { FaktWert, Modul, Regeldatei } from './typen';

const sicher = (wert: FaktWert['wert']): FaktWert => ({ wert, herkunft: 'manuell', sicherheit: 'sicher' });
const hinweis = (wert: FaktWert['wert']): FaktWert => ({ wert, herkunft: 'geodienst', sicherheit: 'hinweis', grund: 'Grenze nahe' });

const bund: Modul = {
  format: 1,
  id: 'bund',
  name: 'Bund',
  ebene: 'bund',
  version: '2026-11-12',
  normen: { bnatschg: { kurz: 'BNatSchG', titel: 'Bundesnaturschutzgesetz', thema: 'natur', quelle: { art: 'gii', pfad: 'bnatschg_2009' } } },
  bausteine: { innen: { m: 'Planungsrecht', in: ['Bebauungsplan', 'Innenbereich'] }, neubau: { m: 'Vorhaben', in: ['Errichtung'] } },
};
const land: Modul = {
  format: 1,
  id: 'nw',
  name: 'Nordrhein-Westfalen',
  ebene: 'land',
  schluessel: '05',
  version: '2026-11-12',
  normen: { 'bauo-nrw': { kurz: 'BauO NRW', titel: 'Landesbauordnung', thema: 'bauordnung', quelle: { art: 'recht-nrw', term: 32203 } } },
};
const gemeinde: Modul = {
  format: 1,
  id: 'nw-05974040',
  name: 'Stadt Soest',
  ebene: 'gemeinde',
  schluessel: '05974040',
  plz: ['59494'],
  ueber: 'nw',
  version: '2026-11-12',
  normen: { satzung: { kurz: 'Satzung', titel: 'Satzung', thema: 'gestaltung', quelle: { art: 'datei', url: 'https://x/s.pdf', format: 'pdf' }, annahme: 'gilt als in Kraft' } },
  fakten: {
    'soest.zone': { titel: 'Zone', gruppe: 'ortsrecht', typ: 'wahl', werte: ['1', '2'], nach: { fakt: 'lage.ags', tabelle: { '05974040': '1' } } },
    'ortsrecht.satzung': { titel: 'Satzung vorhanden', gruppe: 'ortsrecht', typ: 'janein', wert: true },
  },
};

const bnatschg: Regeldatei = {
  format: 1,
  modul: 'bund',
  norm: 'bnatschg',
  fassung: '2026-09-30',
  version: 1,
  paragrafen: {
    '14': { gilt: { $: 'neubau' }, entfaellt: { $: 'innen' }, grund: 'Eingriff in Natur und Landschaft.', fundstellen: ['14/1'], stand: { '14/1': 'aaaaaaaa' } },
    '44': { gilt: { m: 'Vorhaben', in: ['Errichtung', 'Änderung', 'Beseitigung'] }, gruenNurVonHand: true, grund: 'Artenschutz.' },
  },
};
const bauo: Regeldatei = {
  format: 1,
  modul: 'nw',
  norm: 'bauo-nrw',
  fassung: '2026-09-01',
  version: 1,
  geltung: { m: 'Gebäudeart', nicht: ['kein Gebäude'] },
  geltungGrund: 'nur für Gebäude',
  paragrafen: {
    '42a': {
      gilt: { und: [{ $: 'neubau' }, { tag: 'einreichung', ab: '2025-01-02' }] },
      entfaellt: { f: 'gebaeude.nutzflaeche', max: 50 },
      pruefen: { grund: 'Abs. 5 – im Einzelfall' },
      grund: 'PV-Pflicht.',
    },
    '6': { gilt: { m: 'Vorhaben', in: ['Errichtung', 'Änderung'] }, grund: 'Abstandsflächen.', behoerde: { m: 'Verfahren', in: ['vereinfachtes Verfahren', 'Baugenehmigungsverfahren'] } },
    '49': { gilt: { oder: [{ m: 'Gebäudeklasse', in: ['3', '4', '5'] }, { f: 'gebaeude.oeffentlich', ist: true }] }, grund: 'Barrierefreiheit.' },
    '1': { gilt: { f: 'schutz.uesg', ist: false }, grund: 'Test unsicherer Fakt.' },
    '2': { gilt: { n: 'nw/bauo-nrw/6', ampel: ['rot'] }, grund: 'Folgt § 6.' },
  },
};
const satzung: Regeldatei = { format: 1, modul: 'nw-05974040', norm: 'satzung', fassung: '2022-01-28', version: 1, paragrafen: { '1': { gilt: { f: 'soest.zone', in: ['1'] }, grund: 'Zone 1.' } } };

const paket = paketAusDateien(
  {
    'module/bund/modul.json': bund,
    'module/nw/modul.json': land,
    'module/nw-05974040/modul.json': gemeinde,
    'module/bund/bnatschg@2026-09-30.json': bnatschg,
    'module/nw/bauo-nrw@2026-09-01.json': bauo,
    'module/nw-05974040/satzung@2022-01-28.json': satzung,
  },
  'test',
);

const fassung = (summen: Record<string, string>): Fassung => ({
  id: 'bnatschg',
  kurz: 'BNatSchG',
  titel: '',
  fassung: '',
  url: '',
  paragrafen: { '14': { titel: 'Eingriffe in Natur und Landschaft', url: '', text: ['(1) …'] }, '44': { titel: 'Artenschutz', url: '', text: ['…'] } },
  gueltigAb: '2026-09-30',
  abgerufen: '',
  quelle: { art: 'gii', pfad: 'bnatschg_2009' },
  summen,
  kennung: 'x',
});

function eingabe(o: Partial<AuswertungsEingabe> = {}): AuswertungsEingabe {
  return {
    paket,
    module: aktiveModule(paket.module, '05974040'),
    merkmale: { Vorhaben: 'Errichtung', Gebäudeart: 'Einfamilienhaus', Planungsrecht: 'Außenbereich', Gebäudeklasse: '1', Verfahren: 'vereinfachtes Verfahren' },
    fakten: { 'lage.ags': sicher('05974040') },
    einreichung: '2026-12-01',
    heute: '2026-11-12',
    texte: new Map([['bund/bnatschg', { fassung: fassung({ '14/1': 'aaaaaaaa', '14': 'x' }) }]]),
    festlegungen: {},
    ...o,
  };
}
const p = (a: ReturnType<typeof auswerten>, id: string) => a.paragrafen.find((x) => x.id === id)!;

describe('Module und Regeldateien', () => {
  it('aktive Module nach Gemeindeschlüssel, fehlende Ebenen, Vorschlag aus der PLZ', () => {
    expect(aktiveModule(paket.module, '05974040').map((m) => m.id)).toEqual(['bund', 'nw', 'nw-05974040']);
    expect(aktiveModule(paket.module, '05111000').map((m) => m.id)).toEqual(['bund', 'nw']);
    expect(aktiveModule(paket.module, null).map((m) => m.id)).toEqual(['bund']);
    expect(fehlendeEbenen(paket.module, '05974040')).toEqual(['kreis']);
    expect(fehlendeEbenen(paket.module, '05111000')).toEqual(['gemeinde']);
    expect(agsVorschlag(paket.module, '59494')).toBe('05974040');
  });

  it('Regeldatei zur Fassung: neueste mit Fassung ≤ Text', () => {
    const l = [1, 2, 3].map((v) => ({ datei: `d${v}`, regel: { ...bauo, fassung: ['2024-01-01', '2026-09-01', '2027-05-01'][v - 1], version: v } }));
    expect(regeldateiFuer(l, '2026-10-30', '2026-11-12')?.regel.version).toBe(2);
    expect(regeldateiFuer(l, '2027-06-01', '2026-11-12')?.regel.version).toBe(3);
    expect(regeldateiFuer(l, undefined, '2025-01-01')?.regel.version).toBe(1);
  });

  it('Werte aus Modulen: fest und nach Tabelle; Angaben von Hand gehen vor', () => {
    const f = modulFakten([gemeinde], { 'lage.ags': sicher('05974040') });
    expect(f['soest.zone'].wert).toBe('1');
    expect(f['ortsrecht.satzung'].wert).toBe(true);
    expect(modulFakten([gemeinde], { 'lage.ags': sicher('05974040'), 'soest.zone': sicher('2') })['soest.zone'].wert).toBe('2');
  });

  it('Prüfung des Pakets findet unbekannte Fakten, Merkmalwerte und Verweise', () => {
    expect(paketPruefen(paket, VORGABE_MERKMALE)).toEqual([]);
    const kaputt = paketAusDateien(
      {
        'module/bund/modul.json': bund,
        'module/bund/bnatschg@2026-09-30.json': { ...bnatschg, paragrafen: { '1': { gilt: { und: [{ f: 'gibts.nicht', ist: true }, { m: 'Gebäudeklasse', in: ['7'] }, { n: 'bund/x/1', ampel: ['rot'] }] }, grund: '' } } },
      },
      'x',
    );
    const f = paketPruefen(kaputt, VORGABE_MERKMALE);
    expect(f.some((x) => /gibts\.nicht/.test(x))).toBe(true);
    expect(f.some((x) => /keinen Wert „7“/.test(x))).toBe(true);
    expect(f.some((x) => /bund\/x\/1/.test(x))).toBe(true);
    expect(f.some((x) => /Begründung fehlt/.test(x))).toBe(true);
  });
});

describe('Ampel je Paragraf', () => {
  it('Tatbestand ja → rot, mit Prüfung durch die Behörde', () => {
    const a = auswerten(eingabe());
    expect(p(a, 'nw/bauo-nrw/6')).toMatchObject({ ampel: 'rot', behoerde: 'ja', gruende: ['Abstandsflächen.'] });
    expect(p(a, 'nw/bauo-nrw/2').ampel).toBe('rot'); // folgt § 6
  });

  it('Ausnahme greift → grün; Ausnahme offen → rot mit Hinweis', () => {
    const offen = auswerten(eingabe());
    expect(p(offen, 'nw/bauo-nrw/42a').ampel).toBe('rot');
    expect(p(offen, 'nw/bauo-nrw/42a').hinweise.join(' ')).toMatch(/Ausnahme möglich.*Nutzfläche/);
    const klein = auswerten(eingabe({ fakten: { 'lage.ags': sicher('05974040'), 'gebaeude.nutzflaeche': sicher(40) } }));
    // Ausnahme nach Abs. 4 greift sicher – der Einzelfall nach Abs. 5 spielt dann keine Rolle
    expect(p(klein, 'nw/bauo-nrw/42a').ampel).toBe('gruen');
    expect(p(offen, 'nw/bauo-nrw/42a').hinweise.join(' ')).toMatch(/Im Einzelfall prüfen: Abs. 5/);
  });

  it('Stichtag: Antrag vor dem Stichtag → grün; Einzelfall mit Bedingung macht Grün gelb', () => {
    expect(p(auswerten(eingabe({ einreichung: '2024-06-01' })), 'nw/bauo-nrw/42a').ampel).toBe('gruen');
    const mitWenn = paketAusDateien(
      {
        'module/bund/modul.json': bund,
        'module/nw/modul.json': land,
        'module/nw/bauo-nrw@2026-09-01.json': { ...bauo, paragrafen: { '42a': { ...bauo.paragrafen['42a'], pruefen: { grund: 'Planreife', wenn: { f: 'planung.planaufstellung', ist: true } } } } },
      },
      'x',
    );
    const a = auswerten(eingabe({ paket: mitWenn, module: aktiveModule(mitWenn.module, '05974040'), einreichung: '2024-06-01' }));
    expect(p(a, 'nw/bauo-nrw/42a').ampel).toBe('gelb');
    expect(p(a, 'nw/bauo-nrw/42a').gruende.join(' ')).toMatch(/Einzelfall: Planreife/);
  });

  it('Norm gilt nicht → alle Paragrafen grün', () => {
    const a = auswerten(eingabe({ merkmale: { Vorhaben: 'Errichtung', Gebäudeart: 'kein Gebäude' } }));
    expect(a.normen.find((n) => n.norm === 'bauo-nrw')!.paragrafen.every((x) => x.ampel === 'gruen' || x.paragraf === '42a')).toBe(true);
    expect(p(a, 'nw/bauo-nrw/6').gruende[0]).toMatch(/Entfällt mit der Norm: nur für Gebäude/);
  });

  it('fehlendes Merkmal → gelb mit offener Angabe; „Was klärt am meisten“', () => {
    const a = auswerten(eingabe({ merkmale: { Vorhaben: 'Errichtung', Gebäudeart: 'Einfamilienhaus', Planungsrecht: 'Außenbereich' } }));
    const x = p(a, 'nw/bauo-nrw/49');
    expect(x.ampel).toBe('gelb');
    expect(x.offen).toEqual(expect.arrayContaining(['merkmal:Gebäudeklasse', 'gebaeude.oeffentlich']));
    expect(a.klaerung.map((k) => k.id)).toEqual(expect.arrayContaining(['merkmal:Gebäudeklasse']));
  });

  it('Eingriffsregelung im Innenbereich grün (Ausnahme), im Außenbereich rot', () => {
    expect(p(auswerten(eingabe()), 'bund/bnatschg/14').ampel).toBe('rot');
    const innen = auswerten(eingabe({ merkmale: { Vorhaben: 'Errichtung', Gebäudeart: 'Einfamilienhaus', Planungsrecht: 'Innenbereich' } }));
    expect(p(innen, 'bund/bnatschg/14').ampel).toBe('gruen');
  });

  it('nur von Hand grün (Artenschutz)', () => {
    const a = auswerten(eingabe({ merkmale: { Vorhaben: 'Nutzungsänderung', Gebäudeart: 'Einfamilienhaus' } }));
    expect(p(a, 'bund/bnatschg/44').ampel).toBe('gelb');
  });

  it('geänderter Text: Grün wird Gelb, Rot bekommt einen Hinweis', () => {
    const t = new Map([['bund/bnatschg', { fassung: fassung({ '14/1': 'bbbbbbbb' }) }]]);
    const innen = auswerten(eingabe({ texte: t, merkmale: { Vorhaben: 'Errichtung', Gebäudeart: 'Einfamilienhaus', Planungsrecht: 'Innenbereich' } }));
    expect(p(innen, 'bund/bnatschg/14')).toMatchObject({ ampel: 'gelb', geaendert: ['14/1'] });
    const aussen = auswerten(eingabe({ texte: t }));
    expect(p(aussen, 'bund/bnatschg/14').ampel).toBe('rot');
    expect(p(aussen, 'bund/bnatschg/14').hinweise.join(' ')).toMatch(/geändert/);
  });

  it('ohne Text: Grün wird Gelb (nicht an der geltenden Fassung geprüft)', () => {
    const a = auswerten(eingabe({ texte: new Map(), merkmale: { Vorhaben: 'Errichtung', Gebäudeart: 'Einfamilienhaus', Planungsrecht: 'Innenbereich' } }));
    expect(p(a, 'bund/bnatschg/14').ampel).toBe('gelb');
    expect(a.normen.find((n) => n.norm === 'bnatschg')!.ohneText).toBe(true);
  });

  it('unsicherer Fakt schließt nicht aus (gelb), bestätigt schon (grün)', () => {
    const merkmale = { Vorhaben: 'Errichtung', Gebäudeart: 'Einfamilienhaus' };
    expect(p(auswerten(eingabe({ merkmale, fakten: { 'schutz.uesg': hinweis(true) } })), 'nw/bauo-nrw/1').ampel).toBe('gelb');
    expect(p(auswerten(eingabe({ merkmale, fakten: { 'schutz.uesg': { ...hinweis(true), bestaetigt: { von: 'TP', am: '2026-11-12' } } } })), 'nw/bauo-nrw/1').ampel).toBe('gruen');
    // Treffer (rot) bleibt rot, auch wenn er nur Hinweis ist
    expect(p(auswerten(eingabe({ merkmale, fakten: { 'schutz.uesg': hinweis(false) } })), 'nw/bauo-nrw/1').ampel).toBe('rot');
  });

  it('Widerspruch Merkmal/Modell macht Grün gelb', () => {
    const a = auswerten(eingabe({ widersprueche: new Set(['Gebäudeklasse']) }));
    expect(p(a, 'nw/bauo-nrw/49').ampel).toBe('gelb');
  });

  it('Festlegung von Hand geht vor und wird überholt, wenn sich danach etwas ändert', () => {
    const fl = { ampel: 'gruen' as const, grund: 'Begehung ohne Befund', von: 'TP', am: '2026-11-12', automatisch: 'rot' as const, fakten: { 'merkmal:Vorhaben': 'Errichtung' } };
    const a = auswerten(eingabe({ festlegungen: { 'bund/bnatschg/44': fl } }));
    expect(p(a, 'bund/bnatschg/44')).toMatchObject({ ampel: 'gruen', automatisch: 'rot' });
    expect(p(a, 'bund/bnatschg/44').ueberholt).toBeUndefined();
    const b = auswerten(eingabe({ festlegungen: { 'bund/bnatschg/44': fl }, merkmale: { Vorhaben: 'Beseitigung', Gebäudeart: 'Einfamilienhaus' } }));
    expect(p(b, 'bund/bnatschg/44').ueberholt).toMatch(/Art des Vorhabens geändert/);
  });

  it('Annahme des Büros und Werte aus dem Modul', () => {
    const a = auswerten(eingabe());
    expect(p(a, 'nw-05974040/satzung/1')).toMatchObject({ ampel: 'rot', annahme: 'gilt als in Kraft' });
    expect(p(a, 'nw-05974040/satzung/1').hinweise).toContain('Annahme: gilt als in Kraft');
  });
});

describe('Bedingungen', () => {
  const ctx = { merkmale: { Gebäudeklasse: '3' }, fakten: {}, einreichung: '2026-12-01', heute: '2026-11-12', bausteine: {} };
  it('dreiwertig: und/oder/nicht', () => {
    expect(werten({ oder: [{ m: 'Gebäudeklasse', in: ['3'] }, { f: 'x' }] }, ctx).w).toBe('ja');
    expect(werten({ und: [{ m: 'Gebäudeklasse', in: ['3'] }, { f: 'x' }] }, ctx).w).toBe('offen');
    expect(werten({ und: [{ m: 'Gebäudeklasse', in: ['1'] }, { f: 'x' }] }, ctx).w).toBe('nein');
    expect(werten({ nicht: { f: 'x' } }, ctx).w).toBe('offen');
    expect(werten({ m: 'Sonderbau', nicht: ['ja'] }, ctx).w).toBe('offen');
  });
  it('in Worten', () => {
    const t = { fakt: () => ({ titel: 'Nutzfläche', gruppe: 'gebaeude' as const, typ: 'zahl' as const, einheit: 'm²' }), bausteine: {} };
    expect(kurzText({ und: [{ m: 'Vorhaben', in: ['Errichtung'] }, { oder: [{ f: 'n', max: 50 }, { tag: 'einreichung', ab: '2025-01-02' }] }] }, t)).toBe(
      'Art des Vorhabens: Errichtung und (Nutzfläche höchstens 50 m² oder Einreichung ab 02.01.2025)',
    );
  });
});

describe('Signatur', () => {
  it('Ed25519: echt und verfälscht', async () => {
    const k = (await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify'])) as CryptoKeyPair;
    const roh = new Uint8Array(await crypto.subtle.exportKey('raw', k.publicKey));
    const b64 = (u: Uint8Array) => btoa(String.fromCharCode(...u));
    const daten = new TextEncoder().encode('{"paket":"x"}');
    const sig = new Uint8Array(await crypto.subtle.sign({ name: 'Ed25519' }, k.privateKey, daten));
    expect(await signaturPruefen(daten, b64(sig), b64(roh))).toBe(true);
    expect(await signaturPruefen(new TextEncoder().encode('{"paket":"y"}'), b64(sig), b64(roh))).toBe(false);
  });
});
