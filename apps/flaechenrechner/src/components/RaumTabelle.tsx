import { fmt2 } from '@core/format';
import type { Nutzungsgruppe, Raumumschliessung, RoomShape, Shape, WoflKategorie } from '@core/model';
import { shapeArea } from '@core/model';
import { NUTZUNGSGRUPPEN, WOFL_KATEGORIEN } from '@core/norms';
import { Modal } from '@core/ui/Dialog';
import { NumberField, TextField } from '@core/ui/fields';
import { nachNummer, wohnungenImProjekt } from '../core/geschosse';
import { wohnungNormalisieren } from '../core/katalog';
import { abzugSetzen } from '../core/abzug';
import { mapShape, useEditor } from '../store/store';

/**
 * Tabellenansicht aller Räume des Projekts (F-21): je Geschoss nach Nummer sortiert, Spalten direkt bearbeitbar
 * (Nr., Bezeichnung, R/S, Nutzung, WoFlV-Anrechnung, Faktor, Wohnung, Abzug, Putzabzug). Jede Änderung ist ein
 * eigener Rückgängig-Schritt.
 */
export function RaumTabelle({ onClose }: { onClose: () => void }) {
  const project = useEditor((s) => s.project);
  const wohnungen = wohnungenImProjekt(project);
  const upd = (storeyId: string, id: string, fn: (r: RoomShape) => Shape) => useEditor.getState().update((p) => mapShape(p, storeyId, id, (s) => (s.kind === 'room' ? fn(s) : s)));
  return (
    <Modal titel="Raumtabelle" onClose={onClose} breit className="raumtabelle-dialog">
      <h3>Räume des Projekts</h3>
      <div className="raumtabelle-rahmen">
        <table className="raumtabelle">
          <thead>
            <tr>
              <th>Geschoss</th>
              <th>Nr.</th>
              <th>Bezeichnung</th>
              <th>R/S</th>
              <th>Nutzung</th>
              <th>WoFlV-Anrechnung</th>
              <th>Faktor</th>
              <th>Wohnung</th>
              <th>Abzug</th>
              <th>Putzabzug [%]</th>
              <th>Fläche [m²]</th>
            </tr>
          </thead>
          <tbody>
            {project.storeys.flatMap((st) =>
              nachNummer(st.shapes.filter((s): s is RoomShape => s.kind === 'room')).map((r) => (
                <tr key={r.id}>
                  <td>{st.name}</td>
                  <td>
                    <TextField label="Nr." value={r.nummer} onChange={(v) => upd(st.id, r.id, (x) => ({ ...x, nummer: v }))} />
                  </td>
                  <td>
                    <TextField label="Bezeichnung" value={r.name} onChange={(v) => upd(st.id, r.id, (x) => ({ ...x, name: v }))} />
                  </td>
                  <td>
                    <select
                      aria-label="R/S"
                      value={r.ausserhalbBgf && !r.subtract ? 'aussen' : r.umschliessung}
                      onChange={(e) =>
                        upd(st.id, r.id, (x) => {
                          const { ausserhalbBgf: _a, ...rest } = x;
                          void _a;
                          return e.target.value === 'aussen' ? { ...x, ausserhalbBgf: true } : { ...rest, umschliessung: e.target.value as Raumumschliessung, rsVonHand: true };
                        })
                      }
                    >
                      <option value="R">R</option>
                      <option value="S">S</option>
                      {!r.subtract && (
                        <option value="aussen" title="außerhalb der BGF (z. B. ebenerdige Terrasse) – nur Wohnfläche">
                          außerhalb BGF
                        </option>
                      )}
                    </select>
                  </td>
                  <td>
                    <select
                      aria-label="Nutzung"
                      value={r.nutzung}
                      onChange={(e) => upd(st.id, r.id, (x) => ({ ...x, nutzung: e.target.value as Nutzungsgruppe, nutzungsart: undefined, katalog: undefined }))}
                    >
                      {NUTZUNGSGRUPPEN.map((n) => (
                        <option key={n.id} value={n.id}>
                          {n.kurz}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <select
                      aria-label="WoFlV-Anrechnung"
                      value={r.wofl.kategorie}
                      onChange={(e) => upd(st.id, r.id, (x) => ({ ...x, katalog: undefined, wofl: { ...x.wofl, kategorie: e.target.value as WoflKategorie, faktor: undefined } }))}
                    >
                      {WOFL_KATEGORIEN.map((k) => (
                        <option key={k.id} value={k.id}>
                          {k.label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    {r.wofl.kategorie === 'freisitz' || r.wofl.kategorie === 'individuell' ? (
                      <NumberField
                        label="Faktor"
                        value={r.wofl.faktor}
                        allowEmpty
                        min={0}
                        max={r.wofl.kategorie === 'freisitz' ? 0.5 : 1}
                        onChange={(v) => upd(st.id, r.id, (x) => ({ ...x, wofl: { ...x.wofl, faktor: v } }))}
                      />
                    ) : null}
                  </td>
                  <td>
                    <TextField
                      label="Wohnung"
                      value={r.wofl.wohnung}
                      list="fr-tabelle-wohnungen"
                      onChange={(v) => upd(st.id, r.id, (x) => ({ ...x, wofl: { ...x.wofl, wohnung: wohnungNormalisieren(v, wohnungen) } }))}
                    />
                  </td>
                  <td className="mitte">
                    <input type="checkbox" aria-label="Abzugsfläche" checked={r.subtract} onChange={(e) => upd(st.id, r.id, (x) => abzugSetzen(x, e.target.checked))} />
                  </td>
                  <td>
                    <NumberField label="Putzabzug" value={r.putzabzug} allowEmpty min={0} max={20} digits={1} onChange={(v) => upd(st.id, r.id, (x) => ({ ...x, putzabzug: v || undefined }))} />
                  </td>
                  <td className="num">
                    {r.subtract ? '−' : ''}
                    {fmt2(shapeArea(r))}
                  </td>
                </tr>
              )),
            )}
          </tbody>
        </table>
        <datalist id="fr-tabelle-wohnungen">
          {wohnungen.map((w) => (
            <option key={w} value={w} />
          ))}
        </datalist>
      </div>
      <div className="dialog-buttons">
        <button className="primary" onClick={onClose}>
          Schließen
        </button>
      </div>
    </Modal>
  );
}
