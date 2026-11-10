import { useEffect, useMemo, useState } from 'react';
import { saveBinaryFile } from '@core/platform/files';
import { logger } from '@core/platform/log';
import type { Eintrag } from '../dateisystem';
import { hatDateisystem, SpeicherDateisystem, tauriDateisystem, verbinde, waehleOrdner, waehleOrdnerImBrowser } from '../dateisystem';
import type { Ergebnis, Plan } from '../plan';
import { ausfuehren, ohne, planen } from '../plan';
import type { ProjektDatei, Stammdaten } from '../stammdaten';
import { LEISTUNGSPHASEN, leseProjektJson, PROJEKT_DATEI } from '../stammdaten';
import { useOrdner } from '../store';
import { ErgebnisAnzeige, PlanMeldungen, PlanTabelle, PresetAuswahl, VorlagenordnerZeile } from './gemeinsam';

const log = logger('aktualisieren');

/** ein eingelesener Projektordner */
export interface GeladenerOrdner {
  /** vollständiger Pfad (Desktop) bzw. leer im Browser */
  pfad: string;
  name: string;
  eintraege: Eintrag[];
  lies: (pfad: string) => Promise<Uint8Array>;
}

/** Desktop: Projektordner einlesen */
export async function ladeProjektordner(pfad: string): Promise<GeladenerOrdner> {
  const name = pfad.replace(/[\\/]+$/, '').split(/[\\/]/).pop() ?? pfad;
  return { pfad, name, eintraege: await tauriDateisystem.liste(pfad, 12), lies: (p) => tauriDateisystem.lies(pfad, p) };
}

const stammAus = (p: ProjektDatei): Stammdaten => {
  const { format: _f, version: _v, angelegt: _a, struktur: _s, dateischema: _d, ...stamm } = p;
  return stamm;
};

/** nur, was im Projektordner noch fehlt */
const nurFehlendes = (plan: Plan): Plan => ({ ...plan, schritte: plan.schritte.filter((s) => !s.vorhanden) });

/**
 * Projekt aktualisieren: In einem vorhandenen Projektordner ergänzen, was nach Struktur und Presets fehlt –
 * Ordner, Vorlagen, Stammdaten. Vorhandenes bleibt unverändert.
 */
export function AktualisierenView({ ordner, setOrdner }: { ordner: GeladenerOrdner | null; setOrdner: (o: GeladenerOrdner | null) => void }) {
  const desktop = hatDateisystem();
  const { struktur, stammordner, vorlagen } = useOrdner();
  const [projekt, setProjekt] = useState<ProjektDatei | null>(null);
  const [projektFehler, setProjektFehler] = useState<string | null>(null);
  const [stamm, setStamm] = useState<Stammdaten | null>(null);
  const [ausFormular, setAusFormular] = useState(false);
  const [projekte, setProjekte] = useState<string[]>([]);
  const [abgewaehlt, setAbgewaehlt] = useState<Set<string>>(new Set());
  const [nurNeu, setNurNeu] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);
  const [laeuft, setLaeuft] = useState<string | null>(null);
  const [ergebnis, setErgebnis] = useState<{ ordner: string; liste: Ergebnis[] } | null>(null);
  /** zählt das Einlesen von Hand – dann auch die projekt.json neu lesen (nach dem Ergänzen nicht) */
  const [lesung, setLesung] = useState(0);

  // Projekte im Stammordner zur Auswahl
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
      () => aktuell && setProjekte([]),
    );
    return () => {
      aktuell = false;
    };
  }, [desktop, stammordner]);

  // Stammdaten aus der projekt.json des Ordners
  const ordnerPfad = ordner ? `${ordner.pfad}|${ordner.name}` : '';
  useEffect(() => {
    setProjekt(null);
    setProjektFehler(null);
    setStamm(null);
    setAusFormular(false);
    setAbgewaehlt(new Set());
    if (!ordner) return;
    const datei = ordner.eintraege.find((e) => !e.ordner && e.pfad.toLowerCase() === PROJEKT_DATEI);
    if (!datei) return;
    let aktuell = true;
    ordner
      .lies(datei.pfad)
      .then((b) => leseProjektJson(new TextDecoder('utf-8').decode(b)))
      .then(
        (p) => {
          if (!aktuell) return;
          setProjekt(p);
          setStamm(stammAus(p));
        },
        (e) => aktuell && setProjektFehler(e instanceof Error ? e.message : String(e)),
      );
    return () => {
      aktuell = false;
    };
  }, [ordnerPfad, lesung]); // eslint-disable-line react-hooks/exhaustive-deps

  const jahr = projekt && /^\d{4}/.test(projekt.angelegt) ? Number(projekt.angelegt.slice(0, 4)) : undefined;
  const plan = useMemo(() => (ordner && stamm ? planen(stamm, struktur, vorlagen, ordner.eintraege, new Date(), { ordner: ordner.name, jahr }) : null), [ordner, stamm, struktur, vorlagen, jahr]);
  const auszufuehren = useMemo(() => (plan ? nurFehlendes(ohne(plan, abgewaehlt)) : null), [plan, abgewaehlt]);
  const fehlen = auszufuehren?.schritte ?? [];

  const laden = async (pfad: string) => {
    setFehler(null);
    setErgebnis(null);
    setLaeuft('Projektordner wird gelesen …');
    try {
      setOrdner(await ladeProjektordner(pfad));
      setLesung((n) => n + 1);
    } catch (e) {
      setFehler(e instanceof Error ? e.message : String(e));
    } finally {
      setLaeuft(null);
    }
  };

  const waehlen = async () => {
    setFehler(null);
    setErgebnis(null);
    if (desktop) {
      const p = await waehleOrdner('Projektordner wählen');
      if (p) await laden(p);
      return;
    }
    const o = await waehleOrdnerImBrowser();
    if (o) setOrdner({ pfad: '', name: o.name, eintraege: o.eintraege, lies: o.lies });
  };

  const ergaenzen = async () => {
    if (!ordner || !auszufuehren) return;
    setFehler(null);
    setErgebnis(null);
    try {
      if (desktop) {
        setLaeuft('Fehlendes wird ergänzt …');
        const liste = await ausfuehren(tauriDateisystem, ordner.pfad, auszufuehren, { imProjektordner: true, fortschritt: (i, n) => setLaeuft(`Fehlendes wird ergänzt … ${i} / ${n}`) });
        log.info(`Projekt aktualisiert: ${ordner.name}`, { angelegt: liste.filter((x) => x.status === 'angelegt').length, fehler: liste.filter((x) => x.status === 'fehler').length, presets: auszufuehren.presets });
        setErgebnis({ ordner: ordner.pfad, liste });
        setAbgewaehlt(new Set());
        // neu einlesen, damit der Trockenlauf den neuen Stand zeigt
        setOrdner({ ...ordner, eintraege: await tauriDateisystem.liste(ordner.pfad, 12) });
      } else {
        setLaeuft('ZIP wird erstellt …');
        const fs = new SpeicherDateisystem();
        const liste = await ausfuehren(fs, '/zip', auszufuehren, { imProjektordner: true });
        const ok = await saveBinaryFile({ defaultName: `${ordner.name} Ergänzung.zip`, data: fs.alsZip('/zip'), filterName: 'ZIP-Archiv', extension: 'zip', mime: 'application/zip' });
        if (ok) setErgebnis({ ordner: '', liste });
      }
    } catch (e) {
      log.error('Aktualisieren fehlgeschlagen', e instanceof Error ? e.message : String(e));
      setFehler(e instanceof Error ? e.message : String(e));
    } finally {
      setLaeuft(null);
    }
  };

  const umschalten = (pfad: string) =>
    setAbgewaehlt((alt) => {
      const neu = new Set(alt);
      if (!neu.delete(pfad)) neu.add(pfad);
      return neu;
    });
  const toggleLph = (nr: number) => stamm && setStamm({ ...stamm, leistungsphasen: stamm.leistungsphasen.includes(nr) ? stamm.leistungsphasen.filter((x) => x !== nr) : [...stamm.leistungsphasen, nr].sort() });
  const formular = useOrdner((s) => s.stamm);

  return (
    <div className="po-view">
      <section className="po-col">
        <h2>Projekt aktualisieren</h2>
        <p className="muted small-text">
          Ergänzt in einem vorhandenen Projektordner, was nach der Struktur „{struktur.name}“ und den gewählten Presets fehlt: Ordner, Vorlagen und Stammdaten. Vorhandenes
          bleibt unverändert – nichts wird überschrieben, verschoben oder gelöscht.
          {!desktop && ' Im Browser entsteht eine ZIP-Datei mit dem, was fehlt, zum Entpacken in den Projektordner.'}
        </p>
        {desktop && projekte.length > 0 && (
          <label className="field">
            <span className="field-label">Projekt im Stammordner</span>
            <select value={ordner && verbinde(stammordner, ordner.name) === ordner.pfad ? ordner.name : ''} onChange={(e) => e.target.value && void laden(verbinde(stammordner, e.target.value))}>
              <option value="">– wählen –</option>
              {projekte.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </label>
        )}
        <div className="button-row">
          <button className={ordner ? '' : 'primary'} disabled={!!laeuft} onClick={() => void waehlen()}>
            {desktop ? (projekte.length ? 'Anderen Ordner wählen …' : 'Projektordner wählen …') : 'Projektordner einlesen …'}
          </button>
          {desktop && ordner?.pfad && (
            <button disabled={!!laeuft} onClick={() => void laden(ordner.pfad)}>
              Neu einlesen
            </button>
          )}
        </div>
        {fehler && <p className="warning">{fehler}</p>}

        {ordner && (
          <>
            <h3>{ordner.name}</h3>
            {ordner.pfad && <code className="po-pfad">{ordner.pfad}</code>}
            {projekt && (
              <table className="po-table po-stamm">
                <tbody>
                  <tr>
                    <th>Projekt</th>
                    <td>
                      {projekt.nummer} {projekt.kurzname}
                    </td>
                  </tr>
                  {projekt.bezeichnung && (
                    <tr>
                      <th>Bezeichnung</th>
                      <td>{projekt.bezeichnung}</td>
                    </tr>
                  )}
                  {projekt.bauherr.name && (
                    <tr>
                      <th>Bauherr</th>
                      <td>{projekt.bauherr.name}</td>
                    </tr>
                  )}
                  <tr>
                    <th>Angelegt</th>
                    <td>
                      {projekt.angelegt ? new Date(projekt.angelegt).toLocaleDateString('de-DE') : '–'}
                      {projekt.struktur && `, Struktur „${projekt.struktur}“`}
                    </td>
                  </tr>
                </tbody>
              </table>
            )}
            {projekt && projekt.struktur && projekt.struktur !== struktur.name && (
              <p className="muted small-text">
                Das Projekt wurde nach der Struktur „{projekt.struktur}“ angelegt; ergänzt wird nach der eingestellten Struktur „{struktur.name}“.
              </p>
            )}
            {!projekt && !ausFormular && (
              <div className="warning">
                {projektFehler ? `${PROJEKT_DATEI} ist nicht lesbar: ${projektFehler}` : `Im Ordner liegt keine ${PROJEKT_DATEI}.`} Ohne Stammdaten lassen sich Namen und Inhalte der
                Vorlagen nicht füllen.
                <div className="button-row">
                  <button
                    className="small"
                    disabled={!formular.nummer.trim() || !formular.kurzname.trim()}
                    title="Stammdaten aus dem Formular unter „Neues Projekt“ verwenden – die fehlende projekt.json wird daraus angelegt"
                    onClick={() => {
                      setStamm({ ...formular });
                      setAusFormular(true);
                    }}
                  >
                    Stammdaten aus „Neues Projekt“ verwenden{formular.nummer.trim() ? ` (${formular.nummer} ${formular.kurzname})` : ''}
                  </button>
                </div>
              </div>
            )}
            {ausFormular && stamm && (
              <p className="muted small-text">
                Stammdaten aus „Neues Projekt“: {stamm.nummer} {stamm.kurzname}
                {projektFehler ? '' : ` – die ${PROJEKT_DATEI} wird daraus angelegt`}.
              </p>
            )}

            {stamm && (
              <>
                <h3>Leistungsphasen</h3>
                <div className="po-lph" title="Ordner und Vorlagen, die an Leistungsphasen gebunden sind, werden nur für die gewählten ergänzt. Die projekt.json bleibt unverändert.">
                  {LEISTUNGSPHASEN.map((l) => (
                    <label key={l.nr} className="toggle" title={l.label}>
                      <input type="checkbox" checked={stamm.leistungsphasen.includes(l.nr)} onChange={() => toggleLph(l.nr)} />
                      LPh {l.nr}
                    </label>
                  ))}
                </div>
                <h3>Vorlagen-Presets</h3>
                <PresetAuswahl struktur={struktur} auswahl={stamm.presets} onChange={(presets) => setStamm({ ...stamm, presets })} />
                <p className="muted small-text">
                  Vorausgewählt ist, was in der {PROJEKT_DATEI} steht (ohne Angabe die Standard-Presets). Änderungen gelten für diesen Lauf; die {PROJEKT_DATEI} bleibt unverändert.
                </p>
              </>
            )}
          </>
        )}
      </section>

      <section className="po-col">
        <h2>Trockenlauf</h2>
        <VorlagenordnerZeile leerText="keiner – ergänzt werden nur Ordner und Stammdaten" />
        {!ordner && <p className="muted small-text">Zuerst einen Projektordner wählen.</p>}
        {ordner && !plan && <p className="muted small-text">Ohne Stammdaten gibt es keinen Plan.</p>}
        {plan && (
          <>
            <h3>
              {ordner?.name}
              <span className="muted small-text">
                {' '}
                – {fehlen.length ? `${fehlen.filter((s) => s.art === 'ordner').length} Ordner und ${fehlen.filter((s) => s.art === 'datei').length} Dateien fehlen` : 'nichts fehlt'}
              </span>
            </h3>
            <label className="toggle po-nurneu">
              <input type="checkbox" checked={nurNeu} onChange={() => setNurNeu(!nurNeu)} />
              nur Fehlendes zeigen
            </label>
            <PlanTabelle plan={plan} abgewaehlt={abgewaehlt} onUmschalten={umschalten} nurNeu={nurNeu} />
            <PlanMeldungen plan={plan} />
            <div className="button-row">
              <button className="primary" disabled={!!laeuft || plan.fehler.length > 0 || !fehlen.length} onClick={() => void ergaenzen()}>
                {desktop ? 'Fehlendes ergänzen' : 'Fehlendes als ZIP herunterladen'}
              </button>
              {laeuft && <span className="busy">{laeuft}</span>}
            </div>
            <p className="muted small-text">
              Es wird nur neu angelegt. Dateien mit Datum im Namen gelten als vorhanden, wenn es sie mit einem anderen Datum schon gibt (vorhanden*). Einzelne Einträge lassen
              sich abwählen.
            </p>
          </>
        )}
        {ergebnis && <ErgebnisAnzeige ordner={ergebnis.ordner} liste={ergebnis.liste} />}
      </section>
    </div>
  );
}
