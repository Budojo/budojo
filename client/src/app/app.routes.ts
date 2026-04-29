import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';
import { hasAcademyGuard } from './core/guards/has-academy.guard';
import { noAcademyGuard } from './core/guards/no-academy.guard';

export const routes: Routes = [
  {
    path: 'auth',
    children: [
      {
        path: 'register',
        loadComponent: () =>
          import('./features/auth/register/register.component').then((m) => m.RegisterComponent),
      },
      {
        path: 'login',
        loadComponent: () =>
          import('./features/auth/login/login.component').then((m) => m.LoginComponent),
      },
      {
        path: 'verify-success',
        loadComponent: () =>
          import('./features/auth/verify-success/verify-success.component').then(
            (m) => m.VerifySuccessComponent,
          ),
      },
      {
        path: 'verify-error',
        loadComponent: () =>
          import('./features/auth/verify-error/verify-error.component').then(
            (m) => m.VerifyErrorComponent,
          ),
      },
    ],
  },
  {
    path: 'setup',
    canActivate: [authGuard, noAcademyGuard],
    loadComponent: () =>
      import('./features/academy/setup/setup.component').then((m) => m.SetupComponent),
  },
  {
    path: 'dashboard',
    canActivate: [authGuard, hasAcademyGuard],
    loadComponent: () =>
      import('./features/dashboard/dashboard.component').then((m) => m.DashboardComponent),
    children: [
      { path: '', redirectTo: 'athletes', pathMatch: 'full' },
      {
        path: 'academy',
        loadComponent: () =>
          import('./features/academy/detail/academy-detail.component').then(
            (m) => m.AcademyDetailComponent,
          ),
      },
      {
        path: 'academy/edit',
        loadComponent: () =>
          import('./features/academy/form/academy-form.component').then(
            (m) => m.AcademyFormComponent,
          ),
      },
      {
        path: 'athletes',
        loadComponent: () =>
          import('./features/athletes/list/athletes-list.component').then(
            (m) => m.AthletesListComponent,
          ),
      },
      {
        path: 'athletes/new',
        loadComponent: () =>
          import('./features/athletes/form/athlete-form.component').then(
            (m) => m.AthleteFormComponent,
          ),
      },
      {
        path: 'athletes/:id/edit',
        loadComponent: () =>
          import('./features/athletes/form/athlete-form.component').then(
            (m) => m.AthleteFormComponent,
          ),
      },
      {
        path: 'athletes/:id',
        loadComponent: () =>
          import('./features/athletes/detail/athlete-detail.component').then(
            (m) => m.AthleteDetailComponent,
          ),
        children: [
          { path: '', redirectTo: 'documents', pathMatch: 'full' },
          {
            path: 'documents',
            loadComponent: () =>
              import('./features/athletes/detail/documents-list/documents-list.component').then(
                (m) => m.DocumentsListComponent,
              ),
          },
          {
            path: 'attendance',
            loadComponent: () =>
              import('./features/athletes/detail/attendance-history/attendance-history.component').then(
                (m) => m.AttendanceHistoryComponent,
              ),
          },
        ],
      },
      {
        path: 'documents/expiring',
        loadComponent: () =>
          import('./features/documents/expiring/expiring-documents-list.component').then(
            (m) => m.ExpiringDocumentsListComponent,
          ),
      },
      {
        path: 'attendance',
        loadComponent: () =>
          import('./features/attendance/daily/daily-attendance.component').then(
            (m) => m.DailyAttendanceComponent,
          ),
      },
      {
        path: 'attendance/summary',
        loadComponent: () =>
          import('./features/attendance/summary/monthly-summary.component').then(
            (m) => m.MonthlySummaryComponent,
          ),
      },
      {
        path: 'profile',
        loadComponent: () =>
          import('./features/profile/profile.component').then((m) => m.ProfileComponent),
      },
    ],
  },
  { path: '', redirectTo: 'auth/login', pathMatch: 'full' },
  // Wildcard 404 (#226) — must stay last; everything above is matched
  // first. Hit on any URL that no other route resolves, including
  // dead deep-links that used to exist but were removed/renamed.
  {
    path: '**',
    loadComponent: () =>
      import('./features/not-found/not-found.component').then((m) => m.NotFoundComponent),
  },
];
