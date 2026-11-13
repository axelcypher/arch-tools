import { useMemo, useState } from 'react';
import { Modal } from '@core/ui/Dialog';
import { bestaetigen, meldung } from '@core/ui/Rueckfrage';
import { logger } from '@core/platform/log';
import type { Erfassung, KkStand } from '../../abrechnung/ablauf';
import { datensatzNachtragen, deckblattErzeugen, rechnungErfassen, rechnungsDateiname, TeilweiseErfasst, zahlbetrag } from '../../abrechnung/ablauf';
import type { GewerkAbrechnung } from '../../abrechnung/aggregat';
import { alleGewerke, gewerkAbrechnung, naechsteLfd, vorigeZahlungen } from '../../abrechnung/aggregat';
import type { ArtTyp } from '../../abrechnung/benennung';
import { artTyp } from '../../abrechnung/benennung';
import { gewerkZweistellig } from '../../abrechnung/gewerk';
import type { Pruefung, VorigeZahlung } from '../../abrechnung/pruefung';
import { datumDE, euro, neuePruefung, pruefen, pruefVorschlag } from '../../abrechnung/pruefung';
import type { AvaProjekt, RechnungsDatensatz } from '../../avaDaten';
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
  const [eingang, setEingang] = useState<string | undefined>(heuteIso());
  const [freigabe, setFreigabe] = useState<string | undefined>(heuteIso());
  const [mitKorrektur, setMitKorrektur] = useState(true);
  /** Einzelrechnungen (nicht Teil der Abschlagsreihe) zählen nicht zu den bisherigen Zahlungen */
  const einzelArten = e.rechnungen.arten.filter((a) => artTyp(a) === 'einzel').map((a) => a.kuerzel);
  const vorschlagFuer = (k: string, n: number | null, a: GewerkAbrechnung, g: string) => {
    // Sicherheit für Mängelansprüche aus dem geöffneten LV des Gewerks, wenn dort hinterlegt
    const offen = useAva.getState().lv;
    const ausLv = offen?.gewerk === g ? offen.lv.einbehalte.find((x) => x.art === 'gewaehrleistung')?.prozent : undefined;
    return pruefVorschlag(
      e.pruefung,
      e.rechnungen.arten.find((x) => x.kuerzel === k),
      n,
      vorigeZahlungen(a, undefined, einzelArten),
      ausLv,
    );
  };
  const [vorschlag, setVorschlag] = useState(() => vorschlagFuer(art, lfd, abrechnung, gewerk));
  const [pruefung, setPruefung] = useState<Pruefung>(() => neuePruefung(e.pruefung, { vorschlag }));
  const [betrag, setBetrag] = useState<number | null>(null);
  const [bemerkung, setBemerkung] = useState('');
  const [laeuft, setLaeuft] = useState(false);
  const [versucht, setVersucht] = useState(false);
  const [erfasst, setErfasst] = useState<{ d: RechnungsDatensatz; beschreibung: string[] } | null>(null);
  const [teilweise, setTeilweise] = useState<TeilweiseErfasst | null>(null);
  const [geaendert, setGeaendert] = useState(false);
  const artInfo = e.rechnungen.arten.find((a) => a.kuerzel === art);
  const typ = artTyp(artInfo);

  /** Vorschlag (Einbehalt, bisherige Zahlungen) für Art, Nummer und Gewerk übernehmen */
  const vorschlagSetzen = (k: string, n: number | null, a: GewerkAbrechnung, g: string) => {
    const v = vorschlagFuer(k, n, a, g);
    setVorschlag(v);
    setPruefung((x) => ({ ...x, einbehaltProzent: v.einbehaltProzent, einbehaltText: v.einbehaltText, bereits: v.bereits }));
  };
  const gewerkWechseln = (g: string) => {
    setGeaendert(true);
    setGewerk(g);
    const a = gewerkAbrechnung(g, kk, gewerkOrdner(projekt, g), projekt.ava.rechnungen);
    setFirma(projekt.ava.gewerke[g]?.firma || a.firma || '');
    const n = naechsteLfd(a, art);
    setLfd(n);
    vorschlagSetzen(art, n, a, g);
  };
  const artWechseln = (k: string) => {
    setGeaendert(true);
    setArt(k);
    const n = naechsteLfd(abrechnung, k);
    setLfd(n);
    vorschlagSetzen(k, n, abrechnung, gewerk);
  };
  const lfdWechseln = (n: number | null) => {
    setGeaendert(true);
    setLfd(n);
    // erste Abschlagsrechnung ohne, ab der zweiten mit den bisherigen Zahlungen
    if (typ === 'abschlag') vorschlagSetzen(art, n, abrechnung, gewerk);
  };
  /** Setter, die „geändert“ merken (Rückfrage beim Schließen) */
  const mit =
    <T,>(f: (x: T) => void) =>
    (x: T) => {
      setGeaendert(true);
      f(x);
    };
  const p = (patch: Partial<Pruefung>) => {
    setGeaendert(true);
    setPruefung((x) => ({ ...x, ...patch }));
  };
  const r = pruefen(pruefung);
  const naechsteNr = kk?.rechnungsliste?.naechsteNr;
  const er: Erfassung = {
    gewerk,
    firma: firma.trim(),
    art,
    ...(lfd ? { lfd } : {}),
    ...(rechnungsnummer.trim() ? { rechnungsnummer: rechnungsnummer.trim() } : {}),
    rechnungsdatum,
    ...(eingang ? { eingang } : {}),
    freigabe,
    ...(mitKorrektur ? { pruefung } : { betrag: betrag ?? 0 }),
    ...(bemerkung.trim() ? { bemerkung: bemerkung.trim() } : {}),
  };
  const k = useAva.getState().kontext()!;
  const vorschauName = rechnungsDateiname(k, { id: '', gewerk, nr: naechsteNr ?? 0, art, lfd: lfd ?? undefined, firma: er.firma, rechnungsdatum, betrag: zahlbetrag(er), status: 'erfasst', erfasst: '' });
  const fehlt = [!firma.trim() && 'Firma', !rechnungsdatum && 'Rechnungsdatum', mitKorrektur ? !pruefung.freigabeNetto && 'Netto-Freigabesumme' : !betrag && 'Betrag'].filter(Boolean) as string[];

  /** Ergebnis in den Zustand übernehmen (nur, wenn noch dasselbe Projekt offen ist) */
  const uebernehmen = (patch: { ava?: AvaProjekt; kk?: KkStand | null }) =>
    useAva.setState((s) => (s.projekt?.ordner === projekt.ordner ? { projekt: { ...s.projekt, ...(patch.ava ? { ava: patch.ava } : {}), kk: patch.kk ?? s.projekt.kk } } : {}));

  const erfassen = async () => {
    setVersucht(true);
    if (fehlt.length) return;
    setLaeuft(true);
    try {
      const ergebnis = await rechnungErfassen(k, projekt.kk?.pfad ?? null, er);
      uebernehmen(ergebnis);
      setErfasst({ d: ergebnis.datensatz, beschreibung: ergebnis.beschreibung });
      onErfasst?.(ergebnis.datensatz);
      // Firma für das nächste Mal merken
      if (!projekt.ava.gewerke[gewerk]?.firma && er.firma) await useAva.getState().avaAendern((a) => ({ ...a, gewerke: { ...a.gewerke, [gewerk]: { ...a.gewerke[gewerk], firma: er.firma } } }));
    } catch (x) {
      log.error('Erfassen fehlgeschlagen', x);
      if (x instanceof TeilweiseErfasst) {
        // Nummer ist in der Kostenkontrolle vergeben: nicht noch einmal erfassen
        uebernehmen({ kk: x.kk });
        setTeilweise(x);
      } else await meldung('Rechnung nicht erfasst', x instanceof Error ? x.message : String(x), x);
    } finally {
      setLaeuft(false);
    }
  };

  const nachtragen = async (t: TeilweiseErfasst) => {
    setLaeuft(true);
    try {
      const ava = await datensatzNachtragen(k, t.datensatz);
      uebernehmen({ ava });
      setTeilweise(null);
      setErfasst({ d: t.datensatz, beschreibung: ['Kostenkontrolle: eingetragen', 'Projektdatei: Prüfung nachträglich gespeichert'] });
      onErfasst?.(t.datensatz);
    } catch (x) {
      await meldung('Projektdatei nicht gespeichert', x instanceof Error ? x.message : String(x), x);
    } finally {
      setLaeuft(false);
    }
  };

  /** Schließen (Esc, Abbrechen): eingegebene Angaben nicht ohne Rückfrage verwerfen */
  const schliessen = async () => {
    if (laeuft) return;
    if (geaendert && !(await bestaetigen('Eingaben verwerfen?', 'Die Rechnung ist noch nicht erfasst. Die eingegebenen Angaben gehen verloren.', 'Verwerfen', true))) return;
    onClose();
  };

  const deckblatt = async (d: RechnungsDatensatz) => {
    try {
      const pdf = await deckblattErzeugen(k, d);
      await useAva.getState().fs.tempOeffnen(`${rechnungsDateiname(k, d).replace(/\.pdf$/i, '')} Deckblatt.pdf`, pdf);
    } catch (x) {
      await meldung('Deckblatt nicht erzeugt', x instanceof Error ? x.message : String(x), x);
    }
  };

  if (teilweise) {
    return (
      <Modal kopf titel="Rechnung teilweise erfasst" onClose={laeuft ? undefined : onClose} klickDaneben={false}>
        <div className="ava-nr-gross">
          Nr. <strong>{String(teilweise.datensatz.nr || '—')}</strong>
        </div>
        <p className="warning-text">{teilweise.message}</p>
        <p className="muted small-text">Das Deckblatt lässt sich trotzdem schon öffnen. Ohne Eintrag in der Projektdatei fehlt die Prüfung später in der Liste der Rechnungen.</p>
        <div className="dialog-buttons">
          <button onClick={() => void deckblatt(teilweise.datensatz)} disabled={laeuft}>
            Deckblatt öffnen / drucken
          </button>
          <button className="primary" onClick={() => void nachtragen(teilweise)} disabled={laeuft}>
            {laeuft ? 'Wird gespeichert …' : 'Projektdatei erneut speichern'}
          </button>
          <button onClick={onClose} disabled={laeuft}>
            Schließen
          </button>
        </div>
      </Modal>
    );
  }

  if (erfasst) {
    return (
      <Modal kopf titel="Rechnung erfasst" onClose={onClose}>
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
    <Modal kopf titel="Neue Rechnung prüfen" onClose={laeuft ? undefined : () => void schliessen()} breit klickDaneben={false} className="ava-pruefen">
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
          <TextEingabe wert={firma} onChange={mit(setFirma)} className={versucht && !firma.trim() ? 'ava-fehler' : ''} />
        </Feld>
        <Feld label="Rechnungsart">
          <select value={art} onChange={(x) => artWechseln(x.target.value)}>
            {e.rechnungen.arten.map((a) => (
              <option key={a.kuerzel} value={a.kuerzel}>
                {a.kuerzel} – {a.name}
              </option>
            ))}
          </select>
        </Feld>
        <Feld label="lfd. Nr." hinweis={`${art} ${lfd ?? ''}`.trim()}>
          <ZahlEingabe wert={lfd} onChange={(n) => lfdWechseln(n ? Math.round(n) : null)} title="laufende Nummer der Art (AB 1, AB 2 …)" />
        </Feld>
        <Feld label="Rechnungsnummer der Firma">
          <TextEingabe wert={rechnungsnummer} onChange={mit(setRechnungsnummer)} />
        </Feld>
        <Feld label="Rechnungsdatum *">
          <DatumEingabe wert={rechnungsdatum} onChange={mit(setRechnungsdatum)} />
        </Feld>
        <Feld label="Eingang (Zugang)" hinweis={faelligText(typ, eingang)}>
          <DatumEingabe wert={eingang} onChange={mit(setEingang)} />
        </Feld>
        <Feld label="Freigabedatum">
          <DatumEingabe wert={freigabe} onChange={mit(setFreigabe)} />
        </Feld>
      </div>
      <label className="ava-check">
        <input type="checkbox" checked={mitKorrektur} onChange={(x) => mit(setMitKorrektur)(x.target.checked)} /> Rechnungskorrektur mit Deckblatt (Nachlass, Umlage, Einbehalt, Skonto, bisher freigegeben)
      </label>
      {mitKorrektur ? (
        <div className="ava-korrektur">
          <div className="ava-formular">
            <Feld label="Netto-Forderung laut Rechnung" hinweis={artInfo?.abschlag ? 'bei Abschlagsrechnungen kumuliert' : undefined}>
              <ZahlEingabe wert={pruefung.forderungNetto} stellen={2} onChange={(n) => p({ forderungNetto: n, ...(pruefung.freigabeNetto === (pruefung.forderungNetto ?? 0) ? { freigabeNetto: n ?? 0 } : {}) })} />
            </Feld>
            <Feld label="Netto-Freigabesumme (geprüft) *">
              <ZahlEingabe wert={pruefung.freigabeNetto} stellen={2} leerErlaubt={false} onChange={(n) => p({ freigabeNetto: n ?? 0 })} className={versucht && !pruefung.freigabeNetto ? 'ava-fehler' : ''} />
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
            <Feld label={typ === 'schluss' || typ === 'teilschluss' ? 'Sicherheit für Mängelansprüche %' : 'Sicherheitseinbehalt %'} hinweis={typ === 'schluss' || typ === 'teilschluss' ? '§ 17 VOB/B, laut Vertrag' : pruefung.einbehaltText}>
              <ZahlEingabe
                wert={pruefung.einbehaltProzent}
                onChange={(n) => {
                  setVorschlag((v) => ({ ...v, einbehaltUnklar: false }));
                  p({ einbehaltProzent: n ?? 0 });
                }}
              />
            </Feld>
            <Feld label="Skonto %">
              <ZahlEingabe wert={pruefung.skontoProzent} onChange={(n) => p({ skontoProzent: n ?? 0 })} />
            </Feld>
            {pruefung.skontoProzent ? (
              <Feld label="Skontofrist (Tage)" hinweis="steht auf dem Deckblatt">
                <ZahlEingabe wert={pruefung.skontoTage} onChange={(n) => p({ skontoTage: n ? Math.round(n) : undefined })} />
              </Feld>
            ) : null}
            {vorschlag.einbehaltUnklar && (
              <p className="warning-text ava-feld-breit">
                Für die Sicherheit für Mängelansprüche ist kein Satz hinterlegt (weder im LV noch in den Einstellungen). Bitte den vertraglich vereinbarten Satz eintragen – 0 % heißt: keine Sicherheit.
              </p>
            )}
            {typ === 'teilschluss' && (
              <p className="muted small-text ava-feld-breit">Teilschlussrechnung (§ 16 Abs. 4 VOB/B): bisherige Zahlungen nur übernehmen, wenn sie zu diesem abgeschlossenen Teil gehören.</p>
            )}
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
                  <td>
                    − {typ === 'schluss' || typ === 'teilschluss' ? 'Sicherheit' : 'Einbehalt'} {zahlDE(pruefung.einbehaltProzent)} %
                  </td>
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
                  <td>− bisher freigegeben</td>
                  <td className="num">{euro(r.bereits)}</td>
                </tr>
                <tr className="ava-zahlung">
                  <td>Zahlungsfreigabe</td>
                  <td className="num">{euro(r.zahlung)}</td>
                </tr>
              </tbody>
            </table>
            <BereitsErhalten liste={pruefung.bereits} onChange={(bereits) => p({ bereits })} vorschlag={vorigeZahlungen(abrechnung, undefined, einzelArten)} />
          </div>
        </div>
      ) : (
        <div className="ava-formular">
          <Feld label="Zahlungsfreigabe brutto *">
            <ZahlEingabe wert={betrag} stellen={2} onChange={mit(setBetrag)} className={versucht && !betrag ? 'ava-fehler' : ''} />
          </Feld>
        </div>
      )}
      <div className="ava-formular">
        <Feld label="Bemerkung (Rechnungsliste)" breit>
          <TextEingabe wert={bemerkung} onChange={mit(setBemerkung)} />
        </Feld>
      </div>
      <div className="ava-vorschau-zeile">
        <span>
          Nächste freie Nr.: <strong>{naechsteNr ?? '— (keine Rechnungsliste)'}</strong>
        </span>
        <span className="muted small-text">Ablage: {vorschauName}</span>
      </div>
      <div className="dialog-buttons">
        {fehlt.length > 0 && <span className={versucht ? 'ava-fehlt fehler' : 'ava-fehlt'}>Es fehlt: {fehlt.join(', ')}</span>}
        <button onClick={() => void schliessen()} disabled={laeuft}>
          Abbrechen
        </button>
        <button className="primary" disabled={laeuft} aria-disabled={fehlt.length > 0} onClick={() => void erfassen()} title={fehlt.length ? `Es fehlt: ${fehlt.join(', ')}` : 'In die Kostenkontrolle eintragen, Nummer vergeben, Prüfung in der Projektdatei speichern'}>
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
        <strong>Davon bisher freigegeben</strong>
        <button className="small" onClick={() => onChange(vorschlag)} disabled={!vorschlag.length} title="Alle bisherigen Abschlags- und Schlusszahlungen dieses Gewerks aus der Kostenkontrolle (Freigabebeträge – bitte mit den tatsächlichen Zahlungen vergleichen)">
          aus der Kostenkontrolle
        </button>
        <button className="small" onClick={() => onChange([...liste, { text: '', betrag: 0 }])} title="Zahlung hinzufügen" aria-label="Zahlung hinzufügen">
          + Zahlung
        </button>
      </div>
      {liste.map((z, i) => (
        <div key={i} className="ava-reihe">
          <input value={z.text} placeholder="AB 1" aria-label={`Bezeichnung Zahlung ${i + 1}`} onChange={(x) => onChange(liste.map((y, j) => (j === i ? { ...y, text: x.target.value } : y)))} />
          <DatumEingabe wert={z.datum} label={`Datum Zahlung ${i + 1}`} onChange={(datum) => onChange(liste.map((y, j) => (j === i ? { ...y, datum } : y)))} />
          <ZahlEingabe wert={z.betrag} stellen={2} label={`Betrag Zahlung ${i + 1}`} onChange={(n) => onChange(liste.map((y, j) => (j === i ? { ...y, betrag: n ?? 0 } : y)))} />
          <button className="small icon" onClick={() => onChange(liste.filter((_, j) => j !== i))} title="Zahlung entfernen" aria-label={`Zahlung ${i + 1} entfernen`}>
            ×
          </button>
        </div>
      ))}
      {!liste.length && <div className="muted small-text">keine (z. B. erste Abschlagsrechnung)</div>}
    </div>
  );
}

/** Fälligkeit nach § 16 VOB/B ab Zugang: Abschlag 21 Tage, Schlusszahlung 30 Tage */
function faelligText(typ: ArtTyp, eingang: string | undefined): string | undefined {
  if (!eingang || !/^\d{4}-\d{2}-\d{2}/.test(eingang)) return undefined;
  const tage = typ === 'abschlag' ? 21 : typ === 'schluss' || typ === 'teilschluss' ? 30 : null;
  if (tage === null) return undefined;
  const d = new Date(`${eingang.slice(0, 10)}T12:00:00`);
  d.setDate(d.getDate() + tage);
  return `spätestens fällig am ${datumDE(heuteIso(d))} (${tage} Tage nach Zugang, § 16 Abs. ${typ === 'abschlag' ? '1 Nr. 3' : '3 Nr. 1'} VOB/B, wenn vereinbart; fällt der Tag auf ein Wochenende oder einen Feiertag, gilt der nächste Werktag)`;
}
