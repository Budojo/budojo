import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { ButtonModule } from 'primeng/button';
import { BrandGlyphComponent } from '../../shared/components/brand-glyph/brand-glyph.component';
import { LanguageService, SupportedLanguage } from '../../core/services/language.service';
import { ConsentService } from '../../core/services/consent.service';
import { RuntimeService } from '../../core/services/runtime.service';
import { supportMailtoHref } from '../../shared/utils/support-contact';

/**
 * The app's first screen, at `/` (#330, rewritten in #1497).
 *
 * It was a marketing page — a hero, a problem list, six feature cards, three
 * trust columns, a how-it-works arc and a pricing tile — written when Budojo
 * was hosted and `budojo.it` served it to people who did not have the product.
 *
 * Two things ended that. #1230 decommissioned the hosted stack, and there is
 * no deploy workflow left, so nothing serves this on the web. And #1289 sent
 * every signed-out desktop visitor past it to `/auth/login`, on the grounds
 * that an installed app has nothing to sell. Between them the page had no
 * readers at all, which is how it came to advertise an iOS and Android
 * install that does not exist and a contact form #1464 had removed.
 *
 * #1497 answered it the other way round: the marketing is gone, and the
 * desktop bypass with it. What is here is a welcome — what the app is, one
 * button to create the academy, and the three steps after it. A first launch
 * has no password to type, and a local-first app has no onboarding email to
 * catch someone who installs it and stops.
 *
 * Visual register unchanged: the same Apple-minimal canon and the same tokens
 * as the dashboard.
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
  private readonly consentService = inject(ConsentService);
  private readonly runtimeService = inject(RuntimeService);

  /**
   * Whether the consent banner is still up. It is `position: fixed` at the
   * bottom of the viewport and this page pins its footer there, so without
   * the room the stylesheet reserves for it the support link is covered on
   * exactly the run where somebody might need it.
   */
  protected readonly consentPending = computed(() => !this.consentService.decided());

  /**
   * The support address, read from the one place that holds it (#1476).
   * The footer hardcoded it before there was a constant, which meant two
   * copies of a value that changes as a unit.
   */
  /**
   * The support address, with the build already in the body (#1476).
   *
   * This used to be a bare subject line, on the reasoning that a prospect
   * reading a landing page has no build to report. That reasoning inverted
   * with the page: the only person who reaches this screen is running a
   * shipped copy and cannot get into it, which makes them the one user whose
   * message is useless without the version attached.
   */
  protected readonly supportMailto = computed(() =>
    supportMailtoHref(this.runtimeService.profile()),
  );

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
