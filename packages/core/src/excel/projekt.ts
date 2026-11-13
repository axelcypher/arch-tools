import type { Project } from '../model';
import { anschriftEinzeilig, bebauungsplanText, flurText, plzOrt } from '../model';
import { bueroName } from '../platform/konfig';
import { datumText, kopfZeilen } from '../ui/DruckKopf';
import type { PlaceholderDocs, Value } from './context';
import { datumNachFormat, GLOBALE_VARIABLEN } from '../platzhalter';

/** alle Kontakte einer Art, mit Komma getrennt */
function kontakte(project: Project, art: 'email' | 'telefon'): string {
  return project.meta.bauherr.kontakte
    .filter((k) => k.art === art && k.wert.trim())
    .map((k) => k.wert.trim())
    .join(', ');
}

/** Projektangaben als Einzelwerte – in allen Apps gleich */
export function projektWerte(project: Project, date = new Date()): Record<string, Value> {
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
    // für {{DATUM:TT.MM.JJJJ}} (Format wie in Datei- und Ordnernamen)
    'DATUM.iso': datumNachFormat(date, 'JJJJ-MM-TT'),
  };
}

export const PROJEKT_DOCS: PlaceholderDocs[number] = {
  group: 'projekt / grundstueck / bauherr / datum',
  keys: [
    ['projekt.name', 'Projektbezeichnung'],
    ['projekt.code', 'Projektcode (auch projekt.projektcode)'],
    ['projekt.adresse', 'Adresse in einer Zeile: „Straße Nr., PLZ Ort“'],
    ['projekt.strasse, projekt.plz, projekt.ort, projekt.plz_ort', 'Adresse in Teilen'],
    ['projekt.bearbeiter', 'Bearbeiter'],
    ['projekt.vorhaben', 'Bezeichnung des Vorhabens'],
    ['bplan.nummer, bplan.name, bplan.text', 'Bebauungsplan: Nummer, Name, beides in einer Zeile'],
    ['buero', 'Name des Büros (gemeinsame Einstellungen)'],
    ['kopf.angaben', 'Kopfzeile wie im Druck: „Bauherr: … · Bebauungsplan: … · Büro: … · Bearbeitung: …“'],
    ['grundstueck.gemarkung, grundstueck.flur, grundstueck.flurstueck', 'Grundstücksdaten'],
    ['grundstueck.flurtext', '„Gemarkung …, Flur …, Flurstück …“'],
    ['grundstueck.flaeche', 'Grundstücksfläche [m²] (Projektdaten)'],
    ['bauherr.name', 'Name des Bauherrn'],
    ['bauherr.adresse, bauherr.strasse, bauherr.plz, bauherr.ort, bauherr.plz_ort', 'Adresse des Bauherrn'],
    ['bauherr.email, bauherr.telefon', 'alle E-Mail-Adressen bzw. Telefonnummern, mit Komma getrennt'],
    ['datum', 'Datum des Exports (TT.MM.JJJJ)'],
    [GLOBALE_VARIABLEN.map((v) => v.name).join(', '), 'globale Variablen der Suite (gleich in allen Apps); Datum mit Format z. B. DATUM:TT.MM.JJJJ'],
  ],
};
