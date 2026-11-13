import type { ReactNode } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { LEISTUNGSPHASEN } from '@core/model';
import { Modal } from '@core/ui/Dialog';
import { TextField } from '@core/ui/fields';
import type { MenuePunkt } from '@core/ui/Menue';
import { MenueKnopf, useMenueOffen, zeigeMenue, zeigeMenueAn } from '@core/ui/Menue';
import { Symbol } from '@core/ui/Symbol';
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
import { lphKette, lphText, ordnerGilt, sichererName } from '../struktur';
import { SPERRGRUND, SPERRGRUND_KURZ } from './StrukturSperre';

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

/** Meldung im Editor: Erfolg oder Fehler (Fehler als Warnung gestaltet) */
interface Meldung {
  art: 'ok' | 'fehler';
  text: string;
}

const TRENNER: MenuePunkt = { trenner: true };

/** Trenner nur zwischen Einträgen – nicht am Anfang, am Ende oder doppelt */
function ohneLoseTrenner(liste: MenuePunkt[]): MenuePunkt[] {
  const out: MenuePunkt[] = [];
  for (const m of liste) {
    if (m.trenner && (!out.length || out[out.length - 1].trenner)) continue;
    out.push(m);
  }
  while (out.length && out[out.length - 1].trenner) out.pop();
  return out;
}

/**
 * Kontextmenü an einer festen Stelle zeigen (Kontextmenütaste): ein Mausereignis mit
 * dieser Position für `zeigeMenue`; der Fokus kehrt danach an das Element zurück, das ihn beim Öffnen hatte (den Baum).
 */
const zeigeMenueBei = (x: number, y: number, punkte: MenuePunkt[], name: string) => zeigeMenue(new MouseEvent('contextmenu', { clientX: x || 1, clientY: y || 1 }), punkte, name);

/**
 * Zeilenknopf „Aktionen“: öffnet das Kontextmenü der Zeile am Knopf (`zeigeMenueAn`); `aria-expanded` folgt dem Menü
 * über `useMenueOffen`. Kein `MenueKnopf`: die Zeile wird beim Öffnen erst gewählt, der Knopf liegt mit `tabIndex -1`
 * außerhalb der Tab-Reihenfolge und zeigt keinen Aufklapp-Pfeil. Bekommt er den Fokus (Mausdruck, Rückgabe nach Esc oder
 * einer Auswahl), reicht er ihn an den Baum weiter – dort wirken die Pfeiltasten.
 */
function ZeilenKnopf({ pfad, onOeffnen, onFokus }: { pfad: string; onOeffnen: (el: HTMLButtonElement) => void; onFokus: () => void }) {
  const ref = useRef<HTMLButtonElement>(null);
  const offen = useMenueOffen(ref);
  return (
    <button
      ref={ref}
      className="small icon"
      tabIndex={-1}
      title="Aktionen (wie Rechtsklick)"
      aria-label={`Aktionen für ${pfad}`}
      aria-haspopup="menu"
      aria-expanded={offen}
      onFocus={onFokus}
      onClick={(e) => {
        e.stopPropagation();
        onOeffnen(e.currentTarget);
      }}
    >
      <Symbol name="mehr" />
    </button>
  );
}

/**
 * Struktur-Editor zum Klicken: der Ordnerbaum wie im Explorer – auswählen (Strg/Umschalt für mehrere), umbenennen
 * (Doppelklick, F2), Unterordner anlegen, ziehen & ablegen, Rechtsklick-Menü, Tastatur. Für wiederkehrende
 * Unterstrukturen (Gewerke …): Kopieren und in beliebig viele markierte Ordner einfügen, Duplizieren, „Mehrere
 * anlegen“ (eingerückte Liste) und **Bausteine** – gespeicherte Unterstrukturen, die sich in alle markierten Ordner
 * auf einmal einfügen lassen. Rechts die Angaben zur Auswahl (Leistungsphasen, Dateischema), auch für mehrere Ordner.
 * Bearbeitet dieselbe Liste (`OrdnerRegel[]`) wie die Textansicht; Rückgängig/Wiederholen für alle Schritte.
 * `gesperrt` (unlesbare Bürostruktur): nur lesen – Baum, Auswahl, Scrollen, Pfeiltasten, Kopieren und die LPh-Vorschau
 * bleiben; was die Liste oder die Bausteine ändert, ist gesperrt, mit dem Grund im Tooltip bzw. im Menü.
 */
export function OrdnerEditor({
  ordner,
  onChange,
  bausteine,
  onBausteine,
  kopf,
  seite,
  gesperrt = false,
}: {
  ordner: OrdnerRegel[];
  onChange: (ordner: OrdnerRegel[]) => void;
  bausteine: Baustein[];
  onBausteine: (b: Baustein[]) => void;
  /** über dem Baum (Überschrift, Umschalter) */
  kopf?: ReactNode;
  /** weitere Abschnitte in der Seitenleiste (unter Auswahl und Bausteinen) */
  seite?: ReactNode;
  /** nur lesen (unlesbare Bürostruktur) */
  gesperrt?: boolean;
}) {
  const zeilen = useMemo(() => baumZeilen(ordner), [ordner]);
  const [auswahl, setAuswahl] = useState<string[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [anker, setAnker] = useState<string | null>(null);
  const [zu, setZu] = useState<Set<string>>(new Set());
  const [bearbeitet, setBearbeitet] = useState<{ pfad: string; neu: boolean } | null>(null);
  const [ablage, setAblage] = useState<OrdnerRegel[] | null>(null);
  const [verlauf, setVerlauf] = useState<{ zurueck: OrdnerRegel[][]; vor: OrdnerRegel[][] }>({ zurueck: [], vor: [] });
  const [ziehen, setZiehen] = useState<string[] | null>(null);
  const [ziel, setZiel] = useState<{ pfad: string; wo: Wo } | null>(null);
  const [mehrere, setMehrere] = useState<string[] | null>(null);
  const [vorschau, setVorschau] = useState<number[]>([]);
  const [vorschauModus, setVorschauModus] = useState(false);
  const [meldung, setMeldungZustand] = useState<Meldung | null>(null);
  const ok = (text: string) => setMeldungZustand({ art: 'ok', text });
  const fehler = (text: string) => setMeldungZustand({ art: 'fehler', text });
  /** Grund der Sperre für Tooltips (ohne Sperre nichts) */
  const grund = gesperrt ? SPERRGRUND : undefined;
  const gesperrtMelden = () => fehler(`${SPERRGRUND}.`);
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

  // Meldungen verschwinden nach einer Weile (Fehler etwas später)
  useEffect(() => {
    if (!meldung) return;
    const t = setTimeout(() => setMeldungZustand(null), meldung.art === 'fehler' ? 10000 : 6000);
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
    if (gesperrt) return false;
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
    if (!vorher || gesperrt) return;
    setVerlauf({ zurueck: verlauf.zurueck.slice(0, -1), vor: [ordner, ...verlauf.vor] });
    eigene.current = vorher;
    onChange(vorher);
  };
  const wiederholen = () => {
    const nachher = verlauf.vor[0];
    if (!nachher || gesperrt) return;
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
      if (name.trim() && name.trim() !== pfad.split('/').pop()) fehler(`„${name.trim()}“ gibt es in diesem Ordner schon.`);
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
    ok(`${obersteAuswahl(pfade).length === 1 ? `„${obersteAuswahl(pfade)[0].split('/').pop()}“` : `${obersteAuswahl(pfade).length} Ordner`} kopiert – markierte Ordner wählen und „Einfügen“.`);
  };
  /** Teilbaum (Zwischenablage, Baustein) in die gewählten Ordner einfügen – ohne Auswahl in den Stamm */
  const einfuegenIn = (teil: OrdnerRegel[], wohin: string[], was: string) => {
    const ziele = wohin.length ? wohin : [''];
    const r = einfuegen(ordner, ziele, teil);
    if (!r.neu.length && r.ordner === ordner) return ok(`${was}: alles schon vorhanden – nichts geändert.`);
    aendern(r.ordner, ziele.filter(Boolean).length ? ziele.filter(Boolean) : r.neu.filter((p) => !p.includes('/')));
    ok(`${was} in ${ziele.length === 1 ? (ziele[0] ? `„${ziele[0].split('/').pop()}“` : 'den Stamm') : `${ziele.length} Ordner`} eingefügt – ${r.neu.length} neu.`);
  };
  const dupl = (pfad: string) => {
    const r = duplizieren(ordner, pfad);
    if (r.pfad && aendern(r.ordner, [r.pfad])) setBearbeitet({ pfad: r.pfad, neu: true });
  };
  const nachDrop = (pfade: string[], zielPfad: string, wo: Wo) => {
    const r = verschiebenNach(ordner, pfade, zielPfad, wo);
    if (!r)
      return fehler(
        zielPfad && obersteAuswahl(pfade).some((p) => klein(zielPfad) === klein(p) || klein(zielPfad).startsWith(`${klein(p)}/`))
          ? 'Ein Ordner lässt sich nicht in sich selbst verschieben.'
          : 'Dort gibt es schon einen Ordner mit diesem Namen.',
      );
    if (wo === 'in' && zielPfad) setZu((alt) => new Set([...alt].filter((x) => x !== klein(zielPfad))));
    aendern(r.ordner, r.pfade);
  };
  /** Bausteine ändern – gesperrt nicht */
  const bausteineSetzen = (b: Baustein[]) => {
    if (!gesperrt) onBausteine(b);
  };
  const alsBaustein = async (pfad: string) => {
    const teil = unterordnerVon(ordner, pfad);
    if (!teil.length) return fehler('Ein Baustein entsteht aus den Unterordnern – dieser Ordner hat keine.');
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
    bausteineSetzen(da ? bausteine.map((b) => (b === da ? { name: da.name, ordner: teil } : b)) : [...bausteine, { name, ordner: teil }]);
    ok(`Baustein „${name}“ gespeichert.`);
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
  /** eine Stelle nach oben bzw. unten unter den Geschwistern */
  const schieben = (z: BaumZeile, um: -1 | 1) => aendern(verschieben(ordner, z.pfad, um), [z.pfad]);
  /** in den Ordner davor einrücken bzw. eine Ebene ausrücken */
  const einr = (z: BaumZeile) => {
    if (z.erster) return;
    const geschwister = zeilen.filter((x) => x.tiefe === z.tiefe && klein(elternVon(x.pfad)) === klein(elternVon(z.pfad)));
    const davor = geschwister[geschwister.findIndex((x) => x.pfad === z.pfad) - 1];
    aendern(einruecken(ordner, z.pfad), davor ? [`${davor.pfad}/${z.name}`] : undefined);
  };
  const ausr = (z: BaumZeile) => {
    if (z.tiefe === 0) return;
    const oben = elternVon(elternVon(z.pfad));
    aendern(ausruecken(ordner, z.pfad), [oben ? `${oben}/${z.name}` : z.name]);
  };
  const schemaSetzen = (pfade: string[]) => {
    const alle = pfade.every((p) => zeile(p)?.regel?.dateischema);
    aendern(
      zusatzSetzenAlle(ordner, pfade, () => ({ dateischema: !alle })),
      pfade,
    );
  };

  /* ---------- Auswahl ---------- */

  /** Kontextmenü per Tastatur: für die Zeile mit der Schreibmarke, unter ihr angeordnet (ohne Schreibmarke am Baum) */
  const menueTastatur = () => {
    const z = zeile(cursor);
    const el = z ? document.getElementById(zeilenId(z.pfad)) : null;
    const sel = z && !enthalten(gewaehlt, z.pfad) ? [z.pfad] : gewaehlt;
    if (z && !enthalten(gewaehlt, z.pfad)) waehlen(z.pfad);
    const r = (el ?? baum.current)?.getBoundingClientRect();
    baum.current?.focus();
    zeigeMenueBei((r?.left ?? 0) + (el ? 24 + z!.tiefe * 18 : 8), el ? (r?.bottom ?? 0) : (r?.top ?? 0) + 8, kontextPunkte(sel), menueName(sel));
  };

  const waehlen = (p: string, e?: { ctrlKey?: boolean; metaKey?: boolean; shiftKey?: boolean }) => {
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
    // nur lesen: Ändern per Taste meldet den Grund (Pfeile, Auswahl, Kopieren und das Menü bleiben)
    const aendernd = (strg && ['z', 'y', 'n', 'v', 'd'].includes(k)) || e.key === 'Delete' || (!!z && (e.key === 'F2' || e.key === 'Enter' || (e.altKey && e.key.startsWith('Arrow'))));
    if (gesperrt && aendernd) return tun(gesperrtMelden);
    if (strg && k === 'z' && !e.shiftKey) return tun(rueckgaengig);
    if (strg && (k === 'y' || (k === 'z' && e.shiftKey))) return tun(wiederholen);
    if (strg && k === 'a') return tun(() => setAuswahl(zeilen.map((x) => x.pfad)));
    if (strg && k === 'n') return tun(() => (e.shiftKey ? daneben(cursor) : anlegen(cursor ?? '')));
    if (strg && k === 'c') return tun(() => kopieren(gewaehlt));
    if (strg && k === 'v') return tun(() => ablage && einfuegenIn(ablage, gewaehlt, 'Kopie'));
    if (strg && k === 'd') return tun(() => z && dupl(z.pfad));
    if (e.key === 'Delete') return tun(() => void loeschenFragen(gewaehlt));
    if ((e.key === 'F2' || e.key === 'Enter') && z) return tun(() => setBearbeitet({ pfad: z.pfad, neu: false }));
    // Umschalt+F10 bzw. die Menütaste: das Kontextmenü der Zeile mit der Schreibmarke
    if (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10')) return tun(menueTastatur);
    if (e.altKey && z) {
      if (e.key === 'ArrowUp') return tun(() => schieben(z, -1));
      if (e.key === 'ArrowDown') return tun(() => schieben(z, 1));
      if (e.key === 'ArrowRight' && !z.erster) return tun(() => einr(z));
      if (e.key === 'ArrowLeft' && z.tiefe > 0) return tun(() => ausr(z));
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
  /** Darf die gezogene Auswahl dort abgelegt werden? (nicht in sich selbst, kein gleichnamiger Ordner) */
  const erlaubt = (zielPfad: string, wo: Wo) => !!ziehen && !!verschiebenNach(ordner, ziehen, zielPfad, wo);
  const ueber = (e: React.DragEvent, zielPfad: string, wo: Wo) => {
    if (!ziehen) return;
    if (!erlaubt(zielPfad, wo)) {
      // verbotenes Ziel: kein Ablegen anbieten (Mauszeiger „nicht erlaubt“), nicht hervorheben
      try {
        e.dataTransfer.dropEffect = 'none';
      } catch {
        // ohne Datenübergabe (Tests)
      }
      if (ziel) setZiel(null);
      return;
    }
    e.preventDefault();
    try {
      e.dataTransfer.dropEffect = 'move';
    } catch {
      // ohne Datenübergabe (Tests)
    }
    if (!ziel || ziel.pfad !== zielPfad || ziel.wo !== wo) setZiel({ pfad: zielPfad, wo });
  };

  /* ---------- Darstellung ---------- */

  const vorschauAktiv = vorschauModus && vorschau.length > 0;
  const entstehen = vorschauAktiv ? zeilen.filter((z) => ordnerGilt(ordner, z.pfad, vorschau)).length : zeilen.length;
  const vorschauBeenden = () => {
    setVorschauModus(false);
    setVorschau([]);
  };
  const einfuegenTitel = ablage ? `${ablage.length} kopierte Ordner – gleichnamige werden zusammengeführt` : 'Erst Ordner kopieren';
  const menueName = (sel: string[]) => (sel.length === 1 ? `Aktionen für ${sel[0].split('/').pop()}` : sel.length ? `Aktionen für ${sel.length} Ordner` : 'Aktionen');
  /** gesperrt (nur lesen): Punkte bleiben sichtbar, der Grund steht im Hinweis; `lesend` (Kopieren, Aufklappen) bleibt bedienbar */
  const sperren = (punkte: MenuePunkt[], lesend: MenuePunkt[] = []): MenuePunkt[] =>
    gesperrt ? punkte.map((m) => (m.trenner || lesend.includes(m) ? m : { ...m, deaktiviert: true, tasten: undefined, hinweis: SPERRGRUND_KURZ, titel: SPERRGRUND })) : punkte;
  /** Kontextmenü für die Ordner `sel` (die Auswahl beim Öffnen – sie kann sich im selben Klick erst ändern) */
  const kontextPunkte = (sel: string[]): MenuePunkt[] => {
    const einer = sel.length === 1 ? zeile(sel[0]) : undefined;
    const p = einer?.pfad ?? null;
    /** Kopieren ändert nichts – auch beim Lesen erlaubt */
    const kopierPunkt: MenuePunkt | null = sel.length ? { text: sel.length > 1 ? `${sel.length} Ordner kopieren` : 'Kopieren', symbol: 'kopie', tasten: 'Strg+C', aktion: () => kopieren(sel) } : null;
    const liste = ohneLoseTrenner([
      { text: p ? 'Unterordner anlegen' : 'Ordner anlegen', symbol: 'plus', tasten: 'Strg+N', aktion: () => anlegen(p ?? '') },
      ...(p ? [{ text: 'Ordner daneben anlegen', tasten: 'Strg+Umschalt+N', aktion: () => daneben(p) }] : []),
      {
        text: sel.length > 1 ? `Unterordner in ${sel.length} Ordnern anlegen …` : sel.length ? 'Mehrere Unterordner anlegen …' : 'Mehrere Ordner anlegen …',
        aktion: () => setMehrere(sel.length ? sel : ['']),
      },
      ...bausteine.map((b) => ({ text: `Baustein „${b.name}“ einfügen`, titel: b.ordner.map((o) => o.pfad).join(', '), aktion: () => einfuegenIn(b.ordner, sel, `Baustein „${b.name}“`) })),
      TRENNER,
      ...(p ? [{ text: 'Umbenennen', symbol: 'stift' as const, tasten: 'F2', aktion: () => setBearbeitet({ pfad: p, neu: false }) }] : []),
      ...(p ? [{ text: 'Duplizieren', tasten: 'Strg+D', titel: 'Kopie samt Unterordnern direkt dahinter', aktion: () => dupl(p) }] : []),
      ...(kopierPunkt ? [kopierPunkt] : []),
      ...(ablage
        ? [
            {
              text: sel.length > 1 ? `Einfügen in ${sel.length} Ordner` : 'Einfügen',
              symbol: 'einfuegen' as const,
              tasten: 'Strg+V',
              titel: einfuegenTitel,
              aktion: () => einfuegenIn(ablage, sel, 'Kopie'),
            },
          ]
        : []),
      ...(p && einer?.hatKinder ? [{ text: 'Unterordner als Baustein speichern …', aktion: () => void alsBaustein(p) }] : []),
      TRENNER,
      ...(einer
        ? [
            { text: 'Nach oben', symbol: 'nachOben' as const, tasten: 'Alt+↑', aktion: () => schieben(einer, -1) },
            { text: 'Nach unten', symbol: 'nachUnten' as const, tasten: 'Alt+↓', aktion: () => schieben(einer, 1) },
            ...(!einer.erster ? [{ text: 'In den Ordner davor einrücken', tasten: 'Alt+→', aktion: () => einr(einer) }] : []),
            ...(einer.tiefe > 0 ? [{ text: 'Eine Ebene ausrücken', tasten: 'Alt+←', aktion: () => ausr(einer) }] : []),
          ]
        : []),
      TRENNER,
      ...(sel.length
        ? [
            {
              text: sel.length > 1 ? `${sel.length} Ordner löschen …` : zeile(sel[0])?.hatKinder ? 'Löschen …' : 'Löschen',
              symbol: 'muell' as const,
              tasten: 'Entf',
              gefahr: true,
              aktion: () => void loeschenFragen(sel),
            },
          ]
        : []),
    ]);
    return sperren(liste, kopierPunkt ? [kopierPunkt] : []);
  };
  const weiterePunkte = (): MenuePunkt[] => {
    const kopierPunkt: MenuePunkt = {
      text: 'Kopieren',
      symbol: 'kopie',
      tasten: 'Strg+C',
      titel: gewaehlt.length ? 'Markierte Ordner samt Unterordnern kopieren' : 'Erst Ordner markieren',
      deaktiviert: !gewaehlt.length,
      aktion: () => kopieren(gewaehlt),
    };
    const aufklappen: MenuePunkt[] = [
      { text: 'Alle aufklappen', aktion: () => setZu(new Set()) },
      { text: 'Alle zuklappen', aktion: () => setZu(new Set(zeilen.filter((z) => z.hatKinder).map((z) => klein(z.pfad)))) },
    ];
    return sperren(
      ohneLoseTrenner([
        kopierPunkt,
        { text: 'Einfügen', symbol: 'einfuegen', tasten: 'Strg+V', titel: einfuegenTitel, deaktiviert: !ablage, aktion: () => ablage && einfuegenIn(ablage, gewaehlt, 'Kopie') },
        {
          text: 'Duplizieren',
          tasten: 'Strg+D',
          titel: einer ? 'Kopie samt Unterordnern direkt dahinter' : 'Erst einen Ordner markieren',
          deaktiviert: !einer,
          aktion: () => einer && dupl(einer.pfad),
        },
        TRENNER,
        ...aufklappen,
      ]),
      [kopierPunkt, ...aufklappen],
    );
  };

  return (
    <div className="po-editor">
      <section className="po-col po-editor-baum">
        {kopf}
        <div className="po-werkzeuge" role="toolbar" aria-label="Ordner bearbeiten">
          <div className="po-werkzeuge-gruppe">
            <button className="small" title={grund ?? 'Ordner im Stamm anlegen'} disabled={gesperrt} onClick={() => anlegen('')}>
              <Symbol name="plus" /> Ordner
            </button>
            <button className="small" title={grund ?? 'Unterordner im gewählten Ordner (Strg+N)'} disabled={!einer || gesperrt} onClick={() => einer && anlegen(einer.pfad)}>
              <Symbol name="plus" /> Unterordner
            </button>
            <button
              className="small"
              title={grund ?? 'Mehrere Ordner auf einmal – eine Zeile je Ordner, eingerückt für Unterordner; in allen markierten Ordnern'}
              disabled={gesperrt}
              onClick={() => setMehrere(gewaehlt.length ? gewaehlt : [''])}
            >
              Mehrere anlegen …
            </button>
          </div>
          <div className="po-werkzeuge-gruppe">
            <button
              className="small icon"
              title={grund ?? 'Rückgängig (Strg+Z)'}
              aria-label="Rückgängig"
              aria-keyshortcuts="Control+Z"
              disabled={!verlauf.zurueck.length || gesperrt}
              onClick={rueckgaengig}
            >
              <Symbol name="rueckgaengig" />
            </button>
            <button
              className="small icon"
              title={grund ?? 'Wiederholen (Strg+Y)'}
              aria-label="Wiederholen"
              aria-keyshortcuts="Control+Y"
              disabled={!verlauf.vor.length || gesperrt}
              onClick={wiederholen}
            >
              <Symbol name="wiederholen" />
            </button>
          </div>
          <div className="po-werkzeuge-gruppe">
            <button
              className={`small${vorschauModus ? ' active' : ''}`}
              aria-pressed={vorschauModus}
              title="Ansehen, welche Ordner bei bestimmten beauftragten Leistungsphasen entstehen – ändert nichts"
              onClick={() => (vorschauModus ? vorschauBeenden() : setVorschauModus(true))}
            >
              LPh-Vorschau
            </button>
            <MenueKnopf className="small" punkte={weiterePunkte} name="Weitere Aktionen">
              Weitere
            </MenueKnopf>
          </div>
        </div>
        {vorschauModus && (
          <div className="po-vorschau-lph" role="group" aria-labelledby="po-vorschau-titel">
            <span id="po-vorschau-titel" className="po-vorschau-titel">
              Vorschau: Welche Ordner entstehen bei LPh …
            </span>
            {LPH.map((n) => (
              <button
                key={n}
                className={`po-chip umriss${vorschau.includes(n) ? ' aktiv' : ''}`}
                aria-pressed={vorschau.includes(n)}
                aria-label={`Vorschau LPh ${n}`}
                title={`LPh ${n} ${LEISTUNGSPHASEN[n - 1].label}`}
                onClick={() => setVorschau((v) => (v.includes(n) ? v.filter((x) => x !== n) : [...v, n].sort((a, b) => a - b)))}
              >
                {n}
              </button>
            ))}
            <span className="small-text po-vorschau-stand">
              {vorschauAktiv ? `${entstehen} von ${zeilen.length} Ordnern entstehen` : 'Leistungsphasen wählen – die übrigen Ordner erscheinen durchgestrichen.'}
            </span>
            <button className="small" onClick={vorschauBeenden}>
              Vorschau beenden
            </button>
          </div>
        )}
        <div className="po-k-rahmen">
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
              // Umschalt+F10 bzw. Menütaste (ohne Mausposition): wie für die Zeile mit der Schreibmarke
              if (e.button !== 2 || (!e.clientX && !e.clientY)) return menueTastatur();
              setAuswahl([]);
              zeigeMenue(e, kontextPunkte([]), menueName([]));
            }}
            onClick={(e) => e.target === e.currentTarget && (setAuswahl([]), setCursor(null))}
          >
            {!zeilen.length && <p className="muted small-text po-k-leer">Noch keine Ordner – der Knopf „Ordner“ (mit Plus) legt den ersten an.</p>}
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
                  className={`po-k-zeile${sel ? ' gewaehlt' : ''}${cursor && klein(cursor) === klein(z.pfad) ? ' cursor' : ''}${entfaellt ? ' entfaellt' : ''}${dropHier}`}
                  style={{ paddingLeft: 4 + z.tiefe * 18 }}
                  title={entfaellt ? `${z.pfad} – entsteht bei LPh ${lphText(vorschau)} nicht` : z.regel ? z.pfad : `${z.pfad} – ohne eigene Regel, entsteht über seine Unterordner`}
                  draggable={!bearbeitet && !gesperrt}
                  onClick={(e) => {
                    e.stopPropagation();
                    waehlen(z.pfad, e);
                    baum.current?.focus();
                  }}
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    if (gesperrt) return gesperrtMelden();
                    setBearbeitet({ pfad: z.pfad, neu: false });
                  }}
                  onContextMenu={(e) => {
                    if (!sel) waehlen(z.pfad);
                    const pfade = sel ? gewaehlt : [z.pfad];
                    // der Fokus kehrt nach dem Menü in den Baum zurück
                    baum.current?.focus();
                    zeigeMenue(e, kontextPunkte(pfade), menueName(pfade));
                  }}
                  onDragStart={(e) => {
                    if (gesperrt) return e.preventDefault();
                    const pfade = sel ? gewaehlt : [z.pfad];
                    // eine Meldung läge über der Ablagefläche „in den Stamm“
                    setMeldungZustand(null);
                    if (!sel) waehlen(z.pfad);
                    setZiehen(obersteAuswahl(pfade));
                    try {
                      e.dataTransfer.effectAllowed = 'move';
                      e.dataTransfer.setData('text/plain', pfade.join('\n'));
                    } catch {
                      // ohne Datenübergabe (z. B. in Tests) genügt der Zustand
                    }
                  }}
                  onDragOver={(e) => ueber(e, z.pfad, zielAus(e, z.pfad))}
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
                    {z.hatKinder && <Symbol name={offen ? 'pfeilUnten' : 'pfeilRechts'} />}
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
                    <ZeilenKnopf
                      pfad={z.pfad}
                      onFokus={() => baum.current?.focus()}
                      onOeffnen={(el) => {
                        if (!sel) waehlen(z.pfad);
                        const pfade = sel ? gewaehlt : [z.pfad];
                        zeigeMenueAn(el, kontextPunkte(pfade), menueName(pfade));
                      }}
                    />
                  </span>
                </div>
              );
            })}
            {ziehen && (
              <div
                className={`po-k-stamm${ziel?.pfad === '' ? ' drop-in' : ''}`}
                onDragOver={(e) => ueber(e, '', 'in')}
                onDrop={(e) => {
                  e.preventDefault();
                  nachDrop(ziehen, '', 'in');
                  setZiehen(null);
                  setZiel(null);
                }}
              >
                Hierher ziehen: {ziehen.length > 1 ? `${ziehen.length} Ordner ` : ''}in den Stamm des Projektordners
              </div>
            )}
          </div>
          {meldung && (
            <p className={`meldung ${meldung.art} po-editor-meldung`} role={meldung.art === 'fehler' ? 'alert' : 'status'}>
              <span>{meldung.text}</span>
              <button className="small icon" aria-label="Meldung schließen" title="Schließen" onClick={() => setMeldungZustand(null)}>
                <Symbol name="schliessen" />
              </button>
            </p>
          )}
        </div>
        <p className="muted small-text po-k-hilfe">
          Rechtsklick oder Umschalt+F10 zeigt alle Aktionen mit ihren Tastenkürzeln. Ziehen verschiebt: auf einen Ordner hinein, an seinen Rand davor bzw. dahinter.
        </p>
      </section>

      <aside className="po-editor-seite">
        <section className="po-col po-auswahl-panel" aria-label="Auswahl">
          {/* nur lesen: Felder und Knöpfe echt gesperrt (fieldset disabled), Texte bleiben lesbar */}
          <fieldset className="po-sperre" disabled={gesperrt} title={grund}>
            {!gewaehlt.length && (
              <>
                <h3>Auswahl</h3>
                <p className="muted small-text">Kein Ordner gewählt. Einen Ordner anklicken, um Leistungsphasen und Dateischema festzulegen – mit Strg oder Umschalt auch für mehrere auf einmal.</p>
              </>
            )}
            {einer && (
              <>
                <h3>{einer.name}</h3>
                {einer.tiefe > 0 && (
                  <p className="po-k-pfad small-text" title={einer.pfad}>
                    {einer.pfad.split('/').join(' › ')}
                  </p>
                )}
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
                  <button className="small danger" onClick={() => void loeschenFragen([einer.pfad])}>
                    {zeile(einer.pfad)?.hatKinder ? 'Löschen …' : 'Löschen'}
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
                  <button className="small danger" onClick={() => void loeschenFragen(gewaehlt)}>
                    {gewaehlt.length} Ordner löschen …
                  </button>
                </div>
              </>
            )}
          </fieldset>
        </section>

        <section className="po-col po-bausteine" aria-label="Bausteine">
          <fieldset className="po-sperre" disabled={gesperrt} title={grund}>
            <h3>Bausteine</h3>
            <p className="muted small-text">
              Wiederkehrende Unterordner, z. B. der Aufbau eines Gewerkeordners: Ordner markieren (auch mehrere) und „Einfügen“ – in jedem entstehen die Unterordner des Bausteins.
            </p>
            {!bausteine.length && (
              <>
                <p className="muted small-text">Noch keine. Ein Baustein entsteht aus den Unterordnern eines Ordners: Rechtsklick → „Unterordner als Baustein speichern …“.</p>
                <button className="small" onClick={() => bausteineSetzen([BEISPIEL_GEWERK])}>
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
                      title={
                        grund ??
                        (gewaehlt.length ? `In ${gewaehlt.length === 1 ? `„${gewaehlt[0]}“` : `${gewaehlt.length} markierte Ordner`} einfügen` : 'Erst Ordner markieren – ohne Auswahl in den Stamm')
                      }
                      onClick={() => einfuegenIn(b.ordner, gewaehlt, `Baustein „${b.name}“`)}
                    >
                      {gewaehlt.length > 1 ? `In ${gewaehlt.length} einfügen` : 'Einfügen'}
                    </button>
                    <button
                      className="small"
                      title={grund ?? 'Umbenennen'}
                      aria-label={`Baustein ${b.name} umbenennen`}
                      onClick={async () => {
                        const n = (await frageText('Baustein umbenennen', b.name, 'Umbenennen'))?.trim();
                        if (!n || n === b.name) return;
                        if (bausteine.some((x) => x !== b && klein(x.name) === klein(n))) return fehler(`Einen Baustein „${n}“ gibt es schon.`);
                        bausteineSetzen(bausteine.map((x) => (x === b ? { ...b, name: n } : x)));
                      }}
                    >
                      <Symbol name="stift" />
                    </button>
                    <button
                      className="small danger"
                      title={grund ?? 'Baustein löschen – die Struktur bleibt unverändert'}
                      aria-label={`Baustein ${b.name} löschen`}
                      onClick={async () => {
                        if (await bestaetigen(`Baustein „${b.name}“ löschen?`, 'Eingefügte Ordner bleiben in der Struktur – nur der Baustein entfällt.', 'Löschen', true))
                          bausteineSetzen(bausteine.filter((x) => x !== b));
                      }}
                    >
                      <Symbol name="muell" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </fieldset>
        </section>
        {seite}
      </aside>

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
  return <p className="meldung">Entsteht nur, wenn auch {oben.map((k) => `„${k.pfad}“ (LPh ${lphText(k.lph)})`).join(' und ')} entsteht – Unterordner erben die Leistungsphasen.</p>;
}

/** Mehrere Ordner auf einmal: eingerückte Liste, Vorschau als Baum, in einem oder mehreren Ordnern */
function MehrereDialog({ ziele, onAbbrechen, onAnlegen }: { ziele: string[]; onAbbrechen: () => void; onAnlegen: (teil: OrdnerRegel[]) => void }) {
  const [text, setText] = useState('');
  const gelesen = useMemo(() => ausEingerueckt(text), [text]);
  const wo = ziele.filter(Boolean);
  return (
    <Modal titel="Mehrere Ordner anlegen" kopf onClose={onAbbrechen} klickDaneben={false} breit>
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
        <span className="muted small-text po-mehrere-kuerzel">Strg+Enter legt an</span>
        <button onClick={onAbbrechen}>Abbrechen</button>
        <button className="primary" disabled={!gelesen.ordner.length} onClick={() => onAnlegen(gelesen.ordner)} title="Strg+Enter" aria-keyshortcuts="Control+Enter">
          {wo.length > 1 ? `In ${wo.length} Ordnern anlegen` : 'Anlegen'}
        </button>
      </div>
    </Modal>
  );
}
