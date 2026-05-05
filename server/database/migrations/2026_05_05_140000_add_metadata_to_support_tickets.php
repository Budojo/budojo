<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Adds the auto-attached client context to support_tickets so the
 * support inbox sees what version + browser the user was on when they
 * filed the ticket. Inherited from the legacy /feedback flow that
 * #423 + this PR consolidate into a single channel — same paper-trail
 * value, never asked from the user (server reads from request headers).
 */
return new class extends Migration {
    public function up(): void
    {
        Schema::table('support_tickets', function (Blueprint $table): void {
            // Both nullable: legacy rows from before the consolidation
            // have NULL; tickets filed via API clients that don't set
            // the X-Budojo-Version header also stay NULL rather than
            // forcing the support flow to fail on missing context.
            $table->string('app_version', 32)->nullable()->after('body');
            $table->string('user_agent', 512)->nullable()->after('app_version');
        });
    }

    public function down(): void
    {
        Schema::table('support_tickets', function (Blueprint $table): void {
            $table->dropColumn(['app_version', 'user_agent']);
        });
    }
};
