/**
 * Projektdatei des Originalprogramms (.asproj): unkomprimiertes XML mit den Projektangaben und je LV-Datei
 * (Dateiname, ohne Pfad) den zwischengespeicherten Summen – Kostenansatz, Auftrag (OrderID 0), Auftrag mit
 * Nachträgen (OrderID 2147483647), abgerechnet und gezahlt. Die App liest sie (Projekt öffnen, Summen zum
 * Abgleich) und frischt auf Wunsch die Summen eines LV auf; alles andere bleibt Byte für Byte erhalten.
 *
 * Im Büro liegen die LV-Dateien in den Gewerkeordnern, nicht neben der .asproj – gesucht wird deshalb nach dem
 * Dateinamen im ganzen Projekt.
 */

import type { XElement } from './xmlDom';
import { attr, attrSetzen, elemente, erstes, kinderSetzen, neuesElement, tiefeVon, xmlParsen, xmlSchreiben } from './xmlDom';

export interface AsprojLv {
  /** Dateiname der LV-Datei (ohne Ordner) */
  datei: string;
  bezeichnung: string;
  mwst: number | null;
  kostenansatzNetto: number | null;
  auftragNetto: number | null;
  auftragBrutto: number | null;
  /** Auftrag einschließlich Nachträgen */
  gesamtNetto: number | null;
  gesamtBrutto: number | null;
  abgerechnetNetto: number | null;
  abgerechnetBrutto: number | null;
  gezahltNetto: number | null;
  gezahltBrutto: number | null;
  angelegt?: string;
  geaendert?: string;
}

export interface Asproj {
  name: string;
  bezeichnung: string;
  auftraggeber: string;
  ersteller: string;
  waehrung: string;
  mwst: number | null;
  kostengliederung: string;
  lvs: AsprojLv[];
}

const z = (s: string | undefined): number | null => {
  if (s === undefined || s === '') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};

function ps(el: XElement | undefined): Map<string, string> {
  const m = new Map<string, string>();
  for (const p of elemente(erstes(el, 'ParameterList'), 'Parameter')) m.set(attr(p, 'Name') ?? '', attr(p, 'Value') ?? '');
  return m;
}

export function asprojLesen(bytes: Uint8Array): Asproj {
  const xml = new TextDecoder('utf-8').decode(bytes);
  const d = xmlParsen(xml);
  const projekt = erstes(d.wurzel, 'Project');
  if (d.wurzel.name !== 'AVAPLANProject' || !projekt) throw new Error('Keine Projektdatei des LV-Programms (.asproj).');
  const p = ps(projekt);
  const lvs: AsprojLv[] = elemente(erstes(projekt, 'ProjLVList'), 'ProjLVItem').map((item) => {
    const lv = erstes(item, 'ProjLV');
    const lp = ps(lv);
    const orders = elemente(erstes(erstes(lv, 'Ordering'), 'OrderList'), 'Order');
    const o = (id: string) => ps(orders.find((x) => attr(x, 'OrderID') === id));
    const b0 = ps(elemente(erstes(lv, 'BieterList'), 'Bieter').find((b) => attr(b, 'BieterID') === '0'));
    const sum = ps(erstes(lv, 'Summary'));
    return {
      datei: attr(item, 'FileName') ?? '',
      bezeichnung: lp.get('Text1') ?? '',
      mwst: z(lp.get('LVMwSt')),
      kostenansatzNetto: z(b0.get('GB')),
      auftragNetto: z(o('0').get('GB')),
      auftragBrutto: z(o('0').get('GBBrutto')),
      gesamtNetto: z(o('2147483647').get('GB')),
      gesamtBrutto: z(o('2147483647').get('GBBrutto')),
      abgerechnetNetto: z(sum.get('Bill_Acc_GB')),
      abgerechnetBrutto: z(sum.get('Bill_Acc_GB_brutto')),
      gezahltNetto: z(sum.get('Pay_Acc_GBPP_netto')),
      gezahltBrutto: z(sum.get('Pay_Acc_GBPP_brutto')),
      angelegt: attr(item, 'CreateDate'),
      geaendert: attr(item, 'ChangeDate'),
    };
  });
  return {
    name: p.get('ProjName') ?? '',
    bezeichnung: (p.get('ProjBez') ?? '').trim(),
    auftraggeber: (p.get('ProjAGAdr') ?? '').trim(),
    ersteller: (p.get('ProjLVErsteller') ?? '').trim(),
    waehrung: p.get('ProjWaehrung') ?? 'EUR',
    mwst: z(p.get('ProjMwSt')),
    kostengliederung: p.get('KGRTyp') ?? '',
    lvs,
  };
}

export interface AsprojSummen {
  kostenansatzNetto?: number;
  kostenansatzBrutto?: number;
  auftragNetto?: number;
  auftragBrutto?: number;
  gesamtNetto?: number;
  gesamtBrutto?: number;
}

const zahlText = (n: number) => String(Number(n.toFixed(6)));

/**
 * Summen eines LV in der .asproj auffrischen (nach dem Speichern des LV). Ändert nur diese Werte; ist alles
 * schon so, kommt die Datei unverändert zurück.
 */
export function asprojSummenSetzen(bytes: Uint8Array, datei: string, werte: AsprojSummen, jetzt: string): Uint8Array {
  const xml = new TextDecoder('utf-8', { ignoreBOM: true }).decode(bytes);
  const d = xmlParsen(xml);
  const projekt = erstes(d.wurzel, 'Project');
  const item = elemente(erstes(projekt, 'ProjLVList'), 'ProjLVItem').find((i) => (attr(i, 'FileName') ?? '').toLowerCase() === datei.toLowerCase());
  if (!item) return bytes;
  const lv = erstes(item, 'ProjLV');
  if (!lv) return bytes;
  const setze = (el: XElement | undefined, name: string, wert: number | undefined): boolean => {
    if (!el || wert === undefined) return false;
    let liste = erstes(el, 'ParameterList');
    if (!liste) return false;
    const p = elemente(liste, 'Parameter').find((x) => attr(x, 'Name') === name);
    if (p) {
      const alt = z(attr(p, 'Value'));
      if (alt !== null && Math.abs(alt - wert) < 0.005) return false;
      return attrSetzen(p, 'Value', zahlText(wert));
    }
    liste = liste ?? neuesElement('ParameterList');
    kinderSetzen(liste, [...elemente(liste), neuesElement('Parameter', [['Name', name], ['Value', zahlText(wert)]])], Math.max(0, tiefeVon(d.wurzel, liste)), d.zeilenende);
    return true;
  };
  const b0 = elemente(erstes(lv, 'BieterList'), 'Bieter').find((b) => attr(b, 'BieterID') === '0');
  const orders = elemente(erstes(erstes(lv, 'Ordering'), 'OrderList'), 'Order');
  let a = setze(b0, 'GB', werte.kostenansatzNetto);
  a = setze(b0, 'GBBrutto', werte.kostenansatzBrutto) || a;
  const o0 = orders.find((o) => attr(o, 'OrderID') === '0');
  const om = orders.find((o) => attr(o, 'OrderID') === '2147483647');
  a = setze(o0, 'GB', werte.auftragNetto) || a;
  a = setze(o0, 'GBBrutto', werte.auftragBrutto) || a;
  a = setze(om, 'GB', werte.gesamtNetto) || a;
  a = setze(om, 'GBBrutto', werte.gesamtBrutto) || a;
  if (!a) return bytes;
  attrSetzen(item, 'ChangeDate', jetzt);
  attrSetzen(lv, 'ChangeDate', jetzt);
  return new TextEncoder().encode(xmlSchreiben(d));
}
