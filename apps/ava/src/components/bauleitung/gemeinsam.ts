import { bueroName } from '@core/platform/konfig';
import { meldung } from '@core/ui/Rueckfrage';
import type { BerichtKopf } from '../../bauleitung/berichte';
import { emlBauen } from '../../abrechnung/mail';
import { useAva } from '../../store';

export function berichtKopf(): BerichtKopf {
  const { projekt, einstellungen } = useAva.getState();
  return { meta: projekt!.meta, projektName: projekt!.name, buero: einstellungen.deckblatt.buero || bueroName() };
}

/**
 * PDF im Ordner Bauleitung des Projekts ablegen (nie überschreibend – gibt es den Namen schon, mit „(2)“ …).
 * Liefert den Pfad relativ zum Projektordner.
 */
export async function berichtAblegen(name: string, pdf: Uint8Array, unterordner?: string): Promise<string> {
  const { projekt, einstellungen, fs } = useAva.getState();
  const ordner = [einstellungen.ablage.bauleitung, unterordner].filter(Boolean).join('/');
  const basis = name.replace(/\.pdf$/i, '').replace(/[\\/:*?"<>|]+/g, ' ').trim();
  for (let i = 1; i < 50; i++) {
    const pfad = `${ordner}/${basis}${i > 1 ? ` (${i})` : ''}.pdf`;
    if (await fs.anlegen(projekt!.ordner, pfad, pdf)) return pfad;
  }
  throw new Error(`${ordner}/${basis}.pdf: kein freier Dateiname`);
}

/** PDF zum Ansehen bzw. Drucken öffnen (Temp-Ordner) */
export async function pdfZeigen(name: string, pdf: Uint8Array) {
  try {
    await useAva.getState().fs.tempOeffnen(name.endsWith('.pdf') ? name : `${name}.pdf`, pdf);
  } catch (e) {
    await meldung('PDF ließ sich nicht öffnen', name, e);
  }
}

/** Mailentwurf mit PDF im Anhang */
export async function mitPdfMailen(o: { an: string[]; betreff: string; text: string; name: string; pdf: Uint8Array }) {
  try {
    const eml = emlBauen({ an: o.an, betreff: o.betreff, text: o.text, anhaenge: [{ name: o.name.endsWith('.pdf') ? o.name : `${o.name}.pdf`, daten: o.pdf }] });
    await useAva.getState().fs.mailEntwurf(o.name.replace(/\.pdf$/i, ''), eml);
  } catch (e) {
    await meldung('Mailentwurf nicht erstellt', String(e instanceof Error ? e.message : e), e);
  }
}

/** Abschnitt „ava“ ändern, Fehler als Meldung */
export function speichern(f: Parameters<ReturnType<typeof useAva.getState>['avaAendern']>[0]) {
  return useAva
    .getState()
    .avaAendern(f)
    .catch((e) => meldung('Nicht gespeichert', 'Die Projektdatei ließ sich nicht schreiben – die Eingabe ist nicht gesichert.', e));
}
