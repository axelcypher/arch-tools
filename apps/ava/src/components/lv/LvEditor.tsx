import { useEffect, useMemo, useRef, useState } from 'react';
import { bestaetigen } from '@core/ui/Rueckfrage';
import type { Abschnitt, Hinweis, Lv, LvElement, Position } from '../../lv/modell';
import { aendereElement, elementKopie, entferneElement, finde, fuegeEin, naechsteOz, neueId, ozFormat, zaehltInSumme } from '../../lv/modell';
import { summen } from '../../lv/rechnen';
import { euro } from '../../abrechnung/pruefung';
import { useAva } from '../../store';
import { zahlDE, ZahlEingabe } from '../eingaben';
import { MenueKnopf } from '../Menue';
import { ElementPanel } from './ElementPanel';
import { Textbibliothek } from './Textbibliothek';

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
  const [bibliothek, setBibliothek] = useState<'einfuegen' | null>(null);
  const [suche, setSuche] = useState('');
  const tabelle = useRef<HTMLDivElement>(null);
  const aendern = useAva.getState().lvAendern;
  const gewaehlt = auswahl ? finde(lv.elemente, auswahl) : null;
  const sichtbar = useMemo(() => {
    const q = suche.trim().toLowerCase();
    if (!q) return zeilen;
    // Treffer samt ihrer Abschnitte (damit der Zusammenhang sichtbar bleibt)
    const nachId = new Map(zeilen.map((z) => [z.el.id, z]));
    const zeigen = new Set<string>();
    for (const z of zeilen) {
      if (!`${z.oz} ${z.el.kurztext}`.toLowerCase().includes(q)) continue;
      zeigen.add(z.el.id);
      for (let e = z.eltern; e && !zeigen.has(e); e = nachId.get(e)?.eltern ?? null) zeigen.add(e);
    }
    return zeilen.filter((z) => zeigen.has(z.el.id));
  }, [zeilen, suche]);
  const sucheLeeren = () => {
    setSuche('');
    tabelle.current?.focus();
  };

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
    else if (kopie.art === 'abschnitt') {
      // ein kopierter Abschnitt bekommt die nächste freie OZ seiner Ebene (keine doppelte Ordnungszahl)
      const ebene = lv.ozMaske.ebenen.filter((e) => e.aktiv)[gewaehlt.pfad.length];
      kopie.oz = naechsteOz(gewaehlt.eltern, 'abschnitt', ebene?.stellen ?? 2, ebene?.schritt ?? 1);
    }
    const eltern = gewaehlt.pfad[gewaehlt.pfad.length - 1];
    aendern((l) => ({ ...l, elemente: fuegeEin(l.elemente, kopie, eltern?.id ?? null, gewaehlt.index + 1) }));
    useAva.getState().setAuswahl(kopie.id);
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
    } else if (e.key === 'Enter' && auswahl) {
      // zum Bearbeiten ins Seitenpanel (Esc dort führt zurück)
      e.preventDefault();
      document.querySelector<HTMLElement>('.ava-panel [data-feld="kurztext"]')?.focus();
    }
  };

  const ka = s.bieter.get(0);
  const positionsZahl = zeilen.filter((z) => z.el.art === 'position').length;

  return (
    <div className="ava-lv">
      <div className="toolbar ava-lv-leiste">
        <div className="tb-group">
          <button onClick={() => neu('position')} title="Neue Position – im gewählten Abschnitt bzw. hinter der gewählten Position (Einfg)">
            + Position
          </button>
          <button onClick={() => neu('abschnitt')} title="Neuer Abschnitt (Los, Titel) – hinter dem gewählten bzw. am Ende">
            + Abschnitt
          </button>
          <MenueKnopf
            text="Einfügen"
            title="Hinweis, Vorbemerkung oder Position aus den Vorlagetexten einfügen"
            punkte={[
              { text: '+ Hinweis', title: 'Hinweistext im Abschnitt', aktion: () => neu('hinweis') },
              { text: '+ Vorbemerkung', title: 'Vorbemerkung vor der Gliederung', aktion: () => neu('vorbemerkung') },
              { text: 'Aus Vorlage …', title: 'Position aus den Vorlagetexten des Büros einfügen', aktion: () => setBibliothek('einfuegen') },
            ]}
          />
        </div>
        <div className="tb-group">
          <button onClick={duplizieren} disabled={!gewaehlt} title="Duplizieren (Strg+D)">
            Duplizieren
          </button>
          <button className="icon" onClick={() => verschieben(-1)} disabled={!gewaehlt || gewaehlt.index === 0} title="Nach oben" aria-label="Nach oben">
            ↑
          </button>
          <button className="icon" onClick={() => verschieben(1)} disabled={!gewaehlt || gewaehlt.index >= gewaehlt.eltern.length - 1} title="Nach unten" aria-label="Nach unten">
            ↓
          </button>
          <button className="icon" onClick={() => einruecken(false)} disabled={!gewaehlt?.pfad.length} title="Ausrücken: aus dem Abschnitt heraus (eine Ebene höher)" aria-label="Ausrücken, eine Ebene höher">
            ⇤
          </button>
          <button
            className="icon"
            onClick={() => einruecken(true)}
            disabled={!gewaehlt || !gewaehlt.eltern.slice(0, gewaehlt.index).some((e) => e.art === 'abschnitt')}
            title="Einrücken: in den Abschnitt davor (eine Ebene tiefer)"
            aria-label="Einrücken, in den Abschnitt davor"
          >
            ⇥
          </button>
          <button className="danger" onClick={() => void loeschen()} disabled={!gewaehlt} title="Entfernen (Entf)">
            Entfernen
          </button>
        </div>
        <div className="tb-group">
          <button className="icon" onClick={() => useAva.getState().lvRueckgaengig()} disabled={!offen.verlauf.length} title="Rückgängig (Strg+Z)" aria-label="Rückgängig">
            ↶
          </button>
          <button className="icon" onClick={() => useAva.getState().lvWiederholen()} disabled={!offen.zukunft.length} title="Wiederholen (Strg+Y)" aria-label="Wiederholen">
            ↷
          </button>
        </div>
        <input
          className="ava-suche"
          type="search"
          placeholder="Suchen (OZ, Kurztext) …"
          aria-label="LV durchsuchen"
          value={suche}
          onChange={(e) => setSuche(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape' && suche) {
              e.preventDefault();
              e.stopPropagation();
              sucheLeeren();
            }
          }}
        />
      </div>
      <div className="ava-lv-koerper">
        <div className="ava-lv-tabelle" ref={tabelle} tabIndex={0} onKeyDown={tasten} aria-label="Leistungsverzeichnis – ↑/↓ wählen, Enter bearbeiten, Einfg neue Position, Entf entfernen">
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
                        <ZahlEingabe label={`Menge ${z.oz}`} wert={el.menge} onChange={(n) => aendern((l) => ({ ...l, elemente: aendereElement(l.elemente, el.id, (p) => ({ ...(p as Position), menge: n })) }))} />
                      </td>
                      <td>{el.einheit}</td>
                      <td className="num ava-zelle-eingabe">
                        <ZahlEingabe
                          label={`EP Kostenansatz ${z.oz}`}
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
              {zeilen.length > 0 && !sichtbar.length && (
                <tr>
                  <td colSpan={8} className="muted ava-leer-zelle">
                    Keine Treffer für „{suche.trim()}“.{' '}
                    <button className="small" onClick={sucheLeeren}>
                      Suche leeren
                    </button>
                  </td>
                </tr>
              )}
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
        <ElementPanel onZurueck={() => tabelle.current?.focus()} />
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
      {bibliothek && (
        <Textbibliothek
          onClose={() => setBibliothek(null)}
          onUebernehmen={(v) => {
            neu('position', { kurztext: v.kurztext, langtext: v.langtext, einheit: v.einheit ?? '', kostengruppe: v.kostengruppe, preise: v.richtpreis !== undefined ? { '0': { ep: v.richtpreis } } : {} });
          }}
        />
      )}
    </div>
  );
}
