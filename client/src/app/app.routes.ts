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
    ],
  },
  { path: '', redirectTo: 'auth/login', pathMatch: 'full' },
];
