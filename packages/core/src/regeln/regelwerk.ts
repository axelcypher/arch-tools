/**
 * Nachschlagewerk der Berechnungsregeln: was die Apps rechnen, nach welcher Vorschrift, mit Fundstelle und Link.
 *
 * Wörtliche Zitate nur aus frei zugänglichen amtlichen Texten (gesetze-im-internet.de, recht.nrw.de bzw. die
 * Synopse der Ingenieur- und Architektenkammer NRW, Vergleichstabelle der Stadt Meschede für ältere BauO-Fassungen).
 * DIN-Normen sind urheberrechtlich geschützt – sie werden nur sinngemäß wiedergegeben, mit Verweis auf die Norm.
 * Stand der Quellen: Oktober 2026.
 */

export type RegelApp = 'flaechen' | 'grz' | 'kosten';

export type Bereich = 'din277' | 'wofl' | 'baunvo' | 'bauo' | 'din276' | 'verfahren';

export const BEREICHE: { id: Bereich; titel: string }[] = [
  { id: 'din277', titel: 'DIN 277 – Grundflächen und Rauminhalte' },
  { id: 'wofl', titel: 'Wohnflächenverordnung (WoFlV)' },
  { id: 'baunvo', titel: 'Baunutzungsverordnung (BauNVO)' },
  { id: 'bauo', titel: 'Bauordnung NRW – Vollgeschosse, Aufenthaltsräume' },
  { id: 'din276', titel: 'DIN 276 – Kosten im Bauwesen' },
  { id: 'verfahren', titel: 'So rechnen die Apps' },
];

export interface Quelle {
  titel: string;
  /** z. B. „§ 4 WoFlV“ oder „BGBl. I 1962 S. 429“ */
  fundstelle?: string;
  url?: string;
}

export interface Regel {
  id: string;
  bereich: Bereich;
  titel: string;
  /** ein Satz für Liste und Suche */
  kurz: string;
  /** Absätze; Zeilen mit „- “ werden als Liste gezeigt, **fett** wird hervorgehoben */
  text: string[];
  /** wörtliche Zitate aus amtlichen Texten */
  zitate?: { text: string; quelle: string }[];
  quellen: Quelle[];
  stichworte: string[];
  /** in welchen Apps die Regel angewandt wird */
  apps: RegelApp[];
  /** Themen für die Hilfe an der jeweiligen Stelle der App */
  themen: string[];
}

const GII = (pfad: string) => `https://www.gesetze-im-internet.de/${pfad}`;
const BGBL = (jahr: string, seite: string) => `https://www.bgbl.de/xaver/bgbl/start.xav?startbk=Bundesanzeiger_BGBl&jumpTo=bgbl1${jahr}s${seite}.pdf`;

const DIN277: Quelle = { titel: 'DIN 277:2021-08 Grundflächen und Rauminhalte im Hochbau', fundstelle: 'DIN Media (kostenpflichtig)', url: 'https://www.dinmedia.de/de/norm/din-277/342217323' };
const DIN276: Quelle = { titel: 'DIN 276:2018-12 Kosten im Bauwesen', fundstelle: 'DIN Media (kostenpflichtig)', url: 'https://www.dinmedia.de/de/norm/din-276/293154016' };
const WOFLV = (p: string): Quelle => ({ titel: 'Wohnflächenverordnung (WoFlV) vom 25.11.2003', fundstelle: `§ ${p} WoFlV`, url: GII(`woflv/__${p}.html`) });
const BAUNVO = (p: string): Quelle => ({ titel: 'Baunutzungsverordnung (BauNVO) in der geltenden Fassung', fundstelle: `§ ${p} BauNVO`, url: GII(`baunvo/__${p}.html`) });
const BAUO2018: Quelle = { titel: 'Landesbauordnung 2018 (BauO NRW 2018), amtliche Fassung', fundstelle: 'recht.nrw.de', url: 'https://recht.nrw.de/lrgv/gesetz/01092026-landesbauordnung-2018-bauo-nrw-2018' };
const SYNOPSE: Quelle = {
  titel: 'Synopse BauO NRW (Ingenieurkammer-Bau NRW, Architektenkammer NRW)',
  fundstelle: 'Stand 2023',
  url: 'https://ikbaunrw.de/kammer-wAssets/docs/Recht/Synopsen_BauO-NRW/IK-Bau-NRW-Synopse-BauO-NRW-2023.pdf',
};
const MESCHEDE: Quelle = {
  titel: 'Vollgeschossbegriff in den Bauordnungen NRW 1962–2018 (Vergleichstabelle Stadt Meschede)',
  fundstelle: 'Stand 13.03.2019',
  url: 'https://meschede.de/fileadmin/Mediendatenbank/Downloads/Planen_und_Bauen/Bauleitplanung/Rechtskraeftige_Bebauungsplaene/Vollgeschoss_Begriff_Vollgeschossigkeit.pdf',
};

export const REGELN: Regel[] = [
  /* ---------- DIN 277 ---------- */
  {
    id: 'din277-gliederung',
    bereich: 'din277',
    titel: 'Gliederung der Grundflächen (BGF, KGF, NRF)',
    kurz: 'BGF = KGF + NRF; NRF = NUF + TF + VF.',
    text: [
      'Die **Brutto-Grundfläche (BGF)** ist die Summe der Grundflächen aller Grundrissebenen eines Bauwerks. Sie gliedert sich in die **Konstruktions-Grundfläche (KGF)** – Wände, Stützen, Schächte – und die **Netto-Raumfläche (NRF)**.',
      'Die NRF gliedert sich in **Nutzungsfläche (NUF)**, **Technikfläche (TF)** und **Verkehrsfläche (VF)**.',
      'Im Flächenrechner wird die KGF nicht gezeichnet, sondern als BGF − NRF errechnet. Wird sie negativ, sind Räume größer gezeichnet als der BGF-Umriss – das zeigt die Auswertung als Warnung.',
    ],
    quellen: [DIN277],
    stichworte: ['Brutto-Grundfläche', 'Konstruktions-Grundfläche', 'Netto-Raumfläche', 'Nutzungsfläche', 'Technikfläche', 'Verkehrsfläche', 'KGF', 'NRF'],
    apps: ['flaechen', 'kosten'],
    themen: ['din277', 'bgf', 'nrf', 'kgf'],
  },
  {
    id: 'din277-bgf',
    bereich: 'din277',
    titel: 'Brutto-Grundfläche (BGF), Regelfall R und Sonderfall S',
    kurz: 'Außenmaße je Grundrissebene; getrennt nach allseitig umschlossenen (R) und nicht umschlossenen Bereichen (S).',
    text: [
      'Die BGF wird je Grundrissebene nach den **äußeren Maßen** der Bauteile einschließlich Bekleidung (z. B. Putz, Vorsatzschale) in Höhe der Boden- bzw. Deckenbelagsoberfläche ermittelt.',
      'DIN 277 unterscheidet nach der Raumumschließung:',
      '- **Regelfall (R):** Bereiche, die allseitig in voller Höhe umschlossen sind',
      '- **Sonderfall (S):** Bereiche, die nicht allseitig in voller Höhe umschlossen sind, z. B. Balkone, Loggien, Dachterrassen, offene Durchfahrten',
      'Im Flächenrechner trägt jeder BGF-Umriss (und jeder Raum) die Kennzeichnung R oder S; Summen werden getrennt ausgewiesen. Abzugsflächen (Innenhof, Luftraum, Treppenloch) werden negativ gerechnet.',
    ],
    quellen: [DIN277],
    stichworte: ['BGF', 'Regelfall', 'Sonderfall', 'Raumumschließung', 'Balkon', 'Loggia', 'Außenmaße', 'Luftraum'],
    apps: ['flaechen', 'grz', 'kosten'],
    themen: ['bgf', 'din277'],
  },
  {
    id: 'din277-bri',
    bereich: 'din277',
    titel: 'Brutto-Rauminhalt (BRI)',
    kurz: 'Vom Bauwerk umschlossener Rauminhalt: unten ab Unterseite der konstruktiven Bauwerkssohle, oben bis zur Dachhaut.',
    text: [
      'Der **Brutto-Rauminhalt** ist der Rauminhalt des Baukörpers, der nach unten von der **Unterseite der konstruktiven Bauwerkssohle** und im Übrigen von den äußeren Begrenzungsflächen des Bauwerks umschlossen wird. Fundamente und Gründungen gehören nicht dazu. Wie die BGF wird er nach Regelfall (R) und Sonderfall (S) getrennt.',
      'Im Flächenrechner:',
      '- je BGF-Umriss Fläche × Geschosshöhe (OK Rohfußboden bis OK Rohfußboden darüber) bzw. bis zur **Dachhaut** (Dachform, Gauben oder Dach aus dem IFC-Modell)',
      '- im untersten Geschoss zusätzlich die **Bodenplatte**: Fläche × Abstand UK Sohle bis Fußboden – überall dort, wo kein anderes Geschoss darunter liegt',
      '- **Split-Level**: tiefer liegende Räume oder Umrisse vergrößern den Körper nach unten',
      'Der Rechenweg (Bericht, Excel-Vorlage) weist jeden Teilkörper einzeln aus; seine Summe ist exakt der BRI.',
    ],
    quellen: [DIN277],
    stichworte: ['BRI', 'Rauminhalt', 'Bauwerkssohle', 'Bodenplatte', 'Sohle', 'Dachhaut', 'Geschosshöhe', 'Rechenweg'],
    apps: ['flaechen', 'kosten'],
    themen: ['bri', 'sohle', 'din277', 'dach'],
  },
  {
    id: 'din277-nutzung',
    bereich: 'din277',
    titel: 'Nutzungsgruppen NUF 1–7, TF 8, VF 9',
    kurz: 'Zuordnung der Räume zu Nutzungs-, Technik- und Verkehrsflächen.',
    text: [
      '- **NUF 1** Wohnen und Aufenthalt',
      '- **NUF 2** Büroarbeit',
      '- **NUF 3** Produktion, Hand- und Maschinenarbeit, Forschung und Entwicklung',
      '- **NUF 4** Lagern, Verteilen und Verkaufen',
      '- **NUF 5** Bildung, Unterricht und Kultur',
      '- **NUF 6** Heilen und Pflegen',
      '- **NUF 7** Sonstige Nutzungen (u. a. Sanitärräume, Garderoben, Abstellräume, Fahrzeugabstellflächen)',
      '- **TF 8** Technikflächen (Haustechnik, Hausanschluss, Heizung …)',
      '- **VF 9** Verkehrsflächen (Flure, Treppen, Aufzugsschächte, Rampen)',
      'Beim IFC-Import schlägt der Flächenrechner die Gruppe nach dem Raumnamen vor (z. B. „Flur“ → VF, „Heizung“ → TF, „Bad“ → NUF 7). Bitte prüfen.',
    ],
    quellen: [DIN277],
    stichworte: ['Nutzungsgruppe', 'NUF', 'TF', 'VF', 'Hauptnutzfläche', 'Nebennutzfläche', 'Verkehrsfläche', 'Technikfläche'],
    apps: ['flaechen', 'kosten'],
    themen: ['nrf', 'nuf', 'din277'],
  },

  /* ---------- WoFlV ---------- */
  {
    id: 'woflv-2',
    bereich: 'wofl',
    titel: 'Was zur Wohnfläche gehört (§ 2 WoFlV)',
    kurz: 'Räume der Wohnung inkl. Wintergärten und Balkone; nicht: Zubehörräume, Räume ohne bauordnungsrechtliche Eignung, Geschäftsräume.',
    text: [
      'Zur Wohnfläche gehören die Grundflächen der Räume, die ausschließlich zur Wohnung gehören, einschließlich Wintergärten, Schwimmbädern und ähnlicher geschlossener Räume sowie Balkonen, Loggien, Dachgärten und Terrassen.',
      'Nicht dazu gehören insbesondere Keller-, Abstell- (außerhalb der Wohnung), Bodenräume, Waschküchen, Trockenräume, Heizungsräume, Garagen sowie Räume, die nicht den Anforderungen des Bauordnungsrechts genügen.',
      'Der Flächenrechner schlägt beim IFC-Import „keine Wohnfläche“ für Keller-, Technik-, Treppen-, Garagen- und Dachbodenräume vor; die Einstufung lässt sich je Raum oder für ein ganzes Geschoss ändern.',
    ],
    zitate: [
      {
        text: '(3) Zur Wohnfläche gehören nicht die Grundflächen folgender Räume: 1. Zubehörräume, insbesondere: a) Kellerräume, b) Abstellräume und Kellerersatzräume außerhalb der Wohnung, c) Waschküchen, d) Bodenräume, e) Trockenräume, f) Heizungsräume und g) Garagen, 2. Räume, die nicht den an ihre Nutzung zu stellenden Anforderungen des Bauordnungsrechts der Länder genügen, sowie 3. Geschäftsräume.',
        quelle: '§ 2 Abs. 3 WoFlV',
      },
    ],
    quellen: [WOFLV('2')],
    stichworte: ['Wohnfläche', 'Zubehörraum', 'Keller', 'Abstellraum', 'Garage', 'Wintergarten', 'Balkon', 'Terrasse'],
    apps: ['flaechen', 'kosten'],
    themen: ['wofl'],
  },
  {
    id: 'woflv-3',
    bereich: 'wofl',
    titel: 'Ermittlung der Grundfläche (§ 3 WoFlV)',
    kurz: 'Lichte Maße ab Vorderkante Bekleidung; Treppen mit mehr als drei Steigungen zählen nicht.',
    text: [
      'Gemessen wird nach den **lichten Maßen** zwischen den Bauteilen, ab Vorderkante der Bekleidung. Einbezogen werden u. a. Fußleisten, fest eingebaute Gegenstände und Einbaumöbel; außer Betracht bleiben u. a. Schornsteine und Pfeiler über 1,50 m Höhe und 0,1 m², **Treppen mit über drei Steigungen** samt Treppenabsätzen sowie Tür- und Fensternischen.',
      'Wird nach einer Bauzeichnung ermittelt, muss diese die lichten Maße erkennen lassen. Einen pauschalen Putzabzug kennt die WoFlV nicht – siehe „Putzabzug“.',
    ],
    zitate: [
      {
        text: '(1) Die Grundfläche ist nach den lichten Maßen zwischen den Bauteilen zu ermitteln; dabei ist von der Vorderkante der Bekleidung der Bauteile auszugehen.',
        quelle: '§ 3 Abs. 1 WoFlV',
      },
    ],
    quellen: [WOFLV('3')],
    stichworte: ['lichte Maße', 'Bekleidung', 'Treppe', 'Steigungen', 'Nische', 'Bauzeichnung'],
    apps: ['flaechen'],
    themen: ['wofl', 'putzabzug'],
  },
  {
    id: 'woflv-4',
    bereich: 'wofl',
    titel: 'Anrechnung nach lichter Höhe (§ 4 WoFlV)',
    kurz: '≥ 2 m voll, 1–2 m zur Hälfte, < 1 m nicht; Wintergärten ½, Balkone ¼ bis ½.',
    text: [
      'Im Flächenrechner trägt jeder Raum eine Anrechnung (voll, halb, nicht, Wintergarten, Freisitz, individueller Faktor). Beim IFC-Import wird der Faktor eines Raums unter Dachschrägen aus den tatsächlichen lichten Höhen des Raumkörpers errechnet (Anteil ≥ 2 m + ½ × Anteil 1–2 m).',
      'Der Faktor für Balkone, Loggien, Dachgärten und Terrassen gilt projektweit (Standard ¼, höchstens ½) und lässt sich je Raum abweichend festlegen.',
    ],
    zitate: [
      {
        text: 'Die Grundflächen 1. von Räumen und Raumteilen mit einer lichten Höhe von mindestens zwei Metern sind vollständig, 2. von Räumen und Raumteilen mit einer lichten Höhe von mindestens einem Meter und weniger als zwei Metern sind zur Hälfte, 3. von unbeheizbaren Wintergärten, Schwimmbädern und ähnlichen nach allen Seiten geschlossenen Räumen sind zur Hälfte, 4. von Balkonen, Loggien, Dachgärten und Terrassen sind in der Regel zu einem Viertel, höchstens jedoch zur Hälfte anzurechnen.',
        quelle: '§ 4 WoFlV',
      },
    ],
    quellen: [WOFLV('4')],
    stichworte: ['Anrechnung', 'lichte Höhe', 'Dachschräge', 'zwei Meter', 'Hälfte', 'Viertel', 'Balkon', 'Wintergarten', 'Faktor'],
    apps: ['flaechen', 'kosten'],
    themen: ['wofl'],
  },
  {
    id: 'putzabzug',
    bereich: 'wofl',
    titel: 'Putzabzug (3 %)',
    kurz: 'Kein Teil der WoFlV; frühere Regel der II. BV für Flächen aus Rohbaumaßen, in der Praxis (z. B. Archicad-Zonen) üblich.',
    text: [
      'Die bis 31.12.2003 geltende Zweite Berechnungsverordnung (II. BV, § 43) ließ Grundflächen, die aus Rohbaumaßen einer Bauzeichnung ermittelt wurden, pauschal um 3 % kürzen. Die WoFlV enthält diese Regel nicht mehr; sie verlangt lichte Maße ab Vorderkante der Bekleidung (§ 3).',
      'Viele Büros und Programme (z. B. Archicad-Zonen mit Rohbaumaßen) rechnen den Abzug weiter. Der Flächenrechner übernimmt ihn je Raum aus der IFC (Verhältnis Nettofläche zu Zonenfläche) oder als Eingabe. In Excel-Vorlagen stehen Werte mit (raum.flaeche, raum.wofl) und ohne Abzug (…_roh) bereit, damit nicht doppelt abgezogen wird.',
    ],
    quellen: [WOFLV('3'), { titel: 'Zweite Berechnungsverordnung (II. BV)', fundstelle: '§ 43 Abs. 3 II. BV a. F. (bis 31.12.2003)' }],
    stichworte: ['Putzabzug', '3 %', 'Rohbaumaße', 'II. BV', 'Archicad', 'Zone'],
    apps: ['flaechen'],
    themen: ['putzabzug', 'wofl'],
  },

  /* ---------- BauNVO ---------- */
  {
    id: 'baunvo-fassungen',
    bereich: 'baunvo',
    titel: 'Welche BauNVO gilt? (Fassung nach dem Bebauungsplan)',
    kurz: 'Maßgebend ist die Fassung, die beim Inkrafttreten des Bebauungsplans galt; ohne Plan das aktuelle Recht.',
    text: [
      'Bebauungspläne verweisen statisch auf die BauNVO in der Fassung, die bei ihrem Inkrafttreten (bzw. der öffentlichen Auslegung) galt. Der GRZ-Nachweis wählt die Fassung aus dem Plandatum; sie lässt sich übersteuern:',
      '- **BauNVO 1962**: 01.08.1962 – 31.12.1968',
      '- **BauNVO 1968/1977**: 01.01.1969 – 26.01.1990 (Neufassungen 1968 und 1977 mit gleicher Systematik für GRZ/GF)',
      '- **BauNVO 1990 ff.**: ab 27.01.1990 (später mehrfach geändert, u. a. 2013, 2017, 2021, 2023)',
      'Ohne Plandatum (Vorhaben im Innen- oder Außenbereich nach §§ 34, 35 BauGB) rechnet das Tool nach aktuellem Recht.',
      'Unterschiede, die das Tool berücksichtigt: Vor 1990 zählen zur Geschossfläche auch Aufenthaltsräume in Nicht-Vollgeschossen samt Treppenräumen und Umfassungswänden; GRZ II (Garagen, Stellplätze, Zufahrten, Nebenanlagen) gibt es erst ab 1990; 1968/77 bleiben Garagen bis 0,1 der Grundstücksfläche anrechnungsfrei.',
    ],
    quellen: [
      { titel: 'BauNVO 1962', fundstelle: 'BGBl. I 1962 S. 429', url: BGBL('62', '0429') },
      { titel: 'BauNVO 1968', fundstelle: 'BGBl. I 1968 S. 1237', url: BGBL('68', '1237') },
      { titel: 'BauNVO 1977', fundstelle: 'BGBl. I 1977 S. 1763', url: BGBL('77', '1763') },
      { titel: 'BauNVO 1990', fundstelle: 'BGBl. I 1990 S. 132', url: BGBL('90', '0132') },
      { titel: 'BauNVO, geltende Fassung', url: GII('baunvo/') },
    ],
    stichworte: ['Fassung', 'Plandatum', 'Bebauungsplan', 'statische Verweisung', '1962', '1968', '1977', '1990', '§ 34', '§ 35'],
    apps: ['grz'],
    themen: ['baunvo', 'grz', 'gfz'],
  },
  {
    id: 'baunvo-19',
    bereich: 'baunvo',
    titel: 'Grundflächenzahl GRZ und GRZ II (§ 19 BauNVO)',
    kurz: 'Überdeckte Fläche je m² Grundstück; Garagen, Stellplätze mit Zufahrten, Nebenanlagen und Unterbauungen bis +50 %, höchstens 0,8.',
    text: [
      'Die **Grundfläche** ist der Teil des Baugrundstücks, der von baulichen Anlagen überdeckt wird – eine Überdeckung, keine Summe: Was sich überlagert, zählt nur einmal. Der GRZ-Nachweis bildet deshalb die Vereinigung aller Flächen (Gebäude und Lageplan-Flächen).',
      'Nach § 19 Abs. 4 (ab 1990) werden Garagen und Stellplätze mit Zufahrten, Nebenanlagen und unterirdische Anlagen mitgerechnet (**GRZ II**); die zulässige Grundfläche darf durch sie um bis zu 50 % überschritten werden, höchstens bis 0,8.',
    ],
    zitate: [
      {
        text: '(4) Bei der Ermittlung der Grundfläche sind die Grundflächen von 1. Garagen und Stellplätzen mit ihren Zufahrten, 2. Nebenanlagen im Sinne des § 14, 3. baulichen Anlagen unterhalb der Geländeoberfläche, durch die das Baugrundstück lediglich unterbaut wird, mitzurechnen. Die zulässige Grundfläche darf durch die Grundflächen der in Satz 1 bezeichneten Anlagen bis zu 50 vom Hundert überschritten werden, höchstens jedoch bis zu einer Grundflächenzahl von 0,8; weitere Überschreitungen in geringfügigem Ausmaß können zugelassen werden.',
        quelle: '§ 19 Abs. 4 Satz 1 und 2 BauNVO',
      },
    ],
    quellen: [BAUNVO('19'), BAUNVO('16')],
    stichworte: ['GRZ', 'Grundflächenzahl', 'GRZ II', 'Überdeckung', 'Garage', 'Stellplatz', 'Zufahrt', 'Nebenanlage', 'Tiefgarage', '0,8'],
    apps: ['grz'],
    themen: ['grz', 'lageplan', 'ueberlagerung'],
  },
  {
    id: 'baunvo-20',
    bereich: 'baunvo',
    titel: 'Vollgeschosse und Geschossflächenzahl GFZ (§ 20 BauNVO)',
    kurz: 'Vollgeschoss nach Landesrecht; Geschossfläche nach Außenmaßen aller Vollgeschosse, ohne Balkone, Loggien, Terrassen.',
    text: [
      'Was ein Vollgeschoss ist, regelt die Landesbauordnung (siehe BauO NRW). Die **Geschossfläche** ist nach Außenmaßen in allen Vollgeschossen zu ermitteln; Balkone, Loggien und Terrassen bleiben unberücksichtigt – der GRZ-Nachweis rechnet deshalb nur Umrisse mit Raumumschließung R.',
      'Vor 1990 (BauNVO 1962, 1968/1977) sind zusätzlich die Flächen von Aufenthaltsräumen in anderen Geschossen samt zugehöriger Treppenräume und Umfassungswände mitzurechnen. Der GRZ-Nachweis erweitert diese Räume um den Wandzuschlag (Standard 0,25 m) und begrenzt sie auf den Geschossgrundriss.',
    ],
    zitate: [
      { text: '(1) Als Vollgeschosse gelten Geschosse, die nach landesrechtlichen Vorschriften Vollgeschosse sind oder auf ihre Zahl angerechnet werden.', quelle: '§ 20 Abs. 1 BauNVO' },
      { text: '(3) Die Geschossfläche ist nach den Außenmaßen der Gebäude in allen Vollgeschossen zu ermitteln.', quelle: '§ 20 Abs. 3 Satz 1 BauNVO' },
      {
        text: '(4) Bei der Ermittlung der Geschossfläche bleiben Nebenanlagen im Sinne des § 14, Balkone, Loggien, Terrassen sowie bauliche Anlagen, soweit sie nach Landesrecht in den Abstandsflächen (seitlicher Grenzabstand und sonstige Abstandsflächen) zulässig sind oder zugelassen werden können, unberücksichtigt.',
        quelle: '§ 20 Abs. 4 BauNVO',
      },
    ],
    quellen: [BAUNVO('20')],
    stichworte: ['GFZ', 'Geschossfläche', 'Geschossflächenzahl', 'Vollgeschoss', 'Aufenthaltsraum', 'Wandzuschlag', 'Außenmaße'],
    apps: ['grz'],
    themen: ['gfz', 'vollgeschoss', 'aufenthaltsraum'],
  },
  {
    id: 'baunvo-21a',
    bereich: 'baunvo',
    titel: 'Garagen und Stellplätze (§ 21a BauNVO)',
    kurz: 'Überdachte Stellplätze und Garagen dürfen die zulässige Grundfläche um bis zu 0,1 der Grundstücksfläche überschreiten (soweit § 19 Abs. 4 nicht entgegensteht).',
    text: [
      'Der GRZ-Nachweis rechnet nach BauNVO 1968/1977 Garagen bis 0,1 der Grundstücksfläche anrechnungsfrei („bis 0,1 frei“); darüber hinaus zählen sie zur Grundfläche. Ab 1990 gehen Garagen in die GRZ II ein.',
    ],
    zitate: [
      {
        text: '(3) Soweit § 19 Absatz 4 nicht entgegensteht, ist eine Überschreitung der zulässigen Grundfläche durch überdachte Stellplätze und Garagen bis zu 0,1 der Fläche des Baugrundstücks zulässig; …',
        quelle: '§ 21a Abs. 3 BauNVO',
      },
    ],
    quellen: [BAUNVO('21a')],
    stichworte: ['Garage', 'Carport', 'überdachter Stellplatz', '0,1', 'Garagengeschoss'],
    apps: ['grz'],
    themen: ['grz', 'lageplan'],
  },

  /* ---------- BauO NRW ---------- */
  {
    id: 'bauo-2018-vollgeschoss',
    bereich: 'bauo',
    titel: 'Vollgeschoss nach BauO NRW 2018 (ab 01.01.2019)',
    kurz: 'Oberirdisch (Decke im Mittel > 1,60 m über Gelände) und lichte Höhe ≥ 2,30 m über mehr als ¾ der Grundfläche des Geschosses darunter.',
    text: [
      'Der GRZ-Nachweis prüft je Geschoss:',
      '- **oberirdisch?** Deckenoberkante im Mittel über der Geländeoberfläche – das Gelände wird entlang der Außenwände *dieses* Geschosses ermittelt (Geländemodell der IFC bzw. Lageplan-Flächen mit Höhe), am Hang also für jedes Geschoss getrennt',
      '- **lichte Höhe** ≥ 2,30 m (Höhe bis Dachhaut bzw. Decke abzüglich Dachaufbau) über mehr als drei Viertel der Grundfläche des darunterliegenden Geschosses; Split-Level-Räume mit tieferem Fußboden zählen mit ihrer größeren Höhe',
    ],
    zitate: [
      { text: '(4) Geländeoberfläche ist die Fläche, die sich aus der Baugenehmigung oder den Festsetzungen des Bebauungsplans ergibt, im Übrigen die natürliche Geländeoberfläche.', quelle: '§ 2 Abs. 4 BauO NRW 2018' },
      { text: '(5) Geschosse sind oberirdische Geschosse, wenn ihre Deckenoberkanten im Mittel mehr als 1,60 m über die Geländeoberfläche hinausragen, im Übrigen sind sie Kellergeschosse. …', quelle: '§ 2 Abs. 5 BauO NRW 2018' },
      {
        text: '(6) Vollgeschosse sind oberirdische Geschosse, die eine lichte Höhe von mindestens 2,30 m haben. Ein Geschoss ist nur dann ein Vollgeschoss, wenn es die in Satz 1 genannte Höhe über mehr als drei Viertel der Grundfläche des darunterliegenden Geschosses hat.',
        quelle: '§ 2 Abs. 6 BauO NRW 2018',
      },
    ],
    quellen: [BAUO2018, SYNOPSE, MESCHEDE],
    stichworte: ['Vollgeschoss', 'oberirdisch', 'Kellergeschoss', 'Geländeoberfläche', '1,60 m', '2,30 m', 'drei Viertel', 'lichte Höhe', 'BauO NRW 2018'],
    apps: ['grz'],
    themen: ['vollgeschoss', 'gelaende'],
  },
  {
    id: 'bauo-1985-vollgeschoss',
    bereich: 'bauo',
    titel: 'Vollgeschoss nach BauO NW 1984/1995 und BauO NRW 2000 (01.01.1985 – 31.12.2018)',
    kurz: 'Decke im Mittel > 1,60 m über Gelände, Höhe ≥ 2,30 m; Staffelgeschoss > ⅔, geneigte Dächer > ¾; Höhe bis OK Fußboden darüber bzw. OK Dachhaut.',
    text: ['Gemessen wird nicht die lichte Höhe, sondern von Oberkante Fußboden bis Oberkante Fußboden darüber, unter Dachflächen bis Oberkante Dachhaut.'],
    zitate: [
      {
        text: '(5) Vollgeschosse sind Geschosse, deren Deckenoberkante im Mittel mehr als 1,60 m über die Geländeoberfläche hinausragt und die eine Höhe von mind. 2,30 m haben. Ein gegenüber den Außenwänden des Gebäudes zurückgesetztes oberstes Geschoss (Staffelgeschoss) ist nur dann ein Vollgeschoss, wenn es diese Höhe über mehr als zwei Drittel der Grundfläche des darunter liegenden Geschosses hat. Ein Geschoss mit geneigten Dachflächen ist ein Vollgeschoss, wenn es diese Höhe über mehr als drei Viertel seiner Grundfläche hat. Die Höhe der Geschosse wird von Oberkante Fußboden bis Oberkante Fußboden der darüber liegenden Decke, bei Geschossen mit Dachflächen bis Oberkante Dachhaut gemessen.',
        quelle: '§ 2 Abs. 5 BauO NRW 2000 (wortgleich BauO NW 1984/1995), nach Vergleichstabelle Stadt Meschede',
      },
    ],
    quellen: [MESCHEDE],
    stichworte: ['Vollgeschoss', 'Staffelgeschoss', 'zwei Drittel', 'drei Viertel', 'Dachhaut', 'BauO NRW 2000', 'BauO NW 1984', '1995'],
    apps: ['grz'],
    themen: ['vollgeschoss', 'gelaende'],
  },
  {
    id: 'bauo-1962-vollgeschoss',
    bereich: 'bauo',
    titel: 'Vollgeschoss nach BauO NW 1962/1970 (01.10.1962 – 31.12.1984)',
    kurz: 'Vollständig über der festgelegten Geländeoberfläche, über mindestens ⅔ der Grundfläche die für Aufenthaltsräume erforderliche lichte Höhe; Kellergeschosse > 1,40 m im Mittel werden angerechnet.',
    text: [
      '„Vollständig über der Geländeoberfläche“ prüft der GRZ-Nachweis am **höchsten Punkt** des Geländes entlang der Außenwände des Geschosses. Erforderliche lichte Höhe für Aufenthaltsräume nach § 59: 2,50 m, in Einfamilienhäusern und im Dachraum 2,30 m.',
      'Geschosse mit mehr als 1,80 m lichter Höhe unterhalb der Traufenoberkante und Garagengeschosse werden nicht automatisch angerechnet – sie lassen sich je Geschoss festlegen.',
    ],
    zitate: [
      {
        text: '(5) Vollgeschosse sind Geschosse, die vollständig über der festgelegten Geländeoberfläche liegen und über mindestens zwei Drittel ihrer Grundfläche die für Aufenthaltsräume erforderliche lichte Höhe haben. Auf die Zahl der Vollgeschosse sind anzurechnen: 1. Geschosse mit einer lichten Höhe von mehr als 1,80 m unterhalb der Traufenoberkante, 2. Kellergeschosse, die im Mittel mehr als 1,40 m (1970: im Lichten) und 3. Garagengeschosse, die im Mittel mehr als 2,00 m über die festgelegte Geländeoberfläche hinausragen.',
        quelle: '§ 2 Abs. 5 BauO NW 1962/1970, nach Vergleichstabelle Stadt Meschede',
      },
    ],
    quellen: [MESCHEDE],
    stichworte: ['Vollgeschoss', 'festgelegte Geländeoberfläche', 'zwei Drittel', 'Kellergeschoss', '1,40 m', 'Garagengeschoss', 'Traufe', 'BauO NW 1962', '1970'],
    apps: ['grz'],
    themen: ['vollgeschoss', 'gelaende'],
  },
  {
    id: 'bauo-aufenthaltsraum',
    bereich: 'bauo',
    titel: 'Aufenthaltsräume: Begriff und lichte Höhe',
    kurz: 'Räume zum nicht nur vorübergehenden Aufenthalt; NRW 2018: lichte Raumhöhe 2,40 m, im Dachraum/Keller 2,20 m über mindestens die Hälfte.',
    text: [
      'Für die Geschossfläche vor 1990 prüft der GRZ-Nachweis Räume in Nicht-Vollgeschossen zweifach: nach der **Nutzung** (Raumname, Nutzungsgruppe) und nach der **lichten Höhe**, die die maßgebende Bauordnung für Aufenthaltsräume verlangt. Erfüllt ein Wohnraum die Höhe nicht, wird er nicht als Aufenthaltsraum vorgeschlagen; jede Einstufung lässt sich festlegen.',
      '- BauO NW 1962/1970 (§ 59): 2,50 m, in Einfamilienhäusern und im Dachraum 2,30 m',
      '- BauO NRW 2018 (§ 46): 2,40 m; im Dachraum und Kellergeschoss 2,20 m über mindestens die Hälfte der Netto-Raumfläche, Raumteile bis 1,50 m bleiben außer Betracht; Wohngebäude der Gebäudeklassen 1 und 2: 2,30 m kann gestattet werden',
      '- BauO NW 1984/1995, BauO NRW 2000: das Tool rechnet mit denselben Werten wie 2018 – im Einzelfall anhand der damaligen Fassung prüfen',
    ],
    zitate: [
      { text: '(7) Aufenthaltsräume sind Räume, die zum nicht nur vorübergehenden Aufenthalt von Menschen bestimmt oder geeignet sind.', quelle: '§ 2 Abs. 7 BauO NRW 2018' },
      {
        text: '(1) Aufenthaltsräume müssen eine lichte Raumhöhe von mindestens 2,40 m haben. Aufenthaltsräume im Dachraum und im Kellergeschoss müssen eine lichte Raumhöhe von mindestens 2,20 m über mindestens der Hälfte ihrer Netto-Raumfläche haben; Raumteile mit einer lichten Raumhöhe bis zu 1,50 m bleiben außer Betracht. Für Aufenthaltsräume in Wohngebäuden der Gebäudeklassen 1 und 2 kann eine lichte Höhe von mindestens 2,30 m gestattet werden.',
        quelle: '§ 46 Abs. 1 BauO NRW 2018',
      },
    ],
    quellen: [BAUO2018, SYNOPSE, MESCHEDE],
    stichworte: ['Aufenthaltsraum', 'lichte Raumhöhe', '2,40 m', '2,20 m', '2,30 m', 'Dachraum', 'Kellergeschoss', '§ 46', '§ 59'],
    apps: ['grz', 'flaechen'],
    themen: ['aufenthaltsraum', 'vollgeschoss', 'wofl'],
  },

  /* ---------- DIN 276 ---------- */
  {
    id: 'din276-kostengruppen',
    bereich: 'din276',
    titel: 'Kostengruppen (DIN 276)',
    kurz: '100 Grundstück … 800 Finanzierung; gegliedert in bis zu drei Ebenen.',
    text: [
      '- **100** Grundstück',
      '- **200** Vorbereitende Maßnahmen',
      '- **300** Bauwerk – Baukonstruktionen',
      '- **400** Bauwerk – Technische Anlagen',
      '- **500** Außenanlagen und Freiflächen',
      '- **600** Ausstattung und Kunstwerke',
      '- **700** Baunebenkosten',
      '- **800** Finanzierung',
      'Jede Kostengruppe gliedert sich in eine 2. Ebene (z. B. 330 Außenwände) und 3. Ebene (z. B. 331 Tragende Außenwände). Die Kostenermittlung rechnet Positionen auf jeder Ebene und summiert nach oben.',
    ],
    quellen: [DIN276],
    stichworte: ['Kostengruppe', 'KG', '300', '400', 'Bauwerkskosten', 'Ebene', 'Gliederung'],
    apps: ['kosten'],
    themen: ['kosten', 'din276'],
  },
  {
    id: 'din276-stufen',
    bereich: 'din276',
    titel: 'Stufen der Kostenermittlung',
    kurz: 'Kostenrahmen, -schätzung, -berechnung, -voranschlag, -anschlag, -feststellung – mit zunehmender Gliederungstiefe.',
    text: [
      '- **Kostenrahmen** (Leistungsphase 1)',
      '- **Kostenschätzung** (LPh 2) – mindestens bis zur 2. Ebene',
      '- **Kostenberechnung** (LPh 3) – mindestens bis zur 3. Ebene',
      '- **Kostenvoranschlag** (LPh 5/6), **Kostenanschlag** (LPh 7), **Kostenfeststellung** (LPh 8)',
      'Exportdateien heißen nach der Stufe, z. B. „Projekt Kosten Kostenberechnung.xlsx“.',
    ],
    quellen: [DIN276],
    stichworte: ['Kostenrahmen', 'Kostenschätzung', 'Kostenberechnung', 'Kostenvoranschlag', 'Kostenanschlag', 'Kostenfeststellung', 'Leistungsphase', 'HOAI'],
    apps: ['kosten'],
    themen: ['kosten', 'din276'],
  },
  {
    id: 'kosten-kennwerte',
    bereich: 'din276',
    titel: 'Kennwerte, Baupreisindex und Regionalfaktor',
    kurz: 'Kosten = Menge × Kennwert × Index aktuell/Basis × Regionalfaktor – als Bandbreite von / Mittel / bis.',
    text: [
      'Die Kennwerte sind Eingaben des Büros (eigene Projekte, Kennwertsammlungen). Für die Fortschreibung auf den aktuellen Preisstand dient der Baupreisindex des Statistischen Bundesamts (Basis und aktuell), für Ortsunterschiede ein Regionalfaktor (1 = Bundesdurchschnitt).',
      'Mengen kommen aus dem Projekt (BGF, BRI, NUF … nach DIN 277, WoFl nach WoFlV) bzw. aus den abgeleiteten Bauteilmengen – siehe „Mengen der Kostenermittlung“.',
    ],
    quellen: [DIN276, { titel: 'Baupreisindizes (Statistisches Bundesamt)', url: 'https://www.destatis.de/DE/Themen/Wirtschaft/Preise/Baupreise-Immobilienpreisindex/_inhalt.html' }],
    stichworte: ['Kennwert', 'Baupreisindex', 'Regionalfaktor', 'Bandbreite', 'Preisstand', 'Umsatzsteuer'],
    apps: ['kosten'],
    themen: ['kosten', 'kennwerte'],
  },

  /* ---------- So rechnen die Apps ---------- */
  {
    id: 'verfahren-splitlevel',
    bereich: 'verfahren',
    titel: 'Split-Level: tiefer liegende Räume und Umrisse',
    kurz: 'Höhenversatz je Umriss verschiebt den ganzen Körper; tiefer liegende Räume vergrößern den BRI um Fläche × Absenkung.',
    text: [
      'Jeder BGF-Umriss hat einen **Höhenversatz des Körpers**, jeder Raum eine **Höhenlage des Fußbodens** – beide gegenüber dem Geschoss (negativ = tiefer).',
      '- **Höhenversatz Körper (Umriss):** Der ganze Körper samt Dach wird verschoben, seine Höhe (**Körperhöhe** bzw. Geschosshöhe) bleibt – der BRI ändert sich dadurch nicht. Soll die Oberkante bleiben, die Körperhöhe um den Versatz vergrößern (z. B. −0,60 m Versatz und Geschosshöhe + 0,60 m). Überschneidungen mit anderen Geschossen werden nicht abgezogen.',
      '- **Raum tiefer als sein Umriss:** BRI + Raumfläche (Polygon, ohne Putzabzug) × Absenkung. Exakt ist ein eigener Umriss für den abgesenkten Bereich; die Raumfläche ist eine Näherung ohne die Wände darunter.',
      'Beim IFC-Import wird der Fußboden jeder Zone mit dem üblichen Fußboden ihres Geschosses verglichen; Abweichungen ab 5 cm werden als Höhenlage übernommen und im Bericht genannt. Im GRZ-Nachweis gehen tiefer liegende Räume mit ihrer größeren lichten Höhe ein.',
    ],
    quellen: [DIN277],
    stichworte: ['Split-Level', 'Höhenlage', 'Höhenversatz', 'Versatz', 'Körperhöhe', 'abgesenkt', 'tiefer', 'Absenkung', 'Halbgeschoss'],
    apps: ['flaechen', 'grz'],
    themen: ['splitlevel', 'bri'],
  },
  {
    id: 'verfahren-sohle',
    bereich: 'verfahren',
    titel: 'Bodenplatte: BRI ab Unterkante Sohle',
    kurz: 'Je Geschoss: Abstand UK Sohle bis Fußboden; zählt dort, wo kein Geschoss darunter liegt.',
    text: [
      'DIN 277 rechnet den BRI ab der Unterseite der konstruktiven Bauwerkssohle; die BGF dagegen auf Höhe des Fußbodens. Damit das Volumen der Bodenplatte nicht fehlt, trägt jedes Geschoss die Angabe **Bodenplatte: UK Sohle bis Fußboden** – im untersten Geschoss für die ganze Fläche, in anderen Geschossen nur für die Teile, unter denen kein Geschoss liegt (z. B. nicht unterkellerter Anbau).',
      'Beim IFC-Import wird die Dicke aus der größten Bodenplatte unter dem untersten Geschoss ermittelt (Fußbodenkote bis Unterseite; Fundamente zählen nicht).',
    ],
    quellen: [DIN277],
    stichworte: ['Bodenplatte', 'Sohle', 'UK Sohle', 'Keller', 'Gründung', 'BRI'],
    apps: ['flaechen', 'kosten'],
    themen: ['sohle', 'bri'],
  },
  {
    id: 'verfahren-dach',
    bereich: 'verfahren',
    titel: 'Dachformen, Gauben und Dach aus dem IFC-Modell',
    kurz: 'BRI bis zur Dachhaut: geschlossene Formeln je Dachform, Gauben mit eigenen Formeln, sonst Höhenfeld aus dem Modell.',
    text: [
      'Für rechteckige Grundrisse werden die klassischen Körper verwendet (Keil, Dreiecksprisma, Walmende ⅓, Krüppelwalm-Abzug ⅙, Kreisabschnitt …), sonst Grundfläche × mittlere Höhe (exakt berechnet). Gauben werden mit ihren Formeln ausgewiesen, z. B. Schleppgaube B × T² × (tan α − tan β) / 2.',
      'Mit Dach aus dem IFC-Modell reicht der Körper bis zur Dachhaut – aber nur dort, wo darüber kein Geschoss mit BGF liegt (sonst bis zu dessen Fußboden). So wird eine als eigenes Geschoss modellierte Dachspitze dem Geschoss darunter zugerechnet. Mit „BRI auf Geschosshöhe begrenzen“ lässt sich das je Geschoss abschalten.',
      'Ausführlich: docs/dach-und-gauben.md im Repository.',
    ],
    quellen: [DIN277],
    stichworte: ['Dach', 'Satteldach', 'Walmdach', 'Gaube', 'Schleppgaube', 'Dachhaut', 'Dachspitze', 'Spitzboden', 'IFC'],
    apps: ['flaechen'],
    themen: ['dach', 'bri'],
  },
  {
    id: 'verfahren-gelaende',
    bereich: 'verfahren',
    titel: 'Geländeoberfläche im GRZ-Nachweis',
    kurz: 'Festgelegt, sonst aus dem Geländemodell der IFC bzw. den Lageplan-Flächen – je Geschoss entlang seiner Außenwände.',
    text: [
      'Für „Deckenoberkante im Mittel über der Geländeoberfläche“ wird das Gelände alle 0,5 m in 0,4 m Abstand vor den Außenwänden des jeweiligen Geschosses abgegriffen und gemittelt. Quelle: die festgelegte Höhe (Eingabe), sonst das **Geländemodell** aus der IFC (Gelände, Geländeelemente, Bauteile des Lageplan-Geschosses), sonst Lageplan-Flächen mit Höhe.',
      'Am Hang ergibt sich so für ein talseitig freiliegendes Untergeschoss ein anderes Mittel als für das Erdgeschoss. Nach BauO NW 1962/1970 („vollständig über der Geländeoberfläche“) zählt der höchste Geländepunkt am Geschoss. Die 3D-Ansicht zeigt Gelände und Bezugsebenen.',
      'Decken mindestens die Hälfte der Probenpunkte keine Höhenangabe ab, nimmt das Tool ±0,00 an und weist darauf hin.',
    ],
    quellen: [BAUO2018],
    stichworte: ['Geländeoberfläche', 'Gelände', 'Hang', 'Mittel', 'Geländemodell', 'Lageplan', '3D'],
    apps: ['grz'],
    themen: ['gelaende', 'vollgeschoss'],
  },
  {
    id: 'verfahren-ueberlagerung',
    bereich: 'verfahren',
    titel: 'Überlagernde Flächen zählen nie doppelt',
    kurz: 'Grundfläche, Bilanz und Summen über Vereinigung; jede Stelle gehört der am stärksten angerechneten Fläche.',
    text: [
      'GRZ, GRZ II, Flächenbilanz und Grundstücksfläche werden aus der **Vereinigung** der Flächen gebildet. In der Flächenliste wird jede Stelle genau einer Fläche zugeordnet – in der Reihenfolge Hauptanlage, GRZ II, Garagen 0,1, „prüfen“, „zählt nicht“, bei gleichem Rang nach der Listenfolge. Die Spalte „m²“ zeigt diesen eindeutigen Anteil außerhalb des Gebäudes; ihre Summe ist überlagerungsfrei. Überlagerungen werden als Hinweis genannt.',
      'Auch im Flächenrechner überlagern sich BGF-Umrisse eines Geschosses in GRZ und Bodenplatte nie doppelt (Vereinigung); die BGF selbst ist die Summe der gezeichneten Umrisse – überlappend gezeichnete Umrisse zeigt die Auswertung als zu hohe BGF.',
    ],
    quellen: [BAUNVO('19')],
    stichworte: ['Überlagerung', 'überlappend', 'doppelt', 'Vereinigung', 'eindeutig', 'Flächenbilanz'],
    apps: ['grz', 'flaechen'],
    themen: ['ueberlagerung', 'lageplan', 'grz'],
  },
  {
    id: 'verfahren-ifc',
    bereich: 'verfahren',
    titel: 'IFC importieren und aktualisieren',
    kurz: 'Erneuter Export desselben Modells: Abgleich über IFC-GlobalIds, Änderungen von Hand bleiben.',
    text: [
      'Beim ersten Import merkt sich jedes übernommene Element (Geschoss, Raum, BGF-Umriss, Lageplan-Fläche) die IFC-GlobalId und die Werte aus der IFC. Beim **Aktualisieren** gilt je Wert: seit dem Import nicht geändert → neuer Wert aus der IFC; von Hand geändert → bleibt (hat sich auch die IFC geändert, steht das im Bericht).',
      'Neue Zonen kommen hinzu, entfernte entfallen – außer sie wurden von Hand geändert. Von Hand gezeichnete Flächen bleiben unberührt. BGF-Umrisse (aus Wänden erzeugt, ohne eigene Id) werden über die größte Überdeckung zugeordnet.',
      'Flächenrechner: IFC-Import → „aktuelles Projekt aktualisieren“. GRZ-Nachweis und Kostenermittlung: „IFC aktualisieren …“.',
    ],
    quellen: [{ titel: 'buildingSMART: IFC (ISO 16739-1)', url: 'https://technical.buildingsmart.org/standards/ifc/' }],
    stichworte: ['IFC', 'Reimport', 'aktualisieren', 'GlobalId', 'Archicad', 'Abgleich'],
    apps: ['flaechen', 'grz', 'kosten'],
    themen: ['ifc'],
  },
];

/** Suchtext vereinheitlichen: Kleinbuchstaben, Umlaute und ß ausgeschrieben, ohne Satzzeichen */
export function normalisiere(s: string): string {
  return s
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .replace(/[^\p{L}\p{N},.%§ ]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export interface Treffer {
  regel: Regel;
  punkte: number;
}

/**
 * Volltextsuche über Titel, Kurztext, Stichworte, Text und Zitate. Jedes Suchwort muss vorkommen;
 * Treffer in Titel und Stichworten wiegen schwerer.
 */
export function suche(q: string, o: { app?: RegelApp; themen?: string[] } = {}): Treffer[] {
  const worte = normalisiere(q).split(' ').filter(Boolean);
  const out: Treffer[] = [];
  for (const regel of REGELN) {
    if (o.app && !regel.apps.includes(o.app) && !worte.length) continue;
    if (o.themen?.length && !regel.themen.some((t) => o.themen!.includes(t))) continue;
    const titel = normalisiere(regel.titel);
    const stich = normalisiere(regel.stichworte.join(' '));
    const rest = normalisiere([regel.kurz, ...regel.text, ...(regel.zitate ?? []).map((z) => `${z.text} ${z.quelle}`), ...regel.quellen.map((x) => `${x.titel} ${x.fundstelle ?? ''}`)].join(' '));
    let punkte = 0;
    let alle = true;
    for (const w of worte) {
      const p = (titel.includes(w) ? 5 : 0) + (stich.includes(w) ? 3 : 0) + (rest.includes(w) ? 1 : 0);
      if (!p) {
        alle = false;
        break;
      }
      punkte += p;
    }
    if (!alle) continue;
    // Regeln der eigenen App zuerst
    if (o.app && regel.apps.includes(o.app)) punkte += 0.5;
    out.push({ regel, punkte });
  }
  return worte.length ? out.sort((a, b) => b.punkte - a.punkte) : out;
}
