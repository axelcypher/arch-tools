/**
 * Fallmatrix: jede Regel mit allen Kombinationen der Merkmale (voll nur in der CI bzw. mit VOLL=1) – eigene Datei,
 * damit sie neben den übrigen Tests des Regelpakets auf einem eigenen Worker läuft (gemeinsame Hilfen: gemeinsam.ts).
 */
import { describe, expect, it } from 'vitest';
import { auswerten } from '@core/baurecht/auswertung';
import type { ParagrafErgebnis } from '@core/baurecht/typen';
import { paket, VOLL, MATRIX_ZEIT_LANG, kombinationen, schluessel, alleFakten, eingabe, LAEUFE, AUSLOESER } from './gemeinsam';

describe('Fallmatrix', () => {
  // nur voll sinnvoll: „Herabstufen“ und „Text“ prüfen je Paragraf den ersten grünen Fall – eine Stichprobe prüfte andere
  // Fälle als die CI und deckte nicht dasselbe ab
  // voll etwa 8 min (Auslöser je Satz tragender Antworten) – deshalb die lange Zeitgrenze
  it.runIf(VOLL)('kein falsches Grün: Ergänzen, Herabstufen, Text, Begründung', { timeout: MATRIX_ZEIT_LANG }, () => {
    const fehler: string[] = [];
    const melde = (t: string) => {
      if (fehler.length < 40) fehler.push(t);
    };
    let gruenGesamt = 0;
    const geprueftHerab = new Set<string>();
    const geprueftText = new Set<string>();
    for (const lauf of LAEUFE) {
      const ergebnisse = new Map<string, Map<string, string>>();
      const gruen: { m: Record<string, string>; p: ParagrafErgebnis; ref: string[] }[] = [];
      for (const m of kombinationen(lauf.werte)) {
        const a = auswerten(eingabe(m, lauf.fakten, lauf.texte));
        const nachId = new Map(a.paragrafen.map((x) => [x.id, x]));
        const ampeln = new Map<string, string>();
        for (const p of a.paragrafen) {
          ampeln.set(p.id, p.automatisch);
          if (!p.gruende.length) melde(`${lauf.name}: ${p.id} ohne Begründung`);
          if (p.automatisch === 'gruen') {
            if (p.offen.length) melde(`${lauf.name}: ${p.id} grün mit offenen Angaben ${p.offen.join(', ')}`);
            if (p.unsicher.length) melde(`${lauf.name}: ${p.id} grün mit unsicheren Angaben ${p.unsicher.join(', ')}`);
            // Fakten der Paragrafen, auf die verwiesen wird (eine Ebene) – für das Herabstufen über Verweise
            const ref = p.verwendet.filter((v) => v.startsWith('paragraf:')).flatMap((v) => nachId.get(v.slice(9))?.verwendet ?? []);
            // nur, was die Prüfungen unten brauchen (die vollen Ergebnisse aller grünen Pfade sprengten den Speicher)
            gruen.push({ m, p: { id: p.id, modul: p.modul, norm: p.norm, paragraf: p.paragraf, verwendet: p.verwendet } as ParagrafErgebnis, ref });
          }
        }
        ergebnisse.set(schluessel(m, Object.keys(lauf.werte)), ampeln);
      }
      gruenGesamt += gruen.length;
      // 1. Ergänzen fehlender Merkmale
      for (const { m, p } of gruen)
        for (const [name, werte] of Object.entries(lauf.werte)) {
          if (m[name]) continue;
          for (const w of werte) {
            if (!w) continue;
            const r = ergebnisse.get(schluessel({ ...m, [name]: w }, Object.keys(lauf.werte)))?.get(p.id);
            if (r === 'rot') melde(`${lauf.name}: ${p.id} grün ohne ${name}, aber rot mit ${name}=${w} (${JSON.stringify(m)})`);
          }
        }
      // 2. Herabstufen: Bleibt ein Paragraf grün, wenn ein Fakt nur Hinweis ist, dann muss er auch ohne diesen Fakt
      //    grün sein – sonst wurde der Hinweis wie eine gesicherte Angabe behandelt (je Paragraf und Fakt einmal)
      for (const { m, p, ref } of gruen) {
        for (const v of [...new Set([...p.verwendet, ...ref])]) {
          // je Paragraf und Fakt einmal; ist der Fakt Auslöser einer Frage, deren Antwort das Grün mitträgt, dagegen je Satz
          // solcher Antworten: Über eine Rückfrage kann ein Hinweis auf einem anderen Pfad ein Grün tragen (Befund: Umfang
          // der Beseitigung nur Hinweis → „Altbau verfahrensfrei“ gestellt → § 74 BauO NRW grün)
          const abh = p.verwendet.filter((x) => AUSLOESER.get(v)?.has(x)).sort();
          const pfad = abh.length ? `${p.id}|${v}|${abh.join(',')}` : `${p.id}|${v}`;
          if (v.includes(':') || !lauf.fakten[v] || geprueftHerab.has(pfad)) continue;
          geprueftHerab.add(pfad);
          const alsHinweis = { ...lauf.fakten, [v]: { ...lauf.fakten[v], sicherheit: 'hinweis' as const, grund: 'Test' } };
          // „unbekannt“ ausdrücklich (leerer Wert von Hand) – sonst spränge eine Tabelle des Moduls mit anderem Wert ein
          const ohne = { ...lauf.fakten, [v]: { wert: null, herkunft: 'manuell' as const, sicherheit: 'sicher' as const } };
          const q1 = auswerten(eingabe(m, alsHinweis, lauf.texte)).paragrafen.find((x) => x.id === p.id)!;
          const q2 = auswerten(eingabe(m, ohne, lauf.texte)).paragrafen.find((x) => x.id === p.id)!;
          if (q1.automatisch === 'gruen' && q2.automatisch !== 'gruen')
            melde(`${lauf.name}: ${p.id} bleibt grün, obwohl „${v}“ nur Hinweis ist und ohne „${v}“ nicht grün wäre (${JSON.stringify(m)})`);
          // ebenso ein Widerspruch am Auslöser einer Frage, deren Antwort das Grün trägt – nur, wenn das Grün an einer Antwort
          // auf eine von ihm ausgelöste Frage hängt (ein fester Modulwert, z. B. „§ 144 ausgeschlossen“ der Stadt, trägt es
          // zu Recht, auch wenn die Frage dazu ohne den Auslöser gestellt und von Hand anders beantwortet wäre)
          if (abh.length && q2.automatisch !== 'gruen') {
            const mitWiderspruch = { ...lauf.fakten, [v]: { ...lauf.fakten[v], widerspruch: 'Test' } };
            const a3 = auswerten(eingabe(m, mitWiderspruch, lauf.texte));
            const q3 = a3.paragrafen.find((x) => x.id === p.id)!;
            const traegtAntwort = q3.verwendet.some((x) => AUSLOESER.get(v)?.has(x) && a3.fakten[x]?.herkunft !== 'modul');
            if (q3.automatisch === 'gruen' && traegtAntwort) melde(`${lauf.name}: ${p.id} bleibt grün, obwohl „${v}“ widersprüchlich ist und ohne „${v}“ nicht grün wäre (${JSON.stringify(m)})`);
          }
        }
      }
      // 3. Text geändert bzw. fehlt → nicht mehr grün (je Paragraf einmal)
      if (lauf.texte.size)
        for (const { m, p } of gruen) {
          const key = `${p.modul}/${p.norm}`;
          const regel = paket.regeln.get(key)!.at(-1)!.regel.paragrafen[p.paragraf];
          const fs = Object.keys(regel.stand ?? {})[0];
          if (!fs || geprueftText.has(p.id)) continue;
          geprueftText.add(p.id);
          const t = lauf.texte.get(key)!;
          const geaendert = new Map(lauf.texte).set(key, { ...t, fassung: { ...t.fassung!, summen: { ...t.fassung!.summen, [fs]: '00000000' } } });
          const ohne = new Map(lauf.texte);
          ohne.delete(key);
          for (const [art, texte] of [
            ['geändert', geaendert],
            ['fehlt', ohne],
          ] as const) {
            const q = auswerten(eingabe(m, lauf.fakten, texte)).paragrafen.find((x) => x.id === p.id)!;
            if (q.automatisch === 'gruen') melde(`${lauf.name}: ${p.id} bleibt grün, obwohl der Text ${art} (${JSON.stringify(m)})`);
          }
        }
    }
    expect(fehler).toEqual([]);
    // die Matrix erreicht tatsächlich grüne Pfade (sonst prüfte sie nichts)
    expect(gruenGesamt).toBeGreaterThan(1000);
    expect(geprueftHerab.size).toBeGreaterThan(20);
    expect(geprueftText.size).toBeGreaterThan(20);
  });

  it('was ohne jede Angabe grün ist, wird mit keinem vollständigen Satz von Fakten rot', () => {
    const leer = auswerten(eingabe({}));
    const mitJa = new Map(auswerten(eingabe({}, alleFakten('ja'))).paragrafen.map((p) => [p.id, p.automatisch]));
    const mitNein = new Map(auswerten(eingabe({}, alleFakten('nein'))).paragrafen.map((p) => [p.id, p.automatisch]));
    const rot = leer.paragrafen.filter((p) => p.automatisch === 'gruen' && (mitJa.get(p.id) === 'rot' || mitNein.get(p.id) === 'rot')).map((p) => p.id);
    expect(rot).toEqual([]);
  });
});
