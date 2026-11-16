import { raumBodenVersatz } from '@core/calc';
import type { ExportContext, Row, Value } from '@core/excel/context';
import { projektWerte } from '@core/excel/projekt';
import { polygonArea } from '@core/geometry';
import { nutzungLabel, versiegelungInfo } from '@core/lageplan';
import type { Project, RoomShape } from '@core/model';
import type { Kennzahl, Nachweis } from '../massNutzung';
import { baunvoLabel, bauoLabel, istAufenthaltsraum, massNachweis, sachlicheHinweise } from '../massNutzung';
import { ANRECHNUNG, AUFENTHALT, flaechenVergleich, GELAENDE_QUELLE, GF_ART, GRUNDSTUECK_QUELLE, HAFTUNG, kennzahlStellenVon, roemisch, STATUS } from '../texte';
import { bebauungsplanText, GEBIETSARTEN } from '@core/model';
import { datumText } from '@core/ui/DruckKopf';
import { flaechenNummern, rechenweg, teilName } from '../rechenweg';

/**
 * Datengrundlage für Excel-Export und Vorlagen des GRZ-Nachweises (Syntax siehe docs/excel-vorlagen.md; jeder
 * Platzhalter ist in platzhalterSchema.ts beschrieben – der Vollständigkeitstest verlangt das für jeden neuen Schlüssel).
 *
 *   {{grz}}, {{gfz}}, {{vollgeschosse}}   Kennzahlen
 *   {{geschoss.name}}                     Zeile je Geschoss (ebenso lageplan, raum, hinweis)
 *   {{lageplan[eigen].name}}              mit Filter
 */

const r2 = (v: number) => Math.round(v * 100) / 100;
const r4 = (v: number) => Math.round(v * 10000) / 10000;
/** Kennzahl auf die Stellen der App gerundet (mindestens 3, nahe am Grenzwert mehr) */
const rk = (v: number, k: Kennzahl) => {
  const f = 10 ** kennzahlStellenVon(k);
  return Math.round(v * f) / f;
};
const opt = (v: number | undefined, f = r4): Value => (v === undefined ? '' : f(v));

const FILTERS: Record<string, (r: Row) => boolean> = {
  vollgeschoss: (r) => r.vollgeschoss === 'ja',
  oberirdisch: (r) => r.oberirdisch === 'ja',
  eigen: (r) => r.nachbar !== 'ja',
  nachbar: (r) => r.nachbar === 'ja',
  zaehlt: (r) => r._anrechnung === 'hauptanlage',
  zählt: (r) => r._anrechnung === 'hauptanlage',
  grz2: (r) => r._anrechnung === 'grz2',
  pruefen: (r) => r._anrechnung === 'pruefen',
  prüfen: (r) => r._anrechnung === 'pruefen',
  voll: (r) => r._versiegelung === 'voll',
  teil: (r) => r._versiegelung === 'teil',
  gruen: (r) => r._versiegelung === 'gruen',
  grün: (r) => r._versiegelung === 'gruen',
  aufenthalt: (r) => r._aufenthalt === 'ja' || r._aufenthalt === 'treppe',
  gf: (r) => r._gf === 'ja',
};

function zugehoerig(child: string, row: Row, parent: string, p: Row): boolean {
  if (parent === 'geschoss' && child === 'raum') return row._geschossId === p._id;
  if (parent === 'raum' && child === 'geschoss') return row._id === p._geschossId;
  return true;
}

function kennzahlWerte(prefix: string, k: Kennzahl | undefined, kurz: string): Record<string, Value> {
  return {
    [prefix]: k && k.wert !== undefined ? rk(k.wert, k) : '',
    [`${prefix}.stellen`]: k ? kennzahlStellenVon(k) : '',
    [`${prefix}.zulaessig`]: opt(k?.zulaessig),
    [`${prefix}.zulaessig_flaeche`]: opt(k?.zulaessigFlaeche, r2),
    [`${prefix}.flaeche`]: k ? r4(k.flaeche) : '',
    [`${prefix}.mit_offenen`]: k?.mitOffenen !== undefined ? rk(k.mitOffenen, k) : '',
    [`${prefix}.flaeche_mit_offenen`]: opt(k?.flaecheMitOffenen, r2),
    [`${prefix}.reserve`]: opt(k?.reserve, r2),
    [`${prefix}.status`]: k ? STATUS[k.status].label : '',
    [`${prefix}.vergleich`]: (k && flaechenVergleich(kurz, k)) ?? '',
  };
}

function absolutWerte(prefix: string, a: Nachweis['grAbsolut'], bezeichnung: string): Record<string, Value> {
  return {
    [`${prefix}.bezeichnung`]: a ? bezeichnung : '',
    [prefix]: a ? r2(a.flaeche) : '',
    [`${prefix}.zulaessig`]: a ? r2(a.zulaessig) : '',
    [`${prefix}.status`]: a ? STATUS[a.status].label : '',
  };
}

export function buildGrzContext(project: Project, date = new Date(), n: Nachweis = massNachweis(project)): ExportContext {
  const G = n.grundstueck.flaeche;
  const m = project.massNutzung ?? {};
  const scalars: Record<string, Value> = {
    ...projektWerte(project, date),
    'bplan.datum': m.planDatum ? datumText(m.planDatum) : '',
    'bplan.auslegung': m.auslegungDatum ? datumText(m.auslegungDatum) : '',
    'bplan.angabe': [bebauungsplanText(project.meta.bebauungsplan), m.planDatum ? `vom ${datumText(m.planDatum)}` : 'ohne Datum (aktuelles Recht)'].filter(Boolean).join(' '),
    gebietsart: m.gebietsart ?? '',
    'gebietsart.bezeichnung': m.gebietsart ? 'Baugebiet' : '',
    'gebietsart.text': m.gebietsart ? (GEBIETSARTEN.find((g) => g.id === m.gebietsart)?.label ?? m.gebietsart) : '',
    stand: m.stand ? datumText(m.stand) : '',
    'stand.text': m.stand ? `Stand ${datumText(m.stand)}` : '',
    ...absolutWerte('gr_absolut', n.grAbsolut, n.recht.baunvo === '1990' ? 'GR I (absolut)' : 'GR (absolut)'),
    ...absolutWerte('gr2_absolut', n.gr2Absolut, 'GR II absolut (§ 19 Abs. 4 S. 2)'),
    ...absolutWerte('gf_absolut', n.gfAbsolut, 'GF (absolut)'),
    'grundstueck.gemeinschaftsanlagen': opt(n.grundstueck.gemeinschaftsanlagen, r2),
    ...kennzahlWerte('bmz', n.bmz, 'BM'),
    'bmz.bezeichnung': n.bmz ? 'BMZ' : '',
    'bmz.text': n.bmz ? 'Baumasse (vereinfacht)' : '',
    'bmz.baumasse': n.bmz ? r2(n.baumasse) : '',
    'vollgeschosse.mindestens': n.vollgeschosse.mindestens ?? '',
    'vollgeschosse.zwingend': n.vollgeschosse.zwingend ? 'ja' : '',
    'baunvo.fassung': baunvoLabel(n.recht.baunvo),
    'bauo.fassung': bauoLabel(n.recht.bauo),
    'recht.hinweise': n.recht.hinweise.join(' '),
    // offene Spanne („prüfen“): zur GRZ II (1990) bzw. zur GRZ
    'grz.offen.bezeichnung': (n.grz2 ?? n.grz).mitOffenen !== undefined ? `${n.grz2 ? 'GRZ II' : 'GRZ'} mit ungeklärten Flächen („prüfen“)` : '',
    'grundstueck.flaeche_nachweis': opt(G, r4),
    'grundstueck.quelle': GRUNDSTUECK_QUELLE[n.grundstueck.quelle],
    gelaende: r2(n.gelaende.hoehe),
    'gelaende.quelle': GELAENDE_QUELLE[n.gelaende.quelle],
    'grz.bezeichnung': n.recht.baunvo === '1990' ? 'GRZ I' : 'GRZ',
    'grz.ii.bezeichnung': n.grz2 ? 'GRZ II (§ 19 Abs. 4)' : '',
    'aufenthalt.titel': n.aufenthaltZaehlt ? 'Aufenthaltsräume in Nicht-Vollgeschossen' : '',
    hauptanlage: r4(n.hauptanlage),
    ...kennzahlWerte('grz', n.grz, n.recht.baunvo === '1990' ? 'GR I' : 'GR'),
    ...kennzahlWerte('grz.ii', n.grz2, 'GR II'),
    'grz.offen.flaeche': opt((n.grz2 ?? n.grz).flaecheMitOffenen, r4),
    'lageplan.angerechnet_auf': n.grz2 ? 'GR II' : 'GR',
    'unterirdisch.flaeche': n.unterirdisch ? r2(n.unterirdisch.flaeche) : '',
    'unterirdisch.angerechnet': n.unterirdisch ? r2(n.unterirdisch.angerechnet) : '',
    'garagen.frei': opt(n.garagenFrei, r2),
    gf: r4(n.gf),
    'gf.aufenthalt': r2(n.gfAufenthalt),
    ...kennzahlWerte('gfz', n.gfz, 'GF'),
    vollgeschosse: n.vollgeschosse.anzahl,
    'vollgeschosse.roemisch': roemisch(n.vollgeschosse.anzahl),
    'vollgeschosse.zulaessig': n.vollgeschosse.zulaessig ?? '',
    'vollgeschosse.status': STATUS[n.vollgeschosse.status].label,
    'vollgeschosse.namen': n.geschosse
      .filter((g) => g.vollgeschoss)
      .map((g) => g.name)
      .join(', '),
    'bilanz.gebaeude': r2(n.bilanz.gebaeude),
    'bilanz.vollversiegelt': r2(n.bilanz.voll),
    'bilanz.teilversiegelt': r2(n.bilanz.teil),
    'bilanz.gruen': r2(n.bilanz.gruen),
    'bilanz.summe': r2(n.bilanz.summe),
    'bilanz.differenz': opt(n.bilanz.differenz, r2),
    hinweise: [...n.recht.hinweise, ...sachlicheHinweise(n)].join('\n'),
    haftung: HAFTUNG,
  };

  const geschoss: Row[] = n.geschosse.map((g, i) => {
    const gf = n.gfJeGeschoss.find((x) => x.storeyId === g.storeyId);
    return {
      _id: g.storeyId,
      nr: i + 1,
      name: g.name,
      ueber_gelaende: r2(g.ueberGelaende),
      gelaende: r2(g.gelaende.mittel),
      gelaende_min: r2(g.gelaende.min),
      gelaende_max: r2(g.gelaende.max),
      oberirdisch: g.oberirdisch ? 'ja' : '',
      anteil: g.oberirdisch ? r4(g.anteil) : '',
      anteil_soll: r4(g.anteilSoll),
      hoehe_soll: r2(g.hoeheSoll),
      flaeche_hoch: r2(g.flaecheHoch),
      bezugsflaeche: r2(g.bezugsflaeche),
      vollgeschoss: g.vollgeschoss ? 'ja' : '',
      ergebnis: g.vollgeschoss ? 'Vollgeschoss' : 'kein Vollgeschoss',
      festlegung: g.automatisch ? 'automatisch' : 'festgelegt',
      begruendung: g.begruendung,
      gf: r2(gf?.flaeche ?? 0),
      gf_art: gf ? GF_ART[gf.art] : '',
    };
  });

  // dieselben Nummern wie im Rechenweg (teil.flaeche_nr) und im Druck; Nachbarflächen ohne Nummer
  const nummern = flaechenNummern(n);
  const lageplan: Row[] = n.lageplan.map((l) => {
    const f = project.lageplan?.flaechen.find((x) => x.id === l.id);
    return {
      _anrechnung: l.anrechnung,
      _versiegelung: l.versiegelung,
      nr: nummern.get(l.id) ?? '',
      name: l.name,
      nutzung: nutzungLabel(l.nutzung),
      versiegelung: versiegelungInfo(l.versiegelung).label,
      flaeche: r2(l.flaeche),
      flaeche_aussen: r2(l.flaecheAussen),
      flaeche_eindeutig: r2(l.flaecheEindeutig),
      angerechnet: r2(l.angerechnet),
      angerechnet_bis: l.angerechnetBis !== undefined ? r2(l.angerechnetBis) : '',
      ueberlagert: r2(l.ueberlagert),
      anrechnung: l.nachbar ? 'Nachbar' : ANRECHNUNG[l.anrechnung],
      nachbar: l.nachbar ? 'ja' : '',
      hoehe: f?.hoehe !== undefined ? r2(f.hoehe) : '',
    };
  });

  const vg = new Map(n.geschosse.map((g) => [g.storeyId, g.vollgeschoss]));
  let nr = 0;
  const raum: Row[] = project.storeys
    .filter((s) => vg.has(s.id))
    .flatMap((s) =>
      s.shapes
        .filter((r): r is RoomShape => r.kind === 'room' && !r.subtract)
        .map((r) => {
          // vor 1990 aus der Prüfung nach Nutzung und lichter Höhe, sonst nach Nutzung
          const pr = n.raeume.find((x) => x.roomId === r.id);
          const a = pr?.ergebnis ?? istAufenthaltsraum(r);
          return {
            _geschossId: s.id,
            _aufenthalt: a,
            // vor 1990 (1990 bei Festsetzung nach § 20 Abs. 3 S. 2) zählen Aufenthaltsräume in Nicht-Vollgeschossen zur Geschossfläche
            _gf: n.aufenthaltZaehlt && !vg.get(s.id) ? 'ja' : '',
            nr: ++nr,
            geschoss: s.name,
            vollgeschoss: vg.get(s.id) ? 'ja' : '',
            nummer: r.nummer,
            name: r.name,
            flaeche: r2(polygonArea(r.points)),
            aufenthalt: AUFENTHALT[a],
            festlegung: r.aufenthalt ? 'festgelegt' : 'automatisch',
            begruendung: pr?.begruendung ?? '',
            hoehenlage: raumBodenVersatz(r, s) ? r2(raumBodenVersatz(r, s)) : '',
          };
        }),
    );

  // nur sachliche Hinweise (Bedienhinweise bleiben in der App)
  // Rechenweg: Formelzeilen und Teilflächen (Länge × Breite × Faktor; ohne Zerlegung die Fläche aus Koordinaten × 1 × 1)
  const rw = rechenweg(n, nummern);
  const formel: Row[] = rw.formeln.map((text, i) => ({ nr: i + 1, text }));
  const teil: Row[] = rw.flaechen.flatMap((f) =>
    f.zerlegung.zerlegt
      ? f.zerlegung.teile.map((t, i) => ({
          flaeche_nr: f.nr,
          flaeche_name: f.name,
          name: teilName(f.nr, i, t),
          art: t.art === 'rechteck' ? 'Rechteck' : 'Dreieck',
          laenge: r4(t.laenge),
          breite: r4(t.breite),
          faktor: t.faktor,
          flaeche: r4(t.flaeche),
        }))
      : [
          {
            flaeche_nr: f.nr,
            flaeche_name: f.name,
            name: `${f.nr} Fläche aus Koordinaten`,
            art: 'Koordinaten',
            laenge: r4(f.zerlegung.flaeche),
            breite: 1,
            faktor: 1,
            flaeche: r4(f.zerlegung.flaeche),
          },
        ],
  );

  const hinweis: Row[] = [...n.recht.hinweise, ...sachlicheHinweise(n)].map((text, i) => ({ nr: i + 1, text }));

  return {
    scalars,
    collections: { geschoss, lageplan, raum, hinweis, formel, teil },
    byName: { geschoss: new Map(geschoss.map((g) => [String(g.name), g])) },
    filters: FILTERS,
    belongsTo: zugehoerig,
  };
}
