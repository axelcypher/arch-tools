import { useState } from 'react';
import { bestaetigen } from '@core/ui/Rueckfrage';
import { TextField } from '@core/ui/fields';
import type { OrdnerRegel } from '../struktur';
import { ausruecken, baumZeilen, einruecken, hinzufuegen, loeschen, umbenennen, verschieben, zusatzSetzen } from '../baum';

const LPH = [1, 2, 3, 4, 5, 6, 7, 8, 9];

/**
 * Ordnerliste als Baum: je Ordner Name, Leistungsphasen 1–9 und „Dateischema prüfen“; Ordner anlegen, umbenennen,
 * löschen, verschieben (↑ ↓) und ein- bzw. ausrücken (→ ←). Bearbeitet dieselbe Liste wie die Textansicht.
 */
export function OrdnerBaum({ ordner, onChange }: { ordner: OrdnerRegel[]; onChange: (ordner: OrdnerRegel[]) => void }) {
  const zeilen = baumZeilen(ordner);
  const [neu, setNeu] = useState<string | null>(null);
  const aendern = (liste: OrdnerRegel[]) => {
    if (liste !== ordner) onChange(liste);
  };
  const anlegen = (eltern: string) => {
    const r = hinzufuegen(ordner, eltern);
    setNeu(r.pfad);
    aendern(r.ordner);
  };
  const entfernen = async (pfad: string, hatKinder: boolean) => {
    if (hatKinder && !(await bestaetigen(`„${pfad}“ löschen?`, 'Der Ordner wird samt seinen Unterordnern aus der Struktur genommen. Vorhandene Projektordner bleiben unverändert.', 'Löschen', true)))
      return;
    aendern(loeschen(ordner, pfad));
  };

  return (
    <div className="po-baum">
      <table className="po-table">
        <thead>
          <tr>
            <th>Ordner</th>
            <th title="Der Ordner entsteht nur, wenn eine dieser Leistungsphasen beauftragt ist – keine = immer">LPh</th>
            <th title="Dateien darin werden im Prüfmodus gegen das Dateinamenschema geprüft">Schema</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {zeilen.map((z) => {
            const lph = z.regel?.lph ?? [];
            return (
              <tr key={z.pfad} className={z.regel ? '' : 'po-baum-implizit'}>
                <td style={{ paddingLeft: 4 + z.tiefe * 18 }}>
                  <span className="po-art ordner" aria-hidden />
                  <TextField value={z.name} label={`Name von ${z.pfad}`} onChange={(v) => aendern(umbenennen(ordner, z.pfad, v))} />
                  {neu === z.pfad && <span className="muted small-text"> neu</span>}
                </td>
                <td className="po-baum-lph" role="group" aria-label={`Leistungsphasen ${z.pfad}`}>
                  {LPH.map((n) => (
                    <label key={n} title={`nur mit LPh ${n}`}>
                      <input
                        type="checkbox"
                        aria-label={`LPh ${n} ${z.pfad}`}
                        checked={lph.includes(n)}
                        onChange={() => aendern(zusatzSetzen(ordner, z.pfad, { lph: lph.includes(n) ? lph.filter((x) => x !== n) : [...lph, n] }))}
                      />
                      {n}
                    </label>
                  ))}
                </td>
                <td>
                  <input
                    type="checkbox"
                    aria-label={`Dateischema prüfen ${z.pfad}`}
                    checked={!!z.regel?.dateischema}
                    onChange={() => aendern(zusatzSetzen(ordner, z.pfad, { dateischema: !z.regel?.dateischema }))}
                  />
                </td>
                <td className="po-baum-knoepfe">
                  <button className="small" title="nach oben" aria-label={`${z.pfad} nach oben`} disabled={z.erster} onClick={() => aendern(verschieben(ordner, z.pfad, -1))}>
                    ↑
                  </button>
                  <button className="small" title="nach unten" aria-label={`${z.pfad} nach unten`} disabled={z.letzter} onClick={() => aendern(verschieben(ordner, z.pfad, 1))}>
                    ↓
                  </button>
                  <button className="small" title="ausrücken – eine Ebene höher" aria-label={`${z.pfad} ausrücken`} disabled={z.tiefe === 0} onClick={() => aendern(ausruecken(ordner, z.pfad))}>
                    ←
                  </button>
                  <button
                    className="small"
                    title="einrücken – Unterordner des Ordners darüber"
                    aria-label={`${z.pfad} einrücken`}
                    disabled={z.erster}
                    onClick={() => aendern(einruecken(ordner, z.pfad))}
                  >
                    →
                  </button>
                  <button className="small" title="Unterordner anlegen" aria-label={`Unterordner in ${z.pfad}`} onClick={() => anlegen(z.pfad)}>
                    +
                  </button>
                  <button className="small danger" title="löschen" aria-label={`${z.pfad} löschen`} onClick={() => void entfernen(z.pfad, z.hatKinder)}>
                    ×
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="button-row">
        <button className="small" onClick={() => anlegen('')}>
          + Ordner
        </button>
      </div>
    </div>
  );
}
