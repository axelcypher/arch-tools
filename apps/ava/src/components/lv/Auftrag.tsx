import { useMemo, useState } from 'react';
import { bestaetigen, meldung } from '@core/ui/Rueckfrage';
import { Symbol } from '@core/ui/Symbol';
import type { GewerkAngaben } from '../../avaDaten';
import { auftragEintragen } from '../../abrechnung/kostenkontrolle';
import { datumDE, euro } from '../../abrechnung/pruefung';
import type { Nachtrag } from '../../lv/modell';
import { heuteIso } from '../../lv/modell';
import { brutto, rangfolge, summen } from '../../lv/rechnen';
import { ASLV_NICHT_GESPEICHERT } from '../../format/aslv';
import { vollerPfad } from '../../dateien';
import { gewerkOrdner, useAva } from '../../store';
import { DatumEingabe, Feld, TextEingabe, ZahlEingabe } from '../eingaben';

/** Vergabe, Auftragssumme, Nachträge – und die Übernahme in den Kostenanschlag der Kostenkontrolle */
export function AuftragAnsicht({ gewerk }: { gewerk: string }) {
  const projekt = useAva((s) => s.projekt)!;
  const offen = useAva((s) => s.lv);
  const lv = offen?.gewerk === gewerk ? offen.lv : null;
  const s = useMemo(() => (lv ? summen(lv) : null), [lv]);
  const blatt = projekt.kk?.kk.gewerke.find((g) => g.gewerk === gewerk);
  const angaben: GewerkAngaben = projekt.ava.gewerke[gewerk] ?? {};
  const g = gewerkOrdner(projekt, gewerk);
  const [laeuft, setLaeuft] = useState(false);
  const aendern = useAva.getState().lvAendern;
  const ust = lv?.kopf.mwst ?? 19;
  const nurAslv = offen?.format === 'aslv';
  const aslvHinweis = (was: string) => `${was}: wird in LV-Dateien (.aslv) nicht gespeichert – im eigenen Format (.oalv) möglich`;

  const oeffnen = (pfad: string) => void useAva.getState().fs.oeffnen(vollerPfad(projekt.ordner, pfad)).catch((e) => meldung('Datei ließ sich nicht öffnen', pfad, e));

  /** Vergabe vermerken – bei einem unvollständigen Angebot erst nach Rückfrage */
  const vergeben = async (id: number) => {
    const r = rang.find((x) => x.id === id);
    if (r?.unvollstaendig && !(await bestaetigen('Unvollständiges Angebot', `Im Angebot von „${lv!.bieter.find((b) => b.id === id)?.name}“ fehlen ${r.ohnePreis} Preis(e). Angebote ohne alle geforderten Preise sind in der Regel auszuschließen (§ 16a VOB/A) – trotzdem die Vergabe an diesen Bieter vermerken?`, 'Trotzdem vermerken'))) return;
    aendern((l) => ({ ...l, auftrag: { bieterId: id, ...(nurAslv ? (l.auftrag?.datum ? { datum: l.auftrag.datum } : {}) : { datum: l.auftrag?.datum ?? heuteIso() }) } }));
  };

  const angabenSetzen = (patch: Partial<GewerkAngaben>) =>
    void useAva
      .getState()
      .avaAendern((a) => ({ ...a, gewerke: { ...a.gewerke, [gewerk]: { ...a.gewerke[gewerk], ...patch } } }))
      .catch((e) => meldung('Nicht gespeichert', 'Die Projektdatei ließ sich nicht schreiben.', e));

  const inKostenkontrolle = async (text: string, datum: string | undefined, betrag: number, firma?: string) => {
    if (!projekt.kk) {
      await meldung('Keine Kostenkontrolle', 'Im Projekt wurde keine Kostenkontrolle gefunden.');
      return;
    }
    try {
      const vorschau = auftragEintragen(projekt.kk.kk, { gewerk, text, datum, betrag, auftragnehmer: firma });
      if (!(await bestaetigen('In die Kostenkontrolle eintragen?', `${text}: ${euro(betrag)} brutto\n\n${vorschau.beschreibung.join('\n')}`, 'Eintragen'))) return;
      setLaeuft(true);
      await useAva.getState().kkSchreiben((kk) => auftragEintragen(kk.kk, { gewerk, text, datum, betrag, auftragnehmer: firma }).aenderungen);
    } catch (e) {
      await meldung('Nicht eingetragen', e instanceof Error ? e.message : String(e), e);
    } finally {
      setLaeuft(false);
    }
  };

  const auftragBieter = lv?.auftrag ? lv.bieter.find((b) => b.id === lv.auftrag!.bieterId) : undefined;
  const auftragNetto = lv?.auftrag ? (lv.auftrag.summeNetto ?? s?.bieter.get(lv.auftrag.bieterId)?.netto ?? 0) : 0;
  const rang = lv && s ? rangfolge(lv, s) : [];

  const nachtragSetzen = (nr: number, patch: Partial<Nachtrag>) => aendern((l) => ({ ...l, nachtraege: l.nachtraege.map((n) => (n.nr === nr ? { ...n, ...patch } : n)) }));

  return (
    <div className="ava-auftrag-seite">
      <section className="ava-karte">
        <h2>Vergabe</h2>
        {!lv ? (
          <p className="muted">Kein LV geöffnet – Vergabe und Nachträge stehen im LV. Die Kostenkontrolle lässt sich unten trotzdem pflegen.</p>
        ) : (
          <>
            <p className="muted small-text">Bieter wählen, an den vergeben wird. Den Auftrag erteilt der Bauherr; hier wird die Vergabe vermerkt.</p>
            <table className="ava-tabelle">
              <thead>
                <tr>
                  <th>Vergabe</th>
                  <th>Rang</th>
                  <th>Bieter</th>
                  <th className="num">netto nach Nachlass</th>
                  <th className="num">brutto</th>
                </tr>
              </thead>
              <tbody>
                {rang.map((r) => {
                  const b = lv.bieter.find((x) => x.id === r.id)!;
                  return (
                    <tr key={r.id} className={lv.auftrag?.bieterId === r.id ? 'ava-auftrag' : ''}>
                      <td>
                        <input type="radio" name="auftrag" checked={lv.auftrag?.bieterId === r.id} onChange={() => void vergeben(r.id)} title="Vergabe an diesen Bieter vermerken" aria-label={`Vergabe an ${b.name} vermerken`} />
                      </td>
                      <td>{r.rang}.</td>
                      <td>
                        {b.name}
                        {r.unvollstaendig && (
                          <span className="ava-chip ava-chip-warn" title="Angebot ohne alle geforderten Preise – Ausschluss prüfen (§ 16a VOB/A)">
                            unvollständig ({r.ohnePreis} fehlende Preise)
                          </span>
                        )}
                      </td>
                      <td className="num">{euro(r.netto)}</td>
                      <td className="num">{euro(s?.bieter.get(r.id)?.brutto)}</td>
                    </tr>
                  );
                })}
                {!rang.length && (
                  <tr>
                    <td colSpan={5} className="muted">
                      Noch keine Angebote mit Preisen – unter „Angebote & Preisspiegel“ erfassen.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
            {lv.auftrag && (
              <div className="ava-formular">
                <Feld label="Auftragnehmer">
                  <strong>{auftragBieter?.name}</strong>
                </Feld>
                <Feld label="Auftragsdatum" hinweis={nurAslv ? 'nur im eigenen Format (.oalv) speicherbar' : undefined}>
                  {nurAslv ? (
                    <input type="date" value={lv.auftrag.datum?.slice(0, 10) ?? ''} disabled title={aslvHinweis(ASLV_NICHT_GESPEICHERT.auftragDatum)} />
                  ) : (
                    <DatumEingabe wert={lv.auftrag.datum} onChange={(datum) => aendern((l) => ({ ...l, auftrag: l.auftrag && { ...l.auftrag, datum } }))} />
                  )}
                </Feld>
                <Feld label="Auftragssumme netto" hinweis="leer = Angebot nach Nachlass">
                  <ZahlEingabe wert={lv.auftrag.summeNetto ?? null} stellen={2} onChange={(n) => aendern((l) => ({ ...l, auftrag: l.auftrag && { ...l.auftrag, summeNetto: n ?? undefined } }))} placeholder={euro(s?.bieter.get(lv.auftrag.bieterId)?.netto)} />
                </Feld>
                <Feld label="brutto">
                  <strong>{euro(brutto(auftragNetto, ust))}</strong>
                </Feld>
                <div className="button-row ava-feld-breit">
                  <button disabled={laeuft} onClick={() => void inKostenkontrolle(`${auftragBieter?.name ?? ''} Auftrag`.trim(), lv.auftrag!.datum, brutto(auftragNetto, ust), auftragBieter?.name)} title="Auftrag als neue Zeile in den Kostenanschlag des Gewerkblatts eintragen">
                    In die Kostenkontrolle übernehmen …
                  </button>
                  <button onClick={() => aendern((l) => ({ ...l, auftrag: null }))} title="Vergabe zurücknehmen">
                    Vergabe aufheben
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </section>

      {lv && (
        <section className="ava-karte">
          <h2>Nachträge</h2>
          {nurAslv && <p className="warning-text small-text">{aslvHinweis(ASLV_NICHT_GESPEICHERT.nachtraege)}. Nachtragspositionen im LV (Feld „Nachtrag“) bleiben erhalten.</p>}
          <table className="ava-tabelle">
            <thead>
              <tr>
                <th>Nr.</th>
                <th>Bezeichnung</th>
                <th>Datum</th>
                <th>Status</th>
                <th className="num">netto</th>
                <th className="num">brutto</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {lv.nachtraege.map((n) => {
                const netto = n.betrag ?? s?.nachtraege.get(n.nr) ?? 0;
                return (
                  <tr key={n.nr}>
                    <td>{n.nr}</td>
                    <td>
                      <TextEingabe label={`Bezeichnung Nachtrag ${n.nr}`} wert={n.titel} onChange={(titel) => nachtragSetzen(n.nr, { titel })} />
                    </td>
                    <td>
                      <DatumEingabe label={`Datum Nachtrag ${n.nr}`} wert={n.datum} onChange={(datum) => nachtragSetzen(n.nr, { datum })} />
                    </td>
                    <td>
                      <select aria-label={`Status Nachtrag ${n.nr}`} value={n.status} onChange={(e) => nachtragSetzen(n.nr, { status: e.target.value as Nachtrag['status'] })}>
                        <option value="angeboten">angeboten</option>
                        <option value="beauftragt">beauftragt</option>
                        <option value="abgelehnt">abgelehnt</option>
                      </select>
                    </td>
                    <td className="num ava-zelle-eingabe">
                      <ZahlEingabe label={`Betrag netto Nachtrag ${n.nr}`} wert={n.betrag ?? null} stellen={2} onChange={(betrag) => nachtragSetzen(n.nr, { betrag: betrag ?? undefined })} placeholder={s?.nachtraege.get(n.nr) ? euro(s.nachtraege.get(n.nr)) : 'aus Positionen'} />
                    </td>
                    <td className="num">{euro(brutto(netto, ust))}</td>
                    <td>
                      {n.status === 'beauftragt' && (
                        <button className="small" disabled={laeuft} onClick={() => void inKostenkontrolle(`Nachtrag ${n.nr} ${n.titel}`.trim(), n.datum, brutto(netto, ust))}>
                          In die Kostenkontrolle …
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
              {!lv.nachtraege.length && (
                <tr>
                  <td colSpan={7} className="muted">
                    Keine Nachträge. Positionen eines Nachtrags tragen im LV seine Nummer (Feld „Nachtrag“).
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          <div className="button-row">
            <button
              disabled={nurAslv}
              title={nurAslv ? aslvHinweis(ASLV_NICHT_GESPEICHERT.nachtraege) : 'Neuen Nachtrag anlegen'}
              onClick={() => {
                const nr = Math.max(0, ...lv.nachtraege.map((n) => n.nr), ...[...(s?.nachtraege.keys() ?? [])]) + 1;
                aendern((l) => ({ ...l, nachtraege: [...l.nachtraege, { nr, titel: `Nachtrag ${nr}`, datum: heuteIso(), status: 'angeboten' }] }));
              }}
            >
              <Symbol name="plus" /> Nachtrag
            </button>
          </div>
        </section>
      )}

      <section className="ava-karte">
        <h2>Kostenkontrolle {blatt ? `(Blatt „${blatt.blattName.trim()}“)` : ''}</h2>
        {!projekt.kk ? (
          <p className="muted">Keine Kostenkontrolle im Projekt.</p>
        ) : !blatt ? (
          <p className="muted">Die Kostenkontrolle hat kein Blatt für {gewerk}.</p>
        ) : (
          <>
            <div className="muted small-text">
              Auftragnehmer: {blatt.auftragnehmer || '—'} · Kostenschätzung: {euro(blatt.kostenschaetzung)}
            </div>
            <table className="ava-tabelle">
              <thead>
                <tr>
                  <th>Nr.</th>
                  <th>Auftrag</th>
                  <th>Datum</th>
                  <th className="num">brutto</th>
                </tr>
              </thead>
              <tbody>
                {blatt.anschlag.eintraege.map((e) => (
                  <tr key={e.zeile}>
                    <td>{e.nr}</td>
                    <td>{e.text}</td>
                    <td>{datumDE(e.datum)}</td>
                    <td className="num">{euro(e.betrag)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={3}>Kostenanschlag</td>
                  <td className="num">{euro(blatt.anschlag.summe)}</td>
                </tr>
              </tfoot>
            </table>
            {lv?.auftrag && blatt.anschlag.summe !== null && Math.abs(blatt.anschlag.summe - brutto(auftragNetto, ust)) > 0.02 && (
              <div className="warning">Kostenanschlag in der Kostenkontrolle ({euro(blatt.anschlag.summe)}) weicht von der Auftragssumme im LV ({euro(brutto(auftragNetto, ust))}) ab – Nachträge oder Auftrag noch nicht übernommen?</div>
            )}
          </>
        )}
      </section>

      <section className="ava-karte">
        <h2>Auftragnehmer & Zahlung</h2>
        <div className="ava-formular">
          <Feld label="Firma">
            <TextEingabe wert={angaben.firma ?? blatt?.auftragnehmer ?? auftragBieter?.name} onChange={(firma) => angabenSetzen({ firma })} />
          </Feld>
          <Feld label="Ansprechpartner">
            <TextEingabe wert={angaben.ansprechpartner} onChange={(ansprechpartner) => angabenSetzen({ ansprechpartner })} />
          </Feld>
          <Feld label="E-Mail der Firma">
            <TextEingabe wert={angaben.email} onChange={(email) => angabenSetzen({ email })} />
          </Feld>
          <Feld label="Telefon">
            <TextEingabe wert={angaben.telefon} onChange={(telefon) => angabenSetzen({ telefon })} />
          </Feld>
          <Feld label="Rechnungen zahlt (E-Mail)" hinweis={`leer = für das Projekt: ${projekt.ava.zahler || projekt.meta.bauherr.kontakte.find((k) => k.art === 'email')?.wert || 'Bauherr'}`}>
            <TextEingabe wert={angaben.zahler} onChange={(zahler) => angabenSetzen({ zahler })} />
          </Feld>
        </div>
      </section>

      {g && g.auftrag.length > 0 && (
        <section className="ava-karte">
          <h2>Dokumente im Auftragsordner</h2>
          <table className="ava-tabelle ava-dateien">
            <tbody>
              {g.auftrag
                .filter((d) => !d.archiv)
                .map((d) => (
                  <tr key={d.pfad} onDoubleClick={() => oeffnen(d.pfad)}>
                    <td className="ava-datei-name" title={d.pfad}>
                      {d.name}
                    </td>
                    <td className="ava-datei-aktion">
                      <button className="small" onClick={() => oeffnen(d.pfad)} aria-label={`${d.name} öffnen`}>
                        Öffnen
                      </button>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}
