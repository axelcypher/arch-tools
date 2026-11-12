import { useEffect, useMemo, useRef, useState } from 'react';
import type { ZuletztEintrag } from '../platform/konfig';
import { zuletztLesen } from '../platform/konfig';
import type { ProjektdateiKopf, ProjektordnerEintrag, ProjektordnerZugriff } from '../platform/projektordner';
import { AKQUISE_NAME, ARCHIV_NAME, projektdateiFinden, projektdateiKopf, projekteAuflisten, statusAusGruppe, verbinde } from '../platform/projektordner';
import type { UebersichtGruppe, UebersichtMarke, UebersichtProjekt } from './ProjektUebersicht';
import { quellenName } from './ProjektUebersicht';

/**
 * Daten der Projektübersicht aus den Stammordnern: die Projektordner (direkt darin und in Gruppen-, Akquise- und
 * Archivordnern – je Sammelordner ein eigener Abschnitt), „Zuletzt geöffnet“
 * des Benutzers und – im Hintergrund, zuletzt geöffnete zuerst, wenige gleichzeitig – die Stammdaten aus der
 * Projektdatei je Ordner (nur projekt.json). Gemeinsam für alle Apps, die Projektordner zeigen.
 */

/** Stammdaten je Projektordner: geladen, ohne Projektdatei oder nicht lesbar */
export type ProjektKopf = { art: 'da'; kopf: ProjektdateiKopf; pfad: string } | { art: 'fehlt' } | { art: 'fehler'; text: string };

/** Kennung des Abschnitts eines Projekts: der Stammordner bzw. Stammordner und Sammelordner */
export const gruppenId = (root: string, gruppe?: string) => (gruppe ? `${root}|${gruppe}` : root);

/** Reihenfolge der Sammelordner im Stammordner: Gruppen, dann Akquise, dann Archiv */
const rang = (g: string) => (g.split('/').some((t) => ARCHIV_NAME.test(t)) ? 2 : g.split('/').some((t) => AKQUISE_NAME.test(t)) ? 1 : 0);

/** Abschnitte der Übersicht: je Stammordner (in der eingestellten Reihenfolge) die Projekte darin, dann seine Sammelordner */
export function uebersichtGruppen(roots: string[], ordner: ProjektordnerEintrag[]): UebersichtGruppe[] {
  const out: UebersichtGruppe[] = [];
  const einRoot = roots.length === 1;
  for (const r of roots) {
    const name = quellenName(r, roots);
    const unter = [...new Set(ordner.filter((o) => o.root === r && o.gruppe).map((o) => o.gruppe!))].sort((a, b) => rang(a) - rang(b) || a.localeCompare(b, 'de', { numeric: true }));
    if (!unter.length || ordner.some((o) => o.root === r && !o.gruppe)) out.push({ id: r, name, pfad: r, ordnen: r, ...(einRoot ? { offen: true } : {}) });
    for (const g of unter) out.push({ id: gruppenId(r, g), name: `${name} › ${g.split('/').join(' › ')}`, pfad: verbinde(r, g), ordnen: r, ...(einRoot ? { offen: rang(g) < 2 } : {}) });
  }
  return out;
}

/** so viele Projektordner werden gleichzeitig nach ihrer Projektdatei durchsucht */
const GLEICHZEITIG = 4;

/** Nummer und Kurzname aus dem Ordnernamen – Vorgabe: bis zum ersten Leerzeichen die Nummer („2026-014 EFH Musterweg“) */
export function ausOrdnernameEinfach(name: string): { nummer?: string; kurzname?: string } {
  const m = /^(\S+)\s+(.+)$/.exec(name.trim());
  return m ? { nummer: m[1], kurzname: m[2] } : { nummer: name.trim() };
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Nummer und Kurzname aus dem Ordnernamen nach dem Schema der Projektordner („2026-014 EFH Musterweg“ bei
 * „{nummer} {kurzname}“) – dasselbe in allen Apps (Schema aus `allgemein.ordnerSchema`). Leer, wenn er nicht passt.
 */
export function ausOrdnernameNachSchema(schema: string, name: string): { nummer?: string; kurzname?: string } {
  const namen: string[] = [];
  let muster = '';
  let pos = 0;
  for (const m of schema.matchAll(/\{([a-zäöü_]+)(?::[^{}]*)?\}/gi)) {
    muster += escapeRe(schema.slice(pos, m.index));
    const n = m[1].toLowerCase();
    if (n === 'nummer') muster += '(.+?)';
    else if (n === 'kurzname') muster += '(.+)';
    else if (n === 'jahr') muster += '\\d{4}';
    else muster += '.*?';
    if (n === 'nummer' || n === 'kurzname') namen.push(n);
    pos = m.index + m[0].length;
  }
  muster += escapeRe(schema.slice(pos));
  const r = new RegExp(`^${muster}$`).exec(name.trim());
  if (!r) return {};
  const out: { nummer?: string; kurzname?: string } = {};
  namen.forEach((n, i) => {
    const v = r[i + 1]?.trim();
    if (v) out[n as 'nummer' | 'kurzname'] = v;
  });
  return out;
}

/** Ableitung aus den gemeinsamen Einstellungen: nach dem Schema der Struktur, sonst bis zum ersten Leerzeichen */
export const ausOrdnernameMit =
  (schema: string | undefined) =>
  (name: string): { nummer?: string; kurzname?: string } => {
    if (!schema) return ausOrdnernameEinfach(name);
    const n = ausOrdnernameNachSchema(schema, name);
    return n.nummer || n.kurzname ? n : ausOrdnernameEinfach(name);
  };

export interface ProjektListe {
  gruppen: UebersichtGruppe[];
  projekte: UebersichtProjekt[];
  zuletzt: { schluessel: string; zeit: number }[];
  ordner: ProjektordnerEintrag[];
  koepfe: Record<string, ProjektKopf>;
  sucht: boolean;
  fehler: string[];
  /** Marken je Karte: „ohne Projektdatei“ bzw. „nicht lesbar“ */
  marken: (p: UebersichtProjekt) => UebersichtMarke[];
  /** alles neu lesen (auch die Projektdateien) */
  neuLaden: () => void;
}

export function useProjektordnerListe(fs: ProjektordnerZugriff | null, roots: string[], ausName: (name: string) => { nummer?: string; kurzname?: string } = ausOrdnernameEinfach): ProjektListe {
  const [ordner, setOrdner] = useState<ProjektordnerEintrag[]>([]);
  const [fehler, setFehler] = useState<string[]>([]);
  const [sucht, setSucht] = useState(false);
  const [zuletztRoh, setZuletzt] = useState<ZuletztEintrag[]>([]);
  const [koepfe, setKoepfe] = useState<Record<string, ProjektKopf>>({});
  const [lauf, setLauf] = useState(0);
  /** schon gelesene Projektordner – beim Neuladen der Liste nicht noch einmal */
  const gelesen = useRef(new Set<string>());
  const rootsSchluessel = roots.join('|');

  useEffect(() => {
    if (!fs) return;
    let aktuell = true;
    setSucht(true);
    void Promise.all([projekteAuflisten(fs, roots), zuletztLesen().catch(() => [])]).then(([r, z]) => {
      if (!aktuell) return;
      setOrdner(r.projekte);
      setFehler(r.fehler.map((f) => `${f.root}: ${f.text}`));
      setZuletzt(z);
      setSucht(false);
    });
    return () => {
      aktuell = false;
    };
  }, [fs, rootsSchluessel, lauf]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!fs) return;
    let aktuell = true;
    const vorne = new Set(zuletztRoh.map((z) => z.pfad.toLowerCase()));
    const warteschlange = ordner.filter((o) => !gelesen.current.has(o.pfad)).sort((a, b) => Number(vorne.has(b.pfad.toLowerCase())) - Number(vorne.has(a.pfad.toLowerCase())));
    const arbeiter = async () => {
      while (aktuell && warteschlange.length) {
        const o = warteschlange.shift()!;
        let k: ProjektKopf;
        try {
          const datei = await projektdateiFinden(fs, o.pfad);
          const kopf = datei ? await projektdateiKopf(fs, o.pfad, datei.pfad) : null;
          k = kopf && datei ? { art: 'da', kopf, pfad: datei.pfad } : { art: 'fehlt' };
        } catch (e) {
          k = { art: 'fehler', text: e instanceof Error ? e.message : String(e) };
        }
        if (!aktuell) return;
        gelesen.current.add(o.pfad);
        setKoepfe((alt) => ({ ...alt, [o.pfad]: k }));
      }
    };
    for (let i = 0; i < GLEICHZEITIG; i++) void arbeiter();
    return () => {
      aktuell = false;
    };
  }, [fs, ordner, zuletztRoh]);

  const gruppen = useMemo(() => uebersichtGruppen(roots, ordner), [rootsSchluessel, ordner]); // eslint-disable-line react-hooks/exhaustive-deps
  const projekte: UebersichtProjekt[] = useMemo(
    () =>
      ordner.map((o) => {
        const k = koepfe[o.pfad];
        const n = ausName(o.name);
        const meta = k?.art === 'da' ? k.kopf.meta : null;
        const kuerzel = meta?.projektcode || n.nummer || o.name;
        // Titel: Vorhaben, sonst der Name des Projekts in der Datei, sonst Kurzname bzw. Ordnername
        const name = k?.art === 'da' && k.kopf.name !== 'Neues Projekt' ? k.kopf.name : '';
        const titel = meta?.vorhaben || name || meta?.kurzname || n.kurzname || (kuerzel === o.name ? '' : o.name);
        const bauherr = meta ? [meta.bauherr.vorname, meta.bauherr.name].filter(Boolean).join(' ') : '';
        return {
          schluessel: o.pfad,
          gruppe: gruppenId(o.root, o.gruppe),
          kuerzel,
          titel,
          ...(meta?.leistungsphasen?.length ? { info: `LPh ${meta.leistungsphasen.join(', ')}` } : {}),
          // ohne Status in der Projektdatei: aus dem Sammelordner (Archiv → abgeschlossen, Akquise → Akquise)
          ...(meta?.status || statusAusGruppe(o.gruppe) ? { projektStatus: meta?.status ?? statusAusGruppe(o.gruppe) } : {}),
          ...(meta?.antrag ? { antrag: meta.antrag } : {}),
          geaendert: o.geaendert || null,
          suchtext: [o.name, o.gruppe, bauherr, meta?.adresse.ort, meta?.adresse.strasse].filter(Boolean).join(' '),
        };
      }),
    [ordner, koepfe, ausName],
  );
  const zuletzt = useMemo(() => {
    const nachPfad = new Map(ordner.map((o) => [o.pfad.toLowerCase(), o.pfad]));
    return zuletztRoh.filter((z) => nachPfad.has(z.pfad.toLowerCase())).map((z) => ({ schluessel: nachPfad.get(z.pfad.toLowerCase())!, zeit: z.zeit }));
  }, [ordner, zuletztRoh]);

  const marken = (p: UebersichtProjekt): UebersichtMarke[] => {
    const k = koepfe[p.schluessel];
    if (k?.art === 'fehlt')
      return [{ text: 'ohne Projektdatei', art: 'hinweis', symbol: 'warnung', titel: 'Noch keine Projektdatei – beim Öffnen werden die Stammdaten erfasst und die Projektdatei angelegt.' }];
    if (k?.art === 'fehler') return [{ text: 'Projektdatei nicht lesbar', art: 'warnung', symbol: 'warnung', titel: k.text }];
    return [];
  };

  return {
    gruppen,
    projekte,
    zuletzt,
    ordner,
    koepfe,
    sucht,
    fehler,
    marken,
    neuLaden: () => {
      gelesen.current.clear();
      setKoepfe({});
      setLauf((n) => n + 1);
    },
  };
}
