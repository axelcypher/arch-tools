import { useMemo, useState } from 'react';
import { bestaetigen, meldung } from '@core/ui/Rueckfrage';
import type { Protokoll, Top } from '../../avaDaten';
import { protokollPdf } from '../../bauleitung/berichte';
import { vorlageFuellen } from '../../abrechnung/mail';
import { globaleAva, MAIL_PROTOKOLL_VARIABLEN } from '../../platzhalter';
import { heuteIso, neueId } from '../../lv/modell';
import { useAva } from '../../store';
import { datumKurz, DatumEingabe, Feld, TextEingabe } from '../eingaben';
import { berichtAblegen, berichtKopf, mitPdfMailen, pdfZeigen, speichern } from './gemeinsam';

const ARTEN = ['Baubesprechung', 'Jour fixe', 'Baustellenbegehung', 'Abnahme', 'Planungsbesprechung'];

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
    const n: Protokoll = {
      id: neueId('p'),
      nr: Math.max(0, ...liste.map((x) => x.nr)) + 1,
      art: vorher?.art ?? ARTEN[0],
      datum: heuteIso(),
      ort: vorher?.ort ?? 'Baustelle',
      teilnehmer,
      tops: uebernehmen ? offen.map((t, i) => ({ ...t, id: neueId('t'), nr: `${i + 1}.`, aus: t.aus ?? vorher!.nr })) : [],
      verfasser: useAva.getState().einstellungen.deckblatt.bearbeiter || projekt.meta.bearbeiter,
    };
    await speichern((a) => ({ ...a, protokolle: [...a.protokolle, n] }));
    setId(n.id);
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
        <ul className="list">
          {liste.map((x) => (
            <li key={x.id} className={x.id === p?.id ? 'active' : ''} onClick={() => setId(x.id)}>
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

function ProtokollEditor({ p }: { p: Protokoll }) {
  const projekt = useAva((s) => s.projekt)!;
  const e = useAva((s) => s.einstellungen);
  const setze = (patch: Partial<Protokoll>) => void speichern((a) => ({ ...a, protokolle: a.protokolle.map((x) => (x.id === p.id ? { ...x, ...patch } : x)) }));
  const top = (i: number, patch: Partial<Top>) => setze({ tops: p.tops.map((t, j) => (j === i ? { ...t, ...patch } : t)) });
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
          <input type="number" value={p.nr} onChange={(x) => setze({ nr: Number(x.target.value) || p.nr })} />
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
          {p.teilnehmer.map((t, i) => (
            <tr key={i}>
              <td>
                <TextEingabe wert={t.name} onChange={(name) => setze({ teilnehmer: p.teilnehmer.map((x, j) => (j === i ? { ...x, name } : x)) })} />
              </td>
              <td>
                <TextEingabe wert={t.firma} onChange={(firma) => setze({ teilnehmer: p.teilnehmer.map((x, j) => (j === i ? { ...x, firma } : x)) })} />
              </td>
              <td>
                <TextEingabe wert={t.email} onChange={(email) => setze({ teilnehmer: p.teilnehmer.map((x, j) => (j === i ? { ...x, email } : x)) })} />
              </td>
              <td>
                <input type="checkbox" checked={t.anwesend} onChange={(x) => setze({ teilnehmer: p.teilnehmer.map((y, j) => (j === i ? { ...y, anwesend: x.target.checked } : y)) })} />
              </td>
              <td>
                <button className="small" onClick={() => setze({ teilnehmer: p.teilnehmer.filter((_, j) => j !== i) })}>
                  ×
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="button-row">
        <button className="small" onClick={() => setze({ teilnehmer: [...p.teilnehmer, { name: '', anwesend: true }] })}>
          + Teilnehmer
        </button>
        {projekt.ava.beteiligte.length > 0 && (
          <select
            value=""
            onChange={(x) => {
              const b = projekt.ava.beteiligte.find((y) => y.id === x.target.value);
              if (b) setze({ teilnehmer: [...p.teilnehmer, { name: b.name || b.firma || '', firma: b.firma ?? b.rolle, email: b.email, anwesend: true }] });
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
        {p.tops.map((t, i) => (
          <div key={t.id} className={`ava-top${t.erledigt ? ' ava-top-erledigt' : ''}`}>
            <div className="ava-reihe">
              <input className="ava-top-nr" value={t.nr} onChange={(x) => top(i, { nr: x.target.value })} />
              <TextEingabe wert={t.titel} onChange={(titel) => top(i, { titel })} placeholder="Thema" className="ava-top-titel" />
              <TextEingabe wert={t.zustaendig} onChange={(zustaendig) => top(i, { zustaendig })} placeholder="zuständig" liste="ava-zustaendig" />
              <DatumEingabe wert={t.frist} onChange={(frist) => top(i, { frist })} title="Frist" />
              <label className="ava-check" title="erledigt">
                <input type="checkbox" checked={!!t.erledigt} onChange={(x) => top(i, { erledigt: x.target.checked })} /> erl.
              </label>
              <button className="small" onClick={() => setze({ tops: p.tops.filter((_, j) => j !== i) })}>
                ×
              </button>
            </div>
            <TextEingabe mehrzeilig zeilen={2} wert={t.text} onChange={(text) => top(i, { text })} placeholder="Besprochen, vereinbart …" />
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
        <button onClick={() => setze({ tops: [...p.tops, { id: neueId('t'), nr: `${p.tops.length + 1}.`, titel: '', text: '' }] })}>+ Punkt</button>
      </div>
      <Feld label="Verteiler" breit>
        <TextEingabe wert={p.verteiler} onChange={(verteiler) => setze({ verteiler })} />
      </Feld>
      <div className="button-row">
        <button onClick={() => void pdf('zeigen')}>PDF ansehen / drucken</button>
        <button onClick={() => void pdf('ablegen')}>PDF im Projekt ablegen</button>
        <button className="primary" onClick={() => void pdf('mail')} title="Mailentwurf an alle Teilnehmer mit E-Mail, Protokoll als PDF im Anhang">
          An die Teilnehmer mailen …
        </button>
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
