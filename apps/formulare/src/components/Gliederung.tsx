import { useMemo, useState } from 'react';
import { useAntrag } from '../antragStore';
import { bedingungText, fehlendeMerkmale } from '../bedingung';
import { useEinrichten } from '../einrichten';
import type { Abschnitt, Feld } from '../forma/felder';
import { abschnitte } from '../forma/felder';
import { useHervorheben } from '../markierung';
import { springeZuFeld } from '../navigation';
import type { Einheit, FormularProfil } from '../profil';
import { abschnittErforderlich, abschnittId, ausgefuellt, einheiten, einheitTitel, feldTitel, formularKontext, leeresProfil, profilSchluessel } from '../profil';
import type { OffenesFormular } from '../store';
import { useFormulare, useProfil, wertVon } from '../store';
import { umfangZeigen } from './Antrag';
import { EinrichtenBaum } from './Einrichten';
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

/**
 * Gliederung des offenen Formulars: Seiten und Abschnitte mit Füllstand – ein Klick springt hin, Zeigen hebt die
 * Felder im Formular hervor, aufgeklappt erscheinen die einzelnen Angaben. Steht als eigener Bereich am Formular
 * (nicht in der Navigation). Im Einrichten-Modus (Werkzeugleiste) zeigt sie den Aufbau als Baum zum Auswählen.
 */
export function Gliederung({ offen }: { offen: OffenesFormular }) {
  const schluessel = profilSchluessel(offen.formular, offen.name);
  const wirksames = useProfil(schluessel);
  const { setGliederungOffen } = useFormulare.getState();
  const profil: FormularProfil = useMemo(() => ({ ...leeresProfil(), ...wirksames }), [wirksames]);
  const anpassen = useEinrichten((s) => s.aktiv);
  const [offeneAbschnitte, setOffeneAbschnitte] = useState<Set<string>>(() => new Set());
  const merkmalWerte = useAntrag((s) => s.projektdatei?.merkmale);
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

  // Namen der Felder für die Beschreibung von Bedingungen
  const name = useMemo(() => {
    const nach = new Map(offen.felder.flat().map((f) => [f.schluessel, f]));
    return (x: string) => (nach.has(x) ? { titel: feldTitel(nach.get(x)!, profil), kreuz: nach.get(x)!.art === 'kreuz' } : undefined);
  }, [offen.felder, profil]);

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

  const umschalten = (id: string) =>
    setOffeneAbschnitte((s) => {
      const neu = new Set(s);
      if (!neu.delete(id)) neu.add(id);
      return neu;
    });

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
          {!anpassen && (
            <button className="icon" title="Gliederung ausblenden" aria-label="Gliederung ausblenden" onClick={() => setGliederungOffen(false)}>
              <Symbol name="schliessen" />
            </button>
          )}
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

      {anpassen && <EinrichtenBaum offen={offen} />}

      {!anpassen && seiten.map((s) => {
        const punkte = s.punkte.filter((p) => p.sichtbar);
        return (
          <div key={s.i} className="fo-gl-gruppe">
            <button className="fo-gl-seite" onClick={() => document.querySelector(`[data-seite="${s.i}"]`)?.scrollIntoView({ block: 'start', behavior: 'smooth' })}>
              Seite {s.i + 1}
            </button>
            {punkte.map((p) =>
              (
                <div key={p.id} className={`fo-gl-punkt${p.erforderlich ? '' : ' entfaellt'}`}>
                  <div className="fo-gl-zeile">
                    <button
                      className="fo-gl-abschnitt"
                      title={p.erforderlich ? p.titel : `${p.titel} – entfällt: nur wenn ${bedingungText(profil.abschnitte[p.id]?.bedingung, name)}`}
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
