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

describe('publicGuard — desktop entry (#1289)', () => {
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

  it('sends a signed-out desktop user to sign-in, never to the marketing page', () => {
    // The desktop app is already installed: there is nothing to "start free",
    // no pricing and no phone to show a mockup of.
    const result = runGuard(false, true) as UrlTree;

    expect(result).toBeInstanceOf(UrlTree);
    expect(TestBed.inject(Router).serializeUrl(result)).toBe('/auth/login');
  });

  it('still shows the landing to a signed-out visitor on the web', () => {
    expect(runGuard(false, false)).toBe(true);
  });

  it('prefers the dashboard over sign-in when the desktop user is signed in', () => {
    const result = runGuard(true, true) as UrlTree;

    expect(TestBed.inject(Router).serializeUrl(result)).toBe('/dashboard/athletes');
  });
});
