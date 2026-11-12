import { useState } from 'react';
import { paragrafName } from '@core/baurecht/typen';
import type { Ampel } from '@core/baurecht/typen';
import { EBENEN } from '@core/baurecht/typen';
import { druckenAls } from '@core/platform/projektDatei';
import { DruckKopf } from '@core/ui/DruckKopf';
import { useEscSchliessen } from '@core/ui/Dialog';
import { benutzer } from '../benutzer';
import type { Pruefstand } from '../pruefung';
import { verwendeteFassungen } from '../pruefung';
import { offeneBestaetigungen, offeneFestlegungen, useBaurecht } from '../store';
import { AMPEL_TEXT, datum } from './Ampel';

/** Prüfprotokoll zum Drucken bzw. als PDF; „Prüfung abschließen“ legt einen Stand in der Projektdatei ab */
export function Protokoll({ stand, onClose }: { stand: Pruefstand; onClose: () => void }) {
  const project = useBaurecht((s) => s.project);
  const antrag = useBaurecht((s) => s.antrag);
  const merkmale = useBaurecht((s) => s.merkmale);
  const paket = useBaurecht((s) => s.paket);
  const protokolle = useBaurecht((s) => s.pruefung.protokolle);
  const quelle = useBaurecht((s) => s.quelle);
  const entwuerfe = useBaurecht((s) => offeneFestlegungen(s).length + offeneBestaetigungen(s).length);
  const [nurRelevant, setNurRelevant] = useState(false);
  useEscSchliessen(onClose);
  if (!project) return null;
  const a = stand.auswertung;
  const offen = a.paragrafen.filter((p) => p.ampel === 'gelb');
  const vonHand = a.paragrafen.filter((p) => p.festlegung);
  const ueberholt = a.paragrafen.filter((p) => p.ueberholt);
  const bestaetigt = Object.entries(a.fakten).filter(([, f]) => f.bestaetigt);
  const abschliessen = () => {
    // nur ein gespeicherter, zweimal bestätigter Stand wird abgeschlossen
    if (entwuerfe) return;
    const ampeln: Record<string, Ampel> = Object.fromEntries(a.paragrafen.map((p) => [p.id, p.ampel]));
    useBaurecht.getState().protokollAnhaengen({ am: new Date().toISOString(), von: benutzer(), paket: paket.version, einreichung: stand.einreichung, fassungen: verwendeteFassungen(a), zaehler: a.zaehler, ampeln, offen: offen.length + ueberholt.length });
  };
  const datei = quelle?.art === 'ordner' ? quelle.datei : quelle?.art === 'datei' ? quelle.name : null;
  return (
    <div className="report-backdrop br-protokoll-hintergrund">
      <div className="report br-protokoll" role="dialog" aria-modal="true" aria-label="Prüfprotokoll Baurecht">
        <div className="report-actions no-print">
          <label className="toggle">
            <input type="checkbox" checked={nurRelevant} onChange={(e) => setNurRelevant(e.target.checked)} /> ohne „entfällt“
          </label>
          <button type="button" onClick={() => druckenAls({ datei, projektName: project.name, zusatz: `Baurecht ${antrag}` })}>
            Drucken / PDF …
          </button>
          <button
            type="button"
            className="primary"
            onClick={abschliessen}
            disabled={entwuerfe > 0}
            title={entwuerfe ? `Erst speichern: ${entwuerfe} Angabe(n) von Hand sind noch Entwurf (zweite Bestätigung fehlt)` : 'Diesen Stand mit Fassungen und Ampeln in der Projektdatei ablegen (danach speichern)'}
          >
            Prüfung abschließen
          </button>
          <button type="button" onClick={onClose}>
            Schließen
          </button>
        </div>
        {entwuerfe > 0 && (
          <p className="report-note no-print br-entwurf-hinweis" role="status">
            {entwuerfe === 1 ? 'Eine Angabe von Hand ist' : `${entwuerfe} Angaben von Hand sind`} noch Entwurf – vor dem Abschließen speichern und bestätigen. Im Ausdruck sind Entwürfe als solche gekennzeichnet.
          </p>
        )}
        <DruckKopf titel={`Baurechtliche Prüfung vor dem Einreichen – ${antrag}`} project={project} stand={new Date()} />
        <h2>Grundlagen</h2>
        <table className="report-table narrow">
          <tbody>
            <tr>
              <td>Geplante Einreichung (Stichtag)</td>
              <td className="strong">{datum(stand.einreichung)}</td>
            </tr>
            <tr>
              <td>Regelmodule</td>
              <td>
                {stand.module.map((m) => `${m.name} (${m.version})`).join(' · ')} – Regelpaket {paket.version}
              </td>
            </tr>
            {stand.fehlend.length > 0 && (
              <tr>
                <td>Ohne Modul</td>
                <td>{stand.fehlend.join(', ')} – von Hand zu prüfen</td>
              </tr>
            )}
            <tr>
              <td>Antragsmerkmale</td>
              <td>{Object.entries(merkmale).map(([k, v]) => `${k}: ${v}`).join(' · ') || '–'}</td>
            </tr>
            <tr>
              <td>Ergebnis</td>
              <td className="strong">
                {a.zaehler.rot} gilt · {a.zaehler.gelb} prüfen · {a.zaehler.gruen} entfällt
              </td>
            </tr>
          </tbody>
        </table>
        {stand.widersprueche.length > 0 && <p className="report-note">Widerspruch: {stand.widersprueche.join('; ')}</p>}

        {EBENEN.map((e) => {
          const normen = a.normen.filter((n) => n.ebene === e.id);
          if (!normen.length) return null;
          return (
            <section key={e.id} className="br-protokoll-ebene">
              <h2>{e.titel}</h2>
              {normen.map((n) => {
                const ps = n.paragrafen.filter((p) => !nurRelevant || p.ampel !== 'gruen');
                if (!ps.length && nurRelevant) return null;
                return (
                  <div key={n.id} className="br-protokoll-norm">
                    <h3>
                      {n.def.titel} ({n.def.kurz}){' '}
                      <span className="report-meta">
                        {n.fassung ? `– ${n.fassung.text}, abgerufen ${datum(n.fassung.abgerufen)}` : n.def.quelle.art === 'verweis' ? '– nur Fundstelle' : '– Text nicht abgerufen'}
                      </span>
                    </h3>
                    <table className="report-table">
                      <thead>
                        <tr>
                          <th style={{ width: '9%' }}>Einheit</th>
                          <th style={{ width: '24%' }}>Titel</th>
                          <th style={{ width: '10%' }}>Ampel</th>
                          <th>Begründung</th>
                        </tr>
                      </thead>
                      <tbody>
                        {ps.map((p) => (
                          <tr key={p.id} className={`br-zeile-${p.ampel}`}>
                            <td>{paragrafName(p.paragraf)}</td>
                            <td>{p.titel}</td>
                            <td className="strong">
                              {AMPEL_TEXT[p.ampel]}
                              {p.festlegung ? ' (von Hand)' : ''}
                            </td>
                            <td>
                              {p.festlegung ? `${p.festlegung.grund} (${p.festlegung.von}, ${datum(p.festlegung.am)}; automatisch: ${AMPEL_TEXT[p.automatisch]})` : p.gruende.join(' ')}
                              {p.ueberholt ? ` – Festlegung überholt: ${p.ueberholt}` : ''}
                            </td>
                          </tr>
                        ))}
                        {n.ohneRegel && (
                          <tr>
                            <td colSpan={4}>Keine Regeldatei – von Hand beurteilen.</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                );
              })}
            </section>
          );
        })}

        <h2>Offene Punkte ({offen.length + ueberholt.length})</h2>
        {offen.length + ueberholt.length ? (
          <ul>
            {[...offen, ...ueberholt.filter((p) => !offen.includes(p))].map((p) => (
              <li key={p.id}>
                {a.text.paragraf?.(p.id) ?? p.id}: {p.ueberholt ? `Festlegung überholt (${p.ueberholt})` : p.gruende[0]}
              </li>
            ))}
          </ul>
        ) : (
          <p>Keine – alle Vorschriften sind eingeordnet.</p>
        )}
        <h2>Festlegungen von Hand ({vonHand.length})</h2>
        {vonHand.length ? (
          <ul>
            {vonHand.map((p) => (
              <li key={p.id}>
                {a.text.paragraf?.(p.id) ?? p.id}: {AMPEL_TEXT[p.festlegung!.ampel]} statt {AMPEL_TEXT[p.automatisch]} – {p.festlegung!.grund} ({p.festlegung!.von}, {datum(p.festlegung!.am)}
                {p.festlegung!.bestaetigt ? ', bestätigt' : ', Entwurf'})
              </li>
            ))}
          </ul>
        ) : (
          <p>Keine.</p>
        )}
        <h2>Bestätigte Angaben ({bestaetigt.length})</h2>
        {bestaetigt.length ? (
          <ul>
            {bestaetigt.map(([id, f]) => (
              <li key={id}>
                {a.faktDefs[id]?.titel ?? id}: {f.wert === true ? 'ja' : f.wert === false ? 'nein' : String(f.wert)} – bisher nur Hinweis ({f.grund ?? f.quelle ?? 'nicht gesichert'}); bestätigt von {f.bestaetigt!.von} am {datum(f.bestaetigt!.am)}
                {f.bestaetigt!.grund ? `, gestützt auf: ${f.bestaetigt!.grund}` : ''}
              </li>
            ))}
          </ul>
        ) : (
          <p>Keine.</p>
        )}
        {(() => {
          const geo = [...new Set(Object.values(a.fakten).filter((f) => f.herkunft === 'geodienst' && f.quelle).map((f) => `${f.quelle}${f.stand ? `, abgefragt ${datum(f.stand)}` : ''}`))];
          return geo.length ? (
            <>
              <h2>Quellen der Geodaten</h2>
              <ul>
                {geo.map((g) => (
                  <li key={g}>{g}</li>
                ))}
              </ul>
            </>
          ) : null;
        })()}
        {a.hinweise.length > 0 && (
          <>
            <h2>Hinweise und Auskünfte</h2>
            <ul>
              {a.hinweise.map((h, i) => (
                <li key={i}>
                  <strong>{h.titel}</strong> ({h.modul}): {h.text}
                </li>
              ))}
            </ul>
          </>
        )}
        {protokolle.length > 0 && (
          <>
            <h2>Abgeschlossene Prüfungen</h2>
            <ul>
              {protokolle.map((p) => (
                <li key={p.am}>
                  {datum(p.am)} ({p.von}): {p.zaehler.rot} gilt · {p.zaehler.gelb} prüfen · {p.zaehler.gruen} entfällt – Regelpaket {p.paket}, Einreichung {datum(p.einreichung)}
                </li>
              ))}
            </ul>
          </>
        )}
        <p className="report-note">
          Arbeitshilfe – ersetzt keine fachliche Prüfung. Die rechtliche Einordnung bleibt bei den Entwurfsverfassenden (§ 54 BauO NRW). Gesetzestexte aus den amtlichen Quellen zum Abrufdatum; Geodaten sind nicht rechtsverbindlich.
        </p>
      </div>
    </div>
  );
}
