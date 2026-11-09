import type { CSSProperties, KeyboardEvent } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Aenderungen, Stil, Zelle } from '../../dokumente/xlsx';
import { alsZahl, formatieren, spaltenName, xlsxAendern, xlsxLesen, zellName } from '../../dokumente/xlsx';
import type { OffeneDatei } from '../../store';
import { useFormulare } from '../../store';
import { DateiKopf, useSpeichernTaste } from './DateiAnsicht';

/** höchstens so viele Zeilen/Spalten anzeigen (große Tabellen bleiben bedienbar) */
const MAX_ZEILEN = 1500;
const MAX_SPALTEN = 120;
/** Excel-Breite (Zeichen) → Pixel */
const px = (zeichen: number) => Math.round(zeichen * 7 + 5);

function zellStil(s: Stil | undefined): CSSProperties {
  if (!s) return {};
  const linie = '1px solid #333';
  return {
    fontWeight: s.fett ? 700 : undefined,
    fontStyle: s.kursiv ? 'italic' : undefined,
    textDecoration: s.unterstrichen ? 'underline' : undefined,
    fontSize: s.groesse ? `${Math.round(s.groesse * 1.25)}px` : undefined,
    color: s.farbe ?? undefined,
    background: s.fuellung ?? undefined,
    textAlign: s.ausrichtung ?? undefined,
    whiteSpace: s.umbruch ? 'pre-wrap' : 'pre',
    borderLeft: s.rahmen.l ? linie : undefined,
    borderRight: s.rahmen.r ? linie : undefined,
    borderTop: s.rahmen.o ? linie : undefined,
    borderBottom: s.rahmen.u ? linie : undefined,
  };
}

/**
 * Excel-Mappe: Blätter als Tabelle mit Spalten- und Zeilenköpfen, Formaten und verbundenen Zellen. Bearbeiten:
 * Zelle wählen, tippen oder doppelklicken, Enter/Tab übernimmt. Formeln in Excel-Schreibweise mit „=“.
 * Gespeichert werden nur die geänderten Zellen; Excel rechnet beim nächsten Öffnen neu.
 */
export function ExcelAnsicht({ datei }: { datei: OffeneDatei }) {
  const { dateiSpeichern, setDateiEntwurf } = useFormulare.getState();
  const entwurf = useFormulare((s) => s.dateiEntwuerfe[`${datei.root}|${datei.pfad}`]) as Aenderungen | undefined;
  const [fehler, setFehler] = useState('');
  const mappe = useMemo(() => {
    try {
      return xlsxLesen(datei.bytes);
    } catch (e) {
      setFehler(e instanceof Error ? e.message : String(e));
      return null;
    }
  }, [datei.bytes]);
  const [blattNr, setBlattNr] = useState(0);
  const [auswahl, setAuswahl] = useState('A1');
  const [bearbeiten, setBearbeiten] = useState<string | null>(null);
  const [eingabe, setEingabe] = useState('');
  const aenderungen: Aenderungen = useMemo(() => entwurf ?? new Map(), [entwurf]);
  const tabelle = useRef<HTMLDivElement>(null);
  const bearbeitbar = !datei.inOffice;

  const blatt = mappe?.blaetter[blattNr];
  const geaendertAnzahl = [...aenderungen.values()].reduce((n, m) => n + m.size, 0);

  const eingabeVon = useCallback(
    (r: string) => {
      const neu = aenderungen.get(blattNr)?.get(r);
      return neu ?? blatt?.zellen.get(r)?.eingabe ?? '';
    },
    [aenderungen, blattNr, blatt],
  );

  const setzen = (r: string, wert: string) => {
    const original = blatt?.zellen.get(r)?.eingabe ?? '';
    const neu: Aenderungen = new Map([...aenderungen].map(([k, v]) => [k, new Map(v)]));
    const m = neu.get(blattNr) ?? new Map<string, string>();
    if (wert === original) m.delete(r);
    else m.set(r, wert);
    neu.set(blattNr, m);
    setDateiEntwurf([...neu.values()].some((x) => x.size) ? neu : null);
  };

  const speichern = useCallback(async () => {
    if (!geaendertAnzahl) return;
    try {
      await dateiSpeichern(xlsxAendern(datei.bytes, aenderungen));
    } catch (e) {
      setFehler(e instanceof Error ? e.message : String(e));
    }
  }, [aenderungen, datei.bytes, dateiSpeichern, geaendertAnzahl]);
  useSpeichernTaste(() => void speichern(), bearbeitbar);

  useEffect(() => {
    if (!bearbeiten) tabelle.current?.querySelector<HTMLElement>(`[data-zelle="${auswahl}"]`)?.focus({ preventScroll: false });
  }, [auswahl, bearbeiten, blattNr]);

  if (!mappe || !blatt) {
    return (
      <div className="dok">
        <DateiKopf datei={datei} geaendert={false} bearbeitbar={false} />
        <p className="warning dok-fehler">Die Mappe lässt sich nicht lesen{fehler ? `: ${fehler}` : ''}.</p>
      </div>
    );
  }

  const zeilen = Math.min(MAX_ZEILEN, Math.max(blatt.zeilen + 10, 40));
  const spalten = Math.min(MAX_SPALTEN, Math.max(blatt.spalten + 3, 12));
  // verbundene Zellen: Anker mit Spannweite, überdeckte Zellen entfallen
  const verdeckt = new Set<string>();
  const anker = new Map<string, { zeilen: number; spalten: number }>();
  for (const m of blatt.zusammen) {
    anker.set(zellName(m.z1, m.s1), { zeilen: m.z2 - m.z1 + 1, spalten: m.s2 - m.s1 + 1 });
    for (let z = m.z1; z <= m.z2; z++) for (let s = m.s1; s <= m.s2; s++) if (z !== m.z1 || s !== m.s1) verdeckt.add(zellName(z, s));
  }

  const anzeigeVon = (z: Zelle | undefined, r: string) => {
    const neu = aenderungen.get(blattNr)?.get(r);
    if (neu === undefined) return z?.anzeige ?? '';
    if (neu.startsWith('=')) return neu;
    const n = alsZahl(neu);
    return n !== null ? formatieren(n, mappe.stile[z?.stil ?? 0]?.zahlformat ?? 'General') : neu;
  };

  const starten = (r: string, anfang?: string) => {
    if (!bearbeitbar) return;
    setAuswahl(r);
    setBearbeiten(r);
    setEingabe(anfang ?? eingabeVon(r));
  };
  const uebernehmen = (weiter?: { dz: number; ds: number }) => {
    if (bearbeiten) setzen(bearbeiten, eingabe);
    setBearbeiten(null);
    if (weiter) bewegen(weiter.dz, weiter.ds);
  };
  const bewegen = (dz: number, ds: number) => {
    const m = /^([A-Z]+)(\d+)$/.exec(auswahl)!;
    const s = [...m[1]].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0);
    setAuswahl(zellName(Math.max(1, Math.min(zeilen, Number(m[2]) + dz)), Math.max(1, Math.min(spalten, s + ds))));
  };

  const tasten = (e: KeyboardEvent<HTMLDivElement>) => {
    if (bearbeiten) return;
    const pfeile: Record<string, [number, number]> = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1], Enter: [1, 0], Tab: [0, e.shiftKey ? -1 : 1] };
    if (pfeile[e.key]) {
      e.preventDefault();
      bewegen(...pfeile[e.key]);
    } else if (e.key === 'F2') {
      e.preventDefault();
      starten(auswahl);
    } else if ((e.key === 'Delete' || e.key === 'Backspace') && bearbeitbar) {
      e.preventDefault();
      setzen(auswahl, '');
    } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      starten(auswahl, e.key);
    }
  };

  return (
    <div className="dok">
      <DateiKopf
        datei={datei}
        geaendert={geaendertAnzahl > 0}
        bearbeitbar={bearbeitbar}
        hinweis={datei.inOffice ? 'Nur ansehen: Die Mappe ist gerade in Excel geöffnet.' : fehler || (geaendertAnzahl ? `${geaendertAnzahl} Zelle(n) geändert – Formeln rechnet Excel beim nächsten Öffnen neu.` : undefined)}
        onSpeichern={() => void speichern()}
        onVerwerfen={() => setDateiEntwurf(null)}
      />
      <div className="xl-leiste">
        <span className="xl-adresse">{auswahl}</span>
        <input
          className="xl-eingabe"
          aria-label="Inhalt der Zelle"
          readOnly={!bearbeitbar}
          value={bearbeiten ? eingabe : eingabeVon(auswahl)}
          onFocus={() => !bearbeiten && starten(auswahl)}
          onChange={(e) => setEingabe(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') uebernehmen({ dz: 1, ds: 0 });
            else if (e.key === 'Escape') setBearbeiten(null);
          }}
          onBlur={() => bearbeiten && uebernehmen()}
        />
      </div>
      <div className="dok-flaeche xl-flaeche" ref={tabelle} onKeyDown={tasten}>
        <table className="xl-tabelle">
          <colgroup>
            <col style={{ width: 44 }} />
            {Array.from({ length: spalten }, (_, i) => (
              <col key={i} style={{ width: px(blatt.breiten.get(i + 1) ?? 9.14) }} />
            ))}
          </colgroup>
          <thead>
            <tr>
              <th className="xl-ecke" />
              {Array.from({ length: spalten }, (_, i) => (
                <th key={i} className={auswahl.replace(/\d+/, '') === spaltenName(i + 1) ? 'aktiv' : ''}>
                  {spaltenName(i + 1)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: zeilen }, (_, zi) => {
              const z = zi + 1;
              const hoehe = blatt.hoehen.get(z);
              return (
                <tr key={z} style={hoehe ? { height: Math.round(hoehe * 1.33) } : undefined}>
                  <th className={Number(auswahl.replace(/^[A-Z]+/, '')) === z ? 'aktiv' : ''}>{z}</th>
                  {Array.from({ length: spalten }, (_, si) => {
                    const r = zellName(z, si + 1);
                    if (verdeckt.has(r)) return null;
                    const zelle = blatt.zellen.get(r);
                    const span = anker.get(r);
                    const geaendert = aenderungen.get(blattNr)?.has(r);
                    const stil = mappe.stile[zelle?.stil ?? 0];
                    const zahl = zelle?.zahl && !stil?.ausrichtung;
                    return (
                      <td
                        key={r}
                        data-zelle={r}
                        tabIndex={auswahl === r ? 0 : -1}
                        rowSpan={span?.zeilen}
                        colSpan={span?.spalten}
                        className={`${auswahl === r ? 'gewaehlt' : ''}${geaendert ? ' geaendert' : ''}${zelle?.formel ? ' formel' : ''}`}
                        style={{ ...zellStil(stil), ...(zahl ? { textAlign: 'right' } : {}) }}
                        title={zelle?.formel ? `=${zelle.formel}` : undefined}
                        onClick={() => {
                          if (bearbeiten && bearbeiten !== r) uebernehmen();
                          setAuswahl(r);
                        }}
                        onDoubleClick={() => starten(r)}
                      >
                        {bearbeiten === r ? (
                          <input
                            className="xl-zellen-eingabe"
                            autoFocus
                            aria-label={`Zelle ${r}`}
                            value={eingabe}
                            onChange={(e) => setEingabe(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                uebernehmen({ dz: 1, ds: 0 });
                              } else if (e.key === 'Tab') {
                                e.preventDefault();
                                uebernehmen({ dz: 0, ds: e.shiftKey ? -1 : 1 });
                              } else if (e.key === 'Escape') {
                                e.preventDefault();
                                setBearbeiten(null);
                              }
                            }}
                            onBlur={() => uebernehmen()}
                          />
                        ) : (
                          anzeigeVon(zelle, r)
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
        {(blatt.zeilen > MAX_ZEILEN || blatt.spalten > MAX_SPALTEN) && <p className="muted small-text">Das Blatt ist größer als die Vorschau – für alles Weitere „Extern öffnen“.</p>}
      </div>
      <nav className="xl-blaetter" aria-label="Tabellenblätter">
        {mappe.blaetter.map((b, i) => (
          <button
            key={b.teil}
            className={i === blattNr ? 'aktiv' : ''}
            onClick={() => {
              setBlattNr(i);
              setAuswahl('A1');
              setBearbeiten(null);
            }}
          >
            {b.name}
            {aenderungen.get(i)?.size ? <span className="fo-ungespeichert"> ●</span> : null}
          </button>
        ))}
      </nav>
    </div>
  );
}
