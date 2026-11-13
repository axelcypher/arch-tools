import { useState } from 'react';
import { create } from 'zustand';
import { Modal } from '@core/ui/Dialog';
import type { KopieOptionen, Lage } from '../core/geschosse';
import { geschossNameVorschlag, wohnungenImProjekt } from '../core/geschosse';
import { ablageStatus, duplicateStorey, flaechenEinfuegen, useEditor } from '../store/store';

/**
 * Rückfrage beim Einfügen in ein anderes Geschoss bzw. beim Duplizieren eines Geschosses (F-02): Raumnummern an das
 * Zielgeschoss anpassen? Wohnung beibehalten oder durch eine vorhandene ersetzen? Vorgabe: Nummern anpassen,
 * Wohnung beibehalten – nie stillschweigend „Wohnung = Geschoss“. Beim Duplizieren zusätzlich Name und Lage
 * (über bzw. unter dem Original) des neuen Geschosses.
 */

/** Antwort der Rückfrage; Name und Lage nur beim Duplizieren eines Geschosses */
export type KopieAntwort = KopieOptionen & { name?: string; lage?: Lage };

interface Frage {
  titel: string;
  ziel: string;
  /** Duplizieren: Namensvorschlag je Lage und ob das Geschoss Räume hat (sonst entfallen Nummern und Wohnung) */
  geschoss?: { vorschlag: (lage: Lage) => string; raeume: boolean };
  antwort: (o: KopieAntwort | null) => void;
}

const useFrage = create<{ frage: Frage | null; setze(f: Frage | null): void }>((set) => ({ frage: null, setze: (frage) => set({ frage }) }));

export function kopieOptionenFragen(titel: string, ziel: string, geschoss?: Frage['geschoss']): Promise<KopieAntwort | null> {
  return new Promise((antwort) =>
    useFrage.getState().setze({
      titel,
      ziel,
      geschoss,
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

/** Geschoss duplizieren – mit Rückfrage nach Name und Lage, bei Räumen auch nach Nummern und Wohnung */
export async function geschossDuplizierenAktion(storeyId: string): Promise<void> {
  const st = useEditor.getState();
  const src = st.project.storeys.find((s) => s.id === storeyId);
  if (!src) return;
  const raeume = src.shapes.some((s) => s.kind === 'room');
  const o = await kopieOptionenFragen(`Geschoss „${src.name}“ duplizieren`, '', { vorschlag: (lage) => geschossNameVorschlag(st.project, src, lage), raeume });
  if (!o) return;
  const { name, lage, ...kopie } = o;
  const r = duplicateStorey(useEditor.getState().project, storeyId, raeume ? kopie : { nummernAnpassen: false, wohnung: null }, { name, lage });
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
  const g = frage.geschoss;
  const [lage, setLage] = useState<Lage>('darueber');
  const [name, setName] = useState(() => g?.vorschlag('darueber') ?? '');
  /** Name noch der Vorschlag? Dann folgt er der Lage */
  const [nameVonHand, setNameVonHand] = useState(false);
  const raeume = !g || g.raeume;
  const abbrechen = () => frage.antwort(null);
  const ok = () =>
    frage.antwort({
      nummernAnpassen: nummern,
      wohnung: wohnung === '' ? null : wohnung === '*neu' ? neu.trim() || null : wohnung,
      ...(g ? { name: name.trim() || g.vorschlag(lage), lage } : {}),
    });
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
        {g && (
          <>
            <label className="field">
              <span className="field-label">Name des neuen Geschosses</span>
              <input
                value={name}
                autoFocus
                onFocus={(e) => e.currentTarget.select()}
                onChange={(e) => {
                  setName(e.target.value);
                  setNameVonHand(true);
                }}
              />
            </label>
            <div className="field" role="radiogroup" aria-label="Lage des neuen Geschosses">
              <span className="field-label">Lage</span>
              {(['darueber', 'darunter'] as const).map((l) => (
                <label key={l} className="toggle block">
                  <input
                    type="radio"
                    name="kopie-lage"
                    checked={lage === l}
                    onChange={() => {
                      setLage(l);
                      if (!nameVonHand) setName(g.vorschlag(l));
                    }}
                  />
                  {l === 'darueber' ? 'über dem Original' : 'unter dem Original'}
                </label>
              ))}
            </div>
          </>
        )}
        {raeume && (
          <label className="toggle block">
            <input type="checkbox" checked={nummern} onChange={(e) => setNummern(e.target.checked)} />
            {g
              ? 'Raumnummern an das neue Geschoss anpassen (fortlaufend mit dessen Präfix)'
              : `Raumnummern an ${frage.ziel ? `„${frage.ziel}“` : 'das Zielgeschoss'} anpassen (Präfix des Geschosses, fortlaufend)`}
          </label>
        )}
        {raeume && (
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
        )}
        {raeume && wohnung === '*neu' && (
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
            {g ? 'Duplizieren' : 'Übernehmen'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
