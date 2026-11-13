import { useState } from 'react';
import { Modal } from '@core/ui/Dialog';
import { bestaetigen, meldung } from '@core/ui/Rueckfrage';
import { openFileWithPath, saveBinaryFile } from '@core/platform/files';
import { logger } from '@core/platform/log';
import type { GaebPhase } from '../../format/gaeb';
import { angebotUebernehmen, GAEB_PHASEN, gaebLesen, gaebPruefen, gaebSchreiben, gleicherBieter } from '../../format/gaeb';
import { vollerPfad } from '../../dateien';
import { ozDubletten } from '../../lv/modell';
import type { Lv } from '../../lv/modell';
import { summen } from '../../lv/rechnen';
import { gewerkOrdner, useAva } from '../../store';

const log = logger('gaeb');

/** Text für doppelte Ordnungszahlen (leer = keine) */
export function dublettenText(lv: Lv): string {
  const d = ozDubletten(lv);
  if (!d.length) return '';
  return `Diese Ordnungszahlen kommen mehrfach vor: ${d
    .slice(0, 12)
    .map((x) => `${x.oz} (${x.ids.length}×)`)
    .join(', ')}${d.length > 12 ? ' …' : ''}.`;
}
export const GAEB_ENDUNGEN = ['x81', 'x82', 'x83', 'x84', 'x85', 'x86', 'xml'];

/** LV als GAEB-XML exportieren: Phase wählen, bei Angebot/Auftrag den Bieter */
export function GaebExportDialog({ onClose }: { onClose: () => void }) {
  const offen = useAva((s) => s.lv)!;
  const projekt = useAva((s) => s.projekt)!;
  const lv = offen.lv;
  const [dp, setDp] = useState<GaebPhase>(83);
  // Vorgabe: Auftragnehmer, sonst der erste echte Bieter (nicht der Kostenansatz)
  const [bieterId, setBieterId] = useState<number>(lv.auftrag?.bieterId ?? lv.bieter.find((b) => b.id !== 0)?.id ?? lv.bieter[0]?.id ?? 0);
  const phase = GAEB_PHASEN.find((p) => p.dp === dp)!;
  const pruefung = gaebPruefen(lv);
  const ohnePreise = phase.preise && !(summen(lv).bieter.get(bieterId)?.mitPreis ?? 0);
  const exportieren = async () => {
    if (ohnePreise && !(await bestaetigen('Keine Preise', `„${lv.bieter.find((b) => b.id === bieterId)?.name ?? 'Bieter'}“ hat keine Einheitspreise – die Datei enthält dann keine Preise. Trotzdem exportieren?`, 'Trotzdem exportieren'))) return;
    try {
      const daten = gaebSchreiben(lv, { dp, bieterId, projektNummer: projekt.meta.projektcode, projektName: projekt.meta.vorhaben || projekt.name });
      const g = gewerkOrdner(projekt, offen.gewerk);
      const name = `${offen.datei.name.replace(/\.(aslv|oalv)$/i, '')}.X${dp}`;
      if (await saveBinaryFile({ defaultName: name, defaultDir: g ? vollerPfad(projekt.ordner, g.pfad) : projekt.ordner, data: daten, filterName: `GAEB DA XML (X${dp})`, extension: `X${dp}`, moreExtensions: [`x${dp}`], mime: 'application/xml' })) onClose();
    } catch (e) {
      log.error('GAEB-Export fehlgeschlagen', e);
      await meldung('GAEB-Export fehlgeschlagen', String(e instanceof Error ? e.message : e), e);
    }
  };
  return (
    <Modal titel="GAEB-Export" onClose={onClose}>
      <h2>GAEB-Export (DA XML 3.3)</h2>
      <div className="ava-formular">
        <label className="ava-feld ava-feld-breit">
          <span className="ava-feld-label">Phase</span>
          <select value={dp} onChange={(e) => setDp(Number(e.target.value) as GaebPhase)}>
            {GAEB_PHASEN.map((p) => (
              <option key={p.dp} value={p.dp}>
                {p.name} – {p.text}
              </option>
            ))}
          </select>
        </label>
        {phase.preise && (
          <label className="ava-feld ava-feld-breit">
            <span className="ava-feld-label">Preise von</span>
            <select value={bieterId} onChange={(e) => setBieterId(Number(e.target.value))}>
              {lv.bieter.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                  {b.id === 0 ? ' (bepreistes LV)' : ''}
                  {lv.auftrag?.bieterId === b.id ? ' (Auftrag)' : ''}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      {pruefung.length > 0 && (
        <div className="warning">
          <strong>Vor dem Export prüfen</strong>
          <ul>
            {pruefung.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
          Das Programm der Bieter kann die Datei sonst ablehnen oder Preise falsch zuordnen.
        </div>
      )}
      {ohnePreise && <div className="warning-text small-text">Für diesen Bieter sind keine Einheitspreise erfasst.</div>}
      <div className="dialog-buttons">
        <button onClick={onClose}>Abbrechen</button>
        <button className="primary" onClick={() => void exportieren()}>
          Exportieren …
        </button>
      </div>
    </Modal>
  );
}

/** GAEB-Datei wählen und lesen; null bei Abbruch */
export async function gaebWaehlen(startOrdner?: string) {
  const d = await openFileWithPath({ filterName: 'GAEB DA XML', extensions: GAEB_ENDUNGEN, defaultDir: startOrdner });
  if (!d) return null;
  return { name: d.name, g: gaebLesen(d.bytes) };
}

/** Angebot (X84) eines Bieters ins geöffnete LV übernehmen – als neuer Bieter */
export async function angebotEinlesen(): Promise<number | null> {
  const { lv, projekt } = useAva.getState();
  if (!lv || !projekt) return null;
  try {
    const g = gewerkOrdner(projekt, lv.gewerk);
    const r = await gaebWaehlen(g ? vollerPfad(projekt.ordner, g.pfad) : projekt.ordner);
    if (!r) return null;
    const dubletten = dublettenText(lv.lv);
    if (dubletten && !(await bestaetigen('Doppelte Ordnungszahlen', `${dubletten}\n\nDie Preise des Angebots werden über die Ordnungszahl zugeordnet und landen dann in mehreren Positionen. Trotzdem einlesen?`, 'Trotzdem einlesen'))) return null;
    if (!r.g.preise.size) {
      await meldung('Keine Preise', `${r.name} enthält keine Einheitspreise (Phase X${r.g.dp}). Angebote kommen als X84.`);
      return null;
    }
    // dasselbe Angebot noch einmal eingelesen? Dann den vorhandenen Bieter ersetzen statt einen zweiten anzulegen
    const vorhanden = gleicherBieter(lv.lv, r.g);
    let ersetzen: number | undefined;
    if (vorhanden) {
      if (await bestaetigen('Bieter schon vorhanden', `„${vorhanden.name}“ steht schon im LV. Seine Einheitspreise durch die aus ${r.name} ersetzen? (Sonst wird ein weiterer Bieter angelegt.)`, 'Preise ersetzen')) ersetzen = vorhanden.id;
    }
    const u = angebotUebernehmen(lv.lv, r.g, ersetzen);
    useAva.getState().lvAendern(() => u.lv);
    await meldung(
      'Angebot übernommen',
      `${r.g.bieter?.name ?? 'Bieter'}: ${u.zugeordnet} Einheitspreis(e) übernommen.${u.ohneZuordnung.length ? `\n\nOhne passende Position im LV (OZ): ${u.ohneZuordnung.slice(0, 20).join(', ')}${u.ohneZuordnung.length > 20 ? ' …' : ''}` : ''}`,
    );
    return u.bieterId;
  } catch (e) {
    log.error('GAEB-Import fehlgeschlagen', e);
    await meldung('Angebot nicht gelesen', String(e instanceof Error ? e.message : e), e);
    return null;
  }
}
