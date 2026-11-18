/**
 * Fragen und Regeln: was nicht gefragt wird, entscheidet nichts – Grundfälle je Merkmalskombination und Gemeinde
 * (voll nur in der CI bzw. mit VOLL=1); eigene Datei, damit sie auf einem eigenen Worker läuft (Hilfen: gemeinsam.ts).
 */
import { describe, expect, it } from 'vitest';
import { auswerten, faktDefinitionen } from '@core/baurecht/auswertung';
import { frageGestellt, vorfrageNein } from '@core/baurecht/fragen';
import { aktiveModule } from '@core/baurecht/paket';
import type { FaktWert } from '@core/baurecht/typen';
import { paket, SOEST, VOLL, MATRIX_ZEIT, MATRIX_ZEIT_LANG, stichprobe, stichprobeLokal, matrixAuswahl, kombinationen, sicher, HEUTE, eingabe, TEXTE } from './gemeinsam';

/* ---------- Fragen und Regeln: was nicht gefragt wird, entscheidet nichts ---------- */

/**
 * Eine Angabe, deren Frage die App nicht stellt (frageGestellt – dasselbe Kriterium wie Kern und App: Bedingung „nein“,
 * bei Rückfragen auch „offen“), darf keinen Paragrafen gelb machen,
 * keinen Paragrafen ändern und nicht unter „klärt am meisten“ stehen – sonst fehlt dem Anwender eine Frage, die er
 * nicht beantworten kann. Geprüft an Grundfällen (vollständige, plausible Angaben je Merkmalskombination und Gemeinde):
 * Angaben mit nicht gestellter Frage werden entfernt (so lange, bis sich nichts mehr ändert) und das Ergebnis verglichen.
 */
describe('Fragen und Regeln', () => {
  const grund = (): Record<string, FaktWert['wert']> => {
    const defs = faktDefinitionen(aktiveModule(paket.module, SOEST));
    const f: Record<string, FaktWert['wert']> = {};
    // abgeleitete Angaben (Tabellen der Module, Stellplatzregeln der Satzung) liefern die Module selbst
    for (const [id, d] of Object.entries(defs)) if (d.typ === 'janein' && !d.nach && d.wert === undefined) f[id] = false;
    return {
      ...f,
      'gebaeude.beheizt': true,
      'gebaeude.aufenthaltsraeume': true,
      'gebaeude.freistehend': true,
      'vorhaben.erdarbeiten': true,
      'vorhaben.entwaesserung': true,
      'vorhaben.stellplaetze_grundstueck': true,
      'technik.waermepumpe': true,
      'vorhaben.heizung': true,
      'gebaeude.wohnungen': 1,
      'gebaeude.nutzungseinheiten': 1,
      'gebaeude.hoehe': 6.5,
      'gebaeude.bgf': 200,
      'gebaeude.bri': 700,
      'gebaeude.nutzflaeche': 150,
      'gebaeude.besucher': 0,
      'gebaeude.gastbetten': 0,
      'gebaeude.verkaufsflaeche': 0,
      'gebaeude.garage_nutzflaeche': 30,
      'gebaeude.stellplaetze': 2,
      'nw.geschosse_oberirdisch': 2,
      'nw.stellplatzflaeche': 0,
      'lage.erdbebenzone': '0',
      'planung.gebietsart': 'WA',
      'planung.baunvo': 'aktuell',
      'nw.nachbarrecht': 'geklärt',
      'soest.stellplatzzone': '3',
      'kreis_soest.hsg_qualitativ': 'außerhalb',
      'kreis_soest.hsg_quantitativ': 'außerhalb',
    };
  };
  const lauf = (ags: string, m: Record<string, string>, f: Record<string, FaktWert['wert']>) =>
    auswerten({
      paket,
      module: aktiveModule(paket.module, ags),
      merkmale: m,
      fakten: { 'lage.ags': sicher(ags), ...Object.fromEntries(Object.entries(f).map(([k, v]) => [k, sicher(v)])) },
      einreichung: '2026-12-01',
      heute: HEUTE,
      texte: TEXTE,
      festlegungen: {},
    });
  const UMFAENGE = ['vollständiger Abbruch ohne Ersatzbau', 'Teilabbruch', 'Abbruch mit Ersatzbau'];
  // Grundfälle: Merkmale × Gemeinde × Lage (ohne bzw. mit Schutzgebieten, Planaufstellung und Altstadt)
  const LAGEN: Record<string, Record<string, FaktWert['wert']>> = {
    ohne: {},
    schutz: {
      'schutz.wsg': true,
      'schutz.vsg': true,
      'schutz.ffh': true,
      'planung.planaufstellung': true,
      'planung.planreife': true,
      'soest.altstadt': true,
      'soest.denkmalbereich': true,
      'schutz.denkmalbereich': true,
    },
    // ohne neue Heizung, ohne Aufenthaltsräume, mehrere Nutzungseinheiten und viele Stellplätze
    anders: {
      'vorhaben.heizung': false,
      'gebaeude.aufenthaltsraeume': false,
      'vorhaben.entwaesserung': false,
      'gebaeude.nutzungseinheiten': 3,
      'gebaeude.stellplaetze': 40,
      'nw.stellplatzflaeche': 40,
      'planung.planaufstellung': true,
    },
  };
  const faelle: { name: string; ags: string; m: Record<string, string>; f: Record<string, FaktWert['wert']> }[] = [];
  for (const ags of [SOEST, '05974052', '05974008'])
    for (const [lage, extra] of Object.entries(LAGEN))
      for (const v of ['Errichtung', 'Änderung', 'Nutzungsänderung', ...UMFAENGE])
        for (const art of ['Einfamilienhaus', 'Mehrfamilienhaus', 'Nichtwohngebäude', 'kein Gebäude'])
          for (const p of ['Bebauungsplan', 'einfacher Bebauungsplan', 'Innenbereich', 'Außenbereich'])
            for (const vf of ['vereinfachtes Verfahren', 'verfahrensfrei']) {
              const bes = UMFAENGE.includes(v);
              const m: Record<string, string> = { Vorhaben: bes ? 'Beseitigung' : v, Gebäudeart: art, Planungsrecht: p, Verfahren: vf, Sonderbau: 'nein' };
              if (art !== 'kein Gebäude') m.Gebäudeklasse = art === 'Mehrfamilienhaus' ? '4' : '1';
              const f = { ...grund(), ...extra, ...(bes ? { 'vorhaben.beseitigung_umfang': v, 'nw.altbau_verfahrensfrei': true, 'nw.beseitigung_mit_beantragt': false } : {}) };
              if (art === 'Mehrfamilienhaus')
                Object.assign(f, { 'gebaeude.wohnungen': 8, 'gebaeude.nutzungseinheiten': 8, 'gebaeude.hoehe': 11, 'nw.geschosse_oberirdisch': 4, 'gebaeude.stellplaetze': 8 });
              if (art === 'kein Gebäude')
                Object.assign(f, { 'gebaeude.aufenthaltsraeume': false, 'gebaeude.beheizt': false, 'vorhaben.entwaesserung': false, 'vorhaben.heizung': false, 'gebaeude.wohnungen': 0 });
              // ein Nichtwohngebäude ohne Wohnung (Laden, Büro) – sonst blieben Fragen unentdeckt, die nur mit Wohnung gestellt werden
              if (art === 'Nichtwohngebäude') Object.assign(f, { 'gebaeude.wohnungen': 0 });
              faelle.push({ name: `${ags} ${lage} ${v} ${art} ${p} ${vf}`, ags, m, f });
            }

  it('die lokale Stichprobe der Grundfälle und der Matrix deckt jeden Wert jedes Merkmals ab', () => {
    const werteVon = (l: Record<string, string>[], k: string) => new Set(l.map((m) => m[k] ?? '–'));
    const probe = stichprobeLokal(faelle, 150).map((x) => ({ ...x.m, ags: x.ags, lage: x.name.split(' ')[1] }));
    const alle = faelle.map((x) => ({ ...x.m, ags: x.ags, lage: x.name.split(' ')[1] }));
    for (const k of ['ags', 'lage', 'Vorhaben', 'Gebäudeart', 'Planungsrecht', 'Verfahren']) expect(werteVon(probe, k), k).toEqual(werteVon(alle, k));
    const werte = {
      Gebäudeklasse: ['1', '3', undefined],
      Planungsrecht: ['Bebauungsplan', 'Außenbereich', undefined],
      Verfahren: ['verfahrensfrei', 'vereinfachtes Verfahren', undefined],
      Sonderbau: ['nein', 'ja'],
    };
    const matrix = [...kombinationen(werte)];
    const mp = VOLL ? matrix : matrixAuswahl(werte, 6);
    for (const k of ['Gebäudeklasse', 'Planungsrecht', 'Verfahren', 'Sonderbau']) expect(werteVon(mp, k), k).toEqual(werteVon(matrix, k));
  });

  it('§ 47 Abs. 6 BauO NRW: Nutzungsänderung eines Nichtwohngebäudes ohne Wohnung – keine „Ausnahme möglich“ über die nicht gestellte Umnutzung', () => {
    const m = { Vorhaben: 'Nutzungsänderung', Gebäudeart: 'Nichtwohngebäude', Gebäudeklasse: '3', Planungsrecht: 'Innenbereich', Verfahren: 'vereinfachtes Verfahren', Sonderbau: 'nein' };
    const r = lauf(SOEST, m, { ...grund(), 'gebaeude.wohnungen': 0, 'gebaeude.nutzungseinheiten': 3 });
    for (const id of ['nw/bauo-nrw/29', 'nw/bauo-nrw/34', 'nw/bauo-nrw/36']) {
      const p = r.paragrafen.find((x) => x.id === id)!;
      expect(p.offen, id).not.toContain('nw.umnutzung_wohnraum');
      expect(p.hinweise.join(' '), id).not.toMatch(/Ausnahme möglich.*Umnutzung/);
    }
    // mit Wohnung: die Frage wird gestellt, „ja“ lässt §§ 34, 36 entfallen
    const mitWohnung = lauf(SOEST, m, { ...grund(), 'gebaeude.wohnungen': 2, 'gebaeude.nutzungseinheiten': 3, 'nw.umnutzung_wohnraum': true });
    for (const id of ['nw/bauo-nrw/34', 'nw/bauo-nrw/36']) expect(mitWohnung.paragrafen.find((x) => x.id === id)!.ampel, id).toBe('gruen');
  });

  it('Runde 17: § 47 Abs. 6 – Gebäudeart offen mit Wohnung und Umnutzung „ja“ (Fall X10): kein gelb ohne Wirkung; Wohnungen nur als Hinweis (X15)', () => {
    const { Gebäudeart: _weg, ...ohneArt } = {
      Vorhaben: 'Nutzungsänderung',
      Gebäudeart: '',
      Gebäudeklasse: '3',
      Planungsrecht: 'Innenbereich',
      Verfahren: 'vereinfachtes Verfahren',
      Sonderbau: 'nein',
    };
    void _weg;
    const x10 = lauf(SOEST, ohneArt, { ...grund(), 'gebaeude.wohnungen': 2, 'gebaeude.nutzungseinheiten': 3, 'nw.umnutzung_wohnraum': true });
    for (const id of ['nw/bauo-nrw/29', 'nw/bauo-nrw/34', 'nw/bauo-nrw/36']) {
      const p = x10.paragrafen.find((x) => x.id === id)!;
      expect(p.ampel, id).toBe('gruen');
      expect(p.offen, id).not.toContain('merkmal:Gebäudeart');
    }
    // X15: Nichtwohngebäude, „keine Wohnung“ nur als Hinweis – die Ausnahme ist nicht gesichert ausgeschlossen
    const m = { Vorhaben: 'Nutzungsänderung', Gebäudeart: 'Nichtwohngebäude', Gebäudeklasse: '3', Planungsrecht: 'Innenbereich', Verfahren: 'vereinfachtes Verfahren', Sonderbau: 'nein' };
    // (die Umnutzung unbeantwortet – „nein“ schlösse die Ausnahme gesichert aus)
    const ohneUmnutzung = Object.fromEntries(
      Object.entries(grund())
        .filter(([k]) => k !== 'nw.umnutzung_wohnraum')
        .map(([k, v]) => [k, sicher(v as FaktWert['wert'])]),
    );
    const x15 = auswerten(eingabe(m, { ...ohneUmnutzung, 'gebaeude.wohnungen': { wert: 0, herkunft: 'flaechen', sicherheit: 'hinweis' }, 'gebaeude.nutzungseinheiten': sicher(3) }, TEXTE));
    const p34 = x15.paragrafen.find((x) => x.id === 'nw/bauo-nrw/34')!;
    expect(p34.ampel).toBe('rot');
    expect(p34.hinweise.join(' ')).toMatch(/Ausnahme ausgeschlossen, aber nicht gesichert \(beruht auf: Wohnungen.* – nur Hinweis\)/);
    // gesichert keine Wohnung: kein solcher Hinweis
    const gesichert = auswerten(eingabe(m, { ...ohneUmnutzung, 'gebaeude.wohnungen': sicher(0), 'gebaeude.nutzungseinheiten': sicher(3) }, TEXTE));
    expect(gesichert.paragrafen.find((x) => x.id === 'nw/bauo-nrw/34')!.hinweise.join(' ')).not.toMatch(/aber nicht gesichert/);
  });

  it('eine Angabe, deren Frage nicht gestellt wird, ändert keinen Paragrafen und steht nicht unter „klärt am meisten“', { timeout: MATRIX_ZEIT }, () => {
    const fehler = new Set<string>();
    const melde = (t: string) => {
      if (fehler.size < 60) fehler.add(t);
    };
    for (const fall of stichprobe(faelle, 150)) {
      const defs = faktDefinitionen(aktiveModule(paket.module, fall.ags));
      const basis = lauf(fall.ags, fall.m, fall.f);
      // Angaben mit nicht gestellter Frage entfernen – bis sich nichts mehr ändert (eine Antwort kann eine Frage verbergen)
      const f = { ...fall.f };
      let r = basis;
      for (let runde = 0; runde < 6; runde++) {
        const weg = Object.keys(f).filter((id) => !frageGestellt(id, defs[id], r.kontext));
        if (!weg.length) break;
        for (const id of weg) delete f[id];
        r = lauf(fall.ags, fall.m, f);
      }
      const verborgen = (id: string) => !frageGestellt(id, defs[id], r.kontext);
      const vorher = new Map(basis.paragrafen.map((p) => [p.id, p.automatisch]));
      for (const p of r.paragrafen) {
        if (vorher.get(p.id) !== p.automatisch) melde(`${p.id}: ${vorher.get(p.id)} → ${p.automatisch} ohne nicht gestellte Angaben (${fall.name})`);
        const v = p.offen.filter(verborgen);
        if (v.length) melde(`${p.id}: offen wegen nicht gestellter Frage ${v.join(', ')} (${fall.name})`);
      }
      const k = r.klaerung.filter((x) => verborgen(x.id));
      if (k.length) melde(`„Klärt am meisten“ nennt nicht gestellte Fragen ${k.map((x) => x.id).join(', ')} (${fall.name})`);
    }
    expect([...fehler]).toEqual([]);
    expect(faelle.length).toBeGreaterThan(500);
  });

  it('je gestellte Angabe einzeln offen: keine nicht gestellte Frage unter „es fehlt“, in `klaerend` oder „klärt am meisten“', { timeout: MATRIX_ZEIT_LANG }, () => {
    const fehler = new Set<string>();
    const melde = (t: string) => {
      if (fehler.size < 60) fehler.add(t);
    };
    // Auswahl der Grundfälle (Soest, ohne Schutzgebiete, Innenbereich; jedes Vorhaben, Gebäudearten ohne das
    // Mehrfamilienhaus) – dazu bei der
    // Beseitigung der Altbau „nein“ und der Umfang offen (die Grundfälle oben setzen den Altbau immer auf „ja“)
    const auswahl: typeof faelle = [];
    for (const fall of faelle) {
      if (fall.ags !== SOEST || !fall.name.includes(' ohne ') || fall.m.Planungsrecht !== 'Innenbereich' || fall.m.Verfahren !== 'vereinfachtes Verfahren' || fall.m.Gebäudeart === 'Mehrfamilienhaus')
        continue;
      auswahl.push(fall);
      if (fall.m.Vorhaben === 'Beseitigung') {
        auswahl.push({ ...fall, name: `${fall.name} Altbau nein`, f: { ...fall.f, 'nw.altbau_verfahrensfrei': false } });
        const { 'vorhaben.beseitigung_umfang': _u, ...ohneUmfang } = fall.f;
        auswahl.push({ ...fall, name: `${fall.name} Umfang offen`, f: ohneUmfang });
      }
    }
    // je eine der eigens angelegten Varianten („Altbau nein“, „Umfang offen“), dazu eine Stichprobe der Grundfälle
    const varianten = auswahl.filter((x) => / (Altbau nein|Umfang offen)$/.test(x.name));
    const geprueft = VOLL
      ? auswahl
      : [
          ...stichprobe(
            auswahl.filter((x) => !varianten.includes(x)),
            4,
          ),
          ...varianten.slice(0, 2),
        ];
    for (const fall of geprueft) {
      const defs = faktDefinitionen(aktiveModule(paket.module, fall.ags));
      // Angaben mit nicht gestellter Frage entfernen (wie im Fall oben)
      const f = { ...fall.f };
      let r = lauf(fall.ags, fall.m, f);
      for (let runde = 0; runde < 6; runde++) {
        const weg = Object.keys(f).filter((id) => !frageGestellt(id, defs[id], r.kontext));
        if (!weg.length) break;
        for (const id of weg) delete f[id];
        r = lauf(fall.ags, fall.m, f);
      }
      // nur Angaben, an denen eine Regel hängt
      const verwendet = new Set(r.paragrafen.flatMap((p) => p.verwendet));
      for (const id of Object.keys(f).filter((x) => verwendet.has(x))) {
        const { [id]: _w, ...ohne } = f;
        const r2 = lauf(fall.ags, fall.m, ohne);
        const verborgen = (x: string) => !frageGestellt(x, defs[x], r2.kontext);
        for (const p of r2.paragrafen) {
          const v = [...p.offen, ...(p.klaerend ?? [])].filter(verborgen);
          if (v.length) melde(`${p.id}: nicht gestellte Frage ${[...new Set(v)].join(', ')} offen, wenn ${id} fehlt (${fall.name})`);
        }
        const k = r2.klaerung.filter((x) => verborgen(x.id));
        if (k.length) melde(`„Klärt am meisten“ nennt nicht gestellte Fragen ${k.map((x) => x.id).join(', ')}, wenn ${id} fehlt (${fall.name})`);
      }
    }
    expect([...fehler]).toEqual([]);
    expect(auswahl.length).toBeGreaterThan(30);
  });

  it('Fachprüfung Runde 13: gelb nur, wenn eine Antwort etwas ändert; Ersatzbau als Neubau; Entwässerung ohne Anschluss', () => {
    const EFH = { Gebäudeart: 'Einfamilienhaus', Gebäudeklasse: '1', Sonderbau: 'nein', Verfahren: 'vereinfachtes Verfahren' };
    const ampel = (m: Record<string, string>, f: Record<string, FaktWert['wert']>, id: string) => lauf(SOEST, m, f).paragrafen.find((p) => p.id === id)!.automatisch;
    const ohne = (f: Record<string, FaktWert['wert']>, ...ids: string[]) => Object.fromEntries(Object.entries(f).filter(([k]) => !ids.includes(k)));
    const g = grund();
    // „Im Zusammenhang bebauter Ortsteil“ offen (einfacher B-Plan, Satzung): § 18 BNatSchG und § 36 BauGB gelten so oder so
    // (§ 36 dort, wo der Kreis Bauaufsicht ist – Bad Sassendorf; in Soest entscheidet die Stadt selbst)
    for (const p of ['einfacher Bebauungsplan', 'Satzung nach BauGB']) {
      expect(ampel({ ...EFH, Vorhaben: 'Errichtung', Planungsrecht: p }, ohne(g, 'planung.innen'), 'bund/bnatschg/18')).toBe('rot');
      expect(lauf('05974008', { ...EFH, Vorhaben: 'Errichtung', Planungsrecht: p }, ohne(g, 'planung.innen')).paragrafen.find((x) => x.id === 'bund/baugb/36')!.automatisch).toBe('rot');
    }
    // Umfang der Beseitigung offen: Altstadt § 12 (und § 1) bei jeder Beseitigung eines Gebäudes, § 74 bei Freistellung
    const alt = { ...ohne(g, 'vorhaben.beseitigung_umfang'), 'soest.altstadt': true, 'soest.einfriedungspflicht': true, 'nw.altbau_verfahrensfrei': true };
    expect(ampel({ ...EFH, Vorhaben: 'Beseitigung', Planungsrecht: 'Innenbereich' }, alt, 'nw-05974040/altstadtsatzung/12')).toBe('rot');
    expect(ampel({ ...EFH, Vorhaben: 'Beseitigung', Planungsrecht: 'Innenbereich' }, alt, 'nw-05974040/altstadtsatzung/1')).toBe('rot');
    const mfh = { Gebäudeart: 'Mehrfamilienhaus', Gebäudeklasse: '4', Sonderbau: 'nein', Verfahren: 'Genehmigungsfreistellung', Vorhaben: 'Beseitigung', Planungsrecht: 'Bebauungsplan' };
    expect(ampel(mfh, { ...g, 'gebaeude.wohnungen': 8, 'gebaeude.hoehe': 11, 'nw.geschosse_oberirdisch': 4, 'nw.altbau_verfahrensfrei': false }, 'nw/bauo-nrw/74')).toBe('rot');
    // Gartenhaus ohne Aufenthaltsräume und ohne Entwässerung: §§ 14, 15 der Entwässerungssatzung entfallen; ein Gebäude mit
    // Aufenthaltsräumen und „ohne Entwässerung“: gilt, mit Einzelfallhinweis; ohne Angabe: gilt
    const gh = { Gebäudeart: 'Nichtwohngebäude', Gebäudeklasse: '1', Sonderbau: 'nein', Verfahren: 'verfahrensfrei', Vorhaben: 'Errichtung', Planungsrecht: 'Innenbereich' };
    for (const nr of ['14', '15']) {
      const id = `nw-05974040/entwaesserungssatzung/${nr}`;
      expect(ampel(gh, { ...g, 'gebaeude.aufenthaltsraeume': false, 'vorhaben.entwaesserung': false }, id)).toBe('gruen');
      const mitAR = lauf(SOEST, { ...EFH, Vorhaben: 'Errichtung', Planungsrecht: 'Innenbereich' }, { ...g, 'vorhaben.entwaesserung': false }).paragrafen.find((p) => p.id === id)!;
      expect(mitAR.automatisch).toBe('rot');
      expect(mitAR.hinweise.join(' ')).toMatch(/Im Einzelfall prüfen: .*ohne neue Entwässerung/);
      expect(ampel({ ...EFH, Vorhaben: 'Errichtung', Planungsrecht: 'Innenbereich' }, ohne(g, 'vorhaben.entwaesserung'), id)).toBe('rot');
    }
    // Nutzungsänderung einer Anlage, die kein Gebäude ist: keine Gebäudevorschriften als Einzelfall
    const kg = { Gebäudeart: 'kein Gebäude', Sonderbau: 'nein', Verfahren: 'vereinfachtes Verfahren', Vorhaben: 'Nutzungsänderung', Planungsrecht: 'Innenbereich' };
    for (const nr of ['27', '28', '31', '32', '34', '37', '40']) expect(ampel(kg, { ...g, 'gebaeude.aufenthaltsraeume': false, 'gebaeude.wohnungen': 0 }, `nw/bauo-nrw/${nr}`), nr).toBe('gruen');
    // Verweis auf „rot, Ausnahme möglich“: der Hinweis geht mit
    const r = lauf(SOEST, { ...EFH, Vorhaben: 'Errichtung', Planungsrecht: 'einfacher Bebauungsplan' }, ohne(g, 'planung.innen'));
    expect(r.paragrafen.find((p) => p.id === 'bund/bnatschg/15')!.hinweise.join(' ')).toMatch(/Ausnahme möglich über § 14 BNatSchG/);
  });

  it('Antworten auf nicht gestellte Fragen ändern nichts – weder „ja“ noch „nein“ (auch nicht über Tabellen der Module)', { timeout: MATRIX_ZEIT }, () => {
    const fehler = new Set<string>();
    const auswahl = faelle.filter((f) => ['05974008', '05974052'].includes(f.ags) && f.name.includes(' ohne ') && f.m.Planungsrecht === 'Innenbereich' && f.m.Verfahren === 'vereinfachtes Verfahren');
    for (const fall of stichprobe(auswahl, 12)) {
      const defs = faktDefinitionen(aktiveModule(paket.module, fall.ags));
      const f = { ...fall.f };
      let r = lauf(fall.ags, fall.m, f);
      for (let runde = 0; runde < 6; runde++) {
        const weg = Object.keys(f).filter((id) => !frageGestellt(id, defs[id], r.kontext));
        if (!weg.length) break;
        for (const id of weg) delete f[id];
        r = lauf(fall.ags, fall.m, f);
      }
      // Einzelfragen unter einer Vorfrage „nein“ ausgenommen: Ihr „ja“ ist ein Widerspruch zur Vorfrage und zählt (Test unten)
      const unterNein = (d: (typeof defs)[string]) => !!d.vorfrage && vorfrageNein(r.fakten[d.vorfrage.fakt]);
      const verborgen = Object.entries(defs)
        .filter(([id, d]) => d.typ === 'janein' && !d.nach && d.wert === undefined && !(id in f) && !unterNein(d) && !r.fakten[id]?.ausFolge && !frageGestellt(id, d, r.kontext))
        .map(([id]) => id);
      const vorher = new Map(r.paragrafen.map((p) => [p.id, p.automatisch]));
      for (const w of [true, false]) {
        const r2 = lauf(fall.ags, fall.m, { ...f, ...Object.fromEntries(verborgen.map((id) => [id, w])) });
        for (const p of r2.paragrafen)
          if (vorher.get(p.id) !== p.automatisch && fehler.size < 40)
            fehler.add(`${p.id}: ${vorher.get(p.id)} → ${p.automatisch}, wenn nicht gestellte Fragen „${w ? 'ja' : 'nein'}“ sind (${fall.name})`);
      }
      // „nein“ unter einer Vorfrage „nein“ ändert nichts; „ja“ macht die Vorfrage widersprüchlich, stellt die Frage wieder und
      // stuft nie zu „entfällt“ hin ab (kein falsches Grün aus einer übersehenen Einzelantwort)
      const RANG = { gruen: 0, gelb: 1, rot: 2 } as const;
      // (nur, wo allein die Vorfrage die Frage verbirgt – nicht zugleich ihr „wenn“, z. B. Naturdenkmal der Kreisverordnung außerhalb ihres Gebiets)
      const nurVorfrage = (id: string, d: (typeof defs)[string]) => frageGestellt(id, { ...d, vorfrage: undefined }, r.kontext);
      for (const [id, d] of Object.entries(defs).filter(([id, d]) => !(id in f) && unterNein(d) && nurVorfrage(id, d) && !d.nach && d.wert === undefined)) {
        const anders = d.typ === 'janein' ? !d.vorfrage!.sonst : d.werte?.find((x) => x !== d.vorfrage!.sonst);
        if (anders === undefined) continue;
        const gleich = lauf(fall.ags, fall.m, { ...f, [id]: d.vorfrage!.sonst });
        for (const p of gleich.paragrafen)
          if (vorher.get(p.id) !== p.automatisch && fehler.size < 40)
            fehler.add(`${p.id}: ${vorher.get(p.id)} → ${p.automatisch}, wenn ${id} unter Vorfrage „nein“ „${String(d.vorfrage!.sonst)}“ ist (${fall.name})`);
        const ja = lauf(fall.ags, fall.m, { ...f, [id]: anders });
        // jede Stufe darüber, die vorher wirksam „nein“ war, ist danach „ja“ bzw. widersprüchlich – bis zur obersten Vorfrage
        for (let v = d.vorfrage?.fakt, n = 0; v && n < 10; v = defs[v]?.vorfrage?.fakt, n++) {
          if (!vorfrageNein(r.fakten[v])) continue;
          const nachher = ja.fakten[v];
          if (!(nachher?.widerspruch || nachher?.wert === true) && fehler.size < 40) fehler.add(`${id} „${String(anders)}“: Vorfrage ${v} weiter „nein“ ohne Widerspruch (${fall.name})`);
        }
        if (!frageGestellt(id, d, ja.kontext) && fehler.size < 40) fehler.add(`${id} „${String(anders)}“: Frage nicht wieder gestellt (${fall.name})`);
        for (const p of ja.paragrafen)
          if (RANG[p.automatisch] < RANG[vorher.get(p.id)!] && fehler.size < 40)
            fehler.add(`${p.id}: ${vorher.get(p.id)} → ${p.automatisch}, wenn ${id} unter Vorfrage „nein“ „${String(anders)}“ ist (${fall.name})`);
      }
      // Werte, die sich aus anderen ergeben (FaktDef.folgt): derselbe Wert ändert nichts; ein anderer bleibt als
      // Widerspruch stehen, stellt die Frage wieder und führt nie zu „entfällt“
      for (const [id, d] of Object.entries(defs).filter(([id]) => !(id in f) && !!r.fakten[id]?.ausFolge)) {
        const w = r.fakten[id].wert;
        const anders = d.typ === 'janein' ? !w : d.typ === 'zahl' ? Number(w) + 5 : d.werte?.find((x) => x !== w);
        if (anders === undefined) continue;
        const gleich = lauf(fall.ags, fall.m, { ...f, [id]: w });
        for (const p of gleich.paragrafen)
          if (vorher.get(p.id) !== p.automatisch && fehler.size < 40) fehler.add(`${p.id}: ${vorher.get(p.id)} → ${p.automatisch}, wenn ${id} wie abgeleitet „${String(w)}“ ist (${fall.name})`);
        const neu = lauf(fall.ags, fall.m, { ...f, [id]: anders });
        if (!neu.fakten[id]?.widerspruch && fehler.size < 40) fehler.add(`${id} „${String(anders)}“ gegen abgeleitet „${String(w)}“: kein Widerspruch (${fall.name})`);
        if (!frageGestellt(id, d, neu.kontext) && fehler.size < 40) fehler.add(`${id} „${String(anders)}“: Frage nicht wieder gestellt (${fall.name})`);
        // ein milderer Wert gegen die Ableitung: höchstens „prüfen“ (der Widerspruch), nie „entfällt“
        for (const p of neu.paragrafen)
          if (p.automatisch === 'gruen' && vorher.get(p.id) !== 'gruen' && fehler.size < 40)
            fehler.add(`${p.id}: ${vorher.get(p.id)} → ${p.automatisch}, wenn ${id} gegen die Ableitung „${String(anders)}“ ist (${fall.name})`);
      }
    }
    expect([...fehler]).toEqual([]);
    expect(auswahl.length).toBeGreaterThan(20);
  });

  it('Fachprüfung Runde 14: § 36 BauGB nur, wo der Kreis Bauaufsicht ist; § 74 und BauPrüfVO § 2 ohne Gelb ohne Wirkung; Entwässerung § 9', () => {
    const g = grund();
    const ohne = (f: Record<string, FaktWert['wert']>, ...ids: string[]) => Object.fromEntries(Object.entries(f).filter(([k]) => !ids.includes(k)));
    const EFH = { Gebäudeart: 'Einfamilienhaus', Gebäudeklasse: '1', Sonderbau: 'nein', Verfahren: 'vereinfachtes Verfahren', Vorhaben: 'Errichtung', Planungsrecht: 'Innenbereich' };
    const p36 = (ags: string) => lauf(ags, EFH, g).paragrafen.find((x) => x.id === 'bund/baugb/36')!;
    // Soest, Lippstadt, Warstein, Werl und kreisfreie Städte (Dortmund) entscheiden selbst – kein Einvernehmen
    for (const ags of [SOEST, '05974028', '05974044', '05974052', '05913000']) expect(p36(ags).automatisch, ags).toBe('gruen');
    // Bad Sassendorf: der Kreis ist Bauaufsicht
    expect(p36('05974008').automatisch).toBe('rot');
    // eine kreisangehörige Gemeinde außerhalb des Kreises Soest: Zuständigkeit offen – gilt, Ausnahme möglich (kein Grün)
    const anders = p36('05958004');
    expect(anders.automatisch).toBe('rot');
    expect(anders.offen).toContain('zustaendig.gemeinde_bauaufsicht');
    // Gemeindeschlüssel nur Hinweis: nicht sicher grün
    const hinweis = auswerten({
      paket,
      module: aktiveModule(paket.module, SOEST),
      merkmale: EFH,
      fakten: { 'lage.ags': { wert: SOEST, herkunft: 'abgeleitet', sicherheit: 'hinweis' }, ...Object.fromEntries(Object.entries(g).map(([k, v]) => [k, sicher(v)])) },
      einreichung: '2026-12-01',
      heute: HEUTE,
      texte: TEXTE,
      festlegungen: {},
    });
    expect(hinweis.paragrafen.find((x) => x.id === 'bund/baugb/36')!.automatisch).not.toBe('gruen');
    // § 74: Freistellung, Beseitigung, Umfang offen, Abbruch nicht verfahrensfrei (angebautes EFH) – gilt so oder so
    const frei = { ...EFH, Verfahren: 'Genehmigungsfreistellung', Vorhaben: 'Beseitigung', Planungsrecht: 'Bebauungsplan' };
    expect(
      lauf(SOEST, frei, { ...ohne(g, 'vorhaben.beseitigung_umfang', 'nw.altbau_verfahrensfrei'), 'gebaeude.freistehend': false }).paragrafen.find((x) => x.id === 'nw/bauo-nrw/74')!.automatisch,
    ).toBe('rot');
    // BauPrüfVO § 2: Freistellung, Nutzungsänderung, einfacher B-Plan, „im Zusammenhang bebaut“ offen – gilt so oder so
    const nae = { ...EFH, Verfahren: 'Genehmigungsfreistellung', Vorhaben: 'Nutzungsänderung', Planungsrecht: 'einfacher Bebauungsplan' };
    expect(lauf(SOEST, nae, ohne(g, 'planung.innen')).paragrafen.find((x) => x.id === 'nw/baupruefvo/2')!.automatisch).toBe('rot');
    // Entwässerungssatzung § 9: Gartenhaus ohne Aufenthaltsräume und ohne neue Entwässerung – Einzelfall (Dachwasser)
    const gh = { Gebäudeart: 'Nichtwohngebäude', Gebäudeklasse: '1', Sonderbau: 'nein', Verfahren: 'verfahrensfrei', Vorhaben: 'Errichtung', Planungsrecht: 'Innenbereich' };
    const p9 = lauf(SOEST, gh, { ...g, 'gebaeude.aufenthaltsraeume': false, 'vorhaben.entwaesserung': false }).paragrafen.find((x) => x.id === 'nw-05974040/entwaesserungssatzung/9')!;
    expect(p9.automatisch).toBe('gelb');
    expect(p9.gruende.join(' ')).toMatch(/Niederschlagswasser/);
  });

  it('Begründungen ohne doppelte Klammern: der Anwendungsbereich endet nicht mit einer Klammer, da ihm die tragende Angabe in Klammern folgt', () => {
    const probleme: string[] = [];
    for (const [key, l] of paket.regeln)
      for (const { regel } of l) {
        const g = regel.geltungGrund ?? '';
        if (g.endsWith(')') || g.includes(') (')) probleme.push(`${key}: ${g}`);
        for (const [nr, r] of Object.entries(regel.paragrafen)) for (const t of [r.titel ?? '', r.grund ?? '']) if (t.includes(') (')) probleme.push(`${key} § ${nr}: ${t}`);
      }
    expect(probleme).toEqual([]);
  });
});
