import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { catchError, map, of } from 'rxjs';
import { AcademyService } from '../services/academy.service';

/**
 * Guards the /setup route.
 * If the user already has an academy, redirect to /dashboard.
 * If the API returns 404 (no academy yet), allow access to /setup.
 */
export const noAcademyGuard: CanActivateFn = () => {
  const academyService = inject(AcademyService);
  const router = inject(Router);

  return academyService.get().pipe(
    map(() => router.createUrlTree(['/dashboard'])),
    catchError(() => of(true)),
  );
};
