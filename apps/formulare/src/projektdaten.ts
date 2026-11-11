/**
 * Projektdaten.xlsx im echten Projektordner (`Organisation/<Kürzel> Projektdaten.xlsx`): grundlegende Angaben wie
 * Bauvorhaben, Grundstück (Gemarkung, Flur, Flurstück), Bauherr mit Anschrift. Der Aufbau der Datei ist nicht fest
 * vorgegeben – gelesen wird allgemein: Beschriftung („Flurstück:“) und der Wert in der Zelle rechts daneben.
 * Überschriften wie „Bauherr“ oder „Grundstück“ ohne Wert legen fest, wozu Straße, PLZ und Ort darunter gehören.
 *
 * Jede erkannte Angabe hat ein Gegenstück in der Projektkarte von FORMA, so lassen sich beide abgleichen. Beim
 * Schreiben wird nur die Wertzelle geändert (siehe dokumente/xlsx.ts).
 */

import type { Mappe } from './dokumente/xlsx';
import { zellName } from './dokumente/xlsx';

export type Angabe =
  | 'vorhaben'
  | 'aktenzeichen'
  | 'grundstueck.strasse'
  | 'grundstueck.plz'
  | 'grundstueck.ort'
  | 'gemarkung'
  | 'flur'
  | 'flurstueck'
  | 'grundstuecksflaeche'
  | 'bauherr.name'
  | 'bauherr.vorname'
  | 'bauherr.strasse'
  | 'bauherr.plz'
  | 'bauherr.ort'
  | 'bauherr.telefon'
  | 'bauherr.email';

/** Gegenstück in der Projektkarte: Gruppe und Eintrag */
export const IN_PROJEKTKARTE: Partial<Record<Angabe, { gruppe: number; id: number; titel: string }>> = {
  vorhaben: { gruppe: 101, id: 30, titel: 'Bezeichnung der Baumaßnahme' },
  aktenzeichen: { gruppe: 101, id: 130, titel: 'Aktenzeichen' },
  'grundstueck.strasse': { gruppe: 301, id: 20, titel: 'Grundstück: Straße/Nr.' },
  'grundstueck.ort': { gruppe: 301, id: 10, titel: 'Grundstück: Ort' },
  // in FORMA ohne Eintrag: Ergänzung der App (zusatz.ts)
  'grundstueck.plz': { gruppe: 301, id: 9010, titel: 'Grundstück: PLZ' },
  gemarkung: { gruppe: 301, id: 40, titel: 'Gemarkung' },
  flur: { gruppe: 301, id: 50, titel: 'Flur' },
  flurstueck: { gruppe: 301, id: 60, titel: 'Flurstück' },
  grundstuecksflaeche: { gruppe: 301, id: 110, titel: 'Grundstücksfläche' },
  'bauherr.name': { gruppe: 201, id: 40, titel: 'Bauherr: Name/Firma' },
  'bauherr.vorname': { gruppe: 201, id: 30, titel: 'Bauherr: Vorname' },
  'bauherr.strasse': { gruppe: 201, id: 70, titel: 'Bauherr: Straße/Nr.' },
  'bauherr.plz': { gruppe: 201, id: 90, titel: 'Bauherr: PLZ' },
  'bauherr.ort': { gruppe: 201, id: 110, titel: 'Bauherr: Ort' },
  'bauherr.telefon': { gruppe: 201, id: 130, titel: 'Bauherr: Telefon' },
  'bauherr.email': { gruppe: 201, id: 170, titel: 'Bauherr: E-Mail' },
};

export interface ProjektdatenEintrag {
  angabe: Angabe;
  /** Beschriftung, wie sie in der Datei steht */
  beschriftung: string;
  wert: string;
  blatt: number;
  /** Zelle des Werts (bei leerem Wert die Zelle rechts neben der Beschriftung) */
  zelle: string;
}

type Bereich = 'bauherr' | 'grundstueck' | null;

const norm = (s: string) => s.toLowerCase().replace(/[:*]+\s*$/, '').replace(/\s+/g, ' ').trim();

const BEREICH: [RegExp, Bereich][] = [
  [/^(bauherr(in|schaft)?|auftraggeber(in)?|antragsteller(in)?|kunde)$/, 'bauherr'],
  [/^(bau)?grundstück$|^grundstücksdaten$|^lage( des grundstücks)?$|^objekt$|^baustelle$/, 'grundstueck'],
];

function angabeFuer(label: string, bereich: Bereich): Angabe | null {
  const l = norm(label);
  if (/^(bau)?vorhaben$|^projekt(bezeichnung|name)?$|^(bau)?maßnahme$|^bezeichnung( des vorhabens)?$/.test(l)) return 'vorhaben';
  if (/aktenzeichen/.test(l)) return 'aktenzeichen';
  if (/^gemarkung/.test(l)) return 'gemarkung';
  if (/^(flurstück|flurstueck|flst)/.test(l)) return 'flurstueck';
  if (/^flur$/.test(l)) return 'flur';
  if (/grundstücks(fläche|größe)/.test(l)) return 'grundstuecksflaeche';
  if (/^(e-?mail|mail)/.test(l)) return 'bauherr.email';
  if (/^(telefon|tel\.?|mobil|handy)/.test(l)) return 'bauherr.telefon';
  if (/^vorname/.test(l)) return 'bauherr.vorname';
  if (/^(bauherr(in|schaft)?|auftraggeber(in)?|name)( ?\/ ?firma)?$|^(name|firma)$/.test(l)) return 'bauherr.name';
  if (/^(straße|strasse|str\.?)( ?\/? ?(nr|hausnummer)\.?)?$|^anschrift$|^adresse$/.test(l)) return bereich === 'bauherr' ? 'bauherr.strasse' : 'grundstueck.strasse';
  if (/^plz$|^postleitzahl$/.test(l)) return bereich === 'bauherr' ? 'bauherr.plz' : 'grundstueck.plz';
  if (/^(ort|wohnort|stadt|gemeinde)$/.test(l)) return bereich === 'bauherr' ? 'bauherr.ort' : 'grundstueck.ort';
  return null;
}

/** „PLZ / Ort“ in einer Zelle: Wert aufteilen */
const PLZ_ORT = /^plz ?\/? ?ort$/;

/** Erkannte Angaben aller Blätter (je Angabe die erste Fundstelle) */
export function projektdatenLesen(mappe: Mappe): ProjektdatenEintrag[] {
  const out: ProjektdatenEintrag[] = [];
  const gesehen = new Set<Angabe>();
  const neu = (e: ProjektdatenEintrag) => {
    if (gesehen.has(e.angabe)) return;
    gesehen.add(e.angabe);
    out.push(e);
  };
  mappe.blaetter.forEach((b, nr) => {
    let bereich: Bereich = null;
    for (let z = 1; z <= b.zeilen; z++) {
      for (let s = 1; s <= b.spalten; s++) {
        const zelle = b.zellen.get(zellName(z, s));
        const text = zelle?.anzeige.trim();
        if (!text || zelle?.zahl) continue;
        // Wert: die nächste gefüllte Zelle rechts in derselben Zeile
        let wertSpalte = s + 1;
        let wert = '';
        for (let r = s + 1; r <= b.spalten; r++) {
          const w = b.zellen.get(zellName(z, r))?.anzeige.trim();
          if (w) {
            wertSpalte = r;
            wert = w;
            break;
          }
        }
        const wertZelle = zellName(z, wertSpalte);
        const l = norm(text);
        const neuerBereich = BEREICH.find(([re]) => re.test(l))?.[1];
        if (neuerBereich && !wert) {
          bereich = neuerBereich;
          continue;
        }
        if (PLZ_ORT.test(l)) {
          const m = /^(\d{4,5})\s+(.+)$/.exec(wert);
          const pre = bereich === 'bauherr' ? 'bauherr' : 'grundstueck';
          neu({ angabe: `${pre}.plz` as Angabe, beschriftung: text, wert: m?.[1] ?? '', blatt: nr, zelle: wertZelle });
          neu({ angabe: `${pre}.ort` as Angabe, beschriftung: text, wert: m?.[2] ?? wert, blatt: nr, zelle: wertZelle });
          s = wertSpalte;
          continue;
        }
        const angabe = angabeFuer(text, bereich);
        if (angabe) {
          neu({ angabe, beschriftung: text, wert, blatt: nr, zelle: wertZelle });
          // die Wertzelle ist keine Beschriftung
          s = wertSpalte;
        }
      }
    }
  });
  return out;
}

/** Zusammengesetzte Zellen („PLZ / Ort“) beim Schreiben: beide Teile wieder in eine Zelle */
export function zellwert(eintraege: ProjektdatenEintrag[], e: ProjektdatenEintrag, neu: Map<Angabe, string>): string {
  const partner = eintraege.find((x) => x !== e && x.blatt === e.blatt && x.zelle === e.zelle);
  if (!partner) return neu.get(e.angabe) ?? e.wert;
  const [plz, ort] = e.angabe.endsWith('.plz') ? [e, partner] : [partner, e];
  return [neu.get(plz.angabe) ?? plz.wert, neu.get(ort.angabe) ?? ort.wert].filter(Boolean).join(' ');
}
