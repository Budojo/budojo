import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import {
  ActivatedRouteSnapshot,
  Router,
  RouterStateSnapshot,
  UrlTree,
  provideRouter,
} from '@angular/router';
import { signal } from '@angular/core';
import { Observable, lastValueFrom, of, throwError } from 'rxjs';
import { AuthService, User } from '../services/auth.service';
import { roleAthleteGuard, roleOwnerGuard } from './role.guard';

interface AuthStub {
  user: ReturnType<typeof signal<User | null>>;
  loadCurrentUser: ReturnType<typeof vi.fn>;
}

describe('role guards (#445, M7 PR-D)', () => {
  function setup(stub: AuthStub): void {
    TestBed.configureTestingModule({
      providers: [{ provide: AuthService, useValue: stub }, provideRouter([])],
    });
  }

  async function runGuard(
    fn: typeof roleOwnerGuard,
    stub: AuthStub,
  ): Promise<boolean | UrlTree> {
    setup(stub);
    const result = TestBed.runInInjectionContext(() =>
      fn({} as ActivatedRouteSnapshot, {} as RouterStateSnapshot),
    );
    if (result instanceof Observable) return lastValueFrom(result) as Promise<boolean | UrlTree>;
    return result as boolean | UrlTree;
  }

  function authStub(
    user: Partial<User> | null,
    loaded?: User | { kind: 'http-error'; status: number } | 'fail',
  ): AuthStub {
    return {
      user: signal(user as User | null),
      loadCurrentUser: vi.fn(() => {
        if (loaded === 'fail') {
          // Generic non-HTTP error — should fall into the "block
          // navigation" branch (return false), NOT the redirect-to-
          // login branch.
          return throwError(() => new Error('boom'));
        }
        if (
          loaded &&
          typeof loaded === 'object' &&
          'kind' in loaded &&
          loaded.kind === 'http-error'
        ) {
          return throwError(
            () => new HttpErrorResponse({ status: loaded.status, statusText: 'Test' }),
          );
        }
        return of(loaded ?? (null as unknown as User));
      }),
    };
  }

  describe('roleOwnerGuard', () => {
    it('lets an owner through (cached user)', async () => {
      expect(await runGuard(roleOwnerGuard, authStub({ role: 'owner' } as User))).toBe(true);
    });

    it('redirects an athlete to /athlete-portal/welcome (cached user)', async () => {
      const r = (await runGuard(roleOwnerGuard, authStub({ role: 'athlete' } as User))) as UrlTree;
      expect(TestBed.inject(Router).serializeUrl(r)).toBe('/athlete-portal/welcome');
    });

    it('treats a missing role as owner (backwards compat with cached envelopes)', async () => {
      expect(await runGuard(roleOwnerGuard, authStub({ name: 'Mario' } as User))).toBe(true);
    });

    it('hits /auth/me when the cached user is null (bootstrap race)', async () => {
      const stub = authStub(null, { role: 'athlete' } as User);
      const r = (await runGuard(roleOwnerGuard, stub)) as UrlTree;
      expect(stub.loadCurrentUser).toHaveBeenCalledTimes(1);
      expect(TestBed.inject(Router).serializeUrl(r)).toBe('/athlete-portal/welcome');
    });

    it('redirects to /auth/login when /me returns 401 (stale token)', async () => {
      const r = (await runGuard(
        roleOwnerGuard,
        authStub(null, { kind: 'http-error', status: 401 }),
      )) as UrlTree;
      expect(TestBed.inject(Router).serializeUrl(r)).toBe('/auth/login');
    });

    it('blocks navigation (returns false) when /me fails with a non-401 HTTP error', async () => {
      // 5xx / network glitch / timeout — the user MAY be valid, we
      // just don't know yet. Don't bounce them to login.
      const r = await runGuard(roleOwnerGuard, authStub(null, { kind: 'http-error', status: 500 }));
      expect(r).toBe(false);
    });

    it('blocks navigation when /me throws a non-HTTP error', async () => {
      expect(await runGuard(roleOwnerGuard, authStub(null, 'fail'))).toBe(false);
    });
  });

  describe('roleAthleteGuard', () => {
    it('lets an athlete through (cached user)', async () => {
      expect(await runGuard(roleAthleteGuard, authStub({ role: 'athlete' } as User))).toBe(true);
    });

    it('redirects an owner to /dashboard (cached user)', async () => {
      const r = (await runGuard(roleAthleteGuard, authStub({ role: 'owner' } as User))) as UrlTree;
      expect(TestBed.inject(Router).serializeUrl(r)).toBe('/dashboard');
    });

    it('hits /auth/me when the cached user is null and lets a real athlete through', async () => {
      const stub = authStub(null, { role: 'athlete' } as User);
      expect(await runGuard(roleAthleteGuard, stub)).toBe(true);
      expect(stub.loadCurrentUser).toHaveBeenCalledTimes(1);
    });

    it('redirects to /auth/login when /me returns 401 (stale token)', async () => {
      const r = (await runGuard(
        roleAthleteGuard,
        authStub(null, { kind: 'http-error', status: 401 }),
      )) as UrlTree;
      expect(TestBed.inject(Router).serializeUrl(r)).toBe('/auth/login');
    });

    it('blocks navigation when /me fails with a non-401 HTTP error', async () => {
      const r = await runGuard(
        roleAthleteGuard,
        authStub(null, { kind: 'http-error', status: 500 }),
      );
      expect(r).toBe(false);
    });
  });
});
