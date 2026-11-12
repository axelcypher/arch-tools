import { useEffect, useState } from 'react';
import { Modal } from '@core/ui/Dialog';
import { oeffneOrdner, verbinde } from '../dateisystem';
import { planFehler } from '../kataster/kataster';
import { useKataster } from '../kataster/katasterStore';
import { Symbol } from './Symbol';

/**
 * Katasterpläne eines Projekts exportieren (Startseite, Rechtsklick auf ein Projekt): Pläne wählen, QGIS-Vorlage des
 * Projekts (aus der Projektdatei) prüfen oder aktualisieren, exportieren – mit Ergebnis je Plan.
 */
export function KatasterDialog({ basis, name, onClose, onEinstellungen }: { basis: string; name: string; onClose: () => void; onEinstellungen?: () => void }) {
  const e = useKataster((s) => s.einstellungen);
  const programm = useKataster((s) => s.programm);
  const laeuft = useKataster((s) => s.laeuft);
  const ausgang = useKataster((s) => s.ausgang);
  const globalInfo = useKataster((s) => s.vorlageInfo);
  const projekt = useKataster((s) => s.projekt);
  const oap = projekt?.basis === basis ? projekt.oap : null;
  const { exportieren, projektVorlage, projektVorlageInfo, projektVorlageAktualisieren, zielOrdner } = useKataster.getState();
  const [gewaehlt, setGewaehlt] = useState<string[] | null>(null);
  const [aktualisiert, setAktualisiert] = useState(false);
  useEffect(() => {
    void useKataster.getState().laden();
    void useKataster.getState().projektWaehlen(basis, name);
    return () => void useKataster.getState().projektWaehlen(null);
  }, [basis, name]);

  const auswahl = gewaehlt ?? e.plaene.filter((p) => p.aktiv).map((p) => p.id);
  const umschalten = (id: string) => setGewaehlt(auswahl.includes(id) ? auswahl.filter((x) => x !== id) : [...auswahl, id]);
  const geladen = projekt?.basis === basis;
  const oapDa = !!oap;
  const koordinaten = oap?.projekt.meta.koordinaten;
  const pv = oapDa ? projektVorlage() : null;
  const info = pv ? projektVorlageInfo() : (globalInfo?.info ?? null);
  const ordner = zielOrdner();
  const fehlt = [
    geladen && !oapDa && 'Keine Projektdatei (.oap) im Projektordner.',
    oapDa && !koordinaten && 'Keine Koordinaten – bitte die Projektadresse in den Stammdaten speichern (die Koordinaten werden dabei abgefragt).',
    !pv && !e.vorlage && 'Keine QGIS-Vorlage – bitte unter „Katasterpläne“ wählen.',
    !programm && 'Pfad zu qgis_process fehlt („Katasterpläne“).',
    geladen && oapDa && ordner === null && 'Kein aktiver Antrag in der Projektdatei – bitte unter „Katasterpläne“ einen festen Ordner für die Ablage wählen.',
  ].filter((x): x is string => !!x);

  return (
    <Modal titel="Katasterpläne" onClose={laeuft ? undefined : onClose} breit className="ka-dialog" klickDaneben={!laeuft}>
      <h3>Katasterpläne exportieren – {name}</h3>

      <div className="ka-status">
        <div>
          <span className="field-label">QGIS-Vorlage des Projekts</span>
          {pv ? (
            <span>
              <strong>{pv.name}</strong> <span className="muted small-text">übernommen am {pv.datum}</span>
            </span>
          ) : (
            <span className="muted">{e.vorlage ? `Noch keine – beim Export wird ${e.vorlage.split(/[\\/]/).pop()} übernommen.` : 'Noch keine.'}</span>
          )}
        </div>
        {oapDa && e.vorlage && (
          <button
            className="small"
            disabled={laeuft}
            title={`Die Vorlage der Projektdatei durch die aktuelle Fassung von ${e.vorlage} ersetzen`}
            onClick={() => void projektVorlageAktualisieren().then((ok) => ok && setAktualisiert(true))}
          >
            {pv ? 'Vorlage aktualisieren' : 'Vorlage übernehmen'}
          </button>
        )}
        {aktualisiert && <span className="ka-ok small-text">✓ übernommen</span>}
      </div>
      {koordinaten && (
        <p className="muted small-text">
          Mittelpunkt: E {koordinaten.ost.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} · N{' '}
          {koordinaten.nord.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (EPSG:25832) · Ablage: {ordner === null ? '–' : ordner || 'Projektordner'}
        </p>
      )}
      {fehlt.map((f) => (
        <p key={f} className="warning small-text">
          {f}
        </p>
      ))}

      <ul className="ka-wahl">
        {e.plaene.map((p) => {
          const f = planFehler(p, info);
          const a = ausgang?.plaene.find((x) => x.id === p.id);
          return (
            <li key={p.id}>
              <label>
                <input type="checkbox" checked={auswahl.includes(p.id)} disabled={laeuft} onChange={() => umschalten(p.id)} />
                <span className={`ka-art ${p.art}`}>{p.art.toUpperCase()}</span>
                <span className="ka-name">
                  {p.name}
                  <span className="muted small-text">
                    {p.art === 'pdf' ? p.layout || '–' : p.thema || 'sichtbare Layer'} · 1:{p.massstab.toLocaleString('de-DE')}
                    {p.breite && p.hoehe ? ` · ${p.breite} × ${p.hoehe} m` : ''}
                  </span>
                </span>
              </label>
              {f.length > 0 && <span className="warning small-text">{f.join(' ')}</span>}
              {a && (
                <span className={`ka-ergebnis ${a.ok ? 'ok' : 'fehler'} small-text`}>
                  {a.ok ? (
                    <button
                      className="link"
                      title="Ordner im Explorer zeigen"
                      onClick={() => a.datei && void oeffneOrdner(verbinde(basis, a.datei.split('/').slice(0, -1).join('/') || '.')).catch(() => undefined)}
                    >
                      ✓ {a.datei}
                    </button>
                  ) : (
                    `✗ ${a.fehler}`
                  )}
                </span>
              )}
            </li>
          );
        })}
      </ul>
      {!e.plaene.length && <p className="muted small-text">Keine Pläne eingerichtet („Katasterpläne“).</p>}
      {ausgang?.meldung && <pre className="ka-meldung warning small-text">{ausgang.meldung}</pre>}

      <div className="dialog-buttons">
        {onEinstellungen && (
          <button
            className="ex-links"
            disabled={laeuft}
            onClick={() => {
              onClose();
              onEinstellungen();
            }}
          >
            <Symbol name="zahnrad" /> Einstellungen
          </button>
        )}
        <button onClick={onClose} disabled={laeuft}>
          {ausgang ? 'Schließen' : 'Abbrechen'}
        </button>
        <button className="primary" disabled={laeuft || !auswahl.length || fehlt.length > 0} onClick={() => void exportieren(auswahl)}>
          {laeuft ? 'QGIS exportiert …' : `${auswahl.length} ${auswahl.length === 1 ? 'Plan' : 'Pläne'} exportieren`}
        </button>
      </div>
    </Modal>
  );
}
