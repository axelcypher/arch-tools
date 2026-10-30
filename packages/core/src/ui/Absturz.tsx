import { Component, useState, useSyncExternalStore } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { logger, logText } from '../platform/log';
import { absturzMelden, startschutzAbonnieren, startschutzApp, zwischenstandAusgesetzt, zwischenstandAussetzen, zwischenstandFreigeben } from '../platform/startschutz';

const log = logger('ui');

/**
 * Fängt Darstellungsfehler ab, protokolliert sie und zeigt statt einer leeren Seite einen Hinweis.
 * Trat der Fehler kurz nach dem Laden des Zwischenstands auf, startet die App beim Neuladen ohne ihn
 * (siehe platform/startschutz.ts) – sonst führte „Neu laden“ immer wieder in denselben Fehler.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null; ausgesetzt: boolean }> {
  state = { error: null as Error | null, ausgesetzt: false };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    log.error(`Darstellungsfehler: ${error.message}`, `${error.stack ?? ''}\n${info.componentStack ?? ''}`);
    if (absturzMelden()) this.setState({ ausgesetzt: true });
  }

  render() {
    if (!this.state.error)
      return (
        <>
          {this.props.children}
          <ZwischenstandHinweis />
        </>
      );
    const mitZwischenstand = startschutzApp() !== null;
    return (
      <div className="crash">
        <h2>Da ist etwas schiefgelaufen.</h2>
        <p>
          {this.state.ausgesetzt
            ? 'Der Fehler trat kurz nach dem Laden des Zwischenstands auf. Nach dem Neuladen startet die App deshalb ohne ihn; er bleibt erhalten, bis du weiterarbeitest.'
            : mitZwischenstand
              ? 'Das Projekt ist automatisch zwischengespeichert. Nach dem Neuladen geht es an derselben Stelle weiter.'
              : 'Nach dem Neuladen geht es weiter.'}
        </p>
        <pre>{this.state.error.message}</pre>
        <div className="button-row">
          <button className="primary" onClick={() => location.reload()}>
            Neu laden
          </button>
          {mitZwischenstand && !this.state.ausgesetzt && (
            <button
              onClick={() => {
                zwischenstandAussetzen();
                location.reload();
              }}
            >
              Ohne Zwischenstand neu starten
            </button>
          )}
          <button onClick={() => void navigator.clipboard?.writeText(logText())}>Protokoll kopieren</button>
        </div>
      </div>
    );
  }
}

/** Hinweis, wenn der Zwischenstand beim Start ausgesetzt wurde */
function ZwischenstandHinweis() {
  const ausgesetzt = useSyncExternalStore(startschutzAbonnieren, zwischenstandAusgesetzt);
  const [weg, setWeg] = useState(false);
  if (!ausgesetzt || weg) return null;
  return (
    <div className="zwischenstand-hinweis" role="status">
      <span>Der letzte Zwischenstand wurde nicht geladen, weil die App danach abgestürzt oder hängen geblieben ist. Er bleibt erhalten, bis du weiterarbeitest.</span>
      <button
        onClick={() => {
          zwischenstandFreigeben();
          location.reload();
        }}
      >
        Trotzdem laden
      </button>
      <button onClick={() => setWeg(true)}>Ausblenden</button>
    </div>
  );
}
