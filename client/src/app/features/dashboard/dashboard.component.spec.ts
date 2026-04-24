import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { AcademyService } from '../../core/services/academy.service';
import { AuthService } from '../../core/services/auth.service';
import { DashboardComponent } from './dashboard.component';

// AuthService reads `localStorage` at construction time. Some local test
// environments (e.g. node + jsdom combos) don't polyfill localStorage, which
// explodes instantiation. A thin fake keeps this spec decoupled from that
// concern — we only assert that `logout()` is called, not how it persists.
class FakeAuthService {
  readonly logout = vi.fn();
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

    it('exposes the brand trigger as a button with accessibility metadata', () => {
      academyService.academy.set({
        id: 1,
        name: 'Gracie Barra Torino',
        slug: 'gbt',
        address: null,
      });

      const fixture = TestBed.createComponent(DashboardComponent);
      fixture.detectChanges();

      const trigger = fixture.nativeElement.querySelector(
        '.sidebar__brand',
      ) as HTMLButtonElement | null;
      expect(trigger).not.toBeNull();
      expect(trigger!.tagName).toBe('BUTTON');
      expect(trigger!.getAttribute('aria-haspopup')).toBe('menu');
      expect(trigger!.getAttribute('aria-label')).toBe('Gracie Barra Torino menu');
      expect(trigger!.getAttribute('aria-expanded')).toBe('false');
    });
  });

  describe('menu', () => {
    it('contains exactly one item — Sign out — with a pi-sign-out icon', () => {
      const fixture = TestBed.createComponent(DashboardComponent);
      const component = fixture.componentInstance as unknown as {
        menuItems: () => { label?: string; icon?: string; command?: () => void }[];
      };

      const items = component.menuItems();
      expect(items).toHaveLength(1);
      expect(items[0].label).toBe('Sign out');
      expect(items[0].icon).toBe('pi pi-sign-out');
      expect(typeof items[0].command).toBe('function');
    });

    it('running the Sign out command calls AuthService.logout() and navigates to /auth/login', () => {
      const navigateSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);

      const fixture = TestBed.createComponent(DashboardComponent);
      const component = fixture.componentInstance as unknown as {
        menuItems: () => { command: () => void }[];
      };

      component.menuItems()[0].command();

      expect(authService.logout).toHaveBeenCalledTimes(1);
      expect(navigateSpy).toHaveBeenCalledWith(['/auth/login']);
    });
  });

  describe('sidebar footer — explicit Sign out button (#69)', () => {
    // The brand-dropdown menu still carries Sign out (tests above), but the
    // discoverability failure flagged in #69 required an always-visible
    // row. Verify it exists, clicks through to the same logout path, and
    // closes the mobile drawer in the same tick (so the user doesn't land
    // on /auth/login with a drawer still slid in).
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
});
