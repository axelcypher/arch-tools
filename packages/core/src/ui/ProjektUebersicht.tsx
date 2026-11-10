/**
 * Projektübersicht – die gemeinsame Startseite der Apps: vorne „Zuletzt geöffnet“, darunter je Gruppe (Quelle,
 * z. B. ein Projekte-Stammordner) die Projekte als Karten, beim Start eingeklappt. Die Seite kennt keine App:
 * Projekte, Gruppen und die zuletzt geöffneten kommen über Props, Status, Marken und Kontextmenü über Slots.
 */

import type { MouseEvent as ReactMouseEvent, ReactNode } from 'react';
import { useMemo, useState } from 'react';
import { create } from 'zustand';
import './projektuebersicht.css';

/** Stufen des Status vom besten zum schlimmsten – Farben wie in der Vollständigkeitsprüfung */
export const STUFEN = ['aktuell', 'offen', 'unvollstaendig', 'fehlt'] as const;
export type Stufe = (typeof STUFEN)[number];

export interface UebersichtGruppe {
  id: string;
  name: string;
  /** vollständiger Pfad (klein daneben) */
  pfad?: string;
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
  art?: 'warnung' | 'hinweis' | 'neutral';
  titel?: string;
  symbol?: IconName;
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
  /** gezeigt, wenn es keine Gruppen gibt (z. B. „Ordner einstellen …“) */
  leer?: ReactNode;
  /** weitere Knöpfe im Kopf */
  kopf?: ReactNode;
  /** Text, wenn eine Gruppe leer ist */
  gruppeLeer?: string;
}

/** Aufgeklappte Gruppen – nur für diese Sitzung, beim Start ist alles eingeklappt */
export const useAufgeklappt = create<{ offen: string[]; umschalten: (id: string) => void }>((set, get) => ({
  offen: [],
  umschalten: (id) => set({ offen: get().offen.includes(id) ? get().offen.filter((r) => r !== id) : [...get().offen, id] }),
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

/* ---------- Symbole (eigene kleine Auswahl, damit die Seite ohne App auskommt) ---------- */

const ICONS = {
  verlauf: 'M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5M12 7v5l3 2',
  zahnrad:
    'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z',
  pfeilUnten: 'M6 9l6 6 6-6',
  pfeilRechts: 'M9 6l6 6-6 6',
  ordner: 'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z',
  schloss: 'M6 11h12v9H6zM8 11V8a4 4 0 0 1 8 0v3',
  stift: 'M4 20h4L19 9l-4-4L4 16v4zM14 6l4 4',
  warnung: 'M12 3l10 18H2L12 3zM12 10v4M12 17h.01',
  plus: 'M12 5v14M5 12h14',
} as const;
export type IconName = keyof typeof ICONS;

function Icon({ name }: { name: IconName }) {
  return (
    <svg className="symbol" viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={ICONS[name]} />
    </svg>
  );
}

/* ---------- Seite ---------- */

const passt = (p: UebersichtProjekt, q: string) => `${p.kuerzel} ${p.titel} ${p.suchtext ?? ''}`.toLowerCase().includes(q);

export function ProjektUebersicht(props: ProjektUebersichtProps) {
  const { titel = 'Projekte', gruppen, projekte, zuletzt, zuletztAnzahl = 8, aktiv, sucht, fehler = [], onOeffnen, onZurueck, onNeuLaden, onEinstellungen } = props;
  const aufgeklappt = useAufgeklappt((s) => s.offen);
  const umschalten = useAufgeklappt((s) => s.umschalten);
  const [suche, setSuche] = useState('');
  const q = suche.trim().toLowerCase();

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
        const alle = projekte.filter((p) => p.gruppe === g.id);
        return { g, alle, treffer: q ? alle.filter((p) => passt(p, q)) : alle };
      }),
    [gruppen, projekte, q],
  );
  const treffer = inGruppen.flatMap((x) => x.treffer);
  const aktivesProjekt = aktiv ? nachSchluessel.get(aktiv) : undefined;

  if (!gruppen.length && props.leer) return <div className="pa">{props.leer}</div>;

  const karte = (p: UebersichtProjekt, geoeffnet?: number) => (
    <Karte key={p.schluessel} p={p} geoeffnet={geoeffnet} hervorgehoben={p.schluessel === aktiv} onOeffnen={onOeffnen} onKontext={props.onKontext} status={props.status} marken={props.marken} />
  );

  return (
    <div className="pa">
      <header className="pa-kopf">
        <div className="pa-kopf-titel">
          <h2>{titel}</h2>
          <span className="muted small-text">{sucht ? 'werden gesucht …' : `${projekte.length} in ${gruppen.length === 1 ? 'einer Quelle' : `${gruppen.length} Quellen`}`}</span>
        </div>
        <input
          type="search"
          className="pa-suche"
          placeholder="Kürzel oder Titel …"
          aria-label="Projekte durchsuchen"
          value={suche}
          onChange={(e) => setSuche(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && q && treffer[0]) onOeffnen(treffer[0]);
            if (e.key === 'Escape') setSuche('');
          }}
          autoFocus
        />
        {onNeuLaden && (
          <button className="icon" title="Projekte neu einlesen" aria-label="Projekte neu einlesen" disabled={sucht} onClick={onNeuLaden}>
            <Icon name="verlauf" />
          </button>
        )}
        {onEinstellungen && (
          <button className="icon" title="Quellen einstellen" aria-label="Quellen einstellen" onClick={onEinstellungen}>
            <Icon name="zahnrad" />
          </button>
        )}
        {props.kopf}
        {aktivesProjekt && onZurueck && (
          <button onClick={onZurueck} title="Zurück zum geöffneten Projekt">
            Zurück zu {aktivesProjekt.kuerzel}
          </button>
        )}
      </header>

      <div className="pa-rollbereich">
        {fehler.map((f) => (
          <p key={f} className="warning small-text">
            {f}
          </p>
        ))}

        {!q && zuletztProjekte.length > 0 && (
          <section className="pa-abschnitt" aria-label="Zuletzt geöffnet">
            <h3 className="pa-abschnitt-titel">
              <Icon name="verlauf" /> Zuletzt geöffnet
            </h3>
            <div className="pa-raster">{zuletztProjekte.map(({ p, zeit }) => karte(p, zeit))}</div>
          </section>
        )}

        {inGruppen.map(({ g, alle, treffer: t }) => {
          if (q && !t.length) return null;
          const auf = !!q || aufgeklappt.includes(g.id);
          return (
            <section key={g.id} className="pa-abschnitt pa-gruppe">
              <button className="pa-gruppe-kopf" aria-expanded={auf} onClick={() => umschalten(g.id)} disabled={!!q} title={g.pfad}>
                <Icon name={auf ? 'pfeilUnten' : 'pfeilRechts'} />
                <Icon name="ordner" />
                <span className="pa-gruppe-name">{g.name}</span>
                {g.pfad && g.pfad !== g.name && <span className="pa-gruppe-pfad muted small-text">{g.pfad}</span>}
                <span className="pa-zahl">{q ? `${t.length} / ${alle.length}` : alle.length}</span>
              </button>
              {auf && (
                <div className="pa-raster">
                  {t.map((p) => karte(p))}
                  {!sucht && !alle.length && <p className="muted small-text">{props.gruppeLeer ?? 'Keine Projekte in diesem Ordner.'}</p>}
                </div>
              )}
            </section>
          );
        })}
        {q && !treffer.length && <p className="pa-nichts muted">Kein Projekt passt zu „{suche.trim()}“.</p>}
      </div>
    </div>
  );
}

type KartenProps = Pick<ProjektUebersichtProps, 'onOeffnen' | 'onKontext' | 'status' | 'marken'> & { p: UebersichtProjekt; hervorgehoben: boolean; geoeffnet?: number };

function Karte({ p, hervorgehoben, geoeffnet, onOeffnen, onKontext, status, marken }: KartenProps) {
  const st = status?.(p);
  const mk = marken?.(p) ?? [];
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
            <span key={m.text} className={`pa-marke ${m.art ?? 'neutral'}`} title={m.titel}>
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
