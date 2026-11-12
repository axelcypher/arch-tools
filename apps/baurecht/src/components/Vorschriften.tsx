import { useMemo, useState } from 'react';
import type { Ampel, NormErgebnis, ParagrafErgebnis } from '@core/baurecht/typen';
import { EBENEN, THEMEN } from '@core/baurecht/typen';
import type { Pruefstand } from '../pruefung';
import { useBaurecht } from '../store';
import { AMPEL_TEXT, AmpelMarke, datum } from './Ampel';

type Gruppierung = 'ebene' | 'thema';

const SPEICHER = 'baurecht:vorschriften';

function gemerkt(): { gruppierung: Gruppierung; ampeln: Ampel[] } {
  try {
    const r = JSON.parse(localStorage.getItem(SPEICHER) ?? '{}') as { gruppierung?: Gruppierung; ampeln?: Ampel[] };
    return { gruppierung: r.gruppierung === 'thema' ? 'thema' : 'ebene', ampeln: Array.isArray(r.ampeln) && r.ampeln.length ? r.ampeln : ['rot', 'gelb', 'gruen'] };
  } catch {
    return { gruppierung: 'ebene', ampeln: ['rot', 'gelb', 'gruen'] };
  }
}

function merken(w: { gruppierung: Gruppierung; ampeln: Ampel[] }) {
  try {
    localStorage.setItem(SPEICHER, JSON.stringify(w));
  } catch {
    // nur für diese Sitzung
  }
}

function ParagrafZeile({ p, gewaehlt }: { p: ParagrafErgebnis; gewaehlt: boolean }) {
  const vonHand = !!p.festlegung;
  return (
    <li>
      <button type="button" className={`br-paragraf${gewaehlt ? ' br-gewaehlt' : ''}`} aria-current={gewaehlt ? 'true' : undefined} onClick={() => useBaurecht.getState().waehlen(p.id)}>
        <AmpelMarke ampel={p.ampel} klein vonHand={vonHand} />
        <span className="br-paragraf-nr">§ {p.paragraf}</span>
        <span className="br-paragraf-titel">{p.titel || '–'}</span>
        <span className="br-paragraf-grund">{p.gruende[0]}</span>
        <span className="br-paragraf-marken">
          {vonHand && (
            <span className={`br-marke${p.festlegung?.bestaetigt ? '' : ' br-marke-entwurf'}`} title={p.festlegung?.bestaetigt ? `von Hand festgelegt (${p.festlegung.von})` : 'von Hand festgelegt – Entwurf, wird beim Speichern bestätigt'}>
              von Hand
            </span>
          )}
          {p.ueberholt && (
            <span className="br-marke br-marke-warn" title={`Festlegung überholt: ${p.ueberholt}`}>
              überholt
            </span>
          )}
          {p.geaendert.length > 0 && (
            <span className="br-marke br-marke-warn" title="Text seit der Prüfung der Regel geändert">
              Text geändert
            </span>
          )}
          {p.ampel === 'rot' && p.behoerde === 'nein' && (
            <span className="br-marke" title="wird von der Bauaufsicht nicht geprüft – eigene Verantwortung">
              eigene Verantwortung
            </span>
          )}
        </span>
      </button>
    </li>
  );
}

function NormKarte({ n, sichtbar, offen, umschalten, gewaehlt }: { n: NormErgebnis; sichtbar: ParagrafErgebnis[]; offen: boolean; umschalten: () => void; gewaehlt: string | null }) {
  const laedt = useBaurecht((s) => s.laedt.includes(n.id));
  const id = `br-norm-${n.id.replace(/[^\w-]/g, '_')}`;
  return (
    <section className={`br-norm${n.geltung === 'nein' ? ' br-norm-entfaellt' : ''}`} aria-labelledby={id}>
      <button type="button" className="br-norm-kopf" aria-expanded={offen} onClick={umschalten}>
        <span className="br-norm-pfeil" aria-hidden="true">
          {offen ? '▾' : '▸'}
        </span>
        <span className="br-norm-name" id={id}>
          <strong>{n.def.kurz}</strong> <span className="br-leise">{n.def.titel}</span>
        </span>
        <span className="br-zaehler" aria-label={`${n.zaehler.rot} gilt, ${n.zaehler.gelb} prüfen, ${n.zaehler.gruen} entfällt`}>
          {(['rot', 'gelb', 'gruen'] as const).map((a) =>
            n.zaehler[a] ? (
              <span key={a} className={`br-zahl-chip br-chip-${a}`} title={`${n.zaehler[a]} ${AMPEL_TEXT[a]}`}>
                {n.zaehler[a]}
              </span>
            ) : null,
          )}
        </span>
      </button>
      {offen && (
        <div className="br-norm-inhalt">
          <div className="br-norm-info">
            {n.def.erlassen && <span>erlassen von {n.def.erlassen}</span>}
            {laedt && <span className="br-laedt">Text wird geholt …</span>}
            {n.fassung && (
              <span>
                Fassung {n.fassung.text}
                {n.fassung.texterkennung ? ' · Text aus Texterkennung' : ''}
              </span>
            )}
            {!laedt && n.ohneText && <span className="br-warn-text">Text nicht verfügbar{n.fehler ? ` – ${n.fehler}` : ''}</span>}
            {n.fassung && n.fehler && <span className="br-warn-text" title={n.fehler}>letzter Abruf fehlgeschlagen – Stand {datum(n.fassung.abgerufen)}</span>}
            {n.kuenftige?.map((k) => (
              <span key={k.gueltigAb} className="br-warn-text">
                neue Fassung ab {datum(k.gueltigAb)}
              </span>
            ))}
            {n.geltung === 'nein' && <span>entfällt: {n.geltungGrund ?? 'Anwendungsbereich nicht berührt'}</span>}
            {n.ohneRegel && <span className="br-warn-text">Für diese Norm gibt es noch keine Regeldatei – von Hand beurteilen.</span>}
          </div>
          {sichtbar.length ? (
            <ul className="br-paragrafen">
              {sichtbar.map((p) => (
                <ParagrafZeile key={p.id} p={p} gewaehlt={gewaehlt === p.id} />
              ))}
            </ul>
          ) : (
            <p className="br-leise br-leer">Keine Paragrafen in diesem Filter.</p>
          )}
        </div>
      )}
    </section>
  );
}

/** Vorschriften nach Ebene oder Thema, je Norm die Paragrafen mit Ampel */
export function Vorschriften({ stand }: { stand: Pruefstand }) {
  const auswahl = useBaurecht((s) => s.auswahl);
  const [w, setW] = useState(gemerkt);
  const [suche, setSuche] = useState('');
  const [nurHand, setNurHand] = useState(false);
  const [nurGeaendert, setNurGeaendert] = useState(false);
  const [zu, setZu] = useState<Set<string>>(new Set());
  const setze = (n: typeof w) => {
    setW(n);
    merken(n);
  };
  const { auswertung } = stand;
  const filter = (p: ParagrafErgebnis, n: NormErgebnis) =>
    w.ampeln.includes(p.ampel) &&
    (!nurHand || !!p.festlegung) &&
    (!nurGeaendert || p.geaendert.length > 0 || !!p.ueberholt) &&
    (!suche || `§ ${p.paragraf} ${p.titel} ${n.def.kurz} ${n.def.titel} ${p.gruende.join(' ')}`.toLowerCase().includes(suche.toLowerCase()));
  const gruppen = useMemo(() => {
    const liste = w.gruppierung === 'ebene' ? EBENEN.map((e) => ({ id: e.id, titel: e.titel, normen: auswertung.normen.filter((n) => n.ebene === e.id) })) : THEMEN.map((t) => ({ id: t.id, titel: t.titel, normen: auswertung.normen.filter((n) => n.def.thema === t.id) }));
    return liste.filter((g) => g.normen.length);
  }, [auswertung.normen, w.gruppierung]);
  const modulName = (id: string) => stand.module.find((m) => m.id === id)?.name ?? id;
  const zaehler = auswertung.zaehler;
  return (
    <main className="br-vorschriften" aria-label="Vorschriften">
      <div className="br-filter" role="toolbar" aria-label="Filter">
        <span className="br-segment" role="group" aria-label="Ampel">
          {(['rot', 'gelb', 'gruen'] as const).map((a) => {
            const an = w.ampeln.includes(a);
            return (
              <button
                key={a}
                type="button"
                aria-pressed={an}
                className={`br-filter-ampel br-chip-${a}${an ? ' active' : ''}`}
                onClick={() => setze({ ...w, ampeln: an ? (w.ampeln.length > 1 ? w.ampeln.filter((x) => x !== a) : w.ampeln) : [...w.ampeln, a] })}
              >
                <span className="br-ampel-punkt" aria-hidden="true" /> {AMPEL_TEXT[a]} <span className="br-leise">{zaehler[a]}</span>
              </button>
            );
          })}
        </span>
        <label className="toggle">
          <input type="checkbox" checked={nurHand} onChange={(e) => setNurHand(e.target.checked)} /> von Hand
        </label>
        <label className="toggle">
          <input type="checkbox" checked={nurGeaendert} onChange={(e) => setNurGeaendert(e.target.checked)} /> geändert/überholt
        </label>
        <span className="tb-spacer" />
        <span className="br-segment" role="group" aria-label="Gruppierung">
          <button type="button" className={w.gruppierung === 'ebene' ? 'active' : ''} aria-pressed={w.gruppierung === 'ebene'} onClick={() => setze({ ...w, gruppierung: 'ebene' })}>
            nach Ebene
          </button>
          <button type="button" className={w.gruppierung === 'thema' ? 'active' : ''} aria-pressed={w.gruppierung === 'thema'} onClick={() => setze({ ...w, gruppierung: 'thema' })}>
            nach Thema
          </button>
        </span>
        <input className="br-suchfeld" type="search" placeholder="§ oder Stichwort …" value={suche} onChange={(e) => setSuche(e.target.value)} aria-label="Vorschriften durchsuchen" />
      </div>
      <div className="br-vorschriften-liste">
        {gruppen.map((g) => {
          const normen = g.normen.map((n) => ({ n, sichtbar: n.paragrafen.filter((p) => filter(p, n)) })).filter((x) => x.sichtbar.length || (!suche && !nurHand && !nurGeaendert && (x.n.ohneRegel ? w.ampeln.includes('gelb') : false)));
          if (!normen.length) return null;
          return (
            <section key={g.id} className="br-gruppe" aria-labelledby={`br-gruppe-${g.id}`}>
              <h2 id={`br-gruppe-${g.id}`}>
                {g.titel}
                {w.gruppierung === 'ebene' && [...new Set(g.normen.map((n) => modulName(n.modul)))].filter((m) => m !== g.titel).length > 0 && (
                  <span className="br-leise"> · {[...new Set(g.normen.map((n) => modulName(n.modul)))].join(', ')}</span>
                )}
              </h2>
              {normen.map(({ n, sichtbar }) => (
                <NormKarte
                  key={n.id}
                  n={n}
                  sichtbar={sichtbar}
                  offen={!zu.has(n.id)}
                  gewaehlt={auswahl}
                  umschalten={() => {
                    const s = new Set(zu);
                    if (s.has(n.id)) s.delete(n.id);
                    else s.add(n.id);
                    setZu(s);
                  }}
                />
              ))}
            </section>
          );
        })}
        {!gruppen.length && <p className="br-leer">Keine Vorschriften – das Regelpaket enthält für diese Lage noch kein Modul.</p>}
      </div>
    </main>
  );
}
