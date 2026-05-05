import { TestBed } from '@angular/core/testing';
import {
  ActivatedRouteSnapshot,
  Router,
  RouterStateSnapshot,
  UrlTree,
  provideRouter,
} from '@angular/router';
import { signal } from '@angular/core';
import { AuthService, User } from '../services/auth.service';
import { roleAthleteGuard, roleOwnerGuard } from './role.guard';

describe('role guards (#445, M7 PR-D)', () => {
  function runOwnerGuard(user: Partial<User> | null): boolean | UrlTree {
    const authStub: Pick<AuthService, 'user'> = {
      user: signal(user as User | null),
    };
    TestBed.configureTestingModule({
      providers: [{ provide: AuthService, useValue: authStub }, provideRouter([])],
    });
    return TestBed.runInInjectionContext(() =>
      roleOwnerGuard({} as ActivatedRouteSnapshot, {} as RouterStateSnapshot),
    ) as boolean | UrlTree;
  }

  function runAthleteGuard(user: Partial<User> | null): boolean | UrlTree {
    const authStub: Pick<AuthService, 'user'> = {
      user: signal(user as User | null),
    };
    TestBed.configureTestingModule({
      providers: [{ provide: AuthService, useValue: authStub }, provideRouter([])],
    });
    return TestBed.runInInjectionContext(() =>
      roleAthleteGuard({} as ActivatedRouteSnapshot, {} as RouterStateSnapshot),
    ) as boolean | UrlTree;
  }

  describe('roleOwnerGuard', () => {
    it('lets an owner through', () => {
      expect(runOwnerGuard({ role: 'owner' } as User)).toBe(true);
    });

    it("redirects an athlete to /athlete-portal/welcome", () => {
      const result = runOwnerGuard({ role: 'athlete' } as User) as UrlTree;
      const router = TestBed.inject(Router);
      expect(router.serializeUrl(result)).toBe('/athlete-portal/welcome');
    });

    it('treats a missing role as owner (backwards compat with cached envelopes)', () => {
      expect(runOwnerGuard({ name: 'Mario' } as User)).toBe(true);
    });

    it('treats a null user as owner so the auth guard can take precedence', () => {
      expect(runOwnerGuard(null)).toBe(true);
    });
  });

  describe('roleAthleteGuard', () => {
    it('lets an athlete through', () => {
      expect(runAthleteGuard({ role: 'athlete' } as User)).toBe(true);
    });

    it('redirects an owner to /dashboard', () => {
      const result = runAthleteGuard({ role: 'owner' } as User) as UrlTree;
      const router = TestBed.inject(Router);
      expect(router.serializeUrl(result)).toBe('/dashboard');
    });

    it('treats a missing role as owner (default), redirects to /dashboard', () => {
      const result = runAthleteGuard({ name: 'Mario' } as User) as UrlTree;
      const router = TestBed.inject(Router);
      expect(router.serializeUrl(result)).toBe('/dashboard');
    });
  });
});
