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
import { authGuard } from './auth.guard';

describe('authGuard', () => {
  function runGuard(loggedIn: boolean): boolean | UrlTree {
    // Typed stub: a future change to AuthService.isLoggedIn surfaces
    // here at compile time, no `as never` escape hatch.
    const authStub: Pick<AuthService, 'isLoggedIn'> = {
      isLoggedIn: signal<boolean>(loggedIn),
    };

    TestBed.configureTestingModule({
      providers: [{ provide: AuthService, useValue: authStub }, provideRouter([])],
    });

    return TestBed.runInInjectionContext(() =>
      authGuard({} as ActivatedRouteSnapshot, {} as RouterStateSnapshot),
    ) as boolean | UrlTree;
  }

  it('lets an authenticated visitor through', () => {
    expect(runGuard(true)).toBe(true);
  });

  it('redirects a non-authenticated visitor to /auth/login', () => {
    const result = runGuard(false) as UrlTree;
    expect(result).toBeInstanceOf(UrlTree);
    const router = TestBed.inject(Router);
    expect(router.serializeUrl(result)).toBe('/auth/login');
  });
});
