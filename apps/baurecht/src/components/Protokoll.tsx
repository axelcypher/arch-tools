import { useEffect, useRef, useState } from 'react';
import { offenText } from '@core/baurecht/kurz';
import type { Ampel, FaktWert, ParagrafErgebnis } from '@core/baurecht/typen';
import { EBENEN, einheitName, normVoll, wertAnzeige } from '@core/baurecht/typen';
import { druckenAls } from '@core/platform/projektDatei';
import { DruckKopf } from '@core/ui/DruckKopf';
import { useEscSchliessen } from '@core/ui/Dialog';
import { benutzer } from '../benutzer';
import type { Pruefstand } from '../pruefung';
import { verwendeteFassungen } from '../pruefung';
import { istGeaendert, offeneBestaetigungen, offeneFestlegungen, useBaurecht } from '../store';
import { AMPEL_TEXT, datum } from './Ampel';



/** Herkunft einer gesicherten Angabe in Worten – ohne die Hinweistexte der App („bitte bestätigen …“) */
function herkunftText(f: FaktWert): string {
  switch (f.herkunft) {
    case 'geodienst':
      return `Geodienst${f.quelle ? ` ${f.quelle}` : ''}${f.stand ? `, abgefragt ${datum(f.stand)}` : ''}`;
    case 'abgeleitet':
      return `abgeleitet${f.quelle ? ` aus ${f.quelle}` : ''}`;
    case 'flaechen':
      return 'Flächenrechner (Modell)';
    case 'grz':
      return 'GRZ-Nachweis';
    case 'stammdaten':
      return 'Stammdaten des Projekts';
    case 'merkmal':
      return 'Antragsmerkmal';
    case 'modul':
      return `Regelmodul${f.quelle ? ` (${f.quelle})` : ''}`;
    default:
      return 'von Hand';
  }
}

/** Gruppe eines offenen Punkts: was fehlt (kurzer Titel der Angabe), woran er hängt oder warum er offen ist */
function gruppeVon(p: ParagrafErgebnis): string {
  if (p.ueberholt && p.ampel !== 'gelb') return 'Festlegung überholt – erneut festlegen oder aufheben';
  if (p.festlegung?.ampel === 'gelb') return 'Von Hand auf „prüfen“ festgelegt – klären';
  if (p.ueberholt) return 'Festlegung „entfällt“ überholt – erneut festlegen oder aufheben';
  if (p.unwirksam) return `Festlegung „entfällt“ noch nicht wirksam – ${p.unwirksam}`;
  return '';
}

/** Paragrafen je Norm zusammengefasst: „BauNVO §§ 18, 19, 20 · LP I C.1, C.2“ */
function nachNorm(ps: ParagrafErgebnis[], normen: { id: string; def: { kurz: string } }[]): string {
  const gruppen = new Map<string, ParagrafErgebnis[]>();
  for (const p of ps) gruppen.set(`${p.modul}/${p.norm}`, [...(gruppen.get(`${p.modul}/${p.norm}`) ?? []), p]);
  return [...gruppen.entries()]
    .map(([id, liste]) => {
      const kurz = normen.find((n) => n.id === id)?.def.kurz ?? id;
      const zahlen = liste.every((p) => /^\d/.test(p.paragraf));
      const nrn = liste.map((p) => p.paragraf).join(', ');
      return zahlen ? `${kurz} ${liste.length > 1 ? '§§' : '§'} ${nrn}` : `${kurz} ${nrn}`;
    })
    .join(' · ');
}

/** Entwurfsvermerk als Kopfzeile jeder Druckseite (im reservierten oberen Seitenrand, überdruckt keinen Text) */
const ENTWURF_DRUCK = `@media print { @page { margin-top: 20mm; @top-center { content: 'ENTWURF – enthält nicht gespeicherte bzw. nicht bestätigte Angaben von Hand'; font: 700 14pt 'Segoe UI', system-ui, sans-serif; color: #8a5300; } } }`;
/** Modulstände sind Daten (JJJJ-MM-TT) – im Protokoll wie alle Daten als TT.MM.JJJJ */
const stand = (v: string) => (/^\d{4}-\d\d-\d\d$/.test(v) ? datum(v) : v);

/** Ampel in der Tabelle: mit „von Hand“ bzw. „von Hand, Entwurf“ */
function ampelText(p: ParagrafErgebnis): string {
  if (!p.festlegung) return AMPEL_TEXT[p.ampel];
  return `${AMPEL_TEXT[p.ampel]} (von Hand${p.festlegung.bestaetigt ? '' : ', Entwurf'})`;
}

/**
 * Prüfprotokoll zum Drucken bzw. als PDF. Aufbau: Grundlagen, Festlegungen von Hand und gesicherte Angaben, offene
 * Punkte als Tabelle (was fehlt – Anzahl – Paragrafen), dann alle Vorschriften je Ebene. „Prüfung abschließen“ legt einen Stand in der
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
  const ungespeichertGesamt = useBaurecht(istGeaendert);
  const laedt = useBaurecht((s) => s.laedt.length);
  const [nurRelevant, setNurRelevant] = useState(false);
  const fenster = useRef<HTMLDivElement>(null);
  useEscSchliessen(onClose);
  // Fokus: beim Öffnen hinein, Tab bleibt im Protokoll, beim Schließen zurück an die Stelle davor
  useEffect(() => {
    const vorher = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const d = fenster.current;
    d?.querySelector<HTMLElement>('.br-protokoll-aktionen button:not([disabled])')?.focus();
    const taste = (e: KeyboardEvent) => {
      // liegt ein Dialog über dem Protokoll (z. B. Bestätigen beim Speichern), führt der den Fokus
      if (e.key !== 'Tab' || !d || document.querySelector('.modal')) return;
      const ziele = [...d.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), [tabindex="0"]')];
      if (!ziele.length) return;
      const [erstes, letztes] = [ziele[0], ziele[ziele.length - 1]];
      if (!d.contains(document.activeElement)) {
        e.preventDefault();
        erstes.focus();
      } else if (e.shiftKey && document.activeElement === erstes) {
        e.preventDefault();
        letztes.focus();
      } else if (!e.shiftKey && document.activeElement === letztes) {
        e.preventDefault();
        erstes.focus();
      }
    };
    document.addEventListener('keydown', taste, true);
    return () => {
      document.removeEventListener('keydown', taste, true);
      if (vorher?.isConnected) vorher.focus();
    };
  }, []);
  if (!project) return null;
  const a = pruefstand.auswertung;
  const ungespeichert = new Set(offeneB ? offeneB.split('|') : []);
  const entwuerfe = (offeneF ? offeneF.split('|').length : 0) + ungespeichert.size;
  const offen = a.paragrafen.filter((p) => p.ampel === 'gelb');
  const vonHand = a.paragrafen.filter((p) => p.festlegung);
  const ausEntwurf = vonHand.filter((p) => !p.festlegung!.bestaetigt);
  const ueberholt = a.paragrafen.filter((p) => p.ueberholt && p.ampel !== 'gelb');
  const gesichert = Object.entries(a.fakten).filter(([, f]) => f.bestaetigt);
  // abgeschlossen wird nur ein gespeicherter, zweimal bestätigter und vollständig geladener Stand
  const sperre = entwuerfe ? `Erst speichern: ${entwuerfe === 1 ? 'eine Angabe von Hand ist' : `${entwuerfe} Angaben von Hand sind`} noch Entwurf (zweite Bestätigung fehlt)` : ungespeichertGesamt ? 'Erst speichern: Es gibt ungespeicherte Änderungen' : laedt ? 'Die Gesetzestexte werden noch geholt – bitte warten' : '';
  // offene Punkte nach der fehlenden Angabe gruppiert („Baugebiet – 20 Paragrafen“), der Rest nach dem Grund
  const ohneRegel = a.normen.filter((n) => n.ohneRegel);
  const gruppen = new Map<string, ParagrafErgebnis[]>();
  for (const p of [...offen, ...ueberholt]) {
    const o = p.offen[0];
    const k =
      gruppeVon(p) ||
      (o && !o.startsWith('paragraf:') ? `Es fehlt: ${offenText(o, a.text)}` : o ? `Hängt an ${offenText(o, a.text)} (dort offen)` : p.gruende[0].replace(/\s*\(.*$/, '').replace(/^Offen – /, '').replace(/\.$/, ''));
    gruppen.set(k, [...(gruppen.get(k) ?? []), p]);
  }
  const titel = `Baurechtliche Prüfung vor dem Einreichen – ${antrag}`;
  // Stand einer Festlegung von Hand: bestätigt/Entwurf und wirksam/überholt/nicht wirksam – getrennt von der Begründung
  const festlegungStand = (q: ParagrafErgebnis) =>
    [q.festlegung!.bestaetigt ? 'bestätigt' : 'Entwurf', q.ueberholt ? `überholt: ${q.ueberholt}` : q.unwirksam ? `noch nicht wirksam: ${q.unwirksam}` : 'wirksam'].join(' · ');
  const abschliessen = () => {
    if (sperre) return;
    const ampeln: Record<string, Ampel> = Object.fromEntries(a.paragrafen.map((p) => [p.id, p.ampel]));
    useBaurecht.getState().protokollAnhaengen({ am: new Date().toISOString(), von: benutzer(), paket: paket.version, einreichung: pruefstand.einreichung, fassungen: verwendeteFassungen(a), zaehler: a.zaehler, ampeln, offen: offen.length + ueberholt.length + ohneRegel.length });
  };
  const datei = quelle?.art === 'ordner' ? quelle.datei : quelle?.art === 'datei' ? quelle.name : null;
  const geo = [...new Set(Object.values(a.fakten).filter((f) => f.herkunft === 'geodienst' && f.quelle).map((f) => `${f.quelle}${f.stand ? `, abgefragt ${datum(f.stand)}` : ''}`))];
  return (
    <div className="report-backdrop br-protokoll-hintergrund">
      <div className="report br-protokoll" role="dialog" aria-modal="true" aria-label={titel} ref={fenster}>
        {entwuerfe > 0 && <style>{ENTWURF_DRUCK}</style>}
        <div className="report-actions no-print br-protokoll-aktionen">
          <label className="toggle">
            <input type="checkbox" checked={nurRelevant} onChange={(e) => setNurRelevant(e.target.checked)} /> ohne „entfällt“
          </label>
          <span className="tb-spacer" />
          {sperre && (
            <span className="br-sperre" id="br-sperre-grund">
              {sperre}
            </span>
          )}
          <button type="button" onClick={() => druckenAls({ datei, projektName: project.name, zusatz: `Baurecht ${antrag}` })}>
            Drucken / PDF …
          </button>
          <button
            type="button"
            className="primary"
            onClick={abschliessen}
            disabled={!!sperre}
            aria-describedby={sperre ? 'br-sperre-grund' : undefined}
            title={sperre || 'Diesen Stand mit Fassungen und Ampeln in der Projektdatei ablegen (danach speichern)'}
          >
            Prüfung abschließen
          </button>
          <button type="button" onClick={onClose}>
            Schließen
          </button>
        </div>
        {entwuerfe > 0 && (
          <p className="br-meldung br-meldung-warn br-entwurf-hinweis no-print" role="status">
            Entwurf: {entwuerfe === 1 ? 'Eine Angabe von Hand ist noch nicht gespeichert und bestätigt. Sie ist' : `${entwuerfe} Angaben von Hand sind noch nicht gespeichert und bestätigt. Sie sind`} unten als „Entwurf“ bzw. „noch nicht gespeichert“ gekennzeichnet; abschließen lässt sich die Prüfung erst nach dem Speichern.
          </p>
        )}
        <DruckKopf titel={titel} project={project} stand={new Date()} />
        <h2>Grundlagen</h2>
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

        <h2>Festlegungen von Hand ({vonHand.length})</h2>
        {vonHand.length ? (
          <table className="report-table">
            <thead>
              <tr>
                <th style={{ width: '22%' }}>Paragraf</th>
                <th style={{ width: '13%' }}>Festlegung</th>
                <th>Begründung</th>
                <th style={{ width: '13%' }}>von, am</th>
                <th style={{ width: '18%' }}>Stand</th>
              </tr>
            </thead>
            <tbody>
              {vonHand.map((p) => (
                <tr key={p.id}>
                  <td className="strong">{a.text.paragraf?.(p.id) ?? p.id}</td>
                  <td>
                    {AMPEL_TEXT[p.festlegung!.ampel]} <span className="report-meta">(automatisch: {AMPEL_TEXT[p.automatisch]})</span>
                  </td>
                  <td>{p.festlegung!.grund}</td>
                  <td>
                    {p.festlegung!.von}, {datum(p.festlegung!.am)}
                  </td>
                  <td className={p.festlegung!.bestaetigt && !p.ueberholt && !p.unwirksam ? '' : 'br-entwurf-text'}>{festlegungStand(p)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p>Keine.</p>
        )}
        <h2>Gesicherte Angaben ({gesichert.length})</h2>
        {gesichert.length ? (
          <table className="report-table">
            <thead>
              <tr>
                <th style={{ width: '24%' }}>Angabe</th>
                <th style={{ width: '12%' }}>Wert</th>
                <th style={{ width: '20%' }}>Herkunft</th>
                <th>gestützt auf</th>
                <th style={{ width: '18%' }}>gesichert von, am</th>
              </tr>
            </thead>
            <tbody>
              {gesichert.map(([id, f]) => (
                <tr key={id}>
                  <td className="strong">{a.faktDefs[id]?.titel ?? id}</td>
                  <td>{wertAnzeige(f.wert, a.faktDefs[id])}</td>
                  <td>{f.herkunft === 'manuell' ? 'von Hand angegeben' : herkunftText(f)}</td>
                  <td>{f.bestaetigt!.grund || '–'}</td>
                  <td>
                    {f.bestaetigt!.von}, {datum(f.bestaetigt!.am)}
                    {ungespeichert.has(id) && <span className="br-entwurf-text"> – noch nicht gespeichert</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p>Keine.</p>
        )}

        <h2>Offene Punkte ({offen.length + ueberholt.length + ohneRegel.length})</h2>
        {offen.length + ueberholt.length + ohneRegel.length ? (
          <table className="report-table br-protokoll-offen">
            <thead>
              <tr>
                <th style={{ width: '32%' }}>Was fehlt bzw. zu klären ist</th>
                <th style={{ width: '8%' }}>Anzahl</th>
                <th>Paragrafen</th>
              </tr>
            </thead>
            <tbody>
              {ohneRegel.length > 0 && (
                <tr>
                  <td className="strong">Keine Regeldatei – von Hand beurteilen</td>
                  <td>{ohneRegel.length}</td>
                  <td>{ohneRegel.map((n) => normVoll(n.def)).join(' · ')}</td>
                </tr>
              )}
              {[...gruppen.entries()]
                .sort((x, y) => y[1].length - x[1].length)
                .map(([k, ps]) => (
                  <tr key={k}>
                    <td className="strong">{k}</td>
                    <td>{ps.length}</td>
                    <td>{nachNorm(ps, a.normen)}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        ) : (
          <p>Keine – alle Vorschriften sind eingeordnet.</p>
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
                      {normVoll(n.def)}{' '}
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
                        {ps.map((p) => {
                          const e = einheitName(p.paragraf, p.titel);
                          return (
                          <tr key={p.id} className={`br-zeile-${p.ampel}`}>
                            <td>{e.nr}</td>
                            <td>{e.titel}</td>
                            <td className="strong">{ampelText(p)}</td>
                            <td>
                              {p.festlegung ? `${p.festlegung.grund} (${p.festlegung.von}, ${datum(p.festlegung.am)}; automatisch: ${AMPEL_TEXT[p.automatisch]})` : p.gruende.join(' ')}
                              {(p.ueberholt || p.unwirksam) && <div className="report-meta">{p.ueberholt ? `Festlegung überholt: ${p.ueberholt}` : `Festlegung noch nicht wirksam: ${p.unwirksam}`}</div>}
                            </td>
                          </tr>
                          );
                        })}
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
                  <strong>{h.titel}</strong>
                  {h.titel.includes(h.modul) ? '' : ` (${h.modul})`}: {h.text}
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
