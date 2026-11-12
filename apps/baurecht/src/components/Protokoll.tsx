import { useState } from 'react';
import type { Ampel, FaktWert, ParagrafErgebnis } from '@core/baurecht/typen';
import { EBENEN, paragrafName } from '@core/baurecht/typen';
import { druckenAls } from '@core/platform/projektDatei';
import { DruckKopf } from '@core/ui/DruckKopf';
import { useEscSchliessen } from '@core/ui/Dialog';
import { benutzer } from '../benutzer';
import type { Pruefstand } from '../pruefung';
import { verwendeteFassungen } from '../pruefung';
import { offeneBestaetigungen, offeneFestlegungen, useBaurecht } from '../store';
import { AMPEL_TEXT, datum } from './Ampel';

const wertText = (w: FaktWert['wert']) => (w === true ? 'ja' : w === false ? 'nein' : String(w));
/** Modulstände sind Daten (JJJJ-MM-TT) – im Protokoll wie alle Daten als TT.MM.JJJJ */
const stand = (v: string) => (/^\d{4}-\d\d-\d\d$/.test(v) ? datum(v) : v);

/** Ampel in der Tabelle: mit „von Hand“ bzw. „von Hand, Entwurf“ */
function ampelText(p: ParagrafErgebnis): string {
  if (!p.festlegung) return AMPEL_TEXT[p.ampel];
  return `${AMPEL_TEXT[p.ampel]} (von Hand${p.festlegung.bestaetigt ? '' : ', Entwurf'})`;
}

/**
 * Prüfprotokoll zum Drucken bzw. als PDF. Aufbau: Grundlagen, dann was zu tun ist (offene Punkte, Festlegungen von
 * Hand, bestätigte Angaben), dann alle Vorschriften je Ebene. „Prüfung abschließen“ legt einen Stand in der
 * Projektdatei ab – erst, wenn nichts mehr Entwurf ist.
 */
export function Protokoll({ stand: pruefstand, onClose }: { stand: Pruefstand; onClose: () => void }) {
  const project = useBaurecht((s) => s.project);
  const antrag = useBaurecht((s) => s.antrag);
  const merkmale = useBaurecht((s) => s.merkmale);
  const paket = useBaurecht((s) => s.paket);
  const protokolle = useBaurecht((s) => s.pruefung.protokolle);
  const quelle = useBaurecht((s) => s.quelle);
  const offeneF = useBaurecht((s) => offeneFestlegungen(s).join('|'));
  const offeneB = useBaurecht((s) => offeneBestaetigungen(s).join('|'));
  const [nurRelevant, setNurRelevant] = useState(false);
  useEscSchliessen(onClose);
  if (!project) return null;
  const a = pruefstand.auswertung;
  const ungespeichert = new Set(offeneB ? offeneB.split('|') : []);
  const entwuerfe = (offeneF ? offeneF.split('|').length : 0) + ungespeichert.size;
  const offen = a.paragrafen.filter((p) => p.ampel === 'gelb');
  const vonHand = a.paragrafen.filter((p) => p.festlegung);
  const ausEntwurf = vonHand.filter((p) => !p.festlegung!.bestaetigt);
  const ueberholt = a.paragrafen.filter((p) => p.ueberholt && p.ampel !== 'gelb');
  const bestaetigt = Object.entries(a.fakten).filter(([, f]) => f.bestaetigt);
  const abschliessen = () => {
    // nur ein gespeicherter, zweimal bestätigter Stand wird abgeschlossen
    if (entwuerfe) return;
    const ampeln: Record<string, Ampel> = Object.fromEntries(a.paragrafen.map((p) => [p.id, p.ampel]));
    useBaurecht.getState().protokollAnhaengen({ am: new Date().toISOString(), von: benutzer(), paket: paket.version, einreichung: pruefstand.einreichung, fassungen: verwendeteFassungen(a), zaehler: a.zaehler, ampeln, offen: offen.length + ueberholt.length });
  };
  const datei = quelle?.art === 'ordner' ? quelle.datei : quelle?.art === 'datei' ? quelle.name : null;
  const geo = [...new Set(Object.values(a.fakten).filter((f) => f.herkunft === 'geodienst' && f.quelle).map((f) => `${f.quelle}${f.stand ? `, abgefragt ${datum(f.stand)}` : ''}`))];
  return (
    <div className="report-backdrop br-protokoll-hintergrund">
      <div className="report br-protokoll" role="dialog" aria-modal="true" aria-labelledby="br-protokoll-titel">
        <div className="report-actions no-print br-protokoll-aktionen">
          <label className="toggle">
            <input type="checkbox" checked={nurRelevant} onChange={(e) => setNurRelevant(e.target.checked)} /> ohne „entfällt“
          </label>
          <span className="tb-spacer" />
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
          <p className="br-meldung br-meldung-warn br-entwurf-hinweis" role="status">
            Entwurf: {entwuerfe === 1 ? 'Eine Angabe von Hand ist' : `${entwuerfe} Angaben von Hand sind`} noch nicht gespeichert und bestätigt. Sie sind unten als „Entwurf“ bzw. „noch nicht gespeichert“ gekennzeichnet; abschließen lässt sich die Prüfung erst nach dem Speichern.
          </p>
        )}
        <DruckKopf titel={`Baurechtliche Prüfung vor dem Einreichen – ${antrag}`} project={project} stand={new Date()} />
        <h2 id="br-protokoll-titel">Grundlagen</h2>
        <table className="report-table narrow">
          <tbody>
            <tr>
              <td>Geplante Einreichung (Stichtag)</td>
              <td className="strong">{datum(pruefstand.einreichung)}</td>
            </tr>
            <tr>
              <td>Regelmodule</td>
              <td>
                {pruefstand.module.map((m) => `${m.name} (Stand ${stand(m.version)})`).join(' · ')} – Regelpaket {paket.version}
              </td>
            </tr>
            {pruefstand.fehlend.length > 0 && (
              <tr>
                <td>Ohne Modul</td>
                <td>{pruefstand.fehlend.join(', ')} – von Hand zu prüfen</td>
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
                {ausEntwurf.length > 0 && <span className="br-entwurf-text"> – davon {ausEntwurf.length} aus Entwürfen von Hand</span>}
              </td>
            </tr>
          </tbody>
        </table>
        {pruefstand.widersprueche.length > 0 && <p className="report-note">Widerspruch: {pruefstand.widersprueche.join('; ')}</p>}

        <h2>Offene Punkte ({offen.length + ueberholt.length})</h2>
        {offen.length + ueberholt.length ? (
          <ul className="br-protokoll-liste">
            {[...offen, ...ueberholt].map((p) => (
              <li key={p.id}>
                <strong>{a.text.paragraf?.(p.id) ?? p.id}</strong>: {p.ueberholt ? `Festlegung überholt (${p.ueberholt})` : p.gruende[0]}
              </li>
            ))}
          </ul>
        ) : (
          <p>Keine – alle Vorschriften sind eingeordnet.</p>
        )}
        <h2>Festlegungen von Hand ({vonHand.length})</h2>
        {vonHand.length ? (
          <ul className="br-protokoll-liste">
            {vonHand.map((p) => (
              <li key={p.id}>
                <strong>{a.text.paragraf?.(p.id) ?? p.id}</strong>: {AMPEL_TEXT[p.festlegung!.ampel]} statt {AMPEL_TEXT[p.automatisch]} – {p.festlegung!.grund} ({p.festlegung!.von}, {datum(p.festlegung!.am)}
                {p.festlegung!.bestaetigt ? ', bestätigt' : ''})
                {!p.festlegung!.bestaetigt && <span className="br-entwurf-text"> – Entwurf</span>}
              </li>
            ))}
          </ul>
        ) : (
          <p>Keine.</p>
        )}
        <h2>Bestätigte Angaben ({bestaetigt.length})</h2>
        {bestaetigt.length ? (
          <ul className="br-protokoll-liste">
            {bestaetigt.map(([id, f]) => (
              <li key={id}>
                <strong>{a.faktDefs[id]?.titel ?? id}</strong>: {wertText(f.wert)} – {f.herkunft === 'manuell' ? 'von Hand angegeben' : `bisher nur Hinweis (${f.grund ?? f.quelle ?? 'nicht gesichert'})`}; {f.herkunft === 'manuell' ? 'angegeben' : 'bestätigt'} von {f.bestaetigt!.von} am {datum(f.bestaetigt!.am)}
                {f.bestaetigt!.grund ? `, gestützt auf: ${f.bestaetigt!.grund}` : ''}
                {ungespeichert.has(id) && <span className="br-entwurf-text"> – noch nicht gespeichert</span>}
              </li>
            ))}
          </ul>
        ) : (
          <p>Keine.</p>
        )}

        {EBENEN.map((e) => {
          const normen = a.normen.filter((n) => n.ebene === e.id);
          if (!normen.length) return null;
          return (
            <section key={e.id} className="br-protokoll-ebene">
              <h2>Vorschriften – {e.titel}</h2>
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
                          <th style={{ width: '13%' }}>Ampel</th>
                          <th>Begründung</th>
                        </tr>
                      </thead>
                      <tbody>
                        {ps.map((p) => (
                          <tr key={p.id} className={`br-zeile-${p.ampel}`}>
                            <td>{paragrafName(p.paragraf)}</td>
                            <td>{p.titel}</td>
                            <td className="strong">{ampelText(p)}</td>
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

        {geo.length > 0 && (
          <>
            <h2>Quellen der Geodaten</h2>
            <ul>
              {geo.map((g) => (
                <li key={g}>{g}</li>
              ))}
            </ul>
          </>
        )}
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
