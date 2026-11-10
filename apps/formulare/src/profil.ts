/**
 * Formularprofile: je Formular (Kennung + Stand, z. B. „nw010005|2026I“) einstellbar, welche Abschnitte die
 * Gliederung zeigt, wie Abschnitte und Felder heißen, welche Felder in den Füllstand eingehen und welche
 * zusammen als eine Angabe zählen. Gilt für alle Projekte, die dieses Formular nutzen; liegt in der App (nicht
 * im FORMA-Projekt).
 *
 * Gezählt wird in Einheiten: jedes Textfeld für sich, Kästchen einer Zeile gemeinsam als eine Auswahl
 * („Gebäudeklasse 1 2 3 4 5“ ist ausgefüllt, wenn eins angekreuzt ist). Eigene Gruppen fassen beliebige Felder
 * eines Abschnitts zu einer Einheit zusammen – etwa eine Mehrfachauswahl über mehrere Zeilen, die dann 1/1
 * statt 1/5 zählt.
 *
 * Abschnitte, Gruppen und Felder können an Bedingungen geknüpft sein (Projektmerkmal oder anderes Feld, siehe
 * bedingung.ts): Trifft die Bedingung nicht zu, entfallen sie – sie zählen nicht und sind ausgegraut.
 */

import type { Bedingung, BedingungKontext } from './bedingung';
import { bedingungAus, erfuellt } from './bedingung';
import type { Abschnitt, Feld } from './forma/felder';
import { zeilen } from './forma/felder';
import type { Formular } from './forma/formular';
import { kennung, stand } from './forma/formular';

export interface AbschnittProfil {
  /** false = in der Gliederung ausgeblendet */
  sichtbar?: boolean;
  /** eigener Titel statt des erkannten */
  titel?: string;
  /** nur erforderlich, wenn die Bedingung zutrifft */
  bedingung?: Bedingung;
}

/**
 * Wann eine Gruppe als ausgefüllt gilt: `eins` – sobald eine Angabe gemacht ist (Auswahl), `alle` – erst wenn
 * alle Felder ausgefüllt sind, `nie` – die Gruppe zählt nicht für den Füllstand.
 */
export type Regel = 'eins' | 'alle' | 'nie';

export const REGELN: { id: Regel; text: string; lang: string }[] = [
  { id: 'eins', text: 'eine genügt', lang: 'Ausgefüllt, sobald eine Angabe gemacht ist (z. B. Auswahl)' },
  { id: 'alle', text: 'alle nötig', lang: 'Ausgefüllt, wenn alle Felder ausgefüllt sind' },
  { id: 'nie', text: 'zählt nicht', lang: 'Zählt nicht für den Füllstand' },
];

/** Felder, die zusammen als eine Angabe zählen */
export interface Gruppe {
  /** eindeutig im Profil */
  id: string;
  titel?: string;
  regel: Regel;
  /** Feldschlüssel (`<Seite>:<Name>`) – die Felder direkt in dieser Gruppe */
  felder: string[];
  /** übergeordnete Gruppe: diese Gruppe ist dort ein Teil (verschachtelt) */
  in?: string;
  /** nur erforderlich, wenn die Bedingung zutrifft */
  bedingung?: Bedingung;
}

export interface FormularProfil {
  /** Abschnitt (`<Seite>:<Rahmen>`) → Einstellungen */
  abschnitte: Record<string, AbschnittProfil>;
  /** Feldschlüssel (`<Seite>:<Name>`) → zählt für den Füllstand (fehlt = ja) */
  zaehlt: Record<string, boolean>;
  /** Feldschlüssel → eigener Titel statt der erkannten Beschriftung */
  feldTitel?: Record<string, string>;
  /** eigene Gruppen; ein Feld gehört höchstens zu einer */
  gruppen?: Gruppe[];
  /** Feldschlüssel → nur erforderlich, wenn die Bedingung zutrifft */
  bedingungen?: Record<string, Bedingung>;
}

export const leeresProfil = (): FormularProfil => ({ abschnitte: {}, zaehlt: {}, feldTitel: {}, gruppen: [], bedingungen: {} });

/** Tiefe Kopie zum Ändern */
export const profilKopie = (p: FormularProfil): FormularProfil => structuredClone({ ...leeresProfil(), ...p });

/** Profil gilt je Formular und Stand; ohne Kennung nach dem Dateinamen */
export function profilSchluessel(f: Formular, name: string): string {
  const k = kennung(f);
  return k ? `${k}|${stand(f) ?? ''}` : `name|${name.replace(/\s*\(\d{4}\)\s*$/, '')}`;
}

export const abschnittId = (a: Abschnitt) => `${a.felder[0].seite}:${a.rahmen?.o.name ?? '-'}`;

export const istLeer = (p: FormularProfil) =>
  !Object.keys(p.abschnitte).length && !Object.keys(p.zaehlt).length && !Object.keys(p.feldTitel ?? {}).length && !(p.gruppen ?? []).length && !Object.keys(p.bedingungen ?? {}).length;

/** Kontext für Bedingungen im Formular: Projektmerkmale und die Werte der Felder (nach Schlüssel) */
export function formularKontext(merkmale: Record<string, string>, felder: Feld[], wert: (f: Feld) => string | boolean): BedingungKontext {
  const nach = new Map(felder.map((f) => [f.schluessel, f]));
  return { merkmale, wert: (k) => (nach.has(k) ? wert(nach.get(k)!) : undefined) };
}

/** Ist der Abschnitt erforderlich (ohne Kontext: immer)? */
export const abschnittErforderlich = (a: Abschnitt, p: FormularProfil, k?: BedingungKontext) => !k || erfuellt(p.abschnitte[abschnittId(a)]?.bedingung, k);

/** Ist das Feld selbst erforderlich – nach seiner eigenen Bedingung, der seiner Gruppe und seines Abschnitts? */
export function feldErforderlich(f: Feld, a: Abschnitt | undefined, p: FormularProfil, k: BedingungKontext): boolean {
  if (a && !abschnittErforderlich(a, p, k)) return false;
  const g = gruppeVon(p, f.schluessel);
  if (g && !erfuellt(g.bedingung, k)) return false;
  return erfuellt(p.bedingungen?.[f.schluessel], k);
}

/** Titel eines Felds: der eigene, sonst die erkannte Beschriftung */
export const feldTitel = (f: Feld, p: FormularProfil) => p.feldTitel?.[f.schluessel]?.trim() || f.beschriftung;

/** Gruppe, zu der ein Feld gehört */
export const gruppeVon = (p: FormularProfil, schluessel: string) => (p.gruppen ?? []).find((g) => g.felder.includes(schluessel));

/** Untergruppen einer Gruppe (direkt darin) */
export const untergruppen = (p: FormularProfil, id: string) => (p.gruppen ?? []).filter((g) => g.in === id && g.id !== id);

/** übergeordnete Gruppe, wenn es sie gibt */
export const obereGruppe = (p: FormularProfil, g: Gruppe) => (g.in ? (p.gruppen ?? []).find((x) => x.id === g.in) : undefined);

/** alle Felder einer Gruppe samt ihrer Untergruppen */
export function alleFelder(p: FormularProfil, g: Gruppe, gesehen = new Set<string>()): string[] {
  if (gesehen.has(g.id)) return [];
  gesehen.add(g.id);
  return [...g.felder, ...untergruppen(p, g.id).flatMap((u) => alleFelder(p, u, gesehen))];
}

/** Liegt die Gruppe `id` in `oben` (auf irgendeiner Ebene) oder ist sie es? */
export function liegtIn(p: FormularProfil, id: string, oben: string): boolean {
  const gesehen = new Set<string>();
  let x: Gruppe | undefined = (p.gruppen ?? []).find((g) => g.id === id);
  while (x && !gesehen.has(x.id)) {
    if (x.id === oben) return true;
    gesehen.add(x.id);
    x = obereGruppe(p, x);
  }
  return false;
}

/** oberste Gruppen (ohne übergeordnete), die Felder dieses Abschnitts enthalten – in der Reihenfolge ihres ersten Felds */
export function gruppenIm(a: Abschnitt, p: FormularProfil): Gruppe[] {
  const index = new Map(a.felder.map((f, i) => [f.schluessel, i]));
  const felder = (g: Gruppe) => alleFelder(p, g);
  const erstes = (g: Gruppe) => Math.min(...felder(g).map((s) => index.get(s) ?? Infinity));
  return (p.gruppen ?? []).filter((g) => !obereGruppe(p, g) && felder(g).some((s) => index.has(s))).sort((x, y) => erstes(x) - erstes(y));
}

export interface Einheit {
  /** stabil: `g:<Gruppe>` für eigene Gruppen, sonst der Schlüssel des ersten Felds */
  id: string;
  felder: Feld[];
  art: 'text' | 'auswahl' | 'gruppe';
  /** `eins`: ausgefüllt, sobald ein Feld ausgefüllt ist; `alle`: erst wenn alle */
  regel: 'eins' | 'alle';
  gruppe?: Gruppe;
  /** Gruppe: ihre Teile – Felder direkt darin und Untergruppen (verschachtelt) */
  teile?: (EinheitFeld | Einheit)[];
  /** nach den Bedingungen (noch) nicht erforderlich – zählt nicht */
  entfaellt?: boolean;
}

/** Feld als Teil einer Gruppe */
export interface EinheitFeld {
  feld: Feld;
  entfaellt?: boolean;
}

/**
 * Zähleinheiten eines Abschnitts unter Beachtung des Profils, in Lesereihenfolge. Mit Kontext sind Einheiten,
 * deren Bedingung nicht zutrifft, als `entfaellt` markiert (Gruppe: ihre Bedingung; sonst: entfällt, wenn alle
 * ihre Felder entfallen; der Abschnitt wird hier nicht geprüft).
 */
export function einheiten(a: Abschnitt, profil: FormularProfil, k?: BedingungKontext): Einheit[] {
  const index = new Map(a.felder.map((f, i) => [f.schluessel, i]));
  const gruppen = gruppenIm(a, profil);
  const gruppiert = new Set(gruppen.flatMap((g) => alleFelder(profil, g)));
  const out: Einheit[] = [];
  // eine Gruppe mit ihren Teilen; Untergruppen, die nicht zählen, fallen weg
  const gruppenEinheit = (g: Gruppe, gesehen: Set<string>): Einheit => {
    gesehen.add(g.id);
    const alle = new Set(alleFelder(profil, g));
    const felder = a.felder.filter((f) => alle.has(f.schluessel));
    const eigene: EinheitFeld[] = a.felder
      .filter((f) => g.felder.includes(f.schluessel))
      .map((feld) => ({ feld, ...(k && !erfuellt(profil.bedingungen?.[feld.schluessel], k) ? { entfaellt: true } : {}) }));
    const unter = untergruppen(profil, g.id)
      .filter((u) => u.regel !== 'nie' && !gesehen.has(u.id))
      .map((u) => gruppenEinheit(u, gesehen))
      .filter((e) => e.felder.length);
    for (const u of unter) if (k && !erfuellt(u.gruppe!.bedingung, k)) u.entfaellt = true;
    return { id: `g:${g.id}`, felder, art: 'gruppe', regel: g.regel === 'alle' ? 'alle' : 'eins', gruppe: g, teile: [...eigene, ...unter] };
  };
  for (const g of gruppen) {
    if (g.regel === 'nie') continue;
    const e = gruppenEinheit(g, new Set());
    if (e.felder.length) out.push(e);
  }
  const frei = a.felder.filter((f) => !gruppiert.has(f.schluessel) && profil.zaehlt[f.schluessel] !== false);
  for (const f of frei) if (f.art === 'text') out.push({ id: f.schluessel, felder: [f], art: 'text', regel: 'eins' });
  for (const z of zeilen(frei.filter((f) => f.art === 'kreuz'))) out.push({ id: z[0].schluessel, felder: z, art: 'auswahl', regel: 'eins' });
  const erstes = (e: Einheit) => Math.min(...e.felder.map((f) => index.get(f.schluessel)!));
  if (k)
    for (const e of out) {
      const weg = e.gruppe ? !erfuellt(e.gruppe.bedingung, k) : e.felder.every((f) => !erfuellt(profil.bedingungen?.[f.schluessel], k));
      if (weg) e.entfaellt = true;
    }
  return out.sort((x, y) => erstes(x) - erstes(y));
}

/** Titel einer Einheit: Name der Gruppe, sonst die Titel ihrer Felder */
export function einheitTitel(e: Einheit, p: FormularProfil): string {
  return e.gruppe?.titel?.trim() || e.felder.map((f) => feldTitel(f, p)).join(' / ');
}

const gefuellt = (w: string | boolean) => w === true || (typeof w === 'string' && w.trim() !== '');

/**
 * Einheit ausgefüllt: je nach Regel ein bzw. alle Teile – Felder mit Text oder Kreuz, Untergruppen nach ihrer eigenen
 * Regel. Teile, deren Bedingung nicht zutrifft, zählen nicht mit.
 */
export function ausgefuellt(e: Einheit, wert: (f: Feld) => string | boolean): boolean {
  if (e.teile) {
    const zaehlen = e.teile.filter((t) => !t.entfaellt);
    if (!zaehlen.length) return false;
    const ok = (t: EinheitFeld | Einheit) => ('feld' in t ? gefuellt(wert(t.feld)) : ausgefuellt(t, wert));
    return e.regel === 'alle' ? zaehlen.every(ok) : zaehlen.some(ok);
  }
  return e.regel === 'alle' ? e.felder.every((f) => gefuellt(wert(f))) : e.felder.some((f) => gefuellt(wert(f)));
}

/** Gruppen ohne Felder und ohne Untergruppen entfallen (auch mehrstufig) */
function ohneLeere(gruppen: Gruppe[]): Gruppe[] {
  let liste = gruppen;
  for (;;) {
    const weg = liste.filter((g) => !g.felder.length && !liste.some((u) => u.in === g.id));
    if (!weg.length) return liste;
    liste = liste.filter((g) => !weg.includes(g));
  }
}

/**
 * Neue Gruppe aus Feldern und – verschachtelt – Gruppen. Die Felder kommen aus ihren bisherigen Gruppen, die Gruppen
 * werden Teil der neuen. Liegt alles Gewählte in derselben Gruppe, wird die neue dort eingehängt. Leere Gruppen
 * entfallen.
 */
export function gruppeBilden(p: FormularProfil, felder: string[], regel: Regel = 'eins', gruppen: string[] = []): FormularProfil {
  const neu = profilKopie(p);
  const ids = new Set(neu.gruppen!.map((g) => g.id));
  let n = neu.gruppen!.length + 1;
  while (ids.has(`g${n}`)) n++;
  const id = `g${n}`;
  const eltern = new Set([...felder.map((s) => gruppeVon(p, s)?.id ?? ''), ...gruppen.map((gid) => (p.gruppen ?? []).find((g) => g.id === gid)?.in ?? '')]);
  const oben = eltern.size === 1 ? [...eltern][0] : '';
  neu.gruppen = neu.gruppen!.map((g) => ({ ...g, felder: g.felder.filter((s) => !felder.includes(s)), ...(gruppen.includes(g.id) ? { in: id } : {}) }));
  neu.gruppen.push({ id, regel, felder: [...new Set(felder)], ...(oben && !gruppen.includes(oben) ? { in: oben } : {}) });
  neu.gruppen = ohneLeere(neu.gruppen);
  return neu;
}

/** Feld aus seiner Gruppe nehmen – in die übergeordnete Gruppe, sonst zählt es wieder einzeln; leere Gruppen entfallen */
export function ausGruppe(p: FormularProfil, schluessel: string): FormularProfil {
  const neu = profilKopie(p);
  const g = gruppeVon(neu, schluessel);
  const oben = g && obereGruppe(neu, g);
  neu.gruppen = neu.gruppen!.map((x) => ({ ...x, felder: x === g ? x.felder.filter((s) => s !== schluessel) : x === oben ? [...x.felder, schluessel] : x.felder }));
  neu.gruppen = ohneLeere(neu.gruppen);
  return neu;
}

/** Gruppe eine Ebene höher (aus ihrer übergeordneten Gruppe heraus) */
export function gruppeHoch(p: FormularProfil, id: string): FormularProfil {
  const neu = profilKopie(p);
  neu.gruppen = ohneLeere(
    neu.gruppen!.map((g) => {
      if (g.id !== id) return g;
      const oben = obereGruppe(neu, g);
      const { in: _alt, ...rest } = g;
      return oben?.in ? { ...rest, in: oben.in } : rest;
    }),
  );
  return neu;
}

/** Gruppe auflösen: ihre Felder und Untergruppen kommen eine Ebene höher (ganz oben zählen die Felder einzeln) */
export function gruppeAufloesen(p: FormularProfil, id: string): FormularProfil {
  const neu = profilKopie(p);
  const g = neu.gruppen!.find((x) => x.id === id);
  if (!g) return neu;
  const oben = g.in;
  neu.gruppen = ohneLeere(
    neu
      .gruppen!.filter((x) => x.id !== id)
      .map((x) => {
        if (x.in === id) {
          const { in: _alt, ...rest } = x;
          return oben ? { ...rest, in: oben } : rest;
        }
        return x.id === oben ? { ...x, felder: [...x.felder, ...g.felder] } : x;
      }),
  );
  return neu;
}

/** Profil ohne Einträge, die dem Standard entsprechen (sichtbar, ohne eigenen Titel, zählt mit, keine Gruppen) */
export function bereinigt(p: FormularProfil): FormularProfil {
  const abschnitte: Record<string, AbschnittProfil> = {};
  for (const [k, v] of Object.entries(p.abschnitte)) {
    const e: AbschnittProfil = {};
    if (v.sichtbar === false) e.sichtbar = false;
    if (v.titel?.trim()) e.titel = v.titel.trim();
    const b = bedingungAus(v.bedingung);
    if (b) e.bedingung = b;
    if (Object.keys(e).length) abschnitte[k] = e;
  }
  const zaehlt = Object.fromEntries(Object.entries(p.zaehlt).filter(([, v]) => v === false));
  const out: FormularProfil = { abschnitte, zaehlt };
  const titel = Object.fromEntries(
    Object.entries(p.feldTitel ?? {})
      .map(([k, v]) => [k, v.trim()])
      .filter(([, v]) => v),
  );
  if (Object.keys(titel).length) out.feldTitel = titel;
  const vergeben = new Set<string>();
  let gruppen: Gruppe[] = [];
  const ids = new Set((p.gruppen ?? []).map((g) => g.id));
  for (const g of p.gruppen ?? []) {
    const felder = (Array.isArray(g.felder) ? g.felder : []).filter((s) => !vergeben.has(s) && vergeben.add(s));
    const e: Gruppe = { id: g.id, regel: REGELN.some((r) => r.id === g.regel) ? g.regel : 'eins', felder };
    if (g.titel?.trim()) e.titel = g.titel.trim();
    if (typeof g.in === 'string' && g.in !== g.id && ids.has(g.in)) e.in = g.in;
    const b = bedingungAus(g.bedingung);
    if (b) e.bedingung = b;
    gruppen.push(e);
  }
  // Kreise auflösen: eine Gruppe, die (über andere) in sich selbst läge, kommt nach oben
  const probe: FormularProfil = { abschnitte: {}, zaehlt: {}, gruppen };
  gruppen = gruppen.map((g) => (g.in && liegtIn(probe, g.in, g.id) ? (({ in: _x, ...rest }) => rest)(g) : g));
  gruppen = ohneLeere(gruppen);
  if (gruppen.length) out.gruppen = gruppen;
  const bedingungen = Object.fromEntries(
    Object.entries(p.bedingungen ?? {}).flatMap(([k, v]) => {
      const b = bedingungAus(v);
      return b ? [[k, b]] : [];
    }),
  );
  if (Object.keys(bedingungen).length) out.bedingungen = bedingungen;
  return out;
}
