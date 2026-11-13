import type { CSSProperties } from 'react';
import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { bezeichner, eigenschaft, text, zahl } from '../forma/dfm';
import type { Feld, Kasten } from '../forma/felder';
import { abschnitte, kaesten, ohneKuerzel } from '../forma/felder';
import { bild, blatt, drehung, farbe, lage, seitenMasse } from '../forma/darstellung';
import { umgebend, useMarkierung } from '../markierung';
import { feldTasten } from '../navigation';
import { abschnittId, alleFelder, feldTitel, gruppeVon, leeresProfil, profilSchluessel } from '../profil';
import { hatBedingung } from '../bedingung';
import { feldId, useEinrichten } from '../einrichten';
import { useAntrag } from '../antragStore';
import type { OffenesFormular } from '../store';
import { formularDatei, useFormulare, useProfil, wertVon } from '../store';
import type { Entfallen } from './EntfallInfo';
import { EntfallInfo, grundSignatur, hinweisPerF1, useEntfallen } from './EntfallInfo';
import { HinweisSymbol, hinweiseJeFeld, usePlausibel } from './Hinweise';
import { Symbol } from '@core/ui/Symbol';
import type { Plausi } from '../plausibel';
import type { Entfall } from '../entfall';
import { useVorbelegt } from '../merkmalAbgleich';
import { autofillFelder } from '../autofill';

/**
 * Formularansicht: jede Seite wie auf Papier – weiß, in den Schriften und an den Stellen aus der Datei, so wie
 * sie gedruckt aussieht. Textfelder und Kästchen sind direkt beschreibbar und farbig hinterlegt; was in der
 * Gliederung gezeigt wird, ist hervorgehoben bzw. umrandet.
 */
export function SeitenAnsicht({ offen, gesperrt }: { offen: OffenesFormular; gesperrt: boolean }) {
  const zoom = useFormulare((s) => s.zoom);
  const profil = useProfil(profilSchluessel(offen.formular, offen.name));
  const feldTitel = profil?.feldTitel;
  const markierung = useMarkierung((s) => s.markierung);
  const huelle = useRef<HTMLDivElement>(null);
  const [breite, setBreite] = useState(0);
  const einrichten = useEinrichten((s) => s.aktiv);
  const auswahl = useEinrichten((s) => s.auswahl);
  const waehlen = useEinrichten((s) => s.waehlen);

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
  // Autofill: Felder aus der Projektkarte und von Hand überschriebene
  const zustand = useAntrag((s) => s.projektdatei?.felder?.[formularDatei(offen.pfad)]);
  const autofill = useMemo(() => {
    const m = new Map<string, 'auto' | 'fixiert'>();
    for (const k of autofillFelder(offen.formular, offen.felder).keys()) m.set(k, zustand?.felder[k]?.manuell !== undefined && !zustand.ignorieren ? 'fixiert' : 'auto');
    return m;
  }, [offen.formular, offen.felder, zustand]);
  const markiert = useMemo(() => new Set(markierung?.felder), [markierung]);
  // Felder, die nach den Bedingungen (noch) nicht erforderlich sind – im Formular neutral statt farbig, mit Hinweis warum
  const entfall = useEntfallen(offen);
  const entfallen = useMemo(() => new Set(entfall.gruende.keys()), [entfall]);
  // offen: hängt an nicht festgelegten Antragsmerkmalen – gelb, mit Hinweis
  const offene = useMemo(() => new Set(entfall.offen.keys()), [entfall]);
  // Hinweise (Widersprüche, Abweichungen vom Antragsmerkmal) und vorbelegte Kästchen
  const hinweise = usePlausibel(offen);
  const vorbelegt = useVorbelegt(offen);
  // Info-Symbole (U-06): klein, rechts am Rahmen; gleicher Grund für mehrere Felder eines Abschnitts → ein Symbol
  const symbole = useMemo(() => offen.felder.map((felder) => symboleDerSeite(felder, entfall, hinweiseJeFeld(hinweise))), [offen.felder, entfall, hinweise]);

  // Einrichten: ausgewählte Felder (direkt, über ihre Gruppe oder ihren Abschnitt) und Abschnitte je Seite
  const abschnitteJeSeite = useMemo(() => offen.felder.map((f) => abschnitte(f)), [offen.felder]);
  const ausgewaehlt = useMemo(() => {
    const felder = new Set<string>();
    if (!einrichten) return { felder, rahmen: [] as { seite: number; r: { x: number; y: number; b: number; h: number } }[] };
    const p = { ...leeresProfil(), ...profil };
    const rahmen: { seite: number; r: { x: number; y: number; b: number; h: number } }[] = [];
    for (const id of auswahl) {
      if (id.startsWith('f:')) felder.add(id.slice(2));
      if (id.startsWith('g:')) {
        const g = p.gruppen?.find((x) => x.id === id.slice(2));
        for (const s of g ? alleFelder(p, g) : []) felder.add(s);
      }
    }
    abschnitteJeSeite.forEach((liste, seite) =>
      liste.forEach((a) => {
        const gruppe = auswahl.some((id) => {
          const g = id.startsWith('g:') ? p.gruppen?.find((x) => x.id === id.slice(2)) : undefined;
          return !!g && alleFelder(p, g).some((s) => a.felder.some((f) => f.schluessel === s));
        });
        if (auswahl.includes(`a:${abschnittId(a)}`)) {
          const r = a.rahmen ? lage(a.rahmen) : umgebend(a.felder.map((f) => lage(f.kasten)));
          if (r) rahmen.push({ seite, r });
        } else if (gruppe) {
          const r = umgebend(a.felder.filter((f) => felder.has(f.schluessel)).map((f) => lage(f.kasten)));
          if (r) rahmen.push({ seite, r });
        }
      }),
    );
    return { felder, rahmen };
  }, [einrichten, auswahl, profil, abschnitteJeSeite]);

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
    <div className={`fo-seiten${einrichten ? ' einrichten' : ''}${waehlen ? ' waehlen' : ''}`} ref={huelle} onKeyDown={(e) => hinweisPerF1(e) || tasten(e)}>
      {seiten.map((s) => (
        <section key={s.i} className="fo-blatt" data-seite={s.i}>
          <div className="fo-blatt-kopf" style={{ width: s.blatt.breite * faktor }}>
            Seite {s.i + 1} von {seiten.length}
          </div>
          <div className="fo-papier" style={{ width: s.blatt.breite, height: s.blatt.hoehe, zoom: faktor }}>
            {/* das Formular selbst wird nicht beschnitten – nur das Blatt an seinem Rand */}
            <div className="fo-satz" style={{ left: s.blatt.links, top: s.blatt.oben }}>
              {s.kaesten.map((k, n) => (
                <Element key={n} k={k} {...feldProps(offen, s.felder.get(k.o.name), markiert, feldTitel, entfallen, offene, autofill, vorbelegt)} gesperrt={gesperrt} />
              ))}
              {!einrichten &&
                symbole[s.i].map((x) =>
                  x.hinweise ? (
                    <HinweisSymbol key={x.key} className="fo-el" style={x.ort} hinweise={x.hinweise} info={x.felder.join(' ')} />
                  ) : (
                    <EntfallInfo
                      key={x.key}
                      className="fo-el"
                      style={x.ort}
                      offen={x.offen}
                      merkmale={entfall.merkmale}
                      gruende={x.gruende!}
                      text={entfall.text(x.felder[0])}
                      info={x.felder.join(' ')}
                    />
                  ),
                )}
              {(() => {
                const r = umrandung(s);
                return r && <div className="fo-el fo-umrandung" style={{ left: r.x - 4, top: r.y - 4, width: r.b + 8, height: r.h + 8 }} />;
              })()}
              {einrichten && (
                <EinrichtenSchicht
                  seite={s.i}
                  felder={offen.felder[s.i]}
                  profil={profil}
                  entfallen={entfallen}
                  ausgewaehlt={ausgewaehlt.felder}
                  rahmen={ausgewaehlt.rahmen.filter((x) => x.seite === s.i).map((x) => x.r)}
                  waehlen={waehlen}
                />
              )}
            </div>
          </div>
        </section>
      ))}
    </div>
  );
}

interface SymbolOrt {
  key: string;
  felder: string[];
  ort: CSSProperties;
  gruende?: Entfall[];
  offen?: boolean;
  hinweise?: Plausi[];
}

/**
 * Info-Symbole einer Seite (U-06): Felder eines Abschnitts mit gleichem Grund teilen sich ein Symbol – entfällt der
 * ganze Abschnitt aus demselben Grund, steht es oben rechts am Rahmen; sonst rechts am Rahmen in der Zeile des ersten
 * Felds (Textfelder: oben rechts im Feld). So verdecken die Symbole weder Kästchen noch Beschriftung („3-fach“).
 * Felder mit eigenem Grund behalten ihr eigenes Symbol.
 */
function symboleDerSeite(felder: Feld[], entfall: Entfallen, hinweise: Map<string, Plausi[]>): SymbolOrt[] {
  const out: SymbolOrt[] = [];
  const rechtsAmRahmen = (f: Feld, a: { rahmen: Kasten | null }, versatz = 0): CSSProperties => {
    const l = lage(f.kasten);
    if (f.art === 'text') return { left: l.x + l.b - 14 - versatz, top: l.y + 2 };
    const r = a.rahmen ? lage(a.rahmen) : null;
    return r ? { left: r.x + r.b - 16 - versatz, top: l.y + 1 } : { left: l.x + l.b + 2 + versatz, top: l.y + 1 };
  };
  for (const a of abschnitte(felder)) {
    const gruppen = new Map<string, { felder: Feld[]; gruende: Entfall[]; offen: boolean }>();
    for (const f of a.felder) {
      const offen = !entfall.gruende.has(f.schluessel) && entfall.offen.has(f.schluessel);
      const gruende = entfall.gruende.get(f.schluessel) ?? entfall.offen.get(f.schluessel);
      if (!gruende) continue;
      const sig = grundSignatur(gruende, offen);
      const g = gruppen.get(sig) ?? { felder: [], gruende, offen };
      g.felder.push(f);
      gruppen.set(sig, g);
    }
    for (const [sig, g] of gruppen) {
      const ganz = g.felder.length === a.felder.length && g.felder.length > 1 && a.rahmen;
      const r = a.rahmen ? lage(a.rahmen) : null;
      const ort = ganz && r ? { left: r.x + r.b - 16, top: r.y + 3 } : rechtsAmRahmen(g.felder[0], a);
      out.push({ key: `${abschnittId(a)}|${sig}`, felder: g.felder.map((f) => f.schluessel), ort, gruende: g.gruende, offen: g.offen });
    }
    // Hinweise (Widersprüche, Abweichungen) am Feld – etwas links vom Info-Symbol
    for (const f of a.felder) {
      const h = hinweise.get(f.schluessel);
      if (h?.length) out.push({ key: `h|${f.schluessel}`, felder: [f.schluessel], ort: rechtsAmRahmen(f, a, 16), hinweise: h });
    }
  }
  return out;
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
/**
 * Einrichten: über jedem Feld eine Fläche zum Auswählen (mit Strg/Umschalt mehrere); wird gerade ein Feld für eine
 * Bedingung gewählt, übernimmt ein Klick das Feld. Markiert: gewählt, mit Bedingung, zählt nicht, entfällt.
 */
function EinrichtenSchicht({
  felder,
  profil,
  entfallen,
  ausgewaehlt,
  rahmen,
  waehlen,
}: {
  seite: number;
  felder: Feld[];
  profil: ReturnType<typeof leeresProfil> | undefined;
  entfallen: Set<string>;
  ausgewaehlt: Set<string>;
  rahmen: { x: number; y: number; b: number; h: number }[];
  waehlen: ((schluessel: string) => void) | null;
}) {
  const p = { ...leeresProfil(), ...profil };
  const { auswaehlen, waehlenAbbrechen } = useEinrichten.getState();
  return (
    <>
      {rahmen.map((r, i) => (
        <div key={`r${i}`} className="fo-el fo-ein-rahmen" style={{ left: r.x - 5, top: r.y - 5, width: r.b + 10, height: r.h + 10 }} />
      ))}
      {felder.map((f) => {
        const l = lage(f.kasten);
        const titel = feldTitel(f, p);
        const bedingt = hatBedingung(p.bedingungen?.[f.schluessel]);
        const zaehltNicht = p.zaehlt[f.schluessel] === false && !gruppeVon(p, f.schluessel);
        return (
          <button
            key={f.schluessel}
            type="button"
            className={`fo-el fo-ein-feld${ausgewaehlt.has(f.schluessel) ? ' gewaehlt' : ''}${bedingt ? ' bedingt' : ''}${zaehltNicht ? ' zaehlt-nicht' : ''}${gruppeVon(p, f.schluessel) ? ' gruppiert' : ''}${entfallen.has(f.schluessel) ? ' entfaellt' : ''}`}
            style={{ left: l.x - 1, top: l.y - 1, width: l.b + 2, height: l.h + 2 }}
            data-ein={f.schluessel}
            aria-label={waehlen ? `${titel} wählen` : `${titel} einrichten`}
            aria-pressed={ausgewaehlt.has(f.schluessel)}
            title={waehlen ? `„${titel}“ für die Bedingung wählen` : `${titel} – klicken zum Einrichten, Strg/Umschalt: mehrere`}
            onClick={(e) => {
              if (waehlen) {
                waehlen(f.schluessel);
                waehlenAbbrechen();
              } else auswaehlen(feldId(f.schluessel), e.ctrlKey || e.metaKey || e.shiftKey);
            }}
          >
            {bedingt && (
              <span className="fo-ein-bed" aria-hidden>
                <Symbol name="bedingung" />
              </span>
            )}
          </button>
        );
      })}
    </>
  );
}

function feldProps(
  o: OffenesFormular,
  feld: Feld | undefined,
  markiert: Set<string>,
  titel: Record<string, string> | undefined,
  entfallen: Set<string>,
  offene: Set<string>,
  autofill: Map<string, 'auto' | 'fixiert'>,
  vorbelegt: Set<string>,
): Pick<ElementProps, 'feld' | 'wert' | 'geaendert' | 'markiert' | 'titel' | 'entfaellt' | 'offen' | 'autofill' | 'vorbelegt'> {
  return feld
    ? {
        feld,
        wert: wertVon(o, feld),
        geaendert: feld.schluessel in o.aenderungen,
        markiert: markiert.has(feld.schluessel),
        titel: titel?.[feld.schluessel]?.trim() || feld.beschriftung,
        entfaellt: entfallen.has(feld.schluessel),
        offen: offene.has(feld.schluessel),
        autofill: autofill.get(feld.schluessel),
        vorbelegt: vorbelegt.has(feld.schluessel),
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
  /** nach den Bedingungen nicht erforderlich */
  entfaellt?: boolean;
  /** hängt an nicht festgelegten Antragsmerkmalen (gilt als erforderlich) */
  offen?: boolean;
  /** aus einem Antragsmerkmal vorbelegt (Vorschlag, bitte prüfen) */
  vorbelegt?: boolean;
  /** Wert aus der Projektkarte (auto) bzw. von Hand überschrieben (fixiert) */
  autofill?: 'auto' | 'fixiert';
  gesperrt: boolean;
}

const AUTOFILL_TEXT = { auto: 'Wert aus der Projektkarte', fixiert: 'von Hand überschrieben (bleibt beim Aktualisieren)' };

const Element = memo(function Element({ k, feld, wert, geaendert, markiert, titel, entfaellt, offen, autofill, vorbelegt, gesperrt }: ElementProps) {
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
          className={`fo-el fo-memo${geaendert ? ' geaendert' : ''}${markiert ? ' markiert' : ''}${entfaellt ? ' entfaellt' : ''}${offen ? ' offen' : ''}${autofill ? ` ${autofill}` : ''}`}
          style={{ ...pos, ...schrift(k), textAlign: AUSRICHTUNG[bezeichner(k.o, 'Alignment') ?? ''] }}
          value={typeof wert === 'string' ? wert : ''}
          disabled={gesperrt || feld.berechnet}
          title={autofill ? `${titel} – ${AUTOFILL_TEXT[autofill]}` : titel}
          aria-label={feld.beschriftung}
          data-feld={feld.schluessel}
          spellCheck={false}
          wrap={bezeichner(k.o, 'WordWrap') === 'False' ? 'off' : 'soft'}
          // wie in FORMA: in einzeiligen Feldern (WantReturns = False) erzeugt Enter keinen Zeilenumbruch
          onKeyDown={(e) => feld.einzeilig && e.key === 'Enter' && e.preventDefault()}
          onChange={(e) => wertSetzen(feld, e.target.value)}
          onBlur={() => useFormulare.getState().feldVerlassen(feld)}
        />
      );
    }
    case 'TCheckBox': {
      if (!feld) return null;
      const rechts = bezeichner(k.o, 'Alignment') !== 'taLeftJustify';
      return (
        <label
          className={`fo-el fo-check${geaendert ? ' geaendert' : ''}${markiert ? ' markiert' : ''}${entfaellt ? ' entfaellt' : ''}${offen ? ' offen' : ''}${vorbelegt ? ' vorbelegt' : ''}${rechts ? '' : ' links'}`}
          style={{ ...pos, ...schrift(k) }}
          title={
            vorbelegt
              ? `${titel} – aus dem Antragsmerkmal vorbelegt, bitte prüfen`
              : entfaellt
                ? `${titel} – nicht erforderlich`
                : offen
                  ? `${titel} – ungeklärt (hängt von Antragsmerkmalen ab)`
                  : titel
          }
        >
          <input
            type="checkbox"
            checked={wert === true}
            disabled={gesperrt || feld.berechnet}
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
