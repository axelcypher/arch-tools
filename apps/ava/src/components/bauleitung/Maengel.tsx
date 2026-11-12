import { useMemo, useState } from 'react';
import { bestaetigen, meldung } from '@core/ui/Rueckfrage';
import type { Mangel, MangelStatus } from '../../avaDaten';
import { maengelPdf } from '../../bauleitung/berichte';
import { alleGewerke } from '../../abrechnung/aggregat';
import { gewerkZweistellig } from '../../abrechnung/gewerk';
import { heuteIso, neueId } from '../../lv/modell';
import { useAva } from '../../store';
import { DatumEingabe, TextEingabe } from '../eingaben';
import { berichtAblegen, berichtKopf, mitPdfMailen, pdfZeigen, speichern } from './gemeinsam';

const STATUS: MangelStatus[] = ['offen', 'angezeigt', 'erledigt', 'abgenommen'];

/** Mängelliste je Gewerk: festgestellt, Frist, Status; Liste als PDF, Mängelanzeige an die Firma */
export function Maengel() {
  const projekt = useAva((s) => s.projekt)!;
  const [filter, setFilter] = useState<'offen' | 'alle'>('offen');
  const [gewerk, setGewerk] = useState('');
  const kk = projekt.kk?.kk ?? null;
  const gewerke = useMemo(() => alleGewerke(kk, projekt.struktur?.gewerke ?? [], []), [kk, projekt.struktur]);
  const firmaVon = (g?: string) => (g ? projekt.ava.gewerke[g]?.firma || kk?.gewerke.find((x) => x.gewerk === g)?.auftragnehmer || '' : '');
  const liste = projekt.ava.maengel.filter((m) => (filter === 'alle' || m.status === 'offen' || m.status === 'angezeigt') && (!gewerk || m.gewerk === gewerk)).sort((a, b) => a.nr - b.nr);
  const setze = (id: string, patch: Partial<Mangel>) => void speichern((a) => ({ ...a, maengel: a.maengel.map((m) => (m.id === id ? { ...m, ...patch, ...(patch.status === 'erledigt' && !m.erledigtAm ? { erledigtAm: heuteIso() } : {}) } : m)) }));

  const neu = () =>
    void speichern((a) => ({
      ...a,
      maengel: [...a.maengel, { id: neueId('m'), nr: Math.max(0, ...a.maengel.map((m) => m.nr)) + 1, gewerk: gewerk || undefined, firma: firmaVon(gewerk) || undefined, beschreibung: '', festgestellt: heuteIso(), status: 'offen', fotos: [] }],
    }));

  const pdf = async (ziel: 'zeigen' | 'ablegen' | 'mail') => {
    try {
      const titel = gewerk ? `Mängelliste ${gewerkZweistellig(gewerk)} ${firmaVon(gewerk)}`.trim() : 'Mängelliste';
      const daten = await maengelPdf(berichtKopf(), liste, titel);
      const name = `${projekt.meta.projektcode} ${heuteIso().replace(/-/g, '').slice(2)} ${titel}`;
      if (ziel === 'zeigen') return pdfZeigen(name, daten);
      if (ziel === 'ablegen') {
        await meldung('Abgelegt', await berichtAblegen(name, daten, 'Mängel'));
        return;
      }
      const an = gewerk ? projekt.ava.gewerke[gewerk]?.email : undefined;
      await mitPdfMailen({
        an: an ? [an] : [],
        betreff: `${projekt.meta.projektcode} ${projekt.meta.vorhaben || projekt.name} – Mängelanzeige ${gewerk ? gewerkZweistellig(gewerk) : ''}`.trim(),
        text: `Guten Tag,\n\nbei der Begehung wurden die in der Anlage aufgeführten Mängel festgestellt. Wir bitten um Beseitigung bis zu den genannten Fristen und um kurze Rückmeldung.\n\nMit freundlichen Grüßen\n${useAva.getState().einstellungen.deckblatt.bearbeiter || projekt.meta.bearbeiter}`,
        name,
        pdf: daten,
      });
      // als angezeigt markieren
      await speichern((a) => ({ ...a, maengel: a.maengel.map((m) => (liste.some((x) => x.id === m.id) && m.status === 'offen' ? { ...m, status: 'angezeigt' } : m)) }));
    } catch (x) {
      await meldung('PDF nicht erzeugt', String(x instanceof Error ? x.message : x), x);
    }
  };

  return (
    <div className="ava-seite">
      <div className="ava-seite-kopf">
        <h1>Mängel</h1>
      </div>
      <div className="toolbar">
        <button className="primary" onClick={neu}>
          + Mangel
        </button>
        <select value={gewerk} onChange={(e) => setGewerk(e.target.value)}>
          <option value="">alle Gewerke</option>
          {gewerke.map((g) => (
            <option key={g} value={g}>
              {gewerkZweistellig(g)} {firmaVon(g)}
            </option>
          ))}
        </select>
        <select value={filter} onChange={(e) => setFilter(e.target.value as 'offen' | 'alle')}>
          <option value="offen">offene und angezeigte</option>
          <option value="alle">alle</option>
        </select>
        <button onClick={() => void pdf('zeigen')} disabled={!liste.length}>
          PDF ansehen
        </button>
        <button onClick={() => void pdf('ablegen')} disabled={!liste.length}>
          PDF ablegen
        </button>
        <button onClick={() => void pdf('mail')} disabled={!liste.length || !gewerk} title={gewerk ? 'Mängelanzeige an die Firma des Gewerks (Mailentwurf mit PDF)' : 'Erst ein Gewerk wählen'}>
          Mängelanzeige mailen …
        </button>
      </div>
      <table className="ava-tabelle">
        <thead>
          <tr>
            <th className="num">Nr.</th>
            <th>Gewerk</th>
            <th>Firma</th>
            <th>Ort</th>
            <th>Mangel</th>
            <th>festgestellt</th>
            <th>Frist</th>
            <th>Status</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {liste.map((m) => (
            <tr key={m.id} className={m.frist && m.frist < heuteIso() && (m.status === 'offen' || m.status === 'angezeigt') ? 'ava-ueberfaellig' : ''}>
              <td className="num">{m.nr}</td>
              <td>
                <select value={m.gewerk ?? ''} onChange={(e) => setze(m.id, { gewerk: e.target.value || undefined, firma: m.firma || firmaVon(e.target.value) || undefined })}>
                  <option value="">–</option>
                  {gewerke.map((g) => (
                    <option key={g} value={g}>
                      {gewerkZweistellig(g)}
                    </option>
                  ))}
                </select>
              </td>
              <td>
                <TextEingabe wert={m.firma} onChange={(firma) => setze(m.id, { firma })} />
              </td>
              <td>
                <TextEingabe wert={m.ort} onChange={(ort) => setze(m.id, { ort })} />
              </td>
              <td className="ava-breit-zelle">
                <TextEingabe wert={m.beschreibung} onChange={(beschreibung) => setze(m.id, { beschreibung })} placeholder="Beschreibung" />
              </td>
              <td>
                <DatumEingabe wert={m.festgestellt} onChange={(d) => d && setze(m.id, { festgestellt: d })} />
              </td>
              <td>
                <DatumEingabe wert={m.frist} onChange={(frist) => setze(m.id, { frist })} />
              </td>
              <td>
                <select value={m.status} onChange={(e) => setze(m.id, { status: e.target.value as MangelStatus })}>
                  {STATUS.map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </td>
              <td>
                <button
                  className="small"
                  onClick={async () => {
                    if (await bestaetigen('Mangel entfernen?', m.beschreibung || `Nr. ${m.nr}`, 'Entfernen', true)) await speichern((a) => ({ ...a, maengel: a.maengel.filter((x) => x.id !== m.id) }));
                  }}
                >
                  ×
                </button>
              </td>
            </tr>
          ))}
          {!liste.length && (
            <tr>
              <td colSpan={9} className="muted">
                Keine Mängel.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
