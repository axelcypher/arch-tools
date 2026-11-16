import { createContext, useContext, useEffect, useId, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import type { KeyboardEvent, ReactNode } from 'react';
import { create } from 'zustand';
import { APP_NAMEN, type AppKennung } from '../appNamen';
import { allgemeinAendern, allgemeinLaden, konfigGeaendertMelden } from '../platform/konfig';
import { isTauri } from '../platform/files';
import { ordnerWaehlen } from '../platform/projektordner';
import { logger } from '../platform/log';
import { ersetzen, globaleWerte, modernisieren, veraltetePlatzhalter, type Wert } from '../platzhalter';
import { sichererDateiname } from '../projektdatei';
import { PFAD_EINSTELLUNGEN } from '../einstellungen/eintraege';
import { pfadEinstellung, pfadSpeichern, usePfadWerte, type PfadWerte } from '../einstellungen/pfade';
import { abweichungEntschieden, pfadeUebernehmen, type Abweichung } from '../einstellungen/uebernahme';
import { PFAD_THEMEN, gleicherWert, hatFehler, pfadPruefen, type PfadEinstellung, type PfadWert } from '../einstellungen/verzeichnis';
import { Modal } from './Dialog';
import { dialogVerhaltenEinrichten } from './dialoge';
import type { MenuePunkt } from './Menue';
import { inFeldEinfuegen, PlatzhalterChips } from './Platzhalter';
import { aenderungenVerwerfen, fehlerText } from './Rueckfrage';
import { SpeicherortZeile, useKonfigOrt } from './Speicherort';
import { Symbol, type SymbolName } from './Symbol';

/**
 * Zentraler Einstellungsdialog aller Apps – in jeder App und in Arkly derselbe (docs/design.md, „Einstellungen“). Links
 * die Seiten als senkrechte Registerleiste, rechts der Inhalt. Geöffnet über `einstellungenOeffnen(seite?)` (Menü
 * „Datei → Einstellungen …“ der Apps, in Arkly „Einstellungen und Hilfe“, Strg+,).
 *
 * Änderungen gelten erst mit „Übernehmen“, für alle Seiten zugleich; Abbrechen, Esc und Klick daneben fragen bei
 * Änderungen nach. Im Notbetrieb (Netzlaufwerk nicht erreichbar) sind Felder und „Übernehmen“ gesperrt.
 *
 * Erweiterungspunkt: Apps hängen eigene Seiten mit `einstellungsSeiteAnmelden` an. Eine Seite mit eigenem Entwurf
 * liefert `entwurf` (geändert?, Fehler, übernehmen, verwerfen) und meldet Änderungen mit `einstellungenEntwurfMelden()`;
 * Felder sperrt sie, solange `useEinstellungenGesperrt()` einen Grund liefert.
 */

const log = logger('einstellungen');

/* ---------- Seiten und Erweiterungspunkt ---------- */

/** Entwurf einer Seite: Änderungen gelten erst mit „Übernehmen“ */
export interface SeitenEntwurf {
  geaendert: () => boolean;
  /** Fehler, der „Übernehmen“ sperrt (null = keiner) */
  fehler?: () => string | null;
  uebernehmen: () => Promise<void>;
  verwerfen: () => void;
}

export interface EinstellungsSeite {
  /** Kennung, z. B. „allgemein“, „pfade“ oder die Kennung einer App („formulare“) */
  id: string;
  titel: string;
  /** kurze Zeile unter dem Titel in der Navigation */
  text: string;
  symbol: SymbolName;
  /** App, zu der die Seite gehört (fehlt = alle Apps) */
  app?: AppKennung;
  /** Inhalt der Seite; `fokus` = Kennung eines Eintrags, der beim Öffnen gezeigt werden soll */
  inhalt: (o: { fokus?: string }) => ReactNode;
  entwurf?: SeitenEntwurf;
}

let angemeldet: EinstellungsSeite[] = [];
const seitenHoerer = new Set<() => void>();
const seitenAbo = (f: () => void) => {
  seitenHoerer.add(f);
  return () => void seitenHoerer.delete(f);
};
const seitenStand = () => angemeldet;

/**
 * Erweiterungspunkt: Seite einer App anhängen (z. B. beim Start der App). Gleiche Kennung ersetzt die alte. App-Seiten
 * stehen hinter den gemeinsamen, nach dem Namen der App sortiert. Liefert das Abmelden.
 */
export function einstellungsSeiteAnmelden(seite: EinstellungsSeite): () => void {
  angemeldet = [...angemeldet.filter((s) => s.id !== seite.id), seite];
  seitenHoerer.forEach((f) => f());
  return () => {
    angemeldet = angemeldet.filter((s) => s !== seite);
    seitenHoerer.forEach((f) => f());
  };
}

/** Seiten in fester Reihenfolge: Allgemein, Pfade und Benennung, dann die der Apps alphabetisch nach App-Namen */
export function seitenReihenfolge(eigene: EinstellungsSeite[]): EinstellungsSeite[] {
  const name = (s: EinstellungsSeite) => (s.app ? APP_NAMEN[s.app].name : s.titel);
  return [...GEMEINSAM, ...[...eigene].sort((a, b) => name(a).localeCompare(name(b), 'de') || a.titel.localeCompare(b.titel, 'de'))];
}

/* ---------- Öffnen ---------- */

interface EinstellungenState {
  offen: boolean;
  seite: string;
  fokus?: string;
  /** Startseite ohne Angabe (die Seite der öffnenden App, sonst „allgemein“) */
  start: string;
  /** Zähler der Entwürfe – jede Änderung rendert den Dialog neu (Knopf „Übernehmen“) */
  stand: number;
  oeffnen: (seite?: string, fokus?: string) => void;
  schliessen: () => void;
}

export const useEinstellungen = create<EinstellungenState>((set, get) => ({
  offen: false,
  seite: 'allgemein',
  start: 'allgemein',
  stand: 0,
  oeffnen: (seite, fokus) => set({ offen: true, seite: seite ?? (get().offen ? get().seite : get().start), fokus }),
  schliessen: () => set({ offen: false, fokus: undefined }),
}));

/** Einstellungen öffnen, optional auf einer Seite („allgemein“, „pfade“ oder die einer App) und bei einem Eintrag */
export function einstellungenOeffnen(seite?: string, fokus?: string): void {
  useEinstellungen.getState().oeffnen(seite, fokus);
}

/** Startseite ohne Angabe festlegen – die App mit eigener Seite nennt ihre Kennung */
export function einstellungenStartseite(seite: string): void {
  useEinstellungen.setState({ start: seite });
}

/** eine Seite hat ihren Entwurf geändert – der Dialog prüft „Übernehmen“ neu */
export function einstellungenEntwurfMelden(): void {
  useEinstellungen.setState((s) => ({ stand: s.stand + 1 }));
}

/** Tastenkürzel des Dialogs (Schreibweise der Menüs) */
export const EINSTELLUNGEN_TASTEN = 'Strg+,';

/** Menüpunkt „Einstellungen …“ – letzter Punkt von „Datei“ (hinter einem Trenner), in Arkly im Menü „Einstellungen und Hilfe“ */
export function einstellungenPunkt(seite?: string): Exclude<MenuePunkt, { trenner: true }> {
  return { text: 'Einstellungen …', symbol: 'zahnrad', tasten: EINSTELLUNGEN_TASTEN, titel: 'Einstellungen aller Apps: Allgemein, Pfade und Benennung', aktion: () => einstellungenOeffnen(seite) };
}

/** Verweis aus einem App-Dialog auf die zentrale Seite – ersetzt dort die Felder zu Pfaden und Benennung */
export function PfadeVerweis({ fokus, seite = 'pfade', text = 'Pfade und Benennung …', erklaerung }: { fokus?: string; seite?: string; text?: string; erklaerung?: ReactNode }) {
  return (
    <div className="einst-verweis">
      {erklaerung && <p className="muted small-text">{erklaerung}</p>}
      <button type="button" onClick={() => einstellungenOeffnen(seite, fokus)} title="Zentrale Einstellungen aller Apps öffnen">
        <Symbol name="zahnrad" /> {text}
      </button>
    </div>
  );
}

/**
 * Dialog, solange geöffnet – steckt in der Titelleiste jeder App und im Rahmen. Hört auf Strg+, (einmal je Fenster
 * wirksam, auch wenn mehrere Hosts eingehängt sind).
 */
export function EinstellungenHost() {
  const offen = useEinstellungen((s) => s.offen);
  useEffect(() => tastenAnmelden(), []);
  // Erstfokus, Fokusfalle und Rückkehr des Fokus (auch im Rahmen Arkly, der keine Titelleiste der Apps hat)
  useEffect(() => dialogVerhaltenEinrichten(), []);
  return offen ? <EinstellungenDialog /> : null;
}

let tastenZaehler = 0;
function tastenAnmelden(): () => void {
  if (tastenZaehler++ === 0) window.addEventListener('keydown', tastenkuerzel);
  return () => {
    if (--tastenZaehler === 0) window.removeEventListener('keydown', tastenkuerzel);
  };
}
function tastenkuerzel(e: globalThis.KeyboardEvent) {
  if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && e.key === ',' && !useEinstellungen.getState().offen) {
    e.preventDefault();
    einstellungenOeffnen();
  }
}

/* ---------- Sperre im Notbetrieb ---------- */

const Gesperrt = createContext<string | null>(null);
/** Grund, warum Felder gesperrt sind (Notbetrieb), sonst null – für Seiten der Apps */
export const useEinstellungenGesperrt = (): string | null => useContext(Gesperrt);

const NOTBETRIEB = 'Das Netzlaufwerk mit den Einstellungen ist nicht erreichbar – die Einstellungen sind nur lesbar.';

/* ---------- Dialog ---------- */

export function EinstellungenDialog() {
  const { seite, fokus, oeffnen, schliessen } = useEinstellungen();
  useEinstellungen((s) => s.stand);
  const eigene = useSyncExternalStore(seitenAbo, seitenStand);
  const seiten = useMemo(() => seitenReihenfolge(eigene), [eigene]);
  const aktiv = seiten.find((s) => s.id === seite) ?? seiten[0];
  const basis = useId();
  const kopfId = `${basis}-kopf`;
  const navRef = useRef<HTMLDivElement>(null);
  const ort = useKonfigOrt();
  const gesperrt = ort && ort !== 'fehler' && ort.notbetrieb ? NOTBETRIEB : null;
  const [laeuft, setLaeuft] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);

  // Entwürfe beginnen bei jedem Öffnen frisch
  useEffect(() => {
    for (const s of seiten) s.entwurf?.verwerfen();
  }, []);

  const geaendert = seiten.some((s) => s.entwurf?.geaendert());
  const sperrgrund = gesperrt ?? seiten.map((s) => s.entwurf?.fehler?.()).find(Boolean) ?? null;

  const schliessenFragen = async () => {
    if (laeuft) return;
    if (geaendert && !(await aenderungenVerwerfen('Einstellungen', 'Die Änderungen an den Einstellungen gehen verloren.', 'schließen'))) return;
    for (const s of seiten) s.entwurf?.verwerfen();
    schliessen();
  };

  const uebernehmen = async () => {
    if (sperrgrund || laeuft) return;
    setLaeuft(true);
    setFehler(null);
    try {
      for (const s of seiten) if (s.entwurf?.geaendert()) await s.entwurf.uebernehmen();
      schliessen();
    } catch (e) {
      log.error('Einstellungen nicht übernommen', e);
      setFehler(fehlerText(e));
    } finally {
      setLaeuft(false);
    }
  };

  /** zum ersten fehlerhaften Feld (Seite „Pfade und Benennung“) */
  const zumFehler = () => {
    oeffnen('pfade');
    requestAnimationFrame(() => {
      const feld = document.querySelector<HTMLElement>('.einst-inhalt [aria-invalid="true"]');
      feld?.scrollIntoView?.({ block: 'center' });
      feld?.focus();
    });
  };

  /** senkrechte Registerleiste: ↑/↓, Pos1/Ende wechseln sofort (docs/design.md, „Umschalter“) */
  const tasten = (e: KeyboardEvent<HTMLDivElement>) => {
    const i = seiten.findIndex((s) => s.id === aktiv.id);
    const ziel = e.key === 'ArrowDown' ? i + 1 : e.key === 'ArrowUp' ? i - 1 : e.key === 'Home' ? 0 : e.key === 'End' ? seiten.length - 1 : null;
    if (ziel === null) return;
    e.preventDefault();
    const s = seiten[(ziel + seiten.length) % seiten.length];
    oeffnen(s.id);
    requestAnimationFrame(() => navRef.current?.querySelector<HTMLButtonElement>(`[data-seite="${s.id}"]`)?.focus());
  };

  return (
    <Modal titel="Einstellungen" className="einst" tabelle onClose={() => void schliessenFragen()}>
      <form
        className="einst-form"
        onSubmit={(e) => {
          e.preventDefault();
          void uebernehmen();
        }}
      >
        <div className="einst-rumpf">
          <nav className="einst-nav" aria-labelledby={kopfId}>
            <h3 className="einst-nav-kopf" id={kopfId}>
              Einstellungen
            </h3>
            <div ref={navRef} className="einst-nav-liste" role="tablist" aria-orientation="vertical" aria-label="Seiten" onKeyDown={tasten}>
              {seiten.map((s) => {
                const gewaehlt = s.id === aktiv.id;
                const mitAenderung = !!s.entwurf?.geaendert();
                return (
                  <button
                    key={s.id}
                    type="button"
                    role="tab"
                    id={`${basis}-tab-${s.id}`}
                    data-seite={s.id}
                    aria-selected={gewaehlt}
                    aria-controls={`${basis}-seite`}
                    tabIndex={gewaehlt ? 0 : -1}
                    // im Notbetrieb sind die Felder gesperrt: der Fokus beginnt auf der gewählten Seite
                    data-startfokus={gewaehlt && gesperrt ? '' : undefined}
                    className="einst-nav-eintrag"
                    onClick={() => oeffnen(s.id)}
                  >
                    <Symbol name={s.symbol} />
                    <span>
                      <span className="einst-nav-titel">
                        {s.titel}
                        {mitAenderung && (
                          <span className="einst-geaendert" title="Geändert – gilt mit „Übernehmen“">
                            <span aria-hidden> ●</span>
                            <span className="unsichtbar"> – geändert</span>
                          </span>
                        )}
                      </span>
                      <span className="einst-nav-text">{s.app ? `${APP_NAMEN[s.app].name} · ${s.text}` : s.text}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </nav>
          <section className="einst-inhalt" role="tabpanel" id={`${basis}-seite`} aria-labelledby={`${basis}-tab-${aktiv.id}`} key={aktiv.id}>
            {gesperrt && (
              <p className="meldung warnung" role="status">
                {gesperrt} Ändern geht wieder, sobald es erreichbar ist.
              </p>
            )}
            <Gesperrt.Provider value={gesperrt}>{aktiv.inhalt({ fokus })}</Gesperrt.Provider>
          </section>
        </div>
        {fehler && (
          <p className="meldung fehler einst-fehler" role="alert">
            Nicht übernommen: {fehler}
          </p>
        )}
        <div className="dialog-buttons">
          {/* warum „Übernehmen“ gesperrt ist – sichtbar, mit Sprung zum Feld (im Notbetrieb steht es oben) */}
          {sperrgrund && !gesperrt && (
            <p className="einst-sperrgrund small-text" role="status">
              {sperrgrund}{' '}
              <button type="button" className="small" onClick={zumFehler}>
                Zum Feld
              </button>
            </p>
          )}
          <span className="tb-spacer" />
          <button type="button" onClick={() => void schliessenFragen()} disabled={laeuft}>
            Abbrechen
          </button>
          <button type="submit" className="primary" disabled={!!sperrgrund || laeuft} title={sperrgrund ?? (geaendert ? 'Änderungen aller Seiten übernehmen' : 'Keine Änderungen')}>
            Übernehmen
          </button>
        </div>
      </form>
    </Modal>
  );
}

/* ---------- Seite „Allgemein“: Speicherort, Büro ---------- */

interface Buero {
  buero: string;
  mitarbeiter: string;
}
const bueroStore = create<{ gespeichert: Buero | null; entwurf: Buero | null }>(() => ({ gespeichert: null, entwurf: null }));
const mitarbeiterAus = (t: string) => [
  ...new Set(
    t
      .split(/[,;\n]/)
      .map((x) => x.trim())
      .filter(Boolean),
  ),
];

const bueroEntwurf: SeitenEntwurf = {
  geaendert: () => {
    const { gespeichert, entwurf } = bueroStore.getState();
    return !!gespeichert && !!entwurf && (gespeichert.buero !== entwurf.buero.trim() || gespeichert.mitarbeiter !== mitarbeiterAus(entwurf.mitarbeiter).join(', '));
  },
  uebernehmen: async () => {
    const { entwurf } = bueroStore.getState();
    if (!entwurf) return;
    const a = await allgemeinAendern({ buero: entwurf.buero.trim(), mitarbeiter: mitarbeiterAus(entwurf.mitarbeiter) });
    bueroStore.setState({ gespeichert: { buero: a.buero ?? '', mitarbeiter: (a.mitarbeiter ?? []).join(', ') }, entwurf: null });
    konfigGeaendertMelden(['allgemein']);
  },
  verwerfen: () => bueroStore.setState({ entwurf: null }),
};

function SeiteAllgemein() {
  const { gespeichert, entwurf } = bueroStore();
  const gesperrt = useEinstellungenGesperrt();
  useEffect(() => {
    let aktiv = true;
    void allgemeinLaden().then(
      (a) => aktiv && bueroStore.setState({ gespeichert: { buero: a.buero ?? '', mitarbeiter: (a.mitarbeiter ?? []).join(', ') } }),
      (e) => log.warn('Gemeinsame Einstellungen nicht lesbar', e),
    );
    return () => {
      aktiv = false;
    };
  }, []);
  const wert = entwurf ?? gespeichert;
  const setze = (patch: Partial<Buero>) => {
    if (!wert) return;
    bueroStore.setState({ entwurf: { ...wert, ...patch } });
    einstellungenEntwurfMelden();
  };
  return (
    <>
      <h3>Allgemein</h3>
      <p className="einst-einleitung">Gilt für alle Apps und Arkly.</p>
      <section className="einst-gruppe" aria-labelledby="einst-speicherort">
        <h4 id="einst-speicherort">Speicherort der Einstellungen</h4>
        <SpeicherortZeile />
        <p className="muted small-text">Einzelplatz oder Netzwerkinstallation – für alle Apps auf einmal. Der Wechsel gilt sofort, unabhängig von „Übernehmen“.</p>
      </section>
      <section className="einst-gruppe" aria-labelledby="einst-buero">
        <h4 id="einst-buero">Büro</h4>
        <label className="field">
          <span className="field-label">Name des Büros</span>
          {/* Erstfokus (docs/design.md): das erste Feld – bis die Einstellungen gelesen sind nur lesbar, nicht gesperrt */}
          <input value={wert?.buero ?? ''} readOnly={!wert} disabled={!!gesperrt} data-startfokus="" title={gesperrt ?? undefined} onChange={(e) => setze({ buero: e.target.value })} />
          <span className="field-hint">Im Kopf der Ausdrucke und Excel-Dateien; leer = ohne.</span>
        </label>
        <label className="field">
          <span className="field-label">Kürzel der Mitarbeiter</span>
          <input value={wert?.mitarbeiter ?? ''} readOnly={!wert} disabled={!!gesperrt} title={gesperrt ?? undefined} onChange={(e) => setze({ mitarbeiter: e.target.value })} />
          <span className="field-hint">Durch Komma getrennt; Vorschläge für „Bearbeitung“ in den Stammdaten.</span>
        </label>
      </section>
    </>
  );
}

/* ---------- Seite „Pfade und Benennung“ ---------- */

/** Entwurf: Text je Einstellung (Listen je Zeile); null = Vorgabe wiederherstellen */
const pfadStore = create<{ entwurf: Record<string, string | boolean | null>; gespeichert: PfadWerte | null; abweichungen: Abweichung[]; entschieden: Abweichung[] }>(() => ({
  entwurf: {},
  gespeichert: null,
  abweichungen: [],
  entschieden: [],
}));

/** Wert als Text im Feld: Listen je Zeile */
const alsText = (w: PfadWert) => (Array.isArray(w) ? w.join('\n') : String(w));
const alsListe = (t: string) =>
  t
    .split('\n')
    .map((z) => z.trim())
    .filter(Boolean);
/** Text des Felds als Wert der Einstellung */
const wertAusText = (e: PfadEinstellung, t: string | boolean): PfadWert => (typeof t === 'boolean' ? t : e.art === 'liste' ? alsListe(t) : t.trim());

/** was gilt bzw. nach „Übernehmen“ gelten wird */
function wirksam(e: PfadEinstellung, gespeichert: PfadWerte, entwurf: Record<string, string | boolean | null>): PfadWert {
  if (e.id in entwurf) {
    const t = entwurf[e.id];
    return t === null ? e.vorgabe : wertAusText(e, t);
  }
  return gespeichert[e.id] ?? e.vorgabe;
}

/** geänderte Einträge des Entwurfs (gegenüber dem Gespeicherten) */
function aenderungen(): { e: PfadEinstellung; wert: PfadWert | undefined }[] {
  const { entwurf, gespeichert } = pfadStore.getState();
  if (!gespeichert) return [];
  return Object.keys(entwurf).flatMap((id) => {
    const e = pfadEinstellung(id);
    const neu = wirksam(e, gespeichert, entwurf);
    return gleicherWert(neu, gespeichert[id] ?? e.vorgabe) ? [] : [{ e, wert: entwurf[id] === null ? undefined : neu }];
  });
}

const pfadEntwurf: SeitenEntwurf = {
  geaendert: () => aenderungen().length > 0 || pfadStore.getState().entschieden.length > 0,
  fehler: () => {
    const { entwurf } = pfadStore.getState();
    const falsch = Object.entries(entwurf).find(([id, t]) => typeof t === 'string' && hatFehler(pfadPruefen(pfadEinstellung(id), t)));
    return falsch ? `Bitte zuerst „${pfadEinstellung(falsch[0]).bezeichnung}“ berichtigen.` : null;
  },
  uebernehmen: async () => {
    for (const { e, wert } of aenderungen()) await pfadSpeichern(e.id, wert);
    for (const a of pfadStore.getState().entschieden) abweichungEntschieden(a);
    pfadStore.setState({ entwurf: {}, entschieden: [] });
  },
  verwerfen: () => pfadStore.setState({ entwurf: {}, entschieden: [] }),
};

const GEMEINSAM: EinstellungsSeite[] = [
  { id: 'allgemein', titel: 'Allgemein', text: 'Speicherort der Einstellungen, Büro', symbol: 'zahnrad', inhalt: () => <SeiteAllgemein />, entwurf: bueroEntwurf },
  { id: 'pfade', titel: 'Pfade und Benennung', text: 'Ordner, Datei- und Ordnernamen aller Apps', symbol: 'ordner', inhalt: ({ fokus }) => <SeitePfade fokus={fokus} />, entwurf: pfadEntwurf },
];

/** Beispielwerte der globalen Platzhalter für die Vorschau (erfunden) */
export const BEISPIEL_QUELLE = { projektcode: 'BS9', kurzname: 'EFH Musterweg', vorhaben: 'Neubau eines Einfamilienhauses', bearbeiter: 'TP' };

/** Vorschau eines Werts mit Beispielwerten; Pfade mit „/“ gegliedert, Namen bereinigt */
export function pfadVorschau(e: PfadEinstellung, wert: string, datum = new Date()): string {
  const werte: Record<string, Wert> = { ...globaleWerte({ ...BEISPIEL_QUELLE, datum }), ...(e.beispiel ?? {}) };
  const ersetzt = e.variablen ? ersetzen(wert, e.variablen, werte, { saeubern: sichererDateiname }) : wert;
  if (e.art === 'ordner') return ersetzt;
  const pfad = e.art === 'pfad' || (e.art === 'liste' && e.zeilen === 'pfad');
  const teile = pfad
    ? ersetzt
        .split(/[\\/]+/)
        .map(sichererDateiname)
        .filter(Boolean)
    : [sichererDateiname(ersetzt)];
  const text = teile.join(pfad ? ' / ' : '');
  return text ? `${text}${e.endung ?? ''}` : '';
}

const appsText = (e: PfadEinstellung) => e.apps.map((a) => APP_NAMEN[a].name).join(', ');

function SeitePfade({ fokus }: { fokus?: string }) {
  const werte = usePfadWerte();
  const { abweichungen } = pfadStore();
  const [app, setApp] = useState<AppKennung | ''>('');
  const appsMitEintrag = useMemo(() => (Object.keys(APP_NAMEN) as AppKennung[]).filter((a) => PFAD_EINSTELLUNGEN.some((e) => e.apps.includes(a))), []);
  const sichtbar = PFAD_EINSTELLUNGEN.filter((e) => !app || e.apps.includes(app));
  const gesperrt = useEinstellungenGesperrt();

  useEffect(() => {
    if (werte) pfadStore.setState({ gespeichert: werte });
  }, [werte]);

  // alte Werte dieses Rechners übernehmen bzw. Abweichungen zeigen
  useEffect(() => {
    let aktiv = true;
    void pfadeUebernehmen().then(
      (a) => aktiv && pfadStore.setState({ abweichungen: a }),
      (e) => log.warn('Übernahme alter Werte nicht möglich', e),
    );
    return () => {
      aktiv = false;
    };
  }, []);

  useEffect(() => {
    if (!fokus || !werte) return;
    const ziel = document.getElementById(`einst-${fokus}`);
    ziel?.scrollIntoView?.({ block: 'start' });
    ziel?.querySelector<HTMLInputElement>('input, textarea')?.focus();
  }, [fokus, werte]);

  const entscheiden = (a: Abweichung, lokal: boolean) => {
    const s = pfadStore.getState();
    pfadStore.setState({
      abweichungen: s.abweichungen.filter((x) => x !== a),
      entschieden: [...s.entschieden, a],
      ...(lokal ? { entwurf: { ...s.entwurf, [a.id]: alsText(a.neu) } } : {}),
    });
    einstellungenEntwurfMelden();
  };

  return (
    <>
      <h3>Pfade und Benennung</h3>
      <p className="einst-einleitung">
        Alle Pfadvorgaben und Benennungsschemata der Apps an einer Stelle. Pfade gelten relativ zum Projektordner. Platzhalter wie <code>{'{PROJEKT_KUERZEL}'}</code> setzen die Angaben des Projekts
        ein; die Vorschau zeigt Beispielwerte.
      </p>
      {abweichungen.map((a) => {
        const e = pfadEinstellung(a.id);
        return (
          <div key={a.id} className="meldung warnung einst-abweichung" role="status">
            <p>
              <strong>{e.bezeichnung}</strong> ({appsText(e)}): Auf diesem Rechner war bisher <code>{alsText(a.lokal).replace(/\n/g, ' · ')}</code> eingestellt, gemeinsam gilt{' '}
              <code>{alsText(a.gemeinsam).replace(/\n/g, ' · ') || '(leer)'}</code>. Welcher Wert soll gelten?
            </p>
            <div className="button-row">
              <button type="button" disabled={!!gesperrt} onClick={() => entscheiden(a, true)}>
                {Array.isArray(a.lokal) ? 'Lokalen Ordner ergänzen' : 'Wert dieses Rechners'}
              </button>
              <button type="button" disabled={!!gesperrt} onClick={() => entscheiden(a, false)}>
                Gemeinsamen Wert behalten
              </button>
            </div>
          </div>
        );
      })}
      <div className="einst-filter">
        <label className="field">
          <span className="field-label">App</span>
          <select value={app} data-startfokus="" onChange={(e) => setApp(e.target.value as AppKennung | '')}>
            <option value="">Alle Apps</option>
            {appsMitEintrag.map((a) => (
              <option key={a} value={a}>
                {APP_NAMEN[a].name} ({APP_NAMEN[a].was})
              </option>
            ))}
          </select>
        </label>
      </div>
      {!werte ? (
        <p className="muted">Einstellungen werden gelesen …</p>
      ) : (
        PFAD_THEMEN.map((t) => {
          const liste = sichtbar.filter((e) => e.thema === t.id);
          if (!liste.length) return null;
          return (
            <section key={t.id} className="einst-gruppe" aria-labelledby={`einst-thema-${t.id}`}>
              <h4 id={`einst-thema-${t.id}`}>{t.titel}</h4>
              <p className="muted small-text einst-gruppe-text">{t.text}</p>
              {liste.map((e) => (
                <PfadFeld key={e.id} e={e} werte={werte} />
              ))}
            </section>
          );
        })
      )}
    </>
  );
}

/** eine Einstellung: Feld, Platzhalter, Vorschau, Prüfung, „Vorgabe wiederherstellen“ */
function PfadFeld({ e, werte }: { e: PfadEinstellung; werte: PfadWerte }) {
  const entwurf = pfadStore((s) => s.entwurf);
  const gesperrt = useEinstellungenGesperrt();
  const gilt = wirksam(e, werte, entwurf);
  const gespeichert = werte[e.id] ?? e.vorgabe;
  const istVorgabe = gleicherWert(gilt, e.vorgabe);
  const geaendert = !gleicherWert(gilt, gespeichert);
  const feldId = useId();
  const hinweisId = `${feldId}-hinweis`;
  const vorgabeText = e.art === 'schalter' ? (e.vorgabe ? 'ja' : 'nein') : alsText(e.vorgabe).replace(/\n/g, ' · ') || '(leer)';

  const setze = (t: string | boolean | null) => {
    pfadStore.setState((s) => ({ entwurf: { ...s.entwurf, [e.id]: t } }));
    einstellungenEntwurfMelden();
  };

  return (
    <div className={`einst-eintrag${geaendert ? ' geaendert' : ''}`} id={`einst-${e.id}`}>
      <div className="einst-eintrag-kopf">
        {e.art === 'schalter' ? (
          <label className="toggle einst-eintrag-titel">
            <input type="checkbox" checked={gilt === true} disabled={!!gesperrt} title={gesperrt ?? undefined} aria-describedby={hinweisId} onChange={(ev) => setze(ev.target.checked)} />
            {e.bezeichnung}
          </label>
        ) : (
          <label className="einst-eintrag-titel" htmlFor={feldId}>
            {e.bezeichnung}
            {e.pflicht && (
              <span className="pflicht" title="Pflichtangabe" aria-hidden>
                {' '}
                *
              </span>
            )}
          </label>
        )}
        <span className="einst-apps" title={`genutzt von ${appsText(e)}`}>
          {e.apps.map((a) => (
            <span key={a} className="einst-app">
              {APP_NAMEN[a].name}
            </span>
          ))}
        </span>
      </div>
      <p className="muted small-text einst-erklaerung" id={hinweisId}>
        {e.erklaerung}
      </p>
      {e.projektwert && (
        <p className="small-text einst-projekt">
          <span className="einst-projekt-marke">Je Projekt</span> {e.projektwert} Hier steht die Vorgabe des Büros.
        </p>
      )}
      {e.art !== 'schalter' && (
        <TextEinstellung e={e} feldId={feldId} hinweisId={hinweisId} text={typeof entwurf[e.id] === 'string' ? (entwurf[e.id] as string) : alsText(gilt)} gesperrt={gesperrt} onText={setze} />
      )}
      <div className="einst-eintrag-fuss">
        <span className="muted small-text">
          {geaendert ? 'Geändert – gilt mit „Übernehmen“' : istVorgabe ? 'Vorgabe' : 'Eigener Wert'}
          {!istVorgabe && (
            <>
              {' '}
              · Vorgabe: <code>{vorgabeText}</code>
            </>
          )}
        </span>
        {/* nur bei eigenem Wert – sonst gibt es nichts wiederherzustellen */}
        {!istVorgabe && (
          <button type="button" className="small" disabled={!!gesperrt} onClick={() => setze(null)} title={gesperrt ?? `Vorgabe wiederherstellen: ${vorgabeText}`}>
            Vorgabe wiederherstellen
          </button>
        )}
      </div>
    </div>
  );
}

/** Textfeld einer Einstellung: jede Eingabe geht in den Entwurf; Fehler stehen am Feld und sperren „Übernehmen“ */
function TextEinstellung({
  e,
  feldId,
  hinweisId,
  text,
  gesperrt,
  onText,
}: {
  e: PfadEinstellung;
  feldId: string;
  hinweisId: string;
  text: string;
  gesperrt: string | null;
  onText: (t: string) => void;
}) {
  const feld = useRef<HTMLInputElement & HTMLTextAreaElement>(null);
  const textRef = useRef(text);
  textRef.current = text;
  const meldungen = pfadPruefen(e, text);
  const fehlerhaft = hatFehler(meldungen);
  const liste = e.art === 'liste';
  // Liste: Vorschau des ersten Eintrags (bei Mustern gilt es für neue Dateien)
  const vorschau = e.art === 'ordner' ? '' : pfadVorschau(e, liste ? (alsListe(text)[0] ?? '') : text);
  const alt = e.variablen ? veraltetePlatzhalter(text, e.variablen) : [];
  const meldungId = `${feldId}-pruefung`;
  const vorschauId = `${feldId}-vorschau`;
  const feldProps = {
    ref: feld,
    id: feldId,
    className: fehlerhaft ? 'feld-fehler einst-feld' : 'einst-feld',
    value: text,
    disabled: !!gesperrt,
    title: gesperrt ?? undefined,
    spellCheck: false,
    'aria-invalid': fehlerhaft || undefined,
    'aria-required': e.pflicht || undefined,
    'aria-describedby': [hinweisId, meldungen.length ? meldungId : '', vorschau ? vorschauId : ''].filter(Boolean).join(' '),
    onChange: (ev: { target: { value: string } }) => onText(ev.target.value),
  };

  return (
    <>
      <div className="einst-feldzeile">
        {liste ? <textarea {...feldProps} rows={Math.max(2, Math.min(6, text.split('\n').length))} /> : <input {...feldProps} />}
        {e.art === 'ordner' && isTauri() && (
          <button
            type="button"
            disabled={!!gesperrt}
            onClick={async () => {
              const p = await ordnerWaehlen(e.bezeichnung);
              if (p) onText(p);
            }}
          >
            Ordner wählen …
          </button>
        )}
      </div>
      {e.variablen && e.variablen.length > 0 && !gesperrt && (
        <PlatzhalterChips
          variablen={e.variablen}
          label={e.bezeichnung}
          onEinfuegen={(p) =>
            inFeldEinfuegen(feld.current, textRef.current, p, (neu) => {
              textRef.current = neu;
              onText(neu);
            })
          }
        />
      )}
      {vorschau && (
        <p className="einst-vorschau small-text" id={vorschauId}>
          <span className="muted">{liste && e.zeilen !== 'pfad' ? 'Vorschau (erstes Muster): ' : 'Vorschau: '}</span>
          <code>{vorschau}</code>
        </p>
      )}
      {meldungen.length > 0 && (
        <ul className="einst-meldungen" id={meldungId}>
          {meldungen.map((m) => (
            <li key={m.text} className={m.art === 'fehler' ? 'feld-meldung' : 'muted small-text'} role={m.art === 'fehler' ? 'alert' : undefined}>
              {m.text}
            </li>
          ))}
        </ul>
      )}
      {alt.length > 0 && (
        <span className="ph-veraltet">
          Alte Schreibweise (funktioniert weiter): {alt.map((a) => `${a.alt} → ${a.neu}`).join(', ')}
          <button type="button" className="small" disabled={!!gesperrt} onClick={() => onText(modernisieren(text, e.variablen ?? []))}>
            Auf neue Namen umstellen
          </button>
        </span>
      )}
    </>
  );
}
