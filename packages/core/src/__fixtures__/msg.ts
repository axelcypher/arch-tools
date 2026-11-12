/**
 * Outlook-Nachrichten (.msg) für Tests erzeugen – ohne echte Mails: eine Compound-File-Binary-Datei (Version 3, 512-Byte-
 * Sektoren, Mini-Strom für kleine Ströme) mit den MAPI-Eigenschaften, die `msgKopf` liest.
 */

interface Speicher {
  stroeme: Record<string, Uint8Array>;
  speicher?: Record<string, Speicher>;
}

const FREI = 0xffffffff;
const ENDE = 0xfffffffe;
const FATSEKTOR = 0xfffffffd;
const SEKTOR = 512;
const MINI = 64;
const GRENZE = 4096;

interface DirEintrag {
  name: string;
  typ: 1 | 2 | 5;
  kinder: number[];
  daten?: Uint8Array;
  start: number;
  groesse: number;
}

/** Compound File Binary schreiben */
export function cfbSchreiben(wurzel: Speicher): Uint8Array<ArrayBuffer> {
  const eintraege: DirEintrag[] = [{ name: 'Root Entry', typ: 5, kinder: [], start: ENDE, groesse: 0 }];
  const fuege = (s: Speicher, eltern: number) => {
    for (const [name, daten] of Object.entries(s.stroeme)) {
      eintraege.push({ name, typ: 2, kinder: [], daten, start: ENDE, groesse: daten.length });
      eintraege[eltern].kinder.push(eintraege.length - 1);
    }
    for (const [name, sub] of Object.entries(s.speicher ?? {})) {
      eintraege.push({ name, typ: 1, kinder: [], start: 0, groesse: 0 });
      const i = eintraege.length - 1;
      eintraege[eltern].kinder.push(i);
      fuege(sub, i);
    }
  };
  fuege(wurzel, 0);

  // Mini-Strom: kleine Ströme hintereinander in 64-Byte-Mini-Sektoren
  const miniFat: number[] = [];
  const miniTeile: Uint8Array[] = [];
  for (const e of eintraege) {
    if (e.typ !== 2 || !e.daten || e.groesse >= GRENZE || !e.groesse) continue;
    const n = Math.ceil(e.groesse / MINI);
    e.start = miniFat.length;
    for (let i = 0; i < n; i++) miniFat.push(i === n - 1 ? ENDE : miniFat.length + 1);
    const p = new Uint8Array(n * MINI);
    p.set(e.daten);
    miniTeile.push(p);
  }
  const miniStrom = new Uint8Array(miniFat.length * MINI);
  let o = 0;
  for (const t of miniTeile) {
    miniStrom.set(t, o);
    o += t.length;
  }

  // Sektoren: FAT | Verzeichnis | MiniFAT | Mini-Strom | große Ströme
  const sektoren = (n: number) => Math.ceil(n / SEKTOR);
  const dirSek = sektoren(eintraege.length * 128);
  const miniFatSek = sektoren(miniFat.length * 4);
  const miniStromSek = sektoren(miniStrom.length);
  const grosse = eintraege.filter((e) => e.typ === 2 && e.groesse >= GRENZE);
  const grossSek = grosse.reduce((n, e) => n + sektoren(e.groesse), 0);
  const rest = dirSek + miniFatSek + miniStromSek + grossSek;
  let fatSek = 1;
  while (fatSek * (SEKTOR / 4) < rest + fatSek) fatSek++;
  const fat: number[] = [];
  for (let i = 0; i < fatSek; i++) fat.push(FATSEKTOR);
  const kette = (n: number) => {
    const start = fat.length;
    for (let i = 0; i < n; i++) fat.push(i === n - 1 ? ENDE : fat.length + 1);
    return n ? start : ENDE;
  };
  const dirStart = kette(dirSek);
  const miniFatStart = kette(miniFatSek);
  const miniStromStart = kette(miniStromSek);
  for (const e of grosse) e.start = kette(sektoren(e.groesse));
  eintraege[0].start = miniStromStart;
  eintraege[0].groesse = miniStrom.length;

  const gesamt = new Uint8Array(SEKTOR * (1 + fat.length));
  const dv = new DataView(gesamt.buffer);
  const versatz = (s: number) => (s + 1) * SEKTOR;
  // Kopf
  dv.setUint32(0, 0xe011cfd0, true);
  dv.setUint32(4, 0xe11ab1a1, true);
  dv.setUint16(24, 0x003e, true);
  dv.setUint16(26, 3, true);
  dv.setUint16(28, 0xfffe, true);
  dv.setUint16(30, 9, true);
  dv.setUint16(32, 6, true);
  dv.setUint32(44, fatSek, true);
  dv.setUint32(48, dirStart, true);
  dv.setUint32(56, GRENZE, true);
  dv.setUint32(60, miniFatStart, true);
  dv.setUint32(64, miniFatSek, true);
  dv.setUint32(68, ENDE, true);
  dv.setUint32(72, 0, true);
  for (let i = 0; i < 109; i++) dv.setUint32(76 + i * 4, i < fatSek ? i : FREI, true);
  // FAT
  for (let i = 0; i < fatSek * (SEKTOR / 4); i++) dv.setUint32(versatz(0) + i * 4, i < fat.length ? fat[i] : FREI, true);
  // Verzeichnis: Kinder eines Speichers als Kette über „rechts“
  for (let s = 0; s < dirSek * (SEKTOR / 128); s++) {
    const basis = versatz(dirStart) + s * 128;
    const e = eintraege[s];
    if (!e) {
      dv.setUint32(basis + 68, FREI, true);
      dv.setUint32(basis + 72, FREI, true);
      dv.setUint32(basis + 76, FREI, true);
      continue;
    }
    for (let i = 0; i < e.name.length; i++) dv.setUint16(basis + i * 2, e.name.charCodeAt(i), true);
    dv.setUint16(basis + 64, (e.name.length + 1) * 2, true);
    gesamt[basis + 66] = e.typ;
    gesamt[basis + 67] = 1;
    dv.setUint32(basis + 68, FREI, true);
    const eltern = eintraege.find((x) => x.kinder.includes(s));
    const geschw = eltern ? eltern.kinder : [];
    const naechster = geschw[geschw.indexOf(s) + 1];
    dv.setUint32(basis + 72, naechster ?? FREI, true);
    dv.setUint32(basis + 76, e.kinder[0] ?? FREI, true);
    dv.setUint32(basis + 116, e.typ === 1 ? 0 : e.start, true);
    dv.setUint32(basis + 120, e.groesse, true);
  }
  // MiniFAT, Mini-Strom, große Ströme
  for (let i = 0; i < miniFatSek * (SEKTOR / 4); i++) dv.setUint32(versatz(miniFatStart) + i * 4, i < miniFat.length ? miniFat[i] : FREI, true);
  if (miniStrom.length) gesamt.set(miniStrom, versatz(miniStromStart));
  for (const e of grosse) gesamt.set(e.daten!, versatz(e.start));
  return gesamt;
}

const u16 = (s: string) => {
  const out = new Uint8Array((s.length + 1) * 2);
  for (let i = 0; i < s.length; i++) new DataView(out.buffer).setUint16(i * 2, s.charCodeAt(i), true);
  return out;
};
const ansi = (s: string) => new Uint8Array([...s, '\0'].map((c) => (c.charCodeAt(0) < 256 ? c.charCodeAt(0) : 63)));

/** Eigenschaften fester Länge („__properties_version1.0“): Zeiten und Zahlen */
function festeEigenschaften(kopf: number, werte: { tag: number; zeit?: Date; zahl?: number }[]): Uint8Array {
  const out = new Uint8Array(kopf + werte.length * 16);
  const dv = new DataView(out.buffer);
  werte.forEach((w, i) => {
    const o = kopf + i * 16;
    dv.setUint32(o, w.tag, true);
    dv.setUint32(o + 4, 6, true);
    if (w.zeit) {
      const ticks = (w.zeit.getTime() + 11644473600000) * 10000;
      dv.setUint32(o + 8, ticks % 2 ** 32, true);
      dv.setUint32(o + 12, Math.floor(ticks / 2 ** 32), true);
    } else dv.setInt32(o + 8, w.zahl ?? 0, true);
  });
  return out;
}

export interface TestMail {
  betreff: string;
  vonName: string;
  vonMail: string;
  an: { name: string; mail: string; art?: 'an' | 'cc' }[];
  gesendet?: Date;
  empfangen?: Date;
  text?: string;
  anhaenge?: string[];
  /** Zeichenketten als ANSI (001E) statt Unicode (001F) – wie ältere Nachrichten */
  ansi?: boolean;
}

/** Outlook-Nachricht (.msg) mit den gegebenen Angaben */
export function testMsg(m: TestMail): Uint8Array<ArrayBuffer> {
  const typ = m.ansi ? '001E' : '001F';
  const str = m.ansi ? ansi : u16;
  const s = (id: string, wert: string) => ({ [`__substg1.0_${id}${typ}`]: str(wert) });
  const praefix = /^(\w{2,3}:\s*)/.exec(m.betreff)?.[1] ?? '';
  const speicher: Record<string, Speicher> = {};
  m.an.forEach((e, i) => {
    speicher[`__recip_version1.0_#${String(i).padStart(8, '0')}`] = {
      stroeme: {
        ...s('3001', e.name),
        ...s('39FE', e.mail),
        ...s('3003', e.mail),
        '__properties_version1.0': festeEigenschaften(8, [{ tag: 0x0c150003, zahl: e.art === 'cc' ? 2 : 1 }]),
      },
    };
  });
  (m.anhaenge ?? []).forEach((n, i) => {
    speicher[`__attach_version1.0_#${String(i).padStart(8, '0')}`] = { stroeme: { ...s('3707', n), '__properties_version1.0': festeEigenschaften(8, []) } };
  });
  const zeiten = [...(m.gesendet ? [{ tag: 0x00390040, zeit: m.gesendet }] : []), ...(m.empfangen ? [{ tag: 0x0e060040, zeit: m.empfangen }] : []), { tag: 0x0e070003, zahl: 1 }];
  return cfbSchreiben({
    stroeme: {
      ...s('001A', 'IPM.Note'),
      ...s('0037', m.betreff),
      ...s('003D', praefix),
      ...s('0E1D', m.betreff.slice(praefix.length)),
      ...s('0C1A', m.vonName),
      ...s('0C1F', m.vonMail),
      ...s('5D01', m.vonMail),
      ...s(
        '0E04',
        m.an
          .filter((e) => e.art !== 'cc')
          .map((e) => e.name)
          .join('; '),
      ),
      ...s(
        '0E03',
        m.an
          .filter((e) => e.art === 'cc')
          .map((e) => e.name)
          .join('; '),
      ),
      ...(m.text ? s('1000', m.text) : {}),
      '__properties_version1.0': festeEigenschaften(32, zeiten),
    },
    speicher,
  });
}
