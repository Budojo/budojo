# Budojo sul telefono: installare e aggiornare

Budojo per Android non è sul Play Store: si installa da un file APK, scaricato dalla pagina delle release su GitHub o ricevuto direttamente. Questa guida dice cosa mostra il telefono e dove toccare. I testi sono quelli di un telefono in italiano; su altri telefoni le parole possono cambiare di poco.

## Cosa serve

- **Android 7 o più recente, su un telefono a 64 bit** (ARM64): quasi tutti quelli usciti dal 2017 in poi. L'APK contiene solo il motore a 64 bit: un telefono a 32 bit risponde *«App non installata»*.
- **I servizi Google Play.** «Accedi con Google» e la sincronizzazione con Drive passano da lì: un telefono senza (alcuni Huawei recenti, i telefoni «de-googlati») non è supportato.
- **Un blocco schermo** (PIN, sequenza o password), meglio con l'impronta: Budojo la chiede all'apertura e dopo 5 minuti fuori dall'app.

## La prima installazione

1. **Apri il file APK** (dalla notifica del download, o da *File* → *Download*).
2. **Il telefono chiede di consentire le installazioni da quella app** (il browser, o *File*): *«Per sicurezza, al momento il telefono non può installare app sconosciute da questa fonte»*. Tocca **Impostazioni**, attiva **Consenti da questa fonte**, poi torna indietro.
3. **Tocca Installa.**
4. **Play Protect blocca l'installazione.** È normale per un'app che non viene dal Play Store e il cui sviluppatore Google non conosce ancora. Il telefono mostra:

   > **App bloccata per proteggere il tuo dispositivo**
   > Play Protect non ha mai rilevato app di questo sviluppatore prima d'ora. Potrebbe non essere sicura.

   **Non toccare il pulsante grande in basso (Ok): annulla l'installazione.** Tocca invece **Installa comunque**: è un link di testo, piccolo, **sopra** il pulsante Ok.
5. **Apri Budojo.** Al primo avvio prepara il suo server sul telefono: può volerci un minuto. Poi chiede l'impronta (o il PIN), e mostra la porta:
   - **Accedi con Google**, se la palestra è già sul PC: torna da sola, con tutto quello che il PC ha messo su Drive;
   - **Continua senza Google**, per una palestra solo su questo telefono.

## Aggiornare

- **Quando esce una versione nuova,** in fondo a *Oggi* compare *«È uscito Budojo X.Y.Z»* con **Scarica**. Il file si scarica dal browser.
- **Apri il file scaricato e installalo sopra quello che hai:** Android chiede *«Vuoi aggiornare questa app?»*, e Play Protect può chiedere di nuovo la conferma (vedi sopra). I dati restano.
- **Se la sincronizzazione dice *«Aggiorna Budojo per sincronizzare»*,** il PC usa già una versione più nuova: aggiorna il telefono. Quello che registri intanto resta sul telefono e parte dopo l'aggiornamento.

## Cosa non fare

- **Non disinstallare Budojo per «reinstallarlo pulito».** Disinstallare cancella tutto quello che è solo sul telefono: le presenze e i pagamenti registrati e non ancora inviati al PC, e le chiavi del telefono. Una palestra che è sul PC torna con «Accedi con Google», ma senza quello che non era ancora partito; una palestra solo sul telefono non torna.
- **Non installare un APK più vecchio sopra uno più nuovo:** Android lo rifiuta (*«App non installata»*). Non è un guasto: scarica la versione più recente.
- **Non installare un APK da altre fonti.** Ogni APK di Budojo è firmato con la stessa chiave; uno firmato da altri non si installa sopra Budojo, e non va installato accanto.
