import { raumBodenVersatz } from '@core/calc';
import type { ExportContext, PlaceholderDocs, Row, Value } from '@core/excel/context';
import { PROJEKT_DOCS, projektWerte } from '@core/excel/projekt';
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
 * Datengrundlage für Excel-Export und Vorlagen des GRZ-Nachweises (Syntax siehe docs/excel-vorlagen.md).
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
    ...absolutWerte('gr2_absolut', n.gr2Absolut, 'GR II (1,5 × GR)'),
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

/** Beschreibung aller Platzhalter – Grundlage für Hilfe-Tabelle und Musterdatei. */
export const GRZ_PLACEHOLDER_DOCS: PlaceholderDocs = [
  {
    group: 'Blöcke, Filter, Modifikatoren',
    keys: [
      ['#geschoss … /geschoss', 'Zeilenblock je Geschoss; raum-Zeilen darin nur für dieses Geschoss'],
      [
        '#wenn … /wenn',
        'Abschnitt einmal ausgeben, wenn die Bedingung zutrifft: {{#wenn lageplan[nachbar]}} (Datensätze vorhanden), {{#wenn grz.ii}} (Wert nicht 0/leer), {{#wenn grz.reserve<0}} (Vergleich), {{#wenn !…}} umgekehrt; im Block je Datensatz',
      ],
      ['geschoss[vollgeschoss] / geschoss[!vollgeschoss] / [oberirdisch]', 'Filter: Vollgeschosse, Nicht-Vollgeschosse, oberirdische Geschosse'],
      ['lageplan[eigen] / lageplan[nachbar]', 'Filter: Flächen des eigenen Grundstücks bzw. der Nachbarn'],
      ['lageplan[zaehlt] / [grz2] / [pruefen]', 'Filter nach Anrechnung auf die Grundfläche'],
      ['lageplan[voll] / [teil] / [gruen]', 'Filter nach Versiegelung'],
      ['raum[aufenthalt]', 'Filter: Aufenthalts- und Treppenräume'],
      ['raum[gf]', 'Filter: Räume der Nicht-Vollgeschosse, deren Aufenthaltsräume zur Geschossfläche zählen (vor 1990, 1990 nur bei Festsetzung nach § 20 Abs. 3 S. 2)'],
      ['[feld=wert] [feld>wert] [!filter]', 'weitere Filter, mehrere mit Komma: raum[aufenthalt,vollgeschoss!=ja]; Vergleiche = != > < >= <= (leere Felder = 0)'],
      ['…|einmal', 'Wert nur in der ersten Zeile der Wiederholung'],
    ],
  },
  PROJEKT_DOCS,
  {
    group: 'Grundlagen',
    keys: [
      ['bplan.datum', 'Datum des Bebauungsplans (TT.MM.JJJJ)'],
      ['bplan.auslegung', 'öffentliche Auslegung des Planentwurfs (TT.MM.JJJJ), maßgebend für die BauNVO-Fassung – leer, wenn nicht eingetragen'],
      ['bplan.angabe', 'Nr., Name und Datum in einer Zeile: „Nr. 112 „Am Hang“ vom 14.03.1967“'],
      ['gebietsart, gebietsart.text', 'Baugebiet: Kürzel (WA, MI …) bzw. mit Bezeichnung'],
      ['stand, stand.text', 'Stand des Nachweises (im Druckdialog eingetragen) bzw. „Stand TT.MM.JJJJ“ – leer, wenn nicht eingetragen'],
      ['baunvo.fassung, bauo.fassung', 'angewandte BauNVO-Fassung und Vollgeschossbegriff'],
      ['recht.hinweise', 'Hinweise zur Wahl der Fassung'],
      ['grundstueck.flaeche_nachweis, grundstueck.quelle', 'maßgebende Grundstücksfläche [m²] und Herkunft'],
      ['gelaende, gelaende.quelle', 'Geländeoberfläche [m] über ±0,00 und Herkunft'],
      ['hauptanlage', 'Grundfläche der Hauptanlage [m²]'],
    ],
  },
  {
    group: 'Kennzahlen',
    keys: [
      ['grz.bezeichnung, grz.ii.bezeichnung', '„GRZ“ (vor 1990) bzw. „GRZ I“; „GRZ II (§ 19 Abs. 4)“ oder leer'],
      ['aufenthalt.titel', '„Aufenthaltsräume in Nicht-Vollgeschossen“, wenn sie zur Geschossfläche zählen (vor 1990, 1990 bei Festsetzung nach § 20 Abs. 3 S. 2), sonst leer'],
      ['grz, grz.zulaessig, grz.flaeche, grz.reserve, grz.status', 'GRZ (auf die Stellen der App gerundet), zulässig, angerechnete Grundfläche [m²], Reserve [m²], Ergebnis'],
      ['grz.stellen', 'Nachkommastellen der Kennzahl (mindestens 3, nahe am Grenzwert mehr)'],
      ['grz.zulaessig_flaeche, grz.vergleich', 'zulässige Grundfläche [m²]; Begründung in m², z. B. „GR 135,00 m² < 245,00 m² zulässig“'],
      ['grz.mit_offenen, grz.flaeche_mit_offenen', 'GRZ bzw. Grundfläche einschließlich der ungeklärten Flächen („prüfen“)'],
      ['grz.offen.bezeichnung, grz.offen.flaeche', '„GRZ II mit ungeklärten Flächen („prüfen“)“ (bzw. GRZ) und die Fläche dazu – leer ohne ungeklärte Flächen'],
      ['unterirdisch.flaeche, unterirdisch.angerechnet', 'Kellergeschoss außerhalb der Hauptanlage [m²] und davon angerechnet'],
      ['grz.ii, grz.ii.zulaessig, grz.ii.flaeche, grz.ii.reserve, grz.ii.status, grz.ii.mit_offenen', 'GRZ II nach § 19 Abs. 4 BauNVO 1990 (sonst leer)'],
      ['garagen.frei', 'anrechnungsfreie Garagenfläche nach § 21a Abs. 3 (1968/1977) [m²]'],
      [
        'gr_absolut, gr_absolut.zulaessig, gr_absolut.status, gr_absolut.bezeichnung',
        'absolute Festsetzung der Grundfläche: vorhanden, zulässig [m²], Ergebnis (leer ohne Festsetzung); ebenso gf_absolut und gr2_absolut (BauNVO 1990: GR II höchstens 1,5 × GR, höchstens GRZ 0,8)',
      ],
      ['grundstueck.gemeinschaftsanlagen', 'hinzugerechneter Anteil an Gemeinschaftsanlagen nach § 21a Abs. 2 BauNVO [m²] (leer ohne)'],
      ['bmz, bmz.zulaessig, bmz.status, bmz.baumasse', 'Baumassenzahl (§ 21) und Baumasse [m³], vereinfacht aus Grundfläche × Geschosshöhe der Vollgeschosse'],
      ['vollgeschosse.mindestens, vollgeschosse.zwingend', 'Mindestzahl der Vollgeschosse; „ja“, wenn die Zahl zwingend ist'],
      ['gf, gf.aufenthalt', 'Geschossfläche [m²]; davon Aufenthaltsräume in Nicht-Vollgeschossen'],
      ['gfz, gfz.zulaessig, gfz.reserve, gfz.status, gfz.vergleich', 'GFZ, zulässig, Reserve [m²], Ergebnis, Begründung in m²'],
      ['vollgeschosse, vollgeschosse.roemisch, vollgeschosse.zulaessig, vollgeschosse.status', 'Zahl der Vollgeschosse'],
      ['vollgeschosse.namen', 'Namen der Vollgeschosse, mit Komma getrennt'],
      ['bilanz.gebaeude, bilanz.vollversiegelt, bilanz.teilversiegelt, bilanz.gruen, bilanz.summe', 'Flächenbilanz des Grundstücks [m²]'],
      ['bilanz.differenz', 'Grundstücksfläche − Summe (nicht erfasst bzw. überlappend) [m²]'],
      ['hinweise, haftung', 'Hinweise für die Bauaufsicht (eine Zelle, ohne Bedienhinweise); Haftungshinweis des Tools'],
    ],
  },
  {
    group: 'geschoss.* (Zeile je Geschoss) bzw. geschoss:NAME.*',
    keys: [
      ['geschoss.nr, geschoss.name', 'laufende Nummer, Bezeichnung'],
      ['geschoss.ueber_gelaende, geschoss.oberirdisch', 'Deckenoberkante über Gelände im Mittel [m]; „ja“ bei oberirdischen Geschossen'],
      ['geschoss.gelaende, geschoss.gelaende_min, geschoss.gelaende_max', 'Geländeoberfläche entlang der Außenwände des Geschosses: Mittel, tiefster und höchster Punkt [m]'],
      ['geschoss.anteil, geschoss.anteil_soll, geschoss.hoehe_soll', 'Anteil mit der geforderten Höhe, geforderter Anteil, geforderte Höhe [m]'],
      ['geschoss.flaeche_hoch, geschoss.bezugsflaeche', 'Fläche mit der geforderten Höhe, Bezugsfläche [m²]'],
      ['geschoss.vollgeschoss, geschoss.ergebnis, geschoss.festlegung', '„ja“ bei Vollgeschossen; Ergebnis als Text; automatisch oder festgelegt'],
      ['geschoss.begruendung', 'Begründung der Vollgeschossprüfung'],
      ['geschoss.gf, geschoss.gf_art', 'Geschossfläche des Geschosses [m²] und wie sie ermittelt wurde'],
    ],
  },
  {
    group: 'lageplan.* (Zeile je Lageplan-Fläche)',
    keys: [
      ['lageplan.nr, lageplan.name, lageplan.nutzung, lageplan.versiegelung', 'laufende Nummer, Bezeichnung, Nutzung, Versiegelung'],
      ['lageplan.flaeche, lageplan.flaeche_aussen', 'Fläche und davon außerhalb des Gebäudes [m²]'],
      ['lageplan.flaeche_eindeutig, lageplan.ueberlagert', 'nur dieser Fläche zugeordnet (Summen zählen Überlagerungen einmal) bzw. von anderen Flächen schon abgedeckt [m²]'],
      ['lageplan.angerechnet, lageplan.angerechnet_bis', 'tatsächlich auf die Grundfläche angerechnet (GR II bzw. GR) [m²]; bei „prüfen“ bis zu dieser Fläche'],
      ['lageplan.angerechnet_auf', '„GR II“ (BauNVO 1990) bzw. „GR“ – Einzelwert für die Spaltenüberschrift'],
      ['lageplan.anrechnung', 'Anrechnung auf die Grundfläche (zählt, GRZ II, bis 0,1 frei, zählt nicht, prüfen, Nachbar)'],
      ['lageplan.nachbar, lageplan.hoehe', '„ja“ bei Nachbargrundstücken; Höhe der Oberfläche [m]'],
    ],
  },
  {
    group: 'raum.* (Zeile je Raum) und hinweis.*',
    keys: [
      ['raum.nr, raum.geschoss, raum.nummer, raum.name, raum.flaeche', 'Raumangaben, Fläche ohne Putzabzug [m²]'],
      ['raum.vollgeschoss', '„ja“, wenn der Raum in einem Vollgeschoss liegt'],
      ['raum.aufenthalt, raum.festlegung', 'Aufenthaltsraum, Treppenraum oder kein Aufenthaltsraum; automatisch oder festgelegt'],
      ['raum.begruendung', 'Prüfung nach Nutzung und lichter Höhe (vor 1990, Nicht-Vollgeschosse)'],
      ['raum.hoehenlage', 'Höhenlage des Fußbodens gegenüber dem Geschoss [m] (Split-Level)'],
      ['hinweis.nr, hinweis.text', 'Zeile je Hinweis für die Bauaufsicht'],
      ['formel.text', 'Zeile je Formel des Rechenwegs, z. B. „GRZ I = GR I / FGst = 135,00 m² / 612,50 m² = 0,220“'],
      ['teil.flaeche_nr, teil.flaeche_name, teil.name, teil.art', 'Zeile je Teilfläche (H = Hauptanlage): Nummer und Name der Fläche, „1.2 Rechteck“, Rechteck/Dreieck/Koordinaten'],
      ['teil.laenge, teil.breite, teil.faktor, teil.flaeche', 'Länge bzw. Grundseite, Breite bzw. Höhe [m], Faktor (1 Rechteck, 0,5 Dreieck), Fläche [m²] – ohne Zerlegung Fläche × 1 × 1'],
    ],
  },
];
