import { useEffect, useMemo, useRef, useState } from 'react';
import type { Beteiligter } from '@core/model';
import { zuletztMerken } from '@core/platform/konfig';
import { saveBinaryFile } from '@core/platform/files';
import { logger } from '@core/platform/log';
import { StammdatenFelder } from '@core/ui/Stammdaten';
import type { Dateisystem, Eintrag } from '../dateisystem';
import { hatDateisystem, SpeicherDateisystem, tauriDateisystem, verbinde, waehleOrdner, waehleOrdnerImBrowser } from '../dateisystem';
import { ausOrdnername, naechsteNummer, nummerPasst } from '../nummer';
import type { Ergebnis, Plan } from '../plan';
import { ausfuehren, nichtVorausgewaehlt, ohne, planen, tutEtwas } from '../plan';
import type { GeladenerOrdner, GeladenesProjekt } from '../projekt';
import { beteiligteSammeln, projektEinlesen } from '../projekt';
import type { Stammdaten } from '../stammdaten';
import { formularMeta, leereStammdaten, stammAusMeta } from '../stammdaten';
import { useOrdner } from '../store';
import { aktivePresets } from '../struktur';
import { ErgebnisAnzeige, PlanMeldungen, PlanTabelle, PresetAuswahl, VorlagenordnerZeile } from './gemeinsam';
import { ProjektStart } from './ProjektStart';

const log = logger('assistent');

type Modus = 'neu' | 'ergaenzen';
type SchrittId = 'start' | 'stammdaten' | 'umfang' | 'vorlagen' | 'ausfuehren';

const SCHRITTE: { id: SchrittId; label: string }[] = [
  { id: 'start', label: 'Projekt' },
  { id: 'stammdaten', label: 'Stammdaten' },
  { id: 'umfang', label: 'Umfang' },
  { id: 'vorlagen', label: 'Vorlagen' },
  { id: 'ausfuehren', label: 'Anlegen' },
];

/** Desktop: Projektordner einlesen (`fs` ersetzt das Dateisystem des Desktops, etwa in Tests) */
export async function ladeProjektordner(pfad: string, fs: Dateisystem = tauriDateisystem): Promise<GeladenerOrdner> {
  const name = pfad.replace(/[\\/]+$/, '').split(/[\\/]/).pop() ?? pfad;
  return { pfad, name, eintraege: await fs.liste(pfad, 12), lies: (p) => fs.lies(pfad, p) };
}

/** so lange lässt sich der geleerte Entwurf nach dem Anlegen wiederherstellen */
const RUECKGAENGIG_MS = 10_000;

/** „1 Datei“, „2 Dateien“ */
const anzahlDateien = (n: number) => `${n} ${n === 1 ? 'Datei' : 'Dateien'}`;

/** Satz zur Projektdatei je Lage: neu angelegt, auf dem Desktop gezielt ergänzt; im Browser (ZIP) kein Satz zum Ergänzen */
function projektdateiSatz(modus: Modus | null, desktop: boolean, neu: boolean): string {
  if (neu) return 'Die Projektdatei wird neu angelegt.';
  if (modus === 'ergaenzen' && desktop) return 'Die Projektdatei wird gezielt ergänzt (vorher gesichert).';
  return '';
}

/** nur, was etwas tut (Neues anlegen, die Projektdatei ergänzen) */
const nurWasEtwasTut = (plan: Plan): Plan => ({ ...plan, schritte: plan.schritte.filter(tutEtwas) });

/**
 * Projekt-Assistent: ein neues Projekt anlegen oder ein bestehendes ergänzen – Schritt für Schritt Stammdaten,
 * Umfang (Leistungsphasen, Beteiligte) und Vorlagen, zum Schluss der Trockenlauf. Alles landet in der
 * Projektdatei (.oap) des Projektordners; fehlt sie, wird sie angelegt. Gelöscht wird nichts.
 */
export function AssistentView({ start, onEinstellungen }: { start?: GeladenerOrdner | null; onEinstellungen?: () => void }) {
  const desktop = hatDateisystem();
  const { stamm: entwurf, struktur, stammordner, vorlagen, allgemein, setStamm, setStammordner, neuesProjekt } = useOrdner();
  const [modus, setModus] = useState<Modus | null>(start ? 'ergaenzen' : null);
  const [schritt, setSchritt] = useState<SchrittId>(start ? 'stammdaten' : 'start');
  const [ordner, setOrdner] = useState<GeladenerOrdner | null>(start ?? null);
  const [geladen, setGeladen] = useState<GeladenesProjekt | null>(null);
  const [stammE, setStammE] = useState<Stammdaten | null>(null);
  const [projekte, setProjekte] = useState<string[]>([]);
  const [suche, setSuche] = useState('');
  const [vorhandeneNeu, setVorhandeneNeu] = useState<Eintrag[]>([]);
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
    void Promise.all(allgemein.projekte.map((r) => tauriDateisystem.liste(r, 1).then((l) => l.filter((e) => e.ordner).map((e) => e.pfad), () => [] as string[]))).then(
      (je) => aktuell && setAlleNamen(je.flat()),
    );
    return () => {
      aktuell = false;
    };
  }, [desktop, stammordnerSchluessel, ergebnis]); // eslint-disable-line react-hooks/exhaustive-deps

  // Beteiligte früherer Projekte als Vorschläge (im Hintergrund, sobald der Umfang dran ist)
  useEffect(() => {
    if (schritt !== 'umfang' || beteiligtVorschlaege || !desktop || !allgemein.projekte.length) return;
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
    projektEinlesen(ordner).then((g) => {
      if (!aktuell) return;
      setGeladen(g);
      if (g.angaben) {
        const { angelegt: _a, struktur: _s, dateischema: _d, ...stamm } = g.angaben;
        setStammE(stamm);
      } else {
        // ohne Projektdatei: Nummer und Kurzname aus dem Ordnernamen vorschlagen
        setStammE({ ...leereStammdaten(), ...ausOrdnername(struktur.ordnername, ordner.name), bearbeiter: entwurf.bearbeiter });
      }
    });
    return () => {
      aktuell = false;
    };
  }, [ordnerSchluessel, lesung]); // eslint-disable-line react-hooks/exhaustive-deps

  const stamm = modus === 'ergaenzen' ? stammE : entwurf;
  const aendereStamm = (patch: Partial<Stammdaten>) => {
    if (modus === 'ergaenzen') setStammE((s) => (s ? { ...s, ...patch } : s));
    else setStamm(patch);
  };

  // neues Projekt: gibt es den Ordner im Stammordner schon?
  const neuerName = useMemo(() => (modus === 'neu' ? planen(entwurf, struktur, []).ordner : ''), [modus, entwurf, struktur]);
  const gibtEsSchon = modus === 'neu' && !!neuerName && projekte.some((p) => p.toLowerCase() === neuerName.toLowerCase());
  useEffect(() => {
    if (!desktop || !gibtEsSchon) return setVorhandeneNeu([]);
    let aktuell = true;
    tauriDateisystem.liste(verbinde(stammordner, neuerName), 12).then(
      (l) => aktuell && setVorhandeneNeu(l),
      () => aktuell && setVorhandeneNeu([]),
    );
    return () => {
      aktuell = false;
    };
  }, [desktop, gibtEsSchon, stammordner, neuerName]);

  const jahr = geladen?.angaben && /^\d{4}/.test(geladen.angaben.angelegt) ? Number(geladen.angaben.angelegt.slice(0, 4)) : undefined;
  const plan = useMemo(() => {
    if (!stamm || !modus) return null;
    if (modus === 'ergaenzen') {
      if (!ordner || !geladen) return null;
      return planen(stamm, struktur, vorlagen, ordner.eintraege, new Date(), { ordner: ordner.name, jahr, oapPfad: allgemein.oapPfad, projektdatei: geladen.projektdatei });
    }
    return planen(stamm, struktur, vorlagen, vorhandeneNeu, new Date(), { oapPfad: allgemein.oapPfad });
  }, [modus, stamm, struktur, vorlagen, ordner, geladen, vorhandeneNeu, jahr, allgemein.oapPfad]);
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
      void zuletztMerken(pfad, 'Projektordner').catch(() => undefined);
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
    if (o) ergaenzenMit({ pfad: '', name: o.name, eintraege: o.eintraege, lies: o.lies });
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
          const liste = await ausfuehren(tauriDateisystem, stammordner, auszufuehren, { fortschritt: (i, n) => setLaeuft(`Projektordner wird angelegt … ${i} / ${n}`) });
          log.info(`Projektordner angelegt: ${auszufuehren.ordner}`, { angelegt: liste.filter((x) => x.status === 'angelegt').length, fehler: liste.filter((x) => x.status === 'fehler').length, presets: auszufuehren.presets });
          fertig(auszufuehren.ordner, verbinde(stammordner, auszufuehren.ordner), liste);
          void zuletztMerken(verbinde(stammordner, auszufuehren.ordner), 'Projektordner').catch(() => undefined);
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
  // Meldungen, die an einem Feld stehen (Nummer, Kurzname) – nicht noch einmal als Kasten
  const AM_FELD = ['Die Projektnummer fehlt.', 'Der Kurzname fehlt.'];
  const kannWeiter = (id: SchrittId) => (id === 'start' ? !!modus && (modus === 'neu' || !!stamm) : id === 'stammdaten' ? !stammFehler.length : true);
  const index = SCHRITTE.findIndex((s) => s.id === schritt);
  const naechster = SCHRITTE[index + 1];
  const voriger = SCHRITTE[index - 1];
  // ein Schritt ist erreichbar, wenn alle davor taugen
  const erreichbar = (i: number) => !!modus && SCHRITTE.slice(0, i).every((s) => kannWeiter(s.id));

  const weiterGehen = () => {
    if (!naechster) return;
    if (!kannWeiter(schritt)) return setVersucht(true);
    setVersucht(false);
    setSchritt(naechster.id);
  };
  // Strg+Enter = „Weiter“ – nach dem Übernehmen des Feldes, in dem der Fokus steht (Enter verlässt das Feld)
  const tasten = (e: React.KeyboardEvent) => {
    if (e.key !== 'Enter' || !(e.ctrlKey || e.metaKey) || schritt === 'start') return;
    e.preventDefault();
    setTimeout(() => weiterKnopf.current?.click(), 0);
  };
  const neueEintraege = (plan?.schritte ?? []).filter((x) => !x.vorhanden).map((x) => x.pfad);

  const nichtAutomatisch = useMemo(() => nichtVorausgewaehlt(struktur, vorlagen), [struktur, vorlagen]);
  const presetsAktiv = aktivePresets(struktur, stamm?.presets, nichtAutomatisch.keys()).presets;
  const ohneProjektdatei = modus === 'ergaenzen' && geladen && !geladen.projektdatei;

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
          entwurf={entwurfText}
          onNeu={neuBeginnen}
          onLeerNeu={() => {
            neuesProjekt();
            neuBeginnen();
          }}
          onOeffnen={(pfad) => void ordnerLaden(pfad)}
          onAndererOrdner={() => void ordnerWaehlen()}
          onEinstellungen={onEinstellungen}
        />
      </div>
    );
  }

  return (
    <div className="po-view einspaltig po-assistent">
      <section className="po-col" onKeyDown={tasten}>
        <ol className="po-schritte" aria-label="Schritte">
          {SCHRITTE.map((s, i) => (
            <li key={s.id} className={`${s.id === schritt ? 'aktiv' : ''}${i < index ? ' erledigt' : ''}`} aria-current={s.id === schritt ? 'step' : undefined}>
              <button disabled={!erreichbar(i) && s.id !== schritt} onClick={() => setSchritt(s.id)}>
                <span className="po-schritt-nr">{i + 1}</span>
                {s.id === 'ausfuehren' && modus === 'ergaenzen' ? 'Ergänzen' : s.label}
              </button>
            </li>
          ))}
        </ol>
        {modus && schritt !== 'start' && (
          <p className="po-kontext">
            {modus === 'neu' ? (
              <>
                Neues Projekt: <strong>{abschluss?.ordner || plan?.ordner || 'noch ohne Namen'}</strong>
              </>
            ) : (
              <>
                Ergänzen: <strong>{ordner?.name}</strong>
                {geladen && (geladen.projektdatei ? ` · Projektdatei ${geladen.projektdatei.pfad}` : ' · noch ohne Projektdatei – sie wird angelegt')}
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
                  <input className="po-suche" value={suche} placeholder="Projekt suchen …" onChange={(e) => setSuche(e.target.value)} />
                  <ul className="list po-projektliste">
                    {gefiltert.slice(0, 200).map((p) => (
                      <li key={p} onClick={() => void ordnerLaden(verbinde(stammordner, p))} title={verbinde(stammordner, p)}>
                        {p}
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
            <h2>Stammdaten</h2>
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
            {geladen?.quelle.fehler && <p className="warning">Die Projektdatei {geladen.quelle.pfad} ist nicht lesbar: {geladen.quelle.fehler}</p>}
            <StammdatenFelder
              meta={formularMeta(stamm)}
              onChange={(m) => aendereStamm(stammAusMeta(m, stamm.presets ? { presets: stamm.presets } : undefined))}
              bereiche={['projekt', 'grundstueck', 'bauherr']}
              nummerHinweis={modus === 'neu' ? `Schema ${struktur.nummernschema}` : undefined}
              nummerVorschlag={modus === 'neu' && desktop && alleNamen.length ? vorschlag : undefined}
              nummerPruefen={modus === 'neu' ? nummerPruefen : undefined}
              // beim Ergänzen wird der vorhandene Ordner nicht umbenannt
              kurznameHinweis={modus === 'neu' ? undefined : 'Der Ordner wird nicht umbenannt.'}
              kurznamePflicht={modus === 'neu'}
              ordnerName={modus === 'neu' ? (plan?.ordner ?? '') : undefined}
              fehlerZeigen={versucht}
            />
            {modus === 'neu' && gibtEsSchon && (
              <p className="po-hinweis">
                Den Ordner „{neuerName}“ gibt es im Stammordner schon.{' '}
                <button className="small" onClick={() => void ordnerLaden(verbinde(stammordner, neuerName))}>
                  Dieses Projekt ergänzen
                </button>
              </p>
            )}
            {modus === 'neu' && (
              <div className="button-row">
                <button className="small" onClick={neuesProjekt} title="Formular leeren (Bearbeitung bleibt stehen)">
                  Formular leeren
                </button>
              </div>
            )}
            {stammFehler
              .filter((f) => !AM_FELD.includes(f))
              .map((f) => (
                <p key={f} className="warning">
                  {f}
                </p>
              ))}
          </>
        )}

        {schritt === 'umfang' && stamm && (
          <>
            <h2>Umfang</h2>
            <p className="muted small-text">Ordner und Vorlagen, die an Leistungsphasen gebunden sind, entstehen nur für die beauftragten. Ohne Auswahl entsteht alles.</p>
            <StammdatenFelder
              meta={formularMeta(stamm)}
              onChange={(m) => aendereStamm(stammAusMeta(m, stamm.presets ? { presets: stamm.presets } : undefined))}
              bereiche={['umfang']}
              bearbeiterVorschlaege={allgemein.mitarbeiter}
              beteiligtVorschlaege={beteiligtVorschlaege ?? undefined}
            />
          </>
        )}

        {schritt === 'vorlagen' && stamm && (
          <>
            <h2>Vorlagen</h2>
            <VorlagenordnerZeile />
            <span className="field-label">Vorlagen-Presets</span>
            <PresetAuswahl struktur={struktur} auswahl={stamm.presets} onChange={(presets) => aendereStamm({ presets })} nichtAutomatisch={nichtAutomatisch} />
            <ul className="po-hinweise">
              {presetsAktiv.map((p) => (
                <li key={p.name}>
                  {p.name}: {p.eintraege.length} {p.eintraege.length === 1 ? 'Zuordnung' : 'Zuordnungen'}
                </li>
              ))}
            </ul>
            <p className="muted small-text">Welche Datei wohin kommt und wie sie heißt, steht unter „Vorlagen“. Die Auswahl wird in der Projektdatei vermerkt.</p>
          </>
        )}

        {schritt === 'ausfuehren' && modus === 'neu' && abschluss && (
          <div className="po-abschluss">
            <h2>{desktop ? 'Projekt angelegt' : 'Projekt als ZIP heruntergeladen'}</h2>
            <p className="po-abschluss-name">
              <strong>{abschluss.ordner}</strong>
              {!desktop && <span className="muted small-text"> ({abschluss.ordner}.zip – entpacken, wo das Projekt liegen soll)</span>}
            </p>
            <ErgebnisAnzeige ordner={abschluss.pfad} liste={abschluss.liste}>
              <button className="small primary" onClick={naechstesProjekt}>
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
            {desktop && <p className="muted small-text">Das Projekt steht in allen Apps unter „Zuletzt geöffnet“ – etwa im Flächenrechner zum Weiterarbeiten.</p>}
          </div>
        )}

        {schritt === 'ausfuehren' && !(modus === 'neu' && abschluss) && (
          <>
            <h2>{modus === 'ergaenzen' ? 'Ergänzen' : 'Anlegen'}</h2>
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
                {neueEintraege.length > 1 && (
                  <div className="button-row po-auswahl">
                    <button className="small" title="Nichts Neues anlegen – dann einzelne Einträge wieder anwählen" onClick={() => setAbgewaehlt(new Set(neueEintraege))}>
                      Alle neuen Einträge abwählen
                    </button>
                    {abgewaehlt.size > 0 && (
                      <button className="small" onClick={() => setAbgewaehlt(new Set())}>
                        Alle wieder wählen
                      </button>
                    )}
                  </div>
                )}
                <PlanTabelle plan={plan} abgewaehlt={abgewaehlt} onUmschalten={umschalten} nurNeu={modus === 'ergaenzen' && nurNeu} />
                <PlanMeldungen plan={plan} />
                {modus === 'ergaenzen' && !desktop && plan.projektdatei.teile.length > 0 && (
                  <p className="muted small-text">Die vorhandene Projektdatei lässt sich nur in der Desktop-App ergänzen; die ZIP-Datei enthält nur Neues.</p>
                )}
                <div className="button-row">
                  <button className="primary" disabled={!!laeuft || plan.fehler.length > 0 || (modus === 'neu' && desktop && !stammordner) || !offen.length} onClick={() => void ausfuehrenJetzt()}>
                    {modus === 'neu' ? (desktop ? 'Projektordner anlegen' : 'Als ZIP herunterladen') : desktop ? 'Projekt ergänzen' : 'Neues als ZIP herunterladen'}
                  </button>
                  {laeuft && <span className="busy">{laeuft}</span>}
                </div>
                <p className="muted small-text">
                  Ordner und Dateien werden nur neu angelegt; Vorhandenes bleibt unverändert, nichts wird verschoben oder gelöscht.{' '}
                  {projektdateiSatz(modus, desktop, plan.projektdatei.neu)} Einzelne Einträge lassen sich abwählen.
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

        {schritt !== 'start' && (
          <div className="button-row po-navigation">
            {voriger && <button onClick={() => setSchritt(voriger.id)}>← {voriger.id === 'start' ? 'Anderes Projekt' : voriger.label}</button>}
            {naechster && (
              <button
                ref={weiterKnopf}
                className="primary"
                title={`${schritt === 'stammdaten' && stammFehler.length ? `${stammFehler.join(' ')} ` : ''}(Strg+Enter)`}
                onClick={weiterGehen}
              >
                Weiter: {naechster.id === 'ausfuehren' && modus === 'ergaenzen' ? 'Ergänzen' : naechster.label} →
              </button>
            )}
            {versucht && !kannWeiter(schritt) && (
              <span className="po-weiter-grund" role="status">
                Noch offen: {stammFehler.map((f) => f.replace(/\.$/, '')).join(', ')}
              </span>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
