import { describe, expect, it } from 'vitest';
import { VORGABE_MERKMALE } from '../bedingung';
import type { Fassung } from '../recht/typen';
import type { AuswertungsEingabe } from './auswertung';
import { auswerten, bundGelieferte, gueltigeFakten, gueltigeMerkmale, modulFakten, modulZiel } from './auswertung';
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

  it('Prüfung des Pakets meldet Bausteine gleichen Namens in mehreren Modulen', () => {
    const doppelt = paketAusDateien(
      {
        'module/bund/modul.json': bund,
        'module/nw/modul.json': { ...land, bausteine: { neubau: { nie: true } } },
        'module/bund/bnatschg@2026-09-30.json': bnatschg,
      },
      'x',
    );
    expect(paketPruefen(doppelt, VORGABE_MERKMALE).some((x) => /Baustein „neubau“ ist mehrfach definiert \(bund, nw\)/.test(x))).toBe(true);
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
    expect(p(a, 'nw/bauo-nrw/6').gruende[0]).toBe('Entfällt mit der Norm – nur für Gebäude (Gebäudeart: „kein Gebäude“).');
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
    // überholtes Grün zählt nicht als grün – es gilt die automatische Ampel (hier „gilt“), mindestens „prüfen“
    expect(p(b, 'bund/bnatschg/44').ampel).toBe(p(b, 'bund/bnatschg/44').automatisch === 'rot' ? 'rot' : 'gelb');
    expect(p(b, 'bund/bnatschg/44').ampel).not.toBe('gruen');
  });

  it('Festlegung wird überholt, wenn ein beteiligtes Merkmal widersprüchlich wird (gleicher Wert)', () => {
    const fl = { ampel: 'gruen' as const, grund: 'Begehung ohne Befund', von: 'TP', am: '2026-11-12', automatisch: 'rot' as const, fakten: { 'merkmal:Vorhaben': 'Errichtung' }, sicherheit: { 'merkmal:Vorhaben': 'sicher' as const } };
    expect(p(auswerten(eingabe({ festlegungen: { 'bund/bnatschg/44': fl } })), 'bund/bnatschg/44').ueberholt).toBeUndefined();
    const b = auswerten(eingabe({ festlegungen: { 'bund/bnatschg/44': fl }, widersprueche: new Set(['Vorhaben']) }));
    expect(p(b, 'bund/bnatschg/44').ueberholt).toMatch(/jetzt widersprüchlich/);
    expect(p(b, 'bund/bnatschg/44').ampel).toBe('rot');
    // war das Merkmal schon beim Festlegen widersprüchlich, macht derselbe Widerspruch nichts überholt
    const c = auswerten(eingabe({ festlegungen: { 'bund/bnatschg/44': { ...fl, sicherheit: { 'merkmal:Vorhaben': 'widerspruch' as const } } }, widersprueche: new Set(['Vorhaben']) }));
    expect(p(c, 'bund/bnatschg/44').ueberholt).toBeUndefined();
  });

  it('überholtes „prüfen“ hält ein automatisches „gilt“ nicht auf', () => {
    // „prüfen“ festgelegt, als die Automatik noch „prüfen“ sagte – jetzt sagt sie „gilt“
    const fl = { ampel: 'gelb' as const, grund: 'Abstimmung offen', von: 'TP', am: '2026-11-12', automatisch: 'gelb' as const, fakten: { 'merkmal:Vorhaben': 'Errichtung' } };
    const q = p(auswerten(eingabe({ festlegungen: { 'bund/bnatschg/44': fl } })), 'bund/bnatschg/44');
    expect(q.automatisch).toBe('rot');
    expect(q.ueberholt).toMatch(/automatisch jetzt rot/);
    expect(q.ampel).toBe('rot');
    expect(q.gruende[0]).toMatch(/es gilt die automatische Ampel/);
    // eine nicht überholte, strengere Festlegung bleibt
    const streng = { ...fl, ampel: 'rot' as const, automatisch: 'rot' as const };
    expect(p(auswerten(eingabe({ festlegungen: { 'bund/bnatschg/44': streng } })), 'bund/bnatschg/44').ampel).toBe('rot');
  });

  it('Automatik kommt bei der Festlegung an (z. B. nach „Rechtsstand prüfen“) bzw. wird schwächer: nicht überholt', () => {
    // „entfällt“ festgelegt, als die Automatik „prüfen“ sagte – jetzt sagt sie auch „entfällt“
    const fl = { ampel: 'gruen' as const, grund: 'Begehung ohne Befund', von: 'TP', am: '2026-11-12', automatisch: 'gelb' as const, fakten: {} };
    const a = auswerten(eingabe({ festlegungen: { 'bund/bnatschg/44': fl }, merkmale: { Vorhaben: 'Beseitigung', Gebäudeart: 'Einfamilienhaus' } }));
    const q = p(a, 'bund/bnatschg/44');
    if (q.automatisch !== 'rot') expect(q.ueberholt ?? '').not.toMatch(/automatisch jetzt/);
    // „gilt“ festgelegt, die Automatik wird schwächer: die strengere Festlegung bleibt richtig
    const streng = { ...fl, ampel: 'rot' as const, automatisch: 'rot' as const };
    const b = p(auswerten(eingabe({ festlegungen: { 'bund/bnatschg/44': streng }, merkmale: { Vorhaben: 'Beseitigung', Gebäudeart: 'Einfamilienhaus' } })), 'bund/bnatschg/44');
    expect(b.ueberholt ?? '').not.toMatch(/automatisch jetzt/);
    expect(b.ampel).toBe('rot');
  });

  it('Verweis auf einen Paragrafen mit Entwurf bzw. überholter Festlegung: sieht die strengere Ampel, als Hinweis', () => {
    // ein Paragraf, dessen Automatik schwächer als „gilt“ ist; darauf ein Entwurf „gilt“
    const ziel = auswerten(eingabe()).paragrafen.find((x) => x.automatisch !== 'rot')!;
    const fl = { ampel: 'rot' as const, grund: 'gilt nach Abstimmung', von: 'TP', am: '2026-11-12', automatisch: ziel.automatisch, fakten: {} };
    const a = auswerten(eingabe({ festlegungen: { [ziel.id]: fl } }));
    expect(p(a, ziel.id).ampel).toBe('rot');
    const ref = a.kontext.ampel?.(ziel.id);
    expect(ref?.ampel).toBe('rot');
    expect(ref?.unsicher).toBe(true);
  });

  it('„Klärt am meisten“ zählt keine Paragrafen mit wirksamer Festlegung', () => {
    const vorher = auswerten(eingabe({ merkmale: {} }));
    const k = vorher.klaerung[0];
    expect(k).toBeTruthy();
    const ps = vorher.paragrafen.filter((x) => x.offen.includes(k.id));
    const festlegungen = Object.fromEntries(ps.map((x) => [x.id, { ampel: 'gelb' as const, grund: 'von Hand geklärt', von: 'TP', am: '2026-11-12', automatisch: x.automatisch, fakten: {} }]));
    // ein Entwurf klärt noch nichts (wie bei Verweisen) …
    const entwurf = auswerten(eingabe({ merkmale: {}, festlegungen }));
    expect(entwurf.klaerung.find((x) => x.id === k.id)?.anzahl).toBe(k.anzahl);
    // … erst die bestätigte Festlegung
    const bestaetigt = Object.fromEntries(Object.entries(festlegungen).map(([id, f]) => [id, { ...f, bestaetigt: '2026-11-12T10:00:00Z' }]));
    const nachher = auswerten(eingabe({ merkmale: {}, festlegungen: bestaetigt }));
    expect(nachher.klaerung.find((x) => x.id === k.id)?.anzahl ?? 0).toBe(0);
  });

  it('Einzelfall (pruefen.wenn) wirkt nur, wenn die Norm gilt – außerhalb des Anwendungsbereichs bleibt es grün', () => {
    const a = auswerten(eingabe());
    for (const q of a.paragrafen.filter((x) => x.gruende[0]?.startsWith('Entfällt mit der Norm'))) expect(q.gruende.join(' ')).not.toMatch(/^Einzelfall:/);
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
      'Art des Vorhabens: „Errichtung“ und (Nutzfläche: höchstens 50 m² oder Einreichung ab 02.01.2025)',
    );
    // gleiche Merkmale im „oder“ zusammengefasst, keine doppelte Verneinung
    expect(kurzText({ oder: [{ m: 'Vorhaben', in: ['Errichtung'] }, { m: 'Vorhaben', in: ['Beseitigung'] }] }, t)).toBe('Art des Vorhabens: „Errichtung“ oder „Beseitigung“');
    expect(kurzText({ m: 'Gebäudeart', nicht: ['kein Gebäude'] }, t)).toBe('Gebäudeart: ein Gebäude');
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

  it('Werte nach Tabelle aus einem widersprüchlichen Gemeindeschlüssel sind unsicher und tragen den Widerspruch', () => {
    const w = modulFakten([bund, land, gemeinde], { 'lage.ags': { ...sicher('05974040'), widerspruch: 'ALKIS meldet „05974024“' } });
    expect(w['soest.zone']).toMatchObject({ wert: '1', sicherheit: 'hinweis', widerspruch: 'ALKIS meldet „05974024“' });
    // bestätigter Hinweis: sicher – aber die Bestätigung gehört zum Gemeindeschlüssel, nicht zum abgeleiteten Wert
    const b = modulFakten([gemeinde], { 'lage.ags': { ...hinweis('05974040'), bestaetigt: { von: 'TP', am: '2026-11-12', grund: 'Flurstücksnachweis' } } });
    expect(b['soest.zone'].sicherheit).toBe('sicher');
    expect(b['soest.zone'].bestaetigt).toBeUndefined();
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

  it('festgelegtes „entfällt“ ohne Text ist überholt, ohne verfügbaren Text bzw. mit veraltetem Rechtsstand nicht wirksam', () => {
    const fl = { ampel: 'gruen' as const, grund: 'Sonderfall mit Begründung', von: 'TP', am: '2026-11-12', automatisch: 'rot' as const, fakten: { 'merkmal:Vorhaben': 'Errichtung' }, stand: { '14/1': 'aaaaaaaa' }, bestaetigt: '2026-11-12T10:00:00Z' };
    const id = 'bund/bnatschg/14';
    // ohne Textstand getroffen (z. B. in der Web-Version): auch mit Text später überholt
    const ohneStand = p(auswerten(eingabe({ festlegungen: { [id]: { ...fl, stand: {} } }, texte: text() })), id);
    // fällt auf die automatische Ampel zurück („gilt“), nie auf „entfällt“
    expect(ohneStand.ampel).toBe('rot');
    expect(ohneStand.ueberholt).toMatch(/ohne geprüften Text/);
    expect(p(auswerten(eingabe({ festlegungen: { [id]: fl }, texte: text() })), id).ampel).toBe('gruen');
    const ohne = p(auswerten(eingabe({ festlegungen: { [id]: fl }, texte: new Map() })), id);
    expect(ohne.ampel).toBe('rot');
    // fehlender Systemstand: „noch nicht wirksam“ (erneut festlegen hilft nicht), nicht „überholt“
    expect(ohne.ueberholt).toBeUndefined();
    expect(ohne.unwirksam).toMatch(/Text der Norm nicht verfügbar/);
    expect(ohne.gruende[0]).toMatch(/noch nicht wirksam/);
    const alt = p(auswerten(eingabe({ festlegungen: { [id]: fl }, texte: text({ geprueft: '2026-10-01T08:00:00Z' }) })), id);
    expect(alt.ampel).toBe('rot');
    expect(alt.ueberholt).toBeUndefined();
    expect(alt.unwirksam).toMatch(/Rechtsstand/);
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
    // „bekannt“ über einen Baustein im Tatbestand, unbekannte Ampel im Verweis, falsches Datum, Aufbau
    const b2: Modul = { ...bund, bausteine: { egal: { f: 'schutz.uesg', bekannt: false } } };
    const r2: Regeldatei = { ...bnatschg, paragrafen: { '14': { ...bnatschg.paragrafen['14'], gilt: { $: 'egal' }, entfaellt: { n: 'bund/bnatschg/44', ampel: ['grün' as 'gruen'] } }, '44': { ...bnatschg.paragrafen['44'], gilt: { tag: 'einreichung', ab: '1.1.2025' } } } };
    const f2 = paketPruefen(paketAusDateien({ 'module/bund/modul.json': b2, 'module/bund/bnatschg@2026-09-30.json': r2 }, 'test'), VORGABE_MERKMALE).join('\n');
    expect(f2).toMatch(/bekannt.*auch nicht über Bausteine/);
    expect(f2).toMatch(/unbekannter Ampel „grün“/);
    expect(f2).toMatch(/kein Datum/);
    expect(paketPruefen(paketAusDateien({ 'module/bund/modul.json': { id: 'bund' }, 'module/bund/bnatschg@2026-09-30.json': { modul: 'bund', norm: 'bnatschg', fassung: '2026-09-30' } }, 'test'), VORGABE_MERKMALE).join(' ')).toMatch(/Aufbau ungültig/);
    // leeres „oder“ als Ausnahme macht nichts grün; die kaputte Geltung macht alles gelb statt abzustürzen
    const a = auswerten({ paket: pk, module: pk.module, merkmale: innen, fakten: {}, einreichung: '2026-12-01', heute: '2026-11-12', texte: new Map(), festlegungen: {} });
    expect(a.paragrafen.every((x) => x.ampel !== 'gruen')).toBe(true);
  });
});

describe('Runde 9: kein falsches Grün über Ort und Schwellen', () => {
  const ort = { adresse: 'musterweg 1|59494|soest|||', lage: '420000,5710000' };
  const fl = { ampel: 'gruen' as const, grund: 'Begehung ohne Befund', von: 'TP', am: '2026-11-12', automatisch: 'rot' as const, fakten: { 'merkmal:Vorhaben': 'Errichtung' }, ort };
  it('eine Festlegung gilt nur am Ort, an dem sie getroffen wurde', () => {
    expect(p(auswerten(eingabe({ festlegungen: { 'bund/bnatschg/44': fl }, ort })), 'bund/bnatschg/44')).toMatchObject({ ampel: 'gruen' });
    // andere Anschrift: überholt, nicht mehr grün
    const b = p(auswerten(eingabe({ festlegungen: { 'bund/bnatschg/44': fl }, ort: { ...ort, adresse: 'andere str. 2|59494|soest|||' } })), 'bund/bnatschg/44');
    expect(b.ueberholt).toMatch(/Anschrift bzw. Grundstück geändert/);
    expect(b.ampel).not.toBe('gruen');
    // gleiche Anschrift, andere Koordinaten bzw. keine mehr: ebenso
    expect(p(auswerten(eingabe({ festlegungen: { 'bund/bnatschg/44': fl }, ort: { ...ort, lage: '420500,5710000' } })), 'bund/bnatschg/44').ueberholt).toMatch(/Koordinaten geändert/);
    expect(p(auswerten(eingabe({ festlegungen: { 'bund/bnatschg/44': fl }, ort: { ...ort, lage: null } })), 'bund/bnatschg/44').ueberholt).toMatch(/Koordinaten fehlen/);
    // ohne Koordinaten festgelegt, später Koordinaten zur selben Anschrift: bleibt gültig
    expect(p(auswerten(eingabe({ festlegungen: { 'bund/bnatschg/44': { ...fl, ort: { ...ort, lage: null } } }, ort })), 'bund/bnatschg/44').ueberholt).toBeUndefined();
    // aus einer Datei ohne Ort: überholt (zur sicheren Seite)
    const { ort: _o, ...ohneOrt } = fl;
    expect(p(auswerten(eingabe({ festlegungen: { 'bund/bnatschg/44': ohneOrt }, ort })), 'bund/bnatschg/44').ueberholt).toMatch(/ohne Ortsangabe/);
  });

  it('„x,01“ heißt „über x“ und wird auch so gewertet – 22,005 m ist über 22 m', () => {
    const ctx = { merkmale: {}, fakten: { h: sicher(22.005) }, einreichung: '2026-12-01', heute: '2026-11-12', bausteine: {} };
    expect(werten({ f: 'h', min: 22.01 }, ctx).w).toBe('ja');
    expect(werten({ f: 'h', min: 22.01 }, { ...ctx, fakten: { h: sicher(22) } }).w).toBe('nein');
    expect(werten({ nicht: { f: 'h', min: 22.01 } }, ctx).w).toBe('nein');
    // „vorhanden“ (0,01) heißt „über 0“
    expect(werten({ f: 'h', min: 0.01 }, { ...ctx, fakten: { h: sicher(0.004) } }).w).toBe('ja');
    // gewöhnliche Untergrenzen bleiben einschließend
    expect(werten({ f: 'h', min: 7 }, { ...ctx, fakten: { h: sicher(7) } }).w).toBe('ja');
  });

  it('ein gesichertes „gilt nicht“ geht einem „entfällt“ vor, das nur auf Hinweisen beruht', () => {
    const a = p(auswerten(eingabe({ merkmale: { Vorhaben: 'Änderung', Gebäudeart: 'Einfamilienhaus', Planungsrecht: 'Außenbereich', Gebäudeklasse: '1', Verfahren: 'vereinfachtes Verfahren' }, fakten: { 'lage.ags': sicher('05974040'), 'gebaeude.nutzflaeche': hinweis(40) } })), 'nw/bauo-nrw/42a');
    expect(a.ampel).toBe('gruen');
    expect(a.gruende[0]).toMatch(/^Gilt nicht/);
    // ohne gesichertes „gilt nicht“ bleibt das unsichere „entfällt“ gelb
    const b = p(auswerten(eingabe({ fakten: { 'lage.ags': sicher('05974040'), 'gebaeude.nutzflaeche': hinweis(40) } })), 'nw/bauo-nrw/42a');
    expect(b.ampel).toBe('gelb');
  });
});

describe('Klärt am meisten: nur Angaben, deren Antwort etwas ändert', () => {
  it('eine Angabe, bei der jede Antwort zum selben Ergebnis führt, zählt nicht', () => {
    const m: Modul = { format: 1, id: 'bund', name: 'Bund', ebene: 'bund', version: '2026-11-12', normen: { t: { kurz: 'T', titel: 'Test', thema: 'natur', quelle: { art: 'gii', pfad: 't' } } }, fakten: { 'x.a': { titel: 'A', gruppe: 'vorhaben', typ: 'janein' }, 'x.b': { titel: 'B', gruppe: 'vorhaben', typ: 'janein' } } };
    const r: Regeldatei = {
      format: 1,
      modul: 'bund',
      norm: 't',
      fassung: '2026-01-01',
      version: 1,
      paragrafen: {
        // beide Zweige von A führen zu „gilt“ – A klärt hier nichts
        '1': { gilt: { oder: [{ f: 'x.a', ist: true }, { f: 'x.a', ist: false }] }, grund: 'immer.' },
        // B entscheidet wirklich
        '2': { gilt: { f: 'x.b', ist: true }, grund: 'nur mit B.' },
      },
    };
    const pk = paketAusDateien({ 'module/bund/modul.json': m, 'module/bund/t@2026-01-01.json': r }, 'test');
    const a = auswerten({ paket: pk, module: pk.module, merkmale: {}, fakten: {}, einreichung: '2026-12-01', heute: '2026-11-12', texte: new Map(), festlegungen: {} });
    expect(a.paragrafen.find((x) => x.id === 'bund/t/1')!.ampel).toBe('gelb');
    expect(a.klaerung.map((k) => k.id)).toEqual(['x.b']);
  });
});

describe('Runde 12: nur zulässige Werte zählen (kein falsches Grün)', () => {
  it('Merkmalwert außerhalb der Werteliste ist offen, nicht „trifft nicht zu“', () => {
    // § 44 BNatSchG gilt bei Errichtung, Änderung, Beseitigung – „Umbau“ ist kein Wert der Liste
    const a = auswerten(eingabe({ merkmale: { Vorhaben: 'Umbau', Gebäudeart: 'Einfamilienhaus', Planungsrecht: 'Außenbereich', Gebäudeklasse: '1', Verfahren: 'vereinfachtes Verfahren' } }));
    expect(p(a, 'bund/bnatschg/44').ampel).not.toBe('gruen');
    expect(p(a, 'nw/bauo-nrw/6').ampel).toBe('gelb');
  });
  it('Angabe mit falschem Typ bzw. Wert außerhalb der Auswahl ist offen, mit Grund', () => {
    const f = gueltigeFakten(
      { a: { wert: 'ja', herkunft: 'manuell', sicherheit: 'sicher' }, b: { wert: 'ganz', herkunft: 'manuell', sicherheit: 'sicher' }, c: { wert: 'Teilabbruch', herkunft: 'manuell', sicherheit: 'sicher' } },
      { a: { titel: 'A', gruppe: 'vorhaben', typ: 'janein' }, b: { titel: 'B', gruppe: 'vorhaben', typ: 'wahl', werte: ['Teilabbruch'] }, c: { titel: 'C', gruppe: 'vorhaben', typ: 'wahl', werte: ['Teilabbruch'] } },
    );
    expect(f.a).toMatchObject({ wert: null, sicherheit: 'hinweis', grund: expect.stringMatching(/passt nicht zur Angabe/) });
    expect(f.b.wert).toBeNull();
    expect(f.c.wert).toBe('Teilabbruch');
    expect(gueltigeMerkmale({ Vorhaben: 'Umbau', Eigenes: 'x', Gebäudeart: 'Einfamilienhaus' })).toEqual({ Eigenes: 'x', Gebäudeart: 'Einfamilienhaus' });
  });
  it('„bestätigen klärt“ zählt nur Paragrafen, die allein wegen genau dieses Hinweises gelb sind', () => {
    // § 42a: entfällt bei Nutzfläche höchstens 50 m² – mit einem Hinweis auf 40 m² gelb, und nur deswegen
    const a = auswerten(eingabe({ fakten: { 'lage.ags': sicher('05974040'), 'gebaeude.nutzflaeche': hinweis(40) } }));
    const q = p(a, 'nw/bauo-nrw/42a');
    expect(q.ampel).toBe('gelb');
    expect(q.bestaetigend).toBe('gebaeude.nutzflaeche');
    expect(a.bestaetigen.find((b) => b.id === 'gebaeude.nutzflaeche')?.anzahl).toBeGreaterThan(0);
    for (const b of a.bestaetigen) expect(a.paragrafen.filter((x) => x.bestaetigend === b.id).length).toBe(b.anzahl);
    // bestätigt: grün
    const b = auswerten(eingabe({ fakten: { 'lage.ags': sicher('05974040'), 'gebaeude.nutzflaeche': { ...hinweis(40), bestaetigt: { von: 'TP', am: '2026-11-12', grund: 'Aufmaß' } } } }));
    expect(p(b, 'nw/bauo-nrw/42a').ampel).toBe('gruen');
  });
  it('ein ungültiger Bezug leitet nichts ab; ein gespeicherter Modulwert ohne aktuelle Grundlage gilt nicht weiter', () => {
    // Gemeindeschlüssel als Zahl (falscher Typ): die Zone der Satzung wird nicht abgeleitet, § 1 der Satzung nicht grün
    const a = auswerten(eingabe({ fakten: { 'lage.ags': { wert: 5974040, herkunft: 'manuell', sicherheit: 'sicher' } } }));
    expect(a.fakten['soest.zone']?.wert ?? null).toBeNull();
    expect(p(a, 'nw-05974040/satzung/1').ampel).not.toBe('gruen');
    // „Zone 1“ war für 05974040 bestätigt – der Schlüssel ist jetzt ein anderer, die Tabelle liefert nichts: weg
    const alt = { wert: '1', herkunft: 'modul' as const, sicherheit: 'sicher' as const, bestaetigt: { von: 'TP', am: '2026-11-12', grund: 'Auskunft' } };
    const m = modulFakten(aktiveModule(paket.module, '05974040'), { 'lage.ags': sicher('05974099'), 'soest.zone': alt });
    expect(m['soest.zone']).toBeUndefined();
    // derselbe Schlüssel: die Bestätigung gilt weiter
    expect(modulFakten(aktiveModule(paket.module, '05974040'), { 'lage.ags': sicher('05974040'), 'soest.zone': alt })['soest.zone']?.bestaetigt).toBeDefined();
  });
});

describe('Runde 15: Ziel von „bestätigen klärt“ bei Modulwerten', () => {
  const defs = {
    'schutz.denkmalbereich': { titel: 'Denkmalbereich', gruppe: 'schutz', typ: 'janein', nach: { fakt: 'soest.denkmalbereich', tabelle: { true: true, false: false } } },
    'soest.denkmalbereich': { titel: 'Denkmalbereich Altstadt (Dienst)', gruppe: 'schutz', typ: 'janein' },
    'soest.fest': { titel: 'Fester Wert', gruppe: 'lage', typ: 'janein', wert: true },
    'lp.nach_lage': { titel: 'LP nach Lage', gruppe: 'lage', typ: 'wahl', nach: { fakt: 'lage.ags', tabelle: { '05974040': 'kein' }, hinweis: true } },
  } as unknown as Record<string, import('./typen').FaktDef>;
  const agsSicher = { 'lage.ags': sicher('05974040') };
  const agsHinweis = { 'lage.ags': { ...hinweis('05974040'), herkunft: 'abgeleitet' as const } };
  it('genau eine unsichere Quelle: dort bestätigen', () => {
    // Gemeindeschlüssel unsicher, Bezug sicher → Gemeindeschlüssel
    expect(modulZiel('schutz.denkmalbereich', { ...agsHinweis, 'soest.denkmalbereich': sicher(false) }, defs)).toBe('lage.ags');
    // Gemeindeschlüssel sicher, Bezug nur Hinweis → der Bezug
    expect(modulZiel('schutz.denkmalbereich', { ...agsSicher, 'soest.denkmalbereich': hinweis(false) }, defs)).toBe('soest.denkmalbereich');
    // fester Wert eines Gebietsmoduls: der Gemeindeschlüssel
    expect(modulZiel('soest.fest', agsHinweis, defs)).toBe('lage.ags');
    // Tabelle nach Lage: der Wert selbst
    expect(modulZiel('lp.nach_lage', agsSicher, defs)).toBe('lp.nach_lage');
  });
  it('Kette: ist der Bezug selbst ein Modulwert, zählen dessen Quellen; Bundeswerte hängen nicht am Gemeindeschlüssel', () => {
    const kette = {
      ...defs,
      'kreis.lp_name': { titel: 'Name des Landschaftsplans', gruppe: 'lage', typ: 'wahl', nach: { fakt: 'lage.ags', tabelle: { '05974040': 'kein' } } },
      'schutz.lp': { titel: 'Landschaftsplan', gruppe: 'schutz', typ: 'janein', nach: { fakt: 'kreis.lp_name', tabelle: { kein: false } } },
    } as unknown as Record<string, import('./typen').FaktDef>;
    const name = { wert: 'kein', herkunft: 'modul' as const, sicherheit: 'hinweis' as const, grund: 'Gemeindeschlüssel nur vorgeschlagen' };
    // nur der Gemeindeschlüssel ist unsicher – er klärt auch den abgeleiteten Wert
    expect(modulZiel('schutz.lp', { ...agsHinweis, 'kreis.lp_name': name }, kette)).toBe('lage.ags');
    // Bundeswert nach einem unsicheren Bezug: nur der Bezug
    expect(modulZiel('schutz.denkmalbereich', { ...agsHinweis, 'soest.denkmalbereich': hinweis(false) }, defs, new Set(['schutz.denkmalbereich']))).toBe('soest.denkmalbereich');
  });
  it('mehrere unsichere Quellen: keine allein entscheidet – der Tabellenwert selbst', () => {
    expect(modulZiel('schutz.denkmalbereich', { ...agsHinweis, 'soest.denkmalbereich': hinweis(false) }, defs)).toBe('schutz.denkmalbereich');
    expect(modulZiel('lp.nach_lage', agsHinweis, defs)).toBe('lp.nach_lage');
  });
});

describe('Runde 15: Texte', () => {
  it('„hängt an … – dort offen“ ohne zweite Klammer', () => {
    // § 6 offen (Merkmale fehlen): § 2 hängt an ihm
    const a = auswerten(eingabe({ merkmale: {} }));
    const g = a.paragrafen.flatMap((x) => x.gruende).filter((t) => /hängt an/.test(t));
    expect(g.length).toBeGreaterThan(0);
    for (const t of g) {
      expect(t).toMatch(/ – dort offen/);
      expect(t).not.toMatch(/\(dort offen\)/);
    }
  });
});

describe('Runde 13 (Fachprüfung): nicht gestellte Fragen fehlen nicht', () => {
  // x.b wird nur gefragt, wenn x.a = ja; die Regel enthält einen Konsensterm mit x.b und der offenen Angabe x.c
  const modul: Modul = {
    format: 1,
    id: 'bund',
    name: 'Bund',
    ebene: 'bund',
    version: '2026-11-13',
    normen: { t: { kurz: 'T', titel: 'Test', thema: 'natur', quelle: { art: 'gii', pfad: 't' } } },
    fakten: {
      'x.a': { titel: 'A', gruppe: 'vorhaben', typ: 'janein' },
      'x.b': { titel: 'B', gruppe: 'vorhaben', typ: 'janein', wenn: { f: 'x.a', ist: true } },
      'x.c': { titel: 'C', gruppe: 'vorhaben', typ: 'janein' },
    },
  };
  const regel: Regeldatei = {
    format: 1,
    modul: 'bund',
    norm: 't',
    fassung: '2026-11-13',
    version: 1,
    paragrafen: {
      '1': { gilt: { oder: [{ und: [{ f: 'x.c', ist: true }, { f: 'x.a', ist: true }] }, { und: [{ f: 'x.c', ist: true }, { f: 'x.b', ist: true }] }] }, grund: 'Test.' },
      // nur die nicht gestellte Frage ist offen: dann bleibt sie genannt (sonst stünde ein Gelb ohne Grund da)
      '2': { gilt: { f: 'x.b', ist: true }, grund: 'Test 2.' },
    },
  };
  const p2 = paketAusDateien({ 'module/bund/modul.json': modul, 'module/bund/t@2026-11-13.json': regel }, 'test');
  const lauf = (fakten: Record<string, FaktWert>) =>
    auswerten({ paket: p2, module: p2.module, merkmale: {}, fakten: { 'lage.ags': sicher('05974040'), ...fakten }, einreichung: '2026-12-01', heute: '2026-11-13', texte: new Map(), festlegungen: {} });
  it('nicht unter „es fehlt“, in `offen`, `klaerend` und „klärt am meisten“ – die Ampel bleibt', () => {
    const a = lauf({ 'x.a': sicher(false) });
    const q = a.paragrafen.find((x) => x.id === 'bund/t/1')!;
    expect(q.ampel).toBe('gelb');
    expect(q.offen).toEqual(['x.c']);
    expect(q.gruende[0]).not.toMatch(/\bB\b/);
    expect(q.klaerend ?? []).not.toContain('x.b');
    expect(a.klaerung.map((k) => k.id)).not.toContain('x.b');
    // gefragt (x.a = ja): x.b fehlt wieder mit
    expect(lauf({ 'x.a': sicher(true) }).paragrafen.find((x) => x.id === 'bund/t/1')!.offen).toEqual(expect.arrayContaining(['x.c', 'x.b']));
    expect(lauf({}).paragrafen.find((x) => x.id === 'bund/t/1')!.offen).toEqual(expect.arrayContaining(['x.c', 'x.b']));
    // bleibt nur die nicht gestellte Frage: sie wird genannt, klärt aber nichts (keine Frage, die man beantworten kann)
    expect(a.paragrafen.find((x) => x.id === 'bund/t/2')!.offen).toEqual(['x.b']);
    expect(a.paragrafen.find((x) => x.id === 'bund/t/2')!.klaerend ?? []).toEqual([]);
  });
});

describe('Runde 17: wer einen Modulwert liefert', () => {
  it('entscheidend ist das Modul, das den Wert setzt – nicht das, das die Angabe definiert', () => {
    const m = (id: string, ebene: Modul['ebene'], fakten: Modul['fakten']) => ({ format: 1, id, name: id, ebene, version: '2026-11-13', normen: {}, fakten }) as unknown as Modul;
    const def = { titel: 'Naturdenkmal', gruppe: 'schutz', typ: 'janein' } as const;
    const set = bundGelieferte([
      m('bund', 'bund', { 'schutz.naturdenkmal': { ...def }, 'bund.fest': { ...def, wert: true } }),
      m('kreis', 'kreis', { 'schutz.naturdenkmal': { ...def, nach: { fakt: 'kreis.nd', tabelle: { true: true } } } }),
    ] as Modul[]);
    expect(set.has('schutz.naturdenkmal')).toBe(false);
    expect(set.has('bund.fest')).toBe(true);
  });
});

