import type { KeyboardEvent } from 'react';
import { useRef } from 'react';
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

/** Spalten, in denen Enter bzw. ↓ in dieselbe Spalte der nächsten Zeile springt (zügiges Durchnummerieren) */
const SPRUNG_SPALTEN = new Set(['nummer', 'name', 'wohnung']);

/**
 * Enter/↓ bzw. Umschalt+Enter/↑ in einer Sprungspalte: Fokus in dieselbe Spalte der nächsten bzw. vorigen Raumzeile
 * (das Feld übernimmt seinen Wert beim Verlassen). In der Spalte Wohnung bleiben ↑/↓ der Vorschlagsliste.
 */
function zeilenSprung(e: KeyboardEvent<HTMLTableSectionElement>) {
  const feld = e.target as HTMLElement;
  const spalte = feld.closest('td')?.dataset.spalte;
  if (!spalte || !SPRUNG_SPALTEN.has(spalte) || e.altKey || e.ctrlKey || e.metaKey) return;
  const pfeil = spalte !== 'wohnung' && (e.key === 'ArrowDown' || e.key === 'ArrowUp');
  if (e.key !== 'Enter' && !pfeil) return;
  const zurueck = e.key === 'ArrowUp' || (e.key === 'Enter' && e.shiftKey);
  const felder = [...e.currentTarget.querySelectorAll<HTMLInputElement>(`td[data-spalte="${spalte}"] input`)];
  const ziel = felder[felder.indexOf(feld as HTMLInputElement) + (zurueck ? -1 : 1)];
  if (!ziel) return;
  e.preventDefault();
  ziel.focus();
  ziel.select();
}

/**
 * Raumtabelle aller Räume des Projekts (F-21): Geschosse wie in der Seitenleiste von oben nach unten, je Geschoss nach
 * Nummer sortiert (Stand beim Öffnen), mit Zwischensumme und Gesamtsumme. Spalten direkt bearbeitbar (Nr., Bezeichnung, R/S, Nutzung,
 * WoFlV-Anrechnung, Faktor, Wohnung, Abzug, Putzabzug). Jede Änderung ist ein eigener Rückgängig-Schritt.
 */
export function RaumTabelle({ onClose }: { onClose: () => void }) {
  const project = useEditor((s) => s.project);
  const wohnungen = wohnungenImProjekt(project);
  const flaeche = (r: RoomShape) => shapeArea(r) * (r.subtract ? -1 : 1);
  // Reihenfolge beim Öffnen festhalten: beim Durchnummerieren springen Zeilen sonst unter dem Cursor weg (neue Räume hinten)
  const reihenfolge = useRef<Map<string, number> | null>(null);
  if (!reihenfolge.current) reihenfolge.current = new Map(project.storeys.flatMap((st) => nachNummer(st.shapes.filter((s) => s.kind === 'room')).map((r, i) => [r.id, i] as const)));
  const rang = (id: string) => reihenfolge.current!.get(id) ?? Number.MAX_SAFE_INTEGER;
  const geschosse = [...project.storeys]
    .reverse()
    .map((st) => ({ st, raeume: nachNummer(st.shapes.filter((s): s is RoomShape => s.kind === 'room')).sort((a, b) => rang(a.id) - rang(b.id)) }))
    .filter((g) => g.raeume.length > 0);
  const gesamt = geschosse.reduce((a, g) => a + g.raeume.reduce((b, r) => b + flaeche(r), 0), 0);
  const upd = (storeyId: string, id: string, fn: (r: RoomShape) => Shape) => useEditor.getState().update((p) => mapShape(p, storeyId, id, (s) => (s.kind === 'room' ? fn(s) : s)));
  return (
    <Modal titel="Raumtabelle" kopf tabelle onClose={onClose} className="raumtabelle-dialog">
      <p className="muted small-text">Enter bzw. ↓ in Nr., Bezeichnung und Wohnung: weiter zur nächsten Zeile; Umschalt+Enter bzw. ↑: zurück.</p>
      <div className="raumtabelle-rahmen">
        <table className="raumtabelle">
          <thead>
            <tr>
              <th>Nr.</th>
              <th>Bezeichnung</th>
              <th>R/S</th>
              <th>Nutzung</th>
              <th>WoFlV-Anrechnung</th>
              <th>Faktor</th>
              <th>Wohnung</th>
              <th>Abzug</th>
              <th>Putzabzug [%]</th>
              <th className="num">Fläche [m²]</th>
            </tr>
          </thead>
          {geschosse.map(({ st, raeume }) => (
            <tbody key={st.id} onKeyDown={zeilenSprung}>
              <tr className="raumtabelle-geschoss">
                <th colSpan={9} scope="rowgroup">
                  {st.name}
                </th>
                <td className="num">{fmt2(raeume.reduce((a, r) => a + flaeche(r), 0))}</td>
              </tr>
              {raeume.map((r) => (
                <tr key={r.id}>
                  <td data-spalte="nummer">
                    <TextField label="Nr." value={r.nummer} onChange={(v) => upd(st.id, r.id, (x) => ({ ...x, nummer: v }))} />
                  </td>
                  <td data-spalte="name">
                    <TextField label="Bezeichnung" value={r.name} onChange={(v) => upd(st.id, r.id, (x) => ({ ...x, name: v }))} />
                  </td>
                  <td>
                    <select
                      aria-label="Raumumschließung"
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
                  <td className="raumtabelle-nutzung">
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
                  <td data-spalte="wohnung">
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
              ))}
            </tbody>
          ))}
          <tfoot>
            <tr>
              <th colSpan={9} scope="row">
                Summe aller Räume
              </th>
              <td className="num">{fmt2(gesamt)}</td>
            </tr>
          </tfoot>
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
