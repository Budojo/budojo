import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { ButtonModule } from 'primeng/button';
import { BrandGlyphComponent } from '../../shared/components/brand-glyph/brand-glyph.component';
import { LanguageService, SupportedLanguage } from '../../core/services/language.service';

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
   * Pain-section bullets. Pulled from i18n keys at template time
   * (TranslatePipe in the @for) so the array length is stable in
   * tests. Indices are arbitrary — the keys themselves carry the
   * meaning.
   */
  protected readonly painPoints: readonly string[] = [
    'landing.pain.point1',
    'landing.pain.point2',
    'landing.pain.point3',
    'landing.pain.point4',
  ];

  /**
   * Solution-section feature cards. Each card has a heading + body +
   * icon. `titleKey`/`bodyKey` are the FULL translation paths so the
   * template never builds keys via string concatenation — that
   * pattern is banned (`client/CLAUDE.md` § i18n) because the parity
   * check can't see dynamically-built keys and IT translations drift
   * silently.
   */
  protected readonly features: readonly {
    iconClass: string;
    titleKey: string;
    bodyKey: string;
  }[] = [
    {
      iconClass: 'pi-users',
      titleKey: 'landing.features.roster.title',
      bodyKey: 'landing.features.roster.body',
    },
    {
      iconClass: 'pi-file',
      titleKey: 'landing.features.documents.title',
      bodyKey: 'landing.features.documents.body',
    },
    {
      iconClass: 'pi-check-circle',
      titleKey: 'landing.features.attendance.title',
      bodyKey: 'landing.features.attendance.body',
    },
    {
      iconClass: 'pi-credit-card',
      titleKey: 'landing.features.payments.title',
      bodyKey: 'landing.features.payments.body',
    },
    {
      iconClass: 'pi-mobile',
      titleKey: 'landing.features.pwa.title',
      bodyKey: 'landing.features.pwa.body',
    },
    {
      iconClass: 'pi-comment',
      titleKey: 'landing.features.support.title',
      bodyKey: 'landing.features.support.body',
    },
  ];

  /**
   * 3-step "how it works" arc. Same explicit-keys rule as `features`.
   */
  protected readonly steps: readonly {
    number: string;
    titleKey: string;
    bodyKey: string;
  }[] = [
    { number: '1', titleKey: 'landing.how.signup.title', bodyKey: 'landing.how.signup.body' },
    { number: '2', titleKey: 'landing.how.setup.title', bodyKey: 'landing.how.setup.body' },
    {
      number: '3',
      titleKey: 'landing.how.firstAthlete.title',
      bodyKey: 'landing.how.firstAthlete.body',
    },
  ];
}
