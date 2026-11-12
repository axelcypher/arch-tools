/**
 * Formularangaben und Antragsmerkmale abgleichen (U-05): Kästchen wie „Gebäudeklasse 3“ stehen im Formular und als
 * Antragsmerkmal. Die App
 * - belegt leere Kästchen aus dem Merkmal vor (nur, wenn in der Gruppe noch nichts angekreuzt ist; nie überschreiben)
 *   – als ein Schritt im Verlauf („Aus Antragsmerkmal vorbelegt“), am Feld gekennzeichnet, rückgängig zu machen;
 * - meldet Abweichungen (plausibel.ts);
 * - bietet beim Ankreuzen an, den Wert als Antragsmerkmal zu übernehmen (mit Rückfrage).
 * Ein vorbelegtes Kreuz ist eine Erklärung der Entwurfsverfassenden – deshalb sichtbar als Vorschlag gekennzeichnet.
 */
import { useEffect, useMemo } from 'react';
import { bestaetigen } from '@core/ui/Rueckfrage';
import type { Feld } from './forma/felder';
import { merkmalFestlegen, merkmalWerteVon, useMerkmalWerte } from './merkmalWerte';
import { profilSchluessel } from './profil';
import type { OffenesFormular } from './store';
import { bearbeitungGesperrt, eingabeAnbindung, useFormulare, wertVon } from './store';
import { PRUEFREGELN } from './vorgaben/pruefregeln';

/** Titel des Verlaufsschritts der Vorbelegung (daran erkennt die App vorbelegte Kästchen) */
export const VORBELEGT = 'Aus Antragsmerkmal vorbelegt';

const regelnVon = (o: Pick<OffenesFormular, 'formular' | 'name'>) => PRUEFREGELN[profilSchluessel(o.formular, o.name)];

/** Kästchen, die aus den Merkmalen vorzubelegen sind: je Merkmal das Kästchen seines Werts, wenn die Gruppe leer ist */
export function vorbelegung(o: OffenesFormular, merkmale: Record<string, string>): { feld: Feld; wert: boolean }[] {
  const nach = new Map(o.felder.flat().map((f) => [f.schluessel, f]));
  const out: { feld: Feld; wert: boolean }[] = [];
  for (const [merkmal, map] of Object.entries(regelnVon(o)?.merkmalFelder ?? {})) {
    const ziel = nach.get(map[merkmale[merkmal] ?? ''] ?? '');
    if (!ziel || ziel.berechnet) continue;
    const gruppe = Object.values(map).flatMap((s) => (nach.has(s) ? [nach.get(s)!] : []));
    if (gruppe.some((f) => wertVon(o, f) === true)) continue;
    out.push({ feld: ziel, wert: true });
  }
  return out;
}

/** Beim Öffnen und wenn sich ein Merkmal ändert: leere Kästchen vorbelegen (nicht bei gesperrten Formularen) */
export function useVorbelegung(offen: OffenesFormular | null) {
  const merkmale = useMerkmalWerte(offen);
  const regeln = offen ? regelnVon(offen) : undefined;
  const relevant = JSON.stringify(Object.keys(regeln?.merkmalFelder ?? {}).map((m) => merkmale[m] ?? ''));
  useEffect(() => {
    const o = useFormulare.getState().offen;
    if (!o || !regeln?.merkmalFelder || bearbeitungGesperrt(o) || o.sperre.art === 'fremd') return;
    const werte = vorbelegung(o, merkmalWerteVon(o));
    if (werte.length) useFormulare.getState().werteSetzen(werte, VORBELEGT);
    // nur beim Öffnen eines Formulars und bei geänderten Merkmalen – nicht nach jeder Eingabe
  }, [offen?.pfad, offen?.projekt?.root, regeln, relevant]); // eslint-disable-line react-hooks/exhaustive-deps
}

/** Vorbelegte Kästchen: zuletzt durch die Vorbelegung gesetzt und noch angekreuzt */
export function useVorbelegt(offen: OffenesFormular): Set<string> {
  return useMemo(() => {
    const letzte = new Map<string, string | undefined>();
    for (const s of offen.verlauf.schritte.slice(0, offen.verlauf.position)) for (const a of s.aenderungen) letzte.set(a.feld, s.titel);
    const nach = new Map(offen.felder.flat().map((f) => [f.schluessel, f]));
    return new Set([...letzte].filter(([k, t]) => t === VORBELEGT && nach.has(k) && wertVon(offen, nach.get(k)!) === true).map(([k]) => k));
  }, [offen]);
}

/** Umgekehrt: eine Gebäudeklasse angekreuzt, die nicht dem Merkmal entspricht – als Antragsmerkmal übernehmen? */
eingabeAnbindung.nachEingabe = (o, feld, wert) => {
  if (wert !== true) return;
  for (const [merkmal, map] of Object.entries(regelnVon(o)?.merkmalFelder ?? {})) {
    const v = Object.entries(map).find(([, s]) => s === feld.schluessel)?.[0];
    if (!v) continue;
    const ist = merkmalWerteVon(o)[merkmal];
    if (ist === v) continue;
    const wo = o.projekt ? 'im Projekt' : 'für diese Datei';
    const text = ist
      ? `${wo[0].toUpperCase()}${wo.slice(1)} ist „${merkmal} ${ist}“ festgelegt. Mit „Übernehmen“ gilt ${merkmal} ${v} – die Bedingungen der Formulare richten sich danach.`
      : `${merkmal} ist ${wo} noch nicht festgelegt. Mit „Übernehmen“ gilt ${merkmal} ${v} – die Bedingungen der Formulare richten sich danach.`;
    void bestaetigen(`${merkmal} ${v} als Antragsmerkmal übernehmen?`, text, 'Übernehmen').then((ok) => {
      if (ok) void merkmalFestlegen(o, merkmal, v);
    });
  }
};
