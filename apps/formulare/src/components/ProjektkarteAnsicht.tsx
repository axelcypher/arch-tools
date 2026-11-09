import type { KeyboardEvent, ReactNode } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { PkEintrag, PkGruppe, PkWert } from '../forma/projektkarte';
import { pkArt, pkEintrag, pkMoeglichkeiten, pkSchluessel, pkTitel, pkWertVon } from '../forma/projektkarte';
import { anschrift, aufbau, einheit, feldTitel, gruppenReihen, istAdresse, pruefung, zusammenfassung } from '../projektkarteAufbau';
import type { Stammadresse } from '../stammdaten';
import { stammadresseMerken, stammdatenLaden, stammdatenSpeichern } from '../stammdaten';
import type { KartenWert, OffeneKarte } from '../store';
import { karteText, karteWert, useFormulare } from '../store';

/** zuletzt gewählte Gruppe je Projekt (bleibt beim Wechsel zwischen Formular und Projektkarte) */
const gewaehlt = new Map<string, number>();

const leer = (e: PkEintrag): PkWert => (pkArt(e) === 'kreuz' ? 0 : pkArt(e) === 'auswahl' || pkArt(e) === 'optionen' ? null : '');

/** Zum Eintrag springen (nach Suche oder Rückgängig) */
export function zeigeEintrag(schluessel: string) {
  const el = document.querySelector<HTMLElement>(`[data-pk="${schluessel}"]`);
  if (!el) return false;
  el.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
  el.focus({ preventScroll: true });
  return true;
}

/**
 * Projektkarte: links die Gruppen (Projekt, Beteiligte) mit Kurzfassung, rechts die gewählte Gruppe als
 * gegliedertes Formular. Auswahllisten und Optionen wie in FORMA, Übernehmen aus anderen Gruppen und aus den
 * Bürostammdaten, Hinweise auf Tippfehler. Gespeichert wird über die Werkzeugleiste in die Projektkarte des
 * FORMA-Projekts.
 */
export function ProjektkarteAnsicht() {
  const karte = useFormulare((s) => s.karte);
  const projekt = useFormulare((s) => s.projekt);
  const ds = useFormulare((s) => s.ds);
  const { karteLaden } = useFormulare.getState();
  const [geladen, setGeladen] = useState(!!karte);

  useEffect(() => {
    if (!karte) void karteLaden().finally(() => setGeladen(true));
  }, [karte, karteLaden]);

  if (!ds) return <div className="fo-leer">Die Projektkarte gibt es nur in der Desktop-App.</div>;
  if (!projekt) return null;
  if (!karte)
    return (
      <div className="fo-leer">
        {geladen ? (
          <>
            <h2>Keine Projektkarte</h2>
            <p>
              Im FORMA-Projekt <strong>{projekt.ordner}</strong> gibt es keine lesbare Projektkarte (<code>sj_prokarte.sdb</code>). Sie wird von FORMA beim Anlegen des Projekts
              erstellt.
            </p>
            <button onClick={() => void karteLaden()}>Erneut lesen</button>
          </>
        ) : (
          <p className="muted">Projektkarte wird gelesen …</p>
        )}
      </div>
    );
  return <Karte key={`${projekt.root}|${projekt.ordner}`} karte={karte} />;
}

function Karte({ karte }: { karte: OffeneKarte }) {
  const projektKey = `${karte.projekt.root}|${karte.projekt.ordner}`;
  const reihen = useMemo(() => gruppenReihen(karte.karte), [karte.karte]);
  const alle = reihen.flatMap((r) => r.gruppen);
  const [gruppeId, setGruppeId] = useState<number>(() => gewaehlt.get(projektKey) ?? alle[0]?.id ?? 0);
  const [suche, setSuche] = useState('');
  const [stamm, setStamm] = useState<Stammadresse[]>(stammdatenLaden);
  const gruppe = alle.find((g) => g.id === gruppeId) ?? alle[0];

  const waehle = (id: number, eintrag?: string) => {
    gewaehlt.set(projektKey, id);
    setGruppeId(id);
    if (eintrag) requestAnimationFrame(() => zeigeEintrag(eintrag));
  };

  // nach Rückgängig/Wiederholen in eine andere Gruppe wechseln (App ruft zeigeEintrag; fehlt das Element, Gruppe umschalten)
  useEffect(() => {
    const beiSprung = (ev: Event) => {
      const s = (ev as CustomEvent<string>).detail;
      const g = Number(s.split(':')[0]);
      if (g && g !== gruppeId) waehle(g, s);
    };
    window.addEventListener('formulare:pk-sprung', beiSprung);
    return () => window.removeEventListener('formulare:pk-sprung', beiSprung);
  });

  if (!gruppe) return <div className="fo-leer">Die Projektkarte enthält keine Einträge.</div>;

  return (
    <div className="pk">
      <Navigation karte={karte} reihen={reihen} aktiv={gruppe.id} suche={suche} setSuche={setSuche} onWahl={waehle} />
      <GruppenEditor
        key={gruppe.id}
        karte={karte}
        gruppe={gruppe}
        alleGruppen={alle}
        stamm={stamm}
        onStamm={(liste) => {
          stammdatenSpeichern(liste);
          setStamm(liste);
        }}
      />
    </div>
  );
}

/* ---------- Navigation ---------- */

function Navigation({
  karte,
  reihen,
  aktiv,
  suche,
  setSuche,
  onWahl,
}: {
  karte: OffeneKarte;
  reihen: ReturnType<typeof gruppenReihen>;
  aktiv: number;
  suche: string;
  setSuche: (s: string) => void;
  onWahl: (id: number, eintrag?: string) => void;
}) {
  const q = suche.trim().toLowerCase();
  const treffer = useMemo(() => {
    if (!q) return [];
    return karte.karte.eintraege
      .map((e) => ({ e, g: karte.karte.gruppen.find((x) => x.id === e.gruppe)!, text: karteText(karte, e.gruppe, e.id) }))
      .filter((x) => x.g && `${x.g.text} ${pkTitel(x.e.titel)} ${x.text}`.toLowerCase().includes(q) && (x.text.trim() || `${x.g.text} ${pkTitel(x.e.titel)}`.toLowerCase().includes(q)))
      .slice(0, 60);
  }, [karte, q]);

  return (
    <nav className="pk-nav" aria-label="Gruppen der Projektkarte">
      <input type="search" className="pk-suche" placeholder="Projektkarte durchsuchen …" value={suche} onChange={(e) => setSuche(e.target.value)} />
      {q ? (
        <div className="pk-treffer">
          {treffer.map(({ e, g, text }) => (
            <button key={pkSchluessel(e.gruppe, e.id)} className="pk-treffer-zeile" onClick={() => onWahl(g.id, pkSchluessel(e.gruppe, e.id))}>
              <span className="pk-treffer-ort">
                {g.text} › {feldTitel(e.titel)}
              </span>
              <span className="pk-treffer-wert">{text || <span className="muted">leer</span>}</span>
            </button>
          ))}
          {!treffer.length && <p className="muted small-text">Nichts gefunden.</p>}
        </div>
      ) : (
        reihen.map((r) => (
          <div key={r.titel} className="pk-nav-reihe">
            <div className="pk-nav-titel">{r.titel}</div>
            {r.gruppen.map((g) => (
              <NavEintrag key={g.id} karte={karte} gruppe={g} aktiv={g.id === aktiv} onClick={() => onWahl(g.id)} />
            ))}
          </div>
        ))
      )}
    </nav>
  );
}

function NavEintrag({ karte, gruppe, aktiv, onClick }: { karte: OffeneKarte; gruppe: PkGruppe; aktiv: boolean; onClick: () => void }) {
  const eintraege = karte.karte.eintraege.filter((e) => e.gruppe === gruppe.id);
  const gefuellt = eintraege.filter((e) => karteText(karte, e.gruppe, e.id).trim()).length;
  const geaendert = eintraege.some((e) => pkSchluessel(e.gruppe, e.id) in karte.aenderungen);
  const kurz = zusammenfassung(gruppe, (id) => karteText(karte, gruppe.id, id));
  return (
    <button className={`pk-nav-eintrag${aktiv ? ' aktiv' : ''}${gefuellt ? '' : ' leer'}`} aria-current={aktiv ? 'true' : undefined} onClick={onClick}>
      <span className="pk-nav-name">
        {gruppe.text}
        {geaendert && (
          <span className="fo-ungespeichert" title="Ungespeicherte Änderungen">
            {' '}
            ●
          </span>
        )}
      </span>
      <span className="pk-nav-kurz">{kurz || (gefuellt ? `${gefuellt} von ${eintraege.length} ausgefüllt` : 'nicht ausgefüllt')}</span>
    </button>
  );
}

/* ---------- Editor einer Gruppe ---------- */

function GruppenEditor({
  karte,
  gruppe,
  alleGruppen,
  stamm,
  onStamm,
}: {
  karte: OffeneKarte;
  gruppe: PkGruppe;
  alleGruppen: PkGruppe[];
  stamm: Stammadresse[];
  onStamm: (liste: Stammadresse[]) => void;
}) {
  const { karteMehrere, setMeldung } = useFormulare.getState();
  const eintraege = useMemo(() => karte.karte.eintraege.filter((e) => e.gruppe === gruppe.id), [karte.karte, gruppe.id]);
  const abschnitte = useMemo(() => aufbau(gruppe, eintraege), [gruppe, eintraege]);
  const text = (id: number) => karteText(karte, gruppe.id, id);
  const adresse = istAdresse(gruppe);
  const gefuellt = eintraege.some((e) => text(e.id).trim());
  const quellen = alleGruppen.filter((g) => g.id !== gruppe.id && istAdresse(g) && karte.karte.eintraege.some((e) => e.gruppe === g.id && karteText(karte, g.id, e.id).trim()));
  const inhalt = useRef<HTMLDivElement>(null);

  const uebernehmen = (auswahl: string) => {
    const [art, name] = [auswahl.slice(0, 2), auswahl.slice(2)];
    let werte: KartenWert[] = [];
    let von = '';
    if (art === 'g:') {
      const quelle = Number(name);
      von = alleGruppen.find((g) => g.id === quelle)?.text ?? '';
      werte = eintraege.filter((e) => pkEintrag(karte.karte, quelle, e.id)).map((e) => ({ gruppe: gruppe.id, id: e.id, wert: karteWert(karte, quelle, e.id) }));
    } else {
      const s = stamm.find((x) => x.name === name);
      if (!s) return;
      von = s.name;
      werte = eintraege.filter((e) => String(e.id) in s.werte).map((e) => ({ gruppe: gruppe.id, id: e.id, wert: s.werte[String(e.id)] }));
    }
    karteMehrere(werte, `${gruppe.text}: übernommen von ${von}`);
    setMeldung({ art: 'info', text: `${gruppe.text}: Angaben von „${von}“ übernommen – Strg+Z nimmt es zurück.` });
  };

  const merken = () => {
    const name = [text(40), text(30)].map((x) => x.trim()).filter(Boolean).join(', ') || gruppe.text;
    const werte: Record<string, PkWert> = {};
    for (const e of eintraege) werte[String(e.id)] = karteWert(karte, e.gruppe, e.id);
    onStamm(stammadresseMerken(stamm, { name, werte }));
    setMeldung({ art: 'info', text: `„${name}“ als Bürostammdaten gemerkt – in anderen Projekten über „Übernehmen“ einsetzbar.` });
  };

  const leeren = () => {
    karteMehrere(
      eintraege.map((e) => ({ gruppe: gruppe.id, id: e.id, wert: leer(e) })),
      `${gruppe.text} geleert`,
    );
    setMeldung({ art: 'info', text: `${gruppe.text} geleert – Strg+Z nimmt es zurück.` });
  };

  // Enter in einzeiligen Feldern: zum nächsten Feld
  const tasten = (ev: KeyboardEvent<HTMLDivElement>) => {
    const t = ev.target as HTMLElement;
    if (ev.key !== 'Enter' || !(t instanceof HTMLInputElement) || t.type === 'checkbox' || ev.ctrlKey || ev.altKey) return;
    const felder = [...(inhalt.current?.querySelectorAll<HTMLElement>('[data-pk]') ?? [])];
    const i = felder.indexOf(t);
    if (i >= 0 && felder[i + 1]) {
      ev.preventDefault();
      felder[i + 1].focus();
    }
  };

  return (
    <section className="pk-editor" aria-label={gruppe.text}>
      <header className="pk-kopf">
        <div className="pk-kopf-text">
          <h2>{gruppe.text}</h2>
          <span className="muted">{zusammenfassung(gruppe, text) || (gefuellt ? '' : 'Noch keine Angaben')}</span>
        </div>
        <div className="pk-aktionen">
          {adresse && (quellen.length > 0 || stamm.length > 0) && (
            <select className="pk-uebernehmen" aria-label="Angaben übernehmen" value="" onChange={(e) => e.target.value && uebernehmen(e.target.value)}>
              <option value="">Übernehmen von …</option>
              {quellen.length > 0 && (
                <optgroup label="Aus diesem Projekt">
                  {quellen.map((g) => (
                    <option key={g.id} value={`g:${g.id}`}>
                      {g.text}
                      {zusammenfassung(g, (id) => karteText(karte, g.id, id)) ? ` – ${zusammenfassung(g, (id) => karteText(karte, g.id, id))}` : ''}
                    </option>
                  ))}
                </optgroup>
              )}
              {stamm.length > 0 && (
                <optgroup label="Bürostammdaten">
                  {stamm.map((s) => (
                    <option key={s.name} value={`s:${s.name}`}>
                      {s.name}
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
          )}
          {adresse && gefuellt && (
            <button title="Diese Adresse für andere Projekte merken" onClick={merken}>
              Als Stammdaten merken
            </button>
          )}
          {gefuellt && (
            <button title="Alle Angaben dieser Gruppe entfernen (Strg+Z nimmt es zurück)" onClick={leeren}>
              Leeren
            </button>
          )}
        </div>
      </header>

      <div className={`pk-koerper${adresse ? ' mit-vorschau' : ''}`}>
        <div className="pk-abschnitte" ref={inhalt} onKeyDown={tasten}>
          {abschnitte.map((a) => (
            <Abschnitt key={a.titel || 'alle'} titel={a.titel} einklappbar={a.einklappbar && a.felder.every((x) => !text(x.eintrag.id).trim())}>
              <div className="pk-raster">{zellen(a.felder, karte, gruppe, text(120))}</div>
            </Abschnitt>
          ))}
        </div>
        {adresse && <Vorschau zeilen={anschrift(text)} />}
      </div>
    </section>
  );
}

function Abschnitt({ titel, einklappbar, children }: { titel: string; einklappbar: boolean; children: ReactNode }) {
  const [auf, setAuf] = useState(!einklappbar);
  if (!titel) return <div className="pk-abschnitt">{children}</div>;
  return (
    <div className="pk-abschnitt">
      <h3>
        {einklappbar ? (
          <button className="pk-abschnitt-knopf" aria-expanded={auf} onClick={() => setAuf(!auf)}>
            <span aria-hidden>{auf ? '▾' : '▸'}</span> {titel}
          </button>
        ) : (
          titel
        )}
      </h3>
      {auf && children}
    </div>
  );
}

function Vorschau({ zeilen }: { zeilen: string[] }) {
  return (
    <aside className="pk-vorschau" aria-label="Anschrift">
      <div className="pk-vorschau-titel">Anschrift</div>
      {zeilen.length ? (
        <address>
          {zeilen.map((z, i) => (
            <div key={i}>{z}</div>
          ))}
        </address>
      ) : (
        <p className="muted small-text">Noch keine Anschrift.</p>
      )}
    </aside>
  );
}

/** Zellen eines Abschnitts; aufeinanderfolgende Kästchen mit gleichem Titel stehen gemeinsam unter einem Titel */
function zellen(felder: { eintrag: PkEintrag; breite: number }[], karte: OffeneKarte, gruppe: PkGruppe, land: string): ReactNode[] {
  const out: ReactNode[] = [];
  for (let i = 0; i < felder.length; i++) {
    const { eintrag, breite } = felder[i];
    if (pkArt(eintrag) === 'kreuz') {
      const gleich = [eintrag];
      while (felder[i + 1] && pkArt(felder[i + 1].eintrag) === 'kreuz' && felder[i + 1].eintrag.titel === eintrag.titel) gleich.push(felder[++i].eintrag);
      out.push(<Kreuze key={eintrag.id} karte={karte} eintraege={gleich} />);
      continue;
    }
    out.push(<Eintrag key={eintrag.id} karte={karte} gruppe={gruppe} eintrag={eintrag} breite={breite} land={land} />);
  }
  return out;
}

function Zelle({ breite, titel, geaendert, hinweis, warnung, onZurueck, children, htmlFor }: { breite: number; titel: string; geaendert: boolean; hinweis?: string; warnung?: string | null; onZurueck?: () => void; children: ReactNode; htmlFor?: string }) {
  return (
    <div className={`pk-feld${geaendert ? ' geaendert' : ''}${warnung ? ' warnung' : ''}`} style={{ gridColumn: `span ${breite}` }}>
      <div className="pk-feld-kopf">
        <label className="pk-feld-titel" htmlFor={htmlFor}>
          {titel}
          {hinweis && <span className="pk-einheit"> [{hinweis}]</span>}
        </label>
        {geaendert && onZurueck && (
          <button className="pk-zurueck" title="Auf den gespeicherten Wert zurücksetzen" aria-label={`${titel} zurücksetzen`} onClick={onZurueck}>
            ↺
          </button>
        )}
      </div>
      {children}
      {warnung && <div className="pk-warnung">{warnung}</div>}
    </div>
  );
}

function Eintrag({ karte, gruppe, eintrag, breite, land }: { karte: OffeneKarte; gruppe: PkGruppe; eintrag: PkEintrag; breite: number; land: string }) {
  const karteSetzen = useFormulare((s) => s.karteSetzen);
  const s = pkSchluessel(eintrag.gruppe, eintrag.id);
  const id = `pk-${eintrag.gruppe}-${eintrag.id}`;
  const wert = karteWert(karte, eintrag.gruppe, eintrag.id);
  const geaendert = s in karte.aenderungen;
  const setzen = (w: PkWert) => karteSetzen(eintrag.gruppe, eintrag.id, w);
  const zurueck = () => setzen(pkWertVon(eintrag));
  const titel = feldTitel(eintrag.titel);
  const art = pkArt(eintrag);

  if (art === 'auswahl' || art === 'optionen') {
    const moeglich = pkMoeglichkeiten(eintrag);
    // Auswahllisten: erste (leere) Möglichkeit = „keine Angabe“; Optionen: erneuter Klick hebt die Wahl auf
    if (art === 'auswahl' || moeglich.length > 4) {
      return (
        <Zelle breite={breite} titel={titel} geaendert={geaendert} onZurueck={zurueck} htmlFor={id}>
          <select id={id} data-pk={s} value={typeof wert === 'number' ? wert : ''} onChange={(e) => setzen(e.target.value === '' ? null : Number(e.target.value))}>
            <option value="">– keine Angabe –</option>
            {moeglich.map((m, i) => (m ? <option key={i} value={i}>{m}</option> : null))}
          </select>
        </Zelle>
      );
    }
    return (
      <Zelle breite={breite} titel={titel} geaendert={geaendert} onZurueck={zurueck}>
        <div className="pk-optionen" role="radiogroup" aria-label={titel}>
          {moeglich.map((m, i) => (
            <button key={i} role="radio" aria-checked={wert === i} data-pk={i === 0 ? s : undefined} className={wert === i ? 'aktiv' : ''} onClick={() => setzen(wert === i ? null : i)}>
              {m}
            </button>
          ))}
        </div>
      </Zelle>
    );
  }

  const textWert = typeof wert === 'string' ? wert : '';
  const warnung = pruefung(gruppe, eintrag, textWert, land);
  const e = einheit(eintrag.titel);
  if (art === 'mehrzeilig') {
    return (
      <Zelle breite={breite} titel={titel} hinweis={e} geaendert={geaendert} onZurueck={zurueck} warnung={warnung} htmlFor={id}>
        <textarea id={id} data-pk={s} rows={Math.max(2, Math.min(10, textWert.split('\n').length + 1))} value={textWert} onChange={(ev) => setzen(ev.target.value)} />
      </Zelle>
    );
  }
  return (
    <Zelle breite={breite} titel={titel} hinweis={e} geaendert={geaendert} onZurueck={zurueck} warnung={warnung} htmlFor={id}>
      <input
        id={id}
        data-pk={s}
        type="text"
        value={textWert}
        spellCheck={false}
        className={e === 'm²' ? 'pk-zahl' : undefined}
        onChange={(ev) => setzen(ev.target.value)}
      />
    </Zelle>
  );
}

function Kreuze({ karte, eintraege }: { karte: OffeneKarte; eintraege: PkEintrag[] }) {
  const karteSetzen = useFormulare((s) => s.karteSetzen);
  const geaendert = eintraege.some((e) => pkSchluessel(e.gruppe, e.id) in karte.aenderungen);
  return (
    <Zelle breite={12} titel={feldTitel(eintraege[0].titel)} geaendert={geaendert}>
      <div className="pk-kreuze">
        {eintraege.map((e) => (
          <label key={e.id} className="pk-kreuz">
            <input type="checkbox" data-pk={pkSchluessel(e.gruppe, e.id)} checked={karteWert(karte, e.gruppe, e.id) === 1} onChange={(ev) => karteSetzen(e.gruppe, e.id, ev.target.checked ? 1 : 0)} />
            {e.text}
          </label>
        ))}
      </div>
    </Zelle>
  );
}
