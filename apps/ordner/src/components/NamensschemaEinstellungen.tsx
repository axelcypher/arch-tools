import { useState } from 'react';
import type { Kuerzel, Namensschema, NamensTeil } from '@core/namensschema';
import { dateinameZerlegen, NAMENS_TEILE, namensschemaAus, VORGABE_NAMENSSCHEMA } from '@core/namensschema';
import { bestaetigen } from '@core/ui/Rueckfrage';
import { useOrdner } from '../store';

/** gültiges Kürzel: Großbuchstaben und Ziffern, höchstens 8 Zeichen */
const KUERZEL = /^[A-Z0-9ÄÖÜ]{1,8}$/;

/**
 * Namensschema des Büros – gemeinsam für alle Apps (allgemein.json): Planphasen und Antragsarten mit ihren Kürzeln,
 * die Stellen der Teile im Dateinamen und ab welcher Leistungsphase Pläne einen Index tragen. Jede neue Projektdatei
 * bekommt eine Kopie; beim Ergänzen eines Projekts wird sie auf den Stand des Büros gebracht.
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
  const zuruecksetzen = async () => {
    if (
      await bestaetigen(
        'Namensschema zurücksetzen?',
        'Kürzel, Stellen und Indizes des Büros werden durch die eingebaute Vorgabe ersetzt. Projektdateien behalten ihre Kopie, bis sie ergänzt werden.',
        'Zurücksetzen',
      )
    )
      setAllgemein({ namensschema: structuredClone(VORGABE_NAMENSSCHEMA) });
  };

  return (
    <section className="po-namensschema" aria-label="Kürzel und Plannummern">
      <h2>Kürzel und Plannummern</h2>
      <p className="muted small-text">
        Gilt für alle Apps: Formulare erkennt daran Antragsordner (BAUA, BAUA 2 …) und die Pläne eines Plansatzes (Plannummer mit Plankürzel, z. B. GP-04, oder GP01-07 für einen zusammengefassten
        Satz). Neue Projektdateien bekommen eine Kopie; beim Ergänzen eines Projekts wird sie auf den Stand des Büros gebracht. Wie die Dateien des Büros insgesamt heißen, legt das „Dateinamenschema
        für Pläne“ der Struktur fest – hier geht es nur um die Kürzel und ihre Stellen.
      </p>

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
        <span className="field-label">Pläne mit Index (z. B. AP-03a) ab Leistungsphase</span>
        <input type="number" min={0} max={9} value={s.indexAbLph} aria-label="Index ab Leistungsphase" onChange={(e) => e.target.value !== '' && setzen({ indexAbLph: Number(e.target.value) })} />
      </label>

      <KuerzelListe titel="Planphasen" text="Kürzel der Planungsphase im Dateinamen und vor der Plannummer (GP-01)." liste={s.phasen} mitLph onChange={(phasen) => setzen({ phasen })} />
      <KuerzelListe
        titel="Antrags- und Verfahrensarten"
        text="Kürzel der Antrags- bzw. Verfahrensart – Name der Antragsordner (BAUA, BAUA 2 …) und im Dateinamen statt der Phase. Gleichwertige Schreibweisen mit Komma (z. B. BVA)."
        liste={s.antragsarten}
        onChange={(antragsarten) => setzen({ antragsarten })}
      />
      <div className="po-namensschema-fuss">
        <button className="small" disabled={!allgemein.namensschema} title="Die eingebaute Vorgabe wiederherstellen (mit Rückfrage)" onClick={() => void zuruecksetzen()}>
          Vorgabe wiederherstellen
        </button>
      </div>
    </section>
  );
}

function KuerzelListe({ titel, text, liste, mitLph = false, onChange }: { titel: string; text: string; liste: Kuerzel[]; mitLph?: boolean; onChange: (l: Kuerzel[]) => void }) {
  const zeile = (i: number, patch: Partial<Kuerzel>) => onChange(liste.map((k, j) => (j === i ? { ...k, ...patch } : k)));
  const neuesKuerzel = () => {
    let n = 1;
    while (liste.some((k) => k.kuerzel === (n === 1 ? 'NEU' : `NEU${n}`))) n++;
    return n === 1 ? 'NEU' : `NEU${n}`;
  };
  return (
    <div className="po-kuerzel">
      <h3>{titel}</h3>
      <p className="muted small-text">{text}</p>
      <table className="po-kuerzel-tabelle">
        <colgroup>
          <col className="po-kuerzel-spalte" />
          <col />
          <col className="po-kuerzel-zusatz" />
          <col className="po-kuerzel-weg" />
        </colgroup>
        <thead>
          <tr>
            <th>Kürzel</th>
            <th>Bedeutung</th>
            <th>{mitLph ? 'LPH' : 'Schreibweisen'}</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {liste.map((k, i) => (
            <KuerzelZeile
              key={`${i}-${k.kuerzel}`}
              titel={titel}
              k={k}
              andere={liste.filter((_, j) => j !== i).map((x) => x.kuerzel)}
              mitLph={mitLph}
              onChange={(patch) => zeile(i, patch)}
              onEntfernen={() => onChange(liste.filter((_, j) => j !== i))}
            />
          ))}
        </tbody>
      </table>
      <button className="small" onClick={() => onChange([...liste, { kuerzel: neuesKuerzel(), name: '' }])}>
        + Kürzel
      </button>
    </div>
  );
}

/** Eine Zeile: Eingaben werden beim Verlassen übernommen – ein ungültiges Kürzel wird nicht gespeichert, sondern gemeldet */
function KuerzelZeile({
  titel,
  k,
  andere,
  mitLph,
  onChange,
  onEntfernen,
}: {
  titel: string;
  k: Kuerzel;
  andere: string[];
  mitLph: boolean;
  onChange: (p: Partial<Kuerzel>) => void;
  onEntfernen: () => void;
}) {
  const [kuerzel, setKuerzel] = useState(k.kuerzel);
  const [name, setName] = useState(k.name);
  const [synonyme, setSynonyme] = useState((k.synonyme ?? []).join(', '));
  const [fehler, setFehler] = useState('');
  const kuerzelUebernehmen = () => {
    const neu = kuerzel.trim().toUpperCase();
    if (neu === k.kuerzel) return setKuerzel(neu);
    if (!KUERZEL.test(neu)) return setFehler(`„${kuerzel.trim()}“: nur Großbuchstaben und Ziffern, höchstens 8 Zeichen – es bleibt ${k.kuerzel}.`);
    if (andere.includes(neu)) return setFehler(`${neu} gibt es schon – es bleibt ${k.kuerzel}.`);
    setFehler('');
    onChange({ kuerzel: neu });
  };
  return (
    <>
      <tr>
        <td>
          <input
            value={kuerzel}
            aria-label={`${titel}: Kürzel ${k.kuerzel}`}
            aria-invalid={!!fehler}
            onChange={(e) => {
              setKuerzel(e.target.value);
              setFehler('');
            }}
            onBlur={kuerzelUebernehmen}
          />
        </td>
        <td>
          <input value={name} aria-label={`${titel}: Bedeutung von ${k.kuerzel}`} onChange={(e) => setName(e.target.value)} onBlur={() => name.trim() !== k.name && onChange({ name: name.trim() })} />
        </td>
        <td>
          {mitLph ? (
            <input
              type="number"
              min={0}
              max={9}
              value={k.lph ?? ''}
              aria-label={`Leistungsphase von ${k.kuerzel}`}
              onChange={(e) => onChange({ lph: e.target.value === '' ? undefined : Number(e.target.value) })}
            />
          ) : (
            <input
              value={synonyme}
              aria-label={`Schreibweisen von ${k.kuerzel}`}
              onChange={(e) => setSynonyme(e.target.value)}
              onBlur={() =>
                onChange({
                  synonyme: synonyme
                    .split(',')
                    .map((x) => x.trim().toUpperCase())
                    .filter(Boolean),
                })
              }
            />
          )}
        </td>
        <td>
          <button className="icon" title="Entfernen" aria-label={`${k.kuerzel} entfernen`} onClick={onEntfernen}>
            ×
          </button>
        </td>
      </tr>
      {fehler && (
        <tr>
          <td colSpan={4} className="po-kuerzel-fehler" role="alert">
            {fehler}
          </td>
        </tr>
      )}
    </>
  );
}
