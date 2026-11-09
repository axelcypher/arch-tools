import { useMemo, useState } from 'react';
import type { PkEintrag, PkGruppe } from '../forma/projektkarte';
import { pkSchluessel, pkTitel } from '../forma/projektkarte';
import type { Stammadresse } from '../stammdaten';
import { stammadresseMerken, stammdatenLaden, stammdatenSpeichern } from '../stammdaten';
import type { OffeneKarte } from '../store';
import { karteWert, useFormulare } from '../store';

/** Gruppen mit Adressen (Bauherr, Entwurfsverfasser, Behörden …) haben in FORMA den Typ 1 */
const istAdresse = (g: PkGruppe) => g.typ === 1;

/**
 * Projektkarte bearbeiten: alle Gruppen mit ihren Einträgen, durchsuchbar. Adressgruppen lassen sich als
 * Bürostammdaten merken und in andere Projekte übernehmen. Gespeichert wird in die Projektkarte des
 * FORMA-Projekts – FORMA liest dieselben Einträge.
 */
export function ProjektkarteAnsicht() {
  const karte = useFormulare((s) => s.karte);
  const projekt = useFormulare((s) => s.projekt);
  const ds = useFormulare((s) => s.ds);
  const { karteSpeichern, karteVerwerfen, karteLaden } = useFormulare.getState();
  const [suche, setSuche] = useState('');
  const [nurGefuellt, setNurGefuellt] = useState(false);
  const [stamm, setStamm] = useState<Stammadresse[]>(stammdatenLaden);

  if (!ds) return <div className="fo-leer">Die Projektkarte gibt es nur in der Desktop-App.</div>;
  if (!projekt) return null;
  if (!karte)
    return (
      <div className="fo-leer">
        <p>Projektkarte wird gelesen …</p>
        <button onClick={() => void karteLaden()}>Erneut versuchen</button>
      </div>
    );

  const anzahl = Object.keys(karte.aenderungen).length;
  const merken = (neu: Stammadresse) => {
    const liste = stammadresseMerken(stamm, neu);
    stammdatenSpeichern(liste);
    setStamm(liste);
  };

  return (
    <div className="fo-karte">
      <div className="fo-karte-kopf">
        <h2>
          Projektkarte <span className="muted">{projekt.ordner}</span>
        </h2>
        <input type="search" placeholder="Einträge durchsuchen …" value={suche} onChange={(e) => setSuche(e.target.value)} />
        <label className="fo-schalter">
          <input type="checkbox" checked={nurGefuellt} onChange={(e) => setNurGefuellt(e.target.checked)} /> nur gefüllte
        </label>
        <span className="tb-spacer" />
        {anzahl > 0 && <span className="muted small-text">{anzahl} Eintrag/Einträge geändert</span>}
        <button disabled={!anzahl} onClick={karteVerwerfen}>
          Verwerfen
        </button>
        <button className="primary" disabled={!anzahl} onClick={() => void karteSpeichern()}>
          Projektkarte speichern
        </button>
      </div>
      <KartenInhalt karte={karte} suche={suche} nurGefuellt={nurGefuellt} stamm={stamm} onMerken={merken} />
    </div>
  );
}

function KartenInhalt({ karte, suche, nurGefuellt, stamm, onMerken }: { karte: OffeneKarte; suche: string; nurGefuellt: boolean; stamm: Stammadresse[]; onMerken: (s: Stammadresse) => void }) {
  const q = suche.trim().toLowerCase();
  const gruppen = useMemo(
    () =>
      karte.karte.gruppen
        .map((g) => {
          const eintraege = karte.karte.eintraege
            .filter((e) => e.gruppe === g.id)
            .filter((e) => !nurGefuellt || karteWert(karte, e.gruppe, e.id).trim())
            .filter((e) => !q || `${g.text} ${e.titel} ${karteWert(karte, e.gruppe, e.id)}`.toLowerCase().includes(q));
          return { g, eintraege };
        })
        .filter((x) => x.eintraege.length),
    [karte, q, nurGefuellt],
  );

  return (
    <>
      <nav className="fo-karte-index" aria-label="Gruppen">
        {gruppen.map(({ g }) => (
          <a key={g.id} href={`#pk-${g.id}`} onClick={(e) => (e.preventDefault(), document.getElementById(`pk-${g.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }))}>
            {g.text}
          </a>
        ))}
      </nav>
      <div className="fo-karte-gruppen">
        {gruppen.map(({ g, eintraege }) => (
          <Gruppe key={g.id} karte={karte} gruppe={g} eintraege={eintraege} stamm={stamm} onMerken={onMerken} />
        ))}
        {!gruppen.length && <p className="muted">Keine passenden Einträge.</p>}
      </div>
    </>
  );
}

function Gruppe({ karte, gruppe, eintraege, stamm, onMerken }: { karte: OffeneKarte; gruppe: PkGruppe; eintraege: PkEintrag[]; stamm: Stammadresse[]; onMerken: (s: Stammadresse) => void }) {
  const karteSetzen = useFormulare((s) => s.karteSetzen);
  const geaendert = eintraege.some((e) => pkSchluessel(e.gruppe, e.id) in karte.aenderungen);

  const uebernehmen = (name: string) => {
    const s = stamm.find((x) => x.name === name);
    if (!s) return;
    for (const e of karte.karte.eintraege.filter((x) => x.gruppe === gruppe.id)) {
      if (String(e.id) in s.werte) karteSetzen(gruppe.id, e.id, s.werte[String(e.id)]);
    }
  };
  const merken = () => {
    const name = karteWert(karte, gruppe.id, 40).trim() || gruppe.text;
    const werte: Record<string, string> = {};
    for (const e of karte.karte.eintraege.filter((x) => x.gruppe === gruppe.id)) werte[String(e.id)] = karteWert(karte, e.gruppe, e.id);
    onMerken({ name, werte });
  };

  return (
    <section id={`pk-${gruppe.id}`} className={`fo-abschnitt fo-karte-gruppe${geaendert ? ' geaendert' : ''}`}>
      <div className="fo-karte-gruppe-kopf">
        <h3>{gruppe.text}</h3>
        {istAdresse(gruppe) && (
          <div className="fo-karte-stamm">
            {stamm.length > 0 && (
              <select aria-label={`${gruppe.text} aus Stammdaten übernehmen`} value="" onChange={(e) => uebernehmen(e.target.value)}>
                <option value="">Aus Stammdaten …</option>
                {stamm.map((s) => (
                  <option key={s.name} value={s.name}>
                    {s.name}
                  </option>
                ))}
              </select>
            )}
            <button className="fo-klein" title="Diese Adresse als Bürostammdaten merken" onClick={merken}>
              Merken
            </button>
          </div>
        )}
      </div>
      <div className="fo-karte-felder">
        {eintraege.map((e) => {
          const s = pkSchluessel(e.gruppe, e.id);
          const wert = karteWert(karte, e.gruppe, e.id);
          const mehrzeilig = e.typ === 2 || wert.includes('\n');
          return (
            <label key={s} className={`fo-feld${s in karte.aenderungen ? ' geaendert' : ''}${mehrzeilig ? ' breit' : ''}`}>
              <span className="field-label">{pkTitel(e.titel)}</span>
              {mehrzeilig ? (
                <textarea rows={Math.max(2, Math.min(8, wert.split('\n').length + 1))} value={wert} onChange={(ev) => karteSetzen(e.gruppe, e.id, ev.target.value)} />
              ) : (
                <input type="text" value={wert} onChange={(ev) => karteSetzen(e.gruppe, e.id, ev.target.value)} />
              )}
            </label>
          );
        })}
      </div>
    </section>
  );
}
