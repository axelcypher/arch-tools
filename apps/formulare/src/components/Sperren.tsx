import { useCallback, useEffect, useState } from 'react';
import type { Sperre, SperrBewertung } from '../forma/sperre';
import type { SperrEintrag } from '../store';
import { useFormulare } from '../store';
import { Modal } from '@core/ui/Dialog';

const ZUSTAND: Record<SperrBewertung['art'], string> = { benutzt: 'In Gebrauch', verwaist: 'Verwaist', unklar: 'Nicht prüfbar' };

/** Wer, wo, seit wann – aus der Sperrdatei */
export function wer(s: Sperre): string {
  return [s.benutzer || 'unbekannt', s.computer && `auf ${s.computer}`].filter(Boolean).join(' ');
}

export function ZustandMarke({ art }: { art: SperrBewertung['art'] }) {
  return <span className={`fo-sperr-marke ${art}`}>{ZUSTAND[art]}</span>;
}

/**
 * Bestätigung vor dem Aufheben einer fremden Sperre. Ist das Formular dort doch noch geöffnet, könnten zwei
 * Leute gleichzeitig daran arbeiten – wer zuletzt speichert, überschreibt den anderen.
 */
export function SperreAufhebenDialog({
  name,
  sperre,
  bewertung,
  oeffnen,
  onAufheben,
  onClose,
}: {
  name: string;
  sperre: Sperre;
  bewertung: SperrBewertung;
  /** nach dem Aufheben zum Bearbeiten öffnen */
  oeffnen: boolean;
  onAufheben: () => void | Promise<void>;
  onClose: () => void;
}) {
  const [laeuft, setLaeuft] = useState(false);
  return (
    // während des Aufhebens nicht schließbar
    <Modal titel="Sperre aufheben?" kopf onClose={laeuft ? undefined : onClose} breit>
      <dl className="fo-sperr-daten">
        <dt>Formular</dt>
        <dd>{name}</dd>
        <dt>Geöffnet von</dt>
        <dd>{wer(sperre)}</dd>
        <dt>Seit</dt>
        <dd>{sperre.angemeldet || 'unbekannt'}</dd>
        <dt>Zustand</dt>
        <dd>
          <ZustandMarke art={bewertung.art} /> {bewertung.grund}
        </dd>
      </dl>
      <p className={bewertung.art === 'verwaist' ? 'muted small-text' : 'warning small-text'}>
        {bewertung.art === 'verwaist'
          ? 'Die Sperrdatei wird gelöscht. Danach lässt sich das Formular wieder bearbeiten – hier oder in einem anderen Programm.'
          : `Nur aufheben, wenn sicher ist, dass das Formular bei ${sperre.benutzer || 'der anderen Person'} nicht mehr geöffnet ist. Sonst arbeiten zwei Leute gleichzeitig daran, und wer zuletzt speichert, überschreibt den anderen.`}
      </p>
      <div className="dialog-buttons">
        <button disabled={laeuft} onClick={onClose}>
          Abbrechen
        </button>
        <button
          className={bewertung.art === 'verwaist' ? 'primary' : 'danger'}
          disabled={laeuft}
          onClick={async () => {
            setLaeuft(true);
            try {
              await onAufheben();
            } finally {
              onClose();
            }
          }}
        >
          {oeffnen ? 'Sperre aufheben und bearbeiten' : 'Sperre aufheben'}
        </button>
      </div>
    </Modal>
  );
}

/** Übersicht aller Sperrdateien des Projekts – auch solcher ohne Formular – mit Bewertung und Aufheben */
export function SperrenDialog({ onClose }: { onClose: () => void }) {
  const projekt = useFormulare((s) => s.projekt);
  const { sperrenAuflisten, sperrdateiAufheben } = useFormulare.getState();
  const [liste, setListe] = useState<SperrEintrag[] | null>(null);
  const [aufheben, setAufheben] = useState<SperrEintrag | null>(null);

  const laden = useCallback(() => {
    setListe(null);
    void sperrenAuflisten().then(setListe);
  }, [sperrenAuflisten]);
  useEffect(laden, [laden]);

  return (
    <>
      <Modal titel={`Sperren in ${projekt?.ordner ?? ''}`} kopf onClose={onClose} breit className="fo-sperren">
        <p className="muted small-text">
          Eine Sperrdatei (<code>.frmtmp</code>) zeigt, dass ein Formular geöffnet ist. Nach einem Absturz bleibt sie liegen und sperrt das Formular für alle – hier lässt sie sich
          aufheben.
        </p>
        {!liste && <p className="muted">Wird geprüft …</p>}
        {liste && !liste.length && <p>Keine Sperren – alle Formulare sind frei.</p>}
        {liste && liste.length > 0 && (
          <div className="fo-sperr-liste">
            {liste.map((e) => (
              <div key={e.pfad} className="fo-sperr-zeile">
                <div className="fo-sperr-text">
                  <strong>{e.name}</strong>
                  {e.waise && <span className="muted small-text"> (kein Formular dazu)</span>}
                  <span className="small-text">
                    {wer(e.sperre)}
                    {e.sperre.angemeldet && ` · seit ${e.sperre.angemeldet}`}
                  </span>
                  <span className="muted small-text">{e.bewertung.grund}</span>
                </div>
                <ZustandMarke art={e.bewertung.art} />
                <button disabled={!e.bewertung.aufhebbar} title={e.bewertung.aufhebbar ? 'Sperrdatei löschen' : 'Wird gerade benutzt – lässt sich nicht aufheben'} onClick={() => setAufheben(e)}>
                  Aufheben …
                </button>
              </div>
            ))}
          </div>
        )}
        <div className="dialog-buttons">
          <button onClick={laden}>Erneut prüfen</button>
          <button className="primary" onClick={onClose}>
            Fertig
          </button>
        </div>
      </Modal>
      {aufheben && (
        <SperreAufhebenDialog
          name={aufheben.name}
          sperre={aufheben.sperre}
          bewertung={aufheben.bewertung}
          oeffnen={false}
          onAufheben={async () => {
            await sperrdateiAufheben(aufheben.pfad, aufheben.daten);
            laden();
          }}
          onClose={() => setAufheben(null)}
        />
      )}
    </>
  );
}
