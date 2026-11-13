import { useEffect, useState } from 'react';
import { Modal } from '@core/ui/Dialog';
import { oeffneOrdner, verbinde } from '../dateisystem';
import { planFehler } from '../kataster/kataster';
import { useKataster } from '../kataster/katasterStore';
import { Symbol } from './Symbol';

/** Meldung über Fehlendes – mit dem Ort, an dem es sich beheben lässt */
interface Fehlt {
  text: string;
  ziel?: 'einstellungen' | 'stammdaten';
}

/**
 * Katasterpläne eines Projekts exportieren (Startseite, Rechtsklick auf ein Projekt): Pläne wählen, QGIS-Vorlage des
 * Projekts (aus der Projektdatei) prüfen oder aktualisieren, exportieren – mit Ergebnis je Plan. `onEinstellungen` bzw.
 * `onStammdaten` führen von einer Meldung über Fehlendes dorthin, wo es sich beheben lässt.
 */
export function KatasterDialog({ basis, name, onClose, onEinstellungen, onStammdaten }: { basis: string; name: string; onClose: () => void; onEinstellungen?: () => void; onStammdaten?: () => void }) {
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
  const wechseln = (ziel: () => void) => {
    onClose();
    ziel();
  };

  const auswahl = gewaehlt ?? e.plaene.filter((p) => p.aktiv).map((p) => p.id);
  const umschalten = (id: string) => setGewaehlt(auswahl.includes(id) ? auswahl.filter((x) => x !== id) : [...auswahl, id]);
  const geladen = projekt?.basis === basis;
  const oapDa = !!oap;
  const koordinaten = oap?.projekt.meta.koordinaten;
  const pv = oapDa ? projektVorlage() : null;
  const info = pv ? projektVorlageInfo() : (globalInfo?.info ?? null);
  const ordner = zielOrdner();
  const fehlt: Fehlt[] = [
    geladen && !oapDa && { text: 'Keine Projektdatei (.oap) im Projektordner.' },
    oapDa && !koordinaten && { text: 'Keine Koordinaten – bitte die Projektadresse in den Stammdaten speichern (die Koordinaten werden dabei abgefragt).', ziel: 'stammdaten' as const },
    !pv && !e.vorlage && { text: 'Keine QGIS-Vorlage – bitte in den Einstellungen unter „Katasterpläne“ wählen.', ziel: 'einstellungen' as const },
    !programm && { text: 'Pfad zu qgis_process fehlt – bitte in den Einstellungen unter „Katasterpläne“ wählen.', ziel: 'einstellungen' as const },
    geladen &&
      oapDa &&
      ordner === null && {
        text: 'Kein aktiver Antrag in der Projektdatei – bitte in den Einstellungen unter „Katasterpläne“ einen festen Ordner für die Ablage wählen.',
        ziel: 'einstellungen' as const,
      },
  ].filter((x): x is Fehlt => !!x);
  const ersterPlan = e.plaene[0]?.id;

  return (
    <Modal titel={`Katasterpläne exportieren – ${name}`} kopf onClose={laeuft ? undefined : onClose} breit className="ka-dialog" klickDaneben={!laeuft}>

      {koordinaten && (
        <p className="muted small-text">
          Mittelpunkt (die geokodierte Projektadresse, nicht das Flurstück): E {koordinaten.ost.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} · N{' '}
          {koordinaten.nord.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (EPSG:25832) · Ablage: {ordner === null ? '–' : ordner || 'Projektordner'}
        </p>
      )}
      {fehlt.map((f) => (
        <p key={f.text} className="warning small-text ka-fehlt">
          {f.text}
          {/* Leerzeichen statt Außenabstand: bricht der Knopf um, steht er bündig am Zeilenanfang */}
          {f.ziel === 'einstellungen' && onEinstellungen && (
            <>
              {' '}
              <button className="po-link" onClick={() => wechseln(onEinstellungen)}>
                Einstellungen öffnen
              </button>
            </>
          )}
          {f.ziel === 'stammdaten' && onStammdaten && (
            <>
              {' '}
              <button className="po-link" onClick={() => wechseln(onStammdaten)}>
                Stammdaten öffnen
              </button>
            </>
          )}
        </p>
      ))}

      <ul className="ka-wahl">
        {e.plaene.map((p) => {
          const f = planFehler(p, info);
          const a = ausgang?.plaene.find((x) => x.id === p.id);
          return (
            <li key={p.id}>
              <label>
                {/* erster Fokus auf dem ersten Plan – nicht auf „Vorlage übernehmen“, das die Vorlage der Projektdatei ersetzt */}
                <input type="checkbox" checked={auswahl.includes(p.id)} disabled={laeuft} autoFocus={p.id === ersterPlan} onChange={() => umschalten(p.id)} />
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
      {ausgang?.meldung && <pre className="ka-meldung warning small-text">{ausgang.meldung}</pre>}

      <div className="dialog-buttons">
        {onEinstellungen && (
          <button className="ex-links" disabled={laeuft} onClick={() => wechseln(onEinstellungen)}>
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
