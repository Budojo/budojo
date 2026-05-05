import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { TranslatePipe } from '@ngx-translate/core';
import { BrandGlyphComponent } from '../../shared/components/brand-glyph/brand-glyph.component';

/**
 * "What's new" page (#254). User-facing changelog for non-technical
 * users (Luigi, an instructor, not a developer). Sits in the sidebar
 * above Sign out so a user reading the dashboard can answer "did
 * something change?" without leaving the app.
 *
 * **Two artefacts, one content domain.** The canonical changelog
 * source lives in `docs/changelog/user-facing/v{X.Y.Z}.md` — one
 * markdown file per release, written in plain English with light
 * emoji use in section headers. This component renders a hand-
 * tailored version of the same content as a typed `Release[]`
 * array. The two are NOT auto-generated; they are kept in lock-
 * step under the documentation discipline documented in
 * `CLAUDE.md` § "User-facing changelog (#254)": a release PR
 * adds the markdown file AND prepends the array entry in the
 * same commit history.
 *
 * Why the parallel artefacts: the markdown files are the citable
 * source (auditable in the repo, easy to rewrite, easy to diff in
 * a PR review); the typed array gives Angular full design control
 * over typography, semantic HTML structure, and accessibility
 * without dragging in a markdown parser dependency.
 *
 * Auth: this is a route inside the dashboard shell so it's behind
 * the auth + has-academy guards. We deliberately do NOT make it
 * public the way `/privacy` and `/sub-processors` are — the
 * audience here is logged-in customers who just want to know what
 * changed, not regulators or prospects.
 */

interface ChangelogSection {
  readonly heading: string;
  readonly bullets: readonly string[];
}

interface Release {
  readonly version: string;
  readonly date: string;
  readonly headline: string;
  readonly sections: readonly ChangelogSection[];
}

@Component({
  selector: 'app-whats-new',
  standalone: true,
  imports: [ButtonModule, BrandGlyphComponent, RouterLink, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './whats-new.component.html',
  styleUrl: './whats-new.component.scss',
})
export class WhatsNewComponent {
  private readonly router = inject(Router);

  protected readonly releases: readonly Release[] = [
    {
      version: 'v1.17.0',
      date: '2026-05-05',
      headline:
        'A heavy account-and-trust release. Eight features land together: a brand-new help / FAQ page, a real support contact form with screenshot upload, change-your-password from the profile, upload your own avatar, plus the legal scaffolding (Terms of Service + cookie banner + cookie policy) Budojo needs before serving customers in the EU. On the resilience side: friendly server-error and offline pages instead of browser defaults, and the login form now rate-limits brute-force attempts.',
      sections: [
        {
          heading: '🆘 Help & support',
          bullets: [
            'In-product help & FAQ. A new /dashboard/help page collects every common question — "how do I add an athlete", "what does the medical-certificate digest do", "how do I export my data" — into a single searchable list. Type any keyword (English or Italian) and the matching answers surface as you type. Lives in the sidebar under "Help".',
            "Dedicated support form. A new /dashboard/support page replaces the previous in-app feedback link. Pick a category (account / billing / bug / feedback / other), write a subject + a description, optionally drop in a screenshot, and it lands directly in our support inbox. The current app version and your device info are attached automatically — when something looks off you don't have to remember which version you're on or which browser. Replies come back to the email on your account.",
          ],
        },
        {
          heading: '👤 Account',
          bullets: [
            'Change your password. A "Change password" entry on the Profile page lets you rotate your password without the forgot-password email round-trip. Asks for your current password as a re-auth gate, then for a new one twice. Every other active session on your account (other browsers, other devices) is signed out as a precaution; the tab you\'re using stays signed in.',
            'Upload your own avatar. The circular avatar in the top-right corner used to be your initials. You can now upload a real photo from Profile → Edit avatar — drag-and-drop or browse, replace it any time, or remove it to fall back to initials. Renders in the topbar and on the profile page.',
          ],
        },
        {
          heading: '⚖️ Legal & compliance',
          bullets: [
            'Terms of Service page. A new public page at /terms carries the Service Agreement, with an Italian version at /terms/it. Both pages link to each other and follow the same layout as /privacy and /sub-processors.',
            'Acceptance gate on registration. The sign-up form now asks you to tick a checkbox accepting the Terms of Service alongside the existing privacy-policy checkbox. Existing accounts are unaffected.',
            'Cookie consent banner. A first-visit banner explains what storage Budojo writes to your browser and lets you accept all, reject non-essential, or open a "Customise" dialog with per-category toggles (essentials always on, preferences / analytics / marketing opt-in). Your choice is remembered so the banner does not keep popping up.',
            'Cookie policy page. A new public /cookies page (Italian at /cookies/it) documents every category in detail — what we store, why, how long, and how to change your mind. Same chrome as the other legal pages.',
          ],
        },
        {
          heading: '🛡️ Resilience',
          bullets: [
            'Login rate limit. The sign-in form is now capped at 5 password attempts per minute from the same network — past that you wait a minute before trying again. Closes the door on automated password-guessing without being noticeable to a real user fat-fingering their password a few times.',
            'Friendly server-error page. If the API ever returns a 500, the SPA used to surface an opaque error toast or, worse, a blank page. It now shows a dedicated error page with a clear "Try again" button and a link back to the dashboard. Still the rare path; nicer when it fires.',
            'Friendly offline page. If you lose connection mid-navigation the SPA now shows an offline page with a "Retry" button and a heads-up that the rest of the app needs the network. Replaces the browser\'s native offline screen.',
          ],
        },
        {
          heading: '🧹 Behind the scenes',
          bullets: [
            'The previous "Send feedback" sidebar entry is folded into Support. One place for "I want to tell you something" instead of two near-identical pages — same screenshot upload, same auto-attached device info, same destination inbox. The icon in the sidebar changes from the life-ring to a speech-bubble to match.',
            'App version + browser / OS info now auto-attach to every support submission via a new request header — you no longer need to type "Chrome 120 on Android" into the body when something breaks.',
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
      headline:
        'Contact links across the app, an attendance redesign, and a polished email layout.',
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

  goHome(): void {
    this.router.navigateByUrl('/dashboard');
  }
}
