import type { OrdnerMeldung, OrdnerRegel } from './struktur';
import { normPfad, ordnerAusTextMitMeldungen, sichererName } from './struktur';

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

/* ---------- Klick-Editor: Auswahl, Teilbäume (Bausteine, Zwischenablage), Verschieben ---------- */

const klein = (p: string) => p.toLowerCase();

/** die obersten gewählten Pfade: ohne die, deren übergeordneter Ordner auch gewählt ist (doppelte entfallen) */
export function obersteAuswahl(pfade: string[]): string[] {
  const alle = [...new Map(pfade.map((p) => [klein(p), p])).values()];
  return alle.filter((p) => !alle.some((q) => q !== p && klein(p).startsWith(`${klein(q)}/`)));
}

const kopie = (k: Knoten): Knoten => ({
  name: k.name,
  ...(k.regel ? { regel: { ...k.regel, ...(k.regel.lph ? { lph: [...k.regel.lph] } : {}) } } : {}),
  kinder: k.kinder.map(kopie),
});

/**
 * `quelle` (deren Unterordner) in `ziel` einmischen: gleichnamige Ordner werden zusammengeführt, Neues kommt hinten
 * dazu; vorhandene Regeln bleiben. Liefert, ob sich etwas geändert hat; neue Pfade landen in `neu`.
 */
function mischen(ziel: Knoten, quelle: Knoten, pfad: string, neu: string[]): boolean {
  let geaendert = false;
  for (const k of quelle.kinder) {
    const da = ziel.kinder.find((x) => gleich(x.name, k.name));
    const p = pfad ? `${pfad}/${da?.name ?? k.name}` : (da?.name ?? k.name);
    if (!da) {
      ziel.kinder.push(kopie(k));
      neu.push(p);
      geaendert = true;
      continue;
    }
    // ein Ordner, der nur als Teil eines Pfads vorkam, übernimmt die Regel des Bausteins
    if (!da.regel && k.regel) {
      da.regel = kopie(k).regel;
      geaendert = true;
    }
    if (mischen(da, k, p, neu)) geaendert = true;
  }
  return geaendert;
}

/** die Unterordner eines Ordners als Teilbaum – Pfade relativ zu ihm (z. B. für einen Baustein) */
export function unterordnerVon(ordner: OrdnerRegel[], pfad: string): OrdnerRegel[] {
  const t = finde(bauen(ordner), pfad);
  return t ? flach({ name: '', kinder: t.knoten.kinder.map(kopie) }) : [];
}

/** Ordner samt Unterordnern als Teilbaum – Pfade relativ zum jeweiligen Elternordner (Kopieren); gleichnamige werden zusammengeführt */
export function teilbaumVon(ordner: OrdnerRegel[], pfade: string[]): OrdnerRegel[] {
  const wurzel = bauen(ordner);
  const sammel: Knoten = { name: '', kinder: [] };
  for (const p of obersteAuswahl(pfade)) {
    const t = finde(wurzel, p);
    if (t) mischen(sammel, { name: '', kinder: [t.knoten] }, '', []);
  }
  return flach(sammel);
}

/**
 * Teilbaum (Baustein, Zwischenablage) in einen oder mehrere Ordner einfügen ('' = Stamm). Gleichnamige Ordner werden
 * zusammengeführt – mehrfaches Einfügen ändert nichts mehr. Liefert die neuen Pfade.
 */
export function einfuegen(ordner: OrdnerRegel[], ziele: string[], teil: OrdnerRegel[]): { ordner: OrdnerRegel[]; neu: string[] } {
  const wurzel = bauen(ordner);
  const quelle = bauen(teil);
  const neu: string[] = [];
  let geaendert = false;
  for (const z of [...new Map(ziele.map((p) => [klein(p), p])).values()]) {
    const ziel = z ? finde(wurzel, z) : null;
    if (z && !ziel) continue;
    if (mischen(ziel ? ziel.knoten : wurzel, quelle, z, neu)) geaendert = true;
  }
  return { ordner: geaendert ? flach(wurzel) : ordner, neu };
}

/** Ordner samt Unterordnern duplizieren: die Kopie steht direkt dahinter, der Name wird durchgezählt („Rohbau 2“) */
export function duplizieren(ordner: OrdnerRegel[], pfad: string): { ordner: OrdnerRegel[]; pfad: string } {
  const wurzel = bauen(ordner);
  const t = finde(wurzel, pfad);
  if (!t) return { ordner, pfad: '' };
  let n = `${t.knoten.name} 2`;
  for (let i = 3; t.eltern.kinder.some((x) => gleich(x.name, n)); i++) n = `${t.knoten.name} ${i}`;
  t.eltern.kinder.splice(t.index + 1, 0, { ...kopie(t.knoten), name: n, regel: kopie(t.knoten).regel ?? {} });
  const eltern = pfad.split('/').slice(0, -1).join('/');
  return { ordner: flach(wurzel), pfad: eltern ? `${eltern}/${n}` : n };
}

/**
 * Ordner (mit Unterordnern) verschieben – in einen anderen Ordner (ans Ende) oder vor bzw. hinter einen Ordner, auch
 * mehrere auf einmal in ihrer Reihenfolge. null, wenn es nicht geht: in sich selbst, oder im Ziel gibt es schon einen
 * Ordner gleichen Namens.
 */
export function verschiebenNach(ordner: OrdnerRegel[], pfade: string[], ziel: string, wo: 'in' | 'vor' | 'nach'): { ordner: OrdnerRegel[]; pfade: string[] } | null {
  const reihenfolge = baumZeilen(ordner).map((z) => klein(z.pfad));
  const oben = obersteAuswahl(pfade).sort((a, b) => reihenfolge.indexOf(klein(a)) - reihenfolge.indexOf(klein(b)));
  if (!oben.length) return null;
  const z = klein(ziel);
  for (const p of oben) {
    if (z === klein(p) || z.startsWith(`${klein(p)}/`)) return null;
  }
  const zielEltern = wo === 'in' ? ziel : ziel.split('/').slice(0, -1).join('/');
  const wurzel = bauen(ordner);
  const knoten: Knoten[] = [];
  for (const p of oben) {
    const t = finde(wurzel, p);
    if (!t) return null;
    // ein Elternordner ohne eigene Regel, der dadurch leer würde, bleibt als Ordner stehen
    if (t.eltern !== wurzel && t.eltern.kinder.length === 1 && !t.eltern.regel) t.eltern.regel = {};
    t.eltern.kinder.splice(t.index, 1);
    knoten.push(t.knoten);
  }
  const eltern = zielEltern ? finde(wurzel, zielEltern)?.knoten : wurzel;
  if (!eltern) return null;
  if (knoten.some((k, i) => eltern.kinder.some((x) => gleich(x.name, k.name)) || knoten.some((m, j) => j !== i && gleich(m.name, k.name)))) return null;
  let index = eltern.kinder.length;
  if (wo !== 'in') {
    const name = ziel.split('/').pop()!;
    const i = eltern.kinder.findIndex((x) => gleich(x.name, name));
    if (i < 0) return null;
    index = wo === 'vor' ? i : i + 1;
  }
  eltern.kinder.splice(index, 0, ...knoten);
  return { ordner: flach(wurzel), pfade: knoten.map((k) => (zielEltern ? `${zielEltern}/${k.name}` : k.name)) };
}

/** mehrere Ordner löschen (samt Unterordnern) */
export const alleLoeschen = (ordner: OrdnerRegel[], pfade: string[]) => obersteAuswahl(pfade).reduce((o, p) => loeschen(o, p), ordner);

/** Zusätze für mehrere Ordner setzen */
export const zusatzSetzenAlle = (ordner: OrdnerRegel[], pfade: string[], patch: (r: OrdnerRegel | undefined, pfad: string) => { lph?: number[]; dateischema?: boolean }) =>
  pfade.reduce((o, p) => zusatzSetzen(o, p, patch(baumZeilen(o).find((z) => gleich(z.pfad, p))?.regel, p)), ordner);

/**
 * Mehrere Ordner aus einem Text – eine Zeile je Ordner; eingerückte Zeilen (Tab oder Leerzeichen) sind Unterordner der
 * Zeile darüber, „/“ trennt ebenfalls Unterordner. Spiegelstriche am Anfang zählen nicht mit. Zusätze nach „|“ wie in
 * der Textansicht („| LPh 6-7“, „| Dateischema“). Pfade relativ zum Ordner, in dem sie entstehen.
 */
export function ausEingerueckt(text: string): { ordner: OrdnerRegel[]; meldungen: OrdnerMeldung[] } {
  const stapel: { einzug: number; pfad: string }[] = [];
  const zeilen = text.split(/\r?\n/).map((roh) => {
    if (!roh.trim() || roh.trim().startsWith('#')) return '';
    const einzug = (/^[\t ]*/.exec(roh)?.[0] ?? '').replace(/\t/g, '    ').length;
    const [name, ...zusaetze] = roh
      .trim()
      .replace(/^[-–*•]\s+/, '')
      .split('|');
    while (stapel.length && stapel[stapel.length - 1].einzug >= einzug) stapel.pop();
    const eltern = stapel[stapel.length - 1]?.pfad ?? '';
    const pfad = normPfad(eltern ? `${eltern}/${name}` : name);
    stapel.push({ einzug, pfad });
    return [pfad, ...zusaetze].join('|');
  });
  return ordnerAusTextMitMeldungen(zeilen.join('\n'));
}
