import { useMemo, useState } from 'react';
import { bedingungText, fehlendeMerkmale } from '../bedingung';
import { useEinrichten } from '../einrichten';
import type { Abschnitt, Feld } from '../forma/felder';
import { abschnitte } from '../forma/felder';
import { useHervorheben } from '../markierung';
import { springeZuFeld } from '../navigation';
import type { Einheit, FormularProfil } from '../profil';
import { abschnittId, abschnittZustand, ausgefuellt, einheiten, einheitTitel, feldTitel, formularKontext, leeresProfil, profilSchluessel } from '../profil';
import { useMerkmalWerte } from '../merkmalWerte';
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
  /** nach seiner Bedingung erforderlich (auch offen) und nicht alle Angaben entfallen */
  erforderlich: boolean;
  /** Abschnitt hängt an nicht festgelegten Projektmerkmalen */
  abschnittOffen: boolean;
  /** keine zählenden Angaben (alle „zählt nicht“) */
  freiwillig: boolean;
  gesamt: number;
  gefuellt: number;
  /** nicht ausgefüllte Angaben, die an nicht festgelegten Projektmerkmalen hängen (zählen in `gesamt` mit) */
  offen: number;
  /** die Merkmale, an denen die offenen Angaben hängen */
  fehlend: string[];
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
  const merkmalWerte = useMerkmalWerte(offen);
  const hervor = useHervorheben();
  const k = useMemo(() => formularKontext(merkmalWerte, offen.felder.flat(), (f) => wertVon(offen, f)), [merkmalWerte, offen]);

  const seiten = useMemo(
    () =>
      offen.felder.map((felder, i) => ({
        i,
        punkte: abschnitte(felder).map((a): Punkt => {
          const id = abschnittId(a);
          const p = profil.abschnitte[id];
          const erkannt = a.titel || a.felder[0].beschriftung;
          const zustand = abschnittZustand(a, profil, k);
          const e = einheiten(a, profil, k).map((einheit) => ({ einheit, voll: ausgefuellt(einheit, (f) => wertVon(offen, f)) }));
          const zaehlen = zustand !== 'nein' ? e.filter((x) => !x.einheit.entfaellt) : [];
          // entfällt: Bedingung des Abschnitts trifft sicher nicht zu oder alle Angaben entfallen (B-07)
          const erforderlich = zustand !== 'nein' && (zaehlen.length > 0 || !e.length);
          const abschnittOffen = zustand === 'offen';
          const offeneEinheiten = zaehlen.filter((x) => !x.voll && (abschnittOffen || x.einheit.offen));
          return {
            id,
            abschnitt: a,
            erkannt,
            titel: p?.titel || erkannt,
            sichtbar: p?.sichtbar !== false,
            einheiten: e,
            erforderlich,
            abschnittOffen,
            freiwillig: erforderlich && !e.length,
            gesamt: zaehlen.length,
            gefuellt: zaehlen.filter((x) => x.voll).length,
            offen: offeneEinheiten.length,
            fehlend: [
              ...new Set([...(abschnittOffen ? fehlendeMerkmale(p?.bedingung, k.merkmale) : []), ...offeneEinheiten.flatMap((x) => x.einheit.fehlend ?? [])]),
            ],
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
        fehlendeMerkmale(b, merkmalWerte),
      ),
    ),
  ];

  const sichtbare = seiten.flatMap((s) => s.punkte.filter((p) => p.sichtbar && p.erforderlich));
  const gesamt = sichtbare.reduce((n, p) => n + p.gesamt, 0);
  const gefuellt = sichtbare.reduce((n, p) => n + p.gefuellt, 0);
  // offene Angaben zählen wie erforderliche – kein voller Balken, solange etwas offen ist
  const ungeklaert = sichtbare.reduce((n, p) => n + p.offen, 0);

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
            {ungeklaert > 0 && (
              <span className="fo-gl-offen" title="Diese Angaben hängen an Projektmerkmalen, die noch nicht festgelegt sind – sie zählen wie erforderliche Angaben.">
                {ungeklaert} offen (hängt von Merkmalen ab)
              </span>
            )}
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
          {offen.projekt && (
            <button className="small" onClick={umfangZeigen}>
              Festlegen …
            </button>
          )}
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
                      title={
                        p.erforderlich
                          ? p.titel
                          : profil.abschnitte[p.id]?.bedingung && abschnittZustand(p.abschnitt, profil, k) === 'nein'
                            ? `${p.titel} – entfällt: nur wenn ${bedingungText(profil.abschnitte[p.id]?.bedingung, name)}`
                            : `${p.titel} – entfällt: keine der Angaben ist erforderlich`
                      }
                      onClick={() => springeZuFeld(p.abschnitt.felder[0].schluessel)}
                      {...hervor({ felder: schluesselVon(p.abschnitt.felder) })}
                    >
                      <span className="fo-gl-titel">
                        {p.titel}
                        {p.geaendert && <span className="fo-ungespeichert"> ●</span>}
                      </span>
                      {!p.erforderlich ? (
                        <span className="fo-gl-entfaellt">entfällt</span>
                      ) : p.freiwillig ? (
                        <span className="fo-gl-freiwillig" title="Zählt nicht für den Füllstand (freiwillig oder von der Behörde auszufüllen)">
                          freiwillig
                        </span>
                      ) : (
                        <>
                          <Zahl punkt={p} />
                          {p.offen > 0 && (
                            <span className="fo-gl-offen" title={`${p.offen} offen – hängt ab von: ${p.fehlend.join(', ')} (nicht festgelegt)`}>
                              {p.abschnittOffen && p.offen === p.gesamt - p.gefuellt ? 'offen' : `${p.offen} offen`}
                            </span>
                          )}
                        </>
                      )}
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
                        const ungeklaert = !weg && !voll && (p.abschnittOffen || !!e.offen);
                        return (
                          <button
                            key={e.id}
                            className={`fo-gl-einheit${weg ? ' entfaellt' : ''}${ungeklaert ? ' offen' : ''}`}
                            title={weg ? `${titel} – entfällt (Bedingung trifft nicht zu)` : ungeklaert ? `${titel} – offen, hängt ab von: ${(e.fehlend ?? p.fehlend).join(', ')}` : titel}
                            onClick={() => springeZuFeld(e.felder[0].schluessel)}
                            {...hervor({ felder: schluesselVon(e.felder) })}
                          >
                            <span className="fo-gl-titel">{titel}</span>
                            {weg ? (
                              <span className="fo-gl-entfaellt">entfällt</span>
                            ) : ungeklaert ? (
                              <span className="fo-gl-offen">offen</span>
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
