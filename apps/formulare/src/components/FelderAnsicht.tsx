import { useEffect, useMemo, useRef } from 'react';
import type { Feld } from '../forma/felder';
import { abschnitte, abschnittsReihen, zeilen } from '../forma/felder';
import { useMarkierung } from '../markierung';
import { feldTasten } from '../navigation';
import type { Entfall } from '../entfall';
import type { FormularProfil } from '../profil';
import { abschnittId, feldTitel, formularKontext, gruppeVon, leeresProfil, profilSchluessel } from '../profil';
import type { FeldFilter } from '../pruefen';
import { useFeldFilter, zurNaechstenOffenen } from '../pruefen';
import { offeneAngaben } from '../pruefliste';
import type { OffenesFormular } from '../store';
import { useFormulare, useProfil, wertVon } from '../store';
import { EntfallInfo, grundSignatur, hinweisPerF1, useEntfallen } from './EntfallInfo';
import { HinweisSymbol, hinweiseJeFeld, usePlausibel } from './Hinweise';
import type { Plausi } from '../plausibel';
import { useVorbelegt } from '../merkmalAbgleich';
import { springeZuFeld } from '../navigation';
import { anzahl } from '../text';

const FILTER: { id: FeldFilter; label: string; title: string }[] = [
  { id: 'alle', label: 'Alle', title: 'Alle Felder' },
  { id: 'offen', label: 'Offene', title: 'Was fehlt noch? Genau die Angaben, die im Füllstand fehlen – ohne entfallene und nicht zählende Felder' },
  { id: 'geaendert', label: 'Geänderte', title: 'Seit dem Speichern geänderte Felder' },
];

/**
 * Feldansicht: die Felder im Aufbau des Formulars – Abschnitte, die auf dem Papier nebeneinander stehen,
 * auch hier nebeneinander, Felder einer Zeile in einer Zeile –, aber in gut lesbarer Größe und durchsuchbar.
 */
export function FelderAnsicht({ offen, gesperrt }: { offen: OffenesFormular; gesperrt: boolean }) {
  const { suche, filter, setSuche, setFilter } = useFeldFilter();
  const q = suche.trim().toLowerCase();
  const markierung = useMarkierung((s) => s.markierung);
  const markiert = useMemo(() => new Set(markierung?.felder), [markierung]);
  const huelle = useRef<HTMLDivElement>(null);
  const roh = useProfil(profilSchluessel(offen.formular, offen.name));
  const profil = useMemo(() => ({ ...leeresProfil(), ...roh }), [roh]);
  const entfall = useEntfallen(offen);
  // Prüfliste: die offenen Angaben (wie im Füllstand)
  const liste = useMemo(
    () =>
      offeneAngaben(
        offen.felder,
        profil,
        formularKontext(entfall.merkmale, offen.felder.flat(), (f) => wertVon(offen, f)),
        (f) => wertVon(offen, f),
      ),
    [offen, profil, entfall.merkmale],
  );
  useEffect(() => {
    if (markierung?.rahmen) huelle.current?.querySelector('.fo-feld.umrandet')?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
  }, [markierung]);

  const seiten = useMemo(
    () =>
      offen.felder.map((felder, i) => {
        const passend = felder.filter((f) => {
          const w = wertVon(offen, f);
          if (filter === 'geaendert' && !(f.schluessel in offen.aenderungen)) return false;
          return !q || `${f.abschnitt} ${feldTitel(f, profil)} ${typeof w === 'string' ? w : ''}`.toLowerCase().includes(q);
        });
        return { i, reihen: abschnittsReihen(abschnitte(passend)), treffer: passend.length };
      }),
    [offen, q, filter, profil],
  );
  const treffer = seiten.reduce((n, s) => n + s.treffer, 0);
  // gesucht oder gefiltert: Seiten ohne Treffer fallen weg
  const eingeschraenkt = !!q || filter !== 'alle';
  const listeGefiltert = q ? liste.filter((o) => `${o.abschnitt} ${o.titel}`.toLowerCase().includes(q)) : liste;
  // gezählt wie in der Gliederung: „offen“ = fehlende Pflichtangaben, „ungeklärt“ = hängen an Antragsmerkmalen
  const zaehlung = (l: typeof liste) => {
    const ungeklaert = l.filter((o) => o.ungeklaert).length;
    return { offen: l.length - ungeklaert, ungeklaert };
  };
  const gesamt = zaehlung(liste);
  const gefiltert = zaehlung(listeGefiltert);
  // Hinweise (U-04, U-05), vorbelegte Kästchen (U-05)
  const hinweise = usePlausibel(offen);
  const hinweisFelder = useMemo(() => hinweiseJeFeld(hinweise), [hinweise]);
  const vorbelegt = useVorbelegt(offen);
  const entfallVon = (f: Feld) =>
    entfall.gruende.has(f.schluessel)
      ? { gruende: entfall.gruende.get(f.schluessel)!, text: entfall.text(f.schluessel) }
      : entfall.offen.has(f.schluessel)
        ? { gruende: entfall.offen.get(f.schluessel)!, text: entfall.text(f.schluessel), offen: true, merkmale: entfall.merkmale }
        : undefined;
  const eingabe = (f: Feld, ohneBeschriftung = false, ohneInfo = false) => (
    <FeldEingabe
      key={f.schluessel}
      feld={f}
      offen={offen}
      gesperrt={gesperrt}
      profil={profil}
      entfall={entfallVon(f)}
      ohneInfo={ohneInfo}
      hinweise={hinweisFelder.get(f.schluessel)}
      vorbelegt={vorbelegt.has(f.schluessel)}
      ohneBeschriftung={ohneBeschriftung}
      markiert={markiert.has(f.schluessel) ? (markierung?.rahmen ? 'umrandet' : 'markiert') : null}
    />
  );
  /** ein Abschnitt, dessen Felder alle aus demselben Grund entfallen bzw. offen sind: ein Symbol am Abschnitt (U-06) */
  const gebuendelt = (felder: Feld[]) => {
    if (felder.length < 2) return null;
    const e = felder.map(entfallVon);
    if (e.some((x) => !x)) return null;
    const sig = e.map((x) => grundSignatur(x!.gruende, !!x!.offen));
    return sig.every((x) => x === sig[0]) ? e[0]! : null;
  };
  const tasten = useMemo(() => feldTasten(offen.felder.flat()), [offen.felder]);

  return (
    <div className="fo-felder" ref={huelle} onKeyDown={(e) => hinweisPerF1(e) || tasten(e)}>
      <div className="fo-felder-kopf">
        <input
          type="search"
          className="fo-feldsuche"
          placeholder="Felder durchsuchen (Beschriftung oder Inhalt) …"
          aria-label="Felder durchsuchen"
          value={suche}
          onChange={(e) => setSuche(e.target.value)}
        />
        <div className="tb-group">
          {FILTER.map((f) => (
            <button key={f.id} className={filter === f.id ? 'active' : ''} title={f.title} onClick={() => setFilter(f.id)}>
              {f.label}
              {f.id === 'offen' && ` (${gesamt.offen})${gesamt.ungeklaert ? ` · ${gesamt.ungeklaert} ungeklärt` : ''}`}
            </button>
          ))}
        </div>
        <button className="small" title="Zur nächsten offenen Angabe springen (F8)" disabled={!liste.length} onClick={() => zurNaechstenOffenen()}>
          Nächste offene Angabe
        </button>
        {eingeschraenkt && filter !== 'offen' && <span className="muted small-text fo-treffer">{treffer === 1 ? '1 Treffer' : `${treffer} Treffer`}</span>}
      </div>
      {filter === 'offen' && (
        <section className="fo-pruefliste" aria-label="Was fehlt noch?">
          <h2>
            Was fehlt noch?{' '}
            <span className="muted">
              {anzahl(gefiltert.offen, 'offene Angabe', 'offene Angaben')}
              {gefiltert.ungeklaert > 0 && ` · ${gefiltert.ungeklaert} ungeklärt`}
            </span>
          </h2>
          {!listeGefiltert.length && <p className="muted small-text">{q ? 'Keine passenden offenen Angaben.' : 'Nach den Vorgaben der App keine offenen Angaben.'}</p>}
          {listeGefiltert.map((o) => (
            <div key={o.id} className={`fo-pruef-zeile${o.ungeklaert ? ' ungeklaert' : ''}`} data-angabe={o.id}>
              <div className="fo-pruef-kopf">
                <strong>{o.titel}</strong>
                <span className="muted small-text">
                  Seite {o.seite + 1} · {o.abschnitt}
                </span>
                {o.ungeklaert && (
                  <span className="fo-gl-offen" title={`hängt ab von: ${o.fehlend.join(', ')} (nicht festgelegt)`}>
                    ungeklärt
                  </span>
                )}
              </div>
              <div className="fo-zeile">{o.felder.map((f) => eingabe(f))}</div>
            </div>
          ))}
          {hinweise.length > 0 && (
            <>
              <h2>
                Hinweise <span className="muted">{hinweise.length === 1 ? '1 Hinweis' : `${hinweise.length} Hinweise`}</span>
              </h2>
              {hinweise.map((h, i) => (
                <div key={i} className={`fo-pruef-zeile hinweis${h.art === 'fehler' ? ' fehler' : ''}`}>
                  <div className="fo-pruef-kopf">
                    <strong>{h.art === 'fehler' ? 'Widerspruch' : 'Hinweis'}</strong>
                    <span>{h.text}</span>
                    {h.felder.length > 0 && (
                      <button className="small" onClick={() => springeZuFeld(h.felder[0])}>
                        Zum Feld
                      </button>
                    )}
                  </div>
                  {h.felder.length > 0 && (
                    <div className="fo-zeile">
                      {offen.felder
                        .flat()
                        .filter((f) => h.felder.includes(f.schluessel))
                        .map((f) => eingabe(f))}
                    </div>
                  )}
                </div>
              ))}
            </>
          )}
        </section>
      )}
      {filter !== 'offen' && eingeschraenkt && !treffer && <p className="muted small-text fo-keine-treffer">Keine passenden Felder.</p>}
      {filter !== 'offen' &&
        seiten
          .filter((s) => !eingeschraenkt || s.treffer > 0)
          .map((s) => (
            <section key={s.i} className="fo-seite-felder" data-seite={s.i}>
              <h2>
                Seite {s.i + 1} <span className="muted">von {seiten.length}</span>
              </h2>
              {!s.reihen.length && <p className="muted small-text">Auf dieser Seite gibt es keine Felder.</p>}
              {s.reihen.map((reihe, n) => (
                <div key={n} className="fo-reihe">
                  {reihe.map((a) => {
                    const titel = profil.abschnitte[abschnittId(a)]?.titel?.trim() || a.titel;
                    const buendel = gebuendelt(a.felder);
                    return (
                      <div key={a.felder[0].schluessel} className="fo-abschnitt" style={{ flexGrow: a.rahmen?.b ?? 700 }}>
                        {(titel || buendel) && (
                          <h3>
                            {titel}
                            {buendel && (
                              <EntfallInfo gruende={buendel.gruende} text={buendel.text} offen={buendel.offen} merkmale={buendel.merkmale} info={a.felder.map((f) => f.schluessel).join(' ')} />
                            )}
                          </h3>
                        )}
                        {zeilen(a.felder).map((z) => (
                          <div key={z[0].schluessel} className="fo-zeile">
                            {z.map((f) => eingabe(f, feldTitel(f, profil) === titel && f.art === 'text', !!buendel))}
                          </div>
                        ))}
                      </div>
                    );
                  })}
                </div>
              ))}
            </section>
          ))}
    </div>
  );
}

function FeldEingabe({
  feld,
  offen,
  gesperrt: gesperrtFormular,
  profil,
  entfall,
  ohneInfo = false,
  hinweise,
  vorbelegt = false,
  ohneBeschriftung,
  markiert,
}: {
  feld: Feld;
  offen: OffenesFormular;
  gesperrt: boolean;
  profil: FormularProfil;
  /** entfällt nach den Bedingungen bzw. ist offen (fehlendes Antragsmerkmal) – mit Gründen und Hinweistext */
  entfall?: { gruende: Entfall[]; text: string; offen?: boolean; merkmale?: Record<string, string> };
  /** das Symbol steht am Abschnitt (gleicher Grund für alle Felder) */
  ohneInfo?: boolean;
  /** Plausibilitätsmeldungen zu diesem Feld */
  hinweise?: Plausi[];
  /** aus einem Antragsmerkmal vorbelegt (Vorschlag) */
  vorbelegt?: boolean;
  ohneBeschriftung: boolean;
  /** in der Gliederung gezeigt (umrandet: zusätzlich umrandet) */
  markiert: 'markiert' | 'umrandet' | null;
}) {
  const wertSetzen = useFormulare((s) => s.wertSetzen);
  const werteSetzen = useFormulare((s) => s.werteSetzen);
  const wert = wertVon(offen, feld);
  const geaendert = feld.schluessel in offen.aenderungen;
  const klasse = `fo-feld${geaendert ? ' geaendert' : ''}${markiert ? ' markiert' : ''}${markiert === 'umrandet' ? ' umrandet' : ''}${entfall ? (entfall.offen ? ' offen' : ' entfaellt') : ''}${vorbelegt ? ' vorbelegt' : ''}`;
  const info = (
    <>
      {entfall && !ohneInfo && <EntfallInfo gruende={entfall.gruende} text={entfall.text} offen={entfall.offen} merkmale={entfall.merkmale} info={feld.schluessel} />}
      {hinweise?.length ? <HinweisSymbol hinweise={hinweise} info={feld.schluessel} /> : null}
    </>
  );
  const breite = { flexGrow: Math.max(40, feld.kasten.b) };
  // von FORMA berechnete Felder trägt man nicht ein
  const gesperrt = gesperrtFormular || feld.berechnet;
  const titel = feldTitel(feld, profil);
  const hinweis = feld.berechnet ? `${titel} – wird berechnet` : feld.hinweis;

  if (feld.art === 'kreuz') {
    // echte Entweder-oder-Fälle (Regel „genau eine“, z. B. Bauantrag/Vorbescheid, ja/nein) als Optionsfelder (U-04) –
    // solange nicht schon mehrere angekreuzt sind
    const g = gruppeVon(profil, feld.schluessel);
    const andere = g?.regel === 'genau' ? offen.felder.flat().filter((f) => g.felder.includes(f.schluessel) && f.schluessel !== feld.schluessel) : [];
    const radio = g?.regel === 'genau' && andere.filter((f) => wertVon(offen, f) === true).length + (wert === true ? 1 : 0) <= 1;
    const titelText = vorbelegt ? `${hinweis ?? titel} – aus dem Antragsmerkmal vorbelegt, bitte prüfen` : hinweis;
    return (
      <label className={`${klasse} fo-kreuz`} title={titelText} style={breite}>
        {radio ? (
          <input
            type="radio"
            name={`genau-${g!.id}`}
            checked={wert === true}
            disabled={gesperrt}
            data-feld={feld.schluessel}
            onClick={() => wert === true && wertSetzen(feld, false)}
            onChange={(e) => e.target.checked && werteSetzen([{ feld, wert: true }, ...andere.filter((f) => wertVon(offen, f) === true).map((f) => ({ feld: f, wert: false }))], titel)}
          />
        ) : (
          <input type="checkbox" checked={wert === true} disabled={gesperrt} data-feld={feld.schluessel} onChange={(e) => wertSetzen(feld, e.target.checked)} />
        )}
        <span>{titel}</span>
        {info}
      </label>
    );
  }
  const text = typeof wert === 'string' ? wert : '';
  // einzeilige Felder können durch FORMAs Zeilenumbruch trotzdem mehrere Zeilen enthalten
  const einzeilig = feld.einzeilig && !text.includes('\n');
  return (
    <label className={klasse} title={hinweis} style={breite}>
      {!ohneBeschriftung && (
        <span className="field-label">
          {titel}
          {info}
        </span>
      )}
      {ohneBeschriftung && info}
      {einzeilig ? (
        <input
          type="text"
          value={text}
          disabled={gesperrt}
          aria-label={titel}
          data-feld={feld.schluessel}
          onChange={(e) => wertSetzen(feld, e.target.value)}
          onBlur={() => useFormulare.getState().feldVerlassen(feld)}
        />
      ) : (
        <textarea
          value={text}
          disabled={gesperrt}
          aria-label={titel}
          data-feld={feld.schluessel}
          rows={Math.max(2, Math.min(12, text.split('\n').length + 1, Math.round(feld.kasten.h / 18)))}
          onChange={(e) => wertSetzen(feld, e.target.value)}
          onBlur={() => useFormulare.getState().feldVerlassen(feld)}
        />
      )}
    </label>
  );
}
