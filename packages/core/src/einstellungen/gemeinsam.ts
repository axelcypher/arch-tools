import type { PfadSpeicher, PfadWert } from './verzeichnis';

/**
 * Gemeinsame Angaben mit optionaler Abweichung je App (Grundsatz in docs/design.md, „Einstellungen“): Was mehrere Apps
 * gleich nutzen, steht einmal auf „Pfade und Benennung“. Je App gibt es nur auf Wunsch eine Abweichung; steht dort
 * nichts, gilt die gemeinsame Angabe.
 *
 * Für den direkten Export von QUADRIO, TERRIO und NUMIO:
 *  - Berechnungsordner: gemeinsamer Ordner relativ zum Projektordner, je App ein Unterordner darin (leer = direkt darin)
 *  - Dateinamen Excel und PDF: gemeinsames Schema, je App ein abweichendes (leer = das gemeinsame)
 *
 * Gespeichert unter neuen Schlüsseln in `allgemein.pfade`. Bis 0.x stand je App ein vollständiger Wert unter
 * `export.berechnungsordner.<app>`, `export.excel.<app>` und `export.pdf.<app>`: Gibt es noch keinen neuen Schlüssel, gilt
 * die Übernahme daraus (`ausAlten`) – verlustfrei, jede App schreibt danach in denselben Ordner wie vorher. Beim
 * Schreiben gehen die wirksamen Werte zusätzlich unter die alten Schlüssel, damit ältere Versionen auf anderen Rechnern
 * (Netzwerkinstallation) gleich weiterarbeiten.
 */

export const EXPORT_APPS = ['flaechenrechner', 'grz', 'kosten'] as const;
export type ExportApp = (typeof EXPORT_APPS)[number];

/** die drei Gruppen gemeinsamer Angaben */
export type ExportGruppe = 'ordner' | 'excel' | 'pdf';

export const VORGABE_EXPORT_DATEINAME = '{PROJEKT_KUERZEL} {DATUM} {Inhalt}';
/** gemeinsamer Berechnungsordner und Unterordner je App – zusammen die bisherigen Vorgaben (Struktur von ATLAS) */
export const VORGABE_GEMEINSAMER_BERECHNUNGSORDNER = '03 Berechnungen';
export const VORGABE_UNTERORDNER: Record<ExportApp, string> = { flaechenrechner: 'Flächen', grz: 'Nachweise', kosten: 'Kosten' };
/** bisherige Vorgaben je App (vollständig) */
export const VORGABE_BERECHNUNGSORDNER: Record<ExportApp, string> = {
  flaechenrechner: `${VORGABE_GEMEINSAMER_BERECHNUNGSORDNER}/${VORGABE_UNTERORDNER.flaechenrechner}`,
  grz: `${VORGABE_GEMEINSAMER_BERECHNUNGSORDNER}/${VORGABE_UNTERORDNER.grz}`,
  kosten: `${VORGABE_GEMEINSAMER_BERECHNUNGSORDNER}/${VORGABE_UNTERORDNER.kosten}`,
};

/** Kennungen (zugleich Schlüssel unter `allgemein.pfade`) */
export const gemeinsamId = (g: ExportGruppe) => (g === 'ordner' ? 'export.berechnungsordner' : `export.${g}`);
export const abweichungId = (g: ExportGruppe, app: ExportApp) => (g === 'ordner' ? `export.unterordner.${app}` : `export.${g}.abweichend.${app}`);
/** bisheriger Schlüssel je App (vollständiger Wert) */
export const alterSchluessel = (g: ExportGruppe, app: ExportApp) => (g === 'ordner' ? `export.berechnungsordner.${app}` : `export.${g}.${app}`);

const vorgabeGemeinsam = (g: ExportGruppe) => (g === 'ordner' ? VORGABE_GEMEINSAMER_BERECHNUNGSORDNER : VORGABE_EXPORT_DATEINAME);
const vorgabeAbweichung = (g: ExportGruppe, app: ExportApp) => (g === 'ordner' ? VORGABE_UNTERORDNER[app] : '');
const vorgabeAlt = (g: ExportGruppe, app: ExportApp) => (g === 'ordner' ? VORGABE_BERECHNUNGSORDNER[app] : VORGABE_EXPORT_DATEINAME);

export interface GemeinsamUndJeApp {
  gemeinsam: string;
  je: Record<ExportApp, string>;
}

/** Teile eines Ordners; „.“ fällt weg (so steht der Projektordner selbst unter den alten Schlüsseln, siehe `gruppeSchreiben`) */
const normPfad = (v: string) =>
  v
    .split(/[\\/]+/)
    .map((t) => t.trim())
    .filter((t) => t && t !== '.');

/** Ordner relativ zum Projektordner: der gemeinsame und darin der Unterordner der App */
export const ordnerVerbinden = (gemeinsam: string, unter: string): string => [...normPfad(gemeinsam), ...normPfad(unter)].join('/');

/** was mit einer Abweichung gilt: Unterordner im gemeinsamen Ordner bzw. eigener Wert statt des gemeinsamen (leer = der gemeinsame) */
export function wirksamAus(art: 'unterordner' | 'ersetzt', gemeinsam: string, abweichung: string): string {
  return art === 'unterordner' ? ordnerVerbinden(gemeinsam, abweichung) : abweichung.trim() || gemeinsam;
}

/** was für eine App gilt: Ordner verbunden, Namen ersetzt */
export function wirksamFuer(g: ExportGruppe, w: GemeinsamUndJeApp, app: ExportApp): string {
  return wirksamAus(g === 'ordner' ? 'unterordner' : 'ersetzt', w.gemeinsam, w.je[app]);
}

/**
 * Übernahme aus den bisherigen vollständigen Werten je App – verlustfrei (`wirksamFuer` ergibt je App denselben Wert):
 *  - Ordner: gemeinsam ist der längste gemeinsame Anfang (ganze Ordner), je App der Rest; ohne gemeinsamen Anfang ist der
 *    gemeinsame Ordner der Projektordner selbst (leer) und jede App behält ihren Ordner als Unterordner
 *  - Namen: gemeinsam ist der häufigste Wert (bei Gleichstand der erste in der Reihenfolge QUADRIO, TERRIO, NUMIO), die
 *    übrigen werden Abweichungen
 */
export function ausAlten(g: ExportGruppe, voll: Record<ExportApp, string>): GemeinsamUndJeApp {
  if (g === 'ordner') {
    const teile = EXPORT_APPS.map((a) => normPfad(voll[a]));
    const anfang: string[] = [];
    for (let i = 0; teile.every((t) => i < t.length && t[i] === teile[0][i]); i++) anfang.push(teile[0][i]);
    const je = Object.fromEntries(EXPORT_APPS.map((a, i) => [a, teile[i].slice(anfang.length).join('/')])) as Record<ExportApp, string>;
    return { gemeinsam: anfang.join('/'), je };
  }
  const werte = EXPORT_APPS.map((a) => voll[a].trim());
  const zahl = (v: string) => werte.filter((x) => x === v).length;
  const gemeinsam = werte.reduce((best, v) => (zahl(v) > zahl(best) ? v : best), werte[0]);
  const je = Object.fromEntries(EXPORT_APPS.map((a, i) => [a, werte[i] === gemeinsam ? '' : werte[i]])) as Record<ExportApp, string>;
  return { gemeinsam, je };
}

const objekt = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const text = (v: unknown): string | undefined => (typeof v === 'string' ? v.trim() : undefined);

/**
 * gemeinsame Angabe und Abweichungen aus `allgemein.pfade` – neue Schlüssel, sonst Übernahme aus den bisherigen, sonst
 * Vorgaben. Grenze: Steht ein neuer Schlüssel, gelten die alten nicht mehr – ändert danach eine ältere Version einen
 * alten Schlüssel, liest diese Version das nicht, und das nächste Speichern der Gruppe schreibt den wirksamen Wert
 * zurück (docs/suite.md, „Gemeinsame Angaben“).
 */
export function gruppeLesen(g: ExportGruppe, pfade: Record<string, unknown>): GemeinsamUndJeApp {
  const neu = [gemeinsamId(g), ...EXPORT_APPS.map((a) => abweichungId(g, a))].some((k) => text(pfade[k]) !== undefined);
  if (neu)
    return {
      // ein leerer Dateiname gilt nicht (Pflicht) – dann die Vorgabe; ein leerer Ordner ist der Projektordner
      gemeinsam: (g === 'ordner' ? text(pfade[gemeinsamId(g)]) : text(pfade[gemeinsamId(g)]) || undefined) ?? vorgabeGemeinsam(g),
      je: Object.fromEntries(EXPORT_APPS.map((a) => [a, text(pfade[abweichungId(g, a)]) ?? vorgabeAbweichung(g, a)])) as Record<ExportApp, string>,
    };
  const alt = EXPORT_APPS.map((a) => text(pfade[alterSchluessel(g, a)]));
  if (alt.every((v) => v === undefined)) return { gemeinsam: vorgabeGemeinsam(g), je: Object.fromEntries(EXPORT_APPS.map((a) => [a, vorgabeAbweichung(g, a)])) as Record<ExportApp, string> };
  // leere bisherige Werte galten nicht (Pflichtangaben) – dort die bisherige Vorgabe
  return ausAlten(g, Object.fromEntries(EXPORT_APPS.map((a, i) => [a, alt[i] || vorgabeAlt(g, a)])) as Record<ExportApp, string>);
}

/** Rohdaten mit der ganzen Gruppe: neue Schlüssel (Vorgabe = kein Eintrag) und, für ältere Versionen, die wirksamen Werte unter den alten */
function gruppeSchreiben(g: ExportGruppe, roh: Record<string, unknown>, w: GemeinsamUndJeApp): Record<string, unknown> {
  const pfade = { ...objekt(roh.pfade) };
  const setze = (k: string, v: string, vorgabe: string) => {
    if (v === vorgabe) delete pfade[k];
    else pfade[k] = v;
  };
  setze(gemeinsamId(g), w.gemeinsam, vorgabeGemeinsam(g));
  for (const a of EXPORT_APPS) {
    setze(abweichungId(g, a), w.je[a], vorgabeAbweichung(g, a));
    // ältere Versionen lesen einen leeren Wert als Vorgabe – der Projektordner selbst steht deshalb als „.“ (fällt dort weg)
    setze(alterSchluessel(g, a), wirksamFuer(g, w, a) || '.', vorgabeAlt(g, a));
  }
  return { ...roh, pfade };
}

/** Speicher der gemeinsamen Angabe (`app` fehlt) bzw. der Abweichung einer App – im Bereich `allgemein` */
export function gemeinsamSpeicher(g: ExportGruppe, app?: ExportApp): PfadSpeicher {
  const vorgabe = app ? vorgabeAbweichung(g, app) : vorgabeGemeinsam(g);
  const aus = (w: GemeinsamUndJeApp) => (app ? w.je[app] : w.gemeinsam);
  return {
    bereich: 'allgemein',
    lesen: (roh) => {
      const v = aus(gruppeLesen(g, objekt(roh.pfade)));
      return v === vorgabe ? undefined : v;
    },
    schreiben: (roh, wert: PfadWert | undefined) => {
      const w = gruppeLesen(g, objekt(roh.pfade));
      const v = wert === undefined ? vorgabe : String(wert).trim();
      return gruppeSchreiben(g, roh, app ? { ...w, je: { ...w.je, [app]: v } } : { ...w, gemeinsam: v });
    },
  };
}
