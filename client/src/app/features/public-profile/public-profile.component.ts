import { ChangeDetectionStrategy, Component, Signal, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { catchError, map, of, switchMap } from 'rxjs';
import { ButtonModule } from 'primeng/button';
import { SkeletonModule } from 'primeng/skeleton';
import {
  PublicProfile,
  PublicProfilePromotion,
  PublicProfileService,
} from '../../core/services/public-profile.service';
import { BeltBadgeComponent } from '../../shared/components/belt-badge/belt-badge.component';
import { Belt } from '../../core/services/athlete.service';
import { BELT_KEYS } from '../../shared/utils/i18n-enum-keys';

type ViewState =
  | { kind: 'loading' }
  | { kind: 'ready'; profile: PublicProfile }
  | { kind: 'not-found' };

/**
 * Athlete public profile page (#862, M9 social-profile epic slice A).
 *
 * Surface a same-academy peer's basic identity card: avatar, first
 * name + handle, current belt, joined date, and the promotions
 * timeline (top 50, newest first).
 *
 * All three privacy gates (handle unknown, opted-out, cross-academy)
 * collapse to a 404 at the API layer. The component renders a generic
 * "profile not found" state for any of them — never leaks which gate
 * tripped.
 */
@Component({
  selector: 'app-public-profile',
  standalone: true,
  imports: [
    CommonModule,
    RouterLink,
    TranslatePipe,
    ButtonModule,
    SkeletonModule,
    BeltBadgeComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './public-profile.component.html',
  styleUrl: './public-profile.component.scss',
})
export class PublicProfileComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly publicProfileService = inject(PublicProfileService);
  private readonly translateService = inject(TranslateService);

  private readonly state$ = this.route.paramMap.pipe(
    switchMap((params): ReturnType<typeof this.handleLookup> => {
      const handle = params.get('handle');
      if (handle === null || handle === '') {
        return of<ViewState>({ kind: 'not-found' });
      }
      return this.handleLookup(handle);
    }),
  );

  private handleLookup(handle: string) {
    return this.publicProfileService.get(handle).pipe(
      map((profile): ViewState => ({ kind: 'ready', profile })),
      catchError(() => of<ViewState>({ kind: 'not-found' })),
    );
  }

  protected readonly state: Signal<ViewState> = toSignal(this.state$, {
    initialValue: { kind: 'loading' } as ViewState,
  });

  protected readonly joinedAtLabel = computed(() => {
    const s = this.state();
    if (s.kind !== 'ready' || s.profile.joined_at === null) {
      return null;
    }
    const date = new Date(s.profile.joined_at);
    if (Number.isNaN(date.getTime())) {
      return null;
    }
    const locale = this.translateService.currentLang ?? this.translateService.defaultLang ?? 'en';
    return new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(date);
  });

  /**
   * Renders a promotion row as a fully-translated localized string,
   * resolved entirely in TypeScript so the template carries no dynamic
   * i18n key concatenation (client/CLAUDE.md § i18n hard rules:
   * "Don't dynamically build translation keys with template strings").
   *
   * Belt labels resolve through `BELT_KEYS` — the single static
   * `Belt → key` mapping — so a typo in a belt slug fails at compile
   * time (TypeScript narrows on the `Belt` union) instead of shipping
   * green to prod and rendering the raw key in the timeline (cf.
   * [[feedback_i18n_parity_doesnt_verify_templates]]).
   */
  protected promotionLine(promotion: PublicProfilePromotion): string {
    if (promotion.kind === 'belt') {
      return this.translateService.instant('publicProfile.promotions.beltChange', {
        from: this.beltLabel(promotion.from_belt ?? 'white'),
        to: this.beltLabel(promotion.to_belt ?? 'white'),
      });
    }
    return this.translateService.instant('publicProfile.promotions.stripeChange', {
      from: promotion.from_stripes ?? 0,
      to: promotion.to_stripes ?? 0,
    });
  }

  private beltLabel(belt: Belt): string {
    return this.translateService.instant(BELT_KEYS[belt]);
  }

  protected readonly initials = computed(() => {
    const s = this.state();
    if (s.kind !== 'ready') {
      return '';
    }
    const first = s.profile.first_name.trim();
    if (first.length === 0) {
      return s.profile.handle.charAt(0).toUpperCase();
    }
    return first.charAt(0).toUpperCase();
  });
}
