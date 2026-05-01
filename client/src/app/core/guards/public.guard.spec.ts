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
    const authStub: Partial<AuthService> = {
      isLoggedIn: signal<boolean>(loggedIn) as never,
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
