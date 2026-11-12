import { useMemo, useState } from 'react';
import { bedingungText, fehlendeMerkmale } from '../bedingung';
import { useEinrichten } from '../einrichten';
import type { Feld } from '../forma/felder';
import { abschnitte } from '../forma/felder';
import { useHervorheben } from '../markierung';
import { springeZuFeld } from '../navigation';
import type { FormularProfil } from '../profil';
import { abschnittZustand, einheitTitel, feldTitel, formularKontext, leeresProfil, profilSchluessel } from '../profil';
import type { AbschnittStand } from '../pruefliste';
import { abschnittStand, offeneAngaben } from '../pruefliste';
import { useFeldFilter, zurNaechstenOffenen } from '../pruefen';
import { useMerkmalWerte } from '../merkmalWerte';
import type { OffenesFormular } from '../store';
import { useFormulare, useProfil, wertVon } from '../store';
import { umfangZeigen } from './Antrag';
import { EinrichtenBaum } from './Einrichten';
import { usePlausibel } from './Hinweise';
import { MerkmalWahl } from './MerkmalWahl';
import { Symbol } from './Symbol';

interface Punkt extends AbschnittStand {
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
        punkte: abschnitte(felder).map((a): Punkt => ({
          ...abschnittStand(a, profil, k, (f) => wertVon(offen, f)),
          geaendert: a.felder.some((f) => f.schluessel in offen.aenderungen),
        })),
      })),
    [offen, profil, k],
  );

  // Namen der Felder für die Beschreibung von Bedingungen
  const name = useMemo(() => {
    const nach = new Map(offen.felder.flat().map((f) => [f.schluessel, f]));
    return (x: string) => (nach.has(x) ? { titel: feldTitel(nach.get(x)!, profil), kreuz: nach.get(x)!.art === 'kreuz' } : undefined);
  }, [offen.felder, profil]);

  // Bedingungen, deren Antragsmerkmal im Projekt noch fehlt
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
  // Prüfliste: fehlende Pflichtangaben und ungeklärte (hängen an Antragsmerkmalen)
  const liste = useMemo(() => offeneAngaben(offen.felder, profil, k, (f) => wertVon(offen, f)), [offen, profil, k]);
  const fehlen = liste.filter((x) => !x.ungeklaert).length;
  // Hinweise: Widersprüche (U-04) und Abweichungen von den Antragsmerkmalen (U-05)
  const hinweise = usePlausibel(offen);
  const zeigeOffene = () => {
    useFormulare.getState().setAnsicht('felder');
    useFeldFilter.getState().setFilter('offen');
  };

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
              <span className="fo-gl-offen" title="Diese Angaben hängen an Antragsmerkmalen, die noch nicht festgelegt sind – sie zählen wie erforderliche Angaben.">
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

      {!anpassen && (
        <div className="fo-gl-pruefliste" aria-label="Prüfliste">
          {liste.length || hinweise.length ? (
            <button className="fo-gl-pruef-zahl" title="Was fehlt noch? – offene Angaben und Hinweise in der Feldansicht zeigen" onClick={zeigeOffene}>
              {fehlen} offen
              {liste.length > fehlen && <span className="fo-gl-offen">{liste.length - fehlen} ungeklärt</span>}
              {hinweise.length > 0 && <span className={`fo-gl-hinweise${hinweise.some((h) => h.art === 'fehler') ? ' fehler' : ''}`}>{hinweise.length === 1 ? '1 Hinweis' : `${hinweise.length} Hinweise`}</span>}
            </button>
          ) : null}
          {liste.length > 0 && (
            <button className="small" title="Zur nächsten offenen Angabe springen (F8)" onClick={() => zurNaechstenOffenen()}>
              Nächste offene Angabe
            </button>
          )}
          {!liste.length && <span className="muted small-text">Nach den Vorgaben der App keine offenen Angaben</span>}
        </div>
      )}

      {fehlend.length > 0 && (
        <div className="fo-gl-merkmal">
          <span>
            Für die Bedingungen dieses Formulars fehlt {offen.projekt ? 'im Projekt' : 'für diese Datei'}: <strong>{fehlend.join(', ')}</strong>
          </span>
          <MerkmalWahl offen={offen} namen={fehlend} />
          {offen.projekt && (
            <button className="small" onClick={umfangZeigen}>
              Alle Antragsmerkmale …
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
                          {hinweise.some((h) => h.abschnitt === p.id) && (
                            <span
                              className={`fo-gl-hinweise${hinweise.some((h) => h.abschnitt === p.id && h.art === 'fehler') ? ' fehler' : ''}`}
                              title={hinweise
                                .filter((h) => h.abschnitt === p.id)
                                .map((h) => h.text)
                                .join('\n')}
                            >
                              ⚠
                            </span>
                          )}
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
