import { useEffect, useState } from 'react';
import type { AblageOrdner } from '../ablage';
import { dateiArt, sichtbarkeit } from '../ablage';
import type { Eintrag } from '../dateisystem';
import { oeffnePfad, verbinde } from '../dateisystem';
import { dateiArtVon, useFormulare } from '../store';
import type { SymbolName } from './Symbol';
import { Symbol } from './Symbol';

const SYMBOL: Record<ReturnType<typeof dateiArt>, SymbolName> = {
  pdf: 'datei',
  berechnung: 'tabelle',
  tabelle: 'tabelle',
  text: 'datei',
  plan: 'datei',
  bild: 'bild',
  formular: 'formular',
  sonst: 'datei',
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
  const offen = useFormulare((s) => (s.haupt === 'datei' && s.datei?.root === basis ? s.datei.pfad : null));
  const entwuerfe = useFormulare((s) => s.dateiEntwuerfe);
  const { dateiAnsehen } = useFormulare.getState();
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
    // Besitzerdateien von Office (~$…), Sperrdateien von LibreOffice und Systemdateien sind nur vorübergehend da
    .filter((e) => !/^(~\$|\.~lock\.)/.test(e.pfad) && !/^(thumbs\.db|desktop\.ini)$/i.test(e.pfad))
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
              className={`fo-baum-zeile${offen === x.pfad ? ' aktiv' : ''}`}
              style={{ paddingLeft: tiefe * 14 + 18 }}
              title={dateiArtVon(x.e.pfad) ? `${x.e.pfad} – Klick: hier ansehen, Doppelklick: im Programm öffnen` : `${x.e.pfad} – Doppelklick öffnet`}
              onClick={() => dateiArtVon(x.e.pfad) && void dateiAnsehen(basis, x.pfad)}
              onDoubleClick={() => void oeffnePfad(verbinde(basis, x.pfad)).catch(() => undefined)}
            >
              <span className={`fo-baum-symbol ${dateiArt(x.e.pfad)}`}>
                <Symbol name={SYMBOL[dateiArt(x.e.pfad)]} />
              </span>
              <span className="fo-baum-name">{x.e.pfad}</span>
              {`${basis}|${x.pfad}` in entwuerfe && <span className="fo-ungespeichert"> ●</span>}
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
