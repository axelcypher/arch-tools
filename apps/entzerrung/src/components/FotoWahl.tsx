import { useEffect, useMemo, useState } from 'react';
import type { ProjektordnerZugriff } from '@core/platform/projektordner';
import { ordnerName, ordnerWaehlen, verbinde } from '@core/platform/projektordner';
import type { OrdnerEintrag } from '@core/projektdatei';
import { entzZuFoto, FOTO_ENDUNG } from '../projekt';
import { useEscSchliessen } from '@core/ui/Dialog';

/** so tief wird im Fotoordner gesucht */
const TIEFE = 10;

/**
 * Fotos eines Projekts: der Fotoordner (gemeinsame Einstellung, z. B. „09 Fotos“) mit allen Unterordnern. Je Foto
 * ist vermerkt, ob es daneben schon eine Entzerrung (.entz) gibt; ein Klick öffnet sie bzw. beginnt eine neue.
 */
export function FotoWahl({
  fs,
  projektordner,
  fotoordner,
  onFoto,
  onAnderesProjekt,
  onSchliessen,
}: {
  fs: ProjektordnerZugriff;
  projektordner: string;
  /** Fotoordner im Projekt (relativ) */
  fotoordner: string;
  /** `root` = Fotoordner (vollständig), `pfad` = Foto darin */
  onFoto: (root: string, pfad: string) => void;
  onAnderesProjekt: () => void;
  onSchliessen?: () => void;
}) {
  const [root, setRoot] = useState(() => verbinde(projektordner, fotoordner));
  const [eintraege, setEintraege] = useState<OrdnerEintrag[] | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [suche, setSuche] = useState('');
  const [lauf, setLauf] = useState(0);
  useEscSchliessen(onSchliessen);

  useEffect(() => {
    let aktuell = true;
    setEintraege(null);
    setFehler(null);
    fs.liste(root, TIEFE).then(
      (l) => aktuell && setEintraege(l),
      (e) => {
        if (!aktuell) return;
        setEintraege([]);
        setFehler(e instanceof Error ? e.message : String(e));
      },
    );
    return () => {
      aktuell = false;
    };
  }, [fs, root, lauf]);

  const { gruppen, anzahl } = useMemo(() => {
    const dateien = new Set((eintraege ?? []).filter((e) => !e.ordner).map((e) => e.pfad.toLowerCase()));
    const q = suche.trim().toLowerCase();
    const fotos = (eintraege ?? []).filter((e) => !e.ordner && FOTO_ENDUNG.test(e.pfad) && (!q || e.pfad.toLowerCase().includes(q)));
    const nachOrdner = new Map<string, { pfad: string; name: string; entz: boolean; geaendert: number }[]>();
    for (const f of fotos) {
      const teile = f.pfad.split('/');
      const name = teile.pop()!;
      const ordner = teile.join('/');
      if (!nachOrdner.has(ordner)) nachOrdner.set(ordner, []);
      nachOrdner.get(ordner)!.push({ pfad: f.pfad, name, entz: dateien.has(entzZuFoto(f.pfad).toLowerCase()), geaendert: f.geaendert ?? 0 });
    }
    const gruppen = [...nachOrdner.entries()].sort(([a], [b]) => a.localeCompare(b, 'de', { numeric: true })).map(([ordner, liste]) => ({ ordner, fotos: liste.sort((x, y) => x.name.localeCompare(y.name, 'de', { numeric: true })) }));
    return { gruppen, anzahl: fotos.length };
  }, [eintraege, suche]);

  const anderenOrdner = async () => {
    const p = await ordnerWaehlen('Ordner mit Fotos wählen');
    if (p) setRoot(p);
  };

  return (
    <div className="pw-ebene fw">
      <header className="fw-kopf">
        <div>
          <h2>Fotos</h2>
          <span className="muted small-text" title={root}>
            {ordnerName(projektordner)} › {root.startsWith(projektordner) ? root.slice(projektordner.length).replace(/^[\\/]/, '') || ordnerName(root) : root}
            {eintraege && ` · ${anzahl} ${anzahl === 1 ? 'Foto' : 'Fotos'}`}
          </span>
        </div>
        <input type="search" className="fw-suche" placeholder="Foto suchen …" value={suche} onChange={(e) => setSuche(e.target.value)} />
        <button onClick={() => setLauf((n) => n + 1)}>Neu einlesen</button>
        <button onClick={() => void anderenOrdner()} title="Fotos aus einem anderen Ordner">
          Anderer Ordner …
        </button>
        <button onClick={onAnderesProjekt}>Anderes Projekt</button>
        {onSchliessen && <button onClick={onSchliessen}>Schließen</button>}
      </header>
      <div className="fw-inhalt">
        {!eintraege && <p className="busy">Fotos werden gesucht …</p>}
        {fehler && (
          <p className="warning">
            Den Fotoordner gibt es nicht oder er ist nicht lesbar: {fehler}. Der Fotoordner ist eine gemeinsame Einstellung aller Apps – in ATLAS (Projekt) unter
            Einstellungen; mit „Anderer Ordner …“ lässt sich ein beliebiger wählen.
          </p>
        )}
        {eintraege && !fehler && !anzahl && <p className="muted">{suche ? 'Kein Foto passt zur Suche.' : 'Keine Fotos (JPEG, PNG, WebP) in diesem Ordner.'}</p>}
        {gruppen.map((g) => (
          <section key={g.ordner} className="fw-gruppe">
            <h3>{g.ordner || ordnerName(root)}</h3>
            <ul>
              {g.fotos.map((f) => (
                <li key={f.pfad}>
                  <button className="fw-foto" onClick={() => onFoto(root, f.pfad)} title={f.entz ? 'Entzerrung öffnen' : 'Neue Entzerrung mit diesem Foto'}>
                    <span className="fw-name">{f.name}</span>
                    {f.entz && <span className="fw-marke">entzerrt</span>}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
