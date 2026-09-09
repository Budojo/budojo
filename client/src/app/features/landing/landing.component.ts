import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { ButtonModule } from 'primeng/button';
import { BrandGlyphComponent } from '../../shared/components/brand-glyph/brand-glyph.component';
import { LanguageService, SupportedLanguage } from '../../core/services/language.service';
import { SUPPORT_EMAIL } from '../../shared/utils/support-contact';

/**
 * Public landing / about page at `/` (#330).
 *
 * Replaces the cold redirect to `/auth/login` that we used to ship —
 * standard SaaS pattern: marketing surface at the root, login one
 * click away in the header. Only visible to non-authenticated visitors
 * (the `publicGuard` bounces logged-in users back to
 * `/dashboard/athletes`).
 *
 * Pairs with #331 (login repositioning) — the routing change that
 * removes the `path: '' → redirectTo: 'auth/login'` line lives in
 * `app.routes.ts` and ships in the same PR.
 *
 * Voice + composition: the issue body (issue #330) is the canonical
 * brief — founder-first, conversational, benefit-driven copy in
 * lock-step with `en.json` + `it.json` from day one. Italian is a
 * first-class deliverable; the language toggle lives in the header
 * next to the auth links so a prospect who lands EN-default can flip
 * to IT instantly.
 *
 * Visual register: same Apple-minimal canon as the dashboard. Same
 * tokens (`var(--p-*)`, `var(--budojo-*)`). Same iconography
 * (`pi pi-*`). Reference UIs we mirror in CADENCE not COPY: Linear
 * (hero+screenshot composition), Tally (founder-voice register),
 * Cal.com (open-source / EU trust signals), Plausible (GDPR-as-a-
 * feature angle).
 */
/**
 * A prospect writing from the landing page has no build to report, so this is
 * the address and a subject and nothing else — the diagnostics block in
 * `supportMailtoHref` belongs to someone who is already running the app.
 */
const LANDING_SUPPORT_MAILTO = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent('Budojo support')}`;

@Component({
  selector: 'app-landing',
  standalone: true,
  imports: [RouterLink, TranslatePipe, ButtonModule, BrandGlyphComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './landing.component.html',
  styleUrl: './landing.component.scss',
})
export class LandingComponent {
  private readonly languageService = inject(LanguageService);

  /**
   * The support address, read from the one place that holds it (#1476).
   * The footer hardcoded it before there was a constant, which meant two
   * copies of a value that changes as a unit.
   */
  protected readonly supportMailto = LANDING_SUPPORT_MAILTO;

  /**
   * Current language for the header toggle. Two-state today (EN/IT) —
   * when ES + DE land per the i18n roadmap (#271) the toggle becomes
   * a small select.
   */
  protected readonly currentLanguage = computed<SupportedLanguage>(() =>
    this.languageService.currentLang(),
  );

  protected readonly otherLanguage = computed<SupportedLanguage>(() =>
    this.currentLanguage() === 'en' ? 'it' : 'en',
  );

  protected switchLanguage(): void {
    this.languageService.setLanguage(this.otherLanguage());
  }

  /**
   * What to do first, in order (#1497).
   *
   * The three steps that used to be the "how it works" arc of a sales page,
   * kept because on this page they stopped being an argument and became
   * instructions. A local-first app has no onboarding email to catch someone
   * who installs it and stops — this is the only thing between the installer
   * finishing and an empty roster.
   *
   * Full translation paths, never built by concatenation: the i18n parity
   * check cannot see a dynamically-built key, and the IT side drifts in
   * silence (`client/CLAUDE.md` § i18n).
   */
  protected readonly steps: readonly { title: string; body: string }[] = [
    { title: 'landing.welcome.step1.title', body: 'landing.welcome.step1.body' },
    { title: 'landing.welcome.step2.title', body: 'landing.welcome.step2.body' },
    { title: 'landing.welcome.step3.title', body: 'landing.welcome.step3.body' },
  ];
}
