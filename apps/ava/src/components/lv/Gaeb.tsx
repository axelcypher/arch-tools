import { useState } from 'react';
import { Modal } from '@core/ui/Dialog';
import { meldung } from '@core/ui/Rueckfrage';
import { openFileWithPath, saveBinaryFile } from '@core/platform/files';
import { logger } from '@core/platform/log';
import type { GaebPhase } from '../../format/gaeb';
import { angebotUebernehmen, GAEB_PHASEN, gaebLesen, gaebSchreiben } from '../../format/gaeb';
import { vollerPfad } from '../../dateien';
import { gewerkOrdner, useAva } from '../../store';

const log = logger('gaeb');
export const GAEB_ENDUNGEN = ['x81', 'x82', 'x83', 'x84', 'x85', 'x86', 'xml'];

/** LV als GAEB-XML exportieren: Phase wählen, bei Angebot/Auftrag den Bieter */
export function GaebExportDialog({ onClose }: { onClose: () => void }) {
  const offen = useAva((s) => s.lv)!;
  const projekt = useAva((s) => s.projekt)!;
  const lv = offen.lv;
  const [dp, setDp] = useState<GaebPhase>(83);
  const [bieterId, setBieterId] = useState<number>(lv.auftrag?.bieterId ?? lv.bieter[0]?.id ?? 0);
  const phase = GAEB_PHASEN.find((p) => p.dp === dp)!;
  const exportieren = async () => {
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
                  {lv.auftrag?.bieterId === b.id ? ' (Auftrag)' : ''}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
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
    if (!r.g.preise.size) {
      await meldung('Keine Preise', `${r.name} enthält keine Einheitspreise (Phase X${r.g.dp}). Angebote kommen als X84.`);
      return null;
    }
    const u = angebotUebernehmen(lv.lv, r.g);
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
