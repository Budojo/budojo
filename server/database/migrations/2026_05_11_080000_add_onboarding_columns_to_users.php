<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * First-run onboarding state on `users` (#424).
 *
 * Two columns side-by-side:
 *
 *  - `onboarding_dismissed_at` — set the first time the user explicitly
 *    dismisses the guided tour overlay (clicking "Skip" or "Don't show
 *    again"). Once non-null the SPA never re-renders the tour, even if
 *    the user later clears localStorage. Decoupled from the checklist
 *    completion: a user can complete every checklist item OR dismiss
 *    the tour — both stop the surface from rendering.
 *
 *  - `onboarding_completed_steps` — JSON array of step keys the user
 *    has manually marked done from the "Getting started" checklist on
 *    the dashboard home. The keys are the same string identifiers the
 *    SPA uses (`add_athlete`, `log_attendance`, etc.). When every key
 *    in `App\Support\OnboardingStep::all()` is present, the checklist
 *    self-dismisses. Domain-state auto-completion (the user really
 *    has ≥ 1 athlete, has a payment row, etc.) is NOT consulted
 *    today — only explicit ticks count. Adding the domain-proof
 *    heuristic is a follow-up; the column shape doesn't change.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table): void {
            $table->timestamp('onboarding_dismissed_at')->nullable();
            // JSON array of step-key strings. Default NULL (the SPA
            // treats null as []). MySQL 8.0+ stores JSON natively;
            // SQLite (tests) maps the type to TEXT under the hood,
            // and Laravel's `json` cast handles both transparently.
            $table->json('onboarding_completed_steps')->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table): void {
            $table->dropColumn(['onboarding_dismissed_at', 'onboarding_completed_steps']);
        });
    }
};
