import { useMemo, useState } from 'react';
import type { Abschnitt } from '../forma/felder';
import { abschnitte } from '../forma/felder';
import { springeZuFeld } from '../navigation';
import type { FormularProfil } from '../profil';
import { abschnittId, ausgefuellt, einheiten, leeresProfil, profilSchluessel } from '../profil';
import type { OffenesFormular } from '../store';
import { useFormulare, wertVon } from '../store';
import { Symbol } from './Symbol';

interface Punkt {
  id: string;
  abschnitt: Abschnitt;
  erkannt: string;
  titel: string;
  sichtbar: boolean;
  gesamt: number;
  gefuellt: number;
  geaendert: boolean;
}

/**
 * Gliederung des offenen Formulars: Seiten und Abschnitte mit Füllstand – ein Klick springt hin. Steht als
 * eigener Bereich am Formular (nicht in der Navigation). Über „Anpassen“ lässt sich je Formular einstellen,
 * welche Abschnitte erscheinen, wie sie heißen und welche Felder in den Füllstand eingehen.
 */
export function Gliederung({ offen }: { offen: OffenesFormular }) {
  const schluessel = profilSchluessel(offen.formular, offen.name);
  const gespeichert = useFormulare((s) => s.profile[schluessel]);
  const { profilSetzen, setGliederungOffen } = useFormulare.getState();
  const profil: FormularProfil = gespeichert ?? leeresProfil();
  const [anpassen, setAnpassen] = useState(false);
  const [aufgeklappt, setAufgeklappt] = useState<string | null>(null);

  const seiten = useMemo(
    () =>
      offen.felder.map((felder, i) => ({
        i,
        punkte: abschnitte(felder).map((a): Punkt => {
          const id = abschnittId(a);
          const p = profil.abschnitte[id];
          const erkannt = a.titel || a.felder[0].beschriftung;
          const e = einheiten(a, profil);
          return {
            id,
            abschnitt: a,
            erkannt,
            titel: p?.titel || erkannt,
            sichtbar: p?.sichtbar !== false,
            gesamt: e.length,
            gefuellt: e.filter((x) => ausgefuellt(x, (f) => wertVon(offen, f))).length,
            geaendert: a.felder.some((f) => f.schluessel in offen.aenderungen),
          };
        }),
      })),
    [offen, profil],
  );

  const sichtbare = seiten.flatMap((s) => s.punkte.filter((p) => p.sichtbar));
  const gesamt = sichtbare.reduce((n, p) => n + p.gesamt, 0);
  const gefuellt = sichtbare.reduce((n, p) => n + p.gefuellt, 0);

  const aendern = (f: (p: FormularProfil) => void) => {
    const neu: FormularProfil = { abschnitte: { ...profil.abschnitte }, zaehlt: { ...profil.zaehlt } };
    f(neu);
    profilSetzen(schluessel, neu);
  };
  const abschnittSetzen = (id: string, teil: { sichtbar?: boolean; titel?: string }) =>
    aendern((p) => {
      p.abschnitte[id] = { ...p.abschnitte[id], ...teil };
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
          <button className={`icon${anpassen ? ' active' : ''}`} title="Gliederung und Füllstand für dieses Formular anpassen" aria-label="Gliederung anpassen" onClick={() => setAnpassen(!anpassen)}>
            <Symbol name="stift" />
          </button>
          <button className="icon" title="Gliederung ausblenden" aria-label="Gliederung ausblenden" onClick={() => setGliederungOffen(false)}>
            <Symbol name="schliessen" />
          </button>
        </div>
      </div>

      {anpassen && (
        <div className="fo-gl-hinweis">
          Gilt für dieses Formular in allen Projekten. Auge: in der Gliederung zeigen; Titel überschreiben; aufklappen, um Felder vom Füllstand auszunehmen.
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
                <div key={p.id} className={`fo-gl-anpassen${p.sichtbar ? '' : ' versteckt'}`}>
                  <div className="fo-gl-anpassen-zeile">
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
                    <button
                      className="icon"
                      aria-expanded={aufgeklappt === p.id}
                      aria-label="Felder"
                      title="Felder: welche zählen für den Füllstand"
                      onClick={() => setAufgeklappt(aufgeklappt === p.id ? null : p.id)}
                    >
                      <Symbol name={aufgeklappt === p.id ? 'pfeilUnten' : 'pfeilRechts'} />
                    </button>
                  </div>
                  {aufgeklappt === p.id && (
                    <div className="fo-gl-felder">
                      {p.abschnitt.felder.map((f) => (
                        <label key={f.schluessel} className="fo-gl-feld" title={f.hinweis}>
                          <input
                            type="checkbox"
                            checked={profil.zaehlt[f.schluessel] !== false}
                            onChange={(e) =>
                              aendern((pr) => {
                                pr.zaehlt[f.schluessel] = e.target.checked;
                              })
                            }
                          />
                          <span className="fo-gl-feld-art">{f.art === 'kreuz' ? '☐' : 'T'}</span>
                          <span className="fo-gl-titel">{f.beschriftung}</span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <button key={p.id} className="fo-gl-abschnitt" title={p.titel} onClick={() => springeZuFeld(p.abschnitt.felder[0].schluessel)}>
                  <span className="fo-gl-titel">
                    {p.titel}
                    {p.geaendert && <span className="fo-ungespeichert"> ●</span>}
                  </span>
                  {p.gesamt > 0 && <span className={`fo-gl-zahl${p.gefuellt === p.gesamt ? ' voll' : ''}`}>{p.gefuellt === p.gesamt ? '✓' : `${p.gefuellt}/${p.gesamt}`}</span>}
                </button>
              ),
            )}
          </div>
        );
      })}
    </nav>
  );
}
