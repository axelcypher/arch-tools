import type { ReactNode } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { APP_NAMEN } from '@core/appNamen';
import type { Beteiligter, ProjektStatus } from '@core/model';
import { anschriftEinzeilig, bebauungsplanText, flurText, LEISTUNGSPHASEN } from '@core/model';
import { zuletztMerken } from '@core/platform/konfig';
import { projekteAuflisten } from '@core/platform/projektordner';
import { saveBinaryFile } from '@core/platform/files';
import { logger } from '@core/platform/log';
import { anRahmen, ZUR_APP } from '@core/platform/rahmen';
import { StammdatenFelder } from '@core/ui/Stammdaten';
import type { Dateisystem } from '../dateisystem';
import { hatDateisystem, SpeicherDateisystem, tauriDateisystem, verbinde, waehleOrdner, waehleOrdnerImBrowser } from '../dateisystem';
import { ausOrdnername, naechsteNummer, nummerPasst } from '../nummer';
import type { Ergebnis, Plan } from '../plan';
import { ausfuehren, nichtVorausgewaehlt, ohne, planen, tutEtwas, zielordnerVorhanden } from '../plan';
import type { GeladenerOrdner, GeladenesProjekt } from '../projekt';
import { beteiligteSammeln, projektEinlesen } from '../projekt';
import type { Stammdaten } from '../stammdaten';
import { bereinigt, formularMeta, leereStammdaten, stammAusMeta } from '../stammdaten';
import { useOrdner } from '../store';
import { aktivePresets } from '../struktur';
import { ErgebnisAnzeige, PlanMeldungen, PlanTabelle, PresetAuswahl, VorlagenordnerZeile } from './gemeinsam';
import { ProjektStart } from './ProjektStart';

const log = logger('assistent');

type Modus = 'neu' | 'ergaenzen';
type SchrittId = 'start' | 'stammdaten' | 'grundstueck' | 'bauherr' | 'umfang' | 'beteiligte' | 'vorlagen' | 'ausfuehren';

const SCHRITTE: { id: SchrittId; label: string }[] = [
  { id: 'start', label: 'Projekt' },
  { id: 'stammdaten', label: 'Stammdaten' },
  { id: 'grundstueck', label: 'Grundstück' },
  { id: 'bauherr', label: 'Bauherr' },
  { id: 'umfang', label: 'Umfang' },
  { id: 'beteiligte', label: 'Beteiligte' },
  { id: 'vorlagen', label: 'Vorlagen' },
  { id: 'ausfuehren', label: 'Anlegen' },
];

/** Desktop: Projektordner einlesen (`fs` ersetzt das Dateisystem des Desktops, etwa in Tests) */
export async function ladeProjektordner(pfad: string, fs: Dateisystem = tauriDateisystem): Promise<GeladenerOrdner> {
  const name = pfad.replace(/[\\/]+$/, '').split(/[\\/]/).pop() ?? pfad;
  return { pfad, name, eintraege: await fs.liste(pfad, 12), lies: (p) => fs.lies(pfad, p) };
}

/** Auftrag aus einer anderen App (Rahmen-App): neues Projekt anlegen und danach dorthin zurück */
export interface Auftrag {
  /** Kennung der App, aus der der Auftrag kommt (null = vom Rahmen selbst) */
  von: string | null;
  vonName?: string;
  /** die App öffnet das neue Projekt selbst */
  kannOeffnen?: boolean;
}

/** so lange lässt sich der geleerte Entwurf nach dem Anlegen wiederherstellen */
const RUECKGAENGIG_MS = 10_000;

/** „1 Datei“, „2 Dateien“ */
const anzahlDateien = (n: number) => `${n} ${n === 1 ? 'Datei' : 'Dateien'}`;

/**
 * Satz zur Projektdatei je Lage: neu angelegt, auf dem Desktop gezielt ergänzt, nicht lesbar (bleibt unverändert); im
 * Browser (ZIP) kein Satz zum Ergänzen
 */
function projektdateiSatz(modus: Modus | null, desktop: boolean, neu: boolean, nichtLesbar = false): string {
  if (neu) return 'Die Projektdatei wird neu angelegt.';
  if (nichtLesbar) return 'Die Projektdatei ist nicht lesbar und bleibt unverändert – die Stammdaten werden nicht gespeichert.';
  if (modus === 'ergaenzen' && desktop) return 'Die Projektdatei wird gezielt ergänzt (vorher gesichert).';
  return '';
}

/** Meldungen, die an einem Feld stehen, mit dem Index des Felds in den Stammdaten (Nummer, Kurzname) und dem Kurznamen für „Noch offen“ */
const AM_FELD: Record<string, { feld: number; kurz: string }> = {
  'Die Projektnummer fehlt.': { feld: 0, kurz: 'Projektnummer' },
  'Der Kurzname fehlt.': { feld: 1, kurz: 'Kurzname' },
};
/** „Noch offen: …“ – kurz; was nicht an einem Feld steht, betrifft den Ordnernamen (die Meldung steht darüber) */
const offenKurz = (f: string) => AM_FELD[f]?.kurz ?? (f.endsWith('…') ? f : 'Ordnername (siehe Meldung)');

/** nur, was etwas tut (Neues anlegen, die Projektdatei ergänzen) */
const nurWasEtwasTut = (plan: Plan): Plan => ({ ...plan, schritte: plan.schritte.filter(tutEtwas) });

/**
 * Projekt-Assistent: ein neues Projekt anlegen oder ein bestehendes ergänzen – Schritt für Schritt Stammdaten,
 * Umfang (Leistungsphasen, Beteiligte) und Vorlagen, zum Schluss der Trockenlauf. Alles landet in der
 * Projektdatei (.oap) des Projektordners; fehlt sie, wird sie angelegt. Gelöscht wird nichts.
 */
export function AssistentView({
  sichtbar = true,
  start,
  auftrag,
  onEinstellungen,
  onPruefen,
  onKatasterEinstellungen,
  onMails,
}: {
  /** ausgeblendet (andere Ansicht der App): bleibt eingehängt, damit Schritt und Eingaben erhalten bleiben – setzt aber keinen Fokus */
  sichtbar?: boolean;
  start?: GeladenerOrdner | null;
  /** neues Projekt im Auftrag einer anderen App: gleich mit den Stammdaten beginnen, danach zurück */
  auftrag?: Auftrag | null;
  onEinstellungen?: () => void;
  onPruefen?: (pfad: string) => void;
  /** Einstellungen der Katasterpläne zeigen */
  onKatasterEinstellungen?: () => void;
  /** Mails eines Projekts prüfen und benennen */
  onMails?: (pfad: string) => void;
}) {
  const desktop = hatDateisystem();
  const { stamm: entwurf, struktur, stammordner, vorlagen, allgemein, setStamm, setStammordner, neuesProjekt } = useOrdner();
  const [modus, setModus] = useState<Modus | null>(start ? 'ergaenzen' : auftrag ? 'neu' : null);
  const [schritt, setSchritt] = useState<SchrittId>(start || auftrag ? 'stammdaten' : 'start');
  /** zurück zur App, aus der der Auftrag kam */
  const zurueckZu = auftrag?.von && auftrag.vonName ? { id: auftrag.von, name: auftrag.vonName, oeffnen: !!auftrag.kannOeffnen } : null;
  const zurueck = (ordner?: string) => zurueckZu && anRahmen({ typ: ZUR_APP, an: zurueckZu.id, ...(ordner ? { ordner } : {}) });
  const [ordner, setOrdner] = useState<GeladenerOrdner | null>(start ?? null);
  const [geladen, setGeladen] = useState<GeladenesProjekt | null>(null);
  const [stammE, setStammE] = useState<Stammdaten | null>(null);
  const [projekte, setProjekte] = useState<string[]>([]);
  const [suche, setSuche] = useState('');
  const [abgewaehlt, setAbgewaehlt] = useState<Set<string>>(new Set());
  const [nurNeu, setNurNeu] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);
  const [laeuft, setLaeuft] = useState<string | null>(null);
  const [ergebnis, setErgebnis] = useState<{ ordner: string; liste: Ergebnis[] } | null>(null);
  /** neues Projekt erfolgreich angelegt: Abschlussseite; der Entwurf ist geleert und lässt sich kurz wiederherstellen */
  const [abschluss, setAbschluss] = useState<{ ordner: string; pfad: string; liste: Ergebnis[]; entwurf: Stammdaten; rueckgaengig: boolean } | null>(null);
  const [lesung, setLesung] = useState(0);
  /** Ordnernamen aller Stammordner – für den Nummernvorschlag */
  const [alleNamen, setAlleNamen] = useState<string[]>([]);
  /** Projektnummer beim neuen Projekt schon einmal vorausgefüllt (danach nicht mehr überschreiben) */
  const [vorbelegt, setVorbelegt] = useState(false);
  /** „Weiter“ trotz offener Angaben gedrückt: Meldungen an den Feldern zeigen */
  const [versucht, setVersucht] = useState(false);
  const [beteiligtVorschlaege, setBeteiligtVorschlaege] = useState<Beteiligter[] | null>(null);
  const weiterKnopf = useRef<HTMLButtonElement>(null);
  /** besuchte Schritte – nur sie gelten in der Schrittleiste als erledigt */
  const [besucht, setBesucht] = useState<Set<SchrittId>>(() => new Set(start || auftrag ? ['start', 'stammdaten'] : ['start']));
  const bereich = useRef<HTMLElement>(null);
  /** Schritt, für den der Fokus schon gesetzt ist (nur einmal je Schrittwechsel) */
  const fokusBei = useRef<string | null>(null);

  // Projektordner im Stammordner: Auswahl zum Ergänzen und Nummernvorschlag
  useEffect(() => {
    if (!desktop || !stammordner) return setProjekte([]);
    let aktuell = true;
    tauriDateisystem.liste(stammordner, 1).then(
      (l) =>
        aktuell &&
        setProjekte(
          l
            .filter((e) => e.ordner)
            .map((e) => e.pfad)
            .sort((a, b) => b.localeCompare(a, 'de', { numeric: true })),
        ),
      (e) => aktuell && setFehler(`Stammordner: ${e instanceof Error ? e.message : String(e)}`),
    );
    return () => {
      aktuell = false;
    };
  }, [desktop, stammordner, ergebnis]);

  // Nummernvorschlag aus den Ordnern ALLER Stammordner (auch Archiv, Akquise …)
  const stammordnerSchluessel = allgemein.projekte.join('|');
  useEffect(() => {
    if (!desktop || !allgemein.projekte.length) return setAlleNamen([]);
    let aktuell = true;
    // auch Projekte in Gruppen-, Akquise- und Archivordnern zählen mit
    void projekteAuflisten(tauriDateisystem, allgemein.projekte).then(
      (r) => aktuell && setAlleNamen(r.projekte.map((p) => p.name)),
      () => aktuell && setAlleNamen([]),
    );
    return () => {
      aktuell = false;
    };
  }, [desktop, stammordnerSchluessel, ergebnis]); // eslint-disable-line react-hooks/exhaustive-deps

  // Beteiligte früherer Projekte als Vorschläge (im Hintergrund, sobald die Beteiligten dran sind)
  useEffect(() => {
    if (schritt !== 'beteiligte' || beteiligtVorschlaege || !desktop || !allgemein.projekte.length) return;
    let aktuell = true;
    void beteiligteSammeln(tauriDateisystem, allgemein.projekte).then(
      (l) => aktuell && setBeteiligtVorschlaege(l),
      () => aktuell && setBeteiligtVorschlaege([]),
    );
    return () => {
      aktuell = false;
    };
  }, [schritt, desktop, stammordnerSchluessel]); // eslint-disable-line react-hooks/exhaustive-deps

  // bestehendes Projekt: Projektdatei (oder alte projekt.json) lesen
  const ordnerSchluessel = ordner ? `${ordner.pfad}|${ordner.name}` : '';
  useEffect(() => {
    setGeladen(null);
    setStammE(null);
    setAbgewaehlt(new Set());
    if (!ordner) return;
    let aktuell = true;
    projektEinlesen(ordner).then(
      (g) => {
        if (!aktuell) return;
        setGeladen(g);
        if (g.angaben) {
          const { angelegt: _a, struktur: _s, dateischema: _d, ...stamm } = g.angaben;
          setStammE(stamm);
        } else {
          // ohne Projektdatei: Nummer und Kurzname aus dem Ordnernamen vorschlagen
          setStammE({ ...leereStammdaten(), ...ausOrdnername(struktur.ordnername, ordner.name), bearbeiter: entwurf.bearbeiter });
        }
      },
      (e) => aktuell && setFehler(`Der Projektordner ließ sich nicht lesen: ${e instanceof Error ? e.message : String(e)}`),
    );
    return () => {
      aktuell = false;
    };
  }, [ordnerSchluessel, lesung]); // eslint-disable-line react-hooks/exhaustive-deps

  const stamm = modus === 'ergaenzen' ? stammE : entwurf;
  const aendereStamm = (patch: Partial<Stammdaten>) => {
    if (modus === 'ergaenzen') setStammE((s) => (s ? { ...s, ...patch } : s));
    else setStamm(patch);
  };

  // neues Projekt: gibt es den Ordner im Stammordner schon? Dann nicht hineinlegen, sondern das Projekt ergänzen
  const neuerName = useMemo(() => (modus === 'neu' ? planen(entwurf, struktur, []).ordner : ''), [modus, entwurf, struktur]);
  const gibtEsSchon = modus === 'neu' && !!neuerName && projekte.some((p) => p.toLowerCase() === neuerName.toLowerCase());

  const jahr = geladen?.angaben && /^\d{4}/.test(geladen.angaben.angelegt) ? Number(geladen.angaben.angelegt.slice(0, 4)) : undefined;
  const plan = useMemo(() => {
    if (!stamm || !modus) return null;
    if (modus === 'ergaenzen') {
      if (!ordner || !geladen) return null;
      return planen(stamm, struktur, vorlagen, ordner.eintraege, new Date(), {
        ordner: ordner.name,
        jahr,
        oapPfad: allgemein.oapPfad,
        namensschema: allgemein.namensschema,
        projektdatei: geladen.projektdatei,
        ...(ordner.pfad ? { ort: ordner.pfad } : {}),
      });
    }
    return planen(stamm, struktur, vorlagen, [], new Date(), { oapPfad: allgemein.oapPfad, namensschema: allgemein.namensschema, ...(desktop && stammordner ? { ort: stammordner } : {}) });
  }, [modus, stamm, struktur, vorlagen, ordner, geladen, jahr, allgemein.oapPfad, allgemein.namensschema, desktop, stammordner]);
  const auszufuehren = useMemo(() => (plan ? nurWasEtwasTut(ohne(plan, abgewaehlt)) : null), [plan, abgewaehlt]);
  const offen = auszufuehren?.schritte ?? [];
  const vorschlag = useMemo(() => naechsteNummer(struktur.nummernschema, alleNamen), [struktur.nummernschema, alleNamen]);
  // neues Projekt: den Vorschlag einmal ins Feld übernehmen (bleibt änderbar)
  useEffect(() => {
    if (vorbelegt || modus !== 'neu' || !desktop || !alleNamen.length || entwurf.nummer.trim()) return;
    setStamm({ nummer: vorschlag });
    setVorbelegt(true);
  }, [vorbelegt, modus, desktop, alleNamen, vorschlag]); // eslint-disable-line react-hooks/exhaustive-deps
  const nummerBeispiel = vorschlag;
  const nummerPruefen = (v: string) => (!v.trim() || nummerPasst(struktur.nummernschema, v) ? null : `Passt nicht zum Schema ${struktur.nummernschema} – erwartet z. B. ${nummerBeispiel}.`);

  /* ---------- Aktionen ---------- */

  const neuBeginnen = () => {
    setModus('neu');
    setBesucht(new Set(['start', 'stammdaten']));
    setVorbelegt(false);
    setVersucht(false);
    setOrdner(null);
    setErgebnis(null);
    setFehler(null);
    setAbgewaehlt(new Set());
    setSchritt('stammdaten');
  };
  const ergaenzenMit = (o: GeladenerOrdner) => {
    setModus('ergaenzen');
    setBesucht(new Set(['start', 'stammdaten']));
    setVersucht(false);
    setOrdner(o);
    setErgebnis(null);
    setFehler(null);
    setSchritt('stammdaten');
  };
  const ordnerLaden = async (pfad: string) => {
    setFehler(null);
    setLaeuft('Projektordner wird gelesen …');
    try {
      ergaenzenMit(await ladeProjektordner(pfad));
      setLesung((n) => n + 1);
      // „Zuletzt geöffnet“ – je Benutzer, gemeinsam für alle Apps
      void zuletztMerken(pfad, APP_NAMEN.ordner.name).catch(() => undefined);
    } catch (e) {
      setFehler(e instanceof Error ? e.message : String(e));
    } finally {
      setLaeuft(null);
    }
  };
  const ordnerWaehlen = async () => {
    setFehler(null);
    if (desktop) {
      const p = await waehleOrdner('Projektordner wählen');
      if (p) await ordnerLaden(p);
      return;
    }
    const o = await waehleOrdnerImBrowser();
    if (o) {
      ergaenzenMit({ pfad: '', name: o.name, eintraege: o.eintraege, lies: o.lies });
      // auch ein gleichnamiger Ordner wird neu gelesen
      setLesung((n) => n + 1);
    }
  };
  const stammWaehlen = async () => {
    const p = await waehleOrdner('Stammordner für Projekte wählen');
    if (p) setStammordner(p);
  };

  const umschalten = (pfad: string) =>
    setAbgewaehlt((alt) => {
      const neu = new Set(alt);
      if (!neu.delete(pfad)) neu.add(pfad);
      return neu;
    });

  // „Rückgängig“ für den geleerten Entwurf nur kurz anbieten
  useEffect(() => {
    if (!abschluss?.rueckgaengig) return;
    const t = setTimeout(() => setAbschluss((a) => (a ? { ...a, rueckgaengig: false } : a)), RUECKGAENGIG_MS);
    return () => clearTimeout(t);
  }, [abschluss?.rueckgaengig]);
  /** neues Projekt angelegt: Entwurf leeren, Abschlussseite zeigen – bei Fehlern einzelner Schritte bleibt alles stehen */
  const fertig = (ordnerName: string, pfad: string, liste: Ergebnis[]) => {
    if (liste.some((x) => x.status === 'fehler')) return setErgebnis({ ordner: pfad, liste });
    setAbschluss({ ordner: ordnerName, pfad, liste, entwurf, rueckgaengig: true });
    neuesProjekt();
  };
  const naechstesProjekt = () => {
    setAbschluss(null);
    setErgebnis(null);
    setModus(null);
    setBesucht(new Set(['start']));
    setSchritt('start');
  };

  const ausfuehrenJetzt = async () => {
    if (!auszufuehren || !modus) return;
    setFehler(null);
    setErgebnis(null);
    try {
      if (modus === 'neu') {
        if (desktop) {
          setLaeuft('Projektordner wird angelegt …');
          // frisch nachsehen: Ein Kollege kann den Ordner inzwischen angelegt haben (gleiche Nummer) – dann nichts hineinlegen
          const schonDa = await zielordnerVorhanden(tauriDateisystem, stammordner, auszufuehren.ordner);
          if (schonDa) {
            setProjekte((l) => (l.some((p) => p.toLowerCase() === schonDa.toLowerCase()) ? l : [schonDa, ...l]));
            setFehler(
              `Den Ordner „${schonDa}“ gibt es inzwischen im Stammordner – vermutlich hat ihn gerade jemand anderes angelegt. Es wurde nichts angelegt. Bitte die Projektnummer prüfen oder das vorhandene Projekt ergänzen.`,
            );
            return;
          }
          const liste = await ausfuehren(tauriDateisystem, stammordner, auszufuehren, { fortschritt: (i, n) => setLaeuft(`Projektordner wird angelegt … ${i} / ${n}`) });
          log.info(`Projektordner angelegt: ${auszufuehren.ordner}`, { angelegt: liste.filter((x) => x.status === 'angelegt').length, fehler: liste.filter((x) => x.status === 'fehler').length, presets: auszufuehren.presets });
          fertig(auszufuehren.ordner, verbinde(stammordner, auszufuehren.ordner), liste);
          void zuletztMerken(verbinde(stammordner, auszufuehren.ordner), APP_NAMEN.ordner.name).catch(() => undefined);
        } else {
          setLaeuft('ZIP wird erstellt …');
          const fs = new SpeicherDateisystem();
          const liste = await ausfuehren(fs, '/zip', auszufuehren);
          const ok = await saveBinaryFile({ defaultName: `${auszufuehren.ordner}.zip`, data: fs.alsZip('/zip'), filterName: 'ZIP-Archiv', extension: 'zip', mime: 'application/zip' });
          if (ok) fertig(auszufuehren.ordner, '', liste);
        }
      } else if (ordner) {
        if (desktop && ordner.pfad) {
          setLaeuft('Projekt wird ergänzt …');
          const liste = await ausfuehren(tauriDateisystem, ordner.pfad, auszufuehren, { imProjektordner: true, fortschritt: (i, n) => setLaeuft(`Projekt wird ergänzt … ${i} / ${n}`) });
          log.info(`Projekt ergänzt: ${ordner.name}`, { angelegt: liste.filter((x) => x.status === 'angelegt').length, ergaenzt: liste.some((x) => x.status === 'ergaenzt'), fehler: liste.filter((x) => x.status === 'fehler').length });
          setErgebnis({ ordner: ordner.pfad, liste });
          setAbgewaehlt(new Set());
          // neu einlesen, damit der Trockenlauf den neuen Stand zeigt
          setOrdner({ ...ordner, eintraege: await tauriDateisystem.liste(ordner.pfad, 12) });
          setLesung((n) => n + 1);
        } else {
          // Browser: nur Neues als ZIP – die vorhandene Projektdatei lässt sich hier nicht ändern
          setLaeuft('ZIP wird erstellt …');
          const fs = new SpeicherDateisystem();
          const nurNeues = { ...auszufuehren, schritte: auszufuehren.schritte.filter((s) => !s.vorhanden) };
          const liste = await ausfuehren(fs, '/zip', nurNeues, { imProjektordner: true });
          const ok = await saveBinaryFile({ defaultName: `${ordner.name} Ergänzung.zip`, data: fs.alsZip('/zip'), filterName: 'ZIP-Archiv', extension: 'zip', mime: 'application/zip' });
          if (ok) setErgebnis({ ordner: '', liste });
        }
      }
    } catch (e) {
      log.error('Ausführen fehlgeschlagen', e instanceof Error ? e.message : String(e));
      setFehler(e instanceof Error ? e.message : String(e));
    } finally {
      setLaeuft(null);
    }
  };

  /* ---------- Prüfen je Schritt ---------- */

  const stammFehler = !stamm ? ['Die Stammdaten werden gelesen …'] : modus === 'neu' ? (plan?.fehler ?? []) : stamm.nummer.trim() ? [] : ['Die Projektnummer fehlt.'];
  const kannWeiter = (id: SchrittId) => (id === 'start' ? !!modus && (modus === 'neu' || !!stamm) : id === 'stammdaten' ? !stammFehler.length : true);
  const index = SCHRITTE.findIndex((s) => s.id === schritt);
  const naechster = SCHRITTE[index + 1];
  const voriger = SCHRITTE[index - 1];
  // ein Schritt ist erreichbar, wenn alle davor taugen – nach dem Anlegen (Abschlussseite) keiner mehr
  const erreichbar = (i: number) => !!modus && !abschluss && SCHRITTE.slice(0, i).every((s) => kannWeiter(s.id));
  // warum ein Schritt gesperrt ist (als Hinweis an der Schrittleiste)
  const gesperrtGrund = !modus
    ? 'Erst ein Projekt wählen'
    : abschluss
      ? 'Das Projekt ist angelegt – „Nächstes Projekt“ beginnt von vorn'
      : !stamm
        ? 'Die Stammdaten werden gelesen …'
        : modus === 'neu'
          ? 'Erst Projektnummer und Kurzname eintragen'
          : 'Erst die Projektnummer eintragen';

  /** ein Feld der Stammdaten fokussieren (0 = Projektnummer, 1 = Kurzname) */
  const feldFokussieren = (i: number) => bereich.current?.querySelectorAll<HTMLInputElement>('.sd-felder input')[i]?.focus();
  const geheZu = (id: SchrittId) => {
    setSchritt(id);
    setBesucht((b) => (b.has(id) ? b : new Set(b).add(id)));
  };
  const weiterGehen = () => {
    if (!naechster) return;
    if (!kannWeiter(schritt)) {
      setVersucht(true);
      // zum ersten Feld, an dem etwas fehlt
      const erstes = stammFehler.map((f) => AM_FELD[f]?.feld).find((x) => x !== undefined);
      if (erstes !== undefined) feldFokussieren(erstes);
      return;
    }
    setVersucht(false);
    geheZu(naechster.id);
  };

  // Fokus nach jedem Schrittwechsel: in den Stammdaten das erste offene Feld, sonst die Überschrift des Schritts
  // (nicht, solange der Assistent ausgeblendet ist – dann beim nächsten Wechsel)
  const fokusZiel = schritt === 'start' ? null : `${schritt}${abschluss ? ':fertig' : ''}`;
  useEffect(() => {
    if (!fokusZiel) {
      fokusBei.current = null;
      return;
    }
    if (!sichtbar || fokusBei.current === fokusZiel || !bereich.current) return;
    let ziel: HTMLElement | null | undefined;
    if (schritt === 'stammdaten' && !abschluss) {
      const felder = bereich.current.querySelectorAll<HTMLInputElement>('.sd-felder input');
      // die Stammdaten werden noch gelesen: später
      if (!felder.length) return;
      ziel = stamm?.nummer.trim() && felder[1] ? felder[1] : felder[0];
    } else ziel = bereich.current.querySelector<HTMLElement>('h2');
    if (!ziel) return;
    ziel.focus();
    fokusBei.current = fokusZiel;
  });
  // Strg+Enter = „Weiter“ – nach dem Übernehmen des Feldes, in dem der Fokus steht (Enter verlässt das Feld)
  const tasten = (e: React.KeyboardEvent) => {
    if (e.key !== 'Enter' || !(e.ctrlKey || e.metaKey) || schritt === 'start') return;
    e.preventDefault();
    setTimeout(() => weiterKnopf.current?.click(), 0);
  };
  const neueEintraege = (plan?.schritte ?? []).filter((x) => !x.vorhanden).map((x) => x.pfad);
  /** warum „Anlegen“ bzw. „Ergänzen“ gesperrt ist – null = es kann losgehen */
  const anlegenSperre = !plan
    ? null
    : plan.fehler.length
      ? `Noch offen: ${plan.fehler.map(offenKurz).join(', ')}`
      : modus === 'neu' && desktop && !stammordner
        ? 'Erst den Stammordner für Projekte wählen.'
        : modus === 'neu' && gibtEsSchon
          ? 'Den Projektordner gibt es schon – das Projekt ergänzen oder Nummer bzw. Kurzname ändern.'
          : !offen.length
            ? abgewaehlt.size
              ? 'Nichts anzulegen – alle neuen Einträge sind abgewählt.'
              : 'Nichts anzulegen – alles ist schon vorhanden.'
            : null;

  const nichtAutomatisch = useMemo(() => nichtVorausgewaehlt(struktur, vorlagen), [struktur, vorlagen]);
  const presetsAktiv = aktivePresets(struktur, stamm?.presets, nichtAutomatisch.keys()).presets;
  // Projektdatei vorhanden, aber nicht lesbar: Sie bleibt unverändert – die Stammdaten werden nicht gespeichert
  const oapNichtLesbar = modus === 'ergaenzen' && !!geladen?.quelle.fehler;
  const ohneProjektdatei = modus === 'ergaenzen' && geladen && !geladen.projektdatei && !oapNichtLesbar;

  /* ---------- Darstellung ---------- */

  const gefiltert = suche.trim() ? projekte.filter((p) => p.toLowerCase().includes(suche.trim().toLowerCase())) : projekte;
  const entwurfText = [entwurf.nummer, entwurf.kurzname].filter((x) => x.trim()).join(' ');

  // Desktop mit Stammordnern: die gemeinsame Projektübersicht als Startseite
  if (schritt === 'start' && desktop && allgemein.projekte.length > 0) {
    return (
      <div className="po-start-seite">
        {(fehler || laeuft) && <p className={fehler ? 'warning' : 'busy'}>{fehler ?? laeuft}</p>}
        <ProjektStart
          fs={tauriDateisystem}
          sichtbar={sichtbar}
          entwurf={entwurfText}
          onNeu={neuBeginnen}
          onLeerNeu={() => {
            neuesProjekt();
            neuBeginnen();
          }}
          onOeffnen={(pfad) => void ordnerLaden(pfad)}
          onAndererOrdner={() => void ordnerWaehlen()}
          onEinstellungen={onEinstellungen}
          onPruefen={onPruefen}
          onKatasterEinstellungen={onKatasterEinstellungen}
          onMails={onMails}
        />
      </div>
    );
  }

  return (
    <div className="po-view einspaltig po-assistent">
      <section className="po-col" onKeyDown={tasten} ref={bereich}>
        <ol className="po-schritte" aria-label="Schritte">
          {SCHRITTE.map((s, i) => {
            const aktiv = s.id === schritt;
            // nach dem Anlegen ist die Schrittleiste nur noch Rückblick
            const gesperrt = !!abschluss || (!erreichbar(i) && !aktiv);
            // erledigt: besucht und vollständig – nicht schon, weil der Schritt vor dem aktuellen liegt
            const erledigt = !aktiv && (abschluss ? true : besucht.has(s.id) && kannWeiter(s.id) && erreichbar(i));
            const label = s.id === 'ausfuehren' && modus === 'ergaenzen' ? 'Ergänzen' : s.label;
            return (
              <li key={s.id} className={`${aktiv ? 'aktiv' : ''}${erledigt ? ' erledigt' : ''}`} aria-current={aktiv ? 'step' : undefined} title={gesperrt ? gesperrtGrund : undefined}>
                <button disabled={gesperrt} onClick={() => geheZu(s.id)} aria-label={erledigt ? `${label} (erledigt)` : undefined}>
                  <span className="po-schritt-nr" aria-hidden>
                    {erledigt ? '✓' : i + 1}
                  </span>
                  {label}
                </button>
              </li>
            );
          })}
        </ol>
        {modus && schritt !== 'start' && !abschluss && (
          <p className="po-kontext">
            {modus === 'neu' ? (
              <>
                Neues Projekt: <strong>{plan?.ordner || 'noch ohne Namen'}</strong>
                {zurueckZu && (
                  <>
                    {' '}
                    · aus {zurueckZu.name}{' '}
                    <button className="small" onClick={() => zurueck()} title={`Zurück zu ${zurueckZu.name} – der Entwurf bleibt hier stehen`}>
                      Zurück zu {zurueckZu.name}
                    </button>
                  </>
                )}
              </>
            ) : (
              <>
                Ergänzen: <strong>{ordner?.name}</strong>
                {geladen &&
                  (geladen.projektdatei ? (
                    <span title={geladen.projektdatei.pfad}> · Projektdatei vorhanden</span>
                  ) : oapNichtLesbar ? (
                    <span title={geladen.quelle.pfad}> · Projektdatei nicht lesbar – sie bleibt unverändert</span>
                  ) : (
                    ' · noch ohne Projektdatei – sie wird angelegt'
                  ))}
              </>
            )}
          </p>
        )}
        {fehler && <p className="warning">{fehler}</p>}

        {schritt === 'start' && (
          <div className="po-start">
            <div className="po-karte">
              <h3>Neues Projekt anlegen</h3>
              <p className="muted small-text">Stammdaten erfassen, Umfang und Vorlagen wählen – dann entsteht der Projektordner mit Projektdatei, Ordnern und Vorlagen.</p>
              <div className="button-row">
                <button className="primary" onClick={neuBeginnen}>
                  {entwurf.nummer.trim() || entwurf.kurzname.trim() ? `Weiter mit ${[entwurf.nummer, entwurf.kurzname].filter((x) => x.trim()).join(' ')}` : 'Neues Projekt'}
                </button>
                {(entwurf.nummer.trim() || entwurf.kurzname.trim()) && (
                  <button
                    onClick={() => {
                      neuesProjekt();
                      neuBeginnen();
                    }}
                  >
                    Leer beginnen
                  </button>
                )}
              </div>
            </div>
            <div className="po-karte">
              <h3>Bestehendes Projekt ergänzen</h3>
              <p className="muted small-text">
                Fehlende Ordner und Vorlagen ergänzen, weitere Leistungsphasen oder Presets aufnehmen, Stammdaten nachtragen. Fehlt die Projektdatei, wird sie angelegt. Vorhandene
                Dateien bleiben unverändert; gelöscht wird nichts.
              </p>
              {desktop && projekte.length > 0 && (
                <>
                  <input
                    className="po-suche"
                    value={suche}
                    placeholder="Projekt suchen …"
                    aria-label="Projekt suchen"
                    onChange={(e) => setSuche(e.target.value)}
                    // Enter öffnet den ersten Treffer
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && gefiltert.length && !laeuft) void ordnerLaden(verbinde(stammordner, gefiltert[0]));
                    }}
                  />
                  <ul className="list po-projektliste">
                    {gefiltert.slice(0, 200).map((p) => (
                      <li key={p} title={verbinde(stammordner, p)}>
                        <button className="po-projekt-knopf" disabled={!!laeuft} onClick={() => void ordnerLaden(verbinde(stammordner, p))}>
                          {p}
                        </button>
                      </li>
                    ))}
                    {!gefiltert.length && <li className="muted">Kein Projekt passt zur Suche.</li>}
                  </ul>
                </>
              )}
              <div className="button-row">
                <button disabled={!!laeuft} onClick={() => void ordnerWaehlen()}>
                  {desktop ? (projekte.length ? 'Anderen Ordner wählen …' : 'Projektordner wählen …') : 'Projektordner einlesen …'}
                </button>
                {laeuft && <span className="busy">{laeuft}</span>}
              </div>
              {desktop && !stammordner && <p className="muted small-text">Tipp: Unter „Einstellungen“ den Stammordner der Projekte einstellen – dann stehen sie hier zur Auswahl.</p>}
            </div>
          </div>
        )}

        {schritt === 'stammdaten' && stamm && (
          <>
            <h2 tabIndex={-1}>Stammdaten</h2>
            {ohneProjektdatei && (
              <p className="po-hinweis">
                In diesem Ordner liegt noch keine Projektdatei (.oap).{' '}
                {geladen?.quelle.alteProjektJson
                  ? 'Die Stammdaten stammen aus der alten projekt.json, die liegen bleibt.'
                  : geladen?.quelle.alteProjektJsonDefekt
                    ? 'Die alte projekt.json im Ordner ist nicht lesbar (sie bleibt unverändert liegen) – bitte die Stammdaten neu erfassen.'
                    : 'Bitte die Stammdaten erfassen.'}{' '}
                Die Projektdatei wird
                damit angelegt.
              </p>
            )}
            {geladen?.quelle.fehler && (
              <p className="warning">
                Die Projektdatei {geladen.quelle.pfad} ist nicht lesbar: {geladen.quelle.fehler}
                {oapNichtLesbar && (
                  <>
                    {' '}
                    Sie bleibt unverändert. Was hier an Stammdaten steht, wird <strong>nicht gespeichert</strong> – es dient nur den Namen neuer Ordner und Vorlagen. Ergänzt werden nur fehlende
                    Ordner und Vorlagen.
                  </>
                )}
              </p>
            )}
            <StammdatenFelder
              meta={formularMeta(stamm)}
              onChange={(m) => aendereStamm(stammAusMeta(m, stamm.presets ? { presets: stamm.presets } : undefined))}
              bereiche={['projekt']}
              nummerHinweis={modus === 'neu' ? `z. B. ${nummerBeispiel}` : undefined}
              nummerVorschlag={modus === 'neu' && desktop && alleNamen.length ? vorschlag : undefined}
              nummerPruefen={modus === 'neu' ? nummerPruefen : undefined}
              // beim Ergänzen wird der vorhandene Ordner nicht umbenannt
              kurznameHinweis={modus === 'neu' ? undefined : 'Der Ordner wird nicht umbenannt.'}
              kurznamePflicht={modus === 'neu'}
              ordnerName={modus === 'neu' ? (plan?.ordner ?? '') : undefined}
              fehlerZeigen={versucht}
            />
            <StatusWahl status={stamm.status} onChange={(status) => aendereStamm({ status })} />
            {modus === 'neu' && gibtEsSchon && (
              <p className="po-hinweis">
                Den Ordner „{neuerName}“ gibt es im Stammordner schon.{' '}
                <button className="small" onClick={() => void ordnerLaden(verbinde(stammordner, neuerName))}>
                  Dieses Projekt ergänzen
                </button>
              </p>
            )}
            {stammFehler
              .filter((f) => !AM_FELD[f])
              .map((f) => (
                <p key={f} className="warning">
                  {f}
                </p>
              ))}
          </>
        )}

        {schritt === 'grundstueck' && stamm && (
          <>
            <h2 tabIndex={-1}>Grundstück</h2>
            <p className="muted small-text">Flurstück, Bebauungsplan und Aktenzeichen – Grundlage für Katasterpläne, Nachweise und Formulare. Was noch nicht bekannt ist, lässt sich später ergänzen.</p>
            <StammdatenFelder meta={formularMeta(stamm)} onChange={(m) => aendereStamm(stammAusMeta(m, stamm.presets ? { presets: stamm.presets } : undefined))} bereiche={['grundstueck']} fehlerZeigen={versucht} />
          </>
        )}

        {schritt === 'bauherr' && stamm && (
          <>
            <h2 tabIndex={-1}>Bauherr</h2>
            <p className="muted small-text">Name, Anschrift und Kontakt – für Bauantrag, Formulare und Schreiben. Was noch nicht bekannt ist, lässt sich später ergänzen.</p>
            <StammdatenFelder meta={formularMeta(stamm)} onChange={(m) => aendereStamm(stammAusMeta(m, stamm.presets ? { presets: stamm.presets } : undefined))} bereiche={['bauherr']} fehlerZeigen={versucht} />
          </>
        )}

        {schritt === 'umfang' && stamm && (
          <>
            <h2 tabIndex={-1}>Umfang</h2>
            <p className="muted small-text">Beauftragte Leistungsphasen: Ordner und Vorlagen, die an Leistungsphasen gebunden sind, entstehen nur für die beauftragten. Keine Auswahl = alle Ordner.</p>
            <StammdatenFelder
              meta={formularMeta(stamm)}
              onChange={(m) => aendereStamm(stammAusMeta(m, stamm.presets ? { presets: stamm.presets } : undefined))}
              bereiche={['leistungen']}
              bearbeiterVorschlaege={allgemein.mitarbeiter}
            />
          </>
        )}

        {schritt === 'beteiligte' && stamm && (
          <>
            <h2 tabIndex={-1}>Beteiligte</h2>
            <p className="muted small-text">Fachplaner, Gutachter, Behörden – mit Vorschlägen aus früheren Projekten. Später jederzeit ergänzbar.</p>
            <StammdatenFelder
              meta={formularMeta(stamm)}
              onChange={(m) => aendereStamm(stammAusMeta(m, stamm.presets ? { presets: stamm.presets } : undefined))}
              bereiche={['beteiligte']}
              beteiligtVorschlaege={beteiligtVorschlaege ?? undefined}
              rollenSchnell
            />
          </>
        )}

        {schritt === 'vorlagen' && stamm && (
          <>
            <h2 tabIndex={-1}>Vorlagen</h2>
            <VorlagenordnerZeile />
            <fieldset className="po-vorlagenwahl">
              <legend>Welche Vorlagen?</legend>
              <PresetAuswahl struktur={struktur} auswahl={stamm.presets} onChange={(presets) => aendereStamm({ presets })} nichtAutomatisch={nichtAutomatisch} />
            </fieldset>
            <p className="muted small-text">Welche Datei wohin kommt und wie sie heißt, steht unter „Vorlagen“. Die Auswahl wird in der Projektdatei vermerkt.</p>
          </>
        )}

        {schritt === 'ausfuehren' && modus === 'neu' && abschluss && (
          <div className="po-abschluss">
            <h2 tabIndex={-1}>{desktop ? 'Projekt angelegt' : 'Projekt als ZIP heruntergeladen'}</h2>
            <p className="po-abschluss-name">
              <strong>{abschluss.ordner}</strong>
              {!desktop && <span className="muted small-text"> ({abschluss.ordner}.zip – entpacken, wo das Projekt liegen soll)</span>}
            </p>
            <ErgebnisAnzeige ordner={abschluss.pfad} liste={abschluss.liste}>
              {zurueckZu && desktop && abschluss.pfad && (
                <button className="small primary" onClick={() => zurueck(abschluss.pfad)} title={zurueckZu.oeffnen ? `Das neue Projekt in ${zurueckZu.name} öffnen` : `Zurück zu ${zurueckZu.name} – das Projekt steht dort in der Übersicht`}>
                  {zurueckZu.oeffnen ? `In ${zurueckZu.name} öffnen` : `Zurück zu ${zurueckZu.name}`}
                </button>
              )}
              <button className={`small${zurueckZu && desktop ? '' : ' primary'}`} onClick={naechstesProjekt}>
                Nächstes Projekt
              </button>
            </ErgebnisAnzeige>
            {abschluss.rueckgaengig && (
              <p className="po-meldung po-rueckgaengig">
                Das Formular ist für das nächste Projekt geleert.{' '}
                <button
                  className="small"
                  onClick={() => {
                    setStamm(abschluss.entwurf);
                    setAbschluss({ ...abschluss, rueckgaengig: false });
                  }}
                >
                  Rückgängig
                </button>
              </p>
            )}
            {desktop && <p className="muted small-text">Das Projekt steht in allen Apps unter „Zuletzt geöffnet“ – etwa in QUADRIO (Flächenrechner) zum Weiterarbeiten.</p>}
          </div>
        )}

        {schritt === 'ausfuehren' && !(modus === 'neu' && abschluss) && (
          <>
            <h2 tabIndex={-1}>{modus === 'ergaenzen' ? 'Ergänzen' : 'Anlegen'}</h2>
            {modus === 'neu' && (
              <div className="po-ort">
                <div>
                  <span className="field-label">{desktop ? 'Stammordner für Projekte' : 'Ausgabe'}</span>
                  {desktop ? (
                    <code title={stammordner}>{stammordner || 'noch nicht gewählt'}</code>
                  ) : (
                    <span className="muted small-text">Im Browser entsteht der Projektordner als ZIP-Datei zum Herunterladen – entpacken, wo das Projekt liegen soll.</span>
                  )}
                </div>
                {desktop && (
                  <button className="small" onClick={() => void stammWaehlen()}>
                    Wählen …
                  </button>
                )}
              </div>
            )}
            {stamm && <Steckbrief stamm={stamm} presets={presetsAktiv.map((p) => p.name)} onSchritt={geheZu} nichtGespeichert={oapNichtLesbar} />}
            {plan && (
              <>
                <h3>
                  {plan.ordner || 'Projektordner'}
                  <span className="muted small-text">
                    {' '}
                    – {offen.filter((s) => s.art === 'ordner').length} Ordner und {anzahlDateien(offen.filter((s) => s.art === 'datei' && !s.vorhanden).length)} neu
                    {desktop && plan.projektdatei.teile.length && !abgewaehlt.has(plan.projektdatei.pfad) ? `, Projektdatei ergänzt (${plan.projektdatei.teile.join(', ')})` : ''}
                  </span>
                </h3>
                {modus === 'ergaenzen' && !stamm?.leistungsphasen.length && (
                  <p className="po-hinweis">
                    Keine Leistungsphasen gewählt – alle Ordner werden vorgeschlagen, auch die für Ausschreibung und Bauleitung.{' '}
                    <button className="small" onClick={() => setSchritt('umfang')}>
                      Leistungsphasen wählen
                    </button>
                  </p>
                )}
                {modus === 'ergaenzen' && (
                  <label className="toggle po-nurneu">
                    <input type="checkbox" checked={nurNeu} onChange={() => setNurNeu(!nurNeu)} />
                    nur zeigen, was sich ändert
                  </label>
                )}
                {/* „alles abwählen“ nur beim Ergänzen – beim neuen Projekt hieße das: nichts anlegen */}
                {((modus === 'ergaenzen' && neueEintraege.length > 1) || abgewaehlt.size > 0) && (
                  <div className="button-row po-auswahl">
                    {modus === 'ergaenzen' && neueEintraege.length > 1 && (
                      <button className="small" title="Nichts Neues anlegen – dann einzelne Einträge wieder anwählen" onClick={() => setAbgewaehlt(new Set(neueEintraege))}>
                        Alle neuen Einträge abwählen
                      </button>
                    )}
                    {abgewaehlt.size > 0 && (
                      <button className="small" onClick={() => setAbgewaehlt(new Set())}>
                        Alle wieder wählen
                      </button>
                    )}
                  </div>
                )}
                <PlanTabelle plan={plan} abgewaehlt={abgewaehlt} onUmschalten={umschalten} nurNeu={modus === 'ergaenzen' && nurNeu} neuOhneVermerk={modus === 'neu'} />
                <PlanMeldungen plan={plan} />
                {modus === 'ergaenzen' && !desktop && plan.projektdatei.teile.length > 0 && (
                  <p className="muted small-text">Die vorhandene Projektdatei lässt sich nur in der Desktop-App ergänzen; die ZIP-Datei enthält nur Neues.</p>
                )}
                {modus === 'neu' && gibtEsSchon && (
                  <p className="po-hinweis">
                    Den Ordner „{neuerName}“ gibt es im Stammordner schon – hier entsteht kein zweites Projekt darin.{' '}
                    <button className="small" onClick={() => void ordnerLaden(verbinde(stammordner, neuerName))}>
                      Dieses Projekt ergänzen
                    </button>
                  </p>
                )}
                <p className="muted small-text">
                  Ordner und Dateien werden nur neu angelegt; Vorhandenes bleibt unverändert, nichts wird verschoben oder gelöscht.{' '}
                  {projektdateiSatz(modus, desktop, plan.projektdatei.neu, oapNichtLesbar)} Einzelne Einträge lassen sich abwählen.
                </p>
              </>
            )}
            {ergebnis && (
              <ErgebnisAnzeige ordner={ergebnis.ordner} liste={ergebnis.liste}>
                {modus === 'neu' && (
                  <button
                    className="small"
                    onClick={() => {
                      neuesProjekt();
                      naechstesProjekt();
                    }}
                  >
                    Nächstes Projekt
                  </button>
                )}
              </ErgebnisAnzeige>
            )}
          </>
        )}

        {/* nach dem Anlegen (Abschlussseite) keine Navigation mehr – sie führte in den schon geleerten Entwurf */}
        {schritt !== 'start' && !abschluss && (
          <div className="button-row po-navigation">
            {voriger && <button onClick={() => geheZu(voriger.id)}>← {voriger.id === 'start' ? 'Anderes Projekt' : voriger.label}</button>}
            {/* Grund, warum es nicht weitergeht – dauerhaft im DOM, damit Hilfsmittel die Meldung ansagen */}
            <span className="po-weiter-grund" role="status">
              {versucht && !kannWeiter(schritt) && (
                <>
                  Noch offen:{' '}
                  {stammFehler.map((f, i) => (
                    <span key={f}>
                      {i > 0 && ', '}
                      {AM_FELD[f] ? (
                        <button className="po-mehr" onClick={() => feldFokussieren(AM_FELD[f].feld)}>
                          {offenKurz(f)}
                        </button>
                      ) : (
                        offenKurz(f)
                      )}
                    </span>
                  ))}
                </>
              )}
            </span>
            {naechster && (
              <button
                ref={weiterKnopf}
                className="primary"
                title={`${schritt === 'stammdaten' && stammFehler.length ? `Noch offen: ${stammFehler.map(offenKurz).join(', ')} ` : ''}(Strg+Enter)`}
                aria-keyshortcuts="Control+Enter"
                onClick={weiterGehen}
              >
                Weiter: {naechster.id === 'ausfuehren' && modus === 'ergaenzen' ? 'Ergänzen' : naechster.label} →
              </button>
            )}
            {/* letzter Schritt: die Hauptaktion steht wie „Weiter“ rechts in der Navigation, mit dem Grund, falls gesperrt */}
            {schritt === 'ausfuehren' && plan && (
              <>
                {laeuft ? (
                  <span className="busy">{laeuft}</span>
                ) : (
                  anlegenSperre && (
                    <span className="po-sperr-grund" id="po-anlegen-grund">
                      {anlegenSperre}
                    </span>
                  )
                )}
                <button
                  className="primary"
                  disabled={!!laeuft || !!anlegenSperre}
                  title={anlegenSperre ?? undefined}
                  aria-describedby={anlegenSperre ? 'po-anlegen-grund' : undefined}
                  onClick={() => void ausfuehrenJetzt()}
                >
                  {modus === 'neu' ? (desktop ? 'Projektordner anlegen' : 'Als ZIP herunterladen') : desktop ? 'Projekt ergänzen' : 'Neues als ZIP herunterladen'}
                </button>
              </>
            )}
          </div>
        )}
      </section>
    </div>
  );
}

/** Stand des Projekts beim Anlegen: Akquise oder beauftragt */
function StatusWahl({ status, onChange }: { status?: ProjektStatus; onChange: (s: ProjektStatus | undefined) => void }) {
  const akquise = status === 'akquise';
  return (
    <div className="po-statuswahl" role="radiogroup" aria-label="Stand des Projekts">
      <span className="field-label">Stand</span>
      <label className="toggle">
        <input type="radio" name="po-status" checked={!akquise && status !== 'abgeschlossen'} onChange={() => onChange(undefined)} />
        beauftragt (aktiv)
      </label>
      <label className="toggle">
        <input type="radio" name="po-status" checked={akquise} onChange={() => onChange('akquise')} />
        Akquise – noch nicht beauftragt
      </label>
      {status === 'abgeschlossen' && <span className="muted small-text">abgeschlossen (über die Projektübersicht wieder aktiv setzen)</span>}
    </div>
  );
}

/** Zusammenfassung vor dem Anlegen bzw. Ergänzen: was in der Projektdatei steht – je Abschnitt mit „ändern“ */
function Steckbrief({ stamm, presets, onSchritt, nichtGespeichert = false }: { stamm: Stammdaten; presets: string[]; onSchritt: (s: SchrittId) => void; nichtGespeichert?: boolean }) {
  const s = bereinigt(stamm);
  const leer = <span className="muted">–</span>;
  const kontakte = s.bauherr.kontakte.map((k) => k.wert).join(', ');
  const zeilen: { titel: string; schritt: SchrittId; inhalt: ReactNode }[] = [
    {
      titel: 'Projekt',
      schritt: 'stammdaten',
      inhalt: (
        <>
          <strong>{[s.nummer, s.kurzname].filter(Boolean).join(' ') || '–'}</strong>
          {s.bezeichnung && <div>{s.bezeichnung}</div>}
          <div className="muted">
            {anschriftEinzeilig(s.adresse) || 'ohne Adresse'} · {s.status === 'akquise' ? 'Akquise' : s.status === 'abgeschlossen' ? 'abgeschlossen' : 'beauftragt'}
          </div>
        </>
      ),
    },
    {
      titel: 'Grundstück',
      schritt: 'grundstueck',
      inhalt:
        flurText(s.grundstueck) || s.bebauungsplan || s.aktenzeichen || s.grundstueck.flaeche ? (
          <>
            {flurText(s.grundstueck) && <div>{flurText(s.grundstueck)}</div>}
            {s.grundstueck.flaeche ? <div>{s.grundstueck.flaeche.toLocaleString('de-DE')} m²</div> : null}
            {s.bebauungsplan && <div>Bebauungsplan {bebauungsplanText(s.bebauungsplan)}</div>}
            {s.aktenzeichen && <div>Aktenzeichen {s.aktenzeichen}</div>}
          </>
        ) : (
          leer
        ),
    },
    {
      titel: 'Bauherr',
      schritt: 'bauherr',
      inhalt: s.bauherr.name ? (
        <>
          <div>{[s.bauherr.vorname, s.bauherr.name].filter(Boolean).join(' ')}</div>
          {(anschriftEinzeilig(s.bauherr.adresse) || kontakte) && <div className="muted">{[anschriftEinzeilig(s.bauherr.adresse), kontakte].filter(Boolean).join(' · ')}</div>}
        </>
      ) : (
        leer
      ),
    },
    {
      titel: 'Umfang',
      schritt: 'umfang',
      inhalt: (
        <>
          <div>{s.leistungsphasen.length ? `LPh ${s.leistungsphasen.join(', ')} (${LEISTUNGSPHASEN.filter((l) => s.leistungsphasen.includes(l.nr)).map((l) => l.label).join(', ')})` : 'keine Leistungsphasen gewählt – alle Ordner'}</div>
          {s.bearbeiter && <div className="muted">Bearbeitung {s.bearbeiter}</div>}
        </>
      ),
    },
    {
      titel: 'Beteiligte',
      schritt: 'beteiligte',
      inhalt: s.beteiligte.length ? (
        <ul>
          {s.beteiligte.map((b, i) => (
            <li key={i}>
              {[b.rolle, b.name].filter(Boolean).join(': ')}
              {b.kontakt && <span className="muted"> ({b.kontakt})</span>}
            </li>
          ))}
        </ul>
      ) : (
        leer
      ),
    },
    { titel: 'Vorlagen', schritt: 'vorlagen', inhalt: presets.length ? presets.join(', ') : leer },
  ];
  return (
    <details className="po-steckbrief" open>
      <summary>{nichtGespeichert ? 'Zusammenfassung – wird nicht gespeichert (die Projektdatei ist nicht lesbar)' : 'Zusammenfassung – so steht es in der Projektdatei'}</summary>
      <table>
        <tbody>
          {zeilen.map((z) => (
            <tr key={z.titel}>
              <th>{z.titel}</th>
              <td>{z.inhalt}</td>
              <td>
                <button className="small" onClick={() => onSchritt(z.schritt)} aria-label={`${z.titel} ändern`}>
                  ändern
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  );
}
