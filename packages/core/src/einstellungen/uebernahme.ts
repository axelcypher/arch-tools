import { logger } from '../platform/log';
import { VORGABE_PERMIO } from './eintraege';
import { pfadSpeichern, pfadWerteLaden, type PfadWerte } from './pfade';
import { gleicherWert, type PfadWert } from './verzeichnis';

/**
 * Übernahme alter Werte, die bisher nur je Rechner im Browser-Speicher lagen (PERMIO bis 0.58: „formulare:export“), in
 * den gemeinsamen Einstellungsspeicher. Der alte Eintrag bleibt unverändert stehen (nichts geht verloren).
 *
 *  - Gemeinsam steht noch nichts: Der abweichende lokale Wert wird übernommen.
 *  - Gemeinsam steht schon ein anderer Wert (zweiter Rechner einer Netzwerkinstallation mit eigenem altem Wert): Nichts
 *    wird still überschrieben – die Seite „Pfade und Benennung“ zeigt die Abweichung und fragt, welcher gelten soll.
 *  - Jeder alte Wert wird je Rechner nur einmal übernommen bzw. entschieden – ein späteres „Vorgabe wiederherstellen“
 *    bleibt bestehen.
 *  - Der alte Berechnungsordner von PERMIO wird zusätzlicher Suchordner (neben denen der Rechen-Apps); war er die
 *    Vorgabe („Planung/Berechnungen“), ist nichts zu tun – sie ist auch die Vorgabe der zusätzlichen Suchordner.
 */

const log = logger('einstellungen');

/** alter Schlüssel der Export-Einstellungen von PERMIO (Browser-Speicher, je Rechner) */
export const PERMIO_ALT = 'formulare:export';
/** schon übernommene bzw. entschiedene alte Werte (je Rechner) */
const ENTSCHIEDEN = 'arch-tools:pfade-uebernahme';

const ALTE_FELDER: { id: string; schluessel: keyof typeof VORGABE_PERMIO; liste?: true }[] = [
  { id: 'ablage.permio.antragsordner', schluessel: 'antragsordner' },
  { id: 'plaene.permio.namensvorlage', schluessel: 'namensvorlage' },
  { id: 'plaene.permio.zielpfad', schluessel: 'zielpfad' },
  { id: 'vorlagen.permio.vorlagenordner', schluessel: 'vorlagenordner' },
  { id: 'ablage.permio.berechnungsordner', schluessel: 'berechnungsordner', liste: true },
];

/** ein alter lokaler Wert, der von der Vorgabe abweicht */
export interface AlterWert {
  id: string;
  /** Wert in der neuen Form (beim Berechnungsordner: der Ordner als zusätzlicher Suchordner) */
  wert: PfadWert;
}

/** abweichende alte Werte aus dem Inhalt von „formulare:export“; Vorgaben und Leeres zählen nicht */
export function alteWerteAus(roh: unknown): AlterWert[] {
  const o = roh && typeof roh === 'object' && !Array.isArray(roh) ? (roh as Record<string, unknown>) : {};
  const out: AlterWert[] = [];
  for (const f of ALTE_FELDER) {
    const v = typeof o[f.schluessel] === 'string' ? (o[f.schluessel] as string).trim() : '';
    if (!v || v === VORGABE_PERMIO[f.schluessel]) continue;
    out.push({ id: f.id, wert: f.liste ? [v] : v });
  }
  return out;
}

/** eine Abweichung zwischen lokalem altem und gemeinsamem Wert */
export interface Abweichung {
  id: string;
  lokal: PfadWert;
  gemeinsam: PfadWert;
  /** was „lokalen Wert übernehmen“ speichert (bei Listen: ergänzt statt ersetzt) */
  neu: PfadWert;
}

const schluessel = (id: string, lokal: PfadWert) => `${id}=${JSON.stringify(lokal)}`;

/** Was zu übernehmen ist und wo gemeinsam schon etwas anderes steht – ohne Nebenwirkungen (getestet) */
export function uebernahmePlanen(alt: AlterWert[], werte: PfadWerte, entschieden: ReadonlySet<string> = new Set()): { uebernehmen: AlterWert[]; abweichungen: Abweichung[]; gleich: AlterWert[] } {
  const uebernehmen: AlterWert[] = [];
  const abweichungen: Abweichung[] = [];
  /** gemeinsam steht schon derselbe Wert: als erledigt vermerken (ein späteres „Vorgabe wiederherstellen“ gilt) */
  const gleich: AlterWert[] = [];
  for (const a of alt) {
    // je Rechner nur einmal: schon übernommen bzw. entschieden – ein späteres „Vorgabe wiederherstellen“ gilt
    if (entschieden.has(schluessel(a.id, a.wert))) continue;
    const g = werte[a.id];
    if (g === undefined) {
      uebernehmen.push(a);
      continue;
    }
    if (Array.isArray(a.wert)) {
      const liste = Array.isArray(g) ? g : [];
      const fehlt = a.wert.filter((x) => !liste.some((y) => y.toLowerCase() === x.toLowerCase()));
      if (fehlt.length) abweichungen.push({ id: a.id, lokal: a.wert, gemeinsam: liste, neu: [...liste, ...fehlt] });
      else gleich.push(a);
    } else if (!gleicherWert(g, a.wert)) abweichungen.push({ id: a.id, lokal: a.wert, gemeinsam: g, neu: a.wert });
    else gleich.push(a);
  }
  return { uebernehmen, abweichungen, gleich };
}

function lokalLesen<T>(k: string, vorgabe: T): T {
  try {
    const roh = localStorage.getItem(k);
    return roh ? (JSON.parse(roh) as T) : vorgabe;
  } catch {
    return vorgabe;
  }
}

const entschiedenLesen = (): Set<string> => {
  const roh = lokalLesen<unknown>(ENTSCHIEDEN, []);
  return new Set(Array.isArray(roh) ? roh.filter((x): x is string => typeof x === 'string') : []);
};

/** Abweichung als entschieden vermerken (je Rechner) – sie wird danach nicht mehr gezeigt */
export function abweichungEntschieden(a: Pick<Abweichung, 'id' | 'lokal'>): void {
  const s = entschiedenLesen();
  s.add(schluessel(a.id, a.lokal));
  try {
    localStorage.setItem(ENTSCHIEDEN, JSON.stringify([...s]));
  } catch {
    // ohne Speicher erscheint der Hinweis beim nächsten Öffnen wieder
  }
}

/**
 * Alte lokale Werte übernehmen, wo gemeinsam noch nichts steht; liefert die Abweichungen, über die der Nutzer
 * entscheiden soll. Scheitert das Speichern (Notbetrieb), bleibt alles beim Alten – beim nächsten Mal erneut.
 */
export async function pfadeUebernehmen(): Promise<Abweichung[]> {
  const alt = alteWerteAus(lokalLesen<unknown>(PERMIO_ALT, null));
  if (!alt.length) return [];
  const { uebernehmen, abweichungen, gleich } = uebernahmePlanen(alt, await pfadWerteLaden(), entschiedenLesen());
  for (const a of gleich) abweichungEntschieden({ id: a.id, lokal: a.wert });
  for (const a of uebernehmen) {
    try {
      await pfadSpeichern(a.id, a.wert);
      abweichungEntschieden({ id: a.id, lokal: a.wert });
      log.info(`Übernommen aus dem Speicher dieses Rechners: ${a.id}`);
    } catch (e) {
      log.warn(`Übernahme von ${a.id} nicht gespeichert`, e);
    }
  }
  return abweichungen;
}
