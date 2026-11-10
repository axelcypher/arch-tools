/**
 * Felder einer Formularseite für die Oberfläche: Textfelder (TMemo) und Kästchen (TCheckBox) mit Lage auf der
 * Seite, Beschriftung und Abschnitt. FORMA kennt keine Verknüpfung zwischen Feld und Beschriftung – sie wird aus
 * der Lage abgeleitet: die nächste Beschriftung darüber (oder links daneben), bei Kästchen die eigene oder die
 * rechts daneben; der Abschnitt ist die fett gesetzte Überschrift im umgebenden Rahmen (TPanel).
 */

import type { Objekt } from './dfm';
import { bezeichner, eigenschaft, kinder, text, zahl } from './dfm';
import { lage } from './darstellung';
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
  /** gesperrtes Textfeld (Enabled = False): FORMA berechnet den Inhalt, man trägt nichts ein */
  berechnet: boolean;
  hinweis?: string;
  /** Wert in der Datei */
  original: string | boolean;
}

export interface Abschnitt {
  titel: string;
  felder: Feld[];
  /** umgebender Rahmen (TPanel) */
  rahmen: Kasten | null;
}

export const feldSchluessel = (seite: number, name: string) => `${seite}:${name}`;

/** Beschriftung ohne Tastenkürzel-Markierung (`&Hilfe` → `Hilfe`, `&&` → `&`) */
export const ohneKuerzel = (s: string) => s.replace(/&(&?)/g, '$1');

const BESCHRIFTUNGEN = new Set(['TLabel', 'TExtendedLabel']);
const sichtbar = (o: Objekt) => bezeichner(o, 'Visible') !== 'False';

type Bereich = { x: number; y: number; b: number; h: number };

const schnitt = (a: Bereich, b: Bereich): Bereich => {
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  return { x, y, b: Math.min(a.x + a.b, b.x + b.b) - x, h: Math.min(a.y + a.h, b.y + b.h) - y };
};

/**
 * Alle sichtbaren Komponenten der Seite mit Lage, in Dateireihenfolge. Wie in Delphi zeigt ein Rahmen seine
 * Kinder nur innerhalb seiner Fläche: Was ganz außerhalb liegt (etwa ein Textfeld mit negativem `Top`), sieht man
 * in FORMA nicht – es fehlt hier.
 */
export function kaesten(seite: Seite): Kasten[] {
  const out: Kasten[] = [];
  const besuche = (o: Objekt, eltern: Kasten | null, sicht: Bereich | null) => {
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
      // ohne gespeicherte Maße lässt sich nichts abschneiden
      const vermessen = zahl(k, 'Width') !== undefined && zahl(k, 'Height') !== undefined;
      const innen = sicht && vermessen ? schnitt(sicht, kasten) : sicht;
      if (innen && vermessen && (innen.b <= 0 || innen.h <= 0)) continue;
      out.push(kasten);
      besuche(k, kasten, vermessen ? (innen ?? kasten) : innen);
    }
  };
  besuche(seite.form, null, null);
  return out;
}

const beschriftungsText = (k: Kasten) => ohneKuerzel(text(k.o, 'Caption') ?? '').replace(/\s+/g, ' ').trim();
const ueberlapptWaagerecht = (a: Bereich, b: Bereich) => a.x < b.x + b.b && b.x < a.x + a.b;
const ueberlapptSenkrecht = (a: Bereich, b: Bereich) => a.y < b.y + b.h && b.y < a.y + a.h;
const fett = (k: Kasten) => {
  const w = eigenschaft(k.o, 'Font.Style')?.wert;
  return w?.art === 'menge' && w.elemente.includes('fsBold');
};

function naechste(kandidaten: Kasten[], abstand: (k: Kasten) => number): Kasten | undefined {
  let best: Kasten | undefined;
  for (const k of kandidaten) if (!best || abstand(k) < abstand(best)) best = k;
  return best;
}

/**
 * Höhe des Texts einer Beschriftung: Beschriftungen mit fester Größe sind oft höher als ihr Text (und ragen dann
 * scheinbar in das Feld darunter). Ohne Zeilenumbruch zählen die Zeilen der Beschriftung.
 */
function textHoehe(l: Kasten): number {
  if (bezeichner(l.o, 'WordWrap') === 'True') return l.h;
  const zeilen = (text(l.o, 'Caption') ?? '').split(/\r\n|\r|\n/).length;
  const px = Math.abs(zahl(l.o, 'Font.Height') ?? -11);
  return Math.min(l.h, Math.ceil(zeilen * px * 1.15) + 1);
}

const ohneEigenen = (k: Kasten) => k.o.klasse === 'TCheckBox' && !beschriftungsText(k);

/**
 * Beschriftung eines Kästchens ohne eigenen Text: die nächste rechts daneben – außer in Zeilen, deren Beschriftungen
 * links vor den Kästchen stehen („1 ☐ 2 ☐ 3 ☐“, „planungsrechtlich ☐ bauordnungsrechtlich ☐“). Das erkennt man am
 * letzten Kästchen der Zeile: rechts davon steht nichts mehr.
 */
function kaestchenBeschriftung(feld: Kasten, labels: Kasten[], geschwister: Kasten[]): Kasten | undefined {
  const zeile = (k: Kasten) => ueberlapptSenkrecht(k, feld);
  const kaestchen = [feld, ...geschwister.filter((g) => ohneEigenen(g) && zeile(g))].sort((a, b) => a.x - b.x);
  const rechtsVon = (k: Kasten) => {
    const naechstes = kaestchen.find((x) => x.x > k.x);
    const r = labels.filter((l) => zeile(l) && l.x >= k.x + Math.min(k.b, 20) - 4 && (!naechstes || l.x < naechstes.x));
    return naechste(r, (l) => l.x - k.x);
  };
  const linksVon = (k: Kasten) => {
    const vorher = [...kaestchen].reverse().find((x) => x.x < k.x);
    const l = labels.filter((x) => zeile(x) && x.x + x.b <= k.x + 4 && (!vorher || x.x >= vorher.x + Math.min(vorher.b, 20) - 4));
    return naechste(l, (x) => k.x - (x.x + x.b));
  };
  const letztes = kaestchen[kaestchen.length - 1];
  const links = !rechtsVon(letztes) && !!linksVon(letztes);
  return links ? linksVon(feld) : rechtsVon(feld);
}

/** nur eine Anzahl wie „3-fach“ (in Listen der Bauvorlagen zwischen Kästchen und Text) */
const ANZAHL = /^\d+-fach$/i;

function beschriftungFuer(feld: Kasten, geschwister: Kasten[], alle: Kasten[]): string {
  const labels = geschwister.filter((k) => BESCHRIFTUNGEN.has(k.o.klasse) && beschriftungsText(k));
  if (feld.o.klasse === 'TCheckBox') {
    const eigene = beschriftungsText(feld);
    if (eigene) return eigene;
    const l = kaestchenBeschriftung(feld, labels, geschwister);
    if (l) {
      const t = beschriftungsText(l);
      if (!ANZAHL.test(t)) return t;
      // „☐ 3-fach Lageplan …“: der Text rechts daneben, die Anzahl dahinter
      const daneben = naechste(
        labels.filter((x) => x !== l && x.x >= l.x + l.b - 2 && Math.abs(x.y - l.y) <= 4),
        (x) => x.x,
      );
      return daneben ? `${beschriftungsText(daneben)} (${t})` : t;
    }
  } else {
    const darueber = labels.filter((l) => l.y + textHoehe(l) <= feld.y + 3 && ueberlapptWaagerecht(l, feld));
    const o = naechste(darueber, (l) => feld.y - (l.y + textHoehe(l)) + Math.abs(l.x - feld.x) / 1000);
    if (o) {
      const t = beschriftungsText(o);
      // in Tabellen steht über der Zelle nur die Spaltennummer – dann der Kopf darüber
      return /^[\d.,]+$/.test(t) ? (spaltenKopf(feld, alle) ?? t) : t;
    }
    const links = labels.filter((l) => l.x + l.b <= feld.x + 3 && ueberlapptSenkrecht(l, feld));
    const li = naechste(links, (l) => feld.x - (l.x + l.b));
    if (li) return beschriftungsText(li);
  }
  return text(feld.o, 'Hint') ?? spaltenKopf(feld, alle) ?? feld.o.name;
}

/**
 * Tabellen (Verzeichnisse): Die Spaltenköpfe stehen in einem eigenen Rahmen über den Zeilen. Ohne Beschriftung im
 * eigenen Rahmen gilt der nächste Kopf darüber auf der ganzen Seite – Spaltennummern („1“, „2“) übersprungen.
 */
function spaltenKopf(feld: Kasten, alle: Kasten[]): string | undefined {
  const mitte = { ...feld, x: feld.x + feld.b / 2 - 1, b: 2 };
  const koepfe = alle.filter((l) => BESCHRIFTUNGEN.has(l.o.klasse) && l.y + textHoehe(l) <= feld.y + 3 && ueberlapptWaagerecht(lage(l), mitte));
  const text = koepfe.filter((l) => !/^[\d.,]*$/.test(beschriftungsText(l))).sort((a, b) => b.y - a.y);
  if (!text.length) return undefined;
  // mehrzeilige Köpfe bestehen oft aus einer Beschriftung je Zeile: alle direkt übereinander zusammen
  const block = [text[0]];
  for (const l of text.slice(1)) {
    if (l.y + textHoehe(l) < block[block.length - 1].y - 6) break;
    block.push(l);
  }
  return block
    .reverse()
    .map((l) => beschriftungsText(l))
    .join(' ');
}

/** Überschrift des Rahmens: die fett gesetzte (sonst die oberste) Beschriftung direkt darin */
function rahmenTitel(rahmen: Kasten, alle: Kasten[]): string {
  const labels = alle.filter((k) => k.eltern === rahmen && BESCHRIFTUNGEN.has(k.o.klasse) && beschriftungsText(k));
  const kandidat = naechste(labels.filter(fett), (l) => l.y * 10000 + l.x) ?? naechste(labels, (l) => l.y * 10000 + l.x);
  if (!kandidat) return '';
  const titel = beschriftungsText(kandidat);
  // nur eine Nummer („2.“, „2.1“): mit der Beschriftung rechts daneben auf derselben Zeile verbinden
  if (/^[\d.]+$/.test(titel)) {
    const daneben = naechste(
      labels.filter((l) => l !== kandidat && l.x > kandidat.x && Math.abs(l.y - kandidat.y) <= 4),
      (l) => l.x,
    );
    if (daneben) return `${titel} ${beschriftungsText(daneben)}`;
  }
  return titel;
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
      beschriftung: beschriftungFuer(k, geschwister, alle),
      abschnitt: rahmen ? rahmenTitel(rahmen, alle) : '',
      kasten: k,
      einzeilig: bezeichner(k.o, 'WantReturns') === 'False',
      berechnet: bezeichner(k.o, 'Enabled') === 'False',
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
    else out.push({ titel: f.abschnitt, felder: [f], rahmen });
  }
  return out;
}

/** senkrechte Überlappung zweier Bereiche, mit etwas Toleranz für knapp aneinanderstoßende */
const nebeneinander = (a: { y: number; h: number }, b: { y: number; h: number }) => a.y < b.y + b.h - 2 && b.y < a.y + a.h - 2;

/**
 * Felder eines Abschnitts in Zeilen wie auf dem Papier: Felder, die sich senkrecht überlappen, stehen
 * nebeneinander (z. B. Gemarkung | Flur | Flurstück), von links nach rechts.
 */
export function zeilen(felder: Feld[]): Feld[][] {
  const out: { y: number; h: number; felder: Feld[] }[] = [];
  for (const f of [...felder].sort((a, b) => a.kasten.y - b.kasten.y || a.kasten.x - b.kasten.x)) {
    const z = out.find((z) => nebeneinander(z, f.kasten));
    if (z) {
      z.felder.push(f);
      const unten = Math.max(z.y + z.h, f.kasten.y + f.kasten.h);
      z.h = unten - z.y;
    } else {
      out.push({ y: f.kasten.y, h: f.kasten.h, felder: [f] });
    }
  }
  return out.map((z) => z.felder.sort((a, b) => a.kasten.x - b.kasten.x));
}

/** Abschnitte, deren Rahmen auf dem Papier nebeneinander stehen (z. B. Bauherrschaft | Entwurfsverfasser) */
export function abschnittsReihen(liste: Abschnitt[]): Abschnitt[][] {
  const out: Abschnitt[][] = [];
  for (const a of liste) {
    const reihe = out[out.length - 1];
    const r = a.rahmen;
    if (reihe && r && reihe.every((b) => b.rahmen && nebeneinander(b.rahmen, r) && b.rahmen.x !== r.x)) reihe.push(a);
    else out.push([a]);
  }
  return out.map((r) => r.sort((a, b) => (a.rahmen?.x ?? 0) - (b.rahmen?.x ?? 0)));
}

function rahmenVon(f: Feld): Kasten | null {
  let r = f.kasten.eltern;
  while (r && r.o.klasse !== 'TPanel') r = r.eltern;
  return r;
}
