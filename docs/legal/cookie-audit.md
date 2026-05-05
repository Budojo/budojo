# Cookie & local-storage audit (#221, #421)

**Esito audit (al 2026-05-05):** _Tutti gli artefatti tecnici oggi presenti restano esenti banner ai sensi dell'art. 5.3 della Direttiva ePrivacy._ Lo SPA ora **mostra comunque un cookie banner preventivo** introdotto in #421 — gate per analytics / marketing futuri (oggi nessuno wired) — e una pagina pubblica `/cookie-policy` (EN) + `/cookie-policy/it` (IT) che rispecchia questa stessa tabella per un pubblico non tecnico.

Data audit: 2026-04-29 · ultima revisione: 2026-05-05 (#421 — banner + cookie policy)

## 1. Cookie HTTP

| Cookie | Origine | Finalità | Esente banner? |
| --- | --- | --- | --- |
| _Nessuno_ | — | — | — |

La SPA Angular **non legge e non scrive cookie HTTP**. L'autenticazione usa Sanctum **Bearer token** in header `Authorization`, non cookie di sessione. Verifica:

```bash
grep -rn "document\.cookie" client/src      # → 0 risultati
```

## 2. localStorage

| Chiave | Valori | Finalità | Durata | Categoria banner (#421) | Esente banner? |
| --- | --- | --- | --- | --- | --- |
| `auth_token` | stringa Sanctum opaca | Persiste il token Bearer fra reload così l'utente non deve riautenticarsi a ogni F5 | Finché l'utente non fa logout o non revoca il token | Essenziali | **Sì** — strettamente necessario per fornire il servizio richiesto (l'utente ha esplicitamente chiesto di "essere autenticato") |
| `budojoLang` | `'en'` \| `'it'` | Lingua selezionata dall'utente (#273) | Finché l'utente non cambia lingua o svuota i dati del sito | Essenziali | **Sì** — preferenza UI, non identifica e non profila l'utente |
| `budojoCookieConsent` | JSON `{ version, choices, savedAt }` | Memorizza la scelta dell'utente sul cookie banner (#421) | Persiste finché l'utente non svuota i dati del sito o non cambia `CONSENT_VERSION` lato app (re-prompt forzato). Nessuna scadenza per età oggi implementata: una scadenza periodica (es. 12 mesi) è prevista come iterazione futura. | Essenziali | **Sì** — strettamente necessario per registrare la scelta espressa dall'utente sull'articolo 5.3 ePrivacy |
| `documents.showCancelled` | `'1'` o assente | Ricorda se l'utente vuole vedere i documenti cancellati nella lista per atleta | Finché l'utente non ridisattiva il toggle (la chiave viene rimossa), oppure finché non svuota i dati del sito dal browser | Preferenze | **Sì** — preferenza UI, non identifica e non profila l'utente |

Riferimenti codice:
- [`client/src/app/core/services/auth.service.ts`](../../client/src/app/core/services/auth.service.ts) — `TOKEN_KEY = 'auth_token'`
- [`client/src/app/core/services/language.service.ts`](../../client/src/app/core/services/language.service.ts) — `STORAGE_KEY = 'budojoLang'`
- [`client/src/app/core/services/consent.service.ts`](../../client/src/app/core/services/consent.service.ts) — `CONSENT_STORAGE_KEY = 'budojoCookieConsent'`, `CONSENT_VERSION`
- [`client/src/app/features/athletes/detail/documents-list/documents-list.component.ts`](../../client/src/app/features/athletes/detail/documents-list/documents-list.component.ts) — `TOGGLE_STORAGE_KEY = 'documents.showCancelled'`

## 3. sessionStorage / IndexedDB / WebSQL

Nessun utilizzo. Verifica:

```bash
grep -rn "sessionStorage\|indexedDB" client/src   # → 0 risultati
```

## 4. Tracker e analytics di terze parti

| Strumento | Presente? | Note |
| --- | --- | --- |
| Google Analytics / GA4 / `gtag` | ❌ | Non installato |
| Google Tag Manager | ❌ | Non installato |
| Meta / Facebook Pixel (`fbq`) | ❌ | Non installato |
| Hotjar / Microsoft Clarity | ❌ | Non installato |
| Segment / Amplitude / Mixpanel | ❌ | Non installato |
| Sentry / error tracking | ❌ | Non installato (futuro: vedi #225 sub-processor list) |

Verifica via grep su `client/src` e `client/package.json`: nessuna corrispondenza.

## 5. Service worker (PWA)

Il `ngsw-worker.js` (Angular Service Worker, configurato in `client/ngsw-config.json`) effettua **caching tecnico** dell'app shell (`/index.html`, JS/CSS bundle) e degli asset statici (favicon, icone, immagini, font). Allo stato corrente non sono configurati `dataGroups` per `/api/v1/**` — le chiamate API non sono cached né servite offline. È archiviazione **necessaria al funzionamento dell'app installata** (PWA), esente sotto la stessa logica del token di autenticazione. Se in futuro si introduce caching API, va rivisto qui (e basta — sono ancora dati tecnici dell'utente, non profilazione).

## 6. Conclusione operativa

- **Banner cookie**: **già implementato preventivamente in #421**. Lo SPA mostra un banner sticky alla prima visita con tre azioni (Accetta tutto, Rifiuta i non essenziali, Personalizza) e una modal granulare a quattro categorie (essenziali, preferenze, analytics, marketing). Solo le essenziali sono bloccate; le altre sono opt-in. La scelta è persistita in `localStorage.budojoCookieConsent` con un campo `version` che innesca un re-prompt al bump.
- **Pagina cookie policy**: pubblica su [`/cookie-policy`](../../client/src/app/features/cookie-policy/cookie-policy.component.html) (EN) e [`/cookie-policy/it`](../../client/src/app/features/cookie-policy/it/cookie-policy-it.component.html) (IT). Cross-link dalla privacy policy. Lock-step con questo audit: ogni edit alla tabella sopra deve riflettersi nelle due pagine HTML nello stesso PR.
- **Gate di consenso**: `ConsentService.hasConsent('analytics' | 'marketing'): Signal<boolean>` è il punto di lettura per qualsiasi script futuro. Oggi nessuno è wired — il gate è preventivo.
- **Privacy policy**: contiene una sezione "Cookie e archiviazione locale" che dichiara cosa salviamo. Vedi [#219](https://github.com/Budojo/budojo/issues/219).
- **Re-audit obbligatorio quando**:
  - Si aggiunge **qualunque** strumento di analytics, error tracking, A/B testing, marketing pixel, recaptcha, embed video / iframe esterno (gating richiesto via `hasConsent(...)`)
  - Si introduce un sub-processor che setta cookie propri (es. integrazione Stripe Checkout, Google Maps embed, Calendly)
  - Si aggiunge una nuova chiave localStorage / sessionStorage / IndexedDB
  - Si modifica il significato di una categoria esistente in modo sostanziale → bump di `CONSENT_VERSION` per re-promptare l'utente
- L'introduzione di uno qualsiasi degli strumenti sopra **richiede** il gating della categoria corretta tramite `ConsentService` prima di iniettare lo script.

## Suggerito snippet per la privacy policy (#219)

> **Cookie e archiviazione locale**
>
> Budojo non utilizza cookie HTTP, né cookie di profilazione propri o di terze parti. Per ricordare il tuo accesso e la tua preferenza sulla visualizzazione dei documenti cancellati, l'applicazione usa il `localStorage` del tuo browser con due chiavi: `auth_token` (token di sessione, rimosso al logout) e `documents.showCancelled` (preferenza interfaccia, rimossa quando ridisattivi il toggle). Questi dati restano sul tuo dispositivo e non vengono trasmessi a terzi. Puoi rimuoverli in qualsiasi momento dal logout, dalla disattivazione del toggle, oppure svuotando i dati del sito dalle impostazioni del browser. Non utilizziamo strumenti di analytics, tracking di terze parti o pixel di marketing.

## Riferimenti normativi

- Direttiva 2002/58/CE (ePrivacy) art. 5.3 — esenzione consenso per archiviazione "strettamente necessaria"
- GDPR art. 7 — caratteristiche del consenso (sarebbe richiesto solo se introducessimo tracker non-tecnici)
- Garante Privacy — _Linee guida cookie e altri strumenti di tracciamento_, 10 giugno 2021
