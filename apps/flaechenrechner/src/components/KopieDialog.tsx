import { useState } from 'react';
import { create } from 'zustand';
import { Modal } from '@core/ui/Dialog';
import type { KopieOptionen } from '../core/geschosse';
import { wohnungenImProjekt } from '../core/geschosse';
import { ablageStatus, duplicateStorey, flaechenEinfuegen, useEditor } from '../store/store';

/**
 * Rückfrage beim Einfügen in ein anderes Geschoss bzw. beim Duplizieren eines Geschosses (F-02): Raumnummern an das
 * Zielgeschoss anpassen? Wohnung beibehalten oder durch eine vorhandene ersetzen? Vorgabe: Nummern anpassen,
 * Wohnung beibehalten – nie stillschweigend „Wohnung = Geschoss“.
 */

interface Frage {
  titel: string;
  ziel: string;
  antwort: (o: KopieOptionen | null) => void;
}

const useFrage = create<{ frage: Frage | null; setze(f: Frage | null): void }>((set) => ({ frage: null, setze: (frage) => set({ frage }) }));

export function kopieOptionenFragen(titel: string, ziel: string): Promise<KopieOptionen | null> {
  return new Promise((antwort) =>
    useFrage.getState().setze({
      titel,
      ziel,
      antwort: (o) => {
        useFrage.getState().setze(null);
        antwort(o);
      },
    }),
  );
}

/** Strg+V: liefert false, wenn nichts einzufügen ist; in ein anderes Geschoss mit Räumen erst nach der Rückfrage */
export function einfuegenAktion(): boolean {
  const a = ablageStatus();
  if (a.leer) return false;
  if (!a.rueckfrage) {
    flaechenEinfuegen();
    return true;
  }
  const st = useEditor.getState();
  const ziel = st.project.storeys.find((s) => s.id === st.activeStoreyId)?.name ?? '';
  void kopieOptionenFragen('Räume in ein anderes Geschoss einfügen', ziel).then((o) => o && flaechenEinfuegen(o));
  return true;
}

/** Geschoss duplizieren – mit Rückfrage, sobald es Räume enthält */
export async function geschossDuplizierenAktion(storeyId: string): Promise<void> {
  const st = useEditor.getState();
  const src = st.project.storeys.find((s) => s.id === storeyId);
  if (!src) return;
  let o: KopieOptionen | null = { nummernAnpassen: false, wohnung: null };
  if (src.shapes.some((s) => s.kind === 'room')) {
    o = await kopieOptionenFragen(`Geschoss „${src.name}“ duplizieren`, 'die Kopie');
    if (!o) return;
  }
  const r = duplicateStorey(useEditor.getState().project, storeyId, o);
  useEditor.getState().update(() => r.project);
  useEditor.getState().setActiveStorey(r.id);
}

export function KopieDialogHost() {
  const frage = useFrage((s) => s.frage);
  return frage ? <KopieDialog key={frage.titel + frage.ziel} frage={frage} /> : null;
}

function KopieDialog({ frage }: { frage: Frage }) {
  const wohnungen = wohnungenImProjekt(useEditor.getState().project);
  const [nummern, setNummern] = useState(true);
  const [wohnung, setWohnung] = useState<string>('');
  const [neu, setNeu] = useState('');
  const abbrechen = () => frage.antwort(null);
  const ok = () => frage.antwort({ nummernAnpassen: nummern, wohnung: wohnung === '' ? null : wohnung === '*neu' ? neu.trim() || null : wohnung });
  return (
    <Modal titel={frage.titel} onClose={abbrechen}>
      {/* Formular: Enter übernimmt (wie in den übrigen Dialogen) */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          ok();
        }}
      >
        <h3>{frage.titel}</h3>
        <label className="toggle block">
          <input type="checkbox" checked={nummern} onChange={(e) => setNummern(e.target.checked)} />
          Raumnummern an {frage.ziel ? `„${frage.ziel}“` : 'das Zielgeschoss'} anpassen (Präfix des Geschosses, fortlaufend)
        </label>
        <label className="field">
          <span className="field-label">Wohnung der Räume mit Wohnflächenanrechnung</span>
          <select value={wohnung} onChange={(e) => setWohnung(e.target.value)}>
            <option value="">Wohnung beibehalten</option>
            {wohnungen.map((w) => (
              <option key={w} value={w}>
                {w}
              </option>
            ))}
            <option value="*neu">neue Wohnung …</option>
          </select>
        </label>
        {wohnung === '*neu' && (
          <label className="field">
            <span className="field-label">Name der neuen Wohnung</span>
            <input value={neu} placeholder="z. B. WE 02" onChange={(e) => setNeu(e.target.value)} autoFocus />
          </label>
        )}
        <div className="dialog-buttons">
          <button type="button" onClick={abbrechen}>
            Abbrechen
          </button>
          <button type="submit" className="primary">
            Übernehmen
          </button>
        </div>
      </form>
    </Modal>
  );
}
