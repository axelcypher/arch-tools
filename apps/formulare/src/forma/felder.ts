/**
 * Felder einer Formularseite für die Oberfläche: Textfelder (TMemo) und Kästchen (TCheckBox) mit Lage auf der
 * Seite, Beschriftung und Abschnitt. FORMA kennt keine Verknüpfung zwischen Feld und Beschriftung – sie wird aus
 * der Lage abgeleitet: die nächste Beschriftung darüber (oder links daneben), bei Kästchen die eigene oder die
 * rechts daneben; der Abschnitt ist die fett gesetzte Überschrift im umgebenden Rahmen (TPanel).
 */

import type { Objekt } from './dfm';
import { bezeichner, eigenschaft, kinder, text, zahl } from './dfm';
import type { Seite } from './formular';
import { istAngekreuzt, memoText } from './formular';

/** Komponente mit Lage auf der Seite (Delphi: Left/Top relativ zum Elternobjekt) */
export interface Kasten {
  o: Objekt;
  x: number;
  y: number;
  b: number;
  h: number;
  eltern: Kasten | null;
}

export interface Feld {
  /** eindeutig im Formular: `<Seite>:<Name>` */
  schluessel: string;
  seite: number;
  name: string;
  art: 'text' | 'kreuz';
  beschriftung: string;
  abschnitt: string;
  kasten: Kasten;
  /** Textfeld ohne Zeilenumbrüche (WantReturns = False) */
  einzeilig: boolean;
  hinweis?: string;
  /** Wert in der Datei */
  original: string | boolean;
}

export interface Abschnitt {
  titel: string;
  felder: Feld[];
}

export const feldSchluessel = (seite: number, name: string) => `${seite}:${name}`;

/** Beschriftung ohne Tastenkürzel-Markierung (`&Hilfe` → `Hilfe`, `&&` → `&`) */
export const ohneKuerzel = (s: string) => s.replace(/&(&?)/g, '$1');

const BESCHRIFTUNGEN = new Set(['TLabel', 'TExtendedLabel']);
const sichtbar = (o: Objekt) => bezeichner(o, 'Visible') !== 'False';

/** Alle sichtbaren Komponenten der Seite mit Lage, in Dateireihenfolge */
export function kaesten(seite: Seite): Kasten[] {
  const out: Kasten[] = [];
  const besuche = (o: Objekt, eltern: Kasten | null) => {
    for (const k of kinder(o)) {
      if (!sichtbar(k)) continue;
      const kasten: Kasten = {
        o: k,
        x: (eltern?.x ?? 0) + (zahl(k, 'Left') ?? 0),
        y: (eltern?.y ?? 0) + (zahl(k, 'Top') ?? 0),
        b: zahl(k, 'Width') ?? 0,
        h: zahl(k, 'Height') ?? 0,
        eltern,
      };
      out.push(kasten);
      besuche(k, kasten);
    }
  };
  besuche(seite.form, null);
  return out;
}

const beschriftungsText = (k: Kasten) => ohneKuerzel(text(k.o, 'Caption') ?? '').replace(/\s+/g, ' ').trim();
const ueberlapptWaagerecht = (a: Kasten, b: Kasten) => a.x < b.x + b.b && b.x < a.x + a.b;
const ueberlapptSenkrecht = (a: Kasten, b: Kasten) => a.y < b.y + b.h && b.y < a.y + a.h;
const fett = (k: Kasten) => {
  const w = eigenschaft(k.o, 'Font.Style')?.wert;
  return w?.art === 'menge' && w.elemente.includes('fsBold');
};

function naechste(kandidaten: Kasten[], abstand: (k: Kasten) => number): Kasten | undefined {
  let best: Kasten | undefined;
  for (const k of kandidaten) if (!best || abstand(k) < abstand(best)) best = k;
  return best;
}

function beschriftungFuer(feld: Kasten, geschwister: Kasten[]): string {
  const labels = geschwister.filter((k) => BESCHRIFTUNGEN.has(k.o.klasse) && beschriftungsText(k));
  if (feld.o.klasse === 'TCheckBox') {
    const eigene = beschriftungsText(feld);
    if (eigene) return eigene;
    const rechts = labels.filter((l) => l.x >= feld.x + feld.b - 4 && ueberlapptSenkrecht(l, feld));
    const r = naechste(rechts, (l) => l.x - feld.x);
    if (r) return beschriftungsText(r);
  } else {
    const darueber = labels.filter((l) => l.y + l.h <= feld.y + 3 && ueberlapptWaagerecht(l, feld));
    const o = naechste(darueber, (l) => feld.y - (l.y + l.h) + Math.abs(l.x - feld.x) / 1000);
    if (o) return beschriftungsText(o);
    const links = labels.filter((l) => l.x + l.b <= feld.x + 3 && ueberlapptSenkrecht(l, feld));
    const li = naechste(links, (l) => feld.x - (l.x + l.b));
    if (li) return beschriftungsText(li);
  }
  return text(feld.o, 'Hint') ?? feld.o.name;
}

/** Überschrift des Rahmens: die fett gesetzte (sonst die oberste) Beschriftung direkt darin */
function rahmenTitel(rahmen: Kasten, alle: Kasten[]): string {
  const labels = alle.filter((k) => k.eltern === rahmen && BESCHRIFTUNGEN.has(k.o.klasse) && beschriftungsText(k));
  const kandidat = naechste(labels.filter(fett), (l) => l.y * 10000 + l.x) ?? naechste(labels, (l) => l.y * 10000 + l.x);
  return kandidat ? beschriftungsText(kandidat) : '';
}

export function felderDerSeite(seite: Seite, index: number): Feld[] {
  const alle = kaesten(seite);
  const out: Feld[] = [];
  for (const k of alle) {
    if (k.o.klasse !== 'TMemo' && k.o.klasse !== 'TCheckBox') continue;
    let rahmen = k.eltern;
    while (rahmen && rahmen.o.klasse !== 'TPanel') rahmen = rahmen.eltern;
    const geschwister = alle.filter((g) => g.eltern === k.eltern && g !== k);
    const kreuz = k.o.klasse === 'TCheckBox';
    out.push({
      schluessel: feldSchluessel(index, k.o.name),
      seite: index,
      name: k.o.name,
      art: kreuz ? 'kreuz' : 'text',
      beschriftung: beschriftungFuer(k, geschwister),
      abschnitt: rahmen ? rahmenTitel(rahmen, alle) : '',
      kasten: k,
      einzeilig: bezeichner(k.o, 'WantReturns') === 'False',
      hinweis: text(k.o, 'Hint'),
      original: kreuz ? istAngekreuzt(k.o) : memoText(k.o),
    });
  }
  // Lesereihenfolge: Rahmen von oben nach unten (nebeneinander von links nach rechts), darin ebenso die Felder
  const ort = (f: Feld) => {
    const r = rahmenVon(f) ?? f.kasten;
    return [r.y, r.x, f.kasten.y, f.kasten.x];
  };
  return out.sort((a, b) => {
    const [oa, ob] = [ort(a), ort(b)];
    return oa[0] - ob[0] || oa[1] - ob[1] || oa[2] - ob[2] || oa[3] - ob[3];
  });
}

/** Felder nach Abschnitten in der Reihenfolge ihres ersten Auftretens */
export function abschnitte(felder: Feld[]): Abschnitt[] {
  const out: Abschnitt[] = [];
  for (const f of felder) {
    const rahmen = rahmenVon(f);
    const letzter = out[out.length - 1];
    const gleicherRahmen = letzter && rahmenVon(letzter.felder[0]) === rahmen;
    if (gleicherRahmen) letzter.felder.push(f);
    else out.push({ titel: f.abschnitt, felder: [f] });
  }
  return out;
}

function rahmenVon(f: Feld): Kasten | null {
  let r = f.kasten.eltern;
  while (r && r.o.klasse !== 'TPanel') r = r.eltern;
  return r;
}
