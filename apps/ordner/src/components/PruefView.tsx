import { useEffect, useState } from 'react';
import type { ProjektordnerEintrag } from '@core/platform/projektordner';
import { projekteAuflisten } from '@core/platform/projektordner';
import { saveTextFile } from '@core/platform/files';
import { logger } from '@core/platform/log';
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

const GRUPPEN: { art: BefundArt; titel: string }[] = [
  { art: 'fehler', titel: 'Fehler' },
  { art: 'warnung', titel: 'Abweichungen' },
  { art: 'hinweis', titel: 'Hinweise' },
  { art: 'ok', titel: 'In Ordnung' },
];
const MAX_PFADE = 40;

interface Geprueft extends GeladenerOrdner {
  ergebnis: Pruefergebnis;
}

/**
 * Prüfmodus: Projektordner einlesen und Abweichungen von der Struktur melden – einzeln (aus der Projektliste der
 * Stammordner oder per „Ordner wählen …“) oder alle auf einmal mit Übersicht und CSV. Nur lesend; einzig „fehlende
 * Ordner anlegen“ legt auf Wunsch Ordner an. `fs` ersetzt das Dateisystem des Desktops (Tests).
 */
export function PruefView({ onErgaenzen, fs: fsVorgabe, start }: { onErgaenzen: (o: GeladenerOrdner) => void; fs?: Dateisystem; start?: string | null }) {
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
    void projekteAuflisten(fs, roots).then((r) => aktuell && setProjekte(r.projekte));
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
    try {
      for (const p of g.ergebnis.fehlendeOrdner) await fs.ordnerAnlegen(g.pfad, p);
      log.info(`Fehlende Ordner angelegt: ${g.name}`, g.ergebnis.fehlendeOrdner);
      await pruefenPfad(g.pfad);
    } catch (e) {
      setFehler(e instanceof Error ? e.message : String(e));
      setLaeuft(null);
    }
  };

  const csvSpeichern = (name: string, inhalt: string) =>
    void saveTextFile({ defaultName: `${sichererName(name)}.csv`, contents: inhalt, filterName: 'CSV (Excel)', extension: 'csv', mime: 'text/csv' }).catch((e) =>
      setFehler(e instanceof Error ? e.message : String(e)),
    );

  const offen = g?.ergebnis.befunde.filter((b) => b.art !== 'ok').length ?? 0;
  const gefiltert = suche.trim() ? projekte.filter((p) => p.name.toLowerCase().includes(suche.trim().toLowerCase())) : projekte;

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
              <button onClick={() => void oeffneOrdner(g.pfad).catch((e) => setFehler(String(e)))}>Ordner öffnen</button>
            </>
          )}
          {laeuft && <span className="busy">{laeuft}</span>}
        </div>
        {fehler && <p className="warning">{fehler}</p>}

        {projekte.length > 0 && !g && !alle && (
          <>
            <input className="po-suche" value={suche} placeholder="Projekt suchen …" aria-label="Projekt suchen" onChange={(e) => setSuche(e.target.value)} />
            <ul className="list po-projektliste">
              {gefiltert.slice(0, 300).map((p) => (
                <li key={p.pfad} title={p.pfad}>
                  <button className="po-projekt-knopf" disabled={!!laeuft} onClick={() => void pruefenPfad(p.pfad)}>
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
              <button onClick={() => csvSpeichern(`Prüfung aller Projekte ${new Date().toISOString().slice(0, 10)}`, sammelCsv(alle))}>Als CSV speichern …</button>
              <button onClick={() => setAlle(null)}>Zur Projektliste</button>
            </div>
          </>
        )}

        {g && (
          <>
            <h3>
              {g.name}
              <span className="muted small-text">
                {' '}
                – {g.ergebnis.ordner} Ordner, {g.ergebnis.dateien} Dateien · {offen ? `${offen} ${offen === 1 ? 'Abweichung' : 'Abweichungen'}` : 'keine Abweichungen'}
              </span>
            </h3>
            {g.pfad && <code className="po-pfad">{g.pfad}</code>}
            {GRUPPEN.map(({ art, titel }) => {
              const befunde = g.ergebnis.befunde.filter((b) => b.art === art);
              if (!befunde.length) return null;
              return (
                <div key={art} className="po-befundgruppe">
                  <h4>
                    {titel} ({befunde.length})
                  </h4>
                  <ul className="po-befunde">
                    {befunde.map((b, i) => (
                      <li key={i} className={b.art}>
                        <span className="po-befund-art">{BEFUND_ART[b.art]}</span>
                        <div>
                          <strong>{b.titel}</strong>
                          {b.text && <div className="small-text">{b.text}</div>}
                          {b.pfade && (
                            <ul className="po-pfade">
                              {b.pfade.slice(0, MAX_PFADE).map((p) => (
                                <li key={p}>{p}</li>
                              ))}
                              {b.pfade.length > MAX_PFADE && <li className="muted">… und {b.pfade.length - MAX_PFADE} weitere (vollständig im Bericht)</li>}
                            </ul>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
            <div className="button-row">
              {fs && g.pfad && g.ergebnis.fehlendeOrdner.length > 0 && (
                <button disabled={!!laeuft} onClick={() => void fehlendeAnlegen()} title="Legt nur die fehlenden Ordner der Struktur an – sonst wird nichts verändert">
                  {g.ergebnis.fehlendeOrdner.length} fehlende Ordner anlegen
                </button>
              )}
              <button onClick={() => onErgaenzen(g)} title="Im Assistenten fehlende Ordner, Vorlagen und die Projektdatei ergänzen – vorhandene Dateien bleiben unverändert">
                Projekt ergänzen …
              </button>
              <button onClick={() => csvSpeichern(`Prüfbericht ${g.name}`, berichtCsv(g.ergebnis))}>Bericht als CSV …</button>
              {(projekte.length > 0 || alle) && <button onClick={() => setG(null)}>{alle ? 'Zur Übersicht' : 'Zur Projektliste'}</button>}
            </div>
          </>
        )}
      </section>
    </div>
  );
}
