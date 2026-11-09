import { useEffect, useState } from 'react';
import type { AblageOrdner } from '../ablage';
import { dateiArt, sichtbarkeit } from '../ablage';
import type { Eintrag } from '../dateisystem';
import { oeffnePfad, verbinde } from '../dateisystem';
import { useFormulare } from '../store';

const SYMBOL: Record<ReturnType<typeof dateiArt>, string> = {
  pdf: '📕',
  berechnung: '🧮',
  tabelle: '📊',
  text: '📄',
  plan: '📐',
  bild: '🖼',
  formular: '📝',
  sonst: '📄',
};

const sortiere = (a: Eintrag, b: Eintrag) => Number(b.ordner) - Number(a.ordner) || a.pfad.localeCompare(b.pfad, 'de', { numeric: true, sensitivity: 'base' });

/**
 * Der echte Projektordner auf dem Server, beschränkt auf die ausgewählten Pfade. Ordner werden erst beim
 * Aufklappen gelesen; ein Doppelklick öffnet eine Datei mit ihrem Programm.
 */
export function AblageBaum({ ordner, auswahl }: { ordner: AblageOrdner; auswahl: string[] }) {
  const basis = verbinde(ordner.root, ordner.pfad);
  return <Ebene basis={basis} rel="" auswahl={auswahl} ganz={false} tiefe={0} />;
}

function Ebene({ basis, rel, auswahl, ganz, tiefe }: { basis: string; rel: string; auswahl: string[]; ganz: boolean; tiefe: number }) {
  const ds = useFormulare((s) => s.ds);
  const [eintraege, setEintraege] = useState<Eintrag[] | null>(null);
  const [fehler, setFehler] = useState('');

  useEffect(() => {
    if (!ds) return;
    let aktiv = true;
    ds.liste(rel ? verbinde(basis, rel) : basis, 1)
      .then((e) => aktiv && setEintraege(e.sort(sortiere)))
      .catch((e: unknown) => aktiv && setFehler(e instanceof Error ? e.message : String(e)));
    return () => {
      aktiv = false;
    };
  }, [ds, basis, rel]);

  if (fehler) return <p className="warning small-text">{fehler}</p>;
  if (!eintraege) return <p className="muted small-text fo-baum-zeile" style={{ paddingLeft: tiefe * 14 }}>…</p>;

  const sichtbar = eintraege
    .map((e) => ({ e, pfad: rel ? `${rel}/${e.pfad}` : e.pfad }))
    .map((x) => ({ ...x, s: ganz ? ('ganz' as const) : sichtbarkeit(x.pfad, auswahl) }))
    // Dateien nur, wenn ihr Ordner ganz ausgewählt ist (oder sie selbst)
    .filter((x) => x.s === 'ganz' || (x.s === 'teil' && x.e.ordner));

  if (!sichtbar.length) return tiefe === 0 ? <p className="muted small-text">Keine ausgewählten Ordner gefunden.</p> : null;
  return (
    <ul className="fo-baum" role={tiefe === 0 ? 'tree' : 'group'}>
      {sichtbar.map((x) =>
        x.e.ordner ? (
          <OrdnerKnoten key={x.pfad} basis={basis} pfad={x.pfad} name={x.e.pfad} auswahl={auswahl} ganz={x.s === 'ganz'} tiefe={tiefe} />
        ) : (
          <li key={x.pfad} role="treeitem" aria-selected={false}>
            <button
              className="fo-baum-zeile"
              style={{ paddingLeft: tiefe * 14 + 16 }}
              title={`${x.e.pfad} – Doppelklick öffnet`}
              onDoubleClick={() => void oeffnePfad(verbinde(basis, x.pfad)).catch(() => undefined)}
            >
              <span aria-hidden>{SYMBOL[dateiArt(x.e.pfad)]}</span> <span className="fo-baum-name">{x.e.pfad}</span>
            </button>
          </li>
        ),
      )}
    </ul>
  );
}

function OrdnerKnoten({ basis, pfad, name, auswahl, ganz, tiefe }: { basis: string; pfad: string; name: string; auswahl: string[]; ganz: boolean; tiefe: number }) {
  const [auf, setAuf] = useState(false);
  return (
    <li role="treeitem" aria-expanded={auf} aria-selected={false}>
      <div className="fo-baum-knoten">
        <button className="fo-baum-zeile" style={{ paddingLeft: tiefe * 14 }} onClick={() => setAuf(!auf)} title={name}>
          <span className="fo-baum-pfeil" aria-hidden>
            {auf ? '▾' : '▸'}
          </span>{' '}
          <span aria-hidden>📁</span> <span className="fo-baum-name">{name}</span>
        </button>
        <button className="fo-klein fo-baum-oeffnen" title="Im Explorer zeigen" onClick={() => void oeffnePfad(verbinde(basis, pfad)).catch(() => undefined)}>
          ↗
        </button>
      </div>
      {auf && <Ebene basis={basis} rel={pfad} auswahl={auswahl} ganz={ganz} tiefe={tiefe + 1} />}
    </li>
  );
}
