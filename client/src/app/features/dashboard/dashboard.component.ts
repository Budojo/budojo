import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  computed,
  inject,
  viewChild,
} from '@angular/core';
import { RouterLink, RouterOutlet } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { AcademyService } from '../../core/services/academy.service';
import { AuthService } from '../../core/services/auth.service';
import { LanguageService } from '../../core/services/language.service';
import { NotificationInboxService } from '../../core/services/notification-inbox.service';
import { WebPushHandlerService } from '../../core/services/web-push-handler.service';
import {
  BottomNavCenterAction,
  BottomNavComponent,
  BottomNavTab,
} from '../../shared/components/bottom-nav/bottom-nav.component';
import { BrandGlyphComponent } from '../../shared/components/brand-glyph/brand-glyph.component';
import {
  CreateSheetAction,
  CreateSheetComponent,
} from '../../shared/components/create-sheet/create-sheet.component';
import {
  RailBrand,
  RailNotifications,
  RailProfile,
  SideRailComponent,
} from '../../shared/components/side-rail/side-rail.component';
import { UserAvatarComponent } from '../../shared/components/user-avatar/user-avatar.component';
import { SearchPaletteComponent } from '../search/search-palette.component';
import { NotificationBellComponent } from '../notifications/notification-bell.component';
import { VERSION } from '../../../environments/version';

/**
 * Owner-side dashboard shell. Social-native navigation (#1111): a bottom
 * tab bar + center ➕ create-sheet on mobile (`<768px`); a desktop social
 * rail (#1112) above. The hamburger off-canvas drawer — and its
 * swipe-to-close gesture + body-scroll-lock — is retired; the destinations
 * demoted off the bar (attendance, stats, activity, settings, support,
 * what's-new, language, sign-out) live on the `/dashboard/more` hub.
 *
 * Bottom-tab labels resolve reactively to the runtime language: each
 * computed reads `languageService.currentLang()` so `translate.instant()`
 * re-runs on a locale switch (same pattern as the athlete shell).
 */
@Component({
  selector: 'app-dashboard',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterOutlet,
    RouterLink,
    BottomNavComponent,
    CreateSheetComponent,
    BrandGlyphComponent,
    SideRailComponent,
    UserAvatarComponent,
    SearchPaletteComponent,
    NotificationBellComponent,
    TranslatePipe,
  ],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss',
})
export class DashboardComponent implements OnInit {
  private readonly academyService = inject(AcademyService);
  private readonly authService = inject(AuthService);
  private readonly languageService = inject(LanguageService);
  private readonly translate = inject(TranslateService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly webPushHandler = inject(WebPushHandlerService);
  private readonly inbox = inject(NotificationInboxService);

  /**
   * The cached user — drives the topbar avatar chip. Hydrated by
   * `ngOnInit()` on a hard refresh (the in-memory signal is lost but the
   * auth token survives, so `/auth/me` round-trips it back).
   */
  protected readonly user = this.authService.user;

  /** The ➕ create sheet — opened when the bottom-nav center button fires. */
  protected readonly createSheet = viewChild.required(CreateSheetComponent);

  ngOnInit(): void {
    // Page-reload bootstrap: if a token is present (auth guard already ran)
    // but `user` is still null, fetch /auth/me so the avatar chip has data.
    if (this.authService.getToken() && this.authService.user() === null) {
      this.authService.loadCurrentUser().subscribe({ error: () => undefined });
    }

    // Wire the Web Push event streams (#702). Only authenticated users
    // reach the dashboard shell, so this is the right scope.
    this.webPushHandler.initialize(this.destroyRef);
  }

  /**
   * The sidebar brand label. The academy name is the operationally dominant
   * identity (Krug + Norman); "Budojo" is a defensive fallback for the first
   * render tick before `hasAcademyGuard` has resolved the academy.
   */
  protected readonly brandLabel = computed(() => this.academyService.academy()?.name ?? 'Budojo');

  /**
   * Academy logo URL when uploaded, otherwise `null` — the signal for the
   * template to render the inline Budojo glyph fallback (an `<img>`-loaded
   * SVG is sandboxed from host CSS, so `stroke="currentColor"` would resolve
   * black and vanish against the dark sidebar — #99).
   */
  protected readonly academyLogoUrl = computed(
    () => this.academyService.academy()?.logo_url ?? null,
  );

  /** Avatar URL + name for the topbar chip (#411), re-derived off `user`. */
  protected readonly userAvatarUrl = computed(() => this.authService.user()?.avatar_url ?? null);
  protected readonly userName = computed(() => this.authService.user()?.full_name ?? null);

  /**
   * App version surfaced quietly in the sidebar footer (#160). Resolved from
   * `git describe` at build time by `scripts/write-version.cjs`.
   */
  protected readonly versionTag = VERSION.tag;

  /** Mobile bottom-tab destinations. The ➕ (create) splits them 2·➕·2. */
  protected readonly tabs = computed<BottomNavTab[]>(() => {
    this.languageService.currentLang();
    const t = (key: string): string => this.translate.instant(key);
    return [
      {
        icon: 'pi pi-home',
        label: t('nav.academy'),
        routerLink: '/dashboard/academy',
        dataCy: 'bottomnav-academy',
      },
      {
        icon: 'pi pi-users',
        label: t('nav.athletes'),
        routerLink: '/dashboard/athletes',
        dataCy: 'bottomnav-athletes',
      },
      {
        icon: 'pi pi-comments',
        label: t('nav.community'),
        routerLink: '/dashboard/community',
        dataCy: 'bottomnav-community',
      },
      {
        icon: 'pi pi-ellipsis-h',
        label: t('nav.more'),
        routerLink: '/dashboard/more',
        dataCy: 'bottomnav-more',
      },
    ];
  });

  protected readonly createTitle = computed<string>(() => {
    this.languageService.currentLang();
    return this.translate.instant('nav.create.title');
  });

  /** Desktop rail notifications entry → the owner notifications page, with the unread badge. */
  protected readonly railNotifications = computed<RailNotifications>(() => {
    this.languageService.currentLang();
    return {
      routerLink: '/dashboard/notifications',
      unread: this.inbox.unread(),
      label: this.translate.instant('notifications.title'),
    };
  });

  protected readonly centerAction = computed<BottomNavCenterAction>(() => ({
    icon: 'pi pi-plus',
    ariaLabel: this.createTitle(),
    dataCy: 'bottomnav-create',
  }));

  protected readonly navAriaLabel = computed<string>(() => {
    this.languageService.currentLang();
    return this.translate.instant('nav.barAriaLabel');
  });

  /** Desktop rail brand — academy name + logo → the academy home. */
  protected readonly railBrand = computed<RailBrand>(() => ({
    label: this.brandLabel(),
    logoUrl: this.academyLogoUrl(),
    routerLink: '/dashboard/academy',
  }));

  /** Desktop rail profile chip → the More hub; null until the user hydrates. */
  protected readonly railProfile = computed<RailProfile | null>(() => {
    const u = this.user();
    return u
      ? {
          name: this.userName(),
          avatarUrl: this.userAvatarUrl(),
          handle: u.handle,
          routerLink: '/dashboard/more',
        }
      : null;
  });

  /** Role-aware quick actions for the ➕ sheet (owner: mark attendance / add athlete / post). */
  protected readonly createActions = computed<CreateSheetAction[]>(() => {
    this.languageService.currentLang();
    const t = (key: string): string => this.translate.instant(key);
    return [
      {
        icon: 'pi pi-check-circle',
        label: t('nav.create.markAttendance'),
        routerLink: '/dashboard/attendance',
        dataCy: 'create-attendance',
      },
      {
        icon: 'pi pi-user-plus',
        label: t('nav.create.addAthlete'),
        routerLink: '/dashboard/athletes/new',
        dataCy: 'create-athlete',
      },
      {
        icon: 'pi pi-pencil',
        label: t('nav.create.post'),
        routerLink: '/dashboard/community',
        dataCy: 'create-post',
      },
    ];
  });

  protected onCreate(): void {
    this.createSheet().open();
  }
}
