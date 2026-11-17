import type { PfadSpeicher, PfadWert } from './verzeichnis';

/**
 * Fester Zielordner der Antragsdokumente von PERMIO: relativ zum Antragsordner (Vorgabe `{Antrag}`), damit er einer
 * Änderung des Antragsordners folgt. Bis 0.x stand er als vollständiger Pfad relativ zum Projektordner unter
 * `allgemein.pfade['plaene.permio.zielpfad']` (Vorgabe `TÖB/{Antrag}`).
 *
 * Übernahme ohne Verlust (`zielGruppeLesen`), solange noch kein neuer Schlüssel steht – war nie etwas eingestellt, gilt
 * die neue Vorgabe (im Antragsordner, auch wenn er nicht „TÖB“ heißt):
 *  - beginnt der bisherige Wert mit dem Antragsordner und „/“, wird dieser Teil abgeschnitten
 *  - sonst bleibt er als abweichender Ordner relativ zum Projektordner erhalten (Eintrag `plaene.permio.zielpfad`)
 * PERMIO schreibt danach in denselben Ordner wie vorher. Beim Schreiben steht der wirksame Pfad weiter unter dem alten
 * Schlüssel, damit ältere Versionen auf anderen Rechnern gleich weiterarbeiten – auch wenn sich der Antragsordner ändert
 * (`antragsordnerSpeicher`).
 */

export const VORGABE_ANTRAGSORDNER = 'TÖB';
export const VORGABE_ZIELORDNER = '{Antrag}';
/** bisherige Vorgabe (relativ zum Projektordner) */
export const VORGABE_ZIELPFAD_ALT = `${VORGABE_ANTRAGSORDNER}/${VORGABE_ZIELORDNER}`;

/** Schlüssel unter `allgemein.pfade` */
export const SCHLUESSEL = {
  antragsordner: 'ablage.permio.antragsordner',
  zielordner: 'plaene.permio.zielordner',
  abweichend: 'plaene.permio.zielpfad.abweichend',
  alt: 'plaene.permio.zielpfad',
} as const;

export interface ZielGruppe {
  antragsordner: string;
  /** relativ zum Antragsordner */
  zielordner: string;
  /** abweichend relativ zum Projektordner; leer = der Zielordner im Antragsordner */
  abweichend: string;
}

const objekt = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const text = (v: unknown): string | undefined => (typeof v === 'string' ? v.trim() : undefined);
const teile = (v: string) =>
  v
    .split(/[\\/]+/)
    .map((t) => t.trim())
    .filter(Boolean);

/** wirksamer Zielordner relativ zum Projektordner (Vorlage mit Platzhaltern) */
export function zielpfadWirksam(g: ZielGruppe): string {
  return g.abweichend.trim() || [...teile(g.antragsordner), ...teile(g.zielordner)].join('/');
}

/** ein Pfad relativ zum Projektordner in der neuen Form: im Antragsordner → relativ dazu, sonst abweichend */
export function zielAusPfad(pfad: string, antragsordner: string): Pick<ZielGruppe, 'zielordner' | 'abweichend'> {
  const p = teile(pfad);
  const a = teile(antragsordner);
  const drin = a.length > 0 && p.length > a.length && a.every((t, i) => t.toLowerCase() === p[i].toLowerCase());
  return drin ? { zielordner: p.slice(a.length).join('/'), abweichend: '' } : { zielordner: VORGABE_ZIELORDNER, abweichend: p.join('/') };
}

/**
 * Zielordner aus `allgemein.pfade` – neue Schlüssel, sonst Übernahme aus dem bisherigen. Grenze wie bei den gemeinsamen
 * Angaben: Steht ein neuer Schlüssel, gilt der alte nicht mehr (docs/suite.md, „Baum“).
 */
export function zielGruppeLesen(pfade: Record<string, unknown>): ZielGruppe {
  const antragsordner = text(pfade[SCHLUESSEL.antragsordner]) || VORGABE_ANTRAGSORDNER;
  const neu = text(pfade[SCHLUESSEL.zielordner]) !== undefined || text(pfade[SCHLUESSEL.abweichend]) !== undefined;
  if (neu) return { antragsordner, zielordner: text(pfade[SCHLUESSEL.zielordner]) ?? VORGABE_ZIELORDNER, abweichend: text(pfade[SCHLUESSEL.abweichend]) ?? '' };
  // nie eingestellt: die Vorgabe, die jetzt dem Antragsordner folgt (bisher galt fest „TÖB/{Antrag}“ – auch bei anderem Antragsordner)
  const alt = text(pfade[SCHLUESSEL.alt]);
  return { antragsordner, ...(alt ? zielAusPfad(alt, antragsordner) : { zielordner: VORGABE_ZIELORDNER, abweichend: '' }) };
}

/** Rohdaten mit der Gruppe: neue Schlüssel (Vorgabe = kein Eintrag), Antragsordner, und der wirksame Pfad unter dem alten */
function zielGruppeSchreiben(roh: Record<string, unknown>, g: ZielGruppe): Record<string, unknown> {
  const pfade = { ...objekt(roh.pfade) };
  const setze = (k: string, v: string, vorgabe: string) => {
    if (v === vorgabe) delete pfade[k];
    else pfade[k] = v;
  };
  setze(SCHLUESSEL.antragsordner, g.antragsordner, VORGABE_ANTRAGSORDNER);
  setze(SCHLUESSEL.zielordner, g.zielordner, VORGABE_ZIELORDNER);
  setze(SCHLUESSEL.abweichend, g.abweichend, '');
  setze(SCHLUESSEL.alt, zielpfadWirksam(g), VORGABE_ZIELPFAD_ALT);
  return { ...roh, pfade };
}

/** Speicher des Zielordners (`zielordner`) bzw. des abweichenden Ordners (`abweichend`) */
export function zielSpeicher(teil: 'zielordner' | 'abweichend'): PfadSpeicher {
  const vorgabe = teil === 'zielordner' ? VORGABE_ZIELORDNER : '';
  return {
    bereich: 'allgemein',
    lesen: (roh) => {
      const v = zielGruppeLesen(objekt(roh.pfade))[teil];
      return v === vorgabe ? undefined : v;
    },
    schreiben: (roh, wert: PfadWert | undefined) => {
      const g = zielGruppeLesen(objekt(roh.pfade));
      const v = wert === undefined ? vorgabe : String(wert).trim();
      // ein abweichender Ordner im Antragsordner ist keiner: er wird der Zielordner relativ zum Antragsordner
      const z = zielAusPfad(v, g.antragsordner);
      // außerhalb bleibt der Zielordner im Antragsordner, wie er war (er gilt wieder, sobald der abweichende leer ist)
      const neu: ZielGruppe = teil === 'zielordner' ? { ...g, zielordner: v } : !v ? { ...g, abweichend: '' } : z.abweichend ? { ...g, abweichend: z.abweichend } : { ...g, ...z };
      return zielGruppeSchreiben(roh, neu);
    },
  };
}

/** Speicher des Antragsordners: der Zielordner zieht mit, der wirksame Pfad für ältere Versionen ebenso */
export function antragsordnerSpeicher(): PfadSpeicher {
  return {
    bereich: 'allgemein',
    lesen: (roh) => {
      const v = text(objekt(roh.pfade)[SCHLUESSEL.antragsordner]);
      return v ? v : undefined;
    },
    schreiben: (roh, wert: PfadWert | undefined) => {
      // die Gruppe vor der Änderung (auch übernommen aus dem alten Schlüssel), dann mit dem neuen Antragsordner
      const g = zielGruppeLesen(objekt(roh.pfade));
      return zielGruppeSchreiben(roh, { ...g, antragsordner: wert === undefined ? VORGABE_ANTRAGSORDNER : String(wert).trim() || VORGABE_ANTRAGSORDNER });
    },
  };
}
