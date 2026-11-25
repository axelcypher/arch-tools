import { useEffect, useState } from 'react';
import { Modal } from '@core/ui/Dialog';
import { Fehlertext } from './Fehlertext';

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

/** Proxy in Worten: „http://p:3128 (Windows)“, „kein Proxy“, „kein Proxy – Ausnahme in Windows“ */
export function proxyText(p: NetzPruefung['proxy']): string {
  if (p.proxy) return `${p.proxy} (${p.quelle})`;
  return p.quelle.startsWith('Ausnahme') ? `kein Proxy – ${p.quelle}` : 'kein Proxy';
}

/** Befund als Text (zum Kopieren für die IT bzw. den Support) */
export function befundText(ergebnis: NetzPruefung[], zeit = new Date()): string {
  const zeilen = ergebnis.map((p) => {
    const proxy = proxyText(p.proxy);
    return [
      `${p.host}: ${p.erreichbar ? `erreichbar (HTTP ${p.status ?? '–'}, ${p.dauerMs} ms)` : 'nicht erreichbar'}`,
      `  Zertifikat ausgestellt von: ${p.aussteller ?? 'unbekannt'}`,
      `  Proxy: ${proxy}${p.proxy.hinweis ? ` – ${p.proxy.hinweis}` : ''}`,
      ...(p.fehler ? [`  Fehler: ${p.fehler.replace(/\n/g, ' | ')}`] : []),
    ].join('\n');
  });
  return [`LEXIO – Verbindung zu Rechtsquellen und Geodiensten, geprüft ${zeit.toLocaleString('de-DE')}`, ...zeilen].join('\n');
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
  const [kopierFehler, setKopierFehler] = useState('');
  const [lauf, setLauf] = useState(0);
  useEffect(() => {
    let aktiv = true;
    setErgebnis(null);
    setFehler(null);
    setKopiert('');
    setKopierFehler('');
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
      setKopierFehler('');
      setKopiert('Befund in die Zwischenablage kopiert.');
    } catch (e) {
      setKopiert('');
      setKopierFehler(`Kopieren fehlgeschlagen: ${e instanceof Error ? e.message : String(e)}`);
    }
  };
  const nichtErreichbar = ergebnis?.filter((p) => !p.erreichbar).length ?? 0;
  const laeuft = !ergebnis && !fehler;
  return (
    <Modal titel="Verbindung zu Rechtsquellen und Geodiensten prüfen" onClose={onClose} tabelle kopf beschreibung="br-verbindung-einleitung">
      <p id="br-verbindung-einleitung" className="br-leise">
        Prüft die Verbindung zu den Rechtsquellen und Geodiensten. Laden die Gesetzestexte nicht, bitte „Befund kopieren“ und an die IT bzw. den Support geben.
      </p>
      {/* Stand, Ergebnis und Prüffehler in einer stehenden Region (angesagt); ein Kopierfehler als Alarm */}
      <div role="status" aria-live="polite" className="br-verbindung-stand">
        {laeuft && <span className="br-laedt">Verbindungen werden geprüft …</span>}
        {ergebnis && (nichtErreichbar ? `${nichtErreichbar} von ${ergebnis.length} Quellen nicht erreichbar.` : `Alle ${ergebnis.length} Quellen erreichbar.`)}
        {fehler && <Fehlertext text={fehler} vorne="Prüfung nicht möglich:" />}
        {kopiert && ` ${kopiert}`}
      </div>
      {kopierFehler && (
        <p className="meldung fehler" role="alert">
          {kopierFehler}
        </p>
      )}
      {ergebnis && (
        <table className="summary-table text oben br-verbindung">
          <thead>
            <tr>
              <th scope="col">Quelle</th>
              <th scope="col">Ergebnis</th>
              <th scope="col">Zertifikat ausgestellt von</th>
              <th scope="col">Proxy</th>
            </tr>
          </thead>
          <tbody>
            {ergebnis.map((p) => (
              <tr key={p.host}>
                <th scope="row">{p.host}</th>
                <td>
                  {p.erreichbar ? <span className="marke ok">erreichbar</span> : <span className="marke fehler">nicht erreichbar</span>}
                  {/* der Proxy steht in seiner Spalte – im Fehlersatz nicht noch einmal */}
                  {p.fehler && <Fehlertext text={p.fehler} ohneProxy zu={p.host} />}
                </td>
                <td>{p.aussteller ?? '–'}</td>
                <td>
                  {proxyText(p.proxy)}
                  {p.proxy.hinweis && <div className="br-warn-text">{p.proxy.hinweis}</div>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <div className="dialog-buttons">
        {/* während der Prüfung gesperrt, behält aber den Fokus (aria-disabled statt disabled) */}
        <button type="button" aria-disabled={laeuft || undefined} onClick={() => !laeuft && setLauf((n) => n + 1)}>
          Erneut prüfen
        </button>
        <button type="button" onClick={() => void kopieren()} aria-disabled={!ergebnis || undefined}>
          Befund kopieren
        </button>
        <span className="tb-spacer" />
        <button type="button" className="primary" onClick={onClose} data-startfokus="">
          Schließen
        </button>
      </div>
    </Modal>
  );
}
