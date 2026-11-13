import { useMemo, useState } from 'react';
import { fmt2 } from '@core/format';
import type { Point } from '@core/geometry';
import { bounds, centroid, polygonArea } from '@core/geometry';
import { nutzungLabel, VERSIEGELUNGEN, versiegelungInfo } from '@core/lageplan';
import type { Project, RoomShape } from '@core/model';
import type { Anrechnung, Kennzahl, Nachweis, Status } from '../massNutzung';
import { aktiveVariante, baunvoLabel, bauoLabel, flaechenDerVariante, massNachweis, sachlicheHinweise, varianten } from '../massNutzung';
import { druckenAls } from '@core/platform/projektDatei';
import { setMassNutzung, useGrz } from '../store';
import { ANRECHNUNG, AUFENTHALT, BILANZ_REST, BILANZ_UEBER, flaechenVergleich, garagenFreiText, GELAENDE_QUELLE, GF_ART, HAFTUNG, kennzahlWert, roemisch, STATUS, vollgeschosseZulaessig, zahl } from '../texte';
import { bebauungsplanText, GEBIETSARTEN } from '@core/model';
import { useEscSchliessen } from '@core/ui/Dialog';
import { datumText, DruckKopf } from '@core/ui/DruckKopf';
import { beschriftungsPunkt, massstabLaenge, PT } from '../beschriftung';
import type { Rechenweg } from '../rechenweg';
import { flaechenNummern, rechenweg as rechenwegVon, teilName } from '../rechenweg';
import { teilFormel } from '@core/flaechenZerlegung';

/** Druckbarer Nachweis des Maßes der baulichen Nutzung (GRZ, GFZ, Vollgeschosse) – über den Druckdialog auch als PDF. */
export function NachweisDruck({ onClose }: { onClose: () => void }) {
  useEscSchliessen(onClose);
  const project = useGrz((s) => s.project);
  const n = useMemo(() => massNachweis(project), [project]);
  const [plan, setPlan] = useState(true);
  const [raeume, setRaeume] = useState(true);
  // Haftungssatz des Tools gehört nicht auf das Blatt für das Bauamt – nur auf Wunsch
  const [haftung, setHaftung] = useState(false);
  // prüffähiger Rechenweg (Formeln, Teilflächen mit Maßen) – im Druck standardmäßig an
  const [mitRechenweg, setMitRechenweg] = useState(true);
  // Stand des Nachweises: nicht automatisch heute, sondern wie eingetragen und im Projekt gespeichert (leer = ohne Stand)
  const stand = project.massNutzung?.stand ?? '';
  const setStand = (v: string) => useGrz.getState().update((p) => setMassNutzung(p, { stand: v || undefined }), 'stand', 'Stand ändern');
  const m = project.massNutzung ?? {};
  const G = n.grundstueck.flaeche;
  const eigene = n.lageplan.filter((l) => !l.nachbar);
  const nr = useMemo(() => flaechenNummern(n), [n]);
  const vor1990 = n.recht.baunvo !== '1990';
  // Aufenthaltsräume in Nicht-Vollgeschossen: vor 1990, 1990 nur bei Festsetzung (§ 20 Abs. 3 S. 2)
  const mitRaeumen = n.aufenthaltZaehlt;
  const aufenthalt = mitRaeumen ? aufenthaltsraeume(project, n) : [];
  const hinweise = sachlicheHinweise(n);
  const grLabel = vor1990 ? 'GR' : 'GR II';
  const rw = useMemo(() => rechenwegVon(n, nr), [n, nr]);

  return (
    <div className="report-backdrop">
      <div className="report grz-report">
        <div className="report-actions no-print">
          <span className="muted">Inhalt:</span>
          <label className="toggle">
            <input type="checkbox" checked={plan} onChange={(e) => setPlan(e.target.checked)} />
            Lageplan
          </label>
          {mitRaeumen && (
            <label className="toggle">
              <input type="checkbox" checked={raeume} onChange={(e) => setRaeume(e.target.checked)} />
              Aufenthaltsräume
            </label>
          )}
          <label className="toggle">
            <input type="checkbox" checked={mitRechenweg} onChange={(e) => setMitRechenweg(e.target.checked)} />
            Rechenweg
          </label>
          <label className="toggle">
            <input type="checkbox" checked={haftung} onChange={(e) => setHaftung(e.target.checked)} />
            Haftungshinweis
          </label>
          <label className="toggle" title="Stand des Nachweises im Kopf – leer: ohne Angabe">
            Stand <input type="date" value={stand} onChange={(e) => setStand(e.target.value)} />
          </label>
          <button className="primary" onClick={() => druckenAls({ datei: useGrz.getState().datei, projektName: project.name, zusatz: 'GRZ+GFZ' })}>
            Drucken / PDF
          </button>
          <button onClick={onClose}>Schließen</button>
        </div>

        <DruckKopf
          titel={varianten(project).length > 1 ? `Nachweis des Maßes der baulichen Nutzung – Variante ${aktiveVariante(project)}` : 'Nachweis des Maßes der baulichen Nutzung'}
          project={project}
          stand={stand}
        />

        <h2>Grundlagen</h2>
        <table className="report-table narrow">
          <tbody>
            <tr>
              <td>Bebauungsplan</td>
              <td>
                {[bebauungsplanText(project.meta.bebauungsplan), m.planDatum ? `in Kraft seit ${datumText(m.planDatum)}` : 'kein Datum (aktuelles Recht)', m.auslegungDatum && `ausgelegt ab ${datumText(m.auslegungDatum)}`].filter(Boolean).join(', ')}
              </td>
            </tr>
            {m.gebietsart && (
              <tr>
                <td>Baugebiet</td>
                <td>{GEBIETSARTEN.find((g) => g.id === m.gebietsart)?.label ?? m.gebietsart}</td>
              </tr>
            )}
            <tr>
              <td>Baunutzungsverordnung</td>
              <td>
                {baunvoLabel(n.recht.baunvo)}
                {m.baunvo ? ' (festgelegt)' : ''}
              </td>
            </tr>
            <tr>
              <td>Vollgeschossbegriff</td>
              <td>{bauoLabel(n.recht.bauo)}</td>
            </tr>
            <tr>
              <td>Festsetzungen</td>
              <td>
                {[
                  m.grz !== undefined && `GRZ ${zahl(m.grz)}`,
                  m.grzIIMax !== undefined && `GRZ II ${zahl(m.grzIIMax)}`,
                  m.gfz !== undefined && `GFZ ${zahl(m.gfz)}`,
                  m.grAbsolut !== undefined && `GR ${fmt2(m.grAbsolut)} m²`,
                  m.gfAbsolut !== undefined && `GF ${fmt2(m.gfAbsolut)} m²`,
                  m.bmz !== undefined && `BMZ ${zahl(m.bmz)}`,
                  vollgeschosseZulaessig(n.vollgeschosse, '') && `Vollgeschosse ${vollgeschosseZulaessig(n.vollgeschosse, '').replace('zulässig ', 'höchstens ')}`,
                  m.traufhoeheMax !== undefined && `Traufhöhe ≤ ${fmt2(m.traufhoeheMax)} m`,
                  m.firsthoeheMax !== undefined && `Firsthöhe ≤ ${fmt2(m.firsthoeheMax)} m`,
                  m.aufenthaltNichtVollgeschoss && 'Aufenthaltsräume in Nicht-Vollgeschossen zählen (§ 20 Abs. 3 S. 2)',
                ]
                  .filter(Boolean)
                  .join(' · ') || 'keine eingetragen'}
              </td>
            </tr>
            <tr>
              <td>Grundstücksfläche</td>
              <td>
                {G !== undefined ? `${fmt2(G)} m²` : 'fehlt'}
                {n.grundstueck.quelle === 'lageplan' && ' (aus dem Lageplan)'}
                {n.grundstueck.quelle === 'grenze' && ' (aus der gezeichneten Grenze)'}
                {n.grundstueck.quelle === 'projektdaten' && n.grundstueck.grenze !== undefined && ` (gezeichnete Grenze ${fmt2(n.grundstueck.grenze)} m²)`}
              </td>
            </tr>
            <tr>
              <td>Geländeoberfläche</td>
              <td>
                {fmt2(n.gelaende.hoehe)} m über ±0,00 ({GELAENDE_QUELLE[n.gelaende.quelle]}
                {n.gelaende.min !== undefined && n.gelaende.max !== undefined && n.gelaende.max - n.gelaende.min > 0.05 ? `, ${fmt2(n.gelaende.min)} bis ${fmt2(n.gelaende.max)} m am Gebäude` : ''})
              </td>
            </tr>
          </tbody>
        </table>
        {n.recht.hinweise.length > 0 && <p className="report-note">{n.recht.hinweise.join(' ')}</p>}

        <h2>Ergebnis</h2>
        <table className="report-table">
          <thead>
            <tr>
              <th>Kennzahl</th>
              <th className="num">Fläche [m²]</th>
              <th className="num">vorhanden</th>
              <th className="num">zulässig</th>
              <th className="num">Reserve [m²]</th>
              <th>Ergebnis</th>
            </tr>
          </thead>
          <tbody>
            <KennzahlZeile titel={vor1990 ? 'GRZ' : 'GRZ I'} kurz={vor1990 ? 'GR' : 'GR I'} k={n.grz} />
            {n.grz2 && <KennzahlZeile titel="GRZ II (§ 19 Abs. 4)" kurz="GR II" k={n.grz2} />}
            <KennzahlZeile titel="GFZ" kurz="GF" k={n.gfz} />
            {n.grAbsolut && <AbsolutZeile titel={vor1990 ? 'GR (absolut)' : 'GR I (absolut)'} a={n.grAbsolut} />}
            {n.gfAbsolut && <AbsolutZeile titel="GF (absolut)" a={n.gfAbsolut} />}
            {n.bmz && <KennzahlZeile titel="BMZ" kurz="BM" k={n.bmz} />}
            <tr>
              <td>Vollgeschosse</td>
              <td className="num" />
              <td className="num strong">{roemisch(n.vollgeschosse.anzahl)}</td>
              <td className="num">{vollgeschosseZulaessig(n.vollgeschosse, '').replace('zulässig ', '') || '–'}</td>
              <td className="num" />
              <StatusZelle s={n.vollgeschosse.status} />
            </tr>
          </tbody>
        </table>
        {n.garagenFrei !== undefined && n.garagenFrei > 0 && (
          <p className="report-note">{garagenFreiText(n.recht.baunvo, n.garagenFrei)}</p>
        )}
        {(n.grz.mitOffenen !== undefined || n.grz2?.mitOffenen !== undefined) && (
          <p className="report-note">
            Ungeklärte Flächen („prüfen“): {n.grz2 ? 'GRZ II' : 'GRZ'} bis {kennzahlWert(n.grz2 ?? n.grz, (n.grz2 ?? n.grz).mitOffenen)} – Einstufung mit der Bauaufsicht klären.
          </p>
        )}

        {plan && <LageplanSkizze n={n} project={project} nr={nr} rechenweg={mitRechenweg ? rw : undefined} />}

        <h2>Grundfläche</h2>
        <table className="report-table">
          <thead>
            <tr>
              <th>Nr.</th>
              <th>Fläche</th>
              <th>Nutzung</th>
              <th>Versiegelung</th>
              <th className="num">Fläche [m²]</th>
              <th className="num" title="außerhalb des Gebäudes, Überlagerungen nur einmal gezählt">
                eindeutig [m²]
              </th>
              <th className="num">angerechnet auf {grLabel} [m²]</th>
              <th>Anrechnung</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td />
              <td>Hauptanlage (Gebäude)</td>
              <td />
              <td />
              <td className="num">{fmt2(n.hauptanlage)}</td>
              <td className="num">{fmt2(n.hauptanlage)}</td>
              <td className="num">{fmt2(n.hauptanlage)}</td>
              <td>{vor1990 ? 'zählt' : 'GRZ I und II'}</td>
            </tr>
            {eigene.map((l) => (
              <tr key={l.id}>
                <td>{nr.get(l.id)}</td>
                <td>{l.name}</td>
                <td>{nutzungLabel(l.nutzung)}</td>
                <td>{versiegelungInfo(l.versiegelung).label}</td>
                <td className="num">{fmt2(l.flaeche)}</td>
                <td className="num">
                  {fmt2(l.flaecheEindeutig)}
                  {l.ueberlagert > 0.05 && <div className="report-note">{fmt2(l.ueberlagert)} überlagert</div>}
                </td>
                <AngerechnetZelle a={l} />
                <td>{ANRECHNUNG[l.anrechnung]}</td>
              </tr>
            ))}
            {n.unterirdisch && n.unterirdisch.flaeche > 0.005 && (
              <tr>
                <td />
                <td>Kellergeschoss außerhalb der Hauptanlage</td>
                <td>{nutzungLabel('unterirdisch')}</td>
                <td />
                <td className="num" />
                <td className="num">{fmt2(n.unterirdisch.flaeche)}</td>
                <AngerechnetZelle a={n.unterirdisch} />
                <td>{ANRECHNUNG[n.unterirdisch.anrechnung]}</td>
              </tr>
            )}
            <tr className="subtotal">
              <td />
              <td colSpan={4}>Summe Lageplan-Flächen (jede Stelle einmal)</td>
              <td className="num">{fmt2(eigene.reduce((a, l) => a + l.flaecheEindeutig, 0))}</td>
              <td />
              <td />
            </tr>
            {!vor1990 && (
              <tr className="sum grz-summe-gr1">
                <td />
                <td colSpan={5}>Grundfläche GR I (Hauptanlage)</td>
                <td className="num">{fmt2(n.grz.flaeche)}</td>
                <td />
              </tr>
            )}
            <tr className="sum grz-summe-gr">
              <td />
              <td colSpan={5}>
                Grundfläche {grLabel}
                {n.garagenFrei !== undefined && n.garagenFrei > 0 && ` (nach Abzug von ${fmt2(n.garagenFrei)} m² anrechnungsfreien Garagen)`}
              </td>
              <td className="num">{fmt2((n.grz2 ?? n.grz).flaeche)}</td>
              <td />
            </tr>
          </tbody>
        </table>

        {mitRechenweg && <RechenwegTabelle rw={rw} />}

        <h2>Vollgeschosse</h2>
        <table className="report-table">
          <thead>
            <tr>
              <th>Geschoss</th>
              <th className="num">Gelände</th>
              <th className="num">über Gelände</th>
              <th className="num">Anteil</th>
              <th>Ergebnis</th>
              <th>Begründung</th>
            </tr>
          </thead>
          <tbody>
            {n.geschosse.map((g) => (
              <tr key={g.storeyId}>
                <td>{g.name}</td>
                <td className="num">
                  {fmt2(g.gelaende.mittel)} m
                  {g.gelaende.max - g.gelaende.min > 0.05 && (
                    <div className="report-note">
                      {fmt2(g.gelaende.min)} bis {fmt2(g.gelaende.max)}
                    </div>
                  )}
                </td>
                <td className="num">{fmt2(g.ueberGelaende)} m</td>
                <td className="num">{g.oberirdisch ? `${Math.round(g.anteil * 100)} %` : '–'}</td>
                <td className="strong">
                  {g.vollgeschoss ? 'Vollgeschoss' : 'kein Vollgeschoss'}
                  {!g.automatisch && ' (von Hand festgelegt)'}
                </td>
                <td>{g.begruendung}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <h2>Geschossfläche</h2>
        <table className="report-table narrow">
          <tbody>
            {n.gfJeGeschoss.map((g) => (
              <tr key={g.storeyId}>
                <td>{g.name}</td>
                <td>{GF_ART[g.art]}</td>
                <td className="num">{fmt2(g.flaeche)} m²</td>
              </tr>
            ))}
            <tr className="sum">
              <td>Summe</td>
              <td />
              <td className="num">{fmt2(n.gf)} m²</td>
            </tr>
          </tbody>
        </table>

        {raeume && aufenthalt.length > 0 && (
          <>
            <h2>Aufenthaltsräume in Nicht-Vollgeschossen</h2>
            <p className="report-note">
              {baunvoLabel(n.recht.baunvo)}: Aufenthaltsräume in anderen Geschossen einschließlich der zugehörigen Treppenräume und Umfassungswände zählen zur Geschossfläche.
            </p>
            <table className="report-table narrow">
              <thead>
                <tr>
                  <th>Geschoss</th>
                  <th>Raum</th>
                  <th className="num">Fläche [m²]</th>
                  <th>Einstufung</th>
                </tr>
              </thead>
              <tbody>
                {aufenthalt.map(({ geschoss, r, pr }) => (
                  <tr key={r.id}>
                    <td>{geschoss}</td>
                    <td>{[r.nummer, r.name].filter(Boolean).join(' ')}</td>
                    <td className="num">{fmt2(polygonArea(r.points))}</td>
                    <td>
                      {AUFENTHALT[pr.ergebnis]}
                      {r.aufenthalt ? ' (von Hand festgelegt)' : ''}
                      <div className="report-note">{pr.anforderung.text}</div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}

        {eigene.length > 0 && (
          <>
            <h2>Flächenbilanz des Grundstücks</h2>
            <table className="report-table narrow">
              <tbody>
                <tr>
                  <td>Gebäude</td>
                  <td className="num">{fmt2(n.bilanz.gebaeude)} m²</td>
                </tr>
                {VERSIEGELUNGEN.map((v) => (
                  <tr key={v.id}>
                    <td>{v.label}</td>
                    <td className="num">{fmt2(n.bilanz[v.id])} m²</td>
                  </tr>
                ))}
                <tr className="sum">
                  <td>Summe</td>
                  <td className="num">{fmt2(n.bilanz.summe)} m²</td>
                </tr>
                {n.bilanz.differenz !== undefined && n.bilanz.differenz > 0.5 && (
                  <tr>
                    <td>{BILANZ_REST}</td>
                    <td className="num">{fmt2(n.bilanz.differenz)} m²</td>
                  </tr>
                )}
                {n.bilanz.differenz !== undefined && n.bilanz.differenz < -0.5 && (
                  <tr>
                    <td className="strong">{BILANZ_UEBER}</td>
                    <td className="num strong">{fmt2(-n.bilanz.differenz)} m²</td>
                  </tr>
                )}
              </tbody>
            </table>
          </>
        )}

        {hinweise.length > 0 && (
          <>
            <h2>Hinweise</h2>
            <ul className="grz-report-hinweise">
              {hinweise.map((h, i) => (
                <li key={i}>{h}</li>
              ))}
            </ul>
          </>
        )}

        <div className="grz-report-unterschrift">
          <div>
            <span />
            Ort, Datum
          </div>
          <div>
            <span />
            Entwurfsverfasser/in
          </div>
        </div>
        {haftung && <p className="report-note grz-haftung">{HAFTUNG}</p>}
      </div>
    </div>
  );
}

function KennzahlZeile({ titel, kurz, k }: { titel: string; kurz: string; k: Kennzahl }) {
  const vergleich = flaechenVergleich(kurz, k);
  return (
    <tr>
      <td>{titel}</td>
      <td className="num">{fmt2(k.flaeche)}</td>
      <td className="num strong">
        {kennzahlWert(k)}
        {k.mitOffenen !== undefined && ` (bis ${kennzahlWert(k, k.mitOffenen)})`}
      </td>
      <td className="num">{k.zulaessig !== undefined ? zahl(k.zulaessig) : '–'}</td>
      <td className="num">{k.reserve !== undefined ? fmt2(k.reserve) : '–'}</td>
      <StatusZelle s={k.status}>{vergleich && <div className="report-note">{vergleich}</div>}</StatusZelle>
    </tr>
  );
}

/** Rechenweg: Formelzeilen und Teilflächen je Fläche (Länge × Breite bzw. g × h / 2) */
function RechenwegTabelle({ rw }: { rw: Rechenweg }) {
  return (
    <section className="grz-rechenweg">
      <h2>Rechenweg</h2>
      <ul className="grz-formeln">
        {rw.formeln.map((f, i) => (
          <li key={i}>{f}</li>
        ))}
      </ul>
      <table className="report-table">
        <thead>
          <tr>
            <th>Nr.</th>
            <th>Fläche</th>
            <th>Teilfläche</th>
            <th>Rechnung</th>
            <th className="num">Fläche [m²]</th>
          </tr>
        </thead>
        <tbody>
          {rw.flaechen.map((f) => (
            <RechenwegZeilen key={f.nr + f.name} f={f} />
          ))}
        </tbody>
      </table>
      <p className="report-note">Gezählt wird der eindeutige Anteil jeder Fläche (ohne Gebäude und Überlagerungen); Maße auf cm gerundet.</p>
    </section>
  );
}

function RechenwegZeilen({ f }: { f: Rechenweg['flaechen'][number] }) {
  const z = f.zerlegung;
  if (!z.zerlegt)
    return (
      <tr className="subtotal">
        <td>{f.nr}</td>
        <td>{f.name}</td>
        <td colSpan={2}>Fläche aus Koordinaten (Gaußsche Flächenformel)</td>
        <td className="num">{fmt2(z.flaeche)}</td>
      </tr>
    );
  return (
    <>
      {z.teile.map((t, i) => (
        <tr key={i}>
          <td>{i === 0 ? f.nr : ''}</td>
          <td>{i === 0 ? f.name : ''}</td>
          <td>{teilName(f.nr, i, t)}</td>
          <td className="formula">{teilFormel(t)}</td>
          <td className="num">{fmt2(t.flaeche)}</td>
        </tr>
      ))}
      {z.teile.length > 1 && (
        <tr className="subtotal">
          <td />
          <td colSpan={3}>Summe {f.name}</td>
          <td className="num">{fmt2(z.flaeche)}</td>
        </tr>
      )}
    </>
  );
}

/** absolute Festsetzung in m² */
function AbsolutZeile({ titel, a }: { titel: string; a: NonNullable<Nachweis['grAbsolut']> }) {
  return (
    <tr>
      <td>{titel}</td>
      <td className="num">{fmt2(a.flaeche)}</td>
      <td className="num" />
      <td className="num">{fmt2(a.zulaessig)} m²</td>
      <td className="num">{fmt2(a.zulaessig - a.flaeche)}</td>
      <StatusZelle s={a.status} />
    </tr>
  );
}

/** tatsächlich angerechnete Fläche, bei „prüfen“ als Spanne */
function AngerechnetZelle({ a }: { a: { angerechnet: number; angerechnetBis?: number; anrechnung: Anrechnung } }) {
  return (
    <td className="num">
      {fmt2(a.angerechnet)}
      {a.angerechnetBis !== undefined && <div className="report-note">bis {fmt2(a.angerechnetBis)}</div>}
    </td>
  );
}

/** Aufenthalts- und Treppenräume der Nicht-Vollgeschosse (vor 1990 maßgebend für die Geschossfläche) – wie im Nachweis geprüft */
function aufenthaltsraeume(project: Project, n: Nachweis): { geschoss: string; r: RoomShape; pr: Nachweis['raeume'][number] }[] {
  return n.raeume
    .filter((pr) => pr.ergebnis !== 'nein')
    .flatMap((pr) => {
      const s = project.storeys.find((x) => x.id === pr.storeyId);
      const r = s?.shapes.find((x): x is RoomShape => x.id === pr.roomId && x.kind === 'room');
      return r && s ? [{ geschoss: s.name, r, pr }] : [];
    });
}

/** Größe der Planfläche im Druck (CSS-Pixel): Breite der Seite, Höhe wie .grz-report .plan-svg (120 mm) */
const DRUCK_B = 680;
const DRUCK_H = (120 / 25.4) * 96;
/** Mindestschriftgröße der Nummern im Druck */
const SCHRIFT_PT = 10;

/**
 * Lageplan fürs Blatt: Grundstück, Gebäude schraffiert, Flächen farbig nach Versiegelung mit Nummern im eindeutigen
 * Anteil (nicht unter dem Gebäude), Maßstabsleiste und Nordpfeil (Planoberkante = Projektnorden des Modells)
 */
export function LageplanSkizze({ n, project, nr, rechenweg }: { n: Nachweis; project: Project; nr: Map<string, number>; rechenweg?: Rechenweg }) {
  const flaechen = flaechenDerVariante(project);
  const pts: Point[] = [...n.hauptanlagePolygone.flat(), ...n.anlagenPolygone.flat(), ...n.grundstueckPolygone.flat(), ...flaechen.filter((f) => !f.nachbar).flatMap((f) => f.points)];
  if (!pts.length) return null;
  const b = bounds(pts);
  const pad = Math.max(b.maxX - b.minX, b.maxY - b.minY) * 0.04 + 0.5;
  const vb0 = { x: b.minX - pad, y: b.minY - pad, w: b.maxX - b.minX + 2 * pad, h: b.maxY - b.minY + 2 * pad };
  // Weltmeter je Druckpixel – die Planfläche ist durch Breite oder Höhe begrenzt (meet); unten Platz für die Maßstabsleiste
  const k0 = Math.max(vb0.w / DRUCK_B, vb0.h / DRUCK_H);
  const vb = { ...vb0, h: vb0.h + k0 * 34 };
  const k = Math.max(vb.w / DRUCK_B, vb.h / DRUCK_H);
  const schrift = k * SCHRIFT_PT * PT;
  const d = (p: Point[]) => `M${p.map((q) => `${q.x} ${q.y}`).join('L')}Z`;
  const posten = new Map(n.lageplan.map((l) => [l.id, l]));
  const ml = massstabLaenge(vb.w);
  const mx = vb.x + k * 12;
  const my = vb.y + vb.h - k * 14;
  const nx = vb.x + vb.w - k * 22;
  const ny = vb.y + k * 10;
  return (
    <figure className="plan-figure">
      <h2>Lageplan</h2>
      <svg className="plan-svg" viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`} preserveAspectRatio="xMidYMid meet">
        <defs>
          <pattern id="grz-druck-hatch" width={k * 8} height={k * 8} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2={k * 8} stroke="#2a5bd7" strokeWidth={k * 2} strokeOpacity={0.5} />
          </pattern>
          {VERSIEGELUNGEN.map((v) => (
            <VersiegelungsMuster key={v.id} id={`grz-druck-${v.id}`} v={v} u={k} />
          ))}
        </defs>
        {flaechen.map((f) => (
          <path
            key={f.id}
            d={d(f.points)}
            // Farbe und Muster: auch im Graustufendruck unterscheidbar (Legende gleich)
            fill={f.nachbar ? versiegelungInfo(f.versiegelung).color : `url(#grz-druck-${f.versiegelung})`}
            fillOpacity={f.nachbar ? 0.12 : 1}
            stroke={f.nachbar ? '#9aa0a6' : '#5b6068'}
            strokeWidth={k}
            strokeDasharray={f.nachbar ? `${k * 4} ${k * 3}` : undefined}
          />
        ))}
        {n.hauptanlagePolygone.map((p, i) => (
          <path key={`h${i}`} d={d(p)} fill="url(#grz-druck-hatch)" stroke="#1d3f96" strokeWidth={k * 2} fillRule="evenodd" />
        ))}
        {n.anlagenPolygone.map((p, i) => (
          <path key={`a${i}`} d={d(p)} fill="#8a8f99" fillOpacity={0.45} stroke="#1d3f96" strokeWidth={k * 1.5} fillRule="evenodd" />
        ))}
        {n.grundstueckPolygone.map((p, i) => (
          <path key={`g${i}`} d={d(p)} fill="none" stroke="#1f2328" strokeWidth={k * 2.5} strokeDasharray={`${k * 10} ${k * 3} ${k * 2} ${k * 3}`} />
        ))}
        {rechenweg?.flaechen.flatMap((f) =>
          f.zerlegung.teile.length > 1 || f.nr === 'H'
            ? f.zerlegung.teile.map((t, i) => {
                const c = centroid(t.punkte);
                return (
                  <g key={`rw${f.nr}.${i}`} className="plan-teil">
                    <path d={d(t.punkte)} fill="none" stroke="#1f2328" strokeWidth={k * 0.6} strokeDasharray={`${k * 3} ${k * 2}`} />
                    <text x={c.x} y={c.y + schrift * 0.9} fontSize={k * 7 * PT} className="plan-label" textAnchor="middle" dominantBaseline="middle">
                      {`${f.nr}.${i + 1}: ${fmt2(t.laenge)} × ${fmt2(t.breite)}`}
                    </text>
                  </g>
                );
              })
            : [],
        )}
        {flaechen
          .filter((f) => nr.has(f.id))
          .map((f) => {
            const p = beschriftungsPunkt(posten.get(f.id)?.eindeutig ?? [], f.points);
            return (
              <text key={`t${f.id}`} x={p.x} y={p.y} className="plan-label" fontSize={schrift} fontWeight={600} textAnchor="middle" dominantBaseline="middle" data-flaeche={f.id}>
                {nr.get(f.id)}
              </text>
            );
          })}
        {n.lageplan
          .filter((l) => l.ausGebaeude && nr.has(l.id))
          .map((l) => {
            const p = beschriftungsPunkt(l.eindeutig, l.polygone![0]);
            return (
              <text key={`t${l.id}`} x={p.x} y={p.y} className="plan-label" fontSize={schrift} fontWeight={600} textAnchor="middle" dominantBaseline="middle" data-flaeche={l.id}>
                {nr.get(l.id)}
              </text>
            );
          })}
        <g className="plan-massstab" data-laenge={ml}>
          <rect x={mx} y={my - k * 3} width={ml / 2} height={k * 6} fill="#1f2328" />
          <rect x={mx + ml / 2} y={my - k * 3} width={ml / 2} height={k * 6} fill="#fff" stroke="#1f2328" strokeWidth={k} />
          <text x={mx} y={my - k * 6} fontSize={k * 9 * PT} className="plan-label" textAnchor="start">
            0
          </text>
          <text x={mx + ml} y={my - k * 6} fontSize={k * 9 * PT} className="plan-label" textAnchor="middle">
            {ml.toLocaleString('de-DE')} m
          </text>
        </g>
        <g className="plan-nordpfeil" transform={`translate(${nx} ${ny})`}>
          <path d={`M0 0 L${k * 7} ${k * 22} L0 ${k * 17} L${-k * 7} ${k * 22} Z`} fill="#1f2328" />
          <text x={0} y={k * 34} fontSize={k * 10 * PT} className="plan-label" textAnchor="middle" fontWeight={600}>
            N
          </text>
        </g>
      </svg>
      <figcaption className="plan-legend">
        <span>
          <i className="legend-bgf" style={{ background: 'rgba(42, 91, 215, 0.25)' }} />
          Gebäude (Hauptanlage)
        </span>
        {VERSIEGELUNGEN.map((v) => (
          <span key={v.id}>
            <svg className="legende-muster" width="14" height="10" aria-hidden>
              <defs>
                <VersiegelungsMuster id={`grz-legende-${v.id}`} v={v} u={0.6} />
              </defs>
              <rect x="0.5" y="0.5" width="13" height="9" fill={`url(#grz-legende-${v.id})`} stroke="#5b6068" strokeWidth="0.6" />
            </svg>
            {v.label}
          </span>
        ))}
        <span>{n.grenzeGezeichnet ? 'Strichpunktiert: Grundstücksgrenze' : 'Strichpunktiert: Umriss der erfassten Flächen (keine Grundstücksgrenze gezeichnet)'}</span>
        <span>Nummern: siehe „Grundfläche“</span>
      </figcaption>
    </figure>
  );
}

/**
 * Füllung je Versiegelung: Farbe wie im Plan der App (Deckkraft 0,55), dazu ein Muster, damit die Klassen auch
 * schwarz-weiß unterscheidbar sind – voll: dichte Schraffur, teil: Punkte, Grünfläche: nur Farbe. u: Weltmaß je Druckpixel
 */
function VersiegelungsMuster({ id, v, u }: { id: string; v: { id: string; color: string }; u: number }) {
  const w = u * 6;
  return (
    <pattern id={id} width={w} height={w} patternUnits="userSpaceOnUse" patternTransform={v.id === 'voll' ? 'rotate(45)' : undefined}>
      <rect width={w} height={w} fill={v.color} fillOpacity={0.55} />
      {v.id === 'voll' && <line x1="0" y1="0" x2="0" y2={w} stroke="#1f2328" strokeWidth={u * 1.2} strokeOpacity={0.7} />}
      {v.id === 'teil' && <circle cx={w / 2} cy={w / 2} r={u * 0.9} fill="#1f2328" fillOpacity={0.7} />}
    </pattern>
  );
}

/** Ergebnis im Druck: Verstoß fett – schwarz-weiß das einzige Mittel zur Hervorhebung */
function StatusZelle({ s, children }: { s: Status; children?: React.ReactNode }) {
  return (
    <td>
      {s === 'ueberschritten' || s === 'unterschritten' ? <strong>{STATUS[s].label}</strong> : STATUS[s].label}
      {children}
    </td>
  );
}
