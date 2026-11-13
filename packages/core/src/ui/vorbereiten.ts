import { VORBEREITEN_MS } from '../platform/rahmen';
import { logger } from '../platform/log';
import { fragen } from './Rueckfrage';

const log = logger('schliessen');

/**
 * Vor Schließen, Andocken, Herauslösen, Beenden oder Update-Neustart: ausstehendes Schreiben der App abwarten
 * (`vorbereiten`, z. B. schliessenVorbereiten bzw. vorbereitenImTab). Wird es nicht rechtzeitig fertig, fragt sie:
 * *Weiter warten* (Hauptknopf, Enter – wartet erneut), *Trotzdem <verb>* (Gefahr: die letzte Änderung kann fehlen) oder
 * *Abbrechen*. `verb`: was danach geschieht, klein, z. B. „schließen“, „andocken“, „neu starten“. true = weiter.
 */
export async function schreibenAbwarten(app: string, vorbereiten: () => Promise<boolean>, verb: string): Promise<boolean> {
  for (;;) {
    if (await vorbereiten()) return true;
    log.warn(`${app}: Schreiben nach ${VORBEREITEN_MS / 1000} s nicht fertig`);
    const a = await fragen({
      titel: `${app} speichert noch`,
      text: `Das Speichern dauert länger als ${VORBEREITEN_MS / 1000} Sekunden – womöglich ist das Netzlaufwerk langsam oder nicht erreichbar. Warten Sie, bis es fertig ist. Wenn Sie jetzt ${verb}, geht die letzte Änderung womöglich verloren.`,
      knoepfe: [
        { id: 'abbrechen', label: 'Abbrechen' },
        { id: 'trotzdem', label: `Trotzdem ${verb}`, art: 'danger' },
        { id: 'warten', label: 'Weiter warten', art: 'primary' },
      ],
    });
    if (a === 'trotzdem') return true;
    if (a !== 'warten') return false;
  }
}
