/**
 * Zeichenketten so schreiben, wie Delphi sie in DFM-Text ablegt.
 *
 * Delphi (`ObjectBinaryToText`) zerlegt einen Wert in Stücke von höchstens 64 Zeichen, jedes auf einer
 * eigenen Zeile und mit „ +“ verbunden. Druckbare ASCII-Zeichen stehen in Hochkommas, alles andere als
 * `#nnn` (UTF-16-Codeeinheit), auch das Hochkomma selbst.
 */

const ZEILENLAENGE = 64;

const inHochkommas = (u: number) => u >= 0x20 && u <= 0x7f && u !== 0x27;

/** Zerlegt `s` in die Stücke, die Delphi jeweils auf eine eigene Zeile schreibt */
export function kodiereStuecke(s: string): string[] {
  // JavaScript-Strings sind UTF-16 – Länge und charCodeAt zählen wie Delphi in Codeeinheiten
  const n = s.length;
  if (n === 0) return ["''"];
  const stuecke: string[] = [];
  let aktuell = '';
  let i = 0;
  let start = 0;
  while (i < n) {
    if (inHochkommas(s.charCodeAt(i))) {
      const lauf = i++;
      while (i < n && inHochkommas(s.charCodeAt(i)) && i - start < ZEILENLAENGE) i++;
      aktuell += `'${s.slice(lauf, i)}'`;
    } else {
      aktuell += `#${s.charCodeAt(i)}`;
      i++;
    }
    if (i - start >= ZEILENLAENGE && i < n) {
      stuecke.push(aktuell);
      aktuell = '';
      start = i;
    }
  }
  stuecke.push(aktuell);
  return stuecke;
}

const lang = (s: string) => s.length > ZEILENLAENGE;

function stueckZeilen(stuecke: string[], einrueckung: string, letzterZusatz: string): string[] {
  return stuecke.map((s, i) => `${einrueckung}${s}${i + 1 === stuecke.length ? letzterZusatz : ' +'}`);
}

/** Zeilen einer Eigenschaft mit Zeichenkettenwert, z. B. `Caption = 'Text'` */
export function zeichenketteZeilen(einrueckung: string, name: string, wert: string): string[] {
  const stuecke = kodiereStuecke(wert);
  if (!lang(wert)) return [`${einrueckung}${name} = ${stuecke[0]}`];
  return [`${einrueckung}${name} = `, ...stueckZeilen(stuecke, `${einrueckung}  `, '')];
}

/** Zeilen einer Stringliste, z. B. `Lines.Strings = ('a' 'b')`. Leere Listen schreibt Delphi gar nicht. */
export function stringlisteZeilen(einrueckung: string, name: string, eintraege: string[]): string[] {
  if (!eintraege.length) throw new Error('Leere Stringlisten schreibt Delphi nicht');
  const innen = `${einrueckung}  `;
  const zeilen = [`${einrueckung}${name} = (`];
  eintraege.forEach((eintrag, i) => {
    const zu = i + 1 === eintraege.length ? ')' : '';
    const stuecke = kodiereStuecke(eintrag);
    if (lang(eintrag)) zeilen.push(innen, ...stueckZeilen(stuecke, `${innen}  `, zu));
    else zeilen.push(`${innen}${stuecke[0]}${zu}`);
  });
  return zeilen;
}
