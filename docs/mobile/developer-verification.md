# Verifica sviluppatore Android: la checklist del proprietario

Da settembre 2026 Google chiede che ogni app installata su un telefono Android certificato venga da uno sviluppatore verificato, anche fuori dal Play Store. Si parte il **30 settembre 2026** in Brasile, Indonesia, Singapore e Thailandia; **nel 2027 si estende a tutti i paesi**, Italia compresa. Fonte: [developer.android.com/developer-verification](https://developer.android.com/developer-verification), letta il 25 ottobre 2026: le date e i passi vanno ricontrollati lì prima di farli.

Budojo per Android si installa da un APK (#2027, #2041), quindi **va registrato prima che la verifica arrivi in Italia**, o i telefoni rifiuteranno di installarlo e di aggiornarlo.

## L'account: a distribuzione limitata, gratuito

Per chi non distribuisce un'app a molti, Google offre un **account a distribuzione limitata** ([guida](https://developer.android.com/developer-verification/guides/limited-distribution)):
- **gratuito**, e **senza documento d'identità**;
- l'app si condivide con **fino a 20 dispositivi**, ognuno autorizzato da chi lo usa;
- i dispositivi si aggiungono con una conferma sul telefono, da un QR o da un link, e si registrano nell'Android Developer Console.

Venti dispositivi bastano per la palestra e per qualche amico con la sua (PRD § 12).

## Cosa fare, in ordine

- [ ] **Account Google** con la **verifica in due passaggi attiva** (già richiesta dal PRD per Drive).
- [ ] **Profilo pagamenti Google** collegato a quell'account: è richiesto anche per l'account gratuito.
- [ ] **Creare l'account a distribuzione limitata** nell'[Android Developer Console](https://android.google.com/developerconsole), con un'email di contatto.
- [ ] **Registrare l'app:** il nome del pacchetto è `it.budojo.mobile`, e la chiave di firma è quella della release (#2027, nel password manager). La console chiede l'impronta del certificato. Si legge dall'APK con `apksigner verify --print-certs Budojo-Android-X.Y.Z.apk` (la riga *SHA-256 digest*), o dal keystore con `keytool -list -v -keystore <file> -alias budojo`.
- [ ] **Autorizzare ogni telefono:** il proprio, e quello di chi lo usa, dal QR o dal link della console.
- [ ] **Dopo la registrazione, installare un APK su un telefono nuovo e guardare se il blocco di Play Protect cambia** (#2041: oggi è un blocco con *Installa comunque*). Aggiornare `docs/mobile/install.md` con quello che si vede.

## Se un giorno serve di più

Oltre i 20 dispositivi serve un account completo, con documento d'identità e, per un'organizzazione, i suoi dati. Per gli utenti esperti Google prevede anche un percorso per installare app da sviluppatori non verificati ([il blog di marzo 2026](https://android-developers.googleblog.com/2026/03/android-developer-verification.html)): non è una strada da chiedere a un istruttore.
