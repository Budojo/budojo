import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  viewChild,
} from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { AuthService } from '../../core/services/auth.service';
import { LanguageService } from '../../core/services/language.service';
import { BrandGlyphComponent } from '../../shared/components/brand-glyph/brand-glyph.component';
import {
  BottomNavCenterAction,
  BottomNavComponent,
  BottomNavTab,
} from '../../shared/components/bottom-nav/bottom-nav.component';
import {
  CreateSheetAction,
  CreateSheetComponent,
} from '../../shared/components/create-sheet/create-sheet.component';
import { SidebarFooterMetaComponent } from '../../shared/components/sidebar-footer-meta/sidebar-footer-meta.component';
import { UserAvatarComponent } from '../../shared/components/user-avatar/user-avatar.component';

/**
 * Athlete-side dashboard shell (#610). Social-native navigation (#1109):
 * a bottom tab bar + center ➕ create-sheet on mobile (`<768px`), the
 * desktop sidebar above. The hamburger off-canvas drawer is retired — the
 * destinations demoted off the bar (public profile, payments, documents,
 * settings, sign-out, language) live on the `/dashboard/me/more` hub.
 *
 * Tab labels resolve reactively to the runtime language: each computed
 * reads `languageService.currentLang()` so `translate.instant()` re-runs
 * on a locale switch (same pattern as the invitation-card chips).
 */
@Component({
  selector: 'app-athlete-dashboard',
  standalone: true,
  imports: [
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    BrandGlyphComponent,
    BottomNavComponent,
    CreateSheetComponent,
    SidebarFooterMetaComponent,
    UserAvatarComponent,
    TranslatePipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './athlete-dashboard.component.html',
  styleUrl: './athlete-dashboard.component.scss',
})
export class AthleteDashboardComponent implements OnInit {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly translate = inject(TranslateService);
  private readonly languageService = inject(LanguageService);

  protected readonly user = this.authService.user;
  protected readonly createSheet = viewChild.required(CreateSheetComponent);

  /** Mobile bottom-tab destinations. The ➕ (create) splits them 2·➕·2. */
  protected readonly tabs = computed<BottomNavTab[]>(() => {
    this.languageService.currentLang();
    const t = (key: string): string => this.translate.instant(key);
    return [
      {
        icon: 'pi pi-home',
        label: t('athletePortal.nav.feed'),
        routerLink: '/dashboard/me/feed',
        dataCy: 'bottomnav-feed',
      },
      {
        icon: 'pi pi-building',
        label: t('athletePortal.nav.academy'),
        routerLink: '/dashboard/me/academy',
        dataCy: 'bottomnav-academy',
      },
      {
        icon: 'pi pi-calendar',
        label: t('athletePortal.nav.attendance'),
        routerLink: '/dashboard/me/attendance',
        dataCy: 'bottomnav-attendance',
      },
      {
        icon: 'pi pi-ellipsis-h',
        label: t('athletePortal.more.title'),
        routerLink: '/dashboard/me/more',
        dataCy: 'bottomnav-more',
      },
    ];
  });

  protected readonly createTitle = computed<string>(() => {
    this.languageService.currentLang();
    return this.translate.instant('athletePortal.create.title');
  });

  protected readonly centerAction = computed<BottomNavCenterAction>(() => ({
    icon: 'pi pi-plus',
    ariaLabel: this.createTitle(),
    dataCy: 'bottomnav-create',
  }));

  protected readonly navAriaLabel = computed<string>(() => {
    this.languageService.currentLang();
    return this.translate.instant('athletePortal.nav.barAriaLabel');
  });

  /** Role-aware quick actions for the ➕ sheet (athlete: check-in / post). */
  protected readonly createActions = computed<CreateSheetAction[]>(() => {
    this.languageService.currentLang();
    const t = (key: string): string => this.translate.instant(key);
    return [
      {
        icon: 'pi pi-check-circle',
        label: t('athletePortal.create.checkIn'),
        routerLink: '/dashboard/me/attendance/today',
        dataCy: 'create-checkin',
      },
      {
        icon: 'pi pi-pencil',
        label: t('athletePortal.create.post'),
        routerLink: '/dashboard/me/feed',
        dataCy: 'create-post',
      },
    ];
  });

  protected onCreate(): void {
    this.createSheet().open();
  }

  ngOnInit(): void {
    // Hydrate the cached user envelope on first paint so the avatar +
    // name + handle render with real data. A hard refresh loses the
    // in-memory signal but keeps the auth_token, so /auth/me round-trips
    // it back.
    if (this.user() === null) {
      this.authService.loadCurrentUser().subscribe({ error: () => undefined });
    }
  }

  signOut(): void {
    this.authService.logout();
    void this.router.navigate(['/auth/login']);
  }
}
