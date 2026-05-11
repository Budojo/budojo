import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';
import { hasAcademyGuard } from './core/guards/has-academy.guard';
import { noAcademyGuard } from './core/guards/no-academy.guard';
import { publicGuard } from './core/guards/public.guard';
import { roleAthleteGuard, roleOwnerGuard } from './core/guards/role.guard';

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
      // Password reset (M5 PR-A). Both routes are public (no guard) —
      // a logged-out user is the whole point of the flow.
      {
        path: 'forgot-password',
        loadComponent: () =>
          import('./features/auth/forgot-password/forgot-password.component').then(
            (m) => m.ForgotPasswordComponent,
          ),
      },
      {
        path: 'reset-password',
        loadComponent: () =>
          import('./features/auth/reset-password/reset-password.component').then(
            (m) => m.ResetPasswordComponent,
          ),
      },
      // Email-change verification (#476). Public — the user clicking
      // the link in the verification mail isn't necessarily on the
      // device they were signed in on, and the dashboard guards would
      // otherwise bounce them. The 64-char raw token in the path is
      // the auth, which the server validates server-side.
      {
        path: 'verify-email-change/:token',
        loadComponent: () =>
          import('./features/auth/verify-email-change/verify-email-change.component').then(
            (m) => m.VerifyEmailChangeComponent,
          ),
      },
    ],
  },
  {
    path: 'setup',
    canActivate: [authGuard, roleOwnerGuard, noAcademyGuard],
    loadComponent: () =>
      import('./features/academy/setup/setup.component').then((m) => m.SetupComponent),
  },
  {
    // Public athlete invite landing page (#445, M7 PR-C). Outside the
    // dashboard shell on purpose — the user is unauthenticated when
    // they land here (the token in the URL is the auth) and the page
    // wants a single-task focused layout, not the owner sidebar.
    path: 'athlete-invite/:token',
    loadComponent: () =>
      import('./features/athlete-invite/athlete-invite.component').then(
        (m) => m.AthleteInviteComponent,
      ),
  },
  {
    // Public account-deletion cancel landing page (#545). Outside the
    // dashboard shell — the user clicks the "Cancel deletion" CTA in
    // the request-confirmation email, possibly from a device they're
    // not signed in on; the dashboard guards would otherwise bounce
    // them. The 64-char raw token in the path is the auth, validated
    // server-side at `POST /api/v1/me/deletion-request/cancel/{token}`.
    path: 'account/deletion-cancel/:token',
    loadComponent: () =>
      import('./features/account-deletion-cancel/account-deletion-cancel.component').then(
        (m) => m.AccountDeletionCancelComponent,
      ),
  },
  {
    // Token-less variant of the cancel landing (#562 copilot review).
    // After a successful consume the component strips the token from
    // the URL via `history.replaceState('/account/deletion-cancel')`
    // — without this dedicated route a refresh on the cleaned URL
    // would hit the 404 wildcard and undo the calm-landing UX the
    // strip was meant to preserve. The component handles a missing
    // `:token` by rendering the "no longer pending" state, which is
    // factually correct after a successful consume.
    path: 'account/deletion-cancel',
    loadComponent: () =>
      import('./features/account-deletion-cancel/account-deletion-cancel.component').then(
        (m) => m.AccountDeletionCancelComponent,
      ),
  },
  {
    // Legacy athlete-portal tree (#445 PR-D minimal). The proper
    // athlete shell now lives under `/dashboard/me/*` (#610, M7 PR-D
    // slice 1). Both children below are kept as pure redirects so any
    // bookmark or in-flight invite-accept link that lands here still
    // routes the user to the new shell. Drop the whole `athlete-portal`
    // block in a follow-up slice once the access logs confirm zero
    // hits over a stable beta window.
    path: 'athlete-portal',
    canActivate: [authGuard, roleAthleteGuard],
    children: [
      { path: '', redirectTo: '/dashboard/me/profile', pathMatch: 'full' },
      { path: 'welcome', redirectTo: '/dashboard/me/profile', pathMatch: 'full' },
    ],
  },
  {
    // Athlete-side dashboard tree (#610, M7 PR-D slice 1). Sibling of
    // the owner-side `/dashboard/*` shell but guarded by
    // `roleAthleteGuard` instead of `roleOwnerGuard + hasAcademyGuard`
    // — an athlete user has no academy by definition. Subsequent
    // slices expand the children list (academy, attendance, payments,
    // documents).
    path: 'dashboard/me',
    canActivate: [authGuard, roleAthleteGuard],
    loadComponent: () =>
      import('./features/athlete-dashboard/athlete-dashboard.component').then(
        (m) => m.AthleteDashboardComponent,
      ),
    children: [
      { path: '', redirectTo: 'profile', pathMatch: 'full' },
      {
        path: 'profile',
        loadComponent: () =>
          import('./features/me-profile/me-profile.component').then((m) => m.MeProfileComponent),
      },
      {
        path: 'feed',
        loadComponent: () =>
          import('./features/my-feed/my-feed.component').then((m) => m.MyFeedComponent),
      },
      {
        path: 'academy',
        loadComponent: () =>
          import('./features/my-academy/my-academy.component').then((m) => m.MyAcademyComponent),
      },
    ],
  },
  {
    path: 'dashboard',
    canActivate: [authGuard, roleOwnerGuard, hasAcademyGuard],
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
          // Empty path eagerly loads Overview instead of `redirectTo: 'overview'`
          // — the redirect form had a race on first lazy-load that landed users
          // on a blank `<router-outlet>` for one tick. Direct loadComponent
          // resolves synchronously once the parent chunk is in.
          {
            path: '',
            pathMatch: 'full',
            loadComponent: () =>
              import('./features/stats/overview/stats-overview.component').then(
                (m) => m.StatsOverviewComponent,
              ),
          },
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
        // Single support / contact form (#423). The legacy
        // /dashboard/feedback page was retired post-v1.17.0 — its
        // role (fire-and-forget product feedback, screenshot upload,
        // version + UA auto-attach) was folded into support, with a
        // `feedback` category for messages that don't expect a
        // reply. Sits inside the dashboard shell so the sidebar
        // context (academy name, version footer) is visible while
        // the user composes.
        path: 'support',
        loadComponent: () =>
          import('./features/support/support.component').then((m) => m.SupportComponent),
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
  // Italian translation of /sub-processors (#280). Same lock-step
  // discipline as /privacy{,/it}: edits to the markdown source, the
  // English page, or this Italian page MUST land in the same PR.
  {
    path: 'sub-processors/it',
    loadComponent: () =>
      import('./features/sub-processors/it/sub-processors-it.component').then(
        (m) => m.SubProcessorsItComponent,
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
  // /terms — public Terms-of-Service page (#420). EN canonical at
  // /terms, IT translation at /terms/it. Same lock-step rule as
  // /privacy{,/it}: the markdown source, the EN component, and the IT
  // component MUST be edited in the same PR. The registration form's
  // "I accept" checkbox links here in a new tab; the page is also
  // reachable from the landing footer for prospects who want to read
  // it before signing up.
  {
    path: 'terms',
    loadComponent: () => import('./features/terms/terms.component').then((m) => m.TermsComponent),
  },
  {
    path: 'terms/it',
    loadComponent: () =>
      import('./features/terms/it/terms-it.component').then((m) => m.TermsItComponent),
  },
  // Public /cookie-policy (#421) — English-default, mirrors the
  // /privacy structure. The IT translation is the legally-citable
  // source of truth for the Garante; both pages cross-link the
  // matching `cookie-audit.md` markdown source. Edits to any of the
  // three artefacts MUST land in the same PR.
  {
    path: 'cookie-policy',
    loadComponent: () =>
      import('./features/cookie-policy/cookie-policy.component').then(
        (m) => m.CookiePolicyComponent,
      ),
  },
  {
    path: 'cookie-policy/it',
    loadComponent: () =>
      import('./features/cookie-policy/it/cookie-policy-it.component').then(
        (m) => m.CookiePolicyItComponent,
      ),
  },
  // Public Help / FAQ page (#422). Sits outside the dashboard shell
  // (no auth guard) so the audience covers signed-out prospects, the
  // setup-wizard user mid-flow ("how do I create an academy?"), and
  // existing customers reaching it from the dashboard sidebar
  // footer. The page is also linked-to from in-app empty states
  // and tooltips via stable `/help#anchor` URLs.
  {
    path: 'help',
    loadComponent: () => import('./features/help/help.component').then((m) => m.HelpComponent),
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
  // Public error landing pages (#425). `/offline` is reached via the
  // global `errorInterceptor` when an outgoing API request fails with
  // `status === 0` (no network — the only auto-redirect class today).
  // `/error` is direct-nav only — 5xx responses stay component-level
  // (toasts, empty states), so this page exists for typed-URL,
  // bookmark, or future deep-link from an empty state. Public on both
  // — no guard — so the user can land here while logged out (a 0 on
  // the public landing, or a manual nav for /error).
  {
    path: 'error',
    loadComponent: () =>
      import('./features/error/server-error/server-error.component').then(
        (m) => m.ServerErrorComponent,
      ),
  },
  {
    path: 'offline',
    loadComponent: () =>
      import('./features/error/offline/offline.component').then((m) => m.OfflineComponent),
  },
  // Public unsubscribe landing (#417). The signed-URL backend at
  // `/api/v1/unsubscribe/{userId}/{category}` flips the preference
  // and 302-redirects here with `?category=` (success) or
  // `?status=invalid` (tampered / unknown). No auth required — the
  // user clicks from their inbox, possibly on a device they aren't
  // signed in on.
  {
    path: 'unsubscribed',
    loadComponent: () =>
      import('./features/unsubscribe/unsubscribe.component').then((m) => m.UnsubscribeComponent),
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
