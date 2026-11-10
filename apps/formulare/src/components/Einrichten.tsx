import type { MouseEvent as ReactMouseEvent, ReactNode } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { useAntrag } from '../antragStore';
import type { Bedingung } from '../bedingung';
import { bedingungText, erfuellt, hatBedingung } from '../bedingung';
import { abschnittAuswahl, feldId, gruppeAuswahl, useEinrichten } from '../einrichten';
import type { Abschnitt, Feld } from '../forma/felder';
import { abschnitte } from '../forma/felder';
import { useHervorheben } from '../markierung';
import type { FormularProfil, Gruppe, Regel } from '../profil';
import {
  abschnittErforderlich,
  abschnittId,
  alleFelder,
  ausGruppe,
  ausgefuellt,
  einheiten,
  feldTitel,
  formularKontext,
  gruppeAufloesen,
  gruppeBilden,
  gruppeHoch,
  gruppeVon,
  gruppenIm,
  leeresProfil,
  liegtIn,
  obereGruppe,
  profilKopie,
  profilSchluessel,
  REGELN,
  untergruppen,
} from '../profil';
import type { OffenesFormular } from '../store';
import { useFormulare, wertVon } from '../store';
import type { FeldWahl } from './BedingungEditor';
import { BedingungEditor } from './BedingungEditor';
import { Symbol } from './Symbol';

/**
 * Einrichten eines Formulars: links die Gliederung als Baum (Abschnitte, Gruppen, Felder), im Formular lassen sich
 * Felder anklicken (mit Strg/Umschalt mehrere), rechts stehen alle Einstellungen der Auswahl – Titel, Füllstand,
 * Gruppe und Bedingung. Gilt für das Formular in allen Projekten (Profil je Kennung und Stand).
 */

const abschnittTitel = (a: Abschnitt, p: FormularProfil) => p.abschnitte[abschnittId(a)]?.titel?.trim() || a.titel || a.felder[0].beschriftung;

/** kurzer Inhalt eines Felds zum Wiedererkennen */
function vorschau(o: OffenesFormular, f: Feld): string {
  const w = wertVon(o, f);
  if (typeof w === 'boolean') return w ? 'angekreuzt' : '';
  const t = w.replace(/\s+/g, ' ').trim();
  return t.length > 28 ? `${t.slice(0, 27)}…` : t;
}

/** Was Baum und Einstellungen brauchen: Profil, Abschnitte, Felder zur Wahl, Bedingungskontext, Ändern */
export function useAufbau(offen: OffenesFormular) {
  const schluessel = profilSchluessel(offen.formular, offen.name);
  const gespeichert = useFormulare((s) => s.profile[schluessel]);
  const profil = useMemo(() => ({ ...leeresProfil(), ...gespeichert }), [gespeichert]);
  const merkmalWerte = useAntrag((s) => s.projektdatei?.merkmale);
  const merkmale = useAntrag((s) => s.merkmalDefinitionen);
  const k = useMemo(() => formularKontext(merkmalWerte ?? {}, offen.felder.flat(), (f) => wertVon(offen, f)), [merkmalWerte, offen]);
  const seiten = useMemo(() => offen.felder.map((felder, i) => ({ i, abschnitte: abschnitte(felder) })), [offen.felder]);
  const felderWahl: FeldWahl[] = useMemo(
    () =>
      seiten.flatMap((s) =>
        s.abschnitte.flatMap((a) =>
          a.felder.map((f) => ({
            feld: f,
            titel: feldTitel(f, profil),
            ort: `Seite ${s.i + 1} · ${abschnittTitel(a, profil)}`,
          })),
        ),
      ),
    [seiten, profil],
  );
  const aendern = (f: (p: FormularProfil) => FormularProfil | void) => {
    const kopie = profilKopie(profil);
    useFormulare.getState().profilSetzen(schluessel, f(kopie) ?? kopie);
  };
  return {
    schluessel,
    gespeichert,
    profil,
    k,
    merkmale,
    seiten,
    felderWahl,
    aendern,
  };
}

type Aufbau = ReturnType<typeof useAufbau>;

const erweitert = (e: ReactMouseEvent) => e.ctrlKey || e.metaKey || e.shiftKey;

/* ---------- Baum (in der Gliederung) ---------- */

export function EinrichtenBaum({ offen }: { offen: OffenesFormular }) {
  const a = useAufbau(offen);
  const auswahl = useEinrichten((s) => s.auswahl);
  const { auswaehlen } = useEinrichten.getState();
  const hervor = useHervorheben();
  const [auf, setAuf] = useState<Set<string>>(() => new Set());

  // wird im Formular ein Feld gewählt, klappt sein Abschnitt auf
  useEffect(() => {
    const felder = auswahl.filter((x) => x.startsWith('f:')).map((x) => x.slice(2));
    if (!felder.length) return;
    const ids = a.seiten.flatMap((s) => s.abschnitte.filter((ab) => ab.felder.some((f) => felder.includes(f.schluessel))).map(abschnittId));
    setAuf((alt) => (ids.every((id) => alt.has(id)) ? alt : new Set([...alt, ...ids])));
    document.querySelector(`.fo-ein-baum [data-auswahl="${CSS.escape(auswahl[auswahl.length - 1])}"]`)?.scrollIntoView?.({ block: 'nearest' });
  }, [auswahl, a.seiten]);

  const zeige = (felder: string[]) => document.querySelector(`[data-ein="${CSS.escape(felder[0])}"]`)?.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
  const klick = (id: string, felder: string[]) => (e: ReactMouseEvent) => {
    auswaehlen(id, erweitert(e));
    zeige(felder);
  };
  const umschalten = (id: string) =>
    setAuf((s) => {
      const neu = new Set(s);
      if (!neu.delete(id)) neu.add(id);
      return neu;
    });

  const feldZeile = (f: Feld, einzug: number) => {
    const id = feldId(f.schluessel);
    const bed = a.profil.bedingungen?.[f.schluessel];
    const zaehlt = a.profil.zaehlt[f.schluessel] !== false;
    const inhalt = vorschau(offen, f);
    return (
      <button
        key={f.schluessel}
        role="treeitem"
        aria-selected={auswahl.includes(id)}
        data-auswahl={id}
        className={`fo-ein-zeile feld${auswahl.includes(id) ? ' aktiv' : ''}${!zaehlt && !gruppeVon(a.profil, f.schluessel) ? ' zaehlt-nicht' : ''}${erfuellt(bed, a.k) ? '' : ' entfaellt'}`}
        style={{ paddingLeft: 10 + einzug * 14 }}
        onClick={klick(id, [f.schluessel])}
        {...hervor({ felder: [f.schluessel] })}
      >
        <span className="fo-ein-art" aria-hidden>
          {f.art === 'kreuz' ? '☐' : 'T'}
        </span>
        <span className="fo-ein-name">
          {feldTitel(f, a.profil)}
          {inhalt && <span className="fo-ein-inhalt"> · {inhalt}</span>}
        </span>
        {hatBedingung(bed) && <Symbol name="bedingung" titel={`nur wenn ${bedingungText(bed, nameIn(a))}`} />}
        {!zaehlt && !gruppeVon(a.profil, f.schluessel) && <span className="fo-ein-marke">zählt nicht</span>}
      </button>
    );
  };

  // eine Gruppe mit ihren Untergruppen (eingerückt) und ihren Feldern
  const gruppeKnoten = (g: Gruppe, ab: Abschnitt, tiefe: number, gesehen = new Set<string>()): ReactNode => {
    if (gesehen.has(g.id)) return null;
    gesehen.add(g.id);
    const gid = gruppeAuswahl(g.id);
    const alle = alleFelder(a.profil, g);
    const titelFelder = ab.felder.filter((f) => alle.includes(f.schluessel));
    return (
      <div key={g.id} role="group">
        <button
          role="treeitem"
          aria-selected={auswahl.includes(gid)}
          data-auswahl={gid}
          className={`fo-ein-zeile gruppe${auswahl.includes(gid) ? ' aktiv' : ''}${g.regel === 'nie' ? ' zaehlt-nicht' : ''}${erfuellt(g.bedingung, a.k) ? '' : ' entfaellt'}`}
          style={{ paddingLeft: 10 + tiefe * 14 }}
          onClick={klick(gid, alle)}
          {...hervor({ felder: alle })}
        >
          <Symbol name="gruppe" />
          <span className="fo-ein-name">{gruppenTitel(g, titelFelder, a.profil)}</span>
          {hatBedingung(g.bedingung) && <Symbol name="bedingung" titel={`nur wenn ${bedingungText(g.bedingung, nameIn(a))}`} />}
          <span className="fo-ein-marke">{REGELN.find((r) => r.id === g.regel)?.text}</span>
        </button>
        {untergruppen(a.profil, g.id).map((u) => gruppeKnoten(u, ab, tiefe + 1, gesehen))}
        {ab.felder.filter((f) => g.felder.includes(f.schluessel)).map((f) => feldZeile(f, tiefe + 1))}
      </div>
    );
  };

  return (
    <div className="fo-ein-baum" role="tree" aria-label="Aufbau des Formulars">
      {a.seiten.map((s) => (
        <div key={s.i} className="fo-ein-seite">
          <div className="fo-ein-seite-kopf">Seite {s.i + 1}</div>
          {s.abschnitte.map((ab) => {
            const id = abschnittId(ab);
            const sel = abschnittAuswahl(id);
            const p = a.profil.abschnitte[id];
            const offenAb = auf.has(id);
            const gruppen = gruppenIm(ab, a.profil);
            const gruppiert = new Set(gruppen.flatMap((g) => alleFelder(a.profil, g)));
            return (
              <div key={id} className="fo-ein-abschnitt" role="group">
                <div
                  className={`fo-ein-zeile abschnitt${auswahl.includes(sel) ? ' aktiv' : ''}${p?.sichtbar === false ? ' versteckt' : ''}${abschnittErforderlich(ab, a.profil, a.k) ? '' : ' entfaellt'}`}
                >
                  <button
                    className="icon fo-ein-auf"
                    aria-expanded={offenAb}
                    aria-label={offenAb ? `${abschnittTitel(ab, a.profil)} zuklappen` : `${abschnittTitel(ab, a.profil)} aufklappen`}
                    onClick={() => umschalten(id)}
                  >
                    <Symbol name={offenAb ? 'pfeilUnten' : 'pfeilRechts'} />
                  </button>
                  <button
                    role="treeitem"
                    aria-selected={auswahl.includes(sel)}
                    data-auswahl={sel}
                    className="fo-ein-titel"
                    onClick={klick(
                      sel,
                      ab.felder.map((f) => f.schluessel),
                    )}
                    {...hervor({ felder: ab.felder.map((f) => f.schluessel) })}
                  >
                    <span className="fo-ein-name">{abschnittTitel(ab, a.profil)}</span>
                    {p?.sichtbar === false && <Symbol name="augeZu" titel="in der Gliederung ausgeblendet" />}
                    {hatBedingung(p?.bedingung) && <Symbol name="bedingung" titel={`nur wenn ${bedingungText(p?.bedingung, nameIn(a))}`} />}
                    <Fuellstand a={a} ab={ab} offen={offen} />
                  </button>
                </div>
                {offenAb && (
                  <div role="group">
                    {gruppen.map((g) => gruppeKnoten(g, ab, 1))}
                    {ab.felder.filter((f) => !gruppiert.has(f.schluessel)).map((f) => feldZeile(f, 1))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

/** Füllstand eines Abschnitts wie in der Gliederung: „3/5“, ✓ oder „entfällt“ */
function Fuellstand({ a, ab, offen }: { a: Aufbau; ab: Abschnitt; offen: OffenesFormular }) {
  if (!abschnittErforderlich(ab, a.profil, a.k)) return <span className="fo-ein-zahl">entfällt</span>;
  const zaehlen = einheiten(ab, a.profil, a.k).filter((e) => !e.entfaellt);
  const voll = zaehlen.filter((e) => ausgefuellt(e, (f) => wertVon(offen, f))).length;
  if (!zaehlen.length) return <span className="fo-ein-zahl">–</span>;
  return (
    <span className={`fo-ein-zahl${voll === zaehlen.length ? ' voll' : ''}`} title={`${voll} von ${zaehlen.length} Angaben ausgefüllt`}>
      {voll === zaehlen.length ? '✓' : `${voll}/${zaehlen.length}`}
    </span>
  );
}

const gruppenTitel = (g: Gruppe, felder: Feld[], p: FormularProfil) => g.titel?.trim() || felder.map((f) => feldTitel(f, p)).join(' / ');
const nameIn = (a: Aufbau) => {
  const nach = new Map(a.felderWahl.map((f) => [f.feld.schluessel, f]));
  return (s: string) => (nach.has(s) ? { titel: nach.get(s)!.titel, kreuz: nach.get(s)!.feld.art === 'kreuz' } : undefined);
};

/* ---------- Einstellungen der Auswahl (rechts) ---------- */

export function EinrichtenPanel({ offen }: { offen: OffenesFormular }) {
  const a = useAufbau(offen);
  const auswahl = useEinrichten((s) => s.auswahl);
  const waehlt = useEinrichten((s) => !!s.waehlen);
  const { setAktiv, setAuswahl, feldWaehlen, waehlenAbbrechen } = useEinrichten.getState();
  // Esc bricht das Wählen eines Felds ab
  useEffect(() => {
    if (!waehlt) return;
    const taste = (e: KeyboardEvent) => e.key === 'Escape' && waehlenAbbrechen();
    window.addEventListener('keydown', taste);
    return () => window.removeEventListener('keydown', taste);
  }, [waehlt, waehlenAbbrechen]);

  const alleFelder = useMemo(() => new Map(a.seiten.flatMap((s) => s.abschnitte.flatMap((ab) => ab.felder.map((f) => [f.schluessel, { f, ab, seite: s.i }] as const)))), [a.seiten]);
  const alleAbschnitte = useMemo(() => new Map(a.seiten.flatMap((s) => s.abschnitte.map((ab) => [abschnittId(ab), { ab, seite: s.i }] as const))), [a.seiten]);
  const felder = auswahl
    .filter((x) => x.startsWith('f:'))
    .map((x) => alleFelder.get(x.slice(2)))
    .filter((x): x is NonNullable<typeof x> => !!x);
  const abschnitt = auswahl.length === 1 && auswahl[0].startsWith('a:') ? alleAbschnitte.get(auswahl[0].slice(2)) : undefined;
  const gewaehlteGruppen = auswahl
    .filter((x) => x.startsWith('g:'))
    .map((x) => a.profil.gruppen?.find((g) => g.id === x.slice(2)))
    .filter((g): g is Gruppe => !!g);
  const gruppe = auswahl.length === 1 ? gewaehlteGruppen[0] : undefined;
  const mehrfach = auswahl.length > 1 && !auswahl.some((x) => x.startsWith('a:'));
  const editor = (wert: Bedingung | undefined, onChange: (b: Bedingung | undefined) => void, ohne: string[]) => (
    <BedingungEditor wert={wert} onChange={onChange} merkmale={a.merkmale} felder={a.felderWahl} ohne={ohne} kontext={a.k} imFormularWaehlen={feldWaehlen} />
  );

  return (
    <aside className="fo-ein-panel" aria-label="Einstellungen der Auswahl">
      <div className="fo-ein-panel-kopf">
        <div>
          <strong>Formular einrichten</strong>
          <span className="muted small-text">Gilt für „{offen.name}“ in allen Projekten.</span>
        </div>
        <button className="primary small" onClick={() => setAktiv(false)}>
          Fertig
        </button>
      </div>
      {waehlt && (
        <div className="fo-ein-waehlen" role="status">
          <Symbol name="ziel" /> Im Formular auf das Feld klicken, von dem es abhängt …
          <button className="small" onClick={waehlenAbbrechen}>
            Abbrechen
          </button>
        </div>
      )}

      <div className="fo-ein-panel-inhalt">
        {!auswahl.length && (
          <div className="fo-ein-leer">
            <p>
              <strong>Feld im Formular anklicken</strong> – oder links einen Abschnitt oder eine Gruppe. Mit <kbd>Strg</kbd> bzw. <kbd>Umschalt</kbd> mehrere Felder wählen, etwa um sie zu einer Angabe
              zusammenzufassen.
            </p>
            <ul className="muted small-text">
              <li>Titel: wie das Feld in der Gliederung heißt</li>
              <li>Füllstand: ob es für „3 von 5“ mitzählt</li>
              <li>Gruppe: mehrere Felder zählen als eine Angabe (z. B. Auswahl) – verschachtelbar: im Baum mit Strg Gruppen und Felder wählen</li>
              <li>Bedingung: nur erforderlich, wenn … (Projektmerkmal oder anderes Feld, mit und/oder, auch in Gruppen)</li>
            </ul>
            {a.gespeichert && (
              <button className="small" onClick={() => useFormulare.getState().profilSetzen(a.schluessel, null)}>
                Alles auf die Vorgabe zurücksetzen
              </button>
            )}
          </div>
        )}

        {abschnitt && <AbschnittEinstellungen a={a} ab={abschnitt.ab} seite={abschnitt.seite} editor={editor} />}

        {gruppe && <GruppeEinstellungen a={a} g={gruppe} editor={editor} onFeld={(s) => setAuswahl([feldId(s)])} onGruppe={(id) => setAuswahl([gruppeAuswahl(id)])} />}

        {felder.length === 1 && auswahl.length === 1 && (
          <FeldEinstellungen a={a} offen={offen} f={felder[0].f} ab={felder[0].ab} seite={felder[0].seite} editor={editor} onGruppe={(id) => setAuswahl([gruppeAuswahl(id)])} />
        )}

        {mehrfach && <Mehrfach a={a} felder={felder.map((x) => ({ f: x.f, ab: x.ab }))} gruppen={gewaehlteGruppen} editor={editor} onGruppe={(id) => setAuswahl([gruppeAuswahl(id)])} />}

        {auswahl.length > 1 && !mehrfach && <p className="muted small-text">Für gemeinsame Einstellungen nur Felder und Gruppen auswählen (keine Abschnitte).</p>}
      </div>
    </aside>
  );
}

type Editor = (wert: Bedingung | undefined, onChange: (b: Bedingung | undefined) => void, ohne: string[]) => React.ReactNode;

function Abschnitt_({ titel, children }: { titel: string; children: React.ReactNode }) {
  return (
    <section className="fo-ein-teil">
      <h4>{titel}</h4>
      {children}
    </section>
  );
}

function TitelFeld({ wert, vorschlag, label, onSetzen }: { wert: string; vorschlag: string; label: string; onSetzen: (t: string) => void }) {
  return (
    <input
      key={`${label}|${wert}`}
      className="fo-ein-eingabe"
      defaultValue={wert}
      placeholder={vorschlag}
      aria-label={label}
      onBlur={(e) => e.target.value.trim() !== wert && onSetzen(e.target.value.trim())}
      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
    />
  );
}

function Schalter({ an, onChange, children, label }: { an: boolean; onChange: (an: boolean) => void; children: React.ReactNode; label: string }) {
  return (
    <label className="fo-ein-schalter">
      <input type="checkbox" role="switch" checked={an} aria-label={label} onChange={(e) => onChange(e.target.checked)} />
      <span>{children}</span>
    </label>
  );
}

function AbschnittEinstellungen({ a, ab, seite, editor }: { a: Aufbau; ab: Abschnitt; seite: number; editor: Editor }) {
  const id = abschnittId(ab);
  const p = a.profil.abschnitte[id];
  const erkannt = ab.titel || ab.felder[0].beschriftung;
  const setzen = (teil: Partial<NonNullable<typeof p>>) =>
    a.aendern((pr) => {
      pr.abschnitte[id] = { ...pr.abschnitte[id], ...teil };
    });
  return (
    <>
      <div className="fo-ein-was">
        <span className="fo-ein-typ">Abschnitt</span>
        <strong>{abschnittTitel(ab, a.profil)}</strong>
        <span className="muted small-text">
          Seite {seite + 1} · {ab.felder.length} Felder
        </span>
      </div>
      <Abschnitt_ titel="Titel in der Gliederung">
        <TitelFeld wert={p?.titel ?? ''} vorschlag={erkannt} label={`Titel für Abschnitt ${erkannt}`} onSetzen={(titel) => setzen({ titel })} />
      </Abschnitt_>
      <Abschnitt_ titel="Anzeige">
        <Schalter an={p?.sichtbar !== false} onChange={(an) => setzen({ sichtbar: an })} label={`${erkannt} in der Gliederung zeigen`}>
          In der Gliederung zeigen
        </Schalter>
      </Abschnitt_>
      <Abschnitt_ titel="Erforderlich">
        {editor(
          p?.bedingung,
          (bedingung) => setzen({ bedingung }),
          ab.felder.map((f) => f.schluessel),
        )}
      </Abschnitt_>
    </>
  );
}

function GruppeEinstellungen({ a, g, editor, onFeld, onGruppe }: { a: Aufbau; g: Gruppe; editor: Editor; onFeld: (s: string) => void; onGruppe: (id: string) => void }) {
  const felder = a.felderWahl.filter((x) => g.felder.includes(x.feld.schluessel));
  const alle = alleFelder(a.profil, g);
  const unter = untergruppen(a.profil, g.id);
  const oben = obereGruppe(a.profil, g);
  const name = (x: Gruppe) =>
    x.titel?.trim() ||
    a.felderWahl
      .filter((f) => alleFelder(a.profil, x).includes(f.feld.schluessel))
      .map((f) => f.titel)
      .join(' / ');
  // mögliche übergeordnete Gruppen: im selben Abschnitt, nicht sie selbst und keine ihrer Untergruppen
  const ort = (s: string) => a.felderWahl.find((f) => f.feld.schluessel === s)?.ort;
  const hier = ort(alle[0] ?? '');
  const moeglich = (a.profil.gruppen ?? []).filter((x) => x.id !== g.id && !liegtIn(a.profil, x.id, g.id) && alleFelder(a.profil, x).some((s) => ort(s) === hier));
  const setzen = (teil: Partial<Gruppe>) =>
    a.aendern((p) => {
      p.gruppen = p.gruppen!.map((x) => (x.id === g.id ? { ...x, ...teil } : x));
    });
  const vorschlag = felder.map((f) => f.titel).join(' / ');
  return (
    <>
      <div className="fo-ein-was">
        <span className="fo-ein-typ">Gruppe</span>
        <strong>{g.titel?.trim() || vorschlag}</strong>
        <span className="muted small-text">
          {alle.length} Felder{unter.length ? ` in ${unter.length + (felder.length ? 1 : 0)} Teilen` : ''} zählen als eine Angabe
        </span>
      </div>
      <Abschnitt_ titel="Name">
        <TitelFeld wert={g.titel ?? ''} vorschlag={vorschlag} label="Name der Gruppe" onSetzen={(titel) => setzen({ titel })} />
      </Abschnitt_>
      <Abschnitt_ titel="Ausgefüllt, wenn …">
        <div className="fo-ein-regeln" role="radiogroup" aria-label="Wann die Gruppe ausgefüllt ist">
          {REGELN.map((r) => (
            <label key={r.id} className={`fo-ein-regel${g.regel === r.id ? ' an' : ''}`}>
              <input type="radio" name={`regel-${g.id}`} checked={g.regel === r.id} onChange={() => setzen({ regel: r.id as Regel })} />
              <span>
                <strong>{r.text}</strong>
                <span className="muted small-text">{r.lang}</span>
              </span>
            </label>
          ))}
        </div>
      </Abschnitt_>
      <Abschnitt_ titel="Teil von">
        <div className="fo-ein-zeilen">
          <select
            value={g.in ?? ''}
            aria-label="Übergeordnete Gruppe"
            onChange={(e) =>
              a.aendern((p) => {
                p.gruppen = p.gruppen!.map((x) => (x.id === g.id ? { ...x, in: e.target.value || undefined } : x));
              })
            }
          >
            <option value="">– keiner Gruppe (zählt selbst als Angabe) –</option>
            {moeglich.map((x) => (
              <option key={x.id} value={x.id}>
                {name(x)}
              </option>
            ))}
          </select>
          {oben && (
            <button className="small" onClick={() => onGruppe(oben.id)}>
              Zur übergeordneten
            </button>
          )}
        </div>
      </Abschnitt_>
      {unter.length > 0 && (
        <Abschnitt_ titel="Untergruppen">
          <ul className="fo-ein-liste">
            {unter.map((u) => (
              <li key={u.id}>
                <button className="fo-ein-link" onClick={() => onGruppe(u.id)}>
                  {name(u)} <span className="muted small-text">({REGELN.find((r) => r.id === u.regel)?.text})</span>
                </button>
                <button className="icon" aria-label={`${name(u)} herausnehmen`} title="Aus dieser Gruppe nehmen" onClick={() => a.aendern((p) => gruppeHoch(p, u.id))}>
                  <Symbol name="schliessen" />
                </button>
              </li>
            ))}
          </ul>
        </Abschnitt_>
      )}
      <Abschnitt_ titel="Felder">
        <ul className="fo-ein-liste">
          {!felder.length && <li className="muted small-text">keine direkt – nur Untergruppen</li>}
          {felder.map((f) => (
            <li key={f.feld.schluessel}>
              <button className="fo-ein-link" onClick={() => onFeld(f.feld.schluessel)}>
                {f.feld.art === 'kreuz' ? '☐ ' : ''}
                {f.titel}
              </button>
              <button className="icon" aria-label={`${f.titel} aus der Gruppe nehmen`} title="Aus der Gruppe nehmen" onClick={() => a.aendern((p) => ausGruppe(p, f.feld.schluessel))}>
                <Symbol name="schliessen" />
              </button>
            </li>
          ))}
        </ul>
      </Abschnitt_>
      <Abschnitt_ titel="Erforderlich">{editor(g.bedingung, (bedingung) => setzen({ bedingung }), alle)}</Abschnitt_>
      <button className="small gefahr" onClick={() => a.aendern((p) => gruppeAufloesen(p, g.id))}>
        Gruppe auflösen – {oben ? 'ihre Teile kommen in die übergeordnete' : 'Felder und Untergruppen zählen wieder einzeln'}
      </button>
    </>
  );
}

function bedingungFuer(a: Aufbau, felder: string[], b: Bedingung | undefined) {
  a.aendern((p) => {
    p.bedingungen = { ...p.bedingungen };
    for (const s of felder) {
      if (b) p.bedingungen[s] = b;
      else delete p.bedingungen[s];
    }
  });
}

function FeldEinstellungen({ a, offen, f, ab, seite, editor, onGruppe }: { a: Aufbau; offen: OffenesFormular; f: Feld; ab: Abschnitt; seite: number; editor: Editor; onGruppe: (id: string) => void }) {
  const g = gruppeVon(a.profil, f.schluessel);
  const zaehlt = a.profil.zaehlt[f.schluessel] !== false;
  const inhalt = vorschau(offen, f);
  return (
    <>
      <div className="fo-ein-was">
        <span className="fo-ein-typ">{f.art === 'kreuz' ? 'Kästchen' : 'Textfeld'}</span>
        <strong>{feldTitel(f, a.profil)}</strong>
        <span className="muted small-text">
          Seite {seite + 1} · {abschnittTitel(ab, a.profil)} · in FORMA „{f.name}“{inhalt ? ` · ${inhalt}` : ''}
        </span>
      </div>
      <Abschnitt_ titel="Titel in der Gliederung">
        <TitelFeld
          wert={a.profil.feldTitel?.[f.schluessel] ?? ''}
          vorschlag={f.beschriftung}
          label={`Feldtitel für ${f.beschriftung}`}
          onSetzen={(t) =>
            a.aendern((p) => {
              p.feldTitel = { ...p.feldTitel, [f.schluessel]: t };
            })
          }
        />
      </Abschnitt_>
      <Abschnitt_ titel="Füllstand">
        {g ? (
          <p className="small-text">
            Zählt über die Gruppe{' '}
            <button className="fo-ein-link" onClick={() => onGruppe(g.id)}>
              „{g.titel?.trim() || 'ohne Namen'}“
            </button>{' '}
            ({REGELN.find((r) => r.id === g.regel)?.text}).{' '}
            <button className="small" onClick={() => a.aendern((p) => ausGruppe(p, f.schluessel))}>
              Aus der Gruppe nehmen
            </button>
          </p>
        ) : (
          <Schalter
            an={zaehlt}
            label="Zählt für den Füllstand"
            onChange={(an) =>
              a.aendern((p) => {
                p.zaehlt[f.schluessel] = an;
              })
            }
          >
            Zählt für den Füllstand
          </Schalter>
        )}
      </Abschnitt_>
      <Abschnitt_ titel="Erforderlich">{editor(a.profil.bedingungen?.[f.schluessel], (b) => bedingungFuer(a, [f.schluessel], b), [f.schluessel])}</Abschnitt_>
    </>
  );
}

function Mehrfach({ a, felder, gruppen, editor, onGruppe }: { a: Aufbau; felder: { f: Feld; ab: Abschnitt }[]; gruppen: Gruppe[]; editor: Editor; onGruppe: (id: string) => void }) {
  const [regel, setRegel] = useState<Regel>('eins');
  const schluessel = felder.map((x) => x.f.schluessel);
  const ort = (s: string) => a.felderWahl.find((f) => f.feld.schluessel === s)?.ort;
  const einAbschnitt = new Set([...schluessel, ...gruppen.flatMap((g) => alleFelder(a.profil, g))].map(ort)).size === 1;
  const bedingungen = schluessel.map((s) => JSON.stringify(a.profil.bedingungen?.[s] ?? null));
  const gleich = bedingungen.every((b) => b === bedingungen[0]);
  const bilden = () => {
    let neueId = '';
    a.aendern((p) => {
      const neu = gruppeBilden(
        p,
        schluessel,
        regel,
        gruppen.map((g) => g.id),
      );
      neueId = neu.gruppen![neu.gruppen!.length - 1].id;
      return neu;
    });
    if (neueId) onGruppe(neueId);
  };
  return (
    <>
      <div className="fo-ein-was">
        <span className="fo-ein-typ">Auswahl</span>
        <strong>
          {[felder.length && `${felder.length} ${felder.length === 1 ? 'Feld' : 'Felder'}`, gruppen.length && `${gruppen.length} ${gruppen.length === 1 ? 'Gruppe' : 'Gruppen'}`]
            .filter(Boolean)
            .join(', ')}
        </strong>
        <span className="muted small-text">{[...gruppen.map((g) => g.titel?.trim() || 'Gruppe'), ...felder.map((x) => feldTitel(x.f, a.profil))].join(', ')}</span>
      </div>
      <Abschnitt_ titel="Als eine Angabe zählen">
        {einAbschnitt ? (
          <div className="fo-ein-zeilen">
            <select value={regel} aria-label="Wann die neue Gruppe ausgefüllt ist" onChange={(e) => setRegel(e.target.value as Regel)}>
              {REGELN.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.text}
                </option>
              ))}
            </select>
            <button className="primary small" onClick={bilden}>
              <Symbol name="gruppe" /> Gruppe bilden
            </button>
          </div>
        ) : (
          <p className="muted small-text">Nur Felder und Gruppen desselben Abschnitts lassen sich gruppieren.</p>
        )}
        {gruppen.length > 0 && <p className="muted small-text">Die gewählten Gruppen werden Untergruppen der neuen.</p>}
      </Abschnitt_>
      {felder.length > 0 && (
        <Abschnitt_ titel="Füllstand">
          <div className="fo-ein-zeilen">
            <button className="small" onClick={() => a.aendern((p) => void schluessel.forEach((s) => (p.zaehlt[s] = true)))}>
              Alle zählen
            </button>
            <button className="small" onClick={() => a.aendern((p) => void schluessel.forEach((s) => (p.zaehlt[s] = false)))}>
              Keins zählt
            </button>
          </div>
        </Abschnitt_>
      )}
      {felder.length > 0 && (
        <Abschnitt_ titel="Erforderlich – für alle gewählten Felder">
          {!gleich && <p className="muted small-text">Die Felder haben unterschiedliche Bedingungen – eine neue ersetzt sie bei allen.</p>}
          {editor(gleich ? a.profil.bedingungen?.[schluessel[0]] : undefined, (b) => bedingungFuer(a, schluessel, b), schluessel)}
        </Abschnitt_>
      )}
    </>
  );
}
