import { useMemo } from 'react';
import { rangfolge, summen } from '../../lv/rechnen';
import { datumDE, euro } from '../../abrechnung/pruefung';
import { useAva } from '../../store';
import { Druck } from '../Druck';
import { zahlDE } from '../eingaben';
import { Preisspiegel } from './Angebote';

/** Preisspiegel zum Drucken (A4 quer) mit Rangfolge und Vergabevorschlag */
export function PreisspiegelDruck({ onClose }: { onClose: () => void }) {
  const offen = useAva((s) => s.lv)!;
  const projekt = useAva((s) => s.projekt)!;
  const lv = offen.lv;
  const s = useMemo(() => summen(lv), [lv]);
  const rang = useMemo(() => rangfolge(lv, s), [lv, s]);
  return (
    <Druck titel="Preisspiegel" zusatz={`Preisspiegel ${lv.kopf.bezeichnung}`} onClose={onClose}>
      <div className="ava-lvd-kopf">
        <div>
          <div className="muted">
            {projekt.meta.projektcode} {projekt.meta.vorhaben || projekt.name}
          </div>
          <h1>Preisspiegel {lv.kopf.bezeichnung}</h1>
        </div>
        <div className="muted">Stand {datumDE(new Date().toISOString().slice(0, 10))}</div>
      </div>
      <Preisspiegel druck />
      <h3>Rangfolge</h3>
      <table className="ava-tabelle ava-rang-tabelle">
        <thead>
          <tr>
            <th>Rang</th>
            <th>Bieter</th>
            <th className="num">netto nach Nachlass</th>
            <th className="num">brutto</th>
            <th className="num">Abstand zum Ersten</th>
          </tr>
        </thead>
        <tbody>
          {rang.map((r) => (
            <tr key={r.id}>
              <td>{r.rang}.</td>
              <td>{lv.bieter.find((b) => b.id === r.id)?.name}</td>
              <td className="num">{euro(r.netto)}</td>
              <td className="num">{euro(s.bieter.get(r.id)?.brutto)}</td>
              <td className="num">{r.rang > 1 ? `+${zahlDE(r.abstand, 1)} %` : ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {s.bieter.get(0) && <p className="muted small-text">Kostenansatz: {euro(s.bieter.get(0)!.brutto)} brutto</p>}
    </Druck>
  );
}
