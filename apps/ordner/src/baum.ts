import type { OrdnerRegel } from './struktur';
import { sichererName } from './struktur';

/**
 * Ordnerliste als Baum (P-04): dieselben Regeln (`OrdnerRegel[]`) wie in der Textansicht, als Baum dargestellt und
 * mit reinen Funktionen bearbeitet – einrücken, ausrücken, verschieben, umbenennen, löschen, hinzufügen, Zusätze
 * setzen. Übergeordnete Ordner, die nur als Teil eines Pfads vorkommen („02 Pläne“ in „02 Pläne/Entwurf“), sind
 * Knoten ohne eigene Regel. Jede Operation liefert eine neue Liste in Baumreihenfolge (jeder Ordner vor seinem
 * Inhalt); die Textansicht zeigt danach genau diese Liste.
 */

interface Knoten {
  name: string;
  /** eigene Regel (ohne Pfad); fehlt bei Ordnern, die nur als Teil eines Pfads vorkommen */
  regel?: Omit<OrdnerRegel, 'pfad'>;
  kinder: Knoten[];
}

/** Zeile der Baumansicht */
export interface BaumZeile {
  pfad: string;
  name: string;
  tiefe: number;
  /** die eigene Regel, falls vorhanden */
  regel?: OrdnerRegel;
  hatKinder: boolean;
  /** gibt es einen Geschwisterordner davor bzw. danach (für Verschieben und Einrücken) */
  erster: boolean;
  letzter: boolean;
}

const gleich = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

function bauen(ordner: OrdnerRegel[]): Knoten {
  const wurzel: Knoten = { name: '', kinder: [] };
  for (const r of ordner) {
    let k = wurzel;
    for (const teil of r.pfad.split('/')) {
      let kind = k.kinder.find((x) => gleich(x.name, teil));
      if (!kind) {
        kind = { name: teil, kinder: [] };
        k.kinder.push(kind);
      }
      k = kind;
    }
    const { pfad: _p, ...rest } = r;
    k.regel = rest;
  }
  return wurzel;
}

/** Baum zurück in Regeln: jeder Ordner vor seinem Inhalt; Ordner ohne eigene Regel entstehen über ihre Unterordner */
function flach(wurzel: Knoten): OrdnerRegel[] {
  const out: OrdnerRegel[] = [];
  const gehe = (k: Knoten, pfad: string) => {
    for (const kind of k.kinder) {
      const p = pfad ? `${pfad}/${kind.name}` : kind.name;
      // ein Blatt ohne eigene Regel (etwa nach dem Verschieben) bleibt als Ordner erhalten
      if (kind.regel || !kind.kinder.length) out.push({ pfad: p, ...(kind.regel ?? {}) });
      gehe(kind, p);
    }
  };
  gehe(wurzel, '');
  return out;
}

/** Knoten und seine Eltern zu einem Pfad */
function finde(wurzel: Knoten, pfad: string): { knoten: Knoten; eltern: Knoten; index: number } | null {
  let eltern = wurzel;
  let knoten: Knoten | undefined;
  let index = -1;
  const teile = pfad.split('/');
  for (const [i, teil] of teile.entries()) {
    index = eltern.kinder.findIndex((x) => gleich(x.name, teil));
    if (index < 0) return null;
    knoten = eltern.kinder[index];
    if (i < teile.length - 1) eltern = knoten;
  }
  return knoten ? { knoten, eltern, index } : null;
}

/** Zeilen für die Baumansicht */
export function baumZeilen(ordner: OrdnerRegel[]): BaumZeile[] {
  const out: BaumZeile[] = [];
  const gehe = (k: Knoten, pfad: string, tiefe: number) => {
    k.kinder.forEach((kind, i) => {
      const p = pfad ? `${pfad}/${kind.name}` : kind.name;
      out.push({
        pfad: p,
        name: kind.name,
        tiefe,
        ...(kind.regel ? { regel: { pfad: p, ...kind.regel } } : {}),
        hatKinder: kind.kinder.length > 0,
        erster: i === 0,
        letzter: i === k.kinder.length - 1,
      });
      gehe(kind, p, tiefe + 1);
    });
  };
  gehe(bauen(ordner), '', 0);
  return out;
}

/** Liste in Baumreihenfolge (ändert sonst nichts) */
export const baumOrdnung = (ordner: OrdnerRegel[]) => flach(bauen(ordner));

function mit(ordner: OrdnerRegel[], pfad: string, f: (t: { knoten: Knoten; eltern: Knoten; index: number }, wurzel: Knoten) => boolean | void): OrdnerRegel[] {
  const wurzel = bauen(ordner);
  const t = finde(wurzel, pfad);
  if (!t || f(t, wurzel) === false) return ordner;
  return flach(wurzel);
}

/** mit dem Geschwisterordner davor (-1) bzw. danach (+1) tauschen */
export const verschieben = (ordner: OrdnerRegel[], pfad: string, richtung: -1 | 1) =>
  mit(ordner, pfad, ({ eltern, index }) => {
    const ziel = index + richtung;
    if (ziel < 0 || ziel >= eltern.kinder.length) return false;
    [eltern.kinder[index], eltern.kinder[ziel]] = [eltern.kinder[ziel], eltern.kinder[index]];
  });

/** einrücken: wird letzter Unterordner des Geschwisterordners davor */
export const einruecken = (ordner: OrdnerRegel[], pfad: string) =>
  mit(ordner, pfad, ({ knoten, eltern, index }) => {
    const davor = eltern.kinder[index - 1];
    if (!davor || davor.kinder.some((x) => gleich(x.name, knoten.name))) return false;
    eltern.kinder.splice(index, 1);
    // der neue Elternordner behält seine Regel; ohne Regel war er schon Ordner über seine Unterordner
    davor.kinder.push(knoten);
  });

/** ausrücken: steht danach direkt hinter seinem bisherigen Elternordner */
export const ausruecken = (ordner: OrdnerRegel[], pfad: string) => {
  const teile = pfad.split('/');
  if (teile.length < 2) return ordner;
  const elternPfad = teile.slice(0, -1).join('/');
  return mit(ordner, pfad, ({ knoten, eltern, index }, wurzel) => {
    const oben = finde(wurzel, elternPfad)!;
    if (oben.eltern.kinder.some((x) => gleich(x.name, knoten.name))) return false;
    // ein Elternordner ohne eigene Regel, der dadurch leer würde, bleibt als Ordner stehen
    if (eltern.kinder.length === 1 && !eltern.regel) eltern.regel = {};
    eltern.kinder.splice(index, 1);
    oben.eltern.kinder.splice(oben.index + 1, 0, knoten);
  });
};

/** umbenennen (unzulässige Zeichen entfallen); kein Name oder ein Name, den es daneben schon gibt: unverändert */
export const umbenennen = (ordner: OrdnerRegel[], pfad: string, name: string) =>
  mit(ordner, pfad, ({ knoten, eltern }) => {
    const n = sichererName(name.replace(/[\\/]+/g, ' '));
    if (!n || eltern.kinder.some((x) => x !== knoten && gleich(x.name, n))) return false;
    knoten.name = n;
  });

/** Ordner samt Unterordnern löschen */
export const loeschen = (ordner: OrdnerRegel[], pfad: string) =>
  mit(ordner, pfad, ({ eltern, index }) => {
    eltern.kinder.splice(index, 1);
  });

/** neuen Ordner anlegen – im Stamm (`eltern` leer) oder als letzten Unterordner; der Name wird bei Bedarf durchgezählt */
export function hinzufuegen(ordner: OrdnerRegel[], eltern: string, name = 'Neuer Ordner'): { ordner: OrdnerRegel[]; pfad: string } {
  const wurzel = bauen(ordner);
  const ziel = eltern ? finde(wurzel, eltern)?.knoten : wurzel;
  if (!ziel) return { ordner, pfad: '' };
  const basis = sichererName(name) || 'Neuer Ordner';
  let n = basis;
  for (let i = 2; ziel.kinder.some((x) => gleich(x.name, n)); i++) n = `${basis} ${i}`;
  ziel.kinder.push({ name: n, regel: {}, kinder: [] });
  return { ordner: flach(wurzel), pfad: eltern ? `${eltern}/${n}` : n };
}

/** Zusätze setzen (Leistungsphasen, Dateischema); ein Ordner ohne eigene Regel bekommt damit eine */
export const zusatzSetzen = (ordner: OrdnerRegel[], pfad: string, patch: { lph?: number[]; dateischema?: boolean }) =>
  mit(ordner, pfad, ({ knoten }) => {
    const r = { ...(knoten.regel ?? {}), ...patch };
    if (!r.lph?.length) delete r.lph;
    else r.lph = [...new Set(r.lph)].sort((a, b) => a - b);
    if (!r.dateischema) delete r.dateischema;
    knoten.regel = r;
  });
