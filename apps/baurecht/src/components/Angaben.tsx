import type { KeyboardEvent } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { FAKT_GRUPPEN, faktName, ortsgebunden, wertAnzeige, zaehlEinheit } from '@core/baurecht/typen';
import { aktuelleLage, OHNE_LAGEBEZUG, usePlanungsrechtWirkung } from '../pruefung';
import { textPasst } from '../suche';
import { ortVon } from '@core/baurecht/ort';
import type { FaktDef, FaktWert } from '@core/baurecht/typen';
import { frageGestellt, RUECKFRAGE_IDS, RUECKFRAGEN } from '@core/baurecht/fragen';
import { MERKMAL_ERKLAERUNG, VORGABE_MERKMALE } from '@core/bedingung';
import { MERKMAL_TITEL } from '@core/baurecht/fakten';
import { NumberField, TextField } from '@core/ui/fields';
import type { Pruefstand } from '../pruefung';
import { heute, offeneBestaetigungen, PLANUNGSRECHT, useBaurecht } from '../store';
import { benutzer } from '../benutzer';
import { faktBestaetigenOeffnen, faktSetzenOeffnen } from './Dialoge';
import { Klaeren } from './Kopf';
import { datum, inBereichZeigen, nb } from './Ampel';

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
/**
 * Unterzeile eines Merkmals: die Erklärung ohne den Namen davor („Gebäudeklasse (§ 2 …)“ → „(§ 2 …)“) – nur an einer
 * Wortgrenze („Planungsrechtliche Lage …“ bleibt ganz, sonst stünde „liche Lage“ da)
 */
export const merkmalUnterzeile = (name: string, text?: string) => {
  if (!text || text === name) return '';
  const rest = text.startsWith(name) ? text.slice(name.length) : null;
  return ohneKlammer(rest !== null && /^[\s(:–,-]/.test(rest) ? rest.replace(/^[\s:–,-]+/, '').trim() : text);
};

/** eine Unterzeile, die nur aus einer Klammer besteht („(§ 2 Abs. 3 BauO NRW)“), ohne die Klammer */
export const ohneKlammer = (s: string) => {
  const m = /^\((.*)\)$/.exec(s.trim());
  return m && !/[()]/.test(m[1]) ? m[1] : s;
};
/** Merkmale, die zur Suche passen (Name, Erklärung, Werte) */
const merkmalPasst = (m: { name: string; werte: string[] }, suche: string) => textPasst(`${MERKMAL_TITEL[m.name] ?? m.name} ${MERKMAL_ERKLAERUNG[m.name]?.text ?? ''} ${m.werte.join(' ')}`, suche);

// Rückfragen zu einem Antragsmerkmal (Kern: fragen.ts) stehen direkt unter dem Merkmal, nicht tief in ihrer Gruppe

/** offen ist eine Rückfrage ohne Wert oder mit einem Wert, der nur Hinweis ist (z. B. aus einer älteren Angabe) */
export const rueckfrageOffen = (w: FaktWert | undefined) => w?.wert == null || (w.sicherheit === 'hinweis' && !w.bestaetigt);

/** eine Rückfrage wird gestellt, wenn es die Angabe gibt und ihre Bedingung sicher zutrifft (dasselbe Kriterium wie der Kern) */
function rueckfrageSichtbar(id: string, stand: Pruefstand, merkmale: Record<string, string>): boolean {
  const d = stand.auswertung.faktDefs[id];
  if (!d) return false;
  return frageGestellt(id, d, { merkmale, fakten: stand.auswertung.fakten, einreichung: stand.einreichung, heute: heute(), bausteine: stand.auswertung.text.bausteine });
}

/**
 * Planungsrecht für diesen Ort bestätigen – danach Fokus auf das Merkmal (der Knopf verschwindet; eingeklappt klappt die
 * Gruppe auf) und eine Ansage. `ersatz`: das Merkmal ist wegen einer Suche nicht zu sehen – die Suche bleibt, der Fokus
 * geht dorthin (Suchfeld), kein Sprungziel, das die Suche leeren und die Ansage überschreiben würde.
 */
function planungsrechtGiltHier(klaert: number, ersatz?: () => void) {
  const st = useBaurecht.getState();
  st.planungsrechtBestaetigen();
  // die Wirkung ansagen – die Zahl steht schon vorher da („klärt N“); bestätigt wird beim Speichern noch einmal
  st.ansagen(`Planungsrecht für diesen Ort bestätigt${klaert ? ` – ${klaert === 1 ? 'eine Vorschrift entfällt' : `${klaert} Vorschriften entfallen`} jetzt` : ''}; beim Speichern noch einmal bestätigen`);
  if (ersatz) setTimeout(ersatz, 0);
  else st.fokusSetzen('merkmal:Planungsrecht');
}

function Merkmale({ klaerung, suche = '', planungsrechtOffen, planungsrechtKlaert = 0, stand }: { klaerung: Map<string, number>; suche?: string; planungsrechtOffen?: string; planungsrechtKlaert?: number; stand: Pruefstand }) {
  const eigene = useBaurecht((s) => s.pruefung.fakten);
  const merkmale = useBaurecht((s) => s.merkmale);
  const geaendert = useBaurecht((s) => s.merkmaleDatei);
  const planungsrechtEntwurf = useBaurecht((s) => offeneBestaetigungen(s).includes(PLANUNGSRECHT));
  const planungsrechtOrt = useBaurecht((s) => s.pruefung.planungsrechtOrt);
  const fokus = useBaurecht((s) => s.fokus);
  const ref = useRef<HTMLElement>(null);
  // ein Wert außerhalb der Werteliste (eigener Wert aus Formulare) zählt als offen – die Auswertung wertet ihn nicht
  const fehlen = VORGABE_MERKMALE.filter((m) => !m.werte.includes(merkmale[m.name] ?? '')).length;
  // beantwortete Merkmale lassen sich einklappen; fehlt eines, ist die Gruppe offen (Zustand im Store: die Gruppe wird
  // bei einer Suche, die sie ausblendet, neu eingehängt)
  const aufGemerkt = useBaurecht((s) => s.merkmaleAuf);
  const aufGewaehlt = aufGemerkt ?? fehlen > 0;
  const setAuf = (a: boolean) => useBaurecht.setState({ merkmaleAuf: a });
  // bei der Suche immer aufgeklappt, nur die passenden Merkmale
  const auf = aufGewaehlt || !!suche;
  const sichtbar = VORGABE_MERKMALE.filter((m) => merkmalPasst(m, suche));
  useEffect(() => {
    if (fehlen > 0) setAuf(true);
  }, [fehlen]);
  useEffect(() => {
    if (fokus?.startsWith('merkmal:')) setAuf(true);
    // Fokus auf eine Rückfrage (z. B. „bestätigen klärt“), die eingeklappt keine eigene Zeile hat: aufklappen
    const rid = fokus?.replace(/:bestaetigen$/, '');
    if (rid && RUECKFRAGE_IDS.has(rid) && !ref.current?.querySelector(`[data-fakt="${CSS.escape(rid)}"]`)) setAuf(true);
  }, [fokus]);
  // Fokus erst setzen, wenn die Gruppe offen ist (sonst gibt es das Merkmal noch nicht – der Fokus fiele auf die Seite)
  useEffect(() => {
    if (!fokus?.startsWith('merkmal:') || !ref.current || !auf) return;
    // „merkmal:<Name>:bestaetigen“ (z. B. „Zum Bestätigen“ in den Einzelheiten): direkt auf „Für diesen Ort bestätigen“
    const [name, ziel] = fokus.slice(8).split(':');
    const el = ref.current.querySelector<HTMLElement>(`[data-merkmal="${CSS.escape(name)}"]`);
    // noch nicht zu sehen (eine Suche blendet es aus – Angaben leert sie gleich): Ziel behalten, nach der Suche erneut
    if (!el) return;
    inBereichZeigen(el.closest<HTMLElement>('.br-angaben-liste'), el, 'mitte');
    // auf den gewählten Wert (nicht den ersten Knopf – ein weiteres Enter änderte sonst das Merkmal)
    const knopf = ziel === 'bestaetigen' ? el.querySelector<HTMLElement>('button[data-bestaetigen]') : null;
    (knopf ?? el.querySelector<HTMLElement>('button[aria-pressed="true"]') ?? el.querySelector<HTMLElement>('button'))?.focus();
    useBaurecht.getState().fokusSetzen(null);
  }, [fokus, auf, suche]);
  // offene Rückfragen (z. B. Umfang der Beseitigung) zählen im Kopf mit – sonst stünde dort „alle festgelegt“
  const rueckfragenOffen = Object.values(RUECKFRAGEN)
    .flat()
    .filter((rid) => rueckfrageSichtbar(rid, stand, merkmale) && rueckfrageOffen(stand.auswertung.fakten[rid])).length;
  const standText = fehlen ? `${fehlen} offen` : rueckfragenOffen ? `${rueckfragenOffen === 1 ? 'eine Rückfrage' : `${rueckfragenOffen} Rückfragen`} offen` : 'alle festgelegt';
  const setzen = (name: string, w: string) => useBaurecht.getState().merkmalSetzen(name, w);
  // eine Rückfrage erscheint (nach einem Merkmal oder einer Antwort, z. B. „Abbruch mit Ersatzbau“ → Altbau): Ansage
  // und in den Blick – nicht still
  const sichtbareRF = Object.values(RUECKFRAGEN)
    .flat()
    .filter((rid) => rueckfrageSichtbar(rid, stand, merkmale));
  const rfSchluessel = sichtbareRF.join('|');
  const vorherRF = useRef<string[] | null>(null);
  const defsRef = useRef(stand.auswertung.faktDefs);
  defsRef.current = stand.auswertung.faktDefs;
  useEffect(() => {
    const vorher = vorherRF.current;
    vorherRF.current = rfSchluessel ? rfSchluessel.split('|') : [];
    if (!vorher) return;
    const neu = vorherRF.current.filter((r) => !vorher.includes(r));
    if (!neu.length) return;
    useBaurecht.getState().ansagen(`Rückfrage: ${neu.map((r) => faktName(defsRef.current[r], r)).join(', ')}`);
    setTimeout(() => {
      const z = ref.current?.querySelector<HTMLElement>(`[data-fakt="${CSS.escape(neu[0])}"]`);
      if (z) inBereichZeigen(z.closest<HTMLElement>('.br-angaben-liste'), z, 'naechst');
    }, 0);
  }, [rfSchluessel]);
  // eingeklappt beantwortete Rückfragen bleiben bis zum Aufklappen kompakt stehen (die Antwort bleibt zu sehen); der
  // Fokus geht auf die nächste offene Rückfrage bzw. den Gruppenknopf – nicht auf die Seite
  const offeneRF = sichtbareRF.filter((rid) => rueckfrageOffen(stand.auswertung.fakten[rid]));
  const offenSchluessel = offeneRF.join('|');
  const [erledigt, setErledigt] = useState<string[]>([]);
  const vorherOffen = useRef<string[]>(offeneRF);
  const faktenRef = useRef(stand.auswertung.fakten);
  faktenRef.current = stand.auswertung.fakten;
  useEffect(() => {
    const vorher = vorherOffen.current;
    const jetzt = offenSchluessel ? offenSchluessel.split('|') : [];
    vorherOffen.current = jetzt;
    if (auf) return setErledigt([]);
    // beantwortet heißt: noch gestellt und jetzt mit Wert (nicht: weggefallen, weil sich das Merkmal geändert hat)
    const gestellt = rfSchluessel.split('|');
    const beantwortet = vorher.filter((r) => !jetzt.includes(r) && gestellt.includes(r) && !rueckfrageOffen(faktenRef.current[r]));
    if (!beantwortet.length) return;
    setErledigt((e) => [...new Set([...e, ...beantwortet])]);
    // neue Rückfragen sagt die Ansage oben an („Rückfrage: …“); sonst hier der Stand
    const neu = jetzt.filter((r) => !vorher.includes(r));
    if (!neu.length) useBaurecht.getState().ansagen(jetzt.length ? `Noch ${jetzt.length === 1 ? 'eine Rückfrage' : `${jetzt.length} Rückfragen`} offen` : 'Rückfragen beantwortet');
    setTimeout(() => {
      const a = document.activeElement;
      if (a && a !== document.body && a.isConnected) return; // der Fokus liegt woanders – nicht wegnehmen
      const naechste = ref.current?.querySelector<HTMLElement>('.br-rueckfrage .br-fakt.br-offen .br-segment [tabindex="0"]');
      (naechste ?? ref.current?.querySelector<HTMLElement>('.br-gruppe-knopf'))?.focus();
    }, 0);
  }, [offenSchluessel, auf, rfSchluessel]);
  return (
    <section ref={ref} className="br-angaben-gruppe" aria-labelledby="br-merkmale">
      <h3 id="br-merkmale">
        {/* während der Suche fest aufgeklappt (zeigt die passenden Merkmale) – der Knopf ist dann ohne Wirkung und deshalb aus */}
        {/* aria-disabled statt disabled: die Überschrift bleibt gut lesbar (sie beschriftet die sichtbare Gruppe) */}
        <button type="button" className="br-gruppe-knopf" aria-expanded={auf} aria-disabled={suche ? true : undefined} title={suche ? 'Während der Suche aufgeklappt' : undefined} onClick={() => !suche && setAuf(!auf)}>
          <span aria-hidden="true">{suche ? '' : auf ? '▾' : '▸'}</span> Antragsmerkmale <span className="br-gruppe-stand">{standText}</span>
        </button>
      </h3>
      {auf && <p className="br-leise">Gemeinsam mit der App Formulare – gilt für den ganzen Antrag.</p>}
      {/* eingeklappt: die offenen Rückfragen; beantwortete derselben Gruppe kompakt darüber (der Anlass, z. B. „Abbruch
          mit Ersatzbau“ vor den Fragen zum Altbau – und die eben gegebene Antwort) */}
      {!auf &&
        Object.entries(RUECKFRAGEN).map(([name, ids]) => {
          const gestellt = ids.filter((rid) => rueckfrageSichtbar(rid, stand, merkmale));
          const offen = gestellt.filter((rid) => rueckfrageOffen(stand.auswertung.fakten[rid]));
          if (!offen.length && !gestellt.some((rid) => erledigt.includes(rid))) return null;
          return (
            <div key={name} className="br-rueckfrage" role="group" aria-label={`Rückfrage zu ${MERKMAL_TITEL[name] ?? name}`}>
              <p className="br-leise br-rueckfrage-zu">
                Zu {MERKMAL_TITEL[name] ?? name}: „{merkmale[name]}“
              </p>
              {gestellt.map((rid) => {
                const def = stand.auswertung.faktDefs[rid];
                const w = stand.auswertung.fakten[rid];
                // offen oder nur Hinweis (z. B. aus einer älteren Angabe – mit „Bestätigen …“): ganz, sonst kompakt
                if (rueckfrageOffen(w)) return <FaktZeile key={rid} id={rid} def={def} wert={w} klaert={klaerung.get(rid) ?? 0} eigen={!!eigene[rid]} alsKnoepfe />;
                return (
                  <p key={rid} className="br-rueckfrage-erledigt">
                    {faktName(def, rid)}: <strong>{wertAnzeige(w.wert, def)}</strong>{' '}
                    <button
                      type="button"
                      className="small br-link"
                      aria-label={`${faktName(def, rid)} ändern`}
                      onClick={() => {
                        setAuf(true);
                        useBaurecht.getState().fokusSetzen(rid);
                      }}
                    >
                      ändern
                    </button>
                  </p>
                );
              })}
            </div>
          );
        })}
      {auf && sichtbar.map((m) => {
        const e = MERKMAL_ERKLAERUNG[m.name];
        const wert = merkmale[m.name] ?? '';
        const fremd = !!wert && !m.werte.includes(wert);
        const n = klaerung.get(`merkmal:${m.name}`);
        return (
          <div key={m.name} data-merkmal={m.name} className={`br-merkmal${wert && !fremd ? '' : ' br-offen'}`} role="group" aria-label={MERKMAL_TITEL[m.name] ?? m.name}>
            <div className="br-fakt-kopf">
              {/* derselbe kurze Name wie im Regelbaum und im Protokoll; die Erklärung darunter */}
              <span className="br-fakt-titel">
                {MERKMAL_TITEL[m.name] ?? m.name}
                {merkmalUnterzeile(MERKMAL_TITEL[m.name] ?? m.name, e?.text) && <span className="br-fakt-frage">{nb(merkmalUnterzeile(MERKMAL_TITEL[m.name] ?? m.name, e?.text))}</span>}
              </span>
              {(!wert || fremd) && n ? <span className="br-klaert" title={`klärt ${n} Paragrafen`}>klärt {n}</span> : null}
              {(geaendert[m.name] ?? '') !== wert && <span className="br-marke" title="noch nicht gespeichert">geändert</span>}
            </div>
            {/* Stand der Bestätigung des Planungsrechts in einer eigenen Zeile unter dem Titel (die Frage behält die volle Breite) */}
            {m.name === 'Planungsrecht' && wert && !fremd && (planungsrechtOffen || planungsrechtEntwurf || planungsrechtOrt?.von) && (
              <div className="br-merkmal-marken">
                {/* gespeichert und für diesen Ort bestätigt: wer und wann */}
                {!planungsrechtOffen && !planungsrechtEntwurf ? (
                  <span className="br-leise">
                    für diesen Ort bestätigt ({planungsrechtOrt?.von}
                    {planungsrechtOrt?.am ? `, ${datum(planungsrechtOrt.am)}` : ''})
                  </span>
                ) : planungsrechtOffen ? (
                  <span className="br-info-marke" title={planungsrechtOffen}>
                    nicht für diesen Ort bestätigt
                  </span>
                ) : (
                  <>
                    {/* für den Ort bestätigt, aber noch nicht gespeichert: zählt schon, die zweite Bestätigung kommt beim Speichern */}
                    <span className="br-marke br-marke-entwurf" title="Bestätigung für diesen Ort – zählt schon, wird beim Speichern noch einmal abgefragt">
                      Entwurf – beim Speichern bestätigen
                    </span>
                    <button
                      type="button"
                      className="small br-link"
                      aria-label="Bestätigung des Planungsrechts für diesen Ort zurücknehmen"
                      title="Nur die Bestätigung für diesen Ort zurücknehmen – der gewählte Wert bleibt (dann „nicht für diesen Ort bestätigt“)"
                      onClick={() => {
                        useBaurecht.getState().aufDateistand([], [PLANUNGSRECHT]);
                        useBaurecht.getState().ansagen('Bestätigung des Planungsrechts zurückgenommen');
                        useBaurecht.getState().fokusSetzen('merkmal:Planungsrecht');
                      }}
                    >
                      zurücknehmen
                    </button>
                  </>
                )}
              </div>
            )}
            <div className={`br-segment${m.werte.length >= 3 && m.werte.some((w) => w.length > 14) ? ' br-segment-senkrecht' : ''}`} onKeyDown={segmentTaste}>
              {m.werte.map((w, i) => (
                <button
                  key={w}
                  type="button"
                  tabIndex={tabStopp(wert === w, i === 0, !wert || fremd)}
                  className={wert === w ? 'active' : ''}
                  aria-pressed={wert === w}
                  title={e?.werte?.[w] ? `${w}: ${e.werte[w]}` : w}
                  // derselbe Wert erneut gewählt bestätigt das Planungsrecht für diesen Ort
                  onClick={() => {
                    if (wert !== w) return setzen(m.name, w);
                    if (m.name === 'Planungsrecht' && planungsrechtOffen) planungsrechtGiltHier(planungsrechtKlaert);
                  }}
                >
                  {w}
                </button>
              ))}
            </div>
            {fremd && (
              <p className="br-merkmal-fremd" role="note">
                Wert „{wert}“ aus Formulare passt nicht zur Liste – zählt nicht; bitte einen der Werte wählen.
              </p>
            )}
            {wert && (
              <div className="br-merkmal-fuss">
                {/* „leeren“ läuft hinter der Erklärung mit – keine eigene Zeile je Merkmal */}
                <span className="br-leise br-erklaerung">
                  {e?.werte?.[wert] && <>{nb(e.werte[wert])} </>}
                  <button type="button" className="small br-link br-leeren" aria-label={`${MERKMAL_TITEL[m.name] ?? m.name} leeren`} onClick={() => useBaurecht.getState().merkmalSetzen(m.name, '')} title="Merkmal für den ganzen Antrag leeren (auch in Formulare)">
                    leeren
                  </button>
                </span>
                {m.name === 'Planungsrecht' && planungsrechtOffen && !fremd && (
                  <span className="br-bestaetigen-zeile">
                    <button type="button" className="small" data-bestaetigen onClick={() => planungsrechtGiltHier(planungsrechtKlaert)} title={planungsrechtOffen}>
                      Für diesen Ort bestätigen
                    </button>
                    {planungsrechtKlaert > 0 && (
                      <span className="br-klaert" title={`Die Bestätigung ändert ${planungsrechtKlaert} Paragrafen`}>
                        klärt {planungsrechtKlaert}
                      </span>
                    )}
                  </span>
                )}
              </div>
            )}
            {/* Rückfrage zum gewählten Wert (z. B. Umfang der Beseitigung) direkt unter der Erklärung des Werts */}
            {(RUECKFRAGEN[m.name] ?? [])
              .filter((rid) => rueckfrageSichtbar(rid, stand, merkmale))
              .map((rid) => (
                <div key={rid} className="br-rueckfrage">
                  <FaktZeile id={rid} def={stand.auswertung.faktDefs[rid]} wert={stand.auswertung.fakten[rid]} klaert={klaerung.get(rid) ?? 0} eigen={!!eigene[rid]} alsKnoepfe />
                </div>
              ))}
          </div>
        );
      })}
    </section>
  );
}

/** Zahl so, wie das Feld sie zeigt (Anzahlen ganz, sonst zwei Nachkommastellen) */
export const wieAngezeigt = (n: number, def: Pick<FaktDef, 'einheit'>): number => (zaehlEinheit(def.einheit) ? Math.round(n) : Math.round(n * 100) / 100);

/** id der Unterzeile (Frage bzw. Rest des Titels) als Beschreibung der Eingabe – nur, wenn es sie gibt */
const beschreibung = (def: FaktDef, id: string) => (def.frage || (def.kurz && def.titel !== def.kurz) ? `br-frage-${id}` : undefined);

function FaktEingabe({ id, def, wert, onWert, alsKnoepfe = false }: { id: string; def: FaktDef; wert: FaktWert | undefined; onWert: (v: FaktWert['wert'] | undefined) => void; alsKnoepfe?: boolean }) {
  const v = wert?.wert ?? null;
  // eine Angabe von Hand, die nur noch Hinweis ist (z. B. zu einer früheren Lage): derselbe Wert lässt sich erneut setzen
  // (für alle Typen zusätzlich der Knopf „für diese Lage übernehmen“ in der Fußzeile)
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
        {/* gespeichert wird, was das Feld zeigt: Anzahlen ganzzahlig („5,5 Stellplätze“ gibt es nicht), sonst auf zwei
            Stellen – „22,005 m“ stünde sonst als „22,01“ da und zählte doch anders; negative Werte gibt es nicht */}
        <NumberField value={typeof v === 'number' ? v : undefined} allowEmpty min={0} onChange={(n) => onWert(n === undefined ? n : wieAngezeigt(n, def))} label={faktName(def, id)} digits={zaehlEinheit(def.einheit) ? 0 : 2} />
        {def.einheit && <span className="br-leise">{def.einheit}</span>}
      </span>
    );
  // Rückfragen mit langen Werten als senkrechte Knöpfe – eine Auswahlliste schnitte gerade das Unterscheidende ab
  if (def.typ === 'wahl' && alsKnoepfe)
    return (
      <div className="br-segment br-segment-senkrecht" role="group" aria-label={faktName(def, id)} aria-describedby={beschreibung(def, id)} onKeyDown={segmentTaste}>
        {(def.werte ?? []).map((w, i) => (
          <button key={w} type="button" tabIndex={tabStopp(v === w, i === 0, v === null)} aria-pressed={v === w} className={v === w ? 'active' : ''} onClick={() => (v !== w || neuBinden) && onWert(w)}>
            {w}
          </button>
        ))}
      </div>
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

function FaktZeile({ id, def, wert, klaert, eigen, alsKnoepfe = false }: { id: string; def: FaktDef; wert: FaktWert | undefined; klaert: number; eigen: boolean; alsKnoepfe?: boolean }) {
  const fokus = useBaurecht((s) => s.fokus);
  const entwurf = useBaurecht((s) => offeneBestaetigungen(s).includes(id));
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // „<id>:bestaetigen“: direkt auf „Bestätigen …“ (z. B. vom Hinweis an festen Modulwerten zum Gemeindeschlüssel)
    if ((fokus === id || fokus === `${id}:bestaetigen`) && ref.current) {
      inBereichZeigen(ref.current.closest<HTMLElement>('.br-angaben-liste'), ref.current, 'mitte');
      const ziel = fokus.endsWith(':bestaetigen') ? ref.current.querySelector<HTMLElement>('button[data-bestaetigen]') : null;
      (ziel ?? ref.current.querySelector<HTMLElement>('[aria-pressed="true"], .br-segment [tabindex="0"]') ?? ref.current.querySelector<HTMLElement>('button, input, select'))?.focus();
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
  // auf den gewählten Wert bzw. den Tabstopp der Gruppe – nicht auf einen beliebigen ersten Knopf
  const fokusZurZeile = () => setTimeout(() => (ref.current?.querySelector<HTMLElement>('[aria-pressed="true"], .br-segment [tabindex="0"]') ?? ref.current?.querySelector<HTMLElement>('button:not([disabled]), input, select'))?.focus(), 0);
  const hilfeLang = (def.hilfe?.length ?? 0) > 90;
  // Unterzeile: die Frage, sonst der ausführliche Titel – aber nicht, wenn er nur den kurzen Namen wiederholt
  const rest = def.kurz && def.titel.startsWith(def.kurz) ? def.titel.slice(def.kurz.length).trim() : '';
  const unterzeile = def.frage ?? (def.kurz ? (def.titel.startsWith(def.kurz) ? (rest ? ohneKlammer(rest) : undefined) : def.titel) : undefined);
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
      {/* Wert passte nicht zur Angabe (z. B. umbenannter Auswahlwert): offen, mit Grund */}
      {wert?.wert == null && wert?.grund && <p className="br-merkmal-fremd">{wert.grund}</p>}
      {fest ? (
        <div className="br-fester-wert">
          {typeof wert?.wert === 'boolean' ? (wert.wert ? 'ja' : 'nein') : String(wert?.wert)} <span className="br-leise">– {wert?.quelle}</span>
          {wert?.sicherheit === 'hinweis' && (
            <>
              <span className="br-hinweis-marke" title={wert.grund}>
                {' '}
                nur Hinweis
              </span>
              {/* der Grund sichtbar, mit Ausweg: feste Werte eines Gebietsmoduls gelten erst mit gesichertem Gemeindeschlüssel */}
              {/Gemeindeschlüssel/.test(wert.grund ?? '') ? (
                <span className="br-fester-grund">
                  <span className="br-leise-stark">gilt erst mit bestätigtem Gemeindeschlüssel</span>{' '}
                  <button type="button" className="small br-link" aria-label={`${name}: zum Gemeindeschlüssel`} onClick={() => useBaurecht.getState().fokusSetzen('lage.ags:bestaetigen')}>
                    Zum Gemeindeschlüssel
                  </button>
                </span>
              ) : (
                wert.grund && <span className="br-leise-stark br-fester-grund">{wert.grund}</span>
              )}
            </>
          )}
        </div>
      ) : (
        <FaktEingabe
          id={id}
          def={def}
          wert={wert}
          alsKnoepfe={alsKnoepfe}
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
                <>
                  <span className="br-leise-stark" title={wert.grund}>
                    {!lage ? 'ohne gültige Koordinaten nicht bestätigbar' : wert.lage === OHNE_LAGEBEZUG ? 'Angabe ohne Lagebezug (ältere Datei)' : wert.herkunft === 'manuell' && !wert.bestaetigt ? 'Angabe zu einer früheren Lage' : 'Ergebnis einer früheren Lage – „Lage abfragen“'}
                  </span>
                  {/* Angabe von Hand zu einer früheren Lage: für die aktuelle Lage übernehmen (gleicher Wert, neu gebunden) */}
                  {lage && wert.herkunft === 'manuell' && (
                    <button
                      type="button"
                      className="small"
                      aria-label={`${name}: für diese Lage übernehmen`}
                      title="Derselbe Wert gilt auch an der aktuellen Lage – an sie binden"
                      onClick={() => {
                        if (mitBeleg(def, wert) && wert.wert != null) return faktSetzenOeffnen(id, name, wert.wert, true);
                        useBaurecht.getState().faktSetzen(id, wert.wert, benutzer(), undefined, lage);
                        // der Knopf verschwindet – Fokus auf die Angabe selbst, mit Ansage
                        useBaurecht.getState().ansagen(`${name} für diese Lage übernommen`);
                        fokusZurZeile();
                      }}
                    >
                      Für diese Lage übernehmen
                    </button>
                  )}
                </>
              ) : (
                <button type="button" className="small" data-bestaetigen="" aria-label={`${name} bestätigen …`} title={`${wert.grund ?? ''} – als gesichert übernehmen (mit Begründung)`} onClick={() => faktBestaetigenOeffnen(id, name, wert, lagebezug(def, wert))}>
                  Bestätigen …
                </button>
              )}
            </>
          )}
          {wert.bestaetigt && (
            <>
              <span className="br-leise-stark" title={wert.bestaetigt.grund}>
                {wert.herkunft === 'manuell' ? 'mit Beleg' : 'bestätigt'} ({wert.bestaetigt.von}
                {wert.bestaetigt.am ? `, ${datum(wert.bestaetigt.am)}` : ''})
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
        (alsKnoepfe && wert?.wert == null ? (
          // bei einer offenen Rückfrage sichtbar, aber auf die ersten Sätze gekürzt (ganz stünde sie in einer schmalen
          // Leiste über Bildschirmhöhe); der Rest – z. B. die Abgrenzung „angebaute Garage = vollständiger Abbruch“ –
          // hinter „mehr“
          <ErlaeuterungGekuerzt text={def.hilfe} name={name} />
        ) : hilfeLang || wert?.wert != null ? (
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

/** Abkürzungen, nach denen kein Satz endet („z. B.“, „bzw.“, „Abs.“ …) */
const ABKUERZUNG = /(?:^|[\s(])(?:bzw|usw|ca|vgl|ggf|etc|evtl|inkl|max|min|Nr|Abs|Art|Buchst|Ziff|lit|Anm|sog|[A-Za-zÄÖÜäöü])\.$/;

/** „am 3. Juni“: Ordnungszahl (kein Satzende) – nicht bei zitierten Nummern („Abs. 1.“, „Nr. 3.“, „§ 62.“) und Jahren („2024.“) */
function ordnungszahl(vorn: string): boolean {
  const m = /(\S*)\s*(\d+)\.$/.exec(vorn);
  if (!m) return false;
  return m[2].length < 3 && !/^(?:Nr|Abs|Satz|Art|Buchst|Ziff|§|§§)\.?$/.test(m[1]);
}

/** Text bis zum letzten Satzende vor `max` Zeichen (nicht nach Abkürzungen oder Ordnungszahlen), sonst bis zum letzten Wort */
export function kuerzen(t: string, max: number): string {
  if (t.length <= max) return t;
  let ende = -1;
  for (const m of t.slice(0, max + 1).matchAll(/[.!?](?=\s+[A-ZÄÖÜ„(§])/g)) {
    const vorn = t.slice(0, m.index + 1);
    if (ABKUERZUNG.test(vorn) || ordnungszahl(vorn)) continue;
    ende = m.index + 1;
  }
  if (ende >= max / 2) return t.slice(0, ende);
  return t.slice(0, max).replace(/\s+\S*$/, '');
}

/** Erläuterung einer offenen Rückfrage: sichtbar, lang aber gekürzt mit „mehr“ */
function ErlaeuterungGekuerzt({ text, name }: { text: string; name: string }) {
  const [ganz, setGanz] = useState(false);
  const kurz = kuerzen(text, 240);
  return (
    <div className="br-leise br-erklaerung">
      {nb(ganz || kurz === text ? text : `${kurz} …`)}
      {kurz !== text && (
        <>
          {' '}
          <button type="button" className="small br-link br-mehr" aria-expanded={ganz} onClick={() => setGanz(!ganz)}>
            {ganz ? 'weniger' : 'mehr'}
            <span className="br-unsichtbar"> Erläuterung zu {name}</span>
          </button>
        </>
      )}
    </div>
  );
}

/** Angaben zum Projekt: Merkmale und Fakten, offene zuerst, sortiert nach „klärt am meisten“ */
export function Angaben({ stand }: { stand: Pruefstand }) {
  const eigene = useBaurecht((s) => s.pruefung.fakten);
  const [alle, setAlle] = useState(false);
  const [suche, setSuche] = useState('');
  const suchfeld = useRef<HTMLInputElement>(null);
  // ein noch nicht erreichtes Fokusziel verfällt, wenn der Nutzer die Suche ändert (sonst spränge der Fokus später weg) –
  // nicht, wenn die Suche geleert wurde, um ein Sprungziel zu zeigen
  const fuerZiel = useRef(false);
  useEffect(() => {
    if (fuerZiel.current) {
      fuerZiel.current = false;
      return;
    }
    if (useBaurecht.getState().fokus) useBaurecht.getState().fokusSetzen(null);
  }, [suche]);
  // ein Sprungziel (Chip, Einzelheiten, Kopf) während einer Suche: Suche leeren, damit das Ziel zu sehen ist – angesagt
  const fokus = useBaurecht((s) => s.fokus);
  useEffect(() => {
    if (!fokus || !suche) return;
    // steht das Ziel auch in der Trefferliste, bleibt die Suche
    const merkmal = fokus.startsWith('merkmal:') ? fokus.slice(8).split(':')[0] : null;
    const sel = merkmal ? `[data-merkmal="${CSS.escape(merkmal)}"]` : `[data-fakt="${CSS.escape(fokus.replace(/:bestaetigen$/, ''))}"]`;
    if (document.querySelector(`.br-angaben ${sel}`)) return;
    fuerZiel.current = true;
    setSuche('');
    useBaurecht.getState().ansagen('Suche geleert, um die Angabe zu zeigen');
  }, [fokus]);
  // ein Fokusziel ohne Zeile (Angabe, an der gerade keine Regel hängt): „alle Angaben“ zeigen; gibt es die Angabe bzw.
  // das Merkmal auch dann nicht (anderes Regelpaket), verfällt das Ziel – es bleibt nicht im Store hängen
  useEffect(() => {
    if (!fokus || suche) return;
    const merkmal = fokus.startsWith('merkmal:') ? fokus.slice(8).split(':')[0] : null;
    const id = fokus.replace(/:bestaetigen$/, '');
    const t = setTimeout(() => {
      if (useBaurecht.getState().fokus !== fokus) return;
      if (merkmal) {
        if (!document.querySelector(`.br-angaben [data-merkmal="${CSS.escape(merkmal)}"]`)) useBaurecht.getState().fokusSetzen(null);
        return;
      }
      if (document.querySelector(`.br-angaben [data-fakt="${CSS.escape(id)}"]`)) return;
      if (!alle) setAlle(true);
      else useBaurecht.getState().fokusSetzen(null);
    }, 60);
    return () => clearTimeout(t);
  }, [fokus, alle, suche]);
  const { auswertung } = stand;
  const klaerung = useMemo(() => new Map(auswertung.klaerung.map((k) => [k.id, k.anzahl])), [auswertung.klaerung]);
  const relevant = useMemo(() => {
    const s = new Set<string>(['lage.ags']);
    for (const p of auswertung.paragrafen) for (const v of [...p.verwendet, ...p.offen]) if (!v.startsWith('merkmal:') && !v.startsWith('paragraf:')) s.add(v);
    // Ziele von „bestätigen klärt“ (z. B. der Bezug einer Tabelle) – an ihnen hängt keine Regel unmittelbar, der Chip
    // führte sonst ins Leere
    for (const k of auswertung.bestaetigen ?? []) s.add(k.id);
    return s;
  }, [auswertung.paragrafen, auswertung.bestaetigen]);
  const merkmale = useBaurecht((s) => s.merkmale);
  const ansage = useBaurecht((s) => s.ansage);
  // so viele Paragrafen ändert die Bestätigung des Planungsrechts für diesen Ort – vorher genannt, nicht erst danach
  // (gedrosselt: höchstens alle 250 ms eine zweite Auswertung)
  const planungsrechtKlaert = usePlanungsrechtWirkung(stand);
  const ortAnzeige = ortVon(useBaurecht((s) => s.project))?.anzeige;
  // Ansagen nach kurzer Zeit leeren – derselbe Text wird dann beim nächsten Mal wieder vorgelesen
  useEffect(() => {
    if (!ansage) return;
    const t = setTimeout(() => useBaurecht.setState({ ansage: '' }), 1500);
    return () => clearTimeout(t);
  }, [ansage]);
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
  // auch ein geändertes Antragsmerkmal (z. B. „Beseitigung“) ordnet neu: seine Folgefragen rücken nach oben
  const schluessel = `${projektKennung}|${antrag}|${alle}|${suche}|${stand.module.map((m) => m.id).join(',')}|${JSON.stringify(merkmale)}`;
  // Schnappschuss der Reihenfolge je Schlüssel – abgeleiteter Zustand (React: „Informationen aus vorigen Renderläufen
  // speichern“), nicht bei jeder Antwort neu
  const rangBilden = () => new Map(Object.keys(auswertung.faktDefs).sort(vergleich).map((id, i) => [id, i]));
  const [ordnung, setOrdnung] = useState(() => ({ schluessel, rang: rangBilden() }));
  if (ordnung.schluessel !== schluessel) setOrdnung({ schluessel, rang: rangBilden() });
  const rang = ordnung.schluessel === schluessel ? ordnung.rang : rangBilden();
  // Rückfragen stehen unter ihrem Merkmal – solange die Merkmale zu sehen sind, nicht noch einmal in der Gruppe
  const merkmaleSichtbar = !suche || VORGABE_MERKMALE.some((m) => merkmalPasst(m, suche));
  const alsRueckfrage = new Set(
    Object.entries(RUECKFRAGEN)
      .filter(([name]) => !suche || VORGABE_MERKMALE.some((m) => m.name === name && merkmalPasst(m, suche)))
      .flatMap(([, ids]) => ids)
      .filter((rid) => rueckfrageSichtbar(rid, stand, merkmale)),
  );
  const gruppen = FAKT_GRUPPEN.map((g) => {
    const ids = Object.entries(auswertung.faktDefs)
      // Rückfragen nur, wenn sie gestellt sind, und dann unter ihrem Merkmal (in der Gruppe nur, wenn das Merkmal wegen
      // der Suche nicht zu sehen ist)
      .filter(([id, d]) => d.gruppe === g.id && id !== 'antrag.einreichung' && (alle || relevant.has(id)) && (!RUECKFRAGE_IDS.has(id) || (!(merkmaleSichtbar && alsRueckfrage.has(id)) && rueckfrageSichtbar(id, stand, merkmale))))
      .filter(([id, d]) => frageGestellt(id, d, ctx))
      .filter(([id, d]) => textPasst(`${d.kurz ?? ''} ${d.titel} ${d.frage ?? ''} ${(d.werte ?? []).join(' ')} ${id}`, suche))
      .map(([id]) => id)
      .sort((a, b) => (rang.get(a) ?? Infinity) - (rang.get(b) ?? Infinity) || vergleich(a, b));
    return { ...g, ids };
  }).filter((g) => g.ids.length);
  const trefferZahl = suche ? gruppen.reduce((n, g) => n + g.ids.length, 0) + VORGABE_MERKMALE.filter((m) => merkmalPasst(m, suche)).length + (merkmaleSichtbar ? alsRueckfrage.size : 0) : 0;
  const suchText = !suche ? '' : trefferZahl ? `${trefferZahl === 1 ? 'eine Angabe' : `${trefferZahl} Angaben`} zu „${suche}“` : `Keine Angabe zu „${suche}“`;
  const [suchAnsage, setSuchAnsage] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setSuchAnsage(suchText), 300);
    return () => clearTimeout(t);
  }, [suchText]);
  return (
    <aside className="br-angaben" aria-label="Angaben zum Projekt">
      <div className="br-unsichtbar" role="status" aria-live="polite">
        {ansage}
      </div>
      <div className="br-leiste-kopf">
        <h2>Angaben</h2>
        <label className="toggle" title="auch Angaben zeigen, an denen gerade keine Regel hängt">
          <input type="checkbox" checked={alle} onChange={(e) => setAlle(e.target.checked)} /> alle Angaben
        </label>
      </div>
      <div className="br-suche">
        <input ref={suchfeld} type="search" placeholder="Angabe suchen …" value={suche} onChange={(e) => setSuche(e.target.value)} aria-label="Angaben durchsuchen" />
      </div>
      {/* Suche: Trefferzahl bzw. „keine Angabe“ in einer stehenden Live-Region, entprellt (nicht bei jedem Tastendruck) */}
      <div className="br-unsichtbar" role="status">
        {suchAnsage}
      </div>
      <div className="br-angaben-liste">
        {!suche && <Klaeren stand={stand} />}
        {stand.widersprueche
          .filter((w) => w !== stand.planungsrechtHinweis)
          .map((w) => (
            <div key={w} className="br-meldung br-meldung-warn" role="status">
              {w}
            </div>
          ))}
        {stand.planungsrechtHinweis && (
          // knapp (eine Zeile): der häufige Fall „noch nicht bestätigt“ kurz, die Anschrift im Titel und im Namen des Knopfs
          // role="note": ein stehender Hinweis – als Live-Region läse er bei jeder Änderung von „klärt N“ alles neu vor
          <div className="br-meldung br-meldung-info br-planungsrecht-hinweis" role="note">
            <span>{/noch nicht bestätigt$/.test(stand.planungsrechtFrueher ?? '') ? 'Planungsrecht für diesen Ort noch nicht bestätigt.' : `${stand.planungsrechtHinweis}.`}</span>{' '}
            <span className="br-bestaetigen-zeile">
              <button type="button" className="small" onClick={() => planungsrechtGiltHier(planungsrechtKlaert, suche && !VORGABE_MERKMALE.some((m) => m.name === 'Planungsrecht' && merkmalPasst(m, suche)) ? () => suchfeld.current?.focus() : undefined)} aria-label={`Für diesen Ort bestätigen: Planungsrecht „${useBaurecht.getState().merkmale['Planungsrecht'] ?? ''}“, ${ortAnzeige ?? 'dieser Ort'}`} title="Das Planungsrecht gilt so für dieses Grundstück – bis dahin zählt es nicht als gesichert">
                Für diesen Ort bestätigen
              </button>
              {planungsrechtKlaert > 0 && (
                <span className="br-klaert" title={`Die Bestätigung ändert ${planungsrechtKlaert} Paragrafen`}>
                  klärt {planungsrechtKlaert}
                </span>
              )}
            </span>
          </div>
        )}
        {(!suche || VORGABE_MERKMALE.some((m) => merkmalPasst(m, suche))) && <Merkmale klaerung={klaerung} suche={suche} planungsrechtOffen={stand.planungsrechtFrueher} planungsrechtKlaert={planungsrechtKlaert} stand={stand} />}
        {suche && !gruppen.length && !VORGABE_MERKMALE.some((m) => merkmalPasst(m, suche)) && (
          <div className="br-leer-zustand">
            <p>Keine Angabe zu „{suche}“{alle ? '' : ' unter den Angaben, an denen eine Regel hängt'}.</p>
            <button
              type="button"
              onClick={() => {
                setSuche('');
                // der Leerzustand verschwindet – Fokus ins Suchfeld statt auf die Seite
                setTimeout(() => suchfeld.current?.focus(), 0);
              }}
            >
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
