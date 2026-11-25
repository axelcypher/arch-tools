import { useEffect, useState } from 'react';
import { Modal } from '@core/ui/Dialog';
import { Fehlertext, fehlerSatz } from './Fehlertext';

/** Ergebnis je Host (netz_pruefen in netz_verbindung.rs) */
export interface NetzPruefung {
  host: string;
  erreichbar: boolean;
  status?: number | null;
  /** Aussteller des obersten vorgelegten Zertifikats – bei einer Prüfstelle (Firewall, Virenschutz) meist ihr Name */
  aussteller?: string | null;
  proxy: { proxy?: string | null; quelle: string; hinweis?: string | null };
  fehler?: string | null;
  dauerMs: number;
}

/** Befund als Text (zum Kopieren für die IT bzw. den Support) */
export function befundText(ergebnis: NetzPruefung[], zeit = new Date()): string {
  const zeilen = ergebnis.map((p) => {
    const proxy = p.proxy.proxy ? `${p.proxy.proxy} (${p.proxy.quelle})` : `kein Proxy (${p.proxy.quelle})`;
    return [
      `${p.host}: ${p.erreichbar ? `erreichbar (HTTP ${p.status ?? '–'}, ${p.dauerMs} ms)` : 'nicht erreichbar'}`,
      `  Zertifikat ausgestellt von: ${p.aussteller ?? 'unbekannt'}`,
      `  Proxy: ${proxy}${p.proxy.hinweis ? ` – ${p.proxy.hinweis}` : ''}`,
      ...(p.fehler ? [`  Fehler: ${p.fehler.replace(/\n/g, ' | ')}`] : []),
    ].join('\n');
  });
  return [`LEXIO – Verbindung zu den Rechtsquellen, geprüft ${zeit.toLocaleString('de-DE')}`, ...zeilen].join('\n');
}

/**
 * „Verbindung prüfen“: je Rechtsquelle bzw. Geodienst erreichbar ja/nein, wer das Zertifikat ausgestellt hat (eine
 * Firewall oder ein Virenschutz mit HTTPS-Prüfung zeigt sich hier mit eigenem Namen) und welcher Proxy genutzt wird.
 * „Befund kopieren“ legt alles als Text in die Zwischenablage.
 */
export function VerbindungDialog({ onClose, pruefen }: { onClose: () => void; pruefen?: () => Promise<NetzPruefung[]> }) {
  const [ergebnis, setErgebnis] = useState<NetzPruefung[] | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [kopiert, setKopiert] = useState('');
  const [lauf, setLauf] = useState(0);
  useEffect(() => {
    let aktiv = true;
    setErgebnis(null);
    setFehler(null);
    setKopiert('');
    const p = pruefen ?? (async () => (await import('@tauri-apps/api/core')).invoke<NetzPruefung[]>('netz_pruefen'));
    p().then(
      (r) => aktiv && setErgebnis(r),
      (e) => aktiv && setFehler(e instanceof Error ? e.message : String(e)),
    );
    return () => {
      aktiv = false;
    };
  }, [lauf, pruefen]);
  const kopieren = async () => {
    if (!ergebnis) return;
    try {
      if (!navigator.clipboard) throw new Error('Zwischenablage nicht verfügbar');
      await navigator.clipboard.writeText(befundText(ergebnis));
      setKopiert('Befund in die Zwischenablage kopiert.');
    } catch (e) {
      setKopiert(`Kopieren fehlgeschlagen: ${e instanceof Error ? e.message : String(e)}`);
    }
  };
  const nichtErreichbar = ergebnis?.filter((p) => !p.erreichbar).length ?? 0;
  return (
    <Modal titel="Verbindung zu den Rechtsquellen prüfen" onClose={onClose} tabelle kopf beschreibung="br-verbindung-einleitung">
      <p id="br-verbindung-einleitung" className="br-leise">
        Prüft die Verbindung zu den Rechtsquellen und Geodiensten. Laden die Gesetzestexte nicht, bitte „Befund kopieren“ und an die IT bzw. den Support geben.
      </p>
      <div role="status" aria-live="polite" className="br-verbindung-stand">
        {!ergebnis && !fehler && <span className="br-laedt">Verbindungen werden geprüft …</span>}
        {ergebnis && (nichtErreichbar ? `${nichtErreichbar} von ${ergebnis.length} Quellen nicht erreichbar.` : `Alle ${ergebnis.length} Quellen erreichbar.`)}
        {kopiert && ` ${kopiert}`}
      </div>
      {fehler && <Fehlertext text={fehler} vorne="Prüfung nicht möglich: " />}
      {ergebnis && (
        <table className="report-table br-verbindung">
          <thead>
            <tr>
              <th>Quelle</th>
              <th>Ergebnis</th>
              <th>Zertifikat ausgestellt von</th>
              <th>Proxy</th>
            </tr>
          </thead>
          <tbody>
            {ergebnis.map((p) => (
              <tr key={p.host}>
                <td className="strong">{p.host}</td>
                <td>
                  {p.erreichbar ? <span className="marke ok">erreichbar</span> : <span className="marke fehler">nicht erreichbar</span>}
                  {p.fehler && <Fehlertext text={p.fehler} />}
                </td>
                <td>{p.aussteller ?? '–'}</td>
                <td>
                  {p.proxy.proxy ? `${p.proxy.proxy} (${p.proxy.quelle})` : `kein Proxy (${p.proxy.quelle})`}
                  {p.proxy.hinweis && <div className="br-warn-text">{fehlerSatz(p.proxy.hinweis)}</div>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <div className="dialog-buttons">
        <button type="button" onClick={() => setLauf((n) => n + 1)} disabled={!ergebnis && !fehler}>
          Erneut prüfen
        </button>
        <button type="button" onClick={() => void kopieren()} disabled={!ergebnis}>
          Befund kopieren
        </button>
        <button type="button" className="primary" onClick={onClose} data-startfokus="">
          Schließen
        </button>
      </div>
    </Modal>
  );
}
