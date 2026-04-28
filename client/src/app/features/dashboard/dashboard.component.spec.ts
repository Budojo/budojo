import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { signal } from '@angular/core';
import { of } from 'rxjs';
import { AcademyService } from '../../core/services/academy.service';
import { AuthService } from '../../core/services/auth.service';
import { DashboardComponent } from './dashboard.component';

// AuthService reads `localStorage` at construction time. Some local test
// environments (e.g. node + jsdom combos) don't polyfill localStorage, which
// explodes instantiation. A thin fake keeps this spec decoupled from that
// concern — we only assert that `logout()` is called, not how it persists.
class FakeAuthService {
  readonly logout = vi.fn();
  readonly user = signal<null>(null);
  readonly isEmailVerified = signal(false);
  readonly getToken = vi.fn(() => null as string | null);
  readonly loadCurrentUser = vi.fn(() =>
    of({ id: 1, name: 'X', email: 'x@y', email_verified_at: null }),
  );
  readonly resendVerificationEmail = vi.fn(() => of(undefined));
}

describe('DashboardComponent', () => {
  let router: Router;
  let authService: FakeAuthService;
  let academyService: AcademyService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [DashboardComponent],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AuthService, useClass: FakeAuthService },
      ],
    });
    router = TestBed.inject(Router);
    authService = TestBed.inject(AuthService) as unknown as FakeAuthService;
    academyService = TestBed.inject(AcademyService);
  });

  describe('brand identity', () => {
    it('renders the academy name as the dominant brand label when the signal is set', () => {
      academyService.academy.set({
        id: 1,
        name: 'Gracie Barra Torino',
        slug: 'gbt',
        address: null,
        logo_url: null,
      });

      const fixture = TestBed.createComponent(DashboardComponent);
      fixture.detectChanges();

      const el: HTMLElement = fixture.nativeElement;
      expect(el.querySelector('.sidebar__brand-name')?.textContent?.trim()).toBe(
        'Gracie Barra Torino',
      );
    });

    it('falls back to "Budojo" when the academy signal is null (defensive)', () => {
      academyService.academy.set(null);

      const fixture = TestBed.createComponent(DashboardComponent);
      fixture.detectChanges();

      const el: HTMLElement = fixture.nativeElement;
      expect(el.querySelector('.sidebar__brand-name')?.textContent?.trim()).toBe('Budojo');
    });

    it('renders the brand area as a non-interactive header (#166 retired the dropdown)', () => {
      academyService.academy.set({
        id: 1,
        name: 'Gracie Barra Torino',
        slug: 'gbt',
        address: null,
        logo_url: null,
      });

      const fixture = TestBed.createComponent(DashboardComponent);
      fixture.detectChanges();

      const brand = fixture.nativeElement.querySelector(
        '[data-cy="sidebar-brand"]',
      ) as HTMLElement | null;
      expect(brand).not.toBeNull();
      // Was a <button> with aria-haspopup="menu" before #166; now a plain div.
      expect(brand!.tagName).toBe('DIV');
      expect(brand!.getAttribute('aria-haspopup')).toBeNull();
      expect(brand!.getAttribute('aria-expanded')).toBeNull();
    });

    it('does not render a brand dropdown menu after #166', () => {
      const fixture = TestBed.createComponent(DashboardComponent);
      fixture.detectChanges();

      // <p-menu> was the popup menu component (the brand button was the
      // trigger); both the menu host element and the caret icon are gone
      // now. Sign out lives only in the bottom row.
      expect(fixture.nativeElement.querySelector('p-menu')).toBeNull();
      expect(fixture.nativeElement.querySelector('.sidebar__brand-caret')).toBeNull();
    });
  });

  describe('sidebar footer — sign-out is the only signout entry (#166)', () => {
    // After retiring the brand-dropdown signout, this row is the singular,
    // always-visible affordance. Verify it exists, clicks through to the
    // logout path, and closes the mobile drawer in the same tick.
    it('renders a sign-out button at the bottom of the sidebar with pi-sign-out icon', () => {
      const fixture = TestBed.createComponent(DashboardComponent);
      fixture.detectChanges();

      const btn = fixture.nativeElement.querySelector(
        '[data-cy="nav-sign-out"]',
      ) as HTMLButtonElement | null;
      expect(btn).not.toBeNull();
      expect(btn!.tagName).toBe('BUTTON');
      expect(btn!.textContent).toContain('Sign out');
      expect(btn!.querySelector('i.pi-sign-out')).not.toBeNull();
    });

    it('clicking the footer sign-out button logs out + navigates + closes the drawer', () => {
      const navigateSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);
      const fixture = TestBed.createComponent(DashboardComponent);
      const component = fixture.componentInstance as unknown as {
        toggleSidebar: () => void;
        sidebarOpen: () => boolean;
      };
      fixture.detectChanges();

      // Open the drawer first so we can verify closeSidebar() fires.
      component.toggleSidebar();
      expect(component.sidebarOpen()).toBe(true);

      const btn = fixture.nativeElement.querySelector(
        '[data-cy="nav-sign-out"]',
      ) as HTMLButtonElement;
      btn.click();

      expect(component.sidebarOpen()).toBe(false);
      expect(authService.logout).toHaveBeenCalledTimes(1);
      expect(navigateSpy).toHaveBeenCalledWith(['/auth/login']);
    });
  });

  describe('topbar home link (#68)', () => {
    it('wraps the Budojo wordmark in a routerLink to /dashboard', () => {
      const fixture = TestBed.createComponent(DashboardComponent);
      fixture.detectChanges();

      const link = fixture.nativeElement.querySelector(
        '[data-cy="topbar-home-link"]',
      ) as HTMLAnchorElement | null;
      expect(link).not.toBeNull();
      expect(link!.tagName).toBe('A');
      // Angular writes the resolved target into the href attribute when
      // a routerLink directive resolves.
      expect(link!.getAttribute('href')).toBe('/dashboard');
      expect(link!.getAttribute('aria-label')).toContain('go to dashboard home');
    });
  });

  describe('brand glyph fallback (#99)', () => {
    // Background: when `<img src=".../logo-glyph.svg">` is used, the SVG is
    // sandboxed from host CSS — `stroke="currentColor"` resolves to the SVG's
    // own root, which defaults to black. On the dark sidebar (--p-surface-900)
    // the glyph blends into the background. Fix: render the fallback Budojo
    // glyph inline so currentColor inherits the host text color.
    it('renders the inline brand-glyph fallback in sidebar + topbar when academy has no logo_url', () => {
      academyService.academy.set({
        id: 1,
        name: 'Gracie Barra Torino',
        slug: 'gbt',
        address: null,
        logo_url: null,
      });

      const fixture = TestBed.createComponent(DashboardComponent);
      fixture.detectChanges();

      const el: HTMLElement = fixture.nativeElement;

      const sidebarLogo = el.querySelector('.sidebar__logo');
      expect(sidebarLogo).not.toBeNull();
      expect(sidebarLogo!.tagName.toLowerCase()).toBe('app-brand-glyph');
      expect(sidebarLogo!.getAttribute('data-cy')).toBe('brand-glyph-fallback');
      // The <app-brand-glyph> host renders an <svg> with currentColor strokes —
      // assert the SVG is actually present so a broken component doesn't pass.
      expect(sidebarLogo!.querySelector('svg')).not.toBeNull();

      const topbarLogo = el.querySelector('.topbar__logo');
      expect(topbarLogo).not.toBeNull();
      expect(topbarLogo!.tagName.toLowerCase()).toBe('app-brand-glyph');
      expect(topbarLogo!.querySelector('svg')).not.toBeNull();
    });

    it('renders an <img> with the academy logo on BOTH surfaces when logo_url is set, no fallback', () => {
      academyService.academy.set({
        id: 1,
        name: 'Gracie Barra Torino',
        slug: 'gbt',
        address: null,
        logo_url: '/storage/academy-logos/1/logo.png',
      });

      const fixture = TestBed.createComponent(DashboardComponent);
      fixture.detectChanges();

      const el: HTMLElement = fixture.nativeElement;

      const sidebarLogo = el.querySelector('.sidebar__logo');
      expect(sidebarLogo).not.toBeNull();
      expect(sidebarLogo!.tagName.toLowerCase()).toBe('img');
      expect(sidebarLogo!.getAttribute('src')).toBe('/storage/academy-logos/1/logo.png');

      const topbarLogo = el.querySelector('.topbar__logo');
      expect(topbarLogo).not.toBeNull();
      expect(topbarLogo!.tagName.toLowerCase()).toBe('img');
      expect(topbarLogo!.getAttribute('src')).toBe('/storage/academy-logos/1/logo.png');

      // Neither surface renders the inline fallback when a custom logo is present.
      expect(el.querySelector('[data-cy="brand-glyph-fallback"]')).toBeNull();
      expect(el.querySelector('app-brand-glyph')).toBeNull();
    });

    it('renders the inline brand-glyph fallback when the academy signal is null (defensive)', () => {
      academyService.academy.set(null);

      const fixture = TestBed.createComponent(DashboardComponent);
      fixture.detectChanges();

      const el: HTMLElement = fixture.nativeElement;

      const sidebarLogo = el.querySelector('.sidebar__logo');
      expect(sidebarLogo).not.toBeNull();
      expect(sidebarLogo!.tagName.toLowerCase()).toBe('app-brand-glyph');
      expect(sidebarLogo!.querySelector('svg')).not.toBeNull();
    });
  });

  describe('mobile drawer state', () => {
    it('starts closed — the off-canvas sidebar is hidden by default', () => {
      const fixture = TestBed.createComponent(DashboardComponent);
      fixture.detectChanges();

      const el: HTMLElement = fixture.nativeElement;
      const sidebar = el.querySelector('.sidebar') as HTMLElement | null;
      expect(sidebar).not.toBeNull();
      expect(sidebar!.classList.contains('sidebar--open')).toBe(false);
      // Backdrop is only rendered when the drawer is open.
      expect(el.querySelector('[data-cy="drawer-backdrop"]')).toBeNull();
    });

    it('toggleSidebar flips the open state; closeSidebar resets it', () => {
      const fixture = TestBed.createComponent(DashboardComponent);
      const component = fixture.componentInstance as unknown as {
        toggleSidebar: () => void;
        closeSidebar: () => void;
        sidebarOpen: () => boolean;
      };

      expect(component.sidebarOpen()).toBe(false);
      component.toggleSidebar();
      expect(component.sidebarOpen()).toBe(true);
      component.toggleSidebar();
      expect(component.sidebarOpen()).toBe(false);

      component.toggleSidebar();
      component.closeSidebar();
      expect(component.sidebarOpen()).toBe(false);
    });

    it('hamburger button exposes aria-expanded and aria-controls pointing at the sidebar', () => {
      const fixture = TestBed.createComponent(DashboardComponent);
      fixture.detectChanges();

      const hamburger = fixture.nativeElement.querySelector(
        '[data-cy="topbar-hamburger"]',
      ) as HTMLButtonElement | null;
      expect(hamburger).not.toBeNull();
      expect(hamburger!.getAttribute('aria-expanded')).toBe('false');
      expect(hamburger!.getAttribute('aria-controls')).toBe('app-sidebar');
      // Accessible label flips based on open state.
      expect(hamburger!.getAttribute('aria-label')).toBe('Open navigation');
    });
  });

  describe('app version footer (#160)', () => {
    // The committed default is `dev` (overwritten at prod build by
    // `scripts/write-version.cjs`). Asserting on the literal default keeps
    // the test environment-deterministic — Vitest never goes through the
    // prebuild hook.
    it('renders the version tag in the sidebar footer', () => {
      const fixture = TestBed.createComponent(DashboardComponent);
      fixture.detectChanges();

      const el = fixture.nativeElement.querySelector(
        '[data-cy="sidebar-version"]',
      ) as HTMLElement | null;
      expect(el).not.toBeNull();
      expect(el!.textContent?.trim()).toBe('dev');
    });
  });

  describe('email-verification pillola — removed from sidebar (#179)', () => {
    // The pillola lives only on /dashboard/profile now. The dashboard shell
    // shouldn't render <app-email-verification-status> at all — the spot
    // between brand and nav stays empty.
    it('does not render the email-verification component anywhere in the shell', () => {
      const fixture = TestBed.createComponent(DashboardComponent);
      fixture.detectChanges();

      const pillola = fixture.nativeElement.querySelector('app-email-verification-status');
      const slot = fixture.nativeElement.querySelector('.sidebar__verification');
      expect(pillola).toBeNull();
      expect(slot).toBeNull();
    });
  });
});
