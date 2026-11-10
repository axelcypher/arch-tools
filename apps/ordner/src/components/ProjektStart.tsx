import { useEffect, useMemo, useRef, useState } from 'react';
import type { ZuletztEintrag } from '@core/platform/konfig';
import { zuletztLesen } from '@core/platform/konfig';
import type { ProjektdateiKopf, ProjektordnerEintrag, ProjektordnerZugriff } from '@core/platform/projektordner';
import { projektdateiFinden, projektdateiKopf, projekteAuflisten } from '@core/platform/projektordner';
import type { UebersichtMarke, UebersichtProjekt } from '@core/ui/ProjektUebersicht';
import { ProjektUebersicht, quellenName } from '@core/ui/ProjektUebersicht';
import { ausOrdnername } from '../nummer';
import { useOrdner } from '../store';

/** Stammdaten je Projektordner: geladen, ohne Projektdatei oder nicht lesbar */
type Kopf = { art: 'da'; kopf: ProjektdateiKopf } | { art: 'fehlt' } | { art: 'fehler'; text: string };

/** so viele Projektordner werden gleichzeitig nach ihrer Projektdatei durchsucht */
const GLEICHZEITIG = 4;

/**
 * Startseite des Assistenten: die gemeinsame Projektübersicht aller Apps – zuletzt geöffnet, darunter die
 * Projektordner je Stammordner. Titel und Marken kommen aus der Projektdatei (nur projekt.json, im Hintergrund
 * nachgeladen, zuletzt geöffnete zuerst). „Neues Projekt“ steht im Kopf.
 */
export function ProjektStart({
  fs,
  entwurf,
  onNeu,
  onLeerNeu,
  onOeffnen,
  onAndererOrdner,
  onEinstellungen,
}: {
  fs: ProjektordnerZugriff;
  /** angefangenes neues Projekt („2026-014 EFH Musterweg“), leer ohne */
  entwurf: string;
  onNeu: () => void;
  onLeerNeu: () => void;
  onOeffnen: (pfad: string) => void;
  onAndererOrdner: () => void;
  onEinstellungen?: () => void;
}) {
  const { allgemein, struktur } = useOrdner();
  const roots = allgemein.projekte;
  const [ordner, setOrdner] = useState<ProjektordnerEintrag[]>([]);
  const [fehler, setFehler] = useState<string[]>([]);
  const [sucht, setSucht] = useState(false);
  const [zuletzt, setZuletzt] = useState<ZuletztEintrag[]>([]);
  const [koepfe, setKoepfe] = useState<Record<string, Kopf>>({});
  const [lauf, setLauf] = useState(0);
  /** schon gelesene Projektordner – beim Neuladen der Liste nicht noch einmal */
  const gelesen = useRef(new Set<string>());

  // Projektordner der Stammordner und zuletzt geöffnete
  useEffect(() => {
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
  }, [fs, roots, lauf]);

  // Projektdateien im Hintergrund lesen – zuletzt geöffnete zuerst, wenige gleichzeitig
  useEffect(() => {
    let aktuell = true;
    const vorne = new Set(zuletzt.map((z) => z.pfad.toLowerCase()));
    const warteschlange = ordner.filter((o) => !gelesen.current.has(o.pfad)).sort((a, b) => Number(vorne.has(b.pfad.toLowerCase())) - Number(vorne.has(a.pfad.toLowerCase())));
    const arbeiter = async () => {
      while (aktuell && warteschlange.length) {
        const o = warteschlange.shift()!;
        let k: Kopf;
        try {
          const datei = await projektdateiFinden(fs, o.pfad);
          const kopf = datei ? await projektdateiKopf(fs, o.pfad, datei.pfad) : null;
          k = kopf ? { art: 'da', kopf } : { art: 'fehlt' };
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
  }, [fs, ordner, zuletzt]);

  const gruppen = useMemo(() => roots.map((r) => ({ id: r, name: quellenName(r, roots), pfad: r })), [roots]);
  const projekte: UebersichtProjekt[] = useMemo(
    () =>
      ordner.map((o) => {
        const k = koepfe[o.pfad];
        const ausName = ausOrdnername(struktur.ordnername, o.name);
        const meta = k?.art === 'da' ? k.kopf.meta : null;
        const kuerzel = meta?.projektcode || ausName.nummer || o.name;
        const titel = meta?.vorhaben || meta?.kurzname || ausName.kurzname || (kuerzel === o.name ? '' : o.name);
        const bauherr = meta ? [meta.bauherr.vorname, meta.bauherr.name].filter(Boolean).join(' ') : '';
        return {
          schluessel: o.pfad,
          gruppe: o.root,
          kuerzel,
          titel,
          ...(meta?.leistungsphasen?.length ? { info: `LPh ${meta.leistungsphasen.join(', ')}` } : {}),
          geaendert: o.geaendert || null,
          suchtext: [o.name, bauherr, meta?.adresse.ort, meta?.adresse.strasse].filter(Boolean).join(' '),
        };
      }),
    [ordner, koepfe, struktur.ordnername],
  );
  const bekannt = new Set(ordner.map((o) => o.pfad.toLowerCase()));
  const zuletztHier = zuletzt.filter((z) => bekannt.has(z.pfad.toLowerCase())).map((z) => ({ schluessel: ordner.find((o) => o.pfad.toLowerCase() === z.pfad.toLowerCase())!.pfad, zeit: z.zeit }));

  const marken = (p: UebersichtProjekt): UebersichtMarke[] => {
    const k = koepfe[p.schluessel];
    if (k?.art === 'fehlt') return [{ text: 'ohne Projektdatei', art: 'hinweis', symbol: 'warnung', titel: 'Im Assistenten ergänzen: Die Stammdaten werden erfasst und die Projektdatei angelegt.' }];
    if (k?.art === 'fehler') return [{ text: 'Projektdatei nicht lesbar', art: 'warnung', symbol: 'warnung', titel: k.text }];
    return [];
  };

  return (
    <ProjektUebersicht
      titel="Projekte"
      gruppen={gruppen}
      projekte={projekte}
      zuletzt={zuletztHier}
      sucht={sucht}
      fehler={fehler}
      onOeffnen={(p) => onOeffnen(p.schluessel)}
      onNeuLaden={() => {
        // „Neu laden“ liest auch die Projektdateien neu
        gelesen.current.clear();
        setKoepfe({});
        setLauf((n) => n + 1);
      }}
      onEinstellungen={onEinstellungen}
      marken={marken}
      kopf={
        <>
          <button className="primary" onClick={onNeu} title="Assistent für ein neues Projekt: Stammdaten, Umfang, Vorlagen, Anlegen">
            {entwurf ? `Weiter mit ${entwurf}` : 'Neues Projekt'}
          </button>
          {entwurf && <button onClick={onLeerNeu}>Neues Projekt (leer)</button>}
          <button onClick={onAndererOrdner} title="Einen Projektordner außerhalb der Stammordner ergänzen">
            Anderen Ordner …
          </button>
        </>
      }
    />
  );
}
