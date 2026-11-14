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
  /** laufende Nummer im Verzeichnis (Reihenfolge des Ablegens) */
  nr?: number;
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
  /** Zum Stichtag gilt laut Quelle schon eine neuere Fassung (ab diesem Tag), deren Text nicht vorliegt */
  ueberholtAb?: string;
}

const TAG = 24 * 60 * 60 * 1000;
const sicher = (s: string) => s.replace(/[^\w.@-]+/g, '_');

/**
 * Fassung zum Stichtag aus einer Liste: jüngstes Gültig-ab, das nicht nach dem Stichtag liegt – und deren Gültig-bis
 * (falls bekannt) nicht vor dem Stichtag endet
 */
/** Reihenfolge bei gleichem Gültig-ab: die später abgelegte zuerst – nach der laufenden Nummer, erst dann nach der Uhr */
function spaeterZuerst(a: { nr?: number; abgerufen?: string }, b: { nr?: number; abgerufen?: string }): number {
  return (b.nr ?? 0) - (a.nr ?? 0) || (b.abgerufen ?? '').localeCompare(a.abgerufen ?? '');
}

export function fassungZumStichtag<T extends { gueltigAb: string; gueltigBis?: string; abgerufen?: string; nr?: number }>(liste: T[], stichtag: string): T | undefined {
  return [...liste]
    .filter((f) => f.gueltigAb <= stichtag && (!f.gueltigBis || f.gueltigBis >= stichtag))
    // bei gleichem Gültig-ab die zuletzt abgelegte (z. B. Ortsrecht, dessen Datum gleich bleibt, mit geändertem Text) –
    // nach der laufenden Nummer im Verzeichnis, nicht nach der Uhr (die Ablage teilen sich mehrere Rechner)
    .sort((a, b) => b.gueltigAb.localeCompare(a.gueltigAb) || spaeterZuerst(a, b))
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
  fuer(norm: NormQuelle, stichtag: string, o: { aktualisieren?: boolean; offline?: boolean; regelStand?: Record<string, string> } = {}): Promise<StandErgebnis> {
    const schluessel = `${norm.id}@${stichtag}@${o.aktualisieren ? 1 : 0}`;
    let p = this.laufend.get(schluessel);
    if (!p) {
      p = this.fuerJetzt(norm, stichtag, o).finally(() => this.laufend.delete(schluessel));
      this.laufend.set(schluessel, p);
    }
    return p;
  }

  private async fuerJetzt(norm: NormQuelle, stichtag: string, o: { aktualisieren?: boolean; offline?: boolean; regelStand?: Record<string, string> }): Promise<StandErgebnis> {
    let v = await this.verzeichnis(norm.id);
    const juengsteEintrag = () => [...v.fassungen].sort(spaeterZuerst)[0];
    const deckt = fassungZumStichtag(v.fassungen, stichtag);
    // eine schon angekündigte Fassung, die zum Stichtag gilt, aber noch nicht vorliegt: nicht gedeckt
    const vorab = v.fassungen.length ? await this.fassungLesen(juengsteEintrag()) : null;
    const neuer = (bis: { gueltigAb: string } | undefined) => (vorab?.kuenftige ?? []).filter((k) => k.gueltigAb <= stichtag && (!bis || k.gueltigAb > bis.gueltigAb)).map((k) => k.gueltigAb).sort().pop();
    const gedeckt = !!deckt && !neuer(deckt);
    const alt = !v.geprueft || this.jetzt().getTime() - Date.parse(v.geprueft) > (this.o.gueltig ?? TAG);
    let fehler: string | undefined;
    let neuGeholt: Fassung | null = null;
    // an der Quelle prüfen: auf Wunsch, nach einem Tag, oder wenn noch keine Fassung den Stichtag abdeckt – auch für
    // Stichtage in der Zukunft höchstens einmal am Tag (die künftigen Fassungen kennt die letzte Prüfung)
    if (norm.quelle.art !== 'verweis' && !o.offline && (o.aktualisieren || alt || !gedeckt)) {
      try {
        const zuletzt = vorab;
        const f = await fassungHolen(this.h, norm, norm.quelle, { stichtag, vorher: zuletzt ?? undefined, textAusPaket: this.o.textAusPaket });
        v = await this.verzeichnis(norm.id);
        if (f !== 'unveraendert') {
          // gleiche Kennung (z. B. dieselbe URL), aber anderer Text: als neue Fassung ablegen – sonst bliebe der alte Text
          const gleich = v.fassungen.filter((e) => e.kennung === f.kennung || e.kennung.startsWith(`${f.kennung}#`));
          let neu = !gleich.length;
          if (!neu) {
            const juengste = [...gleich].sort(spaeterZuerst)[0];
            const alt = await this.fassungLesen(juengste);
            neu = JSON.stringify(alt?.summen ?? null) !== JSON.stringify(f.summen);
          }
          if (neu) {
            const kennung = gleich.length ? `${f.kennung}#${(await kurz(JSON.stringify(f.summen)))}` : f.kennung;
            const datei = `recht/${sicher(norm.id)}/${f.gueltigAb}_${(await kurz(kennung))}`;
            const ablage = { ...f, kennung };
            await this.speicher.schreiben(datei, ablage);
            const nr = Math.max(0, ...v.fassungen.map((e) => e.nr ?? 0)) + 1;
            v.fassungen.push({ gueltigAb: f.gueltigAb, ...(f.gueltigBis ? { gueltigBis: f.gueltigBis } : {}), kennung, datei, abgerufen: f.abgerufen, nr });
            neuGeholt = ablage;
          }
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
    // bei gleichem Gültig-ab nach der laufenden Nummer (wie fassungZumStichtag) – zwei Abrufe in derselben Millisekunde
    // haben denselben Zeitstempel, die vorige Fassung fehlte sonst
    const vorigerEintrag = eintrag ? [...v.fassungen].filter((e) => e !== eintrag && (e.gueltigAb < eintrag.gueltigAb || (e.gueltigAb === eintrag.gueltigAb && spaeterZuerst(e, eintrag) > 0))).sort((a, b) => b.gueltigAb.localeCompare(a.gueltigAb) || spaeterZuerst(a, b))[0] : undefined;
    let vorige = vorigerEintrag ? await this.fassungLesen(vorigerEintrag) : null;
    // für alt/neu: die Fassung, an der die Regeln geprüft sind (die meisten passenden Prüfsummen) – nicht nur die vorige
    if (o.regelStand && Object.keys(o.regelStand).length && eintrag) {
      const passt = (f: Fassung | null) => (f ? Object.entries(o.regelStand!).filter(([k, s]) => f.summen[k] === s).length : -1);
      let beste = { f: vorige, n: passt(vorige) };
      for (const e of v.fassungen.filter((x) => x !== eintrag && x !== vorigerEintrag)) {
        const f = await this.fassungLesen(e);
        const n = passt(f);
        if (n > beste.n) beste = { f, n };
      }
      if (beste.f && beste.n > 0) vorige = beste.f;
    }
    // künftige Fassungen: aus der zuletzt geholten (nicht nur der zum Stichtag), damit sie auch bei früheren Stichtagen
    // angezeigt werden
    const juengste = v.fassungen.length ? await this.fassungLesen(juengsteEintrag()) : null;
    const ueberholtAb = [...(juengste?.kuenftige ?? []), ...(fassung?.kuenftige ?? [])].filter((k) => k.gueltigAb <= stichtag && (!eintrag || k.gueltigAb > eintrag.gueltigAb)).map((k) => k.gueltigAb).sort().pop();
    const kuenftige = [...(fassung?.kuenftige ?? []), ...(juengste?.kuenftige ?? []), ...v.fassungen.filter((e2) => e2.gueltigAb > stichtag).map((e2) => ({ gueltigAb: e2.gueltigAb, url: '' }))]
      .filter((k, i, l) => k.gueltigAb > stichtag && l.findIndex((x) => x.gueltigAb === k.gueltigAb) === i);
    return {
      fassung,
      ...(vorige ? { vorige, aenderungen: fassung ? aenderungen(vorige.summen, fassung.summen) : undefined } : {}),
      ...(neuGeholt && fassung?.kennung === neuGeholt.kennung ? { neu: true } : {}),
      ...(v.geprueft ? { geprueft: v.geprueft } : {}),
      ...(fehler ?? v.fehler ? { fehler: fehler ?? v.fehler } : {}),
      ...(kuenftige.length ? { kuenftige } : {}),
      ...(ueberholtAb ? { ueberholtAb } : {}),
    };
  }
}

const kurz = async (s: string) => (await sha256(s)).slice(0, 10);
