/**
 * Rechtsstand des Büros: alle geholten Fassungen je Norm, unveränderlich abgelegt (Konfigurationsordner bzw. im
 * Browser im Speicher). Liefert die Fassung, die an einem Stichtag gilt, holt neue Fassungen höchstens einmal am Tag
 * je Norm (oder auf Wunsch sofort) und sagt, was sich gegenüber der vorigen Fassung geändert hat.
 *
 * Grundsätze (docs/baurecht-konzept.md, 4.4–4.7):
 *  - eine Fassung wird nur übernommen, wenn der Adapter sie plausibel fand – sonst bleibt die bisherige
 *  - jede Fassung wird einmal geschrieben und nie geändert; alte bleiben für frühere Stichtage
 *  - schlägt der Abruf fehl, arbeitet die App mit dem letzten Stand weiter und sagt es
 */

import type { Holen } from './netz';
import { holen as standardHolen } from './netz';
import type { HolenOptionen, NormKopf } from './quellen';
import { fassungHolen } from './quellen';
import { aenderungen, sha256 } from './text';
import type { Aenderungen, Fassung, QuellenRef } from './typen';

/** Ablage für Fassungen (Schlüssel → JSON) */
export interface RechtSpeicher {
  lesen(schluessel: string): Promise<unknown>;
  schreiben(schluessel: string, wert: unknown): Promise<void>;
}

/** Ablage im Arbeitsspeicher (Tests, Web-Version) */
export function speicherImArbeitsspeicher(): RechtSpeicher & { inhalt: Map<string, unknown> } {
  const inhalt = new Map<string, unknown>();
  return {
    inhalt,
    lesen: async (k) => (inhalt.has(k) ? structuredClone(inhalt.get(k)) : null),
    schreiben: async (k, w) => void inhalt.set(k, structuredClone(w)),
  };
}

/** Eintrag im Verzeichnis einer Norm */
export interface FassungsEintrag {
  gueltigAb: string;
  gueltigBis?: string;
  kennung: string;
  /** Schlüssel der Fassung in der Ablage */
  datei: string;
  abgerufen: string;
}

interface NormVerzeichnis {
  fassungen: FassungsEintrag[];
  /** letzte Prüfung an der Quelle (ISO) */
  geprueft?: string;
  /** letzter Fehler beim Prüfen */
  fehler?: string;
  /** für bedingte Abfragen */
  etag?: string;
  geaendert?: string;
}

/** Norm, wie der Rechtsstand sie braucht */
export interface NormQuelle extends NormKopf {
  quelle: QuellenRef;
}

export interface StandErgebnis {
  /** die am Stichtag geltende Fassung, soweit bekannt */
  fassung: Fassung | null;
  /** die vorige Fassung (für „was hat sich geändert“) */
  vorige?: Fassung | null;
  aenderungen?: Aenderungen;
  /** eben neu geholt */
  neu?: boolean;
  /** letzte Prüfung an der Quelle */
  geprueft?: string;
  /** Abruf fehlgeschlagen – gearbeitet wird mit dem letzten Stand */
  fehler?: string;
  /** spätere Fassungen, die nach dem Stichtag in Kraft treten */
  kuenftige?: { gueltigAb: string; url: string }[];
}

const TAG = 24 * 60 * 60 * 1000;
const sicher = (s: string) => s.replace(/[^\w.@-]+/g, '_');

/** Fassung zum Stichtag aus einer Liste: jüngstes Gültig-ab, das nicht nach dem Stichtag liegt */
export function fassungZumStichtag<T extends { gueltigAb: string; gueltigBis?: string }>(liste: T[], stichtag: string): T | undefined {
  return [...liste]
    .filter((f) => f.gueltigAb <= stichtag)
    .sort((a, b) => b.gueltigAb.localeCompare(a.gueltigAb))
    .find(() => true);
}

export class Rechtsstand {
  /** Normen, die gerade geholt werden (kein doppelter Abruf) */
  private laufend = new Map<string, Promise<StandErgebnis>>();

  constructor(
    private readonly speicher: RechtSpeicher,
    private readonly h: Holen = standardHolen,
    private readonly o: {
      /** Text eines Scans aus dem Regelpaket */
      textAusPaket?: HolenOptionen['textAusPaket'];
      /** Uhr (Tests) */
      jetzt?: () => Date;
      /** so lange gilt eine Prüfung (Vorgabe: ein Tag) */
      gueltig?: number;
    } = {},
  ) {}

  private jetzt = () => this.o.jetzt?.() ?? new Date();

  private async verzeichnis(id: string): Promise<NormVerzeichnis> {
    const v = (await this.speicher.lesen(`recht/${sicher(id)}/verzeichnis`)) as NormVerzeichnis | null;
    return v && Array.isArray(v.fassungen) ? v : { fassungen: [] };
  }

  private schreibeVerzeichnis(id: string, v: NormVerzeichnis) {
    return this.speicher.schreiben(`recht/${sicher(id)}/verzeichnis`, v);
  }

  /** alle bekannten Fassungen einer Norm (jüngste zuerst) */
  async fassungen(id: string): Promise<FassungsEintrag[]> {
    return [...(await this.verzeichnis(id)).fassungen].sort((a, b) => b.gueltigAb.localeCompare(a.gueltigAb));
  }

  async fassungLesen(e: FassungsEintrag): Promise<Fassung | null> {
    return (await this.speicher.lesen(e.datei)) as Fassung | null;
  }

  /**
   * Fassung zum Stichtag. Holt an der Quelle, wenn die letzte Prüfung älter als ein Tag ist, keine Fassung den
   * Stichtag abdeckt oder `aktualisieren` gesetzt ist.
   */
  fuer(norm: NormQuelle, stichtag: string, o: { aktualisieren?: boolean; offline?: boolean } = {}): Promise<StandErgebnis> {
    const schluessel = `${norm.id}@${stichtag}@${o.aktualisieren ? 1 : 0}`;
    let p = this.laufend.get(schluessel);
    if (!p) {
      p = this.fuerJetzt(norm, stichtag, o).finally(() => this.laufend.delete(schluessel));
      this.laufend.set(schluessel, p);
    }
    return p;
  }

  private async fuerJetzt(norm: NormQuelle, stichtag: string, o: { aktualisieren?: boolean; offline?: boolean }): Promise<StandErgebnis> {
    let v = await this.verzeichnis(norm.id);
    const deckt = fassungZumStichtag(v.fassungen, stichtag);
    const alt = !v.geprueft || this.jetzt().getTime() - Date.parse(v.geprueft) > (this.o.gueltig ?? TAG);
    let fehler: string | undefined;
    let neuGeholt: Fassung | null = null;
    // an der Quelle prüfen: auf Wunsch, nach einem Tag, oder wenn noch keine Fassung den Stichtag abdeckt – auch für
    // Stichtage in der Zukunft höchstens einmal am Tag (die künftigen Fassungen kennt die letzte Prüfung)
    if (norm.quelle.art !== 'verweis' && !o.offline && (o.aktualisieren || alt || !deckt)) {
      try {
        const zuletzt = v.fassungen.length ? await this.fassungLesen([...v.fassungen].sort((a, b) => b.abgerufen.localeCompare(a.abgerufen))[0]) : null;
        const f = await fassungHolen(this.h, norm, norm.quelle, { stichtag, vorher: zuletzt ?? undefined, textAusPaket: this.o.textAusPaket });
        v = await this.verzeichnis(norm.id);
        if (f !== 'unveraendert' && !v.fassungen.some((e) => e.kennung === f.kennung)) {
          const datei = `recht/${sicher(norm.id)}/${f.gueltigAb}_${(await kurz(f.kennung))}`;
          await this.speicher.schreiben(datei, f);
          v.fassungen.push({ gueltigAb: f.gueltigAb, ...(f.gueltigBis ? { gueltigBis: f.gueltigBis } : {}), kennung: f.kennung, datei, abgerufen: f.abgerufen });
          neuGeholt = f;
        }
        v.geprueft = this.jetzt().toISOString();
        delete v.fehler;
      } catch (e) {
        fehler = e instanceof Error ? e.message : String(e);
        v.fehler = fehler;
      }
      await this.schreibeVerzeichnis(norm.id, v);
    }
    const eintrag = fassungZumStichtag(v.fassungen, stichtag);
    const fassung = eintrag ? await this.fassungLesen(eintrag) : null;
    // vorige Fassung: die nächstältere (für die Gegenüberstellung alt/neu)
    const vorigerEintrag = eintrag ? [...v.fassungen].filter((e) => e !== eintrag && (e.gueltigAb < eintrag.gueltigAb || (e.gueltigAb === eintrag.gueltigAb && e.abgerufen < eintrag.abgerufen))).sort((a, b) => b.gueltigAb.localeCompare(a.gueltigAb) || b.abgerufen.localeCompare(a.abgerufen))[0] : undefined;
    const vorige = vorigerEintrag ? await this.fassungLesen(vorigerEintrag) : null;
    // künftige Fassungen: aus der zuletzt geholten (nicht nur der zum Stichtag), damit sie auch bei früheren Stichtagen
    // angezeigt werden
    const juengste = v.fassungen.length ? await this.fassungLesen([...v.fassungen].sort((a, b) => b.abgerufen.localeCompare(a.abgerufen))[0]) : null;
    const kuenftige = [...(fassung?.kuenftige ?? []), ...(juengste?.kuenftige ?? []), ...v.fassungen.filter((e2) => e2.gueltigAb > stichtag).map((e2) => ({ gueltigAb: e2.gueltigAb, url: '' }))]
      .filter((k, i, l) => k.gueltigAb > stichtag && l.findIndex((x) => x.gueltigAb === k.gueltigAb) === i);
    return {
      fassung,
      ...(vorige ? { vorige, aenderungen: fassung ? aenderungen(vorige.summen, fassung.summen) : undefined } : {}),
      ...(neuGeholt && fassung?.kennung === neuGeholt.kennung ? { neu: true } : {}),
      ...(v.geprueft ? { geprueft: v.geprueft } : {}),
      ...(fehler ?? v.fehler ? { fehler: fehler ?? v.fehler } : {}),
      ...(kuenftige.length ? { kuenftige } : {}),
    };
  }
}

const kurz = async (s: string) => (await sha256(s)).slice(0, 10);
