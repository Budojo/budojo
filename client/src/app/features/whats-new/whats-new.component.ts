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
