import type { Kuerzel, Namensschema, NamensTeil } from '@core/namensschema';
import { dateinameZerlegen, NAMENS_TEILE, namensschemaAus, VORGABE_NAMENSSCHEMA } from '@core/namensschema';
import { useOrdner } from '../store';

/**
 * Namensschema des Büros – gemeinsam für alle Apps (allgemein.json): Planphasen und Antragsarten mit ihren Kürzeln,
 * die Stellen der Teile im Dateinamen und ab welcher Leistungsphase Pläne einen Index tragen. Jede neue Projektdatei
 * bekommt eine Kopie; Projekte ohne eigenes Schema verwenden dieses.
 */
export function NamensschemaEinstellungen() {
  const { allgemein, setAllgemein } = useOrdner();
  const s: Namensschema = allgemein.namensschema ?? VORGABE_NAMENSSCHEMA;
  const setzen = (patch: Partial<Namensschema>) => setAllgemein({ namensschema: namensschemaAus({ ...s, ...patch }) ?? VORGABE_NAMENSSCHEMA });
  const beispielTeile: Record<NamensTeil, string> = { code: 'HVO', art: 'GP', datum: '261111', nummer: 'GP-04' };
  const beispiel = `${s.reihenfolge.map((t) => beispielTeile[t]).join(' ')} Grundriss OG.pdf`;
  const zerlegt = dateinameZerlegen(beispiel, s);

  const stelleSetzen = (i: number, teil: NamensTeil) => {
    const neu = [...s.reihenfolge];
    const alt = neu.indexOf(teil);
    [neu[i], neu[alt]] = [teil, neu[i]];
    setzen({ reihenfolge: neu });
  };

  return (
    <>
      <h2>Namensschema</h2>
      <p className="muted small-text">
        Kürzel und Aufbau der Dateinamen – gelten für alle Apps. Jede neue Projektdatei bekommt eine Kopie (Projekte ohne eigenes Schema verwenden dieses). Formulare erkennt daran Antragsfassungen und
        die Pläne eines Plansatzes (Plannummer mit Plankürzel, z. B. GP-04 oder GP01-07 für einen zusammengefassten Satz).
      </p>
      <section className="po-namensschema">
        <h3>Aufbau des Dateinamens</h3>
        <div className="po-stellen">
          {s.reihenfolge.map((t, i) => (
            <label key={i}>
              <span className="field-label">Stelle {i + 1}</span>
              <select value={t} aria-label={`Stelle ${i + 1}`} onChange={(e) => stelleSetzen(i, e.target.value as NamensTeil)}>
                {NAMENS_TEILE.map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.name}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>
        <p className="muted small-text">
          Beispiel: <code>{beispiel}</code> – Projektcode {zerlegt.code}, Phase {zerlegt.art}, Datum {zerlegt.datum}, Plannummer {zerlegt.nummer}, Bezeichnung „{zerlegt.rest}“. Im Antragsordner steht
          statt der Phase die Antragsart (HVO BAUA 261111 GP-04 …); die Plannummer bleibt.
        </p>
        <label className="po-index">
          <span className="field-label">Pläne mit Index (z. B. GP-03a) ab Leistungsphase</span>
          <input type="number" min={0} max={9} value={s.indexAbLph} aria-label="Index ab Leistungsphase" onChange={(e) => setzen({ indexAbLph: Number(e.target.value) })} />
        </label>

        <KuerzelListe titel="Planphasen" text="Kürzel der Planungsphase im Dateinamen und vor der Plannummer (GP-01)." liste={s.phasen} mitLph onChange={(phasen) => setzen({ phasen })} />
        <KuerzelListe
          titel="Antragsarten"
          text="Kürzel der Antragsart – Name der Antragsordner (BAUA, BAUA 2 …) und im Dateinamen statt der Phase. Gleichwertige Schreibweisen mit Komma (z. B. BVA)."
          liste={s.antragsarten}
          onChange={(antragsarten) => setzen({ antragsarten })}
        />
        <div className="po-namensschema-fuss">
          <button
            className="small"
            disabled={!allgemein.namensschema}
            title="Die eingebaute Vorgabe wiederherstellen"
            onClick={() => setAllgemein({ namensschema: structuredClone(VORGABE_NAMENSSCHEMA) })}
          >
            Vorgabe wiederherstellen
          </button>
        </div>
      </section>
    </>
  );
}

function KuerzelListe({ titel, text, liste, mitLph = false, onChange }: { titel: string; text: string; liste: Kuerzel[]; mitLph?: boolean; onChange: (l: Kuerzel[]) => void }) {
  const zeile = (i: number, patch: Partial<Kuerzel>) => onChange(liste.map((k, j) => (j === i ? { ...k, ...patch } : k)));
  return (
    <div className="po-kuerzel">
      <h3>{titel}</h3>
      <p className="muted small-text">{text}</p>
      <table className="po-kuerzel-tabelle">
        <thead>
          <tr>
            <th>Kürzel</th>
            <th>Bedeutung</th>
            {mitLph ? <th>LPH</th> : <th>auch</th>}
            <th />
          </tr>
        </thead>
        <tbody>
          {liste.map((k, i) => (
            <tr key={`${i}-${k.kuerzel}`}>
              <td>
                <input defaultValue={k.kuerzel} aria-label={`${titel}: Kürzel ${i + 1}`} onBlur={(e) => e.target.value.trim() && zeile(i, { kuerzel: e.target.value.trim().toUpperCase() })} />
              </td>
              <td>
                <input value={k.name} aria-label={`${titel}: Bedeutung von ${k.kuerzel}`} onChange={(e) => zeile(i, { name: e.target.value })} />
              </td>
              <td>
                {mitLph ? (
                  <input
                    type="number"
                    min={0}
                    max={9}
                    value={k.lph ?? ''}
                    aria-label={`Leistungsphase von ${k.kuerzel}`}
                    onChange={(e) => zeile(i, { lph: e.target.value === '' ? undefined : Number(e.target.value) })}
                  />
                ) : (
                  <input
                    defaultValue={(k.synonyme ?? []).join(', ')}
                    aria-label={`Schreibweisen von ${k.kuerzel}`}
                    onBlur={(e) =>
                      zeile(i, {
                        synonyme: e.target.value
                          .split(',')
                          .map((x) => x.trim().toUpperCase())
                          .filter(Boolean),
                      })
                    }
                  />
                )}
              </td>
              <td>
                <button className="icon" title="Entfernen" aria-label={`${k.kuerzel} entfernen`} onClick={() => onChange(liste.filter((_, j) => j !== i))}>
                  ×
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <button className="small" onClick={() => onChange([...liste, { kuerzel: `NEU${liste.length + 1}`, name: '' }])}>
        + Kürzel
      </button>
    </div>
  );
}
