/**
 * Release-data source for the user-facing What's new page (#254).
 *
 * Originally embedded inline inside `whats-new.component.ts` — extracted
 * once the file passed the 1200-line mark and per-release diffs became
 * harder to read against the surrounding template / router glue. The
 * convention is unchanged: every `develop → main` release **prepends**
 * a new `Release` entry to the head of the array, in lock-step with
 * the matching `docs/changelog/user-facing/v{X.Y.Z}.md` markdown source.
 *
 * Trip-wires: the vitest version-pin spec + the cypress visible-on-
 * landing spec assert the newest-first ordering and the total card
 * count, so a release that forgets to update this file (or appends
 * instead of prepends) fails CI.
 */

/**
 * A piece of release copy, in one language or two (#1347).
 *
 * A bare string is English — which is what all 88 historical entries already
 * are, so nothing had to be migrated to introduce this.
 *
 * The content deliberately stays here rather than moving to
 * `assets/i18n/{en,it}.json`, where the repo otherwise keeps every visible
 * string. This file is 200 KB, larger than either i18n bundle; those are loaded
 * synchronously at boot for **every** user, while this route is `loadComponent`
 * and opened by almost nobody. Moving it would roughly triple the always-loaded
 * payload to translate a page few people visit — a real performance regression
 * traded for a translation fix.
 */
export type Localised = string | { readonly en: string; readonly it: string };

export interface ChangelogSection {
  readonly heading: Localised;
  readonly bullets: readonly Localised[];
}

export interface Release {
  readonly version: string;
  readonly date: string;
  readonly headline: Localised;
  readonly sections: readonly ChangelogSection[];
}

/**
 * Resolves a `Localised` for the active language, falling back to English.
 *
 * English is the fallback rather than "show the key" or an empty string,
 * because an untranslated release note is still worth reading — the failure
 * mode of a missing translation here should be a language switch, not a blank
 * card.
 */
export function localised(value: Localised, lang: string): string {
  if (typeof value === 'string') {
    return value;
  }

  return lang === 'it' ? value.it : value.en;
}

export const RELEASES: readonly Release[] = [
  {
    version: 'v2.61.0',
    date: '2026-09-12',
    headline: {
      en: 'What to teach tonight, and what they missed.',
      it: 'Cosa insegnare stasera, e cosa si è perso.',
    },
    sections: [
      {
        heading: {
          en: '💡 Three suggestions for tonight',
          it: '💡 Tre proposte per stasera',
        },
        bullets: [
          {
            en: 'Open a lesson and the programme offers three things to teach, each one saying why: never taught this season, taught once, or longest since.',
            it: 'Apri una lezione e il programma propone tre cose da fare, ognuna con il suo motivo: mai fatto questa stagione, fatto una volta, o quello che manca da più tempo.',
          },
          {
            en: 'At the check-in and on the timetable, so planning ahead works the same way. A gi class is never offered a no-gi technique.',
            it: 'Al check-in e sull’orario, così pianificare in anticipo funziona uguale. Una lezione gi non riceve mai una tecnica no-gi.',
          },
          {
            en: 'Nothing is pre-selected, and any suggestion can be waved away with one tap — for tonight, not forever.',
            it: 'Niente è preselezionato, e ogni proposta si scarta con un tocco: per stasera, non per sempre.',
          },
        ],
      },
      {
        heading: {
          en: '🥋 What each athlete has missed',
          it: '🥋 Cosa si è perso ogni atleta',
        },
        bullets: [
          {
            en: 'A new Programme tab on the athlete page: what they have seen, what they saw once, and what they missed, with how many chances they had at each.',
            it: 'Nuova scheda Programma sulla pagina atleta: cosa ha visto, cosa ha visto una volta, e cosa si è perso, con quante occasioni ha avuto per ognuno.',
          },
          {
            en: 'The percentage counts what the academy actually taught. Anything not covered yet is the academy’s gap, written separately, never theirs.',
            it: 'La percentuale conta quello che la palestra ha davvero insegnato. Quello che non è ancora stato fatto è una lacuna della palestra, scritta a parte, mai sua.',
          },
          {
            en: 'Nothing before the day they joined is counted, and sessions that do not say which class they were are stated rather than counted as absence.',
            it: 'Niente viene contato prima del giorno di iscrizione, e gli allenamenti che non dicono a quale lezione fossero vengono dichiarati, non contati come assenza.',
          },
        ],
      },
    ],
  },
  {
    version: 'v2.60.1',
    date: '2026-09-12',
    headline: {
      en: 'The numbers add up again.',
      it: 'I numeri tornano.',
    },
    sections: [
      {
        heading: {
          en: '📊 The programme chart counts the lessons you tagged',
          it: '📊 Il grafico del programma conta le lezioni che hai segnato',
        },
        bullets: [
          {
            en: 'Tagging a lesson now claims that day’s attendance, so a session full of people stops reading as never taught.',
            it: 'Segnare gli argomenti di una lezione adesso le assegna le presenze di quella giornata, così una lezione piena smette di risultare mai fatta.',
          },
          {
            en: 'Past lessons were repaired on update. There is nothing to redo by hand.',
            it: 'Le lezioni già passate sono state sistemate all’aggiornamento: non devi rifare niente a mano.',
          },
          {
            en: 'On a day with two different classes nothing is guessed — the attendance is left as it is.',
            it: 'Se una giornata aveva due lezioni diverse non si tira a indovinare: la presenza resta dov’è.',
          },
        ],
      },
      {
        heading: {
          en: '⏱️ Mat hours follow your timetable',
          it: '⏱️ Le ore di tatami seguono il tuo orario',
        },
        bullets: [
          {
            en: 'Three one-hour classes a week now read three hours, not four and a half. Every session counts what it really lasts.',
            it: 'Tre lezioni da un’ora a settimana adesso fanno tre ore, non quattro e mezza. Ogni allenamento vale quanto dura davvero.',
          },
          {
            en: 'The length is captured when the lesson happens, so shortening a class tomorrow never rewrites last March.',
            it: 'La durata viene fotografata quando la lezione si tiene, così accorciare una classe domani non riscrive marzo.',
          },
          {
            en: 'Train twice in one evening and it stays one session, but the hours count both classes.',
            it: 'Se ti alleni due volte la stessa sera resta un allenamento, ma le ore contano entrambe le lezioni.',
          },
        ],
      },
    ],
  },
  {
    version: 'v2.60.0',
    date: '2026-09-12',
    headline: {
      en: 'What you actually taught.',
      it: 'Cosa hai insegnato davvero.',
    },
    sections: [
      {
        heading: {
          en: '📝 Tag what each lesson covered',
          it: '📝 Segna cosa copre ogni lezione',
        },
        bullets: [
          {
            en: 'The check-in carries a new line under the day\'s class: the topics. One tap opens the programme and you tick what you did tonight. It is not three hundred names to scroll at the edge of the mat — it opens on three short groups: what you have already chosen, what you taught lately (teaching runs in blocks, so last Monday is very often tonight), and only then the programme, collapsed to its positions. Search runs across both levels at once: "guard" finds the position and everything under it.',
            it: "Nel check-in, sotto la lezione del giorno, c'è una riga nuova: gli argomenti. Un tocco e si apre il programma, e spunti quello che avete fatto stasera. Non è un elenco di trecento nomi da scorrere sul bordo del tatami: si apre su tre gruppi corti — quello che hai già scelto, quello che hai fatto di recente (l'insegnamento va a blocchi, quindi quello di lunedì scorso è spessissimo quello di stasera) e solo dopo il programma, chiuso sulle posizioni. E la ricerca cerca su tutti e due i livelli insieme: «guardia» ti trova la posizione e tutto quello che ci sta sotto.",
          },
          {
            en: 'You can tag a position on its own — "we worked half guard" is a real answer, and the app records it as one. There is room for free notes too ("Marco\'s first day back"); notes stay notes and never become topics.',
            it: "Puoi segnare una posizione da sola: «abbiamo lavorato mezza guardia» è una risposta vera, e l'app la registra come tale. C'è anche uno spazio per le note libere — «il primo giorno di Marco dopo lo stop». Le note restano note: non diventano mai argomenti.",
          },
        ],
      },
      {
        heading: {
          en: '🗓️ Plan ahead, and confirm nothing',
          it: '🗓️ Pianifica, e non devi confermare niente',
        },
        bullets: [
          {
            en: 'From the timetable, beside each class, a button opens the same sheet on the next time that class comes round. What you tick there is the plan. And there is nothing to confirm: the check-in IS the confirmation. A planned lesson nobody was marked present in stays a plan and never counts as taught, so the chart cannot report your intentions as facts. Did something else instead? Change the list afterwards — it is the same list.',
            it: "Dall'orario, accanto a ogni lezione, un bottone apre lo stesso foglio sulla prossima volta che quella lezione torna. Quello che segni lì è il piano. E non c'è niente da confermare: il check-in è la conferma. Una lezione pianificata in cui non hai segnato presente nessuno resta un piano e non conta come fatta, così il grafico non ti racconta le tue intenzioni al posto dei fatti. Avete fatto altro? Cambi la lista dopo: è la stessa lista.",
          },
        ],
      },
      {
        heading: {
          en: '📊 How much of the programme you have covered',
          it: '📊 Quanto del programma hai coperto',
        },
        bullets: [
          {
            en: 'Stats → Programme, and there is the question this all started from. Not one number but three states: covered (taught in at least two lessons), taught once (exactly one), and not taught (never, this year). Two lessons to call something covered, not one — doing a thing in September and considering it closed is exactly the self-deception this screen exists to prevent.',
            it: "Statistiche → Programma, ed ecco la domanda da cui è partito tutto. Non un numero solo, ma tre stati: coperto (fatto in almeno due lezioni), fatto una volta (esattamente una) e non fatto (mai, quest'anno). Due lezioni per dire «coperto», non una: fare una cosa a settembre e considerarla chiusa è esattamente l'autoinganno che questa schermata serve a evitare.",
          },
          {
            en: 'Below it: a bar per position — the primary view, because that axis shows the real gaps ("you have done nothing from half guard all year" is something you act on); coverage across the season, to see whether you are on pace or drifting; the blunt list of what is not taught yet, in programme order; and when each thing was last on the mat, with how long ago — the answer to "didn\'t I just do armbars?" that no notebook ever gave.',
            it: "Sotto: una barra per posizione — è la vista principale, perché è l'asse che fa vedere i buchi veri («da mezza guardia non hai fatto niente tutt'anno» è un'informazione su cui agisci); la copertura nel corso della stagione, per vedere se sei in linea o alla deriva; l'elenco secco di quello che non hai ancora fatto, in ordine di programma; e l'ultima volta che ogni cosa è stata sul tatami, con quanto tempo fa — la risposta a «ma gli armbar non li ho appena fatti?».",
          },
          {
            en: 'Gi and no-gi never mix: the filter narrows both what you did and what you were supposed to do. A count that mixes the two is quietly wrong, which is worse than no number. And with no programme yet you are not shown a 0% — you are told what to do.',
            it: 'Gi e no-gi non si mescolano mai: il filtro restringe sia quello che hai fatto sia quello che avresti dovuto fare. Un conteggio che mischia i due dà un numero sbagliato in silenzio, che è peggio di nessun numero. E se non hai ancora un programma non ti mostra uno 0%: ti dice cosa fare.',
          },
        ],
      },
    ],
  },
  {
    version: 'v2.59.0',
    date: '2026-09-12',
    headline: {
      en: 'The programme.',
      it: 'Il programma.',
    },
    sections: [
      {
        heading: {
          en: "📚 The academy's programme",
          it: "📚 Il programma dell'accademia",
        },
        bullets: [
          {
            en: 'From Academy → Programme you now keep the list of what you teach, by position: "Closed guard", and under it armbar, triangle, kimura, sweeps. Two levels and no more, because "armbar" on its own is not a syllabus entry — "armbar from closed guard" is. And it is the position that tells you the thing worth knowing: "you have done nothing from half guard all year" is information you act on; "few kimuras" is not.',
            it: "Da Accademia → Programma trovi l'elenco di quello che insegni, organizzato per posizione: «Guardia chiusa», e sotto armbar, triangolo, kimura, spazzate. Due livelli, non di più, perché «armbar» da solo non è una voce di programma — «armbar dalla guardia chiusa» sì. Ed è la posizione a dirti le cose che contano: «da mezza guardia non hai fatto niente tutt'anno» è un'informazione su cui si agisce, «pochi kimura» no.",
          },
          {
            en: 'You do not start from a blank page. One press on "Start from the BJJ programme" and a full syllabus is there — from the feet, down through the guards, into the pins, out through the escapes, the leg entanglements, the submission families, all the way to self-defence. Gi and no-gi, with whatever only makes sense in one of them already marked: heel hooks are no-gi, lapel guards are gi.',
            it: 'Non parti dal foglio bianco. Un tocco su «Parti dal programma BJJ» e ti trovi dentro un programma completo — dalla lotta in piedi, giù attraverso le guardie, dentro i controlli, fuori dalle uscite, le entrature di gamba, le famiglie di sottomissioni, fino alla difesa personale. Gi e no-gi, con le cose che valgono solo per uno dei due già marcate: gli heel hook sono no-gi, le guardie di bavero sono gi.',
          },
          {
            en: 'From then on it is yours. Rename it in your words, delete what you do not teach, add what is missing. It is not a taxonomy we impose on you: it is a starting point you own from the first minute.',
            it: 'Da lì in poi è tuo. Rinomina con le tue parole, cancella quello che non insegni, aggiungi quello che manca. Non è una tassonomia che ti imponiamo: è un punto di partenza che possiedi dal primo minuto.',
          },
        ],
      },
      {
        heading: {
          en: '✅ What is in season, and what is not',
          it: '✅ Cosa è in stagione, e cosa no',
        },
        bullets: [
          {
            en: "Every entry carries a tick: in season. It says which things are part of this year's programme — the number that, in the releases to come, how much you have actually covered will be measured against. Unticking a position unticks every technique under it: if you are not doing lapel guards this year, that is one tap, not four.",
            it: "Accanto a ogni voce c'è una spunta: in stagione. Serve a dire quali cose fanno parte del programma di quest'anno — il numero contro cui, nelle prossime versioni, si misurerà quanto ne hai effettivamente coperto. Togliere la spunta a una posizione la toglie a tutte le tecniche che contiene: se le guardie di bavero quest'anno non le fai, è un tocco solo, non quattro.",
          },
        ],
      },
      {
        heading: {
          en: '🎟️ Carnets: is one entry a lesson or a day?',
          it: '🎟️ Carnet: un ingresso è una lezione o un giorno?',
        },
        bullets: [
          {
            en: 'With a timetable an athlete can do fundamentals and stay for the open mat: two classes the same evening. Whether that is two entries or one depends on what you sell, and now you say so. In the academy settings, as soon as the carnet price and size are filled in, the question appears: does one entry cover a lesson or the whole day? The lesson is the default — what carnets have always meant here. Choose the day and a second class on a day already charged costs nothing more.',
            it: "Con l'orario, un atleta può fare i fondamentali e restare per l'open mat: due lezioni la stessa sera. Che siano due ingressi o uno dipende da cosa vendi, e ora glielo dici tu. Nelle impostazioni dell'accademia, appena hai compilato prezzo e numero di ingressi del carnet, compare la domanda: un ingresso copre una lezione o l'intera giornata? Di default è la lezione — quello che i carnet hanno sempre significato. Se scegli la giornata, la seconda lezione dello stesso giorno non costa niente in più.",
          },
          {
            en: "Changing the setting recounts every carnet you have already sold, straight away: the balance you see is always what the current rule produces, never a leftover of the old one. And where the balance is read — the athlete's card and their own page — the day rule says so, so a balance dropping by one after two check-ins is not a surprise.",
            it: "Cambiando l'impostazione ricontiamo tutti i carnet già venduti, subito: il saldo che vedi è sempre quello che la regola attuale produce, non un residuo di com'era prima. E dove il saldo si legge — sulla scheda dell'atleta e nella sua area personale — quando vale la regola «giornata» c'è scritto, così un saldo che scende di uno dopo due check-in non è una sorpresa.",
          },
        ],
      },
      {
        heading: {
          en: '🗓️ The training days come from the timetable',
          it: "🗓️ I giorni di allenamento li deriva l'orario",
        },
        bullets: [
          {
            en: 'While the timetable holds at least one class, the days your academy trains are no longer set by hand: they are the days you have a class on, and they follow along every time you add, move or remove one. In place of the seven pills, the settings now carry a line saying so and a link to the timetable. Remove the last class and the days stay where they were: a timetable taken down is not a claim that nobody trains any more.',
            it: "Finché l'orario ha almeno una lezione, i giorni in cui l'accademia si allena non si impostano più a mano: sono i giorni in cui hai lezione, e si aggiornano da soli ogni volta che ne aggiungi, sposti o togli una. Al posto delle sette pastiglie, nelle impostazioni trovi una riga che lo dice e un collegamento all'orario. Se togli l'ultima lezione, i giorni restano dov'erano: un orario smontato non è una dichiarazione che nessuno si allena più.",
          },
        ],
      },
      {
        heading: {
          en: '🔧 Fixed',
          it: '🔧 Sistemato',
        },
        bullets: [
          {
            en: 'The attendance card in the stats is now entirely in the language you are reading: the range picker stayed in English even in Italian, and switching language did not refresh it until you reloaded. It also said "lessons realized", which is not English — they are lessons held.',
            it: 'La scheda presenze nelle statistiche ora è tutta nella lingua che stai leggendo: prima il selettore del periodo restava in inglese anche in italiano, e cambiando lingua non si aggiornava finché non ricaricavi. Diceva anche «lezioni realizzate», che non è italiano: sono lezioni svolte.',
          },
          {
            en: 'The attendance heatmap scaled its shades against a fixed scale, so in many academies every cell came out the same colour and the chart said nothing. The scale now fits your own numbers, and a caption underneath says what each shade means.',
            it: "Il calendario delle presenze tarava le sue tonalità su una scala fissa, così in molte accademie tutte le caselle finivano dello stesso colore e il grafico non diceva niente. Ora la scala si adatta ai tuoi numeri, e sotto c'è scritto cosa vuol dire ogni tonalità.",
          },
        ],
      },
    ],
  },
  {
    version: 'v2.58.0',
    date: '2026-09-11',
    headline: {
      en: 'The timetable.',
      it: "L'orario.",
    },
    sections: [
      {
        heading: {
          en: '🗓️ The weekly timetable',
          it: "🗓️ L'orario settimanale",
        },
        bullets: [
          {
            en: 'Until now the app knew your training days — "Monday, Wednesday, Friday" — and nothing more. Kids at 17:00 and adults at 19:00 on the same Monday went into one bucket, and "who was at the kids\' class?" could not be asked. From Academy → Timetable you now write your classes down: a name, the day, the time, the length, and whether it is gi, no-gi or both. The week reads in one screen, one day per row; empty days are drawn empty on purpose, with a "+" beside them, so adding Thursday\'s class is three fields and a tap.',
            it: "Finora l'app conosceva i giorni di allenamento — «lunedì, mercoledì, venerdì» — e basta. Chi ha i bambini alle 17:00 e gli adulti alle 19:00 lo stesso lunedì aveva un unico calderone, e «chi c'era ai bambini?» non si poteva chiedere. Da Accademia → Orario ora scrivi le tue lezioni: nome, giorno, ora, durata e se è gi, no-gi o entrambi. La settimana si legge in una schermata, un giorno per riga; i giorni vuoti sono vuoti apposta, con un «+» accanto, così aggiungere la lezione del giovedì sono tre campi e un tocco.",
          },
          {
            en: 'None of it is mandatory. If you never open the timetable, the check-in works exactly as it did.',
            it: "Non è obbligatorio. Se non apri mai l'orario, il check-in funziona esattamente come prima.",
          },
        ],
      },
      {
        heading: {
          en: '✅ The check-in knows which class you are running',
          it: '✅ Il check-in sa quale lezione stai facendo',
        },
        bullets: [
          {
            en: 'With a timetable in place, the day\'s classes appear above the athlete list and the one nearest the clock is already selected: at 18:30 on a Monday you find "Fundamentals 19:00" on. Every tick lands in the right class. An athlete who does fundamentals and then stays for the open mat counts twice, because those are two classes — and a carnet spends two entries that evening, one per presence, the rule it always had.',
            it: "Con l'orario impostato, sopra l'elenco degli atleti compaiono le lezioni del giorno, e quella dell'ora è già selezionata: alle 18:30 di lunedì trovi accesa «Fondamentali 19:00». Ogni spunta finisce nella lezione giusta. Un atleta che fa fondamentali e poi resta per l'open mat conta due volte, perché sono due lezioni — e un carnet quella sera spende due ingressi, uno per presenza, la regola di sempre.",
          },
          {
            en: 'One class on the day means nothing to choose: it is simply named. No class on the day means the page you had before.',
            it: 'Una sola lezione nel giorno vuol dire niente da scegliere: te la mostra e basta. Nessuna lezione vuol dire la pagina di prima.',
          },
        ],
      },
      {
        heading: {
          en: '📜 The past stays as it was',
          it: "📜 Il passato resta com'era",
        },
        bullets: [
          {
            en: 'The attendance you have already recorded — thousands of rows, perhaps — stays "present on the day": we did not guess a class for any of it. Open a Monday from March in a class view and you still see who was there. Move or rename a class in the timetable and the evenings already held keep the name and time they had.',
            it: "Le presenze che hai già registrato — anche migliaia — restano «presenze nel giorno»: non gli abbiamo attribuito una lezione a caso. Apri un lunedì di marzo nella vista di una lezione e vedi comunque chi c'era. Sposta o rinomina una lezione nell'orario e le sere già fatte restano con il nome e l'ora che avevano.",
          },
          {
            en: "The timetable is the first piece of a series: the topics covered in each class, the year's programme, and a chart of how much of it you have taught. Each one stands on this.",
            it: "L'orario è il primo pezzo di una serie: gli argomenti trattati in ogni lezione, il programma dell'anno, e il grafico di quanto ne hai coperto. Ognuno si appoggia a questo.",
          },
        ],
      },
    ],
  },
  {
    version: 'v2.57.1',
    date: '2026-09-11',
    headline: {
      en: 'The numbers on the Stats screen.',
      it: 'I numeri delle statistiche.',
    },
    sections: [
      {
        heading: {
          en: '💶 The revenue chart said a number, never how much',
          it: '💶 Il grafico degli incassi diceva un numero, non diceva quanto',
        },
        bullets: [
          {
            en: 'Hovering a bar read `17.61`. Seventeen WHAT? The axis was just as silent — `0 2 4 … 18`, no symbol. The title said "Monthly revenue" and then every number on the chart declined to be money. The currency was never missing: the app received it from day one and rendered it nowhere. The axis now reads €2,500.00 and the bar under your cursor reads €17.61, with the symbol on the correct side and the right separator for your language.',
            it: "Passavi sopra una barra e leggeva «17.61». Diciassette cosa? L'asse era altrettanto muto: 0 2 4 … 18, senza simbolo. Il titolo diceva «Ricavi mensili» e poi ogni numero sul grafico si rifiutava di essere denaro. La valuta non mancava: il programma la riceveva dal primo giorno e non la scriveva da nessuna parte. Adesso l'asse dice €2.500,00 e la barra sotto il mouse dice €17,61 — con il simbolo dalla parte giusta e la virgola al posto giusto secondo la lingua.",
          },
        ],
      },
      {
        heading: {
          en: '📉 And that number was also wrong',
          it: '📉 E soprattutto: quel numero era anche sbagliato',
        },
        bullets: [
          {
            en: 'The chart spreads a fee across the months it covers — a €240 quarterly is €80 to September, €80 to October, €80 to November. That is right: otherwise anyone billing quarterly reads zero for two months in three. But the chart STOPPED at the current month, so October and November were not there and that €160 appeared on no bar at all. The last column — the only one anyone actually looks at — was always a fraction of what you took. With a carnet it was worse: sell a €70 twelve-month pack and September showed €5.87.',
            it: "Il grafico spalma ogni quota sui mesi che copre — un trimestrale da €240 vale €80 a settembre, €80 a ottobre, €80 a novembre. È giusto così: altrimenti chi paga a trimestre risulterebbe a zero due mesi su tre. Ma il grafico si fermava al mese corrente, quindi ottobre e novembre non c'erano e quei €160 non comparivano su nessuna barra. L'ultima colonna — l'unica che uno guarda davvero — era sempre una frazione di quello che avevi incassato. Con un carnet era peggio: ne vendevi uno da €70 valido un anno e a settembre comparivano €5,87.",
          },
          {
            en: 'The chart now reaches to the last month already paid for. A quarterly sold in September shows on September, October and November, and the bars add back up to what you actually took. Months past today are drawn lighter — that money is in the till but not yet earned. And carnets now land whole in the month you sell them: a pack is a lump sum, €70 in and €70 shown. The line under the chart says both rules, because they are two different ones on one picture and nobody can guess that.',
            it: "Da adesso il grafico arriva fino all'ultimo mese già pagato. Il trimestrale venduto a settembre si vede su settembre, ottobre e novembre, e la somma delle barre torna a essere quello che hai preso. I mesi oltre oggi sono più chiari: quei soldi li hai in cassa ma non li hai ancora maturati. E i carnet ora vanno interi nel mese in cui li vendi: entrano €70 e si vedono €70. Sotto il grafico c'è scritto, perché sono due regole diverse sullo stesso disegno e non si possono indovinare.",
          },
        ],
      },
      {
        heading: {
          en: '🎨 The attendance map',
          it: '🎨 La mappa delle presenze',
        },
        bullets: [
          {
            en: 'It used one colour per month — September pink, August red, July orange — under a "less → more" legend that was entirely blue. It taught you a scale the squares never used, except in January. The real problem was not the look: the colour said WHICH MONTH, which the axis above already spells out in words. So the chart\'s only visual channel was spent on something you already had, and "how busy was it" was left to the transparency. Across twelve months that was twelve different scales side by side. There is one scale now, pale to full, the same one the legend shows.',
            it: "Usava un colore per ogni mese — settembre rosa, agosto rosso, luglio arancione — con sotto una legenda «meno → più» tutta blu: ti spiegava una scala che i quadretti non usavano mai, tranne a gennaio. Il punto però non era l'estetica: il colore diceva quale mese, cosa che l'asse sopra già scrive a parole. Così l'unico strumento visivo del grafico era speso per un'informazione che avevi già, e «quanto si è allenato» finiva relegato alla trasparenza. Con dodici mesi erano dodici scale affiancate. Ora c'è una scala sola, dal chiaro al pieno, uguale a quella della legenda.",
          },
        ],
      },
    ],
  },
  {
    version: 'v2.57.0',
    date: '2026-09-11',
    headline: {
      en: 'Five things found by using it.',
      it: 'Cinque cose trovate usandola.',
    },
    sections: [
      {
        heading: {
          en: '👋 "Add your first athlete" — with 33 already on the mat',
          it: '👋 «Aggiungi il tuo primo atleta» — con 33 atleti in palestra',
        },
        bullets: [
          {
            en: 'You opened the athlete list and the whole first screen said "Getting started · 0 of 5 done — Add your first athlete". With 33 athletes, a year of attendance and a ledger of payments behind you. Those circles only ticked when you clicked them: no real action ever marked one. Create an athlete and "Add your first athlete" stayed exactly where it was, and the card stayed on the page until you closed it by hand.',
            it: "Aprivi l'elenco atleti e la prima schermata, tutta intera, diceva «Per cominciare · 0 di 5 fatti — Aggiungi il tuo primo atleta». Con 33 atleti, un anno di presenze e un registro di pagamenti alle spalle. Quei pallini si spuntavano solo cliccandoci sopra: nessuna azione vera li segnava. Creavi un atleta e «Aggiungi il tuo primo atleta» restava lì, e la scheda restava sulla pagina finché non la chiudevi a mano.",
          },
          {
            en: 'The list now looks at your gym: athletes on the roster, attendance recorded, payments taken — each one ticks itself. It works the same whether the data arrived through the app, a spreadsheet import or a restored backup, which is where it stung most. "Check your stats" still ticks by hand, because visiting a page leaves nothing to read back.',
            it: "Adesso la lista guarda la palestra: se hai atleti il passo è fatto, se hai presenze è fatto, se hai pagamenti è fatto. Vale anche se i dati sono entrati da un'importazione o da un backup ripristinato — che è poi il caso in cui dava più fastidio. «Guarda le statistiche» resta da spuntare a mano, perché una visita non lascia tracce da leggere.",
          },
        ],
      },
      {
        heading: {
          en: '📅 The dates that still spoke machine',
          it: '📅 Le date che parlavano ancora da macchina',
        },
        bullets: [
          {
            en: 'Last release said the app writes dates one way. Four were left. The clearest sat on one page four lines apart: "Joined 15 January 2022" above, and 2026-01-31 in the payments table below. The other three: the payment history the ATHLETE sees, the date on a cancelled document, and the worst one — the promotion card an athlete shares on social media, where 2026-05-23 was painted straight onto the image.',
            it: "Nel rilascio scorso avevamo detto che l'app scrive le date in un modo solo. Ne erano rimaste quattro. La più evidente stava sulla stessa pagina, a quattro righe di distanza: sopra «Iscritto il 15 gennaio 2022», sotto, nella tabella dei pagamenti, 2026-01-31. Le altre tre: la cronologia pagamenti che vede l'atleta, la data di un documento annullato, e — la peggiore — la card di promozione che l'atleta condivide sui social, dove 2026-05-23 veniva scritto direttamente sull'immagine.",
          },
          {
            en: "All four are written to be read now. With one care taken: the date stays the day the server recorded, not converted into the reader's timezone. A payment at 23:00 on 31 January stays the 31st rather than becoming 1 February.",
            it: "Ora sono tutte scritte per essere lette. Con un'attenzione: la data resta il giorno che il server ha registrato, non viene convertita nel fuso di chi guarda. Un pagamento delle 23:00 del 31 gennaio resta del 31, non diventa del 1° febbraio.",
          },
        ],
      },
      {
        heading: {
          en: '✅ How many are on the mat tonight',
          it: '✅ Quanti sono in palestra stasera',
        },
        bullets: [
          {
            en: 'The check-in never said. You ticked nineteen names out of thirty-three and then counted the ticks by eye, scrolling. The number is in the header now, beside the title — "Today\'s check-in · 29 present" — and follows the tally as you tick. Before anyone arrives it is not there: "0 present" is not information. On the phone the header stays put as you scroll, so the count comes with you.',
            it: "Il check-in non l'ha mai detto. Spuntavi diciannove nomi su trentatré e poi li contavi a occhio, scorrendo. Adesso il numero è nell'intestazione, accanto al titolo — «Check-in di oggi · 29 presenti» — e segue la conta mentre spunti. Prima che arrivi qualcuno non c'è: «0 presenti» non è un'informazione. Su telefono l'intestazione resta in cima mentre scorri, quindi il numero ti segue.",
          },
        ],
      },
      {
        heading: {
          en: '📊 The stats counted people who had left',
          it: "📊 Le statistiche contavano chi se n'era andato",
        },
        bullets: [
          {
            en: 'Stats said "Across 40 athletes", the athlete list said "33 total". The difference was the inactive ones, and neither screen said so. The number was the smaller half: the BELT DONUT was built from the same 40, so a chart called "Academy at a glance" showed a distribution inflated by people who had stopped training. Same for the age bands. Both now count only who actually trains, and the caption says which: "Across 33 active athletes".',
            it: "Stats diceva «Su 40 atleti», l'elenco atleti diceva «33 totali». La differenza erano gli atleti non più attivi, e nessuna delle due schermate lo diceva. Il guaio vero non era il numero: la ciambella delle cinture era costruita sugli stessi 40, quindi un grafico intitolato «L'accademia a colpo d'occhio» mostrava una distribuzione gonfiata da chi ha smesso. Stessa cosa per le fasce d'età. Ora entrambi contano solo chi si allena davvero, e la didascalia lo dice: «Su 33 atleti attivi».",
          },
        ],
      },
    ],
  },
  {
    version: 'v2.56.0',
    date: '2026-09-11',
    headline: {
      en: 'Names go back where they belong.',
      it: 'I nomi tornano al loro posto.',
    },
    sections: [
      {
        heading: {
          en: '🔤 "da Silva" is no longer at the bottom of the list',
          it: '🔤 «da Silva» non sta più in fondo alla lista',
        },
        bullets: [
          {
            en: 'If you have a da Silva, a dos Santos or a de Souza on the mat — and anyone doing jiu jitsu does — you found them at the bottom of every list. After Z. Every time. The app ordered names by comparing letters the way a computer sees them, where a lower-case "d" comes AFTER an upper-case "Z". Same thing one step further out for Ângelo, Núñez and Öztürk: an accented letter landed past the end of the alphabet.',
            it: "Se hai in palestra un da Silva, un dos Santos o un de Souza — e chi fa jiu jitsu ce l'ha — finora li trovavi in fondo a ogni elenco. Dopo la Z. Sempre. Il programma ordinava i nomi confrontando le lettere come le vede un computer, dove la «d» minuscola viene dopo la «Z» maiuscola. Stessa cosa, un gradino più in là, per Ângelo, Núñez e Öztürk: le lettere accentate finivano oltre la fine dell'alfabeto.",
          },
          {
            en: 'And searching did not work either. You typed "angelo" and nobody came up, because as far as the app was concerned Ângelo did not contain angelo. Not even typing Ângelo with the circumflex — which nobody does when they are looking for a person. Names now sort and match the way they READ: da Silva sits with the D surnames, "angelo" finds Ângelo, "muller" finds Müller.',
            it: "E cercarli non funzionava. Scrivevi «angelo» e non usciva nessuno, perché per il programma «Ângelo» non conteneva «angelo». Neanche scrivendo «Ângelo» con l'accento — che poi, chi lo scrive quando sta cercando una persona. Adesso i nomi si ordinano e si cercano come si leggono: «da Silva» sta tra i cognomi con la D, «angelo» trova «Ângelo», «muller» trova «Müller».",
          },
          {
            en: 'It applies everywhere a name appears: the athlete list, the check-in, the monthly summary, quick search, expiring certificates, the unpaid-fees reminder. And on the leaderboard, where the fault did worse damage — the board shows only the top five, so an Ângelo tied on sessions was not last, he was left off. The spreadsheet import noticed too: if your file spells him Angelo and the roster already has an Ângelo, it now recognises the same person instead of adding them twice.',
            it: "Vale ovunque compaia un nome: elenco atleti, check-in, riepilogo del mese, ricerca rapida, certificati in scadenza, promemoria delle quote non pagate. E in classifica, dove il difetto faceva un danno peggiore: la classifica mostra solo i primi cinque, quindi un «Ângelo» a pari merito non arrivava ultimo, veniva escluso. Anche l'importazione se n'è accorta: se il tuo foglio scrive «Angelo» senza accento e in palestra hai già un «Ângelo», ora riconosce che è la stessa persona invece di aggiungerla due volte.",
          },
        ],
      },
      {
        heading: {
          en: '✅ The check-in sorts the way the athlete list sorts',
          it: "✅ Il check-in si ordina come l'elenco atleti",
        },
        bullets: [
          {
            en: 'The two screens show the same people and put them in two different orders. The athlete list has had a Belt button for a while, and a Full name header that changes the ordering each time you click it — by first name, then by surname, forwards and back. The check-in had neither: a different, poorer sort on the header, and no way to order by belt at all.',
            it: "Le due schermate mostrano le stesse persone, e le mettevano in ordine in due modi diversi. Sull'elenco atleti c'è da tempo il bottone «Cintura» e l'intestazione «Nome e cognome» che a ogni clic cambia ordinamento — prima per nome, poi per cognome, avanti e indietro. Sul check-in non c'era nessuna delle due: l'intestazione aveva un ordinamento diverso e più povero, e per cintura non si poteva ordinare affatto.",
          },
          {
            en: 'Both are there now, identical, in the same place — and the check-in opens sorted by belt, highest first, the way the athlete list does. The Belt button sits in the filter row rather than inside the table, so it works on the phone too, where there is no table and you see cards.',
            it: "Ora ci sono entrambe, identiche, nello stesso posto — e il check-in si apre ordinato per cintura, dalla più alta, come fa l'elenco atleti. Il bottone Cintura sta nella riga dei filtri e non dentro la tabella, così funziona anche da telefono, dove la tabella non c'è e si vedono le schede.",
          },
        ],
      },
      {
        heading: {
          en: '📊 The monthly summary can be turned around',
          it: '📊 Il riepilogo mensile si può girare',
        },
        bullets: [
          {
            en: 'The summary table listed everyone by attendance, most first. Useful — but that is one question, and the page is opened for the opposite one too: who has stopped coming. Both columns, Athlete and Days, now sort when you click them, and a button beside the filter flips the day order — that one works on the phone as well.',
            it: "La tabella del riepilogo mostrava tutti in ordine di presenze, dalle più alte. Utile — ma è una domanda sola, e quella pagina si apre anche per l'opposto: chi ha smesso di venire. Adesso entrambe le colonne, «Atleta» e «Giorni», si ordinano cliccandoci sopra, e un bottone accanto al filtro inverte l'ordine dei giorni — quello funziona anche da telefono.",
          },
        ],
      },
    ],
  },
  {
    version: 'v2.55.1',
    date: '2026-09-10',
    headline: {
      en: 'Dates, tables, and ten things seen with fresh eyes.',
      it: 'Le date, le tabelle, e dieci cose viste con occhi nuovi.',
    },
    sections: [
      {
        heading: {
          en: '📅 Dates you can read, in your language',
          it: '📅 Le date si leggono, e parlano la tua lingua',
        },
        bullets: [
          {
            en: "The app wrote dates THREE different ways. Editing an athlete you saw their joining date as 2024-09-01; recording that same person's belt one click away it became 01/09/2024. Same person, same session, two formats — and one of them a machine format nobody writes by hand. Neither followed the language either: you switched the app to Italian and every word changed except the dates.",
            it: "L'app scriveva le date in tre modi diversi. Modificando la scheda di un atleta la data di iscrizione appariva come 2024-09-01; registrando la cintura di quella stessa persona, un clic più in là, diventava 01/09/2024. Stessa persona, stessa sessione, due formati — e uno dei due è un formato da macchina che nessuno scrive a mano. E nessuno dei due seguiva la lingua: passavi l'app in italiano e cambiavano tutte le parole tranne le date.",
          },
          {
            en: 'One format now, and it follows the language. Where a date is text you read — under an athlete\'s name — it is spelled out: "Joined 1 September 2024", not 2024-09-01.',
            it: "Adesso c'è un formato solo, e segue la lingua. Dove la data è un testo da leggere — sotto il nome dell'atleta — è scritta per esteso: «Iscritta il 1 settembre 2024», non 2024-09-01.",
          },
        ],
      },
      {
        heading: {
          en: "🗂️ The athlete's page starts with what you came for",
          it: "🗂️ La scheda dell'atleta parte da quello che sei venuto a vedere",
        },
        bullets: [
          {
            en: 'You clicked Documents and the documents were off-screen. Above the tabs sat three panels — invitation, email, photo — taking the first two thirds of the page. Those are things you do ONCE, when you create the athlete. The tabs answer the weekly questions: has the certificate expired, have they paid, when did they last train. The page was ordered by how permanent the information is, not by how often it is needed. The three panels live under Edit now, with every other editable field, and the tabs sit right under the name.',
            it: "Cliccavi Documenti e i documenti erano fuori schermo. Sopra le linguette c'erano tre riquadri — invito, email, foto — che occupavano i primi due terzi della pagina. Sono cose che si fanno una volta, quando crei l'atleta. Le linguette invece rispondono alle domande di ogni settimana: il certificato è scaduto? ha pagato? quando si è allenato l'ultima volta? La pagina era ordinata per quanto un'informazione è permanente, non per quanto spesso serve. Ora i tre riquadri stanno sotto «Modifica», insieme a tutti gli altri campi modificabili, e le linguette sono subito sotto il nome.",
          },
        ],
      },
      {
        heading: { en: "🏫 Your gym's name", it: '🏫 Il nome della tua palestra' },
        bullets: [
          {
            en: 'In the left bar it was cut in half — "Gracie Barra T…". Academy names are almost always shaped that way, a brand plus a city, so the part that got cut was the part saying WHICH one. It wraps now and you can read all of it. On the phone it was not there at all: the top bar said "Budojo". It says your gym\'s name now — the mark beside it already says which program you are using.',
            it: "Nella barra a sinistra era tagliato a metà: «Gracie Barra T…». E i nomi delle accademie sono quasi sempre fatti così — un marchio più una città — quindi la parte tagliata era proprio quella che dice quale. Ora va a capo e si legge tutto. Sul telefono non c'era per niente: la barra in alto diceva «Budojo». Adesso dice il nome della tua palestra — il simbolo accanto basta già a dire quale programma stai usando.",
          },
        ],
      },
      {
        heading: {
          en: '🔍 Five icons on the phone were a riddle',
          it: '🔍 Cinque icone sul telefono erano un indovinello',
        },
        bullets: [
          {
            en: 'Above the athlete list were five unlabelled buttons: funnel, sort, triangle, crossed-out eye, bin. Two of them — "show hidden" and "show deleted" — are things you do rarely and on purpose, but they sat there at the same weight as the sort you use every time you open the app. Those two moved into the filter panel, where they are WORDS: "Show deleted athletes" is a sentence, a bin is a puzzle. Three left in the bar.',
            it: "Sopra la lista atleti c'erano cinque pulsanti tutti senza etichetta: imbuto, ordinamento, triangolo, occhio sbarrato, cestino. Due di quelli — «mostra nascosti» e «mostra eliminati» — sono cose che si fanno di rado e di proposito, ma stavano lì con lo stesso peso dell'ordinamento che usi ogni volta che apri l'app. Quei due sono passati dentro il pannello dei filtri, dove sono parole: «Mostra atleti eliminati» è una frase, un cestino è un enigma. In barra ne restano tre.",
          },
        ],
      },
      {
        heading: {
          en: '📋 Every table spells its headers the same way',
          it: '📋 Le tabelle si scrivono tutte allo stesso modo',
        },
        bullets: [
          {
            en: "The daily check-in table's header said FULL NAME in capitals; the athlete list said Full name. Same column, same product, one click apart — and the difference came only from how the two tables happened to be built inside. They match now.",
            it: "L'intestazione della tabella del check-in giornaliero diceva «FULL NAME» in maiuscolo; quella della lista atleti «Full name». Stessa colonna, stesso prodotto, un clic di distanza — e la differenza dipendeva solo da come le due tabelle erano costruite dentro. Ora sono uguali.",
          },
        ],
      },
      {
        heading: {
          en: '⚠️ "Try again" now has a button',
          it: '⚠️ «Riprova» adesso ha un pulsante',
        },
        bullets: [
          {
            en: 'When notifications failed to load you got four grey words: "Couldn\'t load your notifications. Try again." And there was nothing to press — the only way was reloading the page, if you thought of it. There is a proper block now, with an icon, an explanation and a Try again button that retries in place.',
            it: "Quando le notifiche non si caricavano comparivano quattro parole grigie: «Non siamo riusciti a caricare le notifiche. Riprova.» E non c'era niente da premere: l'unico modo era ricaricare la pagina, sapendo di doverlo fare. Ora c'è un riquadro con l'icona, la spiegazione e un pulsante Riprova che ritenta lì, senza ricaricare niente.",
          },
        ],
      },
      {
        heading: {
          en: '🏫 The academy shows what you can set',
          it: "🏫 L'accademia mostra quello che puoi impostare",
        },
        bullets: [
          {
            en: 'The academy page was missing the training days and the season — two things you set in the form and then could not see anywhere. The season matters more than it looks: it is the denominator of the attendance number you read every day, so when a fraction looks odd, "what is it counting?" had no answer.',
            it: "Nella scheda dell'accademia mancavano i giorni di allenamento e la stagione — due cose che imposti nel modulo e che poi non si vedevano da nessuna parte. La stagione conta più di quanto sembri: è il denominatore del numero delle presenze che leggi ogni giorno, quindi quando una frazione ti sembra strana, la domanda «ma cosa sta contando?» non aveva risposta.",
          },
        ],
      },
      {
        heading: {
          en: '🎨 Two buttons that shouted too loudly',
          it: '🎨 Due bottoni che gridavano troppo',
        },
        bullets: [
          {
            en: '"Upload photo" was the brightest control on the athlete page, while "Invite to the system" — which gives a person an account and a password — was the dimmest. The hierarchy is the right way round now.',
            it: '«Carica foto» era il pulsante più acceso della scheda atleta, mentre «Invita nel sistema» — che dà a una persona un account e una password — era il più spento. Ora la gerarchia è quella giusta.',
          },
        ],
      },
      {
        heading: {
          en: '🍪 No cookie banner on your own computer',
          it: '🍪 Niente banner dei cookie sul tuo computer',
        },
        bullets: [
          {
            en: 'Straight after installing, the first thing you saw was not the welcome — it was a cookie consent request. On a program that runs only on your machine, with no network, no analytics and no third parties at all; and on the phone it covered all three of the get-started steps. It is gone. It stays on the web version, where it makes sense.',
            it: "Appena installato, la prima cosa che vedevi non era il benvenuto: era una richiesta di consenso sui cookie. Su un programma che gira solo sulla tua macchina, senza rete, senza analytics e senza nessuna terza parte — e sul telefono copriva tutti e tre i passi per iniziare. Non c'è più. Resta sulla versione web, dove ha senso.",
          },
        ],
      },
      {
        heading: { en: '🔧 And an invisible tidy-up', it: '🔧 E una pulizia invisibile' },
        bullets: [
          {
            en: 'A styling class used in 37 places did nothing in 26 of them. What you could see: inside the "Add a past promotion" window the dropdowns were all different widths, each as wide as the longest word it held. They are one column now.',
            it: "Una classe usata in 37 punti dell'app non faceva niente in 26 di quelli. Il risultato visibile: dentro la finestra «Aggiungi una promozione passata» i menu a tendina erano tutti di larghezze diverse, ognuno largo quanto la parola più lunga che conteneva. Ora sono una colonna sola.",
          },
        ],
      },
    ],
  },
  {
    version: 'v2.55.0',
    date: '2026-09-10',
    headline: {
      en: 'The first thing you see, and a way to write to us.',
      it: 'La prima schermata, e un modo per scriverci.',
    },
    sections: [
      {
        heading: {
          en: '👋 When you open Budojo for the first time',
          it: '👋 Quando apri Budojo la prima volta',
        },
        bullets: [
          {
            en: 'Until now a fresh install opened on the SIGN-IN form — email and password. The trouble is that on a first launch you do not have a password: you do not have an account yet. The link to create one was there, at the bottom, in small type.',
            it: "Finora, appena installato, Budojo ti apriva il modulo di accesso: email e password. Il problema è che al primo avvio una password non ce l'hai — non hai ancora nessun account. Il collegamento per crearne uno c'era, in fondo, in piccolo.",
          },
          {
            en: 'The first screen is a welcome now: what this program is, one button to create your academy, and the three things to do first — create the account, set up the academy, add the first athlete. Coming back after signing out, "I already have an account" sits right beside it.',
            it: "Adesso la prima schermata è un benvenuto: cosa fa questo programma, un bottone per creare la tua accademia, e i tre passi per iniziare — crea l'account, imposta l'accademia, aggiungi il primo atleta. Chi rientra dopo essere uscito trova «Ho già un account» proprio lì accanto.",
          },
          {
            en: 'That screen used to be an advertisement, written when Budojo ran on the internet. It said things that stopped being true: that it installs on iPhone and Android, that it updates itself on your phone, that there is a form inside the app to write to us. There is no phone version, and that form had been removed because it did not work. Who was seeing it? Nobody — the desktop skipped past it and the website is gone. That is how it drifted without anyone noticing.',
            it: "Quella schermata prima era una pagina pubblicitaria, scritta quando Budojo girava su internet. Diceva cose che non sono più vere: che si installa su iPhone e Android, che si aggiorna da solo sul telefono, che c'è un modulo dentro l'app per scriverci. Non c'è nessuna versione per telefono, e quel modulo era stato tolto perché non funzionava. Chi la vedeva? Nessuno: sul desktop veniva saltata, e il sito non esiste più. È così che era rimasta indietro senza che nessuno se ne accorgesse.",
          },
        ],
      },
      {
        heading: {
          en: '✉️ A way to write to us that actually works',
          it: '✉️ Un modo per scriverci che funziona davvero',
        },
        bullets: [
          {
            en: 'Under More, "Contact support" had disappeared. It was removed for an honest reason: the form accepted your message, told you it was sent, and sent it to nobody — the program on your computer has no way to post email.',
            it: 'Sotto «Altro» era sparita la voce «Contatta il supporto». Era stata tolta per un motivo onesto: il modulo accettava il messaggio, ti diceva «inviato», e non lo mandava a nessuno — il programma sul tuo computer non ha modo di spedire email.',
          },
          {
            en: 'It is back, and it opens YOUR mail program with the address already filled in and, in the body, the version of Budojo and the system you are on. Delete them if you would rather not send them. It works offline too: the message goes out when you are back online.',
            it: "Adesso la voce c'è di nuovo, e apre il tuo programma di posta con l'indirizzo già scritto e, nel corpo del messaggio, la versione di Budojo e il sistema che stai usando. Puoi cancellarli se preferisci non mandarli. Funziona anche senza internet: il messaggio parte quando torni in linea.",
          },
          {
            en: 'The address is written next to the row, so if your computer has no mail program set up you can copy it anyway.',
            it: "L'indirizzo è scritto accanto alla voce, così se il tuo computer non ha un programma di posta configurato puoi comunque copiarlo.",
          },
        ],
      },
      {
        heading: {
          en: "📝 The athlete's form, below the fold",
          it: "📝 La scheda dell'atleta, sotto la piega",
        },
        bullets: [
          {
            en: '"Billing" is no longer a section of its own. It was a heading spent on one control — two if you keep a price list. What an athlete pays is a fact about their membership, not a chapter apart: it sits under "At the gym" now, with the belt, the status and the joining date. One less section to scroll.',
            it: '«Fatturazione» non è più una sezione a sé. Era un titolo speso per un controllo solo — due se hai un listino prezzi. Quanto paga un atleta è un fatto della sua permanenza in palestra, non un capitolo a parte: adesso sta sotto «In palestra», insieme a cintura, stato e data di iscrizione. Una sezione in meno da scorrere.',
          },
          {
            en: 'The fields have widths that explain themselves. Before, how wide a field was depended on how many other fields shared its row: a box for a date could be as wide as a surname, and two dates in different parts of the form came out different widths. Now each field is as wide as what it holds — short for dates and counts, medium for names and menus, full for emails and addresses. The rows line up, and you can see why.',
            it: "I campi hanno larghezze che si spiegano. Prima la larghezza di un campo dipendeva da quanti altri campi c'erano sulla stessa riga: una casella per una data poteva essere larga quanto un cognome, e due date in punti diversi della scheda venivano larghe diverse. Ora ogni campo è largo quanto serve a quello che contiene — corto per date e numeri, medio per nomi e menu, pieno per email e indirizzi. Le righe si allineano, e la ragione si vede.",
          },
          {
            en: 'Nothing changes on the phone: there the fields take the whole row, as before.',
            it: 'Sul telefono nessun cambiamento: lì i campi occupano tutta la riga, come prima.',
          },
        ],
      },
    ],
  },
  {
    version: 'v2.54.0',
    date: '2026-09-09',
    headline: {
      en: 'The season — and the roster stops counting forever.',
      it: 'La stagione — e la lista atleti smette di contare per sempre.',
    },
    sections: [
      {
        heading: {
          en: '📅 Sessions are counted per season now, not since someone joined',
          it: '📅 Le presenze si contano per stagione, non da quando uno si è iscritto',
        },
        bullets: [
          {
            en: 'The lower number in the Sessions column counted EVERY session since the day that athlete joined. It looks like the fuller answer and it is the one that says least: 1204 never gets smaller, so it stops telling you anything long before anyone notices. And two athletes who joined five years apart cannot be compared on it — in March the question is how THIS year is going, and the answer arrived spread over three of them.',
            it: "Il numero in basso della colonna «Sessioni» contava tutte le presenze dal giorno dell'iscrizione. Sembra l'informazione più completa, ed è quella che dice di meno: 1204 non diventa mai più piccolo, quindi smette di raccontare qualcosa molto prima che uno se ne accorga. E due atleti iscritti a cinque anni di distanza non sono confrontabili su quel numero: a marzo la domanda è come sta andando quest'anno, e la risposta arrivava spalmata su tre.",
          },
          {
            en: 'There is a new field in the academy settings — Season starts in. Pick the month your training year restarts. Leave it alone and it is September, which is when the year restarts in almost every gym. A month and not a full date: a season starts on the first of a month, always, and offering "14 September" would be a second box to fill in and a rule — "sessions on the 12th belong to last year" — that helps nobody.',
            it: "Nelle impostazioni dell'accademia c'è un campo nuovo: «La stagione inizia a». Scegli il mese in cui riparte il tuo anno di allenamenti. Se non lo tocchi vale settembre, che è quando ricomincia l'anno nella quasi totalità delle palestre. Un mese e non una data intera: la stagione riparte il primo del mese, sempre, e offrire «14 settembre» avrebbe voluto dire un secondo campo da compilare e una regola — «le presenze del 12 valgono l'anno scorso» — che non serve a nessuno.",
          },
          {
            en: "Nobody who joined mid-season is penalised for it. Their count starts the day they arrived, not the day the season opened: someone who walks in during November could not have been at September's classes, and measuring them against the whole season reports the gym's calendar as if it were their record. Hover the number and it says so in full — which season it is, and the day the counting starts for that person.",
            it: "Chi si è iscritto a stagione già iniziata non viene penalizzato. Il suo conteggio parte dal giorno in cui è arrivato, non dall'inizio della stagione: chi entra a novembre non poteva esserci a settembre, e misurarlo su tutta la stagione racconta il calendario della palestra come se fosse il suo. Passandoci sopra il mouse te lo dice per esteso: quale stagione è, e da che giorno si conta per quella persona.",
          },
        ],
      },
      {
        heading: {
          en: "🥋 The gym's logo arrives whole",
          it: '🥋 Il logo della palestra arriva intero',
        },
        bullets: [
          {
            en: "It was wrong twice, in opposite directions. It started as a 28-pixel image with no cropping rule at all, so any logo that was not square arrived SQUASHED — and gym logos are nearly always wide. Last release stopped the squashing by CROPPING instead, which for a logo is the wrong half of the trade: cropping a badge cuts a piece off someone's identity. You see all of it now, letterboxed inside its square.",
            it: "Era sbagliato due volte, in direzioni opposte. All'inizio era un'immagine da 28 pixel senza nessuna regola di ritaglio, quindi qualsiasi logo non quadrato arrivava schiacciato — e i loghi delle palestre sono quasi sempre larghi. Il rilascio scorso ha smesso di schiacciarlo tagliandolo, che per un logo è la metà sbagliata dello scambio: tagliare un fregio significa tagliare via un pezzo dell'identità di qualcuno. Adesso si vede tutto, riquadrato dentro il suo spazio.",
          },
        ],
      },
      {
        heading: {
          en: '⚠️ The alert bell looks like an alert when there is one',
          it: "⚠️ Il campanello degli avvisi si vede quando c'è qualcosa",
        },
        bullets: [
          {
            en: 'The alert icon above the roster was the same muted grey as the eye and the bin next to it. A warning that looks like every other control is not a warning. It is amber now when there is something to look at — and when there is not, it STAYS PUT in grey rather than disappearing: vanishing shifted the whole run of controls sideways the moment you filed the last certificate, and left nowhere to look to confirm that nothing is wrong.',
            it: "L'icona degli avvisi, sopra la lista atleti, era dello stesso grigio spento dell'occhio e del cestino accanto. Un avviso che ha lo stesso aspetto di ogni altro comando non è un avviso. Ora è ambra quando c'è qualcosa da guardare, e quando non c'è niente resta al suo posto in grigio invece di sparire: sparendo spostava di lato tutta la fila di comandi nel momento in cui archiviavi l'ultimo certificato, e non lasciava nessun posto dove guardare per confermare che va tutto bene.",
          },
        ],
      },
      {
        heading: { en: "📰 What's new was in two places", it: '📰 «Novità» stava in due posti' },
        bullets: [
          {
            en: 'It was in the left rail AND under More. The same entry twice: the one under More is gone.',
            it: "Era nella barra a sinistra e sotto «Altro». La stessa voce due volte: quella sotto «Altro» non c'è più.",
          },
        ],
      },
      {
        heading: {
          en: '📝 The athlete form, below the fold',
          it: '📝 La scheda atleta, sotto la piega',
        },
        bullets: [
          {
            en: 'The edit form had been reorganised into four sections, but the reorganisation stopped halfway down the page. The address kept a heading of its own — bold, with "(optional — fill all marked fields or none)" on the same line — sitting four inches under four small uppercase ones. The same words in two different voices a few centimetres apart, so it read as a second form pasted underneath. It wears the same small heading as the others now, with the note on the line below.',
            it: "La modifica dell'atleta era stata riorganizzata in quattro sezioni, ma la riorganizzazione si fermava a metà pagina. L'indirizzo aveva un titolo tutto suo — in grassetto, con «(facoltativo — compila tutti i campi contrassegnati o nessuno)» sulla stessa riga — quattro dita sotto quattro titolini in maiuscolo. Le stesse parole con due voci diverse a pochi centimetri l'una dall'altra: si leggeva come un secondo modulo incollato sotto al primo. Ora porta lo stesso titolino degli altri, e la nota sta sulla riga sotto.",
          },
          {
            en: 'ZIP, city and province shared a row that lined up with nothing above it and stretched the full width of the card, leaving a five-character postcode alone at one end. They are sized to their contents now and grouped at the start.',
            it: "CAP, città e provincia stavano su una riga che non si allineava a niente e si allargava per tutta la scheda, lasciando un CAP di cinque cifre da solo a un capo. Adesso sono larghi quanto serve e raggruppati all'inizio.",
          },
          {
            en: 'The Delete athlete button sat at the opposite end of its row from the text explaining it — two unrelated things sharing a line. On a narrow screen it was a small button floating under two lines of grey. The text keeps a readable width now and the button follows it; on a phone it takes the whole row.',
            it: "Il bottone «Elimina atleta» era spinto all'estremità opposta della riga rispetto al testo che lo spiega: due cose senza rapporto che si dividono una riga. Su schermo stretto era un bottoncino che galleggiava sotto due righe di grigio. Ora il testo tiene una larghezza leggibile e il bottone lo segue; sul telefono prende la riga intera.",
          },
        ],
      },
    ],
  },
  {
    version: 'v2.53.0',
    date: '2026-09-08',
    headline: {
      en: 'The sidebar, and five things that were not working.',
      it: 'La barra laterale, e cinque cose che non funzionavano.',
    },
    sections: [
      {
        heading: {
          en: '🧭 The left rail, reordered',
          it: '🧭 La barra a sinistra, rimessa in ordine',
        },
        bullets: [
          {
            en: 'The Create button is gone. It promised to make something, and half of what it offered was a place to go — marking attendance is not a thing you create. Everything behind it is reachable from the section it belongs to, where the context already is. The phone keeps its ➕: a bottom bar has no sections to start from.',
            it: "Via il bottone «Crea». Prometteva di creare qualcosa, e metà di quello che offriva era un posto dove andare — segnare le presenze non è una cosa che crei. Tutto quello che c'era dietro si raggiunge dalla sezione a cui appartiene, dove il contesto ce l'hai già. Sul telefono il ➕ resta: lì non ci sono sezioni da cui partire.",
          },
          {
            en: 'Stats moves up into the rail — it was under More because the phone bar holds five items beside the ➕ and was already at five, a phone constraint applied to a column that has the room. Attendance was in the rail AND under More; one is enough.',
            it: 'Stats sale nella barra: stava sotto «Altro» perché la barra del telefono tiene cinque voci più il ➕ ed era già a cinque, un vincolo del telefono applicato a una colonna che di spazio ne ha. Presenze era nella barra e sotto «Altro»: uno basta.',
          },
          {
            en: "What's new and Notifications move to the bottom, just above your photo. They are about what the app has to say to YOU, not about the gym you run — they belong next to the person, which is where every app you use has trained you to look. Notifications was sitting between Attendance and More.",
            it: "Novità e Notifiche scendono in fondo, subito sopra la tua foto. Parlano di quello che l'app ha da dire a te, non della palestra che gestisci: stanno vicino alla persona, che è dove ogni app che usi ti ha abituato a cercarle. Le notifiche stavano fra «Presenze» e «Altro».",
          },
          {
            en: "The gym's logo no longer arrives squashed. It was a 28px image with no cropping, so any logo that was not square got distorted — and gym logos are almost always wide.",
            it: "Il logo della palestra non si deforma più. Era un'immagine da 28px senza ritaglio, quindi qualsiasi logo non quadrato arrivava schiacciato — e i loghi delle palestre sono quasi sempre larghi.",
          },
        ],
      },
      {
        heading: { en: '📰 Ten releases at a time', it: '📰 Le novità, dieci per volta' },
        bullets: [
          {
            en: 'This page showed all 95 releases at once, and a new one arrives every few days. What you came to read ended up at the top of a very long page with everything else underneath it. It opens on ten now, with a button that loads ten more and goes away when the history runs out.',
            it: 'Questa pagina mostrava tutti i 95 rilasci in una volta, e ne arriva uno ogni pochi giorni. Quello che eri venuto a leggere finiva in cima a una pagina lunghissima con tutto il resto sotto. Adesso si apre su dieci, con un pulsante che ne carica altri dieci e sparisce quando la storia finisce.',
          },
        ],
      },
      {
        heading: {
          en: '🩹 Five things that were not working',
          it: '🩹 Cinque cose che non funzionavano',
        },
        bullets: [
          {
            en: 'A new check compares every screen against its stylesheet and finds two opposite mistakes: a class no rule draws, and a rule no element wears. Neither shows up in a test — the page is there, it just is not what it should be. It found five real ones.',
            it: 'Un controllo nuovo confronta ogni schermata con il suo foglio di stile e trova due errori opposti: una classe che nessuna regola disegna, e una regola che nessun elemento indossa. Nessuno dei due si vede in un test — la pagina esiste, semplicemente non è come dovrebbe. Ne ha trovate cinque vere.',
          },
          {
            en: 'On the Backup page, text meant only for screen-reader users was VISIBLE — it appeared in plain sight next to the icon it was describing.',
            it: "Nella pagina Backup, il testo pensato per chi usa un lettore di schermo era VISIBILE: compariva in chiaro accanto all'icona che doveva descrivere.",
          },
          {
            en: 'Academy and Statistics had no spacing between their blocks. In May the vertical rhythm of those two pages was moved into a container that was never added to the page itself, so every card has sat flush against the next since.',
            it: 'Academy e Statistiche non avevano spaziatura fra i blocchi. A maggio il ritmo verticale di quelle due pagine era stato spostato in un contenitore che nella pagina non è mai stato aggiunto: da allora ogni riquadro stava attaccato al successivo.',
          },
          {
            en: 'In Attendance the search field did not grow — it stayed at its minimum width instead of taking the free space. And in two-factor verification, error messages were plain text instead of red.',
            it: 'Nelle Presenze il campo di ricerca non si allargava: restava della sua misura minima invece di prendere lo spazio libero. E nella verifica in due passaggi, i messaggi di errore erano testo normale invece che rossi.',
          },
        ],
      },
      {
        heading: {
          en: '📬 The support form, where it could not work',
          it: '📬 Il modulo di assistenza, dove non poteva funzionare',
        },
        bullets: [
          {
            en: 'The "Contact support" form accepted your message, wrote it to the local database, queued an email this build cannot send, and told you it was sent. Nobody was ever going to read it. It is hidden for now — having no way to write to us is honest, having one that swallows the message is not. The right channel comes in a future release.',
            it: "Il form «Contatta l'assistenza» accettava il messaggio, lo scriveva nel database locale, metteva in coda una mail che questa versione non può spedire, e ti diceva «inviato». Nessuno l'avrebbe mai letto. Per ora è nascosto: non avere un modo per scriverci è onesto, averne uno che si mangia il messaggio no. Il canale giusto arriva in un prossimo rilascio.",
          },
        ],
      },
    ],
  },
  {
    version: 'v2.52.0',
    date: '2026-09-08',
    headline: {
      en: 'Attendance you can read, a roster that opens on rank.',
      it: 'Le presenze si leggono, la lista si apre dalla cintura.',
    },
    sections: [
      {
        heading: {
          en: '📅 Sessions become a fraction',
          it: '📅 Le presenze diventano una frazione',
        },
        bullets: [
          {
            en: 'The Sessions column showed two numbers in a row — 3 · 3 — which read as the same number written twice, and neither said out of how many. They are two stacked fractions now: 3/6 this month, 214/920 since they joined. Three sessions means nothing until you know whether there were three classes or twelve. Hovering either line says which period it covers.',
            it: "La colonna Presenze mostrava due numeri di fila — 3 · 3 — che si leggevano come lo stesso numero scritto due volte, e nessuno dei due diceva su quante. Adesso sono due frazioni, una sopra l'altra: 3/6 questo mese, 214/920 da quando è iscritto. Tre presenze non vogliono dire niente finché non sai se le lezioni erano tre o dodici. Passando il mouse su ciascuna riga c'è scritto quale periodo copre.",
          },
          {
            en: 'The total is measured from when THAT athlete joined, not from when the gym started. Otherwise someone who signs up in September and comes to every class reads 1/540 — a number about the gym, presented as if it were about them. With no training days configured in Academy the plain counts stay, since there is no denominator to divide by.',
            it: "Il totale è misurato da quando quell'atleta si è iscritto, non da quando esiste la palestra. Altrimenti chi si iscrive a settembre e viene a tutte le lezioni legge 1/540: un numero sulla palestra, presentato come se parlasse di lui. Se non hai impostato i giorni di allenamento in Academy restano i numeri semplici, perché non c'è denominatore.",
          },
          {
            en: 'The Attendance panel at the top of the roster is gone: it said the same thing for the top five athletes that the column now says for everyone, in less detail.',
            it: 'È sparito il riquadro Presenze in alto: diceva la stessa cosa per i primi cinque atleti che ora la colonna dice per tutti, con meno dettaglio.',
          },
        ],
      },
      {
        heading: { en: '⚠️ Alerts become a button', it: '⚠️ Gli avvisi diventano un pulsante' },
        bullets: [
          {
            en: '"10 athletes need attention" was a card as wide as the page, spending vertical space on a number that is usually small and often zero — on the screen that exists to show athletes. It is a button in the filter row now, with the count beside it, and the panel behind it says WHAT is missing: certificates absent, certificates expiring. Each line leads to the list. A count on its own leaves you hunting for the ten people it means.',
            it: "«10 atleti da controllare» era un riquadro largo quanto la pagina, che occupava spazio verticale per un numero di solito piccolo e spesso zero — nella schermata che esiste per mostrare gli atleti. Ora è un pulsante nella riga dei filtri, col numero accanto, e il pannello dice cosa manca: certificati mancanti, certificati in scadenza. Ogni riga porta all'elenco. Un numero da solo ti lascia a cercare le dieci persone di cui parla.",
          },
          {
            en: 'When nothing needs attention the button is not there. The old card stayed to announce it had nothing to announce.',
            it: "Quando non c'è niente da controllare il pulsante non c'è. Il riquadro di prima invece restava lì a dire che non aveva niente da dire.",
          },
        ],
      },
      {
        heading: {
          en: '🥋 The roster opens on belt rank',
          it: '🥋 La lista si apre ordinata per cintura',
        },
        bullets: [
          {
            en: 'It opened in the order athletes were entered, which answers "who did I add last" — a question nobody asks. It opens highest belt first now, every time. The belt button has two states instead of three: an "off" that returned you to insertion order is the thing this change takes you out of.',
            it: "Si apriva nell'ordine in cui gli atleti erano stati inseriti, che risponde alla domanda «chi ho aggiunto per ultimo» — che non se la fa nessuno. Adesso si apre dalla cintura più alta alla più bassa, ogni volta. Il pulsante ha due stati invece di tre: lo stato «spento» rimandava all'ordine di inserimento, che è proprio quello da cui questo cambiamento ti toglie.",
          },
        ],
      },
      {
        heading: {
          en: '📋 Attendance and the roster match',
          it: '📋 Presenze e lista atleti si assomigliano',
        },
        bullets: [
          {
            en: "The two screens show the same people and drew them differently: the roster with a coloured stripe at the left, a photo and an age; attendance with the belt as a chip in a column of its own and nothing else. Same person, two faces, and moving between the screens meant re-learning the row. The row is the same now — attendance keeps only what is its own, the present/absent tick, and its Belt column went the way the roster's did.",
            it: "Le due schermate mostrano le stesse persone e le disegnavano in due modi diversi: nella lista la striscia colorata a sinistra, la foto, l'età; nelle presenze la cintura come pallino in una colonna a sé e nient'altro. Stessa persona, due facce, e passando da una schermata all'altra dovevi rifare l'occhio. Adesso la riga è la stessa: nelle presenze resta solo ciò che è suo, la spunta presente/assente, e anche lì la colonna Cintura è sparita.",
          },
          {
            en: 'The monthly summary, previously reachable only from the panel on the roster, now has its own button on the Attendance page — which is where you are when you are wondering who showed up.',
            it: 'Il riepilogo del mese, che prima si raggiungeva solo dal riquadro nella lista, ora ha il suo pulsante nella pagina Presenze: è lì che sei quando ti stai chiedendo chi è venuto.',
          },
        ],
      },
      {
        heading: {
          en: '✏️ The athlete form, reorganised',
          it: '✏️ La scheda di modifica atleta, riordinata',
        },
        bullets: [
          {
            en: 'It was a run of fields in the order they were added over the years: the phone between date of birth and website, the billing period between status and address. No field wrong, the whole unreadable — to find anything you re-read all of it. It is five titled blocks now — Who they are, At the gym, Contact, Billing, Address — in the order someone would ask them.',
            it: "Era una sequenza di campi nell'ordine in cui erano stati aggiunti negli anni: il telefono fra la data di nascita e il sito, il periodo di pagamento fra lo stato e l'indirizzo. Nessun campo sbagliato, e l'insieme illeggibile: per trovare qualcosa dovevi rileggerla tutta. Adesso è divisa in cinque blocchi con un titolo — Anagrafica, In palestra, Contatti, Pagamento, Indirizzo — nell'ordine in cui uno le domande se le farebbe.",
          },
          {
            en: 'And the fields are as wide as what goes in them: a postcode is not as wide as a street. A field offering four times the room it needs is telling you something untrue about what to write in it. Narrow the window to half the screen and it becomes a single column, as readable as it is full-screen.',
            it: "E i campi hanno la larghezza di quello che ci va dentro: il CAP non è largo come la via. Un campo che offre quattro volte lo spazio necessario ti sta dicendo una cosa falsa su cosa scriverci. Restringendo la finestra a metà schermo diventa una colonna sola, leggibile com'è a schermo intero.",
          },
        ],
      },
    ],
  },
  {
    version: 'v2.51.0',
    date: '2026-09-08',
    headline: {
      en: 'The roster, row by row.',
      it: 'La lista atleti, riga per riga.',
    },
    sections: [
      {
        heading: { en: '🥋 The Belt column is gone', it: '🥋 Via la colonna «Cintura»' },
        bullets: [
          {
            en: "Since the last release every row carries the coloured belt stripe down its left edge, so the Belt column was saying the same thing a second time — and spending the widest column on the table to do it. It is gone. Hovering the stripe now shows the belt's NAME, because a colour on its own is not a name: telling brown from black in a nine-pixel stripe is not obvious, and anyone on a screen reader does not see the colour at all. The phone card still writes it out in full.",
            it: "Dal rilascio scorso ogni riga ha la striscia colorata a sinistra, quindi la colonna «Cintura» diceva la stessa cosa una seconda volta — e per farlo si prendeva la colonna più larga della tabella. Adesso non c'è più. Passando il mouse sulla striscia compare il nome scritto della cintura, perché un colore da solo non è un nome: distinguere marrone da nero in una striscia di nove pixel non è ovvio, e chi usa un lettore di schermo non vede il colore affatto. Sul telefono la scheda continua a scriverla per esteso.",
          },
          {
            en: 'Belt sorting moved out of the table and became a button above it, next to the search. Not just a move: a column header does not exist on a phone, so for as long as sorting lived there it was a desktop-only feature. It is now in the same place on both. Three presses — ascending, descending, off.',
            it: "L'ordinamento per cintura è uscito dalla tabella ed è diventato un pulsante sopra, accanto alla ricerca. Non è solo un trasloco: l'intestazione di una colonna sul telefono non esiste, quindi finché l'ordinamento viveva lì era una funzione da computer soltanto. Ora è nello stesso posto sui due formati. Tre pressioni: crescente, decrescente, spento.",
          },
        ],
      },
      {
        heading: {
          en: '💰 The payment filter is a button that cycles',
          it: '💰 Il filtro pagamento è un pulsante che gira',
        },
        bullets: [
          {
            en: 'The All / Paid / Unpaid dropdown was a popup to open in order to choose between three values with a natural order. It is one button now: press it and it moves to the next value, with the current state written in the icon — a wallet for all, a tick for paid, a cross for unpaid. One tap instead of two, and no menu to read.',
            it: "Il menu «Tutti / Pagato / Non pagato» era una tendina da aprire per scegliere fra tre valori con un ordine naturale. Adesso è un pulsante solo: lo premi e passa al valore successivo, e lo stato attuale è scritto nell'icona — il portafoglio per tutti, la spunta per chi ha pagato, la croce per chi no. Un tocco invece di due, e niente menu da leggere.",
          },
          {
            en: 'On a phone both new buttons show the icon without its label: with the words the filter bar went to three lines, which is exactly the vertical space the feedback asked to get back. All five controls now sit on one line — one fewer than before any of this started.',
            it: "Sul telefono i due pulsanti nuovi mostrano l'icona senza etichetta: con le parole la barra dei filtri passava a tre righe, che è esattamente lo spazio verticale che i riscontri chiedevano di recuperare. Così i cinque controlli stanno su una riga sola — una in meno di prima che cominciassimo.",
          },
        ],
      },
      {
        heading: {
          en: '🔎 The dead space after the search',
          it: '🔎 Lo spazio morto dopo la ricerca',
        },
        bullets: [
          {
            en: 'There was a gap between the search field and the belt filter that looked like an alignment mistake. It was not: the field grew, but the text box inside it kept its own size, and the difference became empty space INSIDE the control. The box fills the field now.',
            it: "Fra il campo di ricerca e il filtro cinture c'era un vuoto che sembrava un errore di allineamento. Non lo era: il campo si allargava, ma la casella di testo dentro restava della sua misura e la differenza diventava spazio vuoto dentro il controllo. Adesso la casella riempie il campo.",
          },
        ],
      },
      {
        heading: { en: '💶 Icons on the payment chips', it: '💶 Le icone sui pagamenti' },
        bullets: [
          {
            en: 'The payment chip said its state in a word and a colour. But that column is scanned, not read — and four of its states are the same answer written four ways: Monthly, Quarterly, Half-yearly, Annual. There is an icon in front now: a note for any subscription, a ticket for a carnet (the one that had disappeared, and that you pointed out), a cross for a month nothing covers. It does something else too: paid and unpaid were told apart by green against amber, which is the one pair a colour-blind reader cannot separate. The icon is the signal that survives when the colour does not.',
            it: "Il pallino del pagamento diceva il suo stato con una parola e un colore. Ma quella colonna si scorre, non si legge — e quattro dei suoi stati sono la stessa risposta scritta in quattro modi: Mensile, Trimestrale, Semestrale, Annuale. Ora c'è un'icona davanti: la banconota per qualsiasi abbonamento, il biglietto per il carnet (quella che era sparita, e che ci era stato fatto notare), la croce per il mese che nessuno copre. Serve anche a un'altra cosa: pagato e non pagato si distinguevano per verde contro arancione, che è la coppia che una persona daltonica non separa. L'icona è il segnale che resta quando il colore non basta.",
          },
        ],
      },
      {
        heading: {
          en: '📱 The social icons move up a line',
          it: '📱 Le icone social salgono di una riga',
        },
        bullets: [
          {
            en: "Facebook and Instagram had a line of their own under the name. Two icons do not earn a line on a screen scrolled one-handed — and worse, that line appeared only for people who had filled the field in, so the height of the roster's rows depended on who happened to have a Facebook account. They sit next to the age now, on the same line as the name.",
            it: "Facebook e Instagram avevano una riga tutta loro sotto il nome. Due icone non valgono una riga su uno schermo che si scorre con una mano — e peggio, quella riga compariva solo per chi aveva compilato il campo, quindi l'altezza delle righe della lista dipendeva da chi avesse un account Facebook. Ora stanno accanto all'età, sulla stessa riga del nome.",
          },
        ],
      },
      {
        heading: { en: '📅 How often they actually train', it: '📅 Quante volte si è allenato' },
        bullets: [
          {
            en: 'There is a new column: Sessions. Two numbers per athlete — how many times they came this month, and how many in total. Two and not one, because either alone misleads. "3 this month" says nothing until you know whether that is normal for that person. "1204 in total" says nothing about whether they still come. Together they point at the athlete worth noticing: the one with three years of sessions and a 3 this month.',
            it: "C'è una colonna nuova: Presenze. Due numeri per ogni atleta — quante volte è venuto questo mese, e quante in tutto. Due e non uno, perché da soli ingannano entrambi. «3 questo mese» non dice niente finché non sai se per quella persona è normale. «1204 in tutto» non dice niente su se venga ancora. Insieme indicano l'atleta che vale la pena notare: quello con tre anni di presenze e un 3 questo mese.",
          },
          {
            en: 'The column sorts on both numbers: pressing the header goes from most-this-month to fewest, then does the same for the all-time count. The letter beside it says which of the two is leading, the arrow says which way.',
            it: "La colonna si ordina su entrambi i numeri: premendo l'intestazione passa da «più presenze questo mese» a «meno», poi al totale nello stesso modo. La lettera accanto dice quale dei due comanda, la freccia dice il verso.",
          },
          {
            en: 'The phone card shows the month\'s number only, with a calendar icon: there is no header to press there, and a number nobody can order earns its place only by answering something on its own. "Have they been in this month?" does; "1204 since 2022" is reference material, and wants a screen with more room.',
            it: "Sulla scheda del telefono compare solo il numero del mese, con l'icona del calendario: lì non c'è un'intestazione da premere, e un numero che nessuno può ordinare si porta dietro solo se risponde da solo a qualcosa. «È venuto questo mese?» risponde; «1204 dal 2022» è materiale da consultazione, e vuole uno schermo con più spazio.",
          },
        ],
      },
      {
        heading: {
          en: '🖱️ The payment chip on a phone can be pressed now',
          it: '🖱️ Il pallino del pagamento, sul telefono, ora si preme',
        },
        bullets: [
          {
            en: 'For eight releases the payment chip on the phone card was not tappable: touching "Monthly" opened the athlete instead of the payment menu. The whole card surface is a link to the athlete, and every other control on top of it — the three dots, the photo, the social icons — lifts itself to stay clickable. The payment chip did not. Recording a payment, selling a carnet and undoing a payment are the three things done from there, on the form factor this app is built for.',
            it: "Da otto rilasci il pallino del pagamento nella scheda su telefono non era premibile: toccando «Mensile» si apriva la scheda dell'atleta invece del menu dei pagamenti. La superficie della scheda è tutta un collegamento all'atleta, e ogni altro comando sopra di essa — i tre puntini, la foto, le icone social — si solleva per restare cliccabile. Il pallino del pagamento non lo faceva. Segnare un pagamento, vendere un carnet e annullare un pagamento sono le tre cose che si fanno da lì, sul formato per cui questa app è pensata.",
          },
        ],
      },
      {
        heading: {
          en: '🪟 The window border reaches the end',
          it: '🪟 Il bordo della finestra arriva in fondo',
        },
        bullets: [
          {
            en: 'On the title bar, top right, the last stretch of border was being eaten by the Windows buttons. A one-pixel line: it is there now.',
            it: "Sulla barra del titolo, in alto a destra, l'ultimo tratto di bordo veniva mangiato dai pulsanti di Windows. Una riga di un pixel: adesso c'è.",
          },
        ],
      },
    ],
  },
  {
    version: 'v2.50.0',
    date: '2026-09-07',
    headline: {
      en: 'Your roster, imported from a spreadsheet.',
      it: 'La tua lista atleti, importata da un foglio.',
    },
    sections: [
      {
        heading: { en: '📥 Sixty athletes, once', it: '📥 Sessanta atleti, una volta sola' },
        bullets: [
          {
            en: 'Until today there was one way to bring your gym into Budojo: the "New athlete" form, one person at a time. With sixty members that is sixty forms before you see a single benefit — which is the most common reason a new program stays closed after the first day. There is an Import button at the top of the roster now.',
            it: "Fino a ieri, per portare la tua palestra dentro Budojo c'era una strada sola: il modulo «Nuovo atleta», una persona alla volta. Con sessanta iscritti sono sessanta moduli prima di vedere il primo vantaggio — che è il motivo più comune per cui un programma nuovo resta chiuso dopo il primo giorno. Adesso in cima alla lista atleti c'è Importa.",
          },
          {
            en: "It works with the file you actually have, with nothing to prepare. Italian Excel separates with a semicolon, not a comma, because the comma is the decimal separator — it works that out on its own. Italian headers are recognised, and Cognome is not mistaken for Nome, which is less obvious than it sounds. Belts however you write them: blu, Blu, cintura blu, and bianco as well as bianca. Dates the Italian way, 15/03/2019 — and 31/02 is refused rather than quietly becoming 3 March. A phone in one column is split as it needs to be, taking your gym's own dialling code when the number has none.",
            it: "Funziona col file che hai davvero, senza preparare niente. Excel in italiano separa con il punto e virgola e non con la virgola, perché la virgola è il separatore decimale: se ne accorge da solo. Le intestazioni in italiano le riconosce, e Cognome non viene scambiato per Nome, che è meno ovvio di quanto sembri. Le cinture come le scrivi tu: blu, Blu, cintura blu, e anche bianco oltre a bianca. Le date all'italiana, 15/03/2019 — e 31/02 viene rifiutata invece di diventare il 3 marzo. Il telefono in una colonna sola lo divide come serve, e se manca il prefisso usa quello della tua palestra.",
          },
          {
            en: 'And it shows you before it writes. Choosing the file imports nothing: you see the columns as it read them — correctable even when it guessed right — and every row with its outcome, the belt in your language and the date in your format. Will be imported, skipped and why, or already on the roster. Only pressing Import writes anything, and it writes all of it at once: a half-import is the worst thing that can happen, because you cannot tell which rows landed without reading the roster against the sheet.',
            it: 'E ti fa vedere prima di scrivere. Scegliere il file non importa niente: vedi le colonne come le ha lette — correggibili anche quando ha indovinato tutto — e ogni riga con il suo esito, la cintura nella tua lingua e la data nel tuo formato. Verrà importata, scartata e perché, oppure già in lista. Solo premendo Importa scrive qualcosa, e scrive tutto insieme: mezzo import è la cosa peggiore che possa succedere, perché non sapresti quali righe sono passate senza rileggere la lista contro il foglio.',
          },
          {
            en: 'Running it twice does not double the roster. Anyone already there comes back as "already on the roster" and is not rewritten — that is the case it is built for, since someone unsure the first run worked will run it again. Two people with the same name but different dates of birth, a father and son who train together, both get in.',
            it: "Lanciarlo due volte non raddoppia la lista. Chi c'è già torna indietro come «già in lista» e non viene riscritto — è il caso per cui è pensato, visto che chi non è sicuro che il primo import sia andato a buon fine lo rilancia. Due persone con lo stesso nome ma date di nascita diverse, un padre e un figlio che si allenano insieme, entrano tutti e due.",
          },
          {
            en: 'The minimum is a header row and three columns: first name, surname, belt. If one is missing it tells you which, instead of giving sixty identical errors. Status and joining date default to active and today when the columns are absent. CSV for now — from Excel, File → Save as → CSV.',
            it: 'Il minimo è una riga di intestazione e tre colonne: nome, cognome, cintura. Se una manca ti dice quale, invece di dare sessanta errori uguali. Stato e data di iscrizione, se non ci sono, diventano «attivo» e «oggi». Per ora legge i CSV — da Excel, File → Salva con nome → CSV.',
          },
        ],
      },
      {
        heading: { en: '🗑️ The portable build is gone', it: '🗑️ Via la versione «portable»' },
        bullets: [
          {
            en: 'Every release published two files: the installer and a portable build that needed no installation. From this release there is only the installer. The portable re-extracted itself from scratch on every launch — 450 MB into a temporary folder, about two minutes, with no window and no progress bar. It looked broken. The installer needs no administrator rights, which is what portable was there for, and opens in a couple of seconds.',
            it: "Ogni rilascio pubblicava due file: l'installer e una versione portable che non richiedeva installazione. Da questo rilascio c'è solo l'installer. La portable si riestraeva da capo a ogni avvio — 450 MB in una cartella temporanea, circa due minuti, senza finestra e senza barra di avanzamento. Sembrava rotta. L'installer non chiede permessi di amministratore, che era la cosa per cui la portable esisteva, e si apre in un paio di secondi.",
          },
          {
            en: 'If you are running one: install Budojo-Setup-2.50.0.exe and delete the old file. Nothing is lost — your data was never inside the executable, it lives in %APPDATA%\\Budojo\\ on the computer.',
            it: "Se ne stai usando una: installa Budojo-Setup-2.50.0.exe e cancella il vecchio file. Non perdi niente — i tuoi dati non sono mai stati dentro l'eseguibile, stanno in %APPDATA%\\Budojo\\ sul computer.",
          },
        ],
      },
      {
        heading: {
          en: '🎚️ The filter row, in one row',
          it: '🎚️ La riga dei filtri, in una sola riga',
        },
        bullets: [
          {
            en: 'Three fixes from the alpha tester, all in the roster header. The payment column said "Payment · Sep" even for someone who paid a quarterly fee in February — the month stopped meaning "paid this month" once the column started showing how the current month is covered. It just says "Payment" now.',
            it: "Tre correzioni segnalate dall'alpha tester, tutte nell'intestazione della lista atleti. La colonna pagamento diceva «Pagamento · Set» anche per chi aveva pagato un trimestrale a febbraio — il mese non c'entrava più da quando la colonna racconta come il mese corrente è coperto, non se è stato pagato quel mese preciso. Ora dice solo «Pagamento».",
          },
          {
            en: 'The status dropdown and the eye that reveals inactive athletes asked the same question two ways. Only the eye remains — one gesture, and it defaults to the state you open the page in anyway. Whoever is in the trash now has their own button next to it, since "who did I delete" is a different question from "who trains here", not a wider version of it.',
            it: "Il menu a tendina «Stato» e l'occhio per vedere gli atleti non attivi facevano la stessa domanda con due controlli diversi. Resta solo l'occhio — un gesto solo, e lo stato di default è quello con cui apri la pagina comunque. Chi era nel cestino ha ora il suo pulsante dedicato, accanto all'occhio: «chi ho eliminato» è una domanda diversa da «chi si allena qui».",
          },
          {
            en: 'Search and the filters share one row from 768px up, instead of stacking onto two rows that pushed the first athlete further down the one page that exists to show you athletes.',
            it: 'Ricerca e filtri condividono la stessa riga da 768px in su, invece di impilarsi su due righe che spingevano il primo atleta più in basso — nella pagina che esiste apposta per mostrare gli atleti.',
          },
        ],
      },
      {
        heading: { en: '🥋 No more "suspended"', it: '🥋 Niente più «sospeso»' },
        bullets: [
          {
            en: 'The "Suspended" status had existed for months, behaving identically to "Inactive" everywhere in the app — same exclusion from payment reminders, same silence on expiring medical certificates. Two names for one behaviour, and nobody could say what the second name was for. One status remains for "this athlete does not train here anymore": Inactive.',
            it: "Lo stato «Sospeso» esisteva da mesi ma si comportava, in ogni punto dell'app, esattamente come «Non attivo» — stessa esclusione dai promemoria di pagamento, stesso silenzio sui certificati medici in scadenza. Due nomi per un solo comportamento, e il secondo nome nessuno sapeva più a cosa servisse. Resta un solo stato per «questo atleta non si allena più qui»: Non attivo.",
          },
        ],
      },
      {
        heading: {
          en: '🎨 The belt, visible from the side too',
          it: '🎨 La cintura si vede anche di lato',
        },
        bullets: [
          {
            en: "Each athlete's row in the roster carried a coloured dot for their belt. It is a vertical stripe down the left edge of the row now, the same colour — closer to what a belt actually looks like, and easier to pick out while scanning down the list quickly.",
            it: 'La riga di ogni atleta nella lista aveva un pallino colorato per indicare la cintura. Ora è una striscia verticale a sinistra della riga, dello stesso colore — più vicina a come si vede davvero una cintura, e più facile da individuare scorrendo la lista velocemente.',
          },
        ],
      },
      {
        heading: {
          en: '⚠️ Deleting an athlete, in one place',
          it: '⚠️ Eliminare un atleta, in una zona sola',
        },
        bullets: [
          {
            en: "The delete button used to live in the roster — one row away from eleven identical ones, a click indistinguishable from just opening that person. It is at the bottom of the athlete's own edit page now, in a separate red-bordered section, the GitHub repository-settings pattern: reaching it means choosing that person and opening their page first. The confirmation is the same as before, and now explains what actually happens: it is a soft delete, the row survives, but the athlete's documents are permanently removed from disk.",
            it: "Il pulsante per eliminare un atleta viveva nella lista — una riga fra undici uguali, un click di distanza dall'aprire semplicemente quella persona. Ora è in fondo alla pagina di modifica dell'atleta, in una sezione rossa a parte, come su GitHub quando elimini un repository: per arrivarci devi prima aver scelto proprio quella persona e aperto la sua pagina. La conferma resta la stessa, e ora spiega anche cosa succede davvero: è una cancellazione soft, la riga sopravvive, ma i documenti dell'atleta vengono eliminati per sempre dal disco.",
          },
          {
            en: 'Your own row (if you train and manage the academy at once) no longer shows this button — it uses the existing toggle on your Profile page instead, which is reversible and needs no confirmation, because leaving the academy on your own is not the same thing as deleting an athlete.',
            it: "Il proprio profilo (per chi si allena e gestisce l'academy insieme) non mostra più questo pulsante — usa invece l'interruttore già esistente nella pagina Profilo, che è reversibile e non richiede conferma, perché lasciare l'academy da soli non è la stessa cosa che eliminare un atleta.",
          },
        ],
      },
      {
        heading: {
          en: '📖 Promotion history, correctable',
          it: '📖 Lo storico promozioni si può correggere',
        },
        bullets: [
          {
            en: "Every belt and stripe was recorded with the date you typed it into Budojo — not the date it actually happened. For a promotion entered late, the date was simply wrong, with no way to fix it. Every row on an athlete's Promotions tab now has a pencil that corrects just the date.",
            it: "Ogni cintura e ogni striscetta venivano registrate con la data in cui le scrivevi su Budojo — non con la data in cui erano davvero accadute. Per una promozione inserita in ritardo, la data era semplicemente sbagliata, e non c'era modo di sistemarla. Ora ogni riga della scheda Promozioni di un atleta ha una matita per correggere solo la data.",
          },
          {
            en: 'And a new "Add a past promotion" button transcribes the history of an athlete who trained before Budojo existed — belts and stripes, one at a time, with the real date. If the date you enter contradicts a promotion already on record around it, it tells you immediately and explains what does not line up, instead of leaving the history contradicting itself. A row entered by mistake can be deleted too.',
            it: "E c'è un pulsante nuovo, «Aggiungi una promozione passata», per trascrivere lo storico di un atleta che si allenava già prima di Budojo — cinture e striscette, una alla volta, con la data vera. Se la data che inserisci non è coerente con le promozioni già registrate intorno ad essa, te lo dice subito e ti spiega cosa non torna, invece di lasciare lo storico contraddittorio. Una riga inserita per sbaglio si può anche eliminare.",
          },
        ],
      },
    ],
  },
  {
    version: 'v2.49.0',
    date: '2026-09-06',
    headline: {
      en: 'The roster says what you mean.',
      it: 'La lista atleti dice quello che intendi.',
    },
    sections: [
      {
        heading: { en: '💳 Payment, not "paid"', it: '💳 Pagamento, non «pagato»' },
        bullets: [
          {
            en: 'The payments column had two values, Paid and Unpaid, which was fine when the only way to pay was the monthly fee — and has not been for a while. An athlete who bought a carnet last week read as Unpaid, with the entries they had left written right beside it: true of the month, false about the person.',
            it: "La colonna dei pagamenti aveva due valori, Pagato e Non pagato, il che andava bene quando l'unico modo di pagare era la quota mensile — e non lo è più da un pezzo. Un atleta che aveva comprato un carnet la settimana prima risultava Non pagato, con gli ingressi residui scritti lì accanto: vero del mese, falso della persona.",
          },
          {
            en: 'It is called Payment now and says how the month is covered: Monthly, Quarterly, Half-yearly, Annual, Carnet · 8 with the entries left, or Unpaid — which is now the only state that asks for anything. A quarterly bought in February is no longer a generic "paid" in April: you can see why.',
            it: "Ora si chiama Pagamento e dice come è coperto il mese: Mensile, Trimestrale, Semestrale, Annuale, Carnet · 8 con gli ingressi che restano, oppure Non pagato — che adesso è l'unico stato che chiede qualcosa. Un trimestrale comprato a febbraio non è più genericamente «pagato» ad aprile: si vede perché.",
          },
          {
            en: 'If both the fee and a carnet apply, the fee wins. Not a new rule — it is already what the entry count does, since a paid month never spends a carnet entry. The list now tells that story instead of contradicting it.',
            it: 'Se paga sia la quota che il carnet, vince la quota. Non è una regola nuova: è già quello che fa il conteggio degli ingressi, visto che un mese pagato non scala niente dal carnet. La lista adesso lo racconta invece di contraddirlo.',
          },
          {
            en: "And the cell opens a menu: mark paid, sell a carnet, undo the payment, open payments — only the ones that mean something for that row. Selling from the list is a straight confirmation, price and entries, starting today; back-dating a sale stays on the athlete's page where the date pickers are.",
            it: "E la cella apre un menu: segna pagato, vendi un carnet, annulla il pagamento, apri i pagamenti — solo quelle che hanno senso per quella riga. Vendere dalla lista è una conferma secca, prezzo e ingressi, a partire da oggi; retrodatare una vendita resta nella scheda dell'atleta, dove ci sono i calendari.",
          },
        ],
      },
      {
        heading: { en: '👁️ Only the ones who train', it: '👁️ Solo chi si allena' },
        bullets: [
          {
            en: 'The Status column said "Active" on twelve rows out of fourteen. A column that repeats the same word almost everywhere is not telling you anything: it takes space and teaches you to skip it.',
            it: 'La colonna Stato diceva «Attivo» su dodici righe su quattordici. Una colonna che ripete la stessa parola quasi ovunque non ti sta dicendo niente: occupa spazio e ti insegna a saltarla.',
          },
          {
            en: 'It is gone. The list shows the active athletes, which is the answer to the question you open it with, and an eye beside the filters reveals the suspended and the inactive — greyed, with the status written next to the name.',
            it: "Non c'è più. La lista mostra gli atleti attivi, che è la risposta alla domanda che ti fai aprendola, e un occhio accanto ai filtri fa comparire sospesi e inattivi — in grigio, con lo stato scritto vicino al nome.",
          },
          {
            en: 'The "All statuses" menu stays for when you want only the suspended, and the two can no longer disagree: picking Suspended from the menu lights the eye, closing the eye goes back to the actives.',
            it: "Il menu «Tutti gli stati» resta per quando vuoi isolare solo i sospesi, e i due non possono più contraddirsi: scegliere Sospesi dal menu accende l'occhio, chiudere l'occhio torna agli attivi.",
          },
        ],
      },
      {
        heading: { en: '🖥️ The version, up in the bar', it: '🖥️ La versione nella barra, in alto' },
        bullets: [
          {
            en: 'The bar above the window had a problem and an absence. The problem: no border, so it ended in nothing rather than looking like a bar. It has one now, the same as the sidebar.',
            it: "La barra sopra la finestra aveva un problema e una mancanza. Il problema: nessun bordo, quindi finiva nel nulla invece di sembrare una barra. Adesso ce l'ha, lo stesso della barra laterale.",
          },
          {
            en: "The absence: you could not tell which version you were running, or whether there was an update. The version is up there now — click it and it says Checking…, then You're up to date, or v2.50.0 · Install, and does it.",
            it: 'La mancanza: non sapevi che versione stavi usando, né se ci fossero aggiornamenti. Ora la versione è lì — ci clicchi e dice Controllo…, poi Sei aggiornato, oppure v2.50.0 · Installa, e lo fa.',
          },
          {
            en: 'The app already checked by itself at every launch and installed on close. What was missing was seeing it: "no update" and "never checked" both produced silence, and silence is not an answer.',
            it: "L'app controllava già da sola a ogni avvio e installava alla chiusura. Quello che mancava era vederlo: «nessun aggiornamento» e «non ho controllato» producevano tutti e due silenzio, e il silenzio non è una risposta.",
          },
        ],
      },
    ],
  },
  {
    version: 'v2.48.0',
    date: '2026-09-06',
    headline: {
      en: 'More than one price, and more than one month.',
      it: 'Più di un prezzo, e più di un mese.',
    },
    sections: [
      {
        heading: { en: '💶 More than one monthly fee', it: '💶 Più di una quota mensile' },
        bullets: [
          {
            en: 'Your academy had exactly one monthly fee. If you charge by how often someone trains — 2 lezioni a settimana 55 €, 3 lezioni 65 € — there was nowhere to put that. In your academy settings, under the monthly fee, you can now add as many tiers as you charge: a name you choose, the amount, and how many lessons a week it buys.',
            it: "L'academy aveva esattamente una quota mensile. Se fai pagare in base a quanto uno si allena — 2 lezioni a settimana 55 €, 3 lezioni 65 € — non c'era dove metterlo. Nelle impostazioni dell'academy, sotto la quota mensile, ora aggiungi tutte le fasce che ti servono: un nome che scegli tu, l'importo, e quante lezioni a settimana comprende.",
          },
          {
            en: "Nothing changes until you add one: no tiers means every athlete pays the monthly fee, exactly as before. Once you have them, pick each athlete's from their page — their Payments tab says which tier they are on and what it costs.",
            it: 'Finché non ne aggiungi una non cambia niente: nessuna fascia vuol dire che tutti pagano la quota mensile, esattamente come prima. Quando ci sono, scegli la fascia di ogni atleta dalla sua scheda — e la tab Pagamenti dice su quale sta e quanto costa.',
          },
          {
            en: "Changing a price never rewrites the past: what someone already paid stays what they paid. And deleting a tier does not delete the people on it — they go back to the academy's standard fee, and the confirmation tells you how many that is before you do it.",
            it: "Cambiare un prezzo non riscrive il passato: quello che uno ha già pagato resta quello che ha pagato. Ed eliminare una fascia non elimina chi ci sta sopra — tornano alla quota standard dell'academy, e la conferma ti dice quanti sono prima che tu lo faccia.",
          },
        ],
      },
      {
        heading: {
          en: '📆 Quarterly, half-yearly, annual',
          it: '📆 Trimestrale, semestrale, annuale',
        },
        bullets: [
          {
            en: 'A quarterly payment used to mean ticking three months and pretending they were three payments. They were not — the athlete handed you money once and has one receipt. You can now say how often each athlete pays and record it as one payment covering the whole period.',
            it: "Un trimestrale voleva dire spuntare tre mesi e far finta che fossero tre pagamenti. Non lo erano — l'atleta ti ha dato i soldi una volta e ha una ricevuta sola. Ora dici ogni quanto paga ciascun atleta e lo registri come un pagamento solo che copre tutto il periodo.",
          },
          {
            en: 'The months table shows all three months of a quarter as paid, with the amount on one row and the range — January to March 2026 — written under each of them, so a row without a figure never reads as a gap.',
            it: "La tabella dei mesi mostra tutti e tre i mesi del trimestre come pagati, con l'importo su una riga sola e il periodo — Da gennaio a marzo 2026 — scritto sotto ciascuno, così una riga senza cifra non sembra mai un buco.",
          },
          {
            en: 'Marking or undoing tells you what it will actually do — "Undo Mario Rossi\'s payment covering January to March 2026?" rather than a bare month name — and undoing works from any month in the period, removing the whole thing.',
            it: 'Segnare o annullare ti dice cosa succede davvero — «Annullare il pagamento di Mario Rossi che copre da gennaio a marzo 2026?» invece del nome di un mese — e si annulla da qualunque mese del periodo, togliendolo tutto.',
          },
          {
            en: "The unpaid list, the paid badge, the reminder email and the athlete's own reminder all understand periods, so nobody on a quarterly gets chased in month two.",
            it: "L'elenco dei non paganti, il badge pagato, la mail di sollecito e il promemoria dell'atleta capiscono tutti i periodi, così chi è su un trimestrale non viene sollecitato al secondo mese.",
          },
        ],
      },
      {
        heading: { en: '🎟️ Carnets, finished off', it: '🎟️ Carnet, completati' },
        bullets: [
          {
            en: 'A carnet can now cover the past. Set the date it starts covering from and sessions already on the register inside that window count immediately — which is what you want when you sell a carnet to someone who has been training all month. Moving that date moves the expiry with it, and the app shows you where it lands before you confirm.',
            it: "Un carnet ora può coprire il passato. Imposti da che data inizia a coprire e le presenze già sul registro dentro quella finestra contano subito — che è quello che serve quando vendi un carnet a chi si allena già da un mese. Spostare quella data sposta anche la scadenza, e l'app ti fa vedere dove va a finire prima che confermi.",
          },
          {
            en: 'A carnet created by mistake can be deleted: the sessions stay on the register and go back to being uncovered, and the confirmation says how many that is. The sale date and the price are on the card — selling a carnet is the payment, and now it says so.',
            it: 'Un carnet creato per sbaglio si può eliminare: le presenze restano sul registro e tornano scoperte, e la conferma dice quante sono. Data di vendita e prezzo sono sulla card — vendere un carnet è il pagamento, e adesso lo dice.',
          },
          {
            en: 'Carnet money is in the revenue chart. A €70 carnet valid twelve months shows as about €5.83 a month across the months it covers, the same way a yearly fee does — so the chart now means all your revenue, not just the monthly fees.',
            it: 'I soldi dei carnet sono nel grafico degli incassi. Un carnet da 70 € valido dodici mesi compare come circa 5,83 € al mese sui mesi che copre, come fa una quota annuale — così il grafico ora vuol dire tutti i tuoi incassi, non solo le quote mensili.',
          },
        ],
      },
      {
        heading: { en: '🖥️ On the desktop', it: '🖥️ Sul desktop' },
        bullets: [
          {
            en: 'The window buttons at the top right used to float over the page, with text sliding underneath them. There is now a proper bar for them to sit on.',
            it: "I pulsanti della finestra in alto a destra galleggiavano sopra la pagina, con il testo che ci scorreva sotto. Ora c'è una barra vera su cui appoggiarsi.",
          },
        ],
      },
    ],
  },
  {
    version: 'v2.47.0',
    date: '2026-09-05',
    headline: {
      en: 'Carnets, for the ones who come and go.',
      it: 'Carnet, per chi va e viene.',
    },
    sections: [
      {
        heading: { en: '🎟️ Entry carnets', it: '🎟️ Carnet ingressi' },
        bullets: [
          {
            en: "Some athletes train six or seven times a year, and charging them a month at a time is either unfair to them or lossy for you. Set a price and a size once in your academy settings — say €70 for 10 entries — and a Carnet ingressi section appears on every athlete's Payments tab.",
            it: "Certi atleti si allenano sei o sette volte l'anno, e farli pagare a mese o è ingiusto per loro o è una perdita per te. Imposta una volta prezzo e taglia nelle impostazioni dell'academy — per esempio 70 € per 10 ingressi — e su ogni atleta compare la sezione Carnet ingressi nella scheda Pagamenti.",
          },
          {
            en: "Each carnet carries a four-character code (A7K2): read it off the athlete's card and you know which one you are looking at. The characters that get misread by hand — 0 and O, 1 and I and L — are simply not in the alphabet.",
            it: "Ogni carnet ha un codice di quattro caratteri (A7K2): lo leggi dalla tessera dell'atleta e sai qual è. I caratteri che a mano si confondono — 0 e O, 1 e I e L — non fanno proprio parte dell'alfabeto.",
          },
          {
            en: 'A carnet is valid 12 months from the day it was bought, and you can back-date the sale — which is the point if you are transcribing a paper register. If you leave the price or the size empty, you will never see any of this.',
            it: 'Un carnet vale 12 mesi dal giorno in cui è stato comprato, e la vendita si può retrodatare — che è il punto se stai trascrivendo un registro cartaceo. Se lasci vuoti prezzo o taglia, di tutto questo non vedi niente.',
          },
        ],
      },
      {
        heading: { en: '🔢 The count takes care of itself', it: '🔢 Il conteggio si fa da solo' },
        bullets: [
          {
            en: 'Mark someone present and, if that month is not already covered by their monthly fee, one entry comes off their carnet. The monthly fee wins: if they have paid for that month, the carnet is not touched. It is a fallback, never a second charge.',
            it: 'Segni una presenza e, se quel mese non è già coperto dalla quota mensile, un ingresso scala dal carnet. La quota mensile ha la precedenza: se quel mese è pagato, il carnet non si tocca. È un ripiego, mai un secondo addebito.',
          },
          {
            en: "The date on the session is the date that counts. Filling in last month's sessions is normal, and each one is judged against the coverage in force back then — not today's.",
            it: "Conta la data della sessione, non quella di oggi. Inserire le presenze del mese scorso è normale, e ognuna viene valutata sulla copertura che c'era allora.",
          },
          {
            en: 'Fixing a mistake costs one entry, not two: delete a presence and its entry comes straight back. Holding two carnets spends the one expiring first, so you lose the fewest entries to expiry.',
            it: "Correggere un errore costa un ingresso, non due: cancelli la presenza e l'ingresso torna subito indietro. Con due carnet si consuma quello che scade prima, così ne perdi il meno possibile per scadenza.",
          },
          {
            en: 'Presence is never blocked. An athlete with no monthly fee and no carnet is still marked present — the register records what happened, and sorting out the money is a separate conversation.',
            it: "La presenza non viene mai bloccata. Un atleta senza mensile e senza carnet si segna comunque presente: il registro annota cos'è successo, e sistemare i soldi è un discorso a parte.",
          },
        ],
      },
      {
        heading: { en: '👀 The balance where you need it', it: '👀 Il saldo dove ti serve' },
        bullets: [
          {
            en: 'On the roster, next to the paid badge, a small ticket chip with the entries left. It turns amber at two or fewer — the moment to ask "vuoi rinnovare?" before they walk out.',
            it: 'Nel registro, accanto al badge dei pagamenti, una piccola targhetta con gli ingressi rimasti. Diventa ambra a due o meno: il momento giusto per chiedere «vuoi rinnovare?» prima che se ne vada.',
          },
          {
            en: "On the athlete's Payments tab, a card with the code, the balance and the expiry, plus a Registro ingressi listing exactly which sessions the carnet paid for. Past and spent carnets stay there too. And in the athlete's own app, so they stop having to ask you.",
            it: "Nella scheda Pagamenti dell'atleta, una card con codice, saldo e scadenza, più il Registro ingressi con esattamente quali sessioni ha pagato il carnet. Restano lì anche i carnet passati ed esauriti. E nell'app dell'atleta, così smette di doverlo chiedere a te.",
          },
        ],
      },
      {
        heading: { en: '⬇️ Update when you want to', it: '⬇️ Aggiorna quando vuoi tu' },
        bullets: [
          {
            en: 'The update bar used to tell you a new version was coming and leave it at that. It now has a button: run the update now, and watch it happen rather than wondering whether it did.',
            it: "La barra di aggiornamento ti diceva che stava arrivando una nuova versione e finiva lì. Ora ha un bottone: lancia l'aggiornamento adesso, e lo guardi succedere invece di chiederti se è successo.",
          },
        ],
      },
    ],
  },
  {
    version: 'v2.46.0',
    date: '2026-08-18',
    headline: { en: 'Faces on the roster.', it: 'Facce sul registro.' },
    sections: [
      {
        heading: { en: '📸 Athletes can have a photo', it: '📸 Gli atleti possono avere una foto' },
        bullets: [
          {
            en: 'Open an athlete and you will find a Photo card: upload one, replace it, remove it. It shows on the roster too, so with sixty white belts you can find the right row by looking instead of reading. Up to 2 MB, in PNG, JPG or WebP.',
            it: 'Apri un atleta e trovi la scheda Foto: caricala, sostituiscila, rimuovila. Compare anche nel registro, così con sessanta cinture bianche trovi la riga giusta guardando invece che leggendo. Massimo 2 MB, in PNG, JPG o WebP.',
          },
          {
            en: "Why not \"import from WhatsApp\"? Neither WhatsApp nor Instagram lets an app read someone else's profile picture — Instagram closed the last interface that could in December 2024. And taking a person's photo from another platform into your gym's records is not yours to do. The photo has to be given to you.",
            it: "Perché non «importa da WhatsApp»? Né WhatsApp né Instagram permettono a un'app di leggere la foto profilo di un'altra persona: Instagram ha chiuso a dicembre 2024 l'ultima interfaccia che lo consentiva. E prendere la foto di una persona da un'altra piattaforma per metterla nei registri della palestra non è una cosa che ti spetta. La foto te la deve dare lei.",
          },
        ],
      },
      {
        heading: { en: '✅ Attendance is one click away', it: '✅ Le presenze a un clic' },
        bullets: [
          {
            en: 'Attendance now sits in the sidebar, next to Athletes. It was only ever reachable behind the + Create button — fine for taking attendance, wrong for looking at it, since consulting who was there yesterday is not creating anything.',
            it: "Presenze ora sta nella barra laterale, accanto ad Atleti. Prima si raggiungeva solo dietro il bottone + Crea: giusto per segnare le presenze, sbagliato per consultarle, visto che guardare chi c'era ieri non è creare niente.",
          },
        ],
      },
      {
        heading: {
          en: '👤 Your avatar opens your profile',
          it: '👤 Il tuo avatar apre il tuo profilo',
        },
        bullets: [
          {
            en: 'Clicking your name and picture at the bottom of the sidebar opened the More menu. It now opens your profile, which is what that block does in every app you already use.',
            it: 'Cliccare il tuo nome e la tua foto in fondo alla barra apriva il menu Altro. Ora apre il tuo profilo, che è quello che fa quel blocco in ogni app che già usi.',
          },
        ],
      },
      {
        heading: {
          en: '🔎 Things that were quietly wrong',
          it: '🔎 Cose che non andavano, in silenzio',
        },
        bullets: [
          {
            en: 'The strip that appears while a new version downloads was almost exactly the colour of the page behind it. It now reads as a bar.',
            it: 'La striscia che compare mentre scarica una nuova versione aveva quasi esattamente il colore della pagina dietro. Ora si legge come una barra.',
          },
          {
            en: 'The monthly attendance title was lower-case, and nothing on that page was spaced apart from anything else.',
            it: 'Il titolo del mese nelle presenze era minuscolo, e su quella pagina niente era distanziato da niente.',
          },
          {
            en: "What's new was in English even with the app in Italian. The two most recent releases now read in your language; older entries stay in English for now.",
            it: "Le Novità erano in inglese anche con l'app in italiano. Le due release più recenti ora si leggono nella tua lingua; quelle più vecchie restano in inglese per ora.",
          },
          {
            en: 'A missing space before the version at the bottom of the More page.',
            it: 'Mancava uno spazio prima della versione in fondo alla pagina Altro.',
          },
          {
            en: 'A "view public profile" button that did nothing. Public profiles need the community features, which this edition does not include, so the button is simply gone rather than there and unresponsive.',
            it: "Un bottone «vedi profilo pubblico» che non faceva niente. I profili pubblici richiedono le funzioni community, che questa edizione non include: ora il bottone semplicemente non c'è, invece di esserci e non rispondere.",
          },
        ],
      },
    ],
  },
  {
    version: 'v2.45.0',
    date: '2026-08-18',
    headline: {
      en: 'You can see the update happening.',
      it: "Ora vedi l'aggiornamento mentre succede.",
    },
    sections: [
      {
        heading: {
          en: '⬇️ A new version no longer arrives out of nowhere',
          it: '⬇️ Una nuova versione non arriva più dal nulla',
        },
        bullets: [
          {
            en: 'Budojo downloads new versions quietly in the background. Until now the only sign was a single notification once the download had already finished — easy to miss, and gone in a few seconds.',
            it: "Budojo scarica le nuove versioni in silenzio, mentre lavori. Finora l'unico segnale era una notifica che compariva a scaricamento già finito: facile da perdere, e via dopo pochi secondi.",
          },
          {
            en: 'A thin line at the top of the app now tells you which version is downloading and how far along it is, then that it is ready and will install when you next close Budojo.',
            it: "Ora una riga sottile in cima all'app ti dice quale versione sta scaricando e a che punto è, e poi che è pronta e si installerà alla prossima chiusura di Budojo.",
          },
          {
            en: 'It appears only when there is something to say, and it never asks you to stop what you are doing. Closing the app at the end of the day is still all it takes.',
            it: "Compare solo quando c'è qualcosa da dire, e non ti chiede mai di interrompere quello che stai facendo. Chiudere l'app a fine giornata resta tutto ciò che serve.",
          },
        ],
      },
      {
        heading: {
          en: '🔢 The app finally tells you which version it is',
          it: "🔢 Finalmente l'app ti dice che versione è",
        },
        bullets: [
          {
            en: 'The version at the bottom of the More page always read "dev", in every release we have ever shipped. It now shows the real one — so if you have ever tried to check whether an update actually installed, that number is finally a reliable answer.',
            it: 'La versione in fondo alla pagina Altro ha sempre mostrato "dev", in ogni release che abbiamo mai pubblicato. Ora mostra quella vera: se hai mai provato a controllare lì se un aggiornamento fosse davvero stato installato, quel numero ora è una risposta affidabile.',
          },
        ],
      },
    ],
  },
  {
    version: 'v2.44.0',
    date: '2026-08-18',
    headline: {
      en: 'Your backups finally leave this computer.',
      it: 'I tuoi backup finalmente escono da questo computer.',
    },
    sections: [
      {
        heading: {
          en: '💾 Pick a folder, and every backup goes there',
          it: '💾 Scegli una cartella, e ogni backup finisce lì',
        },
        bullets: [
          {
            en: 'A backup sitting on the same disk as your data does not survive that disk. Data & backup → Backup folder → Choose folder closes that gap with no account to create and nothing to configure.',
            it: 'Un backup che sta sullo stesso disco dei tuoi dati non sopravvive a quel disco. Dati e backup → Cartella di backup → Scegli cartella chiude questa falla, senza account da creare e senza niente da configurare.',
          },
          {
            en: 'Point it at a folder your cloud service already syncs — OneDrive, Dropbox, iCloud Drive, the Google Drive app — or at a network drive or a USB stick. Budojo writes the file; whatever you already run carries it off the machine.',
            it: "Puntala su una cartella che il tuo servizio cloud già sincronizza — OneDrive, Dropbox, iCloud Drive, l'app di Google Drive — oppure su un disco di rete o una chiavetta USB. Budojo scrive il file; quello che già usi lo porta fuori dal computer.",
          },
          {
            en: 'It stays off until you choose a folder, and nothing leaves this computer before you do. Budojo only ever touches archives it created — your own files in that folder are left completely alone.',
            it: 'Resta spento finché non scegli una cartella, e niente esce da questo computer prima che tu lo faccia. Budojo tocca solo gli archivi che ha creato lui: i tuoi file in quella cartella restano assolutamente intatti.',
          },
        ],
      },
      {
        heading: {
          en: '🕓 Two weeks of history, not two days',
          it: '🕓 Due settimane di storico, non due giorni',
        },
        bullets: [
          {
            en: 'Backups run every six hours, and until now only the seven most recent were kept — barely 42 hours. Fine for a mistake you notice straight away, useless for one you notice on Monday.',
            it: 'I backup girano ogni sei ore, e finora se ne tenevano solo i sette più recenti: appena 42 ore. Vanno bene per un errore di cui ti accorgi subito, non servono a niente per uno di cui ti accorgi lunedì.',
          },
          {
            en: 'Now two things are kept side by side: the six most recent archives, whatever time they were made, plus the last backup of each of the past fourteen days.',
            it: "Ora se ne tengono due tipi affiancati: i sei archivi più recenti, a qualunque ora siano stati fatti, più l'ultimo backup di ciascuno degli ultimi quattordici giorni.",
          },
        ],
      },
      {
        heading: {
          en: '↩️ Restore works',
          it: '↩️ Il ripristino funziona',
        },
        bullets: [
          {
            en: 'The Restore button on each backup did nothing — it never even appeared. It does now, with a confirmation before anything is replaced.',
            it: "Il pulsante Ripristina su ogni backup non faceva niente: non compariva nemmeno. Ora c'è, con una conferma prima che qualcosa venga sostituito.",
          },
        ],
      },
      {
        heading: {
          en: '🖼️ Fixes you will notice',
          it: '🖼️ Correzioni che noterai',
        },
        bullets: [
          {
            en: 'Academy logos and athlete photos load again instead of showing a broken image.',
            it: "I loghi dell'accademia e le foto degli atleti si caricano di nuovo, invece di mostrare un'immagine rotta.",
          },
          {
            en: "Budojo's own icon in the Start menu, the taskbar and the installer, in place of the generic Electron one.",
            it: "L'icona di Budojo nel menu Start, nella barra delle applicazioni e nell'installer, al posto di quella generica di Electron.",
          },
          {
            en: 'A blank Data & backup page no longer greets you while it loads — it shows placeholders, then the real thing.',
            it: 'La pagina Dati e backup non ti accoglie più vuota mentre carica: mostra dei segnaposto e poi il contenuto vero.',
          },
        ],
      },
    ],
  },
  {
    version: 'v2.43.0',
    date: '2026-08-16',
    headline: 'Budojo keeps itself up to date.',
    sections: [
      {
        heading: '🔄 No more checking for new versions',
        bullets: [
          'Until now a new version only reached you if you visited the downloads page and installed it by hand. From this release on, Budojo checks shortly after you open it, downloads quietly in the background, and installs the next time you close the app.',
          'Nothing is installed while you are working — no dialog in the middle of a check-in. A notification tells you a version is waiting; closing the app at the end of the day applies it. This is the one version you still install by hand.',
        ],
      },
      {
        heading: '🪟 It looks like an app now, not a website in a frame',
        bullets: [
          'It opens on the sign-in screen. Before, it opened on the public marketing page — “start free”, “no credit card”, a picture of a phone — inside an app you had already installed.',
          'The File / Edit / View menu bar is gone, and the window background no longer fights the app’s light theme, which had made some text hard to read.',
        ],
      },
    ],
  },
  {
    version: 'v2.42.2',
    date: '2026-08-15',
    headline: 'Expiry reminders actually work now.',
    sections: [
      {
        heading: '🔔 The medical-certificate reminders were never firing',
        bullets: [
          'Budojo is meant to warn you when an athlete’s medical certificate is about to expire. On the desktop app that check ran every few minutes and failed silently every single time — it could not open your database, gave up, and left no sign of it anywhere you would look.',
          'So since the desktop app launched you have not been getting expiry reminders — not late ones, none at all. This release fixes that, and the same fix covers the other background jobs: the unpaid-athletes digest, the attendance-streak notices and the routine clean-up tasks.',
          'Worth doing once after updating: open the expiring-documents widget on your dashboard directly, in case something slipped past while the reminders were silent.',
        ],
      },
    ],
  },
  {
    version: 'v2.42.1',
    date: '2026-08-15',
    headline: 'A security update. Nothing changes in how you use Budojo.',
    sections: [
      {
        heading: '🔒 Security fixes in the underlying components',
        bullets: [
          'Budojo is built on open-source components, and security fixes were published for several of them — including one rated high severity that affected how text is displayed on screen. This release picks them all up.',
          'There is nothing for you to do beyond installing the update: no data change, no setting to review, no visible difference. Your data stays exactly where it is.',
        ],
      },
    ],
  },
  {
    version: 'v2.42.0',
    date: '2026-08-15',
    headline: 'Your documents can now follow you to a new computer.',
    sections: [
      {
        heading: '🔑 Recovery keys',
        bullets: [
          "Budojo encrypts your athletes' medical certificates, and the key that unlocks them was locked to this computer — so a backup restored on a new computer brought back everything except the documents. There's now a Recovery keys section at the bottom of Data & backup that fixes it.",
          'Do this once, today: click "Reveal recovery code", copy the code, and paste it into your password manager. Treat it like a password — anyone who has it can open your documents, so never store it inside the backup itself.',
          'If you ever move to a new computer: install Budojo, restore your backup, then paste that code into "Restore keys from a recovery code". Budojo restarts and your certificates open normally again.',
        ],
      },
    ],
  },
  {
    version: 'v2.41.0',
    date: '2026-08-15',
    headline: 'Budojo is now an app on your computer.',
    sections: [
      {
        heading: '💻 Budojo runs on your computer',
        bullets: [
          "Budojo is now a Windows application you install and open like any other program. Your gym's data stays on your own computer — it doesn't travel to a server on the internet, and you don't need a connection to use it. Everything you already use works exactly the same.",
        ],
      },
      {
        heading: "🔒 You're signed in automatically",
        bullets: [
          "Because Budojo is now your own app on your own machine, it remembers you — open it and you're already signed in, with no email and password to type every time.",
        ],
      },
      {
        heading: '💾 Automatic backups, and a one-click restore',
        bullets: [
          "Budojo backs itself up automatically while it's open, and you can make a backup any time from the new Data & backup page. If something ever goes wrong, you can restore an earlier backup in a couple of clicks.",
          'Keep a copy of your backups somewhere other than this computer — a USB stick or a synced folder like OneDrive — so a lost machine never means lost data. The Data & backup page has the details.',
        ],
      },
      {
        heading: '🔔 Reminders pop up on your desktop',
        bullets: [
          'When a medical certificate is about to expire, Budojo now tells you with a normal desktop notification. Click it and Budojo opens straight to what needs your attention.',
        ],
      },
    ],
  },
  {
    version: 'v2.40.1',
    date: '2026-06-02',
    headline: 'A couple of fixes for two-factor setup and the Android app.',
    sections: [
      {
        heading: '🔐 The two-factor setup QR code shows up again',
        bullets: [
          'When you turned on two-factor authentication, the QR code you scan with your authenticator app was coming up blank, so there was nothing to scan. It now renders correctly — start the setup and the code is right there. You can still type the secret in by hand if you prefer.',
        ],
      },
      {
        heading: '📱 The Android app stays upright',
        bullets: [
          'If you installed Budojo from the Play Store, the app could still flip sideways when you turned your phone, even after the last update. The Android app now stays in portrait like the rest of Budojo, so rotating your phone no longer twists the layout.',
        ],
      },
    ],
  },
  {
    version: 'v2.40.0',
    date: '2026-05-31',
    headline: 'Easier-to-tap actions on the athletes list.',
    sections: [
      {
        heading: '♿ Bigger, clearer edit & delete buttons',
        bullets: [
          "The edit and delete buttons on each athlete row now have larger, easier-to-tap targets and proper labels for screen readers, so they're quicker to hit on a phone and friendlier with assistive tech. Deleting still asks you to confirm first — nothing changed there.",
        ],
      },
    ],
  },
  {
    version: 'v2.39.3',
    date: '2026-05-31',
    headline: 'Shared Instagram reels now open in Instagram.',
    sections: [
      {
        heading: '🎬 Tap an Instagram reel, watch it on Instagram',
        bullets: [
          'Instagram doesn\'t let its reels play inside other apps, so a shared reel used to show a "log in to Instagram" card when you tapped it. Now the preview stays as it was, and tapping opens the reel straight in Instagram — where it actually plays. YouTube and TikTok videos still play right inside Budojo.',
        ],
      },
    ],
  },
  {
    version: 'v2.39.2',
    date: '2026-05-30',
    headline: 'Budojo stays upright on your phone.',
    sections: [
      {
        heading: '📱 No more sideways flip',
        bullets: [
          'When you installed Budojo to your home screen, turning your phone used to flip the whole app into landscape — which looked off, since every screen is built for upright use. Budojo now stays in portrait, so rotating your phone no longer twists the layout.',
        ],
      },
    ],
  },
  {
    version: 'v2.39.1',
    date: '2026-05-30',
    headline: 'A couple of fixes for shared videos on the phone.',
    sections: [
      {
        heading: '📱 Cleaner video sharing on mobile',
        bullets: [
          'On your academy feed, the page title no longer gets squeezed into a sliver next to the buttons on a phone — the title now sits on its own line, with the actions neatly below it.',
          'A shared TikTok or Instagram reel now shows in its full upright shape instead of being cropped into a wide box, so you see the whole video the way it was filmed.',
        ],
      },
    ],
  },
  {
    version: 'v2.39.0',
    date: '2026-05-30',
    headline: 'Share technique videos straight to your academy feed.',
    sections: [
      {
        heading: '🎬 Share a video from Instagram, YouTube or TikTok',
        bullets: [
          "Spotted a great technique on a reel or a YouTube clip? Now you can share it straight to your academy's feed. Paste the link, add a note if you like, and it becomes a post your teammates can watch — right inside Budojo. It works with Instagram, YouTube and TikTok, and it's the first kind of post athletes can publish to the feed themselves, not just owners.",
        ],
      },
      {
        heading: '▶️ Tap to play, right in the feed',
        bullets: [
          'A shared video shows a cover with a play button. Tap it and the video plays inline, without leaving Budojo — and nothing loads from the other app until you choose to play, so your feed stays fast and your scrolling stays private. There\'s always an "Open on Instagram / YouTube / TikTok" link too, in case you\'d rather watch it on the original app.',
        ],
      },
      {
        heading: '💬 React, comment and @mention like any post',
        bullets: [
          'Shared videos are full feed posts: your teammates can clap, comment, and @mention each other right under the video — perfect for "let\'s drill this on Thursday."',
        ],
      },
    ],
  },
  {
    version: 'v2.38.1',
    date: '2026-05-30',
    headline: 'A couple of small fixes for the phone.',
    sections: [
      {
        heading: '📱 Mobile polish',
        bullets: [
          "The Unread filter on your notifications page is now clearly readable when you tap it. On a phone the selected filter could turn white-on-white and all but disappear — that's fixed.",
          'On your academy feed, the Publish event button now stays neatly beside the page title instead of dropping onto its own line.',
        ],
      },
    ],
  },
  {
    version: 'v2.38.0',
    date: '2026-05-30',
    headline: 'Notifications that stay calm when a post takes off.',
    sections: [
      {
        heading: '🔔 Reactions and replies bundle into one',
        bullets: [
          'When several people react to, comment on, or RSVP to the same post, Budojo now folds them into a single notification — "Marco and 3 others reacted to your post" — instead of a separate one for each. A popular post no longer floods your inbox or buzzes your phone over and over: you get one notification that quietly updates as more people join in.',
        ],
      },
      {
        heading: '💻 Notifications in the desktop side rail',
        bullets: [
          'On a computer, your notifications now have their own spot in the left side rail, with a badge showing how many are unread — so you can reach them without going up to the bell.',
        ],
      },
    ],
  },
  {
    version: 'v2.37.0',
    date: '2026-05-30',
    headline: 'Cleaner pages, and a proper notifications center.',
    sections: [
      {
        heading: '🔔 A social-style notifications page',
        bullets: [
          "Your notifications now open as their own full-screen page from the bell — and it reads like the apps you already use. They're grouped into New, Today, This week and Earlier; each row shows who it's about with their avatar (or a colored icon for system updates like payments and your weekly recap); and a tap takes you straight to whatever it's telling you about. There's a quick Unread filter and a one-tap mark all as read. Athletes get the bell too now — it was owner-only before.",
        ],
      },
      {
        heading: '📐 Consistent titles on every page',
        bullets: [
          "Every page title now comes from the same building block, so headings look identical across the whole app — same size, same weight, the same tidy spacing underneath. We also dropped a stray little label that wasn't pulling its weight and tightened the gap that read as a touch too big on some screens.",
        ],
      },
    ],
  },
  {
    version: 'v2.36.0',
    date: '2026-05-29',
    headline: 'A fresh, app-like way to get around Budojo — on your phone and on the desktop.',
    sections: [
      {
        heading: '🧭 A new way to move around the app',
        bullets: [
          'Budojo\'s navigation got a ground-up redesign that feels like the apps you already use every day. On your phone, a bottom tab bar puts your main destinations one thumb-tap away — no more hunting through a hamburger menu. A big ➕ button in the middle opens a quick "create" sheet for the things you do most (mark attendance, add an athlete, write a post). On a computer the same destinations live in a clean side rail down the left, with your profile pinned at the bottom. Same places, same labels — only the layout adapts to the screen you\'re on.',
        ],
      },
      {
        heading: '✨ Everything in its place',
        bullets: [
          'The things you reach less often — settings, stats, activity, language, sign out — now live together on a tidy "More" page, so the main bar stays focused on what you use every day. The experience is more consistent between phone and desktop, and more accessible too: clearer keyboard focus and better screen-reader labels throughout the new navigation.',
        ],
      },
    ],
  },
  {
    version: 'v2.35.0',
    date: '2026-05-28',
    headline: 'Plan ahead: a future schedule change no longer erases past attendance math.',
    sections: [
      {
        heading: '📅 Plan a future schedule change',
        bullets: [
          "From the academy page, you can now schedule a new training-days set effective on any future date. Past months keep the schedule that was actually in effect — your May percentage stays calculated against May's Tue/Thu instead of silently switching to June's Mon/Wed/Fri the moment you save. Mid-month transitions split the denominator correctly across the two segments. A pending change shows up on the academy page until the day arrives or you cancel it.",
        ],
      },
      {
        heading: '📭 Empty states with onboarding CTAs',
        bullets: [
          'The empty athletes roster now opens the new-athlete form on tap — your very first visit after signup IS the call-to-action instead of a dead-end placeholder. A narrowed filter that finds nothing offers a one-tap Clear filters. The expiring-documents page also moves onto the shared empty/error states, completing the wave-3 adoption pass.',
        ],
      },
      {
        heading: '⚡ Faster image loads',
        bullets: [
          'Academy logos in the detail page, the my-academy page, and athlete avatars now load lazily via the native browser pattern (no JS), so the initial page weight on the first paint drops. The QR-code data URL on the my-academy page stays eager because lazy is a no-op for data URLs anyway.',
        ],
      },
    ],
  },
  {
    version: 'v2.34.0',
    date: '2026-05-28',
    headline:
      'Cleaner empty states across the app, and the app now respects your reduced-motion accessibility preference.',
    sections: [
      {
        heading: '📭 Empty states, uniformed',
        bullets: [
          "Lists with nothing to show — your community feed and the four stats tabs — now share one clean shape: a topic icon, a short headline, and a one-line explainer of what'll appear there once data lands. Replaces five one-off styles.",
        ],
      },
      {
        heading: '♿ Motion respects your accessibility settings',
        bullets: [
          "If your device is set to prefer reduced motion (iOS Settings → Accessibility → Motion · Android Settings → Accessibility → Remove animations), the app's transitions and smooth-scrolls now go straight to their target instead of animating. No setting to flip in Budojo — it picks up the OS preference automatically.",
        ],
      },
    ],
  },
  {
    version: 'v2.33.0',
    date: '2026-05-27',
    headline:
      'When something fails to load, you now see a clear, consistent banner — and on the athletes list and your feed, a one-tap Retry — instead of a blank screen.',
    sections: [
      {
        heading: '⚠️ Clearer load errors',
        bullets: [
          'Across the athletes list, your community feed, the stats tabs, and the monthly attendance summary, a failed load now shows the same on-brand banner explaining what happened — instead of a silent blank table or an easy-to-miss one-liner.',
          'On the athletes list and the feed, the banner carries a Retry button so you can re-attempt the load without leaving the page. The athletes list used to fail silently — a toast that scrolled away, leaving an empty table with no explanation.',
        ],
      },
    ],
  },
  {
    version: 'v2.32.2',
    date: '2026-05-26',
    headline:
      'Tapping a community notification now opens the right post — academy owners no longer hit "Page not found".',
    sections: [
      {
        heading: '🔔 Notifications open the post',
        bullets: [
          'Tapping a community alert (a new comment, a reaction, a belt celebration, a new event) now takes you straight to that post in the feed and briefly highlights it. Academy owners used to land on a "Page not found" because the link pointed at the athlete-only feed route — fixed.',
        ],
      },
    ],
  },
  {
    version: 'v2.32.1',
    date: '2026-05-26',
    headline:
      'Notification fixes — the in-app alert is cleaner and actually useful, and your device stays remembered across updates.',
    sections: [
      {
        heading: '🔔 Browser notifications, fixed',
        bullets: [
          "The in-app alert is on-brand now — when a notification arrives while you're using Budojo, the card matches the rest of the app instead of looking like a generic system popup.",
          'Tap it to go there — tapping the alert opens exactly what it is about (the post, the athlete, the screen). Before, tapping did nothing.',
          'Dismiss it — a clear × closes the alert; no more waiting for it to fade.',
          'No more re-enabling after every update — previously each new version dropped your device off the "this device" list and you had to accept notifications again. Now your device is remembered and keeps receiving alerts across updates.',
        ],
      },
      {
        heading: '📱 Large screens',
        bullets: [
          'The app no longer locks to portrait — it adapts to landscape and to tablets / foldables.',
        ],
      },
    ],
  },
  {
    version: 'v2.32.0',
    date: '2026-05-25',
    headline:
      'Every form in the app now reads the same — clearer, more consistent inline validation — plus a mobile edge-to-edge fix and a safety confirmation before a device is removed from notifications.',
    sections: [
      {
        heading: '🎯 Forms that read the same everywhere',
        bullets: [
          'The login, registration, athlete, academy, and first-run setup forms now share one field component. One consistent look: the same label position, the same red * for required fields, the same muted "Optional" tag, and the same inline error styling on every screen — no more subtle drift between forms.',
          'Errors appear the moment you submit. Hit save on an empty form and every required field lights up at once with its message, instead of revealing problems one at a time as you tab through.',
        ],
      },
      {
        heading: '📱 Mobile: nothing hidden under the notch',
        bullets: [
          "On phones with a notch or running Android 15's edge-to-edge mode, the top bar and the slide-in menu now sit clear of the system status bar instead of being clipped behind it.",
        ],
      },
      {
        heading: '🔔 Safer device removal',
        bullets: [
          'Removing a device from browser notifications now asks you to confirm first — a single accidental tap no longer silently unsubscribes that device.',
        ],
      },
      {
        heading: 'Behind the scenes',
        bullets: [
          "A set of shared building blocks — empty states, error banners, card shells, and icon buttons — were standardised this release. You won't see them everywhere yet; they're the foundation for more consistent screens in the releases ahead.",
        ],
      },
    ],
  },
  {
    version: 'v2.31.1',
    date: '2026-05-24',
    headline: 'The v2.31.0 release that actually reaches your browser.',
    sections: [
      {
        heading: '🚑 Deploy fix',
        bullets: [
          "Yesterday's v2.31.0 update — avatars on the athletes list, expanded ⋮ menu, upload-document dialog in Italian, plus the security hardening behind the scenes — was published but never reached your device because the production build crashed at the last step.",
          "This patch unblocks it. Open the app and you should see all the v2.31.0 features now. If you don't, pull-to-refresh once.",
        ],
      },
    ],
  },
  {
    version: 'v2.31.0',
    date: '2026-05-24',
    headline:
      'Athletes list affordances — avatars + expanded ⋮ menu + the upload-document dialog fully in Italian — plus a security hardening + Clean-Architecture sweep behind the scenes.',
    sections: [
      {
        heading: '🥋 Athletes list: avatars, expanded ⋮ menu, i18n',
        bullets: [
          'Avatar circle next to every name — uploaded photo if set, initials placeholder otherwise. Tap → public profile when the athlete has a handle.',
          'Mobile ⋮ menu now jumps direct to Attendance, Documents (medical certificate inside), Payments (if academy tracks fees), Belt history, Public profile — alongside Edit + Delete.',
          'Upload-document dialog fully localized in Italian: labels, validation errors, toast messages.',
        ],
      },
      {
        heading: '🛡️ Security hardening',
        bullets: [
          '2FA endpoints rate-limited (5/min per user) — closes TOTP brute-force window.',
          'Web Push device secrets encrypted at rest — DB-dump leak no longer enables push forgery.',
          'New rate-limits: /me/avatar (10/min), /me/api-tokens (10/min), /me/push-subscriptions/test (5/min).',
          'Security headers on every response: HSTS, X-Frame-Options DENY, restrictive CSP, Referrer-Policy no-referrer, X-Content-Type-Options nosniff.',
          'CORS allowlist tightened from wildcards to explicit method/header enumeration.',
          'Password fields capped at 255 chars across all 7 hash endpoints — closes bcrypt-DoS surface.',
        ],
      },
      {
        heading: '🧪 Under the hood',
        bullets: [
          '9 controller-bloat refactors: Login / Athletes (store+update) / ActiveAcademy / Onboarding / ApiTokens / PushSubscriptions / TwoFactor / NotificationPreferences — extracted into dedicated FormRequests + Actions.',
          'New AddressIntent value object replaces a flag-argument antipattern with a discriminated three-way intent (skip / clear / set).',
          'SwitchActiveAcademyAction returns a discriminated result type — replaces sentinel-exception control flow.',
          'Test coverage filled in: AddressIntent + LeaderboardService + SecurityHeaders + 8 password-cap regression tests + 3 throttle tests + 3 new Action unit specs.',
          '4 entity docs added for M9 community tables; 8 missing API routes added to OpenAPI spec; m5 PRD flipped to Shipped.',
          'stylelint integrated with an 8dp-grid SCSS rule (warning-only baseline). OnPush change detection on Login + Register, closing the last two outliers in the SPA.',
        ],
      },
    ],
  },
  {
    version: 'v2.30.0',
    date: '2026-05-23',
    headline:
      'The social-engagement train: peer presence on self-mark, share-worthy belt promotions, weekly recap pushes, achievement badges, and a monthly mat-hours leaderboard.',
    sections: [
      {
        heading: '🥋 "Chi viene stasera?" peer preview',
        bullets: [
          'On the "Sono qui oggi" page, see who else from your academy has self-marked today — up to 8 faces with an overflow chip for the rest.',
          'Per-athlete opt-out from the profile page ("Mostra agli altri quando mi alleno") — the row disappears from the preview while still counting toward attendance.',
        ],
      },
      {
        heading: '📸 Share your belt promotion to Instagram',
        bullets: [
          'Belt-promotion feed posts get a "Condividi" button — generates a 1080×1920 story image right in the browser and hands it to the native share sheet.',
          'Falls back to a plain download on desktop or browsers without Web Share. No server round-trip, no storage, zero latency.',
        ],
      },
      {
        heading: '📬 Sunday weekly recap',
        bullets: [
          'Push lands every Sunday at 19:00 with the week summary: training days, mat hours (1.5 h/session), three most-overlapping peers.',
          'Tap to land on a dedicated recap page that mirrors the numbers, plus a Web Share button for plain-text bragging rights.',
          'Notification dedupes — a worker retry will not double-ping you.',
        ],
      },
      {
        heading: '🏆 Achievement badges',
        bullets: [
          'Five lifetime milestones unlock automatically: 🥋 First class, 🔥 30-day streak, 💯 100 sessions, 🎂 1 year at the academy, 🎉 Belt promotion.',
          'Evaluator runs on every attendance row plus a nightly 02:00 cron for the time-based ones.',
          'Unlocked badges surface on your public profile (`/u/<handle>`).',
        ],
      },
      {
        heading: '📊 Monthly mat-hours leaderboard',
        bullets: [
          'New card on the stats / profile pages: top 5 athletes by sessions this month, hours at 1.5 h per session.',
          'Drilldown to a specific month via `?month=YYYY-MM`. Your own row is highlighted when you appear in the top 5.',
          'Opt-out from the profile page ("Mostra il mio nome nella classifica") anonymises the row to "Anonimo" while still counting toward rank.',
        ],
      },
      {
        heading: '🧪 Under the hood',
        bullets: [
          'Claude reviewer switched to opus 4.7 — sonnet-4-6 was failing on the 1M-token context on bigger PRs.',
          'Password-strength meter spec timeouts bumped to 50s/60s for the cold-cache CI runner that lazy-loads zxcvbn-ts more slowly than the budget allowed.',
          'Patch-level dep sweep: Angular 21.2.14, PrimeNG 21.1.8, Laravel 13.11.2.',
        ],
      },
    ],
  },
  {
    version: 'v2.29.0',
    date: '2026-05-22',
    headline:
      'The "Sono qui oggi" feature you have been asking about: athletes self-register their own presence — the instructor stops doing roll call by hand for every training day.',
    sections: [
      {
        heading: '🥋 Athletes can self-register their presence',
        bullets: [
          'New page reachable from the 07:00 "today is training day" push: one big "Sono qui oggi" button registers the athlete for tonight\'s class.',
          'Three on-page states: training day with the mark button, non-training day with a quiet rest-day panel, already-marked with a Cancel option (only on own self-marks — instructor marks stay protected).',
          'Small "Self" pill on the instructor\'s daily check-in widget marks rows the athlete registered themselves — spot anomalies at a glance, accept the rest.',
        ],
      },
      {
        heading: '🧪 Under the hood',
        bullets: [
          'Every HTTP service under core/services/ now ships with Vitest coverage (AuthService, CommunityService, AttendanceService, every smaller wrapper).',
          'Same for the remaining shared components and utility functions — regression sieve that did not exist a week ago.',
        ],
      },
    ],
  },
  {
    version: 'v2.28.1',
    date: '2026-05-21',
    headline:
      'Patch on v2.28.0. Three small audit-log polish fixes after the reviewer pass — screen-reader skips the decorative arrow, ?page=0 now returns 422 like the spec said, and a rapid double-tap on Applica no longer flashes a stale row count. Plus a 2FA dependency bump.',
    sections: [
      {
        heading: '🕒 Audit page — three quiet fixes',
        bullets: [
          'The → separator between actor and subject is now marked decorative — VoiceOver / NVDA skip it cleanly instead of reading "right-pointing arrow".',
          '?page=0 / ?page=-1 used to silently fall back to page 1; they now return 422 like every other invalid pagination value, matching what the API spec documented.',
          'A rapid double-tap on Applica (or a page change landing while the previous request is still in flight) used to briefly flash a stale row count. The list now cancels the previous request — only the latest filter ever wins.',
        ],
      },
      {
        heading: '🔐 Two-factor library bumped',
        bullets: [
          'pragmarx/google2fa 8 → 9 — same APIs, no user-visible change, pulls in upstream fixes + PHP 8.4 polish.',
        ],
      },
    ],
  },
  {
    version: 'v2.28.0',
    date: '2026-05-21',
    headline:
      'The "Attività" page is here. Every meaningful action across the academy — athletes added or removed, payments edited, documents uploaded, belts promoted, academy details changed — is now recorded as it happens and surfaced on a new owner-only page with filters.',
    sections: [
      {
        heading: '🕒 Activity log — who did what, when',
        bullets: [
          'New sidebar voice Attività between Statistiche and Community. Owner-only.',
          'One row per recorded action: actor → subject + timestamp. Filters by action verb + date range.',
          'Every write is recorded automatically: athlete created/updated/belt.promoted/deleted, payment created/updated/deleted, document uploaded/deleted, academy updated and logo replaced.',
          'Immutable log — owners can read it but never edit or delete entries.',
          'PII redacted at write time: email + phone become opaque hashes (you see the value changed but not WHAT), fiscal codes are masked, freeform notes and addresses are replaced with a placeholder.',
        ],
      },
    ],
  },
  {
    version: 'v2.27.0',
    date: '2026-05-21',
    headline:
      'Two fronts: invisible audit-log foundation that lets us answer "who deleted what, when" starting next release, and two more dashboard pages joining the uniform header pattern (support, stats overview).',
    sections: [
      {
        heading: '🔒 Audit log foundation — invisible today, indispensable tomorrow',
        bullets: [
          'No user-visible change in this release — schema + write API + tests only. The observers and the "Activity" page land next release.',
          'Once wired up, every delete / edit / upload across the academy writes an immutable trail (actor, action, before/after, ip, ua, timestamp).',
          'Closes a real GDPR Art. 5 §2 accountability gap and unlocks the "who deleted Mario\'s payment last Tuesday" troubleshooting flow.',
        ],
      },
      {
        heading: '🧭 Page-header pattern — two more pages join',
        bullets: [
          '/dashboard/support and /dashboard/stats now use the shared header chrome — single visual rhythm across every dashboard page.',
          "Public help + what's-new pages keep their distinctive brand-glyph design.",
          '/dashboard/athletes/:id (the complex composite header) follows in a focused PR.',
        ],
      },
    ],
  },
  {
    version: 'v2.26.1',
    date: '2026-05-21',
    headline:
      "Patch on v2.26.0. Smaller register / reset-password / change-password pages — the password-strength meter is now dynamic-imported on first keystroke, so users who never focus a password field don't download the ~700 kB zxcvbn-ts dictionaries. Plus the last two test-coverage gaps from the #588 umbrella closed.",
    sections: [
      {
        heading: '⚡ Smaller register / reset / change-password pages',
        bullets: [
          'zxcvbn-ts (the password strength analyser) used to ship eagerly on every page mount; now it loads on the first non-empty keystroke and caches after that.',
          'Empty-input branch (any password field the user never focused) pays zero KB.',
          'No visible UX change for active typers — the meter still appears ~10 ms after the first character.',
        ],
      },
      {
        heading: '🧪 Internal: last two #588 test-coverage gaps closed',
        bullets: [
          'OnboardingChecklistComponent: visibility gate, step CTA, confirm-popup dismiss path.',
          'ProfileApiTokensComponent: list/empty/error branches, create-then-plaintext flow, confirm-revoke flow.',
        ],
      },
    ],
  },
  {
    version: 'v2.26.0',
    date: '2026-05-21',
    headline:
      'The "% di presenze" chart you asked for lands on each athlete profile + /me/attendance — donut with the headline rate, bar timeline of realized lesson days, range switcher 30/90/365. Alongside, three Honor-200 bug fixes (athlete sidebar footer, Impostazioni rename, reaction chip clipping) and a small bundle-size audit win.',
    sections: [
      {
        heading: '📈 Attendance percentage chart on athlete profile + /me',
        bullets: [
          'Donut with the headline rate dead-centre + bar timeline below (one bar per realized lesson day, colour-encoded primary/muted).',
          'Range switcher 30/90/365 — default 90.',
          'Denominator is "realized lesson days" (academy actually held a session AND athlete already on the roster) — closures, holidays, pre-roster days never penalize the rate.',
          'Empty state when expected_count is zero — no misleading 0%.',
        ],
      },
      {
        heading: '🛠️ Athlete sidebar footer + Impostazioni rename',
        bullets: [
          'Athlete drawer now carries the same footer as the owner side: language toggle, Help · Privacy · vX.Y.Z. Pre-fix athletes saw only Sign-out and had no way to confirm their app version inside the shell.',
          'Athlete settings page header renamed "Il tuo profilo" → "Impostazioni" (IT) / "Settings" (EN) to match the sidebar voice that opens it.',
        ],
      },
      {
        heading: '🎯 Reaction chip right edge no longer clipped on Honor 200',
        bullets: [
          'Per-corner border-radius split — outer corners round, inner seam stays flush.',
          'Belt-and-suspenders: overflow: clip + isolation: isolate added to the chip wrapper.',
          'iOS Safari + desktop Chromium rendering unchanged.',
        ],
      },
      {
        heading: '⚙️ Internal: initial-bundle audit + lazy qrcode',
        bullets: [
          'Snapshot of the initial Angular chunk (1.00 MB raw / 234 kB transfer) documented under docs/development/bundle-audit-2026-05.md.',
          'qrcode now loads dynamically only on first 2FA enrolment — users who never enable 2FA no longer download the library.',
        ],
      },
    ],
  },
  {
    version: 'v2.25.1',
    date: '2026-05-20',
    headline:
      'Patch on top of v2.25.0. Re-enabling browser notifications after a deploy could leave a stale row in the device list; tapping × on it surfaced "Impossibile revocare il dispositivo" because the server had already cleaned the row up. Revoke is now idempotent on 404 and the panel reconciles in the background after a subscribe.',
    sections: [
      {
        heading: '🛠️ Browser notifications — revoke no longer trips on a stale row',
        bullets: [
          'After every deploy that swaps the Service Worker, FCM / Mozilla / Apple rotate the push endpoint. The server already cleans up dead rows on the next outbound push (410 GONE), but the SPA could still carry the old row until a refresh.',
          'Revoke is now idempotent on 404 — "already gone" counts as success: row leaves the list, success toast, no error.',
          'Re-enabling notifications now reconciles the device list against the server in the background (no loading flash), so the panel matches actual state.',
        ],
      },
    ],
  },
  {
    version: 'v2.25.0',
    date: '2026-05-20',
    headline:
      'Two follow-ups on owner feedback after v2.24.0 plus the backend foundation for the upcoming attendance-percentage chart. The "documenti da controllare" widget now opens to a page that ALSO lists the athletes without a medical certificate. Five more dashboard pages join the shared one-row page-header pattern. The API now exposes a per-athlete attendance summary — the chart lands next release.',
    sections: [
      {
        heading: '📋 La lista "Stato documenti" mostra anche chi non ha il certificato',
        bullets: [
          'Tapping the dashboard widget used to open a page that listed only the expiring documents — the athletes without a certificate were counted but had nowhere to be acted on.',
          'The page now has two sections: "Atleti senza certificato medico" (one tappable row per athlete, links to their documents tab where the cert can be uploaded) and "Documenti in scadenza" (same table as before).',
          'Header count chip combines both axes ("3 in scadenza · 6 senza certificato") so the page matches the widget that opened it.',
        ],
      },
      {
        heading: '🧭 Page-header pattern extended to five more pages',
        bullets: [
          'Impostazioni, dettaglio + modifica accademia, modulo nuovo / modifica atleta, i miei documenti now use the same eyebrow + title + count + CTA chrome as the v2.24.0 pages.',
          'Page max-width on these pages also uses the shared --budojo-page-content-max token, so every operative page wraps at the same desktop width.',
          "Edge pages (dettaglio atleta, stats, ricerca, support, aiuto, what's new, portale atleta) follow in a subsequent release.",
        ],
      },
      {
        heading: '📈 Internal: API endpoint per attendance percentage chart',
        bullets: [
          'Backend foundation for the upcoming "% di presenze" chart that the owner asked for on each athlete profile and on /me.',
          'GET /api/v1/athletes/:id/attendance/summary?range=30|90|365 returns attended count / expected count / rate plus a sparkline-ready series.',
          'Denominator is "realized lesson days" — distinct dates where the academy held a lesson AND the athlete was already on the roster, so closures / cancellations / pre-roster days never penalize the rate.',
          'The chart itself lands in the next release.',
        ],
      },
    ],
  },
  {
    version: 'v2.24.0',
    date: '2026-05-20',
    headline:
      'Two follow-ups from owner feedback after the M9 release. The "1 documento da controllare" dashboard widget now also counts athletes who don\'t have a medical certificate on file at all — same CONI/insurance risk as an expired one. The dashboard page headers are also standardised: every page now uses a tight one-row "title · count chip · action" pattern.',
    sections: [
      {
        heading: '🩺 Athletes with no medical certificate flagged in the dashboard widget',
        bullets: [
          'Before: the widget counted only documents expired or expiring within 30 days. An athlete with no certificate at all was invisible — same CONI/insurance risk, zero alert.',
          'Now: combined "X atleti da controllare" count with a breakdown line "Y in scadenza · Z senza certificato".',
          'Active athletes count; suspended / inactive don\'t. Soft-deleted certs count as missing. Expired certs stay in the "scadenza" count, never double-counted.',
        ],
      },
      {
        heading: '🧭 One-row, tight page headers across the dashboard',
        bullets: [
          'Five most-visited dashboard pages now use the same one-row pattern: Feed, Atleti, Documenti in scadenza, Presenze del giorno, Riepilogo presenze mensile.',
          'Each header reads "Title · count chip · primary action" on one row, dropping ~60–80 px of vertical space per page.',
          'Remaining dashboard pages (Impostazioni, dettaglio atleta, accademia, statistiche) follow in the next release.',
        ],
      },
    ],
  },
  {
    version: 'v2.23.0',
    date: '2026-05-20',
    headline:
      'Discoverability follow-up to the M9 social-profile epic. The athlete public profile shipped in v2.22.0 but reaching it from the feed or the athletes list took more taps than it should — both surfaces now have a direct tap target. Plus a small naming polish on the settings page header.',
    sections: [
      {
        heading: '👆 Tap the author flair in the feed to open the profile',
        bullets: [
          'Every feed post and every comment renders an author flair (avatar + name + @handle + belt). Until now it was just text — the only way in was to scroll for an @handle mention or guess the URL.',
          'The whole flair is now tappable: one tap opens the author public profile.',
          'Role-aware — owners go to /dashboard/u/<handle>, athletes go to /dashboard/me/u/<handle>, same profile page in the shell you are allowed to see.',
          'Only authors with a handle set get the tap target; otherwise the flair stays plain text.',
        ],
      },
      {
        heading: '👤 "View public profile" icon on the athletes list',
        bullets: [
          'Each athlete row in /dashboard/athletes now carries a small id-card icon at the right edge, before the pencil + trash buttons.',
          'Tap to open the athlete public profile in one step — no need to drill into the athlete detail first.',
          'Visible only on rows whose linked user has a handle; other rows stay clutter-free.',
        ],
      },
      {
        heading: '🛠️ "Impostazioni" — settings page title aligned with the sidebar',
        bullets: [
          'The sidebar voice was renamed to "Impostazioni" in v2.22.0, but the page header at /dashboard/profile still said "Profilo".',
          'Header now reads "Impostazioni" with a subtitle listing the four tabs. The inner "Profilo" tab stays — that is the account-info sub-tab of the settings group.',
        ],
      },
    ],
  },
  {
    version: 'v2.22.1',
    date: '2026-05-20',
    headline:
      'Build-budget patch unblocking the v2.22.0 SPA deploy. Same user-facing surface as v2.22.0 — every feature listed in those notes is now actually reachable on https://budojo.it.',
    sections: [
      {
        heading: '🛠️ Internal: SPA initial-bundle budget raised to 1.25 MB',
        bullets: [
          'v2.22.0 introduced the M9 social-profile epic plus the per-response RSVP counter; combined, the new code pushed the Angular initial chunk over the 1 MB Cloudflare Pages cap by 988 bytes.',
          'The build failed silently and the SPA stayed on v2.21.0 while the API was already on v2.22.0.',
          'This patch raises the maximumError budget to 1.25 MB so the existing 500 kB warning still fires when the bundle grows, but the build no longer fails until we are meaningfully over the limit.',
        ],
      },
    ],
  },
  {
    version: 'v2.22.0',
    date: '2026-05-20',
    headline:
      'Athletes in your academy now have a public profile page. The card shows first name, current belt, joined date, and the full promotions timeline — the same view your peers see when they tap your name. Composers can tag @handle in feed posts and comments to drop a clickable link to that profile. The sidebar is reorganised so "Profilo" (which was actually settings) becomes "Impostazioni" and a new "Il mio profilo" voice opens your own public profile in one tap.',
    sections: [
      {
        heading: '👤 Athlete public profile page',
        bullets: [
          'Tap an athlete name in the feed or the new "Il mio profilo" sidebar voice to land on /dashboard/u/<handle>.',
          'The page shows avatar + first name + @handle, current belt with stripes badge, "Joined {month year}", and the full promotions timeline (newest first, up to 50 events).',
          'Visible to your same-academy peers by default; a Settings → Privacy toggle to flip it off ships next release.',
          'Never exposed cross-academy — someone from a different academy who guesses your handle sees the generic "Profile not available" state, not a leak.',
        ],
      },
      {
        heading: '🏷️ @handle tagging in feed posts + comments',
        bullets: [
          'When you write a community post or a comment, typing @mariobjj (any valid handle) renders as a tappable link to that profile — same pattern as Facebook / Twitter / Mastodon.',
          'Mentions in plain prose work too; email-looking text is left alone.',
          'Today the link is rendered passively; a composer-side @-autocomplete ships in the next release.',
        ],
      },
      {
        heading: '🧭 Sidebar — "Profilo" → "Impostazioni" + new "Il mio profilo"',
        bullets: [
          'The old "Profilo" voice actually opened settings (notifications, password, sessions). Renamed to "Impostazioni" (cog icon); route unchanged.',
          'New "Il mio profilo" (id-card icon) opens your own public profile so you see the same view your peers see. Hidden when your handle is empty; set one in the profile page to surface the row.',
        ],
      },
      {
        heading: '🟢 RSVP counter on event posts — Going + Maybe each get their own number',
        bullets: [
          'Bug from a Pixel 8 Pro report — the RSVP counter only showed a number next to "Ci sarò" (Going), never next to "Forse" (Maybe).',
          'The feed now ships per-response counts: Going renders its own number, Maybe renders its own number, both update optimistically when you tap.',
        ],
      },
      {
        heading: '🏗️ "Train here too?" step in academy setup',
        bullets: [
          'When you set up a new academy, the wizard now asks one final question: do you train as an athlete too, or only manage it?',
          'Picking "yes" automatically creates your athlete row so your own attendance and promotions are tracked from day one.',
        ],
      },
      {
        heading: '🔐 Server-side role gate on owner-only routes',
        bullets: [
          "Before this release, the SPA hid owner-only screens from athletes, but the API itself didn't re-check the role on every endpoint — a direct curl from an athlete token could in theory reach owner-only data.",
          'The server now re-checks the role on every gated route. The SPA gates are now defense-in-depth, not the only gate.',
        ],
      },
      {
        heading: '🔔 Notification preferences — 3 collapsible groups',
        bullets: [
          'The page previously listed 14+ toggles in one flat column. They are now grouped into three collapsible sections: Owner, Athlete, Community.',
          'Opens with the section relevant to your role expanded; the rest collapse, so the page is one scroll-page on a phone.',
        ],
      },
      {
        heading: '🗓️ Attendance page — today-aware title + no-class banner',
        bullets: [
          'If you visit the attendance page on a day with no scheduled training, the page now says "Nessun allenamento oggi" with the next training day, instead of a confusing "Check-in di oggi" header with an arbitrary other date.',
          "The athletes list still shows tonight's attendees when there IS a class, with the right session date in the title.",
        ],
      },
    ],
  },
  {
    version: 'v2.21.0',
    date: '2026-05-19',
    headline:
      "Your profile page is now organised into four tabs instead of one long scroll. The settings you use the most are still the first thing you see — everything else groups under the matching topic so you don't have to scroll past five sections to find a single toggle.",
    sections: [
      {
        heading: '👤 Profile page — grouped into 4 tabs',
        bullets: [
          'The /dashboard/profile page previously stacked twelve separate sections in a single column. Now those settings group under four tabs, matching the visual chrome of the athlete detail page.',
          'Profilo — your profile picture, name, handle (@you), and email. This is the default landing tab; the first thing you see is unchanged.',
          'Sicurezza — change password, two-factor authentication, active sessions, login history. Everything that hardens your login lives here.',
          'Notifiche — email digest preferences and browser push notifications. Both notification surfaces in one place.',
          'Account — train at this academy as an athlete, API tokens (for integrations), and the GDPR "download my data" export.',
          'Switching tabs is instant — no URL change, no page reload, no lost form state if you started typing something in one tab and clicked another. All your previous settings are still there; none were removed, only regrouped.',
        ],
      },
    ],
  },
  {
    version: 'v2.20.0',
    date: '2026-05-19',
    headline:
      'Notification UX polish + tighter push-fail diagnostics. The Browser notifications card on /dashboard/me/profile gets smarter about which device is which, why subscribe sometimes fails, and what to do when a test push leaves silently.',
    sections: [
      {
        heading: '🔔 Browser notifications',
        bullets: [
          '"(this device)" pill on the matching row. The device list now marks the row that belongs to the browser you\'re currently looking at, so a multi-device user (phone + laptop + tablet) can tell which row maps to which session without reading the cryptic fcm.googleapis.com host string. Matching is done by hashing the current PushSubscription.endpoint (SHA-256) and comparing against the rows the server returns — no extra round-trip.',
          '"Add another device" button hides when the current device is already subscribed. Tapping it from the device that\'s already in the list created a no-op flicker before (the upsert resolved to the same row, no toast, nothing visibly changed). Now the affordance is just absent when it can\'t do anything useful.',
          'Delivery verification after enabling notifications. When you flip the toggle on, the SPA fires a one-shot verification push and waits up to 5 seconds for the Service Worker to receive it. If the push lands → success. If 5 seconds pass and nothing arrived → a warn toast surfaces explaining that a system layer (Android settings, browser permissions, focus mode) may be silently filtering pushes. Catches the case where Android revoked the channel permission silently between releases.',
          'Platform-specific hints when subscribe fails. iOS Safari outside the installed PWA now explains "Web push on iOS requires the app to be installed (Add to Home Screen)". Brave with Google Push Services disabled now points to "Settings → Privacy → Push notifications". Generic "subscribe failed" is gone.',
          "Test push button: structured 503 if delivery throws. The Send test button (added in v2.19.0) previously returned a 200 + opened the user's inbox even when the underlying WebPushChannel threw at signing time. Now the endpoint catches the exception, logs it server-side, returns a 503 with reason: dispatch_failed, and the SPA shows an error toast instead of a misleading success. No inbox row is created on failure either.",
        ],
      },
      {
        heading: '🎯 Pager parity',
        bullets: [
          'Attendance pager tooltips alongside ariaLabel. The left / right chevron buttons on the attendance pager already had accessible names for screen readers; now they also get pTooltip on hover/long-press for mouse + touch users, matching the convention the promotions pager picked up in v2.19.0.',
        ],
      },
      {
        heading: '🤖 Internal — release flow guard',
        bullets: [
          "For maintainers / contributors only. We added a CI required check (whats-new-pin-check) that fires on every develop → main release PR. It computes the version semantic-release is about to tag and fails the PR if whats-new.releases.ts's top entry or the newest docs/changelog/user-facing/v*.md filename doesn't match. Prevents the version drift that shipped v2.19.0 with a v2.18.5 whats-new label.",
        ],
      },
    ],
  },
  {
    version: 'v2.19.0',
    date: '2026-05-19',
    headline:
      'Bug-fix release with one user-visible feature: a Send test notification button on the Browser notifications card. Plus a handful of small UX corrections + the Claude-reviewer plumbing settling in.',
    sections: [
      {
        heading: '🔔 Send test notification',
        bullets: [
          'A new button under Browser notifications (in /dashboard/me/profile) lets you fire a one-shot test push to your registered device any time. Useful after a phone reboot, after Android revokes the browser\'s notification permission, or as a "did I actually wire this up right?" smoke check.',
        ],
      },
      {
        heading: '🎯 Athlete list & widgets',
        bullets: [
          'Tapping "Vedi tutti i N" on the Non-pagati widget now actually filters the athlete list to unpaid athletes. Before, the URL changed to ?paid=no but the list stayed full — silent no-op. Tap → list filters → URL stays consistent → refresh lands filtered.',
          'The Non-pagati widget no longer counts suspended / inactive athletes. Payment isn\'t expected from them, so listing them as "owes" was false signal. Same fix removes the Unpaid chip from those rows in the table — replaced with an em-dash placeholder (same as for owner-as-athlete rows).',
          'The Promotions tab pager (left / right chevron buttons) now has proper accessible names + tooltips on hover/long-press. Same convention as the attendance pager.',
        ],
      },
      {
        heading: '🥋 Academy feed',
        bullets: [
          'Going / Maybe RSVP buttons on event posts now follow the same chip styling as the reaction row. Before, they fell back to raw browser default <button> look because their styling class was orphaned — now they pick up the same border, focus ring, hover behaviour as Rispetto / Pray.',
          "The Going count no longer looks clickable when it isn't (false affordance). The number sits as a plain span next to the button, no cursor change on hover.",
        ],
      },
      {
        heading: '🤖 Internal — Claude reviewer plumbing',
        bullets: [
          "For maintainers / contributors only. The post-push code reviewer (Claude, introduced in v2.18.4) had a few rough edges: per-pass comment noise (three separate top-level comments per review), a bot-identity mismatch that broke the auto-resolve script, and a discovery that the workflow file needs to live on main for the action's safety guard. All settled now — the next round of PRs gets a single sticky reviewer comment that updates in place.",
        ],
      },
    ],
  },
  {
    version: 'v2.18.4',
    date: '2026-05-19',
    headline:
      'Internal maintenance release. No user-facing changes — the app looks and behaves exactly like v2.18.3. Everything below is build / tooling plumbing.',
    sections: [
      {
        heading: '🤖 Code review on PRs switched from GitHub Copilot to a Claude reviewer',
        bullets: [
          "For maintainers / contributors only — nothing to do as a user. PR code review now runs against a Claude reviewer that knows the repo conventions (the layered CLAUDE.md canons, the running .claude/gotchas.md mistake log) instead of a generic Copilot review. This catches the classes of bug we've shipped before — UNIQUE-constraint races, Carbon date overflow, ::ng-deep + absolute positioning losing on real iPhones, i18n key parity vs template-resolution drift — that Copilot's generic check missed.",
        ],
      },
      {
        heading: '🧹 One-line SCSS dead-code drop on the academy feed',
        bullets: [
          "A leftover padding-inline-start declaration on .feed__react-count had no effect after v2.18.3's reaction-counter rework. Removed. Zero pixel difference.",
        ],
      },
    ],
  },
  {
    version: 'v2.18.3',
    date: '2026-05-16',
    headline:
      'A second small pass of mobile-UX polish after testing v2.18.2 live on a phone. All on the academy feed. No new features.',
    sections: [
      {
        heading: '🥋 Academy feed: belt inline with the @handle, cleaner counters, no more overlap',
        bullets: [
          "The belt badge (e.g. 'Nera') on a post header used to fall to its own row below the @handle, which crowded the card. It now sits inline next to the @handle, in a smaller pill — same colour, less visual weight. Same fix carries to the avatars in the comments thread.",
          "The reaction counters used to read like 'Rispetto · 2' on the prod render because the small rounded count chip's leading edge looked like a leading dot. Counters are now plain inline numbers right after the label: 'Rispetto 2'. Tap the number to see 'chi ha reagito' (same as before).",
          'The comments icon at the bottom-right of a post used to overlap the Pubblica button when the comments thread was open — two interactive elements stacked on the same pixel. The icon now sits in the reactions row and stays put when the thread expands.',
        ],
      },
    ],
  },
  {
    version: 'v2.18.2',
    date: '2026-05-16',
    headline:
      'A small batch of mobile-UX polish fixes spotted while using the app on a phone the day after v2.18.1. Nothing changes about what you can do — the same screens, the same actions, just less rough at the edges on small viewports.',
    sections: [
      {
        heading: "🩹 Athlete detail: cleaner view when you've added yourself as an athlete",
        bullets: [
          "If you flipped 'Train at this academy' on, your own row in /dashboard/athletes used to surface three things that didn't apply to a self-row: an 'Invita al sistema' card (you already have an account), an email-change card (you've got your own flow at /dashboard/me/email-change), and a Payments tab (self-rows aren't billed).",
          'Those three are now hidden on your own self-row. Hitting the /payments URL on your own self-row redirects to Attendance instead of rendering an empty payments view.',
        ],
      },
      {
        heading: '🥋 Academy feed: tighter layout on phones',
        bullets: [
          "Event card dates like 'Martedì alle 19:00' now include the day-of-month — 'Martedì 19 alle 19:00' — so when the card scrolls past a few days after the post, 'which Tuesday?' is no longer ambiguous.",
          "The reactions row sits on a single line on phones. Each reaction chip carries its own counter (👏 Applauso 2); tapping the number opens the same 'chi ha reagito' sheet as before. The middot-separated summary pill is gone.",
          'The comments toggle becomes an icon-only floating button at the bottom-right of the card with a small badge showing the comment count. Mirrors the moderator trash button (top-right), keeps the row uncluttered.',
          'Less dead vertical space between the page header (Pubblica evento) and the first card.',
        ],
      },
      {
        heading: '🔔 Notification bell: cleaner panel on phones',
        bullets: [
          'The popover from the topbar bell used to render at the edge of the screen with an arrow pointing nowhere near the bell on narrow viewports. On phones it now opens as a clean edge-to-edge panel just below the topbar, no misleading pointer. Desktop is unchanged.',
        ],
      },
    ],
  },
  {
    version: 'v2.18.1',
    date: '2026-05-15',
    headline:
      'A patch release closing the three review follow-ups from v2.18.0 plus a small server-log hygiene fix. Only one user-visible change.',
    sections: [
      {
        heading: '🩹 "Train at this academy" toggle: correct state on any roster size',
        bullets: [
          'v2.18.0 shipped with a discovery bug: on academies with more than 20 athletes on the roster, the toggle on /dashboard/profile could show as OFF even when you were enrolled. Small rosters were not affected; bigger ones were.',
          "The toggle's initial state is now correct regardless of how many athletes you have on the roster.",
        ],
      },
      {
        heading: '🧹 Behind the scenes',
        bullets: [
          'Internal cleanup pass: clearer error envelopes on edge-case probes against the API, less misleading naming in the owner-as-athlete enrolment path, and a workflow annotation upgrade in the CI workaround. None of these produce a different user experience.',
        ],
      },
    ],
  },
  {
    version: 'v2.18.0',
    date: '2026-05-15',
    headline:
      "The owner-as-athlete frontend landed: you can flip a toggle on your profile and show up in your own roster, with an Owner chip to distinguish you from regular students. Two real-user pain points from this week's beta got fixed in the same release — a confusing generic error on the accept-invite form when the chosen password was too easy to guess, and the username field on /dashboard/me/profile being read as a password / nickname / required-character mash-up.",
    sections: [
      {
        heading: '🥋 Train at your own academy',
        bullets: [
          "Go to /dashboard/profile, find Train at this academy, flip it on. You appear in /dashboard/athletes as a White-belt active athlete, with an Owner chip next to your name so the row reads as 'this is staff training', not 'regular student'.",
          'Leaving the roster is symmetric: flip the toggle off. The row soft-deletes — your attendance and any belt promotions you logged for yourself are preserved if you ever re-enrol.',
          "Self-rows are excluded from the unpaid digest and the overdue-payment push, on purpose: you're not billing yourself.",
        ],
      },
      {
        heading: '🩹 Athlete-invite: clearer error when the chosen password is too easy',
        bullets: [
          "A beta tester filled the accept-invite form correctly but the panel surfaced only the generic 'Qualcosa è andato storto' — she had no way to know the problem was her password being on a public list of compromised passwords.",
          "The form now surfaces the actionable message instead: 'Questa password compare in liste di password compromesse — è troppo facile da indovinare. Scegline una più lunga o meno comune.', in both Italian and English. Same check we already apply at sign-up, password-reset, and change-password — now it is also visible at invite-accept time.",
        ],
      },
      {
        heading: '✨ Username field on /dashboard/me/profile: clearer, less surprising',
        bullets: [
          "The hint underneath the field was being read as a list of REQUIRED character types, when it actually lists what's optional. Reworded to separate the two: 'Solo lettere minuscole (le maiuscole verranno convertite automaticamente). Numeri, punti e underscore sono opzionali. Da 3 a 30 caratteri, deve iniziare con una lettera.'",
          "New sub-label under the field: 'Sarà il tuo identificativo pubblico, es. budojo.it/@eli_33' — a concrete URL example so the abstract idea of 'handle' becomes something you can picture.",
          "Auto-lowercase live as you type: write 'Eli' and you see 'eli' immediately. No more silent rejection when you press Save.",
          "The 'leave empty to remove' hint only shows when you already have a username set, so fresh users are not told they can remove something they don't have.",
        ],
      },
      {
        heading: '🧹 Behind the scenes',
        bullets: [
          'The PR-checks workflow is temporarily routing to a self-hosted runner while we sort out a billing snag with the cloud CI quota. Zero impact on the API or the SPA you see in the browser; reverts in a single PR by end of May.',
        ],
      },
    ],
  },
  {
    version: 'v2.17.0',
    date: '2026-05-15',
    headline:
      "Three more notifications close the year-long expansion: when an athlete on your roster uploads a new document, when somebody RSVPs to your event post, and a daily 09:30 heads-up when an active athlete has skipped their last three training sessions in a row (with a built-in 14-day cooldown so it doesn't become daily background noise). Behind the scenes, the Browser-notifications panel on /dashboard/profile now actually works on production — a config bug was sending the panel's API call to the wrong host. With the bundle of three you can finally enable browser-level push and start receiving notifications when Budojo isn't open.",
    sections: [
      {
        heading: '🔔 Three new owner alerts',
        bullets: [
          'An athlete uploaded a document — turns on the moment athlete self-upload lands; for now the trigger sits dormant.',
          'Someone RSVPed to an event you posted — fires when an attendee picks Going or Maybe, and again if they later swap between the two (a Going → Maybe swap is worth knowing about because it changes who you can count on). Toggling the same response off (un-RSVP) stays silent.',
          'Athlete missed several trainings — daily 09:30 heads-up when an active athlete has skipped the last 3 scheduled sessions. 14-day cooldown per athlete so you get the signal once, not every morning.',
        ],
      },
      {
        heading: '🩹 Browser notifications panel: now works on prod',
        bullets: [
          "The panel was calling the wrong host (the API runs on api.budojo.it, the SPA on budojo.it) and showing 'We couldn't load your subscription state' forever. Fixed across all three calls (fetch / subscribe / unsubscribe).",
          "Go to /dashboard/profile → Browser notifications → Enable. Accept the browser permission prompt. You're set.",
        ],
      },
      {
        heading: '✨ Notifications panel: tidied up',
        bullets: [
          "Toggle column is now vertically centred against each row's label/description, so a longer description doesn't push the switch out of alignment with the neighbouring rows.",
        ],
      },
    ],
  },
  {
    version: 'v2.16.0',
    date: '2026-05-14',
    headline:
      "Ten new notifications go live, plus a quiet-hours window for nights and weekends. Owners get pinged when an athlete on their roster completes signup, when someone comments or reacts to one of their posts, and when any new post lands in the academy feed. Athletes get a daily 07:00 reminder on training days (skipped if they've already checked in), receipts when payments are marked paid, gentle nudges when a fee is overdue or a medical certificate is about to expire, a congratulations push the day they earn a new belt, and a welcome email the moment they accept the academy invitation. The new quiet-hours window — set a start and an end hour on /dashboard/profile → Notifications, default off — suppresses out-of-tab pushes overnight while still recording them in the inbox so nothing's lost. Two smaller fixes ride along: /auth/register now reads as the gym-owner entry point (with an inline notice diverting athletes to ask their instructor for an invitation), and a self-heal recovery for the rare cold-start white screen after the app updated in the background.",
    sections: [
      {
        heading: '🔔 Ten new notification triggers',
        bullets: [
          "For academy owners (5): when an athlete on your roster completes signup; when someone comments on a post you authored; when someone reacts (clap / pray) to a post you authored; when any new post lands in your academy feed (events, belt promotions, future post types); plus a daily reminder when an athlete on your roster hasn't been marked present for the last 3 scheduled trainings.",
          "For athletes (5): a 07:00 push on training days (skipped if you've already been marked present), a T-30/T-7/T-0 nudge for your own medical certificate, a congratulations push when your instructor records a new belt for you, a receipt when your monthly fee is marked paid, and a gentle reminder on day 6 if it isn't paid yet.",
          'Plus a transactional welcome email the moment you accept an academy invitation — always sent, no opt-out gate (security/onboarding category).',
        ],
      },
      {
        heading: '🌙 Quiet hours',
        bullets: [
          'Set a start and end hour on /dashboard/profile → Notifications. Inside the window, push delivery is suppressed; inbox notifications still record so you catch up when the window ends. Email digests are untouched (they have their own send time).',
          'Default off — you opt in. Windows that wrap past midnight (e.g. 22:00 → 08:00) are handled correctly.',
        ],
      },
      {
        heading: "📝 Register page: clarify who it's for",
        bullets: [
          '/auth/register now reads "Open your academy account" with an inline aside diverting athletes to ask their instructor for an invitation.',
          'Two alpha testers had self-registered there as gym owners and ended up as orphan accounts (no academy, no athlete row). This closes the loop in copy + visual hierarchy so the mistake is harder to make.',
        ],
      },
      {
        heading: '🩹 TWA cold-start: synchronous <script> recovery',
        bullets: [
          'A stale service worker pointing the boot index.html at a deleted main-XXX.js bundle now triggers the same single-reload self-heal as a dynamic-import failure.',
          'The bug surfaced as a white screen after the TWA splash on first launch; the workaround was a manual pull-to-refresh. With this in place the SPA self-heals on the first error event from the failing <script> element.',
        ],
      },
    ],
  },
  {
    version: 'v2.15.0',
    date: '2026-05-14',
    headline:
      "Groundwork for multi-user academies. Today every academy is run by a single owner account; this release lays the wiring for a future where an academy can be run jointly by an owner plus admins, instructors, and assistants — each with their own role and their own scope of what they can do. The plumbing is in (database tables for memberships and invitations, a role-and-permission matrix that gates every action server-side, and a per-user 'which academy am I in right now' switch). What ships visible to you in this release is unchanged; the invitation flow and the academy-switcher in the top bar follow shortly. Alongside the groundwork, the attendance page picks up the same mobile filter sheet that the athletes list shipped in v2.14.0, and a fix to the closed-test Android app gets it past the Play Store verification step that was making it open inside an in-app browser bar.",
    sections: [
      {
        heading: '🧱 Multi-user foundation',
        bullets: [
          "Internal plumbing only in this release — no user-visible change to today's single-owner experience.",
          'Four building blocks landed: a membership table that links a user to an academy with a role; an invitation table for pending team invites; a per-user "active academy" pointer for the switcher to come; and a permission matrix (owner / admin / instructor / assistant) that every action checks server-side.',
          'The invitation flow ("invite a coach by email"), the topbar academy switcher, and a *budojoCan permission gate for the SPA follow in the next two releases.',
        ],
      },
      {
        heading: '🎛️ Attendance: mobile filter sheet',
        bullets: [
          'The class/belt dropdowns on /dashboard/attendance now collapse into a "Filters" chip with a bottom-sheet on phone widths — same pattern as the athletes list shipped in v2.14.0.',
          'Recovers vertical space for the actual attendance grid on phone. Desktop layout unchanged.',
        ],
      },
      {
        heading: '📱 TWA closed-test fix: assetlinks Play App Signing',
        bullets: [
          'assetlinks.json now carries the SHA-256 fingerprint of the Play App Signing certificate alongside the upload-key one. The TWA was rendering inside a Chrome Custom Tab (URL bar + X close button) instead of full-screen because Digital Asset Links verification was failing on the published track.',
          'Fix shipped to Cloudflare Pages — on next clear-data the installed app launches as a proper full-screen TWA.',
        ],
      },
    ],
  },
  {
    version: 'v2.14.0',
    date: '2026-05-14',
    headline:
      "Push notifications now actually fire end-to-end: three notification types (community reply, belt celebration, new event) deliver to your browser, tapping the OS notification deep-links you to the post in question, and a foreground push shows an in-app toast so the signal isn't lost when a Budojo tab is already open. The athletes list gains an undo: a new 'Cancellati' filter shows previously-deleted athletes with a one-tap Restore button — the athlete + their payment / attendance / promotion history comes back exactly as before; documents stay deleted (file wiped on delete, policy from v1.0) and the delete confirm now warns about that explicitly. On phone widths the three filter dropdowns on /dashboard/athletes collapse into a 'Filtri' chip + bottom-sheet, recovering ~80px of vertical space for the actual roster. And the offline experience finally lands you on our /offline page (with a Retry CTA + auto-recovery when connectivity returns) instead of Chrome's white error page — plus a 1-hour cache on the most-read endpoints so a flaky connection gives you stale-but-recent data instead of a hard failure.",
    sections: [
      {
        heading: '🔔 Push notifications now deliver and deep-link',
        bullets: [
          'Three notification types now fire a browser push (in addition to the inbox): community reply, athlete belt celebration, new academy event. Same opt-out gates from /dashboard/profile → Notifications cover BOTH channels.',
          'Tap the OS notification → the SPA opens or focuses an existing tab on /dashboard/me/feed#post-{id}.',
          'Foreground push (Budojo already open) → in-app PrimeNG toast instead of a system notification (browser convention to avoid double notice).',
        ],
      },
      {
        heading: '↩️ Restore a deleted athlete',
        bullets: [
          "New 'Cancellati' / 'Deleted' filter on /dashboard/athletes shows previously-deleted athletes with a one-tap Restore button per row.",
          'Restore brings back the athlete row + their payment / attendance / promotion history exactly as before.',
          'Documents are NOT restored — the file is wiped from disk on delete (policy unchanged from v1.0). The delete confirm now warns about this prominently so the trade-off is obvious before you tap.',
        ],
      },
      {
        heading: '🎛️ Mobile filter cluster: bottom-sheet',
        bullets: [
          'On phone widths the three dropdowns on /dashboard/athletes (Belt / Status / Paid) collapse into a "Filtri" chip with a badge showing how many filters are active.',
          'Tap the chip → a sheet slides up from the bottom with the dropdowns inside + Apply / Reset.',
          'Recovers ~80px of vertical space for the actual roster. Desktop (≥ 768px) layout unchanged.',
        ],
      },
      {
        heading: '📶 Offline experience: less Chrome, more Budojo',
        bullets: [
          'Network drops → you land on our /offline page (with a Retry CTA) instead of Chrome\'s "ERR_CONNECTION_ABORTED" white page.',
          'Connectivity comes back → the SPA auto-redirects to wherever you were trying to go.',
          'A short list of read-only endpoints (athletes list, your academy, community feed) keeps a 1-hour cache so a flaky connection gives stale-but-recent data instead of a hard failure.',
        ],
      },
    ],
  },
  {
    version: 'v2.13.0',
    date: '2026-05-14',
    headline:
      'Browser push notifications land. A new "Browser notifications" section on /dashboard/profile lets you opt in per device — click Enable on this device, accept the browser prompt, and from then on Budojo dings you with a system-level push the moment something happens, even with the app closed in another tab. The first notification type wired to the channel is the community-reply (someone replied to a post you previously commented on); more types — belt celebrations, new academy events — follow in the next release on the same opt-in surface. Devices you opt in from are listed in the panel and revocable individually, so you can sign in from a friend\'s computer once without locking yourself out of future pushes there. Works inside the installed Android app (Play Store install or Add to Home Screen); Safari requires 16.4+ and a PWA install.',
    sections: [
      {
        heading: '🔔 New: Browser push notifications',
        bullets: [
          'New "Browser notifications" section on /dashboard/profile — click Enable on this device, accept the browser prompt, get system-level pushes from then on.',
          'First wired notification: someone replies to a community post you previously commented on. More types (belt celebrations, academy events) follow.',
          "Each device opted in is listed and revocable individually — sign in from a friend's machine once without locking yourself out of future pushes there.",
          'Works inside the installed Android app (Play Store / Add to Home Screen). Safari requires 16.4+ AND a PWA install — older Safari sees a "not supported" notice instead of the toggle.',
          "Browser permission denial is non-recoverable from the SPA — re-enable from your browser's site settings if you clicked Block.",
        ],
      },
    ],
  },
  {
    version: 'v2.12.0',
    date: '2026-05-14',
    headline:
      "A short release focused on two things: a new public page at /account-deletion (and /account-deletion/it for Italian) that documents exactly how to delete your Budojo account — how to request it, what data is removed, what is retained for accounting / legal reasons, and the 30-day grace window during which you can cancel — added so the Play Store data-safety form has a public URL to point at. Nothing about the deletion machinery itself changed: the email-request flow, 30-day grace, and hourly purge cron have been live for several releases; the page just documents what already happens in plain language. Plus two small community-feed polish items reported on the v2.11.0 Android internal-testing build: explicit 0.5 / 0.75 rem 8dp-grid spacing on the RSVP and reactions button rows so they don't feel cramped on phone widths, and the lightest Fitzpatrick skin-tone modifier appended to every reaction emoji so 👏🏻 and 🙏🏻 render consistently across iOS / Android / the in-app WebView instead of falling back to the platform-default yellow.",
    sections: [
      {
        heading: '📜 New page: Account deletion',
        bullets: [
          'New public page at /account-deletion (English) and /account-deletion/it (Italian) explains how to delete your Budojo account: how to request it, what data is removed, what is retained for accounting / legal reasons, and the 30-day grace window.',
          'Mirrors the layout of /privacy and /sub-processors; not behind login — anyone can read it, including Play Store reviewers who need a public URL during policy review.',
          'The deletion machinery itself (email-request flow, 30-day grace, hourly purge cron) has been live for several releases — the page just documents what already happens.',
        ],
      },
      {
        heading: '✨ Community feed — small polish',
        bullets: [
          'More breathing room between the RSVP buttons (Going / Maybe) and between the reaction buttons (👏 / 🙏) on phone widths — they sit on the same 8-pixel grid as the rest of the design now.',
          'Light skin-tone modifier on the reaction emojis (👏🏻 and 🙏🏻) so they render consistently across iOS, Android, and the in-app WebView instead of falling back to the platform-default yellow.',
        ],
      },
    ],
  },
  {
    version: 'v2.11.0',
    date: '2026-05-13',
    headline:
      "A mobile-first overhaul: six list-heavy pages (athletes, daily attendance, monthly summary, athlete documents, athlete payments, expiring documents) now render as Apple-minimalist cards below 768px instead of horizontally-scrolling tables — every card is a thumb-friendly tap target with the same data and the same actions as the desktop row, just rearranged so the operator on the mat doesn't have to side-swipe. The mobile sidebar drawer gained the standard Android gestures: swipe-left dismisses it, tap-outside-when-open no longer scrolls the page underneath, and the drawer no longer rubber-bands on a vertical drag. The two-factor and API-tokens dialogs on /dashboard/profile now carry [breakpoints]={ '768px': '92vw' } so they fit phone viewports correctly instead of the old maxWidth: 90vw workaround. For the TWA APK on the Play Store: splash background is now #0A0A0B (matches the icon's black square) instead of the previous white that put a jarring black square in the middle of a bright screen — requires a Bubblewrap rebuild + reinstall to see. The mobile UX audit roadmap at docs/design/mobile-ux-audit.md is the source of truth for the remaining queue — at v2.11.0 we ship most of the table-to-card pass plus drawer + dialogs; the remaining items (filter bottom-sheet, offline fallback page) are queued for v2.12.0.",
    sections: [
      {
        heading: '✨ Six lists turn into cards on phone',
        bullets: [
          'Below 768px the tables that used to scroll sideways now render as cards. Same information, but the thumb scrolls vertically.',
          'Athletes (/dashboard/athletes) — Apple-style cards: name+age primary, belt + status + paid chips on a row, 3-dot menu for Edit / Delete. Tap the card → athlete detail.',
          "Daily attendance — one card per athlete, whole-card tap toggles 'present today' (same handler as the desktop row, keyboard equivalents on Enter / Space).",
          'Monthly summary — one card per athlete, count + percentage right-aligned.',
          'Athlete documents tab — type primary with download / delete on the header, filename in the middle, expiry / cancelled status badge at the bottom.',
          'Athlete payments tab — one card per month, Paid / Unpaid tag + amount + paid-on date, mark / unmark icon button on the right.',
          "Expiring documents — athlete name linked (tap → that athlete's documents tab) + download affordance, expiry status badge at the bottom.",
          'Desktop layout (≥ 768px) is unchanged — only the phone view changed.',
        ],
      },
      {
        heading: '✨ Sidebar drawer — native gestures',
        bullets: [
          'Swipe-left to dismiss — drag the open drawer to the left and it snaps closed (standard Android nav-drawer pattern; lands here too now).',
          'No more page scroll bleed-through when the drawer is open — iOS Safari + Chrome Android default behaviour, now suppressed.',
          'No more drawer rubber-band — the up/down bounce when you dragged inside the drawer past its scroll bounds is gone.',
        ],
      },
      {
        heading: '✨ Profile dialogs — correct fit on phone',
        bullets: [
          "The 'Two-factor authentication' and 'API tokens' dialogs on /dashboard/profile now size correctly below 768px (92vw with proper padding) instead of overflowing past the viewport edges.",
        ],
      },
      {
        heading: '🐛 Android APK splash',
        bullets: [
          "The TWA APK splash background now matches the icon's dark fill (#0A0A0B) instead of the previous white that put a jarring black square in the middle of a bright screen.",
          'Requires a Bubblewrap rebuild + reinstall to see — this is a TWA configuration change, not SPA code.',
        ],
      },
      {
        heading: '📐 Mobile UX audit roadmap published',
        bullets: [
          'New tracking doc docs/design/mobile-ux-audit.md lists every mobile gap row-by-row with 🟢 / 🟡 / 🔴 / ⚪ status.',
          "Still queued for the next release: filter clusters (belt / status / paid dropdowns) → bottom-sheet pattern, offline fallback page instead of Chrome's 'Site unreachable' default.",
        ],
      },
    ],
  },
  {
    version: 'v2.10.1',
    date: '2026-05-13',
    headline:
      "Same-day polish patch for two issues reported on the live feed right after v2.10.0 shipped. Promotions tab on /dashboard/athletes/{id} was rendering the raw i18n key (athletes.promotions.emptyBody) instead of the translated copy for any athlete with no recorded promotions yet — caused by the template referencing 'athletes.promotions.*' while the keys live under 'athletes.detail.promotions.*' in the translation files; ngx-translate's silent-key-fallback meant the bug shipped past every gate and only surfaced on the empty-state branch on prod. Fixed: empty + error states, 'First belt' label, 'stripes' suffix, and 'Recorded by {name}' line all render translated copy now. Reactions list polish: a middot separator between the 👏 and 🙏 counts in the summary pill so the counts read as distinct items, and the reactions sheet now dismisses naturally on tap-outside (the redundant X is gone; Esc still dismisses).",
    sections: [
      {
        heading: '🐛 Promotions tab: translated copy instead of the raw key',
        bullets: [
          "Opening an athlete's Promozioni tab on /dashboard/athletes/{id} showed the literal text 'athletes.promotions.emptyBody' for any athlete with no recorded promotions yet (i.e. anyone promoted before v2.10.0 shipped the history table).",
          "Cause: the template referenced 'athletes.promotions.*' but the keys live under 'athletes.detail.promotions.*' in the translation files — ngx-translate falls back to the raw key when the path doesn't resolve, so it shipped past every gate and surfaced on the empty-state branch only.",
          "Fixed: the empty state, error state, 'First belt' label, 'stripes' suffix, and 'Recorded by {name}' line now all render the EN / IT translated copy correctly.",
        ],
      },
      {
        heading: '✨ Reactions list — small polish',
        bullets: [
          "Middot separator between the 👏 and 🙏 counts in the summary pill ('👏 1 · 🙏 2') so the two counts read as distinct items, not one tight run-on.",
          'The reactions sheet now dismisses naturally on tap-outside (backdrop tap), and the now-redundant X button is gone. Esc still dismisses.',
        ],
      },
    ],
  },
  {
    version: 'v2.10.0',
    date: '2026-05-13',
    headline:
      "Two feature drops and one production fix, all driven by ideas sent back after v2.9.0 shipped. Reactions list: tap the count line under a post on the community feed and a sheet slides up listing every reactor with their name, handle, belt, and the emoji they picked (bottom-sheet on phones, centered dialog on desktop, tabs to filter just 👏 or just 🙏). Promotion history: every belt change AND every stripe change now records a dated row in the athlete's profile — open an athlete → Promotions tab and see the full ladder back to the first row, with who recorded each change. Stripe promotions also post to the community feed now (until now, only belt changes celebrated; stripe drops on a belt-up still don't celebrate because the belt-promotion post already covers it). Sidebar version on production now reads the actual release tag (e.g. 'v2.9.0') instead of 'Dev' — Cloudflare Pages' depth=1 clone was blinding git describe to the release tag, fixed by unshallowing in the build step.",
    sections: [
      {
        heading: '✨ Reactions list — see who reacted with what',
        bullets: [
          'When a post on the community feed has 👏 claps and 🙏 prays, the count next to each button tells you how many — but not who. Tap the count line under the post and a sheet slides up listing every reactor with their name, handle, and belt, plus the emoji they picked.',
          'Tabs at the top let you filter to just 👏 or just 🙏. On phones it lands as a bottom-sheet you can flick down to dismiss; on desktop it opens as a centered dialog.',
          "Reported by you as 'voglio vedere chi ha messo cosa come Facebook'.",
        ],
      },
      {
        heading: '✨ Promotion history per athlete',
        bullets: [
          "Every belt change AND every stripe change now records a dated row in the athlete's profile. Open an athlete → Promotions tab and you see the full ladder: 'White → Blue · 2025-09-14', 'Blue 0 → 1 stripes · 2026-02-03', 'Blue 3 → 4 stripes · 2026-04-21', all the way back to the first row.",
          'Each entry shows who recorded the change.',
          "Reported by you as 'vorrei che per ogni atleta ci si ricordasse di questi passaggi (giorno per lo meno) nella sezione profilo... cosi io owner ricordo quando ho dato la striscia a chi'.",
        ],
      },
      {
        heading: '✨ Stripe promotions also post to the feed',
        bullets: [
          "Until now, only belt changes auto-posted a celebration to the community feed. Stripe bumps were silent. Now a stripe increase fires its own feed post — separate from the belt-promotion post-type so the celebration text reads differently ('X earned their Nth stripe on the Y belt' vs. 'X earned a new belt').",
          "Stripe drops (4 → 0 when a belt goes up) deliberately don't celebrate — the existing belt-promotion post already covers it.",
          "Reported by you as 'vorrei mettere gli aggiornamenti/promozione di cintura nuova anche per le striscette'.",
        ],
      },
      {
        heading: '🐛 Sidebar version on production',
        bullets: [
          "The version label in the sidebar read 'Dev' instead of 'v2.9.0' on budojo.it production. Cloudflare Pages clones the repo with depth=1 by default, which made `git describe` blind to the release tag and fall back to the dev placeholder.",
          'Fixed by unshallowing the clone in the build step — the sidebar now shows the real version on every deploy.',
        ],
      },
    ],
  },
  {
    version: 'v2.9.0',
    date: '2026-05-12',
    headline:
      "A polish-and-fix follow-up to v2.8.0, all reported within hours of the v2.8.0 ship on the community feed. Three changes: notification toggles on /dashboard/profile no longer render the white knob overflowing the green track (iOS-shape: 1.5rem track + 1.25rem knob + 0.125rem gap, knob sits inside the pill in light + dark mode). Community feed dates flipped from formal 'May 12, 2026, 20:57:49' to locale-aware human formats — post + comment timestamps read 'now' / '5 min ago' / 'yesterday' / 'Sat at 10:30' / 'May 12' depending on age (it: 'adesso' / '5 min fa' / 'ieri' / 'sab alle 10:30' / '12 mag'); event start times read 'Today at 10:00' / 'Tomorrow at 10:00' / 'Saturday at 10:00' / 'May 16 at 10:00' depending on distance (24-hour time across both locales). Reaction counter rendered on the wrong button when a post had only 🙏 prays — fixed by exposing per-emoji counts from the server (clap_reactions_count + pray_reactions_count) and rendering each next to its own button.",
    sections: [
      {
        heading: '🐛 Notification toggles — knob inside the track',
        bullets: [
          'The toggle switches on /dashboard/profile → Notifications rendered with the white knob overflowing the green track on iOS Safari: the knob clipped past the right edge AND overhung the top + bottom of the pill.',
          "Two coupled regressions from v2.8.0's checked-state border + the Material preset's mismatched track / knob proportions. Fixed to an iOS-shape: 1.5rem track + 1.25rem knob + 0.125rem gap — the knob now sits inside the green pill with a small margin all around, in both light and dark mode.",
        ],
      },
      {
        heading: '✨ Human-friendly dates on the community feed',
        bullets: [
          "Post and comment timestamps no longer read like 'May 12, 2026, 20:57:49' — locale-aware buckets: 'now' / '5 min ago' / '3 hours ago' / 'yesterday' / 'Sat at 10:30' / 'May 12' / 'May 12, 2025' (it: 'adesso' / '5 min fa' / '3 ore fa' / 'ieri' / 'sab alle 10:30' / '12 mag' / '12 mag 2025').",
          "Event start times read 'Today at 10:00' / 'Tomorrow at 10:00' / 'Saturday at 10:00' / 'May 16 at 10:00' / 'May 16, 2027 at 10:00' (it: 'Oggi alle 10:00' / 'Domani alle 10:00' / 'Sabato alle 10:00' / '16 maggio alle 10:00' / '16 maggio 2027 alle 10:00'). 24-hour time across both locales — en-GB convention.",
          'Both flip live when you toggle the sidebar language.',
        ],
      },
      {
        heading: '🐛 Reaction count on the right button',
        bullets: [
          "A community post with two 🙏 prays + zero 👏 claps rendered the '2' counter on the Clap button — the wrong one. Cause: the feed only carried a single reactions_count total, attached to whichever button rendered first.",
          'Fixed by surfacing per-emoji counts from the server (clap_reactions_count / pray_reactions_count) and rendering each count next to its own button. Clap → Pray swaps update both buckets without a refresh.',
        ],
      },
    ],
  },
  {
    version: 'v2.8.0',
    date: '2026-05-12',
    headline:
      "A focused follow-up to v2.7.0: the community feed is now first-class for academy owners too. New /dashboard/community entry in the sidebar (chat-bubbles icon, between Stats and Profile) opens the same feed athletes see — belt promotions, events, comments, RSVPs. A 'Post event' composer button at the top lets owners post a new event in 5 fields (title required 1–120 chars; when via calendar + 24-hour time picker; where, details, max attendees all optional); the card lands at the top of the feed immediately and every academy member except the editor gets the new-event inbox notification. Owner moderation: a trash icon appears on every post (owners only — athletes don't see it) and on every comment (regardless of author). Tap → red Delete confirm → removed for everyone. Notification recipient fix: community_event_new now reaches the academy owner too (was silently skipping non-editor owners, vestige of the 'owner always IS the editor' assumption). One visible bug: the notification toggles on /dashboard/profile were half-purple / half-green on iOS Safari — fixed to a white knob on green track in both light and dark mode (matches the iOS Settings shape).",
    sections: [
      {
        heading: '✨ Owners now have the community feed in their sidebar',
        bullets: [
          'New Community entry in the dashboard sidebar between Stats and Profile (chat-bubbles icon). Tap it and you arrive on the same /dashboard/community feed your athletes see — belt-promotion celebrations, owner-posted events, comments, RSVPs.',
          'Owners can do everything an athlete can on the feed: 👏 Clap / 🙏 Pray reactions, write and delete their own comments, Yes / Maybe / No RSVPs on event posts.',
          'The athlete-portal feed under /dashboard/me/feed is unchanged. The two routes share the same backing component; the API has always been role-agnostic, the owner just hadn’t had a route into it before.',
        ],
      },
      {
        heading: '✨ "Post event" composer',
        bullets: [
          'Right above the feed, owners now see a "Post event" button. Tap it and a dialog opens with five fields: Title (required, 1–120 chars), When (calendar with a 24-hour time picker), Where (optional, up to 200 chars), Details (optional, up to 2000 chars), Max attendees (optional — leave empty for no cap).',
          'Hit "Post event" and the new event card lands at the top of the feed immediately. Every other academy member receives an inbox notification — the editor (you) is excluded, since you already see your own post in the feed. Default-on; opt-out lives on /dashboard/profile → Notifications.',
          'V1 ships create only — editing or cancelling an event is V2. Plan accordingly until then. If you mistype, delete the post via the new trash affordance (next section) and re-post.',
        ],
      },
      {
        heading: "✨ Owner moderation — delete posts and others' comments",
        bullets: [
          "A trash icon appears on every post header on the feed (visible only to owners — athletes don't see it).",
          'A trash icon also appears on every comment in every thread, regardless of who wrote it. The author had always been able to delete their own; owners now get the same affordance across the board.',
          'Tap the trash and you get a confirmation dialog with a red Delete button (Krug § Forgiveness for mistakes — no accidents). On confirm the post / comment is removed from the feed for everyone, and from your local view immediately.',
          "This was already the server-side rule (the owner has always been authorized to moderate their academy) — the dashboard just hadn't surfaced the affordance until now.",
        ],
      },
      {
        heading: '✨ Owners now receive the community_event_new notification',
        bullets: [
          'Until v2.8.0 the community_event_new inbox notification only reached athletes with a linked user account. Owners who weren\'t the editor of the event were silently skipped — a vestige of the "the owner always IS the editor" assumption.',
          'Recipient set is now "every academy user except the editor" — so in the multi-owner future the owner-side community surface is built for, every owner reads the inbox row about an event their co-owner posted.',
          "Owners still don't get notified about events they posted themselves (correct exclusion: the editor sees the new post they just made appear in their own feed).",
        ],
      },
      {
        heading: '🐛 Notification toggles — green track + white handle, no more split colour',
        bullets: [
          "The toggle switches on /dashboard/profile → Notifications were rendering with a half-purple, half-green split visible on iOS Safari: the track flipped to green correctly when on, but the round knob stayed full indigo from the Material preset's default.",
          "iOS toggles use a white knob on a green track regardless of system theme — that's the shape you'll see now, in light and dark mode (Apple HIG § Controls).",
        ],
      },
    ],
  },
  {
    version: 'v2.7.0',
    date: '2026-05-12',
    headline:
      "The biggest release since v2.0. Two new product surfaces land together: the athlete portal (every athlete can now sign in and see their own attendance / payments / documents / profile, plus a 'My academy' card) and the community feed (a Facebook-style timeline of academy life — auto-posted belt promotions, owner-posted events, reactions, comments, RSVPs). Three new community inbox notifications tie them together: community_reply (default-on, fires when someone replies to a thread you're in), community_event_new (default-on, fires when the owner posts a new event), and community_belt_celebration (default-OFF — wider blast radius, opt-in on /dashboard/profile). The owner-side dashboard is unchanged; the portal is purely additive — athletes you've already invited will see their version of the data starting next sign-in. Behind the scenes: race-safe reaction toggle on the (post_id, user_id, emoji) unique constraint, per-post Subject + switchMap as the canonical optimistic-UI pattern (reactions, RSVPs, comments all share the shape), belt-promotion auto-post via an #[ObservedBy] observer that skips console / seeder context, and a new defaultOff() mechanism on NotificationPreferences for opt-in categories.",
    sections: [
      {
        heading: '✨ The athlete portal — every athlete now signs in',
        bullets: [
          'Every invited athlete now has their own login and lands on /dashboard/me/profile — name, avatar, handle, belt, contact details. Edit mode (gear top-right) opens a clean reactive form with the same handle validation the owner-side uses (@mariobjj, lowercase, no consecutive / trailing dots).',
          "/dashboard/me/academy is a read-only 'My academy' card with the school name, owner, location, and the athlete's own membership status (joined date, current belt).",
          '/dashboard/me/attendance shows the athlete their own attendance log — month-by-month grid of training days, percentage attended, streak indicator.',
          "/dashboard/me/payments shows the athlete their own payment history, in the language's currency format (€1.234,56 for IT, €1,234.56 for EN), friendly month label, status pill.",
          '/dashboard/me/documents shows the athlete their own medical certificates and other documents with the expiry status pill (Valid / Expiring soon / Expired). The expired-today boundary is inclusive — a cert expiring today shows expired.',
          '/dashboard/me/feed is the new community feed (see below).',
          'The owner-side dashboard is unchanged. The portal is purely additive — athletes you already invited will see their version on next sign-in.',
        ],
      },
      {
        heading: '🎉 The community feed',
        bullets: [
          "/dashboard/me/feed is a timeline of academy life. Three kinds of post today: belt promotions (auto-created when an owner changes an athlete's belt — the celebration card carries the athlete's name + old belt → new belt, and is auto-deleted if you ever delete the athlete), events (open mats, seminars, in-house tournaments — owner-posted from a new API endpoint, with the SPA composer landing in a focused follow-up), and the foundation for free-form announcements.",
          "Every post carries the author badge — name, avatar, handle, and belt — using the same identity-line you see across the dashboard, with a short-fallback ('Mario R.') when no handle is set.",
        ],
      },
      {
        heading: '👏 Reactions',
        bullets: [
          'Tap 👏 Clap or 🙏 Pray at the bottom of any post. The button flips to its active state immediately (optimistic UI) and the count on the post updates.',
          'Tap the same emoji again to remove your reaction. Tap the other emoji to switch.',
          'Quick double-clicks are serialized server-side via a transaction + shared lock on the (post_id, user_id, emoji) unique constraint, so the row never ends up in a half-toggled state.',
        ],
      },
      {
        heading: '💬 Comments',
        bullets: [
          'Each post has a one-level Comments section that expands on tap. Write a comment (up to 500 chars), see it appear in the list, delete your own with the trash icon.',
          "The post's comment count updates inline as comments arrive or are deleted — no full refresh needed.",
        ],
      },
      {
        heading: '📅 Event RSVPs',
        bullets: [
          'Event posts carry three RSVP buttons: Yes / Maybe / No. Tap to commit, tap again to clear, tap a different one to switch.',
          'The headcount on the event card updates in real time as RSVPs flow in (optimistic locally, race-safe server-side).',
        ],
      },
      {
        heading: '🔔 New inbox notifications — community-flavoured',
        bullets: [
          "Someone replied to a thread you're in — community_reply, default-ON. When you comment on a post and someone else later comments on the same post, you get an inbox row pointing back to the thread. The author of the new comment never gets notified about their own post.",
          "Your academy posted a new event — community_event_new, default-ON. When the owner posts a new event to the feed, every athlete in the academy gets an inbox row deep-linking to the event card. The owner who posted it isn't notified.",
          'A teammate earned a new belt — community_belt_celebration, default-OFF. The every-athlete blast radius is wide enough that you have to opt in explicitly on /dashboard/profile → Notifications. Once on, every belt promotion in your academy lands as an inbox row (except for the one you recorded yourself).',
          'All three are gated server-side and surfaced as toggles in /dashboard/profile → Notifications, with the off-by-default one carrying a clear hint in the description copy. Toggles persist instantly with optimistic UI.',
        ],
      },
      {
        heading: '🔧 Owner-side event creation',
        bullets: [
          'Owners can now create events programmatically against a new API endpoint (the SPA composer lands in a focused follow-up). V1 ships create only — edit / cancel surfaces are V2. The endpoint accepts title (required, 1-120 chars), description (optional, max 2000), start date-time (required ISO 8601, normalised to canonical UTC), optional location text + lat / lon (V2 map view-ready), and max attendees. Only academy owners can post; athletes get a polite refusal.',
        ],
      },
      {
        heading: '🔧 Behind the scenes',
        bullets: [
          'Race-safe reaction toggle: read-then-upsert on the unique (post_id, user_id, emoji) constraint now runs inside a DB transaction with a shared lock + caught QueryException on concurrent races. Worth knowing for anyone wiring similar UI primitives.',
          'Optimistic UI as the canonical pattern: every interaction in the new feed (reactions, RSVPs, comments) is wired through a per-post Subject + switchMap that serializes rapid clicks and rolls back the UI on server error. Same shape across all three flows.',
          'Belt-promotion observer skips console / seeder context (no authenticated user to attribute), so seeded belt changes during db:seed never generate stale celebration posts.',
          "Default-off notification categories: the preferences system grew a new defaultOff() mechanism (consulted by NotificationPreferences::isEnabled for the absent-key fallback). community_belt_celebration uses it — absent-key recipients are NOT notified until they explicitly opt in. The SPA panel surfaces it with an 'Off by default' hint.",
          'Stable payload key set: community_posts.payload now carries a fixed shape per post type, pinned by a schema test. Adding a new post type or a new payload field touches both the factory and the schema test in the same diff.',
        ],
      },
    ],
  },
  {
    version: 'v2.6.1',
    date: '2026-05-11',
    headline:
      'A polish release. One small visible fix in the email-verification flow: the "Resend verification email" button on /auth/verify-error now shows a spinner and disables itself for the duration of the request (previously you clicked and got no feedback until the redirect / toast arrived at the end). The rest is behind-the-scenes — extracted a shared <app-verify-page> chrome across the three verify landing pages, dropped the leftover one-resident `Account/` namespace on the backend (controllers, actions, and form request all redistributed by consumer to Auth/User/), added Vitest coverage on five previously-untested Angular components (35+ new tests pinning state machines + error paths), and a /graphify knowledge-graph integration that surfaced the namespace-cleanup issues in this release as part of its diagnostic pass. Nothing visible in the dashboard from the internal work, but cleaner foundation for the next milestone.',
    sections: [
      {
        heading: "🐛 Email verify — resend button now shows you it's working",
        bullets: [
          'If a verification email link expired or got mis-clicked and you landed on the "Verification failed" page, clicking Resend used to give you no visible feedback for the full duration of the request — the button stayed bright and clickable, the page stayed put. Annoying enough that some people clicked twice; the app already ignored the second click via an internal re-entrancy guard, but from the screen you couldn\'t tell.',
          'Now: the button shows a spinner and disables itself for the whole duration of the resend request. Standard "your click registered, sit tight" feedback.',
        ],
      },
      {
        heading:
          '🔧 Behind the scenes — auth-chrome refactor + first test coverage on a stale corner',
        bullets: [
          "The three landing pages users hit after clicking a verification email (verify-success, verify-error, verify-email-change) used to ship three near-identical copies of the page chrome. Centred icon, title, message, CTA all live in one shared <app-verify-page> component now, with state-coloured icon variants. When the M7 athlete-invite verification link lands, it'll be a 5-line consumer of the same component instead of a fourth copy.",
          'PHP-side: the `App\\Http\\Controllers\\Account\\` namespace had exactly one controller in it (EmailChangeController) — left over from earlier rapid feature shipping. Split it so request + cancel (authenticated /me/* actions) live under User/, and verify (public token-based) lives next to the existing primary-email verify under Auth/. The Actions/Account/ namespace followed its controllers the same way. URLs unchanged.',
          "Five previously-untested Angular components got proper Vitest specs: VerifySuccess, VerifyError, AthletePortalWelcome, NotificationBell, AthleteInvite — 35+ new tests pinning their state machines, lifecycle hooks, branching logic, and error paths. They were Cypress-only before; now a future refactor can't silently regress them at the unit level.",
          'New /graphify slash command in the repo — it builds a navigable graph of the codebase (3.7k nodes, 4.6k edges) and the agent consults it before touching unfamiliar code. A post-commit hook keeps the graph current. Pure agent-side tooling, but it actually surfaced the two namespace-cleanup issues in this release.',
          "Project board hygiene pass alongside: 30 issues re-assigned to the right owner, every stale test-plan checkbox on closed PRs ticked or cleaned, two new entries added to the team gotchas file so the same trips don't happen twice.",
        ],
      },
    ],
  },
  {
    version: 'v2.6.0',
    date: '2026-05-11',
    headline:
      'A double-feature release: stronger sign-in security and a calmer dashboard surface. Two-factor authentication (TOTP + 8 single-use backup codes) is now opt-in from /dashboard/profile — scan a QR with any authenticator app, type the 6-digit code on next sign-in. A new bell icon in the dashboard topbar opens a 20-row notification inbox (each row deep-links to its source and flips read in one tap; "Mark all read" bulk-flips). A first-run "Getting started" checklist (5 steps: add athlete / log attendance / mark payment / upload document / view stats) lands on /dashboard/athletes for brand-new owners — self-dismisses when every step is ticked, or one-click dismiss with a confirm popup. New API tokens panel on /dashboard/profile lets you mint long-lived bearer tokens for scripts (abilities-scoped, optional expiry 1-730 days, plaintext shown ONCE with a copy + "save it now" gate). Compliance: medical certificates are now encrypted at rest with AES-256-GCM (separate key, rotatable independently of APP_KEY; pre-existing plaintext rows still readable), and a daily 03:15 Europe/Rome cron auto-purges any medical cert whose expires_at is more than 24 months in the past (DPIA § R6 enforced — same code path the athlete-removal cascade uses, file bytes + DB row both go). Behind the scenes: server-side Web Push subscription plumbing (push_subscriptions table + 3 endpoints + VAPID config) — the SPA toggle + delivery integration land in a focused follow-up.',
    sections: [
      {
        heading: '🛡️ Two-factor authentication',
        bullets: [
          'New "Two-factor authentication" panel on /dashboard/profile. Scan a QR with Google Authenticator / 1Password / Authy / any TOTP app, type the 6-digit code it shows, and 2FA is on. From the next login forward the password screen now asks for the code AFTER the password.',
          'You also receive 8 single-use backup codes on enrolment (XXXX-XXXX format, ambiguous-char-free alphabet). Save them in a password manager — each one works once if you lose your phone. The panel surfaces how many remain and lets you regenerate the set whenever you want.',
          "Disabling 2FA requires your current password (defense in depth — a stolen session can't strip 2FA from you).",
        ],
      },
      {
        heading: '✨ "Getting started" checklist on the dashboard',
        bullets: [
          'Brand-new owners landing after academy setup now see a 5-step checklist at the top of /dashboard/athletes: add an athlete, log attendance, mark a payment, upload a document, view stats.',
          'Each row has a "Show me" CTA that navigates to the right feature AND ticks the step done in one tap.',
          'The checklist self-dismisses once every step is ticked. There\'s also a small "Dismiss" link in the corner — one click + confirm and it\'s gone for good.',
        ],
      },
      {
        heading: '🔔 In-app notification center',
        bullets: [
          'A bell icon arrives in the dashboard topbar. Unread count badges on the bell; tapping it opens a 20-row panel with the latest notifications.',
          'Each row deep-links to the originating object (the athlete whose certificate is expiring, the payment month you haven\'t ticked yet) and flips to "read" in the same click. A "Mark all read" CTA at the top bulk-flips.',
          'The inbox surface ships today; the actual reminder fan-out (medical-cert expiry, unpaid-athletes digest) gets wired into the bell in a focused follow-up.',
        ],
      },
      {
        heading: '🔧 API tokens — scripted access to your data',
        bullets: [
          'New "API tokens" panel on /dashboard/profile lets you mint long-lived bearer tokens for scripts and integrations.',
          'Each token gets a name, a scoped subset of abilities (athletes:read, documents:write, payments:read, attendance:write, …), and an optional expiry (1–730 days).',
          'The plaintext bearer is shown ONCE at creation with a copy button and a clear "save it now, you won\'t see it again" gate. Lost a token? Generate a new one and revoke the old.',
        ],
      },
      {
        heading: '🛡️ Medical certificates encrypted at rest',
        bullets: [
          'Medical certificates are special-category health data under GDPR Art. 9. From v2.6.0 every new medical-cert upload is encrypted with AES-256-GCM before the bytes ever touch disk; decryption happens in memory at download time.',
          'The encryption key is separate from the app secret and rotatable independently — losing the document key without a backup means the encrypted files are permanently unrecoverable, so the runbook in docs/infra/production-deployment.md documents the procedure.',
          "Existing medical certificates uploaded before v2.6.0 stay plaintext and still serve correctly; we'll re-encrypt them in a future maintenance window.",
        ],
      },
      {
        heading: '🛡️ Auto-purge of expired medical certificates',
        bullets: [
          'The DPIA on medical certificates set a 24-month retention window. A new daily cron (03:15 Europe/Rome) sweeps every medical certificate whose expires_at is more than 24 months in the past and removes BOTH the database row and the file on disk.',
          'Federation registrations and ID copies are not touched — they have different retention rules.',
          'GDPR Art. 5 § 1 (e) ("kept for no longer than necessary") is now enforced by automation, not by a footnote.',
        ],
      },
      {
        heading: '🔧 Behind the scenes — browser push plumbing',
        bullets: [
          'Server-side: a push_subscriptions table + three endpoints on /me/push-subscriptions + VAPID config wiring. When the follow-up Profile toggle ships, the SPA will call PushManager.subscribe() and POST the envelope here.',
          'No user-visible surface yet — the bell icon is the channel users see today; browser push is an additional fan-out path for time-sensitive nudges like "medical certificate expires tomorrow" without forcing the tab to stay open.',
        ],
      },
    ],
  },
  {
    version: 'v2.5.0',
    date: '2026-05-10',
    headline:
      'A "security & notifications center" on your profile page. Four new sections, all on /dashboard/profile: (1) one-click cancel of a scheduled account deletion via the link in the confirmation email — no sign-in required, the page auto-strips the one-time token from the URL post-consume so it doesn\'t leak via screenshots or browser history; (2) an "Active sessions" panel listing every device with a live Sanctum session, friendly device label like "Chrome on macOS" or "Safari on iOS", last-used timestamp, "this session" pill on the current row, per-row revoke + a top-level "sign out other sessions" CTA — you can revoke the session you\'re currently using too, the next request from that tab gets signed out and you\'re bounced to login; (3) a "Login history" panel listing the last 50 sign-in attempts (successful AND failed) so a failed-login burst from a stranger doesn\'t go unnoticed — failed rows carry a subtle red wash + a "failed" pill, history is kept for 90 days then auto-purged, privacy policy at /privacy § 4 updated to disclose the retention window; (4) per-category email notification preferences for the digest emails (medical-cert reminders, unpaid-athletes monthly digest) with transactional emails (password reset, verification, etc.) listed in a read-only "always sent" block — toggles save instantly with optimistic UI, revert on rare save failures.',
    sections: [
      {
        heading: '🛡️ One-click cancel of a scheduled account deletion',
        bullets: [
          'When you click "Delete account" on /dashboard/profile, you enter a 30-day grace window before the data is permanently removed. Until now, cancelling that deletion required signing in again and clicking "Cancel" on the same profile page.',
          'The confirmation email now carries a "Cancel deletion" button. One tap, no sign-in. The account is restored, no data lost, and you land on a calm confirmation page that auto-strips the one-time token from the URL so it doesn\'t leak via screenshots or browser history.',
          'If you\'ve already cancelled (or the link is no longer valid because the account was already removed), the page tells you "no deletion is pending" instead of leaking which case you\'re in.',
        ],
      },
      {
        heading: '🛡️ Active sessions — see and revoke every signed-in device',
        bullets: [
          'New panel on /dashboard/profile lists every device with a live session: a friendly device label (e.g. "Chrome on macOS", "Safari on iOS"), the last time each session was used, and a "this session" pill on the row you\'re using right now.',
          'Each row has a "Revoke" button; the panel also has a top-level "Sign out other sessions" CTA for the "I forgot my laptop at the gym" flow.',
          "You can revoke the session you're currently using — the next request from that tab gets signed out automatically and you're bounced back to login.",
          'Older session names from before this release still show as "auth" or "athlete-invite-accept"; new logins re-mint with the friendly device label automatically.',
        ],
      },
      {
        heading: '🛡️ Login history — spot unfamiliar access at a glance',
        bullets: [
          'New panel below sessions lists the last 50 sign-in attempts on your account: successful logins AND failed ones. Failed attempts get a subtle red wash and a "failed" pill so they stand out — a burst of failed attempts from an IP you don\'t recognise is exactly the signal you want to catch.',
          'Each row shows the device label, the timestamp, and the IP address (when available). A footer hint links to the password-change form: "if something here looks unfamiliar, change your password and revoke the session".',
          'History is kept for 90 days, then automatically purged. The privacy policy at /privacy § 4 has been updated to disclose the retention window.',
        ],
      },
      {
        heading: '🛡️ Email notification preferences',
        bullets: [
          "Budojo sends a few digest / reminder emails per month: the medical-cert expiry reminder (daily, only when there's something to flag) and the unpaid-athletes monthly digest (16th of the month). Until now you received both with no way to opt out.",
          'The new "Email notifications" panel lets you toggle each category independently. Toggles save instantly; no "Save changes" button. On a rare save failure the switch reverts and a toast surfaces.',
          'Transactional emails (welcome, password reset, email verification, account-deletion confirmation, athlete invitation) are listed in a read-only "always sent" block — they\'re required for the service to work and can\'t be turned off.',
        ],
      },
    ],
  },
  {
    version: 'v2.4.0',
    date: '2026-05-10',
    headline:
      'A polish-and-plumbing release. Three visible iPhone fixes on the dashboard, plus a behind-the-scenes safety net so tabs stuck on an old version of the app stop staying stuck. Visible: (1) Profile page — the pencil affordance next to First name / Last name / Handle / Email no longer falls onto its own row below the value on iPhone; (2) Athletes list + Attendance — the age chip "35 y" no longer wraps to two lines on a tight column (now reads "35y"); (3) Athletes list + Attendance — kid-variant belt labels like "Green (kids)" no longer split with the colour on top and "(kids)" underneath. Invisible safety net: the dashboard now polls a version file every 20 minutes (and on every tab focus); if your tab is running an older bundle than the latest deploy, it clears its caches and reloads quietly so you land on the latest. For tabs already stuck on an old bundle, a recovery URL (https://budojo.it/?force-update=1) frees them in a single visit. Network blips during the poll never disrupt your work — the failure is silently absorbed.',
    sections: [
      {
        heading: '🐛 iPhone — pencil affordance no longer falls under the value on Profile',
        bullets: [
          'On /dashboard/profile, every editable row (First name, Last name, Handle, Email) shows the value plus a small pencil icon you can tap to edit. On iPhone-class viewports the pencil was rendering BELOW the value on its own line — the row read as "label / value / pencil" stacked vertically instead of "label / (value pencil)" as designed.',
          'Fixed by restructuring the row so value + pencil sit in a flex container; the pencil now sits on the trailing edge regardless of viewport width.',
          "This was a recurring report — the v2.1.0 polish sweep tried to fix it via absolute positioning, the iOS browser cascade silently ignored the rule, the bug came back. The new shape doesn't depend on cascade gymnastics so it should stick.",
        ],
      },
      {
        heading: '🐛 Athletes list — age chip and belt label no longer wrap to two lines',
        bullets: [
          'Age chip wrapped "35" and "y" onto two lines. The chip displayed the age followed by a literal space and a "y" (e.g. "35 y"); on a tight column the space broke and the chip rendered a digit on top, the "y" underneath. Now reads "35y" with no breakable space — fits on one line at any width.',
          'Belt label wrapped on the kid variants. Pills like "Green (kids)" were splitting on the space before "(kids)", rendering the colour on top and "(kids)" underneath. The pill now grows in width when needed instead of in height; one line at every viewport.',
          'Both fixes apply across the Athletes list AND the Attendance daily check-in page.',
        ],
      },
      {
        heading: '🛡️ Behind the scenes — your tab now reliably picks up new versions',
        bullets: [
          'The dashboard now polls a version file every 20 minutes (and every time you switch back to the tab). When the version doesn\'t match the one your tab is running, the tab quietly clears its caches and reloads on the latest version. No banners, no "click here to update" — it just lands.',
          "For tabs already stuck on an old bundle, we can now hand out a single recovery URL (https://budojo.it/?force-update=1). Visiting it once unsticks the tab without you having to clear browser data manually. We'll send this proactively to any customer flagged as stuck.",
          'Network blips don\'t disrupt your work. The version check is a background poll; if it fails (Wi-Fi drops, etc.) the tab stays exactly where you are — no false "you\'re offline" page.',
          "This is invisible if you've been refreshing normally; it's load-bearing for anyone who pinned the dashboard to their iPhone home screen and hasn't touched the tab in weeks.",
        ],
      },
      {
        heading: '🔧 Behind the scenes — post-v2.3.2 tech-debt sweep',
        bullets: [
          'The post-release sweep walked the canonical checklist (TODO comments, suppressions, outdated deps, doc drift, gotchas, memory). v2.3.2 was a small patch so the sweep was largely empty — one finding: a TODO comment in the account-deletion code referenced a closed issue. Repointed at the new follow-up (#545 — token-based "click here to cancel" email-link flow for pending account deletions). No code-behavior change.',
        ],
      },
    ],
  },
  {
    version: 'v2.3.2',
    date: '2026-05-10',
    headline:
      'A two-fix release plus a wave of behind-the-scenes legal-docs work. (1) Luigi reported that on /dashboard/attendance, sorting by belt was hiding every belt above white when there were more than 20 active athletes — there was no paginator and the per-page slice exhausted itself on white belts before any blue / purple / black belt could appear. The page now paginates at 20 per page, the paginator surfaces below the table when you have a roster bigger than that, and any filter / search / sort change snaps you back to page 1. (2) The privacy policy used to claim "daily database backups with 30-day retention" but the automated backup strategy is still being implemented before the first real production data lands. Reworded to "an automated database-backup plan planned to be implemented before any real production customer data is collected". Stopped over-promising; aligned the public claim with what the DPA template and infra runbook say internally. Everything else is invisible compliance + documentation hardening: a DPIA for medical certificates, an academy-offboarding runbook, the actual Play Store listing copy, and a fresh test layer pinning the medical-cert handling in the GDPR access + erasure paths.',
    sections: [
      {
        heading: '🐛 Attendance — sort-by-belt no longer hides the rest of the roster',
        bullets: [
          'Luigi (a customer) reported that with more than 20 active athletes and the table sorted by belt ascending, the white-belt cohort exhausted the per-page slice before any blue / purple / black belt could appear, so the rest of the roster was invisible. Filter strip changes had the same shape — narrowing on a belt and then sorting could drop you onto a phantom empty page.',
          'The page now requests one server-paginated slice at a time and binds the paginator chrome (page numbers + arrows below the table) to the result. You see the same paginator you already know from the main athletes list.',
          'Searching, filtering by belt, or clicking a sort header always snaps you back to page 1 — so a narrowing filter never leaves you on an empty page.',
          'The paginator only renders when you actually have more than 20 athletes; under that threshold the page looks identical to before.',
        ],
      },
      {
        heading: '🐛 Privacy policy — "daily backups" claim corrected',
        bullets: [
          'The bullet under § 5 ("Modalità di trattamento e misure di sicurezza" / "Processing methods and security measures") used to say "Backup giornalieri della base dati con retention 30 giorni" / "Daily database backups with 30-day retention". That was stronger than reality — the automated backup strategy is documented as an explicit prerequisite for real production customer data, but it isn\'t yet active.',
          'Reworded to "Piano di backup automatizzato della base dati in implementazione prima della raccolta di dati reali in produzione" / "An automated database-backup plan planned to be implemented before any real production customer data is collected." Points at the DPA template § 8 and the production-deployment runbook for the technical decision (DigitalOcean Managed DB vs mysqldump cron vs droplet snapshots) that\'s still being made.',
          'Transparency-improvement, not a security regression — nothing about how your data is handled changed; only what we say about it. The actual backup strategy is the next item on the production-readiness checklist.',
        ],
      },
      {
        heading: '🔧 Behind the scenes — legal docs + medical-cert test coverage',
        bullets: [
          "DPIA-lite for medical certificates (Data Protection Impact Assessment, GDPR Art. 35) lives at docs/legal/dpia-medical-certificates.md. It walks through the risks, mitigations, and the strategic A-vs-B choice between keeping medical-cert PDFs inside Budojo (with encryption + audit) vs storing only valid yes/no + expiry and letting the academy's own storage hold the file. Recommendation is option B until traction; the choice itself is still pending.",
          'Academy-offboarding runbook at docs/operations/academy-offboarding.md walks the manual procedure for when an academy customer ends the contract — three windows (T-30 notice, T0-T+30 grace export, T+30 purge) with explicit steps for each.',
          'TWA runbook rewritten so it describes the actual /.well-known/assetlinks.json flow (static file under the SPA bundle, edited via PR, served by Cloudflare Pages) instead of the retired Laravel-routed env-driven implementation deprecated in v2.3.1.',
          'Play Store listing copy drafted in English and Italian at docs/mobile/play-store-listing.md, including the Data Safety questionnaire answers — so when the Android app ships, the listing is paste-ready.',
          "Medical-certificate test coverage added to the GDPR Art. 15 export and Art. 17 erasure flows. The flows already did the right thing; the tests pin the behavior so a future refactor can't silently regress the special-category-data handling.",
        ],
      },
    ],
  },
  {
    version: 'v2.3.1',
    date: '2026-05-08',
    headline:
      'A small follow-up on the v2.3.0 release earlier today. One visible fix: the Profile photo card on /dashboard/profile was missing internal padding, so the avatar + "Profile photo" / Replace / Remove block was flush against the card edges. Restored the same padding shape as the Change password and Your data sections below. The other change is invisible — the file Chrome reads to validate the upcoming Android app (/.well-known/assetlinks.json) was being served from the API host when it actually needs to live on the SPA host. Moved to a static file under the SPA bundle.',
    sections: [
      {
        heading: '🐛 Profile photo card padding',
        bullets: [
          'The avatar block on the Profile page was rendering with no internal padding — the photo, the "Profile photo" label, the format hint, and the Replace / Remove buttons were tight against the card border. Now sits at the same internal-padding rhythm as the Change password and Your data cards directly below it.',
        ],
      },
      {
        heading: '🔧 Behind the scenes — TWA assetlinks moved to the SPA host',
        bullets: [
          "A small architectural correction on the v2.3.0 Android-app groundwork. The previous release shipped the /.well-known/assetlinks.json endpoint as a Laravel route at api.budojo.it, but Chrome's TWA verifier reads that file at the SAME ORIGIN as the PWA manifest — which lives on budojo.it (Cloudflare Pages, static), not api.budojo.it (Laravel). The endpoint was in the wrong place. Moved to a static file under the SPA bundle so Cloudflare Pages serves it from the edge directly. Invisible to existing users; unblocks the upcoming Android app once the signing keystore + Bubblewrap build land.",
        ],
      },
    ],
  },
  {
    version: 'v2.3.0',
    date: '2026-05-08',
    headline:
      'A preparation release for the Android app coming next. Most of what shipped is plumbing — the foundation an installable Android APK needs to look and feel native. The one user-visible add: when you install Budojo as a PWA on Android, long-pressing the launcher icon now offers three quick shortcuts so you can jump straight into a workflow without going through the dashboard first.',
    sections: [
      {
        heading: '📱 PWA shortcuts on Android',
        bullets: [
          "When you've installed Budojo as a PWA on an Android phone (or you've added it to your home screen on iOS), long-pressing the launcher icon opens three quick shortcuts: Athletes — jumps straight to the roster, Today's attendance — jumps to the attendance day view, Add athlete — opens the create-athlete form. Saves a tap or two on the most-frequent flows when you've got the app pinned to your home screen.",
        ],
      },
      {
        heading: '🔧 Behind the scenes — Android APK groundwork',
        bullets: [
          "The server now serves /.well-known/assetlinks.json, the Digital Asset Links record an Android Trusted Web Activity (TWA) shell needs to enter fullscreen mode (no URL bar visible — looks like a real native app). This is invisible until the actual APK ships, but it's the foundation: without it the upcoming Android app would render with the URL bar visible on top of the dashboard.",
          'A separate runbook (docs/mobile/twa-runbook.md in the repo) walks the engineer through generating the signing keystore, scaffolding the Bubblewrap project, building the APK, and uploading to Play Store internal testing. The next release will carry the actual Android app.',
        ],
      },
      {
        heading: '🧹 Other',
        bullets: [
          'PWA manifest gains categories (business / productivity / sports) — feeds into the Play Store listing for cleaner store-tab placement once we ship.',
          "display_override for progressive display-mode fallback — TWA prefers standalone, falls back through minimal-ui to browser if the host Chrome can't honour fullscreen.",
          'prefer_related_applications: false — defensive against Chrome cross-recommending another app over Budojo.',
        ],
      },
    ],
  },
  {
    version: 'v2.2.0',
    date: '2026-05-07',
    headline:
      'A polish-heavy release. The Profile page got a top-to-bottom rework so it reads exactly like the Academy detail card you already know — same row rhythm, same spacing, same edit affordance. The Athletes list now shows little Facebook and Instagram icons next to each athlete who has those links on file. And a handful of small input bugs from the v2.1 polish round are now properly fixed: the Cmd-K magnifier is back at the optical center of the search bar, the eye toggles on the change-password fields are visible everywhere, and the "two email fields, which one do I edit?" confusion on the athlete edit form is gone.',
    sections: [
      {
        heading: '✨ Athletes list — Facebook + Instagram icons inline',
        bullets: [
          "Social icons on each athlete row — when an athlete has facebook or instagram filled in, you'll see the matching icon directly under their name on the list. Click it and the profile opens in a new tab. Athletes without socials show nothing — no empty placeholders, no clutter.",
          'Same look as the academy card. This mirrors the social-link chips on the academy detail page; the visual treatment, hover state, and tooltip are identical.',
          "Click on the icon doesn't open the athlete. The icon's link is its own affordance — tapping the Instagram icon takes you to Instagram, not into the athlete page. Tap the name itself for the athlete detail.",
        ],
      },
      {
        heading: '🎨 Profile page — convergence on the Academy card design',
        bullets: [
          'Same card chrome as Academy detail. The Profile page used a slightly different card style than the Academy page (different border, different padding, different label rhythm). Both pages now share the exact same card primitive — a clean rounded container with a hairline border, hairline separators between rows, and consistent typography for labels and values. Side-by-side they look like siblings, not cousins.',
          'First name + Last name show as separate rows. Two clean rows ("First name" / "Last name") instead of one combined two-column block. Each carries its own pencil — clicking either opens the same combined edit form so the editing ergonomics are unchanged.',
          'The "Email verified" row is gone — replaced by an inline green tick. A dedicated row that just said "Email verified" with a green badge was visual noise for the 99% case. Now when your email is verified you see a small green checkmark next to the email value itself. The full Verification row only shows up when there\'s actually something to do — i.e. when the email is pending verification, with the "Resend verification email" button right there.',
          "Mobile layout fixed. On phones, the pencil affordance was wrapping below the value as an orphan affordance. It now sits cleanly at the top-right corner of each row regardless of the value's length.",
          "Edit tab first on the athlete detail. When you open an athlete, the tabs are now Edit | Documents | Attendance | Payments (was Documents | Attendance | Payments | Edit). Edit is the most-frequent action on a freshly-opened athlete; it gets the leftmost tab so it's the default reach.",
          'Athlete edit form drops the duplicate Email field. Editing an existing athlete used to show an Email row in the form even though the dedicated "Account & invitation" card above already let you change it (with the proper verification flow on linked accounts). The duplicate is gone — the Account card is the single canonical email editor on the detail page. Creating a new athlete still asks for email up-front, of course.',
        ],
      },
      {
        heading: '🐛 Input polish — Cmd-K and password fields',
        bullets: [
          "Cmd-K magnifier optically centered. The leading magnifying-glass on the Cmd-K palette and on the help-page search drifted a couple of pixels below center because of how the icon font's baseline interacts with our pill chrome. The cap is now a proper grid container with the glyph optically centered regardless of the icon font's quirks.",
          'Eye toggles on Change password are back, everywhere. The "show / hide" eye icons next to Current / New / Confirm passwords were silently missing on some browsers because of how PrimeNG 21\'s SVG icon component interacts with our pill-style overrides. Geometry is now bulletproof; eye is visible at the right edge of every password field.',
        ],
      },
      {
        heading: '🧹 Behind the scenes',
        bullets: [
          "Design-system audit + canonical icon-scale tokens. A doc walk-through of the SPA's UI surfaces shipped alongside this release cataloguing inconsistencies and proposing canonical patterns. The audit's icon-scale step (5 sizes — xs / sm / md / lg / xl) shipped as design tokens; per-surface migrations onto the scale will land in subsequent focused releases.",
          'Dependency hygiene. Routine semver-safe bumps for the Angular 21.2.x cohort, libphonenumber, and devDeps (eslint, prettier, vitest, typescript-eslint). No behavior change.',
        ],
      },
    ],
  },
  {
    version: 'v2.1.0',
    date: '2026-05-07',
    headline:
      "This release leans into account safety. Picking a new password — at sign-up, after a forgot-password reset, or rotating from your profile — now shows a live strength meter as you type, plus a check that the password hasn't shown up in any known credential leak. Two visual fixes round it out: the Cmd-K search bar no longer overlaps its magnifier icon, and the eye-toggle icons on the change-password fields are back where they belong.",
    sections: [
      {
        heading: '🔐 Stronger passwords — strength meter + known-leak check',
        bullets: [
          'Live strength meter as you type. Every password field where you set a new password — registration, forgot-password reset, and the profile change-password section — now shows a small bar that lights up from grey to red to amber to green as the password gets stronger. The grading uses the same model behind major password managers, so an easy password (your name, a date of birth, "qwerty123") reads weak even when it\'s long enough to satisfy the basic length and character checks.',
          'Known-leak check. Passwords that have appeared in any major credential leak are rejected with an inline "this password has appeared in a known data leak — pick another" error. The check is privacy-preserving by design: when you submit your password to Budojo (at sign-up, password reset, or password rotation), our server hashes it and forwards only a tiny anonymous prefix of that hash to the third-party breach database — never the full hash, never the password itself. The match against the leaked-password list happens locally on the prefix bucket the breach service returns. Budojo never stores your password in plaintext.',
          'Same rules everywhere. Whatever you can use at sign-up is what you can use at password reset and at password rotation — no surprise "this used to work but now doesn\'t" between flows.',
        ],
      },
      {
        heading: '🐛 Visual fixes',
        bullets: [
          'Cmd-K search no longer overlaps the magnifier. On desktop the placeholder text "Search athletes by name…" was running into the leading magnifying-glass icon. Both now sit cleanly side by side.',
          'Eye-toggle icons back on Change password. The three "show / hide" eye icons next to Current password, New password, and Confirm new password were silently missing after a recent design refresh. Restored on the right edge of each field.',
        ],
      },
      {
        heading: '🧹 Behind the scenes',
        bullets: [
          'Design system refresh. Refreshed brand-kit assets (wordmark, glyph, the full PNG export set) plus a few small token tweaks ship in this release. No visible change to existing screens; every new screen built after this lands consistent with the latest design canon.',
        ],
      },
    ],
  },
  {
    version: 'v2.0.0',
    date: '2026-05-07',
    headline:
      'This release wraps three meaningful UX upgrades plus a quiet schema refactor that finally aligns owner accounts with the way the rest of the app already thinks about people. The version bump to 2.0.0 is mostly about that schema move — your account is now stored as first name + last name (instead of a single combined string), and a new optional @handle has been added if you want one. Existing accounts are migrated automatically: nothing changes visually unless you decide to set a handle.',
    sections: [
      {
        heading: '⌘ Cmd-K — search any athlete from anywhere',
        bullets: [
          "Press Ctrl+K (Windows / Linux) or ⌘K (Mac) anywhere in the dashboard and a search bar pops in the middle of the screen. Type three characters of an athlete's name and you get up to 20 matches in real time, sorted alphabetically by last name. Hit Enter or click a row to land on that athlete's detail page; press Escape to dismiss without leaving the page you were on. Way faster than scrolling the roster when you're trying to look someone up between classes.",
          'Belt + status alongside the name so two athletes with similar names are easy to disambiguate at a glance.',
        ],
      },
      {
        heading: '✉️ Change your email — for yourself and for your athletes',
        bullets: [
          "Owner self-edit on /dashboard/profile. A pencil now sits next to the email row. Click it, type the new address, confirm, and we send a verification link to the new email. Until you click that link, your existing login email stays exactly as it is — the change only applies once you've proven the new address is reachable. A heads-up email lands at the OLD address too, so if a change request was made without your knowledge you can react before it goes through.",
          "Athlete-side email change from the detail page. Same pencil affordance on each athlete row, but smart about state. If the athlete hasn't been invited yet, we just update the contact email. If they have a pending invitation, we revoke the old invite link and issue a fresh one to the new address — no orphaned links left around. If they've already accepted and have an active account, the same verify-the-new-address flow above kicks in for them.",
          'Mistakes are recoverable. Mistype a new email and click Save? The old address keeps working until somebody clicks the link in the verification email — and that link goes to the address you typed. So a typo locks nobody out; the worst case is "the verification email never arrives and you go set the right email when you notice".',
          '24-hour verification window, then the link expires and the pending change is dropped silently. Cancel a pending change at any time from the same row.',
        ],
      },
      {
        heading: '👤 Account — split first / last name + Instagram-style handle',
        bullets: [
          'First name + Last name as separate fields. The single name field is gone. On the registration form, on /dashboard/profile, on the athlete invite-accept page — you\'ll see two fields now. Existing accounts were migrated automatically by splitting on the first space, so "Mario Rossi" became Mario + Rossi, "Maria De Luca" became Maria + De Luca. If your account ended up with a quirky split (single-word names like "Cher", or unusual phrasings), open /dashboard/profile and fix it in three seconds.',
          'Optional @handle. A new "Handle" row sits below your name on the profile page with its own pencil. Pick anything from 3 to 30 characters, lowercase letters / numbers / dots / underscores — the rules are spelled out under the input as you type. Has to start with a letter; no double dots; must be unique across all of Budojo. Empty by default — only set one if you want one. Today the handle just shows on your profile; future releases will use it for things like mentions and shareable profile links.',
          'Friendlier mail greetings. Welcome and notification emails now start with "Hi <first name>" instead of the full legal name — feels more personal, especially in a martial-arts context. Audit / legal emails (account-deletion confirmation, support tickets) keep the formal full-name shape.',
        ],
      },
      {
        heading: '🐛 v1.19.0 follow-ups — invitation card error mapping',
        bullets: [
          'Owner-side invite errors now show the right message. A subtle wire-shape mismatch on /athletes/:id/account-invitation-card meant the "this email is already a Budojo user" and "athlete has no email on file" cases were falling through to a generic toast. Both now render the dedicated friendly copy, the way they do on the rest of the app.',
          'Profile-name whitespace bug. Typing only spaces on the inline name edit no longer trips a server 422 — the validator now catches the empty-after-trim case locally and shows the same "name is required" inline error you\'d see on a truly empty input.',
          'OpenAPI schema typo. The sent_at field on the invitation block was documented as nullable but always emitted as a string — the spec now matches the actual contract.',
        ],
      },
    ],
  },
  {
    version: 'v1.19.0',
    date: '2026-05-06',
    headline:
      'Two follow-ups to the v1.18 athlete-login first-slice land in this release. The owner-side button to invite an athlete from the detail page — flagged as "queued for the next release" in v1.18\'s release notes — is now wired and live. And on the personal-account side, you can finally edit your own display name without contacting support.',
    sections: [
      {
        heading: '🥋 Athlete invitation — owner-side button',
        bullets: [
          'Invite an athlete from the detail page. Open any athlete in your roster who has an email on file and you\'ll see a new "Account & invitation" card under the header. One click sends the invite email; the card flips to an "Invitation sent on … expires …" chip with "Send again" and "Revoke" buttons next to it. When the athlete eventually accepts the invite, the same card switches to "Athlete registered on …" so you know the round-trip closed.',
          'No-email empty state. When the athlete has no email on file, the card shows a short explanation pointing you at the email field on the edit form — rather than a disabled button with no context. Add the email, come back, and the Invite button shows up.',
          'Anti-mistake guards. The "Revoke" button asks you to confirm before pulling the link, so a slipped click doesn\'t lock the athlete out. Sending the invite to an email that\'s already a Budojo user returns a friendly "ask them to sign in instead" message instead of a generic error.',
          'Localized. Every label, chip, toast and confirm copy ships in English and Italian, switching live with the sidebar locale toggle. The expiry / sent dates render in DD/MM/YYYY format keyed off your active language.',
        ],
      },
      {
        heading: '👤 Account — edit your own name',
        bullets: [
          "Inline edit on /dashboard/profile. Your display name now has a small pencil icon next to it. Click it, type the new name, hit Save — that's it. The new name shows up immediately on the topbar avatar fallback and anywhere else the SPA reads your name from. Cancel restores the previous value without a network round-trip.",
          'Email change deferred. Changing the email address is the heavier half of the same flow — it needs a verify-the-new-address email round-trip and a "pending change" banner so we can be sure you actually own the new address. That part lands in a future release; for now, the email row stays read-only.',
        ],
      },
      {
        heading: '🛠 Behind the scenes',
        bullets: [
          'Two Italian phrases that leaked into v1.18\'s English release notes (this same page) are fixed — "Invita al sistema" → "Invite to the system", "Contatta il supporto" → "Contact support".',
          "A non-production safety net for outbound mail: in any environment that isn't production, every email is redirected to a single test address rather than the real recipient. Means a misconfigured staging deploy can't accidentally ship real onboarding mail to real customers. Fully invisible in production — no behavior change on the real app.",
        ],
      },
    ],
  },
  {
    version: 'v1.18.0',
    date: '2026-05-05',
    headline:
      'Two themes in one release. The two "talk to us" pages folded into a single support channel — fewer choices, screenshot attachment in the right place, app version + browser info attached automatically. And the first slice of the athlete-side login lands: an academy owner can now invite a roster athlete by email, the athlete clicks, sets a password, and shows up in Budojo as themselves. The full athlete dashboard pages (own attendance / payments / documents) come next milestone.',
    sections: [
      {
        heading: '🥋 Athlete login — first slice',
        bullets: [
          'Invite an athlete from the system. On any athlete in your roster who has an email on file, the API now accepts an "Invite to the system" call that emails them a one-click link to set a password and land in Budojo as themselves. The link is valid 7 days; clicking it twice returns a friendly "already accepted, sign in instead" page. The owner-side button that wires this into the athlete detail UI is queued for the next release — for now the API + the athlete-side flow are live.',
          "Athlete-side accept page. The link in the invite email opens at /athlete-invite/{token} — a focused, single-task page that shows the athlete's name + email pre-filled (read-only), asks for a password and the same privacy + ToS checkboxes as registration, and on submit auto-logs them into Budojo. If the link is expired / revoked / already accepted, a friendly error page suggests signing in or asking the academy for a new invite.",
          'Welcome page. After accepting the invite the athlete lands on /athlete-portal/welcome — a simple "your account is ready, the rest of the athlete dashboard ships next milestone" placeholder. The full athlete-side pages (Profile / My academy / My attendance / My payments / My documents) are intentionally deferred so we can ship the schema + onboarding flow safely first.',
          "Owner experience: unchanged. The dashboard, the sidebar, every existing screen — all identical. The new athlete users are kept in their own URL space and behind their own role gate, so an owner that doesn't use the invite feature notices nothing.",
          "Public registration stays owner-only. Athletes can NEVER self-register through the public sign-up form — the only way into Budojo as an athlete is through an academy owner's invite. Hard rule, deliberately not negotiable in this release.",
        ],
      },
      {
        heading: '💬 One contact channel instead of two',
        bullets: [
          '"Send feedback" is gone. The dedicated /dashboard/feedback page has been retired and folded into /dashboard/support. Same destination inbox, same private routing — but a single sidebar entry under "Contact support" instead of two near-identical ones. The icon in the sidebar changes from a life-ring to a speech-bubble to match the friendlier tone.',
          'A new "Feedback" category. When you\'d rather share input than ask for help, pick the Feedback category — same form, same place, but the support team filters by category so they can prioritise. Five categories now: Account / Billing / Bug / Feedback / Other.',
          'Screenshot attachment migrated. The screenshot upload that lived only on the old feedback form is now part of the support form. Drop in a PNG / JPEG / WEBP up to 5 MB and it lands attached to the email we receive — same as before, just in the new place.',
          'App version + browser info auto-attach. Your current Budojo build tag and your browser / OS info are now stamped onto every support submission automatically. You no longer have to type "v1.16.4 on Chrome 120 / Android 14" into the body — it\'s in the email metadata when we receive it.',
        ],
      },
      {
        heading: '🛠 Behind the scenes',
        bullets: [
          'The API endpoint /api/v1/feedback is gone. The single /api/v1/support endpoint now accepts the optional screenshot via multipart/form-data and reads the X-Budojo-Version header that the SPA stamps on every API call. Public OpenAPI spec updated accordingly.',
          "New users.role enum (owner | athlete) + an athlete_invitations table. The discriminator gates every existing dashboard route — owners go to /dashboard, athletes go to /athlete-portal — so the two personas can't accidentally trip over each other's screens.",
          'The invite token never leaves the database in plaintext. We store a SHA-256 hash; the raw URL-safe token only exists in the email body and the request URL. The accept endpoint hashes the URL-presented token and looks up by hash, so a database read leak does not yield live invitations.',
        ],
      },
    ],
  },
  {
    version: 'v1.17.0',
    date: '2026-05-05',
    headline:
      'A heavy account-and-trust release. Eight features land together: a brand-new help / FAQ page, a dedicated support contact form, change-your-password from the profile, upload your own avatar, plus the legal scaffolding (Terms of Service + cookie banner + cookie policy) Budojo needs before serving customers in the EU. On the resilience side: a friendly server-error page, an offline page, and the login form now rate-limits brute-force attempts.',
    sections: [
      {
        heading: '🆘 Help & support',
        bullets: [
          'In-product help & FAQ. A new public /help page collects every common question — "how do I add an athlete", "what does the medical-certificate digest do", "how do I export my data" — into a single searchable list. Type any keyword (English or Italian) and the matching answers surface as you type. Lives in the sidebar under "Help".',
          'Dedicated support form. A new /dashboard/support page lets you file a request directly with the team. Pick a category (account / billing / bug / other), write a subject + a description, and it lands in our support inbox. Replies come back to the email on your account, so you can keep the conversation in your usual mailbox.',
        ],
      },
      {
        heading: '👤 Account',
        bullets: [
          'Change your password. A "Change password" entry on the Profile page lets you rotate your password without the forgot-password email round-trip. Asks for your current password as a re-auth gate, then for a new one twice. Every other active session on your account (other browsers, other devices) is signed out as a precaution; the tab you\'re using stays signed in.',
          'Upload your own avatar. The circular avatar in the top-right corner used to be your initials. You can now upload a real photo from Profile → Edit avatar — browse-and-upload, replace it any time, or remove it to fall back to initials. Renders in the topbar and on the profile page.',
        ],
      },
      {
        heading: '⚖️ Legal & compliance',
        bullets: [
          'Terms of Service page. A new public page at /terms carries the Service Agreement, with an Italian version at /terms/it. Both pages link to each other and follow the same layout as /privacy and /sub-processors.',
          'Acceptance gate on registration. The sign-up form now asks you to tick a checkbox accepting the Terms of Service alongside the existing privacy-policy checkbox. Existing accounts are unaffected.',
          'Cookie consent banner. A first-visit banner explains what storage Budojo writes to your browser and lets you accept all, reject non-essential, or open a "Customise" dialog with per-category toggles (essentials always on, preferences / analytics / marketing opt-in). Your choice is remembered so the banner does not keep popping up.',
          'Cookie policy page. A new public /cookie-policy page (Italian at /cookie-policy/it) documents every category in detail — what we store, why, how long, and how to change your mind. Same chrome as the other legal pages.',
        ],
      },
      {
        heading: '🛡️ Resilience',
        bullets: [
          'Login rate limit. The sign-in form is now capped at 5 password attempts per minute from the same network — past that you wait a minute before trying again. Closes the door on automated password-guessing without being noticeable to a real user fat-fingering their password a few times.',
          'Server-error landing page. A new /error route renders a clear "something went wrong" page with a "Try again" button and a link back to the dashboard, in place of the browser\'s stack-trace screen for hand-typed deep-links or link-outs from monitoring.',
          'Offline page. A new /offline route shows a friendly "you\'re offline" message with a "Retry" button. The SPA\'s network interceptor sends you here when a request fails with no network at all, and the page lives outside the dashboard shell so it works even before the dashboard chunk has loaded.',
        ],
      },
    ],
  },
  {
    version: 'v1.16.0',
    date: '2026-05-04',
    headline:
      'The biggest release since the original Documents launch. Six new emails wired end-to-end via a real queue worker, a stuck-on-old-bundle bug class closed at the Service Worker layer, plus polish on the legal pages and the date pickers.',
    sections: [
      {
        heading: '📧 Emails everywhere now',
        bullets: [
          'Forgot password. A "Forgot your password?" link on the sign-in page sends a recovery link to your inbox; click → set a new password → sign in. Tokens are one-shot and expire after 60 minutes.',
          'Welcome on sign-up. A friendly welcome email when you create your account, with a link straight to the academy-setup wizard. Goes out alongside the existing email-verification message.',
          'Account-deletion confirmation. When you click "Delete account" in your profile you now get an email confirming the request, the scheduled execution date (30 days out), and a clear path to cancel by signing back in. Removes the "did Budojo register my deletion?" anxiety.',
          "Medical-certificate expiry digest. A daily 9:00 AM email per academy listing every athlete whose medical certificate hits the 30 days, 7 days, or 0 days remaining thresholds. The digest only fires when there's actually something to chase — quiet weeks stay quiet.",
          'Unpaid-athletes monthly digest. On the 16th of each month at 9:00 AM, a digest listing every active athlete still unpaid for the current month. Pre-15 most customers settle in the typical month-start window, so emailing earlier would just be noise. Suspended and inactive athletes never appear in the chase-list.',
          'Localised dates in the picker. When you switch the SPA to Italian, the calendar pop-over now reads in Italian too — January / February becomes Gennaio / Febbraio, weekday abbreviations follow suit. Previously the picker ignored the language switch.',
        ],
      },
      {
        heading: '🛡️ Stuck-on-old-bundle: closed at the Service Worker layer',
        bullets: [
          'A reported recurring annoyance — "I have to clear browser cache manually to see the new version" — turned out to be the Angular Service Worker entering its SAFE_MODE state during the v1.14.x blank-page hotfix run. Once a worker is in SAFE_MODE, the auto-reload logic shipped in v1.10.0 is silently inert: the version check never resolves, the auto-reload never fires, the user is stranded on the old bundle forever.',
          "Fix: when the SW signals it's unrecoverable, the SPA now unregisters every active worker and reloads the tab. The next request hits the network directly, picks up the latest deploy, installs a fresh SW, and the user is back on current. No manual cache clear needed.",
          "The Cloudflare worker also stamps no-cache headers on the SW manifest + the SPA shell — defence in depth so the file the SW polls for new versions can't be served stale by any intermediate cache.",
        ],
      },
      {
        heading: '🇮🇹 Italian /sub-processors page',
        bullets: [
          'The GDPR Art. 28 sub-processor disclosure now has an Italian translation at /sub-processors/it, mirroring the English page at /sub-processors. Both pages carry a language toggle so an Italian customer landing on the English URL can flip without re-navigating. Same pattern as /privacy ↔ /privacy/it from earlier this year.',
        ],
      },
      {
        heading: '🧹 Behind the scenes',
        bullets: [
          "Internal tooling: /prereview and /feedback-digest slash commands for project-local Claude workflows. Pre-push diff review by a fresh sub-agent, plus a customer-feedback batch synthesizer. Doesn't change anything you see.",
          'Tech-debt sweep run after v1.15.0 — small doc-drift fixes, a few new gotchas captured. No user-visible change.',
          'M5 milestone PRD checked in alongside M3 / M4 — gives the deploy walkthrough a permanent anchor for future contributors.',
        ],
      },
    ],
  },
  {
    version: 'v1.15.0',
    date: '2026-05-04',
    headline:
      'The marketing surface finally gets a real product shot, and the underlying cause of the v1.14.x blank-page hotfix run is closed at the Cloudflare edge — a structural fix rather than another patch on top.',
    sections: [
      {
        heading: '🖼️ Landing page: real product screenshot in the hero',
        bullets: [
          'A real screenshot replaces the placeholder. The home page (/) used to show a soft-coloured tile with the Budojo glyph in the centre as a stand-in until we had real captures. The hero now carries an actual phone-shaped screenshot of the Stats → Attendance heatmap with the Apex Grappling demo data — dense, glanceable, immediately recognisable as a working product.',
          'One strong shot, not a carousel. We picked the heatmap because it carries the most visual personality of any of the dashboard screens; the rest stays out of the hero so the page reads at a single glance. Multiple-image galleries can come back if conversion data ever justifies them.',
          '50 KB on the wire. The screenshot ships as a WebP image at quality 82, properly sized for high-DPR phones. No layout shift while it loads — the slot has fixed dimensions so the rest of the page paints first and the image fills in cleanly underneath.',
        ],
      },
      {
        heading: '🛡️ Stale-chunk blank page — closed at the Cloudflare layer',
        bullets: [
          'Recap. The v1.14.1 → v1.14.2 → v1.14.3 hotfix chain chased the same symptom (a blank dashboard after a deploy with a stale browser tab open) from three different angles. v1.14.2 added a frontend self-heal that recovers a stale tab via a one-time reload; v1.14.3 fixed an unrelated null-check on the Stats page. This release closes the actual upstream cause: how the Cloudflare CDN was responding to requests for files that no longer exist on the deploy.',
          'Direct cause. Cloudflare was configured to return our home page (HTML) with a 200 status code for any unknown path, including missing JavaScript chunk files. A browser asking for a missing chunk would receive an HTML page, fail to parse it as JavaScript, and crash the dashboard to blank. The Cloudflare layer now correctly returns a 404 for missing chunks and only serves the home page as a fallback for actual page-navigation requests (when you paste a deep link into a fresh tab, for example).',
          "Defence in depth. The frontend self-heal added in v1.14.2 stays in place. With this Cloudflare-level fix the self-heal should no longer ever trip in normal conditions; if it does, it indicates a different cache-mismatch class we haven't anticipated — and the safety net still recovers the page cleanly.",
          'Invisible if your tab is current. If your browser was running v1.14.3 or later, this release looks identical to before — the upstream fix simply removes the conditions under which the v1.14.x bug could fire again.',
        ],
      },
    ],
  },
  {
    version: 'v1.14.3',
    date: '2026-05-04',
    headline:
      'The actual fix for the Stats page blank-on-first-click that v1.14.1\'s preload change tried — and failed — to nail. Clicking "Stats" in the sidebar after navigating around the dashboard now lands on the page first time, every time, with no detour through F5.',
    sections: [
      {
        heading: '🐛 Stats blank page on first in-app navigation — fixed',
        bullets: [
          'Direct cause: a defensive `?` missing in one place. The Stats parent page reads the active tab from the current URL the moment it mounts. Under certain timings — specifically when entering Stats from another dashboard page, with the new "preload everything" behavior from v1.14.1 — the route information the page reads from is briefly in a half-built state. The previous code assumed it was always fully populated and crashed silently on the missing field, leaving the dashboard chrome on screen and the content area blank.',
          'Three more `?` characters and the chain falls back gracefully. With the fix, every step of the lookup is now optional, so any transient half-state cleanly falls back to the default "Overview" tab and the page renders normally on first try. Hard refresh (F5) is no longer required.',
          'Regression-pinned. A new test simulates the exact half-built route state that crashed prod and asserts the page still renders cleanly. So if a future change re-introduces the same shape of bug, CI catches it before it reaches you.',
        ],
      },
      {
        heading: "🧹 Behind the scenes (continuing v1.14.2's work)",
        bullets: [
          'v1.14.2 shipped an auto-recovery safety net for stale-bundle navigation failures (see the v1.14.2 entry below). That code is unrelated to this fix and stays as belt-and-braces for a different class of cache-related failure.',
        ],
      },
    ],
  },
  {
    version: 'v1.14.2',
    date: '2026-05-04',
    headline:
      'A behind-the-scenes safety net. No user-visible feature changes; just an extra layer that catches a class of cache-related navigation failures and self-heals automatically with a single page refresh, instead of leaving the app stuck on a blank screen.',
    sections: [
      {
        heading: '🛡️ Auto-recovery from stale-bundle navigation failures',
        bullets: [
          "Self-heal on stale chunks. If the app's main bundle in your browser ever ends up out of sync with the deployed code (a rare consequence of the way our hosting serves the SPA shell), a navigation that would previously have crashed silently to a blank page now reloads the tab once and recovers. You'll see a brief flash; afterwards everything works normally.",
          "Anti-loop guards. Two layers — one in-memory, one persistent across the reload — make sure the page can't get stuck in a refresh loop. If a single recovery attempt doesn't resolve the issue, the app stops reloading and surfaces the original error in the developer console rather than re-trying forever.",
          '30-second auto-rearm. After 30 seconds without crashing, the persistent guard clears itself, so a long-lived browser session can recover again on a future deploy mismatch.',
        ],
      },
    ],
  },
  {
    version: 'v1.14.1',
    date: '2026-05-04',
    headline:
      "A small follow-up release on top of v1.14.0's brand-new Stats section. One visible fix — clicking Stats the first time after signing in no longer flashes a blank page — plus a handful of behind-the-scenes polish-ups so the new endpoints behave consistently with the rest of the API.",
    sections: [
      {
        heading: '🐛 First-click blank page on Stats — fixed',
        bullets: [
          'Pre-warmed Stats bundles. After v1.14.0, the very first click on the Stats sidebar entry occasionally rendered a blank page that disappeared on a refresh. Cause: the Stats page is built from two lazy bundles that had to land back-to-back before the page could paint, and the second one was sometimes still in flight when the router called for it. The app now warms the Stats bundles in the background as soon as the dashboard finishes loading, so by the time you click Stats both pieces are already in the browser cache and the page renders instantly.',
          "Snappier first clicks elsewhere. Side benefit of the same fix: every other section's first click — Athletes, Attendance, Payments — feels a little snappier too, because their bundles are pre-warmed in the background by the same mechanism.",
        ],
      },
      {
        heading: '🧹 Behind the scenes',
        bullets: [
          'API error envelope consistency. The stats endpoints (/api/v1/stats/attendance/daily, /api/v1/stats/payments/monthly) used to fall back to Laravel\'s default HTML error page in the rare case where an authenticated user had no academy attached. They now return the same {"message":"Forbidden."} JSON envelope every other authenticated endpoint emits, so the SPA\'s error handling reads them uniformly.',
          "Locale helper centralised. The pieces of the heatmap that format dates and short month names now flow through a single localeFor() helper instead of a hand-rolled 'it' ? 'it-IT' : 'en-US' ladder. No visible change today; the cleanup makes adding a third or fourth language (Spanish + German on the roadmap) a one-line edit instead of a hunt-and-update sweep.",
          "Test coverage on the new locale paths. Two new unit tests pin the heatmap's tooltip + month label output in both English and Italian — so a future regression that re-introduces the wrong locale is caught in CI, not by a beta tester.",
        ],
      },
    ],
  },
  {
    version: 'v1.14.0',
    date: '2026-05-03',
    headline:
      'The headline this month: a brand-new Stats section in the dashboard. See your academy at a glance — belt distribution, the IBJJF age-division histogram, an attendance heatmap that paints the last twelve months at once, and a monthly revenue chart. Plus a small swap on the home dashboard: the "8/9 · 87%" attendance counter becomes a proper progress knob, and the whole app now formats currency and dates according to the language you\'ve chosen, so an Italian user reads "€50,00" / "3 mag 2026" instead of "€50.00" / "May 3, 2026".',
    sections: [
      {
        heading: '📊 New Stats page',
        bullets: [
          '/dashboard/stats is live. A new entry in the sidebar opens a four-tab surface: Overview, Athletes, Attendance, Payments. Each tab paints a single chart that answers one question — no dense tables, no exports to wrangle.',
          'Overview tab — belt distribution. A doughnut chart of every belt on the roster, ordered by the canonical IBJJF rank progression (kids → adults → senior coral / red). Hover any slice to see the absolute count and the percentage of the academy.',
          'Athletes tab — IBJJF age divisions. A histogram across all 13 IBJJF age-divisions (Mighty Mite through Master 7) with the count of athletes whose age today falls in each band. Empty divisions still show as zero so you read the full distribution at a glance. Athletes with no date of birth on file are surfaced as a separate "missing date of birth" footnote so the histogram numbers stay honest.',
          'Attendance tab — yearly heatmap. A GitHub-contributions-style heatmap of daily check-ins, with a 3 / 6 / 12 month range selector. Each cell is hued by month so the chart reads as a rhythm of the year, not just intensity. Hover any cell to see the date and the count for that day.',
          'Payments tab — monthly revenue. A bar chart of revenue per month over the trailing 12 months (extendable to 24). Buckets with no payments still appear at zero so the chart is continuous instead of punctuated by gaps.',
        ],
      },
      {
        heading: '🥁 Attendance counter — knob instead of "8 / 9"',
        bullets: [
          'Knob in place of "8 / 9 · 87%". The home-dashboard attendance widget swapped its text counter for a proper PrimeNG progress knob. Same data, but a glance at the curve tells you "near full" or "half empty" without doing the percent math in your head. The text count stays inside the knob so anyone wanting the exact ratio can still read it.',
        ],
      },
      {
        heading: '🌍 Locale-aware formatting',
        bullets: [
          'Currency. Italian users see "€50,00" with a comma, English users see "€50.00" with a dot — without ever leaving the page. Toggling the language flips every monetary amount the SPA prints (Payments tab, athletes-list paid badges, monthly summary).',
          'Dates. Same treatment for dates and short month names — "3 mag 2026" in Italian, "3 May 2026" in English (we use the British format because it\'s day-first, like Italian, while keeping English vocabulary). Day-first ordering is consistent across the whole app instead of mixing US-style "May 3, 2026" into Italian sentences.',
          'Reactive. The toggle takes effect live — no reload, no second tab refresh.',
        ],
      },
      {
        heading: '🐛 Stats fixes (same release)',
        bullets: [
          'Heatmap fills correctly on first paint. The cell colors now resolve immediately when the page renders, instead of briefly painting as flat grey before the per-month hue lands.',
          'Charts read with one consistent color. Bars and slices were briefly using a rotating palette; they\'re now monocolor against the academy\'s primary accent, so a glance at the chart tells you "this is one academy" rather than "this is twelve unrelated categories".',
          'No more redirect race after login. Logging in and landing on the dashboard occasionally raced against an in-flight chart fetch; the redirect path is now serialised so the chart always paints from a known state.',
        ],
      },
    ],
  },
  {
    version: 'v1.13.0',
    date: '2026-05-03',
    headline:
      'The headline this month: the dashboard now speaks Italian everywhere. v1.12.0 covered the pages you use day-to-day; v1.13.0 finishes the job — every screen, every form field, every tooltip and dropdown reads in Italian when you toggle the language. After this release there is nowhere left in the dashboard where Italian users see English by mistake.',
    sections: [
      {
        heading: '🌍 Italian translation completes the dashboard',
        bullets: [
          'Athlete detail tabs. Open any athlete and the four sub-tabs read in Italian end-to-end: Documenti (column headers, "Aggiungi documento", download/elimina tooltips, empty states), Presenze (the eyebrow, the "X / Y giorni" counter, the prev/next-month buttons, the day-cell screen-reader labels), Pagamenti (the "Pagamenti — 2026" title, the no-fee hint, every column header and button, the "Segna pagato" / "Annulla pagato" actions), and the header itself (the back link "Atleti", the joined-on date, the contact-link aria-labels).',
          'Athlete form, every label. Add or edit an athlete and every visible label reads in Italian: Nome, Cognome, Telefono (with the country-code dropdown showing "+39 Italia / +33 Francia / +44 Regno Unito / …"), Cintura (Bianca / Blu / Viola / Marrone / Nera / Rossa e nera / Rossa e bianca / Rossa), Stato (Attivo / Sospeso / Inattivo), the address fieldset with localised placeholders. The "Aggiungi atleta" / "Modifica atleta" titles and the "Crea atleta" / "Salva modifiche" buttons match the action being performed.',
          'Validation messages too. Submit a form with empty required fields and the inline errors come back in Italian: "Il nome è obbligatorio", "L\'email non è valida", "Il prefisso è obbligatorio se inserisci un numero", "Il CAP deve essere di 5 cifre". Every guard the form runs has a translated message — no more English errors mixed into Italian forms.',
          'Sidebar fix. "Academy" in the sidebar was still reading in English even on the IT locale because the translation key was missing. Now reads "Accademia" as it should.',
          'Reactive language toggle. The dropdowns (belts, statuses, country codes) all update live when you flip the language — no need to refresh the page.',
        ],
      },
      {
        heading: '🛠 Behind the scenes',
        bullets: [
          "Cloudflare deploy reliability. A configuration drift between our internal commit conventions and the release tagging tool meant some urgent fixes weren't producing a tag (silently). Sorted — every commit type the team uses now produces a tag and a release entry on the right cadence.",
          'Frontend dependency refresh. Angular runtime + tooling moved up to the latest patch level (21.2.11 / 21.2.9) and the test environment jumped a major version (jsdom 28 → 29). No visible behaviour change; foundation for the bigger Cypress + TypeScript bumps still on the roadmap.',
        ],
      },
    ],
  },
  {
    version: 'v1.12.0',
    date: '2026-05-02',
    headline:
      'The headline this month: the dashboard speaks Italian. Every screen you use day-to-day — Profile, Athletes, Attendance, Documents, Academy — flips between English and Italian with a single toggle in the sidebar. And Budojo finally has a public landing page at the root URL, so prospects landing on budojo.app see what the product is before being asked to log in.',
    sections: [
      {
        heading: '🌍 Italian translation across the dashboard',
        bullets: [
          "Sidebar language toggle, EN ↔ IT. Pick your language once from the sidebar and the whole dashboard flips: buttons, table headers, filter dropdowns, tooltips, confirm dialogs, toast messages, error states, empty states. The choice persists per device — close the browser, come back tomorrow, and you're still in the language you picked.",
          'Five areas covered. Profile (your account page), Athletes list (titles, filters, sort tooltips, paid badges, mark-paid / mark-unpaid confirms), Attendance (daily check-in + monthly summary + the home-dashboard widget), Documents (the cross-athlete expiring list and its dashboard widget), and Academy (the read-only detail page + the edit form, including the training-days picker).',
          'Locale-aware month names. When you toggle to Italian, the "Paid · Apr" column header reads "Pagato · apr", and the mark-paid confirm dialog reads "Segnare Mario Rossi come pagato per maggio 2026?" instead of mixing English month names into Italian sentences.',
          'Italian belts and statuses respect the IT register. "Cintura blu" not "Belt blu", "Sospeso" / "Inattivo" / "Attivo" with masculine agreement (atleta is the implicit subject), "Pagato" / "Non pagato" for the paid status. Nothing reads like a machine translation.',
        ],
      },
      {
        heading: '🚪 Public landing page',
        bullets: [
          'Visit budojo.app and see the product. The root URL now serves a public landing page explaining what Budojo does, with clear "Log in" and "Sign up" entry points. Previously the root redirected straight to the login form, which read as cold to prospects and gave first-time visitors no context for what they were logging into.',
          "Logged-in users are unaffected. If you're already authenticated, the landing page sends you straight to the dashboard the same way the old root did. Bookmarks to dashboard URLs keep working unchanged.",
        ],
      },
    ],
  },
  {
    version: 'v1.11.0',
    date: '2026-05-01',
    headline:
      'The headline this month: a new "Unpaid this month" widget on the dashboard home, so the second half of the month tells you who you still need to chase. Plus a couple of cosmetic polishes — payment rows no longer jump in height, the date pickers across the app finally read as a single rounded control.',
    sections: [
      {
        heading: '🛟 Chasing payments',
        bullets: [
          '"Unpaid this month" widget on the dashboard home. New tile on the dashboard, alongside the expiring-documents tile and the monthly-attendance tile. Shows you a count of athletes who haven\'t paid the current month yet, plus the first 5 names as direct links to each athlete\'s Payments tab. Tap "View all" to land on the athletes list filtered to the unpaid set. The widget appears from the 16th of the month onwards — first half is "still early"; second half is "actually chase". Hidden completely if the academy doesn\'t track payments through Budojo (no monthly fee configured = no widget).',
        ],
      },
      {
        heading: '🐛 Cosmetic polishes',
        bullets: [
          'Payments tab — finishing the row-height fix from v1.10.0. v1.10.0 promised the Payments tab rows would line up; in practice the future-month rows (the ones with a dash placeholder) still rendered visibly shorter than the rows with an icon button. The dash placeholder now matches the icon-button height exactly, so paid / current-month / future-month rows are all the same height and the table reads as a clean grid.',
          'Date pickers read as one control. Every form field with a calendar icon (Date of birth, Joined, Document expires_at / issued_at, daily attendance) now renders as a single rounded outer shell instead of two visually-detached pieces. Hover and focus light up the whole composite, not just the input.',
        ],
      },
    ],
  },
  {
    version: 'v1.10.0',
    date: '2026-05-01',
    headline:
      'A new way to talk back to us, plus a pair of behind-the-scenes upgrades that mostly fade away — which is the point.',
    sections: [
      {
        heading: '🛟 In-app feedback',
        bullets: [
          "Send feedback right from the dashboard. A new \"Send feedback\" entry sits in the sidebar (just above What's new). Open it, write a subject + a description, optionally drop in a screenshot, and it lands directly in our inbox. The current app version and your device info are attached automatically — so when something looks off, you don't have to remember which version you're on or which browser you're using.",
        ],
      },
      {
        heading: '⚡ Auto-update',
        bullets: [
          "The app refreshes itself when a new version ships. Until now, Budojo would keep running the bundle that was cached on your device until you hard-refreshed the page. From now on, when a new version is available the app activates it and reloads on its own — including a periodic check during long sessions on a phone. Trade-off: if a reload happens while you're mid-form, anything you hadn't saved is lost. Forms here are short, so the win (you're always on the latest fix) outweighs the cost.",
        ],
      },
      {
        heading: '🐛 Fixes',
        bullets: [
          'Payments list rows line up at last. On the athletes\' Payments tab, the "mark paid" / "unmark paid" controls and the empty-month placeholder all share the same row height now, so the table reads as a clean grid instead of a slightly jumpy one.',
        ],
      },
    ],
  },
  {
    version: 'v1.9.0',
    date: '2026-05-01',
    headline:
      'The Italian rollout reaches the screens you see before you ever sign in: login, register, the email-verify pages, and the setup wizard now flip languages alongside the dashboard nav. Plus a tighter Athletes flow — Edit moves inside the athlete page where it belongs — and a smarter "Paid" column that finally tells you which month it\'s checking.',
    sections: [
      {
        heading: '🌍 Languages',
        bullets: [
          "Italian arrives on the auth flow + setup wizard. Sign in, register, the verify-email landing pages, the setup wizard, the dashboard chrome (top bar + brand area), and the 404 page now all speak Italian when you've toggled the language. Pre-seeds itself from the language you picked inside the dashboard, so the experience stays consistent the moment you sign back in.",
          'Privacy policy now defaults to English. Hitting /privacy cold (without a language preference) lands you on the English version — matching the new English-first product direction. The Italian version lives at /privacy/it and is one tap away via the toggle at the top of each page.',
        ],
      },
      {
        heading: '🥋 Athletes',
        bullets: [
          'Edit lives inside the athlete now. The "Edit" tab sits next to Documents, Attendance, and Payments on each athlete\'s page, instead of being a separate screen you bounce out to. Saving or cancelling keeps you on that athlete — same place you were when you opened the form. The list also drops the redundant folder icon: tap the athlete\'s name to open their page (the standard list-link pattern).',
          'The "Paid" column tells you which month it\'s checking. The athletes list now writes the current month right in the column header (e.g. "Paid · May") so a glance at the table tells you whether someone\'s up to date for the month you\'re actually in — no more guessing whether the toggle is for last month or this one.',
        ],
      },
      {
        heading: '🛡️ Profile',
        bullets: [
          '"Your data" card stacks vertically. The GDPR export card under Profile — the one with the description and the "Download my data" button — now stacks cleanly on narrow screens so the hint text and the button stay readable and easy to tap on a phone.',
        ],
      },
    ],
  },
  {
    version: 'v1.8.0',
    date: '2026-04-30',
    headline:
      'Two changes on the way to going international plus a couple of paper-cuts smoothed over. Pick your language from the sidebar — English is the new default, Italian one click away — and finally set the monthly fee that makes the Payments tab actually do its job.',
    sections: [
      {
        heading: '🌍 Languages',
        bullets: [
          "English by default, Italian one tap away. A new language toggle lives in the sidebar, just above the version footer. Pick English (default) or Italiano — your choice is remembered in your browser. Right now the sidebar nav and the Privacy policy switch language; the rest of the dashboard text is already English everywhere. We'll bring Italian translations to the dashboard pages in the next release.",
          'English Privacy policy added. Same content as the original Italian version, faithfully translated. A small Italiano · English toggle at the top of each version lets you flip between the two without losing your spot. (As of v1.9.0 the URL scheme changed: English now lives at /privacy and Italian at /privacy/it.)',
        ],
      },
      {
        heading: '💰 Payments',
        bullets: [
          'Set your monthly fee from the Academy page. Go to Academy → Edit and a new "Monthly fee" field is waiting. Once you set it, the Payments tab on each athlete profile activates, and the inline mark-paid toggle on the athletes list comes alive. Leave it empty if you don\'t want to track payments through Budojo — the toggle and the tab simply hide.',
        ],
      },
      {
        heading: '📐 Layout polish',
        bullets: [
          'Academy and Profile pages now centered on desktop. They were sitting flush against the left edge while the rest of the dashboard floated centered — small inconsistency, finally smoothed. No change on mobile.',
        ],
      },
      {
        heading: '🧹 Behind the scenes',
        bullets: [
          'i18n framework live. ngx-translate wired into the SPA with a synchronous bundled-JSON loader, so the first paint of every screen is already translated (no flicker of raw keys). The plumbing is in place to roll Spanish and German translations onto the dashboard once we expand into those markets.',
        ],
      },
    ],
  },
  {
    version: 'v1.7.0',
    date: '2026-04-30',
    headline:
      'Payments tracking arrives. Mark whether each athlete has paid for the current month right from the roster, or open a per-athlete tab to see all twelve months at a glance.',
    sections: [
      {
        heading: '💰 Payments',
        bullets: [
          'Per-athlete payments tab. Open any athlete profile and the new "Payments" tab shows every month of the current year as a row — Paid / Unpaid status and the amount. Tap a row to toggle the state.',
          "Inline mark-paid on the athletes list. A quick toggle on each row of the athletes list flips the current month's payment state without leaving the roster. Useful at the start of the month when collecting fees.",
        ],
      },
      {
        heading: '🐛 Fixes',
        bullets: [
          'Profile › Your data card now in English. Was leaking the Italian copy "Esporta i tuoi dati" — now matches the rest of the SPA\'s English UI.',
          "Pending-deletion banner shows on first sign-in. If you'd requested account deletion and signed back in within the 30-day grace window, the cancel-deletion banner sometimes didn't show until you reloaded. Fixed.",
        ],
      },
      {
        heading: '🧹 Behind the scenes',
        bullets: [
          'Design system polish. Page widths and side padding now resolve through a small set of design tokens instead of being copy-pasted on every screen. No visible change — but adding a new screen now picks up the right chrome automatically.',
        ],
      },
    ],
  },
  {
    version: 'v1.6.0',
    date: '2026-04-30',
    headline:
      'A big compliance + privacy push, with full IBJJF belt support arriving alongside the legal scaffolding for our launch readiness.',
    sections: [
      {
        heading: '🛡️ Privacy & data control',
        bullets: [
          'Download a copy of your data. Open Profile → Your data and grab a ZIP with everything: academy details, athletes, payments, attendance, and uploaded documents.',
          'Delete your account. A new "Delete account" flow on the Profile page starts a 30-day grace window. Cancel anytime within those 30 days; after that, your data is wiped automatically.',
          'A real Privacy Policy at /privacy. GDPR Art. 13, in Italian. Shipped as a draft pending lawyer review — the technical facts are accurate today.',
          'Sub-processors page at /sub-processors. Full disclosure of every third party that touches your data, with a 30-day notice window before any change.',
          'No cookie banner needed. We audited every cookie and storage entry the SPA writes. Result: zero tracking cookies, only two strictly-technical localStorage keys.',
        ],
      },
      {
        heading: '🥋 Athletes & belts',
        bullets: [
          'Full IBJJF belt support. Every belt and rank is now in the dropdown — kids (grey, yellow, orange, green), adults (white, blue, purple, brown, black with graus), and senior (red-and-black 7°, red-and-white 8°, red 9°+).',
          'Per-belt stripe limits. Black belts go up to 6 graus; everyone else stops at 4. Red belts have no graus by definition.',
        ],
      },
      {
        heading: '📱 Mobile fixes',
        bullets: [
          'Phone country-code prefix renders cleanly on Pixel 8 Pro. No more "+..." ellipsis swallowing the country code on narrower viewports.',
          'Profile page is tighter on mobile. Removed huge vertical gaps between labels and values — now stacks naturally on phones, keeps the two-column layout on tablet and up.',
        ],
      },
      {
        heading: '🧹 Behind the scenes',
        bullets: [
          'The register form now requires an explicit "I have read the privacy policy" checkbox.',
          'New multi-viewport Cypress test infrastructure so layout regressions on Pixel-class phones get caught in CI, not by beta testers.',
        ],
      },
    ],
  },
  {
    version: 'v1.5.0',
    date: '2026-04-29',
    headline:
      'Beta-tester feedback round. Two small but visible fixes plus the start of full IBJJF coverage.',
    sections: [
      {
        heading: '🥋 Athletes & belts',
        bullets: [
          'Kids belts. Grey, yellow, orange, and green are now selectable on the athlete form — proper youth ranks instead of forcing kids onto an adult belt.',
        ],
      },
      {
        heading: '🐛 Fixes',
        bullets: [
          'Phone country-code is clearable. Previously, once you picked a country code on the athlete form there was no way to remove it without picking a different one. Now you can clear the field entirely.',
          '404 page instead of a blank fallback. Typing a URL that doesn\'t exist no longer dumps you onto a white screen — you get a proper "page not found" with a link back home.',
        ],
      },
    ],
  },
  {
    version: 'v1.4.0',
    date: '2026-04-29',
    headline: 'Contact links across the app, an attendance redesign, and a polished email layout.',
    sections: [
      {
        heading: '📞 Contact links everywhere',
        bullets: [
          'Academy contacts. Phone, email, Instagram, website, Google Maps — fill them on the academy form, and they render as tappable chips on the academy detail page.',
          'Athlete contacts. Same pattern on the athlete profile: phone (with country code), email, Instagram. Tap a chip and your phone or email client opens.',
        ],
      },
      {
        heading: '📋 Attendance',
        bullets: [
          'Daily check-in redesigned. The check-in screen now mirrors the athletes list layout — same row shape, same density. Easier to scan a long roster on a phone.',
          'Monthly summary headline updated. Instead of summing "training days" (a number that drifted from what coaches wanted to see), the page now leads with average athletes per session — a more useful gut check on attendance health.',
        ],
      },
      {
        heading: '📧 Emails',
        bullets: [
          'Branded transactional emails. Verification emails, deletion confirmations, and any future notifications now carry the Budojo wordmark and our indigo accent color. No more generic Laravel template look.',
        ],
      },
      {
        heading: '🐛 Fixes',
        bullets: [
          'Belt sort icon respects the active state. The little arrow next to the Belt column header now changes shape and color when Belt is the active sort — so you can see at a glance which column is sorting.',
        ],
      },
    ],
  },
  {
    version: 'v1.3.0',
    date: '2026-04-29',
    headline: 'A handful of small UX improvements on the athletes list and the attendance flow.',
    sections: [
      {
        heading: '📋 Athletes list',
        bullets: [
          '4-state name sort. Tap the Full name column to cycle through first-name ascending, first-name descending, last-name ascending, last-name descending. Old behaviour was a single direction toggle.',
          'Bigger tap target. The full-name header button now fills the entire cell — easier to hit on a phone.',
        ],
      },
      {
        heading: '📅 Attendance',
        bullets: [
          "Smarter default day. Open the daily check-in screen and it lands on the most recent training day — not always today. If today isn't a training day in your weekly schedule, you don't have to manually scroll back to find the last one.",
        ],
      },
      {
        heading: '🐛 Fixes',
        bullets: [
          'Phone country-code spacing. A small visible gap between the country code dropdown and the phone-number input (used to render flush against each other).',
          'Version footer shows the real version. The bottom-of-sidebar tag now displays the proper "v1.3.0" instead of a bare commit SHA on production builds.',
        ],
      },
    ],
  },
];
