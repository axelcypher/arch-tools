import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from 'react';
import { useEffect, useRef, useState } from 'react';
import { einfuegeStelle, zeigerZiehen } from '@core/ui/ziehen';
import type { AblageOrdner } from '../ablage';
import { dateiArt, ebenenSchluessel, nachReihenfolge, sichtbarkeit } from '../ablage';
import { istHilfsdatei } from '../antrag';
import type { Eintrag } from '../dateisystem';
import { oeffnePfad, verbinde } from '../dateisystem';
import { dateiArtVon, useFormulare } from '../store';
import { aktiveFassung, antragsOrdner, useAntrag } from '../antragStore';
import { duplizieren, einfuegen, loeschen, ordnerNeu, umbenennen, useDateiAktionen, verknuepfen } from '../dateiAktionen';
import type { MenuePunkt } from './Menue';
import { zeigeMenue } from './Menue';
import type { SymbolName } from './Symbol';
import { Symbol } from './Symbol';
import { zeitKurz, zeitLang } from '../zeit';

export const SYMBOL: Record<ReturnType<typeof dateiArt>, SymbolName> = {
  pdf: 'datei',
  berechnung: 'tabelle',
  tabelle: 'tabelle',
  text: 'datei',
  plan: 'datei',
  bild: 'bild',
  formular: 'formular',
  sonst: 'datei',
};

/** Kontextmenü einer Datei im Projektordner */
export function dateiMenue(basis: string, pfad: string): MenuePunkt[] {
  const st = useAntrag.getState();
  const projekt = useFormulare.getState().projekt;
  const umfang = st.projektdatei?.umfang ?? [];
  const imAntrag = !!projekt && pfad.slice(0, pfad.lastIndexOf('/')).toLowerCase() === antragsOrdner(st, projekt).toLowerCase();
  const name = pfad.split('/').pop() ?? pfad;
  return [
    ...(dateiArtVon(pfad) ? [{ text: 'Ansehen', symbol: 'datei' as const, aktion: () => void useFormulare.getState().dateiAnsehen(basis, pfad) }] : []),
    { text: 'Mit Programm öffnen', symbol: 'extern', aktion: () => void oeffnePfad(verbinde(basis, pfad)).catch(() => undefined) },
    { text: 'Im Explorer zeigen', symbol: 'ordner', aktion: () => void oeffnePfad(verbinde(basis, pfad.slice(0, Math.max(0, pfad.lastIndexOf('/'))) || '.')).catch(() => undefined) },
    { trenner: true },
    { text: 'Kopieren', symbol: 'kopie', hinweis: 'zum Einfügen in einen Ordner', aktion: () => useDateiAktionen.getState().merken({ basis, pfad }) },
    { text: 'Duplizieren', symbol: 'kopie', aktion: () => void duplizieren(basis, pfad) },
    { text: 'Umbenennen …', symbol: 'stift', aktion: () => void umbenennen(basis, pfad) },
    { text: 'Löschen …', symbol: 'muell', gefahr: true, aktion: () => void loeschen(basis, pfad) },
    ...(umfang.length && projekt
      ? [
          { trenner: true as const },
          {
            text: imAntrag ? 'Mit Antragsdokument verknüpfen' : `In ${aktiveFassung(st, projekt)} kopieren und verknüpfen`,
            symbol: 'link' as const,
            unter: umfang.map((u) => ({
              text: u.titel,
              symbol: (u.dateien?.[aktiveFassung(st, projekt)]?.toLowerCase() === name.toLowerCase() && imAntrag ? 'haken' : undefined) as 'haken' | undefined,
              aktion: () => void verknuepfen(basis, pfad, u.id),
            })),
          },
        ]
      : []),
    { trenner: true },
    { text: 'Pfad kopieren', symbol: 'kopie', aktion: () => void navigator.clipboard?.writeText(verbinde(basis, pfad)) },
  ];
}

/** Kontextmenü eines Ordners im Projektordner */
function ordnerMenue(basis: string, pfad: string): MenuePunkt[] {
  const z = useDateiAktionen.getState().ablage;
  return [
    { text: z ? `„${z.pfad.split('/').pop()}“ einfügen` : 'Einfügen', symbol: 'einfuegen', deaktiviert: !z || z.basis !== basis, aktion: () => void einfuegen(basis, pfad) },
    { text: 'Neuer Ordner …', symbol: 'plus', aktion: () => void ordnerNeu(basis, pfad) },
    { trenner: true },
    {
      text: 'Reihenfolge dieser Ebene zurücksetzen',
      hinweis: 'alphabetisch',
      deaktiviert: !useFormulare.getState().ordnerReihenfolge[ebenenSchluessel(pfad.slice(0, Math.max(0, pfad.lastIndexOf('/'))))],
      aktion: () => useFormulare.getState().ordnerReihenfolgeSetzen(ebenenSchluessel(pfad.slice(0, Math.max(0, pfad.lastIndexOf('/')))), []),
    },
    { text: 'Im Explorer zeigen', symbol: 'extern', aktion: () => void oeffnePfad(verbinde(basis, pfad)).catch(() => undefined) },
    { text: 'Pfad kopieren', symbol: 'kopie', aktion: () => void navigator.clipboard?.writeText(verbinde(basis, pfad)) },
  ];
}

/**
 * Der echte Projektordner auf dem Server, beschränkt auf die ausgewählten Pfade. Ordner werden erst beim
 * Aufklappen gelesen; ein Doppelklick öffnet eine Datei mit ihrem Programm, Rechtsklick zeigt die Dateibefehle.
 * Die Reihenfolge der Ordner einer Ebene lässt sich per Ziehen ändern (Alt+↑/↓ mit der Tastatur) – gemerkt je Ebene,
 * für alle Projekte.
 */
export function AblageBaum({ ordner, auswahl }: { ordner: AblageOrdner; auswahl: string[] }) {
  const basis = verbinde(ordner.root, ordner.pfad);
  return <Ebene basis={basis} rel="" auswahl={auswahl} ganz={false} tiefe={0} />;
}

function Ebene({ basis, rel, auswahl, ganz, tiefe }: { basis: string; rel: string; auswahl: string[]; ganz: boolean; tiefe: number }) {
  const ds = useFormulare((s) => s.ds);
  const offen = useFormulare((s) => (s.haupt === 'datei' && s.datei?.root === basis ? s.datei.pfad : null));
  const entwuerfe = useFormulare((s) => s.dateiEntwuerfe);
  const { dateiAnsehen } = useFormulare.getState();
  const stand = useDateiAktionen((s) => s.stand);
  const ordnerStand = useFormulare((s) => s.ordnerStand);
  const reihe = useFormulare((s) => s.ordnerReihenfolge[ebenenSchluessel(rel)]);
  const [eintraege, setEintraege] = useState<Eintrag[] | null>(null);
  const [fehler, setFehler] = useState('');
  const [zug, setZug] = useState<{ name: string; stelle: number } | null>(null);
  const liste = useRef<HTMLUListElement>(null);

  useEffect(() => {
    if (!ds) return;
    let aktiv = true;
    ds.liste(rel ? verbinde(basis, rel) : basis, 1)
      .then((e) => {
        if (!aktiv) return;
        const neu = e;
        // nur bei einer Änderung neu zeichnen (wird regelmäßig abgeglichen)
        setEintraege((alt) => (alt && alt.length === neu.length && alt.every((a, i) => a.pfad === neu[i].pfad && a.ordner === neu[i].ordner) ? alt : neu));
        setFehler('');
      })
      .catch((e: unknown) => aktiv && setFehler(e instanceof Error ? e.message : String(e)));
    return () => {
      aktiv = false;
    };
  }, [ds, basis, rel, stand, ordnerStand]);

  if (fehler) return <p className="warning small-text">{fehler}</p>;
  if (!eintraege) return <p className="muted small-text fo-baum-zeile" style={{ paddingLeft: tiefe * 14 }}>…</p>;

  const sichtbar = nachReihenfolge(eintraege, reihe)
    // Besitzerdateien von Office (~$…), Sperrdateien von LibreOffice und Systemdateien sind nur vorübergehend da
    .filter((e) => !istHilfsdatei(e.pfad))
    .map((e) => ({ e, pfad: rel ? `${rel}/${e.pfad}` : e.pfad }))
    .map((x) => ({ ...x, s: ganz ? ('ganz' as const) : sichtbarkeit(x.pfad, auswahl) }))
    // Dateien nur, wenn ihr Ordner ganz ausgewählt ist (oder sie selbst)
    .filter((x) => x.s === 'ganz' || (x.s === 'teil' && x.e.ordner));

  if (!sichtbar.length) return tiefe === 0 ? <p className="muted small-text">Keine ausgewählten Ordner gefunden.</p> : null;

  const ordnerNamen = sichtbar.filter((x) => x.e.ordner).map((x) => x.e.pfad);
  /** neue Reihenfolge der Ordner dieser Ebene merken – nicht sichtbare behalten ihren Platz dahinter */
  const merken = (namen: string[]) => {
    const rest = (reihe ?? []).filter((n) => !namen.some((x) => x.toLowerCase() === n));
    useFormulare.getState().ordnerReihenfolgeSetzen(ebenenSchluessel(rel), [...namen, ...rest]);
  };
  const verschieben = (name: string, stelle: number) => {
    const ohne = ordnerNamen.filter((n) => n !== name);
    ohne.splice(Math.max(0, Math.min(stelle, ohne.length)), 0, name);
    if (ohne.join('\n') !== ordnerNamen.join('\n')) merken(ohne);
  };
  const ziehen = (name: string) => (e: ReactPointerEvent<HTMLElement>) => {
    if (e.button !== 0) return;
    let stelle = -1;
    zeigerZiehen(e, {
      schwelle: 5,
      beginn: () => setZug({ name, stelle: ordnerNamen.indexOf(name) }),
      bewegen: (ev) => {
        const zeilen = liste.current ? [...liste.current.children].filter((z): z is HTMLElement => z instanceof HTMLElement && !!z.dataset.ordner) : [];
        stelle = einfuegeStelle(
          zeilen.map((z) => z.querySelector<HTMLElement>(':scope > .fo-baum-knoten') ?? z),
          ev.clientY,
          zeilen.findIndex((z) => z.dataset.ordner === name),
        );
        setZug({ name, stelle });
      },
      ende: (gezogen) => {
        setZug(null);
        if (gezogen && stelle >= 0) verschieben(name, stelle);
      },
    });
  };
  const taste = (name: string) => (e: ReactKeyboardEvent<HTMLElement>) => {
    if (!e.altKey || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return;
    e.preventDefault();
    const i = ordnerNamen.indexOf(name);
    verschieben(name, e.key === 'ArrowUp' ? i - 1 : i + 1);
  };
  const uebrige = ordnerNamen.filter((n) => n !== zug?.name);

  return (
    <ul className={`fo-baum${zug ? ' zieht' : ''}`} role={tiefe === 0 ? 'tree' : 'group'} ref={liste}>
      {sichtbar.map((x) =>
        x.e.ordner ? (
          <OrdnerKnoten
            key={x.pfad}
            basis={basis}
            pfad={x.pfad}
            name={x.e.pfad}
            auswahl={auswahl}
            ganz={x.s === 'ganz'}
            tiefe={tiefe}
            onZiehen={ziehen(x.e.pfad)}
            onTaste={taste(x.e.pfad)}
            markierung={
              !zug ? undefined : zug.name === x.e.pfad ? 'quelle' : uebrige.indexOf(x.e.pfad) === zug.stelle ? 'davor' : zug.stelle >= uebrige.length && uebrige.at(-1) === x.e.pfad ? 'danach' : undefined
            }
          />
        ) : (
          <li key={x.pfad} role="treeitem" aria-selected={false}>
            <button
              className={`fo-baum-zeile${offen === x.pfad ? ' aktiv' : ''}`}
              style={{ paddingLeft: tiefe * 14 + 18 }}
              title={`${dateiArtVon(x.e.pfad) ? `${x.e.pfad} – Klick: hier ansehen, Doppelklick: im Programm öffnen` : `${x.e.pfad} – Doppelklick öffnet`}\n${zeitLang(x.e.geaendert)}`}
              onClick={() => dateiArtVon(x.e.pfad) && void dateiAnsehen(basis, x.pfad)}
              onDoubleClick={() => void oeffnePfad(verbinde(basis, x.pfad)).catch(() => undefined)}
              onContextMenu={(e) => zeigeMenue(e, dateiMenue(basis, x.pfad))}
            >
              <span className={`fo-baum-symbol ${dateiArt(x.e.pfad)}`}>
                <Symbol name={SYMBOL[dateiArt(x.e.pfad)]} />
              </span>
              <span className="fo-baum-name">{x.e.pfad}</span>
              {`${basis}|${x.pfad}` in entwuerfe && <span className="fo-ungespeichert"> ●</span>}
              {x.e.geaendert ? <span className="fo-baum-zeit">{zeitKurz(x.e.geaendert)}</span> : null}
            </button>
          </li>
        ),
      )}
    </ul>
  );
}

function OrdnerKnoten({
  basis,
  pfad,
  name,
  auswahl,
  ganz,
  tiefe,
  onZiehen,
  onTaste,
  markierung,
}: {
  basis: string;
  pfad: string;
  name: string;
  auswahl: string[];
  ganz: boolean;
  tiefe: number;
  onZiehen: (e: ReactPointerEvent<HTMLElement>) => void;
  onTaste: (e: ReactKeyboardEvent<HTMLElement>) => void;
  /** beim Ziehen: gezogener Ordner bzw. Einfügestelle davor/danach */
  markierung?: 'quelle' | 'davor' | 'danach';
}) {
  const [auf, setAuf] = useState(false);
  return (
    <li role="treeitem" aria-expanded={auf} aria-selected={false} data-ordner={name} data-ziehen={markierung}>
      <div className="fo-baum-knoten">
        <button
          className="fo-baum-zeile"
          style={{ paddingLeft: tiefe * 14 }}
          onClick={() => setAuf(!auf)}
          title={`${name} – ziehen ändert die Reihenfolge (Alt+↑/↓)`}
          onPointerDown={onZiehen}
          onKeyDown={onTaste}
          onContextMenu={(e) => zeigeMenue(e, ordnerMenue(basis, pfad))}
        >
          <span className="fo-baum-pfeil">
            <Symbol name={auf ? 'pfeilUnten' : 'pfeilRechts'} />
          </span>
          <span className="fo-baum-symbol ordner">
            <Symbol name={auf ? 'ordnerOffen' : 'ordner'} />
          </span>
          <span className="fo-baum-name">{name}</span>
        </button>
        <button className="icon fo-baum-oeffnen" title="Im Explorer zeigen" aria-label={`${name} im Explorer zeigen`} onClick={() => void oeffnePfad(verbinde(basis, pfad)).catch(() => undefined)}>
          <Symbol name="extern" />
        </button>
      </div>
      {auf && <Ebene basis={basis} rel={pfad} auswahl={auswahl} ganz={ganz} tiefe={tiefe + 1} />}
    </li>
  );
}
