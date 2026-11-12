import { useEffect, useMemo, useRef, useState } from 'react';
import { bestaetigen } from '@core/ui/Rueckfrage';
import type { Abschnitt, Hinweis, Lv, LvElement, Position } from '../../lv/modell';
import { aendereElement, elementKopie, entferneElement, finde, fuegeEin, naechsteOz, neueId, neuNummerieren, ozFormat, zaehltInSumme } from '../../lv/modell';
import { summen } from '../../lv/rechnen';
import { euro } from '../../abrechnung/pruefung';
import { useAva } from '../../store';
import { zahlDE, ZahlEingabe } from '../eingaben';
import { ElementPanel } from './ElementPanel';
import { LvKopfDialog } from './LvKopfDialog';
import { Textbibliothek } from './Textbibliothek';
import { LvDruck } from './LvDruck';
import { GaebExportDialog } from './Gaeb';

interface Zeile {
  el: LvElement;
  tiefe: number;
  oz: string;
  eltern: string | null;
}

/** Gliederung als Zeilen (Abschnitte, darunter ihre Elemente) mit voller OZ nach der Maske */
export function zeilenVon(lv: Lv): Zeile[] {
  const out: Zeile[] = [];
  const ebenen = lv.ozMaske.ebenen.filter((e) => e.aktiv);
  const rek = (liste: LvElement[], tiefe: number, praefix: string[], eltern: string | null) => {
    for (const el of liste) {
      if (el.art === 'abschnitt') {
        const teil = ozFormat(el.oz, ebenen[tiefe]?.stellen ?? 2);
        out.push({ el, tiefe, oz: [...praefix, teil].join('.'), eltern });
        rek(el.kinder, tiefe + 1, [...praefix, teil], el.id);
      } else if (el.art === 'position') {
        out.push({ el, tiefe, oz: [...praefix, ozFormat(el.oz, lv.ozMaske.position.stellen)].join('.'), eltern });
      } else out.push({ el, tiefe, oz: '', eltern });
    }
  };
  rek(lv.elemente, 0, [], null);
  return out;
}

export const ART_KURZ: Record<string, string> = { normal: '', bedarf: 'Bedarf', wahl: 'Wahl', grund: 'Grund', zulage: 'Zulage' };

export function LvEditor() {
  const offen = useAva((s) => s.lv)!;
  const auswahl = useAva((s) => s.auswahl);
  const lv = offen.lv;
  const zeilen = useMemo(() => zeilenVon(lv), [lv]);
  const s = useMemo(() => summen(lv), [lv]);
  const [kopfOffen, setKopfOffen] = useState(false);
  const [bibliothek, setBibliothek] = useState<'einfuegen' | null>(null);
  const [druck, setDruck] = useState(false);
  const [gaeb, setGaeb] = useState(false);
  const [suche, setSuche] = useState('');
  const tabelle = useRef<HTMLDivElement>(null);
  const aendern = useAva.getState().lvAendern;
  const gewaehlt = auswahl ? finde(lv.elemente, auswahl) : null;
  const sichtbar = suche.trim() ? zeilen.filter((z) => `${z.oz} ${z.el.kurztext}`.toLowerCase().includes(suche.toLowerCase())) : zeilen;

  useEffect(() => {
    if (!auswahl) return;
    tabelle.current?.querySelector(`[data-id="${auswahl}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [auswahl]);

  /** Ort für ein neues Element: im gewählten Abschnitt am Ende, sonst hinter dem gewählten Element */
  const ort = (art: LvElement['art']): { in: string | null; index?: number; geschwister: LvElement[]; tiefe: number } => {
    if (!gewaehlt) return { in: null, geschwister: lv.elemente, tiefe: 0 };
    if (gewaehlt.el.art === 'abschnitt' && art !== 'abschnitt') return { in: gewaehlt.el.id, geschwister: gewaehlt.el.kinder, tiefe: gewaehlt.pfad.length + 1 };
    const eltern = gewaehlt.pfad[gewaehlt.pfad.length - 1];
    return { in: eltern?.id ?? null, index: gewaehlt.index + 1, geschwister: gewaehlt.eltern, tiefe: gewaehlt.pfad.length };
  };

  const neu = (art: 'abschnitt' | 'position' | 'hinweis' | 'vorbemerkung', vorlage?: Partial<Position>) => {
    const o = art === 'vorbemerkung' ? { in: null, index: lv.elemente.filter((e) => e.art === 'hinweis' && e.vorbemerkung).length, geschwister: lv.elemente, tiefe: 0 } : ort(art === 'hinweis' ? 'hinweis' : art);
    const ebene = lv.ozMaske.ebenen.filter((e) => e.aktiv)[o.tiefe];
    let el: LvElement;
    if (art === 'abschnitt') el = { id: neueId(), art: 'abschnitt', oz: naechsteOz(o.geschwister, 'abschnitt', ebene?.stellen ?? 2, ebene?.schritt ?? 1), kurztext: 'Neuer Abschnitt', langtext: [], kinder: [] } satisfies Abschnitt;
    else if (art === 'position')
      el = {
        id: neueId(),
        art: 'position',
        oz: naechsteOz(o.geschwister, 'position', lv.ozMaske.position.stellen, lv.ozMaske.position.schritt),
        kurztext: vorlage?.kurztext ?? 'Neue Position',
        langtext: vorlage?.langtext ?? [],
        einheit: vorlage?.einheit ?? 'm²',
        menge: vorlage?.menge ?? null,
        positionsart: 'normal',
        ...(vorlage?.kostengruppe ? { kostengruppe: vorlage.kostengruppe } : {}),
        preise: vorlage?.preise ?? {},
      } satisfies Position;
    else el = { id: neueId(), art: 'hinweis', kurztext: art === 'vorbemerkung' ? 'Vorbemerkung' : 'Hinweis', langtext: [], ...(art === 'vorbemerkung' ? { vorbemerkung: true } : {}) } satisfies Hinweis;
    aendern((l) => ({ ...l, elemente: fuegeEin(l.elemente, el, o.in, o.index) }));
    useAva.getState().setAuswahl(el.id);
  };

  const loeschen = async () => {
    if (!gewaehlt) return;
    const el = gewaehlt.el;
    const anzahl = el.art === 'abschnitt' ? zeilen.filter((z) => z.oz.startsWith(`${zeilen.find((x) => x.el.id === el.id)!.oz}.`)).length : 0;
    if (el.art === 'abschnitt' && anzahl && !(await bestaetigen('Abschnitt entfernen?', `„${el.kurztext}“ mit ${anzahl} Element(en) darin entfernen? (Rückgängig mit Strg+Z)`, 'Entfernen', true))) return;
    const i = zeilen.findIndex((z) => z.el.id === el.id);
    aendern((l) => ({ ...l, elemente: entferneElement(l.elemente, el.id) }));
    const naechste = zeilen.slice(i + 1).find((z) => !z.oz.startsWith(`${zeilen[i].oz}.`) || !zeilen[i].oz) ?? zeilen[i - 1];
    useAva.getState().setAuswahl(naechste?.el.id ?? null);
  };

  const verschieben = (richtung: -1 | 1) => {
    if (!gewaehlt) return;
    const { index, eltern, pfad } = gewaehlt;
    const ziel = index + richtung;
    if (ziel < 0 || ziel >= eltern.length) return;
    const liste = [...eltern];
    [liste[index], liste[ziel]] = [liste[ziel], liste[index]];
    const elternAbschnitt = pfad[pfad.length - 1];
    aendern((l) => ({ ...l, elemente: elternAbschnitt ? aendereElement(l.elemente, elternAbschnitt.id, (a) => ({ ...(a as Abschnitt), kinder: liste })) : liste }));
  };

  /** in den Abschnitt davor (eine Ebene tiefer) bzw. aus dem Abschnitt heraus */
  const einruecken = (rein: boolean) => {
    if (!gewaehlt) return;
    const el = gewaehlt.el;
    if (rein) {
      const vorher = [...gewaehlt.eltern.slice(0, gewaehlt.index)].reverse().find((e) => e.art === 'abschnitt') as Abschnitt | undefined;
      if (!vorher) return;
      aendern((l) => ({ ...l, elemente: fuegeEin(entferneElement(l.elemente, el.id), el, vorher.id) }));
    } else {
      const eltern = gewaehlt.pfad[gewaehlt.pfad.length - 1];
      if (!eltern) return;
      const grosseltern = gewaehlt.pfad[gewaehlt.pfad.length - 2];
      const ohne = entferneElement(lv.elemente, el.id);
      const liste = grosseltern ? (finde(ohne, grosseltern.id)!.el as Abschnitt).kinder : ohne;
      const pos = liste.findIndex((e) => e.id === eltern.id) + 1;
      aendern((l) => ({ ...l, elemente: fuegeEin(entferneElement(l.elemente, el.id), el, grosseltern?.id ?? null, pos) }));
    }
  };

  const duplizieren = () => {
    if (!gewaehlt) return;
    const kopie = elementKopie(gewaehlt.el);
    if (kopie.art === 'position') kopie.oz = naechsteOz(gewaehlt.eltern, 'position', lv.ozMaske.position.stellen, lv.ozMaske.position.schritt);
    const eltern = gewaehlt.pfad[gewaehlt.pfad.length - 1];
    aendern((l) => ({ ...l, elemente: fuegeEin(l.elemente, kopie, eltern?.id ?? null, gewaehlt.index + 1) }));
    useAva.getState().setAuswahl(kopie.id);
  };

  const nummerieren = async () => {
    if (!(await bestaetigen('Neu nummerieren?', `Alle Abschnitte und Positionen bekommen fortlaufende Ordnungszahlen nach der OZ-Maske (Positionen in Schritten von ${lv.ozMaske.position.schritt}). Erst nach der Vergabe nicht mehr empfehlenswert.`, 'Neu nummerieren'))) return;
    aendern((l) => ({ ...l, elemente: neuNummerieren(l.elemente, l.ozMaske) }));
  };

  const tasten = (e: React.KeyboardEvent) => {
    if ((e.target as HTMLElement).closest('input, textarea, [contenteditable="true"], select')) return;
    const i = sichtbar.findIndex((z) => z.el.id === auswahl);
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const n = sichtbar[Math.max(0, Math.min(sichtbar.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)))];
      if (n) useAva.getState().setAuswahl(n.el.id);
    } else if (e.key === 'Delete') {
      e.preventDefault();
      void loeschen();
    } else if (e.key.toLowerCase() === 'd' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      duplizieren();
    } else if (e.key === 'Insert') {
      e.preventDefault();
      neu('position');
    }
  };

  const ka = s.bieter.get(0);
  const positionsZahl = zeilen.filter((z) => z.el.art === 'position').length;

  return (
    <div className="ava-lv">
      <div className="toolbar ava-lv-leiste">
        <div className="tb-group">
          <button onClick={() => neu('abschnitt')} title="Neuer Abschnitt (Los, Titel) – hinter dem gewählten bzw. am Ende">
            + Abschnitt
          </button>
          <button onClick={() => neu('position')} title="Neue Position – im gewählten Abschnitt bzw. hinter der gewählten Position (Einfg)">
            + Position
          </button>
          <button onClick={() => neu('hinweis')} title="Hinweistext im Abschnitt">
            + Hinweis
          </button>
          <button onClick={() => neu('vorbemerkung')} title="Vorbemerkung vor der Gliederung">
            + Vorbemerkung
          </button>
          <button onClick={() => setBibliothek('einfuegen')} title="Position aus den Vorlagetexten des Büros einfügen">
            Aus Vorlage …
          </button>
        </div>
        <div className="tb-group">
          <button onClick={duplizieren} disabled={!gewaehlt} title="Duplizieren (Strg+D)">
            Duplizieren
          </button>
          <button onClick={() => verschieben(-1)} disabled={!gewaehlt || gewaehlt.index === 0} title="Nach oben">
            ↑
          </button>
          <button onClick={() => verschieben(1)} disabled={!gewaehlt || gewaehlt.index >= gewaehlt.eltern.length - 1} title="Nach unten">
            ↓
          </button>
          <button onClick={() => einruecken(false)} disabled={!gewaehlt?.pfad.length} title="Aus dem Abschnitt heraus (eine Ebene höher)">
            ←
          </button>
          <button onClick={() => einruecken(true)} disabled={!gewaehlt || !gewaehlt.eltern.slice(0, gewaehlt.index).some((e) => e.art === 'abschnitt')} title="In den Abschnitt davor (eine Ebene tiefer)">
            →
          </button>
          <button className="danger" onClick={() => void loeschen()} disabled={!gewaehlt} title="Entfernen (Entf)">
            Entfernen
          </button>
        </div>
        <div className="tb-group">
          <button onClick={() => void nummerieren()} title="Ordnungszahlen neu vergeben">
            Neu nummerieren
          </button>
          <button onClick={() => setKopfOffen(true)} title="Bezeichnung, Termine, Vergabeart, Projekt, Auftraggeber, OZ-Maske, Umsatzsteuer">
            LV-Eigenschaften …
          </button>
          <button onClick={() => setDruck(true)} title="LV drucken bzw. als PDF (Leistungsbeschreibung mit Leistungsverzeichnis)">
            Drucken …
          </button>
          <button onClick={() => setGaeb(true)} title="Als GAEB DA XML für die Bieter bzw. andere AVA-Software (X81, X83, X84, X86)">
            GAEB-Export …
          </button>
        </div>
        <div className="tb-group">
          <button onClick={() => useAva.getState().lvRueckgaengig()} disabled={!offen.verlauf.length} title="Rückgängig (Strg+Z)">
            ↶
          </button>
          <button onClick={() => useAva.getState().lvWiederholen()} disabled={!offen.zukunft.length} title="Wiederholen (Strg+Y)">
            ↷
          </button>
        </div>
        <input className="ava-suche" placeholder="Suchen (OZ, Kurztext) …" value={suche} onChange={(e) => setSuche(e.target.value)} />
      </div>
      <div className="ava-lv-koerper">
        <div className="ava-lv-tabelle" ref={tabelle} tabIndex={0} onKeyDown={tasten}>
          <table className="ava-tabelle ava-lv-zeilen">
            <thead>
              <tr>
                <th className="ava-oz">OZ</th>
                <th>Kurztext</th>
                <th className="num">Menge</th>
                <th>Einheit</th>
                <th className="num" title="Einheitspreis des Kostenansatzes">EP Kostenansatz</th>
                <th className="num">GB</th>
                <th>Art</th>
                <th>KG</th>
              </tr>
            </thead>
            <tbody>
              {sichtbar.map((z) => {
                const el = z.el;
                const aktiv = el.id === auswahl;
                const kl = `${aktiv ? 'active ' : ''}ava-z-${el.art}${el.art === 'hinweis' && el.vorbemerkung ? ' ava-z-vorbemerkung' : ''}`;
                const einzug = { paddingLeft: 6 + z.tiefe * 16 };
                if (el.art === 'position') {
                  const gb = s.positionen.get(el.id)?.get(0);
                  return (
                    <tr key={el.id} data-id={el.id} className={`${kl}${zaehltInSumme(el.positionsart) ? '' : ' ava-z-ohne-summe'}`} onClick={() => useAva.getState().setAuswahl(el.id)}>
                      <td className="ava-oz">{z.oz}</td>
                      <td style={einzug} className="ava-kurztext" title={el.kurztext}>
                        {el.kurztext}
                        {el.nachtrag ? <span className="ava-chip">NT {el.nachtrag}</span> : null}
                      </td>
                      <td className="num ava-zelle-eingabe">
                        <ZahlEingabe wert={el.menge} onChange={(n) => aendern((l) => ({ ...l, elemente: aendereElement(l.elemente, el.id, (p) => ({ ...(p as Position), menge: n })) }))} />
                      </td>
                      <td>{el.einheit}</td>
                      <td className="num ava-zelle-eingabe">
                        <ZahlEingabe
                          wert={el.preise['0']?.ep ?? null}
                          stellen={2}
                          onChange={(n) => aendern((l) => ({ ...l, elemente: aendereElement(l.elemente, el.id, (p) => ({ ...(p as Position), preise: { ...(p as Position).preise, '0': { ...(p as Position).preise['0'], ep: n } } })) }))}
                        />
                      </td>
                      <td className="num">{gb !== undefined ? zahlDE(gb, 2) : ''}</td>
                      <td>{ART_KURZ[el.positionsart] ? <span className="ava-chip">{ART_KURZ[el.positionsart]}</span> : null}</td>
                      <td>{el.kostengruppe}</td>
                    </tr>
                  );
                }
                if (el.art === 'abschnitt') {
                  const summe = s.abschnitte.get(el.id)?.get(0);
                  return (
                    <tr key={el.id} data-id={el.id} className={kl} onClick={() => useAva.getState().setAuswahl(el.id)}>
                      <td className="ava-oz">{z.oz}</td>
                      <td style={einzug} colSpan={4}>
                        {el.kurztext}
                      </td>
                      <td className="num">{summe ? zahlDE(summe, 2) : ''}</td>
                      <td colSpan={2} />
                    </tr>
                  );
                }
                return (
                  <tr key={el.id} data-id={el.id} className={kl} onClick={() => useAva.getState().setAuswahl(el.id)}>
                    <td className="ava-oz">{el.vorbemerkung ? 'VB' : 'H'}</td>
                    <td style={einzug} colSpan={7} className="ava-hinweis-text">
                      {el.kurztext}
                    </td>
                  </tr>
                );
              })}
              {!zeilen.length && (
                <tr>
                  <td colSpan={8} className="muted ava-leer-zelle">
                    Das LV ist leer – mit „+ Abschnitt“ und „+ Position“ beginnen oder Positionen aus den Vorlagetexten einfügen.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <ElementPanel />
      </div>
      <div className="ava-lv-fuss">
        <span>{positionsZahl} Positionen</span>
        <span>Kostenansatz netto: {euro(ka?.netto ?? 0)}</span>
        <span>
          {lv.kopf.mwst} % USt: {euro(ka?.mwst ?? 0)}
        </span>
        <strong>brutto: {euro(ka?.brutto ?? 0)}</strong>
        {(ka?.ohnePreis ?? 0) > 0 && <span className="muted">{ka!.ohnePreis} Position(en) ohne Preis im Kostenansatz</span>}
      </div>
      {kopfOffen && <LvKopfDialog onClose={() => setKopfOffen(false)} />}
      {bibliothek && (
        <Textbibliothek
          onClose={() => setBibliothek(null)}
          onUebernehmen={(v) => {
            neu('position', { kurztext: v.kurztext, langtext: v.langtext, einheit: v.einheit ?? '', kostengruppe: v.kostengruppe, preise: v.richtpreis !== undefined ? { '0': { ep: v.richtpreis } } : {} });
          }}
        />
      )}
      {druck && <LvDruck onClose={() => setDruck(false)} />}
      {gaeb && <GaebExportDialog onClose={() => setGaeb(false)} />}
    </div>
  );
}
