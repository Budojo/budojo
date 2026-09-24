import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Tooltip } from 'primeng/tooltip';
import { AthleteIdentity } from '../../../core/services/athlete.service';
import { LanguageService } from '../../../core/services/language.service';
import { BeltLadderService } from '../../../core/services/belt-ladder.service';
import { AgeBadgeComponent } from '../age-badge/age-badge.component';
import { BeltBadgeComponent } from '../belt-badge/belt-badge.component';
import { UserAvatarComponent } from '../user-avatar/user-avatar.component';

/**
 * How an athlete looks on a row, in one place (#1458).
 *
 * The roster and the daily attendance list draw the same people. They used to
 * draw them differently: the roster with a belt-coloured spine down the left
 * edge, an avatar and an age chip; attendance with the belt as a chip in a
 * column of its own and nothing else. Same person, two identities, and a
 * reader moving between the two screens had to re-learn the row.
 *
 * So the identity is a component and the pages keep only what is theirs — the
 * roster's payment chip and actions, attendance's present/absent control.
 *
 * What is deliberately NOT here: anything either page can decide alone. The
 * spine's tooltip, the age chip and the avatar are the athlete; a status chip
 * or a social link is a page's editorial choice about what else is worth
 * saying, and those project in through `<ng-content>`.
 */
@Component({
  selector: 'app-athlete-identity',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, Tooltip, AgeBadgeComponent, BeltBadgeComponent, UserAvatarComponent],
  templateUrl: './athlete-identity.component.html',
  styleUrl: './athlete-identity.component.scss',
})
export class AthleteIdentityComponent {
  private readonly languageService = inject(LanguageService);
  private readonly beltLadder = inject(BeltLadderService);

  readonly athlete = input.required<AthleteIdentity>();

  /**
   * Whether the name opens the athlete's detail page.
   *
   * The roster's name is its primary affordance (#281). On attendance the
   * whole row is a toggle, so a link inside it would be a second target with
   * a different meaning in the same rectangle — tap slightly left of centre
   * and you navigate away instead of marking someone present.
   */
  readonly linkToDetail = input<boolean>(false);

  /** The public-profile route the avatar links to, when the athlete has a handle. */
  readonly avatarHandle = input<string | null>(null);

  protected readonly PUBLIC_PROFILE_BASE = '/dashboard/u';

  protected readonly fullName = computed(
    () => `${this.athlete().first_name} ${this.athlete().last_name}`,
  );

  /**
   * The belt in words, for the spine's tooltip.
   *
   * Reads `currentLang()` first so the label recomputes when the locale is
   * toggled — a computed that never touches the signal would keep the belt in
   * the language the page was opened in.
   */
  protected readonly beltName = computed(() => {
    this.languageService.currentLang();
    return this.beltLadder.label(this.athlete().belt);
  });

  protected avatarUrl(): string | null {
    // The athlete's own photo wins over the linked user's avatar (#1357):
    // `athlete_accounts` does not exist on the desktop build, so the photo is
    // the only picture most installs will ever have.
    return this.athlete().photo_url ?? this.athlete().user_avatar_url ?? null;
  }
}
