import { useEffect, useMemo, useState } from 'react';
import { create } from 'zustand';
import { anzeigeName } from '../antrag';
import type { Vorlage } from '../antragStore';
import { useAntrag } from '../antragStore';
import { useFormulare } from '../store';
import { Symbol } from '@core/ui/Symbol';
import { Modal } from '@core/ui/Dialog';

/** Offener Dialog „Formular hinzufügen“ */
export const useHinzufuegenDialog = create<{ offen: boolean; setOffen: (o: boolean) => void }>((set) => ({ offen: false, setOffen: (offen) => set({ offen }) }));

const datum = (ms: number) => (ms ? new Date(ms).toLocaleDateString('de-DE') : '');

/**
 * Formular ins Projekt aufnehmen: Auswahl aus dem Vorlagenordner (Einstellungen › Antrag & Export) und den
 * Formularen der anderen FORMA-Projekte – je Formular der neueste Stand. Angelegt wird eine Kopie mit geleerten
 * Eingaben; danach füllt „Aus Projektkarte ausfüllen“ die Projektdaten ein.
 */
export function FormularHinzufuegenDialog({ onClose }: { onClose: () => void }) {
  const formulare = useFormulare((s) => s.formulare);
  const umfangDa = useAntrag((s) => !!s.projektdatei?.umfang);
  const vorlagenordner = useAntrag((s) => s.einstellungen.vorlagenordner);
  const { vorlagenAuflisten, formularHinzufuegen } = useAntrag.getState();
  const [vorlagen, setVorlagen] = useState<Vorlage[] | null>(null);
  const [suche, setSuche] = useState('');
  const [wahl, setWahl] = useState<Vorlage | null>(null);
  const [inUmfang, setInUmfang] = useState(true);
  const [laeuft, setLaeuft] = useState(false);

  useEffect(() => {
    let aktiv = true;
    void vorlagenAuflisten().then((v) => aktiv && setVorlagen(v));
    return () => {
      aktiv = false;
    };
  }, [vorlagenAuflisten]);

  const vorhanden = useMemo(() => new Set(formulare.map((f) => anzeigeName(f.name).toLowerCase())), [formulare]);
  const q = suche.trim().toLowerCase();
  const liste = (vorlagen ?? []).filter((v) => !q || `${v.name} ${v.datei} ${v.herkunft}`.toLowerCase().includes(q));

  const los = async (v: Vorlage | null = wahl) => {
    if (!v) return;
    setLaeuft(true);
    const ok = await formularHinzufuegen(v, umfangDa && inUmfang);
    setLaeuft(false);
    if (ok) onClose();
  };

  return (
    <Modal titel="Formular hinzufügen" kopf onClose={onClose} breit className="fh">
      <p className="muted small-text">
        Aus {vorlagenordner ? 'dem Vorlagenordner und ' : ''}den Formularen der anderen Projekte – je Formular der neueste Stand. Angelegt wird eine Kopie mit geleerten
        Eingaben.{!vorlagenordner && ' Leere Vorlagen lassen sich unter Einstellungen › Antrag & Export als Vorlagenordner angeben.'}
      </p>
      <input type="search" placeholder="Formular suchen …" value={suche} onChange={(e) => setSuche(e.target.value)} aria-label="Formular suchen" />
      <div className="fh-liste" role="listbox" aria-label="Verfügbare Formulare">
        {!vorlagen && <p className="muted small-text">Formulare werden gesucht …</p>}
        {vorlagen && !liste.length && <p className="muted small-text">Keine passenden Formulare gefunden.</p>}
        {liste.map((v) => (
          <button
            key={`${v.root}|${v.pfad}`}
            role="option"
            aria-selected={wahl === v}
            className={`fh-zeile${wahl === v ? ' aktiv' : ''}`}
            onClick={() => setWahl(v)}
            onDoubleClick={() => {
              setWahl(v);
              void los(v);
            }}
          >
            <Symbol name="formular" />
            <span className="fh-text">
              <strong>{v.name}</strong>
              <span className="muted small-text">
                {v.datei} · {v.herkunft}
                {v.geaendert ? ` · ${datum(v.geaendert)}` : ''}
              </span>
            </span>
            {vorhanden.has(v.name.toLowerCase()) && <span className="fh-da">schon im Projekt</span>}
          </button>
        ))}
      </div>
      {umfangDa && (
        <label className="ex-hinweis small-text">
          <input type="checkbox" checked={inUmfang} onChange={(e) => setInUmfang(e.target.checked)} /> in den Antragsumfang aufnehmen
        </label>
      )}
      <div className="dialog-buttons">
        <button onClick={onClose}>Abbrechen</button>
        <button className="primary" disabled={!wahl || laeuft} onClick={() => void los()}>
          {laeuft ? 'Lege an …' : 'Hinzufügen'}
        </button>
      </div>
    </Modal>
  );
}
