import type { KeyboardEvent } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { FAKT_GRUPPEN, faktName, ortsgebunden, zaehlEinheit } from '@core/baurecht/typen';
import { aktuelleLage } from '../pruefung';
import type { FaktDef, FaktWert } from '@core/baurecht/typen';
import { werten } from '@core/baurecht/kurz';
import { MERKMAL_ERKLAERUNG, VORGABE_MERKMALE } from '@core/bedingung';
import { MERKMAL_TITEL } from '@core/baurecht/fakten';
import { NumberField, TextField } from '@core/ui/fields';
import type { Pruefstand } from '../pruefung';
import { heute, offeneBestaetigungen, useBaurecht } from '../store';
import { benutzer } from '../benutzer';
import { faktBestaetigenOeffnen, faktSetzenOeffnen } from './Dialoge';
import { Klaeren } from './Kopf';
import { inBereichZeigen, nb } from './Ampel';

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
export const lagebezug = (def: FaktDef, wert: FaktWert | undefined) => ortsgebunden(def, wert);

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
/** Unterzeile eines Merkmals: die Erklärung ohne den Namen davor („Gebäudeklasse (§ 2 …)“ → „(§ 2 …)“) */
const merkmalUnterzeile = (name: string, text?: string) => (!text || text === name ? '' : text.startsWith(name) ? text.slice(name.length).trim() : text);
/** Merkmale, die zur Suche passen (Name, Erklärung, Werte) */
const merkmalPasst = (m: { name: string; werte: string[] }, suche: string) => !suche || `${MERKMAL_TITEL[m.name] ?? m.name} ${MERKMAL_ERKLAERUNG[m.name]?.text ?? ''} ${m.werte.join(' ')}`.toLowerCase().includes(suche.toLowerCase());

function Merkmale({ klaerung, suche = '' }: { klaerung: Map<string, number>; suche?: string }) {
  const merkmale = useBaurecht((s) => s.merkmale);
  const geaendert = useBaurecht((s) => s.merkmaleDatei);
  const fokus = useBaurecht((s) => s.fokus);
  const ref = useRef<HTMLElement>(null);
  const fehlen = VORGABE_MERKMALE.filter((m) => !merkmale[m.name]).length;
  // beantwortete Merkmale lassen sich einklappen; fehlt eines, ist die Gruppe offen
  const [aufGewaehlt, setAuf] = useState(fehlen > 0);
  // bei der Suche immer aufgeklappt, nur die passenden Merkmale
  const auf = aufGewaehlt || !!suche;
  const sichtbar = VORGABE_MERKMALE.filter((m) => merkmalPasst(m, suche));
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
      inBereichZeigen(el.closest<HTMLElement>('.br-angaben-liste'), el, 'mitte');
      el.querySelector<HTMLElement>('button')?.focus();
    }
    useBaurecht.getState().fokusSetzen(null);
  }, [fokus]);
  return (
    <section ref={ref} className="br-angaben-gruppe" aria-labelledby="br-merkmale">
      <h3 id="br-merkmale">
        <button type="button" className="br-gruppe-knopf" aria-expanded={auf} onClick={() => setAuf(!auf)}>
          <span aria-hidden="true">{auf ? '▾' : '▸'}</span> Antragsmerkmale <span className="br-gruppe-stand">{fehlen ? `${fehlen} offen` : 'alle festgelegt'}</span>
        </button>
      </h3>
      {auf && <p className="br-leise">Gemeinsam mit der App Formulare – gilt für den ganzen Antrag.</p>}
      {auf && sichtbar.map((m) => {
        const e = MERKMAL_ERKLAERUNG[m.name];
        const wert = merkmale[m.name] ?? '';
        const n = klaerung.get(`merkmal:${m.name}`);
        return (
          <div key={m.name} data-merkmal={m.name} className={`br-merkmal${wert ? '' : ' br-offen'}`} role="group" aria-label={MERKMAL_TITEL[m.name] ?? m.name}>
            <div className="br-fakt-kopf">
              {/* derselbe kurze Name wie im Regelbaum und im Protokoll; die Erklärung darunter */}
              <span className="br-fakt-titel">
                {MERKMAL_TITEL[m.name] ?? m.name}
                {merkmalUnterzeile(MERKMAL_TITEL[m.name] ?? m.name, e?.text) && <span className="br-fakt-frage">{nb(merkmalUnterzeile(MERKMAL_TITEL[m.name] ?? m.name, e?.text))}</span>}
              </span>
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
                {e?.werte?.[wert] && <span className="br-leise br-erklaerung">{nb(e.werte[wert])}</span>}
                <button type="button" className="small br-link" aria-label={`${MERKMAL_TITEL[m.name] ?? m.name} leeren`} onClick={() => useBaurecht.getState().merkmalSetzen(m.name, '')} title="Merkmal für den ganzen Antrag leeren (auch in Formulare)">
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

/** id der Unterzeile (Frage bzw. Rest des Titels) als Beschreibung der Eingabe – nur, wenn es sie gibt */
const beschreibung = (def: FaktDef, id: string) => (def.frage || (def.kurz && def.titel !== def.kurz) ? `br-frage-${id}` : undefined);

function FaktEingabe({ id, def, wert, onWert }: { id: string; def: FaktDef; wert: FaktWert | undefined; onWert: (v: FaktWert['wert'] | undefined) => void }) {
  const v = wert?.wert ?? null;
  // eine Angabe von Hand, die nur noch Hinweis ist (z. B. zu einer früheren Lage): derselbe Wert lässt sich erneut setzen
  const neuBinden = wert?.herkunft === 'manuell' && wert.sicherheit === 'hinweis' && !wert.bestaetigt;
  if (def.typ === 'janein')
    return (
      <div className="br-segment" role="group" aria-label={faktName(def, id)} aria-describedby={beschreibung(def, id)} title={def.kurz ? def.titel : undefined} onKeyDown={segmentTaste}>
        {[
          [true, 'ja'],
          [false, 'nein'],
        ].map(([w, t], i) => (
          <button key={String(w)} type="button" tabIndex={tabStopp(v === w, i === 0, v === null)} aria-pressed={v === w} className={v === w ? 'active' : ''} onClick={() => (v !== w || neuBinden) && onWert(w as boolean)}>
            {t as string}
          </button>
        ))}
      </div>
    );
  if (def.typ === 'zahl')
    return (
      <span className="br-zahl">
        {/* Anzahlen ganzzahlig übernehmen (angezeigt und gespeichert gleich – „5,5 Stellplätze“ gibt es nicht) */}
        <NumberField value={typeof v === 'number' ? v : undefined} allowEmpty onChange={(n) => onWert(n === undefined || !zaehlEinheit(def.einheit) ? n : Math.round(n))} label={faktName(def, id)} digits={zaehlEinheit(def.einheit) ? 0 : 2} />
        {def.einheit && <span className="br-leise">{def.einheit}</span>}
      </span>
    );
  if (def.typ === 'wahl')
    return (
      <select aria-label={faktName(def, id)} aria-describedby={beschreibung(def, id)} title={def.kurz ? def.titel : undefined} value={v === null ? '' : String(v)} onChange={(e) => onWert(e.target.value || undefined)}>
        <option value="">– nicht festgelegt –</option>
        {(def.werte ?? []).map((w) => (
          <option key={w} value={w}>
            {w}
          </option>
        ))}
      </select>
    );
  return <TextField value={v === null ? '' : String(v)} onChange={(t) => onWert(t.trim() || undefined)} label={faktName(def, id)} placeholder={id === 'lage.ags' ? '8 Ziffern' : undefined} />;
}

function FaktZeile({ id, def, wert, klaert, eigen }: { id: string; def: FaktDef; wert: FaktWert | undefined; klaert: number; eigen: boolean }) {
  const fokus = useBaurecht((s) => s.fokus);
  const entwurf = useBaurecht((s) => offeneBestaetigungen(s).includes(id));
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (fokus === id && ref.current) {
      inBereichZeigen(ref.current.closest<HTMLElement>('.br-angaben-liste'), ref.current, 'mitte');
      ref.current.querySelector<HTMLElement>('button, input, select')?.focus();
      useBaurecht.getState().fokusSetzen(null);
    }
  }, [fokus, id]);
  const unsicher = wert?.sicherheit === 'hinweis' && !wert.bestaetigt;
  // feste Werte des Moduls sind nicht änderbar; Werte nach Tabelle (z. B. Landschaftsplan nach Gemeinde) mit Beleg schon
  const fest = wert?.herkunft === 'modul' && def.wert !== undefined;
  const name = faktName(def, id);
  // Lagebezug: bestätigen lässt sich nur ein Ergebnis der aktuellen Lage (sonst bliebe die Bestätigung wirkungslos)
  const project = useBaurecht((s) => s.project);
  const lage = aktuelleLage(project).lage;
  const andereLage = !!wert && lagebezug(def, wert) && (!lage || (!!wert.lage && wert.lage !== lage));
  // nach Zurücknehmen/Zurücksetzen verschwindet der Knopf – Fokus auf das erste Bedienelement der Angabe
  const fokusZurZeile = () => setTimeout(() => ref.current?.querySelector<HTMLElement>('button:not([disabled]), input, select')?.focus(), 0);
  const hilfeLang = (def.hilfe?.length ?? 0) > 90;
  // Unterzeile: die Frage, sonst der ausführliche Titel – aber nicht, wenn er nur den kurzen Namen wiederholt
  const rest = def.kurz && def.titel.startsWith(def.kurz) ? def.titel.slice(def.kurz.length).trim() : '';
  const unterzeile = def.frage ?? (def.kurz ? (def.titel.startsWith(def.kurz) ? rest || undefined : def.titel) : undefined);
  return (
    <div ref={ref} data-fakt={id} className={`br-fakt${wert?.wert == null ? ' br-offen' : ''}${fokus === id ? ' br-fokus' : ''}`}>
      <div className="br-fakt-kopf">
        {/* überall derselbe kurze Titel (Chips, Protokoll); die Frage als Unterzeile */}
        <span className="br-fakt-titel" title={def.kurz ? def.titel : def.hilfe}>
          {nb(faktName(def, id))}
          {unterzeile && (
            <span className="br-fakt-frage" id={`br-frage-${id}`}>
              {nb(unterzeile)}
            </span>
          )}
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
            if (v !== undefined && mitBeleg(def, wert)) faktSetzenOeffnen(id, faktName(def, id), v, lagebezug(def, wert));
            // Angaben zur Lage an die aktuelle Lage binden (ohne gültige Koordinaten: null → nur Hinweis)
            else useBaurecht.getState().faktSetzen(id, v, benutzer(), undefined, lagebezug(def, wert) ? aktuelleLage(useBaurecht.getState().project).lage : undefined);
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
              {andereLage ? (
                <span className="br-leise-stark" title={wert.grund}>
                  {!lage ? 'ohne gültige Koordinaten nicht bestätigbar' : wert.herkunft === 'manuell' ? 'Angabe zu einer früheren Lage – erneut angeben oder zurücksetzen' : 'Ergebnis einer früheren Lage – „Lage abfragen“'}
                </span>
              ) : (
                <button type="button" className="small" aria-label={`${name} bestätigen …`} title={`${wert.grund ?? ''} – als gesichert übernehmen (mit Begründung)`} onClick={() => faktBestaetigenOeffnen(id, name, wert, lagebezug(def, wert))}>
                  Bestätigen …
                </button>
              )}
            </>
          )}
          {wert.bestaetigt && (
            <>
              <span className="br-leise-stark" title={wert.bestaetigt.grund}>
                {wert.herkunft === 'manuell' ? 'mit Beleg' : 'bestätigt'} ({wert.bestaetigt.von})
              </span>
              {entwurf && <span className="br-marke br-marke-entwurf">Entwurf</span>}
              {eigen && (
                <button
                  type="button"
                  className="small br-link"
                  aria-label={`${name}: Bestätigung zurücknehmen`}
                  onClick={() => {
                    useBaurecht.getState().bestaetigungZuruecknehmen(id);
                    fokusZurZeile();
                  }}
                  title="Bestätigung bzw. Angabe mit Beleg zurücknehmen – es gilt wieder der Hinweis"
                >
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
            <button
              type="button"
              className="small br-link"
              aria-label={`${name}: Angabe von Hand zurücksetzen`}
              onClick={() => {
                useBaurecht.getState().faktSetzen(id, undefined, '');
                fokusZurZeile();
              }}
              title="Angabe von Hand entfernen"
            >
              zurücksetzen
            </button>
          )}
        </div>
      )}
      {def.hilfe &&
        (hilfeLang || wert?.wert != null ? (
          <details className="br-erklaerung">
            <summary>
              Erläuterung<span className="br-unsichtbar"> zu {name}</span>
            </summary>
            <div className="br-leise">{nb(def.hilfe ?? '')}</div>
          </details>
        ) : (
          <div className="br-leise br-erklaerung">{nb(def.hilfe ?? '')}</div>
        ))}
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
  const projektKennung = useBaurecht((s) => (s.quelle ? (s.quelle.art === 'datei' ? s.quelle.name : s.quelle.datei) : ''));
  // „offene zuerst, klärt am meisten“ – die Reihenfolge wird beim Öffnen, beim Wechsel von Projekt, Antrag oder
  // Modulsatz, beim Filtern und Suchen gebildet und bleibt dann stehen: eine beantwortete Angabe springt nicht weg
  const vergleich = (a: string, b: string) => {
    const offenA = auswertung.fakten[a]?.wert == null ? 1 : 0;
    const offenB = auswertung.fakten[b]?.wert == null ? 1 : 0;
    return offenB - offenA || (klaerung.get(b) ?? 0) - (klaerung.get(a) ?? 0) || auswertung.faktDefs[a].titel.localeCompare(auswertung.faktDefs[b].titel, 'de');
  };
  const schluessel = `${projektKennung}|${antrag}|${alle}|${suche}|${stand.module.map((m) => m.id).join(',')}`;
  // Schnappschuss der Reihenfolge je Schlüssel – abgeleiteter Zustand (React: „Informationen aus vorigen Renderläufen
  // speichern“), nicht bei jeder Antwort neu
  const rangBilden = () => new Map(Object.keys(auswertung.faktDefs).sort(vergleich).map((id, i) => [id, i]));
  const [ordnung, setOrdnung] = useState(() => ({ schluessel, rang: rangBilden() }));
  if (ordnung.schluessel !== schluessel) setOrdnung({ schluessel, rang: rangBilden() });
  const rang = ordnung.schluessel === schluessel ? ordnung.rang : rangBilden();
  const gruppen = FAKT_GRUPPEN.map((g) => {
    const ids = Object.entries(auswertung.faktDefs)
      .filter(([id, d]) => d.gruppe === g.id && id !== 'antrag.einreichung' && (alle || relevant.has(id)))
      .filter(([, d]) => !d.wenn || werten(d.wenn, ctx).w !== 'nein')
      .filter(([id, d]) => !suche || `${d.kurz ?? ''} ${d.titel} ${d.frage ?? ''} ${id}`.toLowerCase().includes(suche.toLowerCase()))
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
        {(!suche || VORGABE_MERKMALE.some((m) => merkmalPasst(m, suche))) && <Merkmale klaerung={klaerung} suche={suche} />}
        {suche && !gruppen.length && !VORGABE_MERKMALE.some((m) => merkmalPasst(m, suche)) && (
          <div className="br-leer-zustand" role="status">
            <p>Keine Angabe zu „{suche}“{alle ? '' : ' unter den Angaben, an denen eine Regel hängt'}.</p>
            <button type="button" onClick={() => setSuche('')}>
              Suche leeren
            </button>
            {!alle && (
              <button type="button" onClick={() => setAlle(true)}>
                In allen Angaben suchen
              </button>
            )}
          </div>
        )}
        {gruppen.map((g) => (
          <section key={g.id} className="br-angaben-gruppe" aria-labelledby={`br-g-${g.id}`}>
            <h3 id={`br-g-${g.id}`}>{g.titel}</h3>
            {g.ids.map((id) => (
              <FaktZeile key={id} id={id} def={auswertung.faktDefs[id]} wert={auswertung.fakten[id]} klaert={klaerung.get(id) ?? 0} eigen={!!eigene[id]} />
            ))}
          </section>
        ))}
      </div>
    </aside>
  );
}
