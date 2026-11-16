import { GLOBALE_VARIABLEN, mitAliasen, type Variable } from '../platzhalter';

/**
 * Platzhalter der zentralen Pfad- und Namenseinstellungen, je Zusammenhang – hier in core, damit der Einstellungsdialog
 * sie in jeder App kennt. Die Apps übernehmen sie von hier (eine Quelle). Schreibregel und alte Namen siehe
 * docs/platzhalter.md.
 */

const lokal = (name: string, text: string, alt = name.toLowerCase()): Variable => ({ name, text, aliase: [alt] });

/* ---------- ATLAS (Projektordner) ---------- */

/**
 * Globale Variablen im Projektordner. Alte Namen gelten weiter, mit ihrer bisherigen Bedeutung: {nummer}, {kürzel},
 * {projektcode}, {projekt} = Projektkürzel; {datum} war hier JJJJ-MM-TT (die neue Variable {DATUM} ist wie überall
 * JJMMTT, mit Format z. B. {DATUM:JJJJ-MM-TT}).
 */
export const GLOBAL_ATLAS: Variable[] = GLOBALE_VARIABLEN.map((v) =>
  v.name === 'PROJEKT_KUERZEL' ? mitAliasen(v.name, ['projekt']) : v.name === 'DATUM' ? mitAliasen(v.name, [{ name: 'datum', angabe: 'JJJJ-MM-TT' }], true) : v,
);
/** Ordner- und Dateinamen im Projekt: alle globalen Variablen */
export const ATLAS_PROJEKT: Variable[] = GLOBAL_ATLAS;
/** Nummernschema: bildet die Projektnummer selbst – nur Jahr und laufende Nummer */
export const ATLAS_NUMMER: Variable[] = [
  GLOBAL_ATLAS.find((v) => v.name === 'JAHR')!,
  GLOBAL_ATLAS.find((v) => v.name === 'JAHR_KURZ')!,
  lokal('Nr', 'laufende Nummer; mit Stellen z. B. {Nr:3} (führende Nullen)'),
];
export const ATLAS_PLAN: Variable[] = [...GLOBAL_ATLAS, lokal('Plannummer', 'Plannummer'), lokal('Index', 'Planindex'), lokal('Titel', 'Plantitel')];
export const ATLAS_VORLAGE: Variable[] = [...GLOBAL_ATLAS, lokal('Name', 'Name der Vorlage ohne Endung')];

/** globale Variablen der Katasterpläne; {Code} hieß hier früher das Projektkürzel */
const GLOBAL_KATASTER: Variable[] = GLOBALE_VARIABLEN.map((v) =>
  v.name === 'PROJEKT_KUERZEL' ? { ...mitAliasen(v.name, ['Code']), quelle: 'Projektdatei (.oap), Stammdaten „Projektcode“; ohne Projektcode der Name des Projekts' } : v,
);
/** Variablen im Dateinamen der Katasterpläne */
export const KATASTER_VARIABLEN: Variable[] = [
  ...GLOBAL_KATASTER,
  { name: 'Art', text: 'Antragsart der aktiven Fassung, z. B. BAUA' },
  { name: 'Name', text: 'Name des Plans, z. B. Katasterplan A4' },
];
/** Variablen im festen Ablageordner der Katasterpläne */
export const KATASTER_ZIEL_VARIABLEN: Variable[] = [...GLOBAL_KATASTER, { name: 'Antrag', text: 'aktive Antragsfassung, z. B. BAUA 2' }];

/* ---------- PERMIO (Formulare) ---------- */

const GLOBAL_FORMULARE: Variable[] = GLOBALE_VARIABLEN.map((v) => (v.name === 'PROJEKT_KUERZEL' ? { ...mitAliasen(v.name, ['Projekt']), quelle: 'Name des Projektordners (in den Formularen wie bisher)' } : v));

/**
 * Variablen der Namensvorlage exportierter PDFs: die globalen und die lokalen der Formulare. {Phase} aus Vorlagen
 * früherer Fassungen gilt als {Art}.
 */
export const PERMIO_NAMEN: Variable[] = [
  ...GLOBAL_FORMULARE,
  { name: 'Art', text: 'Antragsart der aktiven Fassung, z. B. BAUA (Pflicht im Antragsordner)', aliase: ['Phase'] },
  { name: 'Nr', text: 'Nummer im Antragsumfang (entfällt, wenn leer)' },
  { name: 'Name', text: 'Titel im Antragsumfang, sonst Name des Formulars' },
  { name: 'Antrag', text: 'aktive Antragsfassung, z. B. BAUA 2' },
  { name: 'Formular', text: 'Dateiname des Formulars' },
  { name: 'Kennung', text: 'Kennung des Formulars, z. B. nw010005' },
  { name: 'Stand', text: 'Stand des Formulars, z. B. 2026A' },
];
/** Variablen im festen Zielordner des Exports */
export const PERMIO_ZIEL: Variable[] = [...GLOBAL_FORMULARE, PERMIO_NAMEN.find((v) => v.name === 'Antrag')!, { name: 'Art', text: 'Antragsart der aktiven Fassung, z. B. BAUA' }];

/* ---------- FABRIO (AVA) ---------- */

/** globale Variablen mit den alten Namen von FABRIO ({Projekt} = {PROJEKT_VORHABEN}) */
export const GLOBAL_FABRIO: Variable[] = GLOBALE_VARIABLEN.map((v) => (v.name === 'PROJEKT_VORHABEN' ? mitAliasen(v.name, ['Projekt']) : v));

export const FABRIO_GEWERK: Variable = { name: 'Gewerk', text: 'Gewerk, z. B. G08' };
export const FABRIO_FIRMA: Variable = { name: 'Firma', text: 'Auftragnehmer' };

/** Muster der Rechnungsdateien im Auftragsordner (Bilden und Erkennen) */
export const FABRIO_RECHNUNG: Variable[] = [
  ...GLOBAL_FABRIO,
  { name: 'Nr', text: 'Nummer der Rechnungsliste; mit Stellen z. B. {Nr:3}' },
  { name: 'Art', text: 'Rechnungsart, z. B. AB, SR, R' },
  { name: 'Lfd', text: 'laufende Nummer der Art (1 bei AB1)' },
  FABRIO_FIRMA,
  { name: 'Rechnungsdatum', text: 'Rechnungsdatum als JJMMTT; mit Format z. B. {Rechnungsdatum:JJJJ-MM-TT}', vorgabe: 'JJMMTT', aliase: ['Datum'] },
  FABRIO_GEWERK,
];

/** Name neuer LV-Dateien */
export const FABRIO_LV: Variable[] = [...GLOBAL_FABRIO, FABRIO_GEWERK];

/* ---------- Export (QUADRIO, TERRIO, NUMIO) ---------- */

/** Dateinamen und Berechnungsordner beim Export: die globalen und {Inhalt} (was exportiert wird) */
export const EXPORT_VARIABLEN: Variable[] = [...GLOBALE_VARIABLEN, { name: 'Inhalt', text: 'was exportiert wird, z. B. Flächenaufstellung, GRZ-Nachweis, Kostenschätzung' }];
/** Berechnungsordner: nur die globalen */
export const ORDNER_VARIABLEN: Variable[] = GLOBALE_VARIABLEN;
