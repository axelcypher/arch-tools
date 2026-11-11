import { useAntrag } from '../antragStore';
import { MERKMAL_ERKLAERUNG, VORGABE_MERKMALE } from '../bedingung';
import { merkmalFestlegen, useMerkmalWerte } from '../merkmalWerte';
import type { OffenesFormular } from '../store';
import { useGesetz } from './GesetzModal';

/**
 * Auswahl fehlender Projektmerkmale direkt am Formular (U-02): je Merkmal Segmentknöpfe mit Kurzerklärung und
 * Fundstelle. Die Wahl wirkt sofort (Füllstand, entfällt/offen); mit Projekt landet sie in der Projektdatei (gilt für
 * alle Formulare), ohne Projekt gilt sie für diese Datei.
 */
export function MerkmalWahl({ offen, namen }: { offen: Pick<OffenesFormular, 'projekt' | 'pfad'>; namen: string[] }) {
  const definitionen = useAntrag((s) => s.merkmalDefinitionen);
  const werte = useMerkmalWerte(offen);
  const offene = namen.filter((n) => !werte[n]);
  if (!offene.length) return null;
  return (
    <div className="fo-merkmal-wahl">
      {offene.map((name) => {
        const e = MERKMAL_ERKLAERUNG[name];
        const moeglich = (definitionen.find((m) => m.name === name) ?? VORGABE_MERKMALE.find((m) => m.name === name))?.werte ?? [];
        return (
          <div key={name} className="fo-merkmal-zeile" role="group" aria-label={`${name} festlegen`}>
            <span className="fo-merkmal-name">
              {e?.text ?? name}
              {e?.quelle && (
                <button type="button" className="fo-klein fo-merkmal-quelle" title="Gesetzestext öffnen" onClick={() => useGesetz.getState().oeffnen([e.quelle!])}>
                  §
                </button>
              )}
            </span>
            <span className="tb-group fo-merkmal-werte">
              {moeglich.map((w) => (
                <button key={w} type="button" className="small" title={e?.werte?.[w] ? `${w}: ${e.werte[w]}` : w} onClick={() => void merkmalFestlegen(offen, name, w)}>
                  {w}
                </button>
              ))}
            </span>
          </div>
        );
      })}
    </div>
  );
}
