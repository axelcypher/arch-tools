import type { KeyboardEvent } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { FAKT_GRUPPEN } from '@core/baurecht/typen';
import type { FaktDef, FaktWert } from '@core/baurecht/typen';
import { werten } from '@core/baurecht/kurz';
import { MERKMAL_ERKLAERUNG, VORGABE_MERKMALE } from '@core/bedingung';
import { NumberField, TextField } from '@core/ui/fields';
import type { Pruefstand } from '../pruefung';
import { heute, offeneBestaetigungen, useBaurecht } from '../store';
import { benutzer } from '../benutzer';
import { faktBestaetigenOeffnen, faktSetzenOeffnen } from './Dialoge';
import { Klaeren } from './Kopf';

/**
 * Segmentgruppe mit einem Tabstopp: ←/→ (bzw. ↑/↓) bewegt den Fokus, Leertaste/Eingabe wählt. Tabstopp ist der
 * gewählte Wert, sonst der erste.
 */
export function segmentTaste(e: KeyboardEvent<HTMLElement>) {
  if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(e.key)) return;
  const knoepfe = [...e.currentTarget.querySelectorAll<HTMLButtonElement>(':scope > button')];
  const i = knoepfe.indexOf(document.activeElement as HTMLButtonElement);
  if (i < 0) return;
  e.preventDefault();
  const ziel = e.key === 'Home' ? 0 : e.key === 'End' ? knoepfe.length - 1 : (i + (e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 1) + knoepfe.length) % knoepfe.length;
  knoepfe[ziel].focus();
}
const tabStopp = (gewaehlt: boolean, erster: boolean, keinerGewaehlt: boolean) => (gewaehlt || (keinerGewaehlt && erster) ? 0 : -1);

/** Angaben, die an der Lage hängen (Schutzgebiete jedes Moduls, Werte aus Geodiensten): an die Lage gebunden */
export const lagebezug = (def: FaktDef, wert: FaktWert | undefined) => def.gruppe === 'schutz' || !!def.geodienst || wert?.herkunft === 'geodienst';

/** Angaben, die von Hand nur mit Begründung gesetzt werden: Schutzgebiete und Werte aus Geodiensten (ja/nein, Auswahl) */
export const mitBeleg = (def: FaktDef, wert: FaktWert | undefined) => (def.typ === 'janein' || def.typ === 'wahl') && (def.gruppe === 'schutz' || !!def.geodienst || wert?.herkunft === 'geodienst' || wert?.herkunft === 'modul');

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
  const fehlen = VORGABE_MERKMALE.filter((m) => !merkmale[m.name]).length;
  // beantwortete Merkmale lassen sich einklappen; fehlt eines, ist die Gruppe offen
  const [auf, setAuf] = useState(fehlen > 0);
  useEffect(() => {
    if (fehlen > 0) setAuf(true);
  }, [fehlen]);
  useEffect(() => {
    if (fokus?.startsWith('merkmal:')) setAuf(true);
  }, [fokus]);
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
      <h2 id="br-merkmale">
        <button type="button" className="br-gruppe-knopf" aria-expanded={auf} onClick={() => setAuf(!auf)}>
          <span aria-hidden="true">{auf ? '▾' : '▸'}</span> Antragsmerkmale <span className="br-gruppe-stand">{fehlen ? `${fehlen} offen` : 'alle festgelegt'}</span>
        </button>
      </h2>
      {auf && <p className="br-leise">Gemeinsam mit der App Formulare – gilt für den ganzen Antrag.</p>}
      {auf && VORGABE_MERKMALE.map((m) => {
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
            <div className={`br-segment${m.werte.length >= 3 && m.werte.some((w) => w.length > 14) ? ' br-segment-senkrecht' : ''}`} onKeyDown={segmentTaste}>
              {m.werte.map((w, i) => (
                <button key={w} type="button" tabIndex={tabStopp(wert === w, i === 0, !wert)} className={wert === w ? 'active' : ''} aria-pressed={wert === w} title={e?.werte?.[w] ? `${w}: ${e.werte[w]}` : w} onClick={() => wert !== w && useBaurecht.getState().merkmalSetzen(m.name, w)}>
                  {w}
                </button>
              ))}
            </div>
            {wert && (
              <div className="br-merkmal-fuss">
                {e?.werte?.[wert] && <span className="br-leise br-erklaerung">{e.werte[wert]}</span>}
                <button type="button" className="small br-link" onClick={() => useBaurecht.getState().merkmalSetzen(m.name, '')} title="Merkmal für den ganzen Antrag leeren (auch in Formulare)">
                  leeren
                </button>
              </div>
            )}
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
      <div className="br-segment" role="group" aria-label={def.titel} onKeyDown={segmentTaste}>
        {[
          [true, 'ja'],
          [false, 'nein'],
        ].map(([w, t], i) => (
          <button key={String(w)} type="button" tabIndex={tabStopp(v === w, i === 0, v === null)} aria-pressed={v === w} className={v === w ? 'active' : ''} onClick={() => v !== w && onWert(w as boolean)}>
            {t as string}
          </button>
        ))}
      </div>
    );
  if (def.typ === 'zahl')
    return (
      <span className="br-zahl">
        <NumberField value={typeof v === 'number' ? v : undefined} allowEmpty onChange={(n) => onWert(n)} label={def.titel} digits={def.einheit ? 2 : 0} />
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
  const entwurf = useBaurecht((s) => offeneBestaetigungen(s).includes(id));
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (fokus === id && ref.current) {
      ref.current.scrollIntoView({ block: 'center', behavior: 'smooth' });
      ref.current.querySelector<HTMLElement>('button, input, select')?.focus();
      useBaurecht.getState().fokusSetzen(null);
    }
  }, [fokus, id]);
  const unsicher = wert?.sicherheit === 'hinweis' && !wert.bestaetigt;
  // feste Werte des Moduls sind nicht änderbar; Werte nach Tabelle (z. B. Landschaftsplan nach Gemeinde) mit Beleg schon
  const fest = wert?.herkunft === 'modul' && def.wert !== undefined;
  return (
    <div ref={ref} className={`br-fakt${wert?.wert == null ? ' br-offen' : ''}${fokus === id ? ' br-fokus' : ''}`}>
      <div className="br-fakt-kopf">
        {/* überall derselbe kurze Titel (Chips, Protokoll); die Frage als Unterzeile */}
        <span className="br-fakt-titel" title={def.hilfe}>
          {def.titel}
          {def.frage && <span className="br-fakt-frage">{def.frage}</span>}
        </span>
        {wert?.wert == null && klaert > 0 && <span className="br-klaert" title={`klärt ${klaert} Paragrafen`}>klärt {klaert}</span>}
      </div>
      {fest ? (
        <div className="br-fester-wert">
          {typeof wert?.wert === 'boolean' ? (wert.wert ? 'ja' : 'nein') : String(wert?.wert)} <span className="br-leise">– {wert?.quelle}</span>
          {wert?.sicherheit === 'hinweis' && (
            <span className="br-hinweis-marke" title={wert.grund}>
              {' '}
              nur Hinweis
            </span>
          )}
        </div>
      ) : (
        <FaktEingabe
          id={id}
          def={def}
          wert={wert}
          onWert={(v) => {
            // Schutzgebiete und Geodaten (ja/nein, Auswahl) von Hand nur mit Beleg
            if (v !== undefined && mitBeleg(def, wert)) faktSetzenOeffnen(id, def.titel, v, lagebezug(def, wert));
            else useBaurecht.getState().faktSetzen(id, v, benutzer());
          }}
        />
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
              <button type="button" className="small" title={`${wert.grund ?? ''} – als gesichert übernehmen (mit Begründung)`} onClick={() => faktBestaetigenOeffnen(id, def.titel, wert, lagebezug(def, wert))}>
                Bestätigen …
              </button>
            </>
          )}
          {wert.bestaetigt && (
            <>
              <span className="br-leise-stark" title={wert.bestaetigt.grund}>
                {wert.herkunft === 'manuell' ? 'mit Beleg' : 'bestätigt'} ({wert.bestaetigt.von})
              </span>
              {entwurf && <span className="br-marke br-marke-entwurf">Entwurf</span>}
              {eigen && (
                <button type="button" className="small br-link" onClick={() => useBaurecht.getState().bestaetigungZuruecknehmen(id)} title="Bestätigung bzw. Angabe mit Beleg zurücknehmen – es gilt wieder der Hinweis">
                  zurücknehmen
                </button>
              )}
            </>
          )}
          {wert.widerspruch && (
            <span className="br-hinweis-marke br-widerspruch" title={wert.widerspruch}>
              Widerspruch
            </span>
          )}
          {eigen && wert.herkunft === 'manuell' && !wert.bestaetigt && (
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
  const merkmale = useBaurecht((s) => s.merkmale);
  const ctx = { merkmale, fakten: auswertung.fakten, einreichung: stand.einreichung, heute: heute(), bausteine: auswertung.text.bausteine };
  const antrag = useBaurecht((s) => s.antrag);
  // „offene zuerst, klärt am meisten“ – die Reihenfolge wird beim Öffnen, Filtern und Suchen gebildet und bleibt dann
  // stehen: eine beantwortete Angabe springt nicht weg (und keine andere rückt unter den Mauszeiger)
  const ordnung = useRef<{ schluessel: string; rang: Map<string, number> } | null>(null);
  const vergleich = (a: string, b: string) => {
    const offenA = auswertung.fakten[a]?.wert == null ? 1 : 0;
    const offenB = auswertung.fakten[b]?.wert == null ? 1 : 0;
    return offenB - offenA || (klaerung.get(b) ?? 0) - (klaerung.get(a) ?? 0) || auswertung.faktDefs[a].titel.localeCompare(auswertung.faktDefs[b].titel, 'de');
  };
  const schluessel = `${antrag}|${alle}|${suche}`;
  if (!ordnung.current || ordnung.current.schluessel !== schluessel) {
    const alleIds = Object.keys(auswertung.faktDefs).sort(vergleich);
    ordnung.current = { schluessel, rang: new Map(alleIds.map((id, i) => [id, i])) };
  }
  const rang = ordnung.current.rang;
  const gruppen = FAKT_GRUPPEN.map((g) => {
    const ids = Object.entries(auswertung.faktDefs)
      .filter(([id, d]) => d.gruppe === g.id && id !== 'antrag.einreichung' && (alle || relevant.has(id)))
      .filter(([, d]) => !d.wenn || werten(d.wenn, ctx).w !== 'nein')
      .filter(([id, d]) => !suche || `${d.titel} ${d.frage ?? ''} ${id}`.toLowerCase().includes(suche.toLowerCase()))
      .map(([id]) => id)
      .sort((a, b) => (rang.get(a) ?? Infinity) - (rang.get(b) ?? Infinity) || vergleich(a, b));
    return { ...g, ids };
  }).filter((g) => g.ids.length);
  return (
    <aside className="br-angaben" aria-label="Angaben zum Projekt">
      <div className="br-leiste-kopf">
        <h2>Angaben</h2>
        <label className="toggle" title="auch Angaben zeigen, an denen gerade keine Regel hängt">
          <input type="checkbox" checked={alle} onChange={(e) => setAlle(e.target.checked)} /> alle Angaben
        </label>
      </div>
      <div className="br-suche">
        <input type="search" placeholder="Angabe suchen …" value={suche} onChange={(e) => setSuche(e.target.value)} aria-label="Angaben durchsuchen" />
      </div>
      <div className="br-angaben-liste">
        {!suche && <Klaeren stand={stand} />}
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
