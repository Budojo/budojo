import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';
import { hasAcademyGuard } from './core/guards/has-academy.guard';
import { noAcademyGuard } from './core/guards/no-academy.guard';
import { publicGuard } from './core/guards/public.guard';

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
          {
            path: 'payments',
            loadComponent: () =>
              import('./features/athletes/detail/payments-list/payments-list.component').then(
                (m) => m.PaymentsListComponent,
              ),
          },
          // Edit form moved INSIDE the detail (#281) so the athlete
          // header (name, belt, status) stays visible while editing
          // and the form belongs visually to "this athlete" instead
          // of being a sibling page. The child gets `:id` via the
          // app-wide `paramsInheritanceStrategy: 'always'` set in
          // `app.config.ts`.
          {
            path: 'edit',
            loadComponent: () =>
              import('./features/athletes/form/athlete-form.component').then(
                (m) => m.AthleteFormComponent,
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
      {
        path: 'whats-new',
        loadComponent: () =>
          import('./features/whats-new/whats-new.component').then((m) => m.WhatsNewComponent),
      },
      {
        path: 'stats',
        loadComponent: () =>
          import('./features/stats/stats.component').then((m) => m.StatsComponent),
        children: [
          { path: '', pathMatch: 'full', redirectTo: 'overview' },
          {
            path: 'overview',
            loadComponent: () =>
              import('./features/stats/overview/stats-overview.component').then(
                (m) => m.StatsOverviewComponent,
              ),
          },
          {
            path: 'attendance',
            loadComponent: () =>
              import('./features/stats/attendance/stats-attendance.component').then(
                (m) => m.StatsAttendanceComponent,
              ),
          },
          {
            path: 'payments',
            loadComponent: () =>
              import('./features/stats/payments/stats-payments.component').then(
                (m) => m.StatsPaymentsComponent,
              ),
          },
          {
            path: 'athletes',
            loadComponent: () =>
              import('./features/stats/athletes/stats-athletes.component').then(
                (m) => m.StatsAthletesComponent,
              ),
          },
        ],
      },
      {
        // In-app feedback (#311). Sits inside the dashboard shell so
        // the sidebar context (academy name, version footer) is
        // visible while the user composes — useful when the feedback
        // refers to "I was on this academy when..."; also keeps the
        // route behind the auth + has-academy guards by default.
        path: 'feedback',
        loadComponent: () =>
          import('./features/feedback/feedback.component').then((m) => m.FeedbackComponent),
      },
    ],
  },
  // Public legal pages (#225). No auth — prospects, the Garante, and
  // existing customers must be able to read these without a login.
  // Also accessible offline if cached by the SPA service worker.
  {
    path: 'sub-processors',
    loadComponent: () =>
      import('./features/sub-processors/sub-processors.component').then(
        (m) => m.SubProcessorsComponent,
      ),
  },
  // /privacy serves the canonical English text (#291). The SPA is
  // English-default for any visitor without a saved language
  // preference; the faithful Italian translation lives at /privacy/it
  // and remains the legal source of truth for IT customers and the
  // Garante. Edits to either MUST land in lock-step in the same PR.
  {
    path: 'privacy',
    loadComponent: () =>
      import('./features/privacy-policy/privacy-policy.component').then(
        (m) => m.PrivacyPolicyComponent,
      ),
  },
  {
    path: 'privacy/it',
    loadComponent: () =>
      import('./features/privacy-policy/it/privacy-policy-it.component').then(
        (m) => m.PrivacyPolicyItComponent,
      ),
  },
  // Public landing / about page (#330). Replaces the cold redirect to
  // `/auth/login` we used to ship — standard SaaS pattern: marketing
  // surface at the root, login one click away in the header. The
  // `publicGuard` short-circuits authenticated visitors back to
  // `/dashboard/athletes` so the marketing page is never visible to
  // someone who already has an account. Pairs with #331 (login
  // repositioning, which is the routing change in this very block).
  {
    path: '',
    pathMatch: 'full',
    canActivate: [publicGuard],
    loadComponent: () =>
      import('./features/landing/landing.component').then((m) => m.LandingComponent),
  },
  // Wildcard 404 (#226) — must stay last; everything above is matched
  // first. Hit on any URL that no other route resolves, including
  // dead deep-links that used to exist but were removed/renamed.
  {
    path: '**',
    loadComponent: () =>
      import('./features/not-found/not-found.component').then((m) => m.NotFoundComponent),
  },
];
