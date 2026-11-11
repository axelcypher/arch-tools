import { useEffect, useMemo, useRef } from 'react';
import type { Feld } from '../forma/felder';
import { abschnitte, abschnittsReihen, zeilen } from '../forma/felder';
import { useMarkierung } from '../markierung';
import { feldTasten } from '../navigation';
import type { Entfall } from '../entfall';
import type { FormularProfil } from '../profil';
import { abschnittId, feldTitel, formularKontext, leeresProfil, profilSchluessel } from '../profil';
import type { FeldFilter } from '../pruefen';
import { useFeldFilter, zurNaechstenOffenen } from '../pruefen';
import { offeneAngaben } from '../pruefliste';
import type { OffenesFormular } from '../store';
import { useFormulare, useProfil, wertVon } from '../store';
import { EntfallInfo, useEntfallen } from './EntfallInfo';

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
  const eingabe = (f: Feld) => (
    <FeldEingabe
      key={f.schluessel}
      feld={f}
      offen={offen}
      gesperrt={gesperrt}
      profil={profil}
      entfall={
        entfall.gruende.has(f.schluessel)
          ? { gruende: entfall.gruende.get(f.schluessel)!, text: entfall.text(f.schluessel) }
          : entfall.offen.has(f.schluessel)
            ? { gruende: entfall.offen.get(f.schluessel)!, text: entfall.text(f.schluessel), offen: true, merkmale: entfall.merkmale }
            : undefined
      }
      ohneBeschriftung={false}
      markiert={markiert.has(f.schluessel) ? (markierung?.rahmen ? 'umrandet' : 'markiert') : null}
    />
  );
  const tasten = useMemo(() => feldTasten(offen.felder.flat()), [offen.felder]);

  return (
    <div className="fo-felder" ref={huelle} onKeyDown={tasten}>
      <div className="fo-felder-kopf">
        <input type="search" className="fo-feldsuche" placeholder="Felder durchsuchen (Beschriftung oder Inhalt) …" value={suche} onChange={(e) => setSuche(e.target.value)} />
        <div className="tb-group">
          {FILTER.map((f) => (
            <button key={f.id} className={filter === f.id ? 'active' : ''} title={f.title} onClick={() => setFilter(f.id)}>
              {f.label}
              {f.id === 'offen' && ` (${liste.length})`}
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
            Was fehlt noch? <span className="muted">{listeGefiltert.length === 1 ? '1 offene Angabe' : `${listeGefiltert.length} offene Angaben`}</span>
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
              <div className="fo-zeile">{o.felder.map(eingabe)}</div>
            </div>
          ))}
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
                    return (
                      <div key={a.felder[0].schluessel} className="fo-abschnitt" style={{ flexGrow: a.rahmen?.b ?? 700 }}>
                        {titel && <h3>{titel}</h3>}
                        {zeilen(a.felder).map((z) => (
                          <div key={z[0].schluessel} className="fo-zeile">
                            {z.map((f) => (
                              <FeldEingabe
                                key={f.schluessel}
                                feld={f}
                                offen={offen}
                                gesperrt={gesperrt}
                                profil={profil}
                                entfall={
                                  entfall.gruende.has(f.schluessel)
                                    ? { gruende: entfall.gruende.get(f.schluessel)!, text: entfall.text(f.schluessel) }
                                    : entfall.offen.has(f.schluessel)
                                      ? { gruende: entfall.offen.get(f.schluessel)!, text: entfall.text(f.schluessel), offen: true, merkmale: entfall.merkmale }
                                      : undefined
                                }
                                ohneBeschriftung={feldTitel(f, profil) === titel && f.art === 'text'}
                                markiert={markiert.has(f.schluessel) ? (markierung?.rahmen ? 'umrandet' : 'markiert') : null}
                              />
                            ))}
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
  ohneBeschriftung,
  markiert,
}: {
  feld: Feld;
  offen: OffenesFormular;
  gesperrt: boolean;
  profil: FormularProfil;
  /** entfällt nach den Bedingungen bzw. ist offen (fehlendes Projektmerkmal) – mit Gründen und Hinweistext */
  entfall?: { gruende: Entfall[]; text: string; offen?: boolean; merkmale?: Record<string, string> };
  ohneBeschriftung: boolean;
  /** in der Gliederung gezeigt (umrandet: zusätzlich umrandet) */
  markiert: 'markiert' | 'umrandet' | null;
}) {
  const wertSetzen = useFormulare((s) => s.wertSetzen);
  const wert = wertVon(offen, feld);
  const geaendert = feld.schluessel in offen.aenderungen;
  const klasse = `fo-feld${geaendert ? ' geaendert' : ''}${markiert ? ' markiert' : ''}${markiert === 'umrandet' ? ' umrandet' : ''}${entfall ? (entfall.offen ? ' offen' : ' entfaellt') : ''}`;
  const info = entfall && <EntfallInfo gruende={entfall.gruende} text={entfall.text} offen={entfall.offen} merkmale={entfall.merkmale} />;
  const breite = { flexGrow: Math.max(40, feld.kasten.b) };
  // von FORMA berechnete Felder trägt man nicht ein
  const gesperrt = gesperrtFormular || feld.berechnet;
  const titel = feldTitel(feld, profil);
  const hinweis = feld.berechnet ? `${titel} – berechnet FORMA` : feld.hinweis;

  if (feld.art === 'kreuz') {
    return (
      <label className={`${klasse} fo-kreuz`} title={hinweis} style={breite}>
        <input type="checkbox" checked={wert === true} disabled={gesperrt} data-feld={feld.schluessel} onChange={(e) => wertSetzen(feld, e.target.checked)} />
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
