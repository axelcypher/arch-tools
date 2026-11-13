import { useEffect, useState } from 'react';
import { RELEASE_SEITE, starteUpdatePruefung, useUpdate } from '../platform/update';
import { Modal } from './Dialog';
import { schliessenVorbereiten } from '../platform/rahmen';
import { schreibenAbwarten } from './vorbereiten';

const mb = (bytes: number) => (bytes / 1024 / 1024).toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/**
 * Knopf in der Titelleiste der Desktop-Apps: zeigt die installierte Version, sucht auf Klick nach Updates
 * und meldet ein gefundenes Update. Die Installation läuft über den Dialog.
 */
export function UpdateKnopf({ app, dirty, vorInstallation }: { app: string; dirty: boolean; vorInstallation?: () => Promise<boolean> }) {
  const status = useUpdate((s) => s.status);
  const version = useUpdate((s) => s.version);
  const [open, setOpen] = useState(false);

  useEffect(() => starteUpdatePruefung(), []);

  const verfuegbar = status === 'verfuegbar' || status === 'laedt' || status === 'installiert';
  return (
    <>
      <button
        className={`titlebar-btn${verfuegbar ? ' titlebar-update' : ''}`}
        title={verfuegbar ? `Version ${version} ist verfügbar – installiert ist ${__APP_VERSION__}` : `${app} ${__APP_VERSION__} – nach Updates suchen`}
        onClick={() => {
          setOpen(true);
          if (!verfuegbar) void useUpdate.getState().suchen();
        }}
      >
        {verfuegbar ? (
          <>
            <span aria-hidden>↑</span> Update {version}
          </>
        ) : (
          `v${__APP_VERSION__}`
        )}
      </button>
      {open && <UpdateDialog app={app} dirty={dirty} vorInstallation={vorInstallation} onClose={() => setOpen(false)} />}
    </>
  );
}

/** `vorInstallation`: Rückfragen vor dem Neustart (z. B. je Tab mit ungespeicherten Änderungen); false = abbrechen */
function UpdateDialog({ app, dirty, vorInstallation, onClose }: { app: string; dirty: boolean; vorInstallation?: () => Promise<boolean>; onClose: () => void }) {
  const { status, version, notizen, geladen, gesamt, fehler, suchen, installieren } = useUpdate();
  const laeuft = status === 'laedt' || status === 'installiert';
  const [bereitet, setBereitet] = useState(false);

  // während Laden und Installieren nicht schließbar (kein Esc, kein Klick daneben)
  return (
    <Modal titel={`${app} aktualisieren`} kopf onClose={laeuft ? undefined : onClose}>
      {status === 'sucht' && <p>Suche nach Updates …</p>}
      {status === 'aktuell' && (
        <p>
          Version <strong>{__APP_VERSION__}</strong> ist aktuell.
        </p>
      )}
      {status === 'aus' && (
        <p>
          Installiert ist Version <strong>{__APP_VERSION__}</strong>.
        </p>
      )}
      {status === 'verfuegbar' && (
        <>
          <p>
            Version <strong>{version}</strong> ist verfügbar (installiert: {__APP_VERSION__}).
          </p>
          {notizen && <pre className="update-notizen">{notizen}</pre>}
          {dirty && (
            <p className="warning">
              {vorInstallation
                ? 'Es gibt ungespeicherte Änderungen. Vor dem Update wird für jede App einzeln gefragt, ob gespeichert werden soll – die Anwendung wird dafür beendet und neu gestartet.'
                : 'Es gibt ungespeicherte Änderungen. Bitte vorher speichern – die Anwendung wird für das Update beendet und neu gestartet.'}
            </p>
          )}
        </>
      )}
      {status === 'laedt' && (
        <>
          <p>
            Version {version} wird geladen … {mb(geladen)}
            {gesamt ? ` von ${mb(gesamt)}` : ''} MB
          </p>
          <progress className="update-fortschritt" max={gesamt || undefined} value={gesamt ? Math.min(geladen, gesamt) : undefined} />
        </>
      )}
      {status === 'installiert' && <p>Version {version} ist installiert – die Anwendung wird neu gestartet …</p>}
      {status === 'fehler' && (
        <p className="warning update-fehler">
          Der Update-Server ist nicht erreichbar oder das Update ließ sich nicht laden: {fehler}
          <br />
          In Firmennetzen verhindern das oft Proxy oder Firewall. Die Installer stehen auch auf der Release-Seite bereit:
          <br />
          <code>{RELEASE_SEITE}</code>
        </p>
      )}
      <div className="dialog-buttons">
        {!laeuft && <button onClick={onClose}>{status === 'verfuegbar' ? 'Später' : 'Schließen'}</button>}
        {(status === 'fehler' || status === 'aus') && <button onClick={() => void suchen()}>{status === 'fehler' ? 'Erneut suchen' : 'Nach Updates suchen'}</button>}
        {status === 'verfuegbar' && (
          <button
            className="primary"
            disabled={bereitet}
            onClick={() =>
              void (async () => {
                // Rückfragen und Warten auf ausstehendes Schreiben; solange gesperrt (kein zweites Installieren)
                setBereitet(true);
                try {
                  if ((!vorInstallation || (await vorInstallation())) && (await schreibenAbwarten(app, () => schliessenVorbereiten(), 'neu starten'))) await installieren();
                } finally {
                  setBereitet(false);
                }
              })()
            }
          >
            Jetzt installieren
          </button>
        )}
      </div>
    </Modal>
  );
}
