import type { ReactNode } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { LEISTUNGSPHASEN } from '@core/model';
import { Modal, useEscSchliessen } from '@core/ui/Dialog';
import { TextField } from '@core/ui/fields';
import { bestaetigen, frageText } from '@core/ui/Rueckfrage';
import type { BaumZeile } from '../baum';
import {
  alleLoeschen,
  ausEingerueckt,
  ausruecken,
  baumZeilen,
  duplizieren,
  einfuegen,
  einruecken,
  hinzufuegen,
  obersteAuswahl,
  teilbaumVon,
  umbenennen,
  unterordnerVon,
  verschieben,
  verschiebenNach,
  zusatzSetzenAlle,
} from '../baum';
import type { Baustein, OrdnerRegel } from '../struktur';
import { lphKette, lphText, ordnerAlsText, ordnerGilt, sichererName } from '../struktur';

const LPH = LEISTUNGSPHASEN.map((l) => l.nr);
const klein = (p: string) => p.toLowerCase();
const elternVon = (p: string) => p.split('/').slice(0, -1).join('/');
const enthalten = (liste: string[], p: string) => liste.some((x) => klein(x) === klein(p));
/** Kennung einer Zeile (für aria-activedescendant – ohne Leerzeichen) */
const zeilenId = (p: string) => `po-k-${encodeURIComponent(klein(p)).replace(/[%.']/g, '_')}`;
/** so viele Schritte merkt sich „Rückgängig“ */
const VERLAUF = 100;

/** Beispiel für einen Baustein – ein Gewerkeordner, wie er je Gewerk wiederkehrt */
export const BEISPIEL_GEWERK: Baustein = {
  name: 'Gewerk',
  ordner: [{ pfad: 'Angebote' }, { pfad: 'Vergabe' }, { pfad: 'Verträge' }, { pfad: 'Rechnungen' }, { pfad: 'Schriftverkehr' }],
};

type Wo = 'in' | 'vor' | 'nach';

interface Menue {
  x: number;
  y: number;
}

/**
 * Struktur-Editor zum Klicken: der Ordnerbaum wie im Explorer – auswählen (Strg/Umschalt für mehrere), umbenennen
 * (Doppelklick, F2), Unterordner anlegen, ziehen & ablegen, Rechtsklick-Menü, Tastatur. Für wiederkehrende
 * Unterstrukturen (Gewerke …): Kopieren und in beliebig viele markierte Ordner einfügen, Duplizieren, „Mehrere
 * anlegen“ (eingerückte Liste) und **Bausteine** – gespeicherte Unterstrukturen, die sich in alle markierten Ordner
 * auf einmal einfügen lassen. Rechts die Angaben zur Auswahl (Leistungsphasen, Dateischema), auch für mehrere Ordner.
 * Bearbeitet dieselbe Liste (`OrdnerRegel[]`) wie die Textansicht; Rückgängig/Wiederholen für alle Schritte.
 */
export function OrdnerEditor({
  ordner,
  onChange,
  bausteine,
  onBausteine,
  kopf,
  seite,
}: {
  ordner: OrdnerRegel[];
  onChange: (ordner: OrdnerRegel[]) => void;
  bausteine: Baustein[];
  onBausteine: (b: Baustein[]) => void;
  /** über dem Baum (Überschrift, Umschalter) */
  kopf?: ReactNode;
  /** weitere Abschnitte in der Seitenleiste (unter Auswahl und Bausteinen) */
  seite?: ReactNode;
}) {
  const zeilen = useMemo(() => baumZeilen(ordner), [ordner]);
  const [auswahl, setAuswahl] = useState<string[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [anker, setAnker] = useState<string | null>(null);
  const [zu, setZu] = useState<Set<string>>(new Set());
  const [bearbeitet, setBearbeitet] = useState<{ pfad: string; neu: boolean } | null>(null);
  const [menue, setMenue] = useState<Menue | null>(null);
  const [ablage, setAblage] = useState<OrdnerRegel[] | null>(null);
  const [verlauf, setVerlauf] = useState<{ zurueck: OrdnerRegel[][]; vor: OrdnerRegel[][] }>({ zurueck: [], vor: [] });
  const [ziehen, setZiehen] = useState<string[] | null>(null);
  const [ziel, setZiel] = useState<{ pfad: string; wo: Wo } | null>(null);
  const [mehrere, setMehrere] = useState<string[] | null>(null);
  const [vorschau, setVorschau] = useState<number[]>([]);
  const [meldung, setMeldung] = useState<string | null>(null);
  const baum = useRef<HTMLDivElement>(null);
  /** die Liste, die dieser Editor zuletzt geschrieben hat – ändert sie sich von außen, beginnt der Verlauf neu */
  const eigene = useRef(ordner);

  useEffect(() => {
    if (ordner === eigene.current) return;
    eigene.current = ordner;
    setVerlauf({ zurueck: [], vor: [] });
    const da = new Set(baumZeilen(ordner).map((z) => klein(z.pfad)));
    setAuswahl((a) => a.filter((p) => da.has(klein(p))));
    setCursor((c) => (c && da.has(klein(c)) ? c : null));
  }, [ordner]);

  // Meldungen verschwinden nach einer Weile
  useEffect(() => {
    if (!meldung) return;
    const t = setTimeout(() => setMeldung(null), 6000);
    return () => clearTimeout(t);
  }, [meldung]);

  const zeile = (p: string | null) => (p == null ? undefined : zeilen.find((z) => klein(z.pfad) === klein(p)));
  const sichtbar = useMemo(() => {
    const out: BaumZeile[] = [];
    let ausserBis: string | null = null;
    for (const z of zeilen) {
      if (ausserBis && klein(z.pfad).startsWith(`${ausserBis}/`)) continue;
      ausserBis = null;
      out.push(z);
      if (z.hatKinder && zu.has(klein(z.pfad))) ausserBis = klein(z.pfad);
    }
    return out;
  }, [zeilen, zu]);

  /** neue Liste übernehmen (mit Rückgängig); `waehlen` = danach gewählte Ordner */
  const aendern = (neu: OrdnerRegel[], waehlen?: string[]) => {
    if (neu === ordner || JSON.stringify(neu) === JSON.stringify(ordner)) return false;
    setVerlauf((v) => ({ zurueck: [...v.zurueck.slice(-VERLAUF + 1), ordner], vor: [] }));
    eigene.current = neu;
    onChange(neu);
    if (waehlen) {
      setAuswahl(waehlen);
      setCursor(waehlen[waehlen.length - 1] ?? null);
      setAnker(waehlen[0] ?? null);
      // Elternordner der neu gewählten aufklappen
      setZu((alt) => {
        const n = new Set(alt);
        for (const p of waehlen) {
          const teile = p.split('/');
          for (let i = 1; i < teile.length; i++) n.delete(klein(teile.slice(0, i).join('/')));
        }
        return n;
      });
    }
    return true;
  };
  const rueckgaengig = () => {
    const vorher = verlauf.zurueck[verlauf.zurueck.length - 1];
    if (!vorher) return;
    setVerlauf({ zurueck: verlauf.zurueck.slice(0, -1), vor: [ordner, ...verlauf.vor] });
    eigene.current = vorher;
    onChange(vorher);
  };
  const wiederholen = () => {
    const nachher = verlauf.vor[0];
    if (!nachher) return;
    setVerlauf({ zurueck: [...verlauf.zurueck, ordner], vor: verlauf.vor.slice(1) });
    eigene.current = nachher;
    onChange(nachher);
  };

  const gewaehlt = auswahl.filter((p) => zeile(p));
  const einer = gewaehlt.length === 1 ? zeile(gewaehlt[0]) : undefined;

  /* ---------- Aktionen ---------- */

  const anlegen = (eltern: string) => {
    const r = hinzufuegen(ordner, eltern);
    if (aendern(r.ordner, [r.pfad])) setBearbeitet({ pfad: r.pfad, neu: true });
  };
  const daneben = (pfad: string | null) => anlegen(pfad ? elternVon(pfad) : '');
  const namenSetzen = (pfad: string, name: string) => {
    const neu = umbenennen(ordner, pfad, name);
    if (neu === ordner) {
      if (name.trim() && name.trim() !== pfad.split('/').pop()) setMeldung(`„${name.trim()}“ gibt es in diesem Ordner schon.`);
      return;
    }
    const n = sichererName(name.replace(/[\\/]+/g, ' '));
    const neuerPfad = elternVon(pfad) ? `${elternVon(pfad)}/${n}` : n;
    // Unterordner wandern mit: die Auswahl folgt
    const umschreiben = (p: string) => (klein(p) === klein(pfad) ? neuerPfad : klein(p).startsWith(`${klein(pfad)}/`) ? `${neuerPfad}${p.slice(pfad.length)}` : p);
    aendern(neu, (auswahl.length ? auswahl : [pfad]).map(umschreiben));
  };
  const loeschenFragen = async (pfade: string[]) => {
    const oben = obersteAuswahl(pfade);
    if (!oben.length) return;
    const mitInhalt = oben.some((p) => zeile(p)?.hatKinder);
    if (
      (mitInhalt || oben.length > 1) &&
      !(await bestaetigen(
        oben.length === 1 ? `„${oben[0]}“ löschen?` : `${oben.length} Ordner löschen?`,
        `${mitInhalt ? 'Die Ordner werden samt Unterordnern' : 'Die Ordner werden'} aus der Struktur genommen. Vorhandene Projektordner bleiben unverändert. „Rückgängig“ holt sie zurück.`,
        'Löschen',
        true,
      ))
    )
      return;
    aendern(alleLoeschen(ordner, oben), []);
  };
  const kopieren = (pfade: string[]) => {
    const t = teilbaumVon(ordner, pfade);
    if (!t.length) return;
    setAblage(t);
    setMeldung(`${obersteAuswahl(pfade).length === 1 ? `„${obersteAuswahl(pfade)[0].split('/').pop()}“` : `${obersteAuswahl(pfade).length} Ordner`} kopiert – markierte Ordner wählen und „Einfügen“.`);
  };
  /** Teilbaum (Zwischenablage, Baustein) in die gewählten Ordner einfügen – ohne Auswahl in den Stamm */
  const einfuegenIn = (teil: OrdnerRegel[], wohin: string[], was: string) => {
    const ziele = wohin.length ? wohin : [''];
    const r = einfuegen(ordner, ziele, teil);
    if (!r.neu.length && r.ordner === ordner) return setMeldung(`${was}: alles schon vorhanden – nichts geändert.`);
    aendern(r.ordner, ziele.filter(Boolean).length ? ziele.filter(Boolean) : r.neu.filter((p) => !p.includes('/')));
    setMeldung(`${was} in ${ziele.length === 1 ? (ziele[0] ? `„${ziele[0].split('/').pop()}“` : 'den Stamm') : `${ziele.length} Ordner`} eingefügt – ${r.neu.length} neu.`);
  };
  const dupl = (pfad: string) => {
    const r = duplizieren(ordner, pfad);
    if (r.pfad && aendern(r.ordner, [r.pfad])) setBearbeitet({ pfad: r.pfad, neu: true });
  };
  const nachDrop = (pfade: string[], zielPfad: string, wo: Wo) => {
    const r = verschiebenNach(ordner, pfade, zielPfad, wo);
    if (!r)
      return setMeldung(
        zielPfad && obersteAuswahl(pfade).some((p) => klein(zielPfad) === klein(p) || klein(zielPfad).startsWith(`${klein(p)}/`))
          ? 'Ein Ordner lässt sich nicht in sich selbst verschieben.'
          : 'Dort gibt es schon einen Ordner mit diesem Namen.',
      );
    if (wo === 'in' && zielPfad) setZu((alt) => new Set([...alt].filter((x) => x !== klein(zielPfad))));
    aendern(r.ordner, r.pfade);
  };
  const alsBaustein = async (pfad: string) => {
    const teil = unterordnerVon(ordner, pfad);
    if (!teil.length) return setMeldung('Ein Baustein entsteht aus den Unterordnern – dieser Ordner hat keine.');
    const name = (
      await frageText(
        'Als Baustein speichern',
        pfad.split('/').pop() ?? '',
        'Speichern',
        `Die ${teil.length} Unterordner von „${pfad}“ werden als Baustein gespeichert und lassen sich in beliebig viele Ordner auf einmal einfügen.`,
      )
    )?.trim();
    if (!name) return;
    const da = bausteine.find((b) => klein(b.name) === klein(name));
    if (
      da &&
      !(await bestaetigen(
        `Baustein „${da.name}“ ersetzen?`,
        `Den Baustein gibt es schon (${da.ordner.length} Ordner). Er wird durch die ${teil.length} Unterordner von „${pfad}“ ersetzt.`,
        'Ersetzen',
      ))
    )
      return;
    onBausteine(da ? bausteine.map((b) => (b === da ? { name: da.name, ordner: teil } : b)) : [...bausteine, { name, ordner: teil }]);
    setMeldung(`Baustein „${name}“ gespeichert.`);
  };
  const lphSetzen = (pfade: string[], nr: number) => {
    const alle = pfade.every((p) => zeile(p)?.regel?.lph?.includes(nr));
    aendern(
      zusatzSetzenAlle(ordner, pfade, (r) => ({ lph: alle ? (r?.lph ?? []).filter((x) => x !== nr) : [...(r?.lph ?? []), nr] })),
      pfade,
    );
  };
  const lphAlle = (pfade: string[], lph: number[]) =>
    aendern(
      zusatzSetzenAlle(ordner, pfade, () => ({ lph })),
      pfade,
    );
  const schemaSetzen = (pfade: string[]) => {
    const alle = pfade.every((p) => zeile(p)?.regel?.dateischema);
    aendern(
      zusatzSetzenAlle(ordner, pfade, () => ({ dateischema: !alle })),
      pfade,
    );
  };

  /* ---------- Auswahl ---------- */

  const waehlen = (p: string, e?: { ctrlKey?: boolean; metaKey?: boolean; shiftKey?: boolean }) => {
    setMenue(null);
    if (e?.shiftKey && (anker ?? cursor)) {
      const reihe = sichtbar.map((z) => klein(z.pfad));
      const a = reihe.indexOf(klein((anker ?? cursor)!));
      const b = reihe.indexOf(klein(p));
      if (a >= 0 && b >= 0) {
        setAuswahl(sichtbar.slice(Math.min(a, b), Math.max(a, b) + 1).map((z) => z.pfad));
        setCursor(p);
        return;
      }
    }
    if (e?.ctrlKey || e?.metaKey) setAuswahl((alt) => (enthalten(alt, p) ? alt.filter((x) => klein(x) !== klein(p)) : [...alt, p]));
    else setAuswahl([p]);
    setCursor(p);
    setAnker(p);
  };
  const umklappen = (p: string) =>
    setZu((alt) => {
      const n = new Set(alt);
      if (!n.delete(klein(p))) n.add(klein(p));
      return n;
    });

  const tasten = (e: React.KeyboardEvent) => {
    if ((e.target as HTMLElement).tagName === 'INPUT' || (e.target as HTMLElement).tagName === 'TEXTAREA') return;
    const strg = e.ctrlKey || e.metaKey;
    const k = e.key.toLowerCase();
    const i = sichtbar.findIndex((z) => cursor && klein(z.pfad) === klein(cursor));
    const z = i >= 0 ? sichtbar[i] : undefined;
    const tun = (f: () => void) => {
      e.preventDefault();
      f();
    };
    if (strg && k === 'z' && !e.shiftKey) return tun(rueckgaengig);
    if (strg && (k === 'y' || (k === 'z' && e.shiftKey))) return tun(wiederholen);
    if (strg && k === 'a') return tun(() => setAuswahl(zeilen.map((x) => x.pfad)));
    if (strg && k === 'n') return tun(() => (e.shiftKey ? daneben(cursor) : anlegen(cursor ?? '')));
    if (strg && k === 'c') return tun(() => kopieren(gewaehlt));
    if (strg && k === 'v') return tun(() => ablage && einfuegenIn(ablage, gewaehlt, 'Kopie'));
    if (strg && k === 'd') return tun(() => z && dupl(z.pfad));
    if (e.key === 'Delete') return tun(() => void loeschenFragen(gewaehlt));
    if ((e.key === 'F2' || e.key === 'Enter') && z) return tun(() => setBearbeitet({ pfad: z.pfad, neu: false }));
    if (e.altKey && z) {
      if (e.key === 'ArrowUp') return tun(() => aendern(verschieben(ordner, z.pfad, -1), [z.pfad]));
      if (e.key === 'ArrowDown') return tun(() => aendern(verschieben(ordner, z.pfad, 1), [z.pfad]));
      if (e.key === 'ArrowRight' && !z.erster) {
        const geschwister = zeilen.filter((x) => x.tiefe === z.tiefe && klein(elternVon(x.pfad)) === klein(elternVon(z.pfad)));
        const davor = geschwister[geschwister.findIndex((x) => x.pfad === z.pfad) - 1];
        return tun(() => aendern(einruecken(ordner, z.pfad), davor ? [`${davor.pfad}/${z.name}`] : undefined));
      }
      if (e.key === 'ArrowLeft' && z.tiefe > 0) {
        const oben = elternVon(elternVon(z.pfad));
        return tun(() => aendern(ausruecken(ordner, z.pfad), [oben ? `${oben}/${z.name}` : z.name]));
      }
      return;
    }
    const gehe = (n: number) => {
      const ziel = sichtbar[Math.max(0, Math.min(sichtbar.length - 1, n))];
      if (ziel) waehlen(ziel.pfad, { shiftKey: e.shiftKey });
    };
    if (e.key === 'ArrowDown') return tun(() => gehe(i < 0 ? 0 : i + 1));
    if (e.key === 'ArrowUp') return tun(() => gehe(i < 0 ? 0 : i - 1));
    if (e.key === 'Home') return tun(() => gehe(0));
    if (e.key === 'End') return tun(() => gehe(sichtbar.length - 1));
    if (e.key === 'ArrowRight' && z?.hatKinder) return tun(() => (zu.has(klein(z.pfad)) ? umklappen(z.pfad) : gehe(i + 1)));
    if (e.key === 'ArrowLeft' && z) return tun(() => (z.hatKinder && !zu.has(klein(z.pfad)) ? umklappen(z.pfad) : z.tiefe > 0 && waehlen(elternVon(z.pfad))));
  };

  /* ---------- Ziehen & Ablegen ---------- */

  const zielAus = (e: React.DragEvent, p: string): Wo => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    if (!r.height) return 'in';
    const y = e.clientY - r.top;
    return y < r.height * 0.25 ? 'vor' : y > r.height * 0.75 && !zeile(p)?.hatKinder ? 'nach' : y > r.height * 0.75 && zu.has(klein(p)) ? 'nach' : 'in';
  };

  /* ---------- Darstellung ---------- */

  const vorschauAktiv = vorschau.length > 0;
  const entstehen = vorschauAktiv ? zeilen.filter((z) => ordnerGilt(ordner, z.pfad, vorschau)).length : zeilen.length;
  const menueEintraege = (): { label: string; aktion: () => void; titel?: string; gefahr?: boolean; aus?: boolean; trenner?: boolean }[] => {
    const p = einer?.pfad ?? null;
    return [
      { label: p ? 'Unterordner anlegen' : 'Ordner anlegen', titel: 'Strg+N', aktion: () => anlegen(p ?? '') },
      ...(p ? [{ label: 'Ordner daneben anlegen', titel: 'Strg+Umschalt+N', aktion: () => daneben(p) }] : []),
      { label: gewaehlt.length > 1 ? `Unterordner in ${gewaehlt.length} Ordnern anlegen …` : 'Mehrere Unterordner anlegen …', aktion: () => setMehrere(gewaehlt.length ? gewaehlt : ['']) },
      ...bausteine.map((b) => ({ label: `Baustein „${b.name}“ einfügen`, titel: b.ordner.map((o) => o.pfad).join(', '), aktion: () => einfuegenIn(b.ordner, gewaehlt, `Baustein „${b.name}“`) })),
      { label: '', aktion: () => {}, trenner: true },
      ...(p ? [{ label: 'Umbenennen', titel: 'F2', aktion: () => setBearbeitet({ pfad: p, neu: false }) }] : []),
      ...(p ? [{ label: 'Duplizieren', titel: 'Strg+D – Kopie samt Unterordnern direkt dahinter', aktion: () => dupl(p) }] : []),
      ...(gewaehlt.length ? [{ label: gewaehlt.length > 1 ? `${gewaehlt.length} Ordner kopieren` : 'Kopieren', titel: 'Strg+C', aktion: () => kopieren(gewaehlt) }] : []),
      ...(ablage
        ? [
            {
              label: gewaehlt.length > 1 ? `Einfügen in ${gewaehlt.length} Ordner` : 'Einfügen',
              titel: `Strg+V – ${ordnerAlsText(ablage).split('\n').length} Ordner`,
              aktion: () => einfuegenIn(ablage, gewaehlt, 'Kopie'),
            },
          ]
        : []),
      ...(p && einer?.hatKinder ? [{ label: 'Unterordner als Baustein speichern …', aktion: () => void alsBaustein(p) }] : []),
      ...(gewaehlt.length
        ? [
            { label: '', aktion: () => {}, trenner: true },
            { label: gewaehlt.length > 1 ? `${gewaehlt.length} Ordner löschen` : 'Löschen', titel: 'Entf', gefahr: true, aktion: () => void loeschenFragen(gewaehlt) },
          ]
        : []),
    ];
  };

  return (
    <div className="po-editor">
      <section className="po-col po-editor-baum">
        {kopf}
        <div className="po-werkzeuge" role="toolbar" aria-label="Ordner bearbeiten">
          <button className="small" title="Ordner im Stamm anlegen" onClick={() => anlegen('')}>
            + Ordner
          </button>
          <button className="small" title="Unterordner im gewählten Ordner (Strg+N)" disabled={!einer} onClick={() => einer && anlegen(einer.pfad)}>
            + Unterordner
          </button>
          <button
            className="small"
            title="Mehrere Ordner auf einmal – eine Zeile je Ordner, eingerückt für Unterordner; in allen markierten Ordnern"
            onClick={() => setMehrere(gewaehlt.length ? gewaehlt : [''])}
          >
            Mehrere anlegen …
          </button>
          <span className="po-werkzeuge-trenner" />
          <button className="small" title="Markierte Ordner samt Unterordnern kopieren (Strg+C)" disabled={!gewaehlt.length} onClick={() => kopieren(gewaehlt)}>
            Kopieren
          </button>
          <button
            className="small"
            title={ablage ? `In alle markierten Ordner einfügen (Strg+V) – gleichnamige werden zusammengeführt` : 'Erst Ordner kopieren'}
            disabled={!ablage}
            onClick={() => ablage && einfuegenIn(ablage, gewaehlt, 'Kopie')}
          >
            Einfügen{gewaehlt.length > 1 ? ` (${gewaehlt.length})` : ''}
          </button>
          <button className="small" title="Kopie samt Unterordnern direkt dahinter (Strg+D)" disabled={!einer} onClick={() => einer && dupl(einer.pfad)}>
            Duplizieren
          </button>
          <span className="po-werkzeuge-trenner" />
          <button className="small icon-text" title="Rückgängig (Strg+Z)" aria-label="Rückgängig" disabled={!verlauf.zurueck.length} onClick={rueckgaengig}>
            ↶
          </button>
          <button className="small icon-text" title="Wiederholen (Strg+Y)" aria-label="Wiederholen" disabled={!verlauf.vor.length} onClick={wiederholen}>
            ↷
          </button>
          <span className="po-werkzeuge-trenner" />
          <button className="small" title="Alle Ordner aufklappen" onClick={() => setZu(new Set())}>
            Aufklappen
          </button>
          <button className="small" title="Alle Ordner zuklappen" onClick={() => setZu(new Set(zeilen.filter((z) => z.hatKinder).map((z) => klein(z.pfad))))}>
            Zuklappen
          </button>
        </div>
        <div className="po-vorschau-lph" role="group" aria-label="Vorschau für Leistungsphasen">
          <span className="muted small-text" title="Welche Ordner entstehen bei diesen beauftragten Leistungsphasen? Die übrigen erscheinen blass.">
            Vorschau für LPh
          </span>
          {LPH.map((n) => (
            <button
              key={n}
              className={`po-chip${vorschau.includes(n) ? ' aktiv' : ''}`}
              aria-pressed={vorschau.includes(n)}
              aria-label={`Vorschau LPh ${n}`}
              title={`LPh ${n} ${LEISTUNGSPHASEN[n - 1].label}`}
              onClick={() => setVorschau((v) => (v.includes(n) ? v.filter((x) => x !== n) : [...v, n].sort((a, b) => a - b)))}
            >
              {n}
            </button>
          ))}
          {vorschauAktiv && (
            <span className="small-text">
              {entstehen} von {zeilen.length} Ordnern entstehen{' '}
              <button className="small" onClick={() => setVorschau([])}>
                aus
              </button>
            </span>
          )}
        </div>
        {meldung && (
          <p className="po-meldung po-editor-meldung" role="status">
            {meldung}
          </p>
        )}
        <div
          ref={baum}
          className={`po-k-baum${ziehen ? ' zieht' : ''}`}
          role="tree"
          aria-label="Ordnerstruktur"
          aria-multiselectable
          tabIndex={0}
          aria-activedescendant={cursor && zeile(cursor) ? zeilenId(cursor) : undefined}
          onKeyDown={tasten}
          onContextMenu={(e) => {
            if (e.target !== e.currentTarget) return;
            e.preventDefault();
            setAuswahl([]);
            setMenue({ x: e.clientX, y: e.clientY });
          }}
          onClick={(e) => e.target === e.currentTarget && (setAuswahl([]), setCursor(null))}
        >
          {!zeilen.length && <p className="muted small-text po-k-leer">Noch keine Ordner – „+ Ordner“ legt den ersten an.</p>}
          {sichtbar.map((z) => {
            const sel = enthalten(gewaehlt, z.pfad);
            const offen = z.hatKinder && !zu.has(klein(z.pfad));
            const kette = lphKette(ordner, z.pfad);
            const geerbt = kette.filter((k) => klein(k.pfad) !== klein(z.pfad));
            const entfaellt = vorschauAktiv && !ordnerGilt(ordner, z.pfad, vorschau);
            const dropHier = ziel && klein(ziel.pfad) === klein(z.pfad) ? ` drop-${ziel.wo}` : '';
            return (
              <div
                key={z.pfad}
                id={zeilenId(z.pfad)}
                role="treeitem"
                aria-level={z.tiefe + 1}
                aria-selected={sel}
                aria-expanded={z.hatKinder ? offen : undefined}
                aria-label={z.pfad}
                className={`po-k-zeile${sel ? ' gewaehlt' : ''}${cursor && klein(cursor) === klein(z.pfad) ? ' cursor' : ''}${z.regel ? '' : ' implizit'}${entfaellt ? ' entfaellt' : ''}${dropHier}`}
                style={{ paddingLeft: 4 + z.tiefe * 18 }}
                title={entfaellt ? `${z.pfad} – entsteht bei LPh ${lphText(vorschau)} nicht` : z.pfad}
                draggable={!bearbeitet}
                onClick={(e) => {
                  e.stopPropagation();
                  waehlen(z.pfad, e);
                  baum.current?.focus();
                }}
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  setBearbeitet({ pfad: z.pfad, neu: false });
                }}
                onContextMenu={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  if (!sel) waehlen(z.pfad);
                  setMenue({ x: e.clientX, y: e.clientY });
                }}
                onDragStart={(e) => {
                  const pfade = sel ? gewaehlt : [z.pfad];
                  if (!sel) waehlen(z.pfad);
                  setZiehen(obersteAuswahl(pfade));
                  try {
                    e.dataTransfer.effectAllowed = 'move';
                    e.dataTransfer.setData('text/plain', pfade.join('\n'));
                  } catch {
                    // ohne Datenübergabe (z. B. in Tests) genügt der Zustand
                  }
                }}
                onDragOver={(e) => {
                  if (!ziehen) return;
                  e.preventDefault();
                  const wo = zielAus(e, z.pfad);
                  if (!ziel || ziel.pfad !== z.pfad || ziel.wo !== wo) setZiel({ pfad: z.pfad, wo });
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  if (ziehen) nachDrop(ziehen, z.pfad, zielAus(e, z.pfad));
                  setZiehen(null);
                  setZiel(null);
                }}
                onDragEnd={() => {
                  setZiehen(null);
                  setZiel(null);
                }}
              >
                <button
                  className="po-k-pfeil"
                  tabIndex={-1}
                  aria-label={z.hatKinder ? `${z.pfad} ${offen ? 'zuklappen' : 'aufklappen'}` : undefined}
                  aria-hidden={!z.hatKinder}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (z.hatKinder) umklappen(z.pfad);
                  }}
                >
                  {z.hatKinder ? (offen ? '▾' : '▸') : ''}
                </button>
                <span className="po-art ordner" aria-hidden />
                {bearbeitet && klein(bearbeitet.pfad) === klein(z.pfad) ? (
                  <NamenEingabe
                    name={z.name}
                    onFertig={(v) => {
                      setBearbeitet(null);
                      if (v !== null) namenSetzen(z.pfad, v);
                      baum.current?.focus();
                    }}
                  />
                ) : (
                  <span className="po-k-name">{z.name}</span>
                )}
                {!!z.regel?.lph?.length && (
                  <span className="po-k-marke lph" title={`entsteht nur mit LPh ${lphText(z.regel.lph)}`}>
                    LPh {lphText(z.regel.lph)}
                  </span>
                )}
                {!z.regel?.lph?.length && geerbt.length > 0 && (
                  <span className="po-k-marke geerbt" title={`erbt die Leistungsphasen von „${geerbt[geerbt.length - 1].pfad}“`}>
                    LPh {lphText(geerbt[geerbt.length - 1].lph)}
                  </span>
                )}
                {z.regel?.dateischema && (
                  <span className="po-k-marke schema" title="Dateien darin werden gegen das Dateinamenschema geprüft">
                    Schema
                  </span>
                )}
                <span className="po-k-aktionen">
                  <button
                    className="small"
                    tabIndex={-1}
                    title="Unterordner anlegen"
                    aria-label={`Unterordner in ${z.pfad}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      anlegen(z.pfad);
                    }}
                  >
                    +
                  </button>
                  <button
                    className="small"
                    tabIndex={-1}
                    title="Weitere Aktionen"
                    aria-label={`Aktionen für ${z.pfad}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (!sel) waehlen(z.pfad);
                      const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
                      setMenue({ x: r.left, y: r.bottom });
                    }}
                  >
                    ⋯
                  </button>
                </span>
              </div>
            );
          })}
          {ziehen && (
            <div
              className={`po-k-stamm${ziel?.pfad === '' ? ' drop-in' : ''}`}
              onDragOver={(e) => {
                e.preventDefault();
                if (ziel?.pfad !== '') setZiel({ pfad: '', wo: 'in' });
              }}
              onDrop={(e) => {
                e.preventDefault();
                nachDrop(ziehen, '', 'in');
                setZiehen(null);
                setZiel(null);
              }}
            >
              Hierher ziehen: in den Stamm des Projektordners
            </div>
          )}
        </div>
        <p className="muted small-text po-k-hilfe">
          Klicken wählt, Strg/Umschalt wählt mehrere; Doppelklick oder F2 benennt um; ziehen verschiebt (auf einen Ordner: hinein, an den Rand: davor bzw. dahinter); Rechtsklick für alle Aktionen.
          Strg+N Unterordner, Strg+C/V kopieren und in alle markierten einfügen, Strg+D duplizieren, Alt+Pfeile verschieben und ein-/ausrücken, Strg+Z rückgängig.
        </p>
      </section>

      <aside className="po-editor-seite">
        <section className="po-col po-auswahl-panel" aria-label="Auswahl">
          {!gewaehlt.length && (
            <>
              <h3>Auswahl</h3>
              <p className="muted small-text">Kein Ordner gewählt. Einen Ordner anklicken, um Leistungsphasen und Dateischema festzulegen – mit Strg oder Umschalt auch für mehrere auf einmal.</p>
            </>
          )}
          {einer && (
            <>
              <h3>{einer.name}</h3>
              <p className="po-k-pfad small-text" title={einer.pfad}>
                {einer.pfad.split('/').join(' › ')}
              </p>
              <label className="field">
                <span className="field-label">Name</span>
                <TextField key={einer.pfad} value={einer.name} label="Name des Ordners" onChange={(v) => namenSetzen(einer.pfad, v)} />
              </label>
              <LphWahl
                titel="Entsteht nur mit Leistungsphase"
                stand={(n) => (einer.regel?.lph?.includes(n) ? 'ja' : 'nein')}
                onUmschalten={(n) => lphSetzen([einer.pfad], n)}
                onAlle={(lph) => lphAlle([einer.pfad], lph)}
              />
              <LphHinweis kette={lphKette(ordner, einer.pfad)} pfad={einer.pfad} />
              <label className="toggle">
                <input type="checkbox" checked={!!einer.regel?.dateischema} onChange={() => schemaSetzen([einer.pfad])} />
                Dateinamen prüfen (Dateischema)
              </label>
              <p className="muted small-text">
                {einer.hatKinder ? `${zeilen.filter((x) => klein(x.pfad).startsWith(`${klein(einer.pfad)}/`)).length} Unterordner` : 'keine Unterordner'}
                {einer.regel ? '' : ' · ohne eigene Regel (entsteht über seine Unterordner)'}
              </p>
              <div className="button-row">
                <button className="small" onClick={() => anlegen(einer.pfad)}>
                  + Unterordner
                </button>
                <button className="small" onClick={() => setMehrere([einer.pfad])}>
                  Mehrere …
                </button>
                <button className="small" onClick={() => dupl(einer.pfad)}>
                  Duplizieren
                </button>
                {einer.hatKinder && (
                  <button className="small" title="Die Unterordner als Baustein speichern – z. B. den Aufbau eines Gewerkeordners" onClick={() => void alsBaustein(einer.pfad)}>
                    Als Baustein …
                  </button>
                )}
                <button className="small danger" onClick={() => void loeschenFragen([einer.pfad])}>
                  Löschen
                </button>
              </div>
            </>
          )}
          {gewaehlt.length > 1 && (
            <>
              <h3>{gewaehlt.length} Ordner gewählt</h3>
              <p className="po-k-pfad small-text" title={gewaehlt.join('\n')}>
                {gewaehlt
                  .slice(0, 6)
                  .map((p) => p.split('/').pop())
                  .join(', ')}
                {gewaehlt.length > 6 ? ' …' : ''}
              </p>
              <LphWahl
                titel="Leistungsphasen für alle"
                stand={(n) => {
                  const k = gewaehlt.filter((p) => zeile(p)?.regel?.lph?.includes(n)).length;
                  return k === gewaehlt.length ? 'ja' : k ? 'teils' : 'nein';
                }}
                onUmschalten={(n) => lphSetzen(gewaehlt, n)}
                onAlle={(lph) => lphAlle(gewaehlt, lph)}
              />
              <label className="toggle">
                <input
                  type="checkbox"
                  checked={gewaehlt.every((p) => zeile(p)?.regel?.dateischema)}
                  ref={(el) => {
                    if (el) el.indeterminate = gewaehlt.some((p) => zeile(p)?.regel?.dateischema) && !gewaehlt.every((p) => zeile(p)?.regel?.dateischema);
                  }}
                  onChange={() => schemaSetzen(gewaehlt)}
                />
                Dateinamen prüfen (Dateischema)
              </label>
              <div className="button-row">
                <button className="small" title="In jedem markierten Ordner dieselben Unterordner anlegen" onClick={() => setMehrere(gewaehlt)}>
                  Unterordner in allen …
                </button>
                <button className="small" onClick={() => kopieren(gewaehlt)}>
                  Kopieren
                </button>
                <button className="small danger" onClick={() => void loeschenFragen(gewaehlt)}>
                  Löschen
                </button>
              </div>
            </>
          )}
        </section>

        <section className="po-col po-bausteine" aria-label="Bausteine">
          <h3>Bausteine</h3>
          <p className="muted small-text">
            Wiederkehrende Unterordner, z. B. der Aufbau eines Gewerkeordners: Ordner markieren (auch mehrere) und „Einfügen“ – in jedem entstehen die Unterordner des Bausteins.
          </p>
          {!bausteine.length && (
            <>
              <p className="muted small-text">Noch keine. Ein Baustein entsteht aus den Unterordnern eines Ordners: Rechtsklick → „Unterordner als Baustein speichern …“.</p>
              <button className="small" onClick={() => onBausteine([BEISPIEL_GEWERK])}>
                Beispiel „Gewerk“ anlegen
              </button>
            </>
          )}
          <ul className="po-baustein-liste">
            {bausteine.map((b) => (
              <li key={b.name}>
                <details>
                  <summary>
                    <strong>{b.name}</strong> <span className="muted small-text">{b.ordner.length} Ordner</span>
                  </summary>
                  <pre className="po-baustein-inhalt">
                    {baumZeilen(b.ordner)
                      .map((z) => `${'  '.repeat(z.tiefe)}${z.name}${z.regel?.lph?.length ? ` (LPh ${lphText(z.regel.lph)})` : ''}`)
                      .join('\n')}
                  </pre>
                </details>
                <div className="po-baustein-knoepfe">
                  <button
                    className="small primary"
                    title={gewaehlt.length ? `In ${gewaehlt.length === 1 ? `„${gewaehlt[0]}“` : `${gewaehlt.length} markierte Ordner`} einfügen` : 'Erst Ordner markieren – ohne Auswahl in den Stamm'}
                    onClick={() => einfuegenIn(b.ordner, gewaehlt, `Baustein „${b.name}“`)}
                  >
                    {gewaehlt.length > 1 ? `In ${gewaehlt.length} einfügen` : 'Einfügen'}
                  </button>
                  <button
                    className="small"
                    title="Umbenennen"
                    aria-label={`Baustein ${b.name} umbenennen`}
                    onClick={async () => {
                      const n = (await frageText('Baustein umbenennen', b.name, 'Umbenennen'))?.trim();
                      if (!n || n === b.name) return;
                      if (bausteine.some((x) => x !== b && klein(x.name) === klein(n))) return setMeldung(`Einen Baustein „${n}“ gibt es schon.`);
                      onBausteine(bausteine.map((x) => (x === b ? { ...b, name: n } : x)));
                    }}
                  >
                    ✎
                  </button>
                  <button
                    className="small danger"
                    title="Baustein löschen – die Struktur bleibt unverändert"
                    aria-label={`Baustein ${b.name} löschen`}
                    onClick={async () => {
                      if (await bestaetigen(`Baustein „${b.name}“ löschen?`, 'Eingefügte Ordner bleiben in der Struktur – nur der Baustein entfällt.', 'Löschen', true))
                        onBausteine(bausteine.filter((x) => x !== b));
                    }}
                  >
                    ×
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
        {seite}
      </aside>

      {menue && (
        <KontextMenue x={menue.x} y={menue.y} onClose={() => setMenue(null)}>
          {menueEintraege().map((m, i) =>
            m.trenner ? (
              <hr key={`t${i}`} />
            ) : (
              <button
                key={m.label}
                role="menuitem"
                className={m.gefahr ? 'danger' : undefined}
                title={m.titel}
                disabled={m.aus}
                onClick={() => {
                  setMenue(null);
                  m.aktion();
                }}
              >
                {m.label}
              </button>
            ),
          )}
        </KontextMenue>
      )}

      {mehrere && (
        <MehrereDialog
          ziele={mehrere}
          onAbbrechen={() => setMehrere(null)}
          onAnlegen={(teil) => {
            setMehrere(null);
            einfuegenIn(teil, mehrere.filter(Boolean), `${teil.length} Ordner`);
          }}
        />
      )}
    </div>
  );
}

/** Name direkt im Baum bearbeiten: Enter übernimmt, Esc bricht ab, Verlassen übernimmt */
function NamenEingabe({ name, onFertig }: { name: string; onFertig: (v: string | null) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  const fertig = useRef(false);
  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);
  const ende = (v: string | null) => {
    if (fertig.current) return;
    fertig.current = true;
    onFertig(v);
  };
  return (
    <input
      ref={ref}
      className="po-k-eingabe"
      defaultValue={name}
      aria-label="Neuer Name"
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Enter') ende(e.currentTarget.value);
        if (e.key === 'Escape') ende(null);
      }}
      onBlur={(e) => ende(e.currentTarget.value)}
    />
  );
}

/** Leistungsphasen 1–9 als Schalter, dazu „immer“ und Schnellwahl */
function LphWahl({ titel, stand, onUmschalten, onAlle }: { titel: string; stand: (n: number) => 'ja' | 'nein' | 'teils'; onUmschalten: (n: number) => void; onAlle: (lph: number[]) => void }) {
  return (
    <div className="po-lph-wahl">
      <span className="field-label">{titel}</span>
      <div role="group" aria-label={titel} className="po-chips">
        {LPH.map((n) => {
          const s = stand(n);
          return (
            <button
              key={n}
              className={`po-chip${s === 'ja' ? ' aktiv' : s === 'teils' ? ' teils' : ''}`}
              aria-pressed={s === 'ja' ? true : s === 'teils' ? 'mixed' : false}
              aria-label={`LPh ${n}`}
              title={`LPh ${n} ${LEISTUNGSPHASEN[n - 1].label}`}
              onClick={() => onUmschalten(n)}
            >
              {n}
            </button>
          );
        })}
      </div>
      <div className="po-chips-schnell">
        <button className="small" title="Keine Leistungsphase – der Ordner entsteht immer" onClick={() => onAlle([])}>
          immer
        </button>
        <button className="small" onClick={() => onAlle([1, 2, 3, 4])}>
          1–4
        </button>
        <button className="small" onClick={() => onAlle([5, 6, 7, 8])}>
          5–8
        </button>
        <button className="small" onClick={() => onAlle([6, 7])}>
          6–7
        </button>
        <button className="small" onClick={() => onAlle([8])}>
          8
        </button>
      </div>
    </div>
  );
}

/** Hinweis auf geerbte Leistungsphasen */
function LphHinweis({ kette, pfad }: { kette: { pfad: string; lph: number[] }[]; pfad: string }) {
  const oben = kette.filter((k) => klein(k.pfad) !== klein(pfad));
  if (!oben.length) return null;
  return <p className="po-hinweis small-text">Entsteht nur, wenn auch {oben.map((k) => `„${k.pfad}“ (LPh ${lphText(k.lph)})`).join(' und ')} entsteht – Unterordner erben die Leistungsphasen.</p>;
}

/** Kontextmenü an der Mausposition; Klick daneben und Esc schließen */
function KontextMenue({ x, y, onClose, children }: { x: number; y: number; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEscSchliessen(onClose);
  useEffect(() => {
    const zu = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && onClose();
    window.addEventListener('pointerdown', zu);
    // im Fenster halten
    const el = ref.current;
    if (el) {
      const r = el.getBoundingClientRect();
      if (r.right > window.innerWidth) el.style.left = `${Math.max(4, window.innerWidth - r.width - 4)}px`;
      if (r.bottom > window.innerHeight) el.style.top = `${Math.max(4, window.innerHeight - r.height - 4)}px`;
    }
    return () => window.removeEventListener('pointerdown', zu);
  }, [onClose]);
  return (
    <div ref={ref} className="po-menue" role="menu" style={{ left: x, top: y }}>
      {children}
    </div>
  );
}

/** Mehrere Ordner auf einmal: eingerückte Liste, Vorschau als Baum, in einem oder mehreren Ordnern */
function MehrereDialog({ ziele, onAbbrechen, onAnlegen }: { ziele: string[]; onAbbrechen: () => void; onAnlegen: (teil: OrdnerRegel[]) => void }) {
  const [text, setText] = useState('');
  const gelesen = useMemo(() => ausEingerueckt(text), [text]);
  const wo = ziele.filter(Boolean);
  return (
    <Modal titel="Mehrere Ordner anlegen" onClose={onAbbrechen} klickDaneben={false} breit>
      <h2>Mehrere Ordner anlegen</h2>
      <p className="muted small-text">
        {wo.length === 0 ? 'Im Stamm des Projektordners' : wo.length === 1 ? `In „${wo[0]}“` : `In jedem der ${wo.length} markierten Ordner`}: eine Zeile je Ordner. Eingerückte Zeilen (Tab oder
        Leerzeichen) werden Unterordner der Zeile darüber, „/“ trennt ebenfalls. Zusätze wie in der Textansicht: <code>| LPh 6-7</code>, <code>| Dateischema</code>. Gleichnamige vorhandene Ordner
        werden zusammengeführt.
      </p>
      <div className="po-mehrere">
        <textarea
          className="po-ordnertext"
          aria-label="Ordner, eine Zeile je Ordner"
          autoFocus
          spellCheck={false}
          value={text}
          placeholder={'Rohbau\n\tAngebote\n\tVergabe\nDach\n\tAngebote\n\tVergabe'}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            // Tab rückt ein statt das Feld zu verlassen
            if (e.key === 'Tab') {
              e.preventDefault();
              const el = e.currentTarget;
              const a = el.selectionStart;
              const b = el.selectionEnd;
              const neu = `${text.slice(0, a)}\t${text.slice(b)}`;
              setText(neu);
              requestAnimationFrame(() => el.setSelectionRange(a + 1, a + 1));
            }
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && gelesen.ordner.length) onAnlegen(gelesen.ordner);
          }}
        />
        <div className="po-mehrere-vorschau" aria-label="Vorschau">
          <span className="field-label">Vorschau ({gelesen.ordner.length} Ordner)</span>
          <pre>
            {baumZeilen(gelesen.ordner)
              .map((z) => `${'  '.repeat(z.tiefe)}${z.name}${z.regel?.lph?.length ? `  · LPh ${lphText(z.regel.lph)}` : ''}${z.regel?.dateischema ? '  · Schema' : ''}`)
              .join('\n') || '—'}
          </pre>
        </div>
      </div>
      {gelesen.meldungen.length > 0 && (
        <ul className="warning po-ordnermeldungen">
          {gelesen.meldungen.map((m) => (
            <li key={`${m.zeile}:${m.text}`}>{m.text}</li>
          ))}
        </ul>
      )}
      <div className="dialog-buttons">
        <button className="primary" disabled={!gelesen.ordner.length} onClick={() => onAnlegen(gelesen.ordner)} title="Strg+Enter">
          {wo.length > 1 ? `In ${wo.length} Ordnern anlegen` : 'Anlegen'}
        </button>
        <button onClick={onAbbrechen}>Abbrechen</button>
      </div>
    </Modal>
  );
}
