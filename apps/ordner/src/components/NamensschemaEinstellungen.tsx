import type { FocusEvent } from 'react';
import { useEffect, useId, useRef, useState } from 'react';
import type { Kuerzel, Namensschema, NamensTeil } from '@core/namensschema';
import { alleKuerzel, dateinameZerlegen, KUERZEL_MUSTER, NAMENS_TEILE, namensschemaAus, VORGABE_NAMENSSCHEMA } from '@core/namensschema';
import { bestaetigen } from '@core/ui/Rueckfrage';
import { useOrdner } from '../store';

/** Schreibweisen aus der Eingabe: groß, ohne Doppelte und ohne das Kürzel selbst */
const schreibweisenAus = (text: string, kuerzel: string) => [
  ...new Set(
    text
      .split(',')
      .map((x) => x.trim().toUpperCase())
      .filter((x) => x && x !== kuerzel),
  ),
];

/**
 * Namensschema des Büros – gemeinsam für alle Apps (allgemein.json): Planphasen und Antragsarten mit ihren Kürzeln,
 * die Stellen der Teile im Dateinamen und ab welcher Leistungsphase Pläne einen Index tragen. Jede neue Projektdatei
 * bekommt eine Kopie; beim Ergänzen eines Projekts wird sie auf den Stand des Büros gebracht.
 */
export function NamensschemaEinstellungen() {
  const { allgemein, setAllgemein } = useOrdner();
  const s: Namensschema = allgemein.namensschema ?? VORGABE_NAMENSSCHEMA;
  const setzen = (patch: Partial<Namensschema>) => setAllgemein({ namensschema: namensschemaAus({ ...s, ...patch }) ?? VORGABE_NAMENSSCHEMA });
  // Beispiel mit den Kürzeln des Schemas (GP, sonst die erste Phase; die erste Antragsart)
  const phase = s.phasen.find((k) => k.kuerzel === 'GP')?.kuerzel ?? s.phasen[0]?.kuerzel ?? 'GP';
  const antragsart = s.antragsarten[0]?.kuerzel ?? 'BAUA';
  const name = (art: string) => {
    const teile: Record<NamensTeil, string> = { code: 'HVO', art, datum: '261111', nummer: `${phase}-04` };
    return `${s.reihenfolge.map((t) => teile[t]).join(' ')} Grundriss OG.pdf`;
  };
  const beispiel = name(phase);
  const indexId = useId();
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
        'Vorgabe wiederherstellen?',
        'Kürzel, Stellen und Indizes des Büros werden durch die eingebaute Vorgabe ersetzt. Projektdateien behalten ihre Kopie, bis sie ergänzt werden.',
        'Wiederherstellen',
      )
    )
      setAllgemein({ namensschema: structuredClone(VORGABE_NAMENSSCHEMA) });
  };

  return (
    <section className="po-namensschema" aria-labelledby="po-namensschema-titel">
      <h2 id="po-namensschema-titel">Namensschema: Kürzel und Plannummern</h2>
      <p className="muted small-text">
        Gilt für alle Apps – PERMIO (Formulare) erkennt daran Antragsordner und die Pläne eines Plansatzes (GP-04, GP01-07). Neue Projektdateien bekommen eine Kopie, das Ergänzen eines Projekts bringt
        sie auf den Stand des Büros; die übrigen Teile der Dateinamen regelt das „Dateinamenschema für Pläne“ der Struktur.
      </p>

      <h3>Stellen der Teile im Dateinamen</h3>
      <p className="muted small-text">Wählt man für eine Stelle einen anderen Teil, tauschen die beiden ihre Plätze.</p>
      <div className="po-stellen">
        {s.reihenfolge.map((t, i) => (
          <label key={i}>
            <span className="field-label">Stelle {i + 1}</span>
            <select value={t} onChange={(e) => stelleSetzen(i, e.target.value as NamensTeil)}>
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
        statt der Phase die Antragsart: <code>{name(antragsart).replace(/ Grundriss OG\.pdf$/, ' …')}</code> – die Plannummer bleibt.
      </p>
      {/* die Meldung des Felds steht unter ihm, nicht im Label (sonst wäre sie Teil seines Namens) */}
      <div className="po-index">
        <label className="field-label" htmlFor={indexId}>
          Pläne mit Index (z. B. AP-03a) ab Leistungsphase
        </label>
        <LphFeld id={indexId} wert={s.indexAbLph} onChange={(n) => n !== undefined && setzen({ indexAbLph: n })} />
        <span className="field-hint">Die HOAI kennt die Leistungsphasen 1 bis 9; 0 heißt „von Anfang an“ (immer mit Index).</span>
      </div>

      <KuerzelListe
        titel="Planphasen"
        text="Kürzel der Planungsphase im Dateinamen und vor der Plannummer (GP-01)."
        liste={s.phasen}
        fremde={alleKuerzel(s.antragsarten)}
        mitLph
        onChange={(phasen) => setzen({ phasen })}
      />
      <KuerzelListe
        titel="Antrags- und Verfahrensarten"
        text="Kürzel der Antrags- bzw. Verfahrensart – Name der Antragsordner (BAUA, BAUA 2 …) und im Dateinamen statt der Phase. Gleichwertige Schreibweisen mit Komma (z. B. BVA)."
        liste={s.antragsarten}
        fremde={alleKuerzel(s.phasen)}
        onChange={(antragsarten) => setzen({ antragsarten })}
      />
      <div className="po-namensschema-fuss">
        <button
          className="small"
          disabled={JSON.stringify(namensschemaAus(allgemein.namensschema) ?? VORGABE_NAMENSSCHEMA) === JSON.stringify(VORGABE_NAMENSSCHEMA)}
          title="Die eingebaute Vorgabe wiederherstellen (mit Rückfrage)"
          onClick={() => void zuruecksetzen()}
        >
          Vorgabe wiederherstellen
        </button>
      </div>
    </section>
  );
}

/**
 * Leistungsphase 0 bis 9 (ganze Zahl): übernommen beim Verlassen (oder Enter), Esc verwirft. Eine ungültige Eingabe
 * wird nicht gekappt oder verworfen, sondern bleibt zum Korrigieren stehen – mit Meldung am Feld (wie NumberField).
 * Leer heißt „keine“, wo das erlaubt ist (Phase ohne LPH).
 */
function LphFeld({
  id,
  wert,
  leerErlaubt = false,
  label,
  onChange,
  meldung,
}: {
  id?: string;
  wert: number | undefined;
  leerErlaubt?: boolean;
  label?: string;
  onChange: (n: number | undefined) => void;
  /** in einer Tabelle: die Meldung steht nicht am Feld, sondern in der Meldungszeile darunter (Kennung und Weitergabe) */
  meldung?: { id: string; setzen: (text: string) => void };
}) {
  const text = wert === undefined ? '' : String(wert);
  const eigeneId = useId();
  const meldungId = meldung?.id ?? eigeneId;
  const [eingabe, setEingabe] = useState(text);
  const [fehler, setFehlerZustand] = useState('');
  const setFehler = (f: string) => {
    setFehlerZustand(f);
    meldung?.setzen(f);
  };
  useEffect(() => {
    setEingabe(text);
    setFehlerZustand('');
  }, [text]);
  const uebernehmen = () => {
    const t = eingabe.trim();
    if (t === '') {
      if (leerErlaubt) {
        setFehler('');
        if (wert !== undefined) onChange(undefined);
      } else setFehler('Bitte eine Leistungsphase von 0 bis 9 eintragen.');
      return;
    }
    if (!/^\d$/.test(t)) return setFehler(`„${t}“: Leistungsphase 0 bis 9 (ganze Zahl).`);
    setFehler('');
    if (Number(t) !== wert) onChange(Number(t));
  };
  return (
    <>
      <input
        id={id}
        className={`num${fehler ? ' feld-fehler' : ''}`}
        inputMode="numeric"
        value={eingabe}
        aria-label={label}
        aria-invalid={fehler ? true : undefined}
        aria-describedby={fehler ? meldungId : undefined}
        onChange={(e) => setEingabe(e.target.value)}
        onBlur={uebernehmen}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
          if (e.key === 'Escape') {
            e.stopPropagation();
            setEingabe(text);
            setFehler('');
          }
        }}
      />
      {fehler && !meldung && (
        <span className="feld-meldung" role="alert" id={meldungId}>
          {fehler}
        </span>
      )}
    </>
  );
}

function KuerzelListe({
  titel,
  text,
  liste,
  fremde,
  mitLph = false,
  onChange,
}: {
  titel: string;
  text: string;
  liste: Kuerzel[];
  /** Kürzel und Schreibweisen der anderen Liste – auch dort darf es keine Doppelten geben */
  fremde: string[];
  mitLph?: boolean;
  onChange: (l: Kuerzel[]) => void;
}) {
  // ein neues Kürzel wird erst gespeichert, wenn es gültig eingetragen ist (vorher gilt es in keiner App)
  const [neu, setNeu] = useState(false);
  const zeile = (i: number, patch: Partial<Kuerzel>) => onChange(liste.map((k, j) => (j === i ? { ...k, ...patch } : k)));
  const belegtOhne = (i: number) => [...fremde, ...alleKuerzel(liste.filter((_, j) => j !== i))];
  const entfernen = async (i: number) => {
    const k = liste[i];
    if (
      await bestaetigen(
        `${k.kuerzel} entfernen?`,
        `Das Kürzel ${k.kuerzel}${k.name ? ` (${k.name})` : ''} gilt danach in keiner App mehr – Projektdateien behalten ihre Kopie, bis sie ergänzt werden.`,
        'Entfernen',
      )
    )
      onChange(liste.filter((_, j) => j !== i));
  };
  return (
    <div className="po-kuerzel">
      <h3>{titel}</h3>
      <p className="muted small-text">{text}</p>
      <table className="po-kuerzel-tabelle">
        <colgroup>
          <col className="po-kuerzel-spalte" />
          <col />
          <col className={mitLph ? 'po-kuerzel-lph' : 'po-kuerzel-zusatz'} />
          <col className="po-kuerzel-weg" />
        </colgroup>
        <thead>
          <tr>
            <th>Kürzel</th>
            <th>Bedeutung</th>
            <th>{mitLph ? 'LPH' : 'Schreibweisen'}</th>
            <th>
              <span className="po-unsichtbar">Entfernen</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {liste.map((k, i) => (
            // fester Schlüssel je Zeile: beim Umbenennen eines Kürzels bleibt die Zeile (und der Fokus beim Tab)
            <KuerzelZeile key={i} titel={titel} k={k} andere={belegtOhne(i)} mitLph={mitLph} onChange={(patch) => zeile(i, patch)} onEntfernen={() => void entfernen(i)} />
          ))}
          {neu && (
            <KuerzelZeile
              titel={titel}
              k={{ kuerzel: '', name: '' }}
              andere={belegtOhne(-1)}
              mitLph={mitLph}
              neu
              onChange={(k) => {
                onChange([...liste, { kuerzel: k.kuerzel!, name: k.name ?? '', ...(k.lph !== undefined ? { lph: k.lph } : {}), ...(k.synonyme?.length ? { synonyme: k.synonyme } : {}) }]);
                setNeu(false);
              }}
              onEntfernen={() => setNeu(false)}
            />
          )}
        </tbody>
      </table>
      <button className="small" disabled={neu} title={neu ? 'Erst das neue Kürzel eintragen' : undefined} onClick={() => setNeu(true)}>
        + Kürzel
      </button>
    </div>
  );
}

/**
 * Eine Zeile: Eingaben werden beim Verlassen übernommen. Ein ungültiges oder schon vergebenes Kürzel (bzw. eine solche
 * Schreibweise) wird nicht gespeichert – das Feld zeigt wieder den gespeicherten Stand, die Meldung nennt den Grund.
 * Ändert sich das Schema von außen (Vorgabe wiederhergestellt), folgen die Felder. Eine neue Zeile (`neu`) wird
 * gespeichert, wenn man sie mit einem gültigen Kürzel verlässt (oder Enter drückt); Esc oder × verwirft sie.
 */
function KuerzelZeile({
  titel,
  k,
  andere,
  mitLph,
  neu = false,
  onChange,
  onEntfernen,
}: {
  titel: string;
  k: Kuerzel;
  /** schon vergebene Kürzel und Schreibweisen (alle anderen Einträge beider Listen) */
  andere: string[];
  mitLph: boolean;
  neu?: boolean;
  onChange: (p: Partial<Kuerzel>) => void;
  onEntfernen: () => void;
}) {
  const meldungId = useId();
  const synonymText = (k.synonyme ?? []).join(', ');
  const [kuerzel, setKuerzel] = useState(k.kuerzel);
  const [name, setName] = useState(k.name);
  const [synonyme, setSynonyme] = useState(synonymText);
  // LPH der neuen Zeile: auch als Ref, weil die Zeile beim Verlassen im selben Ereignis gespeichert wird
  const [lph, setLphZustand] = useState<number | undefined>(k.lph);
  const lphRef = useRef<number | undefined>(k.lph);
  const setLph = (n: number | undefined) => {
    lphRef.current = n;
    setLphZustand(n);
  };
  const [fehler, setFehler] = useState('');
  useEffect(() => {
    // anderer Eintrag in dieser Zeile (umbenannt, entfernt, zurückgesetzt): Feld und Meldung folgen
    setKuerzel(k.kuerzel);
    setFehler('');
  }, [k.kuerzel]);
  useEffect(() => setName(k.name), [k.name]);
  useEffect(() => setSynonyme(synonymText), [synonymText]);

  const grundGegen = (wert: string) => (!KUERZEL_MUSTER.test(wert) ? 'nur Großbuchstaben und Ziffern, höchstens 8 Zeichen' : andere.includes(wert) ? 'gibt es schon' : '');
  /** ungültige Schreibweisen mit Grund (die eigene Abkürzung zählt als vergeben) */
  const falscheSchreibweisen = (liste: string[], eigenes: string) => liste.map((x) => ({ x, grund: x === eigenes ? 'ist das Kürzel selbst' : grundGegen(x) })).filter((f) => f.grund);
  const kuerzelUebernehmen = () => {
    const getippt = kuerzel.trim();
    const wert = getippt.toUpperCase();
    if (neu && !wert) return setKuerzel('');
    if (wert === k.kuerzel) return setKuerzel(wert);
    const grund = grundGegen(wert) || (schreibweisenAus(synonyme, '').includes(wert) ? 'steht schon bei den Schreibweisen' : '');
    if (grund) {
      setKuerzel(k.kuerzel);
      return setFehler(neu ? `„${getippt}“: ${grund} – noch nicht gespeichert.` : `„${getippt}“: ${grund} – es bleibt ${k.kuerzel}.`);
    }
    setFehler('');
    if (neu) setKuerzel(wert);
    else onChange({ kuerzel: wert });
  };
  /** neue Zeile verlassen: mit gültigem Kürzel (und gültigen Schreibweisen) speichern */
  const neuSpeichern = (e: FocusEvent<HTMLTableRowElement>) => {
    if (!neu || e.currentTarget.contains(e.relatedTarget as Node | null)) return;
    const wert = kuerzel.trim().toUpperCase();
    if (!wert || grundGegen(wert)) return;
    const liste = schreibweisenAus(synonyme, wert);
    if (falscheSchreibweisen(liste, wert).length) return;
    onChange({ kuerzel: wert, name: name.trim(), lph: lphRef.current, synonyme: liste });
  };
  const schreibweisenUebernehmen = () => {
    const eigenes = neu ? kuerzel.trim().toUpperCase() : k.kuerzel;
    const liste = schreibweisenAus(synonyme, eigenes);
    const falsch = falscheSchreibweisen(liste, eigenes);
    if (falsch.length) {
      if (!neu) setSynonyme(synonymText);
      return setFehler(`${falsch.map((f) => `„${f.x}“: ${f.grund}`).join('; ')} – ${neu ? 'noch nicht gespeichert' : `es bleibt ${synonymText ? `„${synonymText}“` : 'keine Schreibweise'}`}.`);
    }
    setFehler('');
    setSynonyme(liste.join(', '));
    if (!neu && liste.join(', ') !== synonymText) onChange({ synonyme: liste });
  };
  const bezeichnung = neu ? 'neues Kürzel' : k.kuerzel;

  return (
    <>
      <tr
        className={neu ? 'po-kuerzel-neu' : undefined}
        onBlur={neuSpeichern}
        onKeyDown={(e) => {
          if (!neu || e.key !== 'Escape') return;
          e.stopPropagation();
          onEntfernen();
        }}
      >
        <td>
          <input
            value={kuerzel}
            autoFocus={neu}
            placeholder={neu ? (mitLph ? 'z. B. VP' : 'z. B. ABBR') : undefined}
            aria-label={`${titel}: Kürzel ${bezeichnung}`}
            aria-describedby={fehler ? meldungId : undefined}
            onChange={(e) => {
              setKuerzel(e.target.value);
              setFehler('');
            }}
            onBlur={kuerzelUebernehmen}
            onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
          />
        </td>
        <td>
          <input
            value={name}
            aria-label={`${titel}: Bedeutung von ${bezeichnung}`}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => !neu && name.trim() !== k.name && onChange({ name: name.trim() })}
          />
        </td>
        <td>
          {mitLph ? (
            <LphFeld
              wert={neu ? lph : k.lph}
              leerErlaubt
              label={`${titel}: Leistungsphase von ${bezeichnung}`}
              meldung={{ id: meldungId, setzen: setFehler }}
              onChange={(n) => (neu ? setLph(n) : onChange({ lph: n }))}
            />
          ) : (
            <input
              value={synonyme}
              aria-label={`${titel}: Schreibweisen von ${bezeichnung}`}
              aria-describedby={fehler ? meldungId : undefined}
              // in der neuen Zeile bleibt eine ungültige Eingabe zum Korrigieren stehen – dann als fehlerhaft markiert
              aria-invalid={neu && !!fehler ? true : undefined}
              className={neu && fehler ? 'feld-fehler' : undefined}
              onChange={(e) => {
                setSynonyme(e.target.value);
                setFehler('');
              }}
              onBlur={schreibweisenUebernehmen}
            />
          )}
        </td>
        <td>
          <button className="icon" title={neu ? 'Verwerfen (Esc)' : 'Entfernen (mit Rückfrage)'} aria-label={neu ? 'Neues Kürzel verwerfen' : `${k.kuerzel} entfernen`} onClick={onEntfernen}>
            ×
          </button>
        </td>
      </tr>
      {(fehler || neu) && (
        <tr>
          <td colSpan={4}>
            {fehler ? (
              <span className="feld-meldung" role="alert" id={meldungId}>
                {fehler}
              </span>
            ) : (
              <span className="muted small-text">Neues Kürzel – gespeichert, sobald die Zeile mit einem gültigen Kürzel verlassen wird; Esc verwirft es.</span>
            )}
          </td>
        </tr>
      )}
    </>
  );
}
