import type { Bedingung, BedingungGruppe, BedingungKontext, BedingungTeil, FeldPruefung, Merkmal, Teilbedingung, Verknuepfung } from '../bedingung';
import { auswerten, bedingungText, blaetter, gruppe, hatBedingung } from '../bedingung';
import type { Feld } from '../forma/felder';
import { Symbol } from './Symbol';

export interface FeldWahl {
  feld: Feld;
  titel: string;
  /** Abschnitt bzw. Seite – zum Gruppieren in der Auswahl */
  ort: string;
}

interface Props {
  wert: Bedingung | undefined;
  onChange: (b: Bedingung | undefined) => void;
  merkmale: Merkmal[];
  /** Felder des Formulars (ohne: nur Projektmerkmale, z. B. für Dokumente des Projektumfangs) */
  felder?: FeldWahl[];
  /** Feldschlüssel, die nicht wählbar sind (das Feld selbst) */
  ohne?: string[];
  /** zum Anzeigen, ob die Bedingung gerade zutrifft */
  kontext?: BedingungKontext;
  /** ein Feld durch Klick ins Formular wählen; ruft `fertig` mit dem Schlüssel */
  imFormularWaehlen?: (fertig: (schluessel: string) => void) => void;
}

/** wie viele Ebenen Gruppen tief sein können (Wurzel = 0) */
const MAX_TIEFE = 4;

type Pfad = number[];

function anPfad(g: BedingungGruppe, pfad: Pfad, f: (t: BedingungTeil) => BedingungTeil | null): BedingungGruppe {
  const [i, ...rest] = pfad;
  const teile = g.teile.flatMap((t, n) => {
    if (n !== i) return [t];
    const neu = rest.length ? (t.art === 'gruppe' ? anPfad(t, rest, f) : t) : f(t);
    return neu ? [neu] : [];
  });
  return { ...g, teile };
}

/**
 * Bedingung zusammenstellen: eine Gruppe, deren Teile alle (und) oder mindestens einer (oder) zutreffen müssen. Teile
 * sind Prüfungen – Projektmerkmal hat einen der Werte (oder keinen), Feld ist ausgefüllt/angekreuzt, leer, hat einen
 * Wert oder nicht – oder wieder Gruppen. Felder lassen sich auch durch Klick ins Formular wählen. Darunter steht die
 * Bedingung in Worten und ob sie gerade zutrifft.
 */
export function BedingungEditor({ wert, onChange, merkmale, felder, ohne, kontext, imFormularWaehlen }: Props) {
  const wahl = (felder ?? []).filter((f) => !ohne?.includes(f.feld.schluessel));
  const nachSchluessel = new Map((felder ?? []).map((f) => [f.feld.schluessel, f]));
  const name = (s: string) => (nachSchluessel.has(s) ? { titel: nachSchluessel.get(s)!.titel, kreuz: nachSchluessel.get(s)!.feld.art === 'kreuz' } : undefined);

  const neueRegel = (): Teilbedingung | null =>
    merkmale[0] ? { art: 'merkmal', merkmal: merkmale[0].name, werte: [] } : wahl[0] ? { art: 'feld', feld: wahl[0].feld.schluessel, pruefung: 'ausgefuellt' } : null;
  const feldRegel = (schluessel: string): Teilbedingung => ({ art: 'feld', feld: schluessel, pruefung: 'ausgefuellt' });

  const setzen = (g: BedingungGruppe) => onChange(blaetter(g).length ? g : undefined);
  const wurzel = wert ?? gruppe('und');

  const anfangen = (t: Teilbedingung | null) => t && setzen(gruppe('und', [t]));
  const ausFormular = (fertig: (s: string) => void) => imFormularWaehlen?.(fertig);

  if (!hatBedingung(wert)) {
    return (
      <div className="bd" role="group" aria-label="Bedingung">
        <p className="bd-immer">
          <Symbol name="haken" /> Immer erforderlich
        </p>
        <div className="bd-knoepfe">
          {merkmale.length > 0 && (
            <button className="small" onClick={() => anfangen({ art: 'merkmal', merkmal: merkmale[0].name, werte: [] })}>
              <Symbol name="plus" /> Nur bei Projektmerkmal …
            </button>
          )}
          {felder && wahl.length > 0 && (
            <button className="small" onClick={() => anfangen(feldRegel(wahl[0].feld.schluessel))}>
              <Symbol name="plus" /> Nur wenn Feld …
            </button>
          )}
          {felder && imFormularWaehlen && (
            <button className="small" title="Im Formular auf das Feld klicken, von dem es abhängt" onClick={() => ausFormular((s) => anfangen(feldRegel(s)))}>
              <Symbol name="ziel" /> Feld im Formular wählen
            </button>
          )}
        </div>
      </div>
    );
  }

  const jetzt = kontext ? auswerten(wurzel, kontext) : undefined;
  return (
    <div className="bd" role="group" aria-label="Bedingung">
      <GruppeEditor
        g={wurzel}
        tiefe={0}
        onChange={setzen}
        merkmale={merkmale}
        wahl={wahl}
        felder={felder}
        neueRegel={neueRegel}
        feldRegel={feldRegel}
        ausFormular={imFormularWaehlen ? ausFormular : undefined}
      />
      <div className="bd-fuss">
        <p className="bd-satz">
          <span className="muted">Erforderlich, wenn </span>
          {bedingungText(wurzel, name)}
        </p>
        {jetzt !== undefined && (
          <span className={`bd-jetzt${jetzt === 'ja' ? ' an' : ''}`}>
            {jetzt === 'ja' ? 'trifft gerade zu' : jetzt === 'offen' ? 'offen – Projektmerkmal nicht festgelegt (gilt als erforderlich)' : 'trifft gerade nicht zu'}
          </span>
        )}
        <button className="small bd-weg" onClick={() => onChange(undefined)}>
          Bedingung entfernen
        </button>
      </div>
    </div>
  );
}

interface GruppeProps {
  g: BedingungGruppe;
  tiefe: number;
  onChange: (g: BedingungGruppe) => void;
  onEntfernen?: () => void;
  merkmale: Merkmal[];
  wahl: FeldWahl[];
  felder?: FeldWahl[];
  neueRegel: () => Teilbedingung | null;
  feldRegel: (s: string) => Teilbedingung;
  ausFormular?: (fertig: (s: string) => void) => void;
}

function GruppeEditor({ g, tiefe, onChange, onEntfernen, merkmale, wahl, felder, neueRegel, feldRegel, ausFormular }: GruppeProps) {
  const aendern = (pfad: Pfad, f: (t: BedingungTeil) => BedingungTeil | null) => onChange(anPfad(g, pfad, f));
  const anhaengen = (t: BedingungTeil | null) => t && onChange({ ...g, teile: [...g.teile, t] });
  const wort = g.op === 'oder' ? 'oder' : 'und';
  const gegenteil: Verknuepfung = g.op === 'oder' ? 'und' : 'oder';

  return (
    <div className={`bd-gruppe tiefe-${tiefe} ${g.op}`} role="group" aria-label={tiefe ? 'Gruppe' : 'Bedingungen'}>
      {(g.teile.length > 1 || tiefe > 0) && (
        <div className="bd-gruppe-kopf">
          <div className="bd-op" role="radiogroup" aria-label="Verknüpfung">
            <button role="radio" aria-checked={g.op === 'und'} className={g.op === 'und' ? 'an' : ''} onClick={() => onChange({ ...g, op: 'und' })}>
              Alle
            </button>
            <button role="radio" aria-checked={g.op === 'oder'} className={g.op === 'oder' ? 'an' : ''} onClick={() => onChange({ ...g, op: 'oder' })}>
              Mindestens eine
            </button>
          </div>
          <span className="muted small-text">{tiefe ? 'treffen zu' : 'der folgenden treffen zu'}</span>
          {onEntfernen && (
            <button className="icon bd-gruppe-weg" aria-label="Gruppe entfernen" title="Gruppe entfernen" onClick={onEntfernen}>
              <Symbol name="schliessen" />
            </button>
          )}
        </div>
      )}
      <div className="bd-teile">
        {!g.teile.length && <p className="muted small-text bd-leer">Noch leer – Bedingungen hinzufügen.</p>}
        {g.teile.map((t, i) => (
          <div key={i} className="bd-reihe">
            <span className="bd-wort">{i === 0 ? (tiefe ? '' : 'wenn') : wort}</span>
            {t.art === 'gruppe' ? (
              <GruppeEditor
                g={t}
                tiefe={tiefe + 1}
                onChange={(neu) => aendern([i], () => neu)}
                onEntfernen={() => aendern([i], () => null)}
                merkmale={merkmale}
                wahl={wahl}
                felder={felder}
                neueRegel={neueRegel}
                feldRegel={feldRegel}
                ausFormular={ausFormular}
              />
            ) : (
              <RegelZeile t={t} onChange={(neu) => aendern([i], () => neu)} onEntfernen={() => aendern([i], () => null)} merkmale={merkmale} wahl={wahl} felder={felder} ausFormular={ausFormular} />
            )}
          </div>
        ))}
      </div>
      <div className="bd-knoepfe">
        <button className="small" onClick={() => anhaengen(neueRegel())} disabled={!merkmale.length && !wahl.length}>
          <Symbol name="plus" /> Bedingung
        </button>
        {ausFormular && (
          <button className="small" title="Im Formular auf das Feld klicken" onClick={() => ausFormular((s) => anhaengen(feldRegel(s)))}>
            <Symbol name="ziel" /> Feld im Formular wählen
          </button>
        )}
        {tiefe < MAX_TIEFE && (
          <button className="small" title={`Gruppe, in der ${gegenteil === 'oder' ? 'mindestens eine' : 'alle'} Bedingungen zutreffen müssen`} onClick={() => anhaengen(gruppe(gegenteil))}>
            <Symbol name="gruppe" /> {gegenteil === 'oder' ? 'Oder-Gruppe' : 'Und-Gruppe'}
          </button>
        )}
      </div>
    </div>
  );
}

function RegelZeile({
  t,
  onChange,
  onEntfernen,
  merkmale,
  wahl,
  felder,
  ausFormular,
}: {
  t: Teilbedingung;
  onChange: (t: Teilbedingung) => void;
  onEntfernen: () => void;
  merkmale: Merkmal[];
  wahl: FeldWahl[];
  felder?: FeldWahl[];
  ausFormular?: (fertig: (s: string) => void) => void;
}) {
  const feld = t.art === 'feld' ? (felder ?? []).find((f) => f.feld.schluessel === t.feld) : undefined;
  const kreuz = feld?.feld.art === 'kreuz';
  const orte = [...new Set(wahl.map((f) => f.ort))];
  const wert = t.art === 'merkmal' ? `m:${t.merkmal}` : `f:${t.feld}`;
  const wechseln = (v: string) => {
    if (v.startsWith('m:')) onChange({ art: 'merkmal', merkmal: v.slice(2), werte: [] });
    else onChange({ art: 'feld', feld: v.slice(2), pruefung: 'ausgefuellt' });
  };
  const werte = merkmale.find((m) => m.name === (t.art === 'merkmal' ? t.merkmal : ''))?.werte ?? (t.art === 'merkmal' ? t.werte : []);
  return (
    <div className="bd-regel">
      <div className="bd-regel-kopf">
        <select className="bd-wofuer" value={wert} aria-label="Wovon es abhängt" onChange={(e) => wechseln(e.target.value)}>
          {t.art === 'merkmal' && !merkmale.some((m) => m.name === t.merkmal) && <option value={wert}>{t.merkmal || '–'}</option>}
          {t.art === 'feld' && !feld && <option value={wert}>{t.feld || '–'}</option>}
          {merkmale.length > 0 && (
            <optgroup label="Projektmerkmale">
              {merkmale.map((m) => (
                <option key={m.name} value={`m:${m.name}`}>
                  {m.name}
                </option>
              ))}
            </optgroup>
          )}
          {orte.map((o) => (
            <optgroup key={o} label={o}>
              {wahl
                .filter((f) => f.ort === o)
                .map((f) => (
                  <option key={f.feld.schluessel} value={`f:${f.feld.schluessel}`}>
                    {f.feld.art === 'kreuz' ? '☐ ' : ''}
                    {f.titel}
                  </option>
                ))}
            </optgroup>
          ))}
        </select>
        {t.art === 'feld' && ausFormular && (
          <button className="icon" aria-label="Feld im Formular wählen" title="Feld im Formular wählen" onClick={() => ausFormular((s) => onChange({ ...t, feld: s }))}>
            <Symbol name="ziel" />
          </button>
        )}
        {t.art === 'merkmal' ? (
          <select value={t.nicht ? 'nicht' : 'ist'} aria-label="Vergleich" onChange={(e) => onChange({ ...t, ...(e.target.value === 'nicht' ? { nicht: true } : { nicht: undefined }) })}>
            <option value="ist">ist</option>
            <option value="nicht">ist nicht</option>
          </select>
        ) : (
          <select
            value={t.pruefung}
            aria-label="Prüfung"
            onChange={(e) => {
              const p = e.target.value as FeldPruefung;
              onChange({ art: 'feld', feld: t.feld, pruefung: p, ...(p === 'gleich' || p === 'ungleich' ? { wert: t.wert ?? '' } : {}) });
            }}
          >
            <option value="ausgefuellt">{kreuz ? 'ist angekreuzt' : 'ist ausgefüllt'}</option>
            <option value="leer">{kreuz ? 'ist nicht angekreuzt' : 'ist leer'}</option>
            {!kreuz && <option value="gleich">ist gleich</option>}
            {!kreuz && <option value="ungleich">ist ungleich</option>}
          </select>
        )}
        <button className="icon bd-regel-weg" aria-label="Bedingung entfernen" title="Entfernen" onClick={onEntfernen}>
          <Symbol name="schliessen" />
        </button>
      </div>
      {t.art === 'merkmal' && (
        <span className="bd-werte">
          {werte.map((w) => (
            <label key={w} className={`bd-wert${t.werte.includes(w) ? ' an' : ''}`}>
              <input
                type="checkbox"
                checked={t.werte.includes(w)}
                aria-label={`${t.merkmal} ${w}`}
                onChange={(e) => onChange({ ...t, werte: e.target.checked ? [...t.werte, w] : t.werte.filter((x) => x !== w) })}
              />
              {w}
            </label>
          ))}
        </span>
      )}
      {t.art === 'feld' && (t.pruefung === 'gleich' || t.pruefung === 'ungleich') && (
        <input className="bd-text" value={t.wert ?? ''} placeholder="Wert" aria-label="Wert" onChange={(e) => onChange({ ...t, wert: e.target.value })} />
      )}
    </div>
  );
}
