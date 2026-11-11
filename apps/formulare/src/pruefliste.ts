/**
 * Was fehlt noch? Stand je Abschnitt (wie die Gliederung zählt) und die Liste der offenen Angaben – genau das, was im
 * Füllstand fehlt: Gruppen als eine Angabe, entfallene und nicht zählende Felder ausgeschlossen, Angaben, die an
 * nicht festgelegten Projektmerkmalen hängen (ungeklärt, R-01), eingeschlossen (U-03).
 */

import type { BedingungKontext } from './bedingung';
import { fehlendeMerkmale } from './bedingung';
import type { Abschnitt, Feld } from './forma/felder';
import { abschnitte } from './forma/felder';
import type { Einheit, FormularProfil } from './profil';
import { abschnittId, abschnittZustand, ausgefuellt, einheiten, einheitTitel } from './profil';

export interface AbschnittStand {
  id: string;
  abschnitt: Abschnitt;
  /** Titel (eigener aus dem Profil oder der erkannte) */
  titel: string;
  sichtbar: boolean;
  einheiten: { einheit: Einheit; voll: boolean }[];
  /** nach seiner Bedingung erforderlich (auch offen) und nicht alle Angaben entfallen */
  erforderlich: boolean;
  /** die Bedingung des Abschnitts hängt an nicht festgelegten Projektmerkmalen */
  abschnittOffen: boolean;
  /** keine zählenden Angaben (alle „zählt nicht“) */
  freiwillig: boolean;
  gesamt: number;
  gefuellt: number;
  /** nicht ausgefüllte Angaben, die an nicht festgelegten Projektmerkmalen hängen (zählen in `gesamt` mit) */
  offen: number;
  /** die Merkmale, an denen die offenen Angaben hängen */
  fehlend: string[];
}

/** Stand eines Abschnitts: zählende Angaben, ausgefüllte, offene; entfällt oder freiwillig (B-07, R-01) */
export function abschnittStand(a: Abschnitt, profil: FormularProfil, k: BedingungKontext, wert: (f: Feld) => string | boolean): AbschnittStand {
  const id = abschnittId(a);
  const p = profil.abschnitte[id];
  const zustand = abschnittZustand(a, profil, k);
  const e = einheiten(a, profil, k).map((einheit) => ({ einheit, voll: ausgefuellt(einheit, wert) }));
  const zaehlen = zustand !== 'nein' ? e.filter((x) => !x.einheit.entfaellt) : [];
  // entfällt: Bedingung des Abschnitts trifft sicher nicht zu oder alle Angaben entfallen (B-07)
  const erforderlich = zustand !== 'nein' && (zaehlen.length > 0 || !e.length);
  const abschnittOffen = zustand === 'offen';
  const offeneEinheiten = zaehlen.filter((x) => !x.voll && (abschnittOffen || x.einheit.offen));
  return {
    id,
    abschnitt: a,
    titel: p?.titel || a.titel || a.felder[0].beschriftung,
    sichtbar: p?.sichtbar !== false,
    einheiten: e,
    erforderlich,
    abschnittOffen,
    freiwillig: erforderlich && !e.length,
    gesamt: zaehlen.length,
    gefuellt: zaehlen.filter((x) => x.voll).length,
    offen: offeneEinheiten.length,
    fehlend: [...new Set([...(abschnittOffen ? fehlendeMerkmale(p?.bedingung, k.merkmale) : []), ...offeneEinheiten.flatMap((x) => x.einheit.fehlend ?? [])])],
  };
}

export interface OffeneAngabe {
  /** Abschnitt und Einheit */
  id: string;
  titel: string;
  abschnitt: string;
  seite: number;
  felder: Feld[];
  /** hängt an nicht festgelegten Projektmerkmalen */
  ungeklaert: boolean;
  fehlend: string[];
}

/** Die offenen Angaben des Formulars in Lesereihenfolge (nur angezeigte, erforderliche Abschnitte) */
export function offeneAngaben(felderJeSeite: Feld[][], profil: FormularProfil, k: BedingungKontext, wert: (f: Feld) => string | boolean): OffeneAngabe[] {
  const out: OffeneAngabe[] = [];
  felderJeSeite.forEach((felder, seite) => {
    for (const a of abschnitte(felder)) {
      const st = abschnittStand(a, profil, k, wert);
      if (!st.sichtbar || !st.erforderlich) continue;
      for (const { einheit, voll } of st.einheiten) {
        if (voll || einheit.entfaellt) continue;
        const ungeklaert = st.abschnittOffen || !!einheit.offen;
        out.push({
          id: `${st.id}|${einheit.id}`,
          titel: einheitTitel(einheit, profil),
          abschnitt: st.titel,
          seite,
          felder: einheit.felder,
          ungeklaert,
          fehlend: ungeklaert ? (einheit.fehlend?.length ? einheit.fehlend : st.fehlend) : [],
        });
      }
    }
  });
  return out;
}

/**
 * Nächste offene Angabe nach dem Feld `nach` (in Lesereihenfolge, am Ende wieder von vorn); ohne `nach` die erste.
 * Liefert den Schlüssel des Felds, zu dem gesprungen wird.
 */
export function naechsteOffene(liste: OffeneAngabe[], alleFelder: Feld[], nach?: string | null): string | null {
  if (!liste.length) return null;
  const index = new Map(alleFelder.map((f, i) => [f.schluessel, i]));
  const pos = nach && index.has(nach) ? index.get(nach)! : -1;
  const erstes = (o: OffeneAngabe) => Math.min(...o.felder.map((f) => index.get(f.schluessel) ?? Infinity));
  const sortiert = [...liste].sort((a, b) => erstes(a) - erstes(b));
  // die Angabe, in der man gerade steht, überspringen
  const aktuelle = sortiert.find((o) => o.felder.some((f) => f.schluessel === nach));
  const ziel = sortiert.find((o) => o !== aktuelle && erstes(o) > pos) ?? sortiert.find((o) => o !== aktuelle) ?? sortiert[0];
  return ziel.felder[0].schluessel;
}
