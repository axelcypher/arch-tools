import { useState } from 'react';
import { Modal } from '@core/ui/Dialog';
import type { LvKopf, OzMaske } from '../../lv/modell';
import { useAva } from '../../store';
import { DatumEingabe, Feld, TextEingabe, ZahlEingabe } from '../eingaben';

const VERGABEARTEN = ['Freihändige Vergabe', 'Verhandlungsvergabe', 'Beschränkte Ausschreibung', 'Öffentliche Ausschreibung', 'Private Ausschreibung'];

/** Eigenschaften des LV: Kopfangaben, Termine, OZ-Maske, Umsatzsteuer */
export function LvKopfDialog({ onClose }: { onClose: () => void }) {
  const offen = useAva((s) => s.lv)!;
  const [k, setK] = useState<LvKopf>(offen.lv.kopf);
  const [m, setM] = useState<OzMaske>(offen.lv.ozMaske);
  const [anteile, setAnteile] = useState(offen.lv.preisanteile.join(', '));
  const p = (patch: Partial<LvKopf>) => setK((x) => ({ ...x, ...patch }));
  const uebernehmen = () => {
    useAva.getState().lvAendern((l) => ({
      ...l,
      kopf: k,
      ozMaske: m,
      preisanteile: anteile
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    }));
    onClose();
  };
  return (
    <Modal titel="LV-Eigenschaften" onClose={onClose} breit>
      <h2>LV-Eigenschaften</h2>
      <div className="ava-formular">
        <Feld label="Bezeichnung" breit>
          <TextEingabe wert={k.bezeichnung} onChange={(bezeichnung) => p({ bezeichnung })} />
        </Feld>
        <Feld label="LV-Nummer">
          <TextEingabe wert={k.nummer} onChange={(nummer) => p({ nummer: nummer || undefined })} />
        </Feld>
        <Feld label="Datum des LV">
          <DatumEingabe wert={k.datum} onChange={(datum) => p({ datum })} />
        </Feld>
        <Feld label="Vergabeart">
          <TextEingabe wert={k.vergabeart} onChange={(vergabeart) => p({ vergabeart: vergabeart || undefined })} liste="ava-vergabearten" />
          <datalist id="ava-vergabearten">
            {VERGABEARTEN.map((v) => (
              <option key={v} value={v} />
            ))}
          </datalist>
        </Feld>
        <Feld label="Angebotsabgabe (Datum)">
          <DatumEingabe wert={k.eroeffnung?.slice(0, 10)} onChange={(d) => p({ eroeffnung: d ? `${d}${k.eroeffnung?.slice(10) ?? ''}` : undefined })} />
        </Feld>
        <Feld label="Uhrzeit">
          <input type="time" value={k.eroeffnung?.slice(11, 16) ?? ''} onChange={(e) => p({ eroeffnung: k.eroeffnung ? `${k.eroeffnung.slice(0, 10)}${e.target.value ? `T${e.target.value}` : ''}` : undefined })} disabled={!k.eroeffnung} />
        </Feld>
        <Feld label="Bindefrist bis">
          <DatumEingabe wert={k.bindefrist} onChange={(bindefrist) => p({ bindefrist })} />
        </Feld>
        <Feld label="Ausführung von">
          <DatumEingabe wert={k.ausfuehrungVon} onChange={(ausfuehrungVon) => p({ ausfuehrungVon })} />
        </Feld>
        <Feld label="Ausführung bis">
          <DatumEingabe wert={k.ausfuehrungBis} onChange={(ausfuehrungBis) => p({ ausfuehrungBis })} />
        </Feld>
        <Feld label="Projekt (Name)" breit>
          <TextEingabe wert={k.projektName} onChange={(projektName) => p({ projektName: projektName || undefined })} />
        </Feld>
        <Feld label="Projektbezeichnung" breit>
          <TextEingabe mehrzeilig wert={k.projekt} onChange={(projekt) => p({ projekt: projekt || undefined })} />
        </Feld>
        <Feld label="Auftraggeber">
          <TextEingabe mehrzeilig wert={k.auftraggeber} onChange={(auftraggeber) => p({ auftraggeber: auftraggeber || undefined })} />
        </Feld>
        <Feld label="Aufgestellt von">
          <TextEingabe mehrzeilig wert={k.ersteller} onChange={(ersteller) => p({ ersteller: ersteller || undefined })} />
        </Feld>
        <Feld label="Ort der Angebotsabgabe" breit>
          <TextEingabe mehrzeilig zeilen={2} wert={k.abgabeort} onChange={(abgabeort) => p({ abgabeort: abgabeort || undefined })} />
        </Feld>
        <Feld label="Umsatzsteuer %">
          <ZahlEingabe wert={k.mwst} leerErlaubt={false} onChange={(n) => p({ mwst: n ?? 19 })} />
        </Feld>
        <Feld label="Währung">
          <TextEingabe wert={k.waehrung} onChange={(waehrung) => p({ waehrung: waehrung || 'EUR' })} />
        </Feld>
        <Feld label="Preisanteile" hinweis="durch Komma getrennt" breit>
          <TextEingabe wert={anteile} onChange={setAnteile} />
        </Feld>
      </div>
      <h3>OZ-Maske</h3>
      <table className="ava-tabelle ava-oz-maske">
        <thead>
          <tr>
            <th>Ebene</th>
            <th>Name</th>
            <th className="num">Stellen</th>
            <th className="num">Schritt</th>
            <th>aktiv</th>
          </tr>
        </thead>
        <tbody>
          {m.ebenen.map((e, i) => (
            <tr key={i}>
              <td>{i + 1}</td>
              <td>
                <input value={e.name} onChange={(x) => setM({ ...m, ebenen: m.ebenen.map((y, j) => (j === i ? { ...y, name: x.target.value } : y)) })} />
              </td>
              <td className="num">
                <input type="number" min={1} max={6} value={e.stellen} onChange={(x) => setM({ ...m, ebenen: m.ebenen.map((y, j) => (j === i ? { ...y, stellen: Number(x.target.value) || 1 } : y)) })} />
              </td>
              <td className="num">
                <input type="number" min={1} max={100} value={e.schritt} onChange={(x) => setM({ ...m, ebenen: m.ebenen.map((y, j) => (j === i ? { ...y, schritt: Number(x.target.value) || 1 } : y)) })} />
              </td>
              <td>
                <input type="checkbox" checked={e.aktiv} onChange={(x) => setM({ ...m, ebenen: m.ebenen.map((y, j) => (j === i ? { ...y, aktiv: x.target.checked } : y)) })} />
              </td>
            </tr>
          ))}
          <tr>
            <td>Position</td>
            <td />
            <td className="num">
              <input type="number" min={1} max={6} value={m.position.stellen} onChange={(x) => setM({ ...m, position: { ...m.position, stellen: Number(x.target.value) || 4 } })} />
            </td>
            <td className="num">
              <input type="number" min={1} max={100} value={m.position.schritt} onChange={(x) => setM({ ...m, position: { ...m.position, schritt: Number(x.target.value) || 10 } })} />
            </td>
            <td>✓</td>
          </tr>
        </tbody>
      </table>
      <div className="dialog-buttons">
        <button onClick={onClose}>Abbrechen</button>
        <button className="primary" onClick={uebernehmen}>
          Übernehmen
        </button>
      </div>
    </Modal>
  );
}
