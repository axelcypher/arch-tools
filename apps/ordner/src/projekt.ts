import { readProjectFile } from '@core/archive';
import type { ProjectMeta, ProjektordnerAngaben } from '@core/model';
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
  projektdatei: { pfad: string; meta: ProjectMeta; projektordner?: ProjektordnerAngaben } | null;
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
      projektdatei: { pfad: datei.pfad, meta: p.meta, ...(p.projektordner ? { projektordner: p.projektordner } : {}) },
      kandidaten,
    };
  } catch (e) {
    return { angaben: alt, quelle: { pfad: datei.pfad, fehler: e instanceof Error ? e.message : String(e), ...defekt }, projektdatei: null, kandidaten };
  }
}
