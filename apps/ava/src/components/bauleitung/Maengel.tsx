import { useMemo, useState } from 'react';
import { bestaetigen, meldung } from '@core/ui/Rueckfrage';
import { Symbol } from '@core/ui/Symbol';
import type { Mangel, MangelStatus } from '../../avaDaten';
import { maengelanzeigeText, maengelPdf } from '../../bauleitung/berichte';
import { alleGewerke } from '../../abrechnung/aggregat';
import { gewerkZweistellig } from '../../abrechnung/gewerk';
import { heuteIso, neueId } from '../../lv/modell';
import { useAva } from '../../store';
import { datumKurz, DatumEingabe, TextEingabe } from '../eingaben';
import { berichtAblegen, berichtKopf, mitPdfMailen, pdfZeigen, speichern } from './gemeinsam';

const STATUS: MangelStatus[] = ['offen', 'angezeigt', 'erledigt', 'abgenommen'];

/** Mangel mit dem Datum der Mängelanzeige (versendet am) */

const istOffen = (m: Mangel) => m.status === 'offen' || m.status === 'angezeigt';

/** Mängelliste je Gewerk: festgestellt, Frist, Status; Liste als PDF, Mängelanzeige an die Firma */
export function Maengel() {
  const projekt = useAva((s) => s.projekt)!;
  const [filter, setFilter] = useState<'offen' | 'alle'>('offen');
  const [gewerk, setGewerkRoh] = useState('');
  // Mängel, deren Status hier gerade auf erledigt/abgenommen gesetzt wurde: bleiben abgeblendet stehen, bis der Filter wechselt
  const [behalten, setBehalten] = useState<ReadonlySet<string>>(new Set());
  const [neuerMangel, setNeuerMangel] = useState<string | null>(null);
  const filterSetzen = (f: 'offen' | 'alle') => {
    setFilter(f);
    setBehalten(new Set());
  };
  const setGewerk = (g: string) => {
    setGewerkRoh(g);
    setBehalten(new Set());
  };
  const kk = projekt.kk?.kk ?? null;
  const gewerke = useMemo(() => alleGewerke(kk, projekt.struktur?.gewerke ?? [], []), [kk, projekt.struktur]);
  const firmaVon = (g?: string) => (g ? projekt.ava.gewerke[g]?.firma || kk?.gewerke.find((x) => x.gewerk === g)?.auftragnehmer || '' : '');
  const liste = projekt.ava.maengel.filter((m) => (filter === 'alle' || istOffen(m) || behalten.has(m.id)) && (!gewerk || m.gewerk === gewerk)).sort((a, b) => a.nr - b.nr);
  const offeneListe = liste.filter(istOffen);
  const setze = (id: string, patch: Partial<Mangel>) =>
    void speichern((a) => ({
      ...a,
      maengel: a.maengel.map((m) =>
        m.id === id
          ? { ...m, ...patch, ...(patch.status === 'erledigt' && !m.erledigtAm ? { erledigtAm: heuteIso() } : {}), ...(patch.status === 'angezeigt' && !m.angezeigtAm ? { angezeigtAm: heuteIso() } : {}) }
          : m,
      ),
    }));
  const statusSetzen = (m: Mangel, status: MangelStatus) => {
    if (filter === 'offen' && !istOffen({ ...m, status })) setBehalten((b) => new Set(b).add(m.id));
    setze(m.id, { status });
  };

  const neu = () => {
    const id = neueId('m');
    setNeuerMangel(id);
    void speichern((a) => ({
      ...a,
      maengel: [...a.maengel, { id, nr: Math.max(0, ...a.maengel.map((m) => m.nr)) + 1, gewerk: gewerk || undefined, firma: firmaVon(gewerk) || undefined, beschreibung: '', festgestellt: heuteIso(), status: 'offen', fotos: [] }],
    }));
  };

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
      const ohneFrist = offeneListe.filter((m) => !m.frist).length;
      if (
        ohneFrist &&
        !(await bestaetigen(
          'Mängel ohne Frist',
          `${ohneFrist === 1 ? 'Ein Mangel hat' : `${ohneFrist} Mängel haben`} keine Frist. Für die Aufforderung zur Mängelbeseitigung ist eine angemessene Frist nötig (vor der Abnahme § 4 Abs. 7, danach § 13 Abs. 5 VOB/B). Im Mailtext bleibt dann eine Lücke für die Frist. Trotzdem den Entwurf erstellen?`,
          'Entwurf erstellen',
        ))
      )
        return;
      const an = gewerk ? projekt.ava.gewerke[gewerk]?.email : undefined;
      const erstellt = await mitPdfMailen({
        an: an ? [an] : [],
        betreff: `${projekt.meta.projektcode} ${projekt.meta.vorhaben || projekt.name} – Mängelanzeige ${gewerk ? gewerkZweistellig(gewerk) : ''}`.trim(),
        text: maengelanzeigeText(offeneListe, useAva.getState().einstellungen.deckblatt.bearbeiter || projekt.meta.bearbeiter),
        name,
        pdf: await maengelPdf(berichtKopf(), offeneListe, titel),
      });
      if (!erstellt) return;
      // erst nach dem Versand als angezeigt vermerken (mit Datum)
      const offen = offeneListe.filter((m) => m.status === 'offen');
      if (
        offen.length &&
        (await bestaetigen(
          'Mängelanzeige versendet?',
          `Der Mailentwurf ist erstellt. Erst nach dem Versand die ${offen.length === 1 ? 'offene Position' : `${offen.length} offenen Positionen`} als „angezeigt“ mit dem Datum von heute (${datumKurz(heuteIso())}) vermerken. Wird die Mail später verschickt, den Status dann in der Liste setzen.`,
          'Versendet – vermerken',
        ))
      ) {
        const heute = heuteIso();
        await speichern((a) => ({ ...a, maengel: a.maengel.map((m) => (offen.some((x) => x.id === m.id) && m.status === 'offen' ? { ...m, status: 'angezeigt', angezeigtAm: heute } : m)) }));
      }
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
        <button title="Mangel hinzufügen" className="primary" onClick={neu}>
          <Symbol name="plus" /> Mangel
        </button>
        <select value={gewerk} onChange={(e) => setGewerk(e.target.value)} aria-label="Gewerk">
          <option value="">alle Gewerke</option>
          {gewerke.map((g) => (
            <option key={g} value={g}>
              {gewerkZweistellig(g)} {firmaVon(g)}
            </option>
          ))}
        </select>
        <select value={filter} onChange={(e) => filterSetzen(e.target.value as 'offen' | 'alle')} aria-label="Filter">
          <option value="offen">offene und angezeigte</option>
          <option value="alle">alle</option>
        </select>
        <button onClick={() => void pdf('zeigen')} disabled={!liste.length}>
          PDF ansehen
        </button>
        <button onClick={() => void pdf('ablegen')} disabled={!liste.length}>
          PDF ablegen
        </button>
        <button onClick={() => void pdf('mail')} disabled={!offeneListe.length || !gewerk} title={!gewerk ? 'Erst ein Gewerk wählen' : offeneListe.length ? 'Mängelanzeige mit den offenen Mängeln an die Firma des Gewerks (Mailentwurf mit PDF)' : 'Keine offenen Mängel'}>
          Mängelanzeige mailen …
        </button>
      </div>
      <div className="ava-rollen">
      <table className="ava-tabelle ava-maengel-tabelle">
        <thead>
          <tr>
            <th className="num">Nr.</th>
            <th>Gewerk</th>
            <th>Firma / Ort</th>
            <th>Mangel</th>
            <th>festgestellt / Frist</th>
            <th>Status</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {liste.map((m) => (
            <tr key={m.id} className={m.frist && m.frist < heuteIso() && istOffen(m) ? 'ava-ueberfaellig' : behalten.has(m.id) ? 'ava-abgeblendet' : ''}>
              <td className="num">{m.nr}</td>
              <td>
                <select value={m.gewerk ?? ''} aria-label={`Gewerk Mangel ${m.nr}`} onChange={(e) => setze(m.id, { gewerk: e.target.value || undefined, firma: m.firma || firmaVon(e.target.value) || undefined })}>
                  <option value="">–</option>
                  {gewerke.map((g) => (
                    <option key={g} value={g}>
                      {gewerkZweistellig(g)}
                    </option>
                  ))}
                </select>
              </td>
              <td className="ava-zelle-gestapelt">
                <TextEingabe wert={m.firma} onChange={(firma) => setze(m.id, { firma })} placeholder="Firma" label={`Firma Mangel ${m.nr}`} />
                <TextEingabe wert={m.ort} onChange={(ort) => setze(m.id, { ort })} placeholder="Ort" label={`Ort Mangel ${m.nr}`} />
              </td>
              <td className="ava-breit-zelle">
                <TextEingabe mehrzeilig zeilen={2} wert={m.beschreibung} onChange={(beschreibung) => setze(m.id, { beschreibung })} placeholder="Beschreibung" label={`Beschreibung Mangel ${m.nr}`} autoFocus={m.id === neuerMangel} />
              </td>
              <td className="ava-zelle-gestapelt">
                <DatumEingabe wert={m.festgestellt} onChange={(d) => d && setze(m.id, { festgestellt: d })} title="festgestellt am" label={`festgestellt Mangel ${m.nr}`} />
                <DatumEingabe wert={m.frist} onChange={(frist) => setze(m.id, { frist })} title="Frist zur Beseitigung" label={`Frist Mangel ${m.nr}`} />
              </td>
              <td>
                <select value={m.status} aria-label={`Status Mangel ${m.nr}`} onChange={(e) => statusSetzen(m, e.target.value as MangelStatus)}>
                  {STATUS.map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
                {m.angezeigtAm && m.status !== 'offen' && <div className="muted small-text">angezeigt am {datumKurz(m.angezeigtAm)}</div>}
              </td>
              <td>
                <button
                  className="small icon"
                  title="Mangel entfernen"
                  aria-label={`Mangel ${m.nr} entfernen`}
                  onClick={async () => {
                    if (await bestaetigen('Mangel entfernen?', m.beschreibung || `Nr. ${m.nr}`, 'Entfernen', true)) await speichern((a) => ({ ...a, maengel: a.maengel.filter((x) => x.id !== m.id) }));
                  }}
                >
                  <Symbol name="schliessen" />
                </button>
              </td>
            </tr>
          ))}
          {!liste.length && (
            <tr>
              <td colSpan={7} className="muted">
                {filter === 'offen' && projekt.ava.maengel.length ? 'Keine offenen Mängel – Filter „alle“ zeigt auch erledigte.' : 'Noch keine Mängel – mit „Mangel“ beginnen.'}
              </td>
            </tr>
          )}
        </tbody>
      </table>
      </div>
      {behalten.size > 0 && <p className="muted small-text">Abgeblendete Mängel sind erledigt bzw. abgenommen und verschwinden beim nächsten Filterwechsel.</p>}
    </div>
  );
}
