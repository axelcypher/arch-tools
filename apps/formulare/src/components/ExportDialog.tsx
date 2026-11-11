import { useEffect, useState } from 'react';
import { create } from 'zustand';
import { aktiveFassung, exportVorschlag, useAntrag } from '../antragStore';
import type { Eintrag } from '../dateisystem';
import { verbinde } from '../dateisystem';
import { ablageVon, entwurfVon, useFormulare } from '../store';
import { Symbol } from './Symbol';
import { useEscSchliessen } from '@core/ui/Dialog';

/** Offener Export-Dialog (auch aus Kontextmenüs, für nicht geöffnete Formulare) */
export const useExportDialog = create<{ pfad: string | null; oeffnen: (pfad: string) => void; schliessen: () => void }>((set) => ({
  pfad: null,
  oeffnen: (pfad) => set({ pfad }),
  schliessen: () => set({ pfad: null }),
}));

const sortiere = (a: Eintrag, b: Eintrag) => a.pfad.localeCompare(b.pfad, 'de', { numeric: true, sensitivity: 'base' });

/**
 * Formular als PDF exportieren: in den voreingestellten Ordner (die aktive Antragsfassung bzw. der Pfad aus den
 * Einstellungen) oder in einen anderen Ordner des Projekts – mit Dateinamen nach der Namensvorlage. „Speichern
 * unter …“ öffnet stattdessen den Speicherdialog von Windows.
 */
export function ExportDialog({ formularPfad, onClose }: { formularPfad: string; onClose: () => void }) {
  useEscSchliessen(onClose);
  const ds = useFormulare((s) => s.ds);
  const projekt = useFormulare((s) => s.projekt);
  const ablage = useFormulare((s) => ablageVon(s, s.projekt));
  const offen = useFormulare((s) => s.offen);
  const fassung = useAntrag((s) => aktiveFassung(s, projekt));
  // Vorschlag folgt den Einstellungen und dem Projektumfang, bis der Name von Hand geändert wird
  useAntrag((s) => s.dokumente);
  const { exportieren, speichernUnter } = useAntrag.getState();
  const vorschlag = exportVorschlag(formularPfad);
  const [modus, setModus] = useState<'vorgabe' | 'projekt'>('vorgabe');
  const [andererOrdner, setAnderer] = useState<string | null>(null);
  const [eigenerName, setName] = useState<string | null>(null);
  const anderer = andererOrdner ?? vorschlag.ordner;
  const name = eigenerName ?? vorschlag.name;
  const [vorhanden, setVorhanden] = useState(false);
  const [ersetzen, setErsetzen] = useState(false);
  const [ansehen, setAnsehen] = useState(false);
  const [laeuft, setLaeuft] = useState(false);
  const basis = ablage ? verbinde(ablage.root, ablage.pfad) : null;
  const ordner = modus === 'vorgabe' ? vorschlag.ordner : anderer;
  const datei = name.trim() ? (/\.pdf$/i.test(name.trim()) ? name.trim() : `${name.trim()}.pdf`) : '';
  const ungespeichert = offen?.pfad === formularPfad ? Object.keys(offen.aenderungen).length > 0 : !!(projekt && entwurfVon(projekt, formularPfad));

  // gibt es die Datei schon?
  useEffect(() => {
    if (!ds || !basis || !datei) return setVorhanden(false);
    let aktiv = true;
    ds.liste(ordner ? verbinde(basis, ordner) : basis, 1)
      .then((l) => aktiv && setVorhanden(l.some((e) => !e.ordner && e.pfad.toLowerCase() === datei.toLowerCase())))
      .catch(() => aktiv && setVorhanden(false));
    return () => {
      aktiv = false;
    };
  }, [ds, basis, ordner, datei]);

  const los = async () => {
    setLaeuft(true);
    const pfad = await exportieren(formularPfad, { ordner, name: datei }, ersetzen);
    setLaeuft(false);
    if (!pfad) return;
    onClose();
    if (ansehen && basis) void useFormulare.getState().dateiAnsehen(basis, `${ordner ? `${ordner}/` : ''}${datei}`);
  };

  return (
    <div className="modal-backdrop" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal modal-wide ex" role="dialog" aria-label="Als PDF exportieren">
        <h3>Als PDF exportieren</h3>
        {!basis ? (
          <p className="warning small-text">
            Zu diesem Projekt ist kein Projektordner eingestellt bzw. gefunden (Einstellungen › Ordner). Mit „Speichern unter …“ lässt sich die PDF trotzdem speichern.
          </p>
        ) : (
          <>
            <label className="ex-feld">
              <span className="field-label">Dateiname</span>
              <input value={name} onChange={(e) => setName(e.target.value)} aria-label="Dateiname" spellCheck={false} />
            </label>
            <div className="ex-ziele" role="radiogroup" aria-label="Ziel">
              <label className={`ex-ziel${modus === 'vorgabe' ? ' aktiv' : ''}`}>
                <input type="radio" name="ziel" checked={modus === 'vorgabe'} onChange={() => setModus('vorgabe')} />
                <span>
                  <strong>Voreingestellter Ordner</strong>
                  <span className="ex-pfad" title={verbinde(basis, vorschlag.ordner)}>
                    <Symbol name="ordner" /> {vorschlag.ordner || '(Projektordner)'}
                  </span>
                  <span className="muted small-text">Aktive Antragsfassung: {fassung} – umschalten oben links am Projekt.</span>
                </span>
              </label>
              <label className={`ex-ziel${modus === 'projekt' ? ' aktiv' : ''}`}>
                <input type="radio" name="ziel" checked={modus === 'projekt'} onChange={() => setModus('projekt')} />
                <span>
                  <strong>Anderer Ordner im Projekt</strong>
                  <span className="ex-pfad">
                    <Symbol name="ordner" /> {anderer || '(Projektordner)'}
                  </span>
                </span>
              </label>
            </div>
            {modus === 'projekt' && <OrdnerWahl basis={basis} gewaehlt={anderer} onWahl={setAnderer} />}
            {vorhanden && (
              <label className="ex-hinweis warning small-text">
                <input type="checkbox" checked={ersetzen} onChange={(e) => setErsetzen(e.target.checked)} /> „{datei}“ gibt es dort schon – ersetzen (die bisherige Datei wird gesichert)
              </label>
            )}
            {ungespeichert && <p className="muted small-text">Die PDF enthält auch die noch nicht gespeicherten Eingaben.</p>}
            <label className="ex-hinweis small-text">
              <input type="checkbox" checked={ansehen} onChange={(e) => setAnsehen(e.target.checked)} /> danach in der App ansehen
            </label>
          </>
        )}
        <div className="dialog-buttons">
          <button
            className="ex-links"
            title="Speicherdialog von Windows öffnen"
            onClick={() =>
              void speichernUnter(formularPfad).then((ok) => {
                if (ok) onClose();
              })
            }
          >
            Speichern unter …
          </button>
          <button onClick={onClose}>Abbrechen</button>
          {basis && (
            <button className="primary" disabled={!datei || laeuft || (vorhanden && !ersetzen)} onClick={() => void los()}>
              {laeuft ? 'Exportiere …' : 'Exportieren'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/** Ordner des Projekts als aufklappbarer Baum – ein Klick wählt */
function OrdnerWahl({ basis, gewaehlt, onWahl }: { basis: string; gewaehlt: string; onWahl: (o: string) => void }) {
  return (
    <div className="ex-baum" role="tree" aria-label="Ordner im Projekt">
      <button className={`ex-baum-zeile${gewaehlt === '' ? ' aktiv' : ''}`} onClick={() => onWahl('')}>
        <Symbol name="ordnerOffen" /> (Projektordner)
      </button>
      <OrdnerEbene basis={basis} rel="" gewaehlt={gewaehlt} onWahl={onWahl} tiefe={1} />
    </div>
  );
}

function OrdnerEbene({ basis, rel, gewaehlt, onWahl, tiefe }: { basis: string; rel: string; gewaehlt: string; onWahl: (o: string) => void; tiefe: number }) {
  const ds = useFormulare((s) => s.ds);
  const [ordner, setOrdner] = useState<string[] | null>(null);
  useEffect(() => {
    if (!ds) return;
    let aktiv = true;
    ds.liste(rel ? verbinde(basis, rel) : basis, 1)
      .then((l) => aktiv && setOrdner(l.filter((e) => e.ordner).sort(sortiere).map((e) => e.pfad)))
      .catch(() => aktiv && setOrdner([]));
    return () => {
      aktiv = false;
    };
  }, [ds, basis, rel]);
  if (!ordner) return <p className="muted small-text" style={{ paddingLeft: tiefe * 14 }}>…</p>;
  return (
    <>
      {ordner.map((o) => (
        <OrdnerZeile key={o} basis={basis} pfad={rel ? `${rel}/${o}` : o} name={o} gewaehlt={gewaehlt} onWahl={onWahl} tiefe={tiefe} />
      ))}
    </>
  );
}

function OrdnerZeile({ basis, pfad, name, gewaehlt, onWahl, tiefe }: { basis: string; pfad: string; name: string; gewaehlt: string; onWahl: (o: string) => void; tiefe: number }) {
  // Ordner auf dem Weg zum gewählten sind offen
  const [auf, setAuf] = useState(() => gewaehlt.toLowerCase().startsWith(`${pfad.toLowerCase()}/`));
  return (
    <>
      <div className="ex-baum-knoten" style={{ paddingLeft: tiefe * 14 }}>
        <button className="icon ex-baum-pfeil" aria-label={auf ? `${name} zuklappen` : `${name} aufklappen`} onClick={() => setAuf(!auf)}>
          <Symbol name={auf ? 'pfeilUnten' : 'pfeilRechts'} />
        </button>
        <button className={`ex-baum-zeile${gewaehlt === pfad ? ' aktiv' : ''}`} onClick={() => onWahl(pfad)} onDoubleClick={() => setAuf(!auf)}>
          <Symbol name={auf ? 'ordnerOffen' : 'ordner'} /> {name}
        </button>
      </div>
      {auf && <OrdnerEbene basis={basis} rel={pfad} gewaehlt={gewaehlt} onWahl={onWahl} tiefe={tiefe + 1} />}
    </>
  );
}
