import { useState } from 'react';
import { bestaetigen, meldung } from '@core/ui/Rueckfrage';
import { Symbol } from '@core/ui/Symbol';
import type { Beteiligter } from '../../avaDaten';
import { gewerkZweistellig } from '../../abrechnung/gewerk';
import { neueId } from '../../lv/modell';
import { useAva } from '../../store';
import { TextEingabe } from '../eingaben';
import { speichern } from './gemeinsam';

/** Beteiligte des Projekts: Bauherr, Planer, Firmen – mit Kontakt (für Protokolle, Mails, Mängelanzeigen) */
export function Beteiligte() {
  const projekt = useAva((s) => s.projekt)!;
  const liste = projekt.ava.beteiligte;
  const [neuerEintrag, setNeuerEintrag] = useState<string | null>(null);
  const setze = (id: string, patch: Partial<Beteiligter>) => void speichern((a) => ({ ...a, beteiligte: a.beteiligte.map((b) => (b.id === id ? { ...b, ...patch } : b)) }));

  const uebernehmen = async () => {
    const neu: Beteiligter[] = [];
    const m = projekt.meta;
    const da = (firma?: string, name?: string) => [...liste, ...neu].some((b) => (firma && b.firma === firma) || (name && b.name === name));
    const bauherr = `${m.bauherr.vorname ?? ''} ${m.bauherr.name}`.trim();
    if (bauherr && !da(undefined, bauherr)) neu.push({ id: neueId('b'), rolle: 'Bauherr', name: bauherr, email: m.bauherr.kontakte.find((k) => k.art === 'email')?.wert, telefon: m.bauherr.kontakte.find((k) => k.art === 'telefon')?.wert });
    for (const b of m.beteiligte ?? []) if (!da(undefined, b.name)) neu.push({ id: neueId('b'), rolle: b.rolle, name: b.name, ...(b.kontakt.includes('@') ? { email: b.kontakt } : { telefon: b.kontakt }) });
    for (const g of projekt.kk?.kk.gewerke ?? []) {
      const a = g.gewerk ? projekt.ava.gewerke[g.gewerk] : undefined;
      const firma = a?.firma || g.auftragnehmer;
      if (firma && !da(firma)) neu.push({ id: neueId('b'), rolle: g.bezeichnung || 'Firma', firma, name: a?.ansprechpartner, email: a?.email, telefon: a?.telefon, gewerk: g.gewerk ?? undefined });
    }
    if (!neu.length) {
      await meldung('Nichts zu übernehmen', 'Bauherr, Beteiligte der Stammdaten und Auftragnehmer stehen schon in der Liste.');
      return;
    }
    await speichern((a) => ({ ...a, beteiligte: [...a.beteiligte, ...neu] }));
  };

  return (
    <div className="ava-seite">
      <div className="ava-seite-kopf">
        <h1>Beteiligte</h1>
      </div>
      <div className="toolbar">
        <button
          className="primary"
          onClick={() => {
            const id = neueId('b');
            setNeuerEintrag(id);
            void speichern((a) => ({ ...a, beteiligte: [...a.beteiligte, { id, rolle: '' }] }));
          }}
        >
          + Beteiligter
        </button>
        <button onClick={() => void uebernehmen()} title="Bauherr und Beteiligte aus den Stammdaten, Auftragnehmer aus der Kostenkontrolle">
          Aus Stammdaten und Gewerken übernehmen
        </button>
      </div>
      <table className="ava-tabelle">
        <thead>
          <tr>
            <th>Rolle</th>
            <th>Firma</th>
            <th>Name</th>
            <th>E-Mail</th>
            <th>Telefon</th>
            <th>Gewerk</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {liste.map((b, i) => {
            const wer = [b.rolle, b.firma, b.name].filter(Boolean).join(' – ') || `Beteiligter ${i + 1}`;
            return (
            <tr key={b.id}>
              <td>
                <TextEingabe wert={b.rolle} onChange={(rolle) => setze(b.id, { rolle })} label={`Rolle ${wer}`} autoFocus={b.id === neuerEintrag} />
              </td>
              <td>
                <TextEingabe wert={b.firma} onChange={(firma) => setze(b.id, { firma })} label={`Firma ${wer}`} />
              </td>
              <td>
                <TextEingabe wert={b.name} onChange={(name) => setze(b.id, { name })} label={`Name ${wer}`} />
              </td>
              <td>
                <TextEingabe wert={b.email} onChange={(email) => setze(b.id, { email })} label={`E-Mail ${wer}`} />
              </td>
              <td>
                <TextEingabe wert={b.telefon} onChange={(telefon) => setze(b.id, { telefon })} label={`Telefon ${wer}`} />
              </td>
              <td>{b.gewerk ? gewerkZweistellig(b.gewerk) : ''}</td>
              <td>
                <button
                  className="small icon"
                  title="Beteiligten entfernen"
                  aria-label={`${wer} entfernen`}
                  onClick={async () => {
                    if (await bestaetigen('Beteiligten entfernen?', [b.rolle, b.firma, b.name].filter(Boolean).join(' – '), 'Entfernen', true)) await speichern((a) => ({ ...a, beteiligte: a.beteiligte.filter((x) => x.id !== b.id) }));
                  }}
                >
                  <Symbol name="schliessen" />
                </button>
              </td>
            </tr>
            );
          })}
          {!liste.length && (
            <tr>
              <td colSpan={7} className="muted">
                Noch keine Beteiligten – „Aus Stammdaten und Gewerken übernehmen“.
              </td>
            </tr>
          )}
        </tbody>
      </table>
      <div className="ava-formular">
        <label className="ava-feld">
          <span className="ava-feld-label">Rechnungen zahlt (E-Mail, Vorgabe für alle Gewerke)</span>
          <TextEingabe wert={projekt.ava.zahler} onChange={(zahler) => void speichern((a) => ({ ...a, zahler: zahler || undefined }))} />
          <span className="ava-feld-hinweis">leer = E-Mail des Bauherrn aus den Stammdaten</span>
        </label>
      </div>
    </div>
  );
}
