# Play Store — Listing copy (IT + EN)

Source of truth for the **Budojo** Play Store listing. Lengths checked
against the Play Console limits (April 2026):

- **Title**: 30 chars max
- **Short description**: 80 chars max — the line under the icon in
  search results; this is what makes the user tap the card
- **Full description**: 4000 chars max — the long-form page after tap

Two locales live: `it-IT` (default for the IT market) and `en-US` (rest
of world). Play Console picks the user's locale automatically. EN must
stay translation-equivalent — it'll be reviewed if Google's content team
spot-checks the listing.

## Title (30 char max)

**IT / EN**: `Budojo` — 6 char.

## Short description (80 char max)

**IT** (66 char):
```
Gestisci la tua academy di BJJ: atleti, cinture, presenze, pagamenti.
```

**EN** (72 char):
```
Run your BJJ academy: athletes, belts, attendance, payments, community.
```

## Full description (4000 char max)

### IT (~1800 char)

```
Budojo è lo strumento operativo per chi insegna Brazilian Jiu-Jitsu — istruttori, head coach, proprietari di academy. Una sola app sul telefono per gestire tutto quello che oggi vive su carta, Excel o WhatsApp.

🥋 ATLETI E CINTURE
Anagrafica completa con foto, telefono, email, indirizzo. Cinture youth (grigio, giallo, arancio, verde), adulto (bianco, blu, viola, marrone, nero) e senior coral / red — comprensive di striscette e graus IBJJF. Promuovi un atleta con un tocco; lo storico di tutti i passaggi di grado resta visibile sul profilo.

📋 PRESENZE GIORNO PER GIORNO
Check-in degli allenamenti in pochi secondi. Vedi chi sta venendo a tappeto, chi è sparito da settimane, chi è pronto per la prossima cintura.

📁 DOCUMENTI E SCADENZE
Carica documenti di identità, certificati medici, tesseramenti. L'app ti avvisa prima della scadenza — niente più sorprese all'ingresso del tappeto.

💰 PAGAMENTI E STORICO
Registra i pagamenti mensili o trimestrali. A colpo d'occhio sai chi è in regola e chi no, senza fogli Excel o quaderni.

💬 BACHECA COMUNITÀ
Una bacheca interna alla academy dove postare comunicazioni, eventi, foto di cinture nuove. Atleti e istruttori commentano, mettono reazioni, confermano la presenza agli eventi. Quando promuovi un atleta, il post di celebrazione parte da solo.

🔐 PRIVACY E DATI
Pieno controllo dei dati ai sensi del GDPR. Ogni atleta può richiedere l'export completo o la cancellazione del proprio profilo direttamente dall'app. Niente tracking pubblicitario, niente data broker.

📱 PWA INSTALLABILE
Funziona offline per le operazioni che fai sul tappeto. Aggiornamenti automatici — non aspetti uno store update per avere l'ultima versione.

Budojo è in evoluzione continua, guidata dal feedback diretto degli istruttori che la usano ogni giorno. La roadmap è pubblica nella sezione "Cosa c'è di nuovo" dentro l'app — vedi cosa è appena cambiato e cosa stiamo costruendo per il prossimo aggiornamento.
```

### EN (~1900 char)

```
Budojo is the operational tool for Brazilian Jiu-Jitsu instructors, head coaches, and academy owners. One app on your phone to run everything that currently lives on paper, Excel, or WhatsApp threads.

🥋 ATHLETES AND BELTS
Full roster: name, photo, phone, email, address. Belts across the IBJJF scale — youth (grey, yellow, orange, green), adult (white, blue, purple, brown, black), and senior coral / red — including stripes and black-belt graus. Promote an athlete in one tap; the complete promotion history stays visible on their profile.

📋 DAILY ATTENDANCE
Check athletes in as they walk onto the mat. See who's training consistently, who's drifted away, who's due for the next belt.

📁 DOCUMENTS AND EXPIRY
Upload ID cards, medical certificates, federation cards. Budojo notifies you before each one expires — no more surprises at the door.

💰 PAYMENTS AND HISTORY
Record monthly or quarterly payments. At a glance you see who's current and who isn't, with no Excel sheets or paper ledgers.

💬 COMMUNITY FEED
A private feed inside your academy for announcements, events, belt celebration posts. Athletes and instructors react, comment, RSVP to events. When you promote an athlete, the celebration post fires automatically.

🔐 PRIVACY AND DATA
Full GDPR control. Every athlete can export their full data or delete their profile directly from the app. Zero ad tracking, zero data brokers.

📱 INSTALLABLE PWA
Works offline for the operations you do on the mat. Updates roll out automatically — no waiting for a store release to get the latest.

Budojo evolves continuously, guided by direct feedback from the instructors who use it every day. The public roadmap lives inside the app under "What's new" — see what just shipped and what's coming next.
```

## Category

**Suggested**: `Sports` (primary) — matches the BJJ-instructor target audience and where they'd browse for tools.

Alternative if Play Console rejects Sports as too narrow: `Business → Productivity`.

## Content rating

- Target audience: 18+ (academy owners / instructors) — the athlete-portal users are separate from the publishing-account use case
- Content rating questionnaire answers:
  - Violence: No (BJJ is depicted but not enacted in-app)
  - User-generated content: Yes (community feed posts + comments) — academy-scoped, not public
  - Personal info: Yes (collected with consent under GDPR)
  - Crypto/gambling: No
  - Drugs/alcohol/tobacco: No

Expected PEGI: **3** or **7**.

## Privacy + data safety

- Privacy policy: `https://budojo.it/privacy` (EN) / `https://budojo.it/privacy/it` (IT)
- Data collected: email, name, phone, photo, address, payment records, attendance, documents
- Data shared with third parties: **None** (Cloudflare CDN + own hosting only; Stripe is processor when payments enabled)
- Encryption in transit: yes (HTTPS-only)
- Data deletion: yes (in-app GDPR Art. 17 request)
