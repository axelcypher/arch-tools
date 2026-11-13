import { useMemo, useState } from 'react';
import { fmt2 } from '@core/format';
import type { Spanne } from '@core/model';
import { istKg, istRisiko, kg1, KG_ERSTE_EBENE, kgName } from '../din276';
import type { PositionErgebnis } from '../kosten';
import { berechne, bezugLabel, euro, HAFTUNG, katalogText } from '../kosten';
import { istSpaeteStufe, ohneBandbreite, SPAETE_STUFE_HINWEIS, STUFEN, stufeLabel, stufeVon } from '../stufen';
import { MENGEN_BEZUEGE, MENGEN_INFO } from '../mengen';
import { druckenAls } from '@core/platform/projektDatei';
import { useKosten } from '../store';
import { useBauteile } from '../bauteile';
import { useEscSchliessen } from '@core/ui/Dialog';
import { DruckKopf } from '@core/ui/DruckKopf';

const zahl = (v: number, d = 2) => v.toLocaleString('de-DE', { minimumFractionDigits: d, maximumFractionDigits: d });
// ISO-Datum ohne Umweg über Date (das als UTC gelesen westlich von Greenwich den Vortag ergäbe)
const datum = (iso: string) => (/^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${Number(iso.slice(8, 10))}.${Number(iso.slice(5, 7))}.${iso.slice(0, 4)}` : iso);

/** Druckbare Kostenermittlung nach DIN 276 – über den Druckdialog auch als PDF. */
export function KostenDruck({ onClose }: { onClose: () => void }) {
  useEscSchliessen(onClose);
  const project = useKosten((s) => s.project);
  const waende = useBauteile((s) => s.waende);
  const e = useMemo(() => berechne(project, undefined, waende), [project, waende]);
  const [positionen, setPositionen] = useState(true);
  const [mengen, setMengen] = useState(true);
  const [staende, setStaende] = useState(true);
  const k = project.kosten ?? { positionen: [] };
  const stufe = STUFEN.find((s) => s.id === stufeVon(k.stufe))!;
  const heute = new Date().toLocaleDateString('de-DE');
  const aktiv = e.positionen.filter((x) => x.aktiv);
  // Kostenfeststellung: tatsächliche Kosten, keine Bandbreite
  const bandbreite = !ohneBandbreite(k.stufe) && Math.round(e.gesamtNetto[0]) !== Math.round(e.gesamtNetto[2]);
  const risiko = aktiv.filter((x) => istRisiko(x.pos.kg));
  const gezeigteMengen = MENGEN_BEZUEGE.filter((b) => e.mengen[b].wert > 0);

  return (
    <div className="report-backdrop">
      <div className="report ko-report">
        <div className="report-actions no-print">
          <label className="toggle">
            <input type="checkbox" checked={positionen} onChange={(ev) => setPositionen(ev.target.checked)} />
            Positionen
          </label>
          <label className="toggle">
            <input type="checkbox" checked={mengen} onChange={(ev) => setMengen(ev.target.checked)} />
            Mengen
          </label>
          {(k.staende?.length ?? 0) > 0 && (
            <label className="toggle">
              <input type="checkbox" checked={staende} onChange={(ev) => setStaende(ev.target.checked)} />
              Festgehaltene Stände
            </label>
          )}
          <button onClick={() => druckenAls({ datei: useKosten.getState().datei, projektName: project.name, zusatz: `Kosten ${stufeLabel(project.kosten?.stufe)}` })}>Drucken / PDF</button>
          <button className="primary" onClick={onClose}>
            Schließen
          </button>
        </div>

        <DruckKopf titel={`${stufe.label} nach DIN 276:2018-12 (${stufe.lph})`} project={project} />
        {istSpaeteStufe(k.stufe) && <p className="report-note ko-report-vorbehalt">{SPAETE_STUFE_HINWEIS}</p>}

        <h2>Grundlagen</h2>
        <table className="report-table narrow">
          <tbody>
            <tr>
              <td>Kostenstand (Preisstand)</td>
              <td>{k.datum ? datum(k.datum) : 'nicht angegeben'}</td>
            </tr>
            <tr>
              <td>Kennwerte</td>
              <td>{katalogText(k.katalog) || 'eigene Eingaben'}</td>
            </tr>
            {k.indexBasis !== undefined && k.indexAktuell !== undefined && (
              <tr>
                <td>Baupreisindex</td>
                <td>
                  {zahl(k.indexBasis, 1)} (Stand der Kennwerte) → {zahl(k.indexAktuell, 1)} (aktuell)
                </td>
              </tr>
            )}
            {k.regionalfaktor !== undefined && (
              <tr>
                <td>Regionalfaktor</td>
                <td>{zahl(k.regionalfaktor, 3)}</td>
              </tr>
            )}
            <tr>
              <td>Faktor auf die Kennwerte</td>
              <td>{e.faktor.toLocaleString('de-DE', { maximumFractionDigits: 4 })}</td>
            </tr>
            <tr>
              <td>Umsatzsteuer</td>
              <td>
                {e.mwst} %{k.kennwerteBrutto ? ' – die Kennwerte enthalten die Umsatzsteuer und wurden auf netto umgerechnet' : ' – Kennwerte netto'}
              </td>
            </tr>
          </tbody>
        </table>

        <h2>Kostenübersicht</h2>
        <table className="report-table">
          <thead>
            <tr>
              <th>KG</th>
              <th>Kostengruppe</th>
              {bandbreite && <th className="num">von</th>}
              <th className="num">{bandbreite ? 'Mittel' : 'Kosten netto'}</th>
              {bandbreite && <th className="num">bis</th>}
            </tr>
          </thead>
          <tbody>
            {e.summen.map((s) => (
              <tr key={s.kg} className={s.ebene === 1 ? 'subtotal' : 'ko-kg2'}>
                <td>{s.kg}</td>
                <td>{s.name}</td>
                <Betraege s={s.summe} bandbreite={bandbreite} />
              </tr>
            ))}
            {risiko.length > 0 && (
              <tr className="subtotal">
                <td />
                <td>Kostenrisiken</td>
                <Betraege s={e.risiko} bandbreite={bandbreite} />
              </tr>
            )}
            <tr className="sum">
              <td />
              <td>Gesamt netto</td>
              <Betraege s={e.gesamtNetto} bandbreite={bandbreite} />
            </tr>
            <tr>
              <td />
              <td>Umsatzsteuer {e.mwst} %</td>
              <Betraege s={[e.gesamtBrutto[0] - e.gesamtNetto[0], e.gesamtBrutto[1] - e.gesamtNetto[1], e.gesamtBrutto[2] - e.gesamtNetto[2]]} bandbreite={bandbreite} />
            </tr>
            <tr className="sum">
              <td />
              <td>Gesamt brutto</td>
              <Betraege s={e.gesamtBrutto} bandbreite={bandbreite} />
            </tr>
          </tbody>
        </table>
        {e.kennwerte.length > 0 && (
          <p className="report-keyfigures">
            Bauwerk (KG 300 + 400, brutto):{' '}
            {e.kennwerte
              .map((kw) => `${zahl(kw.wert[1], 0)} €/${kw.einheit} ${kw.kurz}${Math.round(kw.wert[0]) !== Math.round(kw.wert[2]) ? ` (${zahl(kw.wert[0], 0)} – ${zahl(kw.wert[2], 0)})` : ''}`)
              .join(' · ')}
          </p>
        )}

        {positionen && aktiv.length > 0 && (
          <>
            <h2>Positionen</h2>
            <table className="report-table">
              <thead>
                <tr>
                  <th>KG</th>
                  <th>Bezeichnung</th>
                  <th className="num">Menge</th>
                  <th>Bezug</th>
                  <th className="num">Kennwert</th>
                  {bandbreite && <th className="num">von</th>}
                  <th className="num">{bandbreite ? 'Mittel' : 'Kosten netto'}</th>
                  {bandbreite && <th className="num">bis</th>}
                </tr>
              </thead>
              <tbody>
                {KG_ERSTE_EBENE.filter((g) => aktiv.some((x) => kg1(x.pos.kg) === g)).map((g) => {
                  const summe = e.summen.find((s) => s.kg === g);
                  return [
                    <tr key={g} className="subtotal">
                      <td>{g}</td>
                      <td colSpan={4}>{kgName(g)}</td>
                      <Betraege s={summe?.summe ?? [0, 0, 0]} bandbreite={bandbreite} />
                    </tr>,
                    ...aktiv.filter((x) => kg1(x.pos.kg) === g).map((x) => <PositionZeile key={x.pos.id} x={x} bandbreite={bandbreite} />),
                  ];
                })}
                {risiko.length > 0 && (
                  <>
                    <tr className="subtotal">
                      <td />
                      <td colSpan={4}>Kostenrisiken</td>
                      <Betraege s={e.risiko} bandbreite={bandbreite} />
                    </tr>
                    {risiko.map((x) => (
                      <PositionZeile key={x.pos.id} x={x} bandbreite={bandbreite} />
                    ))}
                  </>
                )}
              </tbody>
            </table>
            <p className="report-note">
              Kosten = Menge × Kennwert (netto, nach Faktor); bei Prozentpositionen ist die Menge die Summe der genannten Kostengruppen. Pauschalen und Prozentsätze werden
              nicht mit dem Faktor angepasst.
            </p>
          </>
        )}

        {mengen && gezeigteMengen.length > 0 && (
          <>
            <h2>Mengen</h2>
            <table className="report-table">
              <thead>
                <tr>
                  <th />
                  <th>Menge</th>
                  <th className="num">Wert</th>
                  <th>Ermittlung</th>
                </tr>
              </thead>
              <tbody>
                {gezeigteMengen.map((b) => (
                  <tr key={b}>
                    <td className="strong">{MENGEN_INFO[b].kurz}</td>
                    <td>{MENGEN_INFO[b].label}</td>
                    <td className="num">
                      {b === 'we' ? e.mengen[b].wert : fmt2(e.mengen[b].wert)} {MENGEN_INFO[b].einheit}
                    </td>
                    <td>{e.mengen[b].festgelegt ? `von Hand festgelegt (abgeleitet: ${fmt2(e.mengen[b].abgeleitet)} ${MENGEN_INFO[b].einheit})` : MENGEN_INFO[b].ermittlung}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}

        {staende && (k.staende?.length ?? 0) > 0 && (
          <>
            <h2>Festgehaltene Stände</h2>
            <table className="report-table">
              <thead>
                <tr>
                  <th>Datum</th>
                  <th>Stufe</th>
                  <th>Bemerkung</th>
                  <th className="num">netto</th>
                  <th className="num">brutto</th>
                </tr>
              </thead>
              <tbody>
                {k.staende!.map((s) => (
                  <tr key={s.id}>
                    <td>{datum(s.datum)}</td>
                    <td>{stufeLabel(s.stufe)}</td>
                    <td>{s.bemerkung}</td>
                    <td className="num">{euro(s.gesamtNetto[1])}</td>
                    <td className="num">{euro(s.gesamtBrutto[1])}</td>
                  </tr>
                ))}
                <tr className="sum">
                  <td>{heute}</td>
                  <td>{stufeLabel(k.stufe)}</td>
                  <td>aktueller Stand</td>
                  <td className="num">{euro(e.gesamtNetto[1])}</td>
                  <td className="num">{euro(e.gesamtBrutto[1])}</td>
                </tr>
              </tbody>
            </table>
          </>
        )}

        {e.hinweise.length > 0 && (
          <>
            <h2>Hinweise</h2>
            <ul className="ko-report-hinweise">
              {e.hinweise.map((h, i) => (
                <li key={i}>{h}</li>
              ))}
            </ul>
          </>
        )}

        <div className="ko-report-unterschrift">
          <div>
            <span />
            Ort, Datum
          </div>
          <div>
            <span />
            Verfasser/in
          </div>
        </div>
        <p className="report-note">{HAFTUNG}</p>
      </div>
    </div>
  );
}

function Betraege({ s, bandbreite }: { s: Spanne; bandbreite: boolean }) {
  return (
    <>
      {bandbreite && <td className="num">{euro(s[0])}</td>}
      <td className="num strong">{euro(s[1])}</td>
      {bandbreite && <td className="num">{euro(s[2])}</td>}
    </>
  );
}

function PositionZeile({ x, bandbreite }: { x: PositionErgebnis; bandbreite: boolean }) {
  const p = x.pos;
  return (
    <tr>
      <td>{istKg(p.kg) && p.kg[1] !== '0' ? p.kg : ''}</td>
      <td>
        {p.bezeichnung}
        {(p.quelle || p.bemerkung) && <div className="report-note">{[p.quelle, p.bemerkung].filter(Boolean).join(' · ')}</div>}
      </td>
      <td className="num">{p.bezug === 'pauschal' ? '1' : p.bezug === 'prozent' ? euro(x.menge) : fmt2(x.menge)}</td>
      <td>{bezugLabel(p)}</td>
      <td className="num">{p.bezug === 'prozent' ? `${zahl(x.kennwert[1], 1)} %` : zahl(x.kennwert[1])}</td>
      <Betraege s={x.kosten} bandbreite={bandbreite} />
    </tr>
  );
}
