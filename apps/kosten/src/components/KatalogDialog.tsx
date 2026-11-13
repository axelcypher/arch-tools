import { useState } from 'react';
import { pickFile, saveTextFile } from '@core/platform/files';
import { logger } from '@core/platform/log';
import { safeFileName } from '@core/ui/ExcelDialog';
import { kgName } from '../din276';
import type { Katalog } from '../katalog';
import { eintragAusPosition, gespeicherterKatalog, katalogCsv, katalogJson, katalogSpeichern, leseKatalog, positionAusEintrag } from '../katalog';
import { MENGEN_INFO } from '../mengen';
import { datumAnzeige } from '../datum';
import type { MengenBezug } from '../mengen';
import { addPositionen, setKosten, useKosten } from '../store';
import { Modal } from '@core/ui/Dialog';
import { bestaetigen } from '@core/ui/Rueckfrage';

const log = logger('katalog');

const bezugKurz = (b: string, einheit?: string) =>
  b === 'pauschal' ? 'psch' : b === 'prozent' ? '%' : b === 'menge' ? (einheit ?? 'Stk') : `${MENGEN_INFO[b as MengenBezug].einheit} ${MENGEN_INFO[b as MengenBezug].kurz}`;
const wert = (v: number | undefined) => (v === undefined ? '' : v.toLocaleString('de-DE', { maximumFractionDigits: 2 }));

/**
 * Kennwertkatalog: laden (JSON/CSV), als Datei speichern, aus den Positionen des Projekts erstellen
 * und Einträge als Positionen übernehmen.
 */
export function KatalogDialog({ onClose }: { onClose: () => void }) {
  const [katalog, setKatalog] = useState<Katalog | null>(() => gespeicherterKatalog());
  const [auswahl, setAuswahl] = useState<Set<number>>(new Set());
  const [fehler, setFehler] = useState<string | null>(null);
  const [suche, setSuche] = useState('');
  const project = useKosten((s) => s.project);

  const setzen = (k: Katalog | null) => {
    setKatalog(k);
    setAuswahl(new Set());
    setFehler(null);
    if (!katalogSpeichern(k)) setFehler('Der Katalog ist zu groß für den Browserspeicher – er gilt nur bis zum Schließen.');
  };

  const laden = async () => {
    const f = await pickFile('.json,.csv,application/json,text/csv');
    if (!f) return;
    try {
      const k = leseKatalog(await f.text(), f.name);
      if (katalog && !(await bestaetigen('Katalog ersetzen?', `Der hinterlegte Katalog „${katalog.name}“ wird durch „${k.name}“ ersetzt.`, 'Ersetzen', true))) return;
      setzen(k);
      log.info(`Kennwertkatalog geladen: ${k.name}`, { eintraege: k.eintraege.length });
    } catch (e) {
      setFehler(e instanceof Error ? e.message : String(e));
    }
  };

  const speichern = async (art: 'csv' | 'json') => {
    if (!katalog) return;
    const name = safeFileName(katalog.name);
    try {
      await saveTextFile(
      art === 'csv'
        ? { defaultName: `${name}.csv`, contents: katalogCsv(katalog), filterName: 'CSV (Excel)', extension: 'csv', mime: 'text/csv' }
        : { defaultName: `${name}.json`, contents: katalogJson(katalog), filterName: 'Kennwertkatalog', extension: 'json', mime: 'application/json' },
      );
    } catch (e) {
      log.error('Katalog speichern fehlgeschlagen', e instanceof Error ? e.message : String(e));
      setFehler(`Der Katalog ließ sich nicht speichern: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const ausProjekt = async () => {
    const k = project.kosten;
    if (!k?.positionen.length) return;
    if (katalog && !(await bestaetigen('Katalog ersetzen?', `Der hinterlegte Katalog „${katalog.name}“ wird durch die Kennwerte dieses Projekts ersetzt.`, 'Ersetzen', true))) return;
    setzen({
      name: k.katalog?.name ?? `Kennwerte ${project.name}`,
      quelle: k.katalog?.quelle ?? `Projekt ${project.name}`,
      stand: k.katalog?.stand ?? (k.datum ? datumAnzeige(k.datum) : undefined),
      ...(k.indexBasis !== undefined ? { index: k.indexBasis } : {}),
      eintraege: k.positionen.map(eintragAusPosition),
    });
  };

  const uebernehmen = (welche: Set<number> = auswahl) => {
    if (!katalog || !welche.size) return;
    const neu = [...welche].sort((a, b) => a - b).map((i) => positionAusEintrag(katalog.eintraege[i], katalog));
    useKosten.getState().update((p) => {
      let q = addPositionen(p, neu);
      const k = q.kosten!;
      q = setKosten(q, {
        katalog: { name: katalog.name, ...(katalog.quelle ? { quelle: katalog.quelle } : {}), ...(katalog.stand ? { stand: katalog.stand } : {}) },
        ...(k.indexBasis === undefined && katalog.index !== undefined ? { indexBasis: katalog.index } : {}),
      });
      return q;
    });
    onClose();
  };

  // Suche nach Kostengruppe (Anfang) oder Bezeichnung; „alle“ bezieht sich auf die gefundenen Einträge
  const s = suche.trim().toLowerCase();
  const treffer = katalog ? katalog.eintraege.map((e, i) => ({ e, i })).filter(({ e }) => !s || e.kg.startsWith(s) || e.bezeichnung.toLowerCase().includes(s) || kgName(e.kg).toLowerCase().includes(s)) : [];
  const alle = treffer.map(({ i }) => i);
  const alleGewaehlt = alle.length > 0 && alle.every((i) => auswahl.has(i));
  const toggle = (i: number) => {
    const s = new Set(auswahl);
    if (s.has(i)) s.delete(i);
    else s.add(i);
    setAuswahl(s);
  };

  return (
    <Modal titel="Kennwertkatalog" breit onClose={onClose}>
      <h3>Kennwertkatalog</h3>
      <p className="muted small-text">
        Eigene Kennwerte als Datei (JSON oder CSV aus Excel). Der zuletzt geladene Katalog bleibt in der App hinterlegt; übernommene Kennwerte stehen mit Quelle im Projekt.
      </p>
      <details className="ko-format small-text">
        <summary>Dateiformat</summary>
        <p className="muted">
          CSV mit Semikolon und Dezimalkomma, Spalten <code>KG; Bezeichnung; Bezug; Grundlage; von; Mittel; bis; Bemerkung</code>, davor optional die Zeilen <code># Name:</code>,{' '}
          <code># Quelle:</code>, <code># Stand:</code> und <code># Index:</code>. Bezug als Kürzel (BGF, AWF …), „psch“ oder „%“ (dann Grundlage, z. B. „300 + 400“); ein anderer Text gilt
          als eigene Einheit.
        </p>
      </details>
      <div className="button-row">
        <button className="small" onClick={laden}>
          Katalog laden …
        </button>
        <button className="small" onClick={() => void ausProjekt()} disabled={!project.kosten?.positionen.length} title="Kennwerte der Positionen dieses Projekts als Katalog für das nächste Projekt">
          Aus Projektpositionen erstellen
        </button>
        {katalog && (
          <>
            <button className="small" onClick={() => void speichern('csv')}>
              Als CSV speichern …
            </button>
            <button className="small" onClick={() => void speichern('json')}>
              Als JSON speichern …
            </button>
            <button
              className="small danger"
              onClick={async () => {
                if (await bestaetigen('Katalog entfernen?', `Der hinterlegte Katalog „${katalog.name}“ wird aus der App entfernt. Bereits übernommene Positionen bleiben im Projekt.`, 'Entfernen', true)) setzen(null);
              }}
            >
              Katalog entfernen
            </button>
          </>
        )}
      </div>
      {fehler && (
        <p className="warning" role="alert">
          {fehler}
        </p>
      )}
      {katalog ? (
        <>
          <p className="small-text">
            <strong>{katalog.name}</strong>
            {katalog.quelle && ` · Quelle: ${katalog.quelle}`}
            {katalog.stand && ` · Stand: ${katalog.stand}`}
            {katalog.index !== undefined && ` · Baupreisindex ${katalog.index.toLocaleString('de-DE')}`} · {katalog.eintraege.length} Einträge
          </p>
          <input
            type="search"
            className="ko-katalog-suche"
            value={suche}
            autoFocus
            aria-label="Katalog durchsuchen"
            placeholder="Suchen: Kostengruppe oder Bezeichnung"
            onChange={(ev) => setSuche(ev.target.value)}
            onKeyDown={(ev) => {
              // Enter: bei genau einem Treffer diesen übernehmen, sonst die Auswahl
              if (ev.key !== 'Enter') return;
              ev.preventDefault();
              if (!auswahl.size && treffer.length === 1) uebernehmen(new Set([treffer[0].i]));
              else uebernehmen();
            }}
          />
          <div className="tbl-wrap ko-katalog">
            <table className="ko-table">
              <thead>
                <tr>
                  <th>
                    <input
                      type="checkbox"
                      checked={alleGewaehlt}
                      aria-label={s ? 'Alle gefundenen Einträge auswählen' : 'Alle Einträge auswählen'}
                      onChange={(ev) => {
                        const n = new Set(auswahl);
                        for (const i of alle) if (ev.target.checked) n.add(i);
                        else n.delete(i);
                        setAuswahl(n);
                      }}
                    />
                  </th>
                  <th>KG</th>
                  <th>Bezeichnung</th>
                  <th>Bezug</th>
                  <th className="num">von</th>
                  <th className="num">Mittel</th>
                  <th className="num">bis</th>
                </tr>
              </thead>
              <tbody>
                {treffer.map(({ e, i }) => (
                  <tr key={i} onClick={() => toggle(i)} onDoubleClick={() => uebernehmen(new Set([i]))} className={auswahl.has(i) ? 'selected' : ''} title="Klick: auswählen · Doppelklick: sofort übernehmen">
                    <td>
                      <input type="checkbox" checked={auswahl.has(i)} aria-label={`KG ${e.kg} ${e.bezeichnung} auswählen`} onChange={() => toggle(i)} onClick={(ev) => ev.stopPropagation()} />
                    </td>
                    <td>{e.kg}</td>
                    <td>
                      {e.bezeichnung}
                      {e.bezeichnung !== kgName(e.kg) && kgName(e.kg) && <div className="muted small-text">{kgName(e.kg)}</div>}
                    </td>
                    <td>
                      {bezugKurz(e.bezug, e.einheit)}
                      {e.basis && ` von ${e.basis.join(' + ')}`}
                    </td>
                    <td className="num">{wert(e.von)}</td>
                    <td className="num">{wert(e.mittel)}</td>
                    <td className="num">{wert(e.bis)}</td>
                  </tr>
                ))}
                {!treffer.length && (
                  <tr>
                    <td colSpan={7} className="muted">
                      Kein Eintrag passt zu „{suche}“.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <p className="muted small-text">Noch kein Katalog hinterlegt. Einen laden oder aus den Positionen eines fertigen Projekts erstellen.</p>
      )}
      <div className="dialog-buttons">
        {katalog && <span className="muted small-text ko-katalog-info">{auswahl.size ? `${auswahl.size} ausgewählt` : 'Einträge ankreuzen oder doppelklicken'}</span>}
        <button onClick={onClose}>Schließen</button>
        <button className="primary" onClick={() => uebernehmen()} disabled={!auswahl.size}>
          Als Positionen übernehmen{auswahl.size ? ` (${auswahl.size})` : ''}
        </button>
      </div>
    </Modal>
  );
}
