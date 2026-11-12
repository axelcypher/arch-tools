/**
 * Daten aktualisieren: Auto-Werte aus der Projektkarte in Formulare übernehmen – im offenen Formular (Dialog,
 * ungespeichert und rückgängig zu machen), in nicht geöffneten (Entwurf bzw. Datei mit Sperre) und nach dem
 * Speichern der Projektkarte für alle Unterlagen des Projekts (mit Rückfrage). Regeln siehe autofill.ts.
 */

import { create } from 'zustand';
import type { AutoWert, FormularZustand, Schritt } from './autofill';
import { aktualisierung, autoWerte, beimIgnorieren, nachUebernahme } from './autofill';
import { useAntrag } from './antragStore';
import { felderDerSeite } from './forma/felder';
import type { Feld } from './forma/felder';
import { parseFormular } from './forma/formular';
import type { Projektkarte } from './forma/projektkarte';
import type { FormularEintrag } from './projekte';
import { autofillAnbindung, autoWerteVon, entwurfVon, formularDatei, karteMitAenderungen, sperrAnbindung, useFormulare, wertVon } from './store';

/** Plan für ein Formular des Projekts */
export interface UnterlagenPlan {
  eintrag: FormularEintrag;
  /** das gerade geöffnete Formular (Werte gehen als ungespeicherte Eingaben hinein) */
  offen: boolean;
  schritte: Schritt[];
  auto: Map<string, AutoWert>;
  wert: (f: Feld) => string;
}

interface AktualisierenZustand {
  /** Dialog „Daten aktualisieren“ für das offene Formular */
  dialog: boolean;
  /** Rückfrage nach geänderten Projektdaten: was in welchen Unterlagen aktualisiert würde */
  unterlagen: UnterlagenPlan[] | null;
  laeuft: boolean;
  dialogOeffnen: () => void;
  dialogSchliessen: () => void;
  unterlagenSchliessen: () => void;
}

export const useAktualisieren = create<AktualisierenZustand>((set) => ({
  dialog: false,
  unterlagen: null,
  laeuft: false,
  dialogOeffnen: () => set({ dialog: true }),
  dialogSchliessen: () => set({ dialog: false }),
  unterlagenSchliessen: () => set({ unterlagen: null }),
}));

const zustandVon = (pfad: string): FormularZustand | undefined => useAntrag.getState().projektdatei?.felder?.[formularDatei(pfad)];
const text = (w: string | boolean | undefined) => (typeof w === 'string' ? w : '');

/** Projektkarte des gewählten Projekts (mit ungespeicherten Änderungen) – liest sie bei Bedarf */
async function projektkarte(): Promise<Projektkarte | null> {
  const f = useFormulare.getState();
  if (!f.karte) await f.karteLaden();
  const k = useFormulare.getState().karte;
  return k ? karteMitAenderungen(k) : null;
}

/* ---------- offenes Formular ---------- */

/** Was „Daten aktualisieren“ im offenen Formular ändern würde; null, solange die Projektkarte nicht gelesen ist */
export function planOffen(): { schritte: Schritt[]; auto: Map<string, AutoWert> } | null {
  const { offen, karte } = useFormulare.getState();
  if (!offen) return null;
  const auto = autoWerteVon(offen, karte);
  if (!auto) return null;
  return { schritte: aktualisierung(auto, (f) => text(wertVon(offen, f)), zustandVon(offen.pfad)), auto };
}

/** Gewählte Auto-Werte ins offene Formular übernehmen (ein Schritt im Verlauf) und den Zustand merken */
export function uebernehmenOffen(schritte: Schritt[], auto: Map<string, AutoWert>, titel = 'Daten aktualisiert') {
  const { offen, werteSetzen } = useFormulare.getState();
  if (!offen) return;
  const wert = (f: Feld) => text(wertVon(offen, f));
  const z = nachUebernahme(zustandVon(offen.pfad), schritte, auto, wert);
  if (schritte.length)
    werteSetzen(
      schritte.map((s) => ({ feld: s.feld, wert: s.neu })),
      `${titel} (${schritte.length})`,
    );
  void useAntrag.getState().zustaendeSetzen({ [formularDatei(offen.pfad)]: z });
}

/** „Manuelle Überschreibungen ignorieren“ für das offene Formular umschalten: an = Auto-Werte, aus = Überschreibungen zurück */
export function ignorierenSetzen(an: boolean) {
  const { offen, karte, werteSetzen } = useFormulare.getState();
  if (!offen) return;
  const alt = zustandVon(offen.pfad);
  const auto = autoWerteVon(offen, karte) ?? new Map();
  const felder = new Map(offen.felder.flat().map((f) => [f.schluessel, f]));
  const werte = beimIgnorieren(alt, an, auto).flatMap(({ schluessel, wert }) => {
    const feld = felder.get(schluessel);
    return feld && text(wertVon(offen, feld)) !== wert ? [{ feld, wert }] : [];
  });
  if (werte.length) werteSetzen(werte, an ? 'Manuelle Überschreibungen ignoriert' : 'Manuelle Überschreibungen wiederhergestellt');
  const z: FormularZustand = { felder: { ...alt?.felder } };
  if (an) z.ignorieren = true;
  void useAntrag.getState().zustaendeSetzen({ [formularDatei(offen.pfad)]: z });
}

export const ignoriert = (pfad: string) => !!zustandVon(pfad)?.ignorieren;

/* ---------- nicht geöffnete Formulare ---------- */

/** Plan für ein Formular des Projekts (geöffnet oder nicht); `alt` = Projektkarte vor einer Änderung */
export async function planFuer(eintrag: FormularEintrag, pk: Projektkarte, alt?: Projektkarte): Promise<UnterlagenPlan | null> {
  const s = useFormulare.getState();
  const { ds, projekt, offen } = s;
  if (!ds || !projekt) return null;
  const zustand = zustandVon(eintrag.pfad);
  if (offen && offen.projekt === projekt && offen.pfad === eintrag.pfad) {
    const auto = autoWerte(offen.formular, offen.felder, pk);
    const wert = (f: Feld) => text(wertVon(offen, f));
    const alteAuto = alt ? autoWerte(offen.formular, offen.felder, alt) : undefined;
    return { eintrag, offen: true, schritte: aktualisierung(auto, wert, zustand, alteAuto), auto, wert };
  }
  const bytes = await ds.lies(projekt.root, eintrag.pfad);
  if (!bytes) return null;
  const formular = parseFormular(bytes);
  const felder = formular.seiten.map((seite, i) => felderDerSeite(seite, i));
  const auto = autoWerte(formular, felder, pk);
  if (!auto.size) return { eintrag, offen: false, schritte: [], auto, wert: () => '' };
  const entwurf = entwurfVon(projekt, eintrag.pfad)?.aenderungen ?? {};
  const wert = (f: Feld) => text(f.schluessel in entwurf ? entwurf[f.schluessel] : f.original);
  const alteAuto = alt ? autoWerte(formular, felder, alt) : undefined;
  return { eintrag, offen: false, schritte: aktualisierung(auto, wert, zustand, alteAuto), auto, wert };
}

/** Vorgewählte Schritte eines Plans ausführen; liefert eine kurze Beschreibung des Ergebnisses */
export async function planAusfuehren(p: UnterlagenPlan): Promise<string> {
  const wahl = p.schritte.filter((s) => s.vorgewaehlt);
  const bleiben = p.schritte.length - wahl.length;
  const rest = bleiben ? `, ${bleiben} von Hand bzw. anders ausgefüllte bleiben` : '';
  if (p.offen) {
    uebernehmenOffen(wahl, p.auto);
    return `${p.eintrag.name}: ${wahl.length} Feld(er) eingetragen (noch nicht gespeichert)${rest}`;
  }
  const z = nachUebernahme(zustandVon(p.eintrag.pfad), wahl, p.auto, p.wert);
  if (!wahl.length) {
    await useAntrag.getState().zustaendeSetzen({ [formularDatei(p.eintrag.pfad)]: z });
    return `${p.eintrag.name}: nichts zu aktualisieren${rest}`;
  }
  const ergebnis = await useFormulare.getState().formularAendern(p.eintrag.pfad, Object.fromEntries(wahl.map((s) => [s.feld.schluessel, s.neu])));
  if (ergebnis === 'gesperrt') return `${p.eintrag.name}: anderswo geöffnet – nicht aktualisiert`;
  if (ergebnis === 'nurLesen') return `${p.eintrag.name}: lässt sich nicht verlustfrei schreiben – nicht aktualisiert`;
  if (ergebnis === 'eingereicht') return `${p.eintrag.name}: Antrag eingereicht und gesperrt – nicht aktualisiert`;
  await useAntrag.getState().zustaendeSetzen({ [formularDatei(p.eintrag.pfad)]: z });
  return `${p.eintrag.name}: ${wahl.length} Feld(er) aktualisiert${ergebnis === 'entwurf' ? ' (in den ungespeicherten Eingaben)' : ''}${rest}`;
}

/** „Daten aktualisieren“ für ein Formular aus dem Kontextmenü: geöffnet → Dialog, sonst gleich ausführen */
export async function formularAktualisieren(eintrag: FormularEintrag) {
  const s = useFormulare.getState();
  const sperre = sperrAnbindung.antrag(s.projekt);
  if (sperre) return s.setMeldung({ art: 'info', text: sperre });
  if (s.offen?.projekt === s.projekt && s.offen?.pfad === eintrag.pfad) {
    if (!s.karte) await s.karteLaden();
    useAktualisieren.getState().dialogOeffnen();
    return;
  }
  try {
    const pk = await projektkarte();
    if (!pk) return;
    const p = await planFuer(eintrag, pk);
    if (!p) return;
    if (!p.auto.size) return s.setMeldung({ art: 'info', text: `${eintrag.name}: keine Felder aus der Projektkarte.` });
    const text = await planAusfuehren(p);
    useFormulare.getState().setMeldung({ art: 'info', text: `${text}.` });
    useFormulare.getState().ordnerNeuLesen();
    void useAntrag.getState().aktualisieren();
  } catch (e) {
    useFormulare.getState().setMeldung({ art: 'fehler', text: `${eintrag.name} nicht aktualisiert: ${e instanceof Error ? e.message : String(e)}` });
  }
}

/* ---------- nach dem Speichern der Projektkarte ---------- */

/** Nach geänderten Projektdaten: Pläne für alle Formulare des Projekts – gibt es etwas zu tun, fragt die App nach */
export async function nachKarteGespeichert(alt: Projektkarte, neu: Projektkarte) {
  const { formulare, projekt } = useFormulare.getState();
  // eingereichter Antrag: die Formulare bleiben, wie sie eingereicht wurden
  if (sperrAnbindung.antrag(projekt)) return;
  const plaene: UnterlagenPlan[] = [];
  for (const f of formulare) {
    try {
      const p = await planFuer(f, neu, alt);
      if (p && p.schritte.length) plaene.push(p);
    } catch {
      // unlesbares Formular: übergehen
    }
  }
  if (plaene.some((p) => p.schritte.some((s) => s.vorgewaehlt))) useAktualisieren.setState({ unterlagen: plaene });
}

/** Die Unterlagen aus der Rückfrage aktualisieren */
export async function unterlagenAktualisieren() {
  const plaene = useAktualisieren.getState().unterlagen ?? [];
  useAktualisieren.setState({ laeuft: true });
  const ergebnisse: string[] = [];
  for (const p of plaene) {
    try {
      ergebnisse.push(await planAusfuehren(p));
    } catch (e) {
      ergebnisse.push(`${p.eintrag.name}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  useAktualisieren.setState({ laeuft: false, unterlagen: null });
  useFormulare.getState().setMeldung({ art: 'info', text: `Unterlagen aktualisiert – ${ergebnisse.join('; ')}.` });
  useFormulare.getState().ordnerNeuLesen();
  void useAntrag.getState().aktualisieren();
}

autofillAnbindung.karteGespeichert = (alt, neu) => void nachKarteGespeichert(alt, neu);
