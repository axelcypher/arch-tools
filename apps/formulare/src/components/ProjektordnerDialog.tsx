import { useState } from 'react';
import { sichererDateiname } from '@core/projektdatei';
import { verbinde, waehleOrdner } from '../dateisystem';
import { useFormulare } from '../store';
import { Symbol } from '@core/ui/Symbol';
import { Modal } from '@core/ui/Dialog';

/**
 * Projektordner zuordnen, wenn zum Kürzel keiner gefunden wurde: einen vorhandenen Ordner wählen oder einen neuen im
 * Stammordner anlegen. Danach sucht die App die Projektdatei; fehlt sie, folgt der Stammdaten-Dialog.
 */
export function ProjektordnerDialog({ grund }: { grund: string }) {
  const projekt = useFormulare((s) => s.projekt)!;
  const stammordner = useFormulare((s) => s.ablageordner);
  const { projektordnerWaehlen, projektordnerAnlegen, ordnerDialogSchliessen, einstellungenOeffnen } = useFormulare.getState();
  const [ziel, setZiel] = useState(stammordner[0] ?? '');
  const [name, setName] = useState(sichererDateiname(`${projekt.ordner} ${projekt.titel}`));
  const [fehler, setFehler] = useState<string | null>(null);
  const [laeuft, setLaeuft] = useState(false);

  const ausfuehren = async (f: () => Promise<void>) => {
    setFehler(null);
    setLaeuft(true);
    try {
      await f();
    } catch (e) {
      setFehler(e instanceof Error ? e.message : String(e));
    } finally {
      setLaeuft(false);
    }
  };
  const waehlen = () =>
    ausfuehren(async () => {
      const p = await waehleOrdner(`Projektordner für ${projekt.ordner} wählen`);
      if (p) await projektordnerWaehlen(p);
    });

  return (
    // Esc schließt (nicht während einer laufenden Aktion), ein Klick daneben nicht – wie bisher
    <Modal titel={`Projektordner für ${projekt.ordner}`} kopf onClose={laeuft ? undefined : ordnerDialogSchliessen} breit klickDaneben={false} className="po-dialog">
      <p className="muted small-text">{grund}</p>

      <section className="po-teil">
        <h4>Vorhandenen Ordner wählen</h4>
        <p className="muted small-text">Der Projektordner heißt anders als das Kürzel oder liegt woanders – die Zuordnung gilt danach für alle im Büro.</p>
        <button disabled={laeuft} onClick={() => void waehlen()}>
          <Symbol name="ordner" /> Ordner wählen …
        </button>
      </section>

      <section className="po-teil">
        <h4>Neu anlegen</h4>
        {stammordner.length ? (
          <>
            <div className="po-zeile">
              {stammordner.length > 1 && (
                <select value={ziel} onChange={(e) => setZiel(e.target.value)} aria-label="Stammordner">
                  {stammordner.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              )}
              <input value={name} onChange={(e) => setName(e.target.value)} aria-label="Name des Projektordners" />
            </div>
            <p className="muted small-text">
              wird angelegt als <code>{verbinde(ziel, sichererDateiname(name) || '…')}</code>
            </p>
            <button className="primary" disabled={laeuft || !sichererDateiname(name)} onClick={() => void ausfuehren(() => projektordnerAnlegen(ziel, name))}>
              <Symbol name="plus" /> Ordner anlegen
            </button>
          </>
        ) : (
          <p className="muted small-text">
            Es ist noch kein Stammordner für Projektordner eingestellt.{' '}
            <button
              className="es-verweis"
              onClick={() => {
                ordnerDialogSchliessen();
                einstellungenOeffnen('ordner');
              }}
            >
              Einstellungen › Ordner
            </button>
          </p>
        )}
      </section>

      {fehler && <p className="warning">{fehler}</p>}
      <div className="dialog-buttons">
        <button disabled={laeuft} onClick={ordnerDialogSchliessen}>
          Abbrechen
        </button>
      </div>
    </Modal>
  );
}
