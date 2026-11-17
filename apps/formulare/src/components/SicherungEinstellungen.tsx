import { useState } from 'react';
import { openFileWithPath, saveTextFile } from '@core/platform/files';
import { useAntrag } from '../antragStore';
import type { Sicherung } from '../sicherung';
import { SICHERUNG_BEREICHE, bereicheIn, sicherungDateiname, sicherungEinspielen, sicherungErstellen, sicherungLesen, sicherungText } from '../sicherung';
import { useFormulare } from '../store';
import { Symbol } from '@core/ui/Symbol';
import { einstellungenEntwurfMelden, useEinstellungen } from '@core/ui/Einstellungen';
import { PERMIO_ENTWURF, entwurfVerwerfen } from '../einstellungsEntwurf';
import { Karte } from './EinstellungsKarte';

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
  // Ergebnis an Ort und Stelle (die Meldungsleiste der App liegt hinter dem Dialog)
  const [ergebnis, setErgebnis] = useState<{ text: string; fehler?: boolean } | null>(null);
  // nur zum Neuzeichnen nach dem Export/Import (der Inhalt kommt aus dem lokalen Speicher)
  const [stand, setStand] = useState(0);
  const [geladen, setGeladen] = useState<{ name: string; sicherung: Sicherung } | null>(null);
  const [wahl, setWahl] = useState<Set<string>>(new Set());
  const [fehler, setFehler] = useState<string | null>(null);
  const aktuell = sicherungErstellen(appVersion());
  useEinstellungen((s) => s.stand);
  const offeneAenderungen = PERMIO_ENTWURF.geaendert();
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
      if (ok) setErgebnis({ text: 'Einstellungen exportiert.' });
    } catch (e) {
      setErgebnis({ text: `Einstellungen nicht exportiert: ${e instanceof Error ? e.message : String(e)}`, fehler: true });
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
    // der Entwurf der Seite beruht auf dem alten Stand
    entwurfVerwerfen();
    einstellungenEntwurfMelden();
    setGeladen(null);
    setStand((n) => n + 1);
    setErgebnis({ text: titel.length ? `Importiert: ${titel.join(', ')}.` : 'Nichts importiert.' });
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
      <Karte
        id="sicherung"
        titel="Einstellungen exportieren"
        text="Speichert die übernommenen Einstellungen von PERMIO in einer Datei – zum Sichern, für einen anderen Rechner oder für Kolleginnen und Kollegen. Entwürfe, Verlauf und Formularinhalte gehören nicht dazu."
      >
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
        <button type="button" onClick={() => void exportieren()}>
          <Symbol name="export" /> Exportieren …
        </button>
      </Karte>
      {ergebnis && (
        <p className={`meldung ${ergebnis.fehler ? 'fehler' : 'ok'} es-ergebnis`} role={ergebnis.fehler ? 'alert' : 'status'}>
          {ergebnis.text}
        </p>
      )}

      <Karte
        titel="Einstellungen importieren"
        text="Importiert Einstellungen aus einer exportierten Datei – sofort, unabhängig von „Übernehmen“. Die angehakten Bereiche werden ersetzt; bei der Gliederung und den Abweichungen je Projekt ersetzen nur die Formulare bzw. Projekte aus der Datei die gleichen hier, alle anderen bleiben."
      >
        {offeneAenderungen && (
          <p className="muted small-text" id="sg-gesperrt">
            Erst die Änderungen auf dieser Seite übernehmen oder verwerfen, dann importieren.
          </p>
        )}
        {!geladen && (
          // gesperrt mit aria-disabled: bleibt erreichbar und liest den Grund vor (docs/design.md, „Direkter Export“)
          <button type="button" aria-disabled={offeneAenderungen || undefined} aria-describedby={offeneAenderungen ? 'sg-gesperrt' : undefined} onClick={() => !offeneAenderungen && void waehlen()}>
            <Symbol name="ordner" /> Datei wählen …
          </button>
        )}
        {fehler && <p className="warning small-text">{fehler}</p>}
        {geladen && (
          <div className="sg-import" role="group" aria-label="Einstellungen aus der Datei">
            <p className="small-text">
              <strong>{geladen.name}</strong>
              <span className="muted">
                {[datumText(geladen.sicherung.erstellt) && ` · erstellt ${datumText(geladen.sicherung.erstellt)}`, geladen.sicherung.app && ` · PERMIO ${geladen.sicherung.app}`]
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
              <button type="button" disabled={!wahl.size || offeneAenderungen} onClick={() => void uebernehmen()}>
                <Symbol name="haken" /> Importieren
              </button>
              <button type="button" onClick={() => setGeladen(null)}>
                Abbrechen
              </button>
            </div>
          </div>
        )}
      </Karte>
    </>
  );
}
