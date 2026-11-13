import { useEffect, useMemo, useRef, useState } from 'react';
import type { MsgKopf } from '@core/mail/msg';
import { msgKopf } from '@core/mail/msg';
import type { ProjektordnerEintrag } from '@core/platform/projektordner';
import { projekteAuflisten } from '@core/platform/projektordner';
import { logger } from '@core/platform/log';
import { bestaetigen } from '@core/ui/Rueckfrage';
import { Symbol } from '@core/ui/Symbol';
import type { Dateisystem } from '../dateisystem';
import { hatDateisystem, oeffneOrdner, tauriDateisystem, verbinde, waehleOrdner, waehleOrdnerImBrowser } from '../dateisystem';
import type { MailTeile, MailVorschlag, NamensBefund, Richtung } from '../mail/mailname';
import { datumGueltig, domainVon, MAIL_SCHEMA, mailName, mailNamePruefen, mailVorschlag } from '../mail/mailname';
import { eigeneDomainRaten, useMails } from '../mail/mailStore';
import { ausOrdnername } from '../nummer';
import type { GeladenerOrdner } from '../projekt';
import { projektEinlesen } from '../projekt';
import { pfadGrenze, pfadZuLang } from '../plan';
import { useOrdner } from '../store';
import { ladeProjektordner } from './AssistentView';

const log = logger('mails');

interface Zeile {
  /** Pfad im Projektordner */
  pfad: string;
  /** Ordner im Projektordner ('' = Stamm) */
  ordner: string;
  datei: string;
  befund: NamensBefund;
  /** Abweichungen, die erst die Nachricht zeigt (Datum, von/an) */
  inhalt: string[];
  kopf?: MsgKopf;
  lesefehler?: string;
  vorschlag?: MailVorschlag;
  /** die Teile des neuen Namens – vorgeschlagen, von Hand änderbar */
  teile?: MailTeile;
  bearbeitet: boolean;
  gewaehlt: boolean;
  offen: boolean;
  status?: { art: 'ok' | 'fehler'; text: string };
}

/** aus Outlook hereingezogene (oder gewählte) Mail, die noch nicht im Projekt liegt */
interface NeueMail {
  id: number;
  /** Name, unter dem sie ankam (Outlook: „<Betreff>.msg“) */
  herkunft: string;
  daten: Uint8Array;
  kopf?: MsgKopf;
  lesefehler?: string;
  vorschlag?: MailVorschlag;
  teile?: MailTeile;
  /** Zielordner im Projekt ('' = Stamm) */
  ordner: string;
  /** dieselbe Mail liegt schon im Projekt (gleicher Betreff und Versand) */
  schonDa?: string;
  /** dieselbe Mail ist in dieser Ablage schon dabei (Name, unter dem sie ankam) */
  doppelt?: string;
  status?: { art: 'ok' | 'fehler'; text: string };
}

const name = (pfad: string) => pfad.split('/').pop() ?? pfad;
const ordnerVon = (pfad: string) => pfad.split('/').slice(0, -1).join('/');
const istFalsch = (z: Zeile) => !z.befund.ok || z.inhalt.length > 0;
/** dieselbe Nachricht? Betreff und Versandzeit gleich – ohne Versandzeit (Entwurf) nie */
const gleicheMail = (a: MsgKopf, b: MsgKopf) => !!a.gesendet && !!b.gesendet && a.gesendet.getTime() === b.gesendet.getTime() && a.betreff === b.betreff;
/** JJMMTT eines Tages und der Nachbartage – zum Vorfiltern der Mails, deren Kopf für den Abgleich gelesen wird */
const tageUm = (d?: Date) =>
  d
    ? [-1, 0, 1].map((v) => {
        const x = new Date(d.getTime() + v * 86400000);
        return `${String(x.getFullYear() % 100).padStart(2, '0')}${String(x.getMonth() + 1).padStart(2, '0')}${String(x.getDate()).padStart(2, '0')}`;
      })
    : [];
/** Klartext statt der technischen Meldung des Lesers (die steht im Tooltip und im Protokoll) */
const LESEFEHLER = 'Die Datei ist keine lesbare Outlook-Mail.';
let naechsteId = 1;
/** so viele Namen zeigt die Rückfrage vor dem Sammel-Umbenennen */
const VORSCHAU = 4;
/**
 * Desktop: Ist der vollständige Zielpfad einer Mail unter Windows zu lang? Dann ein Klartext statt der Fehlermeldung des
 * Betriebssystems beim Umbenennen bzw. Ablegen (Grenze für Dateien wie im Plan: 260 Zeichen).
 */
const zuLangText = (fs: Dateisystem | null, basis: string, pfad: string): string | null => {
  if (!fs || !basis) return null;
  const voll = verbinde(basis, pfad);
  return pfadZuLang(voll) ? `Pfad zu lang (${voll.length} Zeichen, Windows erlaubt höchstens ${pfadGrenze(false) - 1}) – Thema oder Name kürzen` : null;
};
const tag = (d?: Date) => (d ? d.toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '–');

/** Teile vergleichen, die aus der Nachricht folgen: Datum, Richtung und – wenn die Richtung stimmt – nichts weiter */
function inhaltPruefen(bisher: MailTeile | null, v: MailVorschlag, mitRichtung: boolean): string[] {
  if (!bisher) return [];
  const out: string[] = [];
  if (v.teile.datum && bisher.datum !== v.teile.datum) out.push(`Datum ${bisher.datum} – die Mail ist vom ${v.teile.datum} (${bisher.richtung === 'an' ? 'Versand' : 'Empfang'})`);
  if (mitRichtung && bisher.richtung !== v.teile.richtung) out.push(`„${bisher.richtung}“ statt „${v.teile.richtung}“ (${v.herkunft})`);
  return out;
}

/**
 * Mails im Projektordner prüfen und benennen: sucht alle Outlook-Nachrichten (.msg) im Projektordner (mit
 * Unterordnern), zeigt die, die nicht nach dem Schema `<Projektcode> von|an <Name> <JJMMTT> <Thema>.msg` heißen, und
 * schlägt aus der Nachricht selbst den richtigen Namen vor – Datum aus Empfang bzw. Versand, Name des Gegenübers (auch
 * aus einer Weiterleitung), Thema aus dem Betreff. Der Vorschlag lässt sich ändern; umbenannt wird nur auf Klick, im
 * selben Ordner, nie überschreibend.
 */
export function MailView({ fs: fsVorgabe, start }: { fs?: Dateisystem; start?: string | null }) {
  const desktop = hatDateisystem();
  const fs = fsVorgabe ?? (desktop ? tauriDateisystem : null);
  const struktur = useOrdner((s) => s.struktur);
  const roots = useOrdner((s) => s.allgemein.projekte);
  const { eigene, geladen: einstellungenGeladen, fehler: einstellungenFehler, setEigene } = useMails();
  const [projekte, setProjekte] = useState<ProjektordnerEintrag[]>([]);
  const [suche, setSuche] = useState('');
  const [projekt, setProjekt] = useState<(GeladenerOrdner & { code: string }) | null>(null);
  const [zeilen, setZeilen] = useState<Zeile[]>([]);
  const [nurFalsche, setNurFalsche] = useState(true);
  const [laeuft, setLaeuft] = useState<string | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [eigeneText, setEigeneText] = useState('');
  const [neue, setNeue] = useState<NeueMail[]>([]);
  const [ziehtDrueber, setZiehtDrueber] = useState(false);
  const dateiWahl = useRef<HTMLInputElement>(null);
  const projektListe = useRef<HTMLUListElement>(null);
  /** Kennung des Einlesens: nach einem Projektwechsel verwirft ein noch laufender alter Lauf seine Ergebnisse */
  const lauf = useRef(0);
  const zeilenRef = useRef<Zeile[]>([]);
  zeilenRef.current = zeilen;
  const neueRef = useRef<NeueMail[]>([]);
  neueRef.current = neue;

  useEffect(() => {
    if (!einstellungenGeladen) void useMails.getState().laden();
  }, [einstellungenGeladen]);
  useEffect(() => setEigeneText(eigene.join(', ')), [eigene]);

  const rootsSchluessel = roots.join('|');
  useEffect(() => {
    if (!fs || !roots.length) return setProjekte([]);
    let aktuell = true;
    void projekteAuflisten(fs, roots).then((r) => aktuell && setProjekte(r.projekte));
    return () => {
      aktuell = false;
    };
  }, [fs, rootsSchluessel]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (start) void ladenPfad(start);
  }, [start]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ---------- Einlesen ---------- */

  /**
   * eine Nachricht lesen und daraus den Vorschlag bilden – mit den eigenen Domains, die beim Lesen gelten (aus dem
   * Speicher, nicht aus dem Stand beim Rendern: ein laufendes Einlesen sieht so auch inzwischen gespeicherte Domains)
   */
  const lesen = async (o: GeladenerOrdner & { code: string }, z: Zeile, vorgabe?: string[]): Promise<Zeile> => {
    try {
      const kopf = z.kopf ?? msgKopf(await o.lies(z.pfad), { mitText: true });
      // erst nach dem Lesen nachsehen – das Lesen kann dauern
      const mitEigenen = vorgabe ?? useMails.getState().eigene;
      const vorschlag = mailVorschlag(kopf, { code: o.code, eigene: mitEigenen, bisher: z.befund.teile });
      const bisher = z.befund.ok ? z.befund.teile : null;
      const inhalt = inhaltPruefen(bisher, vorschlag, mitEigenen.length > 0);
      // korrekt benannt: das Thema von Hand bleibt; nur Datum bzw. Richtung und Name kommen aus der Nachricht
      const teile = bisher
        ? { ...bisher, datum: vorschlag.teile.datum || bisher.datum, ...(inhalt.some((x) => x.startsWith('„')) ? { richtung: vorschlag.teile.richtung, name: vorschlag.teile.name } : {}) }
        : vorschlag.teile;
      return { ...z, kopf, vorschlag, inhalt, teile: z.bearbeitet && z.teile ? z.teile : teile, gewaehlt: z.gewaehlt || !z.befund.ok || inhalt.length > 0 };
    } catch (e) {
      return { ...z, lesefehler: e instanceof Error ? e.message : String(e), gewaehlt: false };
    }
  };

  /** Nachrichten nacheinander lesen (die falsch benannten zuerst); `kennung` = Lauf, zu dem das Einlesen gehört */
  const allesLesen = async (o: GeladenerOrdner & { code: string }, liste: Zeile[], auchRichtige: boolean, kennung = lauf.current) => {
    // noch nicht bewertet (ein nur zum Raten bzw. Abgleich gelesener Kopf zählt nicht)
    const offen = liste.filter((z) => !z.vorschlag && !z.lesefehler && (auchRichtige || !z.befund.ok));
    let i = 0;
    for (const z of offen) {
      if (kennung !== lauf.current) return;
      setLaeuft(`Mails werden gelesen … ${++i} / ${offen.length}`);
      const neu = await lesen(o, z);
      if (kennung !== lauf.current) return;
      setZeilen((alt) => alt.map((x) => (x.pfad === z.pfad ? { ...neu, gewaehlt: neu.gewaehlt, offen: x.offen } : x)));
    }
    setLaeuft(null);
  };

  const auswerten = async (o: GeladenerOrdner, kennung = ++lauf.current) => {
    const g = await projektEinlesen(o);
    if (kennung !== lauf.current) return;
    const code = g.angaben?.nummer || ausOrdnername(struktur.ordnername, o.name).nummer || o.name.split(' ')[0];
    const p = { ...o, code };
    const liste: Zeile[] = o.eintraege
      .filter((e) => !e.ordner && /\.msg$/i.test(e.pfad) && !/^~\$/.test(name(e.pfad)))
      .map((e) => {
        const befund = mailNamePruefen(name(e.pfad), code);
        return { pfad: e.pfad, ordner: ordnerVon(e.pfad), datei: name(e.pfad), befund, inhalt: [], bearbeitet: false, gewaehlt: !befund.ok, offen: false };
      });
    log.info(`Mails eingelesen: ${o.name}`, { mails: liste.length, falsch: liste.filter((z) => !z.befund.ok).length });
    setProjekt(p);
    setZeilen(liste);
    setNeue([]);
    await allesLesen(p, liste, false, kennung);
    // ohne eigene Domain: ein paar korrekt benannte Mails lesen, um sie zu erraten (nur den Kopf, ohne sie zu bewerten)
    if (!useMails.getState().eigene.length) {
      for (const z of liste.filter((x) => x.befund.ok).slice(0, 6)) {
        try {
          const kopf = msgKopf(await p.lies(z.pfad), { mitText: true });
          if (kennung !== lauf.current) return;
          setZeilen((alt) => alt.map((x) => (x.pfad === z.pfad ? { ...x, kopf } : x)));
        } catch {
          // nicht lesbar: zählt beim Raten nicht
        }
      }
    }
  };

  const ladenPfad = async (pfad: string) => {
    if (!fs) return;
    const kennung = ++lauf.current;
    setFehler(null);
    setLaeuft('Projektordner wird gelesen …');
    try {
      const o = await ladeProjektordner(pfad, fs);
      if (kennung === lauf.current) await auswerten(o, kennung);
    } catch (e) {
      if (kennung !== lauf.current) return;
      setFehler(e instanceof Error ? e.message : String(e));
      setLaeuft(null);
    }
  };

  const ordnerWaehlen = async () => {
    setFehler(null);
    if (desktop) {
      const p = await waehleOrdner('Projektordner wählen');
      if (p) await ladenPfad(p);
      return;
    }
    const o = await waehleOrdnerImBrowser();
    if (o) await auswerten({ pfad: '', name: o.name, eintraege: o.eintraege, lies: o.lies });
  };

  /* ---------- Bearbeiten und Umbenennen ---------- */

  const aendern = (pfad: string, patch: Partial<MailTeile>) =>
    setZeilen((alt) => alt.map((z) => (z.pfad === pfad && z.teile ? { ...z, teile: { ...z.teile, ...patch }, bearbeitet: true, status: undefined } : z)));
  const umschalten = (pfad: string, patch: Partial<Zeile>) => setZeilen((alt) => alt.map((z) => (z.pfad === pfad ? { ...z, ...patch } : z)));

  /** neuer Name einer Zeile und ob er taugt */
  const ziel = (z: Zeile, liste = zeilen): { name: string; pfad: string; problem: string | null } | null => {
    if (!z.teile) return null;
    const n = mailName({ ...z.teile, code: projekt?.code ?? z.teile.code });
    const pfad = z.ordner ? `${z.ordner}/${n}` : n;
    const b = mailNamePruefen(n, projekt?.code ?? '');
    let problem: string | null = null;
    if (!z.teile.name.trim()) problem = 'Name fehlt';
    else if (!datumGueltig(z.teile.datum)) problem = 'Datum als JJMMTT';
    else if (!z.teile.thema.trim()) problem = 'Thema fehlt';
    else if (!b.ok) problem = b.gruende[0];
    else if (n === z.datei) problem = 'unverändert';
    else if (liste.some((x) => x !== z && x.pfad.toLowerCase() === pfad.toLowerCase()) || projekt?.eintraege.some((e) => e.pfad.toLowerCase() === pfad.toLowerCase() && e.pfad !== z.pfad))
      problem = 'diesen Namen gibt es in dem Ordner schon';
    else problem = zuLangText(fs, projekt?.pfad ?? '', pfad);
    return { name: n, pfad, problem };
  };

  const umbenennen = async (liste: Zeile[]) => {
    if (!projekt || !fs?.umbenennen) return;
    const kennung = lauf.current;
    // mehrere auf einmal: vorher fragen – mit Anzahl und den ersten Namen (ein Rückgängig gibt es nicht)
    const bereit = liste.flatMap((z) => {
      const t = ziel(z);
      return t && !t.problem ? [{ alt: z.datei, neu: t.name }] : [];
    });
    if (bereit.length > 1) {
      const vorschau = bereit.slice(0, VORSCHAU).map((b) => `${b.alt}\n   → ${b.neu}`);
      const rest = bereit.length - vorschau.length;
      const ausgelassen = liste.length - bereit.length;
      const text = [
        ...vorschau,
        ...(rest > 0 ? [`… und ${rest} weitere`] : []),
        '',
        `Umbenannt wird im selben Ordner, nie überschreibend – rückgängig machen lässt es sich nicht.${ausgelassen ? ` ${ausgelassen} gewählte ${ausgelassen === 1 ? 'Mail bleibt' : 'Mails bleiben'} unverändert – der Grund steht in der Zeile.` : ''}`,
      ].join('\n');
      if (!(await bestaetigen(`${bereit.length} Mails umbenennen?`, text, 'Umbenennen'))) return;
      // während der Rückfrage ein anderes Projekt gewählt: nichts tun
      if (kennung !== lauf.current) return;
    }
    setFehler(null);
    let i = 0;
    let erfolgreich = 0;
    for (const z of liste) {
      const t = ziel(z);
      if (!t || t.problem) continue;
      if (kennung !== lauf.current) return;
      setLaeuft(`Mails werden umbenannt … ${++i} / ${liste.length}`);
      try {
        const ok = await fs.umbenennen(projekt.pfad, z.pfad, t.pfad);
        // inzwischen ein anderes Projekt gewählt: dessen Zeilen nicht anfassen (umbenannt ist trotzdem)
        if (kennung !== lauf.current) return log.info(`Mail umbenannt: ${z.pfad} → ${t.pfad}`);
        if (!ok) {
          umschalten(z.pfad, { status: { art: 'fehler', text: 'Den Namen gibt es schon – nichts geändert.' } });
          continue;
        }
        erfolgreich++;
        log.info(`Mail umbenannt: ${z.pfad} → ${t.pfad}`);
        const befund = mailNamePruefen(t.name, projekt.code);
        setZeilen((alt) =>
          alt.map((x) =>
            x.pfad === z.pfad ? { ...x, pfad: t.pfad, datei: t.name, befund, inhalt: [], gewaehlt: false, bearbeitet: false, status: { art: 'ok', text: `umbenannt (vorher: ${z.datei})` } } : x,
          ),
        );
        setProjekt((p) => (p ? { ...p, eintraege: p.eintraege.map((e) => (e.pfad === z.pfad ? { ...e, pfad: t.pfad } : e)) } : p));
      } catch (e) {
        umschalten(z.pfad, { status: { art: 'fehler', text: e instanceof Error ? e.message : String(e) } });
      }
    }
    setLaeuft(null);
    if (erfolgreich) log.info(`${erfolgreich} Mails umbenannt in ${projekt.name}`);
  };

  /** Projektcode geändert: Namen neu prüfen, Vorschläge nachführen */
  const codeSetzen = (code: string) => {
    if (!projekt) return;
    const c = code.trim();
    setProjekt({ ...projekt, code: c });
    setZeilen((alt) =>
      alt.map((z) => {
        const befund = mailNamePruefen(z.datei, c);
        return { ...z, befund, teile: z.teile ? { ...z.teile, code: c } : z.teile, gewaehlt: z.gewaehlt || !befund.ok };
      }),
    );
  };

  /**
   * eigene Domains geändert: Vorschläge der gelesenen Zeilen neu bilden. Funktional nachgeführt – was ein noch
   * laufendes Einlesen oder eine Eingabe inzwischen geändert hat, bleibt erhalten; nach einem Projektwechsel nichts.
   */
  const eigeneSetzen = async (liste: string[]) => {
    const kennung = lauf.current;
    await setEigene(liste);
    if (!projekt || kennung !== lauf.current) return;
    const neu = useMails.getState().eigene;
    const ergebnis = await Promise.all(zeilenRef.current.filter((z) => z.kopf).map((z) => lesen(projekt, { ...z, inhalt: [] }, neu)));
    if (kennung !== lauf.current) return;
    const nachPfad = new Map(ergebnis.map((z) => [z.pfad, z]));
    setZeilen((alt) =>
      alt.map((x) => {
        const n = nachPfad.get(x.pfad);
        if (!n) return x;
        return { ...n, teile: x.bearbeitet && x.teile ? x.teile : n.teile, bearbeitet: x.bearbeitet, offen: x.offen, status: x.status, gewaehlt: x.gewaehlt || n.gewaehlt };
      }),
    );
  };

  /* ---------- Aus Outlook ablegen ---------- */

  /** Ordner im Projekt, in die Mails abgelegt werden können; vorne der, in dem die meisten Mails liegen */
  const ordnerListe = useMemo(() => {
    if (!projekt) return [] as string[];
    const zahl = new Map<string, number>();
    for (const z of zeilen) zahl.set(z.ordner, (zahl.get(z.ordner) ?? 0) + 1);
    const alle = ['', ...projekt.eintraege.filter((e) => e.ordner).map((e) => e.pfad)];
    return alle.sort((a, b) => (zahl.get(b) ?? 0) - (zahl.get(a) ?? 0) || a.localeCompare(b, 'de', { numeric: true }));
  }, [projekt, zeilen]);
  const vorgabeOrdner = () => {
    if (!projekt) return '';
    const mitMails = zeilen.length ? ordnerListe[0] : undefined;
    return mitMails ?? ordnerListe.find((o) => /schriftverkehr|korrespondenz|mail/i.test(o)) ?? '';
  };

  /**
   * Köpfe der Mails im Projekt, die dieselbe Nachricht sein könnten: schon gelesene, dazu die noch ungelesenen, deren
   * Name nicht dem Schema folgt oder deren Datum im Namen zum Versand bzw. Empfang passt (± ein Tag). Nachgelesene Köpfe
   * kommen in die Zeilen (ohne sie zu bewerten).
   */
  const koepfeZumAbgleich = async (o: GeladenerOrdner & { code: string }, mails: MsgKopf[], kennung: number): Promise<{ pfad: string; kopf: MsgKopf }[]> => {
    const tage = new Set(mails.flatMap((k) => [...tageUm(k.gesendet), ...tageUm(k.empfangen)]));
    const out: { pfad: string; kopf: MsgKopf }[] = [];
    const gelesen = new Map<string, MsgKopf>();
    for (const z of zeilenRef.current) {
      if (z.kopf) out.push({ pfad: z.pfad, kopf: z.kopf });
      else if (!z.lesefehler && (!z.befund.teile || tage.has(z.befund.teile.datum))) {
        try {
          const kopf = msgKopf(await o.lies(z.pfad), { mitText: true });
          if (kennung !== lauf.current) return [];
          gelesen.set(z.pfad, kopf);
          out.push({ pfad: z.pfad, kopf });
        } catch {
          // nicht lesbar: taugt nicht zum Abgleich
        }
      }
    }
    if (gelesen.size) setZeilen((alt) => alt.map((x) => (gelesen.has(x.pfad) && !x.kopf ? { ...x, kopf: gelesen.get(x.pfad) } : x)));
    return out;
  };

  /** Dateien aus Outlook (Ziehen) oder dem Dateidialog: lesen und Vorschläge bilden */
  const hinzufuegen = async (dateien: File[]) => {
    if (!projekt) return;
    const kennung = lauf.current;
    const msg = dateien.filter((f) => /\.msg$/i.test(f.name));
    if (!msg.length) return setFehler(dateien.length ? 'Nur Outlook-Mails (.msg) lassen sich hier ablegen – aus dem klassischen Outlook direkt hierher ziehen.' : null);
    setFehler(null);
    const ordner = vorgabeOrdner();
    const neu: NeueMail[] = [];
    for (const f of msg) {
      const daten = new Uint8Array(await f.arrayBuffer());
      const m: NeueMail = { id: naechsteId++, herkunft: f.name, daten, ordner };
      try {
        m.kopf = msgKopf(daten, { mitText: true });
        m.vorschlag = mailVorschlag(m.kopf, { code: projekt.code, eigene: useMails.getState().eigene });
        m.teile = m.vorschlag.teile;
      } catch (e) {
        m.lesefehler = e instanceof Error ? e.message : String(e);
        log.warn(`Mail nicht lesbar: ${f.name}`, m.lesefehler);
      }
      neu.push(m);
    }
    // Doppelte: gegen alle Mails im Projekt, gegen die schon zum Ablegen bereiten und innerhalb dieses Drops
    const gelesen = neu.filter((m) => m.kopf);
    if (gelesen.length) {
      // nur eine eigene Meldung setzen bzw. wegnehmen – eine laufende (Einlesen, Umbenennen) bleibt stehen
      const meldung = 'Mails im Projekt werden abgeglichen …';
      setLaeuft((l) => l ?? meldung);
      const imProjekt = await koepfeZumAbgleich(
        projekt,
        gelesen.map((m) => m.kopf!),
        kennung,
      );
      setLaeuft((l) => (l === meldung ? null : l));
      if (kennung !== lauf.current) return;
      // schon bereite Mails aus dem aktuellen Stand (nicht aus dem beim Drop), damit ein zweiter, schneller Drop sie sieht
      const vorher: { herkunft: string; kopf: MsgKopf }[] = neueRef.current.filter((m) => m.kopf).map((m) => ({ herkunft: m.herkunft, kopf: m.kopf! }));
      for (const m of gelesen) {
        const da = imProjekt.find((z) => gleicheMail(z.kopf, m.kopf!));
        if (da) m.schonDa = da.pfad;
        const dabei = vorher.find((x) => gleicheMail(x.kopf, m.kopf!));
        if (dabei) m.doppelt = dabei.herkunft;
        vorher.push({ herkunft: m.herkunft, kopf: m.kopf! });
      }
    }
    if (kennung !== lauf.current) return;
    log.info(`Mails zum Ablegen: ${neu.length}`, { projekt: projekt.name });
    setNeue((alt) => [...alt, ...neu]);
  };

  const neuZiel = (m: NeueMail): { name: string; pfad: string; problem: string | null } | null => {
    if (!m.teile || !projekt) return null;
    const n = mailName({ ...m.teile, code: projekt.code });
    const pfad = m.ordner ? `${m.ordner}/${n}` : n;
    const b = mailNamePruefen(n, projekt.code);
    const problem = !m.teile.name.trim()
      ? 'Name fehlt'
      : !datumGueltig(m.teile.datum)
        ? 'Datum als JJMMTT'
        : !b.ok
          ? b.gruende[0]
          : projekt.eintraege.some((e) => e.pfad.toLowerCase() === pfad.toLowerCase()) || neue.some((x) => x !== m && x.status?.art !== 'ok' && neuZielName(x) === pfad.toLowerCase())
            ? 'diesen Namen gibt es in dem Ordner schon'
            : zuLangText(fs, projekt.pfad, pfad);
    return { name: n, pfad, problem };
  };
  const neuZielName = (m: NeueMail) => (m.teile && projekt ? (m.ordner ? `${m.ordner}/` : '') + mailName({ ...m.teile, code: projekt.code }) : '').toLowerCase();

  const ablegen = async (liste: NeueMail[]) => {
    if (!projekt || !fs) return;
    const kennung = lauf.current;
    for (const m of liste) {
      const t = neuZiel(m);
      if (!t || t.problem || m.status?.art === 'ok') continue;
      if (kennung !== lauf.current) return;
      try {
        const ok = await fs.dateiAnlegen(projekt.pfad, t.pfad, m.daten);
        if (kennung !== lauf.current) return log.info(`Mail abgelegt: ${t.pfad}`);
        if (!ok) {
          setNeue((alt) => alt.map((x) => (x.id === m.id ? { ...x, status: { art: 'fehler', text: 'Den Namen gibt es schon – nichts geändert.' } } : x)));
          continue;
        }
        log.info(`Mail abgelegt: ${t.pfad}`);
        const befund = mailNamePruefen(t.name, projekt.code);
        const zeile: Zeile = {
          pfad: t.pfad,
          ordner: m.ordner,
          datei: t.name,
          befund,
          inhalt: [],
          kopf: m.kopf,
          vorschlag: m.vorschlag,
          teile: m.teile,
          bearbeitet: false,
          gewaehlt: false,
          offen: false,
          status: { art: 'ok', text: `abgelegt (aus Outlook: ${m.herkunft})` },
        };
        setZeilen((alt) => [...alt, zeile]);
        setProjekt((p) => (p ? { ...p, eintraege: [...p.eintraege, { pfad: t.pfad, ordner: false, groesse: m.daten.length, geaendert: Date.now() }] } : p));
        setNeue((alt) => alt.filter((x) => x.id !== m.id));
      } catch (e) {
        setNeue((alt) => alt.map((x) => (x.id === m.id ? { ...x, status: { art: 'fehler', text: e instanceof Error ? e.message : String(e) } } : x)));
      }
    }
  };
  /** alle bereiten Mails verwerfen – ab zwei mit Rückfrage (in Outlook bleiben sie, aber die Namen von Hand wären weg) */
  const alleVerwerfen = async () => {
    // nur die Mails, die beim Klick da waren – was während der Rückfrage dazukommt, bleibt
    const ids = new Set(neue.map((m) => m.id));
    if (ids.size > 1 && !(await bestaetigen(`${ids.size} Mails verwerfen?`, 'Sie werden nicht abgelegt; in Outlook bleiben sie. Von Hand geänderte Namen gehen verloren.', 'Verwerfen', true))) return;
    setNeue((alt) => alt.filter((m) => !ids.has(m.id)));
  };
  const neuAendern = (id: number, patch: Partial<MailTeile> | { ordner: string }) =>
    setNeue((alt) =>
      alt.map((m) => (m.id !== id ? m : 'ordner' in patch ? { ...m, ordner: patch.ordner, status: undefined } : m.teile ? { ...m, teile: { ...m.teile, ...patch }, status: undefined } : m)),
    );

  /* ---------- Darstellung ---------- */

  const falsch = zeilen.filter(istFalsch);
  const sichtbar = nurFalsche ? zeilen.filter((z) => istFalsch(z) || z.status) : zeilen;
  const auswahl = zeilen.filter((z) => z.gewaehlt && z.teile && !ziel(z)?.problem);
  const gelesen = zeilen.filter((z) => z.kopf);
  const vorschlagDomain = useMemo(
    () => (eigene.length ? null : eigeneDomainRaten(gelesen.map((z) => ({ domains: [z.kopf!.vonMail, ...z.kopf!.empfaenger.map((e) => e.mail)].map(domainVon) })))),
    [eigene.length, gelesen.length], // eslint-disable-line react-hooks/exhaustive-deps
  );
  // Themen, die im Projekt schon vorkommen – als Vorschläge für einheitliche Namen
  const themen = useMemo(() => [...new Set(zeilen.filter((z) => z.befund.ok && z.befund.teile).map((z) => z.befund.teile!.thema))].sort((a, b) => a.localeCompare(b, 'de')), [zeilen]);
  const projektKnoepfe = () => [...(projektListe.current?.querySelectorAll<HTMLButtonElement>('button.po-projekt-knopf') ?? [])];
  /** Pfeil hoch/runter in der Projektliste; oben angekommen zurück in die Suche */
  const listeTaste = (e: React.KeyboardEvent) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    const knoepfe = projektKnoepfe();
    const i = knoepfe.indexOf(document.activeElement as HTMLButtonElement);
    if (i < 0) return;
    e.preventDefault();
    if (e.key === 'ArrowDown') knoepfe[Math.min(i + 1, knoepfe.length - 1)].focus();
    else if (i === 0) projektListe.current?.parentElement?.querySelector<HTMLInputElement>('input.po-suche')?.focus();
    else knoepfe[i - 1].focus();
  };
  const ohneDomain = !eigene.length && zeilen.some((z) => z.vorschlag);
  const gefiltert = suche.trim() ? projekte.filter((p) => `${p.gruppe ?? ''} ${p.name}`.toLowerCase().includes(suche.trim().toLowerCase())) : projekte;

  return (
    <div className="po-view po-mails-view">
      <section className="po-col">
        <h2>Mails</h2>
        <p className="muted small-text">
          Sucht im Projektordner (mit allen Unterordnern) nach Outlook-Mails (.msg), die nicht nach dem Schema <code>{MAIL_SCHEMA}</code> heißen, und schlägt den richtigen Namen vor – aus der Mail
          selbst: Datum aus Empfang bzw. Versand (nicht das Dateidatum), Name des Gegenübers (bei Weiterleitungen aus dem Büro der ursprüngliche Absender), Thema aus dem Betreff. Umbenannt wird erst
          auf Klick, im selben Ordner und nie überschreibend.
        </p>
        {fs && roots.length > 0 && (
          <>
            <input
              className="po-suche"
              value={suche}
              placeholder="Projekt suchen …"
              aria-label="Projekt suchen"
              onChange={(e) => setSuche(e.target.value)}
              onKeyDown={(e) => {
                // Enter lädt den ersten Treffer, Pfeil runter springt in die Liste
                if (e.key === 'Enter' && gefiltert[0]) void ladenPfad(gefiltert[0].pfad);
                else if (e.key === 'ArrowDown') {
                  e.preventDefault();
                  projektKnoepfe()[0]?.focus();
                }
              }}
            />
            <ul className="list po-projektliste" ref={projektListe} onKeyDown={listeTaste}>
              {gefiltert.slice(0, 300).map((p) => (
                <li key={p.pfad} className={projekt?.pfad === p.pfad ? 'active' : ''} title={p.pfad}>
                  <button className="po-projekt-knopf" aria-current={projekt?.pfad === p.pfad ? 'true' : undefined} onClick={() => void ladenPfad(p.pfad)}>
                    {p.gruppe && <span className="muted small-text">{p.gruppe} › </span>}
                    {p.name}
                  </button>
                </li>
              ))}
              {!gefiltert.length && <li className="muted">Kein Projekt passt zur Suche.</li>}
            </ul>
          </>
        )}
        <div className="button-row">
          <button onClick={() => void ordnerWaehlen()}>{!desktop ? 'Projektordner einlesen …' : projekt ? 'Anderen Ordner wählen …' : 'Projektordner wählen …'}</button>
        </div>
        {!fs && <p className="muted small-text">Im Browser lassen sich die Mails nur prüfen; umbenennen kann die Desktop-App.</p>}

        <h3>Eigene Domains</h3>
        <p className="muted small-text">Daran erkennt die App, ob eine Mail von außen kam („von“) oder ins Büro hinaus ging („an“). Gilt fürs ganze Büro.</p>
        <div className="po-schemafeld">
          <input
            value={eigeneText}
            aria-label="Eigene Domains"
            placeholder="z. B. architekten-beispiel.example"
            onChange={(e) => setEigeneText(e.target.value)}
            onBlur={() => eigeneText !== eigene.join(', ') && void eigeneSetzen(eigeneText.split(/[,;\s]+/))}
            onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
          />
        </div>
        {vorschlagDomain && (
          <p className="meldung">
            Erkannt aus den Mails: <strong>{vorschlagDomain}</strong>{' '}
            <button className="small" onClick={() => void eigeneSetzen([vorschlagDomain])}>
              Übernehmen
            </button>
          </p>
        )}
        {einstellungenFehler && (
          <p className="meldung fehler" role="alert">
            {einstellungenFehler}
          </p>
        )}
      </section>

      <section className="po-col po-mails">
        {fehler && (
          <p className="meldung fehler" role="alert">
            {fehler}
          </p>
        )}
        {laeuft && <p className="busy">{laeuft}</p>}
        {!projekt && !laeuft && <p className="muted">Ein Projekt wählen – die Mails darin werden geprüft.</p>}
        {projekt && (
          <>
            <div className="po-mails-kopf">
              <h3>{projekt.name}</h3>
              <label className="po-mails-code">
                <span className="field-label">Projektcode</span>
                <input
                  defaultValue={projekt.code}
                  key={projekt.pfad}
                  aria-label="Projektcode"
                  onBlur={(e) => e.target.value.trim() !== projekt.code && codeSetzen(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                />
              </label>
            </div>
            <p className="small-text">
              <strong>{zeilen.length}</strong> {zeilen.length === 1 ? 'Mail' : 'Mails'}, davon <strong>{falsch.length}</strong> nicht nach dem Schema
              {zeilen.some((z) => z.lesefehler) && <> · {zeilen.filter((z) => z.lesefehler).length} nicht lesbar</>}
            </p>
            <div className="button-row po-mails-knoepfe">
              <div className="po-mails-gruppe" role="group" aria-label="Ansicht und Einlesen">
                <label className="toggle">
                  <input type="checkbox" checked={nurFalsche} onChange={() => setNurFalsche(!nurFalsche)} />
                  nur abweichende
                </label>
                <button className="small" disabled={!!laeuft} title="Auch die korrekt benannten Mails lesen: stimmen Datum und von/an?" onClick={() => void allesLesen(projekt, zeilen, true)}>
                  Auch korrekt benannte prüfen
                </button>
                <button className="small" disabled={!!laeuft} onClick={() => projekt.pfad && void ladenPfad(projekt.pfad)}>
                  Neu einlesen
                </button>
              </div>
              {/* Auswahl und Umbenennen nur, wenn es etwas umzubenennen gibt */}
              {falsch.length > 0 && (
                <div className="po-mails-gruppe po-mails-auswahl" role="group" aria-label="Auswahl und Umbenennen">
                  <button className="small" onClick={() => setZeilen((alt) => alt.map((z) => ({ ...z, gewaehlt: istFalsch(z) && !!z.teile })))}>
                    Alle abweichenden wählen
                  </button>
                  <button className="small" onClick={() => setZeilen((alt) => alt.map((z) => ({ ...z, gewaehlt: false })))}>
                    Keine
                  </button>
                  <button className="primary small" disabled={!auswahl.length || !!laeuft || !fs?.umbenennen} onClick={() => void umbenennen(auswahl)}>
                    {auswahl.length ? `${auswahl.length} ${auswahl.length === 1 ? 'Mail' : 'Mails'} umbenennen` : 'Umbenennen'}
                  </button>
                </div>
              )}
            </div>
            <div
              className={`po-ablage${ziehtDrueber ? ' drueber' : ''}`}
              onDragOver={(e) => {
                e.preventDefault();
                // kopieren, nie verschieben – sonst entfernt Outlook die Mail aus dem Postfach
                e.dataTransfer.dropEffect = 'copy';
                setZiehtDrueber(true);
              }}
              onDragLeave={() => setZiehtDrueber(false)}
              onDrop={(e) => {
                e.preventDefault();
                setZiehtDrueber(false);
                void hinzufuegen([...e.dataTransfer.files]);
              }}
            >
              <strong>Mails aus Outlook hierher ziehen</strong>
              <span className="muted small-text">
                Aus dem klassischen Outlook direkt hierher – sie werden mit dem richtigen Namen im gewählten Ordner abgelegt (kopiert, in Outlook bleiben sie). Oder gespeicherte .msg-Dateien{' '}
                <button className="po-link" onClick={() => dateiWahl.current?.click()}>
                  wählen …
                </button>
                <input
                  ref={dateiWahl}
                  type="file"
                  accept=".msg"
                  multiple
                  hidden
                  aria-hidden="true"
                  tabIndex={-1}
                  onChange={(e) => {
                    void hinzufuegen([...(e.target.files ?? [])]);
                    e.target.value = '';
                  }}
                />
              </span>
            </div>
            {neue.length > 0 && (
              <div className="po-neue">
                <div className="po-mails-kopf">
                  <h3>
                    {neue.length} {neue.length === 1 ? 'Mail' : 'Mails'} zum Ablegen
                  </h3>
                  <div className="button-row">
                    <button className="small" title={neue.length > 1 ? 'Alle nicht ablegen (mit Rückfrage)' : 'Nicht ablegen'} onClick={() => void alleVerwerfen()}>
                      Verwerfen
                    </button>
                    <button className="primary small" disabled={!fs || !neue.some((m) => neuZiel(m) && !neuZiel(m)!.problem)} onClick={() => void ablegen(neue)}>
                      Alle ablegen
                    </button>
                  </div>
                </div>
                <ul className="po-mailliste">
                  {neue.map((m) => {
                    const t = neuZiel(m);
                    return (
                      <li key={m.id} className="po-mail neu">
                        <div className="po-mail-kopf">
                          <span className="po-mail-name">{m.herkunft}</span>
                          {/* nicht lesbar: kein Ordner zu wählen – nur verwerfen */}
                          {!m.lesefehler && (
                            <select className="po-mail-zielordner" value={m.ordner} aria-label={`Ordner für ${m.herkunft}`} onChange={(e) => neuAendern(m.id, { ordner: e.target.value })}>
                              {ordnerListe.map((o) => (
                                <option key={o} value={o}>
                                  {o || '(Stamm des Projektordners)'}
                                </option>
                              ))}
                            </select>
                          )}
                          <button
                            className={`icon po-mail-verwerfen${m.lesefehler ? ' rechts' : ''}`}
                            title="Nicht ablegen"
                            aria-label={`${m.herkunft} verwerfen`}
                            onClick={() => setNeue((alt) => alt.filter((x) => x.id !== m.id))}
                          >
                            <Symbol name="schliessen" />
                          </button>
                        </div>
                        {m.lesefehler && (
                          <p className="warning small-text" title={m.lesefehler}>
                            {LESEFEHLER}
                          </p>
                        )}
                        {m.schonDa && <p className="meldung">Diese Mail liegt schon im Projekt: {m.schonDa}</p>}
                        {m.doppelt && <p className="meldung">Diese Mail ist in dieser Ablage doppelt – schon dabei als {m.doppelt}</p>}
                        {m.teile && (
                          <>
                            <div className="po-mail-teile" role="group" aria-label={`Name für ${m.herkunft}`}>
                              <code>{projekt.code}</code>
                              <select value={m.teile.richtung} aria-label="von oder an" onChange={(e) => neuAendern(m.id, { richtung: e.target.value as Richtung })}>
                                <option value="von">von</option>
                                <option value="an">an</option>
                              </select>
                              <input className="po-mail-gegenueber" value={m.teile.name} aria-label="Name" onChange={(e) => neuAendern(m.id, { name: e.target.value })} />
                              <input className="po-mail-datum" value={m.teile.datum} aria-label="Datum (JJMMTT)" maxLength={6} onChange={(e) => neuAendern(m.id, { datum: e.target.value.trim() })} />
                              {/* Thema und Knopf brechen gemeinsam um – der Knopf steht nie allein in einer Zeile */}
                              <span className="po-mail-thema-knopf">
                                <input className="po-mail-thema" value={m.teile.thema} aria-label="Thema" list="po-mail-themen" onChange={(e) => neuAendern(m.id, { thema: e.target.value })} />
                                <button className="small" disabled={!fs || !!t?.problem} title={t?.problem ?? `→ ${t?.pfad}`} onClick={() => void ablegen([m])}>
                                  Ablegen
                                </button>
                              </span>
                            </div>
                            <p className="small-text po-mail-neu">
                              → <strong>{t?.pfad}</strong>
                              {t?.problem && <span className="po-mail-problem"> · {t.problem}</span>}
                              {m.vorschlag && <span className="muted"> · {m.vorschlag.herkunft}</span>}
                            </p>
                          </>
                        )}
                        {m.status && <p className={m.status.art === 'ok' ? 'meldung ok' : 'meldung fehler'}>{m.status.text}</p>}
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
            {ohneDomain && <p className="meldung">Ohne eigene Domain gilt die Richtung (von/an) aus dem bisherigen Namen – links unter „Eigene Domains“ eintragen, dann erkennt die App sie selbst.</p>}
            {!sichtbar.length && <p className="meldung ok">{zeilen.length ? 'Alle Mails sind nach dem Schema benannt.' : 'In diesem Projektordner gibt es keine Mails (.msg).'}</p>}
            <ul className="po-mailliste">
              {sichtbar.map((z) => {
                const t = ziel(z);
                const mail = z.kopf;
                return (
                  <li key={z.pfad} className={`po-mail${istFalsch(z) ? ' falsch' : ''}${z.status?.art === 'ok' ? ' erledigt' : ''}`}>
                    <div className="po-mail-kopf">
                      <input type="checkbox" aria-label={`${z.datei} umbenennen`} checked={z.gewaehlt} disabled={!z.teile} onChange={() => umschalten(z.pfad, { gewaehlt: !z.gewaehlt })} />
                      <span className="po-mail-name" title={z.pfad}>
                        {z.datei}
                      </span>
                      <span className="muted small-text po-mail-ordner">{z.ordner || 'Stamm des Projektordners'}</span>
                    </div>
                    {(z.befund.gruende.length > 0 || z.inhalt.length > 0) && (
                      <ul className="po-mail-gruende">
                        {[...z.befund.gruende, ...z.inhalt].map((g) => (
                          <li key={g}>{g}</li>
                        ))}
                      </ul>
                    )}
                    {z.lesefehler && (
                      <p className="warning small-text" title={z.lesefehler}>
                        {LESEFEHLER}
                      </p>
                    )}
                    {!z.teile && !z.lesefehler && !z.befund.ok && <p className="muted small-text">wird gelesen …</p>}
                    {z.teile && (
                      <>
                        <div className="po-mail-teile" role="group" aria-label={`Neuer Name für ${z.datei}`}>
                          <code>{projekt.code}</code>
                          <select value={z.teile.richtung} aria-label="von oder an" onChange={(e) => aendern(z.pfad, { richtung: e.target.value as Richtung })}>
                            <option value="von">von</option>
                            <option value="an">an</option>
                          </select>
                          <input className="po-mail-gegenueber" value={z.teile.name} aria-label="Name" placeholder="Nachname" onChange={(e) => aendern(z.pfad, { name: e.target.value })} />
                          <input
                            className="po-mail-datum"
                            value={z.teile.datum}
                            aria-label="Datum (JJMMTT)"
                            placeholder="JJMMTT"
                            maxLength={6}
                            onChange={(e) => aendern(z.pfad, { datum: e.target.value.trim() })}
                          />
                          <span className="po-mail-thema-knopf">
                            <input
                              className="po-mail-thema"
                              value={z.teile.thema}
                              aria-label="Thema"
                              placeholder="Thema"
                              list="po-mail-themen"
                              onChange={(e) => aendern(z.pfad, { thema: e.target.value })}
                            />
                            <button className="small" disabled={!!t?.problem || !!laeuft || !fs?.umbenennen} title={t?.problem ?? `→ ${t?.name}`} onClick={() => void umbenennen([z])}>
                              Umbenennen
                            </button>
                          </span>
                        </div>
                        <p className="small-text po-mail-neu">
                          → <strong>{t?.name}</strong>
                          {t?.problem && t.problem !== 'unverändert' && <span className="po-mail-problem"> · {t.problem}</span>}
                          {z.vorschlag && <span className="muted"> · {z.vorschlag.herkunft}</span>}
                        </p>
                      </>
                    )}
                    {z.status && <p className={z.status.art === 'ok' ? 'meldung ok' : 'meldung fehler'}>{z.status.text}</p>}
                    {mail && (
                      <details className="po-mail-vorschau" open={z.offen} onToggle={(e) => umschalten(z.pfad, { offen: (e.target as HTMLDetailsElement).open })}>
                        <summary>Mail ansehen</summary>
                        <dl>
                          <dt>Betreff</dt>
                          <dd>{mail.betreff || '–'}</dd>
                          <dt>Von</dt>
                          <dd>{[mail.vonName, mail.vonMail && `<${mail.vonMail}>`].filter(Boolean).join(' ')}</dd>
                          <dt>An</dt>
                          <dd>
                            {mail.empfaenger
                              .filter((e) => e.art === 'an')
                              .map((e) => e.name || e.mail)
                              .join('; ') ||
                              mail.anText ||
                              '–'}
                          </dd>
                          {mail.empfaenger.some((e) => e.art === 'cc') && (
                            <>
                              <dt>Cc</dt>
                              <dd>
                                {mail.empfaenger
                                  .filter((e) => e.art === 'cc')
                                  .map((e) => e.name || e.mail)
                                  .join('; ')}
                              </dd>
                            </>
                          )}
                          <dt>Gesendet</dt>
                          <dd>{tag(mail.gesendet)}</dd>
                          <dt>Empfangen</dt>
                          <dd>{tag(mail.empfangen)}</dd>
                          {mail.anhaenge.length > 0 && (
                            <>
                              <dt>Anhänge</dt>
                              <dd>{mail.anhaenge.join(', ')}</dd>
                            </>
                          )}
                        </dl>
                        {mail.text && <pre className="po-mail-text">{mail.text.trim().slice(0, 3000)}</pre>}
                        {desktop && !fsVorgabe && projekt.pfad && (
                          <button className="small" onClick={() => void oeffneOrdner(z.ordner ? verbinde(projekt.pfad, z.ordner) : projekt.pfad).catch(() => undefined)}>
                            Ordner im Explorer öffnen
                          </button>
                        )}
                      </details>
                    )}
                  </li>
                );
              })}
            </ul>
            <datalist id="po-mail-themen">
              {themen.map((x) => (
                <option key={x} value={x} />
              ))}
            </datalist>
          </>
        )}
      </section>
    </div>
  );
}
