import { useMemo } from 'react';
import type { ProjectMeta } from '@core/model';
import { BreitenLeiste } from '@core/ui/Leiste';
import { StammdatenKnopf } from '@core/ui/Stammdaten';
import { alleGewerke } from '../abrechnung/aggregat';
import { gewerkZweistellig } from '../abrechnung/gewerk';
import type { Ansicht } from '../store';
import { useAva } from '../store';
import { lvWeiter } from '../App';

const gleicheAnsicht = (a: Ansicht, b: Ansicht) => a.art === b.art && (a.art !== 'gewerk' || (b.art === 'gewerk' && a.gewerk === b.gewerk));

export function Navigation({ onStammdaten }: { onStammdaten: (meta: ProjectMeta, name: string) => void }) {
  const projekt = useAva((s) => s.projekt)!;
  const ansicht = useAva((s) => s.ansicht);
  const lv = useAva((s) => s.lv);
  const gewerke = useMemo(() => alleGewerke(projekt.kk?.kk ?? null, projekt.struktur?.gewerke ?? [], projekt.ava.rechnungen), [projekt.kk, projekt.struktur, projekt.ava.rechnungen]);
  const offeneRechnungen = projekt.ava.rechnungen.filter((r) => r.status === 'erfasst').length;
  const offeneMaengel = projekt.ava.maengel.filter((m) => m.status === 'offen' || m.status === 'angezeigt').length;
  const offeneAufgaben = projekt.ava.notizen.filter((n) => n.frist && !n.erledigt).length;

  const gehe = async (a: Ansicht) => {
    // ein anderes Gewerk schließt das LV – vorher speichern?
    const lvGewerk = lv?.gewerk;
    if (lvGewerk && !(a.art === 'gewerk' && a.gewerk === lvGewerk) && !(await lvWeiter())) return;
    if (lvGewerk && !(a.art === 'gewerk' && a.gewerk === lvGewerk)) useAva.getState().lvSchliessen();
    useAva.getState().setAnsicht(a);
  };

  const eintrag = (a: Ansicht, text: React.ReactNode, title?: string, marke?: number | string | null) => {
    const aktiv = gleicheAnsicht(a, ansicht);
    return (
      <li key={a.art === 'gewerk' ? `g${a.gewerk}` : a.art} className={aktiv ? 'active' : ''}>
        <button type="button" className="ava-nav-knopf" onClick={() => void gehe(a)} title={title} aria-current={aktiv ? 'page' : undefined}>
          <span className="ava-nav-text">{text}</span>
          {marke ? <span className="ava-marke">{marke}</span> : null}
        </button>
      </li>
    );
  };

  return (
    <BreitenLeiste schluessel="ava:breite:navigation" vorgabe={250}>
      <nav className="ava-nav" aria-label="Bereiche des Projekts">
        <div className="ava-nav-kopf">
          <div className="ava-nav-code">{projekt.meta.projektcode || '—'}</div>
          <div className="ava-nav-name" title={projekt.ordner}>
            {projekt.name}
          </div>
          <StammdatenKnopf project={{ name: projekt.name, meta: projekt.meta }} onAendern={onStammdaten} kurz={false} />
          <button
            className="small"
            onClick={() => void useAva.getState().neuLaden()}
            title="Ordner, Kostenkontrolle und Projektdatei neu einlesen (geschieht auch automatisch, wenn das Fenster wieder in den Vordergrund kommt)"
          >
            Neu einlesen
          </button>
        </div>
        <ul className="ava-nav-liste">
          {eintrag({ art: 'uebersicht' }, 'Kostenübersicht', 'Kostenschätzung, Kostenanschlag (Aufträge) und Zahlungsfreigaben je Gewerk')}
          {eintrag({ art: 'rechnungen' }, 'Rechnungen', 'Alle Rechnungen des Projekts aus Kostenkontrolle, Auftragsordnern und Prüfungen', offeneRechnungen ? `${offeneRechnungen} offen` : null)}
          {eintrag({ art: 'eingang' }, 'Rechnungseingang', 'Neue Rechnung prüfen, Scan zuordnen und ablegen')}
        </ul>
        <div className="ava-nav-titel">Gewerke</div>
        <ul className="ava-nav-liste ava-nav-gewerke">
          {gewerke.map((k) => {
            const g = projekt.struktur?.gewerke.find((x) => x.kennung === k);
            const blatt = projekt.kk?.kk.gewerke.find((x) => x.gewerk === k);
            const name = g?.name || blatt?.bezeichnung || projekt.kk?.kk.uebersicht?.zeilen.find((z) => z.gewerk === k)?.bezeichnung || '';
            const lvs = g?.lvs.filter((l) => !l.archiv).length ?? 0;
            return eintrag(
              { art: 'gewerk', gewerk: k, tab: 'lv' },
              <>
                <span className="ava-kennung">{gewerkZweistellig(k)}</span> {name}
                {!g && <span className="muted small-text"> (kein Ordner)</span>}
              </>,
              [g ? g.pfad : 'kein Gewerkeordner', lvs ? `${lvs} LV` : 'kein LV', blatt?.auftragnehmer].filter(Boolean).join(' · '),
              lvs > 1 ? `${lvs} LV` : null,
            );
          })}
          {!gewerke.length && <li className="muted">Keine Gewerke gefunden – Ablage in den Einstellungen prüfen.</li>}
        </ul>
        <div className="ava-nav-titel" title="Objektüberwachung (HOAI Leistungsphase 8): Dokumentation, Termine, Mängel">
          Bauleitung
        </div>
        <ul className="ava-nav-liste">
          {eintrag({ art: 'bautagebuch' }, 'Bautagebuch', 'Tagesberichte: Wetter, Firmen, Leistungen, Behinderungen, Fotos', projekt.ava.bautagebuch.length || null)}
          {eintrag({ art: 'protokolle' }, 'Protokolle', 'Baubesprechungen mit Tagesordnungspunkten, Zuständigkeit und Fristen', projekt.ava.protokolle.length || null)}
          {eintrag({ art: 'maengel' }, 'Mängel', 'Mängelliste je Gewerk mit Frist und Status', offeneMaengel ? `${offeneMaengel} offen` : null)}
          {eintrag({ art: 'notizen' }, 'Notizen & Aufgaben', 'Notizen und Aufgaben mit Frist', offeneAufgaben ? `${offeneAufgaben} offen` : null)}
          {eintrag({ art: 'beteiligte' }, 'Beteiligte', 'Firmen, Planer, Bauherr – mit Kontakt')}
          {eintrag({ art: 'mails' }, 'Mailverlauf', 'Mails aus den Korrespondenzordnern')}
        </ul>
        <div className="ava-nav-fuss">
          <button onClick={() => useAva.getState().setEinstellungenOffen(true)} title="Ablage, Benennung, Prüfung, Deckblatt, Scanordner, Mailvorlagen (Strg+,)">
            ⚙ Einstellungen
          </button>
        </div>
      </nav>
    </BreitenLeiste>
  );
}
