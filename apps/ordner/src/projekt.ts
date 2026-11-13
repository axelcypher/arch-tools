import type { Namensschema } from '@core/namensschema';
import { readProjectFile } from '@core/archive';
import type { Beteiligter, ProjectMeta, ProjektordnerAngaben, ProjektStatus } from '@core/model';
import type { ProjektordnerZugriff } from '@core/platform/projektordner';
import { projektdateiFinden, projektdateiKopf, projektdateiSchreiben, projekteAuflisten } from '@core/platform/projektordner';
import { projektdateien, projektdateiWaehlen } from '@core/projektdatei';
import type { Eintrag } from './dateisystem';
import type { ProjektAngaben } from './stammdaten';
import { angabenAusProjekt, leseProjektJson, mitAlterProjektJson, PROJEKT_DATEI } from './stammdaten';
import type { ProjektQuelle } from './pruefung';

/**
 * Vorhandenes Projekt einlesen: Projektordner mit seinen Einträgen, die Projektdatei (.oap) darin und – als
 * Übergang – die alte projekt.json (bis 0.2), die nur noch gelesen wird. Fehlt die Projektdatei, ist das kein
 * Fehler: Der Assistent erfasst dann die Stammdaten und legt sie an.
 */

/** ein eingelesener Projektordner (Desktop: mit vollständigem Pfad, Browser: nur Name) */
export interface GeladenerOrdner {
  /** vollständiger Pfad (Desktop) bzw. leer im Browser */
  pfad: string;
  name: string;
  eintraege: Eintrag[];
  lies: (pfad: string) => Promise<Uint8Array>;
}

export interface GeladenesProjekt {
  /** Angaben zum Projekt; null, wenn es weder Projektdatei noch alte projekt.json gibt */
  angaben: ProjektAngaben | null;
  quelle: ProjektQuelle;
  /** die Projektdatei, so wie sie gelesen wurde – Grundlage für gezielte Änderungen */
  projektdatei: { pfad: string; meta: ProjectMeta; projektordner?: ProjektordnerAngaben; namensschema?: Namensschema } | null;
  /** alle Projektdateien im Ordner */
  kandidaten: string[];
}

export async function projektEinlesen(o: GeladenerOrdner, gewaehlt?: string | null): Promise<GeladenesProjekt> {
  const kandidaten = projektdateien(o.eintraege).map((e) => e.pfad);
  let alt: ProjektAngaben | null = null;
  // eine fremde oder kaputte projekt.json zählt nicht – wird aber gemeldet (Hinweis), die Datei bleibt unangetastet
  let altDefekt: string | undefined;
  const json = o.eintraege.find((e) => !e.ordner && e.pfad.toLowerCase() === PROJEKT_DATEI);
  if (json) {
    try {
      alt = leseProjektJson(new TextDecoder('utf-8').decode(await o.lies(json.pfad)));
    } catch (e) {
      altDefekt = e instanceof Error ? e.message : String(e);
    }
  }
  const defekt = altDefekt ? { alteProjektJsonDefekt: altDefekt } : {};
  const datei = projektdateiWaehlen(o.eintraege, gewaehlt);
  if (!datei) return { angaben: alt, quelle: alt ? { alteProjektJson: true } : defekt, projektdatei: null, kandidaten };
  try {
    const p = readProjectFile(await o.lies(datei.pfad));
    const angaben = angabenAusProjekt(p);
    return {
      // Lücken (etwa Kurzname oder Leistungsphasen aus der Zeit vor der Projektdatei) aus der alten projekt.json
      angaben: alt ? mitAlterProjektJson(angaben, alt) : angaben,
      quelle: { pfad: datei.pfad, ...defekt },
      projektdatei: { pfad: datei.pfad, meta: p.meta, ...(p.projektordner ? { projektordner: p.projektordner } : {}), ...(p.namensschema ? { namensschema: p.namensschema } : {}) },
      kandidaten,
    };
  } catch (e) {
    return { angaben: alt, quelle: { pfad: datei.pfad, fehler: e instanceof Error ? e.message : String(e), ...defekt }, projektdatei: null, kandidaten };
  }
}

/**
 * Status eines Projekts setzen (P-15, „Projekt abschließen“): nur `meta.status` in der Projektdatei – frisch gelesen,
 * alles andere bleibt, wie es ist (auch Abschnitte anderer Apps und alle übrigen Einträge des Archivs). „aktiv“ ist
 * der Normalfall und steht nicht in der Datei – außer mit `ausdruecklich` (Projekt in einem Archiv- bzw. Akquiseordner,
 * dessen Stand sonst gälte). Ohne Projektdatei geht es nicht – dann zuerst ergänzen.
 */
export async function projektStatusSetzen(fs: ProjektordnerZugriff, projektordner: string, status: ProjektStatus, { ausdruecklich = false } = {}): Promise<void> {
  const datei = await projektdateiFinden(fs, projektordner);
  if (!datei) throw new Error('Das Projekt hat noch keine Projektdatei (.oap) – bitte zuerst im Assistenten ergänzen.');
  await projektdateiSchreiben(fs, projektordner, datei.pfad, (roh) => {
    const meta = { ...((roh.meta ?? {}) as Record<string, unknown>) };
    if (status === 'aktiv' && !ausdruecklich) delete meta.status;
    else meta.status = status;
    return { ...roh, meta };
  });
}

/**
 * Beteiligte aus den Projektdateien der Stammordner – Vorschläge für neue Projekte (P-14). Gelesen werden nur die
 * Stammdaten (projekt.json in der Projektdatei) der zuletzt geänderten `max` Projektordner, einige gleichzeitig;
 * je Name zählt der Eintrag aus dem jüngsten Projekt. Nicht lesbare Projekte werden übergangen.
 */
export async function beteiligteSammeln(fs: ProjektordnerZugriff, roots: string[], max = 60): Promise<Beteiligter[]> {
  const { projekte } = await projekteAuflisten(fs, roots);
  const warteschlange = [...projekte].sort((a, b) => b.geaendert - a.geaendert).slice(0, max);
  const je: Beteiligter[][] = warteschlange.map(() => []);
  let naechster = 0;
  const arbeiter = async () => {
    while (naechster < warteschlange.length) {
      const i = naechster++;
      try {
        const datei = await projektdateiFinden(fs, warteschlange[i].pfad);
        const kopf = datei ? await projektdateiKopf(fs, warteschlange[i].pfad, datei.pfad) : null;
        je[i] = kopf?.meta.beteiligte ?? [];
      } catch {
        // nicht lesbar: übergehen
      }
    }
  };
  await Promise.all([arbeiter(), arbeiter(), arbeiter(), arbeiter()]);
  const out = new Map<string, Beteiligter>();
  for (const liste of je) for (const b of liste) if (b.name.trim() && !out.has(b.name.trim().toLowerCase())) out.set(b.name.trim().toLowerCase(), b);
  return [...out.values()].sort((a, b) => a.name.localeCompare(b.name, 'de'));
}
