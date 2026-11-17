import type { Project } from '../model';
import { anschriftEinzeilig, bebauungsplanText, flurText, plzOrt } from '../model';
import { bueroName } from '../platform/konfig';
import { datumText, kopfZeilen } from '../ui/DruckKopf';
import type { Value } from './context';
import type { EinzelwertGruppe } from './schema';
import { datumNachFormat, GLOBALE_VARIABLEN } from '../platzhalter';
import { projektPlanphase } from '../planphase';

/** alle Kontakte einer Art, mit Komma getrennt */
function kontakte(project: Project, art: 'email' | 'telefon'): string {
  return project.meta.bauherr.kontakte
    .filter((k) => k.art === art && k.wert.trim())
    .map((k) => k.wert.trim())
    .join(', ');
}

/** Projektangaben als Einzelwerte – in allen Apps gleich */
export function projektWerte(project: Project, date = new Date()): Record<string, Value> {
  const phase = projektPlanphase(project);
  return {
    'projekt.name': project.name,
    'projekt.code': project.meta.projektcode,
    'projekt.projektcode': project.meta.projektcode,
    'projekt.adresse': anschriftEinzeilig(project.meta.adresse),
    'projekt.strasse': project.meta.adresse.strasse,
    'projekt.plz': project.meta.adresse.plz,
    'projekt.ort': project.meta.adresse.ort,
    'projekt.plz_ort': plzOrt(project.meta.adresse),
    'projekt.bearbeiter': project.meta.bearbeiter,
    'projekt.vorhaben': project.meta.vorhaben ?? '',
    'bplan.nummer': project.meta.bebauungsplan?.nummer ?? '',
    'bplan.name': project.meta.bebauungsplan?.name ?? '',
    'bplan.text': bebauungsplanText(project.meta.bebauungsplan),
    buero: bueroName(),
    // gemeinsamer Kopf (wie im Druck): Bauherr, Bebauungsplan, Büro, Bearbeitung in einer Zeile
    'kopf.angaben': kopfZeilen(project, { buero: bueroName() })
      .filter((z) => ['Bauherr', 'Bebauungsplan', 'Büro', 'Bearbeitung'].includes(z.label))
      .map((z) => `${z.label}: ${z.wert}`)
      .join(' · '),
    'grundstueck.gemarkung': project.meta.grundstueck.gemarkung,
    'grundstueck.flur': project.meta.grundstueck.flur,
    'grundstueck.flurstueck': project.meta.grundstueck.flurstueck,
    'grundstueck.flurtext': flurText(project.meta.grundstueck),
    'grundstueck.flaeche': project.meta.grundstueck.flaeche ?? '',
    'bauherr.name': project.meta.bauherr.name,
    'bauherr.adresse': anschriftEinzeilig(project.meta.bauherr.adresse),
    'bauherr.strasse': project.meta.bauherr.adresse.strasse,
    'bauherr.plz': project.meta.bauherr.adresse.plz,
    'bauherr.ort': project.meta.bauherr.adresse.ort,
    'bauherr.plz_ort': plzOrt(project.meta.bauherr.adresse),
    'bauherr.email': kontakte(project, 'email'),
    'bauherr.telefon': kontakte(project, 'telefon'),
    datum: datumText(date),
    // globale Variablen der Suite (@core/platzhalter) – in Dokumenten mit doppelten Klammern: {{PROJEKT_KUERZEL}}, {{DATUM}}
    PROJEKT_KUERZEL: project.meta.projektcode,
    PROJEKT_KURZNAME: project.meta.kurzname ?? '',
    PROJEKT_VORHABEN: project.meta.vorhaben ?? '',
    BEARBEITER: project.meta.bearbeiter,
    DATUM: datumNachFormat(date, 'JJMMTT'),
    JAHR: datumNachFormat(date, 'JJJJ'),
    JAHR_KURZ: datumNachFormat(date, 'JJ'),
    // Planungsphase nach dem Namensschema des Projekts (sonst des Büros); ohne Festlegung leer
    PHASE: phase?.kuerzel ?? '',
    PHASE_NAME: phase?.name ?? '',
    LPH: phase?.lph ?? '',
    // für {{DATUM:TT.MM.JJJJ}} (Format wie in Datei- und Ordnernamen)
    'DATUM.iso': datumNachFormat(date, 'JJJJ-MM-TT'),
  };
}

/** Projektangaben – in allen Apps gleich (Schema der Platzhalter, siehe schema.ts) */
export const PROJEKT_GRUPPE: EinzelwertGruppe = {
  art: 'einzelwerte',
  id: 'projekt',
  titel: 'Projektangaben',
  text: 'Stammdaten des Projekts, in allen Apps gleich.',
  werte: [
    { schluessel: 'projekt.name', text: 'Projektbezeichnung' },
    { schluessel: 'projekt.code', text: 'Projektcode' },
    { schluessel: 'projekt.projektcode', text: 'Projektcode (gleich projekt.code)' },
    { schluessel: 'projekt.adresse', text: 'Adresse in einer Zeile: „Straße Nr., PLZ Ort“' },
    { schluessel: 'projekt.strasse', text: 'Straße und Hausnummer' },
    { schluessel: 'projekt.plz', text: 'Postleitzahl' },
    { schluessel: 'projekt.ort', text: 'Ort' },
    { schluessel: 'projekt.plz_ort', text: 'Postleitzahl und Ort' },
    { schluessel: 'projekt.bearbeiter', text: 'Bearbeitung' },
    { schluessel: 'projekt.vorhaben', text: 'Bezeichnung des Vorhabens' },
    { schluessel: 'bplan.nummer', text: 'Bebauungsplan: Nummer' },
    { schluessel: 'bplan.name', text: 'Bebauungsplan: Name' },
    { schluessel: 'bplan.text', text: 'Bebauungsplan: Nummer und Name in einer Zeile' },
    { schluessel: 'buero', text: 'Name des Büros (gemeinsame Einstellungen)' },
    { schluessel: 'kopf.angaben', text: 'Kopfzeile wie im Druck: „Bauherr: … · Bebauungsplan: … · Büro: … · Bearbeitung: …“' },
    { schluessel: 'grundstueck.gemarkung', text: 'Gemarkung' },
    { schluessel: 'grundstueck.flur', text: 'Flur' },
    { schluessel: 'grundstueck.flurstueck', text: 'Flurstück' },
    { schluessel: 'grundstueck.flurtext', text: '„Gemarkung …, Flur …, Flurstück …“' },
    { schluessel: 'grundstueck.flaeche', text: 'Grundstücksfläche laut Projektdaten', einheit: 'm²' },
    { schluessel: 'bauherr.name', text: 'Name der Bauherrschaft' },
    { schluessel: 'bauherr.adresse', text: 'Adresse der Bauherrschaft in einer Zeile' },
    { schluessel: 'bauherr.strasse', text: 'Straße der Bauherrschaft' },
    { schluessel: 'bauherr.plz', text: 'Postleitzahl der Bauherrschaft' },
    { schluessel: 'bauherr.ort', text: 'Ort der Bauherrschaft' },
    { schluessel: 'bauherr.plz_ort', text: 'Postleitzahl und Ort der Bauherrschaft' },
    { schluessel: 'bauherr.email', text: 'alle E-Mail-Adressen, mit Komma getrennt' },
    { schluessel: 'bauherr.telefon', text: 'alle Telefonnummern, mit Komma getrennt' },
    { schluessel: 'datum', text: 'Datum des Exports (TT.MM.JJJJ)' },
  ],
};

/** Globale Variablen der Suite – dieselben wie in Datei- und Ordnernamen (docs/platzhalter.md) */
export const GLOBAL_GRUPPE: EinzelwertGruppe = {
  art: 'einzelwerte',
  id: 'global',
  titel: 'Globale Variablen',
  text: 'Gelten in allen Apps gleich, auch in Datei- und Ordnernamen. DATUM, JAHR und JAHR_KURZ gehen mit Format: {{DATUM:TT.MM.JJJJ}}, {{JAHR:JJ}}.',
  werte: [...GLOBALE_VARIABLEN.map((v) => ({ schluessel: v.name, text: v.text.replace(/\{(\w+:[^}]+)\}/g, '{{$1}}') })), { schluessel: 'DATUM.iso', text: 'Datum des Exports als JJJJ-MM-TT' }],
};
