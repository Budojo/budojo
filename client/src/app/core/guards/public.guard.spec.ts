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
import { publicGuard } from './public.guard';

describe('publicGuard (#330)', () => {
  function runGuard(loggedIn: boolean): boolean | UrlTree {
    // Stub typed as Pick<AuthService, 'isLoggedIn'> so a future
    // change to the AuthService.isLoggedIn signature surfaces here
    // at compile time rather than getting silenced by an `as never`
    // cast (Copilot caught the original cast on #335).
    const authStub: Pick<AuthService, 'isLoggedIn'> = {
      isLoggedIn: signal<boolean>(loggedIn),
    };

    TestBed.configureTestingModule({
      providers: [{ provide: AuthService, useValue: authStub }, provideRouter([])],
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
