import { describe, expect, it } from 'vitest';
import { VORGABE_MERKMALE } from '../bedingung';
import type { Fassung } from '../recht/typen';
import type { AuswertungsEingabe } from './auswertung';
import { auswerten, modulFakten } from './auswertung';
import type { TextStand } from './auswertung';
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
    texte: new Map([['bund/bnatschg', { fassung: fassung({ '14/1': 'aaaaaaaa', '14': 'x' }), geprueft: '2026-11-12T08:00:00Z' }]]),
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
    // überholtes Grün zählt nicht als grün
    expect(p(b, 'bund/bnatschg/44').ampel).toBe('gelb');
  });

  it('Verweis auf einen Paragrafen: Entwurf zählt nicht, bestätigte Festlegung nur als unsicher', () => {
    const fl = { ampel: 'gruen' as const, grund: 'Sonderfall mit Begründung', von: 'TP', am: '2026-11-12', automatisch: 'rot' as const, fakten: { 'merkmal:Vorhaben': 'Errichtung' } };
    expect(p(auswerten(eingabe()), 'nw/bauo-nrw/2')).toMatchObject({ ampel: 'rot' });
    expect(p(auswerten(eingabe()), 'nw/bauo-nrw/2').verwendet).toContain('paragraf:nw/bauo-nrw/6');
    // Entwurf (unbestätigt) auf § 6 grün: § 2 folgt der automatischen Ampel von § 6 (rot)
    expect(p(auswerten(eingabe({ festlegungen: { 'nw/bauo-nrw/6': fl } })), 'nw/bauo-nrw/2').ampel).toBe('rot');
    // bestätigt: § 2 entfiele, aber nur auf einer Festlegung – deshalb gelb
    const b = p(auswerten(eingabe({ festlegungen: { 'nw/bauo-nrw/6': { ...fl, bestaetigt: '2026-11-12T10:00:00Z' } } })), 'nw/bauo-nrw/2');
    expect(b.ampel).toBe('gelb');
    expect(b.gruende[0]).toMatch(/Nur Hinweis/);
  });

  it('Rechtsstand: zu lange nicht an der Quelle bestätigt oder nie bestätigt → gelb', () => {
    const innen = { Vorhaben: 'Errichtung', Gebäudeart: 'Einfamilienhaus', Planungsrecht: 'Innenbereich' };
    const text = (geprueft?: string) => new Map([['bund/bnatschg', { fassung: fassung({ '14/1': 'aaaaaaaa', '14': 'x' }), ...(geprueft ? { geprueft } : {}) }]]);
    expect(p(auswerten(eingabe({ merkmale: innen, texte: text('2026-11-01T08:00:00Z') })), 'bund/bnatschg/14').ampel).toBe('gruen');
    const alt = p(auswerten(eingabe({ merkmale: innen, texte: text('2026-10-20T08:00:00Z') })), 'bund/bnatschg/14');
    expect(alt.ampel).toBe('gelb');
    expect(alt.gruende[0]).toMatch(/seit 23 Tagen nicht an der Quelle bestätigt/);
    expect(p(auswerten(eingabe({ merkmale: innen, texte: text() })), 'bund/bnatschg/14').gruende[0]).toMatch(/nie an der Quelle bestätigt/);
  });

  it('angekündigte Fassung vor der voraussichtlichen Entscheidung → gelb, danach nicht', () => {
    const innen = { Vorhaben: 'Errichtung', Gebäudeart: 'Einfamilienhaus', Planungsrecht: 'Innenbereich' };
    const text = (gueltigAb: string) => new Map([['bund/bnatschg', { fassung: fassung({ '14/1': 'aaaaaaaa', '14': 'x' }), geprueft: '2026-11-12T08:00:00Z', kuenftige: [{ gueltigAb, url: '' }] }]]);
    const bald = p(auswerten(eingabe({ merkmale: innen, texte: text('2027-01-01') })), 'bund/bnatschg/14');
    expect(bald.ampel).toBe('gelb');
    expect(bald.gruende[0]).toMatch(/Neue Fassung ab 01\.01\.2027 angekündigt/);
    expect(p(auswerten(eingabe({ merkmale: innen, texte: text('2027-09-01') })), 'bund/bnatschg/14').ampel).toBe('gruen');
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

describe('kein falsches Grün – Fälle aus dem Code-Review', () => {
  const innen = { Vorhaben: 'Errichtung', Gebäudeart: 'Einfamilienhaus', Planungsrecht: 'Innenbereich' };
  const text = (o: Partial<TextStand> = {}) => new Map([['bund/bnatschg', { fassung: fassung({ '14/1': 'aaaaaaaa', '14': 'x' }), geprueft: '2026-11-12T08:00:00Z', stichtag: '2026-12-01', ...o }]]);

  it('zum Stichtag gilt schon eine neuere Fassung, deren Text fehlt → gelb; Text für anderen Stichtag → gelb', () => {
    expect(p(auswerten(eingabe({ merkmale: innen, texte: text() })), 'bund/bnatschg/14').ampel).toBe('gruen');
    const a = p(auswerten(eingabe({ merkmale: innen, texte: text({ ueberholtAb: '2026-11-20' }) })), 'bund/bnatschg/14');
    expect(a.ampel).toBe('gelb');
    expect(a.gruende[0]).toMatch(/gilt schon die Fassung ab 20\.11\.2026/);
    expect(p(auswerten(eingabe({ merkmale: innen, texte: text({ stichtag: '2026-11-12' }) })), 'bund/bnatschg/14').gruende[0]).toMatch(/anderen Stichtag/);
  });

  it('feste Werte der Gebietsmodule sind nur so sicher wie der Gemeindeschlüssel (PLZ-Vorschlag)', () => {
    const vorschlag = modulFakten([bund, land, gemeinde], { 'lage.ags': hinweis('05974040') });
    expect(vorschlag['ortsrecht.satzung']).toMatchObject({ wert: true, sicherheit: 'hinweis' });
    expect(vorschlag['soest.zone'].sicherheit).toBe('hinweis');
    const gesichert = modulFakten([bund, land, gemeinde], { 'lage.ags': sicher('05974040') });
    expect(gesichert['ortsrecht.satzung'].sicherheit).toBe('sicher');
    const bestaetigt = modulFakten([gemeinde], { 'lage.ags': { ...hinweis('05974040'), bestaetigt: { von: 'TP', am: '2026-11-12', grund: 'Flurstücksnachweis' } } });
    expect(bestaetigt['ortsrecht.satzung'].sicherheit).toBe('sicher');
  });

  it('festgelegtes „entfällt“ ohne Text bzw. mit veraltetem Rechtsstand ist überholt', () => {
    const fl = { ampel: 'gruen' as const, grund: 'Sonderfall mit Begründung', von: 'TP', am: '2026-11-12', automatisch: 'rot' as const, fakten: { 'merkmal:Vorhaben': 'Errichtung' }, bestaetigt: '2026-11-12T10:00:00Z' };
    const id = 'bund/bnatschg/14';
    expect(p(auswerten(eingabe({ festlegungen: { [id]: fl }, texte: text() })), id).ampel).toBe('gruen');
    const ohne = p(auswerten(eingabe({ festlegungen: { [id]: fl }, texte: new Map() })), id);
    expect(ohne.ampel).toBe('gelb');
    expect(ohne.ueberholt).toMatch(/Text der Norm nicht verfügbar/);
    const alt = p(auswerten(eingabe({ festlegungen: { [id]: fl }, texte: text({ geprueft: '2026-10-01T08:00:00Z' }) })), id);
    expect(alt.ampel).toBe('gelb');
    expect(alt.ueberholt).toMatch(/Rechtsstand/);
  });

  describe('„entfällt mit der Norm“', () => {
    const modul: Modul = { format: 1, id: 'bund', name: 'Bund', ebene: 'bund', version: '1', normen: { geg: { kurz: 'GEG', titel: 'Gebäudeenergiegesetz', thema: 'energie', quelle: { art: 'gii', pfad: 'geg' } } } };
    const geg: Regeldatei = {
      format: 1,
      modul: 'bund',
      norm: 'geg',
      fassung: '2024-01-01',
      version: 1,
      geltung: { m: 'Gebäudeart', nicht: ['kein Gebäude'] },
      paragrafen: { '10': { gilt: { m: 'Vorhaben', in: ['Errichtung'] }, grund: 'Anforderungen.', stand: { '10/1': 'aaaaaaaa' } }, '48': { gilt: { m: 'Vorhaben', in: ['Änderung'] }, grund: 'Änderung.', stand: { '48/1': 'bbbbbbbb' } } },
    };
    const kleinesPaket = paketAusDateien({ 'module/bund/modul.json': modul, 'module/bund/geg@2024-01-01.json': geg }, 'test');
    const gegText = (summen: Record<string, string>): TextStand => ({
      fassung: { ...fassung(summen), id: 'geg', paragrafen: { '10': { titel: 'Grundsatz', url: '', text: [] }, '48': { titel: 'Änderung', url: '', text: [] } }, gueltigAb: '2024-01-01' },
      geprueft: '2026-11-12T08:00:00Z',
    });
    const werte = (texte: Map<string, TextStand>) =>
      auswerten({ paket: kleinesPaket, module: kleinesPaket.module, merkmale: { Vorhaben: 'Errichtung', Gebäudeart: 'kein Gebäude' }, fakten: {}, einreichung: '2026-12-01', heute: '2026-11-12', texte, festlegungen: {} }).paragrafen.find((x) => x.id === 'bund/geg/10')!;

    it('braucht den Text – ohne Text gelb', () => {
      const a = werte(new Map());
      expect(a.ampel).toBe('gelb');
      expect(a.gruende[0]).toMatch(/Anwendungsbereich ist nicht an der geltenden Fassung geprüft/);
      expect(werte(new Map([['bund/geg', gegText({ '10/1': 'aaaaaaaa', '48/1': 'bbbbbbbb' })]])).ampel).toBe('gruen');
    });

    it('ändert sich irgendeine Fundstelle der Norm, ist der Anwendungsbereich offen', () => {
      const a = werte(new Map([['bund/geg', gegText({ '10/1': 'aaaaaaaa', '48/1': 'cccccccc' })]]));
      expect(a.ampel).toBe('gelb');
      expect(a.gruende[0]).toMatch(/Anwendungsbereich gleich geblieben/);
    });
  });

  it('Paketprüfung: leeres „oder“, unbekannte Bedingungen und Baustein-Zyklen; fehlerhafte Geltung stürzt nicht ab', () => {
    const kaputt: Modul = { ...bund, bausteine: { a: { $: 'b' }, b: { und: [{ $: 'a' }] }, leer: { oder: [] } } };
    const regel: Regeldatei = { ...bnatschg, geltung: { x: 1 } as unknown as Regeldatei['geltung'], paragrafen: { '14': { ...bnatschg.paragrafen['14'], entfaellt: { oder: [] } } } };
    const pk = paketAusDateien({ 'module/bund/modul.json': kaputt, 'module/bund/bnatschg@2026-09-30.json': regel }, 'test');
    const f = paketPruefen(pk, VORGABE_MERKMALE).join('\n');
    expect(f).toMatch(/„oder“ ohne Teile/);
    expect(f).toMatch(/unbekannte Bedingung/);
    expect(f).toMatch(/Baustein-Zyklus: a → b → a|Baustein-Zyklus: b → a → b/);
    // leeres „oder“ als Ausnahme macht nichts grün; die kaputte Geltung macht alles gelb statt abzustürzen
    const a = auswerten({ paket: pk, module: pk.module, merkmale: innen, fakten: {}, einreichung: '2026-12-01', heute: '2026-11-12', texte: new Map(), festlegungen: {} });
    expect(a.paragrafen.every((x) => x.ampel !== 'gruen')).toBe(true);
  });
});
