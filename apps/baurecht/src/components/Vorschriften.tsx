import type { KeyboardEvent } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Ampel, NormErgebnis, ParagrafErgebnis } from '@core/baurecht/typen';
import { EBENEN, einheitName, normTitel, paragrafName, THEMEN } from '@core/baurecht/typen';
import type { Pruefstand } from '../pruefung';
import { useBaurecht } from '../store';
import { suchNorm, textPasst } from '../suche';
import { AMPEL_TEXT, AmpelMarke, datum, inBereichZeigen, nb } from './Ampel';

type Gruppierung = 'offen' | 'ebene' | 'thema';

const SPEICHER = 'baurecht:vorschriften';
const AMPELN = ['rot', 'gelb', 'gruen'] as const;

function gemerkt(): { gruppierung: Gruppierung; ampeln: Ampel[] } {
  try {
    const r = JSON.parse(localStorage.getItem(SPEICHER) ?? '{}') as { gruppierung?: Gruppierung; ampeln?: Ampel[] };
    return { gruppierung: r.gruppierung === 'thema' || r.gruppierung === 'ebene' ? r.gruppierung : 'offen', ampeln: Array.isArray(r.ampeln) && r.ampeln.length ? r.ampeln : [...AMPELN] };
  } catch {
    return { gruppierung: 'offen', ampeln: [...AMPELN] };
  }
}

function merken(w: { gruppierung: Gruppierung; ampeln: Ampel[] }) {
  try {
    localStorage.setItem(SPEICHER, JSON.stringify(w));
  } catch {
    // nur für diese Sitzung
  }
}

/** Marke „von Hand“ – Entwurf als Wort, nicht nur als gestrichelter Rahmen */
function VonHand({ p }: { p: ParagrafErgebnis }) {
  if (!p.festlegung) return null;
  const entwurf = !p.festlegung.bestaetigt;
  return (
    <span className={`br-marke${entwurf ? ' br-marke-entwurf' : ''}`} title={entwurf ? 'von Hand festgelegt – Entwurf, wird beim Speichern bestätigt' : `von Hand festgelegt (${p.festlegung.von})`}>
      {entwurf ? 'von Hand · Entwurf' : 'von Hand'}
    </span>
  );
}

function ParagrafZeile({ p, gewaehlt, tabStop, onFokus }: { p: ParagrafErgebnis; gewaehlt: boolean; tabStop: boolean; onFokus: () => void }) {
  const e = einheitName(p.paragraf, p.titel);
  return (
    <li>
      <button
        type="button"
        className={`br-paragraf${gewaehlt ? ' br-gewaehlt' : ''}`}
        aria-current={gewaehlt ? 'true' : undefined}
        tabIndex={tabStop ? 0 : -1}
        data-roving={`p:${p.id}`}
        onFocus={onFokus}
        onClick={() => useBaurecht.getState().waehlen(p.id)}
      >
        <AmpelMarke ampel={p.ampel} klein vonHand={!!p.festlegung} />
        {/* Paragrafen mit Nummer in der Spalte; benannte Einheiten (Satzungen, Listen) stehen im Titel – nicht doppelt */}
        <span className="br-paragraf-nr">{e.nr}</span>
        <span className="br-paragraf-kopf">
          <span className="br-paragraf-titel" lang="de">
            {nb(e.titel || '–')}
          </span>
          <span className="br-paragraf-marken">
            <VonHand p={p} />
            {p.ueberholt && (
              <span className="br-marke br-marke-warn" title={`Festlegung überholt: ${p.ueberholt}`}>
                überholt
              </span>
            )}
            {!p.ueberholt && p.unwirksam && (
              <span className="br-marke br-marke-warn" title={`Festlegung „entfällt“ noch nicht wirksam: ${p.unwirksam}`}>
                nicht wirksam
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
        </span>
        {/* bei einer Festlegung ihre Begründung (sonst stünde neben „von Hand“ der automatische Grund) */}
        <span className="br-paragraf-grund">{nb(p.festlegung && !p.ueberholt && !p.unwirksam ? `Von Hand: ${p.festlegung.grund}` : (p.gruende[0] ?? ''))}</span>
      </button>
    </li>
  );
}

/** Zähler einer Norm – als Wörter, nicht nur als Farbe; gezählt werden die sichtbaren Zeilen („von 25“, wenn gefiltert) */
function Zaehler({ sichtbar, gesamt }: { sichtbar: ParagrafErgebnis[]; gesamt: number }) {
  const z = { rot: 0, gelb: 0, gruen: 0 };
  for (const p of sichtbar) z[p.ampel]++;
  return (
    <span className="br-zaehler">
      {AMPELN.map((a) =>
        z[a] ? (
          <span key={a} className={`br-zahl-chip br-chip-${a}`}>
            {z[a]} {AMPEL_TEXT[a]}
          </span>
        ) : null,
      )}
      {sichtbar.length < gesamt && <span className="br-zaehler-von">von {gesamt}</span>}
    </span>
  );
}

function NormKarte({
  gruppe,
  n,
  sichtbar,
  offen,
  umschalten,
  gewaehlt,
  tabStop,
  setFokus,
}: {
  gruppe: string;
  n: NormErgebnis;
  sichtbar: ParagrafErgebnis[];
  offen: boolean;
  umschalten: () => void;
  gewaehlt: string | null;
  tabStop: string;
  setFokus: (k: string) => void;
}) {
  const laedt = useBaurecht((s) => s.laedt.includes(n.id));
  const id = `br-norm-${gruppe}-${n.id.replace(/[^\w-]/g, '_')}`;
  const kopf = `n:${gruppe}|${n.id}`;
  return (
    // eine Gruppe, keine Landmarke (sonst gäbe es dieselbe Norm als Landmarke unter „prüfen“ und „gilt“)
    <div role="group" className={`br-norm${n.geltung === 'nein' ? ' br-norm-entfaellt' : ''}`} aria-labelledby={id}>
      <h4 className="br-norm-h">
      <button type="button" className="br-norm-kopf" aria-expanded={offen} onClick={umschalten} tabIndex={tabStop === kopf ? 0 : -1} data-roving={kopf} onFocus={() => setFokus(kopf)}>
        <span className="br-norm-pfeil" aria-hidden="true">
          {offen ? '▾' : '▸'}
        </span>
        <span className="br-norm-name" id={id}>
          <strong>{n.def.kurz}</strong> <span className="br-leise">{nb(normTitel(n.def))}</span>
          {n.geltung === 'nein' && <span className="br-norm-entfaellt-text"> · Norm berührt das Vorhaben nicht</span>}
        </span>
        <Zaehler sichtbar={sichtbar} gesamt={n.paragrafen.length} />
      </button>
      </h4>
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
            {n.fassung && n.fehler && (
              <span className="br-warn-text" title={n.fehler}>
                letzter Abruf fehlgeschlagen – Stand {datum(n.fassung.abgerufen)}
              </span>
            )}
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
                <ParagrafZeile key={p.id} p={p} gewaehlt={gewaehlt === p.id} tabStop={tabStop === `p:${p.id}`} onFokus={() => setFokus(`p:${p.id}`)} />
              ))}
            </ul>
          ) : (
            <p className="br-leise br-leer">Keine Paragrafen in diesem Filter.</p>
          )}
        </div>
      )}
    </div>
  );
}

/** Kennung des Filterstands (Suche, Kästchen, Ampeln) – eine Meldung gilt nur für den Stand, den sie gesetzt hat */
const filterKennung = (suche: string, nurHand: boolean, nurGeaendert: boolean, ampeln: readonly string[]) => `${suche}|${nurHand}|${nurGeaendert}|${ampeln.join(',')}`;

/** „§§ 248, 249 BauGB sind nicht erfasst“ – lange Listen zusammengefasst („29 der 35 §§ sind nicht erfasst“) */
export function nichtErfasst(fehlen: string[], gesucht: number, norm?: string): string {
  const n = norm ? ` ${norm}` : '';
  if (fehlen.length > 5) return `${fehlen.length === gesucht ? `alle ${gesucht}` : `${fehlen.length} der ${gesucht}`} §§${n} sind nicht erfasst`;
  return `${fehlen.length > 1 ? '§§' : '§'} ${fehlen.join(', ')}${n} ${fehlen.length > 1 ? 'sind' : 'ist'} nicht erfasst`;
}

/**
 * Suche: „§ 34 BauGB“, „§34“, „34 BauGB“, „GEG 80“ finden genau den Paragrafen (Nummer + Norm in beliebiger
 * Reihenfolge; die Norm zuerst genau nach ihrer Kurzform, erst dann im Titel). Findet die Paragrafensuche nichts
 * („22 m“, „1996“, „50 kW“), gilt die Volltextsuche über Titel, Norm und Begründungen.
 */
export function suchTreffer(sucheRoh: string, normen: NormErgebnis[] = []): ((p: ParagrafErgebnis, n: NormErgebnis) => boolean) & { hinweis?: string } {
  const norm = suchNorm;
  if (!norm(sucheRoh)) return () => true;
  // benannte Einheiten wie „C.3“ (Landschaftsplan) genau – sonst läse die Suche „3“ als Paragrafennummer
  const einheit = sucheRoh.trim().toLowerCase();
  if (/^[a-z]+\.\d+[a-z]?$/.test(einheit) && normen.some((n) => n.paragrafen.some((p) => p.paragraf.toLowerCase() === einheit))) return (p) => p.paragraf.toLowerCase() === einheit;
  // Bindestrich bzw. Gedankenstrich zwischen Nummern heißt „bis“ – nur im Zitat („§§ 30–35“), nicht im Volltext
  // („DIN 4108-2“, „2016-01“)
  const suche = sucheRoh.includes('§') ? sucheRoh.replace(/(\d[a-z]?)\s*[–-]\s*(\d)/gi, '$1 bis $2') : sucheRoh;
  // Volltext (Kürzel am Wortanfang, Zahlen als ganzes Wort, Synonyme – dieselbe Suche wie in den Angaben) mit dem Rohtext
  const volltext = (p: ParagrafErgebnis, n: NormErgebnis) => textPasst(`${paragrafName(p.paragraf)} ${p.titel} ${n.def.kurz} ${n.def.titel} ${p.gruende.join(' ')}`, sucheRoh);
  // Zitat zerlegen: Satzzeichen weg; „Abs./Satz/Nr./Ziff. n (a)“ und römische Absatzziffern gehören nicht zur Nummer;
  // mit „§“ bzw. „§§“ sind die Zahlen direkt danach die Nummern („§§ 30, 34 BauGB“), sonst die erste freie Zahl
  const q = norm(suche.replace(/[.,;:]/g, ' '))
    .replace(/(?:^| )(?:abs|absatz|satz|nr|ziff|s)\.? ?\d+[a-z]?(?: [a-z])?(?= |$)/g, ' ')
    .replace(/(?:^| )(?:buchst|lit)\.? ?[a-z](?= |$)/g, ' ')
    // römische Absatzziffern nur direkt nach einer Nummer („34 I“) – „LP II“ ist eine Norm
    .replace(/(\d+[a-z]?) [ivx]{1,4}(?= |$)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
  const tokens = q.split(' ').filter(Boolean);
  const istNr = (t: string) => /^\d+[a-z]?$/.test(t);
  let nrs: string[] = [];
  // „§§ 30 ff.“: ab der Nummer
  let ab = false;
  if (suche.includes('§')) {
    const nach = norm(suche.slice(suche.indexOf('§')).replace(/[.,;:]/g, ' ')).split(' ').filter(Boolean);
    let bis = false;
    for (const t of nach) {
      if (istNr(t)) {
        // „§§ 30 bis 35“: der ganze Bereich
        const von = Number.parseInt(nrs[nrs.length - 1] ?? '', 10);
        const zu = Number.parseInt(t, 10);
        if (bis && Number.isFinite(von) && Number.isFinite(zu) && zu > von && zu - von < 100) for (let k = von + 1; k < zu; k++) nrs.push(String(k));
        nrs.push(t);
        bis = false;
      } else if (t === 'bis') bis = true;
      // „ff.“: ab der Nummer; „f.“: die Nummer und die folgende
      else if (t === 'ff') ab = true;
      else if (t === 'f' && nrs.length && /^\d+$/.test(nrs[nrs.length - 1])) nrs.push(String(Number.parseInt(nrs[nrs.length - 1], 10) + 1));
      else if (t !== 'und' && t !== '§') break;
    }
  }
  if (!nrs.length) {
    const erste = tokens.find(istNr);
    if (erste) nrs = [erste];
  }
  if (!nrs.length) return volltext;
  const rest = tokens.filter((t) => !istNr(t) && !['und', 'bis', 'ff', 'f'].includes(t)).join(' ');
  const nummer = (x: string) => Number.parseInt(x, 10);
  const trifftNr = (p: ParagrafErgebnis) => nrs.includes(p.paragraf.toLowerCase()) || (ab && nrs.length === 1 && /^\d/.test(p.paragraf) && nummer(p.paragraf) >= nummer(nrs[0]));
  const ohne = (x: string) => norm(x).replace(/ /g, '');
  // Norm: genau die Kurzform („BauO NRW“ ist nicht „SAN-VO … BauO NRW“), sonst Kurzform enthält bzw. Titel enthält
  const stufen: ((n: NormErgebnis) => boolean)[] = rest ? [(n) => ohne(n.def.kurz) === ohne(rest), (n) => ohne(n.def.kurz).includes(ohne(rest)), (n) => norm(n.def.titel).includes(rest)] : [() => true];
  for (const st of stufen) {
    const passt = (p: ParagrafErgebnis, n: NormErgebnis) => trifftNr(p) && st(n);
    if (!normen.length || normen.some((n) => n.paragrafen.some((p) => passt(p, n)))) {
      // teilweise nicht erfasst („§§ 1 bis 3 BauNVO“ ohne § 1): das sagt die Trefferzeile
      const fehlen = ab ? [] : nrs.filter((nr) => !normen.some((n) => st(n) && n.paragrafen.some((p) => p.paragraf.toLowerCase() === nr)));
      return fehlen.length ? Object.assign(passt, { hinweis: nichtErfasst(fehlen, nrs.length) }) : passt;
    }
  }
  // keinen dieser Paragrafen gibt es in den Regeln – dann die Norm selbst, wenn sie genannt ist („§ 1 BauNVO“ → BauNVO)
  if (rest)
    for (const st of stufen.slice(0, 2)) {
      const n0 = normen.find(st);
      if (n0) return Object.assign((_p: ParagrafErgebnis, n: NormErgebnis) => st(n), { hinweis: `${nichtErfasst(nrs, nrs.length, n0.def.kurz)} – gezeigt: ${n0.def.kurz}` });
    }
  // ausdrücklich nach einem Paragrafen gefragt, ohne Norm und ohne Treffer: nichts (der Leerzustand sagt das)
  if (suche.includes('§')) return () => false;
  return volltext;
}

const ORDNUNGEN = [
  ['offen', 'offen zuerst'],
  ['ebene', 'nach Ebene'],
  ['thema', 'nach Thema'],
] as const;

const GRUPPE_OFFEN: { id: Ampel; titel: string }[] = [
  { id: 'gelb', titel: 'Prüfen – von Hand klären' },
  { id: 'rot', titel: 'Gilt – im Antrag berücksichtigen' },
  { id: 'gruen', titel: 'Entfällt' },
];

/** Vorschriften offen zuerst, nach Ebene oder nach Thema; je Norm die Paragrafen mit Ampel */
export function Vorschriften({ stand }: { stand: Pruefstand }) {
  const auswahl = useBaurecht((s) => s.auswahl);
  const [w, setW] = useState(gemerkt);
  const [suche, setSuche] = useState('');
  const [nurHand, setNurHand] = useState(false);
  const [nurGeaendert, setNurGeaendert] = useState(false);
  const [zu, setZu] = useState<Set<string>>(new Set());
  const [fokus, setFokus] = useState<string | null>(null);
  const [ampelHinweis, setAmpelHinweis] = useState('');
  const liste = useRef<HTMLDivElement>(null);
  const setze = (n: typeof w) => {
    setW(n);
    merken(n);
  };
  const { auswertung } = stand;
  // Festlegungen aus einer älteren Datei ohne Ortsangabe: in einem Schritt dem jetzigen Ort zuordnen (als Entwurf)
  const ohneOrt = auswertung.paragrafen.filter((p) => p.festlegung && !p.festlegung.ort).map((p) => p.id);
  const passt = useMemo(() => suchTreffer(suche, auswertung.normen), [suche, auswertung.normen]);
  const filter = (p: ParagrafErgebnis, n: NormErgebnis) =>
    w.ampeln.includes(p.ampel) &&
    (!nurHand || !!p.festlegung) &&
    (!nurGeaendert || p.geaendert.length > 0 || !!p.ueberholt) &&
    passt(p, n);
  const gruppen = useMemo(() => {
    if (w.gruppierung === 'offen') return GRUPPE_OFFEN.map((g) => ({ id: g.id, titel: g.titel, ampel: g.id as Ampel | undefined, normen: auswertung.normen.filter((n) => n.paragrafen.some((p) => p.ampel === g.id) || (g.id === 'gelb' && n.ohneRegel)) }));
    const l = w.gruppierung === 'ebene' ? EBENEN.map((e) => ({ id: e.id, titel: e.titel, ampel: undefined, normen: auswertung.normen.filter((n) => n.ebene === e.id) })) : THEMEN.map((t) => ({ id: t.id, titel: t.titel, ampel: undefined, normen: auswertung.normen.filter((n) => n.def.thema === t.id) }));
    return l.filter((g) => g.normen.length);
  }, [auswertung.normen, w.gruppierung]);
  const modulName = (id: string) => stand.module.find((m) => m.id === id)?.name ?? id;
  const zaehler = auswertung.zaehler;
  const summe = zaehler.rot + zaehler.gelb + zaehler.gruen || 1;
  const filterAktiv = !!suche || nurHand || nurGeaendert || w.ampeln.length < 3;
  // nur gesucht (kein Kästchen, alle Ampeln): „Suche leeren“ statt „Filter zurücksetzen“
  const nurSuche = !!suche && !nurHand && !nurGeaendert && w.ampeln.length === 3;
  const suchfeld = useRef<HTMLInputElement>(null);
  // Meldung der Sammelaktion – gilt nur für den Filterstand, den die Aktion gesetzt hat (jede Filteränderung löscht sie)
  const [ortMeldung, setOrtMeldung] = useState<{ text: string; filter: string } | null>(null);
  const zuruecksetzen = () => {
    setSuche('');
    setNurHand(false);
    setNurGeaendert(false);
    setze({ ...w, ampeln: [...AMPELN] });
    // der Knopf verschwindet mit dem Filter – der Fokus geht ins Suchfeld statt auf die Seite
    setTimeout(() => suchfeld.current?.focus(), 0);
  };

  // sichtbare Gruppen mit ihren Normen und Paragrafen
  const ansicht = gruppen
    .map((g) => ({
      ...g,
      normen: g.normen
        .map((n) => ({ n, sichtbar: n.paragrafen.filter((p) => (!g.ampel || p.ampel === g.ampel) && filter(p, n)) }))
        .filter((x) => x.sichtbar.length || (!filterAktiv && x.n.ohneRegel && (!g.ampel || g.ampel === 'gelb'))),
    }))
    .filter((g) => g.normen.length);
  const treffer = new Set(ansicht.flatMap((g) => g.normen.flatMap((x) => x.sichtbar.map((p) => p.id)))).size;
  const trefferText = filterAktiv ? `${ortMeldung && ortMeldung.filter === filterKennung(suche, nurHand, nurGeaendert, w.ampeln) ? `${ortMeldung.text} · ` : ''}${treffer} von ${auswertung.paragrafen.length} Paragrafen${passt.hinweis ? ` – ${passt.hinweis}` : ''}` : '';
  const [trefferAnsage, setTrefferAnsage] = useState('');
  // bei jeder Eingabe neu (nicht nur, wenn sich die Zahl ändert): angesagt wird, wenn die Eingabe ruht
  const filterNow = filterKennung(suche, nurHand, nurGeaendert, w.ampeln);
  useEffect(() => {
    const t = setTimeout(() => setTrefferAnsage(trefferText), 450);
    return () => clearTimeout(t);
  }, [trefferText, filterNow]);

  // ein Tabstopp für die ganze Liste (roving tabindex): die gewählte Zeile, sonst die zuletzt fokussierte, sonst die erste
  const schluessel = ansicht.flatMap((g) => g.normen.flatMap((x) => [`n:${g.id}|${x.n.id}`, ...(zu.has(`${g.id}|${x.n.id}`) ? [] : x.sichtbar.map((p) => `p:${p.id}`))]));
  const tabStop = (auswahl && schluessel.includes(`p:${auswahl}`) ? `p:${auswahl}` : fokus && schluessel.includes(fokus) ? fokus : schluessel[0]) ?? '';
  useEffect(() => {
    if (auswahl) setFokus(`p:${auswahl}`);
  }, [auswahl]);
  // die gewählte Zeile bleibt im Blick: bei neuer Auswahl (auch aus „Siehe auch“/„Hängt an“) und wenn sie nach einer
  // Festlegung in eine andere Gruppe wandert
  const gewaehlteAmpel = auswertung.paragrafen.find((x) => x.id === auswahl)?.ampel;
  useEffect(() => {
    if (!auswahl) return;
    const zeile = liste.current?.querySelector<HTMLElement>(`[data-roving="p:${CSS.escape(auswahl)}"]`);
    inBereichZeigen(liste.current, zeile ?? null);
  }, [auswahl, gewaehlteAmpel]);
  // die Auswahl für Effekte, die nur auf Ordnung bzw. Filter reagieren sollen (nicht auf jede Auswahl)
  const auswahlRef = useRef(auswahl);
  auswahlRef.current = auswahl;
  const gewaehlteZeile = () => (auswahlRef.current ? (liste.current?.querySelector<HTMLElement>(`[data-roving="p:${CSS.escape(auswahlRef.current)}"]`) ?? null) : null);
  // anderer Ordnung: die gewählte Zeile mittig einblenden, sonst an den Anfang
  const ersterLauf = useRef(true);
  useEffect(() => {
    if (ersterLauf.current) {
      ersterLauf.current = false;
      return;
    }
    const zeile = gewaehlteZeile();
    if (zeile) inBereichZeigen(liste.current, zeile, 'mitte');
    else if (liste.current) liste.current.scrollTop = 0;
  }, [w.gruppierung]);
  // Suche oder Filter geändert (auch geleert bzw. zurückgesetzt): die gewählte Zeile mittig einblenden, sobald sie
  // wieder in der Liste steht
  const filterSchluessel = filterKennung(suche, nurHand, nurGeaendert, w.ampeln);
  const ersterFilter = useRef(true);
  useEffect(() => {
    if (ersterFilter.current) {
      ersterFilter.current = false;
      return;
    }
    const zeile = gewaehlteZeile();
    if (zeile) inBereichZeigen(liste.current, zeile, 'mitte');
  }, [filterSchluessel]);
  useEffect(() => {
    if (ortMeldung && ortMeldung.filter !== filterSchluessel) setOrtMeldung(null);
  }, [filterSchluessel, ortMeldung]);
  // Filter-Menü (schmal): Klick daneben und Tab hinaus schließen; Esc nur, wenn der Fokus im Menü steht (nicht hinter
  // einem Dialog)
  const menue = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const zu = (e: MouseEvent) => {
      const m = menue.current;
      if (m?.open && !m.contains(e.target as Node)) m.open = false;
    };
    document.addEventListener('mousedown', zu);
    return () => document.removeEventListener('mousedown', zu);
  }, []);
  const menueTaste = (e: KeyboardEvent<HTMLDetailsElement>) => {
    const m = menue.current;
    if (!m?.open) return;
    if (e.key === 'Escape') {
      e.stopPropagation();
      m.open = false;
      m.querySelector('summary')?.focus();
    }
    // ↑/↓ zwischen den Kästchen des Menüs, Pos1/Ende auf das erste bzw. letzte (die Kästchen sind keine Tabstopps)
    if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) {
      const el = [...m.querySelectorAll<HTMLInputElement>('.br-filter-menue-inhalt input')];
      if (!el.length) return;
      const i = el.indexOf(document.activeElement as HTMLInputElement);
      el[e.key === 'Home' ? 0 : e.key === 'End' ? el.length - 1 : (i + (e.key === 'ArrowDown' ? 1 : el.length - 1)) % el.length]?.focus();
      e.preventDefault();
    }
  };
  // im Menü (schmal) keine eigenen Tabstopps – dort wandern ↑/↓/Pos1/Ende
  const kaesten = (imMenue: boolean) => (
    <>
      <label className="toggle">
        <input type="checkbox" tabIndex={imMenue ? -1 : undefined} checked={nurHand} onChange={(e) => setNurHand(e.target.checked)} /> nur von Hand festgelegte
      </label>
      <label className="toggle">
        <input type="checkbox" tabIndex={imMenue ? -1 : undefined} checked={nurGeaendert} onChange={(e) => setNurGeaendert(e.target.checked)} /> nur geänderte/überholte
      </label>
    </>
  );
  const taste = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) return;
    const el = [...(liste.current?.querySelectorAll<HTMLButtonElement>('[data-roving]') ?? [])];
    if (!el.length) return;
    const i = el.findIndex((x) => x === document.activeElement);
    const ziel = e.key === 'Home' ? 0 : e.key === 'End' ? el.length - 1 : Math.min(el.length - 1, Math.max(0, i + (e.key === 'ArrowDown' ? 1 : -1)));
    e.preventDefault();
    el[ziel].focus();
    inBereichZeigen(liste.current, el[ziel]);
    const k = el[ziel].dataset.roving ?? '';
    if (k.startsWith('p:')) useBaurecht.getState().waehlen(k.slice(2));
  };

  return (
    <main className="br-vorschriften" aria-labelledby="br-vorschriften-titel">
      {/* Bereichsüberschrift wie „Angaben“ und „Einzelheiten“ (sichtbar sagt es die Filterleiste) */}
      <h2 id="br-vorschriften-titel" className="br-unsichtbar">
        Vorschriften
      </h2>
      <div className="br-filter" role="group" aria-label="Ergebnis und Filter">
        <div className="br-filter-zeile">
        <span className="br-segment br-bilanz" role="group" aria-label="Ergebnis – Ampeln ein- und ausblenden">
          {AMPELN.map((a) => {
            const an = w.ampeln.includes(a);
            return (
              <button
                key={a}
                type="button"
                aria-pressed={an}
                title={an ? `${AMPEL_TEXT[a]} ausblenden` : `${AMPEL_TEXT[a]} einblenden`}
                className={`br-filter-ampel br-chip-${a}${an ? ' active' : ''}`}
                onClick={() => {
                  if (an && w.ampeln.length === 1) {
                    setAmpelHinweis('Mindestens eine Ampel bleibt eingeblendet.');
                    return;
                  }
                  setAmpelHinweis('');
                  setze({ ...w, ampeln: an ? w.ampeln.filter((x) => x !== a) : [...w.ampeln, a] });
                }}
              >
                <span className="br-filter-haken" aria-hidden="true">
                  {an ? '✓' : ''}
                </span>
                <strong>{zaehler[a]}</strong> {AMPEL_TEXT[a]}
              </button>
            );
          })}
        </span>
        <span className="br-balken" aria-hidden="true">
          {AMPELN.map((a) => (
            <span key={a} className={`br-balken-${a}`} style={{ width: `${(zaehler[a] / summe) * 100}%` }} />
          ))}
        </span>
        {/* breit: Segmente; schmal (Container unter 640 px): Auswahlliste */}
        <span className="br-segment br-ordnung br-nur-breit" role="group" aria-label="Ordnung">
          {ORDNUNGEN.map(([g, t]) => (
            <button key={g} type="button" className={w.gruppierung === g ? 'active' : ''} aria-pressed={w.gruppierung === g} onClick={() => setze({ ...w, gruppierung: g })}>
              {t}
            </button>
          ))}
        </span>
        <select className="br-ordnung-wahl br-nur-schmal" value={w.gruppierung} onChange={(e) => setze({ ...w, gruppierung: e.target.value as Gruppierung })} aria-label="Ordnung">
          {ORDNUNGEN.map(([g, t]) => (
            <option key={g} value={g}>
              {t}
            </option>
          ))}
        </select>
        </div>
        <div className="br-filter-zeile2">
          <input ref={suchfeld} className="br-suchfeld" type="search" placeholder="§ oder Stichwort …" value={suche} onChange={(e) => setSuche(e.target.value)} aria-label="Vorschriften durchsuchen" />
          <span className="br-filter-kaesten br-nur-breit">{kaesten(false)}</span>
          <details
            className="br-filter-menue br-nur-schmal"
            ref={menue}
            onKeyDown={menueTaste}
            onToggle={(e) => {
              // beim Öffnen den Fokus ins Menü
              if ((e.currentTarget as HTMLDetailsElement).open) (e.currentTarget as HTMLDetailsElement).querySelector<HTMLInputElement>('.br-filter-menue-inhalt input')?.focus();
            }}
            onBlur={(e) => {
              if (menue.current?.open && !menue.current.contains(e.relatedTarget as Node | null)) menue.current.open = false;
            }}
          >
            <summary>
              Filter{nurHand || nurGeaendert ? ` (${Number(nurHand) + Number(nurGeaendert)})` : ''} <span aria-hidden="true">▾</span>
            </summary>
            <div className="br-filter-menue-inhalt">{kaesten(true)}</div>
          </details>
          <span className="br-leise" role="status">
            {ampelHinweis}
          </span>
        </div>
      </div>
      {ohneOrt.length > 0 && (
        <div className="br-meldung br-meldung-warn br-ohne-ort" role="status">
          {ohneOrt.length === 1 ? 'Eine Festlegung' : `${ohneOrt.length} Festlegungen`} ohne Ortsangabe (ältere Datei) {ohneOrt.length === 1 ? 'gilt' : 'gelten'} als überholt. Übernehmen ordnet {ohneOrt.length === 1 ? 'sie' : 'sie alle'} dem jetzigen Ort zu – als Entwurf, beim Speichern zu bestätigen.{' '}
          <button type="button" className="small br-link" onClick={() => setNurGeaendert(true)} title="Nur die geänderten bzw. überholten Paragrafen zeigen">
            zeigen
          </button>{' '}
          <button
            type="button"
            className="small"
            onClick={() => {
              const n = ohneOrt.length;
              useBaurecht.getState().festlegungenOrtUebernehmen(ohneOrt);
              // die Entwürfe zeigen (nur von Hand festgelegte) – eine Meldung in der Trefferzeile (eine Live-Region), Fokus
              // ins Suchfeld statt auf die Seite
              setNurGeaendert(false);
              setNurHand(true);
              setOrtMeldung({ text: `${n === 1 ? 'Eine Festlegung' : `${n} Festlegungen`} dem jetzigen Ort zugeordnet – als Entwurf, beim Speichern bestätigen`, filter: filterKennung(suche, true, false, w.ampeln) });
              setTimeout(() => suchfeld.current?.focus(), 0);
            }}
            title="Dem jetzigen Ort zuordnen – als Entwurf; beim Speichern wird jede noch einmal bestätigt"
          >
            Für diesen Ort übernehmen
          </button>
        </div>
      )}
      {/* die Live-Region liest nur den Stand vor, nicht den Knopf; ohne Treffer steht „zurücksetzen“ nur im Leerzustand */}
      <div className="br-treffer">
        {/* sichtbar; für Screenreader steht derselbe Text (entprellt) in der Live-Region daneben */}
        <span aria-hidden="true">{trefferText}</span>
        {/* angesagt wird entprellt (nicht bei jedem Tastendruck) – wie in den Angaben */}
        <span className="br-unsichtbar" aria-live="polite">
          {trefferAnsage}
        </span>
        {filterAktiv && treffer > 0 && (
          <>
            {' '}
            <button type="button" className="small br-link" onClick={zuruecksetzen}>
              {nurSuche ? 'Suche leeren' : 'Filter zurücksetzen'}
            </button>
          </>
        )}
      </div>
      <div className="br-vorschriften-liste" ref={liste} onKeyDown={taste}>
        {ansicht.map((g) => (
          <section key={g.id} className="br-gruppe" aria-labelledby={`br-gruppe-${g.id}`}>
            <h3 id={`br-gruppe-${g.id}`}>
              {g.titel}
              {w.gruppierung === 'ebene' && [...new Set(g.normen.map((x) => modulName(x.n.modul)))].filter((m) => m !== g.titel).length > 0 && <span className="br-gruppe-module"> · {[...new Set(g.normen.map((x) => modulName(x.n.modul)))].join(', ')}</span>}
            </h3>
            {g.normen.map(({ n, sichtbar }) => {
              const k = `${g.id}|${n.id}`;
              return (
                <NormKarte
                  key={k}
                  gruppe={g.id}
                  n={n}
                  sichtbar={sichtbar}
                  offen={!zu.has(k)}
                  gewaehlt={auswahl}
                  tabStop={tabStop}
                  setFokus={setFokus}
                  umschalten={() => {
                    const s = new Set(zu);
                    if (s.has(k)) s.delete(k);
                    else s.add(k);
                    setZu(s);
                  }}
                />
              );
            })}
          </section>
        ))}
        {!ansicht.length && gruppen.length > 0 && (
          <div className="br-leer-zustand">
            <p>{nurSuche ? `Keine Paragrafen zu „${suche}“.` : `Keine Paragrafen${suche ? ` zu „${suche}“` : ''} in diesem Filter.`}</p>
            <button type="button" onClick={zuruecksetzen}>
              {nurSuche ? 'Suche leeren' : 'Filter zurücksetzen'}
            </button>
          </div>
        )}
        {!gruppen.length && <p className="br-leer">Keine Vorschriften – das Regelpaket enthält für diese Lage noch kein Modul.</p>}
      </div>
    </main>
  );
}
