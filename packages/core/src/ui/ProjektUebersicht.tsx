/**
 * Projektübersicht – die gemeinsame Startseite der Apps: vorne „Angeheftet“ und „Zuletzt geöffnet“, darunter je
 * Gruppe (Quelle, z. B. ein Projekte-Stammordner) die Projekte als Karten – beim Start eingeklappt, bei genau einer
 * Quelle aufgeklappt. Sortierung (Nummer, zuletzt geändert, Name) und Filter nach Projektstatus (Standard: ohne
 * abgeschlossene) merkt sich die Seite je Benutzer. Die Seite kennt keine App: Projekte, Gruppen und die zuletzt
 * geöffneten kommen über Props, Status, Marken und Kontextmenü über Slots.
 */

import type { MouseEvent as ReactMouseEvent, ReactNode } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { create } from 'zustand';
import type { AntragKurz, ProjektStatus } from '../model';
import { PROJEKT_STATUS } from '../model';
import { PROJEKT_ANGELEGT, projektAnlegenMoeglich, projektAnlegenStarten, vomRahmen } from '../platform/rahmen';
import { appMitWas } from '../appNamen';
import { zeigeMenue } from './Menue';
import { Karte as KarteRahmen } from './Karte';
import type { SymbolName } from './Symbol';
import { Symbol } from './Symbol';
import './projektuebersicht.css';

/** Stufen des Status vom besten zum schlimmsten – Farben wie in der Vollständigkeitsprüfung */
export const STUFEN = ['aktuell', 'offen', 'unvollstaendig', 'fehlt'] as const;
export type Stufe = (typeof STUFEN)[number];

export interface UebersichtGruppe {
  id: string;
  name: string;
  /** vollständiger Pfad (klein daneben) */
  pfad?: string;
  /** beim Start aufgeklappt (Vorgabe: nur wenn es genau eine Gruppe gibt) */
  offen?: boolean;
  /** Schlüssel zum Umsortieren per Ziehen (z. B. der Stammordner) – Gruppen mit demselben Schlüssel wandern zusammen */
  ordnen?: string;
}

export interface UebersichtProjekt {
  schluessel: string;
  /** id der Gruppe */
  gruppe: string;
  kuerzel: string;
  titel: string;
  /** kurze Angabe vor der Zeit, z. B. „6 Formulare“ */
  info?: string;
  /** letzte Änderung (ms) – in den Gruppen gezeigt */
  geaendert?: number | null;
  /** weiterer durchsuchbarer Text (Adresse, Bauherr …) */
  suchtext?: string;
  /** Stand aus der Projektdatei (`meta.status`); fehlt = aktiv */
  projektStatus?: ProjektStatus;
  /** der aktive Antrag (`meta.antrag`) – als Marke auf der Karte */
  antrag?: AntragKurz;
}

/** Klasse der Marke je Art – „hinweis“ heißt in base.css `.info`, weil `.hinweis` die schwebende Hinweis-Meldung ist */
const MARKEN_KLASSE: Record<NonNullable<UebersichtMarke['art']>, string> = { warnung: 'warnung', hinweis: 'info', neutral: 'neutral', ok: 'ok' };

const tag = (iso: string) => iso.split('-').reverse().join('.');

/** Marke des aktiven Antrags: „BAUA 2 · eingereicht 03.11.2026“ bzw. „BAUA 2 in Arbeit“ */
export function antragMarke(a: AntragKurz): UebersichtMarke {
  return a.eingereicht
    ? { text: `${a.name} · eingereicht ${tag(a.eingereicht.datum)}`, art: 'ok', titel: `Antrag ${a.name} eingereicht – ${a.eingereicht.datei ?? 'von Hand gesetzt'}` }
    : { text: `${a.name} in Arbeit`, art: 'neutral', titel: `Aktiver Antrag: ${a.name}${a.angelegt ? `, angelegt am ${tag(a.angelegt)}` : ''} – noch nicht eingereicht` };
}

/** Eintrag des Kontextmenüs einer Karte */
export interface KontextEintrag {
  label: string;
  aktion: () => void;
  gefahr?: boolean;
  titel?: string;
  /** Symbol links (gemeinsamer Satz, ui/Symbol.tsx) */
  symbol?: SymbolName;
  /** gesperrt – der Grund gehört in `hinweis` */
  deaktiviert?: boolean;
  /** rechts daneben, z. B. der Grund einer Sperre */
  hinweis?: string;
}

export type Sortierung = 'vorgabe' | 'nummer' | 'geaendert' | 'name';
export type StatusFilter = 'offen' | ProjektStatus | 'alle';

const SORTIERUNGEN: { id: Sortierung; label: string }[] = [
  { id: 'vorgabe', label: 'Ordnername' },
  { id: 'nummer', label: 'Nummer (neueste zuerst)' },
  { id: 'geaendert', label: 'zuletzt geändert' },
  { id: 'name', label: 'Titel' },
];

/** Projekte sortieren: nach Nummer (absteigend), zuletzt geändert (neueste zuerst), Titel; „vorgabe“ lässt die Reihenfolge */
export function sortiert(projekte: UebersichtProjekt[], s: Sortierung): UebersichtProjekt[] {
  if (s === 'vorgabe') return projekte;
  const de = (a: string, b: string) => a.localeCompare(b, 'de', { numeric: true, sensitivity: 'base' });
  const r = [...projekte];
  if (s === 'nummer') r.sort((a, b) => de(b.kuerzel, a.kuerzel));
  else if (s === 'geaendert') r.sort((a, b) => (b.geaendert ?? 0) - (a.geaendert ?? 0) || de(b.kuerzel, a.kuerzel));
  else r.sort((a, b) => de(a.titel || a.kuerzel, b.titel || b.kuerzel));
  return r;
}

/** Statusfilter: „offen“ (Standard) zeigt alles außer abgeschlossenen Projekten; ohne Status gilt ein Projekt als aktiv */
export function nachStatus(projekte: UebersichtProjekt[], f: StatusFilter): UebersichtProjekt[] {
  if (f === 'alle') return projekte;
  if (f === 'offen') return projekte.filter((p) => p.projektStatus !== 'abgeschlossen');
  return projekte.filter((p) => (p.projektStatus ?? 'aktiv') === f);
}

/** Sortierung und Statusfilter je Benutzer (lokaler Speicher) */
function gemerkt<T extends string>(schluessel: string, vorgabe: T, erlaubt: readonly string[]): [T, (v: T) => void] {
  const [wert, setWert] = useState<T>(() => {
    try {
      const v = localStorage.getItem(schluessel);
      return v && erlaubt.includes(v) ? (v as T) : vorgabe;
    } catch {
      return vorgabe;
    }
  });
  return [
    wert,
    (v: T) => {
      setWert(v);
      try {
        localStorage.setItem(schluessel, v);
      } catch {
        // ohne Speicher gilt die Wahl bis zum Schließen
      }
    },
  ];
}

export interface UebersichtStatus {
  /** Farbpunkt; null = kein Punkt (hohl) */
  stufe: Stufe | null;
  /** noch nicht ermittelt (hohler, blasser Punkt) */
  unbekannt?: boolean;
  /** Balken je Stufe */
  balken?: Partial<Record<Stufe, number>>;
  text: string;
  titel?: string;
  /** Tooltip des Texts */
  textTitel?: string;
}

export interface UebersichtMarke {
  text: string;
  art?: 'warnung' | 'hinweis' | 'neutral' | 'ok';
  titel?: string;
  symbol?: IconName;
}

/** Knopf im Kopf der Übersicht – Darstellung und Reihenfolge legt die Übersicht fest, die App liefert nur Text und Aktion */
export interface UebersichtAktion {
  text?: string;
  titel?: string;
  aktion: () => void;
  /** Hauptknopf ohne Plus-Symbol (z. B. „Weiter mit …“, wenn nichts neu angelegt wird) */
  ohneSymbol?: boolean;
}

export interface ProjektUebersichtProps {
  titel?: string;
  gruppen: UebersichtGruppe[];
  projekte: UebersichtProjekt[];
  /** zuletzt geöffnet, das neueste zuerst */
  zuletzt: { schluessel: string; zeit: number }[];
  /** wie viele zuletzt geöffnete vorne stehen */
  zuletztAnzahl?: number;
  /** das gerade geöffnete Projekt (hervorgehoben, mit „Zurück zu …“) */
  aktiv?: string | null;
  sucht?: boolean;
  fehler?: string[];
  onOeffnen: (p: UebersichtProjekt) => void;
  onZurueck?: () => void;
  onNeuLaden?: () => void;
  onEinstellungen?: () => void;
  /** Rechtsklick auf eine Karte; `zuletzt` = Karte im Abschnitt „Zuletzt geöffnet“ */
  onKontext?: (p: UebersichtProjekt, e: ReactMouseEvent, zuletzt: boolean) => void;
  status?: (p: UebersichtProjekt) => UebersichtStatus | undefined;
  marken?: (p: UebersichtProjekt) => UebersichtMarke[];
  /** gezeigt statt der Übersicht, wenn es keine Gruppen gibt – der gemeinsame `ProjektEinstieg` (z. B. „Ordner einstellen …“) */
  leer?: ReactNode;
  /**
   * Hauptknopf „Neues Projekt anlegen …“ rechts im Kopf (Vorgabe: der Assistent von ATLAS über die Rahmen-App, siehe
   * `projektAnlegen`); `text` nur, wenn der Knopf etwas anderes tut (z. B. „Weiter mit 2026-014 …“)
   */
  neu?: UebersichtAktion;
  /** „Datei öffnen …“ im Kopf (Dateidialog; was sich öffnen lässt, steht in `titel`) */
  dateiOeffnen?: UebersichtAktion;
  /** weitere Knöpfe im Kopf, vor „Datei öffnen …“ – selten, z. B. „Leer beginnen“, „Anderen Ordner …“ */
  weitere?: (UebersichtAktion & { text: string })[];
  /** Knopf „Schließen“ im Kopf (ohne geöffnetes Projekt; mit Projekt heißt er „Zurück zu …“ und nimmt `onZurueck`) */
  onSchliessen?: () => void;
  /** Meldung über der Liste (z. B. „Projekt wird geöffnet …“ oder ein Fehler) */
  meldung?: { text: string; fehler?: boolean };
  /** `main`, wenn die Übersicht der Hauptbereich der App ist (z. B. die Startseite von ATLAS); sonst eine benannte Karte */
  als?: 'section' | 'main';
  /** Text, wenn eine Gruppe leer ist */
  gruppeLeer?: string;
  /** angeheftete Projekte (Schlüssel) – vorne im Abschnitt „Angeheftet“ */
  angeheftet?: string[];
  /** Einträge des eingebauten Kontextmenüs je Karte (Rechtsklick); ersetzt `onKontext` */
  kontextMenue?: (p: UebersichtProjekt) => KontextEintrag[];
  /**
   * Knopf „Neues Projekt anlegen“: Vorgabe (true) – in der Rahmen-App startet er den Assistenten von ATLAS;
   * eine Funktion ersetzt das, false blendet ihn aus (etwa in ATLAS mit eigenem Knopf).
   */
  projektAnlegen?: boolean | (() => void);
  /** ein über den Knopf angelegtes Projekt (Projektordner) – die App öffnet es; die Liste wird ohnehin neu geladen */
  onAngelegt?: (ordner: string) => void;
  /** Gruppen per Ziehen umsortiert: die Schlüssel (`ordnen`) in der neuen Reihenfolge – ohne: nicht ziehbar */
  onGruppenOrdnen?: (schluessel: string[]) => void;
}

/**
 * Aufgeklappte Gruppen – nur für diese Sitzung. Beim Start ist alles eingeklappt, außer es gibt genau eine Quelle:
 * Die ist aufgeklappt (`zu` merkt, wenn sie jemand zuklappt).
 */
export const useAufgeklappt = create<{ offen: string[]; zu: string[]; umschalten: (id: string, standardOffen?: boolean) => void }>((set, get) => ({
  offen: [],
  zu: [],
  umschalten: (id, standardOffen = false) => {
    const liste = standardOffen ? 'zu' : 'offen';
    const alt = get()[liste];
    set({ [liste]: alt.includes(id) ? alt.filter((r) => r !== id) : [...alt, id] } as Partial<{ offen: string[]; zu: string[] }>);
  },
}));

const TAG = 86_400_000;

/** „heute 14:30“, „gestern“, „vor 3 Tagen“, sonst das Datum */
export function wann(ms: number, jetzt = Date.now()): string {
  const d = new Date(ms);
  const heute = new Date(jetzt);
  heute.setHours(0, 0, 0, 0);
  const t = heute.getTime();
  if (ms >= t) return `heute ${d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}`;
  if (ms >= t - TAG) return 'gestern';
  if (ms >= t - 6 * TAG) return `vor ${Math.ceil((t - ms) / TAG)} Tagen`;
  return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

/** Name einer Quelle: der Ordnername – heißen mehrere gleich, mit dem übergeordneten Ordner („Akquise/FORMA“) */
export function quellenName(pfad: string, alle: string[]): string {
  const teile = (r: string) => r.split(/[\\/]/).filter(Boolean);
  const letzter = (r: string) => teile(r).slice(-1)[0] ?? r;
  if (alle.filter((r) => letzter(r).toLowerCase() === letzter(pfad).toLowerCase()).length < 2) return letzter(pfad);
  return teile(pfad).slice(-2).join('/') || pfad;
}

/** Symbole der Übersicht: der gemeinsame Satz (ui/Symbol.tsx) – ein Symbol je Bedeutung */
export type IconName = SymbolName;
const Icon = ({ name }: { name: SymbolName }) => <Symbol name={name} />;

/* ---------- Seite ---------- */

const passt = (p: UebersichtProjekt, q: string) => `${p.kuerzel} ${p.titel} ${p.suchtext ?? ''}`.toLowerCase().includes(q);

export function ProjektUebersicht(props: ProjektUebersichtProps) {
  const { titel = 'Projekte', gruppen, projekte, zuletzt, zuletztAnzahl = 8, aktiv, sucht, fehler = [], onOeffnen, onZurueck, onNeuLaden, onEinstellungen } = props;
  const aufgeklappt = useAufgeklappt((s) => s.offen);
  const zugeklappt = useAufgeklappt((s) => s.zu);
  const umschalten = useAufgeklappt((s) => s.umschalten);
  const [suche, setSuche] = useState('');
  const q = suche.trim().toLowerCase();
  const [sortierung, setSortierung] = gemerkt<Sortierung>(
    'arch-tools:uebersicht:sortierung',
    'vorgabe',
    SORTIERUNGEN.map((s) => s.id),
  );
  const [filter, setFilter] = gemerkt<StatusFilter>('arch-tools:uebersicht:status', 'offen', ['offen', 'akquise', 'aktiv', 'abgeschlossen', 'alle']);
  /** Gruppe, die gerade gezogen wird, und wohin (Schlüssel `ordnen`) */
  const [zieht, setZieht] = useState<string | null>(null);
  const [ziel, setZiel] = useState<{ schluessel: string; davor: boolean } | null>(null);
  const ordnen = (von: string, nach: string, davor: boolean) => {
    const reihe = [...new Set(gruppen.map((g) => g.ordnen).filter((x): x is string => !!x))];
    if (von === nach || !reihe.includes(von) || !reihe.includes(nach)) return;
    const ohne = reihe.filter((x) => x !== von);
    ohne.splice(ohne.indexOf(nach) + (davor ? 0 : 1), 0, von);
    props.onGruppenOrdnen?.(ohne);
  };
  const mitStatus = projekte.some((p) => p.projektStatus);
  const einzeln = gruppen.length === 1;
  const { projektAnlegen = true, onAngelegt } = props;
  const anlegen = typeof projektAnlegen === 'function' ? projektAnlegen : projektAnlegen && projektAnlegenMoeglich() ? () => projektAnlegenStarten(!!onAngelegt) : null;

  // neues Projekt aus dem Assistenten von ATLAS: Liste neu laden und – wenn die App das kann – öffnen
  const angelegt = useRef({ onNeuLaden, onAngelegt });
  angelegt.current = { onNeuLaden, onAngelegt };
  useEffect(() => {
    if (typeof projektAnlegen === 'function' || !projektAnlegen || !projektAnlegenMoeglich()) return;
    return vomRahmen(PROJEKT_ANGELEGT, (n) => {
      angelegt.current.onNeuLaden?.();
      if (n.ordner) angelegt.current.onAngelegt?.(n.ordner);
    });
  }, [projektAnlegen]);

  const kontextMenue = props.kontextMenue;
  const kontext: ProjektUebersichtProps['onKontext'] = kontextMenue
    ? (p, e) =>
        zeigeMenue(
          e,
          kontextMenue(p).map((k) => ({ text: k.label, titel: k.titel, aktion: k.aktion, gefahr: k.gefahr, symbol: k.symbol, deaktiviert: k.deaktiviert, hinweis: k.hinweis })),
          `Projekt ${p.kuerzel}`,
        )
    : props.onKontext;

  const nachSchluessel = useMemo(() => new Map(projekte.map((p) => [p.schluessel, p])), [projekte]);
  const zuletztProjekte = useMemo(
    () =>
      zuletzt
        .map((z) => ({ zeit: z.zeit, p: nachSchluessel.get(z.schluessel) }))
        .filter((x): x is { zeit: number; p: UebersichtProjekt } => !!x.p)
        .slice(0, zuletztAnzahl),
    [zuletzt, nachSchluessel, zuletztAnzahl],
  );
  const inGruppen = useMemo(
    () =>
      gruppen.map((g) => {
        const roh = projekte.filter((p) => p.gruppe === g.id);
        const alle = sortiert(mitStatus ? nachStatus(roh, filter) : roh, sortierung);
        return { g, alle, ausgeblendet: roh.length - alle.length, treffer: q ? alle.filter((p) => passt(p, q)) : alle };
      }),
    [gruppen, projekte, q, sortierung, filter, mitStatus],
  );
  const angeheftet = useMemo(
    () =>
      (props.angeheftet ?? []).map((s) => nachSchluessel.get(s) ?? [...nachSchluessel.values()].find((p) => p.schluessel.toLowerCase() === s.toLowerCase())).filter((p): p is UebersichtProjekt => !!p),
    [props.angeheftet, nachSchluessel],
  );
  const treffer = inGruppen.flatMap((x) => x.treffer);
  const aktivesProjekt = aktiv ? nachSchluessel.get(aktiv) : undefined;

  // Kopf: immer dieselben Knöpfe in derselben Reihenfolge – Zurück/Schließen, weitere, Datei öffnen, Hauptknopf rechts
  const neu: UebersichtAktion | null =
    props.neu ??
    (anlegen
      ? { text: 'Neues Projekt anlegen …', titel: `Neues Projekt mit dem Assistenten von ${appMitWas('ordner')} anlegen: Stammdaten, Umfang, Beteiligte, Ordner und Vorlagen`, aktion: anlegen }
      : null);
  const kopfAktionen = (
    <>
      {aktivesProjekt && onZurueck ? (
        <button onClick={onZurueck} title="Zurück zum geöffneten Projekt">
          Zurück zu {aktivesProjekt.kuerzel}
        </button>
      ) : (
        props.onSchliessen && <button onClick={props.onSchliessen}>Schließen</button>
      )}
      {props.weitere?.map((w) => (
        <button key={w.text} onClick={w.aktion} title={w.titel}>
          {w.text}
        </button>
      ))}
      {props.dateiOeffnen && (
        <button onClick={props.dateiOeffnen.aktion} title={props.dateiOeffnen.titel ?? 'Projektdatei über den Dateidialog öffnen (Strg+O)'}>
          {props.dateiOeffnen.text ?? 'Datei öffnen …'}
        </button>
      )}
      {neu && (
        <button className="primary pa-anlegen" onClick={neu.aktion} title={neu.titel}>
          {!neu.ohneSymbol && <Icon name="plus" />} {neu.text ?? 'Neues Projekt anlegen …'}
        </button>
      )}
    </>
  );

  if (!gruppen.length && props.leer) return <>{props.leer}</>;

  const karte = (p: UebersichtProjekt, geoeffnet?: number) => (
    <Karte key={p.schluessel} p={p} geoeffnet={geoeffnet} hervorgehoben={p.schluessel === aktiv} onOeffnen={onOeffnen} onKontext={kontext} status={props.status} marken={props.marken} />
  );

  const leiste = (
    <div className="toolbar pa-leiste">
      <input
        type="search"
        className="pa-suche"
        placeholder="Kürzel oder Titel …"
        aria-label="Projekte durchsuchen"
        value={suche}
        onChange={(e) => setSuche(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && q && treffer[0]) onOeffnen(treffer[0]);
          // Esc verwirft zuerst die Suche, erst dann schließt es die Übersicht
          if (e.key === 'Escape' && suche) {
            e.stopPropagation();
            setSuche('');
          }
        }}
        autoFocus
      />
      <select className="pa-auswahl" aria-label="Sortierung" title="Sortierung der Projekte in den Quellen" value={sortierung} onChange={(e) => setSortierung(e.target.value as Sortierung)}>
        {SORTIERUNGEN.map((s) => (
          <option key={s.id} value={s.id}>
            {s.label}
          </option>
        ))}
      </select>
      {mitStatus && (
        <select className="pa-auswahl" aria-label="Status" title="Projekte nach Status filtern (aus der Projektdatei)" value={filter} onChange={(e) => setFilter(e.target.value as StatusFilter)}>
          <option value="offen">ohne abgeschlossene</option>
          {PROJEKT_STATUS.map((s) => (
            <option key={s.id} value={s.id}>
              nur {s.label}
            </option>
          ))}
          <option value="alle">alle</option>
        </select>
      )}
      <span className="pa-anzahl muted small-text" aria-live="polite">
        {sucht ? 'werden gesucht …' : `${projekte.length} ${projekte.length === 1 ? 'Projekt' : 'Projekte'} in ${gruppen.length === 1 ? 'einer Quelle' : `${gruppen.length} Quellen`}`}
      </span>
      {onNeuLaden && (
        <button className="icon" title="Projekte neu einlesen" aria-label="Projekte neu einlesen" disabled={sucht} onClick={onNeuLaden}>
          <Icon name="neuLaden" />
        </button>
      )}
      {onEinstellungen && (
        <button className="icon" title="Quellen einstellen" aria-label="Quellen einstellen" onClick={onEinstellungen}>
          <Icon name="zahnrad" />
        </button>
      )}
    </div>
  );

  return (
    <KarteRahmen className="pa" titel={titel} aktionen={kopfAktionen} leiste={leiste} buendig als={props.als}>
      <div className="pa-rollbereich">
        {props.meldung && (
          <p className={props.meldung.fehler ? 'warning small-text' : 'busy small-text'} role={props.meldung.fehler ? 'alert' : 'status'}>
            {props.meldung.text}
          </p>
        )}
        {fehler.map((f) => (
          <p key={f} className="warning small-text">
            {f}
          </p>
        ))}

        {!q && angeheftet.length > 0 && (
          <section className="pa-abschnitt" aria-label="Angeheftet">
            <h3 className="pa-abschnitt-titel">
              <Icon name="stern" /> Angeheftet
            </h3>
            <div className="pa-raster">{angeheftet.map((p) => karte(p))}</div>
          </section>
        )}

        {!q && zuletztProjekte.length > 0 && (
          <section className="pa-abschnitt pa-zuletzt" aria-label="Zuletzt geöffnet">
            <h3 className="pa-abschnitt-titel">
              <Icon name="verlauf" /> Zuletzt geöffnet
            </h3>
            <div className="pa-raster">{zuletztProjekte.map(({ p, zeit }) => karte(p, zeit))}</div>
          </section>
        )}

        {inGruppen.map(({ g, alle, ausgeblendet, treffer: t }) => {
          if (q && !t.length) return null;
          const standardOffen = g.offen ?? einzeln;
          const auf = !!q || (standardOffen ? !zugeklappt.includes(g.id) : aufgeklappt.includes(g.id));
          const ziehbar = !!props.onGruppenOrdnen && !!g.ordnen && !q;
          // die Markierung am ersten (davor) bzw. letzten (danach) Abschnitt des Stammordners
          const gleiche = inGruppen.filter((x) => x.g.ordnen === g.ordnen).map((x) => x.g.id);
          const zielHier =
            ziel && g.ordnen === ziel.schluessel && zieht && zieht !== g.ordnen && g.id === (ziel.davor ? gleiche[0] : gleiche[gleiche.length - 1])
              ? ziel.davor
                ? ' ziel-davor'
                : ' ziel-danach'
              : '';
          return (
            <section key={g.id} className={`pa-abschnitt pa-gruppe${zielHier}`}>
              <button
                className="pa-gruppe-kopf"
                aria-expanded={auf}
                onClick={() => umschalten(g.id, standardOffen)}
                disabled={!!q}
                title={ziehbar ? `${g.pfad ?? g.name} – zum Umsortieren ziehen` : g.pfad}
                draggable={ziehbar}
                onDragStart={(e) => {
                  setZieht(g.ordnen!);
                  try {
                    e.dataTransfer.effectAllowed = 'move';
                    e.dataTransfer.setData('text/plain', g.ordnen!);
                  } catch {
                    // ohne Datenübergabe genügt der Zustand
                  }
                }}
                onDragOver={(e) => {
                  if (!zieht || !g.ordnen || zieht === g.ordnen) return;
                  e.preventDefault();
                  const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
                  const davor = !r.height || e.clientY - r.top < r.height / 2;
                  if (ziel?.schluessel !== g.ordnen || ziel.davor !== davor) setZiel({ schluessel: g.ordnen, davor });
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  if (zieht && g.ordnen) ordnen(zieht, g.ordnen, ziel?.davor ?? true);
                  setZieht(null);
                  setZiel(null);
                }}
                onDragEnd={() => {
                  setZieht(null);
                  setZiel(null);
                }}
              >
                <Icon name={auf ? 'pfeilUnten' : 'pfeilRechts'} />
                <Icon name="ordner" />
                <span className="pa-gruppe-name">{g.name}</span>
                {g.pfad && g.pfad !== g.name && <span className="pa-gruppe-pfad muted small-text">{g.pfad}</span>}
                <span className="pa-zahl">{q ? `${t.length} / ${alle.length}` : alle.length}</span>
              </button>
              {auf && (
                <div className="pa-raster">
                  {t.map((p) => karte(p))}
                  {!sucht && !alle.length && !ausgeblendet && <p className="muted small-text">{props.gruppeLeer ?? 'Keine Projekte in diesem Ordner.'}</p>}
                  {!q && ausgeblendet > 0 && (
                    <button className="pa-ausgeblendet small" onClick={() => setFilter('alle')} title="Filter „alle“ wählen">
                      {ausgeblendet} {filter === 'offen' ? (ausgeblendet === 1 ? 'abgeschlossenes Projekt' : 'abgeschlossene Projekte') : ausgeblendet === 1 ? 'Projekt' : 'Projekte'} ausgeblendet –
                      zeigen
                    </button>
                  )}
                </div>
              )}
            </section>
          );
        })}
        {q && !treffer.length && <p className="pa-nichts muted">Kein Projekt passt zu „{suche.trim()}“.</p>}
      </div>
    </KarteRahmen>
  );
}

type KartenProps = Pick<ProjektUebersichtProps, 'onOeffnen' | 'onKontext' | 'status' | 'marken'> & { p: UebersichtProjekt; hervorgehoben: boolean; geoeffnet?: number };

function Karte({ p, hervorgehoben, geoeffnet, onOeffnen, onKontext, status, marken }: KartenProps) {
  const st = status?.(p);
  const mk = [...(p.antrag ? [antragMarke(p.antrag)] : []), ...(marken?.(p) ?? [])];
  const zeit = geoeffnet ? `geöffnet ${wann(geoeffnet)}` : p.geaendert ? `geändert ${wann(p.geaendert)}` : null;
  const gesamt = st?.balken ? STUFEN.reduce((n, s) => n + (st.balken![s] ?? 0), 0) : 0;
  const ampel = st ? (st.stufe ?? (st.unbekannt ? 'unbekannt' : 'ohne')) : 'unbekannt';
  return (
    <button
      className={`pa-karte${hervorgehoben ? ' aktiv' : ''}`}
      data-projekt={p.kuerzel}
      title={p.titel ? `${p.kuerzel} – ${p.titel}` : p.kuerzel}
      onClick={() => onOeffnen(p)}
      onContextMenu={onKontext ? (e) => onKontext(p, e, geoeffnet !== undefined) : undefined}
    >
      <span className="pa-karte-kopf">
        <span className="pa-kuerzel">{p.kuerzel}</span>
        {st && <span className={`pa-ampel ${ampel}`} role="img" aria-label={st.titel ?? st.text} title={st.titel ?? st.text} />}
      </span>
      <span className={`pa-titel${p.titel ? '' : ' muted'}`}>{p.titel || 'ohne Titel'}</span>
      <span className="pa-info muted small-text">{[p.info, zeit].filter(Boolean).join(' · ')}</span>
      {mk.length > 0 && (
        <span className="pa-marken">
          {mk.map((m) => (
            <span key={m.text} className={`marke pa-marke ${MARKEN_KLASSE[m.art ?? 'neutral']}`} title={m.titel}>
              {m.symbol && <Icon name={m.symbol} />} {m.text}
            </span>
          ))}
        </span>
      )}
      {st && (
        <span className="pa-status">
          <span className="pa-balken" aria-hidden="true">
            {gesamt > 0 && STUFEN.map((s) => (st.balken![s] ? <span key={s} className={`pa-balken-teil ${s}`} style={{ flexGrow: st.balken![s] }} /> : null))}
          </span>
          <span className="pa-status-text small-text" title={st.textTitel}>
            {st.text}
          </span>
        </span>
      )}
    </button>
  );
}
