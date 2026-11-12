import { useMemo, useState } from 'react';
import { bestaetigen, frageText } from '@core/ui/Rueckfrage';
import type { Bieter, Position } from '../../lv/modell';
import { aendereElement, positionen } from '../../lv/modell';
import { auffaellig, gewerteteBieter, rangfolge, spiegelzeile, summen } from '../../lv/rechnen';
import { euro } from '../../abrechnung/pruefung';
import { useAva } from '../../store';
import { DatumEingabe, TextEingabe, zahlDE, ZahlEingabe } from '../eingaben';
import { zeilenVon } from './LvEditor';
import { PreisspiegelDruck } from './PreisspiegelDruck';

type Modus = 'spiegel' | 'erfassen';

/** Angebotsprüfung: Bieter verwalten, Einheitspreise erfassen, Preisspiegel mit Rangfolge */
export function Angebote() {
  const offen = useAva((s) => s.lv)!;
  const lv = offen.lv;
  const [modus, setModus] = useState<Modus>('spiegel');
  const [bieterId, setBieterId] = useState<number>(() => lv.bieter.find((b) => b.id !== 0)?.id ?? 0);
  const [druck, setDruck] = useState(false);
  const [nurAuffaellige, setNurAuffaellige] = useState(false);
  const s = useMemo(() => summen(lv), [lv]);
  const rang = useMemo(() => rangfolge(lv, s), [lv, s]);
  const gewertet = gewerteteBieter(lv);
  const aendern = useAva.getState().lvAendern;
  const zeilen = useMemo(() => zeilenVon(lv), [lv]);

  const bieterSetzen = (id: number, patch: Partial<Bieter>) => aendern((l) => ({ ...l, bieter: l.bieter.map((b) => (b.id === id ? { ...b, ...patch } : b)) }));

  const neuerBieter = async () => {
    const name = await frageText('Neuer Bieter', '', 'Anlegen', 'Name des Bieters (Firma)');
    if (!name?.trim()) return;
    const id = Math.max(9, ...lv.bieter.map((b) => b.id)) + 1;
    aendern((l) => ({ ...l, bieter: [...l.bieter, { id, name: name.trim(), angebotsdatum: new Date().toISOString().slice(0, 10) }] }));
    setBieterId(id);
    setModus('erfassen');
  };

  const bieterEntfernen = async (b: Bieter) => {
    if (b.id === 0) return;
    if (lv.auftrag?.bieterId === b.id) return;
    if (!(await bestaetigen('Bieter entfernen?', `„${b.name}“ mit allen Preisen aus dem LV entfernen? (Rückgängig mit Strg+Z)`, 'Entfernen', true))) return;
    const ohnePreise = (el: typeof lv.elemente): typeof lv.elemente =>
      el.map((e) => {
        if (e.art === 'abschnitt') return { ...e, kinder: ohnePreise(e.kinder) };
        if (e.art !== 'position') return e;
        const preise = { ...e.preise };
        delete preise[String(b.id)];
        return { ...e, preise };
      });
    aendern((l) => ({ ...l, bieter: l.bieter.filter((x) => x.id !== b.id), elemente: ohnePreise(l.elemente) }));
  };

  const preisSetzen = (pos: Position, id: number, ep: number | null) =>
    aendern((l) => ({ ...l, elemente: aendereElement(l.elemente, pos.id, (p) => ({ ...(p as Position), preise: { ...(p as Position).preise, [String(id)]: { ...(p as Position).preise[String(id)], ep } } })) }));

  /** Einheitspreise des Kostenansatzes als Vorgabe (z. B. für einen Bieter, der telefonisch bestätigt) */
  const ausKostenansatz = async () => {
    if (!(await bestaetigen('Preise übernehmen?', 'Alle leeren Einheitspreise dieses Bieters mit denen des Kostenansatzes füllen?', 'Übernehmen'))) return;
    for (const { pos } of positionen(lv)) if (pos.preise[String(bieterId)]?.ep == null && pos.preise['0']?.ep != null) preisSetzen(pos, bieterId, pos.preise['0'].ep);
  };

  const b = lv.bieter.find((x) => x.id === bieterId);

  return (
    <div className="ava-angebote">
      <div className="toolbar">
        <div className="tb-group">
          <button className={modus === 'spiegel' ? 'active' : ''} onClick={() => setModus('spiegel')}>
            Preisspiegel
          </button>
          <button className={modus === 'erfassen' ? 'active' : ''} onClick={() => setModus('erfassen')}>
            Preise erfassen
          </button>
        </div>
        <div className="tb-group">
          <button onClick={() => void neuerBieter()}>+ Bieter</button>
          <button onClick={() => setDruck(true)} disabled={!gewertet.length}>
            Preisspiegel drucken …
          </button>
        </div>
        {modus === 'spiegel' && (
          <label className="ava-check">
            <input type="checkbox" checked={nurAuffaellige} onChange={(e) => setNurAuffaellige(e.target.checked)} /> nur auffällige Preise (±30 % vom Mittel)
          </label>
        )}
      </div>
      <div className="ava-bieter-liste">
        <table className="ava-tabelle">
          <thead>
            <tr>
              <th>Rang</th>
              <th>Bieter</th>
              <th>Angebot vom</th>
              <th className="num">Summe netto</th>
              <th className="num">Nachlass %</th>
              <th className="num">nach Nachlass</th>
              <th className="num">brutto</th>
              <th className="num">Abstand</th>
              <th>Preise</th>
              <th>gewertet</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {lv.bieter.map((x) => {
              const sb = s.bieter.get(x.id);
              const r = rang.find((y) => y.id === x.id);
              return (
                <tr key={x.id} className={`${x.id === bieterId ? 'active ' : ''}${lv.auftrag?.bieterId === x.id ? 'ava-auftrag ' : ''}${x.ausgeschlossen ? 'ava-ausgeschlossen' : ''}`} onClick={() => setBieterId(x.id)}>
                  <td>{x.id === 0 ? '—' : (r?.rang ?? '')}</td>
                  <td>
                    {x.id === 0 ? (
                      <span title="Eigene Kostenberechnung">{x.name}</span>
                    ) : (
                      <TextEingabe wert={x.name} onChange={(name) => bieterSetzen(x.id, { name: name.trim() || x.name })} />
                    )}
                    {lv.auftrag?.bieterId === x.id && <span className="ava-chip ava-chip-ok">Auftrag</span>}
                  </td>
                  <td>{x.id !== 0 && <DatumEingabe wert={x.angebotsdatum} onChange={(angebotsdatum) => bieterSetzen(x.id, { angebotsdatum })} />}</td>
                  <td className="num">{euro(sb?.ohneNachlass)}</td>
                  <td className="num ava-zelle-eingabe">
                    <ZahlEingabe wert={x.nachlass ? -x.nachlass : null} onChange={(n) => bieterSetzen(x.id, { nachlass: n ? -Math.abs(n) : undefined })} title="Nachlass in Prozent (z. B. 3 für 3 %)" />
                  </td>
                  <td className="num">{euro(sb?.netto)}</td>
                  <td className="num">{euro(sb?.brutto)}</td>
                  <td className="num">{r && r.rang > 1 ? `+${zahlDE(r.abstand, 1)} %` : ''}</td>
                  <td>{sb ? `${sb.mitPreis}/${sb.mitPreis + sb.ohnePreis}` : ''}</td>
                  <td>{x.id !== 0 && <input type="checkbox" checked={!x.ausgeschlossen} onChange={(e) => bieterSetzen(x.id, { ausgeschlossen: !e.target.checked || undefined })} title="Im Preisspiegel und in der Rangfolge werten" />}</td>
                  <td>
                    {x.id !== 0 && lv.auftrag?.bieterId !== x.id && (
                      <button className="small danger" onClick={(e) => (e.stopPropagation(), void bieterEntfernen(x))} title="Bieter entfernen">
                        ×
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {modus === 'erfassen' ? (
        <div className="ava-erfassen">
          <div className="ava-erfassen-kopf">
            <strong>Einheitspreise: {b?.name}</strong>
            <span className="muted small-text">Enter springt zur nächsten Position.</span>
            {bieterId !== 0 && (
              <button className="small" onClick={() => void ausKostenansatz()}>
                Leere Preise aus dem Kostenansatz
              </button>
            )}
          </div>
          <table className="ava-tabelle ava-erfassen-tabelle">
            <thead>
              <tr>
                <th>OZ</th>
                <th>Kurztext</th>
                <th className="num">Menge</th>
                <th>Einheit</th>
                <th className="num">EP Kostenansatz</th>
                <th className="num">EP {b?.name}</th>
                <th className="num">GB</th>
                <th className="num">Abw.</th>
              </tr>
            </thead>
            <tbody>
              {zeilen.map((z, i) => {
                const el = z.el;
                if (el.art !== 'position')
                  return el.art === 'abschnitt' ? (
                    <tr key={el.id} className="ava-z-abschnitt">
                      <td>{z.oz}</td>
                      <td colSpan={7}>{el.kurztext}</td>
                    </tr>
                  ) : null;
                const ep = el.preise[String(bieterId)]?.ep ?? null;
                const ka = el.preise['0']?.ep ?? null;
                const abw = ep !== null && ka ? ((ep - ka) / ka) * 100 : null;
                return (
                  <tr key={el.id}>
                    <td className="ava-oz">{z.oz}</td>
                    <td className="ava-kurztext" title={el.kurztext}>
                      {el.kurztext}
                    </td>
                    <td className="num">{zahlDE(el.menge)}</td>
                    <td>{el.einheit}</td>
                    <td className="num">{zahlDE(ka, 2)}</td>
                    <td className="num ava-zelle-eingabe">
                      <ZahlEingabe
                        wert={ep}
                        stellen={2}
                        onChange={(n) => preisSetzen(el, bieterId, n)}
                        onEnter={() => {
                          const naechste = document.querySelectorAll<HTMLInputElement>('.ava-erfassen-tabelle .ava-zelle-eingabe input');
                          const liste = Array.from(naechste);
                          const hier = liste.findIndex((x) => x === document.activeElement);
                          liste[hier + 1]?.focus();
                        }}
                        placeholder={i === 1 ? '0,00' : undefined}
                      />
                    </td>
                    <td className="num">{s.positionen.get(el.id)?.get(bieterId) !== undefined ? zahlDE(s.positionen.get(el.id)!.get(bieterId)!, 2) : ''}</td>
                    <td className={`num ${abw !== null && Math.abs(abw) > 30 ? 'ava-ueber' : ''}`}>{abw !== null ? `${abw > 0 ? '+' : ''}${zahlDE(abw, 0)} %` : ''}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <Preisspiegel nurAuffaellige={nurAuffaellige} />
      )}
      {druck && <PreisspiegelDruck onClose={() => setDruck(false)} />}
    </div>
  );
}

/** Preisspiegel: Einheitspreise und Gesamtbeträge je Position und Bieter, günstigster grün, auffällige markiert */
export function Preisspiegel({ nurAuffaellige = false, druck = false }: { nurAuffaellige?: boolean; druck?: boolean }) {
  const offen = useAva((s) => s.lv)!;
  const lv = offen.lv;
  const s = useMemo(() => summen(lv), [lv]);
  const zeilen = useMemo(() => zeilenVon(lv), [lv]);
  const ids = gewerteteBieter(lv);
  const mitKa = lv.bieter.some((b) => b.id === 0);
  const spalten = [...(mitKa ? [0] : []), ...ids];
  const rang = rangfolge(lv, s);
  return (
    <div className={`ava-spiegel${druck ? ' ava-spiegel-druck' : ''}`}>
      <table className="ava-tabelle ava-spiegel-tabelle">
        <thead>
          <tr>
            <th rowSpan={2}>OZ</th>
            <th rowSpan={2}>Kurztext</th>
            <th rowSpan={2} className="num">
              Menge
            </th>
            <th rowSpan={2}>Einh.</th>
            {spalten.map((id) => (
              <th key={id} colSpan={2} className={`ava-spiegel-bieter${id === 0 ? ' ava-spiegel-ka' : ''}`}>
                {lv.bieter.find((b) => b.id === id)?.name}
                {id !== 0 && rang.find((r) => r.id === id) ? <span className="ava-rang"> {rang.find((r) => r.id === id)!.rang}.</span> : null}
              </th>
            ))}
            <th rowSpan={2} className="num">
              Mittel EP
            </th>
          </tr>
          <tr>
            {spalten.map((id) => [
              <th key={`${id}e`} className="num">
                EP
              </th>,
              <th key={`${id}g`} className="num">
                GB
              </th>,
            ])}
          </tr>
        </thead>
        <tbody>
          {zeilen.map((z) => {
            const el = z.el;
            if (el.art === 'abschnitt') {
              if (nurAuffaellige) return null;
              return (
                <tr key={el.id} className="ava-z-abschnitt">
                  <td>{z.oz}</td>
                  <td colSpan={3}>{el.kurztext}</td>
                  {spalten.map((id) => [
                    <td key={`${id}e`} />,
                    <td key={`${id}g`} className="num">
                      {zahlDE(s.abschnitte.get(el.id)?.get(id), 2)}
                    </td>,
                  ])}
                  <td />
                </tr>
              );
            }
            if (el.art !== 'position') return null;
            const sz = spiegelzeile(el, ids);
            if (nurAuffaellige && !ids.some((id) => auffaellig(sz, id))) return null;
            const ohne = el.positionsart === 'bedarf' || el.positionsart === 'wahl';
            return (
              <tr key={el.id} className={ohne ? 'ava-z-ohne-summe' : ''}>
                <td className="ava-oz">{z.oz}</td>
                <td className="ava-kurztext" title={el.kurztext}>
                  {el.kurztext}
                  {ohne && <span className="ava-chip">{el.positionsart === 'bedarf' ? 'Bedarf' : 'Wahl'}</span>}
                </td>
                <td className="num">{zahlDE(el.menge)}</td>
                <td>{el.einheit}</td>
                {spalten.map((id) => {
                  const ep = el.preise[String(id)]?.ep;
                  const kl = id === 0 ? 'ava-spiegel-ka' : sz.guenstigster.includes(id) && sz.ep.size > 1 ? 'ava-min' : sz.max === ep && sz.ep.size > 1 ? 'ava-max' : '';
                  return [
                    <td key={`${id}e`} className={`num ${kl}${id !== 0 && auffaellig(sz, id) ? ' ava-auffaellig' : ''}`} title={id !== 0 && sz.abweichung.has(id) ? `${zahlDE(sz.abweichung.get(id)!, 0)} % vom Mittel` : undefined}>
                      {ep != null ? zahlDE(ep, 2) : <span className="muted">–</span>}
                    </td>,
                    <td key={`${id}g`} className={`num ${id === 0 ? 'ava-spiegel-ka' : ''}`}>
                      {zahlDE(s.positionen.get(el.id)?.get(id), 2)}
                    </td>,
                  ];
                })}
                <td className="num muted">{zahlDE(sz.mittel, 2)}</td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          {[
            ['Summe netto', (id: number) => s.bieter.get(id)?.ohneNachlass],
            ['Nachlass', (id: number) => (s.bieter.get(id)?.netto ?? 0) - (s.bieter.get(id)?.ohneNachlass ?? 0) || null],
            ['nach Nachlass', (id: number) => s.bieter.get(id)?.netto],
            [`USt ${lv.kopf.mwst} %`, (id: number) => s.bieter.get(id)?.mwst],
            ['brutto', (id: number) => s.bieter.get(id)?.brutto],
          ].map(([text, f]) => (
            <tr key={text as string}>
              <td colSpan={4}>{text as string}</td>
              {spalten.map((id) => (
                <td key={id} colSpan={2} className={`num${id === 0 ? ' ava-spiegel-ka' : ''}`}>
                  {euro((f as (id: number) => number | null | undefined)(id) ?? null)}
                </td>
              ))}
              <td />
            </tr>
          ))}
        </tfoot>
      </table>
    </div>
  );
}
