import { useMemo, useState } from 'react';
import { create } from 'zustand';
import type { ProjektStatus } from '../antrag';
import { STATUS_REIHE, STATUS_TEXT, schlimmsterStatus, statusGesamt } from '../antrag';
import { useAntrag } from '../antragStore';
import { oeffnePfad, verbinde } from '../dateisystem';
import type { Projekt } from '../projekte';
import { projektSchluessel } from '../projekte';
import { ablageVon, projektHatEntwuerfe, useFormulare } from '../store';
import type { MenuePunkt } from './Menue';
import { zeigeMenue } from './Menue';
import { Symbol } from './Symbol';

/** Wie viele zuletzt geöffnete Projekte vorne stehen */
const ZULETZT_ZEIGEN = 8;

/** Aufgeklappte Quellen – nur für diese Sitzung, beim Start ist alles eingeklappt */
export const useAufgeklappt = create<{ offen: string[]; umschalten: (root: string) => void }>((set, get) => ({
  offen: [],
  umschalten: (root) => set({ offen: get().offen.includes(root) ? get().offen.filter((r) => r !== root) : [...get().offen, root] }),
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
export function quellenName(root: string, alle: string[]): string {
  const teile = (r: string) => r.split(/[\\/]/).filter(Boolean);
  const letzter = (r: string) => teile(r).slice(-1)[0] ?? r;
  if (alle.filter((r) => letzter(r).toLowerCase() === letzter(root).toLowerCase()).length < 2) return letzter(root);
  return teile(root).slice(-2).join('/') || root;
}

const passt = (p: Projekt, q: string) => `${p.ordner} ${p.titel}`.toLowerCase().includes(q);

/**
 * Projektübersicht: zuletzt geöffnete Projekte vorne, darunter alle Projekte je Quelle (FORMA-Ordner, beim Start
 * eingeklappt) als Karten mit Titel, Formularen, letzter Änderung, Sperren, ungespeicherten Eingaben und dem
 * Antragsstatus – so, wie er beim letzten Öffnen des Projekts war.
 */
export function ProjektUebersicht({ onEinstellungen }: { onEinstellungen: () => void }) {
  const projektordner = useFormulare((s) => s.projektordner);
  const projekte = useFormulare((s) => s.projekte);
  const sucht = useFormulare((s) => s.sucht);
  const suchfehler = useFormulare((s) => s.suchfehler);
  const zuletzt = useFormulare((s) => s.zuletzt);
  const aktuell = useFormulare((s) => s.projekt);
  const { projekteLaden, setHaupt } = useFormulare.getState();
  const aufgeklappt = useAufgeklappt((s) => s.offen);
  const umschalten = useAufgeklappt((s) => s.umschalten);
  const [suche, setSuche] = useState('');
  const q = suche.trim().toLowerCase();

  const zuletztProjekte = useMemo(
    () =>
      zuletzt
        .map((z) => ({ z, p: projekte.find((p) => p.root === z.root && p.ordner === z.ordner) }))
        .filter((x): x is { z: (typeof zuletzt)[number]; p: Projekt } => !!x.p)
        .slice(0, ZULETZT_ZEIGEN),
    [zuletzt, projekte],
  );
  const gruppen = useMemo(
    () =>
      projektordner.map((root) => {
        const alle = projekte.filter((p) => p.root === root);
        return { root, alle, treffer: q ? alle.filter((p) => passt(p, q)) : alle };
      }),
    [projektordner, projekte, q],
  );
  const treffer = gruppen.flatMap((g) => g.treffer);

  const oeffnen = (p: Projekt) => {
    if (aktuell && projektSchluessel(aktuell) === projektSchluessel(p)) setHaupt('formular');
    else void useFormulare.getState().projektWaehlen(p);
  };

  if (!projektordner.length) {
    return (
      <div className="pa">
        <div className="pa-leer">
          <h2>Willkommen</h2>
          <p>Stelle zuerst ein, wo eure FORMA-Projekte liegen – danach erscheinen sie hier.</p>
          <button className="primary" onClick={onEinstellungen}>
            <Symbol name="ordner" /> Ordner einstellen …
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="pa">
      <header className="pa-kopf">
        <div className="pa-kopf-titel">
          <h2>Projekte</h2>
          <span className="muted small-text">{sucht ? 'werden gesucht …' : `${projekte.length} in ${projektordner.length === 1 ? 'einer Quelle' : `${projektordner.length} Quellen`}`}</span>
        </div>
        <input
          type="search"
          className="pa-suche"
          placeholder="Kürzel oder Titel …"
          aria-label="Projekte durchsuchen"
          value={suche}
          onChange={(e) => setSuche(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && q && treffer[0]) oeffnen(treffer[0]);
            if (e.key === 'Escape') setSuche('');
          }}
          autoFocus
        />
        <button className="icon" title="Projekte neu einlesen" aria-label="Projekte neu einlesen" disabled={sucht} onClick={() => void projekteLaden()}>
          <Symbol name="verlauf" />
        </button>
        <button className="icon" title="Ordner mit FORMA-Projekten einstellen" aria-label="Quellen einstellen" onClick={onEinstellungen}>
          <Symbol name="zahnrad" />
        </button>
        {aktuell && (
          <button onClick={() => setHaupt('formular')} title="Zurück zum geöffneten Projekt">
            Zurück zu {aktuell.ordner}
          </button>
        )}
      </header>

      <div className="pa-rollbereich">
        {suchfehler.map((f) => (
          <p key={f} className="warning small-text">
            {f}
          </p>
        ))}

        {!q && zuletztProjekte.length > 0 && (
          <section className="pa-abschnitt" aria-label="Zuletzt geöffnet">
            <h3 className="pa-abschnitt-titel">
              <Symbol name="verlauf" /> Zuletzt geöffnet
            </h3>
            <div className="pa-raster">
              {zuletztProjekte.map(({ z, p }) => (
                <ProjektKarte key={projektSchluessel(p)} p={p} geoeffnet={z.zeit} aktiv={!!aktuell && projektSchluessel(aktuell) === projektSchluessel(p)} onOeffnen={oeffnen} zuletzt />
              ))}
            </div>
          </section>
        )}

        {gruppen.map((g) => {
          if (q && !g.treffer.length) return null;
          const auf = !!q || aufgeklappt.includes(g.root);
          return (
            <section key={g.root} className="pa-abschnitt pa-gruppe">
              <button className="pa-gruppe-kopf" aria-expanded={auf} onClick={() => umschalten(g.root)} disabled={!!q} title={g.root}>
                <Symbol name={auf ? 'pfeilUnten' : 'pfeilRechts'} />
                <Symbol name="ordner" />
                <span className="pa-gruppe-name">{quellenName(g.root, projektordner)}</span>
                <span className="pa-gruppe-pfad muted small-text">{g.root}</span>
                <span className="pa-zahl">{q ? `${g.treffer.length} / ${g.alle.length}` : g.alle.length}</span>
              </button>
              {auf && (
                <div className="pa-raster">
                  {g.treffer.map((p) => (
                    <ProjektKarte key={projektSchluessel(p)} p={p} aktiv={!!aktuell && projektSchluessel(aktuell) === projektSchluessel(p)} onOeffnen={oeffnen} />
                  ))}
                  {!sucht && !g.alle.length && <p className="muted small-text">Keine FORMA-Projekte in diesem Ordner.</p>}
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

/** Antragsstatus in Worten */
function statusText(st: ProjektStatus | undefined): string {
  if (!st) return 'Antrag noch nicht geprüft';
  const gesamt = statusGesamt(st);
  if (!gesamt) return `Projektumfang nicht festgelegt · ${st.fassung}`;
  return `${st.anzahl.aktuell ?? 0}/${gesamt} aktuell · ${st.fassung}`;
}

function ProjektKarte({ p, aktiv, geoeffnet, zuletzt, onOeffnen }: { p: Projekt; aktiv: boolean; geoeffnet?: number; zuletzt?: boolean; onOeffnen: (p: Projekt) => void }) {
  const status = useAntrag((s) => s.projektStatus[projektSchluessel(p)]);
  const ablage = useFormulare((s) => ablageVon(s, p));
  const ablageGesucht = useFormulare((s) => s.ablageordner.length > 0);
  const entwuerfe = projektHatEntwuerfe(p);
  const schlimmst = status ? schlimmsterStatus(status) : null;
  const gesamt = status ? statusGesamt(status) : 0;
  const info = p.info;

  const menue = (): MenuePunkt[] => [
    { text: 'Öffnen', symbol: 'formular', aktion: () => onOeffnen(p) },
    { trenner: true },
    { text: 'FORMA-Ordner im Explorer zeigen', symbol: 'extern', aktion: () => void oeffnePfad(verbinde(p.root, p.ordner)).catch(() => undefined) },
    { text: 'Projektordner im Explorer zeigen', symbol: 'ordner', deaktiviert: !ablage, aktion: () => ablage && void oeffnePfad(verbinde(ablage.root, ablage.pfad)).catch(() => undefined) },
    { text: 'Pfad kopieren', symbol: 'kopie', aktion: () => void navigator.clipboard?.writeText(verbinde(p.root, p.ordner)) },
    ...(zuletzt ? [{ trenner: true as const }, { text: 'Aus „Zuletzt geöffnet“ entfernen', symbol: 'schliessen' as const, aktion: () => useFormulare.getState().zuletztEntfernen(p) }] : []),
  ];

  return (
    <button
      className={`pa-karte${aktiv ? ' aktiv' : ''}`}
      data-projekt={p.ordner}
      title={verbinde(p.root, p.ordner)}
      onClick={() => onOeffnen(p)}
      onContextMenu={(e) => zeigeMenue(e, menue())}
    >
      <span className="pa-karte-kopf">
        <span className="pa-kuerzel">{p.ordner}</span>
        <span
          className={`pa-ampel ${schlimmst ?? (status ? 'ohne' : 'unbekannt')}`}
          role="img"
          aria-label={schlimmst ? `Antrag: ${STATUS_TEXT[schlimmst]}` : statusText(status)}
          title={schlimmst ? `Antrag: ${STATUS_TEXT[schlimmst]}` : statusText(status)}
        />
      </span>
      <span className={`pa-titel${p.titel ? '' : ' muted'}`}>{p.titel || 'ohne Titel'}</span>
      <span className="pa-info muted small-text">
        {[info && `${info.formulare} ${info.formulare === 1 ? 'Formular' : 'Formulare'}`, geoeffnet ? `geöffnet ${wann(geoeffnet)}` : info?.geaendert ? `geändert ${wann(info.geaendert)}` : null]
          .filter(Boolean)
          .join(' · ')}
      </span>
      {(!!info?.gesperrt || entwuerfe || (ablageGesucht && !ablage)) && (
        <span className="pa-marken">
          {!!info?.gesperrt && (
            <span className="pa-marke sperre" title="Formulare mit Sperrdatei – in FORMA oder hier geöffnet">
              <Symbol name="schloss" /> {info.gesperrt} geöffnet
            </span>
          )}
          {entwuerfe && (
            <span className="pa-marke entwurf" title="Hier eingegeben, aber noch nicht in die FORMA-Datei gespeichert">
              <Symbol name="stift" /> ungespeichert
            </span>
          )}
          {ablageGesucht && !ablage && (
            <span className="pa-marke ohne-ablage" title="Kein Projektordner mit diesem Kürzel gefunden">
              <Symbol name="ordner" /> kein Projektordner
            </span>
          )}
        </span>
      )}
      <span className="pa-status">
        <span className="pa-balken" aria-hidden="true">
          {gesamt > 0 && STATUS_REIHE.map((st) => (status!.anzahl[st] ? <span key={st} className={`pa-balken-teil ${st}`} style={{ flexGrow: status!.anzahl[st] }} /> : null))}
        </span>
        <span className="pa-status-text small-text" title={status ? `Stand beim letzten Öffnen: ${wann(status.zeit)}` : 'Wird beim Öffnen des Projekts geprüft'}>
          {statusText(status)}
        </span>
      </span>
    </button>
  );
}
