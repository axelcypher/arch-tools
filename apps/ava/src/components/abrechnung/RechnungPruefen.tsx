import { useMemo, useState } from 'react';
import { Modal } from '@core/ui/Dialog';
import { meldung } from '@core/ui/Rueckfrage';
import { logger } from '@core/platform/log';
import type { Erfassung } from '../../abrechnung/ablauf';
import { deckblattErzeugen, rechnungErfassen, rechnungsDateiname, zahlbetrag } from '../../abrechnung/ablauf';
import { alleGewerke, gewerkAbrechnung, naechsteLfd, vorigeZahlungen } from '../../abrechnung/aggregat';
import { gewerkZweistellig } from '../../abrechnung/gewerk';
import type { Pruefung, VorigeZahlung } from '../../abrechnung/pruefung';
import { datumDE, euro, neuePruefung, pruefen } from '../../abrechnung/pruefung';
import type { RechnungsDatensatz } from '../../avaDaten';
import { heuteIso } from '../../lv/modell';
import { gewerkOrdner, useAva } from '../../store';
import { DatumEingabe, Feld, TextEingabe, zahlDE, ZahlEingabe } from '../eingaben';

const log = logger('pruefung');

/**
 * Neue Rechnung prüfen: erfassen, Korrektur rechnen (Deckblatt), Nummer der Rechnungsliste vergeben und in die
 * Kostenkontrolle eintragen. Danach: Deckblatt drucken, stempeln, unterschreiben, scannen – und im
 * Rechnungseingang den Scan zuordnen.
 */
export function RechnungPruefen({ gewerk: vorgabeGewerk, onClose, onErfasst }: { gewerk?: string; onClose: () => void; onErfasst?: (d: RechnungsDatensatz) => void }) {
  const projekt = useAva((s) => s.projekt)!;
  const e = useAva((s) => s.einstellungen);
  const kk = projekt.kk?.kk ?? null;
  const gewerke = useMemo(() => alleGewerke(kk, projekt.struktur?.gewerke ?? [], projekt.ava.rechnungen), [kk, projekt.struktur, projekt.ava.rechnungen]);
  const [gewerk, setGewerk] = useState(vorgabeGewerk ?? gewerke[0] ?? 'G1');
  const abrechnung = useMemo(() => gewerkAbrechnung(gewerk, kk, gewerkOrdner(projekt, gewerk), projekt.ava.rechnungen), [gewerk, kk, projekt]);
  const firmaVorgabe = projekt.ava.gewerke[gewerk]?.firma || abrechnung.firma || '';
  const [firma, setFirma] = useState(firmaVorgabe);
  const [art, setArt] = useState(e.rechnungen.arten[0]?.kuerzel ?? 'AB');
  const [lfd, setLfd] = useState<number | null>(() => naechsteLfd(abrechnung, e.rechnungen.arten[0]?.kuerzel ?? 'AB'));
  const [rechnungsnummer, setRechnungsnummer] = useState('');
  const [rechnungsdatum, setRechnungsdatum] = useState<string | undefined>(heuteIso());
  const [freigabe, setFreigabe] = useState<string | undefined>(heuteIso());
  const [mitKorrektur, setMitKorrektur] = useState(true);
  const [pruefung, setPruefung] = useState<Pruefung>(() => {
    // ab der zweiten Abschlagsrechnung: die bisherigen Zahlungen des Gewerks als „bereits erhalten“
    const art0 = e.rechnungen.arten[0];
    const folge = art0?.schluss || (art0?.abschlag && naechsteLfd(abrechnung, art0.kuerzel) > 1);
    return neuePruefung(e.pruefung, { schluss: art0?.schluss, bereits: folge ? vorigeZahlungen(abrechnung) : [] });
  });
  const [betrag, setBetrag] = useState<number | null>(null);
  const [bemerkung, setBemerkung] = useState('');
  const [laeuft, setLaeuft] = useState(false);
  const [erfasst, setErfasst] = useState<{ d: RechnungsDatensatz; beschreibung: string[] } | null>(null);
  const artInfo = e.rechnungen.arten.find((a) => a.kuerzel === art);

  const gewerkWechseln = (g: string) => {
    setGewerk(g);
    const a = gewerkAbrechnung(g, kk, gewerkOrdner(projekt, g), projekt.ava.rechnungen);
    setFirma(projekt.ava.gewerke[g]?.firma || a.firma || '');
    setLfd(naechsteLfd(a, art));
  };
  const artWechseln = (k: string) => {
    setArt(k);
    setLfd(naechsteLfd(abrechnung, k));
    const info = e.rechnungen.arten.find((a) => a.kuerzel === k);
    setPruefung((p) => ({
      ...p,
      einbehaltProzent: info?.schluss ? 0 : e.pruefung.einbehaltProzent,
      einbehaltText: info?.schluss ? 'Bei Schlussrechnung' : 'ä Abschlagsrechnungen',
      bereits: info?.schluss || (info?.abschlag && (lfd ?? 1) > 1) ? vorigeZahlungen(abrechnung) : p.bereits,
    }));
  };
  const p = (patch: Partial<Pruefung>) => setPruefung((x) => ({ ...x, ...patch }));
  const r = pruefen(pruefung);
  const naechsteNr = kk?.rechnungsliste?.naechsteNr;
  const er: Erfassung = {
    gewerk,
    firma: firma.trim(),
    art,
    ...(lfd ? { lfd } : {}),
    ...(rechnungsnummer.trim() ? { rechnungsnummer: rechnungsnummer.trim() } : {}),
    rechnungsdatum,
    freigabe,
    ...(mitKorrektur ? { pruefung } : { betrag: betrag ?? 0 }),
    ...(bemerkung.trim() ? { bemerkung: bemerkung.trim() } : {}),
  };
  const k = useAva.getState().kontext()!;
  const vorschauName = rechnungsDateiname(k, { id: '', gewerk, nr: naechsteNr ?? 0, art, lfd: lfd ?? undefined, firma: er.firma, rechnungsdatum, betrag: zahlbetrag(er), status: 'erfasst', erfasst: '' });
  const fehlt = [!firma.trim() && 'Firma', !rechnungsdatum && 'Rechnungsdatum', mitKorrektur ? !pruefung.freigabeNetto && 'Netto-Freigabesumme' : !betrag && 'Betrag'].filter(Boolean) as string[];

  const erfassen = async () => {
    setLaeuft(true);
    try {
      const ergebnis = await rechnungErfassen(k, projekt.kk?.pfad ?? null, er);
      useAva.setState((s) => (s.projekt ? { projekt: { ...s.projekt, ava: ergebnis.ava, kk: ergebnis.kk ?? s.projekt.kk } } : {}));
      setErfasst({ d: ergebnis.datensatz, beschreibung: ergebnis.beschreibung });
      onErfasst?.(ergebnis.datensatz);
      // Firma für das nächste Mal merken
      if (!projekt.ava.gewerke[gewerk]?.firma && er.firma) await useAva.getState().avaAendern((a) => ({ ...a, gewerke: { ...a.gewerke, [gewerk]: { ...a.gewerke[gewerk], firma: er.firma } } }));
    } catch (x) {
      log.error('Erfassen fehlgeschlagen', x);
      await meldung('Rechnung nicht erfasst', x instanceof Error ? x.message : String(x), x);
    } finally {
      setLaeuft(false);
    }
  };

  const deckblatt = async (d: RechnungsDatensatz) => {
    try {
      const pdf = await deckblattErzeugen(k, d);
      await useAva.getState().fs.tempOeffnen(`${rechnungsDateiname(k, d).replace(/\.pdf$/i, '')} Deckblatt.pdf`, pdf);
    } catch (x) {
      await meldung('Deckblatt nicht erzeugt', x instanceof Error ? x.message : String(x), x);
    }
  };

  if (erfasst) {
    return (
      <Modal titel="Rechnung erfasst" onClose={onClose}>
        <h2>Rechnung erfasst</h2>
        <div className="ava-nr-gross">
          Nr. <strong>{String(erfasst.d.nr || '—')}</strong>
        </div>
        <p>
          {gewerkZweistellig(erfasst.d.gewerk)} · {erfasst.d.firma} · {erfasst.d.art} {erfasst.d.lfd ?? ''} · Zahlungsfreigabe <strong>{euro(erfasst.d.betrag)}</strong>
        </p>
        <ul className="small-text">
          {erfasst.beschreibung.map((b, i) => (
            <li key={i}>{b}</li>
          ))}
        </ul>
        <p className="muted small-text">Jetzt die Rechnung mit dieser Nummer stempeln und unterschreiben, mit dem Deckblatt einscannen und im Rechnungseingang zuordnen.</p>
        <div className="dialog-buttons">
          <button onClick={() => void deckblatt(erfasst.d)}>Deckblatt öffnen / drucken</button>
          <button
            className="primary"
            onClick={() => {
              onClose();
              useAva.getState().setAnsicht({ art: 'eingang' });
            }}
          >
            Zum Rechnungseingang
          </button>
          <button onClick={onClose}>Schließen</button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal titel="Neue Rechnung prüfen" onClose={laeuft ? undefined : onClose} breit klickDaneben={false} className="ava-pruefen">
      <h2>Neue Rechnung prüfen</h2>
      <div className="ava-formular">
        <Feld label="Gewerk">
          <select value={gewerk} onChange={(x) => gewerkWechseln(x.target.value)}>
            {gewerke.map((g) => (
              <option key={g} value={g}>
                {gewerkZweistellig(g)} {gewerkAbrechnung(g, kk, null, []).bezeichnung}
              </option>
            ))}
          </select>
        </Feld>
        <Feld label="Firma *">
          <TextEingabe wert={firma} onChange={setFirma} />
        </Feld>
        <Feld label="Rechnungsart">
          <div className="ava-reihe">
            <select value={art} onChange={(x) => artWechseln(x.target.value)}>
              {e.rechnungen.arten.map((a) => (
                <option key={a.kuerzel} value={a.kuerzel}>
                  {a.kuerzel} – {a.name}
                </option>
              ))}
            </select>
            <ZahlEingabe wert={lfd} onChange={(n) => setLfd(n ? Math.round(n) : null)} title="laufende Nummer (AB 1, AB 2 …)" className="ava-klein" />
          </div>
        </Feld>
        <Feld label="Rechnungsnummer der Firma">
          <TextEingabe wert={rechnungsnummer} onChange={setRechnungsnummer} />
        </Feld>
        <Feld label="Rechnungsdatum *">
          <DatumEingabe wert={rechnungsdatum} onChange={setRechnungsdatum} />
        </Feld>
        <Feld label="Freigabedatum">
          <DatumEingabe wert={freigabe} onChange={setFreigabe} />
        </Feld>
      </div>
      <label className="ava-check">
        <input type="checkbox" checked={mitKorrektur} onChange={(x) => setMitKorrektur(x.target.checked)} /> Rechnungskorrektur mit Deckblatt (Nachlass, Umlage, Einbehalt, Skonto, bereits gezahlt)
      </label>
      {mitKorrektur ? (
        <div className="ava-korrektur">
          <div className="ava-formular">
            <Feld label="Netto-Forderung laut Rechnung" hinweis={artInfo?.abschlag ? 'bei Abschlagsrechnungen kumuliert' : undefined}>
              <ZahlEingabe wert={pruefung.forderungNetto} stellen={2} onChange={(n) => p({ forderungNetto: n, ...(pruefung.freigabeNetto === (pruefung.forderungNetto ?? 0) ? { freigabeNetto: n ?? 0 } : {}) })} />
            </Feld>
            <Feld label="Netto-Freigabesumme (geprüft) *">
              <ZahlEingabe wert={pruefung.freigabeNetto} stellen={2} leerErlaubt={false} onChange={(n) => p({ freigabeNetto: n ?? 0 })} />
            </Feld>
            <Feld label="Nachlass %">
              <ZahlEingabe wert={pruefung.nachlassProzent} onChange={(n) => p({ nachlassProzent: n ?? 0 })} />
            </Feld>
            <Feld label="USt %">
              <ZahlEingabe wert={pruefung.mwstProzent} onChange={(n) => p({ mwstProzent: n ?? 0 })} />
            </Feld>
            <Feld label="Gemeinkostenumlage %">
              <ZahlEingabe wert={pruefung.umlageProzent} onChange={(n) => p({ umlageProzent: n ?? 0 })} />
            </Feld>
            <Feld label="Sicherheitseinbehalt %">
              <ZahlEingabe wert={pruefung.einbehaltProzent} onChange={(n) => p({ einbehaltProzent: n ?? 0 })} />
            </Feld>
            <Feld label="Skonto %">
              <ZahlEingabe wert={pruefung.skontoProzent} onChange={(n) => p({ skontoProzent: n ?? 0 })} />
            </Feld>
            <Feld label="Anmerkung zur Prüfung" breit>
              <TextEingabe mehrzeilig zeilen={2} wert={pruefung.anmerkung} onChange={(anmerkung) => p({ anmerkung: anmerkung || undefined })} />
            </Feld>
          </div>
          <div className="ava-korrektur-rechnung">
            <table className="ava-tabelle ava-rechnung-tabelle">
              <tbody>
                <tr>
                  <td>Netto-Freigabesumme</td>
                  <td className="num">{euro(r.freigabeNetto)}</td>
                </tr>
                {r.kuerzungNetto ? (
                  <tr className="muted">
                    <td>Kürzung gegenüber der Forderung</td>
                    <td className="num">{euro(-r.kuerzungNetto)}</td>
                  </tr>
                ) : null}
                <tr>
                  <td>− Nachlass {zahlDE(pruefung.nachlassProzent)} %</td>
                  <td className="num">{euro(r.nachlass)}</td>
                </tr>
                <tr>
                  <td>+ USt {zahlDE(pruefung.mwstProzent)} %</td>
                  <td className="num">{euro(r.mwst)}</td>
                </tr>
                <tr className="ava-zwischensumme">
                  <td>Brutto-Freigabesumme</td>
                  <td className="num">{euro(r.brutto)}</td>
                </tr>
                <tr>
                  <td>− Umlage {zahlDE(pruefung.umlageProzent)} %</td>
                  <td className="num">{euro(r.umlage)}</td>
                </tr>
                <tr>
                  <td>− Einbehalt {zahlDE(pruefung.einbehaltProzent)} %</td>
                  <td className="num">{euro(r.einbehalt)}</td>
                </tr>
                <tr>
                  <td>− Skonto {zahlDE(pruefung.skontoProzent)} %</td>
                  <td className="num">{euro(r.skonto)}</td>
                </tr>
                <tr className="ava-zwischensumme">
                  <td>Endsumme</td>
                  <td className="num">{euro(r.endsumme)}</td>
                </tr>
                <tr>
                  <td>− bereits erhalten</td>
                  <td className="num">{euro(r.bereits)}</td>
                </tr>
                <tr className="ava-zahlung">
                  <td>Zahlungsfreigabe</td>
                  <td className="num">{euro(r.zahlung)}</td>
                </tr>
              </tbody>
            </table>
            <BereitsErhalten liste={pruefung.bereits} onChange={(bereits) => p({ bereits })} vorschlag={vorigeZahlungen(abrechnung)} />
          </div>
        </div>
      ) : (
        <div className="ava-formular">
          <Feld label="Zahlungsfreigabe brutto *">
            <ZahlEingabe wert={betrag} stellen={2} onChange={setBetrag} />
          </Feld>
        </div>
      )}
      <div className="ava-formular">
        <Feld label="Bemerkung (Rechnungsliste)" breit>
          <TextEingabe wert={bemerkung} onChange={setBemerkung} />
        </Feld>
      </div>
      <div className="ava-vorschau-zeile">
        <span>
          Nächste freie Nr.: <strong>{naechsteNr ?? '— (keine Rechnungsliste)'}</strong>
        </span>
        <span className="muted small-text">Ablage: {vorschauName}</span>
      </div>
      <div className="dialog-buttons">
        <button onClick={onClose} disabled={laeuft}>
          Abbrechen
        </button>
        <button className="primary" disabled={laeuft || fehlt.length > 0} onClick={() => void erfassen()} title={fehlt.length ? `Es fehlt: ${fehlt.join(', ')}` : 'In die Kostenkontrolle eintragen, Nummer vergeben, Prüfung in der Projektdatei speichern'}>
          {laeuft ? 'Wird eingetragen …' : `Erfassen & Nr. ${naechsteNr ?? ''} vergeben`}
        </button>
      </div>
    </Modal>
  );
}

function BereitsErhalten({ liste, onChange, vorschlag }: { liste: VorigeZahlung[]; onChange: (l: VorigeZahlung[]) => void; vorschlag: VorigeZahlung[] }) {
  return (
    <div className="ava-bereits">
      <div className="ava-bereits-kopf">
        <strong>Davon bereits erhalten</strong>
        <button className="small" onClick={() => onChange(vorschlag)} disabled={!vorschlag.length} title="Alle bisherigen Zahlungen dieses Gewerks aus der Kostenkontrolle">
          aus der Kostenkontrolle
        </button>
        <button className="small" onClick={() => onChange([...liste, { text: '', betrag: 0 }])}>
          +
        </button>
      </div>
      {liste.map((z, i) => (
        <div key={i} className="ava-reihe">
          <input value={z.text} placeholder="AB 1" onChange={(x) => onChange(liste.map((y, j) => (j === i ? { ...y, text: x.target.value } : y)))} />
          <DatumEingabe wert={z.datum} onChange={(datum) => onChange(liste.map((y, j) => (j === i ? { ...y, datum } : y)))} />
          <ZahlEingabe wert={z.betrag} stellen={2} onChange={(n) => onChange(liste.map((y, j) => (j === i ? { ...y, betrag: n ?? 0 } : y)))} />
          <button className="small" onClick={() => onChange(liste.filter((_, j) => j !== i))} title="Entfernen">
            ×
          </button>
        </div>
      ))}
      {!liste.length && <div className="muted small-text">keine (z. B. erste Abschlagsrechnung)</div>}
      {liste.length > 0 && <div className="muted small-text">{liste.map((z) => `${z.text} ${datumDE(z.datum)}`).join(' · ')}</div>}
    </div>
  );
}
