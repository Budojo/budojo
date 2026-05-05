import { TestBed } from '@angular/core/testing';
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

  function authStub(user: Partial<User> | null, loaded?: User | 'fail'): AuthStub {
    return {
      user: signal(user as User | null),
      loadCurrentUser: vi.fn(() => {
        if (loaded === 'fail') return throwError(() => new Error('401'));
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

    it('redirects to /auth/login when the bootstrap /me call fails (stale token)', async () => {
      const stub = authStub(null, 'fail');
      const r = (await runGuard(roleOwnerGuard, stub)) as UrlTree;
      expect(TestBed.inject(Router).serializeUrl(r)).toBe('/auth/login');
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

    it('redirects to /auth/login when the bootstrap /me call fails (stale token)', async () => {
      const r = (await runGuard(roleAthleteGuard, authStub(null, 'fail'))) as UrlTree;
      expect(TestBed.inject(Router).serializeUrl(r)).toBe('/auth/login');
    });
  });
});
