import { TestBed } from '@angular/core/testing';
import {
  ActivatedRouteSnapshot,
  Router,
  RouterStateSnapshot,
  UrlTree,
  provideRouter,
} from '@angular/router';
import { signal } from '@angular/core';
import { AuthService } from '../services/auth.service';
import { DesktopBridgeService } from '../services/desktop-bridge.service';
import { publicGuard } from './public.guard';

describe('publicGuard (#330)', () => {
  function runGuard(loggedIn: boolean, isDesktop = false): boolean | UrlTree {
    // Stub typed as Pick<AuthService, 'isLoggedIn'> so a future
    // change to the AuthService.isLoggedIn signature surfaces here
    // at compile time rather than getting silenced by an `as never`
    // cast (Copilot caught the original cast on #335).
    const authStub: Pick<AuthService, 'isLoggedIn'> = {
      isLoggedIn: signal<boolean>(loggedIn),
    };

    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: authStub },
        { provide: DesktopBridgeService, useValue: { isDesktop } },
        provideRouter([]),
      ],
    });

    return TestBed.runInInjectionContext(() =>
      publicGuard({} as ActivatedRouteSnapshot, {} as RouterStateSnapshot),
    ) as boolean | UrlTree;
  }

  it('lets a non-authenticated visitor through', () => {
    const result = runGuard(false);
    expect(result).toBe(true);
  });

  it('redirects an authenticated visitor to /dashboard/athletes', () => {
    const result = runGuard(true) as UrlTree;
    expect(result).toBeInstanceOf(UrlTree);
    const router = TestBed.inject(Router);
    expect(router.serializeUrl(result)).toBe('/dashboard/athletes');
  });
});

describe('publicGuard — the desktop bypass, removed (#1497)', () => {
  function runGuard(loggedIn: boolean, isDesktop: boolean): boolean | UrlTree {
    const authStub: Pick<AuthService, 'isLoggedIn'> = { isLoggedIn: signal<boolean>(loggedIn) };

    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: authStub },
        { provide: DesktopBridgeService, useValue: { isDesktop } },
        provideRouter([]),
      ],
    });

    return TestBed.runInInjectionContext(() =>
      publicGuard({} as ActivatedRouteSnapshot, {} as RouterStateSnapshot),
    ) as boolean | UrlTree;
  }

  it('shows a signed-out desktop user the first screen, not the sign-in form', () => {
    // #1289 sent them to /auth/login, and it was right about the page that
    // existed then — a marketing page with pricing and a phone mockup, inside
    // an app you had already installed. That page is gone (#1497). What is
    // there now is a welcome, and a first launch has no password to type.
    expect(runGuard(false, true)).toBe(true);
  });

  it('shows the same screen on the web', () => {
    // One page, one behaviour. The runtime does not change what a person who
    // is not signed in needs to see.
    expect(runGuard(false, false)).toBe(true);
  });

  it('still prefers the roster when the desktop user is signed in', () => {
    const result = runGuard(true, true) as UrlTree;

    expect(TestBed.inject(Router).serializeUrl(result)).toBe('/dashboard/athletes');
  });
});
