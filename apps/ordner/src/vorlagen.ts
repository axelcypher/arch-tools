import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import type { ExportContext } from '@core/excel/context';
import { resolveText } from '@core/excel/context';
import { nameAus } from './nummer';
import { sichererName } from './struktur';

/**
 * Vorlagen füllen. Platzhalter stehen in doppelten geschweiften Klammern ({{projekt.nummer}},
 * {{bauherr.name}} …) – wie in den Excel-Vorlagen der anderen Werkzeuge. Unbekannte Platzhalter bleiben
 * stehen, damit Tippfehler auffallen.
 *
 *   Textdateien (.md, .txt, .csv, .json, .html, .xml …)  Platzhalter im Text
 *   Excel (.xlsx, aus .xltx)                             Vorlagen-Engine mit Wiederholungszeilen
 *   Word (.docx, .docm, aus .dotx/.dotm)                 Platzhalter im Text, in Kopf- und Fußzeilen
 *   alles andere                                         unverändert kopiert
 *
 * Office-Vorlagen (.dotx, .xltx, .potx …) werden im Projekt zu Dokumenten (.docx, .xlsx, .pptx …).
 */

/* ---------- Dateinamen ---------- */

/** Office-Vorlage → Dokument: Endung im Projekt */
export const DOKUMENT_AUS_VORLAGE: Record<string, string> = { '.dotx': '.docx', '.dotm': '.docm', '.xltx': '.xlsx', '.xltm': '.xlsm', '.potx': '.pptx', '.potm': '.pptm' };

/** Endung samt Punkt („.xlsx“), leer ohne Endung */
export function endungVon(name: string): string {
  const punkt = name.lastIndexOf('.');
  return punkt > 0 ? name.slice(punkt) : '';
}

const PLATZHALTER_IM_NAMEN = /\{[^{}]+\}/;

/**
 * Dateiname einer Vorlage im Projekt.
 *  1. Gibt die Zuordnung einen Namen vor, gilt er.
 *  2. Enthält der Name der Vorlage selbst Platzhalter ({nummer} Projektblatt.md), werden nur diese ersetzt.
 *  3. Sonst gilt das Dateinamenschema für Vorlagen, z. B. „{nummer} {name}“.
 * {name} ist der Name der Vorlage ohne Endung. Die Endung kommt immer von der Vorlage (Office-Vorlagen werden
 * zu Dokumenten) und wird angehängt, wenn das Muster sie nicht schon enthält.
 */
export function zielDateiname(vorlage: string, muster: string | undefined, schema: string, werte: Record<string, string | number>): string {
  const alt = endungVon(vorlage);
  const basis = alt ? vorlage.slice(0, -alt.length) : vorlage;
  const endung = DOKUMENT_AUS_VORLAGE[alt.toLowerCase()] ?? alt;
  const name = sichererName(nameAus(basis, werte));
  const m = muster?.trim() || (PLATZHALTER_IM_NAMEN.test(basis) ? '{name}' : schema.trim() || '{name}');
  let out = sichererName(nameAus(m, { ...werte, name }));
  if (alt && out.toLowerCase().endsWith(alt.toLowerCase()) && alt !== endung) out = out.slice(0, -alt.length);
  if (!out) out = name;
  return endung && !out.toLowerCase().endsWith(endung.toLowerCase()) ? `${out}${endung}` : out;
}

/** Inhaltstypen der Office-Vorlagen und der zugehörigen Dokumente */
const INHALTSTYP: [string, string][] = [
  ['wordprocessingml.template.main+xml', 'wordprocessingml.document.main+xml'],
  ['ms-word.template.macroEnabledTemplate.main+xml', 'ms-word.document.macroEnabled.main+xml'],
  ['spreadsheetml.template.main+xml', 'spreadsheetml.sheet.main+xml'],
  ['ms-excel.template.macroEnabled.main+xml', 'ms-excel.sheet.macroEnabled.main+xml'],
  ['presentationml.template.main+xml', 'presentationml.presentation.main+xml'],
  ['ms-powerpoint.template.macroEnabled.main+xml', 'ms-powerpoint.presentation.macroEnabled.main+xml'],
];

/**
 * Office-Vorlage (.dotx, .xltx, .potx …) als Dokument: Nur der Inhaltstyp des Hauptteils unterscheidet sie –
 * ohne die Änderung verweigert Office das Öffnen einer umbenannten Vorlage. Andere Dateien bleiben unverändert.
 */
export function alsDokument(name: string, daten: Uint8Array): Uint8Array {
  if (!DOKUMENT_AUS_VORLAGE[endungVon(name).toLowerCase()]) return daten;
  let zip: ReturnType<typeof unzipSync>;
  try {
    zip = unzipSync(daten);
  } catch (e) {
    throw new Error(`Die Office-Vorlage ist beschädigt: ${e instanceof Error ? e.message : String(e)}`);
  }
  const ct = zip['[Content_Types].xml'];
  if (!ct) return daten;
  const xml = strFromU8(ct);
  let neu = xml;
  for (const [vorlage, dokument] of INHALTSTYP) neu = neu.split(vorlage).join(dokument);
  if (neu === xml) return daten;
  zip['[Content_Types].xml'] = strToU8(neu);
  return zipSync(zip, { level: 6 });
}

/* ---------- Inhalte ---------- */

const TEXT = /\.(md|txt|csv|tsv|json|html?|xml|ya?ml|ini|url)$/i;

const xmlEscape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function text(v: unknown): string {
  return typeof v === 'number' ? v.toLocaleString('de-DE', { maximumFractionDigits: 2 }) : String(v);
}

/** Platzhalter in einem Text ersetzen */
export function fuelleText(inhalt: string, ctx: ExportContext): string {
  return inhalt.replace(/\{\{\s*([^{}]+?)\s*\}\}/g, (m) => {
    const v = resolveText(m, ctx);
    return v === m ? m : text(v);
  });
}

/**
 * Word: Platzhalter im Fließtext, in Kopf- und Fußzeilen. Ein Platzhalter muss in Word in einem Zug getippt
 * sein – wechselt mittendrin die Formatierung, zerlegt Word ihn, und er wird nicht erkannt.
 */
export function fuelleDocx(daten: Uint8Array, ctx: ExportContext): Uint8Array {
  const zip = unzipSync(daten);
  let geaendert = false;
  for (const name of Object.keys(zip)) {
    if (!/^word\/(document|header\d*|footer\d*|footnotes|endnotes)\.xml$/.test(name)) continue;
    const xml = strFromU8(zip[name]);
    const neu = xml.replace(/\{\{\s*([^{}<>]+?)\s*\}\}/g, (m) => {
      const v = resolveText(m, ctx);
      // Zeilenumbrüche als Umbruch im Absatz
      return v === m ? m : xmlEscape(text(v)).replace(/\r?\n/g, '</w:t><w:br/><w:t xml:space="preserve">');
    });
    if (neu !== xml) {
      zip[name] = strToU8(neu);
      geaendert = true;
    }
  }
  return geaendert ? zipSync(zip, { level: 6 }) : daten;
}

/** Füllt eine Vorlage je nach Dateiart (nach dem Namen im Projekt); unbekannte Arten bleiben unverändert */
export async function fuelleVorlage(name: string, daten: Uint8Array, ctx: ExportContext): Promise<Uint8Array> {
  if (TEXT.test(name)) {
    // BOM erhalten (Excel-CSV)
    const bom = daten.length >= 3 && daten[0] === 0xef && daten[1] === 0xbb && daten[2] === 0xbf;
    const inhalt = new TextDecoder('utf-8').decode(bom ? daten.subarray(3) : daten);
    const neu = strToU8(fuelleText(inhalt, ctx));
    if (!bom) return neu;
    const out = new Uint8Array(neu.length + 3);
    out.set([0xef, 0xbb, 0xbf]);
    out.set(neu, 3);
    return out;
  }
  if (/\.xlsx$/i.test(name)) return (await import('@core/excel/fill')).fuelleVorlage(daten, ctx);
  if (/\.doc[xm]$/i.test(name)) return fuelleDocx(daten, ctx);
  return daten;
}

/* ---------- Muster-Vorlagen ---------- */

/**
 * Ausgangspunkt für einen eigenen Vorlagenordner. Die Vorlagen gehören nicht ins Tool: Diese Muster werden
 * einmal in einen Ordner geschrieben und dort durch die eigenen Dateien des Büros ersetzt oder ergänzt.
 * Der Vorlagenordner ist aufgebaut wie ein Projektordner – jede Datei landet am selben Ort im Projekt.
 */
export const MUSTER_VORLAGEN: { pfad: string; inhalt: string }[] = [
  {
    pfad: 'LIESMICH.txt',
    inhalt: `Vorlagenordner für das Projektordner-Tool
==========================================

Dieser Ordner ist aufgebaut wie ein Projektordner. Mit dem Preset "Alle Vorlagen" wird jede Datei beim
Anlegen eines Projekts an denselben Ort im Projektordner kopiert; diese Datei (LIESMICH.txt im Stamm) wird
nicht kopiert. Eigene Presets im Tool unter "Vorlagen" ordnen Dateien aus beliebigen Unterordnern einer
Stelle im Projekt zu und geben ihnen dort einen Namen nach dem Schema des Büros.

Platzhalter
-----------
In Datei- und Ordnernamen: {nummer}, {kurzname}, {jahr}, {datum}, {bearbeiter}
In Textdateien, Excel (.xlsx) und Word (.docx): {{projekt.nummer}}, {{projekt.kurzname}}, {{projekt.name}},
{{projekt.adresse}}, {{bauherr.name}}, {{bauherr.adresse}}, {{projekt.bearbeiter}}, {{datum}} ...
Die vollständige Liste zeigt das Tool unter "Vorlagen".

In Excel wird eine Zeile mit {{beteiligter.rolle}}, {{beteiligter.name}}, {{beteiligter.kontakt}} je
Beteiligtem wiederholt. In Word muss ein Platzhalter in einem Zug getippt sein.

Vorhandene Dateien im Projektordner werden nie überschrieben. Beim Aktualisieren eines Projekts werden nur
fehlende Dateien ergänzt.
`,
  },
  {
    pfad: '00 Projekt/{nummer} Projektblatt.md',
    inhalt: `# Projektblatt {{projekt.nummer}} – {{projekt.kurzname}}

| | |
|---|---|
| Projekt | {{projekt.name}} |
| Projektnummer | {{projekt.nummer}} |
| Bauvorhaben | {{projekt.adresse}} |
| Grundstück | {{grundstueck.flurtext}} |
| Bauherr | {{bauherr.name}} |
| Anschrift Bauherr | {{bauherr.adresse}} |
| E-Mail | {{bauherr.email}} |
| Telefon | {{bauherr.telefon}} |
| Leistungsphasen | {{projekt.leistungsphasen}} |
| Bearbeitung | {{projekt.bearbeiter}} |
| Angelegt | {{datum}} |

## Beteiligte

{{beteiligte}}

## Notizen

`,
  },
  {
    pfad: '02 Pläne/{nummer} Planliste.csv',
    inhalt: `﻿Projekt;{{projekt.nummer}} {{projekt.kurzname}}\r\nStand;{{datum}}\r\n\r\nPlannummer;Index;Titel;Maßstab;Format;Datum;Verfasser;Verteiler;Bemerkung\r\n`,
  },
  {
    pfad: '05 Protokolle/{nummer} Besprechungsprotokoll Vorlage.md',
    inhalt: `# Besprechungsprotokoll Nr. __

**Projekt:** {{projekt.nummer}} – {{projekt.name}}
**Bauvorhaben:** {{projekt.adresse}}
**Datum / Ort:**
**Teilnehmer:**
**Verteiler:**

| Nr. | Thema / Festlegung | zuständig | Termin |
|---|---|---|---|
| 1 | | | |

Aufgestellt: {{projekt.bearbeiter}}
`,
  },
];

/** Platzhalter für die Hilfe unter „Vorlagen“ */
export const PLATZHALTER_DOCS: { gruppe: string; zeilen: [string, string][] }[] = [
  {
    gruppe: 'In Datei- und Ordnernamen (einfache Klammern)',
    zeilen: [
      ['{nummer} (= {kürzel}), {kurzname}, {vorhaben}', 'Projektnummer, Kurzname, Bezeichnung des Vorhabens – Groß-/Kleinschreibung egal'],
      ['{jahr}, {jj}', 'Jahr, in dem das Projekt angelegt wurde (vier- bzw. zweistellig)'],
      ['{name}', 'Name der Vorlage ohne Endung (nur Dateinamen im Projekt)'],
      ['{datum}, {datum:JJMMTT}', 'Tag des Anlegens der Datei, JJJJ-MM-TT bzw. im angegebenen Format – beim Aktualisieren gilt eine Datei mit anderem Datum als vorhanden'],
      ['{bearbeiter}', 'Bearbeitung'],
    ],
  },
  {
    gruppe: 'In Vorlagen (doppelte Klammern)',
    zeilen: [
      ['{{projekt.nummer}}, {{projekt.kurzname}}', 'Projektnummer, Kurzname'],
      ['{{projekt.name}}, {{projekt.bezeichnung}}', 'Bezeichnung des Vorhabens (ohne Bezeichnung der Kurzname)'],
      ['{{projekt.adresse}}, {{projekt.strasse}}, {{projekt.plz}}, {{projekt.ort}}', 'Adresse des Bauvorhabens'],
      ['{{grundstueck.gemarkung}}, {{grundstueck.flur}}, {{grundstueck.flurstueck}}, {{grundstueck.flurtext}}, {{grundstueck.flaeche}}', 'Grundstück'],
      ['{{bauherr.name}}, {{bauherr.adresse}}, {{bauherr.email}}, {{bauherr.telefon}}', 'Bauherr'],
      ['{{projekt.bearbeiter}}, {{projekt.leistungsphasen}}, {{projekt.ordner}}', 'Bearbeitung, Leistungsphasen, Name des Projektordners'],
      ['{{datum}}, {{datum.iso}}, {{jahr}}', 'Datum des Anlegens'],
      ['{{beteiligte}}', 'alle Beteiligten, je Zeile „Rolle: Name (Kontakt)“'],
      ['{{beteiligter.rolle}}, {{beteiligter.name}}, {{beteiligter.kontakt}}', 'nur Excel: Zeile je Beteiligtem'],
      ['{{lph.nr}}, {{lph.name}}', 'nur Excel: Zeile je Leistungsphase'],
    ],
  },
];
