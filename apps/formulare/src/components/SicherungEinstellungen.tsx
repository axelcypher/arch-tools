import { useState } from 'react';
import { openFileWithPath, saveTextFile } from '@core/platform/files';
import { useAntrag } from '../antragStore';
import type { Sicherung } from '../sicherung';
import { SICHERUNG_BEREICHE, bereicheIn, sicherungDateiname, sicherungEinspielen, sicherungErstellen, sicherungLesen, sicherungText } from '../sicherung';
import { useFormulare } from '../store';
import { Symbol } from './Symbol';

const appVersion = () => (typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : undefined);

function datumText(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' });
}

/**
 * Einstellungen als Datei: exportieren (zum Sichern, für einen anderen Rechner oder als Vorlage für die Vorgaben
 * der App) und wieder einspielen – je Bereich wählbar.
 */
export function SicherungEinstellungen() {
  const { setMeldung } = useFormulare.getState();
  // nur zum Neuzeichnen nach dem Export/Import (der Inhalt kommt aus dem lokalen Speicher)
  const [stand, setStand] = useState(0);
  const [geladen, setGeladen] = useState<{ name: string; sicherung: Sicherung } | null>(null);
  const [wahl, setWahl] = useState<Set<string>>(new Set());
  const [fehler, setFehler] = useState<string | null>(null);
  const aktuell = sicherungErstellen(appVersion());
  void stand;

  const exportieren = async () => {
    try {
      const ok = await saveTextFile({
        defaultName: sicherungDateiname(),
        contents: sicherungText(sicherungErstellen(appVersion())),
        filterName: 'Einstellungen',
        extension: 'json',
        mime: 'application/json',
      });
      if (ok) setMeldung({ art: 'info', text: 'Einstellungen exportiert.' });
    } catch (e) {
      setMeldung({ art: 'fehler', text: `Einstellungen nicht exportiert: ${e instanceof Error ? e.message : String(e)}` });
    }
  };

  const waehlen = async () => {
    setFehler(null);
    try {
      const d = await openFileWithPath({ filterName: 'Einstellungen', extensions: ['json'] });
      if (!d) return;
      const sicherung = sicherungLesen(new TextDecoder().decode(d.bytes));
      if (!bereicheIn(sicherung).length) throw new Error('Die Datei enthält keine Einstellungen.');
      setGeladen({ name: d.name, sicherung });
      setWahl(new Set(bereicheIn(sicherung).filter((b) => !b.lokal).map((b) => b.schluessel)));
    } catch (e) {
      setGeladen(null);
      setFehler(e instanceof Error ? e.message : String(e));
    }
  };

  const uebernehmen = async () => {
    if (!geladen) return;
    const titel = sicherungEinspielen(geladen.sicherung, wahl);
    await useFormulare.getState().einstellungenNeuLesen();
    useAntrag.getState().einstellungenNeuLesen();
    setGeladen(null);
    setStand((n) => n + 1);
    setMeldung({ art: 'info', text: titel.length ? `Einstellungen übernommen: ${titel.join(', ')}.` : 'Nichts übernommen.' });
  };

  const umschalten = (schluessel: string, an: boolean) =>
    setWahl((w) => {
      const neu = new Set(w);
      if (an) neu.add(schluessel);
      else neu.delete(schluessel);
      return neu;
    });

  return (
    <>
      <h2>Sichern &amp; Übertragen</h2>
      <section className="es-karte">
        <div className="es-karte-kopf">
          <h3>Einstellungen exportieren</h3>
        </div>
        <p className="muted small-text">
          Speichert die Einstellungen dieser App in einer Einstellungsdatei – zum Sichern, für einen anderen Rechner oder für Kolleginnen und Kollegen. Entwürfe, Verlauf und
          Formularinhalte gehören nicht dazu.
        </p>
        <ul className="sg-liste" aria-label="Enthaltene Einstellungen">
          {SICHERUNG_BEREICHE.map((b) => {
            const da = b.schluessel in aktuell.daten;
            return (
              <li key={b.schluessel} className={da ? '' : 'muted'}>
                <Symbol name={da ? 'haken' : 'strich'} />
                <span>{b.titel}</span>
                <span className="muted small-text">{da ? b.umfang(aktuell.daten[b.schluessel]) : 'Vorgabe'}</span>
              </li>
            );
          })}
        </ul>
        <button onClick={() => void exportieren()}>
          <Symbol name="export" /> Exportieren …
        </button>
      </section>

      <section className="es-karte">
        <div className="es-karte-kopf">
          <h3>Einstellungen importieren</h3>
        </div>
        <p className="muted small-text">
          Übernimmt Einstellungen aus einer exportierten Datei. Die angehakten Bereiche werden ersetzt; bei der Gliederung und den Abweichungen je Projekt ersetzen nur
          die Formulare bzw. Projekte aus der Datei die gleichen hier, alle anderen bleiben.
        </p>
        {!geladen && (
          <button onClick={() => void waehlen()}>
            <Symbol name="ordner" /> Datei wählen …
          </button>
        )}
        {fehler && <p className="warning small-text">{fehler}</p>}
        {geladen && (
          <div className="sg-import" role="group" aria-label="Einstellungen aus der Datei">
            <p className="small-text">
              <strong>{geladen.name}</strong>
              <span className="muted">
                {[datumText(geladen.sicherung.erstellt) && ` · erstellt ${datumText(geladen.sicherung.erstellt)}`, geladen.sicherung.app && ` · Formulare ${geladen.sicherung.app}`]
                  .filter(Boolean)
                  .join('')}
              </span>
            </p>
            <ul className="sg-liste">
              {bereicheIn(geladen.sicherung).map((b) => (
                <li key={b.schluessel}>
                  <label>
                    <input type="checkbox" checked={wahl.has(b.schluessel)} onChange={(e) => umschalten(b.schluessel, e.target.checked)} />
                    <span>{b.titel}</span>
                  </label>
                  <span className="muted small-text">
                    {b.umfang(geladen.sicherung.daten[b.schluessel])}
                    {b.jeEintrag ? ' · ergänzt' : ' · ersetzt'}
                    {b.lokal ? ' · Pfade dieses Rechners' : ''}
                  </span>
                </li>
              ))}
            </ul>
            <div className="es-zeile">
              <button className="primary" disabled={!wahl.size} onClick={() => void uebernehmen()}>
                <Symbol name="haken" /> Übernehmen
              </button>
              <button onClick={() => setGeladen(null)}>Abbrechen</button>
            </div>
          </div>
        )}
      </section>
    </>
  );
}
