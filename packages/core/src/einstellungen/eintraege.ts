import { GLOBALE_VARIABLEN, modernisieren } from '../platzhalter';
import { VORGABE_OAP_PFAD } from '../projektdatei';
import {
  ATLAS_NUMMER,
  ATLAS_PLAN,
  ATLAS_PROJEKT,
  ATLAS_VORLAGE,
  EXPORT_VARIABLEN,
  FABRIO_LV,
  FABRIO_RECHNUNG,
  KATASTER_VARIABLEN,
  KATASTER_ZIEL_VARIABLEN,
  ORDNER_VARIABLEN,
  PERMIO_NAMEN,
  PERMIO_ZIEL,
} from './variablen';
import { APP_NAMEN } from '../appNamen';
import { abweichungId, EXPORT_APPS, gemeinsamId, gemeinsamSpeicher, VORGABE_EXPORT_DATEINAME, VORGABE_GEMEINSAMER_BERECHNUNGSORDNER, VORGABE_UNTERORDNER, type ExportApp } from './gemeinsam';
import { inPfade, unterSchluessel, type PfadEinstellung, type PfadSpeicher } from './verzeichnis';
import { antragsordnerSpeicher, VORGABE_ZIELORDNER, zielSpeicher } from './zielordner';

/**
 * Alle zentralen Pfad- und Namenseinstellungen. Vorhandene Werte bleiben unter ihrem bisherigen Schlüssel
 * (`unterSchluessel`), damit die Apps sie unverändert weiter lesen; neue liegen in `allgemein.json` unter `pfade`
 * (`inPfade`). Vorgaben müssen denen der Apps gleichen (Tests in eintraege.test.ts).
 */

/** Die Struktur von ATLAS legt nur ATLAS vollständig an (mit Ordnern und Presets) */
const OHNE_STRUKTUR = 'Die Ordnerstruktur von ATLAS ist noch nicht angelegt oder nicht lesbar – bitte zuerst ATLAS öffnen (Einrichtung › Struktur).';

/**
 * Wert neben der Struktur von ATLAS (oberste Ebene von projektordner.json): geschrieben wird nur, wenn die Struktur
 * lesbar ist – sonst ersetzte das Schreiben einen unlesbaren Inhalt ungesichert (ATLAS sichert und sperrt dann selbst).
 */
function nebenStruktur(speicher: PfadSpeicher): PfadSpeicher {
  return {
    ...speicher,
    schreiben: (roh, wert) => {
      const struktur = roh.struktur;
      if (!struktur || typeof struktur !== 'object' || Array.isArray(struktur)) throw new Error(OHNE_STRUKTUR);
      return speicher.schreiben(roh, wert);
    },
  };
}

/** Ordner zwischen dem Ordner der Gewerke und seinen Unterordnern (FABRIO) */
const GEWERK = { text: 'je Gewerk ein Ordner', beispiel: 'G08 Fenster' };

/** Vorgaben, die auch die Apps brauchen */
export const VORGABE_FOTOORDNER = '09 Fotos';
export { VORGABE_BERECHNUNGSORDNER, VORGABE_EXPORT_DATEINAME } from './gemeinsam';
/** Beispiele für {Inhalt} je App (Vorschau) */
const INHALT = { flaechenrechner: 'Flächenaufstellung', grz: 'GRZ-Nachweis', kosten: 'Kostenschätzung' } as const;

/** Muster der Rechnungsdateien in FABRIO (das erste für neue Dateien) */
export const VORGABE_RECHNUNGSMUSTER = [
  '{PROJEKT_KUERZEL} R{Nr:3} {Firma} {Rechnungsdatum} {Art}{Lfd}',
  '{PROJEKT_KUERZEL} {Rechnungsdatum} {Lfd}.{Art} Fa. {Firma}',
  '{PROJEKT_KUERZEL} {Rechnungsdatum} {Art}{Lfd} {Firma}',
];

/** Vorgaben von PERMIO (bis 0.58 nur je Rechner im Browser-Speicher unter „formulare:export“) */
export const VORGABE_PERMIO = {
  antragsordner: 'TÖB',
  namensvorlage: '{PROJEKT_KUERZEL} {Art} {DATUM} {Nr} {Name}',
  zielpfad: 'TÖB/{Antrag}',
  berechnungsordner: 'Planung/Berechnungen',
  vorlagenordner: '',
} as const;

/** Beispiel für {Inhalt} in der gemeinsamen Vorschau */
const INHALT_GEMEINSAM = 'Flächenaufstellung';

/** gemeinsame Angaben des direkten Exports (QUADRIO, TERRIO, NUMIO) mit Abweichung je App – `gemeinsam.ts` */
const exportEintraege = (): PfadEinstellung[] => {
  const name = (a: ExportApp) => APP_NAMEN[a].name;
  const dateiname = (g: 'excel' | 'pdf'): PfadEinstellung[] => {
    const art = g === 'excel' ? 'Excel' : 'PDF';
    const endung = g === 'excel' ? '.xlsx' : '.pdf';
    return [
      {
        id: gemeinsamId(g),
        bezug: { art: 'eintrag', id: gemeinsamId('ordner'), zwischen: { text: 'Unterordner der App', beispiel: VORGABE_UNTERORDNER.flaechenrechner } },
        apps: [...EXPORT_APPS],
        thema: 'export',
        art: 'name',
        bezeichnung: `Dateiname ${art}-Export`,
        erklaerung: `Name der ${art}-Datei beim Export, ohne Endung – für QUADRIO, TERRIO und NUMIO. {Inhalt} sagt, was exportiert wird.`,
        vorgabe: VORGABE_EXPORT_DATEINAME,
        variablen: EXPORT_VARIABLEN,
        beispiel: { Inhalt: INHALT_GEMEINSAM },
        endung,
        pflicht: true,
        speicher: gemeinsamSpeicher(g),
      },
      ...EXPORT_APPS.map(
        (a): PfadEinstellung => ({
          id: abweichungId(g, a),
          bezug: { art: 'eintrag', id: abweichungId('ordner', a) },
          apps: [a],
          thema: 'export',
          art: 'name',
          bezeichnung: `Abweichend für ${name(a)}`,
          erklaerung: `Eigener Name der ${art}-Datei für ${name(a)}; leer = der gemeinsame.`,
          vorgabe: '',
          variablen: EXPORT_VARIABLEN,
          beispiel: { Inhalt: INHALT[a] },
          endung,
          abweichungVon: { id: gemeinsamId(g), art: 'ersetzt' },
          speicher: gemeinsamSpeicher(g, a),
        }),
      ),
    ];
  };
  return [
    {
      id: gemeinsamId('ordner'),
      bezug: { art: 'projekt' },
      apps: [...EXPORT_APPS],
      thema: 'export',
      art: 'pfad',
      bezeichnung: 'Berechnungsordner',
      erklaerung:
        'Ziel des direkten Exports (Excel und PDF) von QUADRIO, TERRIO und NUMIO, relativ zum Projektordner; darin je App ein Unterordner. Leer = der Projektordner selbst. Fehlt der Ordner, wird er beim Export angelegt. PERMIO sucht hier Berechnungen.',
      vorgabe: VORGABE_GEMEINSAMER_BERECHNUNGSORDNER,
      variablen: ORDNER_VARIABLEN,
      speicher: gemeinsamSpeicher('ordner'),
    },
    ...EXPORT_APPS.map(
      (a): PfadEinstellung => ({
        id: abweichungId('ordner', a),
        bezug: { art: 'eintrag', id: gemeinsamId('ordner') },
        apps: [a],
        thema: 'export',
        art: 'pfad',
        bezeichnung: `Unterordner für ${name(a)}`,
        erklaerung: 'Im gemeinsamen Berechnungsordner; leer = direkt darin.',
        vorgabe: VORGABE_UNTERORDNER[a],
        variablen: ORDNER_VARIABLEN,
        abweichungVon: { id: gemeinsamId('ordner'), art: 'unterordner' },
        speicher: gemeinsamSpeicher('ordner', a),
      }),
    ),
    ...dateiname('excel'),
    ...dateiname('pdf'),
  ];
};

export const PFAD_EINSTELLUNGEN: PfadEinstellung[] = [
  /* ---------- Projekt ---------- */
  {
    id: 'projekt.stammordner',
    bezug: { art: 'absolut' },
    apps: ['ordner', 'formulare', 'flaechenrechner', 'grz', 'kosten', 'entzerrung', 'ava', 'baurecht'],
    thema: 'projekt',
    art: 'liste',
    zeilen: 'ordner',
    bezeichnung: 'Stammordner der Projekte',
    erklaerung:
      'Ordner mit den Projektordnern, je Zeile einer – in dieser Reihenfolge in der Projektübersicht aller Apps. Im ersten entstehen neue Projekte. Projekte in Gruppen-, Akquise- und Archivordnern darin werden mit erfasst.',
    vorgabe: [],
    // bisheriger Schlüssel aller Apps (ProjektWahl, ATLAS, PERMIO) – nichts zu übernehmen
    speicher: unterSchluessel('allgemein', 'projekte', 'liste', []),
  },
  {
    id: 'projekt.nummernschema',
    bezug: { art: 'frei', text: 'Teil des Namens des Projektordners ({PROJEKT_KUERZEL}) – kein Pfad' },
    apps: ['ordner'],
    thema: 'projekt',
    art: 'name',
    bezeichnung: 'Projektnummer',
    erklaerung: 'Schema, nach dem ATLAS die nächste freie Projektnummer vorschlägt.',
    vorgabe: '{JAHR}-{Nr:3}',
    variablen: ATLAS_NUMMER,
    beispiel: { Nr: 7 },
    pflicht: true,
    speicher: unterSchluessel('projektordner', 'struktur.nummernschema', 'name', '{JAHR}-{Nr:3}', OHNE_STRUKTUR),
  },
  {
    id: 'projekt.ordnername',
    bezug: { art: 'eintrag', id: 'projekt.stammordner' },
    apps: ['ordner', 'formulare', 'flaechenrechner', 'grz', 'kosten', 'entzerrung', 'ava'],
    thema: 'projekt',
    art: 'name',
    bezeichnung: 'Name des Projektordners',
    erklaerung: 'So heißen neue Projektordner. Alle Apps lesen Nummer und Kurzname eines Projekts nach diesem Schema aus dem Ordnernamen.',
    vorgabe: '{PROJEKT_KUERZEL} {PROJEKT_KURZNAME}',
    variablen: ATLAS_PROJEKT,
    pflicht: true,
    speicher: unterSchluessel('projektordner', 'struktur.ordnername', 'name', '{PROJEKT_KUERZEL} {PROJEKT_KURZNAME}', OHNE_STRUKTUR),
    // gespiegelt für alle Apps (wie ATLAS es selbst tut)
    auch: { bereich: 'allgemein', schluessel: 'ordnerSchema' },
  },
  {
    id: 'projekt.oapPfad',
    bezug: { art: 'projekt' },
    apps: ['ordner', 'formulare', 'flaechenrechner', 'grz', 'kosten', 'entzerrung', 'ava', 'baurecht'],
    thema: 'projekt',
    art: 'pfad',
    bezeichnung: 'Projektdatei (.oap) in neuen Projekten',
    erklaerung: 'Ort und Name der Projektdatei im Projektordner. Die Endung .oap wird ergänzt, wenn sie fehlt.',
    vorgabe: VORGABE_OAP_PFAD,
    variablen: GLOBALE_VARIABLEN,
    pflicht: true,
    speicher: unterSchluessel('allgemein', 'oapPfad', 'pfad', VORGABE_OAP_PFAD),
  },

  /* ---------- Ablage ---------- */
  {
    id: 'ablage.fotoordner',
    bezug: { art: 'projekt' },
    apps: ['entzerrung', 'ava', 'ordner'],
    thema: 'ablage',
    art: 'pfad',
    bezeichnung: 'Fotoordner',
    erklaerung: 'Ordner der Fotos im Projekt; RECTIO und das Bautagebuch in FABRIO durchsuchen ihn mit allen Unterordnern.',
    vorgabe: VORGABE_FOTOORDNER,
    pflicht: true,
    speicher: unterSchluessel('allgemein', 'fotoordner', 'pfad', VORGABE_FOTOORDNER),
  },
  {
    id: 'ablage.permio.antragsordner',
    bezug: { art: 'projekt' },
    apps: ['formulare'],
    thema: 'ablage',
    art: 'pfad',
    bezeichnung: 'Antragsordner',
    erklaerung: 'Ordner der Anträge im Projektordner; darin je Antragsfassung ein Unterordner (z. B. „BAUA 2“).',
    vorgabe: VORGABE_PERMIO.antragsordner,
    pflicht: true,
    // der feste Zielordner zieht mit (zielordner.ts)
    speicher: antragsordnerSpeicher(),
    projektwert: 'Je Projekt in PERMIO abweichend einstellbar (Antrag › Export für dieses Projekt).',
  },
  {
    id: 'ablage.permio.berechnungsordner',
    bezug: { art: 'projekt' },
    apps: ['formulare'],
    thema: 'ablage',
    art: 'liste',
    zeilen: 'pfad',
    bezeichnung: 'PERMIO sucht Berechnungen außerdem in',
    erklaerung:
      'Berechnungen und Nachweise, die als externe Dokumente zum Antrag gehören, sucht PERMIO immer in den Berechnungsordnern von QUADRIO, TERRIO und NUMIO (siehe „Export“). Hier weitere Ordner, je Zeile einer, relativ zum Projektordner; Platzhalter mit den Angaben des Projekts.',
    vorgabe: [VORGABE_PERMIO.berechnungsordner],
    variablen: ORDNER_VARIABLEN,
    speicher: inPfade('ablage.permio.berechnungsordner', 'liste'),
  },
  {
    id: 'ablage.kataster.zielpfad',
    bezug: { art: 'projekt' },
    apps: ['ordner'],
    thema: 'ablage',
    art: 'pfad',
    bezeichnung: 'Ablageordner der Katasterpläne',
    erklaerung: 'Fester Ordner im Projekt, wenn Katasterpläne nicht im Ordner der aktiven Antragsfassung abgelegt werden.',
    vorgabe: 'Kataster',
    variablen: KATASTER_ZIEL_VARIABLEN,
    beispiel: { Antrag: 'BAUA 2' },
    pflicht: true,
    speicher: unterSchluessel('kataster', 'zielpfad', 'pfad', 'Kataster'),
  },
  {
    id: 'ablage.fabrio.gewerke',
    bezug: { art: 'projekt' },
    apps: ['ava'],
    thema: 'ablage',
    art: 'pfad',
    bezeichnung: 'Ordner der Gewerke',
    erklaerung: 'Darin je Gewerk ein Ordner wie „G08 Fenster“ (Kennung G und Nummer, dann die Bezeichnung).',
    vorgabe: 'Gewerke',
    pflicht: true,
    speicher: unterSchluessel('ava', 'ablage.gewerke', 'pfad', 'Gewerke'),
  },
  {
    id: 'ablage.fabrio.lv',
    bezug: { art: 'eintrag', id: 'ablage.fabrio.gewerke', zwischen: GEWERK },
    apps: ['ava'],
    thema: 'ablage',
    art: 'pfad',
    bezeichnung: 'LV-Dateien im Unterordner',
    erklaerung: 'Unterordner im Gewerkeordner; leer = direkt im Gewerkeordner.',
    vorgabe: '',
    speicher: unterSchluessel('ava', 'ablage.lv', 'pfad', ''),
  },
  {
    id: 'ablage.fabrio.auftrag',
    bezug: { art: 'eintrag', id: 'ablage.fabrio.gewerke', zwischen: GEWERK },
    apps: ['ava'],
    thema: 'ablage',
    art: 'pfad',
    bezeichnung: 'Aufträge und Rechnungen',
    erklaerung: 'Unterordner im Gewerkeordner.',
    vorgabe: 'Auftrag',
    pflicht: true,
    speicher: unterSchluessel('ava', 'ablage.auftrag', 'pfad', 'Auftrag'),
  },
  {
    id: 'ablage.fabrio.korrespondenz',
    bezug: { art: 'eintrag', id: 'ablage.fabrio.gewerke', zwischen: GEWERK },
    apps: ['ava'],
    thema: 'ablage',
    art: 'pfad',
    bezeichnung: 'Mailverkehr des Gewerks',
    erklaerung: 'Unterordner im Gewerkeordner.',
    vorgabe: 'Korrespondenz',
    pflicht: true,
    speicher: unterSchluessel('ava', 'ablage.korrespondenz', 'pfad', 'Korrespondenz'),
  },
  {
    id: 'ablage.fabrio.archive',
    bezug: { art: 'suche', text: 'Ordnernamen – gelten in jedem Gewerk und Auftragsordner, bei Kostenkontrolle und Mails im ganzen Projekt' },
    apps: ['ava'],
    thema: 'ablage',
    art: 'liste',
    bezeichnung: 'Archivordner',
    erklaerung: 'Ordnernamen, je Zeile einer; gelten im Gewerk und im Auftragsordner.',
    vorgabe: ['Archiv', '_archiv'],
    speicher: unterSchluessel('ava', 'ablage.archive', 'liste', ['Archiv', '_archiv']),
  },
  {
    id: 'ablage.fabrio.bauleitung',
    bezug: { art: 'projekt' },
    apps: ['ava'],
    thema: 'ablage',
    art: 'pfad',
    bezeichnung: 'Bauleitung (Protokolle, Bautagebuch)',
    erklaerung: 'Ordner im Projekt; darin legt FABRIO Bautagebuch, Protokolle und Mängel ab.',
    vorgabe: 'Bauleitung',
    pflicht: true,
    speicher: unterSchluessel('ava', 'ablage.bauleitung', 'pfad', 'Bauleitung'),
  },
  {
    id: 'ablage.fabrio.mailOrdner',
    bezug: { art: 'suche', text: 'Ordnernamen – FABRIO sucht sie überall im Projekt (außer im Ordner der Gewerke)' },
    apps: ['ava'],
    thema: 'ablage',
    art: 'liste',
    bezeichnung: 'Weitere Mailordner des Projekts',
    erklaerung: 'Ordnernamen, je Zeile einer.',
    vorgabe: ['Korrespondenz'],
    speicher: unterSchluessel('ava', 'ablage.mailOrdner', 'liste', ['Korrespondenz']),
  },
  {
    id: 'ablage.fabrio.kostenkontrolle',
    bezug: { art: 'suche', text: 'Teil des Dateinamens – FABRIO sucht im ganzen Projekt' },
    apps: ['ava'],
    thema: 'ablage',
    art: 'name',
    bezeichnung: 'Kostenkontrolle (Teil des Dateinamens)',
    erklaerung: 'FABRIO sucht im ganzen Projekt Excel-Dateien, deren Name diesen Text enthält; „AKTUELL“ bzw. das jüngste Datum im Namen gewinnt.',
    vorgabe: 'Kostenkontrolle',
    pflicht: true,
    speicher: unterSchluessel('ava', 'ablage.kostenkontrolle', 'name', 'Kostenkontrolle'),
    projektwert: 'Je Projekt lässt sich in FABRIO (Übersicht) eine andere Datei wählen; sie steht in der Projektdatei.',
  },

  /* ---------- Pläne und Dokumente ---------- */
  {
    id: 'plaene.dateischema',
    bezug: { art: 'frei', text: 'Gilt in den Planordnern der Struktur von ATLAS (Einrichtung › Struktur, Ordner mit Dateischema)' },
    apps: ['ordner'],
    thema: 'plaene',
    art: 'name',
    bezeichnung: 'Dateinamen der Pläne',
    erklaerung: 'Schema für Pläne in den Planordnern der Struktur (Ordner mit Dateischema).',
    vorgabe: '{PROJEKT_KUERZEL}_{Plannummer}_{Index}_{Titel}',
    variablen: ATLAS_PLAN,
    beispiel: { Plannummer: 'GP-04', Index: 'a', Titel: 'Grundriss OG' },
    endung: '.pdf',
    pflicht: true,
    speicher: unterSchluessel('projektordner', 'struktur.dateischema', 'name', '{PROJEKT_KUERZEL}_{Plannummer}_{Index}_{Titel}', OHNE_STRUKTUR),
    projektwert: 'Jede Projektdatei trägt eine Kopie – für bestehende Projekte gilt deren Schema.',
  },
  {
    id: 'plaene.permio.namensvorlage',
    bezug: { art: 'eintrag', id: 'ablage.permio.antragsordner', zwischen: { text: 'Ordner der aktiven Antragsfassung', beispiel: 'BAUA 2' } },
    apps: ['formulare'],
    thema: 'ablage',
    art: 'name',
    bezeichnung: 'Dateinamen exportierter Antragsdokumente (PDF)',
    erklaerung: 'Die Antragsart ({Art}) kommt immer aus dem aktiven Antrag – „BAUA 2“ → BAUA.',
    vorgabe: VORGABE_PERMIO.namensvorlage,
    variablen: PERMIO_NAMEN,
    beispiel: { Art: 'BAUA', Nr: '01', Name: 'Bauantrag', Antrag: 'BAUA 2', Formular: '005-Bauantrag (2026)', Kennung: 'nw010005', Stand: '2026A' },
    endung: '.pdf',
    pflicht: true,
    speicher: inPfade('plaene.permio.namensvorlage', 'name'),
    projektwert: 'Je Projekt in PERMIO abweichend einstellbar (Antrag › Export für dieses Projekt).',
    hinweise: (v) =>
      /^\{PROJEKT_KUERZEL\}\s+\{Art\}\s+\{DATUM\}\s/.test(modernisieren(v, PERMIO_NAMEN))
        ? []
        : [
            'Dateien im Antragsordner müssen mit „Projektcode Antragsart JJMMTT“ beginnen, sonst lassen sie sich nicht als bereit markieren – die Vorlage sollte mit „{PROJEKT_KUERZEL} {Art} {DATUM}“ beginnen.',
          ],
  },
  {
    id: 'plaene.permio.zielordner',
    bezug: { art: 'eintrag', id: 'ablage.permio.antragsordner' },
    apps: ['formulare'],
    thema: 'ablage',
    art: 'pfad',
    bezeichnung: 'Fester Zielordner exportierter Antragsdokumente',
    erklaerung: 'Im Antragsordner; gilt, wenn in PERMIO „fester Ordner“ als Ziel gewählt ist, sonst der Ordner der aktiven Antragsfassung. Leer = der Antragsordner selbst.',
    vorgabe: VORGABE_ZIELORDNER,
    variablen: PERMIO_ZIEL,
    beispiel: { Antrag: 'BAUA 2', Art: 'BAUA' },
    speicher: zielSpeicher('zielordner'),
    projektwert: 'Je Projekt in PERMIO abweichend einstellbar (Antrag › Export für dieses Projekt).',
  },
  {
    id: 'plaene.permio.zielpfad',
    bezug: { art: 'projekt' },
    apps: ['formulare'],
    thema: 'ablage',
    art: 'pfad',
    bezeichnung: 'Fester Zielordner außerhalb des Antragsordners',
    erklaerung: 'Aus einer früheren Einstellung übernommen, die nicht im Antragsordner lag; gilt statt des Zielordners im Antragsordner. Leer = der Zielordner im Antragsordner.',
    vorgabe: '',
    variablen: PERMIO_ZIEL,
    beispiel: { Antrag: 'BAUA 2', Art: 'BAUA' },
    nurWennGesetzt: true,
    speicher: zielSpeicher('abweichend'),
  },
  {
    id: 'plaene.kataster.dateiname',
    bezug: { art: 'eintrag', id: 'ablage.kataster.zielpfad' },
    apps: ['ordner'],
    thema: 'ablage',
    art: 'name',
    bezeichnung: 'Dateinamen der Katasterpläne',
    erklaerung: 'Name der Katasterpläne, die ATLAS aus dem Geoportal erzeugt.',
    vorgabe: '{PROJEKT_KUERZEL} {Art} {DATUM} {Name}',
    variablen: KATASTER_VARIABLEN,
    beispiel: { Art: 'BAUA', Name: 'Katasterplan A4' },
    endung: '.pdf',
    pflicht: true,
    speicher: unterSchluessel('kataster', 'dateiname', 'name', '{PROJEKT_KUERZEL} {Art} {DATUM} {Name}'),
  },
  {
    id: 'plaene.fabrio.rechnungen',
    bezug: { art: 'eintrag', id: 'ablage.fabrio.auftrag' },
    apps: ['ava'],
    thema: 'ablage',
    art: 'liste',
    bezeichnung: 'Muster der Rechnungsdateien',
    erklaerung: 'Je Zeile ein Muster. Das erste gilt für neue Dateien, alle dienen zum Erkennen vorhandener im Auftragsordner.',
    vorgabe: VORGABE_RECHNUNGSMUSTER,
    variablen: FABRIO_RECHNUNG,
    beispiel: { Nr: 53, Firma: 'Musterbau', Rechnungsdatum: '2026-11-12', Art: 'SR', Lfd: 4, Gewerk: 'G08' },
    endung: '.pdf',
    pflicht: true,
    speicher: unterSchluessel('ava', 'rechnungen.muster', 'liste', VORGABE_RECHNUNGSMUSTER),
  },

  /* ---------- Export ---------- */
  ...exportEintraege(),
  {
    id: 'export.pdfMitspeichern',
    bezug: { art: 'frei', text: 'Das PDF liegt neben der Excel-Datei im Berechnungsordner der App' },
    apps: ['flaechenrechner', 'grz', 'kosten'],
    thema: 'export',
    art: 'schalter',
    bezeichnung: 'PDF beim direkten Export mitspeichern',
    erklaerung: 'Der direkte Export legt neben der Excel-Datei ein PDF nach der eingestellten Vorlage ab.',
    vorgabe: true,
    speicher: inPfade('export.pdfMitspeichern', 'schalter'),
  },

  /* ---------- Vorlagen ---------- */
  {
    id: 'vorlagen.vorlagenname',
    bezug: { art: 'frei', text: 'Liegt im Zielordner der Zuordnung (ATLAS, Einrichtung › Vorlagen)' },
    apps: ['ordner'],
    thema: 'vorlagen',
    art: 'name',
    bezeichnung: 'Dateinamen der Vorlagen im Projekt',
    erklaerung: 'Gilt nicht für Vorlagen, deren Name selbst Platzhalter enthält, und nicht, wo eine Zuordnung einen Namen vorgibt.',
    vorgabe: '{PROJEKT_KUERZEL} {Name}',
    variablen: ATLAS_VORLAGE,
    beispiel: { Name: 'Baubeschreibung' },
    endung: '.docx',
    pflicht: true,
    speicher: unterSchluessel('projektordner', 'struktur.vorlagenname', 'name', '{PROJEKT_KUERZEL} {Name}', OHNE_STRUKTUR),
  },
  {
    id: 'vorlagen.atlas.vorlagenordner',
    bezug: { art: 'absolut' },
    apps: ['ordner'],
    thema: 'vorlagen',
    art: 'ordner',
    bezeichnung: 'Vorlagenordner',
    erklaerung: 'Ordner mit den Vorlagen, die ATLAS in neue Projekte kopiert (Presets in Einrichtung › Vorlagen); leer = ohne Vorlagen.',
    vorgabe: '',
    // bisheriger Schlüssel von ATLAS (projektordner.json, neben der Struktur) – nichts zu übernehmen
    speicher: nebenStruktur(unterSchluessel('projektordner', 'vorlagenordner', 'ordner', '')),
  },
  {
    id: 'vorlagen.permio.vorlagenordner',
    bezug: { art: 'absolut' },
    apps: ['formulare'],
    thema: 'vorlagen',
    art: 'ordner',
    bezeichnung: 'Leere Formulare',
    erklaerung: 'Ordner mit leeren FORMA-Formularen als Vorlage; leer = aus den Formularen anderer Projekte.',
    vorgabe: VORGABE_PERMIO.vorlagenordner,
    speicher: inPfade('vorlagen.permio.vorlagenordner', 'ordner'),
  },
  {
    id: 'vorlagen.fabrio.lv',
    bezug: { art: 'eintrag', id: 'ablage.fabrio.lv' },
    apps: ['ava'],
    thema: 'ablage',
    art: 'name',
    bezeichnung: 'Name neuer LV-Dateien',
    erklaerung: 'Name, den FABRIO neuen LV-Dateien vorschlägt.',
    vorgabe: '{PROJEKT_KUERZEL} {DATUM} LV {Gewerk}',
    variablen: FABRIO_LV,
    beispiel: { Gewerk: 'G08' },
    pflicht: true,
    speicher: unterSchluessel('ava', 'lv.dateiname', 'name', '{PROJEKT_KUERZEL} {DATUM} LV {Gewerk}'),
  },
];
