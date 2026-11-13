import { useEffect, useMemo, useState } from 'react';
import { Modal } from '@core/ui/Dialog';
import { meldung } from '@core/ui/Rueckfrage';
import type { Rechnung } from '../../abrechnung/aggregat';
import { alleGewerke, gewerkAbrechnung } from '../../abrechnung/aggregat';
import { deckblattErzeugen, mailEntwurf, rechnungsDateiname } from '../../abrechnung/ablauf';
import { gewerkZweistellig } from '../../abrechnung/gewerk';
import { datumDE, euro, prozent, pruefen } from '../../abrechnung/pruefung';
import type { RechnungsDatensatz } from '../../avaDaten';
import { vollerPfad } from '../../dateien';
import { gewerkOrdner, useAva } from '../../store';
import { RechnungPruefen } from './RechnungPruefen';

/**
 * Rechnungen eines Gewerks bzw. des ganzen Projekts – aus Rechnungsliste, Gewerkblatt, Auftragsordner und den
 * Prüfungen der App zusammengeführt, mit Hinweisen, wo etwas nicht zusammenpasst.
 */
export function RechnungenAnsicht({ gewerk }: { gewerk?: string }) {
  const projekt = useAva((s) => s.projekt)!;
  const e = useAva((s) => s.einstellungen);
  const [pruefen, setPruefen] = useState(false);
  const [nurHinweise, setNurHinweise] = useState(false);
  const [suche, setSuche] = useState('');
  const [ansehen, setAnsehen] = useState<RechnungsDatensatz | null>(null);
  const [hinweis, setHinweis] = useState<string | null>(null);
  useEffect(() => {
    if (!hinweis) return;
    const t = setTimeout(() => setHinweis(null), 8000);
    return () => clearTimeout(t);
  }, [hinweis]);
  const kk = projekt.kk?.kk ?? null;
  const abrechnungen = useMemo(() => {
    const liste = gewerk ? [gewerk] : alleGewerke(kk, projekt.struktur?.gewerke ?? [], projekt.ava.rechnungen);
    return liste.map((g) => gewerkAbrechnung(g, kk, gewerkOrdner(projekt, g), projekt.ava.rechnungen));
  }, [gewerk, kk, projekt]);
  const zeilen = abrechnungen
    .flatMap((a) => a.rechnungen)
    .filter((r) => (!nurHinweise || r.hinweise.length) && (!suche || `${r.nr} ${r.text} ${r.gewerk}`.toLowerCase().includes(suche.toLowerCase())))
    .sort((a, b) => {
      const n = (x: Rechnung) => (typeof x.nr === 'number' ? x.nr : parseFloat(String(x.nr ?? '')) || 1e9);
      return n(a) - n(b);
    });
  const summe = zeilen.reduce((s, r) => s + (r.betrag ?? 0), 0);
  const k = useAva.getState().kontext()!;
  const a1 = gewerk ? abrechnungen[0] : null;

  const oeffnen = (pfad: string) => void useAva.getState().fs.oeffnen(vollerPfad(projekt.ordner, pfad)).catch((x) => meldung('Datei ließ sich nicht öffnen', pfad, x));

  return (
    <div className="ava-seite">
      {!gewerk && (
        <div className="ava-seite-kopf">
          <h1>Rechnungen</h1>
        </div>
      )}
      {a1 && (
        <div className="ava-kennzahlen">
          <div className="metric">
            <span>Kostenschätzung</span>
            <strong>{euro(a1.kostenschaetzung)}</strong>
          </div>
          <div className="metric">
            <span>Kostenanschlag</span>
            <strong>{euro(a1.kostenanschlag)}</strong>
          </div>
          <div className="metric" title="Summe der Zahlungsfreigaben laut Kostenkontrolle (Spalte „Kostenfeststellung“ der Mappe) – nach Einbehalt, Umlage und Skonto">
            <span>Zahlungsfreigaben</span>
            <strong>{euro(a1.kostenfeststellung)}</strong>
          </div>
          <div className="metric" title="Kostenanschlag abzüglich der Zahlungsfreigaben">
            <span>noch auszuzahlen</span>
            <strong>{euro(a1.offen)}</strong>
          </div>
        </div>
      )}
      <div className="toolbar">
        <button className="primary" onClick={() => setPruefen(true)}>
          Neue Rechnung prüfen …
        </button>
        <input className="ava-suche" placeholder="Suchen (Nr., Firma, Gewerk) …" aria-label="Rechnungen durchsuchen" value={suche} onChange={(x) => setSuche(x.target.value)} onKeyDown={(x) => x.key === 'Escape' && setSuche('')} />
        <label className="ava-check">
          <input type="checkbox" checked={nurHinweise} onChange={(x) => setNurHinweise(x.target.checked)} /> nur mit Hinweisen
        </label>
        {projekt.kk && (
          <button className="small" onClick={() => oeffnen(projekt.kk!.pfad)} title={projekt.kk.pfad}>
            Kostenkontrolle in Excel
          </button>
        )}
        {hinweis && (
          <span className="ava-ok small-text" role="status">
            {hinweis}
          </span>
        )}
      </div>
      {a1?.hinweise.map((h, i) => (
        <div key={i} className="warning">
          {h}
        </div>
      ))}
      <div className="ava-tabelle-rolle">
        <table className="ava-tabelle ava-rechnungen">
          <thead>
            <tr>
              <th className="num">Nr.</th>
              {!gewerk && <th>Gewerk</th>}
              <th>Rechnung</th>
              <th>Rechn.-Datum</th>
              <th>Freigabe</th>
              <th className="num" title="Zahlungsfreigabe laut Rechnungsliste bzw. Prüfung">
                Betrag €
              </th>
              <th>Stand</th>
              <th title="Wo die Rechnung vorkommt: Rechnungsliste, Gewerkblatt der Kostenkontrolle, PDF im Auftragsordner, Prüfung in der App">Quellen</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {zeilen.map((r) => (
              <tr key={`${r.gewerk}${r.schluessel}`} className={r.hinweise.length ? 'ava-mit-hinweis' : ''} onDoubleClick={() => r.datensatz && setAnsehen(r.datensatz)}>
                <td className="num">{String(r.nr ?? '')}</td>
                {!gewerk && <td className="ava-kennung">{gewerkZweistellig(r.gewerk)}</td>}
                <td>
                  {r.text}
                  {r.hinweise.length > 0 && <div className="ava-hinweis-zelle">{r.hinweise.join(' ')}</div>}
                </td>
                <td>{datumDE(r.datum)}</td>
                <td>{datumDE(r.freigabe)}</td>
                <td className="num">{euro(r.betrag)}</td>
                <td>
                  <Stand r={r} />
                </td>
                <td className="ava-quellen">
                  <Quelle an={!!r.liste} text="Liste" titel="Rechnungsliste der Kostenkontrolle" />
                  <Quelle an={!!r.blatt} text="Blatt" titel="Gewerkblatt der Kostenkontrolle (Spalte Kostenfeststellung)" />
                  <Quelle an={!!r.datei} text="PDF" titel={r.datei?.name ?? 'PDF im Auftragsordner'} />
                  <Quelle an={!!r.datensatz} text="Prüfung" titel="Prüfung in der App (Projektdatei)" />
                </td>
                <td className="ava-aktionen">
                  {r.datei && (
                    <button className="small" onClick={() => oeffnen(r.datei!.pfad)} title={r.datei.name}>
                      PDF
                    </button>
                  )}
                  {r.datensatz?.pruefung && (
                    <button className="small" onClick={() => setAnsehen(r.datensatz!)} title="Prüfung ansehen (auch per Doppelklick auf die Zeile)">
                      Prüfung …
                    </button>
                  )}
                  {r.datensatz && (
                    <button
                      className="small"
                      onClick={async () => {
                        try {
                          const pdf = await deckblattErzeugen(k, r.datensatz!);
                          await useAva.getState().fs.tempOeffnen(`${rechnungsDateiname(k, r.datensatz!).replace(/\.pdf$/i, '')} Deckblatt.pdf`, pdf);
                        } catch (x) {
                          await meldung('Deckblatt nicht erzeugt', String(x instanceof Error ? x.message : x), x);
                        }
                      }}
                      title="Deckblatt der Prüfung öffnen"
                    >
                      Deckblatt
                    </button>
                  )}
                  {r.datensatz?.datei && (
                    <button
                      className="small"
                      onClick={async () => {
                        const v = e.mail.vorlagen.find((x) => x.id === 'rechnung') ?? e.mail.vorlagen[0];
                        if (!v) {
                          await meldung('Keine Mailvorlage', 'Es gibt keine Mailvorlage „Rechnung“ – bitte unter ⚙ Einstellungen › Mailvorlagen anlegen.');
                          return;
                        }
                        try {
                          const ava = await mailEntwurf(k, r.datensatz!, projekt.ava, v);
                          useAva.setState((s) => (s.projekt?.ordner === projekt.ordner ? { projekt: { ...s.projekt, ava } } : {}));
                          setHinweis(`Mailentwurf für Nr. ${String(r.nr ?? '')} geöffnet – bitte im Mailprogramm prüfen und senden.`);
                        } catch (x) {
                          await meldung('Mailentwurf nicht erstellt', String(x instanceof Error ? x.message : x), x);
                        }
                      }}
                      title="Mailentwurf mit der Rechnung als Anhang"
                    >
                      Mail
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {!zeilen.length && (
              <tr>
                <td colSpan={gewerk ? 9 : 10} className="muted">
                  Keine Rechnungen.
                </td>
              </tr>
            )}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={gewerk ? 4 : 5}>Summe ({zeilen.length})</td>
              <td className="num">{euro(summe)}</td>
              <td colSpan={4} />
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="muted small-text">Quellen: Liste = Rechnungsliste, Blatt = Gewerkblatt der Kostenkontrolle, PDF = Datei im Auftragsordner, Prüfung = Prüfung in der App (Projektdatei). Doppelklick auf eine geprüfte Rechnung zeigt die Prüfung.</p>
      {pruefen && <RechnungPruefen gewerk={gewerk} onClose={() => setPruefen(false)} />}
      {ansehen && <PruefungAnsehen d={ansehen} onClose={() => setAnsehen(null)} />}
    </div>
  );
}

const STAND: Record<RechnungsDatensatz['status'], { text: string; titel: string; klasse: string }> = {
  erfasst: { text: 'ohne Scan', titel: 'Geprüft und erfasst, der Scan ist noch nicht abgelegt (Rechnungseingang)', klasse: 'ava-chip' },
  abgelegt: { text: 'abgelegt', titel: 'Scan im Auftragsordner, noch nicht weitergeleitet', klasse: 'ava-chip ava-chip-info' },
  versendet: { text: 'weitergeleitet', titel: 'Mailentwurf an den Zahler erstellt', klasse: 'ava-chip ava-chip-ok' },
};

/** Stand einer Rechnung: aus der Prüfung der App, sonst nur aus der Kostenkontrolle */
function Stand({ r }: { r: Rechnung }) {
  const d = r.datensatz;
  if (!d) return <span className="muted small-text">{r.liste || r.blatt ? 'Kostenkontrolle' : '—'}</span>;
  const s = STAND[d.status] ?? STAND.erfasst;
  const titel = d.status === 'versendet' && d.versendet ? `${s.titel}: an ${d.versendet.an} am ${datumDE(d.versendet.am.slice(0, 10))}` : s.titel;
  return (
    <span className={s.klasse} title={titel}>
      {s.text}
    </span>
  );
}

function Quelle({ an, text, titel }: { an: boolean; text: string; titel: string }) {
  return (
    <span className={an ? 'an' : ''} title={`${titel}: ${an ? 'vorhanden' : 'fehlt'}`} aria-label={`${text}: ${an ? 'vorhanden' : 'fehlt'}`}>
      {text}
    </span>
  );
}

/** geprüfte Rechnung ansehen (nur lesen) */
function PruefungAnsehen({ d, onClose }: { d: RechnungsDatensatz; onClose: () => void }) {
  const p = d.pruefung;
  const r = p ? pruefen(p) : null;
  const zeile = (text: string, wert: string, klasse = '') => (
    <tr className={klasse}>
      <td>{text}</td>
      <td className="num">{wert}</td>
    </tr>
  );
  return (
    <Modal kopf titel={[`Prüfung Nr. ${String(d.nr || '—')}`, [gewerkZweistellig(d.gewerk), d.firma].filter(Boolean).join(' '), [d.art, d.lfd].filter((x) => x !== undefined && x !== '').join(' ')].filter(Boolean).join(' · ')} onClose={onClose}>
      <p className="small-text">
        Rechnungsdatum {datumDE(d.rechnungsdatum) || '—'}
        {d.eingang ? ` · Eingang ${datumDE(d.eingang)}` : ''} · Freigabe {datumDE(d.freigabe) || '—'}
        {d.rechnungsnummer ? ` · Rechnungsnummer ${d.rechnungsnummer}` : ''}
      </p>
      {p && r ? (
        <table className="ava-tabelle ava-rechnung-tabelle">
          <tbody>
            {p.forderungNetto !== null && zeile('Netto-Forderung laut Rechnung', euro(p.forderungNetto))}
            {zeile('Netto-Freigabesumme', euro(r.freigabeNetto))}
            {zeile(`− Nachlass ${prozent(p.nachlassProzent)}`, euro(r.nachlass))}
            {zeile(`+ USt ${prozent(p.mwstProzent)}`, euro(r.mwst))}
            {zeile('Brutto-Freigabesumme', euro(r.brutto), 'ava-zwischensumme')}
            {zeile(`− Umlage ${prozent(p.umlageProzent)}`, euro(r.umlage))}
            {zeile(`− ${p.einbehaltText ? `Einbehalt (${p.einbehaltText})` : 'Einbehalt'} ${prozent(p.einbehaltProzent)}`, euro(r.einbehalt))}
            {zeile(`− Skonto ${prozent(p.skontoProzent)}`, euro(r.skonto))}
            {zeile('Endsumme', euro(r.endsumme), 'ava-zwischensumme')}
            {zeile('− bisher freigegeben', euro(r.bereits))}
            {zeile('Zahlungsfreigabe', euro(r.zahlung), 'ava-zahlung')}
          </tbody>
        </table>
      ) : (
        <p>
          Ohne Rechnungskorrektur erfasst – Zahlungsfreigabe <strong>{euro(d.betrag)}</strong>.
        </p>
      )}
      {p?.bereits.length ? <p className="muted small-text">Bisher freigegeben: {p.bereits.map((z) => `${z.text} ${datumDE(z.datum)} ${euro(z.betrag)}`.trim()).join(' · ')}</p> : null}
      {p?.anmerkung && <p className="small-text">Anmerkung: {p.anmerkung}</p>}
      {d.bemerkung && <p className="small-text">Bemerkung: {d.bemerkung}</p>}
      <p className="muted small-text">Korrekturen bitte in der Kostenkontrolle vornehmen; das Deckblatt lässt sich über „Deckblatt“ neu erzeugen.</p>
      <div className="dialog-buttons">
        <button className="primary" onClick={onClose}>
          Schließen
        </button>
      </div>
    </Modal>
  );
}
