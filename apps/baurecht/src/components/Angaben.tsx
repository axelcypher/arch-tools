import { useEffect, useMemo, useRef, useState } from 'react';
import { FAKT_GRUPPEN } from '@core/baurecht/typen';
import type { FaktDef, FaktWert } from '@core/baurecht/typen';
import { werten } from '@core/baurecht/kurz';
import { MERKMAL_ERKLAERUNG, VORGABE_MERKMALE } from '@core/bedingung';
import { NumberField, TextField } from '@core/ui/fields';
import type { Pruefstand } from '../pruefung';
import { useBaurecht } from '../store';
import { benutzer } from '../benutzer';

const HERKUNFT: Record<FaktWert['herkunft'], string> = {
  stammdaten: 'Stammdaten',
  merkmal: 'Merkmal',
  flaechen: 'Flächenrechner',
  grz: 'GRZ-Nachweis',
  geodienst: 'Geodienst',
  modul: 'Regelmodul',
  abgeleitet: 'abgeleitet',
  manuell: 'von Hand',
};

/** Antragsmerkmale (gemeinsam mit Formulare) als Segmentknöpfe mit Erklärung */
function Merkmale({ klaerung }: { klaerung: Map<string, number> }) {
  const merkmale = useBaurecht((s) => s.merkmale);
  const geaendert = useBaurecht((s) => s.merkmaleDatei);
  const fokus = useBaurecht((s) => s.fokus);
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!fokus?.startsWith('merkmal:') || !ref.current) return;
    const el = ref.current.querySelector<HTMLElement>(`[data-merkmal="${CSS.escape(fokus.slice(8))}"]`);
    if (el) {
      el.scrollIntoView({ block: 'center', behavior: 'smooth' });
      el.querySelector<HTMLElement>('button')?.focus();
    }
    useBaurecht.getState().fokusSetzen(null);
  }, [fokus]);
  return (
    <section ref={ref} className="br-angaben-gruppe" aria-labelledby="br-merkmale">
      <h2 id="br-merkmale">Antragsmerkmale</h2>
      <p className="br-leise">Gemeinsam mit der App Formulare – gilt für den ganzen Antrag.</p>
      {VORGABE_MERKMALE.map((m) => {
        const e = MERKMAL_ERKLAERUNG[m.name];
        const wert = merkmale[m.name] ?? '';
        const n = klaerung.get(`merkmal:${m.name}`);
        return (
          <div key={m.name} data-merkmal={m.name} className={`br-merkmal${wert ? '' : ' br-offen'}`} role="group" aria-label={e?.text ?? m.name}>
            <div className="br-fakt-kopf">
              <span className="br-fakt-titel">{e?.text ?? m.name}</span>
              {!wert && n ? <span className="br-klaert" title={`klärt ${n} Paragrafen`}>klärt {n}</span> : null}
              {(geaendert[m.name] ?? '') !== wert && <span className="br-marke" title="noch nicht gespeichert">geändert</span>}
            </div>
            <div className="br-segment">
              {m.werte.map((w) => (
                <button key={w} type="button" className={wert === w ? 'active' : ''} aria-pressed={wert === w} title={e?.werte?.[w] ? `${w}: ${e.werte[w]}` : w} onClick={() => useBaurecht.getState().merkmalSetzen(m.name, wert === w ? '' : w)}>
                  {w}
                </button>
              ))}
            </div>
            {wert && e?.werte?.[wert] && <div className="br-leise br-erklaerung">{e.werte[wert]}</div>}
          </div>
        );
      })}
    </section>
  );
}

function FaktEingabe({ id, def, wert, onWert }: { id: string; def: FaktDef; wert: FaktWert | undefined; onWert: (v: FaktWert['wert'] | undefined) => void }) {
  const v = wert?.wert ?? null;
  if (def.typ === 'janein')
    return (
      <div className="br-segment" role="radiogroup" aria-label={def.titel}>
        {[
          [true, 'ja'],
          [false, 'nein'],
        ].map(([w, t]) => (
          <button key={String(w)} type="button" role="radio" aria-checked={v === w} className={v === w ? 'active' : ''} onClick={() => onWert(v === w ? undefined : (w as boolean))}>
            {t as string}
          </button>
        ))}
      </div>
    );
  if (def.typ === 'zahl')
    return (
      <span className="br-zahl">
        <NumberField value={typeof v === 'number' ? v : undefined} allowEmpty onChange={(n) => onWert(n)} label={def.titel} digits={2} />
        {def.einheit && <span className="br-leise">{def.einheit}</span>}
      </span>
    );
  if (def.typ === 'wahl')
    return (
      <select aria-label={def.titel} value={v === null ? '' : String(v)} onChange={(e) => onWert(e.target.value || undefined)}>
        <option value="">– nicht festgelegt –</option>
        {(def.werte ?? []).map((w) => (
          <option key={w} value={w}>
            {w}
          </option>
        ))}
      </select>
    );
  return <TextField value={v === null ? '' : String(v)} onChange={(t) => onWert(t.trim() || undefined)} label={def.titel} placeholder={id === 'lage.ags' ? '8 Ziffern' : undefined} />;
}

function FaktZeile({ id, def, wert, klaert, eigen }: { id: string; def: FaktDef; wert: FaktWert | undefined; klaert: number; eigen: boolean }) {
  const fokus = useBaurecht((s) => s.fokus);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (fokus === id && ref.current) {
      ref.current.scrollIntoView({ block: 'center', behavior: 'smooth' });
      ref.current.querySelector<HTMLElement>('button, input, select')?.focus();
      useBaurecht.getState().fokusSetzen(null);
    }
  }, [fokus, id]);
  const unsicher = wert?.sicherheit === 'hinweis' && !wert.bestaetigt;
  const fest = wert?.herkunft === 'modul';
  return (
    <div ref={ref} className={`br-fakt${wert?.wert == null ? ' br-offen' : ''}${fokus === id ? ' br-fokus' : ''}`}>
      <div className="br-fakt-kopf">
        <span className="br-fakt-titel" title={def.hilfe}>
          {def.frage ?? def.titel}
        </span>
        {wert?.wert == null && klaert > 0 && <span className="br-klaert" title={`klärt ${klaert} Paragrafen`}>klärt {klaert}</span>}
      </div>
      {fest ? (
        <div className="br-fester-wert">
          {typeof wert?.wert === 'boolean' ? (wert.wert ? 'ja' : 'nein') : String(wert?.wert)} <span className="br-leise">– {wert?.quelle}</span>
        </div>
      ) : (
        <FaktEingabe id={id} def={def} wert={wert} onWert={(v) => useBaurecht.getState().faktSetzen(id, v, benutzer())} />
      )}
      {wert && wert.wert != null && !fest && (
        <div className="br-fakt-fuss">
          <span className={`br-herkunft br-herkunft-${wert.herkunft}`}>{HERKUNFT[wert.herkunft]}</span>
          {wert.quelle && wert.herkunft !== 'manuell' && <span className="br-leise">{wert.quelle}</span>}
          {unsicher && (
            <>
              <span className="br-hinweis-marke" title={wert.grund}>
                nur Hinweis
              </span>
              <button type="button" className="small" title={`${wert.grund ?? ''} – als gesichert übernehmen`} onClick={() => useBaurecht.getState().faktBestaetigen(id, wert, benutzer())}>
                Bestätigen
              </button>
            </>
          )}
          {wert.bestaetigt && <span className="br-leise">bestätigt {wert.bestaetigt.von}</span>}
          {eigen && wert.herkunft === 'manuell' && (
            <button type="button" className="small br-link" onClick={() => useBaurecht.getState().faktSetzen(id, undefined, '')} title="Angabe von Hand entfernen">
              zurücksetzen
            </button>
          )}
        </div>
      )}
      {def.hilfe && wert?.wert == null && <div className="br-leise br-erklaerung">{def.hilfe}</div>}
    </div>
  );
}

/** Angaben zum Projekt: Merkmale und Fakten, offene zuerst, sortiert nach „klärt am meisten“ */
export function Angaben({ stand }: { stand: Pruefstand }) {
  const eigene = useBaurecht((s) => s.pruefung.fakten);
  const [alle, setAlle] = useState(false);
  const [suche, setSuche] = useState('');
  const { auswertung } = stand;
  const klaerung = useMemo(() => new Map(auswertung.klaerung.map((k) => [k.id, k.anzahl])), [auswertung.klaerung]);
  const relevant = useMemo(() => {
    const s = new Set<string>(['lage.ags']);
    for (const p of auswertung.paragrafen) for (const v of [...p.verwendet, ...p.offen]) if (!v.startsWith('merkmal:') && !v.startsWith('paragraf:')) s.add(v);
    return s;
  }, [auswertung.paragrafen]);
  const ctx = { merkmale: useBaurecht.getState().merkmale, fakten: auswertung.fakten, einreichung: stand.einreichung, heute: stand.einreichung, bausteine: auswertung.text.bausteine };
  const gruppen = FAKT_GRUPPEN.map((g) => {
    const ids = Object.entries(auswertung.faktDefs)
      .filter(([id, d]) => d.gruppe === g.id && id !== 'antrag.einreichung' && (alle || relevant.has(id)))
      .filter(([, d]) => !d.wenn || werten(d.wenn, ctx).w !== 'nein')
      .filter(([id, d]) => !suche || `${d.titel} ${d.frage ?? ''} ${id}`.toLowerCase().includes(suche.toLowerCase()))
      .sort(([a], [b]) => {
        const offenA = auswertung.fakten[a]?.wert == null ? 1 : 0;
        const offenB = auswertung.fakten[b]?.wert == null ? 1 : 0;
        return offenB - offenA || (klaerung.get(b) ?? 0) - (klaerung.get(a) ?? 0) || auswertung.faktDefs[a].titel.localeCompare(auswertung.faktDefs[b].titel, 'de');
      })
      .map(([id]) => id);
    return { ...g, ids };
  }).filter((g) => g.ids.length);
  return (
    <aside className="br-angaben" aria-label="Angaben zum Projekt">
      <div className="br-leiste-kopf">
        <h2>Angaben</h2>
        <label className="toggle" title="auch Angaben zeigen, an denen gerade keine Regel hängt">
          <input type="checkbox" checked={alle} onChange={(e) => setAlle(e.target.checked)} /> alle
        </label>
      </div>
      <div className="br-suche">
        <input type="search" placeholder="Angabe suchen …" value={suche} onChange={(e) => setSuche(e.target.value)} aria-label="Angaben durchsuchen" />
      </div>
      <div className="br-angaben-liste">
        {stand.widersprueche.map((w) => (
          <div key={w} className="br-meldung br-meldung-warn" role="status">
            {w}
          </div>
        ))}
        {!suche && <Merkmale klaerung={klaerung} />}
        {gruppen.map((g) => (
          <section key={g.id} className="br-angaben-gruppe" aria-labelledby={`br-g-${g.id}`}>
            <h2 id={`br-g-${g.id}`}>{g.titel}</h2>
            {g.ids.map((id) => (
              <FaktZeile key={id} id={id} def={auswertung.faktDefs[id]} wert={auswertung.fakten[id]} klaert={klaerung.get(id) ?? 0} eigen={!!eigene[id]} />
            ))}
          </section>
        ))}
      </div>
    </aside>
  );
}
