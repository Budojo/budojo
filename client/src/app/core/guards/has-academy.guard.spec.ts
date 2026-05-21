import { TestBed } from '@angular/core/testing';
import {
  ActivatedRouteSnapshot,
  Router,
  RouterStateSnapshot,
  UrlTree,
  provideRouter,
} from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { Observable, of, throwError } from 'rxjs';
import { AcademyService } from '../services/academy.service';
import { hasAcademyGuard } from './has-academy.guard';

describe('hasAcademyGuard', () => {
  function runGuard(get$: Observable<unknown>): boolean | UrlTree {
    const academyStub: Pick<AcademyService, 'get'> = {
      get: () => get$ as ReturnType<AcademyService['get']>,
    };

    TestBed.configureTestingModule({
      providers: [{ provide: AcademyService, useValue: academyStub }, provideRouter([])],
    });

    return TestBed.runInInjectionContext(() => {
      const result = hasAcademyGuard({} as ActivatedRouteSnapshot, {} as RouterStateSnapshot);
      // The guard returns an Observable; subscribe synchronously to capture.
      let captured: boolean | UrlTree = false;
      (result as Observable<boolean | UrlTree>).subscribe((v) => (captured = v));
      return captured;
    });
  }

  it('lets a visitor with an academy through', () => {
    expect(runGuard(of({ id: 1, name: 'Dojo' }))).toBe(true);
  });

  it('redirects to /setup on 404 (no academy yet)', () => {
    const result = runGuard(throwError(() => new HttpErrorResponse({ status: 404 }))) as UrlTree;
    expect(result).toBeInstanceOf(UrlTree);
    expect(TestBed.inject(Router).serializeUrl(result)).toBe('/setup');
  });

  it('redirects to /auth/login on 401', () => {
    const result = runGuard(throwError(() => new HttpErrorResponse({ status: 401 }))) as UrlTree;
    expect(result).toBeInstanceOf(UrlTree);
    expect(TestBed.inject(Router).serializeUrl(result)).toBe('/auth/login');
  });

  it('blocks navigation (false) on any other error', () => {
    expect(runGuard(throwError(() => new HttpErrorResponse({ status: 500 })))).toBe(false);
  });
});
