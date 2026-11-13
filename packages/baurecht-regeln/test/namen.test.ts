import { describe, expect, it } from 'vitest';
import { faktDefinitionen } from '@core/baurecht/auswertung';
import { FAKTEN } from '@core/baurecht/fakten';
import { aktiveModule } from '@core/baurecht/paket';
import { faktName, ortsgebunden } from '@core/baurecht/typen';
import { paketLaden } from './laden';

describe('kurze Namen der Angaben', () => {
  const paket = paketLaden();
  const defs = { ...FAKTEN, ...faktDefinitionen(paket.module) };
  it('jede Angabe hat einen Namen mit höchstens 40 Zeichen (langer Titel → „kurz“)', () => {
    const zuLang = Object.entries(defs).filter(([id, d]) => faktName(d, id).length > 40).map(([id, d]) => `${id}: ${faktName(d, id)}`);
    expect(zuLang).toEqual([]);
  });
  it('je Gemeinde (aktive Module, wie zur Laufzeit zusammengeführt) hat jede Angabe einen Namen bis 40 Zeichen', () => {
    // Gemeinden aus den Gemeindemodulen, dazu je Kreis eine Gemeinde ohne eigenes Modul
    const ags = new Set<string>();
    for (const m of paket.module) {
      if (m.schluessel?.length === 8) ags.add(m.schluessel);
      if (m.schluessel?.length === 5) ags.add(`${m.schluessel}999`);
    }
    const fehler: string[] = [];
    for (const a of ags) for (const [id, d] of Object.entries({ ...FAKTEN, ...faktDefinitionen(aktiveModule(paket.module, a)) })) if (faktName(d, id).length > 40) fehler.push(`${a} ${id}: ${faktName(d, id)}`);
    expect(fehler).toEqual([]);
  });

  it('eine Angabe in mehreren Modulen trägt überall denselben kurzen Namen', () => {
    const namen = new Map<string, Set<string>>();
    for (const m of paket.module) for (const [id, d] of Object.entries(m.fakten ?? {})) namen.set(id, new Set([...(namen.get(id) ?? []), faktName({ ...FAKTEN[id], ...d }, id)]));
    expect([...namen].filter(([, n]) => n.size > 1).map(([id, n]) => `${id}: ${[...n].join(' / ')}`)).toEqual([]);
  });

  it('Auswahl-Fakten sind vom Ja/Nein-Fakt zum selben Thema unterscheidbar und heißen wie alle Angaben als Nomen; die Stellplatzfläche hat eine Einheit', () => {
    const soest = { ...FAKTEN, ...faktDefinitionen(aktiveModule(paket.module, '05974040')) };
    const paare: [string, string][] = [
      ['schutz.nsg', 'kreis_soest.nsg'],
      ['schutz.landschaftsplan', 'kreis_soest.landschaftsplan'],
      ['kreis_soest.hsg', 'kreis_soest.hsg_qualitativ'],
      ['kreis_soest.hsg', 'kreis_soest.hsg_quantitativ'],
      ['ortsrecht.stellplatzsatzung', 'soest.stellplatzzone'],
      ['soest.bplan_entwurf', 'soest.bplan'],
    ];
    for (const [janein, auswahl] of paare) {
      expect(soest[janein].typ, janein).toBe('janein');
      expect(faktName(soest[auswahl], auswahl), auswahl).not.toBe(faktName(soest[janein], janein));
    }
    // kurze Namen sind Nomen, keine Fragen (die Frage steht als Unterzeile)
    const fragen = Object.entries(defs).filter(([id, d]) => /^(Welche[rsm]?|Wie|Wo|Ist|Gibt) |\?$/.test(faktName(d, id)));
    expect(fragen.map(([id, d]) => `${id}: ${faktName(d, id)}`)).toEqual([]);
    // Zahl mit Einheit: der Regelbaum zeigt „… mindestens 36 Stellplätze“
    expect(soest['nw.stellplatzflaeche'].einheit).toBe('Stellplätze');
  });
});

describe('ortsgebundene Angaben', () => {
  const paket = paketLaden();
  const defs = { ...FAKTEN, ...faktDefinitionen(paket.module) };
  it('Straßen, Gewässer, Pläne, Satzungen, Sperren und Ortsrecht sind an die Lage gebunden', () => {
    const muss = ['lage.ags', 'lage.altlasten', 'lage.strasse_ausserorts', 'lage.gewaesser', 'lage.bundesfernstrasse', 'lage.zufahrt_klassifiziert', 'lage.anschluss_klassifiziert', 'planung.veraenderungssperre', 'planung.erhaltungssatzung', 'planung.sanierungsgebiet', 'planung.umlegung', 'schutz.lsg', 'soest.altstadt', 'soest.historische_ortsteile', 'soest.fernwaerme', 'soest.muellingsen', 'soest.bplan_entwurf', 'vorhaben.erstbebauung'];
    expect(muss.filter((id) => !defs[id] || !ortsgebunden(defs[id]))).toEqual([]);
  });
  it('Vorhaben, Gebäude, Technik und Antrag hängen nicht an der Lage', () => {
    const falsch = Object.entries(defs).filter(([, d]) => ['vorhaben', 'gebaeude', 'technik', 'antrag'].includes(d.gruppe) && !d.geodienst && ortsgebunden(d));
    expect(falsch.map(([id]) => id)).toEqual([]);
    // Projektgrößen verfallen nicht mit der Lage (die Stellplatzzahl ist Teil des Vorhabens)
    expect(ortsgebunden(defs['nw.stellplatzflaeche'])).toBe(false);
  });
});
