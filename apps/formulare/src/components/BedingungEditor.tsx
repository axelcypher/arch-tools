import type { Bedingung, FeldPruefung, Merkmal, Teilbedingung } from '../bedingung';
import type { Feld } from '../forma/felder';
import { Symbol } from './Symbol';

export interface FeldWahl {
  feld: Feld;
  titel: string;
  /** Abschnitt bzw. Seite – zum Gruppieren in der Auswahl */
  ort: string;
}

/**
 * Bedingung bearbeiten: Teile untereinander, alle müssen zutreffen. Ein Teil ist ein Projektmerkmal mit einem oder
 * mehreren Werten („Gebäudeklasse 3, 4 oder 5“) oder – wenn `felder` übergeben sind – ein anderes Feld des
 * Formulars (angekreuzt/ausgefüllt, leer, hat einen Wert).
 */
export function BedingungEditor({
  wert,
  onChange,
  merkmale,
  felder,
  ohne,
}: {
  wert: Bedingung | undefined;
  onChange: (b: Bedingung | undefined) => void;
  merkmale: Merkmal[];
  felder?: FeldWahl[];
  /** Feldschlüssel, die nicht wählbar sind (das Feld selbst) */
  ohne?: string[];
}) {
  const teile = wert ?? [];
  const setzen = (neu: Teilbedingung[]) => onChange(neu.length ? neu : undefined);
  const teilSetzen = (i: number, t: Teilbedingung) => setzen(teile.map((x, n) => (n === i ? t : x)));
  const wahl = (felder ?? []).filter((f) => !ohne?.includes(f.feld.schluessel));
  const orte = [...new Set(wahl.map((f) => f.ort))];
  const neuMerkmal = (): Teilbedingung => ({ art: 'merkmal', merkmal: merkmale[0]?.name ?? '', werte: [] });
  const neuFeld = (): Teilbedingung => ({ art: 'feld', feld: wahl[0]?.feld.schluessel ?? '', pruefung: 'ausgefuellt' });

  return (
    <div className="bd" role="group" aria-label="Bedingung">
      {!teile.length && <p className="muted small-text">Immer erforderlich. Mit einer Bedingung nur, wenn sie zutrifft.</p>}
      {teile.map((t, i) => {
        const feld = t.art === 'feld' ? wahl.find((f) => f.feld.schluessel === t.feld) ?? (felder ?? []).find((f) => f.feld.schluessel === t.feld) : undefined;
        const kreuz = feld?.feld.art === 'kreuz';
        return (
          <div key={i} className="bd-teil">
            <span className="bd-wort">{i === 0 ? 'nur wenn' : 'und'}</span>
            {felder && (
              <select value={t.art} aria-label="Art der Bedingung" onChange={(e) => teilSetzen(i, e.target.value === 'feld' ? neuFeld() : neuMerkmal())}>
                <option value="merkmal">Projektmerkmal</option>
                <option value="feld">Feld im Formular</option>
              </select>
            )}
            {t.art === 'merkmal' ? (
              <>
                <select value={t.merkmal} aria-label="Projektmerkmal" onChange={(e) => teilSetzen(i, { art: 'merkmal', merkmal: e.target.value, werte: [] })}>
                  {!merkmale.some((m) => m.name === t.merkmal) && <option value={t.merkmal}>{t.merkmal || '–'}</option>}
                  {merkmale.map((m) => (
                    <option key={m.name} value={m.name}>
                      {m.name}
                    </option>
                  ))}
                </select>
                <span className="bd-werte">
                  {(merkmale.find((m) => m.name === t.merkmal)?.werte ?? t.werte).map((w) => (
                    <label key={w} className={`bd-wert${t.werte.includes(w) ? ' an' : ''}`}>
                      <input
                        type="checkbox"
                        checked={t.werte.includes(w)}
                        aria-label={`${t.merkmal} ${w}`}
                        onChange={(e) => teilSetzen(i, { ...t, werte: e.target.checked ? [...t.werte, w] : t.werte.filter((x) => x !== w) })}
                      />
                      {w}
                    </label>
                  ))}
                </span>
              </>
            ) : (
              <>
                <select className="bd-feld" value={t.feld} aria-label="Feld" onChange={(e) => teilSetzen(i, { ...t, feld: e.target.value })}>
                  {!feld && <option value={t.feld}>{t.feld || '–'}</option>}
                  {orte.map((o) => (
                    <optgroup key={o} label={o}>
                      {wahl
                        .filter((f) => f.ort === o)
                        .map((f) => (
                          <option key={f.feld.schluessel} value={f.feld.schluessel}>
                            {f.feld.art === 'kreuz' ? '☐ ' : ''}
                            {f.titel}
                          </option>
                        ))}
                    </optgroup>
                  ))}
                </select>
                <select value={t.pruefung} aria-label="Prüfung" onChange={(e) => teilSetzen(i, { ...t, pruefung: e.target.value as FeldPruefung, ...(e.target.value === 'gleich' ? { wert: t.wert ?? '' } : {}) })}>
                  <option value="ausgefuellt">{kreuz ? 'angekreuzt' : 'ausgefüllt'}</option>
                  <option value="leer">{kreuz ? 'nicht angekreuzt' : 'leer'}</option>
                  {!kreuz && <option value="gleich">ist gleich</option>}
                </select>
                {t.pruefung === 'gleich' && <input className="bd-text" value={t.wert ?? ''} aria-label="Wert" onChange={(e) => teilSetzen(i, { ...t, wert: e.target.value })} />}
              </>
            )}
            <button className="icon" aria-label="Teil der Bedingung entfernen" title="Entfernen" onClick={() => setzen(teile.filter((_, n) => n !== i))}>
              <Symbol name="schliessen" />
            </button>
          </div>
        );
      })}
      <div className="bd-knoepfe">
        <button className="small" disabled={!merkmale.length} onClick={() => setzen([...teile, neuMerkmal()])}>
          <Symbol name="plus" /> Projektmerkmal
        </button>
        {felder && (
          <button className="small" disabled={!wahl.length} onClick={() => setzen([...teile, neuFeld()])}>
            <Symbol name="plus" /> Feld im Formular
          </button>
        )}
      </div>
    </div>
  );
}
