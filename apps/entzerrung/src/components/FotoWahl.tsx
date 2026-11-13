import { useEffect, useMemo, useRef, useState } from 'react';
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
  const [sortierung, setSortierung] = useState<'name' | 'datum'>('name');
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
    const gruppen = [...nachOrdner.entries()].sort(([a], [b]) => a.localeCompare(b, 'de', { numeric: true })).map(([ordner, liste]) => ({ ordner, fotos: liste.sort((x, y) => (sortierung === 'datum' ? y.geaendert - x.geaendert : 0) || x.name.localeCompare(y.name, 'de', { numeric: true })) }));
    return { gruppen, anzahl: fotos.length };
  }, [eintraege, suche, sortierung]);

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
        <input type="search" className="fw-suche" placeholder="Foto suchen …" aria-label="Fotos durchsuchen" value={suche} onChange={(e) => setSuche(e.target.value)} />
        <select value={sortierung} onChange={(e) => setSortierung(e.target.value as 'name' | 'datum')} aria-label="Sortierung" title="Sortierung der Fotos">
          <option value="name">nach Name</option>
          <option value="datum">neueste zuerst</option>
        </select>
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
            Den Fotoordner gibt es nicht oder er ist nicht lesbar: {fehler}. Der Fotoordner ist eine gemeinsame Einstellung aller Apps – in ATLAS (Projektordner) unter
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
                  <button className="fw-foto" onClick={() => onFoto(root, f.pfad)} title={`${f.pfad} – ${f.entz ? 'Entzerrung öffnen' : 'neue Entzerrung mit diesem Foto'}`}>
                    <Vorschau fs={fs} root={root} pfad={f.pfad} />
                    <span className="fw-text">
                      <span className="fw-name">{f.name}</span>
                      {f.geaendert > 0 && <span className="fw-datum">{new Date(f.geaendert).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' })}</span>}
                    </span>
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

/** höchstens so viele Vorschaubilder werden gleichzeitig gelesen */
const PARALLEL = 3;
let laufend = 0;
const warteschlange: (() => void)[] = [];
function nacheinander<T>(f: () => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const start = () => {
      laufend++;
      f()
        .then(resolve, reject)
        .finally(() => {
          laufend--;
          warteschlange.shift()?.();
        });
    };
    if (laufend < PARALLEL) start();
    else warteschlange.push(start);
  });
}

/** kleines Vorschaubild, erst gelesen, wenn es sichtbar wird */
function Vorschau({ fs, root, pfad }: { fs: ProjektordnerZugriff; root: string; pfad: string }) {
  const el = useRef<HTMLSpanElement>(null);
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    const knoten = el.current;
    if (!knoten || typeof IntersectionObserver === 'undefined') return;
    let aktiv = true;
    let u: string | null = null;
    const io = new IntersectionObserver((e) => {
      if (!e.some((x) => x.isIntersecting)) return;
      io.disconnect();
      void nacheinander(async () => {
        if (!aktiv) return;
        const daten = await fs.lies(root, pfad);
        const b = await createImageBitmap(new Blob([daten as BlobPart]), { resizeWidth: 96, resizeQuality: 'low', imageOrientation: 'from-image' });
        const c = document.createElement('canvas');
        c.width = b.width;
        c.height = b.height;
        c.getContext('2d')?.drawImage(b, 0, 0);
        b.close();
        const blob = await new Promise<Blob | null>((r) => c.toBlob(r, 'image/jpeg', 0.7));
        if (blob && aktiv) {
          u = URL.createObjectURL(blob);
          setUrl(u);
        }
      }).catch(() => undefined);
    });
    io.observe(knoten);
    return () => {
      aktiv = false;
      io.disconnect();
      if (u) URL.revokeObjectURL(u);
    };
  }, [fs, root, pfad]);
  return <span ref={el} className="fw-vorschau">{url && <img src={url} alt="" />}</span>;
}
