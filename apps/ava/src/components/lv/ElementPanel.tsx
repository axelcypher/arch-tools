import { useState } from 'react';
import { meldung } from '@core/ui/Rueckfrage';
import type { Abschnitt, Hinweis, LvElement, Position, PositionsArt } from '../../lv/modell';
import { aendereElement, finde, POSITIONSARTEN } from '../../lv/modell';
import { summen } from '../../lv/rechnen';
import { vorlageAusPosition, vorlagenAendern } from '../../lv/textbibliothek';
import { euro } from '../../abrechnung/pruefung';
import { useAva } from '../../store';
import { Feld, TextEingabe, ZahlEingabe } from '../eingaben';
import { Langtext } from './Langtext';
import { Textbibliothek } from './Textbibliothek';

export const EINHEITEN = ['m', 'm²', 'm³', 'Stck', 'psch', 'h', 'kg', 't', 'lfm', 'St', 'Satz', 'Wo', 'Tag'];

/** Eigenschaften des gewählten LV-Elements: Texte, Menge, Einheit, Art, Kostengruppe */
export function ElementPanel() {
  const offen = useAva((s) => s.lv)!;
  const auswahl = useAva((s) => s.auswahl);
  const [bibliothek, setBibliothek] = useState(false);
  const lv = offen.lv;
  const f = auswahl ? finde(lv.elemente, auswahl) : null;
  const el = f?.el;
  const setze = <T extends LvElement>(patch: Partial<T>) => {
    if (!el) return;
    useAva.getState().lvAendern((l) => ({ ...l, elemente: aendereElement(l.elemente, el.id, (e) => ({ ...e, ...patch }) as LvElement) }));
  };
  const nurAslv = offen.format === 'aslv';

  if (!el) {
    return (
      <aside className="ava-panel">
        <p className="muted">Ein Element in der Tabelle wählen, um Kurz- und Langtext, Menge, Einheit und Art zu bearbeiten.</p>
        <p className="muted small-text">Tastatur: ↑/↓ wählen, Einfg neue Position, Strg+D duplizieren, Entf entfernen, Strg+Z rückgängig, Strg+S speichern.</p>
      </aside>
    );
  }
  const pfadText = f!.pfad.map((a) => `${a.oz} ${a.kurztext}`).join(' › ');

  return (
    <aside className="ava-panel">
      <div className="ava-panel-kopf">
        <span className="ava-chip">{el.art === 'position' ? 'Position' : el.art === 'abschnitt' ? 'Abschnitt' : (el as Hinweis).vorbemerkung ? 'Vorbemerkung' : 'Hinweis'}</span>
        {pfadText && <span className="muted small-text">{pfadText}</span>}
      </div>
      {el.art !== 'hinweis' && (
        <Feld label="OZ" hinweis={el.art === 'position' ? `Stellen nach der Maske: ${lv.ozMaske.position.stellen}` : undefined}>
          <TextEingabe wert={el.oz} onChange={(oz) => setze<Position | Abschnitt>({ oz })} className="ava-oz-eingabe" />
        </Feld>
      )}
      <Feld label={el.art === 'position' ? 'Kurztext' : el.art === 'abschnitt' ? 'Bezeichnung' : 'Überschrift'}>
        <TextEingabe wert={el.kurztext} onChange={(kurztext) => setze({ kurztext })} />
      </Feld>
      {el.art === 'position' && <PositionFelder pos={el} setze={setze} nurAslv={nurAslv} />}
      {el.art === 'hinweis' && (
        <label className="ava-check">
          <input type="checkbox" checked={!!el.vorbemerkung} onChange={(e) => setze<Hinweis>({ vorbemerkung: e.target.checked })} /> Vorbemerkung (vor der Gliederung)
        </label>
      )}
      {el.art === 'abschnitt' && <AbschnittInfo a={el} />}
      <div className="ava-feld ava-feld-breit">
        <span className="ava-feld-label">{el.art === 'position' ? 'Langtext' : 'Text'}</span>
        <Langtext key={el.id} wert={el.langtext} onChange={(langtext) => setze({ langtext })} />
      </div>
      {el.art === 'position' && (
        <div className="button-row">
          <button className="small" onClick={() => setBibliothek(true)} title="Kurz- und Langtext aus den Vorlagetexten übernehmen">
            Text aus Vorlage …
          </button>
          <button
            className="small"
            onClick={async () => {
              try {
                const gruppe = lv.kopf.bezeichnung.replace(/^G\s*\d+\s*/i, '') || 'Allgemein';
                await vorlagenAendern((v) => [...v, vorlageAusPosition(el, gruppe)]);
                await meldung('Als Vorlage gespeichert', `„${el.kurztext}“ steht jetzt in den Vorlagetexten (Gruppe „${gruppe}“).`);
              } catch (e) {
                await meldung('Vorlage nicht gespeichert', 'Die Vorlagetexte ließen sich nicht schreiben.', e);
              }
            }}
            title="Diese Position in die Vorlagetexte des Büros aufnehmen"
          >
            Als Vorlage speichern
          </button>
        </div>
      )}
      {bibliothek && el.art === 'position' && (
        <Textbibliothek
          ersetzen
          onClose={() => setBibliothek(false)}
          onUebernehmen={(v) => setze<Position>({ kurztext: v.kurztext, langtext: v.langtext, ...(v.einheit ? { einheit: v.einheit } : {}), ...(v.kostengruppe ? { kostengruppe: v.kostengruppe } : {}) })}
        />
      )}
    </aside>
  );
}

function PositionFelder({ pos, setze, nurAslv }: { pos: Position; setze: (p: Partial<Position>) => void; nurAslv: boolean }) {
  const offen = useAva((s) => s.lv)!;
  const gb = summen(offen.lv).positionen.get(pos.id)?.get(0);
  const kgs = [...new Set(collectKg(offen.lv.elemente))].sort();
  return (
    <>
      <div className="ava-feld-reihe">
        <Feld label="Menge">
          <ZahlEingabe wert={pos.menge} onChange={(menge) => setze({ menge })} />
        </Feld>
        <Feld label="Einheit">
          <TextEingabe wert={pos.einheit} onChange={(einheit) => setze({ einheit, ...(/^(h|std\.?)$/i.test(einheit.trim()) ? { stundenlohn: true } : {}) })} liste="ava-einheiten" />
          <datalist id="ava-einheiten">
            {EINHEITEN.map((e) => (
              <option key={e} value={e} />
            ))}
          </datalist>
        </Feld>
        <Feld label="EP Kostenansatz">
          <ZahlEingabe wert={pos.preise['0']?.ep ?? null} stellen={2} onChange={(ep) => setze({ preise: { ...pos.preise, '0': { ...pos.preise['0'], ep } } })} />
        </Feld>
      </div>
      <div className="ava-feld-reihe">
        <Feld label="Art der Position" hinweis={POSITIONSARTEN.find((a) => a.id === pos.positionsart)?.text}>
          <select value={pos.positionsart} onChange={(e) => setze({ positionsart: e.target.value as PositionsArt })}>
            {POSITIONSARTEN.map((a) => (
              <option key={a.id} value={a.id} disabled={nurAslv && a.nurEigen && a.id !== pos.positionsart} title={nurAslv && a.nurEigen ? 'Nur im eigenen LV-Format – die LV-Datei kennt nur Normal- und Bedarfspositionen' : a.text}>
                {a.name}
                {nurAslv && a.nurEigen ? ' (nur eigenes Format)' : ''}
              </option>
            ))}
          </select>
        </Feld>
        <Feld label="Kostengruppe (DIN 276)">
          <TextEingabe wert={pos.kostengruppe} onChange={(kostengruppe) => setze({ kostengruppe: kostengruppe.trim() || undefined })} liste="ava-kg" />
          <datalist id="ava-kg">
            {kgs.map((k) => (
              <option key={k} value={k} />
            ))}
          </datalist>
        </Feld>
        <Feld label="Nachtrag" hinweis="0 = Hauptauftrag">
          <ZahlEingabe wert={pos.nachtrag ?? 0} onChange={(n) => setze({ nachtrag: n ? Math.round(n) : undefined })} />
        </Feld>
      </div>
      <div className="ava-panel-summe">
        Gesamtbetrag Kostenansatz: <strong>{gb !== undefined ? euro(gb) : '—'}</strong>
      </div>
    </>
  );
}

function collectKg(el: LvElement[]): string[] {
  return el.flatMap((e) => (e.art === 'abschnitt' ? collectKg(e.kinder) : e.art === 'position' && e.kostengruppe ? [e.kostengruppe] : []));
}

function AbschnittInfo({ a }: { a: Abschnitt }) {
  const offen = useAva((s) => s.lv)!;
  const s = summen(offen.lv).abschnitte.get(a.id);
  const anzahl = (function zaehle(el: LvElement[]): number {
    return el.reduce((n, e) => n + (e.art === 'position' ? 1 : e.art === 'abschnitt' ? zaehle(e.kinder) : 0), 0);
  })(a.kinder);
  return (
    <div className="ava-panel-summe">
      {anzahl} Position(en) · Summe Kostenansatz: <strong>{euro(s?.get(0) ?? 0)}</strong>
    </div>
  );
}
