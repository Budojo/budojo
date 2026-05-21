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
import { noAcademyGuard } from './no-academy.guard';

describe('noAcademyGuard', () => {
  function runGuard(get$: Observable<unknown>): boolean | UrlTree {
    const academyStub: Pick<AcademyService, 'get'> = {
      get: () => get$ as ReturnType<AcademyService['get']>,
    };

    TestBed.configureTestingModule({
      providers: [{ provide: AcademyService, useValue: academyStub }, provideRouter([])],
    });

    return TestBed.runInInjectionContext(() => {
      const result = noAcademyGuard({} as ActivatedRouteSnapshot, {} as RouterStateSnapshot);
      let captured: boolean | UrlTree = false;
      (result as Observable<boolean | UrlTree>).subscribe((v) => (captured = v));
      return captured;
    });
  }

  it('redirects to /dashboard when an academy already exists', () => {
    const result = runGuard(of({ id: 1, name: 'Dojo' })) as UrlTree;
    expect(result).toBeInstanceOf(UrlTree);
    expect(TestBed.inject(Router).serializeUrl(result)).toBe('/dashboard');
  });

  it('lets the user reach /setup on 404 (no academy yet)', () => {
    expect(runGuard(throwError(() => new HttpErrorResponse({ status: 404 })))).toBe(true);
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
