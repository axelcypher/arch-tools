import type { ReactNode } from 'react';
import { useMemo, useState } from 'react';
import { useAntrag } from '../antragStore';
import type { Bedingung, BedingungKontext, Merkmal } from '../bedingung';
import { bedingungText, erfuellt, fehlendeMerkmale } from '../bedingung';
import type { Abschnitt, Feld } from '../forma/felder';
import { abschnitte } from '../forma/felder';
import { useHervorheben } from '../markierung';
import { springeZuFeld } from '../navigation';
import type { Einheit, FormularProfil, Gruppe, Regel } from '../profil';
import { abschnittErforderlich, abschnittId, ausGruppe, ausgefuellt, einheiten, einheitTitel, feldTitel, formularKontext, gruppeBilden, gruppenIm, leeresProfil, profilKopie, profilSchluessel, REGELN } from '../profil';
import type { OffenesFormular } from '../store';
import { useFormulare, wertVon } from '../store';
import { umfangZeigen } from './Antrag';
import type { FeldWahl } from './BedingungEditor';
import { BedingungEditor } from './BedingungEditor';
import { Symbol } from './Symbol';

interface Punkt {
  id: string;
  abschnitt: Abschnitt;
  erkannt: string;
  titel: string;
  sichtbar: boolean;
  einheiten: { einheit: Einheit; voll: boolean }[];
  /** nach seiner Bedingung erforderlich */
  erforderlich: boolean;
  gesamt: number;
  gefuellt: number;
  geaendert: boolean;
}

const schluesselVon = (felder: Feld[]) => felder.map((f) => f.schluessel);

/** was die Bearbeitung von Bedingungen braucht */
interface Bed {
  k: BedingungKontext;
  merkmale: Merkmal[];
  felder: FeldWahl[];
  /** Name eines Felds für die Beschreibung */
  name: (schluessel: string) => { titel: string; kreuz: boolean } | undefined;
  /** welcher Editor offen ist: `a:<Abschnitt>`, `g:<Gruppe>`, `f:<Feld>` */
  offen: string | null;
  setOffen: (k: string | null) => void;
}

/** Knopf, der den Bedingungs-Editor eines Eintrags öffnet (hervorgehoben, wenn es eine Bedingung gibt) */
function BedingungKnopf({ id, bedingung, bed, wofuer }: { id: string; bedingung: Bedingung | undefined; bed: Bed; wofuer: string }) {
  const aktiv = bed.offen === id;
  return (
    <button
      className={`icon fo-gl-bed${bedingung?.length ? ' gesetzt' : ''}${aktiv ? ' active' : ''}`}
      aria-label={`Bedingung für ${wofuer}`}
      aria-expanded={aktiv}
      title={bedingung?.length ? `Nur erforderlich, wenn ${bedingungText(bedingung, bed.name)}` : 'Bedingung: nur erforderlich, wenn …'}
      onClick={() => bed.setOffen(aktiv ? null : id)}
    >
      <Symbol name="bedingung" />
    </button>
  );
}

/** Beschreibung bzw. Editor unter einem Eintrag */
function BedingungZeile({ id, bedingung, bed, onChange, ohne, entfaellt }: { id: string; bedingung: Bedingung | undefined; bed: Bed; onChange: (b: Bedingung | undefined) => void; ohne?: string[]; entfaellt: boolean }) {
  if (bed.offen === id) return <BedingungEditor wert={bedingung} onChange={onChange} merkmale={bed.merkmale} felder={bed.felder} ohne={ohne} />;
  if (!bedingung?.length) return null;
  return (
    <p className={`fo-gl-bed-text${entfaellt ? ' entfaellt' : ''}`}>
      {entfaellt ? 'entfällt – ' : ''}nur wenn {bedingungText(bedingung, bed.name)}
    </p>
  );
}

/**
 * Gliederung des offenen Formulars: Seiten und Abschnitte mit Füllstand – ein Klick springt hin, Zeigen hebt die
 * Felder im Formular hervor, aufgeklappt erscheinen die einzelnen Angaben. Steht als eigener Bereich am Formular
 * (nicht in der Navigation). Über „Anpassen“ lässt sich je Formular einstellen, welche Abschnitte erscheinen, wie
 * Abschnitte und Felder heißen, welche Felder in den Füllstand eingehen und welche zusammen als eine Angabe
 * zählen. Verweilt man dort drei Sekunden auf einem Eintrag, wird er im Formular umrandet.
 */
export function Gliederung({ offen }: { offen: OffenesFormular }) {
  const schluessel = profilSchluessel(offen.formular, offen.name);
  const gespeichert = useFormulare((s) => s.profile[schluessel]);
  const { profilSetzen, setGliederungOffen } = useFormulare.getState();
  const profil: FormularProfil = gespeichert ?? leeresProfil();
  const [anpassen, setAnpassen] = useState(false);
  const [aufgeklappt, setAufgeklappt] = useState<string | null>(null);
  const [offeneAbschnitte, setOffeneAbschnitte] = useState<Set<string>>(() => new Set());
  const [bedingungOffen, setBedingungOffen] = useState<string | null>(null);
  const merkmalWerte = useAntrag((s) => s.projektdatei?.merkmale);
  const merkmalDefinitionen = useAntrag((s) => s.merkmalDefinitionen);
  const hervor = useHervorheben();
  const k = useMemo(() => formularKontext(merkmalWerte ?? {}, offen.felder.flat(), (f) => wertVon(offen, f)), [merkmalWerte, offen]);

  const seiten = useMemo(
    () =>
      offen.felder.map((felder, i) => ({
        i,
        punkte: abschnitte(felder).map((a): Punkt => {
          const id = abschnittId(a);
          const p = profil.abschnitte[id];
          const erkannt = a.titel || a.felder[0].beschriftung;
          const erforderlich = abschnittErforderlich(a, profil, k);
          const e = einheiten(a, profil, k).map((einheit) => ({ einheit, voll: ausgefuellt(einheit, (f) => wertVon(offen, f)) }));
          const zaehlen = erforderlich ? e.filter((x) => !x.einheit.entfaellt) : [];
          return {
            id,
            abschnitt: a,
            erkannt,
            titel: p?.titel || erkannt,
            sichtbar: p?.sichtbar !== false,
            einheiten: e,
            erforderlich,
            gesamt: zaehlen.length,
            gefuellt: zaehlen.filter((x) => x.voll).length,
            geaendert: a.felder.some((f) => f.schluessel in offen.aenderungen),
          };
        }),
      })),
    [offen, profil, k],
  );

  // Felder zur Wahl in Bedingungen und ihre Namen
  const bed: Bed = useMemo(() => {
    const felder: FeldWahl[] = seiten.flatMap((s) => s.punkte.flatMap((p) => p.abschnitt.felder.map((f) => ({ feld: f, titel: feldTitel(f, profil), ort: `Seite ${s.i + 1} · ${p.titel}` }))));
    const nach = new Map(felder.map((f) => [f.feld.schluessel, f]));
    return {
      k,
      merkmale: merkmalDefinitionen,
      felder,
      name: (x: string) => (nach.has(x) ? { titel: nach.get(x)!.titel, kreuz: nach.get(x)!.feld.art === 'kreuz' } : undefined),
      offen: bedingungOffen,
      setOffen: setBedingungOffen,
    };
  }, [seiten, profil, k, merkmalDefinitionen, bedingungOffen]);

  // Bedingungen, deren Projektmerkmal im Projekt noch fehlt
  const fehlend = [
    ...new Set(
      [...Object.values(profil.abschnitte).map((a) => a.bedingung), ...(profil.gruppen ?? []).map((g) => g.bedingung), ...Object.values(profil.bedingungen ?? {})].flatMap((b) =>
        fehlendeMerkmale(b, merkmalWerte ?? {}),
      ),
    ),
  ];

  const sichtbare = seiten.flatMap((s) => s.punkte.filter((p) => p.sichtbar && p.erforderlich));
  const gesamt = sichtbare.reduce((n, p) => n + p.gesamt, 0);
  const gefuellt = sichtbare.reduce((n, p) => n + p.gefuellt, 0);

  const aendern = (f: (p: FormularProfil) => FormularProfil | void) => {
    const kopie = profilKopie(profil);
    profilSetzen(schluessel, f(kopie) ?? kopie);
  };
  const abschnittSetzen = (id: string, teil: { sichtbar?: boolean; titel?: string }) =>
    aendern((p) => {
      p.abschnitte[id] = { ...p.abschnitte[id], ...teil };
    });
  const umschalten = (id: string) =>
    setOffeneAbschnitte((s) => {
      const neu = new Set(s);
      if (!neu.delete(id)) neu.add(id);
      return neu;
    });
  const abschnittBereich = (a: Abschnitt) => ({ felder: schluesselVon(a.felder), bereich: a.rahmen ? { seite: a.felder[0].seite, kasten: a.rahmen } : null });

  return (
    <nav className={`fo-gliederung${anpassen ? ' anpassen' : ''}`} aria-label="Inhalt des Formulars">
      <div className="fo-gl-kopf">
        <div className="fo-gl-kopf-text">
          <span className="fo-gl-art">
            <Symbol name="liste" /> Inhalt des Formulars
          </span>
          <strong title={offen.name}>{offen.name}</strong>
          <span className="fo-gl-fortschritt" title="Ausgefüllte Angaben in den angezeigten Abschnitten">
            <span className="fo-gl-balken">
              <span style={{ width: `${gesamt ? Math.round((gefuellt / gesamt) * 100) : 0}%` }} />
            </span>
            {gefuellt} von {gesamt}
          </span>
        </div>
        <div className="fo-gl-kopf-knoepfe">
          <button className={`icon${anpassen ? ' active' : ''}`} title="Gliederung und Füllstand für dieses Formular anpassen" aria-label="Gliederung anpassen" onClick={() => setAnpassen(!anpassen)}>
            <Symbol name="stift" />
          </button>
          <button className="icon" title="Gliederung ausblenden" aria-label="Gliederung ausblenden" onClick={() => setGliederungOffen(false)}>
            <Symbol name="schliessen" />
          </button>
        </div>
      </div>

      {fehlend.length > 0 && (
        <div className="fo-gl-merkmal">
          <span>
            Für die Bedingungen dieses Formulars fehlt im Projekt: <strong>{fehlend.join(', ')}</strong>
          </span>
          <button className="small" onClick={umfangZeigen}>
            Festlegen …
          </button>
        </div>
      )}

      {anpassen && (
        <div className="fo-gl-hinweis">
          <span>
            Gilt für dieses Formular in allen Projekten. Auge: in der Gliederung zeigen; Titel überschreiben; aufklappen, um Felder umzubenennen, vom Füllstand auszunehmen oder zu einer
            Angabe zu gruppieren. <Symbol name="bedingung" /> knüpft Abschnitte, Gruppen und Felder an Bedingungen (Projektmerkmal wie Gebäudeklasse oder anderes Feld) – trifft
            sie nicht zu, entfallen sie. Drei Sekunden auf einem Eintrag verweilen umrandet ihn im Formular.
          </span>
          {gespeichert && (
            <button className="small" onClick={() => profilSetzen(schluessel, null)}>
              Vorgabe wiederherstellen
            </button>
          )}
        </div>
      )}

      {seiten.map((s) => {
        const punkte = anpassen ? s.punkte : s.punkte.filter((p) => p.sichtbar);
        return (
          <div key={s.i} className="fo-gl-gruppe">
            <button className="fo-gl-seite" onClick={() => document.querySelector(`[data-seite="${s.i}"]`)?.scrollIntoView({ block: 'start', behavior: 'smooth' })}>
              Seite {s.i + 1}
            </button>
            {punkte.map((p) =>
              anpassen ? (
                <div key={p.id} className={`fo-gl-anpassen${p.sichtbar ? '' : ' versteckt'}${p.erforderlich ? '' : ' entfaellt'}`}>
                  <div className="fo-gl-anpassen-zeile" {...hervor(abschnittBereich(p.abschnitt), true)}>
                    <button
                      className="icon"
                      aria-label={p.sichtbar ? 'In der Gliederung ausblenden' : 'In der Gliederung zeigen'}
                      title={p.sichtbar ? 'In der Gliederung ausblenden' : 'In der Gliederung zeigen'}
                      onClick={() => abschnittSetzen(p.id, { sichtbar: !p.sichtbar })}
                    >
                      <Symbol name={p.sichtbar ? 'auge' : 'augeZu'} />
                    </button>
                    <input
                      key={`${p.id}|${p.titel}`}
                      defaultValue={profil.abschnitte[p.id]?.titel ?? ''}
                      placeholder={p.erkannt}
                      aria-label={`Titel für ${p.erkannt}`}
                      onBlur={(e) => e.target.value !== (profil.abschnitte[p.id]?.titel ?? '') && abschnittSetzen(p.id, { titel: e.target.value })}
                    />
                    <Zahl punkt={p} />
                    <BedingungKnopf id={`a:${p.id}`} bedingung={profil.abschnitte[p.id]?.bedingung} bed={bed} wofuer={`Abschnitt ${p.titel}`} />
                    <button
                      className="icon"
                      aria-expanded={aufgeklappt === p.id}
                      aria-label="Felder"
                      title="Felder: umbenennen, zählen, gruppieren"
                      onClick={() => setAufgeklappt(aufgeklappt === p.id ? null : p.id)}
                    >
                      <Symbol name={aufgeklappt === p.id ? 'pfeilUnten' : 'pfeilRechts'} />
                    </button>
                  </div>
                  <BedingungZeile
                    id={`a:${p.id}`}
                    bedingung={profil.abschnitte[p.id]?.bedingung}
                    bed={bed}
                    entfaellt={!p.erforderlich}
                    ohne={schluesselVon(p.abschnitt.felder)}
                    onChange={(b) =>
                      aendern((pr) => {
                        pr.abschnitte[p.id] = { ...pr.abschnitte[p.id], bedingung: b };
                      })
                    }
                  />
                  {aufgeklappt === p.id && <FelderAnpassen abschnitt={p.abschnitt} profil={profil} aendern={aendern} hervor={hervor} bed={bed} />}
                </div>
              ) : (
                <div key={p.id} className={`fo-gl-punkt${p.erforderlich ? '' : ' entfaellt'}`}>
                  <div className="fo-gl-zeile">
                    <button
                      className="fo-gl-abschnitt"
                      title={p.erforderlich ? p.titel : `${p.titel} – entfällt: nur wenn ${bedingungText(profil.abschnitte[p.id]?.bedingung, bed.name)}`}
                      onClick={() => springeZuFeld(p.abschnitt.felder[0].schluessel)}
                      {...hervor({ felder: schluesselVon(p.abschnitt.felder) })}
                    >
                      <span className="fo-gl-titel">
                        {p.titel}
                        {p.geaendert && <span className="fo-ungespeichert"> ●</span>}
                      </span>
                      {p.erforderlich ? <Zahl punkt={p} /> : <span className="fo-gl-entfaellt">entfällt</span>}
                    </button>
                    {p.einheiten.length > 1 ? (
                      <button
                        className="icon fo-gl-auf"
                        aria-expanded={offeneAbschnitte.has(p.id)}
                        aria-label={`Angaben in ${p.titel}`}
                        title={offeneAbschnitte.has(p.id) ? 'Angaben zuklappen' : 'Angaben zeigen'}
                        onClick={() => umschalten(p.id)}
                      >
                        <Symbol name={offeneAbschnitte.has(p.id) ? 'pfeilUnten' : 'pfeilRechts'} />
                      </button>
                    ) : (
                      <span className="fo-gl-auf" />
                    )}
                  </div>
                  {offeneAbschnitte.has(p.id) && p.einheiten.length > 1 && (
                    <div className="fo-gl-unter">
                      {p.einheiten.map(({ einheit: e, voll }) => {
                        const titel = einheitTitel(e, profil);
                        const weg = !p.erforderlich || !!e.entfaellt;
                        return (
                          <button
                            key={e.id}
                            className={`fo-gl-einheit${weg ? ' entfaellt' : ''}`}
                            title={weg ? `${titel} – entfällt (Bedingung trifft nicht zu)` : titel}
                            onClick={() => springeZuFeld(e.felder[0].schluessel)}
                            {...hervor({ felder: schluesselVon(e.felder) })}
                          >
                            <span className="fo-gl-titel">{titel}</span>
                            {weg ? (
                              <span className="fo-gl-entfaellt">entfällt</span>
                            ) : (
                              <span className={`fo-gl-status${voll ? ' voll' : ''}`} aria-label={voll ? 'ausgefüllt' : 'offen'}>
                                {voll ? '✓' : ''}
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              ),
            )}
          </div>
        );
      })}
    </nav>
  );
}

/** Füllstand eines Abschnitts: „2/5“ bzw. ✓ */
function Zahl({ punkt: p }: { punkt: Punkt }) {
  if (!p.gesamt) return null;
  const voll = p.gefuellt === p.gesamt;
  return (
    <span className={`fo-gl-zahl${voll ? ' voll' : ''}`} title={`${p.gefuellt} von ${p.gesamt} Angaben ausgefüllt`}>
      {voll ? '✓' : `${p.gefuellt}/${p.gesamt}`}
    </span>
  );
}

type Aendern = (f: (p: FormularProfil) => FormularProfil | void) => void;
type Hervor = ReturnType<typeof useHervorheben>;

/**
 * Felder eines Abschnitts im Anpassen-Modus: eigene Gruppen mit Namen und Regel, darunter die übrigen Felder.
 * Jedes Feld lässt sich umbenennen und vom Füllstand ausnehmen; angehakte Felder werden zu einer Gruppe.
 */
function FelderAnpassen({ abschnitt, profil, aendern, hervor, bed }: { abschnitt: Abschnitt; profil: FormularProfil; aendern: Aendern; hervor: Hervor; bed: Bed }) {
  const [auswahl, setAuswahl] = useState<Set<string>>(() => new Set());
  const gruppen = gruppenIm(abschnitt, profil);
  const gruppiert = new Set(gruppen.flatMap((g) => g.felder));
  const frei = abschnitt.felder.filter((f) => !gruppiert.has(f.schluessel));
  const gewaehlt = frei.filter((f) => auswahl.has(f.schluessel));

  const gruppeSetzen = (id: string, teil: Partial<Gruppe>) =>
    aendern((p) => {
      p.gruppen = p.gruppen!.map((g) => (g.id === id ? { ...g, ...teil } : g));
    });
  const bilden = () => {
    aendern((p) => gruppeBilden(p, schluesselVon(gewaehlt)));
    setAuswahl(new Set());
  };

  return (
    <div className="fo-gl-felder">
      {gruppen.map((g) => {
        const felder = abschnitt.felder.filter((f) => g.felder.includes(f.schluessel));
        const vorschlag = felder.map((f) => feldTitel(f, profil)).join(' / ');
        return (
          <div key={g.id} className={`fo-gl-feldgruppe${g.regel === 'nie' ? ' zaehlt-nicht' : ''}`}>
            <div className="fo-gl-feldgruppe-kopf" {...hervor({ felder: g.felder }, true)}>
              <Symbol name="gruppe" />
              <input key={`${g.id}|${g.titel ?? ''}`} defaultValue={g.titel ?? ''} placeholder={vorschlag} aria-label="Name der Gruppe" onBlur={(e) => e.target.value !== (g.titel ?? '') && gruppeSetzen(g.id, { titel: e.target.value })} />
              <select value={g.regel} aria-label="Wann die Gruppe ausgefüllt ist" title={REGELN.find((r) => r.id === g.regel)?.lang} onChange={(e) => gruppeSetzen(g.id, { regel: e.target.value as Regel })}>
                {REGELN.map((r) => (
                  <option key={r.id} value={r.id} title={r.lang}>
                    {r.text}
                  </option>
                ))}
              </select>
              <BedingungKnopf id={`g:${g.id}`} bedingung={g.bedingung} bed={bed} wofuer={`Gruppe ${g.titel || vorschlag}`} />
              <button className="icon" aria-label="Gruppe auflösen" title="Gruppe auflösen – die Felder zählen wieder einzeln" onClick={() => aendern((p) => void (p.gruppen = p.gruppen!.filter((x) => x.id !== g.id)))}>
                <Symbol name="schliessen" />
              </button>
            </div>
            <BedingungZeile id={`g:${g.id}`} bedingung={g.bedingung} bed={bed} entfaellt={!erfuellt(g.bedingung, bed.k)} ohne={g.felder} onChange={(b) => gruppeSetzen(g.id, { bedingung: b })} />
            {felder.map((f) => (
              <FeldZeile key={f.schluessel} feld={f} profil={profil} aendern={aendern} hervor={hervor} bed={bed}>
                <button className="icon" aria-label="Aus der Gruppe nehmen" title="Aus der Gruppe nehmen" onClick={() => aendern((p) => ausGruppe(p, f.schluessel))}>
                  <Symbol name="schliessen" />
                </button>
              </FeldZeile>
            ))}
          </div>
        );
      })}

      {frei.map((f) => {
        const zaehlt = profil.zaehlt[f.schluessel] !== false;
        return (
          <FeldZeile
            key={f.schluessel}
            feld={f}
            profil={profil}
            aendern={aendern}
            hervor={hervor}
            bed={bed}
            vorne={
              <input
                type="checkbox"
                className="fo-gl-wahl"
                aria-label={`${f.beschriftung} auswählen`}
                title="Zum Gruppieren auswählen"
                checked={auswahl.has(f.schluessel)}
                onChange={(e) =>
                  setAuswahl((s) => {
                    const neu = new Set(s);
                    if (e.target.checked) neu.add(f.schluessel);
                    else neu.delete(f.schluessel);
                    return neu;
                  })
                }
              />
            }
            zaehltNicht={!zaehlt}
          >
            <button
              className={`icon fo-gl-zaehlt${zaehlt ? ' an' : ''}`}
              aria-pressed={zaehlt}
              aria-label="Zählt für den Füllstand"
              title={zaehlt ? 'Zählt für den Füllstand – klicken, um es auszunehmen' : 'Zählt nicht für den Füllstand – klicken, um es mitzuzählen'}
              onClick={() =>
                aendern((p) => {
                  p.zaehlt[f.schluessel] = !zaehlt;
                })
              }
            >
              <Symbol name={zaehlt ? 'haken' : 'strich'} />
            </button>
          </FeldZeile>
        );
      })}

      <div className="fo-gl-gruppieren">
        {gewaehlt.length >= 2 ? (
          <button className="small primary" onClick={bilden}>
            <Symbol name="gruppe" /> {gewaehlt.length} Felder als eine Angabe zählen
          </button>
        ) : (
          <span className="small-text muted">Felder anhaken, um sie als eine Angabe zu zählen (z. B. Mehrfachauswahl).</span>
        )}
      </div>
    </div>
  );
}

function FeldZeile({
  feld: f,
  profil,
  aendern,
  hervor,
  bed,
  vorne,
  zaehltNicht,
  children,
}: {
  feld: Feld;
  profil: FormularProfil;
  aendern: Aendern;
  hervor: Hervor;
  bed: Bed;
  vorne?: ReactNode;
  zaehltNicht?: boolean;
  children?: ReactNode;
}) {
  const eigen = profil.feldTitel?.[f.schluessel] ?? '';
  const bedingung = profil.bedingungen?.[f.schluessel];
  return (
    <>
      <div className={`fo-gl-feld${zaehltNicht ? ' zaehlt-nicht' : ''}${erfuellt(bedingung, bed.k) ? '' : ' entfaellt'}`} title={f.hinweis} {...hervor({ felder: [f.schluessel] }, true)}>
        {vorne ?? <span className="fo-gl-einzug" />}
        <span className="fo-gl-feld-art" aria-hidden>
          {f.art === 'kreuz' ? '☐' : 'T'}
        </span>
        <input
          key={`${f.schluessel}|${eigen}`}
          className="fo-gl-feld-titel"
          defaultValue={eigen}
          placeholder={f.beschriftung}
          aria-label={`Feldtitel für ${f.beschriftung}`}
          onBlur={(e) =>
            e.target.value !== eigen &&
            aendern((p) => {
              p.feldTitel![f.schluessel] = e.target.value;
            })
          }
        />
        <BedingungKnopf id={`f:${f.schluessel}`} bedingung={bedingung} bed={bed} wofuer={`Feld ${feldTitel(f, profil)}`} />
        {children}
      </div>
      <BedingungZeile
        id={`f:${f.schluessel}`}
        bedingung={bedingung}
        bed={bed}
        entfaellt={!erfuellt(bedingung, bed.k)}
        ohne={[f.schluessel]}
        onChange={(b) =>
          aendern((p) => {
            p.bedingungen = { ...p.bedingungen };
            if (b) p.bedingungen[f.schluessel] = b;
            else delete p.bedingungen[f.schluessel];
          })
        }
      />
    </>
  );
}
