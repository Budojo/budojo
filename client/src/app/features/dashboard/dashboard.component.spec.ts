import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { signal } from '@angular/core';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { SwPush } from '@angular/service-worker';
import { MessageService } from 'primeng/api';
import { Subject, of } from 'rxjs';
import { AcademyService } from '../../core/services/academy.service';
import { AuthService } from '../../core/services/auth.service';
import { DashboardComponent } from './dashboard.component';
import { provideI18nTesting } from '../../../test-utils/i18n-test';

// AuthService reads `localStorage` at construction time. Some local test
// environments (e.g. node + jsdom combos) don't polyfill localStorage, which
// explodes instantiation. A thin fake keeps this spec decoupled from that
// concern.
class FakeAuthService {
  readonly logout = vi.fn();
  // Loose typing so individual specs can `user.set(...)` a User-shaped object
  // without re-declaring the full interface in every assertion.
  readonly user = signal<unknown>(null);
  readonly isEmailVerified = signal(false);
  readonly getToken = vi.fn(() => null as string | null);
  readonly loadCurrentUser = vi.fn(() =>
    of({
      id: 1,
      first_name: 'X',
      last_name: 'Y',
      full_name: 'X Y',
      handle: null,
      email: 'x@y',
      email_verified_at: null,
      avatar_url: null,
    }),
  );
  readonly resendVerificationEmail = vi.fn(() => of(undefined));
}

describe('DashboardComponent', () => {
  let authService: FakeAuthService;
  let academyService: AcademyService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [DashboardComponent],
      providers: [
        provideRouter([]),
        provideAnimationsAsync(),
        provideHttpClient(),
        provideHttpClientTesting(),
        ...provideI18nTesting(),
        { provide: AuthService, useClass: FakeAuthService },
        // DashboardComponent wires the WebPushHandlerService (#702),
        // which injects SwPush + MessageService. Provide minimal stubs so
        // the spec doesn't have to know about the push pipeline.
        MessageService,
        {
          provide: SwPush,
          useValue: {
            isEnabled: false,
            notificationClicks: new Subject(),
            messages: new Subject(),
          },
        },
      ],
    });
    authService = TestBed.inject(AuthService) as unknown as FakeAuthService;
    academyService = TestBed.inject(AcademyService);
  });

  describe('brand identity (rail)', () => {
    it('renders the academy name as the rail brand label when the signal is set', () => {
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
      expect(el.querySelector('.rail__brand-text')?.textContent?.trim()).toBe(
        'Gracie Barra Torino',
      );
    });

    it('falls back to "Budojo" when the academy signal is null (defensive)', () => {
      academyService.academy.set(null);

      const fixture = TestBed.createComponent(DashboardComponent);
      fixture.detectChanges();

      const el: HTMLElement = fixture.nativeElement;
      expect(el.querySelector('.rail__brand-text')?.textContent?.trim()).toBe('Budojo');
    });
  });

  describe('topbar user avatar chip (#411)', () => {
    it('renders a topbar avatar chip linking to /dashboard/profile with initials fallback', () => {
      authService.user.set({
        id: 1,
        first_name: 'Mario',
        last_name: 'Rossi',
        full_name: 'Mario Rossi',
        handle: null,
        email: 'mario@example.com',
        email_verified_at: null,
        avatar_url: null,
      } as never);

      const fixture = TestBed.createComponent(DashboardComponent);
      fixture.detectChanges();

      const link = fixture.nativeElement.querySelector(
        '[data-cy="topbar-user-avatar"]',
      ) as HTMLAnchorElement | null;
      expect(link).not.toBeNull();
      expect(link!.tagName).toBe('A');
      expect(link!.getAttribute('href')).toBe('/dashboard/profile');
      // Initials fallback when avatar_url is null.
      const initials = link!.querySelector('[data-cy="user-avatar-initials"]');
      expect(initials).not.toBeNull();
      expect(initials!.textContent?.trim()).toBe('MR');
    });

    it('renders the uploaded avatar image when avatar_url is set', () => {
      authService.user.set({
        id: 1,
        first_name: 'Mario',
        last_name: 'Rossi',
        full_name: 'Mario Rossi',
        handle: null,
        email: 'mario@example.com',
        email_verified_at: null,
        avatar_url: '/storage/users/avatars/1.jpg',
      } as never);

      const fixture = TestBed.createComponent(DashboardComponent);
      fixture.detectChanges();

      const img = fixture.nativeElement.querySelector(
        '[data-cy="topbar-user-avatar"] [data-cy="user-avatar-image"]',
      ) as HTMLImageElement | null;
      expect(img).not.toBeNull();
      expect(img!.getAttribute('src')).toBe('/storage/users/avatars/1.jpg');
      expect(
        fixture.nativeElement.querySelector(
          '[data-cy="topbar-user-avatar"] [data-cy="user-avatar-initials"]',
        ),
      ).toBeNull();
    });
  });

  describe('topbar home link', () => {
    it('wraps the Budojo wordmark in a routerLink to the academy home (#1112)', () => {
      const fixture = TestBed.createComponent(DashboardComponent);
      fixture.detectChanges();

      const link = fixture.nativeElement.querySelector(
        '[data-cy="topbar-home-link"]',
      ) as HTMLAnchorElement | null;
      expect(link).not.toBeNull();
      expect(link!.tagName).toBe('A');
      // The brand now points at the academy home (the pi-home Home tab),
      // matching its "go to home" aria-label — not the /dashboard index
      // (which redirects to the athletes roster). #1112.
      expect(link!.getAttribute('href')).toBe('/dashboard/academy');
      expect(link!.getAttribute('aria-label')).toContain('go to dashboard home');
    });
  });

  describe('brand glyph fallback (#99)', () => {
    // When `<img src=".../logo-glyph.svg">` is used, the SVG is sandboxed from
    // host CSS — `stroke="currentColor"` resolves to the SVG's own root
    // (black). Rendering the fallback glyph inline lets currentColor inherit
    // the host text color. Asserted on the rail (desktop) + topbar (mobile).
    it('renders the inline brand-glyph fallback in rail + topbar when academy has no logo_url', () => {
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

      const railLogo = el.querySelector('.rail__logo');
      expect(railLogo).not.toBeNull();
      expect(railLogo!.tagName.toLowerCase()).toBe('app-brand-glyph');
      expect(railLogo!.getAttribute('data-cy')).toBe('brand-glyph-fallback');
      expect(railLogo!.querySelector('svg')).not.toBeNull();

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

      const railLogo = el.querySelector('.rail__logo');
      expect(railLogo).not.toBeNull();
      expect(railLogo!.tagName.toLowerCase()).toBe('img');
      expect(railLogo!.getAttribute('src')).toBe('/storage/academy-logos/1/logo.png');

      const topbarLogo = el.querySelector('.topbar__logo');
      expect(topbarLogo).not.toBeNull();
      expect(topbarLogo!.tagName.toLowerCase()).toBe('img');
      expect(topbarLogo!.getAttribute('src')).toBe('/storage/academy-logos/1/logo.png');

      expect(el.querySelector('[data-cy="brand-glyph-fallback"]')).toBeNull();
      expect(el.querySelector('app-brand-glyph')).toBeNull();
    });

    it('renders the inline brand-glyph fallback when the academy signal is null (defensive)', () => {
      academyService.academy.set(null);

      const fixture = TestBed.createComponent(DashboardComponent);
      fixture.detectChanges();

      const railLogo = (fixture.nativeElement as HTMLElement).querySelector('.rail__logo');
      expect(railLogo).not.toBeNull();
      expect(railLogo!.tagName.toLowerCase()).toBe('app-brand-glyph');
      expect(railLogo!.querySelector('svg')).not.toBeNull();
    });
  });

  describe('bottom-nav + ➕ create-sheet (#1111)', () => {
    // Mobile: a bottom tab bar + a center ➕ create-sheet (the hamburger
    // drawer is retired). The desktop rail is asserted separately below.
    it('renders the mobile bottom nav with the owner tabs + center create', () => {
      const fixture = TestBed.createComponent(DashboardComponent);
      fixture.detectChanges();

      const el: HTMLElement = fixture.nativeElement;
      expect(el.querySelector('app-bottom-nav')).not.toBeNull();
      for (const cy of [
        'bottomnav-academy',
        'bottomnav-athletes',
        'bottomnav-community',
        'bottomnav-more',
        'bottomnav-create',
      ]) {
        expect(el.querySelector(`[data-cy="${cy}"]`), cy).not.toBeNull();
      }
    });

    it('the More tab points at the /dashboard/more hub', () => {
      const fixture = TestBed.createComponent(DashboardComponent);
      fixture.detectChanges();

      const more = fixture.nativeElement.querySelector(
        '[data-cy="bottomnav-more"]',
      ) as HTMLAnchorElement | null;
      expect(more).not.toBeNull();
      expect(more!.getAttribute('href')).toBe('/dashboard/more');
    });

    it('opens the ➕ create sheet with the owner quick actions when the center button fires', () => {
      const fixture = TestBed.createComponent(DashboardComponent);
      fixture.detectChanges();

      const el: HTMLElement = fixture.nativeElement;
      expect(el.querySelector('[role="dialog"]')).toBeNull();

      (el.querySelector('[data-cy="bottomnav-create"]') as HTMLElement).click();
      fixture.detectChanges();

      expect(el.querySelector('[role="dialog"]')).not.toBeNull();
      expect(el.querySelector('[data-cy="create-attendance"]')).not.toBeNull();
      expect(el.querySelector('[data-cy="create-athlete"]')).not.toBeNull();
      expect(el.querySelector('[data-cy="create-post"]')).not.toBeNull();
    });

    it('retires the hamburger drawer — no hamburger button, no backdrop', () => {
      const fixture = TestBed.createComponent(DashboardComponent);
      fixture.detectChanges();

      const el: HTMLElement = fixture.nativeElement;
      expect(el.querySelector('[data-cy="topbar-hamburger"]')).toBeNull();
      expect(el.querySelector('[data-cy="drawer-backdrop"]')).toBeNull();
    });
  });

  describe('desktop social rail (#1112)', () => {
    const OWNER = {
      id: 1,
      first_name: 'Sensei',
      last_name: 'Mario',
      full_name: 'Sensei Mario',
      handle: 'senseimario',
      email: 'sensei@example.com',
      email_verified_at: null,
      avatar_url: null,
    };

    it('renders the rail with the same destinations as the bottom nav (academy/athletes/community/more)', () => {
      const fixture = TestBed.createComponent(DashboardComponent);
      fixture.detectChanges();

      const rail = fixture.nativeElement.querySelector(
        '[data-cy="owner-rail"]',
      ) as HTMLElement | null;
      expect(rail).not.toBeNull();
      expect(rail!.querySelector('a[href="/dashboard/academy"]')).not.toBeNull();
      expect(rail!.querySelector('a[href="/dashboard/athletes"]')).not.toBeNull();
      expect(rail!.querySelector('a[href="/dashboard/community"]')).not.toBeNull();
      expect(rail!.querySelector('a[href="/dashboard/more"]')).not.toBeNull();
    });

    it('points the brand link at the academy home, matching its aria-label', () => {
      const fixture = TestBed.createComponent(DashboardComponent);
      fixture.detectChanges();

      const brand = fixture.nativeElement.querySelector(
        'a.rail__brand',
      ) as HTMLAnchorElement | null;
      expect(brand).not.toBeNull();
      expect(brand!.getAttribute('href')).toBe('/dashboard/academy');
    });

    it('opens the create sheet with the owner quick actions from the rail ➕ Create', () => {
      const fixture = TestBed.createComponent(DashboardComponent);
      fixture.detectChanges();

      const el = fixture.nativeElement as HTMLElement;
      expect(el.querySelector('[role="dialog"]')).toBeNull();

      (el.querySelector('[data-cy="rail-create"]') as HTMLElement).click();
      fixture.detectChanges();

      expect(el.querySelector('[role="dialog"]')).not.toBeNull();
      expect(el.querySelector('[data-cy="create-attendance"]')).not.toBeNull();
      expect(el.querySelector('[data-cy="create-athlete"]')).not.toBeNull();
      expect(el.querySelector('[data-cy="create-post"]')).not.toBeNull();
    });

    it('pins a profile chip linking to the More hub, showing the handle', () => {
      authService.user.set(OWNER as never);
      const fixture = TestBed.createComponent(DashboardComponent);
      fixture.detectChanges();

      const chip = fixture.nativeElement.querySelector(
        '[data-cy="rail-profile"]',
      ) as HTMLAnchorElement | null;
      expect(chip).not.toBeNull();
      expect(chip!.getAttribute('href')).toBe('/dashboard/more');
      expect(chip!.textContent).toContain('@senseimario');
    });

    it('demotes stats / settings off the rail (they live on the More hub)', () => {
      const fixture = TestBed.createComponent(DashboardComponent);
      fixture.detectChanges();

      const rail = fixture.nativeElement.querySelector('[data-cy="owner-rail"]') as HTMLElement;
      expect(rail.querySelector('a[href="/dashboard/stats"]')).toBeNull();
      expect(rail.querySelector('a[href="/dashboard/profile"]')).toBeNull();
    });
  });
});
