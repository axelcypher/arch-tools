import { useMemo, useState } from 'react';
import { alsText } from '../../format/rtf';
import { summen } from '../../lv/rechnen';
import { datumDE, euro } from '../../abrechnung/pruefung';
import { useAva } from '../../store';
import { Druck } from '../Druck';
import { zahlDE } from '../eingaben';
import { zeilenVon } from './LvEditor';
import { alsHtml } from './Langtext';

/** Leistungsbeschreibung mit Leistungsverzeichnis – leer für die Bieter oder mit den Preisen eines Bieters */
export function LvDruck({ onClose }: { onClose: () => void }) {
  const offen = useAva((s) => s.lv)!;
  const projekt = useAva((s) => s.projekt)!;
  const lv = offen.lv;
  const [bieter, setBieter] = useState<number | null>(null);
  const [langtexte, setLangtexte] = useState(true);
  const zeilen = useMemo(() => zeilenVon(lv), [lv]);
  const s = useMemo(() => summen(lv), [lv]);
  const k = lv.kopf;
  const bs = bieter !== null ? s.bieter.get(bieter) : undefined;
  return (
    <Druck
      titel="Leistungsverzeichnis"
      zusatz={`LV ${k.bezeichnung}`}
      onClose={onClose}
      hoch
      aktionen={
        <>
          <select value={bieter ?? ''} onChange={(e) => setBieter(e.target.value === '' ? null : Number(e.target.value))} title="Ohne Preise (zur Angebotsabgabe) oder mit den Preisen eines Bieters">
            <option value="">ohne Preise (für die Bieter)</option>
            {lv.bieter.map((b) => (
              <option key={b.id} value={b.id}>
                mit Preisen: {b.name}
              </option>
            ))}
          </select>
          <label className="ava-check">
            <input type="checkbox" checked={langtexte} onChange={(e) => setLangtexte(e.target.checked)} /> Langtexte
          </label>
        </>
      }
    >
      <div className="ava-lvd-kopf">
        <div>
          <div className="muted">{projekt.meta.projektcode}</div>
          <h1>{k.bezeichnung}</h1>
          <div className="ava-lvd-projekt">{k.projekt ?? k.projektName}</div>
        </div>
        <table className="ava-lvd-daten">
          <tbody>
            {k.nummer && (
              <tr>
                <td>LV-Nr.</td>
                <td>{k.nummer}</td>
              </tr>
            )}
            {k.datum && (
              <tr>
                <td>Datum</td>
                <td>{datumDE(k.datum)}</td>
              </tr>
            )}
            {k.eroeffnung && (
              <tr>
                <td>Angebotsabgabe</td>
                <td>
                  {datumDE(k.eroeffnung)} {k.eroeffnung.slice(11, 16)}
                </td>
              </tr>
            )}
            {k.bindefrist && (
              <tr>
                <td>Bindefrist</td>
                <td>{datumDE(k.bindefrist)}</td>
              </tr>
            )}
            {(k.ausfuehrungVon || k.ausfuehrungBis) && (
              <tr>
                <td>Ausführung</td>
                <td>
                  {datumDE(k.ausfuehrungVon)} – {datumDE(k.ausfuehrungBis)}
                </td>
              </tr>
            )}
            {k.vergabeart && (
              <tr>
                <td>Vergabeart</td>
                <td>{k.vergabeart}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {k.auftraggeber && (
        <p className="ava-lvd-ag">
          <strong>Auftraggeber:</strong> {k.auftraggeber.replace(/\n/g, ', ')}
        </p>
      )}
      <table className="ava-lvd-tabelle">
        <thead>
          <tr>
            <th>OZ</th>
            <th>Leistung</th>
            <th className="num">Menge</th>
            <th>Einheit</th>
            <th className="num">EP €</th>
            <th className="num">GB €</th>
          </tr>
        </thead>
        <tbody>
          {zeilen.map((z) => {
            const el = z.el;
            if (el.art === 'abschnitt') {
              const summe = bieter !== null ? s.abschnitte.get(el.id)?.get(bieter) : undefined;
              return (
                <tr key={el.id} className="ava-lvd-abschnitt">
                  <td>{z.oz}</td>
                  <td colSpan={4}>
                    {el.kurztext}
                    {langtexte && el.langtext.length > 0 && <div className="ava-lvd-lang" dangerouslySetInnerHTML={{ __html: alsHtml(el.langtext) }} />}
                  </td>
                  <td className="num">{summe !== undefined ? zahlDE(summe, 2) : ''}</td>
                </tr>
              );
            }
            if (el.art === 'hinweis') {
              return (
                <tr key={el.id} className="ava-lvd-hinweis">
                  <td />
                  <td colSpan={5}>
                    <strong>{el.kurztext}</strong>
                    {langtexte && <div className="ava-lvd-lang" dangerouslySetInnerHTML={{ __html: alsHtml(el.langtext) }} />}
                  </td>
                </tr>
              );
            }
            const ep = bieter !== null ? el.preise[String(bieter)]?.ep : undefined;
            const gb = bieter !== null ? s.positionen.get(el.id)?.get(bieter) : undefined;
            const art = el.positionsart === 'bedarf' ? 'Bedarfsposition (ohne GB) – ' : el.positionsart === 'wahl' ? 'Wahlposition (ohne GB) – ' : el.positionsart === 'zulage' ? 'Zulage – ' : '';
            return (
              <tr key={el.id} className="ava-lvd-pos">
                <td>{z.oz}</td>
                <td>
                  <strong>
                    {art}
                    {el.kurztext}
                  </strong>
                  {langtexte && el.langtext.length > 0 && alsText(el.langtext).trim() !== el.kurztext.trim() && <div className="ava-lvd-lang" dangerouslySetInnerHTML={{ __html: alsHtml(el.langtext) }} />}
                </td>
                <td className="num">{zahlDE(el.menge, 3)}</td>
                <td>{el.einheit}</td>
                <td className="num">{bieter === null ? '……………' : ep != null ? zahlDE(ep, 2) : ''}</td>
                <td className="num">{bieter === null ? '……………' : gb !== undefined && el.positionsart !== 'bedarf' && el.positionsart !== 'wahl' ? zahlDE(gb, 2) : ''}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <table className="ava-lvd-summe">
        <tbody>
          <tr>
            <td>Summe netto</td>
            <td className="num">{bs ? euro(bs.ohneNachlass) : '……………'}</td>
          </tr>
          {bieter !== null && (lv.bieter.find((b) => b.id === bieter)?.nachlass ?? 0) !== 0 && (
            <tr>
              <td>Nachlass {zahlDE(-(lv.bieter.find((b) => b.id === bieter)!.nachlass ?? 0))} %</td>
              <td className="num">{euro((bs?.netto ?? 0) - (bs?.ohneNachlass ?? 0))}</td>
            </tr>
          )}
          <tr>
            <td>zzgl. {k.mwst} % Umsatzsteuer</td>
            <td className="num">{bs ? euro(bs.mwst) : '……………'}</td>
          </tr>
          <tr className="ava-lvd-brutto">
            <td>Angebotssumme brutto</td>
            <td className="num">{bs ? euro(bs.brutto) : '……………'}</td>
          </tr>
        </tbody>
      </table>
      {bieter === null && (
        <div className="ava-lvd-unterschrift">
          <div>Ort, Datum</div>
          <div>Stempel und Unterschrift des Bieters</div>
        </div>
      )}
    </Druck>
  );
}
