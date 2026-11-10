import type { CSSProperties } from 'react';
import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { bezeichner, eigenschaft, text, zahl } from '../forma/dfm';
import type { Feld, Kasten } from '../forma/felder';
import { abschnitte, kaesten, ohneKuerzel } from '../forma/felder';
import { bild, blatt, drehung, farbe, lage, seitenMasse } from '../forma/darstellung';
import { umgebend, useMarkierung } from '../markierung';
import { feldTasten } from '../navigation';
import { feldErforderlich, formularKontext, leeresProfil, profilSchluessel } from '../profil';
import { useAntrag } from '../antragStore';
import type { OffenesFormular } from '../store';
import { useFormulare, wertVon } from '../store';

/**
 * Formularansicht: jede Seite wie auf Papier – weiß, in den Schriften und an den Stellen aus der Datei, so wie
 * sie gedruckt aussieht. Textfelder und Kästchen sind direkt beschreibbar und farbig hinterlegt; was in der
 * Gliederung gezeigt wird, ist hervorgehoben bzw. umrandet.
 */
export function SeitenAnsicht({ offen, gesperrt }: { offen: OffenesFormular; gesperrt: boolean }) {
  const zoom = useFormulare((s) => s.zoom);
  const profil = useFormulare((s) => s.profile[profilSchluessel(offen.formular, offen.name)]);
  const feldTitel = profil?.feldTitel;
  const merkmale = useAntrag((s) => s.projektdatei?.merkmale);
  const markierung = useMarkierung((s) => s.markierung);
  const huelle = useRef<HTMLDivElement>(null);
  const [breite, setBreite] = useState(0);

  const seiten = useMemo(
    () =>
      offen.formular.seiten.map((s, i) => {
        const k = kaesten(s);
        return {
          i,
          kaesten: k,
          blatt: blatt(seitenMasse(k)),
          felder: new Map(offen.felder[i].map((f) => [f.name, f])),
          nachSchluessel: new Map(offen.felder[i].map((f) => [f.schluessel, f])),
        };
      }),
    [offen.formular, offen.felder],
  );
  const tasten = useMemo(() => feldTasten(offen.felder.flat()), [offen.felder]);
  const markiert = useMemo(() => new Set(markierung?.felder), [markierung]);
  // Felder, die nach den Bedingungen (noch) nicht erforderlich sind – im Formular neutral statt farbig
  const entfallen = useMemo(() => {
    const out = new Set<string>();
    if (!profil) return out;
    const p = { ...leeresProfil(), ...profil };
    const k = formularKontext(merkmale ?? {}, offen.felder.flat(), (f) => wertVon(offen, f));
    for (const seite of offen.felder) for (const a of abschnitte(seite)) for (const f of a.felder) if (!feldErforderlich(f, a, p, k)) out.add(f.schluessel);
    return out;
  }, [profil, merkmale, offen]);

  // umrandeter Bereich je Seite: der Rahmen des Abschnitts bzw. das Rechteck um die Felder
  const umrandung = (s: (typeof seiten)[number]) => {
    if (!markierung?.rahmen) return null;
    if (markierung.bereich) return markierung.bereich.seite === s.i ? lage(markierung.bereich.kasten) : null;
    return umgebend(markierung.felder.flatMap((m) => (s.nachSchluessel.has(m) ? [lage(s.nachSchluessel.get(m)!.kasten)] : [])));
  };

  // umrandeten Bereich ins Bild holen
  useEffect(() => {
    if (markierung?.rahmen) huelle.current?.querySelector('.fo-umrandung')?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
  }, [markierung]);

  // „an Breite anpassen“: verfügbare Breite beobachten
  useEffect(() => {
    const el = huelle.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => setBreite(el.clientWidth));
    ro.observe(el);
    setBreite(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const papier = Math.max(...seiten.map((s) => s.blatt.breite));
  const faktor = zoom > 0 ? zoom : breite > 0 ? Math.max(0.4, Math.min(2.5, (breite - 48) / papier)) : 1;

  return (
    <div className="fo-seiten" ref={huelle} onKeyDown={tasten}>
      {seiten.map((s) => (
        <section key={s.i} className="fo-blatt" data-seite={s.i}>
          <div className="fo-blatt-kopf" style={{ width: s.blatt.breite * faktor }}>
            Seite {s.i + 1} von {seiten.length}
          </div>
          <div className="fo-papier" style={{ width: s.blatt.breite, height: s.blatt.hoehe, zoom: faktor }}>
            {/* das Formular selbst wird nicht beschnitten – nur das Blatt an seinem Rand */}
            <div className="fo-satz" style={{ left: s.blatt.links, top: s.blatt.oben }}>
              {s.kaesten.map((k, n) => (
                <Element key={n} k={k} {...feldProps(offen, s.felder.get(k.o.name), markiert, feldTitel, entfallen)} gesperrt={gesperrt} />
              ))}
              {(() => {
                const r = umrandung(s);
                return r && <div className="fo-el fo-umrandung" style={{ left: r.x - 4, top: r.y - 4, width: r.b + 8, height: r.h + 8 }} />;
              })()}
            </div>
          </div>
        </section>
      ))}
    </div>
  );
}

function schrift(k: Kasten): CSSProperties {
  const hoehe = zahl(k.o, 'Font.Height');
  const stil = eigenschaft(k.o, 'Font.Style')?.wert;
  const name = text(k.o, 'Font.Name');
  const stile = stil?.art === 'menge' ? stil.elemente : [];
  return {
    // Delphi: negative Höhe = Zeichenhöhe in Pixeln (entspricht der CSS-Schriftgröße)
    fontSize: hoehe ? Math.abs(hoehe) : undefined,
    fontWeight: stile.includes('fsBold') ? 700 : undefined,
    fontStyle: stile.includes('fsItalic') ? 'italic' : undefined,
    textDecoration: [stile.includes('fsUnderline') && 'underline', stile.includes('fsStrikeOut') && 'line-through'].filter(Boolean).join(' ') || undefined,
    fontFamily: name ? `'${name}', ${/courier/i.test(name) ? 'monospace' : 'sans-serif'}` : undefined,
    color: farbe(k.o, 'Font.Color'),
  };
}

const AUSRICHTUNG: Record<string, CSSProperties['textAlign']> = { taRightJustify: 'right', taCenter: 'center' };
const LINIE: Record<string, CSSProperties> = {
  bsBottomLine: { borderBottom: '1px solid var(--p-linie)' },
  bsTopLine: { borderTop: '1px solid var(--p-linie)' },
  bsLeftLine: { borderLeft: '1px solid var(--p-linie)' },
  bsRightLine: { borderRight: '1px solid var(--p-linie)' },
  bsFrame: { border: '1px solid var(--p-linie)' },
  bsBox: { border: '1px solid var(--p-linie)' },
  bsSpacer: {},
};

/**
 * Beschriftung. Delphi bricht ohne WordWrap nur an festen Zeilenumbrüchen um; ist der Text im Browser etwas
 * breiter als in Windows gemessen, wird er gestaucht statt umbrochen – sonst überlappt er Nachbarn.
 */
function Beschriftung({ k, style, inhalt }: { k: Kasten; style: CSSProperties; inhalt: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const umbruch = bezeichner(k.o, 'WordWrap') === 'True';
  const [stauchung, setStauchung] = useState(1);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || umbruch) return;
    el.style.transform = '';
    const zuViel = el.scrollWidth - el.clientWidth;
    setStauchung(zuViel > 0.5 && el.clientWidth > 0 ? el.clientWidth / el.scrollWidth : 1);
  }, [inhalt, umbruch]);
  const ursprung = style.textAlign === 'right' ? 'right' : style.textAlign === 'center' ? 'center' : 'left';
  return (
    <div
      ref={ref}
      className="fo-el fo-label"
      style={{ ...style, whiteSpace: umbruch ? 'pre-wrap' : 'pre', ...(stauchung < 1 ? { transform: `scaleX(${stauchung})`, transformOrigin: `${ursprung} top` } : {}) }}
    >
      {inhalt}
    </div>
  );
}

function Bild({ k, style }: { k: Kasten; style: CSSProperties }) {
  const url = useMemo(() => {
    const b = bild(k.o);
    return b && typeof URL.createObjectURL === 'function' ? URL.createObjectURL(new Blob([b.daten as BlobPart], { type: b.typ })) : null;
  }, [k.o]);
  useEffect(() => () => void (url && URL.revokeObjectURL(url)), [url]);
  const strecken = bezeichner(k.o, 'Stretch') === 'True';
  return url ? <img className="fo-el fo-bild" style={{ ...style, objectFit: strecken ? 'fill' : 'contain', objectPosition: 'left top' }} src={url} alt="" /> : null;
}

/** Nur Felder hängen vom Formularzustand ab – so zeichnet ein Tastendruck nur das eine Element neu */
function feldProps(
  o: OffenesFormular,
  feld: Feld | undefined,
  markiert: Set<string>,
  titel: Record<string, string> | undefined,
  entfallen: Set<string>,
): Pick<ElementProps, 'feld' | 'wert' | 'geaendert' | 'markiert' | 'titel' | 'entfaellt'> {
  return feld
    ? {
        feld,
        wert: wertVon(o, feld),
        geaendert: feld.schluessel in o.aenderungen,
        markiert: markiert.has(feld.schluessel),
        titel: titel?.[feld.schluessel]?.trim() || feld.beschriftung,
        entfaellt: entfallen.has(feld.schluessel),
      }
    : {};
}

interface ElementProps {
  k: Kasten;
  feld?: Feld;
  wert?: string | boolean;
  geaendert?: boolean;
  /** in der Gliederung gezeigt */
  markiert?: boolean;
  /** Titel des Felds (eigener aus dem Profil oder die erkannte Beschriftung) */
  titel?: string;
  /** nach den Bedingungen (noch) nicht erforderlich */
  entfaellt?: boolean;
  gesperrt: boolean;
}

const Element = memo(function Element({ k, feld, wert, geaendert, markiert, titel, entfaellt, gesperrt }: ElementProps) {
  const wertSetzen = useFormulare((s) => s.wertSetzen);
  const l = lage(k);
  const pos: CSSProperties = { left: l.x, top: l.y, width: l.b, height: l.h };
  const caption = ohneKuerzel(text(k.o, 'Caption') ?? '');
  const hintergrund = farbe(k.o, 'Color');

  switch (k.o.klasse) {
    case 'TPanel': {
      const ohneRand = bezeichner(k.o, 'BevelOuter') === 'bvNone' && bezeichner(k.o, 'BorderStyle') !== 'bsSingle';
      return <div className="fo-el fo-panel" style={{ ...pos, background: hintergrund !== '#ffffff' ? hintergrund : undefined, border: ohneRand ? 'none' : undefined }} />;
    }
    case 'TBevel':
      return <div className="fo-el" style={{ ...pos, ...(LINIE[bezeichner(k.o, 'Shape') ?? ''] ?? { border: '1px solid var(--p-linie)' }) }} />;
    case 'TLabel':
    case 'TExtendedLabel': {
      const d = k.o.klasse === 'TExtendedLabel' ? drehung(k.o) : 0;
      const transparent = bezeichner(k.o, 'Transparent') === 'True';
      const style: CSSProperties = {
        ...pos,
        ...schrift(k),
        textAlign: AUSRICHTUNG[bezeichner(k.o, 'Alignment') ?? ''],
        background: !transparent && hintergrund && hintergrund !== '#ffffff' ? hintergrund : undefined,
        // 270° liest von oben nach unten, 90° von unten nach oben
        ...(d === 270 ? { writingMode: 'vertical-rl' } : d === 90 ? { writingMode: 'vertical-rl', transform: 'rotate(180deg)' } : {}),
      };
      return d ? (
        <div className="fo-el fo-label" style={{ ...style, whiteSpace: 'pre' }}>
          {caption}
        </div>
      ) : (
        <Beschriftung k={k} style={style} inhalt={caption} />
      );
    }
    case 'TMemo': {
      if (!feld) return null;
      return (
        <textarea
          className={`fo-el fo-memo${geaendert ? ' geaendert' : ''}${markiert ? ' markiert' : ''}${entfaellt ? ' entfaellt' : ''}`}
          style={{ ...pos, ...schrift(k), textAlign: AUSRICHTUNG[bezeichner(k.o, 'Alignment') ?? ''] }}
          value={typeof wert === 'string' ? wert : ''}
          disabled={gesperrt}
          title={titel}
          aria-label={feld.beschriftung}
          data-feld={feld.schluessel}
          spellCheck={false}
          wrap={bezeichner(k.o, 'WordWrap') === 'False' ? 'off' : 'soft'}
          // wie in FORMA: in einzeiligen Feldern (WantReturns = False) erzeugt Enter keinen Zeilenumbruch
          onKeyDown={(e) => feld.einzeilig && e.key === 'Enter' && e.preventDefault()}
          onChange={(e) => wertSetzen(feld, e.target.value)}
        />
      );
    }
    case 'TCheckBox': {
      if (!feld) return null;
      const rechts = bezeichner(k.o, 'Alignment') !== 'taLeftJustify';
      return (
        <label className={`fo-el fo-check${geaendert ? ' geaendert' : ''}${markiert ? ' markiert' : ''}${entfaellt ? ' entfaellt' : ''}${rechts ? '' : ' links'}`} style={{ ...pos, ...schrift(k) }} title={entfaellt ? `${titel} – nicht erforderlich` : titel}>
          <input
            type="checkbox"
            checked={wert === true}
            disabled={gesperrt}
            aria-label={feld.beschriftung}
            data-feld={feld.schluessel}
            onChange={(e) => wertSetzen(feld, e.target.checked)}
          />
          {caption && <span>{caption}</span>}
        </label>
      );
    }
    case 'TImage':
      return <Bild k={k} style={pos} />;
    default:
      // Schaltflächen (Erläuterungen in FORMA) und Unbekanntes erscheinen nicht auf dem Papier
      return null;
  }
});
