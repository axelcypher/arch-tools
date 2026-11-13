import { useEffect, useState } from 'react';
import type { ProjektordnerEintrag } from '@core/platform/projektordner';
import { projekteAuflisten } from '@core/platform/projektordner';
import { saveTextFile } from '@core/platform/files';
import { logger } from '@core/platform/log';
import { Symbol } from '@core/ui/Symbol';
import type { Dateisystem } from '../dateisystem';
import { hatDateisystem, oeffneOrdner, tauriDateisystem, waehleOrdner, waehleOrdnerImBrowser } from '../dateisystem';
import type { GeladenerOrdner } from '../projekt';
import { projektEinlesen } from '../projekt';
import type { BefundArt, Pruefergebnis } from '../pruefung';
import { pruefe } from '../pruefung';
import type { SammelZeile } from '../sammel';
import { allePruefen, BEFUND_ART, berichtCsv, sammelCsv } from '../sammel';
import { useOrdner } from '../store';
import { sichererName } from '../struktur';
import { ladeProjektordner } from './AssistentView';

const log = logger('pruefen');

/** Zählung in der Kopfzeile des Berichts, Fehler zuerst */
const ZAEHLUNG: { art: BefundArt; eins: string; mehr: string }[] = [
  { art: 'fehler', eins: 'Fehler', mehr: 'Fehler' },
  { art: 'warnung', eins: 'Abweichung', mehr: 'Abweichungen' },
  { art: 'hinweis', eins: 'Hinweis', mehr: 'Hinweise' },
];
const MAX_PFADE = 40;
/** längere Pfadlisten sind eingeklappt */
const PFADE_OFFEN = 5;
const CSV_KNOPF = 'Als CSV speichern …';

interface Geprueft extends GeladenerOrdner {
  ergebnis: Pruefergebnis;
}

/**
 * Prüfmodus: Projektordner einlesen und Abweichungen von der Struktur melden – einzeln (aus der Projektliste der
 * Stammordner oder per „Ordner wählen …“) oder alle auf einmal mit Übersicht und CSV. Nur lesend; einzig „fehlende
 * Ordner anlegen“ legt auf Wunsch Ordner an. `fs` ersetzt das Dateisystem des Desktops (Tests).
 */
export function PruefView({ onErgaenzen, onMails, fs: fsVorgabe, start }: { onErgaenzen: (o: GeladenerOrdner) => void; onMails?: (pfad: string) => void; fs?: Dateisystem; start?: string | null }) {
  const desktop = hatDateisystem();
  const fs = fsVorgabe ?? (desktop ? tauriDateisystem : null);
  const struktur = useOrdner((s) => s.struktur);
  const roots = useOrdner((s) => s.allgemein.projekte);
  const [g, setG] = useState<Geprueft | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [laeuft, setLaeuft] = useState<string | null>(null);
  const [projekte, setProjekte] = useState<ProjektordnerEintrag[]>([]);
  const [suche, setSuche] = useState('');
  const [alle, setAlle] = useState<SammelZeile[] | null>(null);

  // Projektordner aller Stammordner – Klick prüft
  const rootsSchluessel = roots.join('|');
  useEffect(() => {
    if (!fs || !roots.length) return setProjekte([]);
    let aktuell = true;
    void projekteAuflisten(fs, roots)
      .then((r) => aktuell && setProjekte(r.projekte))
      .catch((e) => aktuell && setFehler(`Die Stammordner lassen sich nicht lesen: ${e instanceof Error ? e.message : String(e)}`));
    return () => {
      aktuell = false;
    };
  }, [fs, rootsSchluessel]); // eslint-disable-line react-hooks/exhaustive-deps

  // aus der Projektübersicht: dieses Projekt gleich prüfen
  useEffect(() => {
    if (start) void pruefenPfad(start);
  }, [start]); // eslint-disable-line react-hooks/exhaustive-deps

  const auswerten = async (o: GeladenerOrdner) => {
    const g = await projektEinlesen(o);
    const ergebnis = pruefe(o.name, o.eintraege, struktur, g.angaben, g.quelle);
    log.info(`Ordner geprüft: ${o.name}`, { ordner: ergebnis.ordner, dateien: ergebnis.dateien, befunde: ergebnis.befunde.filter((b) => b.art !== 'ok').length });
    setG({ ...o, ergebnis });
  };

  const pruefenPfad = async (pfad: string) => {
    if (!fs) return;
    setLaeuft('Ordner wird gelesen …');
    setFehler(null);
    try {
      await auswerten(await ladeProjektordner(pfad, fs));
    } catch (e) {
      setFehler(e instanceof Error ? e.message : String(e));
    } finally {
      setLaeuft(null);
    }
  };

  const waehlen = async () => {
    setFehler(null);
    if (desktop) {
      const p = await waehleOrdner('Projektordner wählen');
      if (p) await pruefenPfad(p);
      return;
    }
    const o = await waehleOrdnerImBrowser();
    if (o) await auswerten({ pfad: '', name: o.name, eintraege: o.eintraege, lies: o.lies });
  };

  const allePruefenJetzt = async () => {
    if (!fs) return;
    setFehler(null);
    setG(null);
    setLaeuft('Projekte werden geprüft …');
    try {
      const zeilen = await allePruefen(fs, roots, struktur, (i, n) => setLaeuft(`Projekte werden geprüft … ${i} / ${n}`));
      log.info('Alle Projekte geprüft', { projekte: zeilen.length, mitAbweichungen: zeilen.filter((z) => z.abweichungen).length });
      setAlle(zeilen);
    } catch (e) {
      setFehler(e instanceof Error ? e.message : String(e));
    } finally {
      setLaeuft(null);
    }
  };

  const fehlendeAnlegen = async () => {
    if (!g?.pfad || !fs) return;
    setLaeuft('Ordner werden angelegt …');
    let angelegt = 0;
    try {
      for (const p of g.ergebnis.fehlendeOrdner) {
        await fs.ordnerAnlegen(g.pfad, p);
        angelegt++;
      }
      log.info(`Fehlende Ordner angelegt: ${g.name}`, g.ergebnis.fehlendeOrdner);
      await pruefenPfad(g.pfad);
    } catch (e) {
      // Teilstand: neu prüfen, damit der Bericht zeigt, was schon angelegt ist – dann den Fehler nennen
      const text = `${angelegt} von ${g.ergebnis.fehlendeOrdner.length} Ordnern angelegt, dann Fehler: ${e instanceof Error ? e.message : String(e)}`;
      log.warn(`Fehlende Ordner nur teilweise angelegt: ${g.name}`, text);
      await pruefenPfad(g.pfad);
      setFehler(text);
    }
  };

  const csvSpeichern = (name: string, inhalt: string) =>
    void saveTextFile({ defaultName: `${sichererName(name)}.csv`, contents: inhalt, filterName: 'CSV (Excel)', extension: 'csv', mime: 'text/csv' }).catch((e) =>
      setFehler(e instanceof Error ? e.message : String(e)),
    );

  const zaehlung = g
    ? ZAEHLUNG.map(({ art, eins, mehr }) => [g.ergebnis.befunde.filter((b) => b.art === art).length, eins, mehr] as const)
        .filter(([n]) => n)
        .map(([n, eins, mehr]) => `${n} ${n === 1 ? eins : mehr}`)
        .join(' · ')
    : '';
  const zurueck = alle ? 'Zur Übersicht' : 'Zur Projektliste';
  const gefiltert = suche.trim() ? projekte.filter((p) => `${p.gruppe ?? ''} ${p.name}`.toLowerCase().includes(suche.trim().toLowerCase())) : projekte;

  return (
    <div className="po-view einspaltig">
      <section className="po-col">
        <h2>Projektordner prüfen</h2>
        <p className="muted small-text">
          Vergleicht vorhandene Projektordner mit der Struktur „{struktur.name}“: Projektdatei (.oap) mit den Stammdaten, fehlende und zusätzliche Ordner, Dateinamen in den
          Planordnern, lose Dateien und überlange Pfade. Das Tool meldet nur – es verschiebt, benennt und löscht nichts.
          {!desktop && ' Im Browser werden leere Ordner nicht erkannt.'}
        </p>
        <div className="button-row">
          <button className={projekte.length ? '' : 'primary'} disabled={!!laeuft} onClick={() => void waehlen()}>
            {projekte.length ? 'Anderen Ordner wählen …' : 'Projektordner wählen …'}
          </button>
          {projekte.length > 0 && (
            <button disabled={!!laeuft} onClick={() => void allePruefenJetzt()} title="Alle Projektordner der Stammordner prüfen – nur lesend – mit Übersicht und CSV">
              Alle Projekte prüfen
            </button>
          )}
          {g?.pfad && (
            <>
              <button disabled={!!laeuft} onClick={() => void pruefenPfad(g.pfad)}>
                Erneut prüfen
              </button>
              <button onClick={() => void oeffneOrdner(g.pfad).catch((e) => setFehler(String(e)))}>
                <Symbol name="ordnerOffen" /> Ordner öffnen
              </button>
            </>
          )}
          {laeuft && <span className="busy">{laeuft}</span>}
        </div>
        {fehler && <p className="meldung fehler" role="alert">{fehler}</p>}

        {projekte.length > 0 && !g && !alle && (
          <>
            <input className="po-suche" value={suche} placeholder="Projekt suchen …" aria-label="Projekt suchen" onChange={(e) => setSuche(e.target.value)} />
            <ul className="list po-projektliste">
              {gefiltert.slice(0, 300).map((p) => (
                <li key={p.pfad} title={p.pfad}>
                  <button className="po-projekt-knopf" disabled={!!laeuft} onClick={() => void pruefenPfad(p.pfad)}>
                    {p.gruppe && <span className="muted small-text">{p.gruppe} › </span>}
                    {p.name}
                  </button>
                </li>
              ))}
              {!gefiltert.length && <li className="muted">Kein Projekt passt zur Suche.</li>}
            </ul>
          </>
        )}

        {alle && !g && (
          <>
            <h3>
              Alle Projekte
              <span className="muted small-text">
                {' '}
                – {alle.length} geprüft, {alle.filter((z) => z.abweichungen || z.lesefehler).length} mit Abweichungen
              </span>
            </h3>
            <div className="po-plan">
              <table className="po-table po-sammel">
                <thead>
                  <tr>
                    <th>Projekt</th>
                    <th>Abweichungen</th>
                    <th>Projektdatei</th>
                    <th title="Zeichen ab dem Projektordner">Längster Pfad</th>
                  </tr>
                </thead>
                <tbody>
                  {[...alle]
                    .sort((a, b) => b.fehler - a.fehler || b.abweichungen - a.abweichungen || a.projekt.localeCompare(b.projekt, 'de', { numeric: true }))
                    .map((z) => (
                      <tr key={z.pfad}>
                        <td>
                          <button className="po-projekt-knopf" title={`${z.pfad} – Einzelbericht`} onClick={() => void pruefenPfad(z.pfad)}>
                            {z.projekt}
                          </button>
                        </td>
                        <td>{z.lesefehler ? <span className="po-warn">nicht lesbar</span> : `${z.abweichungen}${z.fehler ? ` (${z.fehler} Fehler)` : ''}`}</td>
                        <td>{z.projektdatei ? 'ja' : 'nein'}</td>
                        <td>{z.laengsterPfad || ''}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
            <div className="button-row">
              <button onClick={() => csvSpeichern(`Prüfung aller Projekte ${new Date().toISOString().slice(0, 10)}`, sammelCsv(alle))}>{CSV_KNOPF}</button>
              <button onClick={() => setAlle(null)}>
                <Symbol name="pfeilLinks" /> Zur Projektliste
              </button>
            </div>
          </>
        )}

        {g && (
          <>
            <div className="po-bericht-kopf">
              <h3>
                {g.name}
                <span className="muted small-text">
                  {' '}
                  – {g.ergebnis.ordner} Ordner, {g.ergebnis.dateien} Dateien · {zaehlung || 'keine Abweichungen'}
                </span>
              </h3>
              {(projekte.length > 0 || alle) && (
                <button className="small" onClick={() => setG(null)}>
                  <Symbol name="pfeilLinks" /> {zurueck}
                </button>
              )}
            </div>
            {g.pfad && <code className="po-pfad">{g.pfad}</code>}
            <ul className="po-befunde">
              {g.ergebnis.befunde.map((b, i) => (
                <li key={i} className={b.art}>
                  <span className="po-befund-art">{BEFUND_ART[b.art]}</span>
                  <div className="po-befund-inhalt">
                    <strong>{b.titel}</strong>
                    {b.text && <div className="small-text">{b.text}</div>}
                    {b.pfade && b.pfade.length > PFADE_OFFEN ? (
                      <details className="po-pfade-klapp">
                        <summary>
                          {b.pfade.length} {b.pfade.every((p) => !/\.[^/.]+$/.test(p)) ? 'Ordner' : 'Pfade'} anzeigen
                        </summary>
                        <Pfade pfade={b.pfade} />
                      </details>
                    ) : (
                      b.pfade && <Pfade pfade={b.pfade} />
                    )}
                    {b.aktion === 'ordnerAnlegen' && fs && g.pfad && g.ergebnis.fehlendeOrdner.length > 0 && (
                      <button className="small po-befund-aktion" disabled={!!laeuft} onClick={() => void fehlendeAnlegen()} title="Legt nur die fehlenden Ordner der Struktur an – sonst wird nichts verändert">
                        {g.ergebnis.fehlendeOrdner.length === 1 ? 'Fehlenden Ordner anlegen' : `${g.ergebnis.fehlendeOrdner.length} fehlende Ordner anlegen`}
                      </button>
                    )}
                    {b.aktion === 'mailsBenennen' && onMails && g.pfad && g.ergebnis.falscheMails.length > 0 && (
                      <button className="small po-befund-aktion" onClick={() => onMails(g.pfad)} title="Die Mails lesen und nach dem Schema benennen">
                        {g.ergebnis.falscheMails.length} {g.ergebnis.falscheMails.length === 1 ? 'Mail' : 'Mails'} benennen …
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
            <div className="button-row">
              <button onClick={() => csvSpeichern(`Prüfbericht ${g.name}`, berichtCsv(g.ergebnis))}>{CSV_KNOPF}</button>
              <button onClick={() => onErgaenzen(g)} title="Im Assistenten fehlende Ordner, Vorlagen und die Projektdatei ergänzen – vorhandene Dateien bleiben unverändert">
                Projekt ergänzen …
              </button>
            </div>
          </>
        )}
      </section>
    </div>
  );
}

/** Pfadliste eines Befunds – sehr lange Listen gekürzt (vollständig in der CSV) */
function Pfade({ pfade }: { pfade: string[] }) {
  return (
    <ul className="po-pfade">
      {pfade.slice(0, MAX_PFADE).map((p) => (
        <li key={p}>{p}</li>
      ))}
      {pfade.length > MAX_PFADE && <li className="muted">… und {pfade.length - MAX_PFADE} weitere (vollständig in der CSV)</li>}
    </ul>
  );
}
