/**
 * Projektdatei (.oap) im echten Projektordner als Quelle der Projektstammdaten – statt der früheren
 * Projektdaten.xlsx. Die .oap ist das gemeinsame Projektarchiv von Flächenrechner, GRZ-Nachweis,
 * Kostenermittlung und Projektordner (ZIP mit `manifest.json` und `projekt.json`); die Stammdaten stehen in
 * `projekt.json` unter `meta`: Projektcode, Vorhaben, Aktenzeichen, Adresse des Vorhabens, Grundstück, Bauherr.
 *
 * Gelesen, gezielt geändert und angelegt wird über den gemeinsamen Zugriff in packages/core (projektdatei.ts,
 * platform/projektordner.ts): nur `projekt.json` ändert sich, alle anderen Einträge des Archivs bleiben gleich.
 * Hier steht nur die Zuordnung der Angaben der Projektkarte zu `meta`.
 */

import { readProjectFile } from '@core/archive';
import type { Kontakt, KontaktArt, ProjectMeta } from '@core/model';
import type { Angabe } from './projektdaten';

/** Angaben, die die Projektdatei führt (alle mit Gegenstück in der Projektkarte) */
export const OAP_ANGABEN: { angabe: Angabe; feld: string }[] = [
  { angabe: 'vorhaben', feld: 'Vorhaben' },
  { angabe: 'aktenzeichen', feld: 'Aktenzeichen' },
  { angabe: 'grundstueck.strasse', feld: 'Adresse: Straße' },
  { angabe: 'grundstueck.plz', feld: 'Adresse: PLZ' },
  { angabe: 'grundstueck.ort', feld: 'Adresse: Ort' },
  { angabe: 'gemarkung', feld: 'Grundstück: Gemarkung' },
  { angabe: 'flur', feld: 'Grundstück: Flur' },
  { angabe: 'flurstueck', feld: 'Grundstück: Flurstück' },
  { angabe: 'grundstuecksflaeche', feld: 'Grundstück: Fläche' },
  { angabe: 'bauherr.name', feld: 'Bauherr: Name' },
  { angabe: 'bauherr.vorname', feld: 'Bauherr: Vorname' },
  { angabe: 'bauherr.strasse', feld: 'Bauherr: Straße' },
  { angabe: 'bauherr.plz', feld: 'Bauherr: PLZ' },
  { angabe: 'bauherr.ort', feld: 'Bauherr: Ort' },
  { angabe: 'bauherr.telefon', feld: 'Bauherr: Telefon' },
  { angabe: 'bauherr.email', feld: 'Bauherr: E-Mail' },
];

/** Fläche als Text wie in der Projektkarte: „523,4“ */
export const flaecheText = (n: number | undefined) => (n === undefined ? '' : String(Math.round(n * 100) / 100).replace('.', ','));

/** „523,40 m²“, „1.234,5“, „650“ → Zahl; leer oder unlesbar → undefined */
export function flaecheZahl(s: string): number | undefined {
  const t = s.replace(/m²|m2|qm/gi, '').trim();
  if (!t) return undefined;
  const n = Number(t.replace(/\s/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : undefined;
}

const kontakt = (k: Kontakt[], art: KontaktArt) => k.find((x) => x.art === art)?.wert ?? '';

/** Angaben der Projektdatei als Text (für Abgleich und Übernehmen) */
export function angabenAus(m: ProjectMeta): Map<Angabe, string> {
  const g = m.grundstueck;
  const b = m.bauherr;
  const werte: [Angabe, string][] = [
    ['vorhaben', m.vorhaben ?? ''],
    ['aktenzeichen', m.aktenzeichen ?? ''],
    ['grundstueck.strasse', m.adresse.strasse],
    ['grundstueck.plz', m.adresse.plz],
    ['grundstueck.ort', m.adresse.ort],
    ['gemarkung', g.gemarkung],
    ['flur', g.flur],
    ['flurstueck', g.flurstueck],
    ['grundstuecksflaeche', flaecheText(g.flaeche)],
    ['bauherr.name', b.name],
    ['bauherr.vorname', b.vorname ?? ''],
    ['bauherr.strasse', b.adresse.strasse],
    ['bauherr.plz', b.adresse.plz],
    ['bauherr.ort', b.adresse.ort],
    ['bauherr.telefon', kontakt(b.kontakte, 'telefon')],
    ['bauherr.email', kontakt(b.kontakte, 'email')],
  ];
  return new Map(werte);
}

/** Kontakt der Art setzen: den ersten ersetzen, leer = entfernen, sonst anhängen */
function kontaktSetzen(k: Kontakt[], art: KontaktArt, wert: string): Kontakt[] {
  const i = k.findIndex((x) => x.art === art);
  if (!wert.trim()) return i < 0 ? k : k.filter((_, n) => n !== i);
  if (i < 0) return [...k, { art, wert: wert.trim() }];
  return k.map((x, n) => (n === i ? { art, wert: wert.trim() } : x));
}

/** Meta mit geänderten Angaben (nur die übergebenen; alles andere bleibt) */
export function metaMit(m: ProjectMeta, werte: Map<Angabe, string>): ProjectMeta {
  const neu: ProjectMeta = structuredClone(m);
  const t = (a: Angabe) => werte.get(a)!.trim();
  const optional = <K extends 'vorhaben' | 'aktenzeichen'>(k: K, v: string) => {
    if (v) neu[k] = v;
    else delete neu[k];
  };
  for (const a of werte.keys()) {
    switch (a) {
      case 'vorhaben':
      case 'aktenzeichen':
        optional(a, t(a));
        break;
      case 'grundstueck.strasse':
        neu.adresse.strasse = t(a);
        break;
      case 'grundstueck.plz':
        neu.adresse.plz = t(a);
        break;
      case 'grundstueck.ort': {
        // „59494 Soest“ → PLZ und Ort
        const x = /^(\d{4,5})\s+(.+)$/.exec(t(a));
        if (x) [neu.adresse.plz, neu.adresse.ort] = [x[1], x[2]];
        else neu.adresse.ort = t(a);
        break;
      }
      case 'gemarkung':
      case 'flur':
      case 'flurstueck':
        neu.grundstueck[a] = t(a);
        break;
      case 'grundstuecksflaeche': {
        const f = flaecheZahl(t(a));
        if (f === undefined) delete neu.grundstueck.flaeche;
        else neu.grundstueck.flaeche = f;
        break;
      }
      case 'bauherr.name':
        neu.bauherr.name = t(a);
        break;
      case 'bauherr.vorname':
        if (t(a)) neu.bauherr.vorname = t(a);
        else delete neu.bauherr.vorname;
        break;
      case 'bauherr.strasse':
        neu.bauherr.adresse.strasse = t(a);
        break;
      case 'bauherr.plz':
        neu.bauherr.adresse.plz = t(a);
        break;
      case 'bauherr.ort':
        neu.bauherr.adresse.ort = t(a);
        break;
      case 'bauherr.telefon':
        neu.bauherr.kontakte = kontaktSetzen(neu.bauherr.kontakte, 'telefon', t(a));
        break;
      case 'bauherr.email':
        neu.bauherr.kontakte = kontaktSetzen(neu.bauherr.kontakte, 'email', t(a));
        break;
    }
  }
  return neu;
}

export interface OapInhalt {
  /** Name des Projekts in der Datei */
  name: string;
  meta: ProjectMeta;
}

/** Projektdatei lesen (wie Flächenrechner & Co.: geprüft und vervollständigt) */
export function oapLesen(bytes: Uint8Array): OapInhalt {
  const p = readProjectFile(bytes);
  return { name: p.name, meta: p.meta };
}
