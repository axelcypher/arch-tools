import { useMemo, useState } from 'react';
import { bestaetigen, meldung } from '@core/ui/Rueckfrage';
import type { Protokoll, Top } from '../../avaDaten';
import { ABNAHME_HINWEIS, istAbnahme, protokollPdf } from '../../bauleitung/berichte';
import { vorlageFuellen } from '../../abrechnung/mail';
import { globaleAva, MAIL_PROTOKOLL_VARIABLEN } from '../../platzhalter';
import { heuteIso, neueId } from '../../lv/modell';
import { useAva } from '../../store';
import { datumKurz, DatumEingabe, Feld, TextEingabe, ZahlEingabe } from '../eingaben';
import { listenTaste } from '../tastatur';
import { berichtAblegen, berichtKopf, mitPdfMailen, pdfZeigen, speichern } from './gemeinsam';

const ARTEN = ['Baubesprechung', 'Jour fixe', 'Baustellenbegehung', 'Abnahmebegehung', 'Planungsbesprechung'];

/** Protokolle der Besprechungen: Teilnehmer, Tagesordnungspunkte mit Zuständigkeit und Frist, offene Punkte übernehmen */
export function Protokolle() {
  const projekt = useAva((s) => s.projekt)!;
  const liste = useMemo(() => [...projekt.ava.protokolle].sort((a, b) => b.nr - a.nr), [projekt.ava.protokolle]);
  const [id, setId] = useState<string | null>(liste[0]?.id ?? null);
  const p = liste.find((x) => x.id === id) ?? null;

  const neu = async () => {
    const vorher = liste[0];
    const offen = vorher ? vorher.tops.filter((t) => !t.erledigt) : [];
    const uebernehmen = offen.length > 0 && (await bestaetigen('Offene Punkte übernehmen?', `${offen.length} offene(r) Punkt(e) aus Protokoll Nr. ${vorher!.nr} übernehmen?`, 'Übernehmen'));
    const teilnehmer = vorher ? vorher.teilnehmer.map((t) => ({ ...t, anwesend: true })) : projekt.ava.beteiligte.map((b) => ({ name: b.name || b.firma || '', firma: b.firma, email: b.email, anwesend: true }));
    const neuId = neueId('p');
    const art = vorher?.art && !istAbnahme(vorher.art) ? vorher.art : ARTEN[0];
    const verfasser = useAva.getState().einstellungen.deckblatt.bearbeiter || projekt.meta.bearbeiter;
    // die Nummer auf dem frischen Stand der Projektdatei vergeben
    await speichern((a) => {
      const n: Protokoll = {
        id: neuId,
        nr: Math.max(0, ...a.protokolle.map((x) => x.nr)) + 1,
        art,
        datum: heuteIso(),
        ort: vorher?.ort ?? 'Baustelle',
        teilnehmer,
        tops: uebernehmen ? offen.map((t, i) => ({ ...t, id: neueId('t'), nr: `${i + 1}.`, aus: t.aus ?? vorher!.nr })) : [],
        verfasser,
      };
      return { ...a, protokolle: [...a.protokolle, n] };
    });
    setId(neuId);
  };

  return (
    <div className="ava-zweispaltig">
      <div className="ava-liste-spalte">
        <div className="ava-eingang-kopf">
          <h2>Protokolle</h2>
          <button className="primary small" onClick={() => void neu()}>
            + Protokoll
          </button>
        </div>
        <ul className="list" role="listbox" aria-label="Protokolle">
          {liste.map((x) => (
            <li
              key={x.id}
              role="option"
              aria-selected={x.id === p?.id}
              tabIndex={x.id === (p?.id ?? liste[0]?.id) ? 0 : -1}
              className={x.id === p?.id ? 'active' : ''}
              onClick={() => setId(x.id)}
              onKeyDown={(e) =>
                listenTaste(
                  e,
                  liste,
                  liste.findIndex((y) => y.id === p?.id),
                  (y) => setId(y.id),
                )
              }
            >
              <div>
                <strong>Nr. {x.nr}</strong> {x.art}
              </div>
              <span className="muted small-text">
                {datumKurz(x.datum)} · {x.tops.filter((t) => !t.erledigt).length} offen
              </span>
            </li>
          ))}
          {!liste.length && <li className="muted">Noch keine Protokolle.</li>}
        </ul>
      </div>
      <div className="ava-editor-spalte">{p ? <ProtokollEditor key={p.id} p={p} /> : <p className="muted">Mit „+ Protokoll“ beginnen.</p>}</div>
    </div>
  );
}

type Teilnehmer = Protokoll['teilnehmer'][number];

function ProtokollEditor({ p }: { p: Protokoll }) {
  const projekt = useAva((s) => s.projekt)!;
  const e = useAva((s) => s.einstellungen);
  const [neuerTop, setNeuerTop] = useState<string | null>(null);
  /** Änderung auf dem frischen Stand des Protokolls (zwei schnelle Eingaben überschreiben sich nicht) */
  const setze = (patch: Partial<Protokoll> | ((x: Protokoll) => Partial<Protokoll>)) =>
    void speichern((a) => ({ ...a, protokolle: a.protokolle.map((x) => (x.id === p.id ? { ...x, ...(typeof patch === 'function' ? patch(x) : patch) } : x)) }));
  const top = (id: string, patch: Partial<Top>) => setze((x) => ({ tops: x.tops.map((t) => (t.id === id ? { ...t, ...patch } : t)) }));
  const teilnehmer = (i: number, patch: Partial<Teilnehmer>) => setze((x) => ({ teilnehmer: x.teilnehmer.map((t, j) => (j === i ? { ...t, ...patch } : t)) }));
  const offeneMaengel = projekt.ava.maengel.filter((m) => m.status === 'offen' || m.status === 'angezeigt');
  const name = `${projekt.meta.projektcode} ${p.datum.replace(/-/g, '').slice(2)} Protokoll ${String(p.nr).padStart(2, '0')}`;

  const pdf = async (ziel: 'zeigen' | 'ablegen' | 'mail') => {
    try {
      const daten = await protokollPdf(berichtKopf(), p);
      if (ziel === 'zeigen') return pdfZeigen(name, daten);
      if (ziel === 'ablegen') {
        await meldung('Abgelegt', await berichtAblegen(name, daten, 'Protokolle'));
        return;
      }
      const v = e.mail.vorlagen.find((x) => x.id === 'protokoll') ?? e.mail.vorlagen[0];
      const an = p.teilnehmer.map((t) => t.email).filter((x): x is string => !!x);
      const werte = { ...globaleAva(projekt.meta, projekt.name, e.deckblatt.bearbeiter), Nr: String(p.nr), Protokolldatum: datumKurz(p.datum), Teilnehmer: an.join('; ') };
      await mitPdfMailen({
        an,
        betreff: vorlageFuellen(v?.betreff ?? 'Protokoll Nr. {Nr} vom {Protokolldatum}', werte, MAIL_PROTOKOLL_VARIABLEN),
        text: vorlageFuellen(v?.text ?? '', werte, MAIL_PROTOKOLL_VARIABLEN),
        name,
        pdf: daten,
      });
    } catch (x) {
      await meldung('PDF nicht erzeugt', String(x instanceof Error ? x.message : x), x);
    }
  };

  return (
    <div className="ava-bericht">
      <div className="ava-formular">
        <Feld label="Art">
          <TextEingabe wert={p.art} onChange={(art) => setze({ art })} liste="ava-protokollarten" />
          <datalist id="ava-protokollarten">
            {ARTEN.map((a) => (
              <option key={a} value={a} />
            ))}
          </datalist>
        </Feld>
        <Feld label="Nr.">
          <ZahlEingabe wert={p.nr} leerErlaubt={false} stellen={0} onChange={(n) => n && n > 0 && setze({ nr: Math.round(n) })} />
        </Feld>
        <Feld label="Datum">
          <DatumEingabe wert={p.datum} onChange={(d) => d && setze({ datum: d })} />
        </Feld>
        <Feld label="Beginn">
          <input type="time" value={p.beginn ?? ''} onChange={(x) => setze({ beginn: x.target.value || undefined })} />
        </Feld>
        <Feld label="Ende">
          <input type="time" value={p.ende ?? ''} onChange={(x) => setze({ ende: x.target.value || undefined })} />
        </Feld>
        <Feld label="Ort">
          <TextEingabe wert={p.ort} onChange={(ort) => setze({ ort })} />
        </Feld>
        <Feld label="Verfasser">
          <TextEingabe wert={p.verfasser} onChange={(verfasser) => setze({ verfasser })} />
        </Feld>
        <Feld label="Nächster Termin">
          <TextEingabe wert={p.naechsterTermin} onChange={(naechsterTermin) => setze({ naechsterTermin })} />
        </Feld>
      </div>
      {istAbnahme(p.art) && (
        <div className="ava-abnahme">
          <p className="small-text">{ABNAHME_HINWEIS}</p>
          <Feld label="Vorbehalt bekannter Mängel" breit>
            <TextEingabe mehrzeilig zeilen={3} wert={p.vorbehaltMaengel} onChange={(vorbehaltMaengel) => setze({ vorbehaltMaengel })} placeholder="Mängel, die bei der Abnahme vorbehalten werden" />
          </Feld>
          <div className="button-row">
            <button
              className="small"
              disabled={!offeneMaengel.length}
              title={offeneMaengel.length ? 'Offene und angezeigte Mängel aus der Mängelliste anhängen' : 'Keine offenen Mängel in der Mängelliste'}
              onClick={() =>
                setze((x) => ({
                  vorbehaltMaengel: [x.vorbehaltMaengel?.trim(), ...offeneMaengel.map((m) => `Nr. ${m.nr}${m.ort ? ` (${m.ort})` : ''}: ${m.beschreibung}`)].filter(Boolean).join('\n'),
                }))
              }
            >
              Aus der Mängelliste übernehmen ({offeneMaengel.length})
            </button>
            <label className="ava-check">
              <input type="checkbox" checked={!!p.vertragsstrafeVorbehalten} onChange={(x) => setze({ vertragsstrafeVorbehalten: x.target.checked })} /> Vertragsstrafe vorbehalten
            </label>
          </div>
        </div>
      )}
      <h3>Teilnehmer</h3>
      <table className="ava-tabelle">
        <thead>
          <tr>
            <th>Name</th>
            <th>Firma / Funktion</th>
            <th>E-Mail</th>
            <th>anwesend</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {p.teilnehmer.map((t, i) => {
            const wer = t.name || `Teilnehmer ${i + 1}`;
            return (
              <tr key={i}>
                <td>
                  <TextEingabe wert={t.name} onChange={(name) => teilnehmer(i, { name })} label={`Name Teilnehmer ${i + 1}`} />
                </td>
                <td>
                  <TextEingabe wert={t.firma} onChange={(firma) => teilnehmer(i, { firma })} label={`Firma oder Funktion ${wer}`} />
                </td>
                <td>
                  <TextEingabe wert={t.email} onChange={(email) => teilnehmer(i, { email })} label={`E-Mail ${wer}`} />
                </td>
                <td>
                  <input type="checkbox" checked={t.anwesend} aria-label={`${wer} anwesend`} onChange={(x) => teilnehmer(i, { anwesend: x.target.checked })} />
                </td>
                <td>
                  <button className="small icon" title="Teilnehmer entfernen" aria-label={`${wer} entfernen`} onClick={() => setze((x) => ({ teilnehmer: x.teilnehmer.filter((_, j) => j !== i) }))}>
                    ×
                  </button>
                </td>
              </tr>
            );
          })}
          {!p.teilnehmer.length && (
            <tr>
              <td colSpan={5} className="muted">
                Noch keine Teilnehmer – „+ Teilnehmer“ oder aus den Beteiligten wählen.
              </td>
            </tr>
          )}
        </tbody>
      </table>
      <div className="button-row">
        <button className="small" onClick={() => setze((x) => ({ teilnehmer: [...x.teilnehmer, { name: '', anwesend: true }] }))}>
          + Teilnehmer
        </button>
        {projekt.ava.beteiligte.length > 0 && (
          <select
            value=""
            aria-label="Teilnehmer aus den Beteiligten hinzufügen"
            onChange={(x) => {
              const b = projekt.ava.beteiligte.find((y) => y.id === x.target.value);
              if (b) setze((y) => ({ teilnehmer: [...y.teilnehmer, { name: b.name || b.firma || '', firma: b.firma ?? b.rolle, email: b.email, anwesend: true }] }));
            }}
          >
            <option value="">aus den Beteiligten …</option>
            {projekt.ava.beteiligte.map((b) => (
              <option key={b.id} value={b.id}>
                {[b.rolle, b.firma, b.name].filter(Boolean).join(' – ')}
              </option>
            ))}
          </select>
        )}
      </div>
      <h3>Besprechungspunkte</h3>
      <div className="ava-tops">
        {p.tops.map((t) => (
          <div key={t.id} className={`ava-top${t.erledigt ? ' ava-top-erledigt' : ''}`}>
            <div className="ava-top-zeile">
              <TextEingabe className="ava-top-nr" wert={t.nr} onChange={(nr) => top(t.id, { nr })} label={`Nummer TOP ${t.nr}`} />
              <TextEingabe wert={t.titel} onChange={(titel) => top(t.id, { titel })} placeholder="Thema" className="ava-top-titel" label={`Thema TOP ${t.nr}`} autoFocus={t.id === neuerTop} />
              <span className="ava-top-angaben">
                <TextEingabe className="ava-top-zustaendig" wert={t.zustaendig} onChange={(zustaendig) => top(t.id, { zustaendig })} placeholder="zuständig" liste="ava-zustaendig" label={`Zuständig TOP ${t.nr}`} />
                <DatumEingabe wert={t.frist} onChange={(frist) => top(t.id, { frist })} title="Frist" label={`Frist TOP ${t.nr}`} />
                <label className="ava-check">
                  <input type="checkbox" checked={!!t.erledigt} onChange={(x) => top(t.id, { erledigt: x.target.checked })} /> erledigt
                </label>
                <button className="small icon" title="Punkt entfernen" aria-label={`TOP ${t.nr} entfernen`} onClick={() => setze((x) => ({ tops: x.tops.filter((y) => y.id !== t.id) }))}>
                  ×
                </button>
              </span>
            </div>
            <TextEingabe mehrzeilig zeilen={2} wert={t.text} onChange={(text) => top(t.id, { text })} placeholder="Besprochen, vereinbart …" label={`Text TOP ${t.nr}`} />
            {t.aus && <span className="muted small-text">aus Protokoll Nr. {t.aus}</span>}
          </div>
        ))}
        <datalist id="ava-zustaendig">
          {[...new Set([...p.teilnehmer.map((t) => t.firma || t.name), 'Bauleitung', 'Bauherr'])].filter(Boolean).map((z) => (
            <option key={z} value={z} />
          ))}
        </datalist>
      </div>
      <div className="button-row">
        <button
          onClick={() => {
            const id = neueId('t');
            setNeuerTop(id);
            setze((x) => ({ tops: [...x.tops, { id, nr: `${x.tops.length + 1}.`, titel: '', text: '' }] }));
          }}
        >
          + Punkt
        </button>
      </div>
      <Feld label="Verteiler" breit>
        <TextEingabe wert={p.verteiler} onChange={(verteiler) => setze({ verteiler })} />
      </Feld>
      <div className="button-row">
        <button onClick={() => void pdf('zeigen')}>PDF ansehen / drucken</button>
        <button className="primary" onClick={() => void pdf('ablegen')}>
          PDF im Projekt ablegen
        </button>
        <button onClick={() => void pdf('mail')} title="Mailentwurf an alle Teilnehmer mit E-Mail, Protokoll als PDF im Anhang">
          An die Teilnehmer mailen …
        </button>
        <span className="tb-spacer" />
        <button
          className="danger"
          onClick={async () => {
            if (await bestaetigen('Protokoll entfernen?', `Protokoll Nr. ${p.nr} entfernen?`, 'Entfernen', true)) await speichern((a) => ({ ...a, protokolle: a.protokolle.filter((x) => x.id !== p.id) }));
          }}
        >
          Entfernen
        </button>
      </div>
    </div>
  );
}
